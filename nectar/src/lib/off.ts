// Branded products from Open Food Facts (openfoodfacts.org, data under the
// Open Database License). The search runs in the food-search edge function;
// this maps its results. Products the user picks are saved as their own foods.

export type FoodCountry = 'BR' | 'UK' | 'IE';

export interface OffProduct {
  code?: string;
  product_name?: string;
  product_name_pt?: string;
  brands?: string | string[];
  serving_quantity?: number | string;
  nutriments?: Record<string, number | string | undefined>;
}

export interface OffFood {
  source: 'OFF'; country: FoodCountry; external_id: string; name: string; brand: string | null;
  kcal: number; protein_g: number; carbs_g: number; fat_g: number; fiber_g: number | null; default_serving_g: number;
}

const num = (v: unknown): number | null => {
  const n = typeof v === 'string' ? Number(v.replace(',', '.')) : typeof v === 'number' ? v : NaN;
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 10) / 10 : null;
};

function firstBrand(brands: OffProduct['brands']): string | null {
  const first = Array.isArray(brands) ? brands[0] : brands?.split(',')[0];
  return first?.trim() || null;
}

/** Maps a product to a food per 100 g, or null if it lacks a name or energy. */
export function offToFood(p: OffProduct, country: FoodCountry): OffFood | null {
  const n = p.nutriments ?? {};
  const name = (country === 'BR' && p.product_name_pt) || p.product_name;
  let kcal = num(n['energy-kcal_100g']);
  if (kcal === null) {
    const kj = num(n['energy-kj_100g'] ?? n['energy_100g']);
    kcal = kj === null ? null : Math.round(kj / 4.184);
  }
  if (!p.code || !name || kcal === null) return null;
  const serving = num(p.serving_quantity);
  return {
    source: 'OFF', country, external_id: p.code, name: name.trim(), brand: firstBrand(p.brands),
    kcal: Math.round(kcal), protein_g: num(n.proteins_100g) ?? 0, carbs_g: num(n.carbohydrates_100g) ?? 0,
    fat_g: num(n.fat_100g) ?? 0, fiber_g: num(n.fiber_100g), default_serving_g: serving && serving > 0 ? serving : 100,
  };
}
