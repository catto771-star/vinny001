import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useEffect, useMemo, useState } from 'react';
import { num } from '../../lib/format';
import { ArrowDown, ArrowLeft, ArrowUp, Check, Disc, Flame, Pause, Pin, Play, Plus, RefreshCw, RotateCcw, Sparkles, Timer, Trophy, X, } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { write } from '../../lib/useTable';
import { feedback } from '../../lib/feedback';
import { toDay } from '../../lib/dates';
import { DEFAULT_SETTINGS, lastWorkingSets, MUSCLE_LABEL, personalRecords, suggestNext, } from '../../lib/training';
import { calculatePlatesPerSide, classifySetIndicator, EQUIPMENT_OPTIONS, formatSetNotes, formatWorkoutNotes, generateWarmupRamp, hevy1RM, numberSetsLikeHevy, parseSetNotes, parseWorkoutNotes, readPinnedExerciseNotes, RPE_HINT, RPE_VALUES, SESSION_MODALITIES, SUPERSET_IDS, SUPERSET_STYLE, workoutKcal, writePinnedExerciseNote, } from '../../lib/hevy';
import { findMatchingTrainingHabits } from '../../lib/crossModuleIntelligence';
import { clampRestSeconds, formatRestClock, playRestDoneChime, remainingSeconds, REST_PRESETS } from '../../lib/restTimer';
import { searchKey } from '../../lib/text';
import { Field, Modal } from '../../components/ui';
import { openAssistantDrawer } from '../../components/AssistantDrawer';
import { notifyDataChanged } from '../../components/QuickCaptureModal';
import ExerciseDetailModal from './ExerciseDetailModal';
import { DEFAULT_WEIGHT_KG } from './useHealth';
let keySeq = 0;
const newKey = () => `k${keySeq++}`;
function formatElapsed(sec) {
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = sec % 60;
    if (h > 0)
        return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}
export default function WorkoutEditor({ h, workoutId, start, onClose, }) {
    const existing = workoutId ? h.workouts.rows.find((w) => w.id === workoutId) : undefined;
    const parsedWorkout = useMemo(() => parseWorkoutNotes(existing?.notes), [existing?.notes]);
    const planSessionId = existing?.plan_session_id ?? start?.sessionId ?? null;
    const [date, setDate] = useState(existing?.date ?? toDay(new Date()));
    const [title, setTitle] = useState(existing?.title ?? start?.label ?? '');
    const [modality, setModality] = useState(parsedWorkout.modality);
    const [duration, setDuration] = useState(existing?.duration_min?.toString() ?? '');
    const [manualKcal, setManualKcal] = useState(parsedWorkout.manualKcal != null ? String(parsedWorkout.manualKcal) : '');
    const [notes, setNotes] = useState(parsedWorkout.cleanNotes);
    const [sets, setSets] = useState(() => {
        if (start && !workoutId) {
            return start.draft.map((d) => {
                const sn = parseSetNotes(d.notes);
                return {
                    ...d,
                    key: newKey(),
                    completed: false,
                    superset: sn.superset,
                    indicatorOverride: sn.indicator,
                    cleanNotes: sn.cleanNotes,
                };
            });
        }
        return h.sets.rows
            .filter((s) => s.workout_id === workoutId)
            .sort((a, b) => a.position - b.position)
            .map((s) => {
            const sn = parseSetNotes(s.notes);
            return {
                key: newKey(),
                exercise_id: s.exercise_id,
                set_type_id: s.set_type_id,
                load_kg: s.load_kg,
                reps: s.reps,
                rest_s: s.rest_s,
                effort: s.effort,
                completed: true,
                superset: sn.superset,
                indicatorOverride: sn.indicator,
                cleanNotes: sn.cleanNotes,
            };
        });
    });
    const [exerciseOrder, setExerciseOrder] = useState(() => [
        ...new Set((start && !workoutId ? start.draft.map((d) => d.exercise_id) : h.sets.rows.filter((s) => s.workout_id === workoutId).sort((a, b) => a.position - b.position).map((s) => s.exercise_id))),
    ]);
    const [picking, setPicking] = useState(false);
    const [replacingExId, setReplacingExId] = useState(null);
    const [detailExId, setDetailExId] = useState(null);
    const [plateExId, setPlateExId] = useState(null);
    const [barKg, setBarKg] = useState(20);
    const [pinnedNotes, setPinnedNotes] = useState(() => readPinnedExerciseNotes());
    const [editingPinFor, setEditingPinFor] = useState(null);
    const [saving, setSaving] = useState(false);
    // Live session elapsed timer (starts automatically for new workouts)
    const [sessionSec, setSessionSec] = useState(0);
    const [sessionRunning, setSessionRunning] = useState(!workoutId);
    useEffect(() => {
        if (!sessionRunning)
            return;
        const id = window.setInterval(() => setSessionSec((s) => s + 1), 1000);
        return () => window.clearInterval(id);
    }, [sessionRunning]);
    // Rest timer state
    const [restTotal, setRestTotal] = useState(90);
    const [restLeft, setRestLeft] = useState(0);
    const [restEndsAt, setRestEndsAt] = useState(null);
    const [autoRest, setAutoRest] = useState(true);
    function startRest(seconds) {
        const clean = clampRestSeconds(seconds || 90);
        if (clean <= 0)
            return;
        setRestTotal(clean);
        setRestLeft(clean);
        setRestEndsAt(Date.now() + clean * 1000);
    }
    function adjustRest(delta) {
        const base = restEndsAt != null ? remainingSeconds(restEndsAt, Date.now()) : restLeft;
        const next = clampRestSeconds(base + delta);
        setRestLeft(next);
        if (next > restTotal)
            setRestTotal(next);
        if (restEndsAt != null) {
            setRestEndsAt(next > 0 ? Date.now() + next * 1000 : null);
        }
    }
    function togglePauseRest() {
        if (restEndsAt != null) {
            setRestLeft(remainingSeconds(restEndsAt, Date.now()));
            setRestEndsAt(null);
        }
        else if (restLeft > 0) {
            setRestEndsAt(Date.now() + restLeft * 1000);
        }
    }
    function resetRest() {
        setRestEndsAt(null);
        setRestLeft(0);
    }
    useEffect(() => {
        if (restEndsAt == null)
            return;
        const tick = () => {
            const left = remainingSeconds(restEndsAt, Date.now());
            setRestLeft(left);
            if (left <= 0) {
                setRestEndsAt(null);
                playRestDoneChime();
                feedback({ kind: 'ok', text: 'Descanso concluído!' });
            }
        };
        tick();
        const id = window.setInterval(tick, 250);
        return () => window.clearInterval(id);
    }, [restEndsAt]);
    const working = h.setTypes.rows.find((t) => t.drives_progression && t.user_id === null) ?? h.setTypes.rows[0];
    const warmupType = h.setTypes.rows.find((t) => classifySetIndicator(t.name) === 'warmup') ?? working;
    const dropType = h.setTypes.rows.find((t) => classifySetIndicator(t.name) === 'dropset') ?? working;
    const failType = h.setTypes.rows.find((t) => classifySetIndicator(t.name) === 'failure') ?? working;
    const order = useMemo(() => {
        const present = new Set(sets.map((s) => s.exercise_id));
        const kept = exerciseOrder.filter((id) => present.has(id));
        for (const s of sets) {
            if (!kept.includes(s.exercise_id))
                kept.push(s.exercise_id);
        }
        return kept;
    }, [exerciseOrder, sets]);
    // Historical PRs before this workout for live PR detection
    const historicalRecords = useMemo(() => {
        const earlierWorkouts = h.workouts.rows.filter((w) => w.id !== workoutId && w.date <= date);
        const earlierIds = new Set(earlierWorkouts.map((w) => w.id));
        const earlierSets = h.sets.rows.filter((s) => earlierIds.has(s.workout_id));
        return personalRecords(earlierSets, earlierWorkouts, h.typeById);
    }, [h.workouts.rows, h.sets.rows, h.typeById, workoutId, date]);
    // Live session calorie burn preview
    const weightKg = h.latestWeight ?? DEFAULT_WEIGHT_KG;
    const effectiveDurationMin = duration
        ? Number(duration)
        : sessionSec >= 60
            ? Math.round(sessionSec / 60)
            : null;
    const liveCalorieBurn = useMemo(() => {
        const formattedNotes = formatWorkoutNotes({
            modality,
            manualKcal: manualKcal !== '' ? Number(manualKcal) : null,
            cleanNotes: notes,
        });
        const serializedSets = sets.map((s) => ({
            ...s,
            notes: formatSetNotes({ superset: s.superset, indicator: s.indicatorOverride, cleanNotes: s.cleanNotes }),
        }));
        return workoutKcal({ duration_min: effectiveDurationMin, notes: formattedNotes }, serializedSets, h.typeById, weightKg);
    }, [modality, manualKcal, notes, effectiveDurationMin, sets, h.typeById, weightKg]);
    function suggestionFor(exerciseId) {
        const last = lastWorkingSets(exerciseId, h.sets.rows, h.workouts.rows, h.typeById, date);
        return suggestNext(last, h.settingsById.get(exerciseId) ?? DEFAULT_SETTINGS);
    }
    function previousSetsFor(exerciseId) {
        const workoutById = new Map(h.workouts.rows.map((w) => [w.id, w]));
        const candidates = h.sets.rows.filter((s) => s.exercise_id === exerciseId && s.workout_id !== workoutId && workoutById.has(s.workout_id) && workoutById.get(s.workout_id).date <= date);
        if (!candidates.length)
            return [];
        const latest = candidates.reduce((a, b) => {
            const wa = workoutById.get(a.workout_id);
            const wb = workoutById.get(b.workout_id);
            return wb.date > wa.date || (wb.date === wa.date && wb.id > wa.id) ? b : a;
        });
        return candidates.filter((s) => s.workout_id === latest.workout_id).sort((a, b) => a.position - b.position);
    }
    function addExercise(exerciseId) {
        const s = suggestionFor(exerciseId);
        const load = s?.load_kg ?? 0;
        const reps = s ? (s.action === 'increase_reps' ? s.reps : Array(s.sets).fill(s.reps)) : [DEFAULT_SETTINGS.rep_min];
        setSets((xs) => [
            ...xs,
            ...reps.map((r) => ({
                key: newKey(),
                exercise_id: exerciseId,
                set_type_id: working.id,
                load_kg: load,
                reps: r,
                rest_s: 120,
                effort: null,
                completed: false,
                superset: null,
                indicatorOverride: null,
                cleanNotes: '',
            })),
        ]);
        setExerciseOrder((ord) => (ord.includes(exerciseId) ? ord : [...ord, exerciseId]));
        setPicking(false);
    }
    function replaceExercise(oldExId, newExId) {
        if (oldExId === newExId) {
            setReplacingExId(null);
            return;
        }
        const sug = suggestionFor(newExId);
        setSets((xs) => xs.map((s) => s.exercise_id === oldExId
            ? { ...s, exercise_id: newExId, load_kg: sug?.load_kg ?? s.load_kg }
            : s));
        setExerciseOrder((ord) => ord.map((id) => (id === oldExId ? newExId : id)));
        setReplacingExId(null);
    }
    function moveExercise(exId, dir) {
        const idx = order.indexOf(exId);
        const target = idx + dir;
        if (idx < 0 || target < 0 || target >= order.length)
            return;
        const next = [...order];
        [next[idx], next[target]] = [next[target], next[idx]];
        setExerciseOrder(next);
    }
    function setSupersetForExercise(exId, superset) {
        setSets((xs) => xs.map((s) => (s.exercise_id === exId ? { ...s, superset } : s)));
    }
    function insertWarmupSets(exId, workingLoad) {
        const ramp = generateWarmupRamp(workingLoad);
        if (!ramp.length) {
            feedback({ kind: 'error', text: 'Informe ao menos 20 kg na série principal para gerar aquecimento.' });
            return;
        }
        const warmDrafts = ramp.map((r) => ({
            key: newKey(),
            exercise_id: exId,
            set_type_id: warmupType.id,
            load_kg: r.load_kg,
            reps: r.reps,
            rest_s: 60,
            effort: null,
            completed: false,
            superset: null,
            indicatorOverride: 'warmup',
            cleanNotes: '',
        }));
        setSets((xs) => {
            const firstIdx = xs.findIndex((s) => s.exercise_id === exId);
            if (firstIdx < 0)
                return [...xs, ...warmDrafts];
            return [...xs.slice(0, firstIdx), ...warmDrafts, ...xs.slice(firstIdx)];
        });
        feedback({ kind: 'ok', text: '3 séries progressivas de aquecimento (50/70/85%) inseridas' });
    }
    function addSet(exerciseId) {
        const last = [...sets].reverse().find((s) => s.exercise_id === exerciseId);
        const restSec = last?.rest_s ?? 90;
        setSets((xs) => {
            const idx = xs.map((s) => s.exercise_id).lastIndexOf(exerciseId);
            const copy = {
                ...(last ?? {
                    exercise_id: exerciseId,
                    set_type_id: working.id,
                    load_kg: 0,
                    reps: 10,
                    rest_s: 120,
                    effort: null,
                    superset: null,
                    indicatorOverride: null,
                    cleanNotes: '',
                }),
                completed: false,
                key: newKey(),
            };
            return [...xs.slice(0, idx + 1), copy, ...xs.slice(idx + 1)];
        });
        if (autoRest && restSec > 0)
            startRest(restSec);
    }
    function cycleSetIndicator(s) {
        const cur = classifySetIndicator(h.typeById.get(s.set_type_id)?.name, s.indicatorOverride);
        if (cur === 'normal') {
            update(s.key, { set_type_id: warmupType.id, indicatorOverride: 'warmup' });
        }
        else if (cur === 'warmup') {
            update(s.key, { set_type_id: dropType.id, indicatorOverride: 'dropset' });
        }
        else if (cur === 'dropset') {
            update(s.key, { set_type_id: failType.id, indicatorOverride: 'failure' });
        }
        else {
            update(s.key, { set_type_id: working.id, indicatorOverride: null });
        }
    }
    function toggleSetCompleted(s) {
        const nextDone = !s.completed;
        update(s.key, { completed: nextDone });
        if (nextDone && autoRest && (s.rest_s ?? 90) > 0) {
            const ind = classifySetIndicator(h.typeById.get(s.set_type_id)?.name, s.indicatorOverride);
            if (ind !== 'dropset')
                startRest(s.rest_s ?? 90);
        }
    }
    const update = (key, patch) => setSets((xs) => xs.map((s) => (s.key === key ? { ...s, ...patch } : s)));
    async function save() {
        setSaving(true);
        const finalDuration = duration
            ? Number(duration)
            : sessionSec >= 60
                ? Math.round(sessionSec / 60)
                : liveCalorieBurn.durationMin > 0
                    ? liveCalorieBurn.durationMin
                    : null;
        const encodedNotes = formatWorkoutNotes({
            modality,
            manualKcal: manualKcal !== '' ? Number(manualKcal) : null,
            cleanNotes: notes,
        });
        const row = {
            date,
            title: title || null,
            duration_min: finalDuration,
            notes: encodedNotes,
            plan_session_id: planSessionId,
        };
        let id = workoutId;
        const oldSetIds = h.sets.rows.filter((s) => s.workout_id === workoutId).map((s) => s.id);
        if (id) {
            if (!(await write(supabase.from('workouts').update(row).eq('id', id))))
                return setSaving(false);
        }
        else {
            const { data, error } = await supabase.from('workouts').insert(row).select('id').single();
            if (error || !data) {
                alert(`Não foi possível salvar: ${error?.message}`);
                return setSaving(false);
            }
            id = data.id;
        }
        const ordered = order.flatMap((ex) => sets.filter((s) => s.exercise_id === ex));
        if (ordered.length) {
            const ok = await write(supabase.from('workout_sets').insert(ordered.map((s, i) => ({
                workout_id: id,
                exercise_id: s.exercise_id,
                set_type_id: s.set_type_id,
                position: i,
                load_kg: s.load_kg,
                reps: s.reps,
                rest_s: s.rest_s,
                effort: s.effort,
                notes: formatSetNotes({ superset: s.superset, indicator: s.indicatorOverride, cleanNotes: s.cleanNotes }),
            }))));
            if (!ok)
                return setSaving(false);
        }
        if (oldSetIds.length && !(await write(supabase.from('workout_sets').delete().in('id', oldSetIds))))
            return setSaving(false);
        // Cross-Module Intelligence: automatically mark matching Training Habit(s) for `date`
        const matchingHabits = findMatchingTrainingHabits(h.habits?.rows ?? [], 'workout', h.workoutPlan?.habit_id);
        let syncedHabitNames = [];
        for (const hb of matchingHabits) {
            const already = h.habitCompletions?.rows.find((c) => c.habit_id === hb.id && c.completed_date === date);
            if (!already) {
                const val = hb.target_value && hb.target_value > 0 ? hb.target_value : 1;
                const { error: hErr } = await supabase
                    .from('habit_completions')
                    .upsert({ habit_id: hb.id, completed_date: date, value: val }, { onConflict: 'habit_id,completed_date' });
                if (!hErr)
                    syncedHabitNames.push(hb.name);
            }
        }
        await Promise.all([
            h.workouts.reload(),
            h.sets.reload(),
            ...(syncedHabitNames.length ? [h.habitCompletions.reload()] : []),
        ]);
        notifyDataChanged();
        if (syncedHabitNames.length > 0) {
            feedback({
                kind: 'ok',
                text: `Treino salvo (${num(liveCalorieBurn.kcal)} kcal) · Hábito "${syncedHabitNames[0]}" marcado!`,
            });
        }
        setSaving(false);
        onClose();
    }
    async function remove() {
        if (workoutId && confirm('Excluir este treino e todas as séries dele?') && (await write(supabase.from('workouts').delete().eq('id', workoutId)))) {
            await Promise.all([h.workouts.reload(), h.sets.reload()]);
            notifyDataChanged();
            onClose();
        }
    }
    const restPct = restTotal > 0 ? Math.min(100, Math.max(0, (restLeft / restTotal) * 100)) : 0;
    const completedCount = sets.filter((s) => s.completed).length;
    return (_jsxs("div", { children: [_jsxs("div", { className: "mb-4 flex flex-wrap items-center gap-2", children: [_jsxs("button", { className: "btn-ghost", onClick: onClose, children: [_jsx(ArrowLeft, { size: 16, strokeWidth: 1.5 }), "Voltar"] }), _jsx("h2", { className: "mr-auto text-lg font-medium", children: workoutId ? 'Editar treino' : start ? `${start.label}: registrar` : 'Sessão ao vivo' }), _jsxs("div", { className: "inline-flex items-center gap-1.5 rounded-lg border border-line bg-surface px-2.5 py-1 text-xs", children: [_jsx("button", { type: "button", onClick: () => setSessionRunning((r) => !r), className: "text-fg2 hover:text-fg", "aria-label": sessionRunning ? 'Pausar relógio do treino' : 'Iniciar relógio do treino', children: sessionRunning ? _jsx(Pause, { size: 13, strokeWidth: 1.6 }) : _jsx(Play, { size: 13, strokeWidth: 1.6 }) }), _jsx("span", { className: "figure font-medium text-fg", children: formatElapsed(sessionSec) }), sessionSec >= 60 && (_jsx("button", { type: "button", className: "ml-1 text-[11px] text-brand underline", onClick: () => setDuration(String(Math.max(1, Math.round(sessionSec / 60)))), children: "usar min" }))] }), _jsxs("div", { className: "inline-flex items-center gap-1.5 rounded-lg border border-line bg-raised/60 px-2.5 py-1 text-xs text-fg2", title: `Estimativa baseada em ${num(weightKg)} kg, MET ${num(liveCalorieBurn.met, 1)} e densidade das séries`, children: [_jsx(Flame, { size: 14, strokeWidth: 1.5, className: "text-brand" }), _jsxs("span", { className: "figure font-medium text-fg", children: [liveCalorieBurn.estimated ? '~' : '', num(liveCalorieBurn.kcal), " kcal"] }), sets.length > 0 && (_jsxs("span", { className: "text-fg3", children: ["\u00B7 ", completedCount, "/", sets.length, " \u2713"] }))] }), workoutId && (_jsx("button", { className: "btn-ghost text-negative", onClick: remove, children: "Excluir" })), _jsx("button", { className: "btn-primary", onClick: save, disabled: saving, children: saving ? 'Salvando…' : 'Concluir e salvar' })] }), _jsxs("section", { className: "card sticky top-3 z-10 mb-4 p-3.5", "aria-label": "Cron\u00F4metro de descanso", children: [_jsxs("div", { className: "flex flex-wrap items-center gap-2", children: [_jsxs("div", { className: "flex items-center gap-2", children: [_jsx(Timer, { size: 17, strokeWidth: 1.6, "aria-hidden": "true", className: restEndsAt ? 'text-brand' : 'text-fg3' }), _jsx("span", { className: "figure text-xl font-semibold tracking-tight", children: formatRestClock(restLeft) })] }), _jsx("div", { className: "flex flex-wrap items-center gap-1", children: REST_PRESETS.map((sec) => (_jsxs("button", { type: "button", onClick: () => startRest(sec), className: `h-8 rounded-full border px-2.5 text-xs font-medium transition-colors ${restTotal === sec && restLeft > 0
                                        ? 'border-brand bg-brand/10 text-brand-ink'
                                        : 'border-line-strong bg-surface text-fg2 hover:bg-raised'}`, children: [sec, "s"] }, sec))) }), restLeft > 0 && (_jsxs("div", { className: "flex items-center gap-1", children: [_jsx("button", { type: "button", className: "btn-ghost h-8 px-2 text-xs", onClick: () => adjustRest(-15), children: "\u221215s" }), _jsx("button", { type: "button", className: "btn-ghost h-8 px-2 text-xs", onClick: () => adjustRest(15), children: "+15s" }), _jsx("button", { type: "button", className: "icon-btn h-8 w-8", onClick: togglePauseRest, "aria-label": restEndsAt ? 'Pausar descanso' : 'Retomar descanso', children: restEndsAt ? _jsx(Pause, { size: 15, strokeWidth: 1.6 }) : _jsx(Play, { size: 15, strokeWidth: 1.6 }) }), _jsx("button", { type: "button", className: "icon-btn h-8 w-8", onClick: resetRest, "aria-label": "Zerar cron\u00F4metro", children: _jsx(RotateCcw, { size: 15, strokeWidth: 1.6 }) })] })), _jsxs("label", { className: "ml-auto flex cursor-pointer items-center gap-1.5 text-xs text-fg2", children: [_jsx("input", { type: "checkbox", checked: autoRest, onChange: (e) => setAutoRest(e.target.checked) }), "Auto ao marcar \u2713 ou +S\u00E9rie"] })] }), restLeft > 0 && (_jsx("div", { className: "mt-2.5 h-1.5 overflow-hidden rounded-full bg-raised", role: "progressbar", "aria-valuenow": Math.round(restPct), "aria-valuemin": 0, "aria-valuemax": 100, "aria-label": "Tempo restante de descanso", children: _jsx("div", { className: "h-full rounded-full bg-brand transition-[width] duration-200", style: { width: `${restPct}%` } }) }))] }), _jsxs("div", { className: "card mb-4 grid gap-3 sm:grid-cols-3 lg:grid-cols-6", children: [_jsx(Field, { label: "Data", children: _jsx("input", { className: "input", type: "date", value: date, onChange: (e) => setDate(e.target.value) }) }), _jsx(Field, { label: "Nome da sess\u00E3o", children: _jsx("input", { className: "input", value: title, onChange: (e) => setTitle(e.target.value), placeholder: "Ex.: Push A \u00B7 Peito e ombros" }) }), _jsx(Field, { label: "Modalidade", children: _jsx("select", { className: "input", value: modality, onChange: (e) => setModality(e.target.value), children: SESSION_MODALITIES.map((m) => (_jsx("option", { value: m.id, children: m.label }, m.id))) }) }), _jsx(Field, { label: "Dura\u00E7\u00E3o (min)", children: _jsx("input", { className: "input", type: "number", min: 1, value: duration, onChange: (e) => setDuration(e.target.value), placeholder: liveCalorieBurn.durationMin ? `~${liveCalorieBurn.durationMin} est.` : 'auto' }) }), _jsx(Field, { label: "Calorias gastas (kcal)", children: _jsx("input", { className: "input", type: "number", min: 0, value: manualKcal, onChange: (e) => setManualKcal(e.target.value), placeholder: `~${liveCalorieBurn.kcal} auto` }) }), _jsx(Field, { label: "Notas da sess\u00E3o", children: _jsx("input", { className: "input", value: notes, onChange: (e) => setNotes(e.target.value), placeholder: "Energia, foco, ajustes\u2026" }) })] }), order.map((exId, exOrderIdx) => {
                const ex = h.exerciseById.get(exId);
                const sug = suggestionFor(exId);
                const exSets = sets.filter((s) => s.exercise_id === exId);
                const prevSets = previousSetsFor(exId);
                const prevRec = historicalRecords.get(exId);
                const indicators = exSets.map((s) => classifySetIndicator(h.typeById.get(s.set_type_id)?.name, s.indicatorOverride));
                const numbered = numberSetsLikeHevy(indicators);
                const supersetId = exSets[0]?.superset ?? null;
                const ssStyle = supersetId ? SUPERSET_STYLE[supersetId] : null;
                const pinned = pinnedNotes[exId] ?? '';
                const topLoad = Math.max(0, ...exSets.map((s) => s.load_kg));
                const plateInfo = plateExId === exId ? calculatePlatesPerSide(topLoad || 60, barKg) : null;
                return (_jsxs("section", { className: `card mb-4 ${ssStyle ? ssStyle.border : ''}`, children: [_jsxs("div", { className: "mb-2 flex flex-wrap items-center gap-2", children: [ssStyle && (_jsx("span", { className: `rounded border px-2 py-0.5 text-[11px] font-medium ${ssStyle.badge}`, children: ssStyle.label })), _jsx("button", { type: "button", className: "text-left font-medium text-fg hover:text-brand hover:underline", onClick: () => setDetailExId(exId), title: "Abrir estat\u00EDsticas, recordes e hist\u00F3rico deste exerc\u00EDcio", children: ex?.name ?? 'Exercício' }), _jsxs("span", { className: "text-xs text-fg3", children: [ex ? MUSCLE_LABEL[ex.muscle_group] : '', ex?.equipment ? ` · ${ex.equipment}` : ''] }), _jsxs("div", { className: "ml-auto flex flex-wrap items-center gap-1", children: [_jsxs("select", { "aria-label": `Superset para ${ex?.name ?? 'exercício'}`, className: "input h-7 w-auto py-0 px-2 text-[11px]", value: supersetId ?? '', onChange: (e) => setSupersetForExercise(exId, e.target.value || null), children: [_jsx("option", { value: "", children: "Sem superset" }), SUPERSET_IDS.map((id) => (_jsxs("option", { value: id, children: ["Superset ", id] }, id)))] }), _jsxs("button", { type: "button", className: `btn-ghost h-7 px-2 text-xs ${plateExId === exId ? 'text-brand' : ''}`, onClick: () => setPlateExId(plateExId === exId ? null : exId), title: "Calculadora de anilhas e s\u00E9ries de aquecimento", children: [_jsx(Disc, { size: 13, strokeWidth: 1.5 }), " Anilhas / Aq."] }), _jsxs("button", { type: "button", className: `btn-ghost h-7 px-2 text-xs ${pinned ? 'text-brand' : ''}`, onClick: () => setEditingPinFor(editingPinFor === exId ? null : exId), title: "Nota t\u00E9cnica fixada permanente neste exerc\u00EDcio", children: [_jsx(Pin, { size: 13, strokeWidth: 1.5 }), " Nota"] }), _jsx("button", { type: "button", className: "icon-btn h-7 w-7", onClick: () => setReplacingExId(exId), title: "Substituir exerc\u00EDcio (ex.: aparelho ocupado)", "aria-label": `Substituir ${ex?.name ?? 'exercício'}`, children: _jsx(RefreshCw, { size: 14, strokeWidth: 1.5 }) }), _jsx("button", { type: "button", className: "icon-btn h-7 w-7", disabled: exOrderIdx === 0, onClick: () => moveExercise(exId, -1), "aria-label": `Subir ${ex?.name ?? 'exercício'}`, children: _jsx(ArrowUp, { size: 14, strokeWidth: 1.5 }) }), _jsx("button", { type: "button", className: "icon-btn h-7 w-7", disabled: exOrderIdx === order.length - 1, onClick: () => moveExercise(exId, 1), "aria-label": `Descer ${ex?.name ?? 'exercício'}`, children: _jsx(ArrowDown, { size: 14, strokeWidth: 1.5 }) }), _jsx("button", { type: "button", className: "px-1.5 text-xs text-negative hover:underline", onClick: () => setSets((xs) => xs.filter((s) => s.exercise_id !== exId)), children: "remover" })] })] }), (pinned || editingPinFor === exId) && (_jsx("div", { className: "mb-3 rounded-lg border border-line bg-raised/40 p-2.5", children: editingPinFor === exId ? (_jsxs("div", { className: "flex items-center gap-2", children: [_jsx("input", { className: "input h-8 flex-1 text-xs", placeholder: "Nota permanente deste exerc\u00EDcio (ex.: banco furo 3, pegada neutra)\u2026", value: pinned, onChange: (e) => {
                                            const updated = writePinnedExerciseNote(exId, e.target.value);
                                            setPinnedNotes(updated);
                                        } }), _jsx("button", { type: "button", className: "btn-secondary h-8 px-2.5 text-xs", onClick: () => setEditingPinFor(null), children: "Pronto" })] })) : (_jsxs("div", { className: "flex items-center gap-2 text-xs text-fg2", children: [_jsx(Pin, { size: 12, strokeWidth: 1.5, className: "shrink-0 text-brand" }), _jsx("span", { className: "mr-auto", children: pinned }), _jsx("button", { type: "button", className: "text-[11px] text-fg3 underline", onClick: () => setEditingPinFor(exId), children: "editar" })] })) })), plateInfo && (_jsxs("div", { className: "mb-3 flex flex-wrap items-center gap-3 rounded-lg border border-line bg-raised/50 px-3 py-2.5 text-xs", children: [_jsxs("div", { className: "flex items-center gap-1.5", children: [_jsx("span", { className: "text-fg3", children: "Barra:" }), [20, 15, 10, 0].map((b) => (_jsxs("button", { type: "button", onClick: () => setBarKg(b), className: `rounded border px-1.5 py-0.5 ${barKg === b ? 'border-brand bg-brand/10 text-fg' : 'border-line text-fg3'}`, children: [b, "kg"] }, b)))] }), _jsxs("div", { className: "figure text-fg2", children: ["Para ", _jsxs("strong", { children: [num(plateInfo.targetKg), " kg"] }), ":", ' ', plateInfo.perSide.length === 0
                                            ? 'apenas a barra'
                                            : `${plateInfo.perSide.map((p) => `${p.count}×${num(p.plateKg)}kg`).join(' + ')} por lado`] }), _jsx("button", { type: "button", className: "btn-secondary ml-auto h-7 px-2.5 text-xs", onClick: () => insertWarmupSets(exId, topLoad || 60), children: "+ Aquecimento (50/70/85%)" })] })), sug && (_jsxs("p", { className: "mb-3 rounded-lg bg-raised px-3 py-2 text-sm text-fg", "data-testid": "suggestion", children: [_jsx("strong", { children: "Sugest\u00E3o:" }), ' ', sug.action === 'increase_reps' ? `${num(sug.load_kg)} kg × ${sug.reps.join(', ')}` : `${num(sug.load_kg)} kg × ${sug.reps} (${sug.sets} séries)`, " \u00B7 ", sug.reason] })), _jsx("div", { className: "overflow-x-auto", children: _jsxs("table", { className: "w-full min-w-[660px] text-sm", children: [_jsx("thead", { children: _jsxs("tr", { className: "text-left text-xs text-fg3", children: [_jsx("th", { className: "w-10 pb-1 font-normal", children: "S\u00E9rie" }), _jsx("th", { className: "pb-1 font-normal", children: "Tipo" }), _jsx("th", { className: "pb-1 font-normal", children: "Anterior" }), _jsx("th", { className: "pb-1 font-normal", children: "Carga (kg)" }), _jsx("th", { className: "pb-1 font-normal", children: "Reps" }), _jsx("th", { className: "pb-1 font-normal", children: "Desc. (s)" }), _jsx("th", { className: "pb-1 font-normal", children: "RPE" }), _jsx("th", { className: "pb-1 text-center font-normal", children: "\u2713" }), _jsx("th", {})] }) }), _jsx("tbody", { children: exSets.map((s, i) => {
                                            const badge = numbered[i]?.badge ?? String(i + 1);
                                            const prev = prevSets[i];
                                            const e1 = hevy1RM(s.load_kg, s.reps);
                                            const isLivePR = badge !== 'W' &&
                                                s.reps > 0 &&
                                                s.load_kg > 0 &&
                                                prevRec != null &&
                                                ((prevRec.maxLoad && s.load_kg > prevRec.maxLoad.load_kg) ||
                                                    (prevRec.best1RM && e1 != null && e1 > prevRec.best1RM.value));
                                            return (_jsxs("tr", { className: s.completed ? 'bg-positive/[0.04]' : '', children: [_jsx("td", { className: "py-1 pr-2", children: _jsx("button", { type: "button", onClick: () => cycleSetIndicator(s), title: "Clique para alternar: Normal (1..N) \u2192 Aquecimento (W) \u2192 Drop-set (D) \u2192 Falha (F)", className: `figure inline-flex h-7 w-7 items-center justify-center rounded-md border text-xs font-semibold transition-colors ${badge === 'W'
                                                                ? 'border-warning/40 bg-warning/15 text-warning'
                                                                : badge === 'D'
                                                                    ? 'border-info/40 bg-info/15 text-info'
                                                                    : badge === 'F'
                                                                        ? 'border-negative/40 bg-negative/15 text-negative'
                                                                        : 'border-line bg-raised text-fg2 hover:border-line-strong'}`, children: badge }) }), _jsx("td", { className: "py-1 pr-2", children: _jsx("select", { className: "input h-8 py-0 text-xs", "aria-label": `Tipo da série ${i + 1}, ${ex?.name ?? 'exercício'}`, value: s.set_type_id, onChange: (e) => update(s.key, { set_type_id: e.target.value, indicatorOverride: null }), children: h.setTypes.rows.map((t) => (_jsx("option", { value: t.id, children: t.name }, t.id))) }) }), _jsx("td", { className: "py-1 pr-2 whitespace-nowrap", children: prev ? (_jsxs("button", { type: "button", onClick: () => update(s.key, { load_kg: prev.load_kg, reps: prev.reps }), title: "Clique para copiar carga e repeti\u00E7\u00F5es da sess\u00E3o anterior", className: "figure rounded px-1.5 py-0.5 text-xs text-fg3 hover:bg-raised hover:text-fg", children: [num(prev.load_kg), " kg \u00D7 ", prev.reps] })) : (_jsx("span", { className: "text-xs text-fg3", children: "\u2014" })) }), _jsx("td", { className: "py-1 pr-2", children: _jsx("input", { className: "input h-8 w-24 py-0", "aria-label": `Carga da série ${i + 1}, ${ex?.name ?? 'exercício'}`, type: "number", min: 0, step: "0.5", value: s.load_kg, onChange: (e) => update(s.key, { load_kg: Number(e.target.value) }) }) }), _jsx("td", { className: "py-1 pr-2", children: _jsx("input", { className: "input h-8 w-20 py-0", "aria-label": `Repetições da série ${i + 1}, ${ex?.name ?? 'exercício'}`, type: "number", min: 0, value: s.reps, onChange: (e) => update(s.key, { reps: Number(e.target.value) }) }) }), _jsx("td", { className: "py-1 pr-2", children: _jsx("input", { className: "input h-8 w-20 py-0", "aria-label": `Descanso da série ${i + 1}, ${ex?.name ?? 'exercício'}`, type: "number", min: 0, step: 15, value: s.rest_s ?? '', onChange: (e) => update(s.key, { rest_s: e.target.value === '' ? null : Number(e.target.value) }) }) }), _jsx("td", { className: "py-1 pr-2", children: _jsxs("select", { className: "input h-8 w-20 py-0 text-xs", "aria-label": `Esforço da série ${i + 1}, ${ex?.name ?? 'exercício'}`, title: s.effort != null ? RPE_HINT[s.effort] ?? '' : 'RPE (6 a 10)', value: s.effort ?? '', onChange: (e) => update(s.key, { effort: e.target.value === '' ? null : Number(e.target.value) }), children: [_jsx("option", { value: "", children: "\u2014" }), RPE_VALUES.map((r) => (_jsx("option", { value: r, children: r }, r)))] }) }), _jsx("td", { className: "py-1 pr-2 text-center", children: _jsx("button", { type: "button", "aria-pressed": s.completed, "aria-label": `Concluir série ${i + 1}, ${ex?.name ?? 'exercício'}`, onClick: () => toggleSetCompleted(s), className: `inline-flex h-7 w-7 items-center justify-center rounded-md border transition-colors ${s.completed
                                                                ? 'border-positive bg-positive text-bg'
                                                                : 'border-line-strong bg-surface text-fg3 hover:bg-raised'}`, children: _jsx(Check, { size: 14, strokeWidth: 2 }) }) }), _jsxs("td", { className: "whitespace-nowrap", children: [isLivePR && (_jsx("span", { title: "Novo Recorde Pessoal projetado!", className: "mr-1 inline-flex items-center text-brand", children: _jsx(Trophy, { size: 14, strokeWidth: 1.6 }) })), _jsx("button", { type: "button", className: "icon-btn", title: `Iniciar descanso de ${s.rest_s ?? 90}s`, "aria-label": `Iniciar descanso da série ${i + 1}`, onClick: () => startRest(s.rest_s ?? 90), children: _jsx(Timer, { size: 15, strokeWidth: 1.5 }) }), _jsx("button", { type: "button", className: "icon-btn hover:text-negative", "aria-label": `Apagar série ${i + 1}, ${ex?.name ?? 'exercício'}`, onClick: () => setSets((xs) => xs.filter((x) => x.key !== s.key)), children: _jsx(X, { size: 16, strokeWidth: 1.5 }) })] })] }, s.key));
                                        }) })] }) }), _jsx("div", { className: "mt-2 flex items-center gap-2", children: _jsxs("button", { className: "btn-ghost", onClick: () => addSet(exId), children: [_jsx(Plus, { size: 16, strokeWidth: 1.5 }), "S\u00E9rie"] }) })] }, exId));
            }), _jsxs("div", { className: "flex flex-wrap items-center gap-2", children: [_jsxs("button", { className: "btn-primary", onClick: () => setPicking(true), children: [_jsx(Plus, { size: 16, strokeWidth: 1.5 }), "Exerc\u00EDcio"] }), _jsxs("button", { type: "button", className: "btn-secondary", onClick: () => openAssistantDrawer({
                            prompt: `Estou registrando meu treino "${title || 'de hoje'}" (${sets.length} séries até agora, ~${liveCalorieBurn.kcal} kcal estimadas). Sugira um ótimo exercício complementar ou ajuste de volume para fechar a sessão.`,
                            newThread: true,
                        }), children: [_jsx(Sparkles, { size: 15, strokeWidth: 1.5 }), " Sugest\u00E3o do Treinador IA"] })] }), picking && _jsx(ExercisePicker, { h: h, onPick: addExercise, onClose: () => setPicking(false) }), replacingExId && (_jsx(ExercisePicker, { h: h, initialMuscle: h.exerciseById.get(replacingExId)?.muscle_group ?? '', onPick: (newId) => replaceExercise(replacingExId, newId), onClose: () => setReplacingExId(null) })), detailExId && (_jsx(ExerciseDetailModal, { h: h, exerciseId: detailExId, onClose: () => setDetailExId(null), onPinnedChange: setPinnedNotes }))] }));
}
export function ExercisePicker({ h, onPick, onClose, initialMuscle = '', }) {
    const [q, setQ] = useState('');
    const [muscleFilter, setMuscleFilter] = useState(initialMuscle);
    const [equipFilter, setEquipFilter] = useState('');
    const [creating, setCreating] = useState(false);
    const [group, setGroup] = useState(initialMuscle || 'peito');
    const [equipment, setEquipment] = useState('halteres');
    const list = useMemo(() => {
        const key = searchKey(q);
        return h.exercises.rows
            .filter((e) => {
            if (muscleFilter && e.muscle_group !== muscleFilter)
                return false;
            if (equipFilter && searchKey(e.equipment ?? '') !== searchKey(equipFilter))
                return false;
            if (!key)
                return true;
            return (searchKey(e.name).includes(key) ||
                searchKey(MUSCLE_LABEL[e.muscle_group] ?? '').includes(key) ||
                searchKey(e.equipment ?? '').includes(key));
        })
            .slice(0, 80);
    }, [q, muscleFilter, equipFilter, h.exercises.rows]);
    async function create(e) {
        e.preventDefault();
        const { data, error } = await supabase
            .from('exercises')
            .insert({ name: q.trim(), muscle_group: group, equipment: equipment || null })
            .select('id')
            .single();
        if (error || !data)
            return alert(`Não foi possível criar: ${error?.message}`);
        await h.exercises.reload();
        onPick(data.id);
    }
    return (_jsx(Modal, { title: creating ? 'Novo exercício' : 'Biblioteca de exercícios', onClose: onClose, children: creating ? (_jsxs("form", { onSubmit: create, className: "space-y-3", children: [_jsx(Field, { label: "Nome", children: _jsx("input", { className: "input", value: q, onChange: (e) => setQ(e.target.value), required: true, autoFocus: true }) }), _jsxs("div", { className: "grid grid-cols-2 gap-2", children: [_jsx(Field, { label: "Grupo muscular principal", children: _jsx("select", { className: "input", value: group, onChange: (e) => setGroup(e.target.value), children: Object.entries(MUSCLE_LABEL).map(([k, v]) => (_jsx("option", { value: k, children: v }, k))) }) }), _jsx(Field, { label: "Equipamento", children: _jsxs("select", { className: "input", value: equipment, onChange: (e) => setEquipment(e.target.value), children: [_jsx("option", { value: "", children: "Sem equipamento" }), EQUIPMENT_OPTIONS.map((eq) => (_jsx("option", { value: eq.id, children: eq.label }, eq.id)))] }) })] }), _jsxs("div", { className: "flex gap-2", children: [_jsxs("button", { type: "button", className: "btn-ghost", onClick: () => setCreating(false), children: [_jsx(ArrowLeft, { size: 16, strokeWidth: 1.5 }), "Voltar"] }), _jsx("button", { className: "btn-primary ml-auto", children: "Criar e usar" })] })] })) : (_jsxs(_Fragment, { children: [_jsx("input", { className: "input mb-2", placeholder: "Buscar por nome, m\u00FAsculo ou equipamento\u2026", value: q, onChange: (e) => setQ(e.target.value), autoFocus: true }), _jsxs("div", { className: "mb-3 grid grid-cols-2 gap-2", children: [_jsxs("select", { "aria-label": "Filtrar por m\u00FAsculo", className: "input h-8 py-0 text-xs", value: muscleFilter, onChange: (e) => setMuscleFilter(e.target.value), children: [_jsx("option", { value: "", children: "Todos os m\u00FAsculos" }), Object.entries(MUSCLE_LABEL).map(([k, v]) => (_jsx("option", { value: k, children: v }, k)))] }), _jsxs("select", { "aria-label": "Filtrar por equipamento", className: "input h-8 py-0 text-xs", value: equipFilter, onChange: (e) => setEquipFilter(e.target.value), children: [_jsx("option", { value: "", children: "Todos os equipamentos" }), EQUIPMENT_OPTIONS.map((eq) => (_jsx("option", { value: eq.id, children: eq.label }, eq.id)))] })] }), _jsxs("ul", { className: "max-h-72 divide-y divide-line overflow-y-auto rounded-lg border border-line", children: [list.map((e) => (_jsx("li", { children: _jsxs("button", { className: "flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-raised", onClick: () => onPick(e.id), children: [_jsxs("span", { children: [e.name, e.user_id && _jsx("span", { className: "text-xs text-brand", children: " \u00B7 seu" })] }), _jsxs("span", { className: "text-xs text-fg3", children: [MUSCLE_LABEL[e.muscle_group], e.equipment ? ` · ${e.equipment}` : ''] })] }) }, e.id))), !list.length && _jsx("li", { className: "py-6 text-center text-sm text-fg3", children: "Nenhum exerc\u00EDcio encontrado" })] }), _jsxs("button", { className: "btn-secondary mt-3 w-full justify-center", onClick: () => setCreating(true), children: [_jsx(Plus, { size: 16, strokeWidth: 1.5 }), "Criar exerc\u00EDcio pr\u00F3prio", q.trim() ? `: ${q.trim()}` : ''] })] })) }));
}
