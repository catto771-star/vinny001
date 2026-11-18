import { addDays, toDay, weekday, type Day } from './dates';
import { recurringInMonth, invoices, type Card, type InvoicePayment, type RecurringTemplate, type Skip, type Tx } from './finance';
import { isDone, isScheduledOn, type Habit, type HabitCompletion } from './habits';
import type { PlanSession } from './plans';
import type { Reminder } from './reminders';
import type { Task } from './tasks';

export type AgendaKind = 'event' | 'task' | 'reminder' | 'habit' | 'workout' | 'money';

export const KIND_LABEL: Record<AgendaKind, string> = {
  event: 'Compromissos', task: 'Tarefas', reminder: 'Lembretes', habit: 'Hábitos', workout: 'Treinos', money: 'Finanças',
};

export interface AgendaItem {
  key: string; kind: AgendaKind; day: Day; title: string;
  /** 'HH:MM' local time, or null for all-day items. */
  time: string | null; endTime?: string | null; done: boolean; overdue: boolean;
  amount?: number; detail?: string; ref?: string;
}

export interface Event { id: string; title: string; start_at: string; end_at: string | null; all_day: boolean; location: string | null }

export interface AgendaSources {
  events?: Event[]; tasks?: Task[]; reminders?: Reminder[]; habits?: Habit[]; completions?: HabitCompletion[];
  planSessions?: PlanSession[]; workouts?: { date: Day; plan_session_id?: string | null; title: string | null }[];
  txs?: Tx[]; templates?: RecurringTemplate[]; skips?: Skip[]; cards?: Card[]; payments?: InvoicePayment[];
}

const hhmm = (iso: string) => {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

/** Everything that happens between two days (inclusive), from every module, sorted by day and time. */
export function buildAgenda(from: Day, to: Day, s: AgendaSources, now: Date): AgendaItem[] {
  const today = toDay(now);
  const out: AgendaItem[] = [];
  const inRange = (d: Day) => d >= from && d <= to;
  const days: Day[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) days.push(d);

  for (const e of s.events ?? []) {
    const day = toDay(new Date(e.start_at));
    if (!inRange(day)) continue;
    out.push({ key: `e${e.id}`, kind: 'event', day, title: e.title, time: e.all_day ? null : hhmm(e.start_at),
      endTime: e.all_day || !e.end_at ? null : hhmm(e.end_at), done: false, overdue: false, detail: e.location ?? undefined, ref: e.id });
  }
  for (const t of s.tasks ?? []) {
    if (!t.due_date || t.is_archived) continue;
    const day = toDay(new Date(t.due_date));
    if (!inRange(day)) continue;
    out.push({ key: `t${t.id}`, kind: 'task', day, title: t.title, time: t.due_all_day ? null : hhmm(t.due_date),
      done: t.completed, overdue: !t.completed && day < today, ref: t.id });
  }
  for (const r of s.reminders ?? []) {
    const day = toDay(new Date(r.datetime));
    if (!inRange(day)) continue;
    out.push({ key: `r${r.id}`, kind: 'reminder', day, title: r.title, time: hhmm(r.datetime), done: r.completed,
      overdue: !r.completed && new Date(r.datetime) < now, ref: r.id });
  }
  for (const h of (s.habits ?? []).filter((x) => !x.is_archived)) {
    for (const day of days) {
      if (!isScheduledOn(h, day)) continue;
      const c = (s.completions ?? []).find((x) => x.habit_id === h.id && x.completed_date === day);
      out.push({ key: `h${h.id}${day}`, kind: 'habit', day, title: h.name, time: h.schedule_time?.slice(0, 5) ?? null,
        done: isDone(h, c), overdue: false, ref: h.id });
    }
  }
  const sessions = s.planSessions ?? [];
  for (const day of days) {
    const trained = (s.workouts ?? []).filter((w) => w.date === day);
    for (const w of trained) out.push({ key: `w${day}${w.plan_session_id ?? w.title}`, kind: 'workout', day, title: w.title || 'Treino', time: null, done: true, overdue: false });
    if (trained.length || day < today) continue;
    for (const ps of sessions.filter((x) => x.weekdays.includes(weekday(day)))) {
      out.push({ key: `p${ps.id}${day}`, kind: 'workout', day, title: ps.label, time: null, done: false, overdue: false, detail: 'da ficha', ref: ps.id });
    }
  }
  if (s.templates || s.txs) {
    const months = new Set(days.map((d) => d.slice(0, 7)));
    for (const ym of months) {
      const [y, m] = ym.split('-').map(Number);
      for (const o of recurringInMonth(s.templates ?? [], s.txs ?? [], s.skips ?? [], y, m)) {
        if (!inRange(o.date) || o.skipped) continue;
        out.push({ key: `m${o.template.id}${o.date}`, kind: 'money', day: o.date, title: o.template.description, time: null,
          done: !!o.paid, overdue: !o.paid && o.date < today, amount: o.template.type === 'expense' ? -o.template.amount : o.template.amount, ref: o.template.id });
      }
    }
    for (const t of (s.txs ?? []).filter((x) => x.is_pending && inRange(x.date))) {
      out.push({ key: `x${t.id}`, kind: 'money', day: t.date, title: t.description, time: null, done: false,
        overdue: t.date < today, amount: t.type === 'expense' ? -t.amount : t.amount, ref: t.id });
    }
    for (const card of s.cards ?? []) {
      for (const inv of invoices(card, s.txs ?? [], s.payments ?? [])) {
        if (!inRange(inv.dueDate)) continue;
        out.push({ key: `i${card.id}${inv.dueDate}`, kind: 'money', day: inv.dueDate, title: `Fatura ${card.name}`, time: null,
          done: !!inv.paid, overdue: !inv.paid && inv.dueDate < today, amount: -inv.total, ref: card.id });
      }
    }
  }
  return out.sort((a, b) => a.day.localeCompare(b.day) || (a.time ?? '').localeCompare(b.time ?? '') || a.title.localeCompare(b.title, 'pt'));
}

/** Recurring task templates projected on days after today that have no task yet. */
export function projectedRecurringTasks(
  templates: { id: string; title: string; recurrence_days: number[]; time_of_day: string | null; start_date: Day; end_date: Day | null; is_active: boolean }[],
  from: Day, to: Day, today: Day,
): { template_id: string; day: Day; title: string; time: string | null }[] {
  const out: { template_id: string; day: Day; title: string; time: string | null }[] = [];
  for (let d = from > today ? from : addDays(today, 1); d <= to; d = addDays(d, 1)) {
    for (const t of templates) {
      if (!t.is_active || d < t.start_date || (t.end_date && d > t.end_date)) continue;
      if (t.recurrence_days.length && !t.recurrence_days.includes(weekday(d))) continue;
      out.push({ template_id: t.id, day: d, title: t.title, time: t.time_of_day?.slice(0, 5) ?? null });
    }
  }
  return out;
}
