import { describe, expect, it } from 'vitest';
import { energyForDay } from './energyForDay';
function fakeHealth(over) {
    const workouts = (over.workouts ?? []);
    const cardio = (over.cardio ?? []);
    return {
        workouts: { rows: workouts }, cardio: { rows: cardio }, overrides: { rows: over.overrides ?? [] },
        targets: { rows: [
                { plan_id: 'p', day_type: 'rest', kcal: 2200, protein_g: 180, carbs_g: 200, fat_g: 70 },
                { plan_id: 'p', day_type: 'training', kcal: 2600, protein_g: 180, carbs_g: 300, fat_g: 70 },
            ] },
        weekdayTargets: { rows: over.weekdayTargets ?? [] },
        plan: { id: 'p', name: 'x', is_active: true, training_target_mode: over.mode ?? 'fixed' },
        latestWeight: over.weight === undefined ? 80 : over.weight,
        trainedDays: new Set([...workouts, ...cardio].map((x) => x.date)),
    };
}
describe('energyForDay', () => {
    const day = '2026-11-18';
    it('is a rest day with the rest target when nothing was trained', () => {
        expect(energyForDay(fakeHealth({}), day)).toMatchObject({ burned: 0, dayType: 'rest', target: { kcal: 2200 } });
    });
    it('adds lifting and cardio calories and adjusts the target in dynamic mode', () => {
        const h = fakeHealth({
            mode: 'dynamic', weight: 80,
            workouts: [{ id: 'w', date: day, duration_min: 60 }],
            cardio: [{ id: 'c', date: day, cardio_type: 'corrida', duration_s: 1800, kcal: 300 }],
        });
        // Lifting: 5 MET x 80 kg x 1 h = 400 kcal; cardio recorded at 300.
        expect(energyForDay(h, day)).toMatchObject({ burned: 700, estimated: true, dayType: 'training', target: { kcal: 2900, carbs_g: 375 } });
    });
    it('uses the target set for the day of the week', () => {
        // 2026-11-18 is a Wednesday (3).
        const h = fakeHealth({ weekdayTargets: [{ plan_id: 'p', weekday: 3, kcal: 2400, protein_g: 190, carbs_g: 250, fat_g: 75 }] });
        expect(energyForDay(h, day)).toMatchObject({ target: { kcal: 2400, basis: 'meta do dia da semana' } });
    });
    it('follows a forced day type', () => {
        const h = fakeHealth({ overrides: [{ date: day, day_type: 'training', kcal: null, protein_g: null, carbs_g: null, fat_g: null }] });
        expect(energyForDay(h, day)).toMatchObject({ dayType: 'training', target: { kcal: 2600 } });
    });
    it('computes calories for functional/HIIT or manual kcal workouts and feeds dynamic diet target', () => {
        const h = fakeHealth({
            mode: 'dynamic',
            weight: 80,
            workouts: [{ id: 'w-hiit', date: day, duration_min: 45, notes: '[mod:funcional]' }],
        });
        // Funcional base MET 7.4 * 80 kg * 0.75 h = 444 kcal
        expect(energyForDay(h, day)).toMatchObject({ burned: 444, trainingMinutes: 45, dayType: 'training', target: { kcal: 2644 } });
    });
});
