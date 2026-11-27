import { useMemo } from 'react';
import { useTable } from '../../lib/useTable';
import { toDay, type Day } from '../../lib/dates';
import type { CardioSession, Exercise, ExerciseSettings, SetType, Workout, WorkoutSet } from '../../lib/training';
import type { DayTarget, DayType, FoodLog, Override } from '../../lib/nutrition';
import type { WeighIn } from '../../lib/energy';
import type { PlanExercise, PlanSession } from '../../lib/plans';
import type { ActivityLevel, RecipeIngredient } from '../../lib/metabolism';
import type { FastingSession } from '../../lib/fasting';
import type { MicronutrientMap } from '../../lib/micronutrients';

export interface DietPlan { id: string; name: string; is_active: boolean; training_target_mode: 'fixed' | 'dynamic' }
export interface PlanTarget extends DayTarget { plan_id: string; day_type: DayType }
export interface PlanMeal { id: string; plan_id: string; name: string; time_of_day: string | null; order_index: number }
export interface PlanItem { id: string; meal_id: string; food_id: string; quantity_g: number; food?: { name: string; kcal: number; protein_g: number; carbs_g: number; fat_g: number; fiber_g: number | null } }
export interface Measurement { id: string; measured_at: string; metric: string; value: number; assessment_id: string | null }
export interface WorkoutPlan { id: string; name: string; is_active: boolean; started_at: string; ended_at: string | null; habit_id?: string | null; modality?: string | null }
export interface WeekdayTarget extends DayTarget { plan_id: string; weekday: number }
export interface BodyAssessment { id: string; date: string; notes: string | null; created_at: string }
export interface BodyPhoto { id: string; assessment_id: string; pose: 'front' | 'side' | 'back'; storage_path: string }
export interface UserSettings {
  user_id: string;
  height_cm: number | null;
  sex: 'M' | 'F' | null;
  birth_date?: string | null;
  activity_level?: ActivityLevel;
  custom_bmr?: number | null;
  include_tef?: boolean;
  net_carbs_mode?: boolean;
  water_goal_ml?: number;
  water_cup_ml?: number;
  target_weight_kg?: number | null;
  weekly_rate_kg?: number | null;
}
export interface SettingsRow extends ExerciseSettings { exercise_id: string }

export interface FavoriteFood { user_id: string; food_id: string }
export interface WaterLog { id: string; date: Day; ml: number; logged_time: string | null; created_at: string }
export interface CustomRecipe {
  id: string;
  name: string;
  servings: number;
  cooked_weight_g: number | null;
  notes: string | null;
  items: RecipeIngredient[];
  created_at: string;
}
export interface CustomMealItem extends RecipeIngredient {
  measure_label?: string | null;
  measure_qty?: number | null;
}
export interface CustomMeal {
  id: string;
  name: string;
  default_meal: string;
  items: CustomMealItem[];
  created_at: string;
}
export interface RepeatFoodItem {
  id: string;
  meal: string;
  weekdays: number[];
  food_id: string | null;
  food_name: string;
  quantity_g: number;
  measure_label: string | null;
  measure_qty: number | null;
  kcal: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  fiber_g: number | null;
  nutrients: MicronutrientMap;
  is_supplement: boolean;
  active: boolean;
}
export interface MacroTemplate extends DayTarget {
  id: string;
  name: string;
  weekdays: number[];
}
export interface HealthHabit {
  id: string;
  name: string;
  habit_type: string;
  target_value: number | null;
  is_archived: boolean;
}
export interface HealthHabitCompletion {
  id: string;
  habit_id: string;
  completed_date: Day;
  value: number;
}

/** Everything the health screens read, loaded once and shared by the tabs. */
export function useHealth() {
  const exercises = useTable<Exercise & { user_id: string | null; equipment: string | null }>('exercises', '*', { column: 'name' });
  const setTypes = useTable<SetType & { user_id: string | null; sort_order: number }>('set_types', '*', { column: 'sort_order' });
  const settings = useTable<SettingsRow>('exercise_settings');
  const workouts = useTable<Workout & { notes: string | null; plan_session_id: string | null }>('workouts', '*', { column: 'date', ascending: false });
  const sets = useTable<WorkoutSet & { notes?: string | null }>('workout_sets', '*', { column: 'position' });
  const cardio = useTable<CardioSession & { notes: string | null }>('cardio_sessions', '*', { column: 'date', ascending: false });
  const measurements = useTable<Measurement>('body_measurements', '*', { column: 'measured_at' });
  const foodLogs = useTable<FoodLog>('food_logs', '*', { column: 'created_at' });
  const plans = useTable<DietPlan>('diet_plans', '*', { column: 'created_at' });
  const targets = useTable<PlanTarget>('diet_day_targets');
  const overrides = useTable<Override>('diet_day_overrides');
  const meals = useTable<PlanMeal>('diet_plan_meals', '*', { column: 'order_index' });
  const items = useTable<PlanItem>('diet_plan_items', '*,food:foods(name,kcal,protein_g,carbs_g,fat_g,fiber_g)');
  const workoutPlans = useTable<WorkoutPlan>('workout_plans', '*', { column: 'started_at', ascending: false });
  const planSessions = useTable<PlanSession>('workout_plan_sessions', '*', { column: 'order_index' });
  const planExercises = useTable<PlanExercise>('workout_plan_exercises', '*', { column: 'order_index' });
  const weekdayTargets = useTable<WeekdayTarget>('diet_weekday_targets');
  const assessments = useTable<BodyAssessment>('body_assessments', '*', { column: 'date', ascending: false });
  const bodyPhotos = useTable<BodyPhoto>('body_photos');
  const userSettings = useTable<UserSettings>(
    'user_settings',
    'user_id,height_cm,sex,birth_date,activity_level,custom_bmr,include_tef,net_carbs_mode,water_goal_ml,water_cup_ml,target_weight_kg,weekly_rate_kg',
  );
  const favorites = useTable<FavoriteFood>('favorite_foods');
  const waterLogs = useTable<WaterLog>('water_logs', '*', { column: 'created_at' });
  const customRecipes = useTable<CustomRecipe>('custom_recipes', '*', { column: 'created_at', ascending: false });
  const customMeals = useTable<CustomMeal>('custom_meals', '*', { column: 'created_at', ascending: false });
  const repeatItems = useTable<RepeatFoodItem>('repeat_food_items', '*', { column: 'created_at' });
  const fasts = useTable<FastingSession>('fasting_sessions', '*', { column: 'started_at', ascending: false });
  const macroTemplates = useTable<MacroTemplate>('macro_templates', '*', { column: 'created_at' });
  const habits = useTable<HealthHabit>('habits', 'id,name,habit_type,target_value,is_archived');
  const habitCompletions = useTable<HealthHabitCompletion>('habit_completions', 'id,habit_id,completed_date,value');

  const derived = useMemo(() => {
    const exerciseById = new Map(exercises.rows.map((e) => [e.id, e]));
    const typeById = new Map(setTypes.rows.map((t) => [t.id, t]));
    const settingsById = new Map(settings.rows.map((s) => [s.exercise_id, s]));
    const weighIns: WeighIn[] = measurements.rows
      .filter((m) => m.metric === 'weight_kg')
      .map((m) => ({ date: toDay(new Date(m.measured_at)), weight_kg: Number(m.value) }));
    const latestWeight = weighIns.length ? weighIns[weighIns.length - 1].weight_kg : null;
    const bfRows = measurements.rows.filter((m) => m.metric === 'body_fat_pct');
    const latestBodyFatPct = bfRows.length ? Number(bfRows[bfRows.length - 1].value) : null;
    const trainedDays = new Set<Day>([...workouts.rows.map((w) => w.date), ...cardio.rows.map((c) => c.date)]);
    const plan = plans.rows.find((p) => p.is_active) ?? null;
    const workoutPlan = workoutPlans.rows.find((p) => p.is_active) ?? null;
    const profile = userSettings.rows[0] ?? null;
    const favoriteIds = new Set(favorites.rows.map((f) => f.food_id));
    const activeFast = fasts.rows.find((f) => f.ended_at === null) ?? null;
    return {
      exerciseById,
      typeById,
      settingsById,
      weighIns,
      latestWeight,
      latestBodyFatPct,
      trainedDays,
      plan,
      workoutPlan,
      profile,
      favoriteIds,
      activeFast,
    };
  }, [
    exercises.rows, setTypes.rows, settings.rows, measurements.rows, workouts.rows, cardio.rows,
    plans.rows, workoutPlans.rows, userSettings.rows, favorites.rows, fasts.rows,
  ]);

  return {
    exercises, setTypes, settings, workouts, sets, cardio, measurements, foodLogs, plans, targets, overrides, meals, items,
    workoutPlans, planSessions, planExercises, weekdayTargets, assessments, bodyPhotos, userSettings,
    favorites, waterLogs, customRecipes, customMeals, repeatItems, fasts, macroTemplates, habits, habitCompletions,
    ...derived,
  };
}

export type Health = ReturnType<typeof useHealth>;

/** Weight used for calorie estimates when none is recorded. */
export const DEFAULT_WEIGHT_KG = 75;
