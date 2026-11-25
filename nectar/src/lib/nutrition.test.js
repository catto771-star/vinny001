import { describe, expect, it } from 'vitest';
import { compareToTarget, dayTypeFor, kcalFromMacros, nutrientsFor, resolveTarget, shoppingList, sumNutrients } from './nutrition';
import { averageIntake, estimatedMaintenance, weeklyRate, weightTrend } from './energy';
const RICE = { kcal: 124, protein_g: 2.6, carbs_g: 25.8, fat_g: 1, fiber_g: 2.7 };
const TARGETS = {
    rest: { kcal: 2200, protein_g: 180, carbs_g: 200, fat_g: 70 },
    training: { kcal: 2600, protein_g: 180, carbs_g: 300, fat_g: 70 },
};
describe('food logging', () => {
    it('scales per-100 g values to the eaten quantity', () => {
        expect(nutrientsFor(RICE, 150)).toEqual({ kcal: 186, protein_g: 3.9, carbs_g: 38.7, fat_g: 1.5, fiber_g: 4.1 });
    });
    it('sums a day', () => {
        expect(sumNutrients([nutrientsFor(RICE, 100), nutrientsFor(RICE, 100)])).toMatchObject({ kcal: 248, carbs_g: 51.6 });
    });
});
describe('day type and target', () => {
    it('is a training day when trained or forced', () => {
        const trained = new Set(['2026-11-18']);
        expect(dayTypeFor('2026-11-18', trained)).toBe('training');
        expect(dayTypeFor('2026-11-19', trained)).toBe('rest');
        expect(dayTypeFor('2026-11-19', trained, { day_type: 'training' })).toBe('training');
    });
    it('uses the right target for rest and fixed training days', () => {
        expect(resolveTarget({ dayType: 'rest', targets: TARGETS, mode: 'fixed', burnedKcal: 0 })).toMatchObject({ kcal: 2200 });
        expect(resolveTarget({ dayType: 'training', targets: TARGETS, mode: 'fixed', burnedKcal: 500 })).toMatchObject({ kcal: 2600, carbs_g: 300 });
    });
    it('adds the calories burned to the rest target in dynamic mode, as carbohydrates', () => {
        expect(resolveTarget({ dayType: 'training', targets: TARGETS, mode: 'dynamic', burnedKcal: 400 }))
            .toMatchObject({ kcal: 2600, carbs_g: 300, protein_g: 180 });
    });
    it('lets a per-day adjustment replace any value', () => {
        const t = resolveTarget({ dayType: 'rest', targets: TARGETS, mode: 'fixed', burnedKcal: 0,
            override: { date: '2026-11-18', day_type: null, kcal: 2000, protein_g: null, carbs_g: 150, fat_g: null } });
        expect(t).toMatchObject({ kcal: 2000, protein_g: 180, carbs_g: 150, fat_g: 70 });
        expect(t?.basis).toContain('ajuste');
    });
    it('has no target without a plan', () => {
        expect(resolveTarget({ dayType: 'rest', targets: {}, mode: 'fixed', burnedKcal: 0 })).toBeNull();
    });
    it('compares the day with the target', () => {
        const c = compareToTarget({ kcal: 1100, protein_g: 90, carbs_g: 50, fat_g: 70, fiber_g: 10 }, TARGETS.rest);
        expect(c.kcal).toEqual({ consumed: 1100, target: 2200, remaining: 1100, pct: 50 });
        expect(c.fat_g.remaining).toBe(0);
    });
    it('derives calories from macros', () => {
        expect(kcalFromMacros(TARGETS.rest)).toBe(2150);
    });
});
describe('shopping list', () => {
    it('multiplies daily quantities by the days and adds up repeated foods', () => {
        const foods = new Map([['rice', { id: 'rice', name: 'Arroz' }], ['egg', { id: 'egg', name: 'Ovo' }]]);
        const items = [{ food_id: 'rice', quantity_g: 150 }, { food_id: 'egg', quantity_g: 100 }, { food_id: 'rice', quantity_g: 101 }];
        expect(shoppingList(items, foods, 7)).toEqual([
            { food_id: 'rice', name: 'Arroz', grams: 1760 },
            { food_id: 'egg', name: 'Ovo', grams: 700 },
        ]);
    });
});
describe('weight trend crossed with the diet', () => {
    const weighIns = [
        { date: '2026-10-21', weight_kg: 101.0 }, { date: '2026-10-28', weight_kg: 100.5 },
        { date: '2026-11-04', weight_kg: 100.0 }, { date: '2026-11-11', weight_kg: 99.5 }, { date: '2026-11-18', weight_kg: 99.0 },
    ];
    it('smooths the weight and follows its direction', () => {
        const t = weightTrend(weighIns);
        expect(t[0].trend_kg).toBe(101);
        expect(t.at(-1).trend_kg).toBeLessThan(101);
        expect(t.at(-1).trend_kg).toBeGreaterThan(99);
    });
    it('measures the weekly rate over the window', () => {
        expect(weeklyRate(weighIns, '2026-11-18')).toBe(-0.5);
        expect(weeklyRate([{ date: '2026-11-17', weight_kg: 100 }, { date: '2026-11-18', weight_kg: 99 }], '2026-11-18')).toBeNull();
    });
    it('estimates maintenance from intake and rate', () => {
        // Eating 2000 kcal and losing 0.5 kg/week means burning about 2550 kcal.
        expect(estimatedMaintenance(2000, -0.5)).toBe(2550);
    });
    it('averages intake over logged days only', () => {
        const days = new Map([['2026-11-17', 2000], ['2026-11-18', 2200], ['2026-10-01', 9999]]);
        expect(averageIntake(days, '2026-11-18')).toEqual({ avg: 2100, days: 2 });
    });
});
