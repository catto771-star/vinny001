import { describe, expect, it } from 'vitest';
import { ageFromBirthDate, calculateBmr, calculateTef, computeEnergySummary, computeKetoTargets, computeRecipeYield, computeWeightGoalForecast, } from './metabolism';
describe('metabolism & energy balance engine', () => {
    it('computes BMR via Mifflin-St Jeor, Katch-McArdle when BF% is known, and custom override', () => {
        expect(ageFromBirthDate('1996-01-08', '2026-11-25')).toBe(30);
        const mifflin = calculateBmr({
            weightKg: 100.2,
            heightCm: 183,
            sex: 'M',
            birthDate: '1996-01-08',
            asOfDate: '2026-11-25',
        });
        expect(mifflin.formula).toBe('mifflin_st_jeor');
        expect(mifflin.bmr).toBe(2001);
        const katch = calculateBmr({ weightKg: 100, bodyFatPct: 20 });
        expect(katch.formula).toBe('katch_mcardle');
        expect(katch.leanMassKg).toBe(80);
        expect(katch.bmr).toBe(Math.round(370 + 21.6 * 80));
        const custom = calculateBmr({ weightKg: 100, customBmr: 2150 });
        expect(custom.formula).toBe('custom');
        expect(custom.bmr).toBe(2150);
    });
    it('computes full Energy Summary with Baseline Activity, Exercise, and TEF', () => {
        expect(calculateTef({ protein_g: 150, carbs_g: 200, fat_g: 60 })).toBe(225);
        const summary = computeEnergySummary({
            consumedKcal: 2100,
            macros: { protein_g: 150, carbs_g: 200, fat_g: 60 },
            metabolic: { weightKg: 100.2, heightCm: 183, sex: 'M', birthDate: '1996-01-08', asOfDate: '2026-11-25' },
            activityLevel: 'lightly_active',
            exerciseBurnedKcal: 350,
            includeTef: true,
            targetKcal: 2200,
        });
        expect(summary.bmr).toBe(2001);
        expect(summary.baselineActivity).toBe(750);
        expect(summary.tef).toBe(225);
        expect(summary.totalExpenditure).toBe(2001 + 750 + 350 + 225);
        expect(summary.remainingToTarget).toBe(100);
        expect(summary.netBalance).toBeLessThan(0);
    });
    it('projects Weight Goal Forecast date and daily kcal adjustment', () => {
        const forecast = computeWeightGoalForecast({
            currentWeightKg: 100.2,
            targetWeightKg: 94.0,
            weeklyRateKg: -0.62,
            maintenanceKcal: 2750,
            today: '2026-11-25',
        });
        expect(forecast.deltaKg).toBe(-6.2);
        expect(forecast.daysToGoal).toBe(70); // 10 weeks
        expect(forecast.forecastDate).toBe('2027-02-03');
        expect(forecast.dailyKcalAdjustment).toBe(-682);
    });
    it('calculates Keto macro targets and Recipe cooked-weight yields', () => {
        const keto = computeKetoTargets({ kcal: 2100, weightKg: 100, bodyFatPct: 22, preset: 'moderate' });
        expect(keto.carbs_g).toBe(35);
        expect(keto.protein_g).toBe(Math.round(78 * 1.7));
        expect(keto.fat_g).toBeGreaterThan(100);
        const yieldRes = computeRecipeYield([
            { food_id: '1', food_name: 'Peito de frango cru', quantity_g: 1000, kcal: 1200, protein_g: 230, carbs_g: 0, fat_g: 25, fiber_g: 0 },
        ], 4, 750);
        expect(yieldRes.perServing.kcal).toBe(300);
        expect(yieldRes.gramsPerServing).toBe(187.5);
        expect(yieldRes.per100g.kcal).toBe(160); // Denser per 100g after water loss!
    });
});
