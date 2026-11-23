import { addDays, parseDay, type Day } from './dates';
import { num } from './format';

export const MAX_REPS = 15;

export interface SetType { id: string; name: string; drives_progression: boolean; counts_for_volume: boolean }
export interface Exercise { id: string; name: string; muscle_group: string; secondary_muscles: string[] }
export interface Workout { id: string; date: Day; title: string | null; duration_min: number | null }
export interface WorkoutSet {
  id: string; workout_id: string; exercise_id: string; set_type_id: string; position: number;
  load_kg: number; reps: number; rest_s: number | null; effort: number | null;
}
export interface ExerciseSettings { rep_min: number; rep_max: number; load_increment_kg: number }

export const DEFAULT_SETTINGS: ExerciseSettings = { rep_min: 8, rep_max: 12, load_increment_kg: 2.5 };

export const MUSCLE_LABEL: Record<string, string> = {
  peito: 'Peito', costas: 'Costas', ombros: 'Ombros', biceps: 'Bíceps', triceps: 'Tríceps', antebraco: 'Antebraço',
  quadriceps: 'Quadríceps', posteriores: 'Posteriores', gluteos: 'Glúteos', panturrilhas: 'Panturrilhas',
  abdomen: 'Abdômen', corpo_inteiro: 'Corpo inteiro',
};

/** Estimated one-rep max (Epley). Only meaningful from 1 to 15 reps. */
export function estimated1RM(load: number, reps: number): number | null {
  if (reps < 1 || reps > MAX_REPS || load <= 0) return null;
  if (reps === 1) return load;
  return Math.round(load * (1 + reps / 30) * 10) / 10;
}

const round = (n: number, d = 1) => Math.round(n * 10 ** d) / 10 ** d;

// ---------------------------------------------------------------------------
// Progression
// ---------------------------------------------------------------------------

export type Suggestion =
  | { action: 'increase_load'; load_kg: number; reps: number; sets: number; reason: string }
  | { action: 'increase_reps'; load_kg: number; reps: number[]; reason: string }
  | { action: 'decrease_load'; load_kg: number; reps: number; sets: number; reason: string };

/**
 * Suggests the next session for one exercise from the working sets of its
 * latest session. Only sets at the heaviest load count. Rep targets never go
 * above 15, whatever the settings say.
 */
export function suggestNext(lastWorkingSets: Pick<WorkoutSet, 'load_kg' | 'reps'>[], settings: ExerciseSettings): Suggestion | null {
  if (!lastWorkingSets.length) return null;
  const repMax = Math.min(settings.rep_max, MAX_REPS);
  const repMin = Math.min(settings.rep_min, repMax);
  const top = Math.max(...lastWorkingSets.map((s) => s.load_kg));
  const atTop = lastWorkingSets.filter((s) => s.load_kg === top);
  const best = Math.max(...atTop.map((s) => s.reps));

  if (atTop.every((s) => s.reps >= repMax)) {
    return {
      action: 'increase_load', load_kg: round(top + settings.load_increment_kg, 2), reps: repMin, sets: atTop.length,
      reason: `Todas as séries chegaram a ${repMax} repetições: suba a carga e volte para ${repMin}`,
    };
  }
  if (best < repMin - 2 && top > settings.load_increment_kg) {
    return {
      action: 'decrease_load', load_kg: round(top - settings.load_increment_kg, 2), reps: repMin, sets: atTop.length,
      reason: `A melhor série ficou em ${best} repetições, abaixo da faixa (${repMin}-${repMax}): reduza a carga`,
    };
  }
  return {
    action: 'increase_reps', load_kg: top, reps: atTop.map((s) => Math.min(repMax, Math.max(s.reps + 1, repMin))),
    reason: `Mantenha ${num(top)} kg e busque uma repetição a mais por série, até ${repMax}`,
  };
}

/** Working sets of the latest workout, before a given date, that has the exercise. */
export function lastWorkingSets(
  exerciseId: string, sets: WorkoutSet[], workouts: Workout[], types: Map<string, SetType>, beforeDay?: Day,
): WorkoutSet[] {
  const byId = new Map(workouts.map((w) => [w.id, w]));
  const candidates = sets.filter((s) => s.exercise_id === exerciseId && types.get(s.set_type_id)?.drives_progression &&
    byId.has(s.workout_id) && (!beforeDay || byId.get(s.workout_id)!.date < beforeDay));
  if (!candidates.length) return [];
  const latest = candidates.reduce((a, b) => {
    const wa = byId.get(a.workout_id)!, wb = byId.get(b.workout_id)!;
    return wb.date > wa.date || (wb.date === wa.date && wb.id > wa.id) ? b : a;
  });
  return candidates.filter((s) => s.workout_id === latest.workout_id).sort((a, b) => a.position - b.position);
}

// ---------------------------------------------------------------------------
// Records
// ---------------------------------------------------------------------------

export interface ExerciseRecords {
  exercise_id: string;
  maxLoad: { load_kg: number; reps: number; date: Day } | null;
  best1RM: { value: number; load_kg: number; reps: number; date: Day } | null;
  bestSessionVolume: { tonnage: number; date: Day } | null;
}

function volumeSets(sets: WorkoutSet[], types: Map<string, SetType>) {
  return sets.filter((s) => types.get(s.set_type_id)?.counts_for_volume && s.reps > 0);
}

/** Best marks per exercise over the given history. Warm-up and feeder sets do not count. */
export function personalRecords(sets: WorkoutSet[], workouts: Workout[], types: Map<string, SetType>): Map<string, ExerciseRecords> {
  const dateOf = new Map(workouts.map((w) => [w.id, w.date]));
  const out = new Map<string, ExerciseRecords>();
  const sessionVol = new Map<string, number>(); // `${exercise}|${workout}` -> tonnage
  for (const s of volumeSets(sets, types)) {
    const date = dateOf.get(s.workout_id);
    if (!date) continue;
    const r = out.get(s.exercise_id) ?? { exercise_id: s.exercise_id, maxLoad: null, best1RM: null, bestSessionVolume: null };
    if (!r.maxLoad || s.load_kg > r.maxLoad.load_kg || (s.load_kg === r.maxLoad.load_kg && s.reps > r.maxLoad.reps)) {
      r.maxLoad = { load_kg: s.load_kg, reps: s.reps, date };
    }
    const e1 = estimated1RM(s.load_kg, s.reps);
    if (e1 !== null && (!r.best1RM || e1 > r.best1RM.value)) r.best1RM = { value: e1, load_kg: s.load_kg, reps: s.reps, date };
    const key = `${s.exercise_id}|${s.workout_id}`;
    sessionVol.set(key, (sessionVol.get(key) ?? 0) + s.load_kg * s.reps);
    out.set(s.exercise_id, r);
  }
  for (const [key, tonnage] of sessionVol) {
    const [exerciseId, workoutId] = key.split('|');
    const r = out.get(exerciseId)!;
    const date = dateOf.get(workoutId)!;
    if (!r.bestSessionVolume || tonnage > r.bestSessionVolume.tonnage) r.bestSessionVolume = { tonnage: round(tonnage), date };
  }
  return out;
}

export interface WorkoutSummary {
  sets: number; reps: number; tonnage: number; maxLoad: number;
  /** Records this workout set, compared with everything before it. */
  records: { exercise_id: string; kind: 'carga' | '1RM' | 'volume'; value: number }[];
}

export function workoutSummary(workout: Workout, sets: WorkoutSet[], workouts: Workout[], types: Map<string, SetType>): WorkoutSummary {
  const mine = volumeSets(sets.filter((s) => s.workout_id === workout.id), types);
  const earlierIds = new Set(workouts.filter((w) => w.date < workout.date || (w.date === workout.date && w.id < workout.id)).map((w) => w.id));
  const before = personalRecords(sets.filter((s) => earlierIds.has(s.workout_id)), workouts, types);
  const now = personalRecords(mine, [workout], types);
  const records: WorkoutSummary['records'] = [];
  for (const [exerciseId, r] of now) {
    const prev = before.get(exerciseId);
    if (!prev) continue; // a first session sets no record to beat
    if (r.maxLoad && (!prev.maxLoad || r.maxLoad.load_kg > prev.maxLoad.load_kg)) records.push({ exercise_id: exerciseId, kind: 'carga', value: r.maxLoad.load_kg });
    if (r.best1RM && (!prev.best1RM || r.best1RM.value > prev.best1RM.value)) records.push({ exercise_id: exerciseId, kind: '1RM', value: r.best1RM.value });
    if (r.bestSessionVolume && (!prev.bestSessionVolume || r.bestSessionVolume.tonnage > prev.bestSessionVolume.tonnage)) {
      records.push({ exercise_id: exerciseId, kind: 'volume', value: r.bestSessionVolume.tonnage });
    }
  }
  return {
    sets: mine.length,
    reps: mine.reduce((n, s) => n + s.reps, 0),
    tonnage: round(mine.reduce((n, s) => n + s.load_kg * s.reps, 0)),
    maxLoad: mine.reduce((m, s) => Math.max(m, s.load_kg), 0),
    records,
  };
}

// ---------------------------------------------------------------------------
// Weekly volume and dashboards
// ---------------------------------------------------------------------------

/** Monday of the week that contains the day. */
export function weekStart(day: Day): Day {
  const wd = parseDay(day).getDay();
  return addDays(day, wd === 0 ? -6 : 1 - wd);
}

export interface MuscleVolume { muscle_group: string; sets: number; reps: number; tonnage: number }

/** Sets, reps and tonnage per primary muscle group in the week starting on `monday`. */
export function weeklyVolumeByMuscle(
  monday: Day, sets: WorkoutSet[], workouts: Workout[], exercises: Map<string, Exercise>, types: Map<string, SetType>,
): MuscleVolume[] {
  const end = addDays(monday, 7);
  const inWeek = new Set(workouts.filter((w) => w.date >= monday && w.date < end).map((w) => w.id));
  const acc = new Map<string, MuscleVolume>();
  for (const s of volumeSets(sets, types)) {
    if (!inWeek.has(s.workout_id)) continue;
    const muscle = exercises.get(s.exercise_id)?.muscle_group ?? 'outro';
    const m = acc.get(muscle) ?? { muscle_group: muscle, sets: 0, reps: 0, tonnage: 0 };
    m.sets++;
    m.reps += s.reps;
    m.tonnage = round(m.tonnage + s.load_kg * s.reps);
    acc.set(muscle, m);
  }
  return [...acc.values()].sort((a, b) => b.sets - a.sets);
}

export interface WeekStats {
  week: Day; sessions: number; sets: number; reps: number; tonnage: number;
  /** Tonnage per minute over workouts that have a duration; null without any. */
  density: number | null;
  /** Average working-set load as % of the exercise's best estimated 1RM so far. */
  intensityPct: number | null;
  avgEffort: number | null;
}

/** Volume, frequency, density and intensity for each of the last `weeks` weeks, oldest first. */
export function weeklyStats(
  today: Day, weeks: number, sets: WorkoutSet[], workouts: Workout[], types: Map<string, SetType>,
): WeekStats[] {
  const dateOf = new Map(workouts.map((w) => [w.id, w.date]));
  const first = addDays(weekStart(today), -7 * (weeks - 1));
  const ordered = [...sets].filter((s) => dateOf.has(s.workout_id))
    .sort((a, b) => dateOf.get(a.workout_id)!.localeCompare(dateOf.get(b.workout_id)!));
  const best1RM = new Map<string, number>(); // running best per exercise
  const out: WeekStats[] = Array.from({ length: weeks }, (_, i) => ({
    week: addDays(first, 7 * i), sessions: 0, sets: 0, reps: 0, tonnage: 0, density: null, intensityPct: null, avgEffort: null,
  }));
  const index = (day: Day) => Math.floor((parseDay(day).getTime() - parseDay(first).getTime()) / (7 * 86400000));
  const intensity = out.map(() => [] as number[]);
  const effort = out.map(() => [] as number[]);
  for (const s of ordered) {
    const day = dateOf.get(s.workout_id)!;
    const type = types.get(s.set_type_id);
    const e1 = estimated1RM(s.load_kg, s.reps);
    const i = index(day);
    if (i >= 0 && i < weeks && type?.counts_for_volume && s.reps > 0) {
      out[i].sets++;
      out[i].reps += s.reps;
      out[i].tonnage += s.load_kg * s.reps;
      if (type.drives_progression) {
        const ref = Math.max(best1RM.get(s.exercise_id) ?? 0, e1 ?? 0);
        if (ref > 0 && s.load_kg > 0) intensity[i].push((s.load_kg / ref) * 100);
        if (s.effort != null) effort[i].push(s.effort);
      }
    }
    if (type?.counts_for_volume && e1 !== null) best1RM.set(s.exercise_id, Math.max(best1RM.get(s.exercise_id) ?? 0, e1));
  }
  const minutes = out.map(() => 0);
  const tonnageWithTime = out.map(() => 0);
  for (const w of workouts) {
    const i = index(w.date);
    if (i < 0 || i >= weeks || w.date > today) continue;
    out[i].sessions++;
    if (w.duration_min) {
      minutes[i] += w.duration_min;
      tonnageWithTime[i] += sets.filter((s) => s.workout_id === w.id && types.get(s.set_type_id)?.counts_for_volume)
        .reduce((n, s) => n + s.load_kg * s.reps, 0);
    }
  }
  const avg = (xs: number[]) => (xs.length ? round(xs.reduce((a, b) => a + b, 0) / xs.length) : null);
  return out.map((w, i) => ({
    ...w,
    tonnage: round(w.tonnage),
    density: minutes[i] ? round(tonnageWithTime[i] / minutes[i]) : null,
    intensityPct: avg(intensity[i]),
    avgEffort: avg(effort[i]),
  }));
}

// ---------------------------------------------------------------------------
// Cardio
// ---------------------------------------------------------------------------

export interface CardioSession { id: string; date: Day; cardio_type: string; distance_km: number | null; duration_s: number; kcal: number | null }

/** Typical MET values (Compendium of Physical Activities, moderate effort). */
export const CARDIO_MET: Record<string, number> = {
  corrida: 9.8, caminhada: 3.5, bicicleta: 7.5, 'bicicleta ergométrica': 6.8, elíptico: 5.0, remo: 7.0,
  natação: 7.0, escada: 8.8, hiit: 8.0, outro: 6.0,
};

/** Minutes per km, or null without a distance. */
export function paceMinPerKm(c: Pick<CardioSession, 'distance_km' | 'duration_s'>): number | null {
  if (!c.distance_km || c.distance_km <= 0) return null;
  return round(c.duration_s / 60 / c.distance_km, 2);
}

export function formatPace(minPerKm: number | null): string {
  if (minPerKm === null) return '—';
  const m = Math.floor(minPerKm);
  const s = Math.round((minPerKm - m) * 60);
  return `${m}:${String(s === 60 ? 0 : s).padStart(2, '0')}/km`;
}

/** Calories of a cardio session: the recorded value, or a MET estimate from body weight. */
export function cardioKcal(c: Pick<CardioSession, 'cardio_type' | 'duration_s' | 'kcal'>, weightKg: number): { kcal: number; estimated: boolean } {
  if (c.kcal != null) return { kcal: c.kcal, estimated: false };
  const met = CARDIO_MET[c.cardio_type] ?? CARDIO_MET.outro;
  return { kcal: Math.round(met * weightKg * (c.duration_s / 3600)), estimated: true };
}

export function kcalPerMinute(kcal: number, durationS: number): number {
  return durationS > 0 ? round(kcal / (durationS / 60)) : 0;
}

/** Estimated calories of a weight training session (MET 5.0, vigorous lifting with rests). */
export function strengthKcal(durationMin: number | null, weightKg: number): number {
  if (!durationMin) return 0;
  return Math.round(5.0 * weightKg * (durationMin / 60));
}

