import { describe, expect, it } from 'vitest';
import { mapExport } from './nectar-map.mjs';

const data = {
  tasks: [{ id: 't1', title: 'A', status: 'feito', priority: 'média', completed: true, tags: [], user_id: 'old', project: [] }],
  habits: [{ id: 'h1', name: 'Correr', habit_type: 'measurable', unit: 'km', target_value: null, schedule_days: null, metric_config: null, color: null,
    habit_completions: [{ id: 'c1', completed_date: '2026-11-01', metric_values: { value: 5.2 } }] }],
  reminders: [{ id: 'r1', title: 'R', datetime: '2026-11-18T09:00:00Z', priority: 'alta', completed: false }],
};

describe('mapExport', () => {
  const out = Object.fromEntries(mapExport(data, 'me'));
  it('translates Portuguese status and priority values', () => {
    expect(out.tasks[0]).toMatchObject({ status: 'completed', priority: 'medium', completed: true, user_id: 'me' });
    expect(out.reminders[0].priority).toBe('high');
  });
  it('drops columns the new schema does not have', () => {
    expect(out.tasks[0]).not.toHaveProperty('project');
  });
  it('keeps measurable habits without a target and reads the measured value', () => {
    expect(out.habits[0]).toMatchObject({ habit_type: 'measurable', target_value: null, schedule_days: null, metric_config: {} });
    expect(out.habit_completions[0]).toMatchObject({ habit_id: 'h1', value: 5.2, user_id: 'me' });
  });
});
