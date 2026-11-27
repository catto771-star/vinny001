import { describe, expect, it } from 'vitest';
import { computeCrossModuleSynergy, findMatchingTrainingHabits } from './crossModuleIntelligence';

describe('findMatchingTrainingHabits', () => {
  const habits = [
    { id: 'h1', name: 'Ir para a academia' },
    { id: 'h2', name: 'Ler 20 páginas' },
    { id: 'h3', name: 'Corrida matinal' },
    { id: 'h4', name: 'Treino arquivado', is_archived: true },
    { id: 'h5', name: 'Meta especial' },
  ];

  it('matches workout habits and honors explicit linkedHabitId while skipping archived habits', () => {
    const matched = findMatchingTrainingHabits(habits, 'workout', 'h5');
    expect(matched.map((m) => m.id)).toEqual(['h5', 'h1']);
  });

  it('matches cardio habits for cardio sessions', () => {
    const matched = findMatchingTrainingHabits(habits, 'cardio');
    expect(matched.map((m) => m.id)).toContain('h3');
    expect(matched.map((m) => m.id)).not.toContain('h2');
  });
});

describe('computeCrossModuleSynergy', () => {
  it('detects post-workout protein gap, sweat hydration adjustment, fasted training, and muscle imbalance', () => {
    const nowMs = Date.parse('2026-11-25T14:00:00Z');
    const report = computeCrossModuleSynergy({
      today: '2026-11-25',
      trainedToday: true,
      burnedKcalToday: 520,
      trainingMinutesToday: 60,
      consumedKcal: 1100,
      targetKcal: 2600,
      totalExpenditureKcal: 2750,
      consumedProteinG: 65,
      targetProteinG: 170,
      weightKg: 82,
      drunkWaterMl: 1200,
      baseWaterGoalMl: 2500,
      activeFastStartedAt: '2026-11-25T00:00:00Z', // 14h fast
      nowMs,
      completedTrainingHabitsCount: 1,
      pushPullRatio: 2.1,
    });

    expect(report.sweatBonusMl).toBe(500);
    expect(report.adjustedWaterGoalMl).toBe(3000);
    expect(report.proteinGapG).toBe(105);
    expect(report.fastedHoursAtWorkout).toBe(14);
    const ids = report.insights.map((i) => i.id);
    expect(ids).toContain('post-workout-protein');
    expect(ids).toContain('sweat-hydration');
    expect(ids).toContain('fasted-training');
    expect(ids).toContain('habit-synced');
    expect(ids).toContain('muscle-imbalance');
  });

  it('surfaces busy agenda + scheduled routine insight on high-task rest/pending days', () => {
    const report = computeCrossModuleSynergy({
      today: '2026-11-25',
      trainedToday: false,
      scheduledSessionLabel: 'Treino A · Push',
      burnedKcalToday: 0,
      trainingMinutesToday: 0,
      consumedKcal: 1800,
      targetKcal: 2200,
      totalExpenditureKcal: 2150,
      consumedProteinG: 150,
      targetProteinG: 160,
      weightKg: 80,
      drunkWaterMl: 2300,
      baseWaterGoalMl: 2500,
      dueTasksTodayCount: 7,
    });
    const sched = report.insights.find((i) => i.id === 'scheduled-routine-ready')!;
    expect(sched.detail).toContain('7 tarefas pendentes');
    expect(report.synergyScore).toBeGreaterThan(60);
  });
});
