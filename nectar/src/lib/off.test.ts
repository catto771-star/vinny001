import { describe, expect, it } from 'vitest';
import { offToFood } from './off';

describe('Open Food Facts mapping', () => {
  it('maps per-100 g nutriments and keeps the first brand', () => {
    expect(offToFood({ code: '123', product_name: 'Porridge Oats', brands: "Flahavan's, Other", serving_quantity: '40',
      nutriments: { 'energy-kcal_100g': 375, proteins_100g: 11, carbohydrates_100g: 60, fat_100g: 8, fiber_100g: 9 } }, 'IE'))
      .toEqual({ source: 'OFF', country: 'IE', external_id: '123', name: 'Porridge Oats', brand: "Flahavan's",
        kcal: 375, protein_g: 11, carbs_g: 60, fat_g: 8, fiber_g: 9, default_serving_g: 40 });
  });
  it('prefers the Portuguese name for Brazil and converts kJ when kcal is missing', () => {
    expect(offToFood({ code: '1', product_name: 'Oats', product_name_pt: 'Aveia', brands: ['Quaker', 'PepsiCo'], nutriments: { 'energy-kj_100g': 1569 } }, 'BR'))
      .toMatchObject({ name: 'Aveia', brand: 'Quaker', kcal: 375, protein_g: 0 });
  });
  it('skips products without a name or energy', () => {
    expect(offToFood({ code: '1', nutriments: { 'energy-kcal_100g': 100 } }, 'UK')).toBeNull();
    expect(offToFood({ code: '1', product_name: 'X', nutriments: {} }, 'UK')).toBeNull();
  });
});
