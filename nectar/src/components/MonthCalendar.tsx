import { useState, type ReactNode } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { monthName, toDay, type Day } from '../lib/dates';
import { monthGrid } from '../lib/calendar';
import { addMonths } from '../lib/finance';

const WEEK = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];

/**
 * A month grid. On wide screens each cell lists its items; on phones it shows
 * a dot per day with items, and the selected day's list goes below the grid.
 * Cells accept dropped items when onDrop is given.
 */
export function MonthCalendar({ year, month, onMonth, selected, onSelect, count, renderCell, onDrop, aside }: {
  year: number; month: number; onMonth: (ym: { year: number; month: number }) => void;
  selected: Day; onSelect: (d: Day) => void;
  count: (d: Day) => number; renderCell: (d: Day) => ReactNode;
  onDrop?: (d: Day, payload: string) => void; aside?: ReactNode;
}) {
  const [over, setOver] = useState<Day | null>(null);
  const today = toDay(new Date());
  const weeks = monthGrid(year, month);
  const shift = (n: number) => onMonth(addMonths(year, month, n));
  return (
    <section className="card p-0">
      <div className="flex flex-wrap items-center gap-2 border-b border-line px-5 py-3">
        <div className="mr-auto font-medium capitalize">{monthName(month)} {year}</div>
        {aside}
        <button className="icon-btn" onClick={() => shift(-1)} aria-label="Mês anterior"><ChevronLeft size={16} strokeWidth={1.5} /></button>
        <button className="btn-ghost h-8" onClick={() => { const n = new Date(); onMonth({ year: n.getFullYear(), month: n.getMonth() + 1 }); onSelect(today); }}>Hoje</button>
        <button className="icon-btn" onClick={() => shift(1)} aria-label="Próximo mês"><ChevronRight size={16} strokeWidth={1.5} /></button>
      </div>
      <div className="grid grid-cols-7 border-b border-line">
        {WEEK.map((w) => <div key={w} className="py-2 text-center text-xs text-fg3">{w}</div>)}
      </div>
      <div role="grid" aria-label={`${monthName(month)} de ${year}`}>
        {weeks.map((week) => (
          <div key={week[0]} role="row" className="grid grid-cols-7 border-b border-line last:border-b-0">
            {week.map((d) => {
              const inMonth = Number(d.slice(5, 7)) === month;
              const n = count(d);
              const isSel = d === selected;
              return (
                <div
                  key={d} role="gridcell" aria-selected={isSel} aria-label={`${Number(d.slice(8))} de ${monthName(Number(d.slice(5, 7)))}`}
                  className={`min-h-14 cursor-pointer border-r border-line p-1.5 transition-colors duration-150 last:border-r-0 md:min-h-28 ${isSel ? 'bg-raised' : 'hover:bg-raised/40'} ${over === d ? 'bg-raised outline outline-1 outline-brand' : ''}`}
                  onClick={() => onSelect(d)}
                  onDragOver={onDrop ? (e) => { e.preventDefault(); setOver(d); } : undefined}
                  onDragLeave={onDrop ? () => setOver(null) : undefined}
                  onDrop={onDrop ? (e) => { e.preventDefault(); setOver(null); const p = e.dataTransfer.getData('text/plain'); if (p) onDrop(d, p); } : undefined}
                >
                  <div className={`figure mb-1 flex h-6 w-6 items-center justify-center rounded-md text-xs ${d === today ? 'bg-brand text-white' : inMonth ? 'text-fg2' : 'text-fg3/50'}`}>{Number(d.slice(8))}</div>
                  <div className="hidden space-y-0.5 md:block">{renderCell(d)}</div>
                  {n > 0 && <div className="flex gap-0.5 md:hidden">{Array.from({ length: Math.min(n, 3) }, (_, i) => <span key={i} className="h-1 w-1 rounded-full bg-fg3" />)}</div>}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </section>
  );
}

/** A small item inside a calendar cell. */
export function CellChip({ children, done, overdue, dashed, draggable, payload, title }: {
  children: ReactNode; done?: boolean; overdue?: boolean; dashed?: boolean; draggable?: boolean; payload?: string; title?: string;
}) {
  return (
    <div
      title={title}
      draggable={draggable}
      onDragStart={draggable && payload ? (e) => { e.dataTransfer.setData('text/plain', payload); e.dataTransfer.effectAllowed = 'move'; } : undefined}
      className={`truncate rounded-md px-1.5 py-0.5 text-[11px] leading-4 ${dashed ? 'border border-dashed border-line-strong text-fg3' : 'bg-raised'} ${done ? 'text-fg3 line-through' : overdue ? 'text-negative' : 'text-fg'} ${draggable ? 'cursor-grab active:cursor-grabbing' : ''}`}
    >
      {children}
    </div>
  );
}
