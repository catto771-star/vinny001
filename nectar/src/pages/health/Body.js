import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useState } from 'react';
import { Camera, Pencil, Plus, Ruler, Trash2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { write } from '../../lib/useTable';
import { formatDay } from '../../lib/dates';
import { num } from '../../lib/format';
import { compareAssessments } from '../../lib/body';
import { comparisonPair } from '../../lib/photos';
import { Empty, ListSkeleton } from '../../components/ui';
import { POSES, usePhotoUrls } from './AssessmentPage';
const I = { size: 16, strokeWidth: 1.5 };
function assessmentsOf(h) {
    return [...h.assessments.rows].sort((a, b) => b.date.localeCompare(a.date) || b.created_at.localeCompare(a.created_at)).map((a) => ({
        id: a.id, date: a.date,
        values: Object.fromEntries(h.measurements.rows.filter((m) => m.assessment_id === a.id).map((m) => [m.metric, Number(m.value)])),
    }));
}
/** The list of assessments and the open one compared with another. New and edit open AssessmentPage. */
export default function Body({ h, onEdit }) {
    const [openId, setOpenId] = useState(null);
    const [otherId, setOtherId] = useState(null);
    const list = assessmentsOf(h);
    const { current, other } = comparisonPair(list, openId, otherId);
    const photosOf = (id) => h.bodyPhotos.rows.filter((p) => p.assessment_id === id).length;
    return (_jsxs(_Fragment, { children: [_jsxs("div", { className: "mb-4 flex items-center gap-2", children: [_jsx("h2", { className: "mr-auto text-lg font-medium", children: "Avalia\u00E7\u00F5es" }), _jsxs("button", { className: "btn-primary", onClick: () => onEdit(null), children: [_jsx(Plus, { ...I }), "Nova avalia\u00E7\u00E3o"] })] }), h.assessments.loading ? _jsx(ListSkeleton, {}) : !list.length ? (_jsx("div", { className: "card", children: _jsx(Empty, { icon: _jsx(Ruler, { size: 18, strokeWidth: 1.5 }), action: _jsx("button", { className: "btn-secondary", onClick: () => onEdit(null), children: "Nova avalia\u00E7\u00E3o" }), children: "Registre peso, medidas e fotos para acompanhar a evolu\u00E7\u00E3o do corpo" }) })) : (_jsxs("div", { className: "grid gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]", children: [current && (_jsx(Detail, { h: h, list: list, current: current, other: other, onOther: setOtherId, onEdit: () => onEdit(current.id), onDeleted: () => { setOpenId(null); setOtherId(null); } })), _jsxs("section", { className: "card h-fit", children: [_jsx("div", { className: "label mb-2", children: "Hist\u00F3rico" }), _jsx("ul", { className: "divide-y divide-line", children: list.map((a) => (_jsx("li", { children: _jsxs("button", { className: `flex w-full items-center gap-3 py-2.5 text-left text-sm ${a.id === current?.id ? 'text-fg' : 'text-fg2 hover:text-fg'}`, onClick: () => { setOpenId(a.id); setOtherId(null); }, children: [_jsx("span", { className: "mr-auto", children: formatDay(a.date) }), photosOf(a.id) > 0 && _jsxs("span", { className: "flex items-center gap-1 text-xs text-fg3", title: "Fotos", children: [_jsx(Camera, { size: 12, strokeWidth: 1.5 }), photosOf(a.id)] }), a.values.weight_kg !== undefined && _jsxs("span", { className: "figure", children: [num(a.values.weight_kg), " kg"] }), a.values.body_fat_pct !== undefined && _jsxs("span", { className: "figure text-fg3", children: [num(a.values.body_fat_pct), "%"] })] }) }, a.id))) })] })] }))] }));
}
function Detail({ h, list, current, other, onOther, onEdit, onDeleted }) {
    const deltas = compareAssessments(current, other);
    const notes = h.assessments.rows.find((a) => a.id === current.id)?.notes;
    async function remove() {
        if (!confirm('Excluir esta avaliação, com medidas e fotos?'))
            return;
        const photos = h.bodyPhotos.rows.filter((p) => p.assessment_id === current.id);
        if (photos.length)
            await supabase.storage.from('body-photos').remove(photos.map((p) => p.storage_path));
        if (await write(supabase.from('body_assessments').delete().eq('id', current.id))) {
            await Promise.all([h.assessments.reload(), h.measurements.reload(), h.bodyPhotos.reload()]);
            onDeleted();
        }
    }
    return (_jsxs("div", { className: "space-y-6", children: [_jsxs("section", { className: "card", children: [_jsxs("div", { className: "mb-4 flex flex-wrap items-start gap-2", children: [_jsxs("div", { className: "mr-auto", children: [_jsx("div", { className: "text-lg font-medium", children: formatDay(current.date) }), list.length > 1 ? (_jsxs("label", { className: "mt-1 flex items-center gap-2 text-[13px] text-fg3", children: ["comparar com", _jsx("select", { className: "input w-auto py-1 text-[13px]", "aria-label": "Comparar com", value: other?.id ?? '', onChange: (e) => onOther(e.target.value), children: list.filter((a) => a.id !== current.id).map((a) => _jsx("option", { value: a.id, children: formatDay(a.date) }, a.id)) })] })) : _jsx("div", { className: "text-[13px] text-fg3", children: "primeira avalia\u00E7\u00E3o" })] }), _jsxs("button", { className: "btn-secondary", onClick: onEdit, children: [_jsx(Pencil, { ...I }), "Editar"] }), _jsx("button", { className: "icon-btn hover:text-negative", onClick: remove, "aria-label": "Excluir avalia\u00E7\u00E3o", children: _jsx(Trash2, { ...I }) })] }), deltas.length > 0 && (_jsxs("table", { className: "w-full text-sm", children: [_jsx("thead", { children: _jsxs("tr", { className: "text-left text-xs text-fg3", children: [_jsx("th", { className: "pb-2 font-normal", children: "Medida" }), _jsx("th", { className: "pb-2 text-right font-normal", children: formatDay(current.date).split(',')[1]?.trim() ?? 'Agora' }), _jsx("th", { className: "pb-2 text-right font-normal", children: other ? formatDay(other.date).split(',')[1]?.trim() : 'Antes' }), _jsx("th", { className: "pb-2 text-right font-normal", children: "Diferen\u00E7a" })] }) }), _jsx("tbody", { children: deltas.map((d) => (_jsxs("tr", { className: "border-t border-line", children: [_jsx("td", { className: "py-2", children: d.label }), _jsxs("td", { className: "figure py-2 text-right", children: [num(d.current), " ", _jsx("span", { className: "text-fg3", children: d.unit })] }), _jsx("td", { className: "figure py-2 text-right text-fg3", children: d.previous === null ? '—' : num(d.previous) }), _jsx("td", { className: "figure py-2 text-right", children: d.change === null ? '—' : d.change === 0 ? '0' : `${d.change > 0 ? '+' : '−'}${num(Math.abs(d.change))}` })] }, d.key))) })] })), notes && _jsx("p", { className: "mt-4 text-sm text-fg2", children: notes })] }), _jsx(PhotoCompare, { h: h, current: current, other: other, onEdit: onEdit })] }));
}
/** The photos of two assessments per pose: side by side, or one over the other with a slider. */
function PhotoCompare({ h, current, other, onEdit }) {
    const [mode, setMode] = useState('side');
    const [split, setSplit] = useState(50);
    const mine = h.bodyPhotos.rows.filter((p) => p.assessment_id === current.id);
    const theirs = other ? h.bodyPhotos.rows.filter((p) => p.assessment_id === other.id) : [];
    const urls = usePhotoUrls([...mine, ...theirs].map((p) => p.storage_path));
    const both = POSES.some(({ key }) => mine.some((p) => p.pose === key) && theirs.some((p) => p.pose === key));
    if (!mine.length && !theirs.length) {
        return (_jsx("section", { className: "card", children: _jsx(Empty, { icon: _jsx(Camera, { size: 18, strokeWidth: 1.5 }), action: _jsx("button", { className: "btn-secondary", onClick: onEdit, children: "Adicionar fotos" }), children: "Sem fotos nesta avalia\u00E7\u00E3o. Fotos de frente, lado e costas mostram o que a balan\u00E7a n\u00E3o mostra." }) }));
    }
    const img = (path, alt) => (path && urls[path]
        ? _jsx("img", { src: urls[path], alt: alt, className: "aspect-[3/4] w-full rounded-xl object-cover", draggable: false })
        : _jsx("div", { className: "flex aspect-[3/4] w-full items-center justify-center rounded-xl border border-dashed border-line-strong text-xs text-fg3", children: "sem foto" }));
    return (_jsxs("section", { className: "card", "aria-label": "Compara\u00E7\u00E3o de fotos", children: [_jsxs("div", { className: "mb-4 flex flex-wrap items-center gap-3", children: [_jsx("div", { className: "mr-auto font-medium", children: "Fotos" }), both && (_jsxs("div", { className: "segmented", role: "tablist", "aria-label": "Modo de compara\u00E7\u00E3o", children: [_jsx("button", { role: "tab", "aria-selected": mode === 'side', className: mode === 'side' ? 'tab-active' : 'tab', onClick: () => setMode('side'), children: "Lado a lado" }), _jsx("button", { role: "tab", "aria-selected": mode === 'overlay', className: mode === 'overlay' ? 'tab-active' : 'tab', onClick: () => setMode('overlay'), children: "Sobrepor" })] }))] }), mode === 'overlay' && both && (_jsxs("label", { className: "mb-4 flex items-center gap-3 text-xs text-fg3", children: [_jsx("span", { className: "figure", children: other && formatDay(other.date).split(',')[1] }), _jsx("input", { type: "range", min: 0, max: 100, value: split, onChange: (e) => setSplit(Number(e.target.value)), className: "flex-1 accent-[var(--brand)]", "aria-label": "Divis\u00E3o entre as fotos" }), _jsx("span", { className: "figure", children: formatDay(current.date).split(',')[1] })] })), _jsx("div", { className: "grid gap-4 sm:grid-cols-3", children: POSES.map(({ key, label }) => {
                    const now = mine.find((p) => p.pose === key)?.storage_path;
                    const then = theirs.find((p) => p.pose === key)?.storage_path;
                    return (_jsxs("figure", { children: [_jsx("figcaption", { className: "mb-2 text-[13px] text-fg2", children: label }), mode === 'overlay' && now && then && urls[now] && urls[then] ? (_jsxs("div", { className: "relative select-none overflow-hidden rounded-xl", children: [_jsx("img", { src: urls[then], alt: `${label}, ${other && formatDay(other.date)}`, className: "aspect-[3/4] w-full object-cover", draggable: false }), _jsx("img", { src: urls[now], alt: `${label}, ${formatDay(current.date)}`, className: "absolute inset-0 aspect-[3/4] w-full object-cover", style: { clipPath: `inset(0 0 0 ${split}%)` }, draggable: false }), _jsx("span", { className: "absolute inset-y-0 w-0.5 bg-white/80", style: { left: `${split}%` }, "aria-hidden": true })] })) : (_jsxs("div", { className: `grid gap-2 ${other ? 'grid-cols-2' : ''}`, children: [other && _jsxs("div", { children: [img(then, `${label}, ${formatDay(other.date)}`), _jsx("div", { className: "figure mt-1 text-[11px] text-fg3", children: formatDay(other.date).split(',')[1] })] }), _jsxs("div", { children: [img(now, `${label}, ${formatDay(current.date)}`), other && _jsx("div", { className: "figure mt-1 text-[11px] text-fg3", children: formatDay(current.date).split(',')[1] })] })] }))] }, key));
                }) })] }));
}
