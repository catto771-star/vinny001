export function netCarbsG(carbs_g, fiber_g) {
    return Math.max(0, Math.round((carbs_g - (fiber_g ?? 0)) * 10) / 10);
}
export const MEALS = ['Café da manhã', 'Almoço', 'Lanche', 'Jantar', 'Ceia'];
const r1 = (n) => Math.round(n * 10) / 10;
/** Nutrients of a quantity of a food whose values are per 100 g. */
export function nutrientsFor(food, grams) {
    const f = grams / 100;
    return {
        kcal: Math.round(food.kcal * f), protein_g: r1(food.protein_g * f), carbs_g: r1(food.carbs_g * f),
        fat_g: r1(food.fat_g * f), fiber_g: r1((food.fiber_g ?? 0) * f),
    };
}
export function sumNutrients(items) {
    const t = { kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0, fiber_g: 0 };
    for (const i of items) {
        t.kcal += i.kcal ?? 0;
        t.protein_g += i.protein_g ?? 0;
        t.carbs_g += i.carbs_g ?? 0;
        t.fat_g += i.fat_g ?? 0;
        t.fiber_g += i.fiber_g ?? 0;
    }
    return { kcal: Math.round(t.kcal), protein_g: r1(t.protein_g), carbs_g: r1(t.carbs_g), fat_g: r1(t.fat_g), fiber_g: r1(t.fiber_g) };
}
/** A day is a training day when it is forced so, or when it has a workout or cardio. */
export function dayTypeFor(day, trainedDays, override) {
    if (override?.day_type)
        return override.day_type;
    return trainedDays.has(day) ? 'training' : 'rest';
}
/**
 * The calorie and macro target of a day.
 * - a target set for the day of the week wins over the training/rest ones;
 * - rest day: the rest target;
 * - training day, fixed mode: the training target (rest target if none);
 * - training day, dynamic mode: the rest target plus the calories burned,
 *   which go to carbohydrates (4 kcal per gram).
 * A per-day override replaces any value it sets.
 */
export function resolveTarget({ dayType, targets, weekdayTarget, mode, burnedKcal, override }) {
    const rest = targets.rest ?? targets.training;
    let base;
    let basis;
    if (weekdayTarget) {
        base = weekdayTarget;
        basis = 'meta do dia da semana';
    }
    else if (dayType === 'training' && mode === 'dynamic' && rest) {
        const extra = Math.max(0, Math.round(burnedKcal));
        base = { ...rest, kcal: rest.kcal + extra, carbs_g: rest.carbs_g + Math.round(extra / 4) };
        basis = extra ? `descanso + ${extra} kcal do treino` : 'descanso (treino sem gasto registrado)';
    }
    else if (dayType === 'training') {
        base = targets.training ?? rest;
        basis = targets.training ? 'dia de treino' : 'descanso (sem meta de treino)';
    }
    else {
        base = rest;
        basis = 'dia de descanso';
    }
    if (!base)
        return null;
    const o = override;
    if (o && (o.kcal ?? o.protein_g ?? o.carbs_g ?? o.fat_g) != null)
        basis += ' + ajuste do dia';
    return {
        kcal: o?.kcal ?? base.kcal, protein_g: o?.protein_g ?? base.protein_g,
        carbs_g: o?.carbs_g ?? base.carbs_g, fat_g: o?.fat_g ?? base.fat_g, basis,
    };
}
export function compareToTarget(totals, target) {
    const p = (consumed, t) => ({
        consumed, target: t, remaining: r1(t - consumed), pct: t > 0 ? Math.round((consumed / t) * 100) : 0,
    });
    return {
        kcal: p(totals.kcal, target.kcal), protein_g: p(totals.protein_g, target.protein_g),
        carbs_g: p(totals.carbs_g, target.carbs_g), fat_g: p(totals.fat_g, target.fat_g),
    };
}
/** Calories implied by macros (4/4/9 kcal per gram). */
export function kcalFromMacros(m) {
    return Math.round(m.protein_g * 4 + m.carbs_g * 4 + m.fat_g * 9);
}
/**
 * Groceries for following the plan for `days` days: every item's daily
 * quantity times the days, summed per food and rounded up to 10 g.
 */
export function shoppingList(items, foods, days) {
    const totals = new Map();
    for (const i of items)
        totals.set(i.food_id, (totals.get(i.food_id) ?? 0) + i.quantity_g * days);
    return [...totals.entries()]
        .map(([food_id, grams]) => ({ food_id, name: foods.get(food_id)?.name ?? '?', grams: Math.ceil(grams / 10) * 10 }))
        .sort((a, b) => a.name.localeCompare(b.name, 'pt'));
}
