import { addDays, toDay } from './dates';
export const PRIORITY_ORDER = { high: 0, medium: 1, low: 2 };
export const PRIORITY_LABEL = { high: 'Alta', medium: 'Média', low: 'Baixa' };
function dueDay(task) {
    return task.due_date ? toDay(new Date(task.due_date)) : null;
}
function byDueThenPriority(a, b) {
    const da = a.due_date ?? '9999';
    const db = b.due_date ?? '9999';
    if (da !== db)
        return da < db ? -1 : 1;
    return PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority];
}
/** Splits active tasks into the groups the task screens show. */
export function bucketTasks(tasks, now) {
    const today = toDay(now);
    const buckets = { overdue: [], today: [], upcoming: [], noDate: [], done: [] };
    for (const task of tasks) {
        if (task.is_archived)
            continue;
        if (task.completed) {
            buckets.done.push(task);
            continue;
        }
        const day = dueDay(task);
        if (!day)
            buckets.noDate.push(task);
        else if (day < today)
            buckets.overdue.push(task);
        else if (day === today)
            buckets.today.push(task);
        else
            buckets.upcoming.push(task);
    }
    for (const list of [buckets.overdue, buckets.today, buckets.upcoming, buckets.noDate]) {
        list.sort(byDueThenPriority);
    }
    buckets.done.sort((a, b) => (b.completed_at ?? '').localeCompare(a.completed_at ?? ''));
    return buckets;
}
export function taskStats(tasks, now) {
    const b = bucketTasks(tasks, now);
    const today = toDay(now);
    const open = [...b.overdue, ...b.today, ...b.upcoming, ...b.noDate];
    const openByPriority = { high: 0, medium: 0, low: 0 };
    for (const t of open)
        openByPriority[t.priority]++;
    const completedLast7 = Array.from({ length: 7 }, (_, i) => {
        const day = addDays(today, i - 6);
        return { day, count: b.done.filter((t) => t.completed_at && toDay(new Date(t.completed_at)) === day).length };
    });
    return {
        open: open.length,
        overdue: b.overdue.length,
        dueToday: b.today.length,
        completedToday: completedLast7[6].count,
        openByPriority,
        completedLast7,
    };
}
