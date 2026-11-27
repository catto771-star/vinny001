import { describe, expect, it } from 'vitest';
import {
  computeFastingStatus,
  formatFastingDuration,
  metabolicStageForHours,
  summarizeFasts,
} from './fasting';

describe('intermittent fasting engine', () => {
  it('computes live elapsed/remaining time, expected end preview, and metabolic stage', () => {
    const status = computeFastingStatus(
      {
        started_at: '2026-11-24T22:00:00.000Z',
        ended_at: null,
        target_hours: 16,
      },
      new Date('2026-11-25T10:30:00.000Z'),
    );
    expect(status.isActive).toBe(true);
    expect(status.elapsedHours).toBe(12.5);
    expect(status.pct).toBe(78);
    expect(status.goalReached).toBe(false);
    expect(status.expectedEndAt.toISOString()).toBe('2026-11-25T14:00:00.000Z');
    expect(status.stage.id).toBe('fat_burning');
    expect(formatFastingDuration(status.remainingMs)).toBe('3h 30min');
    expect(formatFastingDuration(status.elapsedMs, true)).toBe('12:30:00');
  });

  it('transitions metabolic stages up to deep ketosis and summarizes completed fasts', () => {
    expect(metabolicStageForHours(2).id).toBe('fed');
    expect(metabolicStageForHours(17).id).toBe('ketosis');
    expect(metabolicStageForHours(26).id).toBe('deep_ketosis');

    const summary = summarizeFasts([
      {
        id: '1',
        protocol: '16:8',
        target_hours: 16,
        started_at: '2026-11-23T20:00:00.000Z',
        ended_at: '2026-11-24T12:00:00.000Z',
        notes: null,
      },
      {
        id: '2',
        protocol: '18:6',
        target_hours: 18,
        started_at: '2026-11-24T20:00:00.000Z',
        ended_at: '2026-11-25T14:00:00.000Z',
        notes: null,
      },
    ]);
    expect(summary.completedCount).toBe(2);
    expect(summary.averageHours).toBe(17);
    expect(summary.longestHours).toBe(18);
  });
});
