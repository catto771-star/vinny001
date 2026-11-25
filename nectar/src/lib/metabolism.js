// Metabolic & Energy Summary engine inspired by Cronometer:
// - BMR via Mifflin-St Jeor, Katch-McArdle (when body fat % is known), or custom override
// - Baseline Activity multipliers (Sedentary 0.2, Lightly Active 0.375, Moderately Active 0.5, Very Active 0.9)
// - Thermic Effect of Food (TEF)
// - Weight Goal Forecast (projected date & daily calorie delta)
// - Keto / Low-Carb macro calculator & Custom Recipe yield (serving vs cooked weight).
import { addDays } from './dates';
export const ACTIVITY_LEVELS = {
    sedentary: { label: 'Sedentário', factor: 0.2, description: 'Trabalho de escritório, pouco movimento diário (+20% TMB)' },
    lightly_active: { label: 'Levemente ativo', factor: 0.375, description: 'Rotina em pé ou caminhadas leves ao longo do dia (+37,5% TMB)' },
    moderately_active: { label: 'Moderadamente ativo', factor: 0.5, description: 'Dia a dia movimentado além dos treinos (+50% TMB)' },
    very_active: { label: 'Muito ativo', factor: 0.9, description: 'Trabalho físico intenso ou rotina atlética (+90% TMB)' },
};
export function ageFromBirthDate(birthDate, asOfDate) {
    if (!birthDate || !/^\d{4}-\d{2}-\d{2}$/.test(birthDate))
        return null;
    const ref = asOfDate && /^\d{4}-\d{2}-\d{2}$/.test(asOfDate) ? asOfDate : new Date().toISOString().slice(0, 10);
    const [by, bm, bd] = birthDate.split('-').map(Number);
    const [ry, rm, rd] = ref.split('-').map(Number);
    let age = ry - by;
    if (rm < bm || (rm === bm && rd < bd))
        age -= 1;
    return age >= 10 && age <= 120 ? age : null;
}
/** Calculates Basal Metabolic Rate using Custom, Katch-McArdle (if BF% present), or Mifflin-St Jeor. */
export function calculateBmr(input) {
    const w = input.weightKg > 0 ? input.weightKg : 75;
    const bf = input.bodyFatPct;
    const leanMassKg = bf != null && bf > 2 && bf < 65 ? Math.round(w * (1 - bf / 100) * 10) / 10 : null;
    if (input.customBmr && input.customBmr > 0) {
        return { bmr: Math.round(input.customBmr), formula: 'custom', leanMassKg };
    }
    if (leanMassKg !== null) {
        return { bmr: Math.round(370 + 21.6 * leanMassKg), formula: 'katch_mcardle', leanMassKg };
    }
    const h = input.heightCm && input.heightCm > 0 ? input.heightCm : 172;
    const age = ageFromBirthDate(input.birthDate, input.asOfDate) ?? 30;
    const sexOffset = input.sex === 'F' ? -161 : 5;
    const formula = input.heightCm && input.sex ? 'mifflin_st_jeor' : 'estimate';
    return {
        bmr: Math.max(800, Math.round(10 * w + 6.25 * h - 5 * age + sexOffset)),
        formula,
        leanMassKg: null,
    };
}
/** Thermic Effect of Food: ~25% of protein kcal, ~8% of carb kcal, ~2% of fat kcal. */
export function calculateTef(macros) {
    const kcal = macros.protein_g * 4 * 0.25 + macros.carbs_g * 4 * 0.08 + macros.fat_g * 9 * 0.02;
    return Math.max(0, Math.round(kcal));
}
export function computeEnergySummary(params) {
    const { bmr, formula, leanMassKg } = calculateBmr(params.metabolic);
    const level = params.activityLevel ?? 'lightly_active';
    const factor = ACTIVITY_LEVELS[level]?.factor ?? 0.375;
    const baselineActivity = Math.round(bmr * factor);
    const exerciseBurned = Math.max(0, Math.round(params.exerciseBurnedKcal));
    const tef = params.includeTef === false ? 0 : calculateTef(params.macros);
    const totalExpenditure = bmr + baselineActivity + exerciseBurned + tef;
    const consumed = Math.max(0, Math.round(params.consumedKcal));
    return {
        consumed,
        bmr,
        bmrFormula: formula,
        leanMassKg,
        baselineActivity,
        exerciseBurned,
        tef,
        totalExpenditure,
        netBalance: consumed - totalExpenditure,
        remainingToTarget: params.targetKcal && params.targetKcal > 0 ? Math.round(params.targetKcal - consumed) : null,
    };
}
/** Projects arrival date (`Goal Forecast`) and daily calorie budget for a weight goal. */
export function computeWeightGoalForecast(params) {
    const deltaKg = Math.round((params.targetWeightKg - params.currentWeightKg) * 10) / 10;
    const defaultRate = deltaKg < 0 ? -0.5 : deltaKg > 0 ? 0.25 : 0;
    const rawRate = params.weeklyRateKg != null && params.weeklyRateKg !== 0 ? params.weeklyRateKg : defaultRate;
    // Ensure rate sign aligns with direction towards target when user left opposite sign
    const alignedRate = deltaKg === 0
        ? 0
        : deltaKg < 0
            ? -Math.abs(rawRate)
            : Math.abs(rawRate);
    const dailyKcalAdjustment = Math.round((alignedRate * 7700) / 7);
    const suggestedTargetKcal = Math.max(1100, Math.round(params.maintenanceKcal + dailyKcalAdjustment));
    if (Math.abs(deltaKg) < 0.05 || alignedRate === 0) {
        return {
            currentWeightKg: params.currentWeightKg,
            targetWeightKg: params.targetWeightKg,
            deltaKg,
            weeklyRateKg: alignedRate,
            dailyKcalAdjustment: 0,
            suggestedTargetKcal: Math.round(params.maintenanceKcal),
            daysToGoal: 0,
            forecastDate: params.today,
        };
    }
    const weeks = Math.abs(deltaKg / alignedRate);
    const daysToGoal = Math.min(3650, Math.max(1, Math.ceil(weeks * 7)));
    return {
        currentWeightKg: params.currentWeightKg,
        targetWeightKg: params.targetWeightKg,
        deltaKg,
        weeklyRateKg: alignedRate,
        dailyKcalAdjustment,
        suggestedTargetKcal,
        daysToGoal,
        forecastDate: addDays(params.today, daysToGoal),
    };
}
export const KETO_PRESETS = {
    rigorous: { label: 'Rigoroso (20 g Carbo Líq.)', netCarbsG: 20, proteinPerLeanKg: 1.5 },
    moderate: { label: 'Moderado (35 g Carbo Líq.)', netCarbsG: 35, proteinPerLeanKg: 1.7 },
    relaxed: { label: 'Flexível (50 g Carbo Líq.)', netCarbsG: 50, proteinPerLeanKg: 1.8 },
};
/** Cronometer-style Keto / Low-Carb calculator based on Lean Body Mass and target energy. */
export function computeKetoTargets(params) {
    const cfg = KETO_PRESETS[params.preset];
    const lbm = params.bodyFatPct && params.bodyFatPct > 2 && params.bodyFatPct < 65
        ? params.weightKg * (1 - params.bodyFatPct / 100)
        : params.weightKg * 0.8;
    const protein_g = Math.round(lbm * cfg.proteinPerLeanKg);
    const carbs_g = cfg.netCarbsG;
    const remKcal = Math.max(180, params.kcal - protein_g * 4 - carbs_g * 4);
    const fat_g = Math.round(remKcal / 9);
    return { kcal: Math.round(params.kcal), protein_g, carbs_g, fat_g };
}
/** Calculates nutrition of a Custom Recipe both per serving and per 100 g (accounting for cooked weight!). */
export function computeRecipeYield(items, servings, cookedWeightG) {
    const s = Math.max(1, servings || 1);
    const rawW = items.reduce((acc, i) => acc + (i.quantity_g || 0), 0);
    const effW = cookedWeightG && cookedWeightG > 0 ? cookedWeightG : Math.max(1, rawW);
    const sum = items.reduce((acc, i) => ({
        kcal: acc.kcal + (i.kcal || 0),
        protein_g: acc.protein_g + (i.protein_g || 0),
        carbs_g: acc.carbs_g + (i.carbs_g || 0),
        fat_g: acc.fat_g + (i.fat_g || 0),
        fiber_g: acc.fiber_g + (i.fiber_g || 0),
    }), { kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0, fiber_g: 0 });
    const r1 = (n) => Math.round(n * 10) / 10;
    return {
        totalRawWeightG: r1(rawW),
        effectiveWeightG: r1(effW),
        servings: s,
        gramsPerServing: r1(effW / s),
        perServing: {
            kcal: Math.round(sum.kcal / s),
            protein_g: r1(sum.protein_g / s),
            carbs_g: r1(sum.carbs_g / s),
            fat_g: r1(sum.fat_g / s),
            fiber_g: r1(sum.fiber_g / s),
        },
        per100g: {
            kcal: Math.round((sum.kcal / effW) * 100),
            protein_g: r1((sum.protein_g / effW) * 100),
            carbs_g: r1((sum.carbs_g / effW) * 100),
            fat_g: r1((sum.fat_g / effW) * 100),
            fiber_g: r1((sum.fiber_g / effW) * 100),
        },
    };
}
