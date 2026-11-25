import { weekday } from '../../lib/dates';
import { cardioKcal } from '../../lib/training';
import { workoutKcal } from '../../lib/hevy';
import { dayTypeFor, resolveTarget } from '../../lib/nutrition';
import { DEFAULT_WEIGHT_KG } from './useHealth';
const EMPTY_TYPES = new Map();
/** Calories burned by the day's training (any modality + cardio) and the diet target that follows from it. */
export function energyForDay(h, day) {
    const weight = h.latestWeight ?? DEFAULT_WEIGHT_KG;
    let burned = 0;
    let trainingMinutes = 0;
    let estimated = h.latestWeight === null;
    const allSets = h.sets?.rows ?? [];
    const types = h.typeById ?? EMPTY_TYPES;
    for (const w of h.workouts.rows.filter((x) => x.date === day)) {
        const wSets = allSets.filter((s) => s.workout_id === w.id);
        const res = workoutKcal(w, wSets, types, weight);
        burned += res.kcal;
        trainingMinutes += res.durationMin;
        estimated ||= res.estimated;
    }
    for (const c of h.cardio.rows.filter((x) => x.date === day)) {
        const k = cardioKcal(c, weight);
        burned += k.kcal;
        trainingMinutes += Math.round(c.duration_s / 60);
        estimated ||= k.estimated;
    }
    const override = h.overrides.rows.find((o) => o.date === day) ?? null;
    const dayType = dayTypeFor(day, h.trainedDays, override);
    const planTargets = h.plan ? h.targets.rows.filter((t) => t.plan_id === h.plan.id) : [];
    const targets = Object.fromEntries(planTargets.map((t) => [t.day_type, t]));
    const weekdayTarget = h.plan ? h.weekdayTargets.rows.find((t) => t.plan_id === h.plan.id && t.weekday === weekday(day)) ?? null : null;
    const target = resolveTarget({ dayType, targets, weekdayTarget, mode: h.plan?.training_target_mode ?? 'fixed', burnedKcal: burned, override });
    return { burned, trainingMinutes, estimated, dayType, target };
}
