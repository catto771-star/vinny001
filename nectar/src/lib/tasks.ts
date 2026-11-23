import { addDays, toDay, type Day } from './dates';

export type Priority = 'low' | 'medium' | 'high';

export interface Task {
  id: string;
  title: string;
  description: string | null;
  status: 'pending' | 'in_progress' | 'completed';
  completed: boolean;
  completed_at: string | null;
  priority: Priority;
  due_date: string | null;
  due_all_day: boolean;
  tags: string[];
  is_archived: boolean;
  created_at: string;
}

export interface TaskBuckets {
  overdue: Task[];
  today: Task[];
  upcoming: Task[];
  noDate: Task[];
  done: Task[];
}

export const PRIORITY_ORDER: Record<Priority, number> = { high: 0, medium: 1, low: 2 };
export const PRIORITY_LABEL: Record<Priority, string> = { high: 'Alta', medium: 'Média', low: 'Baixa' };

function dueDay(task: Task): Day | null {
  return task.due_date ? toDay(new Date(task.due_date)) : null;
}

function byDueThenPriority(a: Task, b: Task): number {
  const da = a.due_date ?? '9999';
  const db = b.due_date ?? '9999';
  if (da !== db) return da < db ? -1 : 1;
  return PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority];
}

/** Splits active tasks into the groups the task screens show. */
export function bucketTasks(tasks: Task[], now: Date): TaskBuckets {
  const today = toDay(now);
  const buckets: TaskBuckets = { overdue: [], today: [], upcoming: [], noDate: [], done: [] };
  for (const task of tasks) {
    if (task.is_archived) continue;
    if (task.completed) {
      buckets.done.push(task);
      continue;
    }
    const day = dueDay(task);
    if (!day) buckets.noDate.push(task);
    else if (day < today) buckets.overdue.push(task);
    else if (day === today) buckets.today.push(task);
    else buckets.upcoming.push(task);
  }
  for (const list of [buckets.overdue, buckets.today, buckets.upcoming, buckets.noDate]) {
    list.sort(byDueThenPriority);
  }
  buckets.done.sort((a, b) => (b.completed_at ?? '').localeCompare(a.completed_at ?? ''));
  return buckets;
}

export interface TaskStats {
  open: number;
  overdue: number;
  dueToday: number;
  completedToday: number;
  openByPriority: Record<Priority, number>;
  /** Tasks completed on each of the last 7 days, oldest first. */
  completedLast7: { day: Day; count: number }[];
}

export function taskStats(tasks: Task[], now: Date): TaskStats {
  const b = bucketTasks(tasks, now);
  const today = toDay(now);
  const open = [...b.overdue, ...b.today, ...b.upcoming, ...b.noDate];
  const openByPriority: Record<Priority, number> = { high: 0, medium: 0, low: 0 };
  for (const t of open) openByPriority[t.priority]++;
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
