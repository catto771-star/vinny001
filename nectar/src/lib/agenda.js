import { addDays, toDay, weekday } from './dates';
import { recurringInMonth, invoices } from './finance';
import { isDone, routineFor } from './habits';
export const KIND_LABEL = {
    event: 'Compromissos', task: 'Tarefas', reminder: 'Lembretes', habit: 'Hábitos', workout: 'Treinos', money: 'Finanças',
};
const hhmm = (iso) => {
    const d = new Date(iso);
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};
/** Everything that happens between two days (inclusive), from every module, sorted by day and time. */
export function buildAgenda(from, to, s, now) {
    const today = toDay(now);
    const out = [];
    const inRange = (d) => d >= from && d <= to;
    const days = [];
    for (let d = from; d <= to; d = addDays(d, 1))
        days.push(d);
    const taskById = new Map((s.tasks ?? []).map((t) => [t.id, t]));
    for (const e of s.events ?? []) {
        const day = toDay(new Date(e.start_at));
        if (!inRange(day))
            continue;
        const linked = e.task_id ? taskById.get(e.task_id) : undefined;
        const endRef = e.end_at ? new Date(e.end_at) : new Date(e.start_at);
        out.push({
            key: `e${e.id}`, kind: 'event', day, title: e.title, time: e.all_day ? null : hhmm(e.start_at),
            endTime: e.all_day || !e.end_at ? null : hhmm(e.end_at),
            done: linked ? linked.completed : false,
            overdue: linked ? (!linked.completed && endRef < now) : false,
            detail: [e.location, linked ? 'Bloco de foco' : null, e.source === 'google' ? 'Google Agenda' : null].filter(Boolean).join(' · ') || undefined,
            ref: e.id,
            taskId: linked ? linked.id : e.task_id ?? null,
        });
    }
    for (const t of s.tasks ?? []) {
        if (!t.due_date || t.is_archived)
            continue;
        const day = toDay(new Date(t.due_date));
        if (!inRange(day))
            continue;
        out.push({ key: `t${t.id}`, kind: 'task', day, title: t.title, time: t.due_all_day ? null : hhmm(t.due_date),
            done: t.completed, overdue: !t.completed && day < today, ref: t.id });
    }
    for (const r of s.reminders ?? []) {
        const day = toDay(new Date(r.datetime));
        if (!inRange(day))
            continue;
        out.push({ key: `r${r.id}`, kind: 'reminder', day, title: r.title, time: hhmm(r.datetime), done: r.completed,
            overdue: !r.completed && new Date(r.datetime) < now, ref: r.id });
    }
    for (const h of (s.habits ?? []).filter((x) => !x.is_archived)) {
        for (const day of days) {
            if (!routineFor([h], day, s.completions ?? []).length)
                continue;
            const c = (s.completions ?? []).find((x) => x.habit_id === h.id && x.completed_date === day);
            out.push({ key: `h${h.id}${day}`, kind: 'habit', day, title: h.name, time: h.schedule_time?.slice(0, 5) ?? null,
                done: isDone(h, c), overdue: false, ref: h.id });
        }
    }
    const sessions = s.planSessions ?? [];
    for (const day of days) {
        const trained = (s.workouts ?? []).filter((w) => w.date === day);
        for (const w of trained)
            out.push({ key: `w${day}${w.plan_session_id ?? w.title}`, kind: 'workout', day, title: w.title || 'Treino', time: null, done: true, overdue: false });
        if (trained.length || day < today)
            continue;
        for (const ps of sessions.filter((x) => x.weekdays.includes(weekday(day)))) {
            out.push({ key: `p${ps.id}${day}`, kind: 'workout', day, title: ps.label, time: null, done: false, overdue: false, detail: 'da ficha', ref: ps.id });
        }
    }
    if (s.templates || s.txs) {
        const months = new Set(days.map((d) => d.slice(0, 7)));
        for (const ym of months) {
            const [y, m] = ym.split('-').map(Number);
            for (const o of recurringInMonth(s.templates ?? [], s.txs ?? [], s.skips ?? [], y, m)) {
                if (!inRange(o.date) || o.skipped)
                    continue;
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
                if (!inRange(inv.dueDate))
                    continue;
                out.push({ key: `i${card.id}${inv.dueDate}`, kind: 'money', day: inv.dueDate, title: `Fatura ${card.name}`, time: null,
                    done: !!inv.paid, overdue: !inv.paid && inv.dueDate < today, amount: -inv.total, ref: card.id });
            }
        }
    }
    return out.sort((a, b) => a.day.localeCompare(b.day) || (a.time ?? '').localeCompare(b.time ?? '') || a.title.localeCompare(b.title, 'pt'));
}
/** Recurring task templates projected on days after today that have no task yet. */
export function projectedRecurringTasks(templates, from, to, today) {
    const out = [];
    for (let d = from > today ? from : addDays(today, 1); d <= to; d = addDays(d, 1)) {
        for (const t of templates) {
            if (!t.is_active || d < t.start_date || (t.end_date && d > t.end_date))
                continue;
            if (t.recurrence_days.length && !t.recurrence_days.includes(weekday(d)))
                continue;
            out.push({ template_id: t.id, day: d, title: t.title, time: t.time_of_day?.slice(0, 5) ?? null });
        }
    }
    return out;
}
/**
 * Splits a single day's agenda items for the Week view so timed events, tasks,
 * reminders, workouts and bills stand out at the top while untimed daily habits
 * can be collapsed into a compact progress pill instead of flooding all 7 columns.
 */
export function partitionWeekDay(items) {
    const primary = [];
    const allDayHabits = [];
    for (const item of items) {
        if (item.kind === 'habit' && !item.time)
            allDayHabits.push(item);
        else
            primary.push(item);
    }
    primary.sort((a, b) => {
        const aTimed = a.time ? 0 : 1;
        const bTimed = b.time ? 0 : 1;
        return aTimed - bTimed || (a.time ?? '').localeCompare(b.time ?? '') || a.title.localeCompare(b.title, 'pt');
    });
    return {
        primary,
        allDayHabits,
        habitsDone: allDayHabits.filter((h) => h.done).length,
    };
}
const PRIORITY_RANK = { high: 0, medium: 1, low: 2 };
/**
 * Open, non-archived tasks that do not yet have a dedicated time slot
 * (neither a timed due_date nor a timeboxed event linked via task_id),
 * ordered by priority, earliest due date, then creation date.
 */
export function unscheduledTasks(tasks, events) {
    const boxed = new Set(events.map((e) => e.task_id).filter((id) => !!id));
    return tasks
        .filter((t) => !t.completed && !t.is_archived && !boxed.has(t.id) && (!t.due_date || t.due_all_day))
        .sort((a, b) => {
        const pr = PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
        if (pr !== 0)
            return pr;
        const ad = a.due_date ? toDay(new Date(a.due_date)) : '9999-99-99';
        const bd = b.due_date ? toDay(new Date(b.due_date)) : '9999-99-99';
        return ad.localeCompare(bd) || a.created_at.localeCompare(b.created_at);
    });
}
/** Builds ISO start/end timestamps for a timebox block on a local day. */
export function timeboxRange(day, startHHMM, durationMin) {
    const [y, m, d] = day.split('-').map(Number);
    const [hh, mm] = startHHMM.split(':').map(Number);
    const start = new Date(y, m - 1, d, hh, mm, 0, 0);
    const end = new Date(start.getTime() + Math.max(15, durationMin) * 60_000);
    return { start_at: start.toISOString(), end_at: end.toISOString() };
}
