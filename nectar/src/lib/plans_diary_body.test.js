import { describe, expect, it } from 'vitest';
import { draftFromSession, parseReps, sessionsForDay } from './plans';
import { copyLogs, frequentFoods, gramsFromPercent, percentFromGrams, recentFoods, rescaleLog } from './diary';
import { compareAssessments, navyBodyFat, navyWaist } from './body';
import { resolveTarget } from './nutrition';
const session = (id, order, weekdays = []) => ({ id, plan_id: 'p', label: id, weekdays, order_index: order, notes: null });
describe('workout plan', () => {
    it('parses rep targets', () => {
        expect(parseReps('8-12')).toEqual({ min: 8, max: 12 });
        expect(parseReps('10')).toEqual({ min: 10, max: 10 });
        expect(parseReps('6 a 8')).toEqual({ min: 6, max: 8 });
        expect(parseReps('até a falha')).toBeNull();
    });
    it('picks the session scheduled for the weekday', () => {
        // 2026-11-16 is a Monday (1), 2026-11-19 a Thursday (4).
        const plan = [session('A', 0, [1, 4]), session('B', 1, [2, 5])];
        expect(sessionsForDay(plan, [], '2026-11-19').map((s) => s.id)).toEqual(['A']);
        expect(sessionsForDay(plan, [], '2026-11-22')).toEqual([]); // Sunday, nothing scheduled
    });
    it('rotates unscheduled sessions after the last one trained', () => {
        const plan = [session('A', 0), session('B', 1), session('C', 2)];
        expect(sessionsForDay(plan, [], '2026-11-19').map((s) => s.id)).toEqual(['A']);
        const workouts = [{ date: '2026-11-17', plan_session_id: 'A' }, { date: '2026-11-18', plan_session_id: 'B' }];
        expect(sessionsForDay(plan, workouts, '2026-11-19').map((s) => s.id)).toEqual(['C']);
        expect(sessionsForDay(plan, [...workouts, { date: '2026-11-19', plan_session_id: 'C' }], '2026-11-20').map((s) => s.id)).toEqual(['A']);
    });
    const WORK = { id: 'work', name: 'Working set', drives_progression: true, counts_for_volume: true };
    const types = new Map([[WORK.id, WORK]]);
    const pe = (over) => ({ id: 'pe', session_id: 'A', exercise_id: 'bench', sets: 3, reps: '8-12', load_kg: 60, rest_s: 90, notes: null, order_index: 0, ...over });
    const ctx = (sets = [], workouts = []) => ({ sets, workouts, types, settings: new Map(), workingTypeId: 'work', day: '2026-11-19' });
    it('starts a session from the plan when there is no history', () => {
        const draft = draftFromSession([pe({})], ctx());
        expect(draft).toHaveLength(3);
        expect(draft[0]).toMatchObject({ exercise_id: 'bench', load_kg: 60, reps: 8, rest_s: 90, set_type_id: 'work' });
    });
    it('uses the progression suggestion when there is history, with the plan rep range', () => {
        const w = { id: 'w1', date: '2026-11-16', title: null, duration_min: 60 };
        const s = (reps, i) => ({ id: `s${i}`, workout_id: 'w1', exercise_id: 'bench', set_type_id: 'work', position: i, load_kg: 60, reps, rest_s: 90, effort: 8 });
        const draft = draftFromSession([pe({})], ctx([s(12, 0), s(12, 1), s(12, 2)], [w]));
        expect(draft.map((d) => [d.load_kg, d.reps])).toEqual([[62.5, 8], [62.5, 8], [62.5, 8]]);
    });
    it('skips plan rows without an exercise', () => {
        expect(draftFromSession([pe({ exercise_id: null })], ctx())).toEqual([]);
    });
});
const log = (over) => ({
    id: Math.random().toString(36), date: '2026-11-18', meal: 'Almoço', food_id: 'rice', food_name: 'Arroz',
    quantity_g: 100, kcal: 124, protein_g: 2.6, carbs_g: 25.8, fat_g: 1, fiber_g: 2.7, created_at: '2026-11-18T12:00:00Z', ...over,
});
describe('food diary', () => {
    it('rescales an item when its quantity changes', () => {
        expect(rescaleLog(log({}), 150)).toMatchObject({ quantity_g: 150, kcal: 186, protein_g: 3.9, carbs_g: 38.7, fat_g: 1.5, fiber_g: 4.1 });
    });
    it('copies a meal to another day and meal, without ids', () => {
        const logs = [log({ meal: 'Almoço' }), log({ meal: 'Jantar', food_id: 'egg' }), log({ date: '2026-11-17' })];
        const copied = copyLogs(logs, { day: '2026-11-18', meal: 'Almoço' }, { day: '2026-11-19', meal: 'Jantar' });
        expect(copied).toHaveLength(1);
        expect(copied[0]).toMatchObject({ date: '2026-11-19', meal: 'Jantar', food_id: 'rice' });
        expect(copied[0]).not.toHaveProperty('id');
    });
    it('copies a whole day keeping each meal', () => {
        const logs = [log({ meal: 'Almoço' }), log({ meal: 'Jantar', food_id: 'egg' })];
        expect(copyLogs(logs, { day: '2026-11-18' }, { day: '2026-11-19' }).map((l) => l.meal)).toEqual(['Almoço', 'Jantar']);
    });
    it('lists recent and frequent foods with the last quantity used', () => {
        const logs = [
            log({ food_id: 'rice', quantity_g: 100, created_at: '2026-11-16T12:00:00Z' }),
            log({ food_id: 'rice', quantity_g: 150, created_at: '2026-11-17T12:00:00Z' }),
            log({ food_id: 'egg', food_name: 'Ovo', quantity_g: 50, created_at: '2026-11-18T08:00:00Z' }),
            log({ food_id: null, food_name: 'sem id' }),
        ];
        expect(recentFoods(logs).map((f) => f.food_id)).toEqual(['egg', 'rice']);
        expect(frequentFoods(logs)[0]).toMatchObject({ food_id: 'rice', count: 2, quantity_g: 150 });
    });
    it('converts macro percentages to grams and back', () => {
        expect(gramsFromPercent(2000, { protein: 30, carbs: 45, fat: 25 })).toEqual({ protein_g: 150, carbs_g: 225, fat_g: 56 });
        expect(percentFromGrams({ protein_g: 150, carbs_g: 225, fat_g: 56 })).toEqual({ protein: 30, carbs: 45, fat: 25 });
    });
    it('gives a weekday target priority over training and rest, and a date adjustment priority over both', () => {
        const targets = { rest: { kcal: 2200, protein_g: 180, carbs_g: 200, fat_g: 70 } };
        const saturday = { kcal: 2600, protein_g: 180, carbs_g: 300, fat_g: 80 };
        expect(resolveTarget({ dayType: 'rest', targets, weekdayTarget: saturday, mode: 'dynamic', burnedKcal: 500 })).toMatchObject({ kcal: 2600, basis: 'meta do dia da semana' });
        expect(resolveTarget({ dayType: 'rest', targets, weekdayTarget: saturday, mode: 'fixed', burnedKcal: 0,
            override: { date: '2026-11-21', day_type: null, kcal: 1800, protein_g: null, carbs_g: null, fat_g: null } })).toMatchObject({ kcal: 1800, carbs_g: 300 });
    });
});
describe('body assessment', () => {
    it('estimates body fat with the Navy method', () => {
        // 495 / (1.0324 - 0.19077·log10(58.5) + 0.15456·log10(180)) - 450 = 24.2
        expect(navyBodyFat({ sex: 'M', height_cm: 180, neck_cm: 40, waist_cm: 98.5 })).toBe(24.2);
        expect(navyBodyFat({ sex: 'F', height_cm: 165, neck_cm: 33, waist_cm: 75, hip_cm: 100 })).toBe(29.4); // 495 / (1.29579 - 0.35004·log10(142) + 0.221·log10(165)) - 450
        expect(navyBodyFat({ sex: 'M', height_cm: null, neck_cm: 40, waist_cm: 98 })).toBeNull();
        expect(navyBodyFat({ sex: 'F', height_cm: 165, neck_cm: 33, waist_cm: 75 })).toBeNull();
    });
    it('reads the abdomen for men and the waist for women', () => {
        expect(navyWaist('M', { waist_cm: 90, abdomen_cm: 95 })).toBe(95);
        expect(navyWaist('F', { waist_cm: 70, abdomen_cm: 80 })).toBe(70);
        expect(navyWaist('M', { waist_cm: 90 })).toBe(90);
    });
    it('compares each measurement with the previous assessment', () => {
        const prev = { id: 'a', date: '2026-10-26', values: { weight_kg: 100.2, waist_cm: 98.5 } };
        const cur = { id: 'b', date: '2026-11-18', values: { weight_kg: 98.7, waist_cm: 96, arm_cm: 37 } };
        const d = compareAssessments(cur, prev);
        expect(d.find((x) => x.key === 'weight_kg')).toMatchObject({ current: 98.7, previous: 100.2, change: -1.5 });
        expect(d.find((x) => x.key === 'arm_cm')).toMatchObject({ previous: null, change: null });
        expect(d.map((x) => x.key)).toEqual(['weight_kg', 'waist_cm', 'arm_cm']);
    });
});
