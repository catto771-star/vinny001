import type { Day } from './dates';
import type { DayTarget, FoodLog, Nutrients } from './nutrition';

const r1 = (n: number) => Math.round(n * 10) / 10;

/** A logged item at a new quantity: nutrients scale with it. */
export function rescaleLog<T extends Nutrients & { quantity_g: number }>(log: T, quantity: number): T {
  const f = log.quantity_g > 0 ? quantity / log.quantity_g : 0;
  return {
    ...log, quantity_g: quantity, kcal: Math.round(log.kcal * f), protein_g: r1(log.protein_g * f),
    carbs_g: r1(log.carbs_g * f), fat_g: r1(log.fat_g * f), fiber_g: r1((log.fiber_g ?? 0) * f),
  };
}

export type NewLog = Omit<FoodLog, 'id'>;

/** Copies the items of a day (or one meal of it) to another day and meal. */
export function copyLogs(logs: FoodLog[], from: { day: Day; meal?: string }, to: { day: Day; meal?: string }): NewLog[] {
  return logs
    .filter((l) => l.date === from.day && (!from.meal || l.meal === from.meal))
    .map(({ id: _id, ...rest }) => {
      void _id;
      return { ...rest, date: to.day, meal: to.meal ?? rest.meal };
    });
}

export interface QuickFood { food_id: string; food_name: string; quantity_g: number; count: number; last: string }

function byFood(logs: (FoodLog & { created_at?: string })[]) {
  const map = new Map<string, QuickFood>();
  for (const l of logs) {
    if (!l.food_id) continue;
    const when = l.created_at ?? l.date;
    const cur = map.get(l.food_id);
    if (!cur) map.set(l.food_id, { food_id: l.food_id, food_name: l.food_name, quantity_g: l.quantity_g, count: 1, last: when });
    else {
      cur.count++;
      if (when > cur.last) { cur.last = when; cur.quantity_g = l.quantity_g; }
    }
  }
  return [...map.values()];
}

/** Foods logged most recently, each with the last quantity used. */
export function recentFoods(logs: (FoodLog & { created_at?: string })[], limit = 15): QuickFood[] {
  return byFood(logs).sort((a, b) => b.last.localeCompare(a.last)).slice(0, limit);
}

/** Foods logged most often, ties broken by the most recent. */
export function frequentFoods(logs: (FoodLog & { created_at?: string })[], limit = 15): QuickFood[] {
  return byFood(logs).sort((a, b) => b.count - a.count || b.last.localeCompare(a.last)).slice(0, limit);
}

/** Grams of each macro for a calorie target split in percentages (4/4/9 kcal per gram). */
export function gramsFromPercent(kcal: number, pct: { protein: number; carbs: number; fat: number }): Omit<DayTarget, 'kcal'> {
  return {
    protein_g: Math.round((kcal * pct.protein) / 100 / 4),
    carbs_g: Math.round((kcal * pct.carbs) / 100 / 4),
    fat_g: Math.round((kcal * pct.fat) / 100 / 9),
  };
}

/** Share of calories coming from each macro, in whole percent. */
export function percentFromGrams(t: Pick<DayTarget, 'protein_g' | 'carbs_g' | 'fat_g'>): { protein: number; carbs: number; fat: number } {
  const p = t.protein_g * 4, c = t.carbs_g * 4, f = t.fat_g * 9;
  const total = p + c + f;
  if (!total) return { protein: 0, carbs: 0, fat: 0 };
  return { protein: Math.round((p / total) * 100), carbs: Math.round((c / total) * 100), fat: Math.round((f / total) * 100) };
}
