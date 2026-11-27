// Browser push. Two ways in:
// - Every 5 minutes the database calls with the shared secret
//   (x-automation-secret) and { scan: true }: for each user with a subscribed
//   device, work out what is due (lib.ts), send it and log its key.
// - A signed-in user sends { test: true }: a test notification to their devices.
// The service role skips row level security, so every query here is limited
// to one user explicitly. The VAPID private key is a Supabase secret.
import { createClient, type SupabaseClient } from 'jsr:@supabase/supabase-js@2';
import { DEFAULT_PREFS, dueNotes, localParts, type Note, type UserData } from './lib.ts';
import { sendPush, type PushSubscription } from './webpush.ts';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const SUBJECT = Deno.env.get('VAPID_SUBJECT') ?? 'https://painel-seven-smoky.vercel.app';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
  const body = await req.json().catch(() => ({}));
  const url = Deno.env.get('SUPABASE_URL')!;
  const raw = Deno.env.get('VAPID_PRIVATE_JWK');
  if (!raw) return json({ error: 'missing_vapid' }, 503);
  const jwk = JSON.parse(raw) as JsonWebKey;

  const given = req.headers.get('x-automation-secret');
  if (given !== null) {
    const secret = Deno.env.get('AUTOMATION_SECRET');
    if (!secret || given !== secret) return json({ error: 'unauthorized' }, 401);
    const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
    return json(await scan(admin, jwk));
  }

  const auth = req.headers.get('Authorization') ?? '';
  const db = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: auth } } });
  const { data: { user } } = await db.auth.getUser(auth.replace(/^Bearer /, ''));
  if (!user) return json({ error: 'unauthorized' }, 401);
  if (body.test !== true) return json({ error: 'nothing to do' }, 400);
  const note: Note = { key: `test:${Date.now()}`, title: 'Painel', body: 'As notificações estão funcionando neste aparelho.', url: '/configuracoes' };
  return json(await deliver(db, user.id, [note], jwk, false));
});

/** Sends notes to all devices of a user; drops subscriptions the push service says are gone. */
async function deliver(db: SupabaseClient, uid: string, notes: Note[], jwk: JsonWebKey, log: boolean) {
  const { data: subs } = await db.from('push_subscriptions').select('id,endpoint,p256dh,auth').eq('user_id', uid);
  let sent = 0;
  const gone = new Set<string>();
  for (const note of notes) {
    for (const s of (subs ?? []) as (PushSubscription & { id: string })[]) {
      if (gone.has(s.id)) continue;
      const status = await sendPush(s, { title: note.title, body: note.body, url: note.url, tag: note.key }, jwk, SUBJECT).catch(() => 0);
      if (status === 404 || status === 410) gone.add(s.id);
      else if (status >= 200 && status < 300) sent++;
    }
    if (log) await db.from('notification_log').upsert({ user_id: uid, key: note.key }, { onConflict: 'user_id,key', ignoreDuplicates: true });
  }
  if (gone.size) await db.from('push_subscriptions').delete().eq('user_id', uid).in('id', [...gone]);
  return { devices: (subs ?? []).length, sent, removed: gone.size };
}

/** For every user with a device: gather, decide, send, log. */
async function scan(db: SupabaseClient, jwk: JsonWebKey) {
  const now = new Date();
  const { data: subs } = await db.from('push_subscriptions').select('user_id');
  const users = [...new Set((subs ?? []).map((s) => s.user_id as string))];
  const report: { user: string; notes: number; sent: number }[] = [];
  for (const uid of users) {
    const data = await gather(db, uid, now);
    const { data: log } = await db.from('notification_log').select('key').eq('user_id', uid).gte('sent_at', new Date(now.getTime() - 3 * 86400_000).toISOString());
    const notes = dueNotes(data, now, new Set((log ?? []).map((l) => l.key as string)));
    if (!notes.length) continue;
    const r = await deliver(db, uid, notes, jwk, true);
    report.push({ user: uid.slice(0, 8), notes: notes.length, sent: r.sent });
  }
  await db.from('notification_log').delete().lt('sent_at', new Date(now.getTime() - 14 * 86400_000).toISOString());
  return { users: users.length, report };
}

async function gather(db: SupabaseClient, uid: string, now: Date): Promise<UserData> {
  const { data: s } = await db.from('user_settings')
    .select('timezone,reminders_advance_minutes,tasks_advance_minutes,habits_digest_time,notify_prefs').eq('user_id', uid).maybeSingle();
  const tz = s?.timezone ?? 'America/Sao_Paulo';
  const today = localParts(tz, now).date;
  const weekday = new Date(`${today}T12:00:00Z`).getUTCDay();
  const ahead = new Date(now.getTime() + 2 * 86400_000).toISOString();
  const [reminders, tasks, habits, done, bills, runs] = await Promise.all([
    db.from('reminders').select('id,title,datetime,completed').eq('user_id', uid).eq('completed', false)
      .gte('datetime', new Date(now.getTime() - 86400_000).toISOString()).lte('datetime', ahead),
    db.from('tasks').select('id,title,due_date,due_all_day,completed,is_archived').eq('user_id', uid).eq('completed', false).eq('is_archived', false)
      .not('due_date', 'is', null).lte('due_date', ahead).limit(500),
    db.from('habits').select('id,name,schedule_days,frequency').eq('user_id', uid).eq('is_archived', false),
    db.from('habit_completions').select('habit_id').eq('user_id', uid).eq('completed_date', today),
    db.from('transactions').select('description,amount').eq('user_id', uid).eq('is_pending', true).eq('type', 'expense').eq('date', today),
    db.from('automation_runs').select('id,status,output,ran_at,automations(title)').eq('user_id', uid).in('status', ['ok', 'error'])
      .gte('ran_at', new Date(now.getTime() - 2 * 3600_000).toISOString()),
  ]);
  const doneIds = new Set((done.data ?? []).map((c) => c.habit_id));
  return {
    tz,
    prefs: { ...DEFAULT_PREFS, ...(s?.notify_prefs ?? {}) },
    reminderAdvance: s?.reminders_advance_minutes ?? [15],
    taskAdvance: s?.tasks_advance_minutes ?? [30],
    digestTime: String(s?.habits_digest_time ?? '08:00').slice(0, 5),
    reminders: reminders.data ?? [],
    tasks: tasks.data ?? [],
    habitsToday: (habits.data ?? [])
      .filter((h) => h.frequency !== 'weekly' && (!h.schedule_days?.length || h.schedule_days.includes(weekday)) && !doneIds.has(h.id))
      .map((h) => h.name),
    bills: (bills.data ?? []).map((b) => ({ description: b.description, amount: Number(b.amount) })),
    runs: (runs.data ?? []).map((r) => ({
      id: r.id, status: r.status, output: r.output ?? '', ran_at: r.ran_at,
      title: (r.automations as unknown as { title?: string } | null)?.title ?? 'automação',
    })),
  };
}
