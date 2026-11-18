import { useMemo } from 'react';
import { useTable } from '../../lib/useTable';
import { toDay, type Day } from '../../lib/dates';
import type { CardioSession, Exercise, ExerciseSettings, SetType, Workout, WorkoutSet } from '../../lib/training';
import type { DayTarget, DayType, FoodLog, Override } from '../../lib/nutrition';
import type { WeighIn } from '../../lib/energy';

export interface DietPlan { id: string; name: string; is_active: boolean; training_target_mode: 'fixed' | 'dynamic' }
export interface PlanTarget extends DayTarget { plan_id: string; day_type: DayType }
export interface PlanMeal { id: string; plan_id: string; name: string; time_of_day: string | null; order_index: number }
export interface PlanItem { id: string; meal_id: string; food_id: string; quantity_g: number; food?: { name: string; kcal: number; protein_g: number; carbs_g: number; fat_g: number; fiber_g: number | null } }
export interface Measurement { id: string; measured_at: string; metric: string; value: number }
export interface SettingsRow extends ExerciseSettings { exercise_id: string }

/** Everything the health screens read, loaded once and shared by the tabs. */
export function useHealth() {
  const exercises = useTable<Exercise & { user_id: string | null; equipment: string | null }>('exercises', '*', { column: 'name' });
  const setTypes = useTable<SetType & { user_id: string | null; sort_order: number }>('set_types', '*', { column: 'sort_order' });
  const settings = useTable<SettingsRow>('exercise_settings');
  const workouts = useTable<Workout & { notes: string | null }>('workouts', '*', { column: 'date', ascending: false });
  const sets = useTable<WorkoutSet>('workout_sets', '*', { column: 'position' });
  const cardio = useTable<CardioSession & { notes: string | null }>('cardio_sessions', '*', { column: 'date', ascending: false });
  const measurements = useTable<Measurement>('body_measurements', '*', { column: 'measured_at' });
  const foodLogs = useTable<FoodLog>('food_logs', '*', { column: 'created_at' });
  const plans = useTable<DietPlan>('diet_plans', '*', { column: 'created_at' });
  const targets = useTable<PlanTarget>('diet_day_targets');
  const overrides = useTable<Override>('diet_day_overrides');
  const meals = useTable<PlanMeal>('diet_plan_meals', '*', { column: 'order_index' });
  const items = useTable<PlanItem>('diet_plan_items', '*,food:foods(name,kcal,protein_g,carbs_g,fat_g,fiber_g)');

  const derived = useMemo(() => {
    const exerciseById = new Map(exercises.rows.map((e) => [e.id, e]));
    const typeById = new Map(setTypes.rows.map((t) => [t.id, t]));
    const settingsById = new Map(settings.rows.map((s) => [s.exercise_id, s]));
    const weighIns: WeighIn[] = measurements.rows
      .filter((m) => m.metric === 'weight_kg')
      .map((m) => ({ date: toDay(new Date(m.measured_at)), weight_kg: Number(m.value) }));
    const latestWeight = weighIns.length ? weighIns[weighIns.length - 1].weight_kg : null;
    const trainedDays = new Set<Day>([...workouts.rows.map((w) => w.date), ...cardio.rows.map((c) => c.date)]);
    const plan = plans.rows.find((p) => p.is_active) ?? null;
    return { exerciseById, typeById, settingsById, weighIns, latestWeight, trainedDays, plan };
  }, [exercises.rows, setTypes.rows, settings.rows, measurements.rows, workouts.rows, cardio.rows, plans.rows]);

  return { exercises, setTypes, settings, workouts, sets, cardio, measurements, foodLogs, plans, targets, overrides, meals, items, ...derived };
}

export type Health = ReturnType<typeof useHealth>;

/** Weight used for calorie estimates when none is recorded. */
export const DEFAULT_WEIGHT_KG = 75;
