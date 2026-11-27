// What to notify and when, for one user. Pure: the function gathers the rows,
// this decides. Every notification has a key; a key already sent is skipped,
// so running every 5 minutes (or twice) never repeats one.

export interface Prefs { reminders: boolean; tasks: boolean; digest: boolean; autopilot: boolean }
export const DEFAULT_PREFS: Prefs = { reminders: true, tasks: true, digest: true, autopilot: true };

export interface UserData {
  tz: string;
  prefs: Prefs;
  reminderAdvance: number[];
  taskAdvance: number[];
  digestTime: string;
  reminders: { id: string; title: string; datetime: string; completed: boolean }[];
  tasks: { id: string; title: string; due_date: string | null; due_all_day: boolean; completed: boolean; is_archived: boolean }[];
  habitsToday: string[];
  bills: { description: string; amount: number }[];
  runs: { id: string; title: string; status: string; output: string; ran_at: string }[];
}

export interface Note { key: string; title: string; body: string; url: string }

// ---------------------------------------------------------------------------
// Time in the user's zone
// ---------------------------------------------------------------------------

export function localParts(tz: string, at: Date): { date: string; time: string } {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(at).map((x) => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, time: `${p.hour}:${p.minute}` };
}

/** A local date and time in a zone as a UTC instant. */
export function zonedToUtc(date: string, time: string, tz: string): Date {
  const [y, m, d] = date.split('-').map(Number);
  const [hh, mm] = time.split(':').map(Number);
  const guess = Date.UTC(y, m - 1, d, hh, mm);
  const wall = localParts(tz, new Date(guess));
  const [wy, wm, wd] = wall.date.split('-').map(Number);
  const [wh, wmin] = wall.time.split(':').map(Number);
  return new Date(guess - (Date.UTC(wy, wm - 1, wd, wh, wmin) - guess));
}

const money = (n: number) => `R$ ${n.toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.')}`;
const cut = (t: string, n: number) => (t.length > n ? `${t.slice(0, n - 1).trimEnd()}…` : t);
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

// ---------------------------------------------------------------------------
// The rules
// ---------------------------------------------------------------------------

/**
 * Notifications due now: those whose moment fell within the last `windowMin`
 * minutes and were not sent yet. A late or missed run still catches them.
 */
export function dueNotes(d: UserData, now: Date, sent: Set<string>, windowMin = 30): Note[] {
  const out: Note[] = [];
  const inWindow = (t: number) => t <= now.getTime() && t > now.getTime() - windowMin * 60_000;
  const add = (n: Note) => { if (!sent.has(n.key) && !out.some((o) => o.key === n.key)) out.push(n); };
  const hm = (iso: string) => localParts(d.tz, new Date(iso)).time;
  const offsets = (list: number[]) => [...new Set([0, ...list.filter((x) => x > 0 && x <= 24 * 60)])];

  if (d.prefs.reminders) {
    for (const r of d.reminders) {
      if (r.completed) continue;
      for (const off of offsets(d.reminderAdvance)) {
        if (!inWindow(new Date(r.datetime).getTime() - off * 60_000)) continue;
        add({ key: `r:${r.id}:${off}`, title: off ? `Em ${off} min: ${r.title}` : `Lembrete: ${r.title}`, body: `Às ${hm(r.datetime)}`, url: '/lembretes' });
      }
    }
  }

  if (d.prefs.tasks) {
    for (const t of d.tasks) {
      if (t.completed || t.is_archived || !t.due_date || t.due_all_day) continue;
      for (const off of offsets(d.taskAdvance)) {
        if (!inWindow(new Date(t.due_date).getTime() - off * 60_000)) continue;
        add({ key: `t:${t.id}:${off}`, title: off ? `Tarefa em ${off} min` : 'Tarefa agora', body: `${t.title} · ${hm(t.due_date)}`, url: '/tarefas' });
      }
    }
  }

  const today = localParts(d.tz, now).date;
  if (d.prefs.digest && inWindow(zonedToUtc(today, d.digestTime, d.tz).getTime())) {
    const open = d.tasks.filter((t) => !t.completed && !t.is_archived && t.due_date);
    const dayOf = (iso: string) => localParts(d.tz, new Date(iso)).date;
    const forToday = open.filter((t) => dayOf(t.due_date!) === today).length;
    const late = open.filter((t) => dayOf(t.due_date!) < today).length;
    const parts: string[] = [];
    if (forToday || late) parts.push(`${plural(forToday, 'tarefa', 'tarefas')} para hoje${late ? ` (${plural(late, 'atrasada', 'atrasadas')})` : ''}`);
    if (d.habitsToday.length) parts.push(plural(d.habitsToday.length, 'hábito', 'hábitos'));
    if (d.bills.length) parts.push(`contas: ${d.bills.map((b) => `${b.description} ${money(b.amount)}`).join(', ')}`);
    if (parts.length) add({ key: `d:${today}`, title: 'Seu dia', body: cut(parts.join(' · '), 180), url: '/inicio' });
  }

  if (d.prefs.autopilot) {
    for (const r of d.runs) {
      // Answers from the last 2 hours, so turning notifications on does not replay old ones.
      if ((r.status !== 'ok' && r.status !== 'error') || new Date(r.ran_at).getTime() < now.getTime() - 2 * 3600_000) continue;
      add({
        key: `a:${r.id}`, title: r.status === 'ok' ? `Piloto automático: ${r.title}` : `Piloto automático falhou: ${r.title}`,
        body: cut(r.output.replace(/\s+/g, ' '), 180), url: '/assistente',
      });
    }
  }
  return out;
}
