import { describe, expect, it } from 'vitest';
import { currentValue, goalPace, goalProgress, goalSeries, type Goal, type GoalEntry } from './goals';
import type { Habit } from './habits';

const TODAY = '2026-11-18';
const goal = (over: Partial<Goal>): Goal => ({
  id: 'g', title: 'Meta', description: null, goal_type: 'custom', status: 'active', unit: '', start_value: 0, target_value: 100,
  measure: 'sum', start_date: '2026-11-01', target_date: '2026-12-01', linked_habit_id: null, linked_project_id: null, linked_bank_id: null,
  created_at: '', ...over,
});
const entry = (date: string, value: number, goal_id = 'g'): GoalEntry => ({ id: date + value, goal_id, date, value, note: null });

describe('current value', () => {
  it('adds up entries from the start value, or takes the latest reading', () => {
    expect(currentValue(goal({ start_value: 10 }), { entries: [entry('2026-11-02', 5), entry('2026-11-03', 7), entry('2026-11-03', 1, 'x')] })).toBe(22);
    expect(currentValue(goal({ measure: 'last', start_value: 92 }), { entries: [entry('2026-11-10', 89), entry('2026-11-05', 91)] })).toBe(89);
    expect(currentValue(goal({ measure: 'last', start_value: 92 }), { entries: [] })).toBe(92);
  });
  it('follows the linked project, account or habit', () => {
    expect(currentValue(goal({ goal_type: 'project', linked_project_id: 'p' }), { entries: [], projectPct: 40 })).toBe(40);
    expect(currentValue(goal({ goal_type: 'financial', linked_bank_id: 'b' }), { entries: [entry('2026-11-02', 99)], bankBalance: 1500 })).toBe(1500);
    expect(currentValue(goal({ goal_type: 'financial' }), { entries: [entry('2026-11-02', 300), entry('2026-11-09', 200)] })).toBe(500);
    const habit = { id: 'h', target_value: 1 } as Habit;
    const c = (d: string, value = 1) => ({ id: d, habit_id: 'h', completed_date: d, value });
    expect(currentValue(goal({ goal_type: 'habit', linked_habit_id: 'h' }), {
      entries: [], habits: [habit], completions: [c('2026-10-31'), c('2026-11-01'), c('2026-11-05'), c('2026-11-06', 0), c('2026-12-02')],
    })).toBe(2);
  });
});

describe('progress', () => {
  it('measures the way from start to target, also downward', () => {
    expect(goalProgress(goal({}), 25)).toBe(0.25);
    expect(goalProgress(goal({ measure: 'last', start_value: 92, target_value: 82 }), 87)).toBe(0.5);
    expect(goalProgress(goal({ measure: 'last', start_value: 92, target_value: 82 }), 95)).toBe(0);
    expect(goalProgress(goal({}), 130)).toBe(1);
    expect(goalProgress(goal({ target_value: null }), 50)).toBe(0);
    expect(goalProgress(goal({ goal_type: 'project', target_value: null }), 60)).toBe(0.6);
  });
  it('counts what was already saved when adding up', () => {
    // R$ 1.000 already saved toward R$ 10.000 is 10%, not 0%.
    expect(goalProgress(goal({ goal_type: 'financial', start_value: 1000, target_value: 10000 }), 1000)).toBe(0.1);
    expect(goalProgress(goal({ start_value: 2, target_value: 12 }), 3)).toBe(0.25);
  });
});

describe('pace', () => {
  // 17 of 30 days gone: 57% expected.
  it('says ahead, on pace or behind against the time gone by', () => {
    expect(goalPace(goal({}), 57, TODAY).pace).toBe('on');
    expect(goalPace(goal({}), 80, TODAY).pace).toBe('ahead');
    expect(goalPace(goal({}), 30, TODAY).pace).toBe('behind');
    expect(goalPace(goal({ target_date: null }), 30, TODAY).pace).toBe('open');
    expect(goalPace(goal({ target_date: '2026-11-10' }), 30, TODAY).pace).toBe('late');
    expect(goalPace(goal({}), 100, TODAY).pace).toBe('done');
  });
  it('tells what is needed per week and when the current rate gets there', () => {
    const p = goalPace(goal({}), 34, TODAY);
    expect(p.daysLeft).toBe(13);
    expect(p.perWeek).toBeCloseTo(66 / (13 / 7));
    expect(p.projected).toBe('2026-12-21'); // 17 days for 34%: 50 days for all
  });
});

describe('series', () => {
  it('builds a running total, one point per day', () => {
    expect(goalSeries(goal({ start_value: 10 }), [entry('2026-11-03', 2), entry('2026-11-02', 5), entry('2026-11-03', 1)]))
      .toEqual([{ date: '2026-11-02', value: 15 }, { date: '2026-11-03', value: 18 }]);
    expect(goalSeries(goal({ measure: 'last' }), [entry('2026-11-02', 91), entry('2026-11-09', 89)]))
      .toEqual([{ date: '2026-11-02', value: 91 }, { date: '2026-11-09', value: 89 }]);
  });
});
