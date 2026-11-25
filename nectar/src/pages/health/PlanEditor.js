import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, BookOpen, CheckCircle2, ClipboardList, Copy, Flame, FolderPlus, Play, Plus, Sparkles, Timer, Trash2, } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { write } from '../../lib/useTable';
import { feedback } from '../../lib/feedback';
import { toDay, weekdayShort } from '../../lib/dates';
import { num } from '../../lib/format';
import { MUSCLE_LABEL } from '../../lib/training';
import { estimateSetsDurationMinutes, formatSessionNotes, formatSetNotes, parseSessionNotes, parseSetNotes, PRESET_PROGRAMS, SUPERSET_IDS, SUPERSET_STYLE, workoutKcal, } from '../../lib/hevy';
import { serialQueue } from '../../lib/serial';
import { searchKey } from '../../lib/text';
import { draftFromSession, sessionsForDay } from '../../lib/plans';
import { Empty, Field, FieldGroup, Modal, WeekdayPicker } from '../../components/ui';
import { openAssistantDrawer } from '../../components/AssistantDrawer';
import { ExercisePicker } from './WorkoutEditor';
import ExerciseDetailModal from './ExerciseDetailModal';
import { DEFAULT_WEIGHT_KG } from './useHealth';
const SPLITS = {
    'A (corpo inteiro)': ['Treino A'],
    AB: ['Treino A', 'Treino B'],
    ABC: ['Treino A', 'Treino B', 'Treino C'],
    ABCD: ['Treino A', 'Treino B', 'Treino C', 'Treino D'],
    ABCDE: ['Treino A', 'Treino B', 'Treino C', 'Treino D', 'Treino E'],
};
const CUSTOM_FOLDERS_KEY = 'painel:routine-folders:v1';
const I = { size: 16, strokeWidth: 1.5 };
function readSavedFolders() {
    try {
        const raw = window.localStorage.getItem(CUSTOM_FOLDERS_KEY);
        return raw ? JSON.parse(raw) : [];
    }
    catch {
        return [];
    }
}
function saveCustomFolders(folders) {
    try {
        window.localStorage.setItem(CUSTOM_FOLDERS_KEY, JSON.stringify(folders));
    }
    catch {
        // Ignore storage errors
    }
}
export default function PlanEditor({ h, onStart }) {
    const plan = h.workoutPlan;
    const today = toDay(new Date());
    const [selectedFolder, setSelectedFolder] = useState('__all__');
    const [customFolders, setCustomFolders] = useState(() => readSavedFolders());
    const [creatingFolder, setCreatingFolder] = useState(false);
    const [newFolderName, setNewFolderName] = useState('');
    const [showPresets, setShowPresets] = useState(false);
    const [detailExId, setDetailExId] = useState(null);
    const sessions = useMemo(() => (plan ? h.planSessions.rows.filter((s) => s.plan_id === plan.id).sort((a, b) => a.order_index - b.order_index) : []), [plan, h.planSessions.rows]);
    const allFolders = useMemo(() => {
        const set = new Set(customFolders);
        for (const s of sessions) {
            const f = parseSessionNotes(s.notes).folder;
            if (f)
                set.add(f);
        }
        return [...set].sort((a, b) => a.localeCompare(b, 'pt'));
    }, [customFolders, sessions]);
    if (!plan)
        return _jsx(CreatePlan, { h: h, onOpenPresets: () => setShowPresets(true), showPresets: showPresets, onClosePresets: () => setShowPresets(false) });
    const todays = sessionsForDay(sessions, h.workouts.rows, today);
    const working = h.setTypes.rows.find((t) => t.drives_progression && t.user_id === null) ?? h.setTypes.rows[0];
    const weightKg = h.latestWeight ?? DEFAULT_WEIGHT_KG;
    function start(s) {
        const exercises = h.planExercises.rows.filter((e) => e.session_id === s.id);
        const draft = draftFromSession(exercises, {
            sets: h.sets.rows, workouts: h.workouts.rows, types: h.typeById, settings: h.settingsById, workingTypeId: working.id, day: today,
        });
        onStart({ sessionId: s.id, label: s.label, draft });
    }
    async function addSession() {
        const label = `Treino ${String.fromCharCode(65 + sessions.length)}`;
        const folder = selectedFolder !== '__all__' && selectedFolder !== '__none__' ? selectedFolder : null;
        const notes = formatSessionNotes({ folder, cleanNotes: '' });
        if (await write(supabase.from('workout_plan_sessions').insert({ plan_id: plan.id, label, order_index: sessions.length, notes }))) {
            void h.planSessions.reload();
        }
    }
    async function duplicateSession(s) {
        const { data, error } = await supabase
            .from('workout_plan_sessions')
            .insert({
            plan_id: plan.id,
            label: `${s.label} (cópia)`,
            weekdays: [],
            order_index: sessions.length,
            notes: s.notes,
        })
            .select('id')
            .single();
        if (error || !data)
            return feedback({ kind: 'error', text: `Erro ao duplicar: ${error?.message}` });
        const rows = h.planExercises.rows.filter((e) => e.session_id === s.id).sort((a, b) => a.order_index - b.order_index);
        if (rows.length) {
            await write(supabase.from('workout_plan_exercises').insert(rows.map((r, idx) => ({
                session_id: data.id,
                exercise_id: r.exercise_id,
                sets: r.sets,
                reps: r.reps,
                load_kg: r.load_kg,
                rest_s: r.rest_s,
                notes: r.notes,
                order_index: idx,
            }))));
        }
        await Promise.all([h.planSessions.reload(), h.planExercises.reload()]);
        feedback({ kind: 'ok', text: `Rotina "${s.label}" duplicada` });
    }
    function handleCreateFolder(e) {
        e.preventDefault();
        const clean = newFolderName.trim();
        if (!clean)
            return;
        const next = [...new Set([...customFolders, clean])];
        setCustomFolders(next);
        saveCustomFolders(next);
        setSelectedFolder(clean);
        setNewFolderName('');
        setCreatingFolder(false);
    }
    async function importPresetProgram(prog) {
        let orderIdx = sessions.length;
        for (const r of prog.routines) {
            const notes = formatSessionNotes({ folder: prog.folder, cleanNotes: r.notes });
            const { data, error } = await supabase
                .from('workout_plan_sessions')
                .insert({
                plan_id: plan.id,
                label: r.label,
                weekdays: r.weekdays,
                order_index: orderIdx++,
                notes,
            })
                .select('id')
                .single();
            if (error || !data)
                continue;
            const exRows = r.exercises
                .map((spec, idx) => {
                const found = h.exercises.rows.find((ex) => searchKey(ex.name) === searchKey(spec.name))
                    ?? h.exercises.rows.find((ex) => searchKey(ex.name).includes(searchKey(spec.name)));
                if (!found)
                    return null;
                return {
                    session_id: data.id,
                    exercise_id: found.id,
                    sets: spec.sets,
                    reps: spec.reps,
                    rest_s: spec.rest_s,
                    notes: formatSetNotes({ superset: spec.superset ?? null, cleanNotes: spec.notes ?? '' }),
                    order_index: idx,
                };
            })
                .filter((x) => x !== null);
            if (exRows.length) {
                await supabase.from('workout_plan_exercises').insert(exRows);
            }
        }
        const nextFolders = [...new Set([...customFolders, prog.folder])];
        setCustomFolders(nextFolders);
        saveCustomFolders(nextFolders);
        setSelectedFolder(prog.folder);
        setShowPresets(false);
        await Promise.all([h.planSessions.reload(), h.planExercises.reload()]);
        feedback({ kind: 'ok', text: `Programa "${prog.title}" importado na pasta "${prog.folder}"!` });
    }
    const filteredSessions = sessions.filter((s) => {
        if (selectedFolder === '__all__')
            return true;
        const f = parseSessionNotes(s.notes).folder;
        if (selectedFolder === '__none__')
            return !f;
        return f === selectedFolder;
    });
    const activeHabits = (h.habits?.rows ?? []).filter((hb) => !hb.is_archived);
    return (_jsxs(_Fragment, { children: [_jsxs("section", { className: "card mb-6", children: [_jsxs("div", { className: "mb-3 flex flex-wrap items-center justify-between gap-2", children: [_jsx("span", { className: "label", children: "Treino previsto para hoje" }), activeHabits.length > 0 && (_jsxs("label", { className: "flex items-center gap-1.5 text-xs text-fg3", children: [_jsx(CheckCircle2, { size: 13, strokeWidth: 1.5, className: "text-positive" }), "Sincronizar h\u00E1bito:", _jsxs("select", { "aria-label": "Vincular h\u00E1bito \u00E0 ficha", className: "input h-7 w-auto py-0 px-2 text-xs", value: plan.habit_id ?? '', onChange: async (e) => {
                                            const val = e.target.value || null;
                                            if (await write(supabase.from('workout_plans').update({ habit_id: val }).eq('id', plan.id))) {
                                                void h.workoutPlans.reload();
                                            }
                                        }, children: [_jsx("option", { value: "", children: "Autom\u00E1tico (Treinar / Academia)" }), activeHabits.map((hb) => (_jsx("option", { value: hb.id, children: hb.name }, hb.id)))] })] }))] }), todays.length === 0 ? (_jsx("p", { className: "text-sm text-fg2", children: "Nenhuma divis\u00E3o marcada para hoje. Escolha uma abaixo ou marque os dias da semana de cada rotina." })) : (_jsx("div", { className: "flex flex-wrap gap-3", children: todays.map((s) => {
                            const exList = h.planExercises.rows.filter((e) => e.session_id === s.id);
                            const totalSets = exList.reduce((acc, e) => acc + Math.max(1, e.sets ?? 3), 0);
                            const estMin = estimateSetsDurationMinutes(exList.flatMap((e) => Array.from({ length: Math.max(1, e.sets ?? 3) }, () => ({ rest_s: e.rest_s ?? 90 }))));
                            const estKcal = workoutKcal({ duration_min: estMin }, [], h.typeById, weightKg).kcal;
                            return (_jsxs("div", { className: "flex min-w-60 flex-1 items-center gap-4 rounded-xl border border-line bg-raised p-4", children: [_jsxs("div", { className: "mr-auto", children: [_jsx("div", { className: "text-lg font-medium", children: s.label }), _jsxs("div", { className: "mt-0.5 flex flex-wrap items-center gap-2 text-[13px] text-fg3", children: [_jsxs("span", { children: [exList.length, " ", exList.length === 1 ? 'exercício' : 'exercícios', " \u00B7 ", totalSets, " s\u00E9ries"] }), estMin > 0 && _jsxs("span", { children: ["\u00B7 ~", estMin, " min"] }), estKcal > 0 && _jsxs("span", { children: ["\u00B7 ~", num(estKcal), " kcal"] })] })] }), _jsxs("button", { className: "btn-primary", onClick: () => start(s), disabled: !exList.length, children: [_jsx(Play, { ...I }), "Come\u00E7ar"] })] }, s.id));
                        }) }))] }), _jsxs("div", { className: "mb-3 flex flex-wrap items-center gap-2", children: [_jsx(PlanName, { h: h }), _jsxs("div", { className: "ml-auto flex flex-wrap items-center gap-2", children: [_jsxs("button", { type: "button", className: "btn-ghost h-9 text-xs", onClick: () => openAssistantDrawer({
                                    prompt: 'Quero criar uma rotina de treinos personalizada na minha Ficha (gerar_rotina_treino). Considere meu histórico, peso e metas atuais e sugira ou crie as divisões ideais.',
                                    newThread: true,
                                }), children: [_jsx(Sparkles, { size: 15, strokeWidth: 1.5 }), " Montar com IA"] }), _jsxs("button", { type: "button", className: "btn-secondary h-9 text-xs", onClick: () => setShowPresets(true), children: [_jsx(BookOpen, { size: 15, strokeWidth: 1.5 }), " Programas prontos"] }), _jsxs("button", { type: "button", className: "btn-secondary h-9 text-xs", onClick: () => setCreatingFolder(true), children: [_jsx(FolderPlus, { size: 15, strokeWidth: 1.5 }), " Nova pasta"] }), _jsxs("button", { className: "btn-primary h-9 text-xs", onClick: addSession, children: [_jsx(Plus, { ...I }), "Nova rotina"] })] })] }), allFolders.length > 0 && (_jsxs("div", { className: "mb-4 flex flex-wrap items-center gap-1.5", children: [_jsxs("button", { type: "button", onClick: () => setSelectedFolder('__all__'), className: `h-7 rounded-lg border px-2.5 text-xs transition-colors ${selectedFolder === '__all__' ? 'border-brand bg-brand/10 font-medium text-fg' : 'border-line text-fg3 hover:text-fg'}`, children: ["Todas (", sessions.length, ")"] }), allFolders.map((f) => {
                        const count = sessions.filter((s) => parseSessionNotes(s.notes).folder === f).length;
                        return (_jsxs("button", { type: "button", onClick: () => setSelectedFolder(f), className: `h-7 rounded-lg border px-2.5 text-xs transition-colors ${selectedFolder === f ? 'border-brand bg-brand/10 font-medium text-fg' : 'border-line text-fg3 hover:text-fg'}`, children: [f, " (", count, ")"] }, f));
                    }), sessions.some((s) => !parseSessionNotes(s.notes).folder) && (_jsx("button", { type: "button", onClick: () => setSelectedFolder('__none__'), className: `h-7 rounded-lg border px-2.5 text-xs transition-colors ${selectedFolder === '__none__' ? 'border-brand bg-brand/10 font-medium text-fg' : 'border-line text-fg3 hover:text-fg'}`, children: "Sem pasta" }))] })), filteredSessions.length === 0 ? (_jsx("div", { className: "card", children: _jsx(Empty, { action: _jsxs("button", { className: "btn-secondary", onClick: addSession, children: [_jsx(Plus, { ...I }), "Adicionar rotina"] }), children: "Nenhuma rotina nesta pasta ainda." }) })) : (filteredSessions.map((s) => (_jsx(SessionCard, { h: h, session: s, folders: allFolders, weightKg: weightKg, onStart: () => start(s), onDuplicate: () => void duplicateSession(s), onInspectExercise: setDetailExId }, s.id)))), creatingFolder && (_jsx(Modal, { title: "Nova pasta de rotinas", onClose: () => setCreatingFolder(false), children: _jsxs("form", { onSubmit: handleCreateFolder, className: "space-y-3", children: [_jsx(Field, { label: "Nome da pasta", children: _jsx("input", { className: "input", placeholder: "Ex.: Hipertrofia Inverno, Viagem / Halteres, For\u00E7a\u2026", value: newFolderName, onChange: (e) => setNewFolderName(e.target.value), required: true, autoFocus: true }) }), _jsx("button", { className: "btn-primary w-full justify-center", children: "Criar pasta" })] }) })), showPresets && (_jsx(PresetProgramsModal, { onImport: (p) => void importPresetProgram(p), onClose: () => setShowPresets(false) })), detailExId && (_jsx(ExerciseDetailModal, { h: h, exerciseId: detailExId, onClose: () => setDetailExId(null) }))] }));
}
function PresetProgramsModal({ onImport, onClose }) {
    return (_jsx(Modal, { title: "Programas Prontos \u00B7 Biblioteca Estilo Hevy", onClose: onClose, children: _jsx("div", { className: "max-h-[70vh] space-y-3 overflow-y-auto pr-1", children: PRESET_PROGRAMS.map((p) => (_jsxs("div", { className: "rounded-xl border border-line bg-raised/30 p-3.5", children: [_jsxs("div", { className: "flex flex-wrap items-baseline justify-between gap-2", children: [_jsx("h3", { className: "font-medium text-fg", children: p.title }), _jsxs("div", { className: "flex gap-1.5 text-[11px] text-fg3", children: [_jsx("span", { className: "rounded border border-line px-1.5 py-0.5", children: p.level }), _jsx("span", { className: "rounded border border-line px-1.5 py-0.5", children: p.equipment }), _jsxs("span", { className: "rounded border border-line px-1.5 py-0.5", children: [p.daysPerWeek, "x/sem"] })] })] }), _jsx("p", { className: "mt-1 text-xs text-fg2", children: p.summary }), _jsx("div", { className: "mt-2 flex flex-wrap gap-1.5 text-[11px] text-fg3", children: p.routines.map((r) => (_jsxs("span", { className: "rounded bg-raised px-2 py-0.5", children: [r.label, " (", r.exercises.length, " ex.)"] }, r.label))) }), _jsxs("button", { type: "button", className: "btn-primary mt-3 h-8 w-full justify-center text-xs", onClick: () => onImport(p), children: ["Importar na pasta \u201C", p.folder, "\u201D"] })] }, p.id))) }) }));
}
function CreatePlan({ h, onOpenPresets, showPresets, onClosePresets, }) {
    const [name, setName] = useState('Minha ficha');
    const [split, setSplit] = useState('ABC');
    async function create(e) {
        e.preventDefault();
        const { data, error } = await supabase.from('workout_plans').insert({ name, is_active: true }).select('id').single();
        if (error || !data)
            return alert(`Não foi possível criar: ${error?.message}`);
        await write(supabase.from('workout_plan_sessions').insert(SPLITS[split].map((label, i) => ({ plan_id: data.id, label, order_index: i }))));
        await Promise.all([h.workoutPlans.reload(), h.planSessions.reload()]);
    }
    async function createFromPreset(prog) {
        const { data: planData, error } = await supabase.from('workout_plans').insert({ name: prog.title, is_active: true }).select('id').single();
        if (error || !planData)
            return alert(`Não foi possível criar: ${error?.message}`);
        for (let i = 0; i < prog.routines.length; i++) {
            const r = prog.routines[i];
            const { data: sData } = await supabase
                .from('workout_plan_sessions')
                .insert({
                plan_id: planData.id,
                label: r.label,
                weekdays: r.weekdays,
                order_index: i,
                notes: formatSessionNotes({ folder: prog.folder, cleanNotes: r.notes }),
            })
                .select('id')
                .single();
            if (!sData)
                continue;
            const exRows = r.exercises
                .map((spec, idx) => {
                const found = h.exercises.rows.find((ex) => searchKey(ex.name) === searchKey(spec.name));
                if (!found)
                    return null;
                return {
                    session_id: sData.id,
                    exercise_id: found.id,
                    sets: spec.sets,
                    reps: spec.reps,
                    rest_s: spec.rest_s,
                    notes: formatSetNotes({ superset: spec.superset ?? null, cleanNotes: spec.notes ?? '' }),
                    order_index: idx,
                };
            })
                .filter((x) => x !== null);
            if (exRows.length)
                await supabase.from('workout_plan_exercises').insert(exRows);
        }
        onClosePresets();
        await Promise.all([h.workoutPlans.reload(), h.planSessions.reload(), h.planExercises.reload()]);
    }
    return (_jsxs("div", { className: "card max-w-lg", children: [_jsx(Empty, { icon: _jsx(ClipboardList, { size: 18, strokeWidth: 1.5 }), children: "Monte sua ficha em pastas ou importe um Programa Pronto estilo Hevy. O treino do dia j\u00E1 abre preenchido com progress\u00E3o autom\u00E1tica." }), _jsxs("form", { onSubmit: create, children: [_jsx(Field, { label: "Nome da ficha", children: _jsx("input", { className: "input", value: name, onChange: (e) => setName(e.target.value), required: true }) }), _jsx(FieldGroup, { label: "Divis\u00E3o inicial", children: _jsx("div", { className: "segmented", children: Object.keys(SPLITS).map((k) => _jsx("button", { type: "button", "aria-pressed": k === split, className: k === split ? 'tab-active' : 'tab', onClick: () => setSplit(k), children: k }, k)) }) }), _jsxs("div", { className: "flex flex-col gap-2 sm:flex-row", children: [_jsx("button", { className: "btn-primary flex-1 justify-center", children: "Criar ficha vazia" }), _jsxs("button", { type: "button", className: "btn-secondary flex-1 justify-center", onClick: onOpenPresets, children: [_jsx(BookOpen, { size: 15, strokeWidth: 1.5 }), " Importar programa pronto"] })] })] }), showPresets && _jsx(PresetProgramsModal, { onImport: (p) => void createFromPreset(p), onClose: onClosePresets })] }));
}
function PlanName({ h }) {
    const plan = h.workoutPlan;
    const [name, setName] = useState(plan.name);
    return (_jsx("input", { className: "input h-9 max-w-xs bg-transparent text-lg font-medium", "aria-label": "Nome da ficha", value: name, onChange: (e) => setName(e.target.value), onBlur: async () => { if (name.trim() && name !== plan.name && await write(supabase.from('workout_plans').update({ name }).eq('id', plan.id)))
            void h.workoutPlans.reload(); } }));
}
function SessionCard({ h, session, folders, weightKg, onStart, onDuplicate, onInspectExercise, }) {
    const [picking, setPicking] = useState(false);
    const [label, setLabel] = useState(session.label);
    const [weekdays, setWeekdays] = useState(session.weekdays);
    const parsedNotes = useMemo(() => parseSessionNotes(session.notes), [session.notes]);
    const [queue] = useState(serialQueue);
    const rows = h.planExercises.rows.filter((e) => e.session_id === session.id).sort((a, b) => a.order_index - b.order_index);
    // Hevy Routine Summary Stats (Estimated Duration, Total Sets, Estimated Burn, Muscles)
    const totalSets = rows.reduce((sum, r) => sum + Math.max(1, r.sets ?? 3), 0);
    const estMinutes = estimateSetsDurationMinutes(rows.flatMap((r) => Array.from({ length: Math.max(1, r.sets ?? 3) }, () => ({ rest_s: r.rest_s ?? 90 }))));
    const estBurnKcal = rows.length ? workoutKcal({ duration_min: estMinutes }, [], h.typeById, weightKg).kcal : 0;
    const primaryMuscles = [
        ...new Set(rows
            .map((r) => (r.exercise_id ? h.exerciseById.get(r.exercise_id)?.muscle_group : null))
            .filter((m) => !!m)
            .map((m) => MUSCLE_LABEL[m] ?? m)),
    ];
    const update = (patch) => queue(async () => {
        if (await write(supabase.from('workout_plan_sessions').update(patch).eq('id', session.id)))
            await h.planSessions.reload();
    });
    async function add(exerciseId) {
        setPicking(false);
        if (await write(supabase.from('workout_plan_exercises').insert({ session_id: session.id, exercise_id: exerciseId, sets: 3, reps: '8-12', rest_s: 90, order_index: rows.length })))
            void h.planExercises.reload();
    }
    async function move(row, dir) {
        const other = rows[rows.indexOf(row) + dir];
        if (!other)
            return;
        await Promise.all([
            supabase.from('workout_plan_exercises').update({ order_index: other.order_index }).eq('id', row.id),
            supabase.from('workout_plan_exercises').update({ order_index: row.order_index }).eq('id', other.id),
        ]);
        void h.planExercises.reload();
    }
    async function removeSession() {
        if (confirm(`Excluir a divisão ${session.label} e os exercícios dela?`) && await write(supabase.from('workout_plan_sessions').delete().eq('id', session.id))) {
            void h.planSessions.reload();
            void h.planExercises.reload();
        }
    }
    return (_jsxs("section", { className: "card mb-4", children: [_jsxs("div", { className: "mb-3 flex flex-wrap items-center gap-2.5", children: [_jsx("input", { className: "input h-9 w-48 font-medium", "aria-label": "Nome da divis\u00E3o", value: label, onChange: (e) => setLabel(e.target.value), onBlur: () => { if (label.trim() && label !== session.label)
                            void update({ label }); } }), _jsxs("select", { "aria-label": `Pasta de ${session.label}`, className: "input h-9 w-auto py-0 px-2.5 text-xs", value: parsedNotes.folder ?? '', onChange: (e) => {
                            const nextNotes = formatSessionNotes({ folder: e.target.value || null, cleanNotes: parsedNotes.cleanNotes });
                            void update({ notes: nextNotes });
                        }, children: [_jsx("option", { value: "", children: "Sem pasta" }), folders.map((f) => (_jsxs("option", { value: f, children: ["Pasta: ", f] }, f)))] }), _jsx(WeekdayPicker, { value: weekdays, onChange: (next) => { setWeekdays(next); void update({ weekdays: next }); } }), _jsx("span", { className: "text-xs text-fg3", children: weekdays.length ? weekdays.map(weekdayShort).join(', ') : 'rodízio automático' }), _jsxs("div", { className: "ml-auto flex items-center gap-1", children: [_jsxs("button", { type: "button", className: "btn-ghost h-9 px-2.5 text-xs", onClick: onDuplicate, title: "Duplicar esta rotina", children: [_jsx(Copy, { size: 14, strokeWidth: 1.5 }), " Duplicar"] }), _jsxs("button", { className: "btn-primary h-9", onClick: onStart, disabled: !rows.length, children: [_jsx(Play, { ...I }), "Come\u00E7ar"] }), _jsx("button", { className: "icon-btn", onClick: removeSession, "aria-label": `Excluir ${session.label}`, children: _jsx(Trash2, { ...I }) })] })] }), rows.length > 0 && (_jsxs("div", { className: "mb-3 flex flex-wrap items-center gap-3 rounded-lg border border-line bg-raised/40 px-3 py-1.5 text-xs text-fg2", children: [_jsxs("span", { className: "inline-flex items-center gap-1", children: [_jsx(Timer, { size: 13, strokeWidth: 1.5, className: "text-fg3" }), "Dura\u00E7\u00E3o est.: ", _jsxs("strong", { className: "figure", children: ["~", estMinutes, " min"] })] }), _jsxs("span", { className: "inline-flex items-center gap-1", children: [_jsx(Flame, { size: 13, strokeWidth: 1.5, className: "text-brand" }), "Gasto est.: ", _jsxs("strong", { className: "figure", children: ["~", num(estBurnKcal), " kcal"] })] }), _jsxs("span", { className: "figure text-fg3", children: [rows.length, " ex. \u00B7 ", totalSets, " s\u00E9ries"] }), primaryMuscles.length > 0 && (_jsx("span", { className: "ml-auto truncate text-fg3", children: primaryMuscles.join(' · ') }))] })), rows.length === 0 ? (_jsx("p", { className: "mb-3 text-sm text-fg3", children: "Nenhum exerc\u00EDcio nesta rotina" })) : (_jsx("div", { className: "overflow-x-auto", children: _jsxs("table", { className: "w-full min-w-[780px] text-sm", children: [_jsx("thead", { children: _jsxs("tr", { className: "text-left text-xs text-fg3", children: [_jsx("th", { className: "pb-2 font-normal", children: "Exerc\u00EDcio" }), _jsx("th", { className: "pb-2 font-normal", children: "Superset" }), _jsx("th", { className: "pb-2 font-normal", children: "S\u00E9ries" }), _jsx("th", { className: "pb-2 font-normal", children: "Reps / Faixa" }), _jsx("th", { className: "pb-2 font-normal", children: "Carga (kg)" }), _jsx("th", { className: "pb-2 font-normal", children: "Descanso (s)" }), _jsx("th", { className: "pb-2 font-normal", children: "Observa\u00E7\u00E3o" }), _jsx("th", {})] }) }), _jsx("tbody", { children: rows.map((r, i) => (_jsx(ExerciseRow, { h: h, row: r, first: i === 0, last: i === rows.length - 1, onMove: (d) => move(r, d), onInspect: () => r.exercise_id && onInspectExercise(r.exercise_id) }, r.id))) })] }) })), _jsxs("button", { className: "btn-ghost mt-2", onClick: () => setPicking(true), children: [_jsx(Plus, { ...I }), "Exerc\u00EDcio"] }), picking && _jsx(ExercisePicker, { h: h, onPick: add, onClose: () => setPicking(false) })] }));
}
function ExerciseRow({ h, row, first, last, onMove, onInspect, }) {
    const ex = row.exercise_id ? h.exerciseById.get(row.exercise_id) : undefined;
    const parsed = parseSetNotes(row.notes);
    const [v, setV] = useState({
        sets: row.sets?.toString() ?? '',
        reps: row.reps ?? '',
        load_kg: row.load_kg?.toString() ?? '',
        rest_s: row.rest_s?.toString() ?? '',
        superset: parsed.superset ?? '',
        notes: parsed.cleanNotes,
    });
    const [queue] = useState(serialQueue);
    const persist = (next = v) => {
        const patch = {
            sets: next.sets ? Number(next.sets) : null,
            reps: next.reps || null,
            load_kg: next.load_kg ? Number(next.load_kg) : null,
            rest_s: next.rest_s ? Number(next.rest_s) : null,
            notes: formatSetNotes({ superset: next.superset || null, cleanNotes: next.notes }),
        };
        void queue(async () => {
            if (await write(supabase.from('workout_plan_exercises').update(patch).eq('id', row.id)))
                await h.planExercises.reload();
        });
    };
    const ssStyle = v.superset ? SUPERSET_STYLE[v.superset] : null;
    const cell = (k, label, w, type = 'text') => (_jsx("td", { className: "py-1 pr-2", children: _jsx("input", { className: `input h-9 ${w}`, "aria-label": `${label}: ${ex?.name}`, type: type, value: v[k], onChange: (e) => setV({ ...v, [k]: e.target.value }), onBlur: () => persist() }) }));
    return (_jsxs("tr", { className: `border-t border-line ${ssStyle ? 'bg-raised/20' : ''}`, children: [_jsxs("td", { className: "py-2 pr-3", children: [_jsx("button", { type: "button", className: "text-left font-medium text-fg hover:text-brand hover:underline", onClick: onInspect, children: ex?.name ?? 'Exercício' }), _jsxs("div", { className: "text-xs text-fg3", children: [ex ? MUSCLE_LABEL[ex.muscle_group] : '', ex?.equipment ? ` · ${ex.equipment}` : ''] })] }), _jsx("td", { className: "py-1 pr-2", children: _jsxs("select", { "aria-label": `Superset: ${ex?.name}`, className: `input h-9 w-20 py-0 px-2 text-xs ${ssStyle ? ssStyle.badge : ''}`, value: v.superset, onChange: (e) => {
                        const next = { ...v, superset: e.target.value };
                        setV(next);
                        persist(next);
                    }, children: [_jsx("option", { value: "", children: "\u2014" }), SUPERSET_IDS.map((id) => (_jsxs("option", { value: id, children: ["SS ", id] }, id)))] }) }), cell('sets', 'Séries', 'w-16', 'number'), cell('reps', 'Repetições', 'w-20'), cell('load_kg', 'Carga', 'w-20', 'number'), cell('rest_s', 'Descanso', 'w-20', 'number'), cell('notes', 'Observação', 'w-36'), _jsxs("td", { className: "whitespace-nowrap", children: [_jsx("button", { className: "icon-btn", disabled: first, onClick: () => onMove(-1), "aria-label": `Subir ${ex?.name}`, children: _jsx(ArrowUp, { ...I }) }), _jsx("button", { className: "icon-btn", disabled: last, onClick: () => onMove(1), "aria-label": `Descer ${ex?.name}`, children: _jsx(ArrowDown, { ...I }) }), _jsx("button", { className: "icon-btn hover:text-negative", "aria-label": `Remover ${ex?.name}`, onClick: async () => {
                            if (await write(supabase.from('workout_plan_exercises').delete().eq('id', row.id)))
                                void h.planExercises.reload();
                        }, children: _jsx(Trash2, { ...I }) })] })] }));
}
