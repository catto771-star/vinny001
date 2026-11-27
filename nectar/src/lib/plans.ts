import { weekday, type Day } from './dates';
import { DEFAULT_SETTINGS, lastWorkingSets, suggestNext, type ExerciseSettings, type SetType, type Workout, type WorkoutSet } from './training';

export interface PlanSession { id: string; plan_id: string; label: string; weekdays: number[]; order_index: number; notes: string | null }
export interface PlanExercise {
  id: string; session_id: string; exercise_id: string | null; sets: number | null; reps: string | null;
  load_kg: number | null; rest_s: number | null; notes: string | null; order_index: number;
}

/** '8-12' -> {min: 8, max: 12}; '10' -> {min: 10, max: 10}; anything else -> null. */
export function parseReps(reps: string | null | undefined): { min: number; max: number } | null {
  const m = String(reps ?? '').trim().match(/^(\d{1,2})(?:\s*[-–a]\s*(\d{1,2}))?$/);
  if (!m) return null;
  const a = Number(m[1]);
  const b = m[2] ? Number(m[2]) : a;
  if (a < 1 || b < a) return null;
  return { min: a, max: b };
}

/**
 * The session(s) to train on a day: those scheduled for its weekday. When no
 * session is scheduled for that weekday, sessions without weekdays rotate in
 * order, starting after the last one trained.
 */
export function sessionsForDay(sessions: PlanSession[], workouts: Pick<Workout, 'date'>[] & { plan_session_id?: string | null }[], day: Day): PlanSession[] {
  const ordered = [...sessions].sort((a, b) => a.order_index - b.order_index);
  const scheduled = ordered.filter((s) => s.weekdays.includes(weekday(day)));
  if (scheduled.length) return scheduled;
  const rotating = ordered.filter((s) => s.weekdays.length === 0);
  if (!rotating.length) return [];
  const ids = new Set(rotating.map((s) => s.id));
  const last = [...workouts]
    .filter((w) => w.plan_session_id && ids.has(w.plan_session_id) && w.date < day)
    .sort((a, b) => b.date.localeCompare(a.date))[0];
  if (!last) return [rotating[0]];
  const i = rotating.findIndex((s) => s.id === last.plan_session_id);
  return [rotating[(i + 1) % rotating.length]];
}

export interface DraftSet {
  exercise_id: string;
  set_type_id: string;
  load_kg: number;
  reps: number;
  rest_s: number | null;
  effort: number | null;
  notes?: string | null;
}

/**
 * The sets to start a session with. Each plan exercise becomes its number of
 * working sets; the progression suggestion fills load and reps when there is
 * history, otherwise the plan's load and the bottom of its rep range.
 */
export function draftFromSession(
  exercises: PlanExercise[],
  ctx: { sets: WorkoutSet[]; workouts: Workout[]; types: Map<string, SetType>; settings: Map<string, ExerciseSettings>; workingTypeId: string; day: Day },
): DraftSet[] {
  const out: DraftSet[] = [];
  for (const pe of [...exercises].sort((a, b) => a.order_index - b.order_index)) {
    if (!pe.exercise_id) continue;
    const range = parseReps(pe.reps);
    const settings = ctx.settings.get(pe.exercise_id) ?? (range ? { ...DEFAULT_SETTINGS, rep_min: range.min, rep_max: range.max } : DEFAULT_SETTINGS);
    const count = Math.max(1, pe.sets ?? 3);
    const sug = suggestNext(lastWorkingSets(pe.exercise_id, ctx.sets, ctx.workouts, ctx.types, ctx.day), settings);
    for (let i = 0; i < count; i++) {
      let load = pe.load_kg ?? 0;
      let reps = range?.min ?? settings.rep_min;
      if (sug) {
        load = sug.load_kg;
        reps = sug.action === 'increase_reps' ? sug.reps[Math.min(i, sug.reps.length - 1)] : sug.reps;
      }
      out.push({
        exercise_id: pe.exercise_id,
        set_type_id: ctx.workingTypeId,
        load_kg: load,
        reps,
        rest_s: pe.rest_s,
        effort: null,
        ...(pe.notes ? { notes: pe.notes } : {}),
      });
    }
  }
  return out;
}
