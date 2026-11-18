import { addDays, monthDays, weekday, type Day } from './dates';

export interface Habit {
  id: string;
  name: string;
  description: string | null;
  habit_type: 'boolean' | 'quantity' | 'duration' | 'measurable';
  unit: string;
  /** Null means any logged value counts as done. */
  target_value: number | null;
  monthly_goal: number;
  schedule_days: number[] | null;
  schedule_time: string | null;
  color: string;
  is_archived: boolean;
}

export interface HabitCompletion {
  id: string;
  habit_id: string;
  completed_date: Day;
  value: number;
}

/** A habit with no schedule_days is due every day. */
export function isScheduledOn(habit: Pick<Habit, 'schedule_days'>, day: Day): boolean {
  const days = habit.schedule_days;
  return !days || days.length === 0 || days.includes(weekday(day));
}

export function isDone(habit: Pick<Habit, 'target_value'>, completion: HabitCompletion | undefined): boolean {
  if (!completion) return false;
  return habit.target_value == null ? completion.value > 0 : completion.value >= habit.target_value;
}

export function completionsByDay(completions: HabitCompletion[]): Map<Day, HabitCompletion> {
  return new Map(completions.map((c) => [c.completed_date, c]));
}

/**
 * Consecutive scheduled days the habit was done, counting back from today.
 * Today counts only once it is done, so an unfinished today does not break
 * the streak. Unscheduled days are skipped.
 */
export function currentStreak(habit: Habit, completions: HabitCompletion[], today: Day): number {
  const done = completionsByDay(completions.filter((c) => c.habit_id === habit.id));
  let streak = 0;
  let day = today;
  for (let guard = 0; guard < 3660; guard++) {
    if (isScheduledOn(habit, day)) {
      const ok = isDone(habit, done.get(day));
      if (ok) streak++;
      else if (day !== today) break;
    }
    day = addDays(day, -1);
  }
  return streak;
}

/** Share of scheduled days so far this month that were done (0..1). */
export function monthConsistency(
  habit: Habit,
  completions: HabitCompletion[],
  year: number,
  month: number,
  today: Day,
): { done: number; scheduled: number; rate: number } {
  const done = completionsByDay(completions.filter((c) => c.habit_id === habit.id));
  let scheduled = 0;
  let count = 0;
  for (const day of monthDays(year, month)) {
    if (day > today) break;
    if (!isScheduledOn(habit, day)) continue;
    scheduled++;
    if (isDone(habit, done.get(day))) count++;
  }
  return { done: count, scheduled, rate: scheduled ? count / scheduled : 0 };
}

/** Habits due on a day, ordered by their scheduled time (untimed last). */
export function routineFor(habits: Habit[], day: Day): Habit[] {
  return habits
    .filter((h) => !h.is_archived && isScheduledOn(h, day))
    .sort((a, b) => (a.schedule_time ?? '99').localeCompare(b.schedule_time ?? '99'));
}

/** A day is perfect when every habit due on it was done. */
export function isPerfectDay(habits: Habit[], completions: HabitCompletion[], day: Day): boolean {
  const due = routineFor(habits, day);
  if (due.length === 0) return false;
  return due.every((h) => isDone(h, completions.find((c) => c.habit_id === h.id && c.completed_date === day)));
}
