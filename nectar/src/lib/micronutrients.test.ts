import { describe, expect, it } from 'vitest';
import {
  buildOracleAiPrompt,
  computeNutrientBalances,
  computeNutritionScores,
  measuresForFood,
  micronutrientsPer100g,
  rankFoodsByNutrient,
  scaleMicronutrients,
  sumMicronutrients,
} from './micronutrients';
import type { Food } from './nutrition';

const SAMPLE_SPINACH: Food = {
  id: 'f1',
  name: 'Espinafre cru',
  source: 'TACO',
  country: 'BR',
  kcal: 23,
  protein_g: 2.9,
  carbs_g: 3.6,
  fat_g: 0.4,
  fiber_g: 2.2,
  default_serving_g: 100,
};

const SAMPLE_SALMON: Food = {
  id: 'f2',
  name: 'Salmão grelhado',
  source: 'TACO',
  country: 'BR',
  kcal: 208,
  protein_g: 20.4,
  carbs_g: 0,
  fat_g: 13.4,
  fiber_g: 0,
  default_serving_g: 120,
};

describe('micronutrients & Oracle engine', () => {
  it('infers household serving measures for eggs, bread, whey, and custom measures', () => {
    const eggMeasures = measuresForFood({
      name: 'Ovo cozido',
      default_serving_g: 50,
      measures: [{ label: 'Cartela meia dúzia', grams: 300 }],
    });
    expect(eggMeasures[0]).toEqual({ label: 'Cartela meia dúzia', grams: 300 });
    expect(eggMeasures.some((m) => m.label.includes('unidade média') && m.grams === 50)).toBe(true);
    expect(eggMeasures.some((m) => m.label === 'Gramas (g)' && m.grams === 1)).toBe(true);
  });

  it('merges explicit JSONB nutrients over reference profile and scales accurately', () => {
    const m = micronutrientsPer100g({ name: 'Espinafre cru', nutrients: { iron_mg: 3.5 } });
    expect(m.iron_mg).toBe(3.5);
    expect(m.vitamin_k_ug).toBeGreaterThan(400);
    const scaled = scaleMicronutrients(m, 50);
    expect(scaled.iron_mg).toBe(1.75);
  });

  it('sums micronutrients and computes Nutrition Scores and Nutrient Balances', () => {
    const micros = sumMicronutrients([
      { food_name: 'Espinafre cru', quantity_g: 200 },
      { food_name: 'Salmão grelhado', quantity_g: 150 },
    ]);
    expect(micros.omega3_g).toBeGreaterThan(3);
    expect(micros.potassium_mg).toBeGreaterThan(1500);

    const scores = computeNutritionScores(micros, 'M');
    expect(scores).toHaveLength(5);
    expect(scores.find((s) => s.id === 'all')!.pct).toBeGreaterThan(20);

    const balances = computeNutrientBalances(micros, 35);
    const kNa = balances.find((b) => b.id === 'k_na')!;
    expect(kNa.status).toBe('high'); // Very high potassium vs low sodium
  });

  it('ranks foods in The Oracle across per_100g, per_100kcal, and composite oracle modes', () => {
    const byKcal = rankFoodsByNutrient([SAMPLE_SPINACH, SAMPLE_SALMON], 'iron_mg', 'per_100kcal');
    expect(byKcal[0].food.id).toBe('f1');
    const byOmega3 = rankFoodsByNutrient([SAMPLE_SPINACH, SAMPLE_SALMON], 'omega3_g', 'oracle');
    expect(byOmega3[0].food.id).toBe('f2');
  });

  it('builds a structured AI Assistant prompt with remaining macros, low micros, diet, and exclusions', () => {
    const prompt = buildOracleAiPrompt({
      date: '2026-11-25',
      meal: 'Jantar',
      diet: 'Sem Glúten',
      exclusions: ['Laticínios', 'Amendoim'],
      remaining: { kcal: 620, protein_g: 48, carbs_g: 55, fat_g: 20 },
      lowestMicronutrients: [{ label: 'Magnésio', pct: 32, consumed: 135, target: 420, unit: 'mg' }],
    });
    expect(prompt).toContain('Jantar');
    expect(prompt).toContain('620 kcal');
    expect(prompt).toContain('Magnésio (32%');
    expect(prompt).toContain('Sem Glúten');
    expect(prompt).toContain('Laticínios, Amendoim');
  });
});
