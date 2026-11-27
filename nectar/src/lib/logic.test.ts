import { describe, expect, it } from 'vitest';
import { addDays, toDay, weekday } from './dates';
import { bucketTasks, taskStats, type Task } from './tasks';
import { currentStreak, isPerfectDay, monthConsistency, routineFor, type Habit, type HabitCompletion } from './habits';
import { missingOccurrences, occurrences, reminderPanel, type Reminder, type ReminderTemplate } from './reminders';

const NOW = new Date(2026, 10, 18, 9, 0); // Wed 18 Nov 2026, 09:00 local
const TODAY = toDay(NOW);

function task(over: Partial<Task>): Task {
  return {
    id: Math.random().toString(36), title: 't', description: null, status: 'pending', completed: false,
    completed_at: null, priority: 'medium', due_date: null, due_all_day: false, tags: [], is_archived: false,
    created_at: NOW.toISOString(), ...over,
  };
}

function habit(over: Partial<Habit>): Habit {
  return {
    id: 'h1', name: 'h', description: null, habit_type: 'boolean', unit: 'vezes', target_value: 1,
    monthly_goal: 30, schedule_days: null, schedule_time: null, color: '#000', is_archived: false, ...over,
  };
}

const done = (habit_id: string, day: string, value = 1): HabitCompletion => ({ id: day + habit_id, habit_id, completed_date: day, value });

describe('dates', () => {
  it('adds days across a month boundary', () => {
    expect(addDays('2026-11-30', 1)).toBe('2026-12-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });
  it('knows 18 Nov 2026 is a Wednesday', () => {
    expect(weekday(TODAY)).toBe(3);
  });
});

describe('tasks', () => {
  it('groups tasks by due day and ignores archived ones', () => {
    const b = bucketTasks([
      task({ title: 'late', due_date: new Date(2026, 10, 17, 10).toISOString() }),
      task({ title: 'today', due_date: new Date(2026, 10, 18, 20).toISOString() }),
      task({ title: 'later', due_date: new Date(2026, 10, 25).toISOString() }),
      task({ title: 'free' }),
      task({ title: 'done', completed: true, completed_at: NOW.toISOString() }),
      task({ title: 'gone', is_archived: true }),
    ], NOW);
    expect(b.overdue.map((t) => t.title)).toEqual(['late']);
    expect(b.today.map((t) => t.title)).toEqual(['today']);
    expect(b.upcoming.map((t) => t.title)).toEqual(['later']);
    expect(b.noDate.map((t) => t.title)).toEqual(['free']);
    expect(b.done.map((t) => t.title)).toEqual(['done']);
  });
  it('orders same-day tasks by priority', () => {
    const due = new Date(2026, 10, 18, 12).toISOString();
    const b = bucketTasks([task({ title: 'low', priority: 'low', due_date: due }), task({ title: 'high', priority: 'high', due_date: due })], NOW);
    expect(b.today.map((t) => t.title)).toEqual(['high', 'low']);
  });
  it('counts open tasks and completions of the last week', () => {
    const s = taskStats([
      task({ priority: 'high' }),
      task({ completed: true, completed_at: NOW.toISOString() }),
      task({ completed: true, completed_at: new Date(2026, 10, 15).toISOString() }),
    ], NOW);
    expect(s.open).toBe(1);
    expect(s.openByPriority.high).toBe(1);
    expect(s.completedToday).toBe(1);
    expect(s.completedLast7.reduce((n, d) => n + d.count, 0)).toBe(2);
  });
});

describe('habits', () => {
  it('counts a streak back from yesterday while today is still open', () => {
    const h = habit({});
    const c = [done('h1', '2026-11-15'), done('h1', '2026-11-16'), done('h1', '2026-11-17')];
    expect(currentStreak(h, c, TODAY)).toBe(3);
    expect(currentStreak(h, [...c, done('h1', TODAY)], TODAY)).toBe(4);
  });
  it('skips unscheduled days without breaking the streak', () => {
    const h = habit({ schedule_days: [1, 3] }); // Mon and Wed
    const c = [done('h1', '2026-11-11'), done('h1', '2026-11-16')]; // Wed 11, Mon 16
    expect(currentStreak(h, c, TODAY)).toBe(2);
  });
  it('needs the target value for a quantity habit', () => {
    const h = habit({ habit_type: 'quantity', target_value: 8 });
    expect(currentStreak(h, [done('h1', '2026-11-17', 5)], TODAY)).toBe(0);
    expect(currentStreak(h, [done('h1', '2026-11-17', 8)], TODAY)).toBe(1);
  });
  it('counts any logged value for a habit without a target', () => {
    const h = habit({ habit_type: 'measurable', target_value: null, unit: 'km' });
    expect(currentStreak(h, [done('h1', '2026-11-17', 0.5)], TODAY)).toBe(1);
  });
  it('measures this month only up to today', () => {
    const h = habit({});
    const r = monthConsistency(h, [done('h1', '2026-11-01'), done('h1', '2026-11-02')], 2026, 11, TODAY);
    expect(r.scheduled).toBe(18);
    expect(r.done).toBe(2);
  });
  it('builds the day routine by time and checks perfect days', () => {
    const a = habit({ id: 'a', schedule_time: '07:00' });
    const b = habit({ id: 'b', schedule_time: '05:30' });
    const off = habit({ id: 'c', schedule_days: [0] });
    expect(routineFor([a, b, off], TODAY).map((h) => h.id)).toEqual(['b', 'a']);
    expect(isPerfectDay([a, b, off], [done('a', TODAY), done('b', TODAY)], TODAY)).toBe(true);
    expect(isPerfectDay([a, b], [done('a', TODAY)], TODAY)).toBe(false);
  });
});

describe('reminders', () => {
  const tpl: ReminderTemplate = {
    id: 'r', title: 'Vitamina', time_of_day: '08:00', recurrence_days: [1, 3, 5], start_date: '2026-11-01',
    end_date: null, alarm_enabled: false, is_active: true,
  };
  it('lists the matching weekdays of a range', () => {
    expect(occurrences(tpl, '2026-11-16', '2026-11-22')).toEqual(['2026-11-16', '2026-11-18', '2026-11-20']);
  });
  it('skips occurrences that already have a reminder', () => {
    const existing: Reminder[] = [{ id: 'x', title: 'Vitamina', datetime: new Date(2026, 10, 16, 8).toISOString(), completed: true, priority: 'medium', alarm_enabled: false, recurring_template_id: 'r' }];
    expect(missingOccurrences(tpl, existing, '2026-11-16', '2026-11-18').map((o) => o.day)).toEqual(['2026-11-18']);
  });
  it('splits reminders into overdue, today and later', () => {
    const r = (id: string, d: Date, completed = false): Reminder => ({ id, title: id, datetime: d.toISOString(), completed, priority: 'medium', alarm_enabled: false, recurring_template_id: null });
    const p = reminderPanel([
      r('late', new Date(2026, 10, 18, 7)), r('soon', new Date(2026, 10, 18, 15)),
      r('week', new Date(2026, 10, 21, 9)), r('far', new Date(2026, 11, 20)), r('ok', new Date(2026, 10, 17), true),
    ], NOW);
    expect([p.overdue, p.today, p.thisWeek, p.later, p.done].map((l) => l.map((x) => x.id))).toEqual([['late'], ['soon'], ['week'], ['far'], ['ok']]);
  });
});
