// Google Agenda: the parts that decide, kept apart from the network so tests
// cover them. The OAuth state is signed (no table needed); events convert
// both ways; planSync says what to create, change or delete on each side.

const enc = new TextEncoder();
const b64url = (b: Uint8Array) => btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

async function hmac(secret: string, text: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return b64url(new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode(text))));
}

/** "<user>.<time>.<signature>": proves the Google callback belongs to a sign-in started by this user, recently. */
export async function signState(userId: string, now: number, secret: string): Promise<string> {
  return `${userId}.${now}.${await hmac(secret, `${userId}.${now}`)}`;
}

/** The user of a valid state no older than 15 minutes; null otherwise. */
export async function verifyState(state: string, secret: string, now: number, maxAgeMs = 15 * 60_000): Promise<string | null> {
  const [userId, time, sig] = state.split('.');
  if (!userId || !time || !sig || !/^[0-9a-f-]{36}$/i.test(userId)) return null;
  const at = Number(time);
  if (!Number.isFinite(at) || now - at > maxAgeMs || at - now > 60_000) return null;
  return (await hmac(secret, `${userId}.${time}`)) === sig ? userId : null;
}

// ---------------------------------------------------------------------------
// Dates in a time zone
// ---------------------------------------------------------------------------

export function localDate(iso: string, tz: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(new Date(iso));
}

/** Midnight of a day in a zone, as a UTC instant. */
export function midnight(date: string, tz: string): string {
  const [y, m, d] = date.split('-').map(Number);
  const guess = Date.UTC(y, m - 1, d);
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
    .formatToParts(new Date(guess)).map((x) => [x.type, x.value]));
  const wall = Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day), Number(p.hour), Number(p.minute));
  return new Date(guess - (wall - guess)).toISOString();
}

export function addDays(date: string, n: number): string {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------
// Events both ways
// ---------------------------------------------------------------------------

export interface LocalEvent {
  id: string; title: string; start_at: string; end_at: string | null; all_day: boolean; location: string | null; notes: string | null;
  source: string; external_id: string | null; updated_at: string; synced_at: string | null;
}

export interface GoogleEvent {
  id: string; status?: string; summary?: string; location?: string; description?: string; updated?: string;
  start?: { date?: string; dateTime?: string }; end?: { date?: string; dateTime?: string };
  extendedProperties?: { private?: Record<string, string> };
}

export type LocalFields = Pick<LocalEvent, 'title' | 'start_at' | 'end_at' | 'all_day' | 'location' | 'notes'>;

/**
 * A Google event as a Painel appointment. All-day events start at midnight in
 * the user's zone; Google's end date is exclusive, so a one-day event has no end.
 */
export function googleToLocal(g: GoogleEvent, tz: string): LocalFields {
  const title = (g.summary ?? '').trim() || '(sem título)';
  const base = { title, location: g.location?.trim() || null, notes: g.description?.trim() || null };
  if (g.start?.date) {
    const lastDay = g.end?.date ? addDays(g.end.date, -1) : g.start.date;
    return { ...base, all_day: true, start_at: midnight(g.start.date, tz), end_at: lastDay > g.start.date ? midnight(lastDay, tz) : null };
  }
  const start = new Date(g.start?.dateTime ?? 0).toISOString();
  const end = g.end?.dateTime ? new Date(g.end.dateTime).toISOString() : null;
  return { ...base, all_day: false, start_at: start, end_at: end && end >= start ? end : null };
}

/** A Painel appointment as a Google event body; it carries the Painel id so the copy is recognized. */
export function localToGoogle(l: LocalFields & { id: string }, tz: string) {
  const body: Record<string, unknown> = {
    summary: l.title, location: l.location ?? '', description: l.notes ?? '',
    extendedProperties: { private: { painel_id: l.id } },
  };
  if (l.all_day) {
    const first = localDate(l.start_at, tz);
    const last = l.end_at ? localDate(l.end_at, tz) : first;
    body.start = { date: first };
    body.end = { date: addDays(last < first ? first : last, 1) };
  } else {
    const end = l.end_at ?? new Date(new Date(l.start_at).getTime() + 3600_000).toISOString();
    body.start = { dateTime: l.start_at, timeZone: tz };
    body.end = { dateTime: end, timeZone: tz };
  }
  return body;
}

// ---------------------------------------------------------------------------
// The plan
// ---------------------------------------------------------------------------

export interface Plan {
  insertLocal: (LocalFields & { external_id: string })[];
  updateLocal: { id: string; fields: LocalFields }[];
  deleteLocal: string[];
  createGoogle: LocalEvent[];
  patchGoogle: { googleId: string; local: LocalEvent }[];
  deleteGoogle: string[];
}

// Writes of the sync itself bump updated_at a moment after synced_at.
const SLACK = 5000;

/**
 * What to do so both calendars match, within a window of days. A change made
 * on one side since the last sync goes to the other; when both changed, the
 * later one wins. Deleting on either side deletes on the other. Google events
 * outside the window are left alone.
 */
export function planSync(locals: LocalEvent[], googles: GoogleEvent[], deletedHere: string[], window: { from: string; to: string }, tz: string): Plan {
  const plan: Plan = { insertLocal: [], updateLocal: [], deleteLocal: [], createGoogle: [], patchGoogle: [], deleteGoogle: [] };
  const deleted = new Set(deletedHere);
  const live = googles.filter((g) => g.status !== 'cancelled' && (g.start?.date || g.start?.dateTime));
  const seen = new Set<string>();
  const time = (s: string | null | undefined) => (s ? new Date(s).getTime() : 0);

  for (const g of live) {
    if (deleted.has(g.id)) { plan.deleteGoogle.push(g.id); continue; }
    const painelId = g.extendedProperties?.private?.painel_id;
    const local = locals.find((l) => l.external_id === g.id) ?? (painelId ? locals.find((l) => l.id === painelId) : undefined);
    if (!local) {
      // Made in the Painel and gone from it: deleted here.
      if (painelId) plan.deleteGoogle.push(g.id);
      else plan.insertLocal.push({ ...googleToLocal(g, tz), external_id: g.id });
      continue;
    }
    seen.add(local.id);
    const synced = time(local.synced_at);
    const localChanged = !local.synced_at || time(local.updated_at) > synced + SLACK;
    const googleChanged = time(g.updated) > synced + SLACK;
    if (!local.external_id) { plan.patchGoogle.push({ googleId: g.id, local }); continue; }
    if (localChanged && googleChanged) {
      if (time(local.updated_at) >= time(g.updated)) plan.patchGoogle.push({ googleId: g.id, local });
      else plan.updateLocal.push({ id: local.id, fields: googleToLocal(g, tz) });
    } else if (googleChanged) plan.updateLocal.push({ id: local.id, fields: googleToLocal(g, tz) });
    else if (localChanged) plan.patchGoogle.push({ googleId: g.id, local });
  }

  for (const l of locals) {
    if (seen.has(l.id)) continue;
    const inWindow = l.start_at >= window.from && l.start_at <= window.to;
    if (!inWindow) continue;
    if (l.external_id) plan.deleteLocal.push(l.id); // deleted in Google
    else if (l.source !== 'google') plan.createGoogle.push(l);
  }
  for (const id of deleted) if (!plan.deleteGoogle.includes(id) && !live.some((g) => g.id === id)) plan.deleteGoogle.push(id);
  return plan;
}
