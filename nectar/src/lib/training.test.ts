import { describe, expect, it } from 'vitest';
import {
  activeExerciseIds, cardioKcal, estimated1RM, exerciseProgression, formatPace, kcalPerMinute, lastWorkingSets, paceMinPerKm, personalRecords,
  strengthKcal, suggestNext, weekStart, weeklyStats, weeklyVolumeByMuscle, workoutSummary,
  type Exercise, type SetType, type Workout, type WorkoutSet,
} from './training';

const WORK: SetType = { id: 'work', name: 'Working set', drives_progression: true, counts_for_volume: true };
const FEED: SetType = { id: 'feed', name: 'Feeder set', drives_progression: false, counts_for_volume: false };
const TOP: SetType = { id: 'top', name: 'Top set', drives_progression: false, counts_for_volume: true };
const TYPES = new Map([WORK, FEED, TOP].map((t) => [t.id, t]));
const SETTINGS = { rep_min: 8, rep_max: 12, load_increment_kg: 2.5 };

let n = 0;
const set = (workout_id: string, exercise_id: string, load_kg: number, reps: number, set_type_id = 'work', effort: number | null = null): WorkoutSet =>
  ({ id: `s${n++}`, workout_id, exercise_id, set_type_id, position: n, load_kg, reps, rest_s: 120, effort });
const workout = (id: string, date: string, duration_min: number | null = 60): Workout => ({ id, date, title: null, duration_min });

describe('estimated1RM', () => {
  it('uses Epley and is limited to 1-15 reps', () => {
    expect(estimated1RM(100, 1)).toBe(100);
    expect(estimated1RM(100, 10)).toBe(133.3);
    expect(estimated1RM(100, 16)).toBeNull();
    expect(estimated1RM(0, 5)).toBeNull();
  });
});

describe('suggestNext (progression)', () => {
  it('raises the load when every set at the top load reached the rep max', () => {
    expect(suggestNext([{ load_kg: 80, reps: 12 }, { load_kg: 80, reps: 12 }], SETTINGS))
      .toMatchObject({ action: 'increase_load', load_kg: 82.5, reps: 8, sets: 2 });
  });
  it('asks for one more rep per set otherwise', () => {
    expect(suggestNext([{ load_kg: 80, reps: 10 }, { load_kg: 80, reps: 8 }], SETTINGS))
      .toMatchObject({ action: 'increase_reps', load_kg: 80, reps: [11, 9] });
  });
  it('writes loads in the Brazilian format in its reason', () => {
    expect(suggestNext([{ load_kg: 82.5, reps: 9 }], SETTINGS)!.reason).toContain('82,5 kg');
  });
  it('never targets more than 15 reps, even if the settings allow it', () => {
    const wide = { rep_min: 10, rep_max: 20, load_increment_kg: 2 };
    expect(suggestNext([{ load_kg: 20, reps: 14 }], wide)).toMatchObject({ action: 'increase_reps', reps: [15] });
    expect(suggestNext([{ load_kg: 20, reps: 15 }], wide)).toMatchObject({ action: 'increase_load', load_kg: 22 });
  });
  it('only looks at sets at the heaviest load', () => {
    expect(suggestNext([{ load_kg: 70, reps: 12 }, { load_kg: 80, reps: 9 }], SETTINGS))
      .toMatchObject({ action: 'increase_reps', load_kg: 80, reps: [10] });
  });
  it('suggests lowering the load when reps fell well below the range', () => {
    expect(suggestNext([{ load_kg: 80, reps: 5 }], SETTINGS)).toMatchObject({ action: 'decrease_load', load_kg: 77.5 });
  });
  it('has nothing to suggest without history', () => {
    expect(suggestNext([], SETTINGS)).toBeNull();
  });
});

describe('lastWorkingSets', () => {
  it('takes only working sets of the latest earlier session', () => {
    const ws = [workout('w1', '2026-11-10'), workout('w2', '2026-11-13'), workout('w3', '2026-11-18')];
    const sets = [set('w1', 'bench', 75, 12), set('w2', 'bench', 60, 10, 'feed'), set('w2', 'bench', 80, 10), set('w3', 'bench', 80, 11)];
    expect(lastWorkingSets('bench', sets, ws, TYPES, '2026-11-18').map((s) => s.load_kg)).toEqual([80]);
    expect(lastWorkingSets('bench', sets, ws, TYPES, '2026-11-18')[0].workout_id).toBe('w2');
  });
});

describe('records', () => {
  const ws = [workout('w1', '2026-11-10'), workout('w2', '2026-11-13')];
  const sets = [
    set('w1', 'bench', 80, 10), set('w1', 'bench', 80, 9), set('w1', 'bench', 120, 1, 'feed'),
    set('w2', 'bench', 85, 8), set('w2', 'bench', 85, 7),
  ];
  it('ignores feeder sets and finds the best load, 1RM and session volume', () => {
    const r = personalRecords(sets, ws, TYPES).get('bench')!;
    expect(r.maxLoad).toMatchObject({ load_kg: 85, reps: 8, date: '2026-11-13' });
    expect(r.best1RM).toMatchObject({ value: 107.7, date: '2026-11-13' });
    expect(r.bestSessionVolume).toEqual({ tonnage: 1520, date: '2026-11-10' });
  });
  it('lists the records a workout broke and sums its volume', () => {
    const s = workoutSummary(ws[1], sets, ws, TYPES);
    expect(s).toMatchObject({ sets: 2, reps: 15, tonnage: 1275, maxLoad: 85 });
    expect(s.records.map((r) => r.kind).sort()).toEqual(['1RM', 'carga']);
  });
  it('sets no records on the first session of an exercise', () => {
    expect(workoutSummary(ws[0], sets, ws, TYPES).records).toEqual([]);
  });
});

describe('weekly volume and dashboards', () => {
  const exercises = new Map<string, Exercise>([
    ['bench', { id: 'bench', name: 'Supino', muscle_group: 'peito', secondary_muscles: ['triceps'] }],
    ['squat', { id: 'squat', name: 'Agachamento', muscle_group: 'quadriceps', secondary_muscles: [] }],
  ]);
  it('finds the Monday of a week', () => {
    expect(weekStart('2026-11-18')).toBe('2026-11-16'); // Wednesday
    expect(weekStart('2026-11-22')).toBe('2026-11-16'); // Sunday
  });
  it('sums sets, reps and tonnage per primary muscle in the week', () => {
    const ws = [workout('a', '2026-11-16'), workout('b', '2026-11-19'), workout('old', '2026-11-12')];
    const sets = [set('a', 'bench', 80, 10), set('a', 'bench', 60, 12, 'feed'), set('b', 'squat', 100, 8), set('b', 'squat', 100, 8), set('old', 'bench', 80, 10)];
    expect(weeklyVolumeByMuscle('2026-11-16', sets, ws, exercises, TYPES)).toEqual([
      { muscle_group: 'quadriceps', sets: 2, reps: 16, tonnage: 1600 },
      { muscle_group: 'peito', sets: 1, reps: 10, tonnage: 800 },
    ]);
  });
  it('computes frequency, density, intensity and effort per week', () => {
    const ws = [workout('a', '2026-11-09', 50), workout('b', '2026-11-16', 40), workout('c', '2026-11-18', null)];
    const sets = [set('a', 'bench', 100, 10, 'work', 8), set('b', 'bench', 100, 10, 'work', 9), set('c', 'bench', 50, 10, 'work', 7)];
    const [w1, w2] = weeklyStats('2026-11-18', 2, sets, ws, TYPES);
    expect(w1).toMatchObject({ week: '2026-11-09', sessions: 1, tonnage: 1000, density: 20 });
    expect(w2).toMatchObject({ week: '2026-11-16', sessions: 2, sets: 2, tonnage: 1500, density: 25, avgEffort: 8 });
    // 100 kg x10 against a 133.3 kg 1RM is 75%; 50 kg is 37.5%.
    expect(w2.intensityPct).toBeCloseTo(56.3, 1);
  });
});

describe('cardio and energy', () => {
  it('computes pace and formats it', () => {
    expect(paceMinPerKm({ distance_km: 5, duration_s: 1500 })).toBe(5);
    expect(formatPace(5.5)).toBe('5:30/km');
    expect(paceMinPerKm({ distance_km: null, duration_s: 1500 })).toBeNull();
  });
  it('uses recorded calories or estimates them by MET and weight', () => {
    expect(cardioKcal({ cardio_type: 'corrida', duration_s: 1800, kcal: 400 }, 100)).toEqual({ kcal: 400, estimated: false });
    expect(cardioKcal({ cardio_type: 'caminhada', duration_s: 3600, kcal: null }, 100)).toEqual({ kcal: 350, estimated: true });
    expect(kcalPerMinute(400, 1800)).toBe(13.3);
  });
  it('estimates a lifting session by duration', () => {
    expect(strengthKcal(60, 100)).toBe(500);
    expect(strengthKcal(null, 100)).toBe(0);
  });
});

describe('exercise progression', () => {
  it('builds chronological max load, estimated 1RM and tonnage series, ignoring warm-up sets', () => {
    const ws = [workout('w2', '2026-11-18'), workout('w1', '2026-11-10')];
    const sets = [
      set('w1', 'bench', 60, 10, 'feed'),
      set('w1', 'bench', 80, 10, 'work'),
      set('w1', 'bench', 80, 8, 'work'),
      set('w2', 'bench', 85, 8, 'work'),
      set('w2', 'squat', 100, 6, 'work'),
    ];
    const prog = exerciseProgression('bench', sets, ws, TYPES);
    expect(prog).toHaveLength(2);
    expect(prog[0]).toMatchObject({ date: '2026-11-10', maxLoad: 80, topReps: 10, best1RM: 106.7, tonnage: 1440, sets: 2 });
    expect(prog[1]).toMatchObject({ date: '2026-11-18', maxLoad: 85, topReps: 8, best1RM: 107.7, tonnage: 680, sets: 1 });
    expect(activeExerciseIds(sets, ws, TYPES)).toEqual(['bench', 'squat']);
  });
});

