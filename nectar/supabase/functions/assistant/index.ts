// The assistant. Two ways in:
// - Chat: the signed-in user sends a message (and optional photo); the reply
//   comes back and both sides are saved to chat_messages.
// - Autopilot: AI requests from the Piloto automático wait in automation_runs
//   as 'waiting_ai'. The database calls this function with a shared secret
//   (x-automation-secret) and it answers every waiting request with the
//   service role; or the user presses "Rodar agora" and it answers theirs.
// Every tool query is limited to the owner explicitly (tools.ts), so the
// service role never reaches another user's data. The OpenRouter key is a
// Supabase secret (OPENROUTER_API_KEY) and never reaches the browser.
import { createClient } from 'jsr:@supabase/supabase-js@2';
import {
  TOOLS, WRITES, checkArgs, cleanKey, history, keyHint, maskKey, modelCandidates, pickFreeModels, exchangeRows, skipFor, withoutSkipped,
  localNow, systemPrompt, validImageDataUrl, type StoredMessage, type UndoSpec,
} from './lib.ts';
import { runTool, scoped, snapshot, type Db } from './tools.ts';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
let workingModel: string | null = null;
const skipped = new Map<string, number>();
const RUNS_PER_CALL = 3;

type ContentPart = { type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } };
type Msg = { role: string; content: string | ContentPart[] | null; tool_calls?: unknown[]; tool_call_id?: string };
type ActionRecord = { tool: string; summary: string; undo?: UndoSpec };
type Reply = { reply: string; actions: ActionRecord[]; model: string };

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
  const body = await req.json().catch(() => ({}));
  const url = Deno.env.get('SUPABASE_URL')!;

  const key = cleanKey(Deno.env.get('OPENROUTER_API_KEY') ?? '');
  const missingKey = () => json({ error: 'missing_key', message: 'A chave do OpenRouter ainda não foi salva no Supabase (Edge Functions → Secrets → OPENROUTER_API_KEY).' }, 503);

  // The database, on schedule: every waiting AI request, each as its owner.
  const secret = Deno.env.get('AUTOMATION_SECRET');
  const given = req.headers.get('x-automation-secret');
  if (given !== null) {
    if (!secret || given !== secret) return json({ error: 'unauthorized' }, 401);
    if (!key) return missingKey();
    const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
    return json(await processRuns(admin, key, null));
  }

  // Everyone else signs in.
  const auth = req.headers.get('Authorization') ?? '';
  const db = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: auth } } });
  const { data: { user } } = await db.auth.getUser(auth.replace(/^Bearer /, ''));
  if (!user) return json({ error: 'unauthorized' }, 401);

  if (body.status === true) {
    const { data: s } = await scoped(db, user.id).select('user_settings', 'assistant_model').maybeSingle();
    return json({ configured: !!key, model: workingModel, preferred_model: s?.assistant_model ?? 'anthropic/claude-sonnet-4' });
  }
  if (!key) return missingKey();

  if (body.process_runs === true) return json(await processRuns(db, key, user.id));

  const imageUrl = validImageDataUrl(body.image);
  const rawMessage = String(body.message ?? '').trim();
  const message = rawMessage || (imageUrl ? 'Analise esta imagem e me ajude a registrar os dados relevantes no Painel.' : '');
  if (!message || message.length > 4000) return json({ error: 'A mensagem precisa ter de 1 a 4000 caracteres.' }, 400);
  const { data: past } = await scoped(db, user.id).select('chat_messages', 'content,is_user,created_at,metadata').order('created_at', { ascending: false }).limit(30);
  let out: Reply;
  try {
    out = await converse(db, user.id, key, message, (past ?? []) as StoredMessage[], imageUrl);
  } catch (e) {
    return json({ error: 'ai_failed', message: (e as Error).message }, 502);
  }
  const rows = exchangeRows(imageUrl ? `${message} [imagem anexada]` : message, out.reply, { model: out.model, actions: out.actions }).map((r) => ({ ...r, user_id: user.id }));
  const { error: saveError } = await db.from('chat_messages').insert(rows);
  return json({ ...out, saved: !saveError, ...(saveError ? { saveError: saveError.message } : {}) });
});

/** One autonomous multi-step request to Claude Sonnet (or user's selected model) with tools. */
async function converse(db: Db, uid: string, key: string, message: string, past: StoredMessage[], imageUrl: string | null = null): Promise<Reply> {
  const { data: settings } = await scoped(db, uid).select('user_settings', 'timezone,display_name,display_currency,assistant_model').maybeSingle();
  const tz = settings?.timezone ?? 'America/Sao_Paulo';
  const userModel = (settings?.assistant_model as string | null) ?? 'anthropic/claude-sonnet-4';
  const now = localNow(tz);
  const snap = await snapshot(db, uid, now, tz);
  const userContent: string | ContentPart[] = imageUrl
    ? [{ type: 'text', text: message }, { type: 'image_url', image_url: { url: imageUrl } }]
    : message;
  const messages: Msg[] = [
    { role: 'system', content: systemPrompt(now, tz, { name: settings?.display_name, displayCurrency: settings?.display_currency, ...snap }) },
    ...history(past),
    { role: 'user', content: userContent },
  ];
  const actions: ActionRecord[] = [];
  let reply = '';
  let model = '';
  for (let round = 0; round < 10; round++) {
    const res = await complete(key, messages, userModel);
    model = res.model;
    const choice = res.message;
    if (!choice.tool_calls?.length) { reply = typeof choice.content === 'string' ? choice.content.trim() : ''; break; }
    messages.push({ role: 'assistant', content: typeof choice.content === 'string' ? choice.content : '', tool_calls: choice.tool_calls });
    for (const call of choice.tool_calls as { id: string; function: { name: string; arguments: string } }[]) {
      let parsed: unknown = {};
      try { parsed = JSON.parse(call.function.arguments || '{}'); } catch { /* checked below */ }
      const checked = checkArgs(call.function.name, parsed);
      const result = checked.ok ? await runTool(db, uid, call.function.name, checked.args, now, tz) : { erro: checked.error };
      if (checked.ok && WRITES.has(call.function.name) && !('erro' in result)) {
        actions.push({ tool: call.function.name, summary: String(result.feito ?? ''), ...(result.undo ? { undo: result.undo } : {}) });
      }
      messages.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify(result).slice(0, 12000) });
    }
  }
  if (!reply) reply = actions.length ? 'Pronto.' : 'Não consegui responder agora. Tente de novo.';
  return { reply, actions, model };
}

/**
 * Answers waiting AI requests of the autopilot: all users' (uid null, service
 * role) or one user's. Each run is claimed first, so two calls never answer
 * the same one; the answer goes to the chat and to the run's log.
 */
async function processRuns(db: Db, key: string, uid: string | null) {
  let q = db.from('automation_runs').select('id,automation_id,user_id').eq('status', 'waiting_ai').order('ran_at').limit(RUNS_PER_CALL);
  if (uid) q = q.eq('user_id', uid);
  const { data: waiting } = await q;
  const done: { id: string; status: string }[] = [];
  for (const run of (waiting ?? []) as { id: string; automation_id: string; user_id: string }[]) {
    const { data: claimed } = await db.from('automation_runs').update({ status: 'running' }).eq('id', run.id).eq('user_id', run.user_id).eq('status', 'waiting_ai').select('id');
    if (!claimed?.length) continue;
    const { data: a } = await scoped(db, run.user_id).select('automations', 'title,prompt').eq('id', run.automation_id).maybeSingle();
    let status = 'ok';
    let output = '';
    try {
      if (!a?.prompt) throw new Error('A automação não tem pedido.');
      const out = await converse(db, run.user_id, key, a.prompt, []);
      output = out.reply;
      await scoped(db, run.user_id).insert('chat_messages', {
        content: out.reply, is_user: false,
        metadata: { kind: 'automation', automation_id: run.automation_id, title: a.title, prompt: a.prompt, model: out.model, actions: out.actions },
      });
    } catch (e) {
      status = 'error';
      output = (e as Error).message;
    }
    await db.from('automation_runs').update({ status, output: output.slice(0, 4000) }).eq('id', run.id).eq('user_id', run.user_id);
    done.push({ id: run.id, status });
  }
  return { processed: done };
}

/** One call to OpenRouter; prefers user's model (Claude Sonnet 4 default) with safe fallbacks. */
async function complete(key: string, messages: Msg[], userModel?: string | null): Promise<{ model: string; message: Msg }> {
  const preferred = Deno.env.get('OPENROUTER_MODEL') || undefined;
  const candidates = withoutSkipped(modelCandidates(preferred, workingModel, userModel), skipped, Date.now());
  let last = '';
  let noCredits = false;
  let rateLimited = false;
  let catalogChecked = false;
  let retriedWorking = false;
  for (let i = 0; i < candidates.length; i++) {
    const model = candidates[i];
    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', 'X-Title': 'Painel' },
      body: JSON.stringify({ model, messages, tools: TOOLS, tool_choice: 'auto', temperature: 0.35, max_tokens: 2000 }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok && data.choices?.[0]?.message) {
      workingModel = model;
      return { model: data.model ?? model, message: data.choices[0].message };
    }
    const detail = data.error?.message ?? `HTTP ${res.status}`;
    if (res.status === 401) {
      const hint = keyHint(key);
      throw new Error(`A chave do OpenRouter foi recusada (${detail})${hint ? `: ${hint}` : ''}. Chave salva: ${maskKey(key)}. Confira o valor salvo no Supabase.`);
    }
    if (res.status === 429 && model === workingModel && !retriedWorking) {
      retriedWorking = true;
      await new Promise((r) => setTimeout(r, 1500));
      i--;
      continue;
    }
    if (skipFor(res.status)) skipped.set(model, Date.now() + skipFor(res.status));
    if (res.status === 402) noCredits = true;
    if (res.status === 429) rateLimited = true;
    last = `${model}: ${detail}`;
    if (i === candidates.length - 1 && !preferred && !catalogChecked) {
      catalogChecked = true;
      for (const free of withoutSkipped(await freeModels(), skipped, Date.now())) if (!candidates.includes(free)) candidates.push(free);
    }
  }
  if (rateLimited) throw new Error(`Os modelos estão ocupados agora. Espere um minuto e tente de novo (${last}).`);
  if (noCredits) throw new Error(`A conta do OpenRouter está sem créditos e nenhum modelo gratuito respondeu agora; recarregue em openrouter.ai ou tente em um minuto (${last}).`);
  throw new Error(`Nenhum modelo de IA respondeu agora (${last}).`);
}

let freeCache: { at: number; ids: string[] } | null = null;

/** Free models that take tools, from OpenRouter's public catalog; kept for an hour. */
async function freeModels(): Promise<string[]> {
  if (freeCache && Date.now() - freeCache.at < 3_600_000) return freeCache.ids;
  const res = await fetch('https://openrouter.ai/api/v1/models').catch(() => null);
  const data = res?.ok ? await res.json().catch(() => null) : null;
  const ids = pickFreeModels(Array.isArray(data?.data) ? data.data : []);
  freeCache = { at: Date.now(), ids };
  return ids;
}
