import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from 'react';
import { Sparkles } from 'lucide-react';
import { num } from '../../lib/format';
import { MUSCLE_LABEL } from '../../lib/training';
import { analyzeMuscleSymmetry } from '../../lib/hevy';
import { openAssistantDrawer } from '../../components/AssistantDrawer';
export default function BodyHeatmap({ rows, periodLabel = 'período selecionado', compact = false }) {
    const [hovered, setHovered] = useState(null);
    const byMuscle = new Map(rows.map((r) => [r.muscle_group, r]));
    const symmetry = analyzeMuscleSymmetry(rows);
    const intensityOf = (muscle) => {
        const r = byMuscle.get(muscle);
        if (!r)
            return 0;
        return Math.max(0.18, r.intensity);
    };
    const fillFor = (muscle) => {
        const alpha = intensityOf(muscle);
        const active = hovered === muscle;
        if (alpha <= 0)
            return 'var(--raised)';
        return `color-mix(in oklab, var(--brand) ${Math.round((active ? Math.min(1, alpha + 0.15) : alpha) * 88)}%, var(--raised))`;
    };
    const strokeFor = (muscle) => hovered === muscle ? 'var(--brand)' : intensityOf(muscle) > 0 ? 'color-mix(in oklab, var(--brand) 55%, var(--line-strong))' : 'var(--line-strong)';
    const bind = (muscle) => ({
        fill: fillFor(muscle),
        stroke: strokeFor(muscle),
        strokeWidth: hovered === muscle ? 1.6 : 1,
        className: 'cursor-pointer transition-colors duration-150',
        onMouseEnter: () => setHovered(muscle),
        onMouseLeave: () => setHovered(null),
    });
    const activeRow = hovered ? byMuscle.get(hovered) : rows[0];
    return (_jsxs("div", { className: compact ? 'space-y-4' : 'grid gap-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]', children: [_jsxs("div", { className: "rounded-xl border border-line bg-bg/40 p-4", children: [_jsxs("div", { className: "mb-3 flex items-center justify-between text-xs text-fg3", children: [_jsx("span", { children: "Mapa anat\u00F4mico (1,0\u00D7 prim\u00E1rio + 0,5\u00D7 secund\u00E1rio)" }), _jsx("span", { className: "figure text-fg2", children: hovered
                                    ? `${MUSCLE_LABEL[hovered] ?? hovered}: ${num(byMuscle.get(hovered)?.weightedSets ?? 0, 1)} séries`
                                    : activeRow
                                        ? `Destaque: ${activeRow.label} (${num(activeRow.weightedSets, 1)} séries)`
                                        : 'Passe o cursor sobre um músculo' })] }), _jsxs("div", { className: "grid grid-cols-2 gap-4", children: [_jsxs("div", { className: "flex flex-col items-center", children: [_jsx("span", { className: "mb-1.5 text-[11px] font-medium text-fg3", children: "Frente" }), _jsxs("svg", { viewBox: "0 0 140 250", className: "h-56 w-auto select-none", role: "img", "aria-label": "Mapa muscular frontal", children: [_jsx("circle", { cx: "70", cy: "22", r: "13", fill: "var(--raised)", stroke: "var(--line-strong)", strokeWidth: "1" }), _jsx("rect", { x: "64", y: "35", width: "12", height: "8", rx: "3", fill: "var(--raised)", stroke: "var(--line-strong)", strokeWidth: "1" }), _jsx("ellipse", { cx: "42", cy: "54", rx: "10", ry: "11", ...bind('ombros') }), _jsx("ellipse", { cx: "98", cy: "54", rx: "10", ry: "11", ...bind('ombros') }), _jsx("path", { d: "M50 45 Q70 43 70 50 L70 72 Q56 74 49 65 Z", ...bind('peito') }), _jsx("path", { d: "M90 45 Q70 43 70 50 L70 72 Q84 74 91 65 Z", ...bind('peito') }), _jsx("rect", { x: "31", y: "66", width: "11", height: "26", rx: "5.5", ...bind('biceps') }), _jsx("rect", { x: "98", y: "66", width: "11", height: "26", rx: "5.5", ...bind('biceps') }), _jsx("rect", { x: "27", y: "95", width: "10", height: "28", rx: "5", ...bind('antebraco') }), _jsx("rect", { x: "103", y: "95", width: "10", height: "28", rx: "5", ...bind('antebraco') }), _jsx("rect", { x: "54", y: "74", width: "32", height: "44", rx: "6", ...bind('abdomen') }), _jsx("line", { x1: "70", y1: "76", x2: "70", y2: "116", stroke: "var(--line)", strokeWidth: "0.8", pointerEvents: "none" }), _jsx("line", { x1: "56", y1: "88", x2: "84", y2: "88", stroke: "var(--line)", strokeWidth: "0.8", pointerEvents: "none" }), _jsx("line", { x1: "56", y1: "101", x2: "84", y2: "101", stroke: "var(--line)", strokeWidth: "0.8", pointerEvents: "none" }), _jsx("path", { d: "M51 121 L68 121 L66 178 Q56 181 50 174 Z", ...bind('quadriceps') }), _jsx("path", { d: "M72 121 L89 121 L90 174 Q84 181 74 178 Z", ...bind('quadriceps') }), _jsx("rect", { x: "52", y: "183", width: "13", height: "44", rx: "6", ...bind('panturrilhas') }), _jsx("rect", { x: "75", y: "183", width: "13", height: "44", rx: "6", ...bind('panturrilhas') })] })] }), _jsxs("div", { className: "flex flex-col items-center", children: [_jsx("span", { className: "mb-1.5 text-[11px] font-medium text-fg3", children: "Costas" }), _jsxs("svg", { viewBox: "0 0 140 250", className: "h-56 w-auto select-none", role: "img", "aria-label": "Mapa muscular posterior", children: [_jsx("circle", { cx: "70", cy: "22", r: "13", fill: "var(--raised)", stroke: "var(--line-strong)", strokeWidth: "1" }), _jsx("rect", { x: "64", y: "35", width: "12", height: "8", rx: "3", fill: "var(--raised)", stroke: "var(--line-strong)", strokeWidth: "1" }), _jsx("ellipse", { cx: "42", cy: "54", rx: "10", ry: "11", ...bind('ombros') }), _jsx("ellipse", { cx: "98", cy: "54", rx: "10", ry: "11", ...bind('ombros') }), _jsx("path", { d: "M50 44 L90 44 L86 112 L54 112 Z", ...bind('costas') }), _jsx("line", { x1: "70", y1: "45", x2: "70", y2: "111", stroke: "var(--line)", strokeWidth: "0.8", pointerEvents: "none" }), _jsx("rect", { x: "31", y: "66", width: "11", height: "26", rx: "5.5", ...bind('triceps') }), _jsx("rect", { x: "98", y: "66", width: "11", height: "26", rx: "5.5", ...bind('triceps') }), _jsx("rect", { x: "27", y: "95", width: "10", height: "28", rx: "5", ...bind('antebraco') }), _jsx("rect", { x: "103", y: "95", width: "10", height: "28", rx: "5", ...bind('antebraco') }), _jsx("ellipse", { cx: "60", cy: "124", rx: "11", ry: "11", ...bind('gluteos') }), _jsx("ellipse", { cx: "80", cy: "124", rx: "11", ry: "11", ...bind('gluteos') }), _jsx("rect", { x: "51", y: "137", width: "15", height: "41", rx: "6.5", ...bind('posteriores') }), _jsx("rect", { x: "74", y: "137", width: "15", height: "41", rx: "6.5", ...bind('posteriores') }), _jsx("rect", { x: "52", y: "183", width: "13", height: "44", rx: "6", ...bind('panturrilhas') }), _jsx("rect", { x: "75", y: "183", width: "13", height: "44", rx: "6", ...bind('panturrilhas') })] })] })] })] }), !compact && (_jsxs("div", { className: "flex flex-col justify-between space-y-4", children: [_jsxs("div", { className: "space-y-3", children: [_jsxs("div", { className: "flex items-center justify-between", children: [_jsxs("div", { className: "label", children: ["Equil\u00EDbrio de Cadeias (", periodLabel, ")"] }), _jsxs("button", { type: "button", className: "btn-ghost h-7 px-2 text-xs", onClick: () => openAssistantDrawer({
                                            prompt: `Analise meu equilíbrio muscular (${periodLabel}): Empurrar ${symmetry.pushSets} séries, Puxar ${symmetry.pullSets} séries, Pernas ${symmetry.legsSets} séries, Core ${symmetry.coreSets} séries. Sugira ajustes práticos na minha ficha.`,
                                            newThread: true,
                                        }), children: [_jsx(Sparkles, { size: 13, strokeWidth: 1.5 }), " Avaliar com IA"] })] }), _jsx("div", { className: "grid grid-cols-2 gap-2.5 sm:grid-cols-4", children: [
                                    { label: 'Empurrar', val: symmetry.pushSets },
                                    { label: 'Puxar', val: symmetry.pullSets },
                                    { label: 'Pernas', val: symmetry.legsSets },
                                    { label: 'Core / Global', val: symmetry.coreSets },
                                ].map((c) => (_jsxs("div", { className: "rounded-lg border border-line bg-raised/40 px-3 py-2", children: [_jsx("div", { className: "text-[11px] text-fg3", children: c.label }), _jsx("div", { className: "figure mt-0.5 text-base font-medium text-fg", children: num(c.val, 1) })] }, c.label))) }), _jsx("p", { className: "rounded-lg border border-line bg-raised/30 px-3 py-2 text-xs text-fg2", children: symmetry.balanceNote })] }), rows.length > 0 && (_jsxs("div", { className: "space-y-2", children: [_jsx("div", { className: "label", children: "Volume Ponderado por M\u00FAsculo" }), _jsx("div", { className: "max-h-48 space-y-1.5 overflow-y-auto pr-1", children: rows.map((r) => (_jsxs("div", { className: "flex items-center gap-2 text-xs", onMouseEnter: () => setHovered(r.muscle_group), onMouseLeave: () => setHovered(null), children: [_jsx("span", { className: "w-28 truncate text-fg2", children: r.label }), _jsx("div", { className: "h-1.5 flex-1 overflow-hidden rounded-full bg-raised", children: _jsx("div", { className: "h-full rounded-full bg-brand transition-[width] duration-200", style: { width: `${Math.round(r.intensity * 100)}%` } }) }), _jsxs("span", { className: "figure w-24 text-right text-fg", children: [num(r.weightedSets, 1), " ", _jsxs("span", { className: "text-fg3", children: ["(", r.primarySets, "+", r.secondarySets, "\u00D7\u00BD)"] })] })] }, r.muscle_group))) })] }))] }))] }));
}
