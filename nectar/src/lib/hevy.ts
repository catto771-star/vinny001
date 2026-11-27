// Hevy-inspired training domain engine:
// - 1..30 rep empirical 1RM table (Hevy `ao` curve)
// - Multi-modality session calorie burn engine (strength, calisthenics, functional/HIIT, mobility, sports, cardio)
// - Set indicator classification & numbering (`W`, `1..N`, `D`, `F`)
// - Weighted muscle distribution (`1.0x` primary + `0.5x` secondary) & front/back body heatmap
// - Routine duration estimator (`45s/set + rest_s`, `0s` extra rest on dropsets)
// - Structured metadata tags on existing `notes` columns (zero-migration backward compatibility)
// - Plate & warm-up set calculator, preset programs, monthly training calendar/streak, and Hevy/Strong CSV I/O.

import { addDays, parseDay, type Day } from './dates';
import { searchKey } from './text';
import {
  cardioKcal, MUSCLE_LABEL, weekStart,
  type CardioSession, type Exercise, type SetType, type Workout, type WorkoutSet,
} from './training';

const round = (n: number, d = 1) => Math.round(n * 10 ** d) / 10 ** d;

// ---------------------------------------------------------------------------
// 1. Empirical 1RM Table (1..30 reps, exact Hevy percentage coefficients)
// ---------------------------------------------------------------------------

export const HEVY_1RM_COEFF: Record<number, number> = {
  1: 1.0, 2: 0.97, 3: 0.94, 4: 0.92, 5: 0.89,
  6: 0.86, 7: 0.83, 8: 0.81, 9: 0.78, 10: 0.75,
  11: 0.73, 12: 0.71, 13: 0.70, 14: 0.68, 15: 0.67,
  16: 0.65, 17: 0.64, 18: 0.63, 19: 0.61, 20: 0.60,
  21: 0.59, 22: 0.58, 23: 0.57, 24: 0.56, 25: 0.55,
  26: 0.54, 27: 0.53, 28: 0.52, 29: 0.51, 30: 0.50,
};

/** Estimated 1RM using Hevy's 1..30 rep percentage table. */
export function hevy1RM(loadKg: number, reps: number): number | null {
  if (loadKg <= 0 || reps < 1) return null;
  const r = Math.round(reps);
  const coeff = r > 30 ? 0.5 : HEVY_1RM_COEFF[r] ?? 0.5;
  return round(loadKg / coeff, 1);
}

// ---------------------------------------------------------------------------
// 2. RPE Scale, Equipment Categories & Supersets
// ---------------------------------------------------------------------------

export const RPE_VALUES = [6, 6.5, 7, 7.5, 8, 8.5, 9, 9.5, 10] as const;

export const RPE_HINT: Record<number, string> = {
  6: '4+ reps na reserva (leve/técnico)',
  6.5: '3–4 reps na reserva',
  7: '3 reps na reserva (moderado)',
  7.5: '2–3 reps na reserva',
  8: '2 reps na reserva (forte)',
  8.5: '1–2 reps na reserva',
  9: '1 rep na reserva (quase falha)',
  9.5: '0–1 rep na reserva (limite)',
  10: 'Falha máxima (0 na reserva)',
};

export const EQUIPMENT_OPTIONS = [
  { id: 'barra', label: 'Barra' },
  { id: 'halteres', label: 'Halteres' },
  { id: 'máquina', label: 'Máquina' },
  { id: 'cabo', label: 'Polia / Cabo' },
  { id: 'peso corporal', label: 'Peso corporal' },
  { id: 'kettlebell', label: 'Kettlebell' },
  { id: 'anilha', label: 'Anilha' },
  { id: 'elástico', label: 'Elástico' },
  { id: 'outro', label: 'Outro' },
] as const;

export const SUPERSET_IDS = ['A', 'B', 'C', 'D', 'E'] as const;
export type SupersetId = (typeof SUPERSET_IDS)[number];

export const SUPERSET_STYLE: Record<string, { border: string; badge: string; label: string }> = {
  A: { border: 'border-l-2 border-l-brand', badge: 'bg-brand/15 text-brand-ink border-brand/30', label: 'Superset A' },
  B: { border: 'border-l-2 border-l-info', badge: 'bg-info/15 text-info border-info/30', label: 'Superset B' },
  C: { border: 'border-l-2 border-l-positive', badge: 'bg-positive/15 text-positive border-positive/30', label: 'Superset C' },
  D: { border: 'border-l-2 border-l-warning', badge: 'bg-warning/15 text-warning border-warning/30', label: 'Superset D' },
  E: { border: 'border-l-2 border-l-fg2', badge: 'bg-raised text-fg2 border-line-strong', label: 'Superset E' },
};

// ---------------------------------------------------------------------------
// 3. Set Indicators (`W`, `1..N`, `D`, `F`) & Structured Metadata Parsers
// ---------------------------------------------------------------------------

export type SetIndicator = 'warmup' | 'normal' | 'dropset' | 'failure';

export function classifySetIndicator(typeName: string | undefined | null, explicit?: SetIndicator | null): SetIndicator {
  if (explicit) return explicit;
  const k = searchKey(typeName ?? '');
  if (k.includes('aquecimento') || k.includes('warm') || k.includes('feeder')) return 'warmup';
  if (k.includes('drop')) return 'dropset';
  if (k.includes('falha') || k.includes('failure')) return 'failure';
  return 'normal';
}

export interface NumberedSetInfo {
  indicator: SetIndicator;
  badge: string; // 'W', 'D', 'F', or '1', '2', ...
}

/**
 * Exact Hevy numbering (`aq`/`aE`):
 * - Warmup -> 'W' (does not increment working set number)
 * - Dropset -> 'D' (does not increment working set number)
 * - Failure -> 'F' (increments working set number!)
 * - Normal -> '1', '2', '3'...
 */
export function numberSetsLikeHevy(indicators: readonly SetIndicator[]): NumberedSetInfo[] {
  let workingIdx = 0;
  return indicators.map((ind) => {
    if (ind === 'warmup') return { indicator: ind, badge: 'W' };
    if (ind === 'dropset') return { indicator: ind, badge: 'D' };
    workingIdx += 1;
    if (ind === 'failure') return { indicator: ind, badge: 'F' };
    return { indicator: 'normal', badge: String(workingIdx) };
  });
}

// Structured, clean metadata tags embedded at the start of existing `notes` fields
// so every feature persists cleanly on existing Supabase tables without breaking text notes.

export type SessionModality = 'musculacao' | 'calistenia' | 'funcional' | 'mobilidade' | 'esporte' | 'outro';

export const SESSION_MODALITIES: { id: SessionModality; label: string; baseMet: number }[] = [
  { id: 'musculacao', label: 'Musculação', baseMet: 5.0 },
  { id: 'calistenia', label: 'Calistenia', baseMet: 5.5 },
  { id: 'funcional', label: 'Funcional / HIIT', baseMet: 7.4 },
  { id: 'mobilidade', label: 'Mobilidade / Yoga', baseMet: 3.0 },
  { id: 'esporte', label: 'Esporte', baseMet: 6.8 },
  { id: 'outro', label: 'Outra atividade', baseMet: 4.8 },
];

export interface ParsedWorkoutNotes {
  modality: SessionModality;
  manualKcal: number | null;
  cleanNotes: string;
}

export function parseWorkoutNotes(raw: string | null | undefined, row?: { session_type?: string | null; kcal?: number | null }): ParsedWorkoutNotes {
  let text = String(raw ?? '');
  let modality: SessionModality = 'musculacao';
  let manualKcal: number | null = row?.kcal != null ? Number(row.kcal) : null;
  if (row?.session_type && SESSION_MODALITIES.some((m) => m.id === row.session_type)) {
    modality = row.session_type as SessionModality;
  }
  const modMatch = text.match(/\[mod:([a-z_]+)\]/i);
  if (modMatch && SESSION_MODALITIES.some((m) => m.id === modMatch[1])) {
    modality = modMatch[1] as SessionModality;
  }
  const kcalMatch = text.match(/\[kcal:(\d+(?:\.\d+)?)\]/i);
  if (kcalMatch && manualKcal === null) {
    manualKcal = Math.round(Number(kcalMatch[1]));
  }
  text = text.replace(/\[(?:mod|kcal):[^\]]+\]\s*/gi, '').trim();
  return { modality, manualKcal, cleanNotes: text };
}

export function formatWorkoutNotes(meta: { modality?: SessionModality; manualKcal?: number | null; cleanNotes?: string | null }): string | null {
  const tags: string[] = [];
  if (meta.modality && meta.modality !== 'musculacao') tags.push(`[mod:${meta.modality}]`);
  if (meta.manualKcal != null && Number.isFinite(meta.manualKcal) && meta.manualKcal >= 0) {
    tags.push(`[kcal:${Math.round(meta.manualKcal)}]`);
  }
  const body = (meta.cleanNotes ?? '').trim();
  const full = [...tags, body].filter(Boolean).join(' ').trim();
  return full || null;
}

export interface ParsedSetNotes {
  superset: string | null;
  indicator: SetIndicator | null;
  cleanNotes: string;
}

export function parseSetNotes(raw: string | null | undefined, row?: { superset_group?: string | null }): ParsedSetNotes {
  let text = String(raw ?? '');
  let superset: string | null = row?.superset_group ?? null;
  let indicator: SetIndicator | null = null;
  const ssMatch = text.match(/\[ss:([A-Z0-9]+)\]/i);
  if (ssMatch && !superset) superset = ssMatch[1].toUpperCase();
  const indMatch = text.match(/\[ind:(warmup|normal|dropset|failure)\]/i);
  if (indMatch) indicator = indMatch[1].toLowerCase() as SetIndicator;
  text = text.replace(/\[(?:ss|ind):[^\]]+\]\s*/gi, '').trim();
  return { superset, indicator, cleanNotes: text };
}

export function formatSetNotes(meta: { superset?: string | null; indicator?: SetIndicator | null; cleanNotes?: string | null }): string | null {
  const tags: string[] = [];
  if (meta.superset) tags.push(`[ss:${meta.superset.toUpperCase()}]`);
  if (meta.indicator === 'failure') tags.push('[ind:failure]');
  const body = (meta.cleanNotes ?? '').trim();
  const full = [...tags, body].filter(Boolean).join(' ').trim();
  return full || null;
}

export interface ParsedSessionNotes {
  folder: string | null;
  cleanNotes: string;
}

export function parseSessionNotes(raw: string | null | undefined): ParsedSessionNotes {
  let text = String(raw ?? '');
  let folder: string | null = null;
  const m = text.match(/\[pasta:([^\]]+)\]/i);
  if (m) folder = m[1].trim() || null;
  text = text.replace(/\[pasta:[^\]]+\]\s*/gi, '').trim();
  return { folder, cleanNotes: text };
}

export function formatSessionNotes(meta: { folder?: string | null; cleanNotes?: string | null }): string | null {
  const tags: string[] = [];
  if (meta.folder?.trim()) tags.push(`[pasta:${meta.folder.trim()}]`);
  const body = (meta.cleanNotes ?? '').trim();
  const full = [...tags, body].filter(Boolean).join(' ').trim();
  return full || null;
}

// ---------------------------------------------------------------------------
// 4. Routine Duration Estimator & Multi-Modality Session Calorie Burn Engine
// ---------------------------------------------------------------------------

/**
 * Exact Hevy duration estimator (`ar`):
 * - Time under tension / execution per set = 45s (default lifting set)
 * - Rest per set = `rest_s ?? 90`s, EXCEPT dropsets which add 0s extra rest!
 */
export function estimateSetsDurationMinutes(
  sets: readonly { rest_s?: number | null; indicator?: SetIndicator; duration_s?: number | null }[],
): number {
  if (!sets.length) return 0;
  let totalSec = 0;
  for (const s of sets) {
    const execSec = s.duration_s && s.duration_s > 0 ? s.duration_s : 45;
    const restSec = s.indicator === 'dropset' ? 0 : (s.rest_s ?? 90);
    totalSec += execSec + restSec;
  }
  return Math.max(1, Math.round(totalSec / 60));
}

export interface SessionCalorieResult {
  kcal: number;
  estimated: boolean;
  durationMin: number;
  met: number;
  modality: SessionModality;
}

/**
 * Calculates calories burned during ANY workout session (strength, calisthenics,
 * functional/HIIT, mobility, sport, or other).
 *
 * - Uses recorded `kcal` (from watch/manual override) when available.
 * - Preserves exact `5.0 MET * weightKg * hours` baseline for plain lifting workouts
 *   without set rows (matching existing energy balance contract), while dynamically
 *   incorporating training density (`tonnage / min`), RPE effort, supersets, mechanical
 *   work, and estimated duration (`45s/set + rest_s`) when sets are logged!
 */
export function workoutKcal(
  workout: Pick<Workout, 'duration_min'> & { notes?: string | null; session_type?: string | null; kcal?: number | null },
  sets: readonly (Pick<WorkoutSet, 'load_kg' | 'reps' | 'rest_s' | 'effort' | 'set_type_id'> & { notes?: string | null })[],
  types: ReadonlyMap<string, SetType>,
  weightKg: number,
): SessionCalorieResult {
  const cleanWeight = weightKg > 0 ? weightKg : 75;
  const parsed = parseWorkoutNotes(workout.notes, workout);
  const modMeta = SESSION_MODALITIES.find((m) => m.id === parsed.modality) ?? SESSION_MODALITIES[0];

  const enrichedSets = sets.map((s) => {
    const t = types.get(s.set_type_id);
    const sn = parseSetNotes(s.notes);
    return {
      ...s,
      countsVol: t?.counts_for_volume ?? true,
      indicator: classifySetIndicator(t?.name, sn.indicator),
      superset: sn.superset,
    };
  });

  const inferredDuration = workout.duration_min && workout.duration_min > 0
    ? workout.duration_min
    : estimateSetsDurationMinutes(enrichedSets);

  if (parsed.manualKcal !== null) {
    const effMet = inferredDuration > 0 ? round(parsed.manualKcal / (cleanWeight * (inferredDuration / 60)), 1) : modMeta.baseMet;
    return {
      kcal: parsed.manualKcal,
      estimated: false,
      durationMin: inferredDuration,
      met: effMet,
      modality: parsed.modality,
    };
  }

  if (inferredDuration <= 0) {
    return { kcal: 0, estimated: true, durationMin: 0, met: modMeta.baseMet, modality: parsed.modality };
  }

  // Baseline when no sets are attached (e.g. quick duration-only log): pure modality MET
  if (!enrichedSets.length) {
    return {
      kcal: Math.round(modMeta.baseMet * cleanWeight * (inferredDuration / 60)),
      estimated: true,
      durationMin: inferredDuration,
      met: modMeta.baseMet,
      modality: parsed.modality,
    };
  }

  // Dynamic intensity adjustment from density, RPE, and supersets when sets are present
  const volSets = enrichedSets.filter((s) => s.countsVol && s.reps > 0);
  const tonnage = volSets.reduce((sum, s) => sum + Math.max(0, s.load_kg) * Math.max(0, s.reps), 0);
  const densityKgMin = tonnage / inferredDuration;
  const efforts = volSets.map((s) => s.effort).filter((e): e is number => e != null && e > 0);
  const avgRpe = efforts.length ? efforts.reduce((a, b) => a + b, 0) / efforts.length : null;
  const hasSupersets = enrichedSets.some((s) => !!s.superset);

  let met = modMeta.baseMet;
  if (parsed.modality === 'musculacao' || parsed.modality === 'calistenia') {
    // Density delta: ~100 kg/min is typical hypertrophy (0 delta); <40 is light (-0.6), >180 is very dense (+0.8)
    const densityDelta = Math.max(-0.7, Math.min(0.9, (densityKgMin - 100) / 140));
    const rpeDelta = avgRpe != null ? Math.max(-0.3, Math.min(0.6, (avgRpe - 7.5) * 0.25)) : 0;
    const supersetBonus = hasSupersets ? 0.35 : 0;
    met = round(Math.max(3.5, Math.min(6.8, modMeta.baseMet + densityDelta + rpeDelta + supersetBonus)), 1);
  } else if (avgRpe != null) {
    met = round(Math.max(2.5, Math.min(9.5, modMeta.baseMet + (avgRpe - 7.5) * 0.3)), 1);
  }

  // Mechanical work bonus (~0.004 kcal per kg lifted above baseline, capped at +90 kcal)
  const mechBonus = Math.min(90, tonnage * 0.004);
  const kcal = Math.round(met * cleanWeight * (inferredDuration / 60) + mechBonus);

  return {
    kcal,
    estimated: true,
    durationMin: inferredDuration,
    met,
    modality: parsed.modality,
  };
}

/** Unified daily training burn across all strength/modality workouts AND cardio sessions. */
export function dailyTrainingBurn(params: {
  day: Day;
  workouts: readonly (Workout & { notes?: string | null; session_type?: string | null; kcal?: number | null })[];
  sets: readonly (WorkoutSet & { notes?: string | null })[];
  cardio: readonly CardioSession[];
  types: ReadonlyMap<string, SetType>;
  weightKg: number;
}): { totalKcal: number; workoutKcal: number; cardioKcal: number; totalMinutes: number; sessionsCount: number; estimated: boolean } {
  const { day, workouts, sets, cardio, types, weightKg } = params;
  let wKcal = 0;
  let cKcal = 0;
  let mins = 0;
  let count = 0;
  let estimated = false;

  for (const w of workouts.filter((x) => x.date === day)) {
    const wSets = sets.filter((s) => s.workout_id === w.id);
    const res = workoutKcal(w, wSets, types, weightKg);
    wKcal += res.kcal;
    mins += res.durationMin;
    count += 1;
    estimated ||= res.estimated;
  }
  for (const c of cardio.filter((x) => x.date === day)) {
    const res = cardioKcal(c, weightKg);
    cKcal += res.kcal;
    mins += Math.round(c.duration_s / 60);
    count += 1;
    estimated ||= res.estimated;
  }
  return {
    totalKcal: wKcal + cKcal,
    workoutKcal: wKcal,
    cardioKcal: cKcal,
    totalMinutes: mins,
    sessionsCount: count,
    estimated,
  };
}

// ---------------------------------------------------------------------------
// 5. Weighted Muscle Distribution (`1.0x` primary + `0.5x` secondary) & Heatmap
// ---------------------------------------------------------------------------

export interface WeightedMuscleRow {
  muscle_group: string;
  label: string;
  primarySets: number;
  secondarySets: number;
  weightedSets: number; // primary + 0.5 * secondary
  intensity: number; // 0..1 relative to max muscle
}

/**
 * Exact Hevy muscle distribution (`aI`/`aO`/`aM`):
 * - Primary muscle gets `1.0 * sets`
 * - Each secondary muscle in `exercise.secondary_muscles` gets `0.5 * sets`
 */
export function weightedMuscleDistribution(
  sets: readonly WorkoutSet[],
  exercises: ReadonlyMap<string, Exercise>,
  types: ReadonlyMap<string, SetType>,
  includeWarmups = false,
): WeightedMuscleRow[] {
  const prim = new Map<string, number>();
  const sec = new Map<string, number>();

  for (const s of sets) {
    if (s.reps <= 0) continue;
    const t = types.get(s.set_type_id);
    if (!includeWarmups && !(t?.counts_for_volume ?? true)) continue;
    const ex = exercises.get(s.exercise_id);
    if (!ex) continue;
    prim.set(ex.muscle_group, (prim.get(ex.muscle_group) ?? 0) + 1);
    for (const sm of ex.secondary_muscles ?? []) {
      if (sm && sm !== ex.muscle_group) {
        sec.set(sm, (sec.get(sm) ?? 0) + 1);
      }
    }
  }

  const allKeys = new Set([...Object.keys(MUSCLE_LABEL), ...prim.keys(), ...sec.keys()]);
  const rows: WeightedMuscleRow[] = [];
  let maxWeighted = 0;

  for (const k of allKeys) {
    const p = prim.get(k) ?? 0;
    const sc = sec.get(k) ?? 0;
    const w = round(p + 0.5 * sc, 1);
    if (w <= 0) continue;
    if (w > maxWeighted) maxWeighted = w;
    rows.push({
      muscle_group: k,
      label: MUSCLE_LABEL[k] ?? k,
      primarySets: p,
      secondarySets: sc,
      weightedSets: w,
      intensity: 0,
    });
  }

  return rows
    .map((r) => ({ ...r, intensity: maxWeighted > 0 ? round(r.weightedSets / maxWeighted, 2) : 0 }))
    .sort((a, b) => b.weightedSets - a.weightedSets || a.label.localeCompare(b.label, 'pt'));
}

export interface MuscleSymmetrySummary {
  pushSets: number;
  pullSets: number;
  legsSets: number;
  coreSets: number;
  pushPullRatio: number | null;
  upperLowerRatio: number | null;
  balanceNote: string;
}

export function analyzeMuscleSymmetry(rows: readonly WeightedMuscleRow[]): MuscleSymmetrySummary {
  const get = (k: string) => rows.find((r) => r.muscle_group === k)?.weightedSets ?? 0;
  const pushSets = round(get('peito') + get('ombros') + get('triceps'), 1);
  const pullSets = round(get('costas') + get('biceps') + get('antebraco'), 1);
  const legsSets = round(get('quadriceps') + get('posteriores') + get('gluteos') + get('panturrilhas'), 1);
  const coreSets = round(get('abdomen') + get('corpo_inteiro'), 1);
  const upper = pushSets + pullSets;

  const pushPullRatio = pullSets > 0 ? round(pushSets / pullSets, 2) : null;
  const upperLowerRatio = legsSets > 0 ? round(upper / legsSets, 2) : null;

  let balanceNote = 'Distribuição muscular equilibrada no período.';
  if (pushSets + pullSets + legsSets === 0) {
    balanceNote = 'Registre séries para avaliar simetria entre cadeias musculares.';
  } else if (pullSets === 0 && pushSets >= 4) {
    balanceNote = 'Atenção: estímulo de empurrar sem séries de puxar (costas/bíceps).';
  } else if (pushPullRatio != null && pushPullRatio > 1.5) {
    balanceNote = `Predominância de empurrar (${pushPullRatio}× sobre puxar) — reforce remadas/puxadas.`;
  } else if (pushPullRatio != null && pushPullRatio < 0.65) {
    balanceNote = `Predominância de puxar — espaço para reforçar peito/ombros.`;
  } else if (legsSets === 0 && upper >= 6) {
    balanceNote = 'Membros inferiores ainda sem volume registrado neste período.';
  }

  return { pushSets, pullSets, legsSets, coreSets, pushPullRatio, upperLowerRatio, balanceNote };
}

// ---------------------------------------------------------------------------
// 6. Plate Calculator & Auto Warm-Up Set Generator
// ---------------------------------------------------------------------------

export const STANDARD_PLATES_KG = [25, 20, 15, 10, 5, 2.5, 1.25] as const;

export interface PlateBreakdown {
  targetKg: number;
  barKg: number;
  achievableKg: number;
  perSide: { plateKg: number; count: number }[];
}

export function calculatePlatesPerSide(
  targetKg: number,
  barKg = 20,
  availablePlates: readonly number[] = STANDARD_PLATES_KG,
): PlateBreakdown {
  if (targetKg <= barKg) {
    return { targetKg, barKg, achievableKg: barKg, perSide: [] };
  }
  let rem = (targetKg - barKg) / 2;
  const perSide: { plateKg: number; count: number }[] = [];
  let loadedPerSide = 0;
  for (const p of [...availablePlates].sort((a, b) => b - a)) {
    if (p <= 0) continue;
    const count = Math.floor((rem + 1e-6) / p);
    if (count > 0) {
      perSide.push({ plateKg: p, count });
      rem -= count * p;
      loadedPerSide += count * p;
    }
  }
  return {
    targetKg,
    barKg,
    achievableKg: round(barKg + loadedPerSide * 2, 2),
    perSide,
  };
}

/** Generates progressive Hevy-style warm-up ramp sets (50% x 8, 70% x 5, 85% x 3) rounded to 2.5 kg. */
export function generateWarmupRamp(workingLoadKg: number): { load_kg: number; reps: number; pct: number }[] {
  if (workingLoadKg < 20) return [];
  const snap = (x: number) => Math.max(5, Math.round(x / 2.5) * 2.5);
  return [
    { pct: 50, load_kg: snap(workingLoadKg * 0.5), reps: 8 },
    { pct: 70, load_kg: snap(workingLoadKg * 0.7), reps: 5 },
    { pct: 85, load_kg: snap(workingLoadKg * 0.85), reps: 3 },
  ];
}

// ---------------------------------------------------------------------------
// 7. Curated Preset Programs (Hevy Program Library)
// ---------------------------------------------------------------------------

export interface PresetRoutineSpec {
  label: string;
  weekdays: number[];
  notes: string;
  exercises: {
    name: string;
    sets: number;
    reps: string;
    rest_s: number;
    superset?: SupersetId;
    notes?: string;
  }[];
}

export interface PresetProgram {
  id: string;
  title: string;
  folder: string;
  level: 'Iniciante' | 'Intermediário' | 'Avançado';
  equipment: 'Academia' | 'Halteres' | 'Peso corporal';
  daysPerWeek: number;
  goal: string;
  summary: string;
  routines: PresetRoutineSpec[];
}

export const PRESET_PROGRAMS: readonly PresetProgram[] = [
  {
    id: 'ppl-classic',
    title: 'Push / Pull / Legs (PPL)',
    folder: 'PPL Hipertrofia',
    level: 'Intermediário',
    equipment: 'Academia',
    daysPerWeek: 3,
    goal: 'Hipertrofia e força equilibrada',
    summary: 'Divisão clássica do Hevy separando cadeias de empurrar, puxar e membros inferiores com supersets de braços/ombros.',
    routines: [
      {
        label: 'Push · Peito, Ombros e Tríceps',
        weekdays: [1],
        notes: 'Foco em tensão mecânica nos compostos e bi-set metabólico no final.',
        exercises: [
          { name: 'Supino reto com barra', sets: 4, reps: '6-8', rest_s: 150 },
          { name: 'Supino inclinado com halteres', sets: 3, reps: '8-10', rest_s: 120 },
          { name: 'Desenvolvimento com halteres', sets: 3, reps: '8-12', rest_s: 120 },
          { name: 'Elevação lateral com halteres', sets: 3, reps: '12-15', rest_s: 60, superset: 'A' },
          { name: 'Tríceps corda', sets: 3, reps: '10-12', rest_s: 75, superset: 'A' },
        ],
      },
      {
        label: 'Pull · Costas, Posterior de Ombro e Bíceps',
        weekdays: [3],
        notes: 'Controle excêntrico nas puxadas e remadas.',
        exercises: [
          { name: 'Puxada frontal', sets: 4, reps: '8-10', rest_s: 120 },
          { name: 'Remada curvada com barra', sets: 3, reps: '6-10', rest_s: 150 },
          { name: 'Remada baixa no cabo', sets: 3, reps: '10-12', rest_s: 90 },
          { name: 'Face pull', sets: 3, reps: '12-15', rest_s: 60, superset: 'A' },
          { name: 'Rosca direta com barra', sets: 3, reps: '8-12', rest_s: 75, superset: 'A' },
        ],
      },
      {
        label: 'Legs · Quadríceps, Posteriores e Glúteos',
        weekdays: [5],
        notes: 'Amplitude completa e progressão consistente.',
        exercises: [
          { name: 'Agachamento livre', sets: 4, reps: '6-8', rest_s: 180 },
          { name: 'Levantamento terra romeno', sets: 3, reps: '8-10', rest_s: 150 },
          { name: 'Leg press 45°', sets: 3, reps: '10-12', rest_s: 120 },
          { name: 'Mesa flexora', sets: 3, reps: '10-12', rest_s: 90 },
          { name: 'Panturrilha em pé', sets: 4, reps: '12-15', rest_s: 60 },
        ],
      },
    ],
  },
  {
    id: 'upper-lower-4x',
    title: 'Upper / Lower · 4x na Semana',
    folder: 'Upper Lower 4x',
    level: 'Intermediário',
    equipment: 'Academia',
    daysPerWeek: 4,
    goal: 'Frequência 2x por grupo muscular',
    summary: 'Alta eficiência científica: estimula cada grupo muscular duas vezes na semana com ótimo descanso.',
    routines: [
      {
        label: 'Upper A · Força Superior',
        weekdays: [1],
        notes: 'Prioridade em cargas altas nos multiarticulares.',
        exercises: [
          { name: 'Supino reto com barra', sets: 4, reps: '5-8', rest_s: 150 },
          { name: 'Remada curvada com barra', sets: 4, reps: '6-8', rest_s: 150 },
          { name: 'Desenvolvimento com halteres', sets: 3, reps: '8-10', rest_s: 120 },
          { name: 'Puxada com triângulo', sets: 3, reps: '8-12', rest_s: 90 },
          { name: 'Tríceps pulley', sets: 3, reps: '10-12', rest_s: 60, superset: 'A' },
          { name: 'Rosca martelo', sets: 3, reps: '10-12', rest_s: 60, superset: 'A' },
        ],
      },
      {
        label: 'Lower A · Foco Quadríceps',
        weekdays: [2],
        notes: 'Base sólida de agachamento e unilateral.',
        exercises: [
          { name: 'Agachamento livre', sets: 4, reps: '6-8', rest_s: 180 },
          { name: 'Stiff', sets: 3, reps: '8-10', rest_s: 120 },
          { name: 'Agachamento búlgaro', sets: 3, reps: '8-10', rest_s: 120 },
          { name: 'Cadeira extensora', sets: 3, reps: '12-15', rest_s: 75 },
          { name: 'Panturrilha sentado', sets: 4, reps: '12-15', rest_s: 60 },
        ],
      },
      {
        label: 'Upper B · Hipertrofia Superior',
        weekdays: [4],
        notes: 'Volume moderado e controle de cadência.',
        exercises: [
          { name: 'Supino inclinado com halteres', sets: 4, reps: '8-12', rest_s: 120 },
          { name: 'Barra fixa', sets: 3, reps: '6-10', rest_s: 120 },
          { name: 'Remada unilateral com halter', sets: 3, reps: '10-12', rest_s: 90 },
          { name: 'Elevação lateral no cabo', sets: 4, reps: '12-15', rest_s: 60 },
          { name: 'Tríceps testa', sets: 3, reps: '10-12', rest_s: 60, superset: 'A' },
          { name: 'Rosca alternada com halteres', sets: 3, reps: '10-12', rest_s: 60, superset: 'A' },
        ],
      },
      {
        label: 'Lower B · Posterior & Glúteos',
        weekdays: [5],
        notes: 'Cadeia posterior + core.',
        exercises: [
          { name: 'Levantamento terra romeno', sets: 4, reps: '6-10', rest_s: 150 },
          { name: 'Elevação pélvica (hip thrust)', sets: 4, reps: '8-12', rest_s: 120 },
          { name: 'Leg press 45°', sets: 3, reps: '10-12', rest_s: 120 },
          { name: 'Cadeira flexora', sets: 3, reps: '10-15', rest_s: 75 },
          { name: 'Abdominal na polia', sets: 3, reps: '12-15', rest_s: 60 },
        ],
      },
    ],
  },
  {
    id: 'full-body-3x',
    title: 'Full Body Essencial · 3x',
    folder: 'Full Body',
    level: 'Iniciante',
    equipment: 'Academia',
    daysPerWeek: 3,
    goal: 'Consistência e ganho global em 45 min',
    summary: 'Ideal para rotinas ocupadas: três sessões enxutas de corpo inteiro com altíssimo retorno metabólico.',
    routines: [
      {
        label: 'Full Body A',
        weekdays: [1, 5],
        notes: 'Sessão base multiarticular.',
        exercises: [
          { name: 'Agachamento goblet', sets: 3, reps: '8-12', rest_s: 120 },
          { name: 'Supino reto com halteres', sets: 3, reps: '8-12', rest_s: 120 },
          { name: 'Puxada frontal', sets: 3, reps: '8-12', rest_s: 90 },
          { name: 'Stiff', sets: 3, reps: '10-12', rest_s: 90 },
          { name: 'Prancha', sets: 3, reps: '1', rest_s: 60, notes: '45 segundos isometria' },
        ],
      },
      {
        label: 'Full Body B',
        weekdays: [3],
        notes: 'Variação de ângulos e cadeia posterior.',
        exercises: [
          { name: 'Leg press 45°', sets: 3, reps: '10-12', rest_s: 120 },
          { name: 'Desenvolvimento com halteres', sets: 3, reps: '8-12', rest_s: 90 },
          { name: 'Remada baixa no cabo', sets: 3, reps: '10-12', rest_s: 90 },
          { name: 'Elevação pélvica (hip thrust)', sets: 3, reps: '10-12', rest_s: 90 },
          { name: 'Abdominal supra', sets: 3, reps: '12-15', rest_s: 60 },
        ],
      },
    ],
  },
  {
    id: 'dumbbells-only',
    title: 'Apenas Halteres (Casa / Viagem)',
    folder: 'Halteres',
    level: 'Intermediário',
    equipment: 'Halteres',
    daysPerWeek: 3,
    goal: 'Treino completo usando apenas um par de halteres',
    summary: 'Perfeito para condomínio, home gym ou viagens sem máquinas nem cabos.',
    routines: [
      {
        label: 'Halteres · Superior',
        weekdays: [1, 4],
        notes: 'Supersets antagonistas para máxima densidade.',
        exercises: [
          { name: 'Supino reto com halteres', sets: 4, reps: '8-12', rest_s: 90, superset: 'A' },
          { name: 'Remada unilateral com halter', sets: 4, reps: '8-12', rest_s: 90, superset: 'A' },
          { name: 'Desenvolvimento com halteres', sets: 3, reps: '8-12', rest_s: 90 },
          { name: 'Elevação lateral com halteres', sets: 3, reps: '12-15', rest_s: 60, superset: 'B' },
          { name: 'Rosca alternada com halteres', sets: 3, reps: '10-12', rest_s: 60, superset: 'B' },
          { name: 'Tríceps francês', sets: 3, reps: '10-12', rest_s: 60 },
        ],
      },
      {
        label: 'Halteres · Inferior & Core',
        weekdays: [2, 5],
        notes: 'Foco unilateral para compensar carga moderada.',
        exercises: [
          { name: 'Agachamento goblet', sets: 4, reps: '10-15', rest_s: 90 },
          { name: 'Agachamento búlgaro', sets: 3, reps: '8-12', rest_s: 90 },
          { name: 'Afundo (avanço)', sets: 3, reps: '10-12', rest_s: 90 },
          { name: 'Crucifixo invertido', sets: 3, reps: '12-15', rest_s: 60 },
          { name: 'Elevação de pernas', sets: 3, reps: '12-15', rest_s: 60 },
        ],
      },
    ],
  },
];

// ---------------------------------------------------------------------------
// 8. Monthly Consistency Calendar & Active Week Streak
// ---------------------------------------------------------------------------

export interface TrainingCalendarCell {
  date: Day;
  dayOfMonth: number;
  inMonth: boolean;
  workoutsCount: number;
  cardioCount: number;
  kcalBurned: number;
}

export function buildTrainingCalendarMonth(params: {
  year: number;
  month: number; // 1..12
  workouts: readonly (Workout & { notes?: string | null; session_type?: string | null; kcal?: number | null })[];
  sets: readonly (WorkoutSet & { notes?: string | null })[];
  cardio: readonly CardioSession[];
  types: ReadonlyMap<string, SetType>;
  weightKg: number;
}): TrainingCalendarCell[] {
  const { year, month, workouts, sets, cardio, types, weightKg } = params;
  const firstOfMonth = `${year}-${String(month).padStart(2, '0')}-01` as Day;
  const startGrid = weekStart(firstOfMonth); // Monday-aligned 6x7 or 5x7 grid
  const daysInMonth = new Date(year, month, 0).getDate();
  const lastOfMonth = `${year}-${String(month).padStart(2, '0')}-${String(daysInMonth).padStart(2, '0')}` as Day;
  const endMonday = weekStart(lastOfMonth);
  const totalCells = Math.round((parseDay(addDays(endMonday, 7)).getTime() - parseDay(startGrid).getTime()) / 86400000);

  const cells: TrainingCalendarCell[] = [];
  for (let i = 0; i < totalCells; i++) {
    const d = addDays(startGrid, i);
    const inMonth = Number(d.slice(5, 7)) === month;
    const wCount = workouts.filter((w) => w.date === d).length;
    const cCount = cardio.filter((c) => c.date === d).length;
    const burn = wCount + cCount > 0
      ? dailyTrainingBurn({ day: d, workouts, sets, cardio, types, weightKg }).totalKcal
      : 0;
    cells.push({
      date: d,
      dayOfMonth: Number(d.slice(8, 10)),
      inMonth,
      workoutsCount: wCount,
      cardioCount: cCount,
      kcalBurned: burn,
    });
  }
  return cells;
}

/** Counts consecutive weeks (up to current or previous week) with at least 1 training or cardio session. */
export function computeWeeklyTrainingStreak(today: Day, trainedDays: ReadonlySet<Day>): number {
  const curMon = weekStart(today);
  const hasInWeek = (mon: Day) => {
    for (let i = 0; i < 7; i++) {
      if (trainedDays.has(addDays(mon, i))) return true;
    }
    return false;
  };
  let streak = 0;
  let cursor = hasInWeek(curMon) ? curMon : addDays(curMon, -7);
  for (let guard = 0; guard < 260; guard++) {
    if (!hasInWeek(cursor)) break;
    streak += 1;
    cursor = addDays(cursor, -7);
  }
  return streak;
}

// ---------------------------------------------------------------------------
// 9. Hevy / Strong 14-Column CSV Export & Import
// ---------------------------------------------------------------------------

export const HEVY_CSV_HEADERS = [
  'title', 'start_time', 'end_time', 'description', 'exercise_title', 'superset_id',
  'exercise_notes', 'set_index', 'set_type', 'weight_kg', 'reps', 'distance_km',
  'duration_seconds', 'rpe',
] as const;

function csvEscape(val: string | number | null | undefined): string {
  if (val === null || val === undefined) return '';
  const s = String(val);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

/** Exports logged workouts in Hevy's official 14-column CSV format. */
export function exportWorkoutsHevyCsv(params: {
  workouts: readonly (Workout & { notes?: string | null; session_type?: string | null; kcal?: number | null })[];
  sets: readonly (WorkoutSet & { notes?: string | null })[];
  exercises: ReadonlyMap<string, Exercise>;
  types: ReadonlyMap<string, SetType>;
}): string {
  const { workouts, sets, exercises, types } = params;
  const lines: string[] = [HEVY_CSV_HEADERS.join(',')];
  const sortedWorkouts = [...workouts].sort((a, b) => b.date.localeCompare(a.date));

  for (const w of sortedWorkouts) {
    const wMeta = parseWorkoutNotes(w.notes, w);
    const wSets = sets.filter((s) => s.workout_id === w.id).sort((a, b) => a.position - b.position);
    const startStr = `${w.date} 09:00`;
    const dur = w.duration_min ?? estimateSetsDurationMinutes(wSets);
    const endHour = 9 + Math.floor(dur / 60);
    const endMin = dur % 60;
    const endStr = `${w.date} ${String(Math.min(23, endHour)).padStart(2, '0')}:${String(endMin).padStart(2, '0')}`;

    const byEx = new Map<string, typeof wSets>();
    for (const s of wSets) {
      const list = byEx.get(s.exercise_id) ?? [];
      list.push(s);
      byEx.set(s.exercise_id, list);
    }

    for (const [exId, exSets] of byEx) {
      const exTitle = exercises.get(exId)?.name ?? 'Exercício';
      exSets.forEach((s, idx) => {
        const sMeta = parseSetNotes(s.notes);
        const ind = classifySetIndicator(types.get(s.set_type_id)?.name, sMeta.indicator);
        lines.push([
          csvEscape(w.title || 'Treino'),
          csvEscape(startStr),
          csvEscape(endStr),
          csvEscape(wMeta.cleanNotes),
          csvEscape(exTitle),
          csvEscape(sMeta.superset ?? ''),
          csvEscape(sMeta.cleanNotes),
          csvEscape(idx),
          csvEscape(ind),
          csvEscape(s.load_kg),
          csvEscape(s.reps),
          '',
          '',
          csvEscape(s.effort ?? ''),
        ].join(','));
      });
    }
  }
  return lines.join('\n');
}

function splitCsvRow(line: string, delimiter = ','): string[] {
  const out: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === delimiter && !inQuotes) {
      out.push(cur);
      cur = '';
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out.map((x) => x.trim());
}

export interface ImportedWorkoutDraft {
  date: Day;
  title: string;
  duration_min: number | null;
  description: string;
  sets: {
    exerciseName: string;
    load_kg: number;
    reps: number;
    indicator: SetIndicator;
    rpe: number | null;
    superset: string | null;
    notes: string;
  }[];
}

function extractIsoDay(raw: string): Day | null {
  const iso = raw.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  // Hevy English format e.g. "24 Nov 2026, 09:15"
  const months: Record<string, string> = {
    jan: '01', feb: '02', fev: '02', mar: '03', apr: '04', abr: '04', may: '05', mai: '05',
    jun: '06', jul: '07', aug: '08', ago: '08', sep: '09', set: '09', oct: '10', out: '10',
    nov: '11', dec: '12', dez: '12',
  };
  const m = raw.match(/(\d{1,2})\s+([A-Za-zçÇ]{3,})\s+(\d{4})/);
  if (m) {
    const mon = months[m[2].slice(0, 3).toLowerCase()];
    if (mon) return `${m[3]}-${mon}-${String(Number(m[1])).padStart(2, '0')}`;
  }
  return null;
}

/** Parses both Hevy (`title,start_time,exercise_title,weight_kg,reps...`) and Strong (`Date,Workout Name,Exercise Name,Weight,Reps...`) CSVs. */
export function parseHevyOrStrongCsv(csvText: string): ImportedWorkoutDraft[] {
  const clean = csvText.replace(/^\uFEFF/, '').trim();
  if (!clean) return [];
  const rawLines = clean.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (rawLines.length < 2) return [];

  const delimiter = rawLines[0].includes(';') && !rawLines[0].includes(',') ? ';' : ',';
  const headers = splitCsvRow(rawLines[0], delimiter).map((h) => h.toLowerCase().replace(/\s+/g, '_'));
  const idx = (...names: string[]) => {
    for (const n of names) {
      const i = headers.indexOf(n);
      if (i >= 0) return i;
    }
    return -1;
  };

  const iTitle = idx('title', 'workout_name');
  const iStart = idx('start_time', 'date');
  const iEnd = idx('end_time');
  const iDesc = idx('description', 'workout_notes');
  const iEx = idx('exercise_title', 'exercise_name');
  const iWeightKg = idx('weight_kg', 'weight');
  const iWeightLbs = idx('weight_lbs');
  const iReps = idx('reps');
  const iSetType = idx('set_type');
  const iRpe = idx('rpe');
  const iSuperset = idx('superset_id');
  const iExNotes = idx('exercise_notes', 'notes');

  if (iEx < 0 || iStart < 0) return [];

  const grouped = new Map<string, ImportedWorkoutDraft>();

  for (let r = 1; r < rawLines.length; r++) {
    const cols = splitCsvRow(rawLines[r], delimiter);
    const startRaw = cols[iStart] ?? '';
    const date = extractIsoDay(startRaw);
    if (!date) continue;
    const title = (iTitle >= 0 ? cols[iTitle] : '') || 'Treino importado';
    const exName = cols[iEx] ?? '';
    if (!exName) continue;

    const key = `${date}|${title}|${startRaw}`;
    let draft = grouped.get(key);
    if (!draft) {
      let dur: number | null = null;
      if (iEnd >= 0 && cols[iEnd]) {
        const t1 = Date.parse(startRaw);
        const t2 = Date.parse(cols[iEnd]);
        if (Number.isFinite(t1) && Number.isFinite(t2) && t2 > t1) {
          dur = Math.max(1, Math.round((t2 - t1) / 60000));
        }
      }
      draft = {
        date,
        title,
        duration_min: dur,
        description: iDesc >= 0 ? cols[iDesc] ?? '' : '',
        sets: [],
      };
      grouped.set(key, draft);
    }

    const rawKg = iWeightKg >= 0 && cols[iWeightKg] !== '' ? Number(cols[iWeightKg].replace(',', '.')) : NaN;
    const rawLbs = iWeightLbs >= 0 && cols[iWeightLbs] !== '' ? Number(cols[iWeightLbs].replace(',', '.')) : NaN;
    const load_kg = Number.isFinite(rawKg) ? round(rawKg, 2) : Number.isFinite(rawLbs) ? round(rawLbs / 2.20462, 2) : 0;
    const reps = iReps >= 0 && cols[iReps] !== '' ? Math.max(0, Math.round(Number(cols[iReps]))) : 0;
    const stRaw = (iSetType >= 0 ? cols[iSetType] : '').toLowerCase();
    const indicator: SetIndicator =
      stRaw === 'warmup' || stRaw === 'w' ? 'warmup'
        : stRaw === 'dropset' || stRaw === 'd' ? 'dropset'
          : stRaw === 'failure' || stRaw === 'f' ? 'failure'
            : 'normal';
    const rpeVal = iRpe >= 0 && cols[iRpe] !== '' ? Number(cols[iRpe].replace(',', '.')) : NaN;
    const rpe = Number.isFinite(rpeVal) && rpeVal >= 1 && rpeVal <= 10 ? rpeVal : null;
    const ssRaw = iSuperset >= 0 ? cols[iSuperset] : '';
    const superset = ssRaw
      ? (/^\d+$/.test(ssRaw) ? SUPERSET_IDS[Number(ssRaw) % SUPERSET_IDS.length] : ssRaw.slice(0, 2).toUpperCase())
      : null;

    draft.sets.push({
      exerciseName: exName,
      load_kg,
      reps,
      indicator,
      rpe,
      superset,
      notes: iExNotes >= 0 ? cols[iExNotes] ?? '' : '',
    });
  }

  return [...grouped.values()];
}

// ---------------------------------------------------------------------------
// 10. Pinned Exercise Notes (persisted locally + synced with Assistant Memories)
// ---------------------------------------------------------------------------

const PINNED_NOTES_KEY = 'painel:exercise-pinned-notes:v1';

export function readPinnedExerciseNotes(): Record<string, string> {
  if (typeof window === 'undefined' || !window.localStorage) return {};
  try {
    const raw = window.localStorage.getItem(PINNED_NOTES_KEY);
    return raw ? (JSON.parse(raw) as Record<string, string>) : {};
  } catch {
    return {};
  }
}

export function writePinnedExerciseNote(exerciseId: string, note: string): Record<string, string> {
  const current = readPinnedExerciseNotes();
  const clean = note.trim();
  if (clean) current[exerciseId] = clean;
  else delete current[exerciseId];
  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      window.localStorage.setItem(PINNED_NOTES_KEY, JSON.stringify(current));
    } catch {
      // Ignore quota errors
    }
  }
  return current;
}
