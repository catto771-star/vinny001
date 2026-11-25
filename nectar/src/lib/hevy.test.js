import { describe, expect, it } from 'vitest';
import { analyzeMuscleSymmetry, buildTrainingCalendarMonth, calculatePlatesPerSide, classifySetIndicator, computeWeeklyTrainingStreak, dailyTrainingBurn, estimateSetsDurationMinutes, exportWorkoutsHevyCsv, formatSessionNotes, formatSetNotes, formatWorkoutNotes, generateWarmupRamp, hevy1RM, numberSetsLikeHevy, parseHevyOrStrongCsv, parseSessionNotes, parseSetNotes, parseWorkoutNotes, PRESET_PROGRAMS, weightedMuscleDistribution, workoutKcal, } from './hevy';
const WORK = { id: 'work', name: 'Working set', drives_progression: true, counts_for_volume: true };
const WARM = { id: 'warm', name: 'Aquecimento', drives_progression: false, counts_for_volume: false };
const DROP = { id: 'drop', name: 'Drop set', drives_progression: false, counts_for_volume: true };
const FAIL = { id: 'fail', name: 'Falha', drives_progression: true, counts_for_volume: true };
const TYPES = new Map([WORK, WARM, DROP, FAIL].map((t) => [t.id, t]));
describe('hevy1RM (1..30 rep percentage table)', () => {
    it('computes exact Hevy percentage 1RM up to 30 reps and caps >30 at 0.50', () => {
        expect(hevy1RM(100, 1)).toBe(100);
        expect(hevy1RM(81, 8)).toBe(100); // 81 / 0.81 = 100
        expect(hevy1RM(75, 10)).toBe(100); // 75 / 0.75 = 100
        expect(hevy1RM(60, 20)).toBe(100); // 60 / 0.60 = 100
        expect(hevy1RM(50, 35)).toBe(100); // >30 uses 0.50
        expect(hevy1RM(0, 10)).toBeNull();
    });
});
describe('set indicators and Hevy numbering', () => {
    it('numbers normal & failure sets sequentially while skipping warmup and dropset', () => {
        const seq = numberSetsLikeHevy(['warmup', 'warmup', 'normal', 'normal', 'failure', 'dropset']);
        expect(seq.map((s) => s.badge)).toEqual(['W', 'W', '1', '2', 'F', 'D']);
    });
    it('classifies set types by Portuguese and English names', () => {
        expect(classifySetIndicator('Aquecimento')).toBe('warmup');
        expect(classifySetIndicator('Drop set')).toBe('dropset');
        expect(classifySetIndicator('Falha')).toBe('failure');
        expect(classifySetIndicator('Working set')).toBe('normal');
    });
    it('round-trips structured workout, set, and routine-folder notes cleanly', () => {
        const wRaw = formatWorkoutNotes({ modality: 'funcional', manualKcal: 480, cleanNotes: 'Ótimo ritmo' });
        expect(parseWorkoutNotes(wRaw)).toEqual({ modality: 'funcional', manualKcal: 480, cleanNotes: 'Ótimo ritmo' });
        const sRaw = formatSetNotes({ superset: 'a', indicator: 'failure', cleanNotes: 'Pausa 2s' });
        expect(parseSetNotes(sRaw)).toEqual({ superset: 'A', indicator: 'failure', cleanNotes: 'Pausa 2s' });
        const fRaw = formatSessionNotes({ folder: 'PPL Hipertrofia', cleanNotes: 'Foco peito' });
        expect(parseSessionNotes(fRaw)).toEqual({ folder: 'PPL Hipertrofia', cleanNotes: 'Foco peito' });
    });
});
describe('estimateSetsDurationMinutes & workoutKcal (multi-modality calorie burn)', () => {
    it('estimates duration as 45s/set + rest_s, adding 0s extra rest on dropsets', () => {
        // 2 normal sets (45+90 = 135s each = 270s) + 1 dropset (45+0 = 45s) = 315s -> 5 min
        expect(estimateSetsDurationMinutes([
            { rest_s: 90, indicator: 'normal' },
            { rest_s: 90, indicator: 'normal' },
            { rest_s: 90, indicator: 'dropset' },
        ])).toBe(5);
    });
    it('preserves exact 5.0 MET baseline when duration-only strength workout has no sets', () => {
        const res = workoutKcal({ duration_min: 60 }, [], TYPES, 80);
        expect(res).toMatchObject({ kcal: 400, estimated: true, durationMin: 60, met: 5.0, modality: 'musculacao' });
    });
    it('dynamically increases burn for dense heavy sets, high RPE, supersets, or HIIT modality', () => {
        const denseSets = Array.from({ length: 12 }, (_, i) => ({
            load_kg: 100,
            reps: 10,
            rest_s: 90,
            effort: 9,
            set_type_id: 'work',
            notes: i < 4 ? '[ss:A]' : null,
        }));
        const dense = workoutKcal({ duration_min: 45 }, denseSets, TYPES, 80);
        const light = workoutKcal({ duration_min: 45, notes: '[mod:mobilidade]' }, [], TYPES, 80);
        expect(dense.kcal).toBeGreaterThan(350);
        expect(dense.met).toBeGreaterThan(5.0);
        expect(light.kcal).toBe(180); // 3.0 MET * 80 * 0.75
    });
    it('infers duration from sets when duration_min is null and respects manual kcal override', () => {
        const inferred = workoutKcal({ duration_min: null }, [{ load_kg: 80, reps: 10, rest_s: 120, effort: 8, set_type_id: 'work' }], TYPES, 80);
        expect(inferred.durationMin).toBeGreaterThan(0);
        expect(inferred.kcal).toBeGreaterThan(0);
        const manual = workoutKcal({ duration_min: 50, notes: '[kcal:515] Relógio Garmin' }, [], TYPES, 80);
        expect(manual).toMatchObject({ kcal: 515, estimated: false });
    });
    it('combines workouts and cardio in dailyTrainingBurn', () => {
        const workouts = [{ id: 'w1', date: '2026-11-25', title: 'Treino A', duration_min: 60 }];
        const sets = [];
        const cardio = [{ id: 'c1', date: '2026-11-25', cardio_type: 'corrida', distance_km: 5, duration_s: 1800, kcal: 320 }];
        const burn = dailyTrainingBurn({ day: '2026-11-25', workouts, sets, cardio, types: TYPES, weightKg: 80 });
        expect(burn).toMatchObject({ workoutKcal: 400, cardioKcal: 320, totalKcal: 720, sessionsCount: 2 });
    });
});
describe('weightedMuscleDistribution & symmetry (1.0x primary + 0.5x secondary)', () => {
    const exercises = new Map([
        ['bench', { id: 'bench', name: 'Supino reto com barra', muscle_group: 'peito', secondary_muscles: ['triceps', 'ombros'] }],
        ['warmex', { id: 'warmex', name: 'Manguito', muscle_group: 'ombros', secondary_muscles: [] }],
    ]);
    it('credits 1.0 per primary set and 0.5 per secondary muscle while excluding warmups by default', () => {
        const sets = [
            { id: '1', workout_id: 'w', exercise_id: 'bench', set_type_id: 'warm', position: 0, load_kg: 40, reps: 12, rest_s: 60, effort: null },
            { id: '2', workout_id: 'w', exercise_id: 'bench', set_type_id: 'work', position: 1, load_kg: 80, reps: 10, rest_s: 120, effort: 8 },
            { id: '3', workout_id: 'w', exercise_id: 'bench', set_type_id: 'work', position: 2, load_kg: 80, reps: 10, rest_s: 120, effort: 8.5 },
            { id: '4', workout_id: 'w', exercise_id: 'bench', set_type_id: 'work', position: 3, load_kg: 80, reps: 9, rest_s: 120, effort: 9 },
            { id: '5', workout_id: 'w', exercise_id: 'bench', set_type_id: 'work', position: 4, load_kg: 80, reps: 8, rest_s: 120, effort: 9.5 },
        ];
        const dist = weightedMuscleDistribution(sets, exercises, TYPES);
        expect(dist.find((d) => d.muscle_group === 'peito')).toMatchObject({ primarySets: 4, secondarySets: 0, weightedSets: 4, intensity: 1 });
        expect(dist.find((d) => d.muscle_group === 'triceps')).toMatchObject({ primarySets: 0, secondarySets: 4, weightedSets: 2, intensity: 0.5 });
        expect(dist.find((d) => d.muscle_group === 'ombros')).toMatchObject({ weightedSets: 2 });
        const sym = analyzeMuscleSymmetry(dist);
        expect(sym.pushSets).toBe(8);
        expect(sym.pullSets).toBe(0);
        expect(sym.balanceNote).toContain('empurrar sem séries de puxar');
    });
});
describe('plate & warm-up calculators, calendar/streak, presets & Hevy CSV I/O', () => {
    it('calculates plates per side and generates 50/70/85% warm-up ramp', () => {
        const plates = calculatePlatesPerSide(100, 20);
        expect(plates.achievableKg).toBe(100);
        expect(plates.perSide).toEqual([{ plateKg: 25, count: 1 }, { plateKg: 15, count: 1 }]);
        const ramp = generateWarmupRamp(100);
        expect(ramp).toEqual([
            { pct: 50, load_kg: 50, reps: 8 },
            { pct: 70, load_kg: 70, reps: 5 },
            { pct: 85, load_kg: 85, reps: 3 },
        ]);
    });
    it('computes consecutive weekly training streak and monthly calendar cells', () => {
        const trained = new Set(['2026-11-04', '2026-11-11', '2026-11-18', '2026-11-24']);
        expect(computeWeeklyTrainingStreak('2026-11-25', trained)).toBe(4);
        const cal = buildTrainingCalendarMonth({
            year: 2026,
            month: 11,
            workouts: [{ id: 'w1', date: '2026-11-24', title: 'Upper', duration_min: 60 }],
            sets: [],
            cardio: [],
            types: TYPES,
            weightKg: 80,
        });
        const cell = cal.find((c) => c.date === '2026-11-24');
        expect(cell).toMatchObject({ inMonth: true, workoutsCount: 1, kcalBurned: 400 });
        expect(PRESET_PROGRAMS.length).toBeGreaterThanOrEqual(4);
    });
    it('exports and imports official 14-column Hevy CSV accurately', () => {
        const exercises = new Map([
            ['bench', { id: 'bench', name: 'Supino reto com barra', muscle_group: 'peito', secondary_muscles: ['triceps'] }],
        ]);
        const csv = exportWorkoutsHevyCsv({
            workouts: [{ id: 'w1', date: '2026-11-24', title: 'Push A', duration_min: 55, notes: 'Forte' }],
            sets: [
                { id: 's1', workout_id: 'w1', exercise_id: 'bench', set_type_id: 'warm', position: 0, load_kg: 50, reps: 8, rest_s: 60, effort: null, notes: null },
                { id: 's2', workout_id: 'w1', exercise_id: 'bench', set_type_id: 'work', position: 1, load_kg: 90, reps: 8, rest_s: 120, effort: 8.5, notes: '[ss:A] Controlado' },
            ],
            exercises,
            types: TYPES,
        });
        expect(csv.split('\n')[0]).toBe('title,start_time,end_time,description,exercise_title,superset_id,exercise_notes,set_index,set_type,weight_kg,reps,distance_km,duration_seconds,rpe');
        const parsed = parseHevyOrStrongCsv(csv);
        expect(parsed).toHaveLength(1);
        expect(parsed[0]).toMatchObject({ date: '2026-11-24', title: 'Push A', duration_min: 55, description: 'Forte' });
        expect(parsed[0].sets[0]).toMatchObject({ exerciseName: 'Supino reto com barra', indicator: 'warmup', load_kg: 50, reps: 8 });
        expect(parsed[0].sets[1]).toMatchObject({ exerciseName: 'Supino reto com barra', indicator: 'normal', load_kg: 90, reps: 8, rpe: 8.5, superset: 'A', notes: 'Controlado' });
    });
});
