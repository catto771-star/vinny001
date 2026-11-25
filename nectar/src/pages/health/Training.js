import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useMemo, useRef, useState } from 'react';
import { num } from '../../lib/format';
import { BookmarkPlus, ChevronLeft, ChevronRight, Download, Flame, Pin, Plus, Sparkles, Trophy, Upload, X, } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { write } from '../../lib/useTable';
import { feedback } from '../../lib/feedback';
import { addDays, formatDay, monthName, toDay } from '../../lib/dates';
import { searchKey } from '../../lib/text';
import { CARDIO_MET, cardioKcal, DEFAULT_SETTINGS, formatPace, kcalPerMinute, MUSCLE_LABEL, paceMinPerKm, personalRecords, workoutSummary, } from '../../lib/training';
import { buildTrainingCalendarMonth, computeWeeklyTrainingStreak, EQUIPMENT_OPTIONS, exportWorkoutsHevyCsv, formatSetNotes, hevy1RM, parseHevyOrStrongCsv, parseSetNotes, readPinnedExerciseNotes, SESSION_MODALITIES, weightedMuscleDistribution, workoutKcal, } from '../../lib/hevy';
import { findMatchingTrainingHabits } from '../../lib/crossModuleIntelligence';
import { Empty, Field, Modal } from '../../components/ui';
import { openAssistantDrawer } from '../../components/AssistantDrawer';
import { notifyDataChanged } from '../../components/QuickCaptureModal';
import WorkoutEditor from './WorkoutEditor';
import PlanEditor from './PlanEditor';
import BodyHeatmap from './BodyHeatmap';
import ExerciseDetailModal from './ExerciseDetailModal';
import { DEFAULT_WEIGHT_KG } from './useHealth';
const VIEWS = ['Ficha', 'Treinos', 'Cardio', 'Anatomia', 'Recordes', 'Exercícios'];
export default function Training({ h }) {
    const [view, setView] = useState('Ficha');
    const [editing, setEditing] = useState(undefined);
    const [start, setStart] = useState(undefined);
    const [detailExId, setDetailExId] = useState(null);
    const close = () => { setEditing(undefined); setStart(undefined); setView('Treinos'); };
    if (start)
        return _jsx(WorkoutEditor, { h: h, workoutId: null, start: start, onClose: close });
    if (editing !== undefined)
        return _jsx(WorkoutEditor, { h: h, workoutId: editing, onClose: () => setEditing(undefined) });
    return (_jsxs(_Fragment, { children: [_jsxs("div", { className: "mb-6 flex flex-wrap items-center justify-between gap-2", children: [_jsx("div", { className: "segmented overflow-x-auto", children: VIEWS.map((v) => (_jsx("button", { className: v === view ? 'tab-active' : 'tab', onClick: () => setView(v), children: v }, v))) }), _jsxs("button", { type: "button", className: "btn-secondary h-9 text-xs", onClick: () => openAssistantDrawer({
                            prompt: 'Use analisar_evolucao_treino para avaliar meus treinos recentes, recordes pessoais, equilíbrio muscular, gasto calórico e sinergia com dieta/hábitos.',
                            newThread: true,
                        }), children: [_jsx(Sparkles, { size: 15, strokeWidth: 1.5 }), " Treinador IA"] })] }), view === 'Ficha' && _jsx(PlanEditor, { h: h, onStart: setStart }), view === 'Treinos' && _jsx(WorkoutList, { h: h, onOpen: setEditing }), view === 'Cardio' && _jsx(CardioList, { h: h }), view === 'Anatomia' && _jsx(AnatomyAndCalendar, { h: h }), view === 'Recordes' && _jsx(Records, { h: h, onInspect: setDetailExId }), view === 'Exercícios' && _jsx(Exercises, { h: h, onInspect: setDetailExId }), detailExId && (_jsx(ExerciseDetailModal, { h: h, exerciseId: detailExId, onClose: () => setDetailExId(null) }))] }));
}
function WorkoutList({ h, onOpen }) {
    const fileRef = useRef(null);
    const [importing, setImporting] = useState(false);
    const weightKg = h.latestWeight ?? DEFAULT_WEIGHT_KG;
    const today = toDay(new Date());
    function handleExportCsv() {
        if (!h.workouts.rows.length) {
            feedback({ kind: 'error', text: 'Nenhum treino registrado para exportar.' });
            return;
        }
        const csv = exportWorkoutsHevyCsv({
            workouts: h.workouts.rows,
            sets: h.sets.rows,
            exercises: h.exerciseById,
            types: h.typeById,
        });
        const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `painel-treinos-hevy-${today}.csv`;
        a.click();
        URL.revokeObjectURL(url);
    }
    async function handleImportCsv(e) {
        const file = e.target.files?.[0];
        e.target.value = '';
        if (!file)
            return;
        setImporting(true);
        try {
            const text = await file.text();
            const drafts = parseHevyOrStrongCsv(text);
            if (!drafts.length) {
                feedback({ kind: 'error', text: 'Formato CSV não reconhecido (use CSV do Hevy ou Strong).' });
                setImporting(false);
                return;
            }
            const workingType = h.setTypes.rows.find((t) => t.drives_progression && t.user_id === null) ?? h.setTypes.rows[0];
            const warmType = h.setTypes.rows.find((t) => searchKey(t.name).includes('aquecimento')) ?? workingType;
            const dropType = h.setTypes.rows.find((t) => searchKey(t.name).includes('drop')) ?? workingType;
            // Map existing exercises by normalized name and create missing ones on the fly
            const exMap = new Map();
            for (const ex of h.exercises.rows)
                exMap.set(searchKey(ex.name), ex.id);
            let importedCount = 0;
            for (const d of drafts) {
                const { data: wRow, error: wErr } = await supabase
                    .from('workouts')
                    .insert({
                    date: d.date,
                    title: d.title,
                    duration_min: d.duration_min,
                    notes: d.description || null,
                })
                    .select('id')
                    .single();
                if (wErr || !wRow)
                    continue;
                const setPayloads = [];
                for (let idx = 0; idx < d.sets.length; idx++) {
                    const st = d.sets[idx];
                    const normName = searchKey(st.exerciseName);
                    let exId = exMap.get(normName);
                    if (!exId) {
                        const { data: createdEx } = await supabase
                            .from('exercises')
                            .insert({ name: st.exerciseName.trim(), muscle_group: 'corpo_inteiro' })
                            .select('id')
                            .single();
                        if (createdEx) {
                            exId = String(createdEx.id);
                            exMap.set(normName, String(createdEx.id));
                        }
                    }
                    if (!exId)
                        continue;
                    const typeId = st.indicator === 'warmup' ? warmType.id
                        : st.indicator === 'dropset' ? dropType.id
                            : workingType.id;
                    setPayloads.push({
                        workout_id: wRow.id,
                        exercise_id: exId,
                        set_type_id: typeId,
                        position: idx,
                        load_kg: st.load_kg,
                        reps: st.reps,
                        rest_s: 90,
                        effort: st.rpe,
                        notes: formatSetNotes({
                            superset: st.superset,
                            indicator: st.indicator === 'failure' ? 'failure' : null,
                            cleanNotes: st.notes,
                        }),
                    });
                }
                if (setPayloads.length) {
                    await supabase.from('workout_sets').insert(setPayloads);
                }
                importedCount += 1;
            }
            await Promise.all([h.exercises.reload(), h.workouts.reload(), h.sets.reload()]);
            notifyDataChanged();
            feedback({ kind: 'ok', text: `${importedCount} ${importedCount === 1 ? 'treino importado' : 'treinos importados'} com sucesso!` });
        }
        catch (err) {
            feedback({ kind: 'error', text: `Falha ao importar CSV: ${err.message}` });
        }
        setImporting(false);
    }
    async function saveWorkoutAsRoutine(workoutId) {
        const w = h.workouts.rows.find((x) => x.id === workoutId);
        if (!w)
            return;
        let planId = h.workoutPlan?.id;
        if (!planId) {
            const { data, error } = await supabase.from('workout_plans').insert({ name: 'Minha ficha', is_active: true }).select('id').single();
            if (error || !data)
                return feedback({ kind: 'error', text: `Erro ao criar ficha: ${error?.message}` });
            planId = data.id;
        }
        const existingCount = h.planSessions.rows.filter((s) => s.plan_id === planId).length;
        const { data: sess, error: sErr } = await supabase
            .from('workout_plan_sessions')
            .insert({
            plan_id: planId,
            label: w.title || `Rotina ${formatDay(w.date)}`,
            order_index: existingCount,
        })
            .select('id')
            .single();
        if (sErr || !sess)
            return feedback({ kind: 'error', text: `Erro ao criar rotina: ${sErr?.message}` });
        const wSets = h.sets.rows.filter((s) => s.workout_id === workoutId).sort((a, b) => a.position - b.position);
        const exOrder = [...new Set(wSets.map((s) => s.exercise_id))];
        const rows = exOrder.map((exId, idx) => {
            const mine = wSets.filter((s) => s.exercise_id === exId && (h.typeById.get(s.set_type_id)?.counts_for_volume ?? true));
            const base = mine.length ? mine : wSets.filter((s) => s.exercise_id === exId);
            const topLoad = Math.max(0, ...base.map((s) => s.load_kg));
            const avgReps = base.length ? Math.round(base.reduce((a, b) => a + b.reps, 0) / base.length) : 10;
            const ss = parseSetNotes(base[0]?.notes).superset;
            return {
                session_id: sess.id,
                exercise_id: exId,
                sets: Math.max(1, base.length),
                reps: String(avgReps),
                load_kg: topLoad > 0 ? topLoad : null,
                rest_s: base[0]?.rest_s ?? 90,
                notes: formatSetNotes({ superset: ss, cleanNotes: '' }),
                order_index: idx,
            };
        });
        if (rows.length)
            await supabase.from('workout_plan_exercises').insert(rows);
        await Promise.all([h.workoutPlans.reload(), h.planSessions.reload(), h.planExercises.reload()]);
        feedback({ kind: 'ok', text: `"${w.title || 'Treino'}" salvo na sua Ficha de Rotinas!` });
    }
    return (_jsxs(_Fragment, { children: [_jsxs("div", { className: "mb-4 flex flex-wrap items-center gap-2", children: [_jsx("input", { ref: fileRef, type: "file", accept: ".csv,text/csv", className: "hidden", onChange: handleImportCsv }), _jsxs("button", { type: "button", className: "btn-secondary h-9 text-xs", disabled: importing, onClick: () => fileRef.current?.click(), title: "Importar hist\u00F3rico de treinos em CSV do Hevy ou Strong", children: [_jsx(Upload, { size: 14, strokeWidth: 1.5 }), " ", importing ? 'Importando…' : 'Importar CSV Hevy'] }), _jsxs("button", { type: "button", className: "btn-secondary h-9 text-xs", onClick: handleExportCsv, title: "Exportar todos os treinos em CSV padr\u00E3o Hevy (14 colunas)", children: [_jsx(Download, { size: 14, strokeWidth: 1.5 }), " Exportar CSV"] }), _jsxs("button", { className: "btn-primary ml-auto", onClick: () => onOpen(null), children: [_jsx(Plus, { size: 16, strokeWidth: 1.5 }), "Registrar treino"] })] }), h.workouts.rows.length === 0 && _jsx("div", { className: "card", children: _jsx(Empty, { children: "Nenhum treino registrado ainda. Comece pela Ficha, registre ao vivo ou importe seu CSV do Hevy." }) }), _jsx("ul", { className: "grid gap-2.5", children: h.workouts.rows.map((w) => {
                    const wSets = h.sets.rows.filter((x) => x.workout_id === w.id);
                    const s = workoutSummary(w, h.sets.rows, h.workouts.rows, h.typeById);
                    const burn = workoutKcal(w, wSets, h.typeById, weightKg);
                    const modLabel = SESSION_MODALITIES.find((m) => m.id === burn.modality)?.label;
                    const names = [...new Set(wSets.map((x) => h.exerciseById.get(x.exercise_id)?.name))].filter(Boolean);
                    return (_jsxs("li", { className: "card", children: [_jsxs("div", { className: "flex flex-wrap items-baseline gap-2", children: [_jsx("button", { className: "text-left font-medium text-fg hover:text-brand hover:underline", onClick: () => onOpen(w.id), children: w.title || 'Treino' }), burn.modality !== 'musculacao' && modLabel && (_jsx("span", { className: "rounded border border-line bg-raised px-1.5 py-0.5 text-[11px] text-fg2", children: modLabel })), _jsxs("span", { className: "text-sm text-fg3", children: [formatDay(w.date), burn.durationMin > 0 ? ` · ${w.duration_min ? `${w.duration_min} min` : `~${burn.durationMin} min`}` : ''] }), _jsxs("span", { className: "ml-auto flex flex-wrap items-center gap-2 text-sm", children: [_jsxs("span", { children: [s.sets, " s\u00E9ries \u00B7 ", s.reps, " reps \u00B7 ", _jsx("span", { className: "figure", children: num(s.tonnage) }), " kg"] }), _jsxs("span", { className: "inline-flex items-center gap-1 rounded-md border border-line bg-raised/60 px-2 py-0.5 text-xs text-fg2", children: [_jsx(Flame, { size: 12, strokeWidth: 1.5, className: "text-brand" }), _jsxs("span", { className: "figure", children: [burn.estimated ? '~' : '', num(burn.kcal), " kcal"] })] })] })] }), _jsxs("div", { className: "mt-1.5 flex items-center gap-2", children: [_jsx("div", { className: "mr-auto truncate text-xs text-fg3", children: names.join(', ') || 'Sessão sem exercícios detalhados' }), _jsxs("button", { type: "button", className: "inline-flex shrink-0 items-center gap-1 text-xs text-fg3 hover:text-fg", onClick: () => void saveWorkoutAsRoutine(w.id), title: "Transformar este treino em uma rotina reutiliz\u00E1vel na sua Ficha", children: [_jsx(BookmarkPlus, { size: 13, strokeWidth: 1.5 }), " Salvar como rotina"] })] }), s.records.length > 0 && (_jsx("div", { className: "mt-2 flex flex-wrap gap-1", children: s.records.map((r) => (_jsxs("span", { className: "inline-flex items-center gap-1 rounded-md border border-line bg-raised px-2 py-0.5 text-xs text-fg2", children: [_jsx(Trophy, { size: 13, strokeWidth: 1.5, className: "text-brand" }), h.exerciseById.get(r.exercise_id)?.name, ":", ' ', r.kind === 'volume' ? `volume ${num(r.value)} kg` : r.kind === '1RM' ? `1RM est. ${num(r.value)} kg` : `carga ${num(r.value)} kg`] }, r.exercise_id + r.kind))) }))] }, w.id));
                }) })] }));
}
const CARDIO_TYPES = Object.keys(CARDIO_MET);
function CardioList({ h }) {
    const [form, setForm] = useState(false);
    const weight = h.latestWeight ?? DEFAULT_WEIGHT_KG;
    return (_jsxs(_Fragment, { children: [_jsx("div", { className: "mb-4 flex", children: _jsxs("button", { className: "btn-primary ml-auto", onClick: () => setForm(true), children: [_jsx(Plus, { size: 16, strokeWidth: 1.5 }), "Registrar cardio"] }) }), h.cardio.rows.length === 0 && _jsx("div", { className: "card", children: _jsx(Empty, { children: "Nenhum cardio registrado ainda." }) }), _jsx("ul", { className: "grid gap-2", children: h.cardio.rows.map((c) => {
                    const k = cardioKcal(c, weight);
                    return (_jsxs("li", { className: "card flex flex-wrap items-baseline gap-3", children: [_jsx("span", { className: "font-medium capitalize", children: c.cardio_type }), _jsx("span", { className: "text-sm text-fg3", children: formatDay(c.date) }), _jsxs("span", { className: "ml-auto flex items-center gap-2 text-sm", children: [_jsxs("span", { children: [c.distance_km ? `${num(c.distance_km)} km · ` : '', Math.round(c.duration_s / 60), " min \u00B7 ", formatPace(paceMinPerKm(c)), " \u00B7 ", kcalPerMinute(k.kcal, c.duration_s), " kcal/min"] }), _jsxs("span", { className: "inline-flex items-center gap-1 rounded-md border border-line bg-raised/60 px-2 py-0.5 text-xs text-fg2", children: [_jsx(Flame, { size: 12, strokeWidth: 1.5, className: "text-brand" }), _jsxs("span", { className: "figure", children: [k.estimated ? '~' : '', num(k.kcal), " kcal"] })] })] }), _jsx("button", { className: "text-xs text-negative", onClick: async () => {
                                    if (confirm('Excluir este cardio?') && await write(supabase.from('cardio_sessions').delete().eq('id', c.id))) {
                                        void h.cardio.reload();
                                        notifyDataChanged();
                                    }
                                }, children: "excluir" })] }, c.id));
                }) }), form && (_jsx(CardioForm, { h: h, onClose: () => setForm(false), onSaved: () => {
                    setForm(false);
                    void h.cardio.reload();
                    void h.habitCompletions.reload();
                    notifyDataChanged();
                } }))] }));
}
function CardioForm({ h, onClose, onSaved }) {
    const [type, setType] = useState('corrida');
    const [date, setDate] = useState(toDay(new Date()));
    const [km, setKm] = useState('');
    const [min, setMin] = useState('');
    const [sec, setSec] = useState('');
    const [kcal, setKcal] = useState('');
    const weight = h.latestWeight ?? DEFAULT_WEIGHT_KG;
    const durPreviewSec = Number(min || 0) * 60 + Number(sec || 0);
    const previewBurn = durPreviewSec > 0
        ? cardioKcal({ cardio_type: type, duration_s: durPreviewSec, kcal: kcal ? Number(kcal) : null }, weight)
        : null;
    async function save(e) {
        e.preventDefault();
        const duration_s = Number(min || 0) * 60 + Number(sec || 0);
        if (duration_s <= 0)
            return alert('Informe o tempo.');
        if (await write(supabase.from('cardio_sessions').insert({
            cardio_type: type, date, duration_s, distance_km: km ? Number(km) : null, kcal: kcal ? Number(kcal) : null,
        }))) {
            // Auto-sync matching cardio/exercise habit
            const matching = findMatchingTrainingHabits(h.habits?.rows ?? [], 'cardio', h.workoutPlan?.habit_id);
            for (const hb of matching) {
                const exists = h.habitCompletions?.rows.find((c) => c.habit_id === hb.id && c.completed_date === date);
                if (!exists) {
                    const val = hb.target_value && hb.target_value > 0 ? hb.target_value : 1;
                    await supabase.from('habit_completions').upsert({ habit_id: hb.id, completed_date: date, value: val }, { onConflict: 'habit_id,completed_date' });
                }
            }
            onSaved();
        }
    }
    return (_jsx(Modal, { title: "Registrar cardio", onClose: onClose, children: _jsxs("form", { onSubmit: save, children: [_jsxs("div", { className: "grid grid-cols-2 gap-2", children: [_jsx(Field, { label: "Tipo", children: _jsx("select", { className: "input capitalize", value: type, onChange: (e) => setType(e.target.value), children: CARDIO_TYPES.map((t) => _jsx("option", { value: t, children: t }, t)) }) }), _jsx(Field, { label: "Data", children: _jsx("input", { className: "input", type: "date", value: date, onChange: (e) => setDate(e.target.value), required: true }) }), _jsx(Field, { label: "Dist\u00E2ncia (km)", children: _jsx("input", { className: "input", type: "number", min: 0, step: "0.01", value: km, onChange: (e) => setKm(e.target.value) }) }), _jsx(Field, { label: "Calorias (opcional)", children: _jsx("input", { className: "input", type: "number", min: 0, value: kcal, onChange: (e) => setKcal(e.target.value), placeholder: previewBurn ? `~${previewBurn.kcal} kcal est.` : 'estimadas se vazio' }) }), _jsx(Field, { label: "Tempo: minutos", children: _jsx("input", { className: "input", type: "number", min: 0, value: min, onChange: (e) => setMin(e.target.value), required: true }) }), _jsx(Field, { label: "Tempo: segundos", children: _jsx("input", { className: "input", type: "number", min: 0, max: 59, value: sec, onChange: (e) => setSec(e.target.value) }) })] }), previewBurn && (_jsxs("p", { className: "mt-2 text-xs text-fg2", children: ["Gasto energ\u00E9tico calculado: ", _jsxs("strong", { className: "figure", children: [previewBurn.estimated ? '~' : '', num(previewBurn.kcal), " kcal"] })] })), _jsx("button", { className: "btn-primary mt-3 w-full justify-center", children: "Salvar" })] }) }));
}
function AnatomyAndCalendar({ h }) {
    const now = new Date();
    const today = toDay(now);
    const [calYear, setCalYear] = useState(now.getFullYear());
    const [calMonth, setCalMonth] = useState(now.getMonth() + 1);
    const [rangeDays, setRangeDays] = useState(30);
    const weightKg = h.latestWeight ?? DEFAULT_WEIGHT_KG;
    const streakWeeks = useMemo(() => computeWeeklyTrainingStreak(today, h.trainedDays), [today, h.trainedDays]);
    const cells = useMemo(() => buildTrainingCalendarMonth({
        year: calYear,
        month: calMonth,
        workouts: h.workouts.rows,
        sets: h.sets.rows,
        cardio: h.cardio.rows,
        types: h.typeById,
        weightKg,
    }), [calYear, calMonth, h.workouts.rows, h.sets.rows, h.cardio.rows, h.typeById, weightKg]);
    const monthActiveCells = cells.filter((c) => c.inMonth && (c.workoutsCount > 0 || c.cardioCount > 0));
    const monthTotalBurn = monthActiveCells.reduce((acc, c) => acc + c.kcalBurned, 0);
    const filteredSets = useMemo(() => {
        if (rangeDays === 0)
            return h.sets.rows;
        const minDay = addDays(today, -(rangeDays - 1));
        const validIds = new Set(h.workouts.rows.filter((w) => w.date >= minDay && w.date <= today).map((w) => w.id));
        return h.sets.rows.filter((s) => validIds.has(s.workout_id));
    }, [rangeDays, today, h.workouts.rows, h.sets.rows]);
    const muscleRows = useMemo(() => weightedMuscleDistribution(filteredSets, h.exerciseById, h.typeById), [filteredSets, h.exerciseById, h.typeById]);
    function shiftMonth(delta) {
        let m = calMonth + delta;
        let y = calYear;
        if (m < 1) {
            m = 12;
            y -= 1;
        }
        if (m > 12) {
            m = 1;
            y += 1;
        }
        setCalYear(y);
        setCalMonth(m);
    }
    return (_jsxs("div", { className: "space-y-6", children: [_jsxs("section", { className: "card", children: [_jsxs("div", { className: "mb-4 flex flex-wrap items-center justify-between gap-2", children: [_jsxs("div", { children: [_jsx("h2", { className: "text-base font-medium text-fg", children: "Mapa Muscular & Simetria Corporal" }), _jsx("p", { className: "text-xs text-fg3", children: "C\u00E1lculo ponderado estilo Hevy: 100% no m\u00FAsculo principal e 50% nos sinergistas secund\u00E1rios" })] }), _jsx("div", { className: "segmented", children: [
                                    [7, '7d'],
                                    [30, '30d'],
                                    [90, '90d'],
                                    [0, 'Tudo'],
                                ].map(([d, label]) => (_jsx("button", { type: "button", className: rangeDays === d ? 'tab-active' : 'tab', onClick: () => setRangeDays(d), children: label }, d))) })] }), _jsx(BodyHeatmap, { rows: muscleRows, periodLabel: rangeDays === 0 ? 'todo o histórico' : `últimos ${rangeDays} dias` })] }), _jsxs("section", { className: "card", children: [_jsxs("div", { className: "mb-4 flex flex-wrap items-center gap-3", children: [_jsxs("div", { className: "mr-auto", children: [_jsxs("h2", { className: "text-base font-medium capitalize text-fg", children: [monthName(calMonth), " de ", calYear] }), _jsxs("p", { className: "text-xs text-fg3", children: [_jsx("strong", { children: monthActiveCells.length }), " dias ativos no m\u00EAs \u00B7", ' ', _jsxs("strong", { className: "figure", children: [num(monthTotalBurn), " kcal"] }), " gastas \u00B7", ' ', "Sequ\u00EAncia atual: ", _jsxs("strong", { className: "figure", children: [streakWeeks, " ", streakWeeks === 1 ? 'semana' : 'semanas'] })] })] }), _jsxs("div", { className: "flex items-center gap-1", children: [_jsx("button", { type: "button", className: "icon-btn", onClick: () => shiftMonth(-1), "aria-label": "M\u00EAs anterior", children: _jsx(ChevronLeft, { size: 16, strokeWidth: 1.5 }) }), _jsx("button", { type: "button", className: "icon-btn", onClick: () => shiftMonth(1), "aria-label": "Pr\u00F3ximo m\u00EAs", children: _jsx(ChevronRight, { size: 16, strokeWidth: 1.5 }) })] })] }), _jsxs("div", { className: "grid grid-cols-7 gap-1.5 text-center text-[11px] text-fg3", children: [['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'].map((w) => (_jsx("div", { className: "pb-1 font-medium", children: w }, w))), cells.map((c) => {
                                const active = c.workoutsCount + c.cardioCount > 0;
                                const isToday = c.date === today;
                                return (_jsxs("div", { title: active ? `${formatDay(c.date)}: ${c.workoutsCount} treino(s), ${c.cardioCount} cardio(s) · ~${num(c.kcalBurned)} kcal` : formatDay(c.date), className: `flex min-h-[52px] flex-col items-center justify-between rounded-lg border p-1.5 transition-colors ${!c.inMonth
                                        ? 'border-transparent opacity-30'
                                        : active
                                            ? 'border-brand/40 bg-brand/10 text-fg'
                                            : isToday
                                                ? 'border-line-strong bg-raised/60 text-fg'
                                                : 'border-line bg-surface text-fg3'}`, children: [_jsx("span", { className: "figure text-xs font-medium", children: c.dayOfMonth }), active && (_jsxs("span", { className: "figure text-[10px] text-brand-ink", children: [num(c.kcalBurned), " kcal"] }))] }, c.date));
                            })] })] })] }));
}
function Records({ h, onInspect }) {
    const records = [...personalRecords(h.sets.rows, h.workouts.rows, h.typeById).values()]
        .sort((a, b) => (h.exerciseById.get(a.exercise_id)?.name ?? '').localeCompare(h.exerciseById.get(b.exercise_id)?.name ?? '', 'pt'));
    // Also compute Hevy 1..30 1RM per exercise so high-rep sets show 1RM too
    const hevyBestByEx = useMemo(() => {
        const map = new Map();
        for (const s of h.sets.rows) {
            if (!(h.typeById.get(s.set_type_id)?.counts_for_volume ?? true) || s.reps <= 0)
                continue;
            const e1 = hevy1RM(s.load_kg, s.reps);
            if (e1 != null) {
                const cur = map.get(s.exercise_id);
                if (!cur || e1 > cur.val)
                    map.set(s.exercise_id, { val: e1, load: s.load_kg, reps: s.reps });
            }
        }
        return map;
    }, [h.sets.rows, h.typeById]);
    if (!records.length)
        return _jsx("div", { className: "card", children: _jsx(Empty, { children: "Os recordes aparecem depois do primeiro treino registrado." }) });
    return (_jsx("div", { className: "card overflow-x-auto p-0", children: _jsxs("table", { className: "w-full min-w-[600px] text-sm", children: [_jsx("thead", { children: _jsxs("tr", { className: "text-left text-xs text-fg3", children: [_jsx("th", { className: "p-3 font-normal", children: "Exerc\u00EDcio" }), _jsx("th", { className: "p-3 font-normal", children: "Carga m\u00E1xima" }), _jsx("th", { className: "p-3 font-normal", children: "1RM Estimado" }), _jsx("th", { className: "p-3 font-normal", children: "Maior volume num treino" })] }) }), _jsx("tbody", { children: records.map((r) => {
                        const hv = hevyBestByEx.get(r.exercise_id);
                        const best1 = r.best1RM?.value ?? hv?.val ?? null;
                        return (_jsxs("tr", { className: "border-t border-line hover:bg-raised/30", children: [_jsx("td", { className: "p-3", children: _jsx("button", { type: "button", className: "text-left font-medium text-fg hover:text-brand hover:underline", onClick: () => onInspect(r.exercise_id), children: h.exerciseById.get(r.exercise_id)?.name }) }), _jsxs("td", { className: "p-3 figure", children: [r.maxLoad ? `${num(r.maxLoad.load_kg)} kg × ${r.maxLoad.reps}` : '—', _jsx("div", { className: "text-xs text-fg3", children: r.maxLoad && formatDay(r.maxLoad.date) })] }), _jsxs("td", { className: "p-3 figure", children: [best1 ? `${num(best1)} kg` : '—', _jsx("div", { className: "text-xs text-fg3", children: r.best1RM
                                                ? `${num(r.best1RM.load_kg)} kg × ${r.best1RM.reps}`
                                                : hv
                                                    ? `${num(hv.load)} kg × ${hv.reps}`
                                                    : '' })] }), _jsxs("td", { className: "p-3 figure", children: [r.bestSessionVolume ? `${num(r.bestSessionVolume.tonnage)} kg` : '—', _jsx("div", { className: "text-xs text-fg3", children: r.bestSessionVolume && formatDay(r.bestSessionVolume.date) })] })] }, r.exercise_id));
                    }) })] }) }));
}
function Exercises({ h, onInspect }) {
    const [newExercise, setNewExercise] = useState(false);
    const [newType, setNewType] = useState(false);
    const [q, setQ] = useState('');
    const [equipFilter, setEquipFilter] = useState('');
    const pinnedNotes = readPinnedExerciseNotes();
    const used = new Set(h.sets.rows.map((s) => s.exercise_id));
    const groups = Object.keys(MUSCLE_LABEL);
    return (_jsxs("div", { className: "grid gap-6 lg:grid-cols-[1fr_320px]", children: [_jsxs("div", { children: [_jsxs("div", { className: "mb-4 flex flex-wrap items-center gap-2", children: [_jsx("input", { className: "input h-9 min-w-[200px] flex-1", placeholder: "Buscar exerc\u00EDcio\u2026", value: q, onChange: (e) => setQ(e.target.value) }), _jsxs("select", { "aria-label": "Filtrar equipamento", className: "input h-9 w-auto py-0 text-xs", value: equipFilter, onChange: (e) => setEquipFilter(e.target.value), children: [_jsx("option", { value: "", children: "Todos os equipamentos" }), EQUIPMENT_OPTIONS.map((eq) => (_jsx("option", { value: eq.id, children: eq.label }, eq.id)))] }), _jsxs("button", { className: "btn-primary h-9", onClick: () => setNewExercise(true), children: [_jsx(Plus, { size: 16, strokeWidth: 1.5 }), "Exerc\u00EDcio pr\u00F3prio"] })] }), groups.map((g) => {
                        const list = h.exercises.rows.filter((e) => {
                            if (e.muscle_group !== g)
                                return false;
                            if (equipFilter && searchKey(e.equipment ?? '') !== searchKey(equipFilter))
                                return false;
                            if (q.trim() && !searchKey(e.name).includes(searchKey(q)))
                                return false;
                            return true;
                        });
                        if (!list.length)
                            return null;
                        return (_jsxs("section", { className: "mb-4", children: [_jsx("div", { className: "label mb-2", children: MUSCLE_LABEL[g] }), _jsx("ul", { className: "card divide-y divide-line p-0", children: list.map((e) => {
                                        const s = h.settingsById.get(e.id) ?? DEFAULT_SETTINGS;
                                        const hasPin = Boolean(pinnedNotes[e.id]);
                                        return (_jsxs("li", { className: "flex items-center gap-2 px-4 py-2.5 text-sm", children: [_jsxs("button", { type: "button", className: "mr-auto flex items-center gap-1.5 text-left text-fg hover:text-brand hover:underline", onClick: () => onInspect(e.id), children: [_jsx("span", { children: e.name }), e.equipment && _jsxs("span", { className: "text-xs text-fg3", children: ["\u00B7 ", e.equipment] }), e.user_id && _jsx("span", { className: "text-xs text-brand", children: "\u00B7 seu" }), hasPin && _jsx(Pin, { size: 12, strokeWidth: 1.5, className: "text-brand" })] }), used.has(e.id) && (_jsxs("span", { className: "figure text-xs text-fg3", children: [s.rep_min, "-", s.rep_max, " reps \u00B7 +", s.load_increment_kg, " kg"] })), _jsx("button", { className: "text-xs text-fg underline", onClick: () => onInspect(e.id), children: "raio-x" })] }, e.id));
                                    }) })] }, g));
                    })] }), _jsxs("div", { className: "card h-fit", children: [_jsx("div", { className: "label mb-2", children: "Tipos de s\u00E9rie" }), _jsx("ul", { className: "mb-3 space-y-1 text-sm", children: h.setTypes.rows.map((t) => (_jsxs("li", { className: "flex gap-2", children: [_jsx("span", { className: "mr-auto", children: t.name }), _jsx("span", { className: "text-xs text-fg3", children: t.drives_progression ? 'progressão' : t.counts_for_volume ? 'conta volume' : 'não conta' }), t.user_id && _jsx("button", { className: "text-xs text-negative", onClick: async () => {
                                        if (confirm(`Excluir o tipo "${t.name}"?`) && await write(supabase.from('set_types').delete().eq('id', t.id)))
                                            void h.setTypes.reload();
                                    }, children: _jsx(X, { size: 16, strokeWidth: 1.5 }) })] }, t.id))) }), _jsxs("button", { className: "btn-ghost", onClick: () => setNewType(true), children: [_jsx(Plus, { size: 16, strokeWidth: 1.5 }), "Tipo de s\u00E9rie"] }), _jsx("p", { className: "mt-3 text-xs text-fg3", children: "No logger ao vivo, clique no n\u00FAmero da s\u00E9rie para alternar rapidamente entre Normal (1..N), Aquecimento (W), Drop-set (D) e Falha (F)." })] }), newExercise && _jsx(ExerciseForm, { onClose: () => setNewExercise(false), onSaved: () => { setNewExercise(false); void h.exercises.reload(); } }), newType && _jsx(SetTypeForm, { onClose: () => setNewType(false), onSaved: () => { setNewType(false); void h.setTypes.reload(); } })] }));
}
function ExerciseForm({ onClose, onSaved }) {
    const [name, setName] = useState('');
    const [group, setGroup] = useState('peito');
    const [secondary, setSecondary] = useState([]);
    const [equipment, setEquipment] = useState('halteres');
    function toggleSec(m) {
        setSecondary((prev) => (prev.includes(m) ? prev.filter((x) => x !== m) : [...prev, m]));
    }
    async function save(e) {
        e.preventDefault();
        if (await write(supabase.from('exercises').insert({
            name,
            muscle_group: group,
            secondary_muscles: secondary.filter((s) => s !== group),
            equipment: equipment || null,
        })))
            onSaved();
    }
    return (_jsx(Modal, { title: "Novo exerc\u00EDcio pr\u00F3prio", onClose: onClose, children: _jsxs("form", { onSubmit: save, className: "space-y-3", children: [_jsx(Field, { label: "Nome", children: _jsx("input", { className: "input", value: name, onChange: (e) => setName(e.target.value), required: true, autoFocus: true }) }), _jsxs("div", { className: "grid grid-cols-2 gap-2", children: [_jsx(Field, { label: "M\u00FAsculo principal (100%)", children: _jsx("select", { className: "input", value: group, onChange: (e) => setGroup(e.target.value), children: Object.entries(MUSCLE_LABEL).map(([k, v]) => _jsx("option", { value: k, children: v }, k)) }) }), _jsx(Field, { label: "Equipamento", children: _jsxs("select", { className: "input", value: equipment, onChange: (e) => setEquipment(e.target.value), children: [_jsx("option", { value: "", children: "Sem equipamento" }), EQUIPMENT_OPTIONS.map((eq) => _jsx("option", { value: eq.id, children: eq.label }, eq.id))] }) })] }), _jsxs("div", { children: [_jsx("div", { className: "mb-1.5 text-xs text-fg3", children: "M\u00FAsculos secund\u00E1rios (50% no mapa corporal)" }), _jsx("div", { className: "flex flex-wrap gap-1.5", children: Object.entries(MUSCLE_LABEL)
                                .filter(([k]) => k !== group)
                                .map(([k, label]) => (_jsx("button", { type: "button", onClick: () => toggleSec(k), className: `rounded-md border px-2 py-0.5 text-xs ${secondary.includes(k) ? 'border-brand bg-brand/10 text-fg' : 'border-line text-fg3'}`, children: label }, k))) })] }), _jsx("button", { className: "btn-primary w-full justify-center", children: "Salvar exerc\u00EDcio" })] }) }));
}
function SetTypeForm({ onClose, onSaved }) {
    const [name, setName] = useState('');
    const [volume, setVolume] = useState(true);
    async function save(e) {
        e.preventDefault();
        if (await write(supabase.from('set_types').insert({ name, counts_for_volume: volume, drives_progression: false, sort_order: 50 })))
            onSaved();
    }
    return (_jsx(Modal, { title: "Novo tipo de s\u00E9rie", onClose: onClose, children: _jsxs("form", { onSubmit: save, children: [_jsx(Field, { label: "Nome", children: _jsx("input", { className: "input", value: name, onChange: (e) => setName(e.target.value), placeholder: "Rest-pause, Cluster set\u2026", required: true, autoFocus: true }) }), _jsxs("label", { className: "mb-4 flex items-center gap-2 text-sm", children: [_jsx("input", { type: "checkbox", checked: volume, onChange: (e) => setVolume(e.target.checked) }), " Conta no volume e nos recordes"] }), _jsx("button", { className: "btn-primary w-full justify-center", children: "Salvar" })] }) }));
}
