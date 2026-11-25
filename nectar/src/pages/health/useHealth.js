import { useMemo } from 'react';
import { useTable } from '../../lib/useTable';
import { toDay } from '../../lib/dates';
/** Everything the health screens read, loaded once and shared by the tabs. */
export function useHealth() {
    const exercises = useTable('exercises', '*', { column: 'name' });
    const setTypes = useTable('set_types', '*', { column: 'sort_order' });
    const settings = useTable('exercise_settings');
    const workouts = useTable('workouts', '*', { column: 'date', ascending: false });
    const sets = useTable('workout_sets', '*', { column: 'position' });
    const cardio = useTable('cardio_sessions', '*', { column: 'date', ascending: false });
    const measurements = useTable('body_measurements', '*', { column: 'measured_at' });
    const foodLogs = useTable('food_logs', '*', { column: 'created_at' });
    const plans = useTable('diet_plans', '*', { column: 'created_at' });
    const targets = useTable('diet_day_targets');
    const overrides = useTable('diet_day_overrides');
    const meals = useTable('diet_plan_meals', '*', { column: 'order_index' });
    const items = useTable('diet_plan_items', '*,food:foods(name,kcal,protein_g,carbs_g,fat_g,fiber_g)');
    const workoutPlans = useTable('workout_plans', '*', { column: 'started_at', ascending: false });
    const planSessions = useTable('workout_plan_sessions', '*', { column: 'order_index' });
    const planExercises = useTable('workout_plan_exercises', '*', { column: 'order_index' });
    const weekdayTargets = useTable('diet_weekday_targets');
    const assessments = useTable('body_assessments', '*', { column: 'date', ascending: false });
    const bodyPhotos = useTable('body_photos');
    const userSettings = useTable('user_settings', 'user_id,height_cm,sex,birth_date,activity_level,custom_bmr,include_tef,net_carbs_mode,water_goal_ml,water_cup_ml,target_weight_kg,weekly_rate_kg');
    const favorites = useTable('favorite_foods');
    const waterLogs = useTable('water_logs', '*', { column: 'created_at' });
    const customRecipes = useTable('custom_recipes', '*', { column: 'created_at', ascending: false });
    const customMeals = useTable('custom_meals', '*', { column: 'created_at', ascending: false });
    const repeatItems = useTable('repeat_food_items', '*', { column: 'created_at' });
    const fasts = useTable('fasting_sessions', '*', { column: 'started_at', ascending: false });
    const macroTemplates = useTable('macro_templates', '*', { column: 'created_at' });
    const habits = useTable('habits', 'id,name,habit_type,target_value,is_archived');
    const habitCompletions = useTable('habit_completions', 'id,habit_id,completed_date,value');
    const derived = useMemo(() => {
        const exerciseById = new Map(exercises.rows.map((e) => [e.id, e]));
        const typeById = new Map(setTypes.rows.map((t) => [t.id, t]));
        const settingsById = new Map(settings.rows.map((s) => [s.exercise_id, s]));
        const weighIns = measurements.rows
            .filter((m) => m.metric === 'weight_kg')
            .map((m) => ({ date: toDay(new Date(m.measured_at)), weight_kg: Number(m.value) }));
        const latestWeight = weighIns.length ? weighIns[weighIns.length - 1].weight_kg : null;
        const bfRows = measurements.rows.filter((m) => m.metric === 'body_fat_pct');
        const latestBodyFatPct = bfRows.length ? Number(bfRows[bfRows.length - 1].value) : null;
        const trainedDays = new Set([...workouts.rows.map((w) => w.date), ...cardio.rows.map((c) => c.date)]);
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
/** Weight used for calorie estimates when none is recorded. */
export const DEFAULT_WEIGHT_KG = 75;
