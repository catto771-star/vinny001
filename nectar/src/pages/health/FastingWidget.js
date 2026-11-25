import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Clock, Flame, Play, Square, Trash2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { write } from '../../lib/useTable';
import { num } from '../../lib/format';
import { FASTING_PROTOCOLS, METABOLIC_STAGES, computeFastingStatus, formatFastingDuration, summarizeFasts, } from '../../lib/fasting';
import { NutrientRing } from '../../components/Charts';
import { Field, Modal } from '../../components/ui';
const I = { size: 16, strokeWidth: 1.5, 'aria-hidden': true };
function toLocalDatetimeValue(d) {
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function formatDateTimePt(d) {
    return d.toLocaleString('pt-BR', {
        weekday: 'short',
        day: '2-digit',
        month: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
    });
}
export default function FastingWidget({ h, compact = false }) {
    const [now, setNow] = useState(() => new Date());
    const [starting, setStarting] = useState(false);
    const [ending, setEnding] = useState(false);
    const [endNotes, setEndNotes] = useState('');
    const active = h.activeFast;
    useEffect(() => {
        if (!active)
            return;
        const id = window.setInterval(() => setNow(new Date()), 1000);
        return () => window.clearInterval(id);
    }, [active?.id]);
    const status = useMemo(() => (active ? computeFastingStatus(active, now) : null), [active, now]);
    const summary = useMemo(() => summarizeFasts(h.fasts.rows, now), [h.fasts.rows, now]);
    const history = h.fasts.rows.filter((f) => f.ended_at !== null).slice(0, compact ? 3 : 8);
    async function finishFast() {
        if (!active)
            return;
        const ok = await write(supabase
            .from('fasting_sessions')
            .update({ ended_at: new Date().toISOString(), notes: endNotes.trim() || active.notes || null })
            .eq('id', active.id));
        if (ok) {
            setEnding(false);
            setEndNotes('');
            await h.fasts.reload();
        }
    }
    async function cancelFast() {
        if (!active || !confirm('Cancelar e descartar este jejum em andamento?'))
            return;
        if (await write(supabase.from('fasting_sessions').delete().eq('id', active.id))) {
            await h.fasts.reload();
        }
    }
    return (_jsxs("div", { className: "space-y-4", children: [_jsxs("section", { className: "card", children: [_jsxs("div", { className: "mb-4 flex flex-wrap items-center gap-2", children: [_jsxs("div", { className: "mr-auto", children: [_jsx("h2", { className: "text-[15px] leading-6 font-medium text-fg", children: "Jejum intermitente" }), _jsx("p", { className: "text-xs text-fg3", children: active
                                            ? `Protocolo ${active.protocol} (${num(active.target_hours)}h)`
                                            : 'Escolha um protocolo pré-definido ou personalize as horas com prévia exata de término' })] }), !active && compact && (_jsxs("button", { type: "button", className: "btn-primary", onClick: () => setStarting(true), children: [_jsx(Play, { ...I }), " Iniciar jejum"] })), active && (_jsxs("button", { type: "button", className: "btn-primary", onClick: () => setEnding(true), children: [_jsx(Square, { ...I }), " Terminar jejum"] }))] }), active && status ? (_jsx("div", { className: "rounded-xl border border-line bg-raised/40 p-4", children: _jsxs("div", { className: "flex flex-wrap items-center gap-5", children: [_jsx(NutrientRing, { label: status.goalReached ? 'Meta batida' : 'Progresso', pct: status.pct, size: 84 }), _jsxs("div", { className: "min-w-0 flex-1 space-y-1.5", children: [_jsxs("div", { className: "flex flex-wrap items-baseline gap-3", children: [_jsxs("div", { children: [_jsx("div", { className: "text-[11px] text-fg3", children: "Tempo em jejum" }), _jsx("div", { className: "figure text-2xl font-medium text-fg", children: formatFastingDuration(status.elapsedMs, true) })] }), _jsxs("div", { className: "border-l border-line pl-3", children: [_jsx("div", { className: "text-[11px] text-fg3", children: status.goalReached ? 'Além da meta' : 'Faltam' }), _jsx("div", { className: "figure text-sm font-medium text-fg2", children: status.goalReached
                                                                ? `+${formatFastingDuration(status.elapsedMs - status.targetMs)}`
                                                                : formatFastingDuration(status.remainingMs) })] })] }), _jsxs("div", { className: "flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-fg2", children: [_jsxs("span", { className: "inline-flex items-center gap-1", children: [_jsx(Clock, { size: 13, strokeWidth: 1.5, className: "text-fg3" }), "In\u00EDcio: ", _jsx("strong", { className: "font-medium text-fg", children: formatDateTimePt(new Date(active.started_at)) })] }), _jsxs("span", { className: "inline-flex items-center gap-1", children: [_jsx(CheckCircle2, { size: 13, strokeWidth: 1.5, className: "text-positive" }), "T\u00E9rmino previsto: ", _jsx("strong", { className: "font-medium text-fg", children: formatDateTimePt(status.expectedEndAt) })] })] }), _jsxs("div", { className: "pt-1 text-xs text-fg3", children: [_jsxs("span", { className: "inline-flex items-center gap-1 font-medium text-fg2", children: [_jsx(Flame, { size: 13, strokeWidth: 1.5, className: "text-warning" }), status.stage.label, ":"] }), ' ', status.stage.description] })] }), _jsx("button", { type: "button", className: "btn-ghost text-xs text-fg3 hover:text-negative", onClick: cancelFast, title: "Descartar jejum", children: "Cancelar" })] }) })) : compact ? (_jsxs("div", { className: "flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-raised/30 px-4 py-3 text-sm", children: [_jsxs("div", { className: "text-fg2", children: ["Nenhum jejum ativo agora.", summary.completedCount > 0 && (_jsxs("span", { className: "ml-2 text-xs text-fg3", children: [summary.completedCount, " conclu\u00EDdos \u00B7 m\u00E9dia ", num(summary.averageHours), "h \u00B7 recorde ", num(summary.longestHours), "h"] }))] }), _jsx("div", { className: "flex flex-wrap gap-1.5", children: ['16:8', '18:6', '20:4'].map((preset) => (_jsxs("button", { type: "button", className: "btn-secondary h-8 px-2.5 text-xs", onClick: async () => {
                                        const p = FASTING_PROTOCOLS.find((x) => x.id === preset);
                                        if (await write(supabase.from('fasting_sessions').insert({
                                            protocol: p.id,
                                            target_hours: p.fastHours,
                                            started_at: new Date().toISOString(),
                                        }))) {
                                            await h.fasts.reload();
                                        }
                                    }, children: ["Iniciar ", preset] }, preset))) })] })) : (_jsx(StartFastConfigurator, { onStarted: () => h.fasts.reload() })), !compact && history.length > 0 && (_jsxs("div", { className: "mt-5 border-t border-line pt-4", children: [_jsxs("div", { className: "mb-2 flex items-center justify-between", children: [_jsx("div", { className: "label", children: "Hist\u00F3rico recente" }), _jsxs("div", { className: "text-xs text-fg3", children: [summary.completedCount, " conclu\u00EDdos \u00B7 m\u00E9dia ", num(summary.averageHours), "h \u00B7 recorde ", num(summary.longestHours), "h"] })] }), _jsx("ul", { className: "divide-y divide-line text-sm", children: history.map((f) => {
                                    const st = computeFastingStatus(f);
                                    return (_jsxs("li", { className: "flex items-center gap-3 py-2", children: [_jsx("span", { className: "rounded-md border border-line px-2 py-0.5 font-mono text-xs text-fg2", children: f.protocol }), _jsxs("span", { className: "mr-auto text-xs text-fg3", children: [formatDateTimePt(new Date(f.started_at)), " \u2192 ", f.ended_at ? formatDateTimePt(new Date(f.ended_at)) : '', f.notes ? ` · ${f.notes}` : ''] }), _jsxs("span", { className: `figure text-xs font-medium ${st.goalReached ? 'text-positive' : 'text-fg2'}`, children: [num(st.elapsedHours, 1), "h / ", num(f.target_hours), "h"] }), _jsx("button", { type: "button", className: "text-fg3 hover:text-negative", "aria-label": "Excluir registro de jejum", onClick: async () => {
                                                    if (await write(supabase.from('fasting_sessions').delete().eq('id', f.id))) {
                                                        void h.fasts.reload();
                                                    }
                                                }, children: _jsx(Trash2, { size: 14, strokeWidth: 1.5 }) })] }, f.id));
                                }) })] })), starting && (_jsx(Modal, { title: "Configurar jejum intermitente", onClose: () => setStarting(false), children: _jsx(StartFastConfigurator, { onStarted: async () => {
                                setStarting(false);
                                await h.fasts.reload();
                            } }) })), ending && active && status && (_jsxs(Modal, { title: "Terminar jejum", onClose: () => setEnding(false), children: [_jsxs("div", { className: "mb-4 rounded-xl border border-line bg-raised/40 p-3 text-sm", children: [_jsxs("div", { className: "flex items-baseline justify-between", children: [_jsx("span", { className: "text-fg2", children: "Tempo total em jejum" }), _jsx("span", { className: "figure text-lg font-medium text-fg", children: formatFastingDuration(status.elapsedMs) })] }), _jsxs("div", { className: "mt-1 text-xs text-fg3", children: ["Meta do protocolo ", active.protocol, ": ", num(active.target_hours), "h (", status.pct, "% conclu\u00EDdo)"] })] }), _jsx(Field, { label: "Observa\u00E7\u00F5es (opcional)", children: _jsx("input", { className: "input", placeholder: "Como se sentiu, energia, refei\u00E7\u00E3o de quebra\u2026", value: endNotes, onChange: (e) => setEndNotes(e.target.value) }) }), _jsxs("div", { className: "flex gap-2", children: [_jsx("button", { type: "button", className: "btn-ghost", onClick: () => setEnding(false), children: "Continuar jejum" }), _jsx("button", { type: "button", className: "btn-primary ml-auto", onClick: finishFast, children: "Confirmar t\u00E9rmino" })] })] }))] }), !compact && (_jsxs("section", { className: "card", children: [_jsx("div", { className: "label mb-3", children: "Fases metab\u00F3licas do jejum" }), _jsx("div", { className: "grid gap-2.5 sm:grid-cols-2 lg:grid-cols-5", children: METABOLIC_STAGES.map((stage, idx) => {
                            const isCurrent = status?.stage.id === stage.id;
                            const nextMin = METABOLIC_STAGES[idx + 1]?.minHours;
                            return (_jsxs("div", { className: `rounded-xl border p-3 text-xs ${isCurrent ? 'border-brand bg-raised text-fg' : 'border-line bg-raised/25 text-fg2'}`, children: [_jsxs("div", { className: "flex items-center justify-between gap-2", children: [_jsx("span", { className: "font-medium text-fg", children: stage.label }), _jsx("span", { className: "figure shrink-0 font-mono text-[11px] text-fg3", children: nextMin ? `${stage.minHours}–${nextMin}h` : `${stage.minHours}h+` })] }), _jsx("p", { className: "mt-1 text-[11px] leading-relaxed text-fg3", children: stage.description })] }, stage.id));
                        }) })] }))] }));
}
function StartFastConfigurator({ onStarted }) {
    const [protocolId, setProtocolId] = useState('16:8');
    const [customHours, setCustomHours] = useState(16);
    const [startLocal, setStartLocal] = useState(() => toLocalDatetimeValue(new Date()));
    const [notes, setNotes] = useState('');
    const selectedPreset = FASTING_PROTOCOLS.find((p) => p.id === protocolId);
    const targetHours = protocolId === 'custom' ? Math.max(1, customHours || 16) : (selectedPreset?.fastHours ?? 16);
    const startDate = useMemo(() => {
        const parsed = new Date(startLocal);
        return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
    }, [startLocal]);
    const expectedEnd = useMemo(() => new Date(startDate.getTime() + targetHours * 3_600_000), [startDate, targetHours]);
    async function submit() {
        const label = protocolId === 'custom' ? `${targetHours}h` : protocolId;
        if (await write(supabase.from('fasting_sessions').insert({
            protocol: label,
            target_hours: targetHours,
            started_at: startDate.toISOString(),
            notes: notes.trim() || null,
        }))) {
            await onStarted();
        }
    }
    return (_jsxs("div", { children: [_jsxs("div", { className: "mb-4", children: [_jsx("div", { className: "label mb-2", children: "Protocolo" }), _jsxs("div", { className: "grid grid-cols-2 gap-2 sm:grid-cols-4", children: [FASTING_PROTOCOLS.map((p) => (_jsxs("button", { type: "button", onClick: () => { setProtocolId(p.id); setCustomHours(p.fastHours); }, className: `rounded-lg border px-3 py-2 text-left text-xs transition-colors ${protocolId === p.id ? 'border-brand bg-raised text-fg' : 'border-line text-fg2 hover:bg-raised/60'}`, children: [_jsx("div", { className: "font-mono text-sm font-medium text-fg", children: p.label }), _jsxs("div", { className: "mt-0.5 truncate text-[11px] text-fg3", children: [p.fastHours, "h jejum"] })] }, p.id))), _jsxs("button", { type: "button", onClick: () => setProtocolId('custom'), className: `rounded-lg border px-3 py-2 text-left text-xs transition-colors ${protocolId === 'custom' ? 'border-brand bg-raised text-fg' : 'border-line text-fg2 hover:bg-raised/60'}`, children: [_jsx("div", { className: "text-sm font-medium text-fg", children: "Personalizado" }), _jsx("div", { className: "mt-0.5 text-[11px] text-fg3", children: "Livre (1\u2013168h)" })] })] }), selectedPreset && (_jsx("p", { className: "mt-2 text-xs text-fg3", children: selectedPreset.subtitle }))] }), _jsxs("div", { className: "grid gap-4 md:grid-cols-2", children: [protocolId === 'custom' && (_jsx(Field, { label: "Dura\u00E7\u00E3o do jejum (horas)", children: _jsx("input", { className: "input", type: "number", min: 1, max: 168, step: "0.5", value: customHours, onChange: (e) => setCustomHours(Number(e.target.value)) }) })), _jsx(Field, { label: "In\u00EDcio do jejum (ajuste se come\u00E7ou antes)", children: _jsx("input", { className: "input", type: "datetime-local", value: startLocal, onChange: (e) => setStartLocal(e.target.value) }) }), _jsx(Field, { label: "Nota (opcional)", children: _jsx("input", { className: "input", placeholder: "Ex.: \u00DAltima refei\u00E7\u00E3o foi jantar leve", value: notes, onChange: (e) => setNotes(e.target.value) }) })] }), _jsxs("div", { className: "mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-raised/50 px-4 py-3 text-sm", children: [_jsxs("div", { children: [_jsxs("div", { className: "text-xs text-fg3", children: ["Pr\u00E9via exata de t\u00E9rmino (", num(targetHours), " horas de jejum)"] }), _jsx("div", { className: "mt-0.5 font-medium text-fg", children: formatDateTimePt(expectedEnd) })] }), _jsxs("button", { type: "button", className: "btn-primary", onClick: submit, children: [_jsx(Play, { ...I }), " Iniciar jejum (", protocolId === 'custom' ? `${num(targetHours)}h` : protocolId, ")"] })] })] }));
}
