// Google Agenda. Ways in:
// - Signed-in user, POST { action }: 'auth_url' (where to send the browser
//   to connect), 'sync' (sync now), 'disconnect', 'status'.
// - Google, GET ?code&state: the end of the sign-in; tokens are stored and the
//   browser goes back to Configurações.
// - The database every 5 minutes, POST { scan: true } with the shared secret:
//   sync everyone connected.
// Tokens stay in google_accounts, which the app cannot read. The service role
// skips row level security, so every query names the user.
import { createClient, type SupabaseClient } from 'jsr:@supabase/supabase-js@2';
import { localToGoogle, planSync, signState, verifyState, type GoogleEvent, type LocalEvent } from './lib.ts';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const SCOPES = 'https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/calendar.calendarlist.readonly';
const APP = Deno.env.get('APP_URL') ?? 'https://painel-seven-smoky.vercel.app';
const REDIRECT = Deno.env.get('GCAL_REDIRECT') ?? `${Deno.env.get('SUPABASE_URL')}/functions/v1/gcal`;
const API = 'https://www.googleapis.com/calendar/v3';
// Most writes per run, so a run fits in the function's time.
const MAX_WRITES = 150;

const env = (k: string) => Deno.env.get(k) ?? '';
const admin = () => createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
  if (!env('GOOGLE_CLIENT_ID') || !env('GOOGLE_CLIENT_SECRET')) return json({ error: 'Faltam GOOGLE_CLIENT_ID e GOOGLE_CLIENT_SECRET nos secrets do Supabase.' }, 503);

  const url = new URL(req.url);
  if (req.method === 'GET') return callback(url);

  const body = await req.json().catch(() => ({}));
  const given = req.headers.get('x-automation-secret');
  if (given !== null) {
    if (given !== env('AUTOMATION_SECRET')) return json({ error: 'unauthorized' }, 401);
    const db = admin();
    const { data: accounts } = await db.from('google_accounts').select('user_id');
    const results = [];
    for (const a of accounts ?? []) results.push(await syncUser(db, a.user_id).catch((e) => ({ error: (e as Error).message })));
    return json({ users: (accounts ?? []).length, results });
  }

  const auth = req.headers.get('Authorization') ?? '';
  const userDb = createClient(env('SUPABASE_URL'), env('SUPABASE_ANON_KEY'), { global: { headers: { Authorization: auth } } });
  const { data: { user } } = await userDb.auth.getUser(auth.replace(/^Bearer /, ''));
  if (!user) return json({ error: 'unauthorized' }, 401);

  if (body.action === 'auth_url') {
    const state = await signState(user.id, Date.now(), env('AUTOMATION_SECRET'));
    const q = new URLSearchParams({
      client_id: env('GOOGLE_CLIENT_ID'), redirect_uri: REDIRECT, response_type: 'code', scope: SCOPES,
      access_type: 'offline', prompt: 'consent', include_granted_scopes: 'true', state,
    });
    return json({ url: `https://accounts.google.com/o/oauth2/v2/auth?${q}`, redirect_uri: REDIRECT });
  }
  if (body.action === 'sync') return json(await syncUser(admin(), user.id).catch((e) => ({ error: (e as Error).message })));
  if (body.action === 'disconnect') {
    const db = admin();
    const { data: acc } = await db.from('google_accounts').select('refresh_token').eq('user_id', user.id).maybeSingle();
    if (acc?.refresh_token) await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(acc.refresh_token)}`, { method: 'POST' }).catch(() => null);
    await db.from('google_accounts').delete().eq('user_id', user.id);
    await db.from('gcal_deletions').delete().eq('user_id', user.id);
    // Google's events leave the Painel; appointments made here stay, unlinked.
    if (body.keepGoogleEvents !== true) await db.from('events').delete().eq('user_id', user.id).eq('source', 'google');
    await db.from('gcal_deletions').delete().eq('user_id', user.id);
    await db.from('events').update({ external_id: null, synced_at: null }).eq('user_id', user.id).not('external_id', 'is', null);
    return json({ disconnected: true });
  }
  if (body.action === 'status') return json({ redirect_uri: REDIRECT, client: !!env('GOOGLE_CLIENT_ID') });
  return json({ error: 'nothing to do' }, 400);
});

/** Google's redirect after the user allows (or refuses) access. */
async function callback(url: URL): Promise<Response> {
  const back = (result: string, detail = '') =>
    Response.redirect(`${APP}/configuracoes?secao=conectores&google=${result}${detail ? `&motivo=${encodeURIComponent(detail.slice(0, 120))}` : ''}`, 302);
  if (url.searchParams.get('error')) return back('recusado', url.searchParams.get('error')!);
  const uid = await verifyState(url.searchParams.get('state') ?? '', env('AUTOMATION_SECRET'), Date.now());
  const code = url.searchParams.get('code');
  if (!uid || !code) return back('erro', 'pedido expirado; tente conectar de novo');
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ code, client_id: env('GOOGLE_CLIENT_ID'), client_secret: env('GOOGLE_CLIENT_SECRET'), redirect_uri: REDIRECT, grant_type: 'authorization_code' }),
  });
  const tok = await res.json().catch(() => ({}));
  if (!res.ok || !tok.access_token) return back('erro', tok.error_description ?? tok.error ?? `Google respondeu ${res.status}`);
  const db = admin();
  const { data: old } = await db.from('google_accounts').select('refresh_token').eq('user_id', uid).maybeSingle();
  const refresh = tok.refresh_token ?? old?.refresh_token;
  if (!refresh) return back('erro', 'o Google não enviou acesso contínuo; desconecte o Painel em myaccount.google.com e conecte de novo');
  const primary = await fetch(`${API}/users/me/calendarList/primary`, { headers: { Authorization: `Bearer ${tok.access_token}` } }).then((r) => r.json()).catch(() => ({}));
  const { error } = await db.from('google_accounts').upsert({
    user_id: uid, email: primary.id ?? null, refresh_token: refresh, access_token: tok.access_token,
    access_expires_at: new Date(Date.now() + (Number(tok.expires_in) || 3600) * 1000 - 60_000).toISOString(),
    connected_at: new Date().toISOString(), last_error: null,
  }, { onConflict: 'user_id' });
  if (error) return back('erro', error.message);
  await syncUser(db, uid).catch(() => null);
  return back('ok');
}

/** A valid access token, refreshed when it is about to expire. */
async function accessToken(db: SupabaseClient, uid: string): Promise<string> {
  const { data: a } = await db.from('google_accounts').select('refresh_token,access_token,access_expires_at').eq('user_id', uid).maybeSingle();
  if (!a) throw new Error('Google Agenda não está conectado.');
  if (a.access_token && a.access_expires_at && new Date(a.access_expires_at).getTime() > Date.now() + 60_000) return a.access_token;
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ refresh_token: a.refresh_token, client_id: env('GOOGLE_CLIENT_ID'), client_secret: env('GOOGLE_CLIENT_SECRET'), grant_type: 'refresh_token' }),
  });
  const tok = await res.json().catch(() => ({}));
  if (!res.ok || !tok.access_token) {
    throw new Error(tok.error === 'invalid_grant'
      ? 'O Google encerrou o acesso (no modo de teste isso acontece a cada 7 dias). Conecte de novo em Configurações.'
      : `Não deu para renovar o acesso ao Google (${tok.error ?? res.status}).`);
  }
  await db.from('google_accounts').update({
    access_token: tok.access_token, access_expires_at: new Date(Date.now() + (Number(tok.expires_in) || 3600) * 1000 - 60_000).toISOString(),
  }).eq('user_id', uid);
  return tok.access_token;
}

/** Brings both calendars in line for one user, and records how it went. */
async function syncUser(db: SupabaseClient, uid: string) {
  const started = new Date();
  try {
    const token = await accessToken(db, uid);
    const g = (path: string, init: RequestInit = {}) =>
      fetch(`${API}${path}`, { ...init, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(init.headers ?? {}) } });
    const { data: acc } = await db.from('google_accounts').select('calendar_id').eq('user_id', uid).single();
    const cal = encodeURIComponent(acc?.calendar_id ?? 'primary');
    const { data: settings } = await db.from('user_settings').select('timezone').eq('user_id', uid).maybeSingle();
    const tz = settings?.timezone ?? 'America/Sao_Paulo';
    const window = {
      from: new Date(started.getTime() - 30 * 86400_000).toISOString(),
      to: new Date(started.getTime() + 365 * 86400_000).toISOString(),
    };

    const googles: GoogleEvent[] = [];
    let page = '';
    do {
      const q = new URLSearchParams({ timeMin: window.from, timeMax: window.to, singleEvents: 'true', maxResults: '2500', showDeleted: 'false' });
      if (page) q.set('pageToken', page);
      const res = await g(`/calendars/${cal}/events?${q}`);
      const data = await res.json();
      if (!res.ok) throw new Error(`Google Agenda respondeu ${res.status}: ${data.error?.message ?? ''}`);
      googles.push(...(data.items ?? []));
      page = data.nextPageToken ?? '';
    } while (page);

    const { data: locals } = await db.from('events')
      .select('id,title,start_at,end_at,all_day,location,notes,source,external_id,updated_at,synced_at').eq('user_id', uid).limit(10000);
    const { data: gone } = await db.from('gcal_deletions').select('google_event_id').eq('user_id', uid);
    const plan = planSync((locals ?? []) as LocalEvent[], googles, (gone ?? []).map((d) => d.google_event_id), window, tz);

    let writes = 0;
    const now = () => new Date().toISOString();
    const can = () => writes++ < MAX_WRITES;
    for (const e of plan.insertLocal) if (can()) await db.from('events').upsert({ ...e, user_id: uid, source: 'google', synced_at: now() }, { onConflict: 'user_id,external_id' });
    for (const u of plan.updateLocal) if (can()) await db.from('events').update({ ...u.fields, synced_at: now() }).eq('id', u.id).eq('user_id', uid);
    for (const id of plan.deleteLocal) if (can()) await db.from('events').delete().eq('id', id).eq('user_id', uid);
    for (const l of plan.createGoogle) {
      if (!can()) break;
      const res = await g(`/calendars/${cal}/events`, { method: 'POST', body: JSON.stringify(localToGoogle(l, tz)) });
      const made = await res.json();
      if (res.ok) await db.from('events').update({ external_id: made.id, synced_at: now() }).eq('id', l.id).eq('user_id', uid);
    }
    for (const p of plan.patchGoogle) {
      if (!can()) break;
      const res = await g(`/calendars/${cal}/events/${encodeURIComponent(p.googleId)}`, { method: 'PATCH', body: JSON.stringify(localToGoogle(p.local, tz)) });
      await res.body?.cancel();
      if (res.ok) await db.from('events').update({ external_id: p.googleId, synced_at: now() }).eq('id', p.local.id).eq('user_id', uid);
    }
    for (const id of plan.deleteGoogle) {
      if (!can()) break;
      const res = await g(`/calendars/${cal}/events/${encodeURIComponent(id)}`, { method: 'DELETE' });
      await res.body?.cancel();
      if (res.ok || res.status === 404 || res.status === 410) await db.from('gcal_deletions').delete().eq('user_id', uid).eq('google_event_id', id);
    }
    // Deletions this run made locally (events gone from Google) were logged by the trigger: nothing left to do for them.
    if (plan.deleteLocal.length) await db.from('gcal_deletions').delete().eq('user_id', uid).gte('deleted_at', started.toISOString());

    const result = {
      trazidos: plan.insertLocal.length, atualizados_aqui: plan.updateLocal.length, apagados_aqui: plan.deleteLocal.length,
      enviados: plan.createGoogle.length, atualizados_no_google: plan.patchGoogle.length, apagados_no_google: plan.deleteGoogle.length,
      eventos_no_google: googles.length, pendente: writes > MAX_WRITES,
    };
    await db.from('google_accounts').update({ last_sync_at: now(), last_error: null, last_result: result }).eq('user_id', uid);
    return result;
  } catch (e) {
    await db.from('google_accounts').update({ last_sync_at: new Date().toISOString(), last_error: (e as Error).message }).eq('user_id', uid);
    throw e;
  }
}
