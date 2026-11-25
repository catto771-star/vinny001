import { jsxs as _jsxs, jsx as _jsx, Fragment as _Fragment } from "react/jsx-runtime";
import { useId, useState } from 'react';
import { num } from '../lib/format';
import { donutSlices, hasChartData, nextChartIndex, seriesDelta, smoothSvgPath, } from '../lib/charts';
const ACCENT = 'var(--brand)';
const NEUTRAL = 'var(--chart-neutral)';
const PAD = { top: 24, right: 28, bottom: 28, left: 60 };
function niceMax(max) {
    if (max <= 0)
        return 1;
    const exp = 10 ** Math.floor(Math.log10(max));
    const f = max / exp;
    return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * exp;
}
function lastIndex(xs, ok) {
    for (let i = xs.length - 1; i >= 0; i--)
        if (ok(xs[i]))
            return i;
    return -1;
}
const fmt = (n) => (Math.abs(n) >= 10000 ? `${num(n / 1000, 0)} mil` : num(n));
export function DeltaBadge({ pct, diff, unit, invert = false, context }) {
    if (diff === 0 && pct === 0) {
        return _jsxs("span", { className: "figure text-xs text-fg3", children: ["0%", context ? ` ${context}` : ''] });
    }
    const good = invert ? diff < 0 : diff > 0;
    const cls = good ? 'text-positive' : 'text-negative';
    const sign = diff > 0 ? '+' : '−';
    const text = pct !== null
        ? `${sign}${num(Math.abs(pct), 1)}%`
        : `${sign}${fmt(Math.abs(diff))}${unit ? ` ${unit}` : ''}`;
    return (_jsxs("span", { className: `figure text-xs font-medium ${cls}`, children: [text, context && _jsxs("span", { className: "font-normal text-fg3", children: [" ", context] })] }));
}
export function ChartFrame({ title, subtitle, points, unit, children, aside, badge, emptyText = 'Sem registros neste período' }) {
    const [table, setTable] = useState(false);
    const populated = hasChartData(points);
    return (_jsxs("figure", { className: "card", children: [_jsxs("figcaption", { className: "mb-4 flex flex-wrap items-start gap-3", children: [_jsxs("div", { className: "mr-auto min-w-0", children: [_jsxs("div", { className: "flex flex-wrap items-center gap-2", children: [_jsx("span", { className: "font-medium", children: title }), badge] }), subtitle && _jsx("div", { className: "mt-0.5 text-[13px] leading-5 text-fg3", children: subtitle })] }), aside, populated && (_jsx("button", { type: "button", "aria-pressed": table, className: "rounded-lg px-2.5 py-1 text-[13px] font-medium text-fg2 transition-colors duration-150 hover:bg-raised hover:text-fg", onClick: () => setTable(!table), children: table ? 'Ver gráfico' : 'Ver tabela' }))] }), !populated ? (_jsx("div", { className: "flex min-h-[140px] items-center justify-center rounded-[14px] bg-raised/50 px-4 py-8 text-center text-sm text-fg3", children: emptyText })) : table ? (_jsx("table", { className: "w-full text-sm", children: _jsx("tbody", { children: points.map((p, idx) => (_jsxs("tr", { className: "border-t border-line", children: [_jsx("td", { className: "py-1.5 text-fg2", children: p.label }), _jsx("td", { className: "figure py-1.5 text-right", children: p.value === null ? '—' : `${fmt(p.value)} ${unit}` })] }, `${p.label}-${idx}`))) }) })) : children] }));
}
function Grid({ ticks, y, w, unit }) {
    return (_jsxs("g", { children: [ticks.map((t, i) => (_jsxs("g", { children: [_jsx("line", { x1: PAD.left, x2: w - PAD.right, y1: y(t), y2: y(t), className: "stroke-line", strokeDasharray: i === 0 ? undefined : '3 3', strokeWidth: 1 }), _jsx("text", { x: PAD.left - 8, y: y(t) + 4, textAnchor: "end", className: "fill-fg3 font-mono text-[11px]", children: fmt(t) })] }, `${t}-${i}`))), _jsx("text", { x: PAD.left - 8, y: PAD.top - 9, textAnchor: "end", className: "fill-fg3 font-mono text-[11px]", children: unit })] }));
}
function Tooltip({ x, y, w, point, unit }) {
    const text = `${point.label}: ${point.value === null ? 'sem dado' : `${fmt(point.value)} ${unit}`}${point.detail ? ` · ${point.detail}` : ''}`;
    const tw = Math.min(320, text.length * 6.4 + 24);
    const left = Math.min(Math.max(x - tw / 2, 4), w - tw - 4);
    const top = Math.max(2, y - 36);
    return (_jsxs("g", { pointerEvents: "none", children: [_jsx("rect", { x: left, y: top, width: tw, height: 26, rx: 8, className: "fill-surface stroke-line-strong", strokeWidth: 1 }), _jsx("text", { x: left + 12, y: top + 17, className: "fill-fg text-[11px] font-medium", children: text })] }));
}
export function ColumnChart({ title, subtitle, points, unit, height = 220, highlightLast = true, highlight, aside }) {
    const [hover, setHover] = useState(null);
    const W = 640;
    const H = height;
    const max = niceMax(Math.max(0, ...points.map((p) => p.value ?? 0)));
    const plotW = W - PAD.left - PAD.right;
    const band = plotW / Math.max(1, points.length);
    const bar = Math.min(26, Math.max(4, band - 5));
    const y = (v) => PAD.top + (H - PAD.top - PAD.bottom) * (1 - v / max);
    const base = y(0);
    const lastIdx = lastIndex(points, (p) => p.value !== null && p.value > 0);
    const labelEvery = points.length > 16 ? 2 : 1;
    return (_jsx(ChartFrame, { title: title, subtitle: subtitle, points: points, unit: unit, aside: aside, children: _jsxs("svg", { viewBox: `0 0 ${W} ${H}`, className: "w-full rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-brand", role: "img", tabIndex: 0, "aria-label": `${title}. Use as setas esquerda e direita para inspecionar os valores.`, onMouseLeave: () => setHover(null), onBlur: () => setHover(null), onKeyDown: (e) => {
                const next = nextChartIndex(hover, points.length, e.key);
                if (next !== hover) {
                    e.preventDefault();
                    setHover(next);
                }
            }, children: [_jsx(Grid, { ticks: [0, max / 2, max], y: y, w: W, unit: unit }), points.map((p, i) => {
                    const cx = PAD.left + band * i + band / 2;
                    const v = p.value ?? 0;
                    const top = y(v);
                    const h = Math.max(0, base - top);
                    const r = Math.min(6, h, bar / 2);
                    const lead = highlight !== undefined ? i === highlight : highlightLast ? i === points.length - 1 : i === lastIdx;
                    const showLabel = i % labelEvery === 0 || i === points.length - 1 || i === hover;
                    return (_jsxs("g", { onMouseEnter: () => setHover(i), onClick: () => setHover((cur) => (cur === i ? null : i)), className: "cursor-pointer", children: [_jsx("rect", { x: cx - band / 2, y: PAD.top, width: band, height: H - PAD.top - PAD.bottom, fill: "transparent" }), h > 0 && (_jsx("path", { d: `M${cx - bar / 2},${base} V${top + r} Q${cx - bar / 2},${top} ${cx - bar / 2 + r},${top} H${cx + bar / 2 - r} Q${cx + bar / 2},${top} ${cx + bar / 2},${top + r} V${base} Z`, fill: lead || hover === i ? ACCENT : NEUTRAL, className: "transition-opacity duration-150", opacity: hover === null || hover === i ? 1 : 0.45 })), showLabel && _jsx("text", { x: cx, y: H - 10, textAnchor: "middle", className: "fill-fg3 font-mono text-[11px]", children: p.label }), i === lastIdx && hover === null && _jsx("text", { x: cx, y: top - 7, textAnchor: "middle", className: "fill-fg2 font-mono text-[11px]", children: fmt(v) })] }, p.label + i));
                }), hover !== null && _jsx(Tooltip, { x: PAD.left + band * hover + band / 2, y: y(points[hover].value ?? 0), w: W, point: points[hover], unit: unit })] }) }));
}
/** Smooth area chart with subtle vertical wash, crosshair, and contextual period delta. */
export function AreaChart({ title, subtitle, points, unit, minZero = true, height = 240, aside, tone = ACCENT, showDelta = true, invertDelta = false, deltaContext, emptyText }) {
    const [hover, setHover] = useState(null);
    const gradId = useId().replace(/:/g, '');
    const W = 640;
    const H = height;
    const values = points.map((p) => p.value).filter((v) => v !== null);
    const rawMin = values.length ? Math.min(...values) : 0;
    const rawMax = values.length ? Math.max(...values) : 1;
    const flat = values.length > 0 && rawMax === rawMin;
    const flatPad = Math.max(2, Math.round(Math.abs(rawMax) * 0.1));
    const lo = minZero
        ? Math.min(0, Math.floor(rawMin))
        : flat
            ? Math.max(0, Math.floor(rawMin - flatPad))
            : Math.floor(rawMin - Math.max(1, (rawMax - rawMin) * 0.15));
    const hi = !values.length
        ? 1
        : flat
            ? (minZero ? niceMax(Math.max(1, rawMax * 1.25 - lo)) + lo : Math.ceil(rawMax + flatPad))
            : niceMax(Math.max(1, rawMax - lo)) + lo;
    const plotW = W - PAD.left - PAD.right;
    const step = points.length > 1 ? plotW / (points.length - 1) : 0;
    const x = (i) => PAD.left + (points.length > 1 ? step * i : plotW / 2);
    const y = (v) => PAD.top + (H - PAD.top - PAD.bottom) * (1 - (v - lo) / (hi - lo || 1));
    const base = H - PAD.bottom;
    // Build smooth path per contiguous run of non-null points
    const segments = [];
    let curSeg = [];
    points.forEach((p, i) => {
        if (p.value === null) {
            if (curSeg.length) {
                segments.push(curSeg);
                curSeg = [];
            }
            return;
        }
        curSeg.push({ x: x(i), y: y(p.value) });
    });
    if (curSeg.length)
        segments.push(curSeg);
    const last = lastIndex(points, (p) => p.value !== null);
    const delta = showDelta ? seriesDelta(points) : null;
    const labelStride = points.length > 10 ? Math.ceil(points.length / 7) : 1;
    return (_jsx(ChartFrame, { title: title, subtitle: subtitle, points: points, unit: unit, aside: aside, emptyText: emptyText, badge: delta && _jsx(DeltaBadge, { pct: delta.pct, diff: delta.diff, unit: unit, invert: invertDelta, context: deltaContext }), children: _jsxs("svg", { viewBox: `0 0 ${W} ${H}`, className: "w-full rounded-[8px] outline-none focus-visible:ring-2 focus-visible:ring-brand", role: "img", tabIndex: 0, "aria-label": `${title}. Use as setas esquerda e direita para inspecionar os valores.`, onMouseLeave: () => setHover(null), onBlur: () => setHover(null), onKeyDown: (e) => {
                const next = nextChartIndex(hover, points.length, e.key);
                if (next !== hover) {
                    e.preventDefault();
                    setHover(next);
                }
            }, children: [_jsx("defs", { children: _jsxs("linearGradient", { id: `area-${gradId}`, x1: "0", y1: "0", x2: "0", y2: "1", children: [_jsx("stop", { offset: "0%", stopColor: tone, stopOpacity: "0.18" }), _jsx("stop", { offset: "100%", stopColor: tone, stopOpacity: "0.01" })] }) }), _jsx(Grid, { ticks: [lo, Math.round(lo + (hi - lo) / 2), hi], y: y, w: W, unit: unit }), segments.map((seg, sIdx) => {
                    const linePath = smoothSvgPath(seg, 0.18);
                    const areaPath = seg.length > 1
                        ? `${linePath} L${seg[seg.length - 1].x.toFixed(1)},${base.toFixed(1)} L${seg[0].x.toFixed(1)},${base.toFixed(1)} Z`
                        : '';
                    return (_jsxs("g", { children: [areaPath && _jsx("path", { d: areaPath, fill: `url(#area-${gradId})` }), _jsx("path", { d: linePath, fill: "none", stroke: tone, strokeWidth: 2.25, strokeLinejoin: "round", strokeLinecap: "round" })] }, sIdx));
                }), points.map((p, i) => (_jsxs("g", { onMouseEnter: () => setHover(i), onClick: () => setHover((cur) => (cur === i ? null : i)), className: "cursor-pointer", children: [_jsx("rect", { x: x(i) - Math.max(step, 18) / 2, y: PAD.top, width: Math.max(step, 18), height: H - PAD.top - PAD.bottom, fill: "transparent" }), (i === 0 || i === points.length - 1 || i % labelStride === 0) && (_jsx("text", { x: x(i), y: H - 10, textAnchor: i === points.length - 1 ? 'end' : i === 0 ? 'start' : 'middle', className: "fill-fg3 font-mono text-[11px]", children: p.label }))] }, p.label + i))), hover !== null && points[hover].value !== null && (_jsx("line", { x1: x(hover), x2: x(hover), y1: PAD.top, y2: base, className: "stroke-line-strong", strokeDasharray: "3 3", strokeWidth: 1 })), points.map((p, i) => p.value !== null && (i === last || i === hover) && (_jsxs("g", { children: [_jsx("circle", { cx: x(i), cy: y(p.value), r: 7, fill: tone, fillOpacity: 0.18 }), _jsx("circle", { cx: x(i), cy: y(p.value), r: 4, fill: tone, className: "stroke-surface", strokeWidth: 2 })] }, `dot${i}`))), last >= 0 && hover === null && (_jsx("text", { x: x(last) - 8, y: Math.max(PAD.top + 8, y(points[last].value) - 11), textAnchor: "end", className: "fill-fg font-mono text-[11px] font-medium", children: fmt(points[last].value) })), hover !== null && _jsx(Tooltip, { x: x(hover), y: y(points[hover].value ?? lo), w: W, point: points[hover], unit: unit })] }) }));
}
export function LineChart({ title, subtitle, points, unit, minZero = true, height = 220, aside }) {
    return _jsx(AreaChart, { title: title, subtitle: subtitle, points: points, unit: unit, minZero: minZero, height: height, aside: aside, showDelta: false });
}
/** Interactive donut chart with centered live readout and tabular legend. */
export function DonutChart({ title, subtitle, rows, format = num, unit = '', centerLabel = 'Total', maxSlices = 5, size = 164, emptyText = 'Sem dados no período', bare = false, aside }) {
    const [active, setActive] = useState(null);
    const slices = donutSlices(rows, maxSlices);
    const total = slices.reduce((s, x) => s + x.value, 0);
    const r = 60;
    const stroke = 14;
    const C = 2 * Math.PI * r;
    const gap = slices.length > 1 ? 3 : 0;
    let offset = 0;
    const arcs = slices.map((s) => {
        const segLen = Math.max(0, s.share * C - gap);
        const arc = { slice: s, segLen, offset };
        offset += s.share * C;
        return arc;
    });
    const focused = active !== null ? slices[active] : null;
    const centerValue = focused ? format(focused.value) : format(total);
    const centerSub = focused ? `${focused.label} · ${num(focused.pct, 1)}%` : centerLabel;
    const content = (_jsxs(_Fragment, { children: [title && (_jsxs("div", { className: "mb-4 flex flex-wrap items-start gap-2", children: [_jsxs("div", { className: "mr-auto min-w-0", children: [_jsx("div", { className: "font-medium", children: title }), subtitle && _jsx("div", { className: "mt-0.5 text-[13px] leading-5 text-fg3", children: subtitle })] }), aside] })), !slices.length ? (_jsx("div", { className: "flex min-h-[140px] items-center justify-center rounded-[14px] bg-raised/50 px-4 py-8 text-center text-sm text-fg3", children: emptyText })) : (_jsxs("div", { className: "flex flex-col items-center gap-5 sm:flex-row sm:items-center", children: [_jsxs("div", { className: "relative shrink-0", style: { width: size, height: size }, children: [_jsxs("svg", { viewBox: "0 0 156 156", className: "h-full w-full -rotate-90", role: "img", "aria-label": title ?? 'Distribuição', children: [_jsx("circle", { cx: "78", cy: "78", r: r, fill: "none", stroke: "var(--raised)", strokeWidth: stroke }), arcs.map(({ slice, segLen, offset: arcOffset }, i) => (_jsx("circle", { cx: "78", cy: "78", r: r, fill: "none", stroke: slice.color, strokeWidth: active === i ? stroke + 3 : stroke, strokeDasharray: `${segLen} ${C}`, strokeDashoffset: -arcOffset, strokeLinecap: "butt", className: "cursor-pointer transition-opacity duration-150", opacity: active === null || active === i ? 1 : 0.35, onMouseEnter: () => setActive(i), onMouseLeave: () => setActive(null), onClick: () => setActive((cur) => (cur === i ? null : i)) }, slice.label)))] }), _jsxs("div", { className: "pointer-events-none absolute inset-0 flex flex-col items-center justify-center px-6 text-center", children: [_jsxs("span", { className: `figure max-w-full truncate leading-tight font-semibold text-fg ${size < 156 ? 'text-[12px]' : 'text-[14px]'}`, children: [centerValue, unit ? ` ${unit}` : ''] }), _jsx("span", { className: "mt-0.5 max-w-full truncate text-[10px] leading-4 text-fg3", children: centerSub })] })] }), _jsx("ul", { className: "w-full min-w-0 flex-1 space-y-2", children: slices.map((s, i) => (_jsx("li", { children: _jsxs("button", { type: "button", onMouseEnter: () => setActive(i), onMouseLeave: () => setActive(null), onClick: () => setActive((cur) => (cur === i ? null : i)), className: `flex w-full items-center gap-2.5 rounded-lg px-2 py-1 text-left text-sm transition-colors ${active === i ? 'bg-raised' : 'hover:bg-raised/50'}`, children: [_jsx("span", { className: "h-2.5 w-2.5 shrink-0 rounded-full", style: { background: s.color }, "aria-hidden": "true" }), _jsx("span", { className: "min-w-0 flex-1 truncate text-fg2", children: s.label }), _jsxs("span", { className: "figure shrink-0 text-xs font-medium text-fg", children: [format(s.value), unit ? ` ${unit}` : ''] }), _jsxs("span", { className: "figure w-11 shrink-0 text-right text-xs text-fg3", children: [num(s.pct, 0), "%"] })] }) }, s.label))) })] }))] }));
    return bare ? _jsx("div", { className: "min-w-0", children: content }) : _jsx("section", { className: "card min-w-0", children: content });
}
/** Compact circular progress ring for daily execution, macros, projects, and goals. */
export function ProgressRing({ pct, size = 56, strokeWidth = 5, tone = ACCENT, label, sublabel, track = 'var(--raised)' }) {
    const clamped = Math.max(0, Math.min(100, Number.isFinite(pct) ? pct : 0));
    const r = (size - strokeWidth) / 2;
    const C = 2 * Math.PI * r;
    const dash = (clamped / 100) * C;
    return (_jsxs("div", { className: "relative inline-flex shrink-0 items-center justify-center", style: { width: size, height: size }, children: [_jsxs("svg", { width: size, height: size, viewBox: `0 0 ${size} ${size}`, className: "-rotate-90", "aria-hidden": "true", children: [_jsx("circle", { cx: size / 2, cy: size / 2, r: r, fill: "none", stroke: track, strokeWidth: strokeWidth }), _jsx("circle", { cx: size / 2, cy: size / 2, r: r, fill: "none", stroke: tone, strokeWidth: strokeWidth, strokeLinecap: "round", strokeDasharray: `${dash} ${C}`, className: "transition-[stroke-dasharray] duration-500 ease-out" })] }), _jsxs("div", { className: "pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center", children: [_jsx("span", { className: `figure leading-none font-semibold ${size >= 76 ? 'text-[15px]' : size >= 54 ? 'text-[12px]' : 'text-[10px]'}`, children: label ?? `${Math.round(clamped)}%` }), sublabel && _jsx("span", { className: "mt-0.5 text-[9px] leading-none text-fg3", children: sublabel })] })] }));
}
/** Inline mini sparkline for KPI bento cards. */
export function Sparkline({ values, width = 92, height = 32, tone = ACCENT }) {
    const id = useId().replace(/:/g, '');
    if (values.length < 2)
        return null;
    const min = Math.min(...values);
    const max = Math.max(...values);
    const span = max - min || 1;
    const pad = 4;
    const coords = values.map((v, i) => ({
        x: pad + ((width - pad * 2) * i) / (values.length - 1),
        y: pad + (height - pad * 2) * (1 - (v - min) / span),
    }));
    const line = smoothSvgPath(coords, 0.2);
    const last = coords[coords.length - 1];
    const area = `${line} L${last.x.toFixed(1)},${height} L${coords[0].x.toFixed(1)},${height} Z`;
    return (_jsxs("svg", { width: width, height: height, viewBox: `0 0 ${width} ${height}`, className: "shrink-0 overflow-visible", "aria-hidden": "true", children: [_jsx("defs", { children: _jsxs("linearGradient", { id: `spk-${id}`, x1: "0", y1: "0", x2: "0", y2: "1", children: [_jsx("stop", { offset: "0%", stopColor: tone, stopOpacity: "0.28" }), _jsx("stop", { offset: "100%", stopColor: tone, stopOpacity: "0" })] }) }), _jsx("path", { d: area, fill: `url(#spk-${id})` }), _jsx("path", { d: line, fill: "none", stroke: tone, strokeWidth: 1.75, strokeLinecap: "round", strokeLinejoin: "round" }), _jsx("circle", { cx: last.x, cy: last.y, r: 2.5, fill: tone })] }));
}
/** Segmented block score bar inspired by fintech score gauges (e.g. savings rate / consistency). */
export function SegmentedMeter({ pct, segments = 16, tone = ACCENT, height = 14, label }) {
    const clamped = Math.max(0, Math.min(100, Number.isFinite(pct) ? pct : 0));
    const filled = Math.round((clamped / 100) * segments);
    return (_jsx("div", { className: "flex w-full items-center gap-[3px]", role: "progressbar", "aria-valuenow": Math.round(clamped), "aria-valuemin": 0, "aria-valuemax": 100, "aria-label": label ?? 'Progresso', children: Array.from({ length: segments }, (_, i) => (_jsx("span", { className: "flex-1 rounded-[3px] transition-colors duration-300", style: {
                height,
                background: i < filled ? tone : 'var(--raised)',
            } }, i))) }));
}
const HEAT_BG = {
    0: 'var(--raised)',
    1: 'color-mix(in srgb, var(--brand) 24%, var(--raised))',
    2: 'color-mix(in srgb, var(--brand) 48%, var(--raised))',
    3: 'color-mix(in srgb, var(--brand) 74%, var(--raised))',
    4: 'var(--brand)',
};
const HEAT_DAYS = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];
/** 12-week habit consistency heatmap with interactive cell inspection. */
export function ActivityHeatmap({ weeks, title = 'Mapa de constância', subtitle }) {
    const [selected, setSelected] = useState(null);
    const totalDays = weeks.flat().filter((c) => !c.future && c.due > 0);
    const perfectDays = totalDays.filter((c) => c.level === 4).length;
    return (_jsxs("section", { className: "card min-w-0", children: [_jsxs("div", { className: "mb-4 flex flex-wrap items-start gap-2", children: [_jsxs("div", { className: "mr-auto", children: [_jsx("div", { className: "font-medium", children: title }), _jsx("div", { className: "mt-0.5 text-[13px] text-fg3", children: selected
                                    ? `${selected.day.slice(8)}/${selected.day.slice(5, 7)} · ${selected.due > 0 ? `${selected.done} de ${selected.due} hábitos` : 'sem hábitos programados'}`
                                    : subtitle ?? `${perfectDays} ${perfectDays === 1 ? 'dia perfeito' : 'dias perfeitos'} nas últimas ${weeks.length} semanas` })] }), _jsxs("div", { className: "flex items-center gap-1.5 text-[11px] text-fg3", "aria-hidden": "true", children: [_jsx("span", { children: "Menos" }), [0, 1, 2, 3, 4].map((lvl) => (_jsx("span", { className: "h-3 w-3 rounded-[3px]", style: { background: HEAT_BG[lvl] } }, lvl))), _jsx("span", { children: "Mais" })] })] }), _jsx("div", { className: "overflow-x-auto pb-1", children: _jsxs("div", { className: "flex w-full min-w-[260px] items-start gap-1.5 sm:gap-2", children: [_jsx("div", { className: "grid shrink-0 grid-rows-7 gap-1 pt-0.5 text-[10px] text-fg3 select-none sm:gap-1.5", "aria-hidden": "true", children: HEAT_DAYS.map((d, i) => (_jsx("span", { className: "flex h-3 items-center sm:h-3.5", children: i % 2 === 1 ? d : '' }, i))) }), _jsx("div", { className: "grid min-w-0 flex-1 gap-1 sm:gap-1.5", style: { gridTemplateColumns: `repeat(${weeks.length}, minmax(0, 1fr))` }, children: weeks.map((week, wi) => (_jsx("div", { className: "grid grid-rows-7 gap-1 sm:gap-1.5", children: week.map((cell) => (_jsx("button", { type: "button", disabled: cell.future, onMouseEnter: () => !cell.future && setSelected(cell), onMouseLeave: () => setSelected(null), onFocus: () => !cell.future && setSelected(cell), onBlur: () => setSelected(null), "aria-label": `${cell.day}: ${cell.done} de ${cell.due} hábitos`, className: `h-3 w-full rounded-[3px] transition-transform duration-150 sm:h-3.5 sm:rounded-[4px] ${cell.future ? 'opacity-20' : 'hover:scale-110 focus-visible:ring-2 focus-visible:ring-brand'}`, style: { background: HEAT_BG[cell.level] } }, cell.day))) }, wi))) })] }) })] }));
}
/** Progress toward a target, with the numbers beside it. */
export function TargetBar({ label, consumed, target, unit }) {
    const pct = target > 0 ? Math.min(100, (consumed / target) * 100) : 0;
    const over = consumed > target * 1.05;
    return (_jsxs("div", { className: "mb-4", children: [_jsxs("div", { className: "mb-1.5 flex items-baseline text-sm", children: [_jsx("span", { className: "mr-auto text-fg2", children: label }), _jsx("span", { className: "figure text-fg", children: num(consumed) }), _jsxs("span", { className: "figure ml-1 text-fg3", children: ["/ ", num(target), " ", unit] })] }), _jsx("div", { className: "h-1.5 rounded-full bg-raised", children: _jsx("div", { className: "h-1.5 rounded-full transition-[width] duration-300", style: { width: `${pct}%`, background: over ? 'var(--negative)' : ACCENT } }) }), over && _jsxs("div", { className: "mt-1 text-xs text-negative", children: [num(consumed - target), " ", unit, " acima"] })] }));
}
/** A ranked list with thin bars: the secondary data block next to a main chart. */
export function RankedBars({ rows, unit, format = num }) {
    const max = Math.max(1, ...rows.map((r) => r.value));
    return (_jsx("ul", { className: "space-y-3", children: rows.map((r, i) => (_jsxs("li", { children: [_jsxs("div", { className: "mb-1 flex items-baseline text-sm", children: [_jsx("span", { className: "mr-auto truncate pr-2", children: r.label }), _jsxs("span", { className: "figure shrink-0 text-fg2", children: [format(r.value), unit ? ` ${unit}` : ''] })] }), _jsx("div", { className: "h-1.5 rounded-full bg-raised", children: _jsx("div", { className: "h-1.5 rounded-full", style: { width: `${(r.value / max) * 100}%`, background: i === 0 ? ACCENT : NEUTRAL } }) }), r.detail && _jsx("div", { className: "figure mt-1 text-xs text-fg3", children: r.detail })] }, r.label))) }));
}
/** Compact circular SVG ring gauge for highlighted micronutrients and fasting progress. */
export function NutrientRing({ label, pct, sublabel, size = 64, overLimit = false, }) {
    const stroke = 5;
    const r = (size - stroke) / 2;
    const c = 2 * Math.PI * r;
    const clamped = Math.max(0, Math.min(100, pct));
    const offset = c * (1 - clamped / 100);
    const color = overLimit ? 'var(--negative)' : clamped >= 100 ? 'var(--positive)' : ACCENT;
    return (_jsxs("div", { className: "flex flex-col items-center text-center", children: [_jsxs("div", { className: "relative", style: { width: size, height: size }, children: [_jsxs("svg", { width: size, height: size, viewBox: `0 0 ${size} ${size}`, "aria-hidden": "true", children: [_jsx("circle", { cx: size / 2, cy: size / 2, r: r, fill: "none", stroke: "var(--line)", strokeWidth: stroke }), _jsx("circle", { cx: size / 2, cy: size / 2, r: r, fill: "none", stroke: color, strokeWidth: stroke, strokeLinecap: "round", strokeDasharray: c, strokeDashoffset: offset, transform: `rotate(-90 ${size / 2} ${size / 2})`, className: "transition-[stroke-dashoffset] duration-300" })] }), _jsxs("div", { className: "figure absolute inset-0 flex items-center justify-center text-[12px] font-medium text-fg", children: [Math.round(pct), "%"] })] }), _jsx("div", { className: "mt-1.5 max-w-[84px] truncate text-[12px] font-medium text-fg2", children: label }), sublabel && _jsx("div", { className: "figure text-[11px] text-fg3", children: sublabel })] }));
}
/** Cronometer-style Dual-Axis Chart comparing two independent health series over shared days. */
export function DualAxisChart({ title, subtitle, rows, leftLabel, leftUnit, rightLabel, rightUnit, aside, height = 260, }) {
    const [hover, setHover] = useState(null);
    const [table, setTable] = useState(false);
    const W = 680;
    const H = height;
    const padL = 56;
    const padR = 56;
    const padT = 28;
    const padB = 28;
    const leftVals = rows.map((r) => r.left).filter((v) => v !== null);
    const rightVals = rows.map((r) => r.right).filter((v) => v !== null);
    const hasAny = leftVals.length > 0 || rightVals.length > 0;
    const bounds = (vals) => {
        if (!vals.length)
            return { lo: 0, hi: 1 };
        const min = Math.min(...vals);
        const max = Math.max(...vals);
        if (max === min) {
            const p = Math.max(1, Math.abs(max) * 0.1);
            return { lo: Math.max(0, Math.floor(min - p)), hi: Math.ceil(max + p) };
        }
        const lo = Math.max(0, Math.floor(min - (max - min) * 0.12));
        const hi = Math.ceil(max + (max - min) * 0.12);
        return { lo, hi: Math.max(lo + 1, hi) };
    };
    const bL = bounds(leftVals);
    const bR = bounds(rightVals);
    const plotW = W - padL - padR;
    const step = rows.length > 1 ? plotW / (rows.length - 1) : 0;
    const x = (i) => padL + (rows.length > 1 ? step * i : plotW / 2);
    const yL = (v) => padT + (H - padT - padB) * (1 - (v - bL.lo) / (bL.hi - bL.lo || 1));
    const yR = (v) => padT + (H - padT - padB) * (1 - (v - bR.lo) / (bR.hi - bR.lo || 1));
    const buildSegs = (pick, yFn) => {
        const segs = [];
        let cur = [];
        rows.forEach((r, i) => {
            const v = pick(r);
            if (v === null) {
                if (cur.length) {
                    segs.push(cur);
                    cur = [];
                }
                return;
            }
            cur.push({ x: x(i), y: yFn(v) });
        });
        if (cur.length)
            segs.push(cur);
        return segs;
    };
    const leftSegs = buildSegs((r) => r.left, yL);
    const rightSegs = buildSegs((r) => r.right, yR);
    const stride = rows.length > 12 ? Math.ceil(rows.length / 7) : 1;
    return (_jsxs("figure", { className: "card", children: [_jsxs("figcaption", { className: "mb-4 flex flex-wrap items-start gap-3", children: [_jsxs("div", { className: "mr-auto min-w-0", children: [_jsx("div", { className: "font-medium", children: title }), subtitle && _jsx("div", { className: "mt-0.5 text-[13px] text-fg3", children: subtitle }), _jsxs("div", { className: "mt-2 flex flex-wrap items-center gap-4 text-xs text-fg2", children: [_jsxs("span", { className: "inline-flex items-center gap-1.5", children: [_jsx("span", { className: "h-2 w-2 rounded-full", style: { background: ACCENT } }), leftLabel, " (", leftUnit, ")"] }), _jsxs("span", { className: "inline-flex items-center gap-1.5", children: [_jsx("span", { className: "h-2 w-2 rounded-full", style: { background: 'var(--info)' } }), rightLabel, " (", rightUnit, ")"] })] })] }), aside, hasAny && (_jsx("button", { type: "button", className: "rounded-lg px-2.5 py-1 text-[13px] font-medium text-fg2 hover:bg-raised hover:text-fg", onClick: () => setTable(!table), children: table ? 'Ver gráfico' : 'Ver tabela' }))] }), !hasAny ? (_jsx("div", { className: "flex min-h-[160px] items-center justify-center rounded-[12px] bg-raised/50 px-4 py-8 text-center text-sm text-fg3", children: "Registre dados nas duas m\u00E9tricas selecionadas para comparar a correla\u00E7\u00E3o no tempo" })) : table ? (_jsxs("table", { className: "w-full text-sm", children: [_jsx("thead", { children: _jsxs("tr", { className: "text-left text-xs text-fg3", children: [_jsx("th", { className: "pb-2 font-normal", children: "Dia" }), _jsx("th", { className: "pb-2 text-right font-normal", children: leftLabel }), _jsx("th", { className: "pb-2 text-right font-normal", children: rightLabel })] }) }), _jsx("tbody", { children: rows.filter((r) => r.left !== null || r.right !== null).map((r, i) => (_jsxs("tr", { className: "border-t border-line", children: [_jsx("td", { className: "py-1.5 text-fg2", children: r.label }), _jsx("td", { className: "figure py-1.5 text-right", children: r.left === null ? '—' : `${fmt(r.left)} ${leftUnit}` }), _jsx("td", { className: "figure py-1.5 text-right", children: r.right === null ? '—' : `${fmt(r.right)} ${rightUnit}` })] }, `${r.label}-${i}`))) })] })) : (_jsxs("svg", { viewBox: `0 0 ${W} ${H}`, className: "w-full rounded-[8px] outline-none focus-visible:ring-2 focus-visible:ring-brand", role: "img", tabIndex: 0, "aria-label": `${title}: ${leftLabel} versus ${rightLabel}`, onMouseLeave: () => setHover(null), children: [[0, 0.5, 1].map((f, idx) => {
                        const vl = bL.lo + (bL.hi - bL.lo) * f;
                        const vr = bR.lo + (bR.hi - bR.lo) * f;
                        const yy = yL(vl);
                        return (_jsxs("g", { children: [_jsx("line", { x1: padL, x2: W - padR, y1: yy, y2: yy, className: "stroke-line", strokeDasharray: idx === 0 ? undefined : '3 3', strokeWidth: 1 }), _jsx("text", { x: padL - 8, y: yy + 4, textAnchor: "end", className: "fill-fg3 font-mono text-[11px]", children: fmt(vl) }), _jsx("text", { x: W - padR + 8, y: yy + 4, textAnchor: "start", className: "fill-fg3 font-mono text-[11px]", children: fmt(vr) })] }, idx));
                    }), _jsx("text", { x: padL - 8, y: padT - 10, textAnchor: "end", className: "fill-fg3 font-mono text-[11px]", children: leftUnit }), _jsx("text", { x: W - padR + 8, y: padT - 10, textAnchor: "start", className: "fill-fg3 font-mono text-[11px]", children: rightUnit }), leftSegs.map((seg, si) => (_jsx("path", { d: smoothSvgPath(seg), fill: "none", stroke: ACCENT, strokeWidth: 2 }, `l-${si}`))), rightSegs.map((seg, si) => (_jsx("path", { d: smoothSvgPath(seg), fill: "none", stroke: "var(--info)", strokeWidth: 2, strokeDasharray: "4 3" }, `r-${si}`))), rows.map((r, i) => {
                        const cx = x(i);
                        const showLbl = i % stride === 0 || i === rows.length - 1 || i === hover;
                        return (_jsxs("g", { onMouseEnter: () => setHover(i), onClick: () => setHover(i), className: "cursor-pointer", children: [_jsx("rect", { x: cx - Math.max(8, step / 2), y: padT, width: Math.max(16, step), height: H - padT - padB, fill: "transparent" }), r.left !== null && _jsx("circle", { cx: cx, cy: yL(r.left), r: hover === i ? 4.5 : 3, fill: ACCENT }), r.right !== null && _jsx("circle", { cx: cx, cy: yR(r.right), r: hover === i ? 4.5 : 3, fill: "var(--info)" }), showLbl && _jsx("text", { x: cx, y: H - 8, textAnchor: "middle", className: "fill-fg3 font-mono text-[11px]", children: r.label })] }, `${r.label}-${i}`));
                    }), hover !== null && (_jsxs("g", { pointerEvents: "none", children: [_jsx("line", { x1: x(hover), x2: x(hover), y1: padT, y2: H - padB, className: "stroke-line-strong", strokeWidth: 1 }), (() => {
                                const pt = rows[hover];
                                const txt = `${pt.label} · ${leftLabel}: ${pt.left === null ? '—' : `${fmt(pt.left)} ${leftUnit}`} | ${rightLabel}: ${pt.right === null ? '—' : `${fmt(pt.right)} ${rightUnit}`}`;
                                const tw = Math.min(480, txt.length * 6.1 + 24);
                                const left = Math.min(Math.max(x(hover) - tw / 2, 4), W - tw - 4);
                                return (_jsxs(_Fragment, { children: [_jsx("rect", { x: left, y: 2, width: tw, height: 24, rx: 6, className: "fill-surface stroke-line-strong", strokeWidth: 1 }), _jsx("text", { x: left + 12, y: 18, className: "fill-fg text-[11px] font-medium", children: txt })] }));
                            })()] }))] }))] }));
}
