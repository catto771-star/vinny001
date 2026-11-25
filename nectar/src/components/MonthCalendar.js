import { jsxs as _jsxs, jsx as _jsx } from "react/jsx-runtime";
import { useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { monthName, toDay } from '../lib/dates';
import { monthGrid } from '../lib/calendar';
import { addMonths } from '../lib/finance';
const WEEK = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
/**
 * A month grid. On wide screens each cell lists its items; on phones it shows
 * a dot per day with items, and the selected day's list goes below the grid.
 * Cells accept dropped items when onDrop is given.
 */
export function MonthCalendar({ year, month, onMonth, selected, onSelect, count, renderCell, onDrop, aside }) {
    const [over, setOver] = useState(null);
    const today = toDay(new Date());
    const weeks = monthGrid(year, month);
    const shift = (n) => onMonth(addMonths(year, month, n));
    return (_jsxs("section", { className: "card p-0", children: [_jsxs("div", { className: "flex flex-wrap items-center gap-2 border-b border-line px-5 py-3", children: [_jsxs("div", { className: "mr-auto font-medium capitalize", children: [monthName(month), " ", year] }), aside, _jsx("button", { className: "icon-btn", onClick: () => shift(-1), "aria-label": "M\u00EAs anterior", children: _jsx(ChevronLeft, { size: 16, strokeWidth: 1.5 }) }), _jsx("button", { className: "btn-ghost h-8", onClick: () => { const n = new Date(); onMonth({ year: n.getFullYear(), month: n.getMonth() + 1 }); onSelect(today); }, children: "Hoje" }), _jsx("button", { className: "icon-btn", onClick: () => shift(1), "aria-label": "Pr\u00F3ximo m\u00EAs", children: _jsx(ChevronRight, { size: 16, strokeWidth: 1.5 }) })] }), _jsx("div", { className: "grid grid-cols-7 border-b border-line", children: WEEK.map((w) => _jsx("div", { className: "py-2 text-center text-xs text-fg3", children: w }, w)) }), _jsx("div", { role: "grid", "aria-label": `${monthName(month)} de ${year}`, children: weeks.map((week) => (_jsx("div", { role: "row", className: "grid grid-cols-7 border-b border-line last:border-b-0", children: week.map((d) => {
                        const inMonth = Number(d.slice(5, 7)) === month;
                        const n = count(d);
                        const isSel = d === selected;
                        return (_jsxs("div", { role: "gridcell", "aria-selected": isSel, "aria-label": `${Number(d.slice(8))} de ${monthName(Number(d.slice(5, 7)))}`, className: `min-h-14 cursor-pointer border-r border-line p-1.5 transition-colors duration-150 last:border-r-0 md:min-h-28 ${isSel ? 'bg-raised' : 'hover:bg-raised/40'} ${over === d ? 'bg-raised outline outline-1 outline-brand' : ''}`, onClick: () => onSelect(d), onDragOver: onDrop ? (e) => { e.preventDefault(); setOver(d); } : undefined, onDragLeave: onDrop ? () => setOver(null) : undefined, onDrop: onDrop ? (e) => { e.preventDefault(); setOver(null); const p = e.dataTransfer.getData('text/plain'); if (p)
                                onDrop(d, p); } : undefined, children: [_jsx("div", { className: `figure mb-1 flex h-6 w-6 items-center justify-center rounded-md text-xs ${d === today ? 'bg-brand text-on-brand' : inMonth ? 'text-fg2' : 'text-fg3/50'}`, children: Number(d.slice(8)) }), _jsx("div", { className: "hidden space-y-0.5 md:block", children: renderCell(d) }), n > 0 && _jsx("div", { className: "flex gap-0.5 md:hidden", children: Array.from({ length: Math.min(n, 3) }, (_, i) => _jsx("span", { className: "h-1 w-1 rounded-full bg-fg3" }, i)) })] }, d));
                    }) }, week[0]))) })] }));
}
/** A small item inside a calendar cell. */
export function CellChip({ children, done, overdue, dashed, draggable, payload, title }) {
    return (_jsx("div", { title: title, draggable: draggable, onDragStart: draggable && payload ? (e) => { e.dataTransfer.setData('text/plain', payload); e.dataTransfer.effectAllowed = 'move'; } : undefined, className: `truncate rounded-md px-1.5 py-0.5 text-[11px] leading-4 ${dashed ? 'border border-dashed border-line-strong text-fg3' : 'bg-raised'} ${done ? 'text-fg3 line-through' : overdue ? 'text-negative' : 'text-fg'} ${draggable ? 'cursor-grab active:cursor-grabbing' : ''}`, children: children }));
}
