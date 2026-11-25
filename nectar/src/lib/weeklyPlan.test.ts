import { describe, expect, it } from 'vitest';
import {
  confrontWeek,
  createDefaultWeeklyPlan,
  isPlanningDay,
  monWeekOf,
  targetWeekStartForPlanning,
} from './weeklyPlan';

describe('weeklyPlan helpers', () => {
  it('computes Monday-to-Sunday weeks correctly for any weekday', () => {
    // 2026-11-25 is Wednesday -> Mon is 2026-11-23, Sun is 2026-11-29
    const w = monWeekOf('2026-11-25');
    expect(w).toHaveLength(7);
    expect(w[0]).toBe('2026-11-23');
    expect(w[6]).toBe('2026-11-29');

    // Sunday 2026-11-29 belongs to the same Mon-Sun week
    expect(monWeekOf('2026-11-29')[0]).toBe('2026-11-23');
    // Monday 2026-11-30 starts the next week
    expect(monWeekOf('2026-11-30')[0]).toBe('2026-11-30');
  });

  it('targets the upcoming week when today is Sunday and planning day is Sunday', () => {
    // 2026-11-29 is Sunday (0)
    expect(isPlanningDay('2026-11-29', 0)).toBe(true);
    expect(targetWeekStartForPlanning('2026-11-29', 0)).toBe('2026-11-30');
    // On Wednesday (3) when planning day is Sunday (0), points to current week
    expect(isPlanningDay('2026-11-25', 0)).toBe(false);
    expect(targetWeekStartForPlanning('2026-11-25', 0)).toBe('2026-11-23');
  });

  it('confronts planned targets against actual logs and flags deviations', () => {
    const plan = createDefaultWeeklyPlan('2026-11-23', {
      workoutsTarget: 4,
      cardioTarget: 2,
      kcalDailyTarget: 2000,
      proteinDailyTarget: 150,
      dietDaysTarget: 5,
      weeklyBudget: 500,
      tasksTarget: 8,
      habitsPctTarget: 80,
    });

    const result = confrontWeek(
      plan,
      {
        workouts: [
          { date: '2026-11-23', name: 'Treino A', duration_min: 55 },
          { date: '2026-11-24', name: 'Treino B', duration_min: 60 },
        ],
        cardio: [{ date: '2026-11-25', activity: 'Corrida', duration_min: 30 }],
        dailyKcal: {
          '2026-11-23': 2050,
          '2026-11-24': 1950,
          '2026-11-25': 2600,
        },
        dailyProtein: {
          '2026-11-23': 110,
          '2026-11-24': 115,
          '2026-11-25': 120,
        },
        dailyWaterMl: {
          '2026-11-23': 2500,
          '2026-11-24': 2400,
        },
        dailySpend: {
          '2026-11-23': 220,
          '2026-11-24': 200,
          '2026-11-25': 180,
        },
        tasksDone: 5,
        habitsByDay: {
          '2026-11-23': { done: 4, due: 5 },
          '2026-11-24': { done: 5, due: 5 },
          '2026-11-25': { done: 3, due: 5 },
        },
      },
      '2026-11-25',
    );

    expect(result.daysElapsed).toBe(3);
    expect(result.totalSpent).toBe(600);
    expect(result.dietDaysOnTarget).toBe(2); // 2050 & 1950 within ±12%, 2600 is over
    expect(result.avgProtein).toBe(115);

    const gastos = result.pillars.find((p) => p.id === 'gastos');
    expect(gastos?.status).toBe('over');
    expect(result.deviations.some((d) => d.tone === 'danger' && d.text.includes('teto semanal'))).toBe(true);
    expect(result.deviations.some((d) => d.tone === 'warn' && d.text.includes('Proteína'))).toBe(true);

    // Day-by-day rows
    expect(result.days[0].workoutMet).toBe(true); // Mon planned Treino A, logged 1
    expect(result.days[2].isToday).toBe(true);
    expect(result.days[3].isFuture).toBe(true);
  });

  it('marks future weeks as pending with zero elapsed days', () => {
    const plan = createDefaultWeeklyPlan('2026-11-30');
    const result = confrontWeek(
      plan,
      {
        workouts: [],
        cardio: [],
        dailyKcal: {},
        dailyProtein: {},
        dailyWaterMl: {},
        dailySpend: {},
        tasksDone: 0,
        habitsByDay: {},
      },
      '2026-11-25',
    );
    expect(result.daysElapsed).toBe(0);
    expect(result.overallScore).toBe(0);
    expect(result.pillars.every((p) => p.status === 'pending')).toBe(true);
  });
});
