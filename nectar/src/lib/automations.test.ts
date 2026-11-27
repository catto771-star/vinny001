import { describe, expect, it } from 'vitest';
import { nextRun, runTimeText, scheduleText } from './automations';

const a = (over: object) => ({ weekdays: [] as number[], time_of_day: '07:00:00', is_active: true, last_run_at: null as string | null, ...over });
// Wednesday 18 Nov 2026, 10:00 local.
const NOW = new Date(2026, 10, 18, 10, 0);

describe('schedule text', () => {
  it('names the days in plain words', () => {
    expect(scheduleText(a({}))).toBe('Todo dia às 07:00');
    expect(scheduleText(a({ weekdays: [5, 1, 2, 3, 4], time_of_day: '08:30' }))).toBe('Dias úteis às 08:30');
    expect(scheduleText(a({ weekdays: [6, 0] }))).toBe('Fins de semana às 07:00');
    expect(scheduleText(a({ weekdays: [0] }))).toBe('Dom às 07:00');
    expect(scheduleText(a({ weekdays: [1, 3, 5] }))).toBe('Seg, qua e sex às 07:00');
  });
});

describe('next run', () => {
  it('is later today when the time has not come', () => {
    expect(nextRun(a({ time_of_day: '18:00' }), NOW)).toEqual(new Date(2026, 10, 18, 18, 0));
  });
  it('is now when due today and not run yet', () => {
    expect(nextRun(a({}), NOW)).toEqual(NOW);
  });
  it('is the next matching day once it ran today', () => {
    expect(nextRun(a({ last_run_at: new Date(2026, 10, 18, 7, 2).toISOString() }), NOW)).toEqual(new Date(2026, 10, 19, 7, 0));
    expect(nextRun(a({ weekdays: [1], last_run_at: new Date(2026, 10, 16, 7, 0).toISOString() }), NOW)).toEqual(new Date(2026, 10, 23, 7, 0));
  });
  it('is none while paused', () => {
    expect(nextRun(a({ is_active: false }), NOW)).toBeNull();
  });
});

describe('run time text', () => {
  it('says just now for a run that happened, the next check for one that is due', () => {
    expect(runTimeText(new Date(2026, 10, 18, 9, 59, 40), NOW)).toBe('agora há pouco');
    expect(runTimeText(NOW, NOW)).toBe('na próxima verificação');
    expect(runTimeText(new Date(2026, 10, 18, 18, 0), NOW)).toBe('hoje, 18:00');
    expect(runTimeText(new Date(2026, 10, 19, 7, 0), NOW)).toBe('Qui, 19 de novembro, 07:00');
  });
});
