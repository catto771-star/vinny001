import { describe, expect, it } from 'vitest';
import {
  atRisk, bestStreak, completionRate, currentStreak, heatmap, isPerfectDay, monthConsistency, overallHeatmap, partOfDay, routineFor,
  startDay, weekdayRates, weeklyProgress, type Habit, type HabitCompletion,
} from './habits';

const TODAY = '2026-11-18'; // Wednesday; the week runs 15 (Sun) to 21 (Sat)
const habit = (over: Partial<Habit>): Habit => ({
  id: 'h', name: 'h', description: null, habit_type: 'boolean', unit: 'x', target_value: 1, monthly_goal: 30,
  schedule_days: null, schedule_time: null, color: '#000', is_archived: false, ...over,
});
const done = (habit_id: string, day: string, value = 1): HabitCompletion => ({ id: habit_id + day, habit_id, completed_date: day, value });
const gym = habit({ id: 'gym', name: 'Academia', frequency: 'weekly', times_per_week: 3 });

describe('weekly habits', () => {
  it('counts the times done in the week', () => {
    expect(weeklyProgress(gym, [done('gym', '2026-11-16'), done('gym', '2026-11-18'), done('gym', '2026-11-14')], TODAY)).toEqual({ done: 2, target: 3 });
  });
  it('stays on the routine until the weekly target is met, and on days it was done', () => {
    const two = [done('gym', '2026-11-16'), done('gym', '2026-11-17')];
    expect(routineFor([gym], TODAY, two).map((h) => h.id)).toEqual(['gym']);
    const three = [...two, done('gym', '2026-11-18')];
    expect(routineFor([gym], TODAY, three).map((h) => h.id)).toEqual(['gym']); // done today, still shown as done
    expect(routineFor([gym], '2026-11-19', three)).toEqual([]); // target met, off the routine
  });
  it('counts its streak in weeks, the current week once met', () => {
    const c = ['2026-11-02', '2026-11-04', '2026-11-06', '2026-11-09', '2026-11-11', '2026-11-13'].map((d) => done('gym', d));
    expect(currentStreak(gym, c, TODAY)).toBe(2);
    expect(currentStreak(gym, [...c, done('gym', '2026-11-15'), done('gym', '2026-11-16'), done('gym', '2026-11-17')], TODAY)).toBe(3);
    expect(currentStreak(gym, c.slice(3), TODAY)).toBe(1);
  });
  it('measures the month against the target spread over the days passed', () => {
    // 18 days of November passed: 3 x 18 / 7 = 7.7, expected 8.
    const c = ['2026-11-02', '2026-11-04', '2026-11-09', '2026-11-11'].map((d) => done('gym', d));
    expect(monthConsistency(gym, c, 2026, 11, TODAY)).toEqual({ done: 4, scheduled: 8, rate: 0.5 });
  });
  it('is left out of perfect days', () => {
    const read = habit({ id: 'read' });
    expect(isPerfectDay([read, gym], [done('read', TODAY)], TODAY)).toBe(true);
  });
});

describe('streaks and rates', () => {
  it('finds the longest run of scheduled days', () => {
    const h = habit({ id: 'a' });
    const c = ['2026-11-01', '2026-11-02', '2026-11-03', '2026-11-05', '2026-11-06'].map((d) => done('a', d));
    expect(bestStreak(h, c, TODAY)).toBe(3);
    expect(bestStreak(h, [], TODAY)).toBe(0);
  });
  it('finds the longest run of weeks for a weekly habit', () => {
    const c = ['2026-11-02', '2026-11-04', '2026-11-06', '2026-11-09', '2026-11-11', '2026-11-13'].map((d) => done('gym', d));
    expect(bestStreak(gym, c, TODAY)).toBe(2);
  });
  it('gives the share of the last days that were done', () => {
    const h = habit({ id: 'a', schedule_days: [1, 3, 5] });
    // Last 7 days (12 to 18 Nov): Mon 16 and Wed 18 due... plus Fri 13: 3 due, 2 done.
    expect(completionRate(h, [done('a', '2026-11-16'), done('a', '2026-11-18')], TODAY, 7)).toBeCloseTo(2 / 3);
    expect(completionRate(gym, [done('gym', '2026-11-16'), done('gym', '2026-11-17'), done('gym', '2026-11-18')], TODAY, 7)).toBe(1);
  });
  it('rates each weekday', () => {
    const h = habit({ id: 'a' });
    const r = weekdayRates([h], [done('a', '2026-11-18'), done('a', '2026-11-11')], TODAY, 2);
    expect(r[3]).toEqual({ weekday: 3, rate: 1 });
    expect(r[2]).toEqual({ weekday: 2, rate: 0 });
  });
});

describe('today', () => {
  it('flags habits whose streak would break today', () => {
    const a = habit({ id: 'a', name: 'Ler' });
    const b = habit({ id: 'b', name: 'Novo' });
    const c = [done('a', '2026-11-16'), done('a', '2026-11-17')];
    expect(atRisk([a, b], c, TODAY).map((h) => h.id)).toEqual(['a']);
    expect(atRisk([a], [...c, done('a', TODAY)], TODAY)).toEqual([]);
  });
  it('groups by part of the day', () => {
    expect([partOfDay('06:30'), partOfDay('12:00'), partOfDay('21:15'), partOfDay(null)]).toEqual(['Manhã', 'Tarde', 'Noite', 'Qualquer hora']);
  });
  it('builds a heatmap of whole weeks with each day state', () => {
    const h = habit({ id: 'a', schedule_days: [1, 3, 5] });
    const map = heatmap(h, [done('a', '2026-11-16')], TODAY, 2);
    expect(map).toHaveLength(2);
    expect(map[1][0]).toEqual({ day: '2026-11-15', state: 'off' });
    expect(map[1][1]).toEqual({ day: '2026-11-16', state: 'done' });
    expect(map[0][3].state).toBe('missed'); // Wed 11 Nov
    expect(map[1][4].state).toBe('future');
  });
});

describe('a habit counts only from when it started', () => {
  // Created on Tuesday 17 Nov at 10:00 local time.
  const fresh = habit({ id: 'f', created_at: new Date(2026, 10, 17, 10).toISOString() });
  it('starts on its creation day, or on an earlier logged day', () => {
    expect(startDay(fresh, [])).toBe('2026-11-17');
    expect(startDay(fresh, [done('f', '2026-11-10')])).toBe('2026-11-10');
    expect(startDay(habit({ id: 'old' }), [])).toBeNull();
  });
  it('is not due before it started', () => {
    expect(routineFor([fresh], '2026-11-16')).toEqual([]);
    expect(routineFor([fresh], '2026-11-17').map((h) => h.id)).toEqual(['f']);
  });
  it('measures the month only from the start', () => {
    expect(monthConsistency(fresh, [done('f', '2026-11-17'), done('f', '2026-11-18')], 2026, 11, TODAY)).toEqual({ done: 2, scheduled: 2, rate: 1 });
    const weekly = habit({ id: 'w', frequency: 'weekly', times_per_week: 7, created_at: new Date(2026, 10, 15, 9).toISOString() });
    expect(monthConsistency(weekly, [], 2026, 11, TODAY).scheduled).toBe(4); // 15 to 18 Nov
  });
  it('rates the last days only from the start', () => {
    expect(completionRate(fresh, [done('f', '2026-11-17'), done('f', '2026-11-18')], TODAY, 30)).toBe(1);
    const r = weekdayRates([fresh], [done('f', '2026-11-18')], TODAY, 2);
    expect(r[1].rate).toBeNull(); // Monday 16, before the start
    expect(r[3].rate).toBe(1);
  });
  it('leaves days before the start blank on the heatmap', () => {
    const map = heatmap(fresh, [], TODAY, 1);
    expect(map[0][1].state).toBe('off'); // Mon 16
    expect(map[0][2].state).toBe('missed'); // Tue 17
  });
  it('computes 0..4 intensity levels across all active habits in overallHeatmap', () => {
    const a = habit({ id: 'a' });
    const b = habit({ id: 'b' });
    const grid = overallHeatmap([a, b], [
      done('a', '2026-11-16'),
      done('a', '2026-11-17'),
      done('b', '2026-11-17'),
    ], TODAY, 2);
    expect(grid).toHaveLength(2);
    expect(grid[1][0]).toMatchObject({ day: '2026-11-15', done: 0, due: 2, level: 0, future: false });
    expect(grid[1][1]).toMatchObject({ day: '2026-11-16', done: 1, due: 2, level: 2, future: false });
    expect(grid[1][2]).toMatchObject({ day: '2026-11-17', done: 2, due: 2, level: 4, future: false });
    expect(grid[1][4]).toMatchObject({ day: '2026-11-19', future: true, level: 0 });
  });
});

