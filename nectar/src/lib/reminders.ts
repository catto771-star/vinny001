import { addDays, toDay, weekday, type Day } from './dates';

export interface Reminder {
  id: string;
  title: string;
  datetime: string;
  completed: boolean;
  priority: 'low' | 'medium' | 'high';
  alarm_enabled: boolean;
  recurring_template_id: string | null;
}

export interface ReminderTemplate {
  id: string;
  title: string;
  time_of_day: string; // 'HH:MM[:SS]'
  recurrence_days: number[];
  start_date: Day;
  end_date: Day | null;
  alarm_enabled: boolean;
  is_active: boolean;
}

/** Days in [from, to] on which a recurring reminder fires. */
export function occurrences(template: ReminderTemplate, from: Day, to: Day): Day[] {
  if (!template.is_active) return [];
  const out: Day[] = [];
  let day = from < template.start_date ? template.start_date : from;
  while (day <= to) {
    if (template.end_date && day > template.end_date) break;
    const days = template.recurrence_days;
    if (days.length === 0 || days.includes(weekday(day))) out.push(day);
    day = addDays(day, 1);
  }
  return out;
}

/**
 * Reminders a template still needs between two days: occurrences that do not
 * already have a reminder row created from the template.
 */
export function missingOccurrences(
  template: ReminderTemplate,
  existing: Reminder[],
  from: Day,
  to: Day,
): { day: Day; datetime: string }[] {
  const have = new Set(
    existing.filter((r) => r.recurring_template_id === template.id).map((r) => toDay(new Date(r.datetime))),
  );
  const [h, m] = template.time_of_day.split(':').map(Number);
  return occurrences(template, from, to)
    .filter((day) => !have.has(day))
    .map((day) => {
      const [y, mo, d] = day.split('-').map(Number);
      return { day, datetime: new Date(y, mo - 1, d, h, m).toISOString() };
    });
}

export interface ReminderPanel {
  overdue: Reminder[];
  today: Reminder[];
  thisWeek: Reminder[];
  later: Reminder[];
  done: Reminder[];
}

export function reminderPanel(reminders: Reminder[], now: Date): ReminderPanel {
  const today = toDay(now);
  const weekEnd = addDays(today, 7);
  const p: ReminderPanel = { overdue: [], today: [], thisWeek: [], later: [], done: [] };
  const sorted = [...reminders].sort((a, b) => a.datetime.localeCompare(b.datetime));
  for (const r of sorted) {
    if (r.completed) {
      p.done.push(r);
      continue;
    }
    const at = new Date(r.datetime);
    const day = toDay(at);
    if (at < now && day <= today) p.overdue.push(r);
    else if (day === today) p.today.push(r);
    else if (day <= weekEnd) p.thisWeek.push(r);
    else p.later.push(r);
  }
  p.done.reverse();
  return p;
}
