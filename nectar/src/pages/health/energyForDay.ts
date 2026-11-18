import type { Day } from '../../lib/dates';
import { cardioKcal, strengthKcal } from '../../lib/training';
import { dayTypeFor, resolveTarget, type ResolvedTarget } from '../../lib/nutrition';
import { DEFAULT_WEIGHT_KG, type Health } from './useHealth';

/** Calories burned by the day's training and the diet target that follows from it. */
export function energyForDay(h: Health, day: Day): { burned: number; estimated: boolean; dayType: 'training' | 'rest'; target: ResolvedTarget | null } {
  const weight = h.latestWeight ?? DEFAULT_WEIGHT_KG;
  let burned = 0;
  let estimated = h.latestWeight === null;
  for (const w of h.workouts.rows.filter((x) => x.date === day)) {
    burned += strengthKcal(w.duration_min, weight);
    estimated = true;
  }
  for (const c of h.cardio.rows.filter((x) => x.date === day)) {
    const k = cardioKcal(c, weight);
    burned += k.kcal;
    estimated ||= k.estimated;
  }
  const override = h.overrides.rows.find((o) => o.date === day) ?? null;
  const dayType = dayTypeFor(day, h.trainedDays, override);
  const planTargets = h.plan ? h.targets.rows.filter((t) => t.plan_id === h.plan!.id) : [];
  const targets = Object.fromEntries(planTargets.map((t) => [t.day_type, t]));
  const target = resolveTarget({ dayType, targets, mode: h.plan?.training_target_mode ?? 'fixed', burnedKcal: burned, override });
  return { burned, estimated, dayType, target };
}
