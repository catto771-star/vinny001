import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useMemo, useState } from 'react';
import { Pin, Sparkles, Trophy } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { write } from '../../lib/useTable';
import { feedback } from '../../lib/feedback';
import { formatDay } from '../../lib/dates';
import { num } from '../../lib/format';
import { DEFAULT_SETTINGS, MAX_REPS, MUSCLE_LABEL } from '../../lib/training';
import { classifySetIndicator, hevy1RM, numberSetsLikeHevy, parseSetNotes, readPinnedExerciseNotes, SUPERSET_STYLE, writePinnedExerciseNote, } from '../../lib/hevy';
import { AreaChart } from '../../components/Charts';
import { Empty, Field, Modal } from '../../components/ui';
import { openAssistantDrawer } from '../../components/AssistantDrawer';
const short = (day) => `${day.slice(8)}/${day.slice(5, 7)}`;
export default function ExerciseDetailModal({ h, exerciseId, onClose, onPinnedChange, }) {
    const ex = h.exerciseById.get(exerciseId);
    const [tab, setTab] = useState('Estatísticas');
    const [chartMode, setChartMode] = useState('hevy1RM');
    // Pinned note + progression settings
    const [pinned, setPinned] = useState(() => readPinnedExerciseNotes()[exerciseId] ?? '');
    const currentSettings = h.settingsById.get(exerciseId) ?? DEFAULT_SETTINGS;
    const [repMin, setRepMin] = useState(currentSettings.rep_min);
    const [repMax, setRepMax] = useState(currentSettings.rep_max);
    const [incKg, setIncKg] = useState(currentSettings.load_increment_kg);
    const history = useMemo(() => {
        const workoutById = new Map(h.workouts.rows.map((w) => [w.id, w]));
        const byWorkout = new Map();
        for (const s of h.sets.rows) {
            if (s.exercise_id !== exerciseId || !workoutById.has(s.workout_id))
                continue;
            const list = byWorkout.get(s.workout_id) ?? [];
            list.push(s);
            byWorkout.set(s.workout_id, list);
        }
        const sessions = [...byWorkout.entries()].map(([workoutId, rawSets]) => {
            const w = workoutById.get(workoutId);
            const ordered = [...rawSets].sort((a, b) => a.position - b.position);
            const indicators = ordered.map((s) => {
                const sn = parseSetNotes(s.notes);
                return classifySetIndicator(h.typeById.get(s.set_type_id)?.name, sn.indicator);
            });
            const numbered = numberSetsLikeHevy(indicators);
            let maxLoad = 0;
            let topReps = 0;
            let best1RM = 0;
            let bestSetVol = 0;
            let tonnage = 0;
            let maxReps = 0;
            let workingSetsCount = 0;
            ordered.forEach((s, idx) => {
                const counts = h.typeById.get(s.set_type_id)?.counts_for_volume ?? true;
                if (!counts || s.reps <= 0)
                    return;
                workingSetsCount += 1;
                const setVol = s.load_kg * s.reps;
                tonnage += setVol;
                if (setVol > bestSetVol)
                    bestSetVol = setVol;
                if (s.reps > maxReps)
                    maxReps = s.reps;
                if (s.load_kg > maxLoad || (s.load_kg === maxLoad && s.reps > topReps)) {
                    maxLoad = s.load_kg;
                    topReps = s.reps;
                }
                const e1 = hevy1RM(s.load_kg, s.reps);
                if (e1 != null && e1 > best1RM)
                    best1RM = e1;
                void numbered[idx];
            });
            return {
                workoutId,
                date: w.date,
                title: w.title || 'Treino',
                sets: ordered,
                numbered,
                maxLoad,
                topReps,
                best1RM: best1RM > 0 ? best1RM : null,
                bestSetVol: Math.round(bestSetVol * 10) / 10,
                tonnage: Math.round(tonnage * 10) / 10,
                maxReps,
                workingSetsCount,
            };
        });
        return sessions.sort((a, b) => a.date.localeCompare(b.date) || a.workoutId.localeCompare(b.workoutId));
    }, [exerciseId, h.sets.rows, h.workouts.rows, h.typeById]);
    const prs = useMemo(() => {
        let best1RM = null;
        let bestWeight = null;
        let bestSetVol = null;
        let bestSessionVol = null;
        let mostReps = null;
        for (const s of history) {
            if (s.best1RM && (!best1RM || s.best1RM > best1RM.val)) {
                best1RM = { val: s.best1RM, date: s.date, detail: `${num(s.maxLoad)} kg × ${s.topReps}` };
            }
            if (s.maxLoad > 0 && (!bestWeight || s.maxLoad > bestWeight.val)) {
                bestWeight = { val: s.maxLoad, date: s.date, detail: `${s.topReps} reps` };
            }
            if (s.bestSetVol > 0 && (!bestSetVol || s.bestSetVol > bestSetVol.val)) {
                bestSetVol = { val: s.bestSetVol, date: s.date };
            }
            if (s.tonnage > 0 && (!bestSessionVol || s.tonnage > bestSessionVol.val)) {
                bestSessionVol = { val: s.tonnage, date: s.date };
            }
            if (s.maxReps > 0 && (!mostReps || s.maxReps > mostReps.val)) {
                mostReps = { val: s.maxReps, date: s.date };
            }
        }
        return { best1RM, bestWeight, bestSetVol, bestSessionVol, mostReps };
    }, [history]);
    if (!ex)
        return null;
    async function saveConfig(e) {
        e.preventDefault();
        if (repMin > repMax)
            return alert('O mínimo de repetições não pode passar do máximo.');
        const safeMin = Math.max(1, Math.min(MAX_REPS, repMin));
        const safeMax = Math.max(safeMin, Math.min(MAX_REPS, repMax));
        // Persist pinned note locally + sync to Assistant Memories so the AI Coach remembers setup cues
        const updatedNotes = writePinnedExerciseNote(exerciseId, pinned);
        onPinnedChange?.(updatedNotes);
        if (pinned.trim()) {
            const prefix = `Nota técnica (${ex.name}):`;
            const { data: existingMem } = await supabase
                .from('assistant_memories')
                .select('id,content')
                .eq('category', 'saude')
                .ilike('content', `${prefix}%`)
                .limit(1);
            if (existingMem?.length) {
                await supabase.from('assistant_memories').update({ content: `${prefix} ${pinned.trim()}` }).eq('id', existingMem[0].id);
            }
            else {
                await supabase.from('assistant_memories').insert({ category: 'saude', source: 'user', content: `${prefix} ${pinned.trim()}` });
            }
        }
        const ok = await write(supabase.from('exercise_settings').upsert({ exercise_id: exerciseId, rep_min: safeMin, rep_max: safeMax, load_increment_kg: incKg }, { onConflict: 'user_id,exercise_id' }));
        if (ok) {
            await h.settings.reload();
            feedback({ kind: 'ok', text: 'Configuração e nota fixada salvas' });
        }
    }
    const chartPoints = history
        .filter((s) => s.workingSetsCount > 0)
        .map((s) => ({
        label: short(s.date),
        value: chartMode === 'hevy1RM' ? s.best1RM
            : chartMode === 'maxLoad' ? s.maxLoad
                : chartMode === 'bestSetVol' ? s.bestSetVol
                    : s.tonnage,
        detail: `${num(s.maxLoad)} kg × ${s.topReps} · ${s.workingSetsCount} séries`,
    }));
    return (_jsx(Modal, { title: ex.name, onClose: onClose, children: _jsxs("div", { className: "space-y-4", children: [_jsxs("div", { className: "flex flex-wrap items-center gap-1.5 text-xs", children: [_jsxs("span", { className: "rounded-md border border-line bg-raised px-2 py-0.5 text-fg2", children: ["Prim\u00E1rio: ", _jsx("strong", { children: MUSCLE_LABEL[ex.muscle_group] ?? ex.muscle_group }), " (100%)"] }), ex.secondary_muscles?.map((sm) => (_jsxs("span", { className: "rounded-md border border-line px-2 py-0.5 text-fg3", children: ["Sec.: ", MUSCLE_LABEL[sm] ?? sm, " (50%)"] }, sm))), ex.equipment && (_jsx("span", { className: "rounded-md border border-line px-2 py-0.5 capitalize text-fg3", children: ex.equipment })), _jsxs("button", { type: "button", className: "btn-ghost ml-auto h-7 px-2 text-xs", onClick: () => {
                                onClose();
                                openAssistantDrawer({
                                    prompt: `Analise minha progressão no exercício "${ex.name}" (${history.length} sessões registradas, melhor 1RM ${prs.best1RM ? `${num(prs.best1RM.val)} kg` : 'sem histórico'}) e sugira como destravar carga/execução nas próximas semanas.`,
                                    newThread: true,
                                });
                            }, children: [_jsx(Sparkles, { size: 13, strokeWidth: 1.5 }), " Analisar com IA"] })] }), pinned.trim() && tab !== 'Configuração' && (_jsxs("div", { className: "flex items-start gap-2 rounded-lg border border-brand/30 bg-brand/5 px-3 py-2 text-xs text-fg2", children: [_jsx(Pin, { size: 13, strokeWidth: 1.5, className: "mt-0.5 shrink-0 text-brand" }), _jsx("span", { children: pinned })] })), _jsx("div", { className: "segmented", children: ['Estatísticas', 'Histórico', 'Configuração'].map((t) => (_jsx("button", { type: "button", className: tab === t ? 'tab-active' : 'tab', onClick: () => setTab(t), children: t }, t))) }), tab === 'Estatísticas' && (_jsxs("div", { className: "space-y-4", children: [_jsxs("div", { className: "grid grid-cols-2 gap-2.5 sm:grid-cols-4", children: [_jsxs("div", { className: "rounded-lg border border-line bg-raised/40 p-2.5", children: [_jsxs("div", { className: "flex items-center gap-1 text-[11px] text-fg3", children: [_jsx(Trophy, { size: 12, strokeWidth: 1.5, className: "text-brand" }), " Melhor 1RM"] }), _jsx("div", { className: "figure mt-1 text-base font-medium text-fg", children: prs.best1RM ? `${num(prs.best1RM.val)} kg` : '—' }), prs.best1RM && _jsx("div", { className: "text-[11px] text-fg3", children: prs.best1RM.detail })] }), _jsxs("div", { className: "rounded-lg border border-line bg-raised/40 p-2.5", children: [_jsx("div", { className: "text-[11px] text-fg3", children: "Maior Carga" }), _jsx("div", { className: "figure mt-1 text-base font-medium text-fg", children: prs.bestWeight ? `${num(prs.bestWeight.val)} kg` : '—' }), prs.bestWeight && _jsx("div", { className: "text-[11px] text-fg3", children: prs.bestWeight.detail })] }), _jsxs("div", { className: "rounded-lg border border-line bg-raised/40 p-2.5", children: [_jsx("div", { className: "text-[11px] text-fg3", children: "Melhor S\u00E9rie" }), _jsx("div", { className: "figure mt-1 text-base font-medium text-fg", children: prs.bestSetVol ? `${num(prs.bestSetVol.val)} kg` : '—' }), prs.bestSetVol && _jsx("div", { className: "text-[11px] text-fg3", children: formatDay(prs.bestSetVol.date) })] }), _jsxs("div", { className: "rounded-lg border border-line bg-raised/40 p-2.5", children: [_jsx("div", { className: "text-[11px] text-fg3", children: "Maior Volume" }), _jsx("div", { className: "figure mt-1 text-base font-medium text-fg", children: prs.bestSessionVol ? `${num(prs.bestSessionVol.val)} kg` : '—' }), prs.bestSessionVol && _jsx("div", { className: "text-[11px] text-fg3", children: prs.mostReps ? `máx ${prs.mostReps.val} reps` : '' })] })] }), _jsxs("div", { className: "flex flex-wrap items-center justify-between gap-2", children: [_jsxs("span", { className: "text-xs text-fg3", children: [history.length, " sess\u00F5es registradas"] }), _jsx("div", { className: "segmented", children: [
                                        ['hevy1RM', '1RM'],
                                        ['maxLoad', 'Carga'],
                                        ['bestSetVol', 'Série'],
                                        ['tonnage', 'Volume'],
                                    ].map(([id, label]) => (_jsx("button", { type: "button", className: chartMode === id ? 'tab-active' : 'tab', onClick: () => setChartMode(id), children: label }, id))) })] }), _jsx(AreaChart, { title: chartMode === 'hevy1RM' ? '1RM Estimado (curva 1–30 reps)'
                                : chartMode === 'maxLoad' ? 'Maior Carga por Sessão'
                                    : chartMode === 'bestSetVol' ? 'Melhor Série (kg × reps)'
                                        : 'Volume Total por Sessão', unit: "kg", minZero: false, height: 200, emptyText: "Registre uma sess\u00E3o deste exerc\u00EDcio para visualizar os gr\u00E1ficos de evolu\u00E7\u00E3o.", points: chartPoints })] })), tab === 'Histórico' && (_jsx("div", { className: "max-h-96 space-y-2.5 overflow-y-auto pr-1", children: history.length === 0 ? (_jsx(Empty, { children: "Nenhuma sess\u00E3o registrada para este exerc\u00EDcio ainda." })) : ([...history].reverse().map((s) => (_jsxs("div", { className: "rounded-xl border border-line bg-raised/30 p-3", children: [_jsxs("div", { className: "mb-2 flex items-baseline justify-between gap-2", children: [_jsx("span", { className: "text-sm font-medium text-fg", children: s.title }), _jsxs("span", { className: "text-xs text-fg3", children: [formatDay(s.date), " \u00B7 vol. ", num(s.tonnage), " kg"] })] }), _jsx("div", { className: "space-y-1", children: s.sets.map((row, idx) => {
                                    const badge = s.numbered[idx]?.badge ?? String(idx + 1);
                                    const sn = parseSetNotes(row.notes);
                                    const ssStyle = sn.superset ? SUPERSET_STYLE[sn.superset] : null;
                                    return (_jsxs("div", { className: "flex items-center gap-2 text-xs", children: [_jsx("span", { className: `inline-flex h-5 w-6 items-center justify-center rounded font-medium ${badge === 'W' ? 'bg-warning/15 text-warning'
                                                    : badge === 'D' ? 'bg-info/15 text-info'
                                                        : badge === 'F' ? 'bg-negative/15 text-negative'
                                                            : 'bg-raised text-fg2'}`, children: badge }), _jsxs("span", { className: "figure text-fg", children: [num(row.load_kg), " kg \u00D7 ", row.reps] }), row.effort != null && (_jsxs("span", { className: "rounded border border-line px-1.5 py-0.2 text-[11px] text-fg3", children: ["@", num(row.effort, 1)] })), ssStyle && (_jsx("span", { className: `rounded border px-1.5 py-0.2 text-[10px] ${ssStyle.badge}`, children: ssStyle.label })), hevy1RM(row.load_kg, row.reps) && badge !== 'W' && (_jsxs("span", { className: "ml-auto figure text-[11px] text-fg3", children: ["1RM ", num(hevy1RM(row.load_kg, row.reps)), " kg"] }))] }, row.id));
                                }) })] }, s.workoutId)))) })), tab === 'Configuração' && (_jsxs("form", { onSubmit: saveConfig, className: "space-y-3", children: [_jsx(Field, { label: "Nota Fixada Permanente (vis\u00EDvel em todo treino deste exerc\u00EDcio)", children: _jsx("textarea", { className: "input min-h-[72px] py-2 text-sm", placeholder: "Ex.: Banco no furo 3, escapulas retra\u00EDdas, pegada na linha do anel\u2026", value: pinned, onChange: (e) => setPinned(e.target.value) }) }), _jsx("p", { className: "text-[11px] text-fg3", children: "Sincronizada tamb\u00E9m com a mem\u00F3ria de Sa\u00FAde do Assistente IA para orienta\u00E7\u00F5es personalizadas." }), _jsxs("div", { className: "grid grid-cols-3 gap-2", children: [_jsx(Field, { label: "Reps m\u00EDnimas", children: _jsx("input", { className: "input", type: "number", min: 1, max: MAX_REPS, value: repMin, onChange: (e) => setRepMin(Number(e.target.value)) }) }), _jsx(Field, { label: `Reps máximas (até ${MAX_REPS})`, children: _jsx("input", { className: "input", type: "number", min: 1, max: MAX_REPS, value: repMax, onChange: (e) => setRepMax(Number(e.target.value)) }) }), _jsx(Field, { label: "Incremento (kg)", children: _jsx("input", { className: "input", type: "number", min: 0.25, step: 0.25, value: incKg, onChange: (e) => setIncKg(Number(e.target.value)) }) })] }), _jsx("button", { className: "btn-primary w-full justify-center", children: "Salvar nota e progress\u00E3o" })] }))] }) }));
}
