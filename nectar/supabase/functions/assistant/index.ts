// The assistant: takes a message from the signed-in user, talks to DeepSeek
// through OpenRouter with tools over the user's own data, saves both sides of
// the conversation and returns the reply. Every query runs with the user's
// token, so row level security applies as in the app. The OpenRouter key is a
// Supabase secret (OPENROUTER_API_KEY) and never reaches the browser.
import { createClient, type SupabaseClient } from 'jsr:@supabase/supabase-js@2';
import {
  TOOLS, WRITES, addDays, checkArgs, history, localNow, systemPrompt, textToBlocks, zonedToUtc,
  type LocalNow, type StoredMessage, type ToolArgs,
} from './lib.ts';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
// Tried in order until one answers; OPENROUTER_MODEL overrides.
const MODELS = ['deepseek/deepseek-chat-v3.1', 'deepseek/deepseek-chat-v3-0324', 'deepseek/deepseek-chat'];
let workingModel: string | null = null;

type Msg = { role: string; content: string | null; tool_calls?: unknown[]; tool_call_id?: string };

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

  const auth = req.headers.get('Authorization') ?? '';
  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: auth } } });
  const { data: { user } } = await db.auth.getUser(auth.replace(/^Bearer /, ''));
  if (!user) return json({ error: 'unauthorized' }, 401);

  const body = await req.json().catch(() => ({}));
  const message = String(body.message ?? '').trim();
  if (!message || message.length > 4000) return json({ error: 'A mensagem precisa ter de 1 a 4000 caracteres.' }, 400);

  const key = Deno.env.get('OPENROUTER_API_KEY');
  if (!key) {
    return json({ error: 'missing_key', message: 'A chave do OpenRouter ainda não foi salva no Supabase (Edge Functions → Secrets → OPENROUTER_API_KEY).' }, 503);
  }

  const { data: settings } = await db.from('user_settings').select('timezone,display_name').maybeSingle();
  const tz = settings?.timezone ?? 'America/Sao_Paulo';
  const now = localNow(tz);
  const { data: past } = await db.from('chat_messages').select('content,is_user,created_at,metadata').order('created_at', { ascending: false }).limit(30);
  await db.from('chat_messages').insert({ content: message, is_user: true });

  const messages: Msg[] = [
    { role: 'system', content: systemPrompt(now, tz, { name: settings?.display_name, ...await snapshot(db, now, tz) }) },
    ...history((past ?? []) as StoredMessage[]),
    { role: 'user', content: message },
  ];

  const actions: { tool: string; summary: string }[] = [];
  let reply = '';
  let model = '';
  try {
    for (let round = 0; round < 6; round++) {
      const res = await complete(key, messages);
      model = res.model;
      const choice = res.message;
      if (!choice.tool_calls?.length) { reply = (choice.content ?? '').trim(); break; }
      messages.push({ role: 'assistant', content: choice.content ?? '', tool_calls: choice.tool_calls });
      for (const call of choice.tool_calls as { id: string; function: { name: string; arguments: string } }[]) {
        let parsed: unknown = {};
        try { parsed = JSON.parse(call.function.arguments || '{}'); } catch { /* checked below */ }
        const checked = checkArgs(call.function.name, parsed);
        const result = checked.ok ? await run(db, call.function.name, checked.args, now, tz) : { erro: checked.error };
        if (checked.ok && WRITES.has(call.function.name) && !('erro' in result)) actions.push({ tool: call.function.name, summary: String(result.feito ?? '') });
        messages.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify(result).slice(0, 12000) });
      }
    }
  } catch (e) {
    return json({ error: 'ai_failed', message: (e as Error).message }, 502);
  }
  if (!reply) reply = actions.length ? 'Pronto.' : 'Não consegui responder agora. Tente de novo.';
  await db.from('chat_messages').insert({ content: reply, is_user: false, metadata: { model, actions } });
  return json({ reply, actions, model });
});

/** One call to OpenRouter; finds a DeepSeek model that answers and keeps it. */
async function complete(key: string, messages: Msg[]): Promise<{ model: string; message: Msg }> {
  const preferred = Deno.env.get('OPENROUTER_MODEL');
  const candidates = preferred ? [preferred] : workingModel ? [workingModel] : MODELS;
  let last = '';
  for (const model of candidates) {
    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', 'X-Title': 'Painel' },
      body: JSON.stringify({ model, messages, tools: TOOLS, tool_choice: 'auto', temperature: 0.4, max_tokens: 1200 }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok && data.choices?.[0]?.message) {
      workingModel = model;
      return { model: data.model ?? model, message: data.choices[0].message };
    }
    const detail = data.error?.message ?? `HTTP ${res.status}`;
    if (res.status === 401) throw new Error('A chave do OpenRouter foi recusada. Confira o valor salvo no Supabase.');
    if (res.status === 402) throw new Error('A conta do OpenRouter está sem créditos para este modelo.');
    if (res.status === 429) throw new Error('Muitas mensagens em pouco tempo. Espere um minuto e tente de novo.');
    last = `${model}: ${detail}`;
    // An unknown model or one without tools: try the next one.
  }
  throw new Error(`Nenhum modelo DeepSeek respondeu (${last}).`);
}

/** A short picture of the day for the system prompt. */
async function snapshot(db: SupabaseClient, now: LocalNow, tz: string) {
  const endToday = zonedToUtc(now.date, '23:59', tz);
  const startToday = zonedToUtc(now.date, '00:00', tz);
  const [{ data: tasks }, { data: habits }, { data: goals }] = await Promise.all([
    db.from('tasks').select('title,due_date').eq('completed', false).eq('is_archived', false).not('due_date', 'is', null).lte('due_date', endToday).limit(40),
    db.from('habits').select('name,schedule_days,frequency').eq('is_archived', false),
    db.from('goals').select('title').eq('status', 'active').limit(10),
  ]);
  const today = (tasks ?? []).filter((t) => t.due_date >= startToday);
  return {
    tasksToday: today.slice(0, 10).map((t) => t.title),
    tasksLate: (tasks ?? []).length - today.length,
    habitsToday: (habits ?? []).filter((h) => dueToday(h, now)).map((h) => h.name).slice(0, 15),
    goals: (goals ?? []).map((g) => g.title),
  };
}

function dueToday(h: { schedule_days: number[] | null; frequency?: string | null }, now: LocalNow) {
  return h.frequency === 'weekly' || !h.schedule_days?.length || h.schedule_days.includes(now.weekday);
}

const localDay = (iso: string, tz: string) => localNow(tz, new Date(iso)).date;
const PRIORITY_PT: Record<string, string> = { high: 'alta', medium: 'média', low: 'baixa' };

/** Runs one checked tool call as the user. Results are short and in Portuguese. */
async function run(db: SupabaseClient, name: string, a: ToolArgs, now: LocalNow, tz: string): Promise<Record<string, unknown>> {
  const fail = (e: { message: string } | null) => ({ erro: e?.message ?? 'falhou' });
  switch (name) {
    case 'listar_tarefas': {
      let q = db.from('tasks').select('id,title,priority,due_date').eq('completed', false).eq('is_archived', false).order('due_date', { ascending: true, nullsFirst: false }).limit(50);
      if (a.periodo === 'hoje') q = q.not('due_date', 'is', null).lte('due_date', zonedToUtc(now.date, '23:59', tz));
      if (a.periodo === 'atrasadas') q = q.lt('due_date', zonedToUtc(now.date, '00:00', tz));
      if (a.periodo === 'semana') q = q.not('due_date', 'is', null).lte('due_date', zonedToUtc(addDays(now.date, 7), '23:59', tz));
      const { data, error } = await q;
      if (error) return fail(error);
      return { tarefas: (data ?? []).map((t) => ({ id: t.id, titulo: t.title, prioridade: PRIORITY_PT[t.priority], data: t.due_date ? localDay(t.due_date, tz) : null })) };
    }
    case 'criar_tarefa': {
      const due = a.data ? zonedToUtc(String(a.data), '23:59', tz) : null;
      const { error } = await db.from('tasks').insert({ title: a.titulo, priority: a.prioridade, due_date: due, due_all_day: !!due });
      return error ? fail(error) : { feito: `Tarefa criada: ${a.titulo}${a.data ? ` (${String(a.data).split('-').reverse().join('/')})` : ''}` };
    }
    case 'concluir_tarefa': {
      const { data, error } = await db.from('tasks').update({ completed: true, status: 'completed', completed_at: new Date().toISOString() }).eq('id', a.id).select('title');
      if (error) return fail(error);
      return data?.length ? { feito: `Tarefa concluída: ${data[0].title}` } : { erro: 'tarefa não encontrada' };
    }
    case 'criar_lembrete': {
      const { error } = await db.from('reminders').insert({ title: a.titulo, datetime: zonedToUtc(String(a.data), String(a.hora), tz) });
      return error ? fail(error) : { feito: `Lembrete: ${a.titulo}, ${String(a.data).split('-').reverse().join('/')} às ${a.hora}` };
    }
    case 'listar_habitos': {
      const [{ data: habits, error }, { data: done }] = await Promise.all([
        db.from('habits').select('id,name,habit_type,unit,target_value,schedule_days,frequency,times_per_week').eq('is_archived', false),
        db.from('habit_completions').select('habit_id,value').eq('completed_date', now.date),
      ]);
      if (error) return fail(error);
      return {
        habitos: (habits ?? []).filter((h) => dueToday(h, now)).map((h) => {
          const c = (done ?? []).find((x) => x.habit_id === h.id);
          return { id: h.id, nome: h.name, tipo: h.habit_type, meta: h.target_value, unidade: h.unit, feito_hoje: !!c && (h.target_value == null ? c.value > 0 : c.value >= h.target_value), valor_hoje: c?.value ?? 0 };
        }),
      };
    }
    case 'marcar_habito': {
      const { data: h } = await db.from('habits').select('name,target_value').eq('id', a.id).maybeSingle();
      if (!h) return { erro: 'hábito não encontrado' };
      const value = a.valor ?? h.target_value ?? 1;
      const { error } = await db.from('habit_completions').upsert({ habit_id: a.id, completed_date: now.date, value }, { onConflict: 'habit_id,completed_date' });
      return error ? fail(error) : { feito: `Hábito marcado: ${h.name}` };
    }
    case 'resumo_financeiro': {
      const from = `${a.ano}-${String(a.mes).padStart(2, '0')}-01`;
      const to = addDays(Number(a.mes) === 12 ? `${Number(a.ano) + 1}-01-01` : `${a.ano}-${String(Number(a.mes) + 1).padStart(2, '0')}-01`, -1);
      const { data, error } = await db.from('transactions').select('type,amount,category,is_pending').gte('date', from).lte('date', to);
      if (error) return fail(error);
      const rows = data ?? [];
      const sum = (t: string) => Math.round(rows.filter((r) => r.type === t).reduce((s, r) => s + Number(r.amount), 0) * 100) / 100;
      const byCat = new Map<string, number>();
      for (const r of rows.filter((x) => x.type === 'expense')) byCat.set(r.category ?? 'Sem categoria', (byCat.get(r.category ?? 'Sem categoria') ?? 0) + Number(r.amount));
      return {
        mes: `${String(a.mes).padStart(2, '0')}/${a.ano}`, receitas: sum('income'), despesas: sum('expense'), saldo: Math.round((sum('income') - sum('expense')) * 100) / 100,
        pendentes: rows.filter((r) => r.is_pending).length,
        maiores_categorias: [...byCat].sort((x, y) => y[1] - x[1]).slice(0, 5).map(([categoria, valor]) => ({ categoria, valor: Math.round(valor * 100) / 100 })),
        observacao: 'Regime de competência: conta pela data do lançamento.',
      };
    }
    case 'registrar_transacao': {
      const { error } = await db.from('transactions').insert({
        description: a.descricao, amount: a.valor, type: a.tipo === 'receita' ? 'income' : 'expense', category: a.categoria, date: a.data ?? now.date,
      });
      const money = `R$ ${Number(a.valor).toFixed(2).replace('.', ',')}`;
      return error ? fail(error) : { feito: `${a.tipo === 'receita' ? 'Receita' : 'Gasto'} registrado: ${a.descricao}, ${money}` };
    }
    case 'buscar_notas': {
      const like = `%${String(a.texto).replace(/[%_\\]/g, (c) => `\\${c}`)}%`;
      const { data, error } = await db.from('knowledge_blocks').select('id,title,content_text').or(`title.ilike.${like},content_text.ilike.${like}`).limit(8);
      if (error) return fail(error);
      return { notas: (data ?? []).map((n) => ({ titulo: n.title, trecho: n.content_text.slice(0, 400) })) };
    }
    case 'criar_nota': {
      const texto = String(a.texto ?? '');
      const { error } = await db.from('knowledge_blocks').insert({ title: a.titulo, content: textToBlocks(texto), content_text: texto, source_type: 'assistant' });
      return error ? fail(error) : { feito: `Nota criada: ${a.titulo}` };
    }
    case 'listar_metas': {
      const [{ data: goals, error }, { data: entries }] = await Promise.all([
        db.from('goals').select('id,title,goal_type,unit,start_value,target_value,measure,target_date,linked_bank_id').eq('status', 'active'),
        db.from('goal_entries').select('goal_id,date,value').order('date'),
      ]);
      if (error) return fail(error);
      return {
        metas: (goals ?? []).map((g) => {
          const mine = (entries ?? []).filter((e) => e.goal_id === g.id);
          const manual = g.goal_type === 'custom' || (g.goal_type === 'financial' && !g.linked_bank_id);
          const atual = !manual ? null : g.measure === 'last' ? Number(mine.at(-1)?.value ?? g.start_value) : Number(g.start_value) + mine.reduce((s, e) => s + Number(e.value), 0);
          return { titulo: g.title, tipo: g.goal_type, atual, alvo: g.target_value, unidade: g.goal_type === 'financial' ? 'R$' : g.unit, prazo: g.target_date, observacao: manual ? undefined : 'valor calculado no app' };
        }),
      };
    }
    case 'listar_projetos': {
      const [{ data: projects, error }, { data: links }, { data: open }] = await Promise.all([
        db.from('projects').select('id,name,status,due_date').eq('is_template', false).is('archived_at', null).in('status', ['active', 'planning']),
        db.from('project_tasks').select('project_id,task_id'),
        db.from('tasks').select('id').eq('completed', false),
      ]);
      if (error) return fail(error);
      const openIds = new Set((open ?? []).map((t) => t.id));
      return {
        projetos: (projects ?? []).map((p) => ({
          nome: p.name, prazo: p.due_date, tarefas_abertas: (links ?? []).filter((l) => l.project_id === p.id && openIds.has(l.task_id)).length,
        })),
      };
    }
  }
  return { erro: 'ferramenta desconhecida' };
}
