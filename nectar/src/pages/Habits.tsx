import { useMemo, useRef, useState, type FormEvent } from 'react';
import { AlertTriangle, ArchiveRestore, ArrowDown, ArrowUp, ChevronLeft, ChevronRight, Flame, Minus, Plus, Repeat, Trophy } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useTable, write } from '../lib/useTable';
import { latestPerKey, serialQueue } from '../lib/serial';
import { addDays, formatDay, monthDays, monthName, sentence, toDay, weekday, weekdayShort, type Day } from '../lib/dates';
import { weekOf } from '../lib/calendar';
import { num, plural } from '../lib/format';
import {
  PARTS, atRisk, bestStreak, completionRate, currentStreak, heatmap, isDone, isPerfectDay, isWeekly, monthConsistency,
  partOfDay, routineFor, weekdayRates, weeklyProgress, type Habit, type HabitCompletion,
} from '../lib/habits';
import { ColumnChart, LineChart, RankedBars } from '../components/Charts';
import { MonthCalendar, CellChip } from '../components/MonthCalendar';
import { Empty, Field, FieldGroup, ListSkeleton, Modal, PageHeader, Stat, WeekdayPicker } from '../components/ui';

const TABS = ['Hoje', 'Hábitos', 'Calendário', 'Análise'] as const;
type Tab = (typeof TABS)[number];
type SetValue = (habit: Habit, day: Day, value: number) => void;

const byOrder = (a: Habit, b: Habit) => (a.sort_order ?? 0) - (b.sort_order ?? 0);
const find = (completions: HabitCompletion[], habit: Habit, day: Day) =>
  completions.find((c) => c.habit_id === habit.id && c.completed_date === day);
const pct = (rate: number) => `${Math.round(rate * 100)}%`;
const streakUnit = (h: Habit, n: number) => (isWeekly(h) ? plural(n, 'semana', 'semanas') : plural(n, 'dia', 'dias'));

function scheduleText(h: Habit) {
  if (isWeekly(h)) return `${h.times_per_week}x por semana`;
  return h.schedule_days?.length ? h.schedule_days.map(weekdayShort).join(', ') : 'todo dia';
}

export default function Habits() {
  const [tab, setTab] = useState<Tab>('Hoje');
  const habits = useTable<Habit>('habits', '*', { column: 'created_at' });
  const completions = useTable<HabitCompletion>('habit_completions', 'id,habit_id,completed_date,value,notes');
  const [editing, setEditing] = useState<Partial<Habit> | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const queue = useRef(serialQueue()).current;
  const values = useRef(latestPerKey()).current;
  const now = new Date();
  const today = toDay(now);
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const all = useMemo(() => [...habits.rows].sort(byOrder), [habits.rows]);
  const active = all.filter((h) => !h.is_archived);
  const archived = all.filter((h) => h.is_archived);
  const rows = completions.rows;

  /** Saves a day's value at once on screen; writes run in order, keyed by habit and day. */
  const setValue: SetValue = (habit, day, value) => {
    completions.setRows((list) => {
      const old = list.find((c) => c.habit_id === habit.id && c.completed_date === day);
      const others = list.filter((c) => c !== old);
      return value > 0 ? [...others, { id: old?.id ?? `new-${habit.id}-${day}`, habit_id: habit.id, completed_date: day, value, notes: old?.notes ?? null }] : others;
    });
    void values(`${habit.id}|${day}`, async () => {
      if (value <= 0) await write(supabase.from('habit_completions').delete().eq('habit_id', habit.id).eq('completed_date', day));
      else await write(supabase.from('habit_completions').upsert({ habit_id: habit.id, completed_date: day, value }, { onConflict: 'habit_id,completed_date' }));
    }).then(() => { if (!values.busy()) void completions.reload(); });
  };

  async function setNote(habit: Habit, day: Day, notes: string) {
    completions.setRows((list) => list.map((c) => (c.habit_id === habit.id && c.completed_date === day ? { ...c, notes } : c)));
    await queue(() => write(supabase.from('habit_completions').update({ notes: notes || null }).eq('habit_id', habit.id).eq('completed_date', day)));
  }

  async function move(habit: Habit, by: number) {
    const list = [...active];
    const i = list.findIndex((h) => h.id === habit.id);
    const j = i + by;
    if (j < 0 || j >= list.length) return;
    [list[i], list[j]] = [list[j], list[i]];
    const order = new Map(list.map((h, k) => [h.id, k]));
    habits.setRows((hs) => hs.map((h) => (order.has(h.id) ? { ...h, sort_order: order.get(h.id) } : h)));
    const changed = list.filter((h, k) => (h.sort_order ?? 0) !== k);
    await queue(async () => { for (const h of changed) await write(supabase.from('habits').update({ sort_order: order.get(h.id) }).eq('id', h.id)); });
  }

  async function setArchived(habit: Habit, is_archived: boolean) {
    habits.setRows((hs) => hs.map((h) => (h.id === habit.id ? { ...h, is_archived } : h)));
    await queue(() => write(supabase.from('habits').update({ is_archived }).eq('id', habit.id)));
  }

  const detail = all.find((h) => h.id === detailId) ?? null;
  const empty = !habits.loading && active.length === 0 && (
    <div className="card"><Empty icon={<Repeat size={18} strokeWidth={1.5} />} action={<button className="btn-secondary" onClick={() => setEditing({})}>Novo hábito</button>}>Nenhum hábito ainda</Empty></div>
  );

  return (
    <>
      <PageHeader
        title="Hábitos"
        subtitle={`${sentence(monthName(month))} de ${year}`}
        tabs={TABS}
        tab={tab}
        onTab={(t) => setTab(t as Tab)}
        action={<button className="btn-primary" onClick={() => setEditing({})}><Plus size={16} strokeWidth={1.5} />Novo hábito</button>}
      />
      {habits.error && <p className="mb-4 text-sm text-negative">{habits.error}</p>}
      {habits.loading && <ListSkeleton rows={4} />}

      {tab === 'Hoje' && !habits.loading && (empty || <TodayView habits={active} completions={rows} today={today} year={year} month={month} setValue={setValue} onOpen={setDetailId} />)}

      {tab === 'Hábitos' && !habits.loading && (
        <>
          {empty}
          <ul className="space-y-2">
            {active.map((h, i) => {
              const m = monthConsistency(h, rows, year, month, today);
              return (
                <li key={h.id} className="card flex items-center gap-3 py-3">
                  <span className="h-9 w-1.5 shrink-0 rounded" style={{ background: h.color }} />
                  <button className="min-w-0 flex-1 text-left" onClick={() => setDetailId(h.id)}>
                    <div className="truncate">{h.name}</div>
                    <div className="truncate text-xs text-fg3">
                      {scheduleText(h)}{h.schedule_time && ` · ${h.schedule_time.slice(0, 5)}`} · {m.done}/{m.scheduled} no mês
                    </div>
                  </button>
                  <div className="text-right">
                    <div className="figure text-sm font-medium">{pct(m.rate)}</div>
                    <div className="figure flex items-center justify-end gap-1 text-xs text-fg3" title={isWeekly(h) ? 'Sequência em semanas' : 'Sequência em dias'}>
                      <Flame size={14} strokeWidth={1.5} />{currentStreak(h, rows, today)}
                    </div>
                  </div>
                  <div className="flex flex-col">
                    <button className="icon-btn h-6 w-6" disabled={i === 0} onClick={() => move(h, -1)} aria-label={`Subir ${h.name}`}><ArrowUp size={14} strokeWidth={1.5} /></button>
                    <button className="icon-btn h-6 w-6" disabled={i === active.length - 1} onClick={() => move(h, 1)} aria-label={`Descer ${h.name}`}><ArrowDown size={14} strokeWidth={1.5} /></button>
                  </div>
                </li>
              );
            })}
          </ul>
          {archived.length > 0 && (
            <details className="mt-6">
              <summary className="label cursor-pointer">Arquivados ({archived.length})</summary>
              <ul className="mt-3 space-y-2">
                {archived.map((h) => (
                  <li key={h.id} className="card flex items-center gap-3 py-3">
                    <span className="h-6 w-1.5 rounded opacity-50" style={{ background: h.color }} />
                    <span className="mr-auto truncate text-fg2">{h.name}</span>
                    <button className="btn-ghost" onClick={() => setArchived(h, false)}><ArchiveRestore size={16} strokeWidth={1.5} />Restaurar</button>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </>
      )}

      {tab === 'Calendário' && !habits.loading && (empty || <CalendarView habits={active} completions={rows} today={today} setValue={setValue} onOpen={setDetailId} />)}

      {tab === 'Análise' && !habits.loading && (empty || <AnalysisView habits={active} completions={rows} today={today} />)}

      {detail && (
        <HabitDetail habit={detail} completions={rows} today={today} onClose={() => setDetailId(null)}
          onEdit={() => { setEditing(detail); setDetailId(null); }}
          onArchive={() => { void setArchived(detail, !detail.is_archived); setDetailId(null); }}
          onNote={setNote} />
      )}
      {editing && (
        <HabitForm habit={editing} nextOrder={all.length} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); void habits.reload(); }} />
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Today: the week strip, the day's routine by part of the day, habits at risk
// ---------------------------------------------------------------------------

function TodayView({ habits, completions, today, year, month, setValue, onOpen }: {
  habits: Habit[]; completions: HabitCompletion[]; today: Day; year: number; month: number; setValue: SetValue; onOpen: (id: string) => void;
}) {
  const [day, setDay] = useState(today);
  const routine = routineFor(habits, day, completions);
  const doneDay = routine.filter((h) => isDone(h, find(completions, h, day))).length;
  const stats = habits.map((h) => monthConsistency(h, completions, year, month, today));
  const scheduled = stats.reduce((n, s) => n + s.scheduled, 0);
  const done = stats.reduce((n, s) => n + s.done, 0);
  const perfect = monthDays(year, month).filter((d) => d <= today && isPerfectDay(habits, completions, d)).length;
  const risky = day === today ? atRisk(habits, completions, today) : [];
  const best = Math.max(0, ...habits.map((h) => (isWeekly(h) ? 0 : currentStreak(h, completions, today))));

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
      <div className="space-y-6">
        <div className="card grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Stat label="Constância no mês" value={pct(scheduled ? done / scheduled : 0)} accent />
          <Stat label="Dias perfeitos" value={perfect} hint={`de ${Number(today.slice(8))} dias`} />
          <Stat label="Hoje" value={routineFor(habits, today, completions).filter((h) => isDone(h, find(completions, h, today))).length} unit={`/ ${routineFor(habits, today, completions).length}`} />
          <Stat label="Maior sequência ativa" value={best} unit={plural(best, 'dia', 'dias')} />
        </div>
        <WeekStrip habits={habits} completions={completions} today={today} selected={day} onSelect={setDay} />
        {risky.length > 0 && (
          <div className="card border-brand/40">
            <div className="label mb-2 flex items-center gap-2 text-brand-ink"><AlertTriangle size={14} strokeWidth={1.5} />Em risco hoje</div>
            <p className="text-sm text-fg2">Sem registro hoje, estas sequências zeram:</p>
            <ul className="mt-2 flex flex-wrap gap-2">
              {risky.map((h) => (
                <li key={h.id} className="figure flex items-center gap-1 rounded-lg bg-raised px-2 py-1 text-xs">
                  {h.name} <Flame size={12} strokeWidth={1.5} className="text-brand-ink" />{isWeekly(h) ? `${currentStreak(h, completions, addDays(weekOf(today)[0], -1))} sem.` : currentStreak(h, completions, today)}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
      <section className="card h-fit" aria-label="Rotina do dia">
        <div className="mb-3 flex items-baseline gap-2">
          <div className="label mr-auto">{day === today ? 'Rotina de hoje' : sentence(formatDay(day))}</div>
          <span className="figure text-xs text-fg3">{doneDay}/{routine.length}</span>
        </div>
        {routine.length === 0 && <Empty icon={<Repeat size={18} strokeWidth={1.5} />}>Nenhum hábito para este dia</Empty>}
        {PARTS.map((part) => {
          const list = routine.filter((h) => partOfDay(h.schedule_time) === part);
          if (!list.length) return null;
          return (
            <div key={part} className="mb-4 last:mb-0">
              <div className="mb-1 text-xs text-fg3">{part}</div>
              <ul className="divide-y divide-line">
                {list.map((h) => <HabitRow key={h.id} habit={h} day={day} completions={completions} today={today} setValue={setValue} onOpen={onOpen} />)}
              </ul>
            </div>
          );
        })}
        <OffRoutine habits={habits} due={routine} day={day} completions={completions} today={today} setValue={setValue} onOpen={onOpen} />
      </section>
    </div>
  );
}

/** Habits not due on a day, still open to logging: done on a free day, or before the habit existed. */
function OffRoutine({ habits, due, ...row }: {
  habits: Habit[]; due: Habit[]; day: Day; completions: HabitCompletion[]; today: Day; setValue: SetValue; onOpen: (id: string) => void;
}) {
  const others = habits.filter((h) => !due.includes(h));
  if (!others.length) return null;
  return (
    <details className="mt-4 border-t border-line pt-3">
      <summary className="cursor-pointer text-xs text-fg3">Fora da rotina deste dia ({others.length})</summary>
      <ul className="divide-y divide-line">
        {others.map((h) => <HabitRow key={h.id} habit={h} {...row} />)}
      </ul>
    </details>
  );
}

function WeekStrip({ habits, completions, today, selected, onSelect }: {
  habits: Habit[]; completions: HabitCompletion[]; today: Day; selected: Day; onSelect: (d: Day) => void;
}) {
  const days = weekOf(selected);
  const thisWeek = days.includes(today);
  return (
    <div className="card">
      <div className="mb-3 flex items-center gap-2">
        <div className="label mr-auto">{thisWeek ? 'Sua semana' : `Semana de ${Number(days[0].slice(8))}/${days[0].slice(5, 7)}`}</div>
        <button className="icon-btn" onClick={() => onSelect(addDays(selected, -7))} aria-label="Semana anterior"><ChevronLeft size={16} strokeWidth={1.5} /></button>
        {!thisWeek && <button className="btn-ghost h-8" onClick={() => onSelect(today)}>Hoje</button>}
        <button className="icon-btn" disabled={thisWeek} onClick={() => onSelect(addDays(selected, 7) > today ? today : addDays(selected, 7))} aria-label="Próxima semana"><ChevronRight size={16} strokeWidth={1.5} /></button>
      </div>
      <div className="grid grid-cols-7 gap-1 sm:gap-2">
        {days.map((d) => {
          const due = routineFor(habits, d, completions);
          const done = due.filter((h) => isDone(h, find(completions, h, d))).length;
          const perfect = d <= today && isPerfectDay(habits, completions, d) && due.length > 0;
          const future = d > today;
          return (
            <button
              key={d} disabled={future} onClick={() => onSelect(d)} aria-pressed={d === selected} aria-label={formatDay(d)}
              className={`rounded-xl p-1.5 text-center transition-colors duration-150 disabled:opacity-40 ${d === selected ? 'bg-raised outline outline-1 outline-line-strong' : 'hover:bg-raised/50'}`}
            >
              <div className="text-xs text-fg3">{weekdayShort(weekday(d))}</div>
              <div className={`figure mx-auto my-1 flex h-9 w-9 items-center justify-center rounded-full text-sm ${perfect ? 'bg-brand text-white' : d === today ? 'border border-brand' : 'border border-line'}`}>
                {Number(d.slice(8))}
              </div>
              <div className="figure text-xs text-fg3">{future ? '' : `${done}/${due.length}`}</div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** One habit on a day: a check, a −/+ counter with a progress bar, or a value field. */
function HabitRow({ habit: h, day, completions, today, setValue, onOpen }: {
  habit: Habit; day: Day; completions: HabitCompletion[]; today: Day; setValue: SetValue; onOpen: (id: string) => void;
}) {
  const c = find(completions, h, day);
  const value = c?.value ?? 0;
  const done = isDone(h, c);
  const target = h.target_value ?? 0;
  const weekly = isWeekly(h) ? weeklyProgress(h, completions, day) : null;
  const step = h.habit_type === 'duration' && target >= 30 ? 5 : 1;
  return (
    <li className="flex items-center gap-3 py-2.5">
      {h.habit_type === 'boolean' && (
        <input type="checkbox" className="h-5 w-5 shrink-0 accent-[var(--brand)]" checked={done} onChange={() => setValue(h, day, done ? 0 : 1)} aria-label={h.name} />
      )}
      <div className="min-w-0 flex-1">
        <button className={`block max-w-full truncate text-left text-sm hover:underline ${done ? 'text-fg3 line-through' : ''}`} onClick={() => onOpen(h.id)}>{h.name}</button>
        <div className="figure truncate text-xs text-fg3">
          {h.schedule_time ? h.schedule_time.slice(0, 5) : 'sem horário'}
          {weekly && ` · ${weekly.done}/${weekly.target} na semana`}
          {(h.habit_type === 'quantity' || h.habit_type === 'duration') && ` · ${num(value)}/${num(target)} ${h.unit}`}
          {h.habit_type === 'measurable' && h.target_value != null && ` · meta ${num(h.target_value)} ${h.unit}`}
        </div>
        {(h.habit_type === 'quantity' || h.habit_type === 'duration') && target > 0 && (
          <div className="mt-1.5 h-1 rounded-sm bg-raised" role="progressbar" aria-valuemin={0} aria-valuemax={target} aria-valuenow={value} aria-label={`Progresso: ${h.name}`}>
            <div className="h-1 rounded-sm transition-[width] duration-150" style={{ width: `${Math.min(100, (value / target) * 100)}%`, background: done ? 'var(--positive)' : 'var(--brand)' }} />
          </div>
        )}
      </div>
      {(h.habit_type === 'quantity' || h.habit_type === 'duration') && (
        <div className="flex shrink-0 items-center gap-1">
          <button className="icon-btn h-8 w-8" disabled={value <= 0} onClick={() => setValue(h, day, Math.max(0, value - step))} aria-label={`Diminuir ${h.name}`}><Minus size={14} strokeWidth={1.5} /></button>
          <ValueInput value={value} onCommit={(v) => setValue(h, day, v)} label={`Quantidade de ${h.name}`} />
          <button className="icon-btn h-8 w-8" onClick={() => setValue(h, day, value + step)} aria-label={`Aumentar ${h.name}`}><Plus size={14} strokeWidth={1.5} /></button>
        </div>
      )}
      {h.habit_type === 'measurable' && <ValueInput value={value} onCommit={(v) => setValue(h, day, v)} label={`Valor de ${h.name}`} unit={h.unit} />}
      <span className="figure flex w-10 shrink-0 items-center justify-end gap-1 text-xs text-fg3" title={isWeekly(h) ? 'Sequência em semanas' : 'Sequência em dias'}>
        <Flame size={14} strokeWidth={1.5} />{currentStreak(h, completions, today)}
      </span>
    </li>
  );
}

/** A number field that saves on blur or Enter, not on every keystroke. */
function ValueInput({ value, onCommit, label, unit }: { value: number; onCommit: (v: number) => void; label: string; unit?: string }) {
  const [text, setText] = useState<string | null>(null);
  const commit = () => {
    if (text === null) return;
    const v = Number(text.replace(',', '.'));
    if (Number.isFinite(v) && v !== value) onCommit(Math.max(0, v));
    setText(null);
  };
  return (
    <label className="flex shrink-0 items-center gap-1">
      <input
        className="input figure w-16 px-2 py-1 text-center" inputMode="decimal" aria-label={label}
        value={text ?? (value ? String(value).replace('.', ',') : '')} placeholder="0"
        onChange={(e) => setText(e.target.value)} onBlur={commit} onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
      />
      {unit && <span className="text-xs text-fg3">{unit}</span>}
    </label>
  );
}

// ---------------------------------------------------------------------------
// Calendar: the month, and any past day can be filled in
// ---------------------------------------------------------------------------

function CalendarView({ habits, completions, today, setValue, onOpen }: {
  habits: Habit[]; completions: HabitCompletion[]; today: Day; setValue: SetValue; onOpen: (id: string) => void;
}) {
  const [ym, setYm] = useState({ year: Number(today.slice(0, 4)), month: Number(today.slice(5, 7)) });
  const [selected, setSelected] = useState(today);
  const due = (d: Day) => (d > today ? [] : routineFor(habits, d, completions));
  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
      <MonthCalendar
        year={ym.year} month={ym.month} onMonth={setYm} selected={selected} onSelect={setSelected}
        count={(d) => due(d).length}
        renderCell={(d) => {
          const list = due(d);
          if (!list.length) return null;
          const n = list.filter((h) => isDone(h, find(completions, h, d))).length;
          if (isPerfectDay(habits, completions, d)) return <CellChip done>{`${n}/${list.length} · perfeito`}</CellChip>;
          return <CellChip overdue={d < today && n === 0}>{`${n}/${list.length} feitos`}</CellChip>;
        }}
      />
      <section className="card h-fit" aria-label="Hábitos do dia">
        <div className="label mb-3">{sentence(formatDay(selected))}</div>
        {selected > today ? <p className="text-sm text-fg3">Dias futuros ainda não podem ser registrados.</p> : (
          <>
            {due(selected).length === 0 && <Empty icon={<Repeat size={18} strokeWidth={1.5} />}>Nenhum hábito neste dia</Empty>}
            <ul className="divide-y divide-line">
              {due(selected).map((h) => <HabitRow key={h.id} habit={h} day={selected} completions={completions} today={today} setValue={setValue} onOpen={onOpen} />)}
            </ul>
            <OffRoutine habits={habits} due={due(selected)} day={selected} completions={completions} today={today} setValue={setValue} onOpen={onOpen} />
          </>
        )}
      </section>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Analysis
// ---------------------------------------------------------------------------

function AnalysisView({ habits, completions, today }: { habits: Habit[]; completions: HabitCompletion[]; today: Day }) {
  const weeks = Array.from({ length: 12 }, (_, i) => weekOf(addDays(today, -7 * (11 - i))));
  const perfect = weeks.map((w) => ({
    label: `${Number(w[0].slice(8))}/${w[0].slice(5, 7)}`,
    value: w.filter((d) => d <= today && isPerfectDay(habits, completions, d)).length,
  }));
  const byHabit = habits
    .map((h) => ({ label: h.name, value: Math.round(completionRate(h, completions, today, 30) * 100), detail: `recorde ${bestStreak(h, completions, today)} ${streakUnit(h, bestStreak(h, completions, today))}` }))
    .sort((a, b) => b.value - a.value);
  const days = weekdayRates(habits, completions, today, 8).map((r) => ({ label: weekdayShort(r.weekday), value: r.rate === null ? null : Math.round(r.rate * 100) }));
  const rated = days.filter((d) => d.value !== null).sort((a, b) => (a.value ?? 0) - (b.value ?? 0));
  const worst = rated.length > 1 && rated[0].value !== rated[rated.length - 1].value ? rated[0] : null;
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <ColumnChart title="Dias perfeitos por semana" subtitle="Últimas 12 semanas, só hábitos de dias fixos" points={perfect} unit="dias" />
      <ColumnChart title="Desempenho por dia da semana" subtitle={worst ? `Últimas 8 semanas · dia mais fraco: ${worst.label}` : 'Últimas 8 semanas'}
        points={days} unit="%" highlightLast={false} highlight={weekday(today)} />
      <section className="card lg:col-span-2">
        <div className="mb-4">
          <div className="font-medium">Constância por hábito</div>
          <div className="text-[13px] leading-5 text-fg3">Últimos 30 dias</div>
        </div>
        <RankedBars rows={byHabit} unit="%" format={(n) => num(n, 0)} />
      </section>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Detail: streaks, heatmap, values over time and notes
// ---------------------------------------------------------------------------

const CELL: Record<string, string> = { missed: 'bg-negative/15', off: 'bg-raised', future: 'bg-transparent' };

function HabitDetail({ habit: h, completions, today, onClose, onEdit, onArchive, onNote }: {
  habit: Habit; completions: HabitCompletion[]; today: Day; onClose: () => void; onEdit: () => void; onArchive: () => void;
  onNote: (habit: Habit, day: Day, notes: string) => Promise<void>;
}) {
  const mine = completions.filter((c) => c.habit_id === h.id).sort((a, b) => b.completed_date.localeCompare(a.completed_date));
  const streak = currentStreak(h, completions, today);
  const best = bestStreak(h, completions, today);
  const map = heatmap(h, completions, today, 26);
  const total = mine.filter((c) => isDone(h, c)).length;
  const values = h.habit_type !== 'boolean' ? [...mine].slice(0, 30).reverse() : [];
  return (
    <Modal title={h.name} onClose={onClose}>
      <p className="-mt-3 mb-4 text-sm text-fg3">{scheduleText(h)}{h.schedule_time && ` · ${h.schedule_time.slice(0, 5)}`}{h.description && ` · ${h.description}`}</p>
      <div className="mb-5 grid grid-cols-2 gap-4">
        <Stat label="Sequência atual" value={streak} unit={streakUnit(h, streak)} accent />
        <Stat label="Recorde" value={<span className="inline-flex items-center gap-1"><Trophy size={16} strokeWidth={1.5} className="text-fg3" />{best}</span>} unit={streakUnit(h, best)} />
        <Stat label="Últimos 30 dias" value={pct(completionRate(h, completions, today, 30))} />
        <Stat label="Total" value={total} unit={plural(total, 'vez', 'vezes')} />
      </div>
      <div className="label mb-2">Últimos 6 meses</div>
      <div className="mb-5 flex gap-[3px] overflow-x-auto pb-1" role="img" aria-label={`Mapa de ${h.name}: ${total} registros`}>
        {map.map((week) => (
          <div key={week[0].day} className="flex flex-col gap-[3px]">
            {week.map(({ day, state }) => (
              <div key={day} title={`${formatDay(day)}: ${state === 'done' ? 'feito' : state === 'missed' ? 'não feito' : '—'}`}
                className={`h-[10px] w-[10px] rounded-[2px] ${state === 'done' ? '' : CELL[state]}`} style={state === 'done' ? { background: h.color } : undefined} />
            ))}
          </div>
        ))}
      </div>
      {values.length > 1 && (
        <div className="-mx-5 mb-5 sm:mx-0">
          <LineChart title="Valores registrados" points={values.map((c) => ({ label: `${Number(c.completed_date.slice(8))}/${c.completed_date.slice(5, 7)}`, value: Number(c.value) }))} unit={h.unit} height={180} />
        </div>
      )}
      <div className="label mb-2">Registros e observações</div>
      {mine.length === 0 && <p className="mb-4 text-sm text-fg3">Nenhum registro ainda.</p>}
      <ul className="mb-5 max-h-64 space-y-2 overflow-y-auto">
        {mine.slice(0, 20).map((c) => (
          <li key={c.completed_date} className="flex items-center gap-2 text-sm">
            <span className="w-24 shrink-0 text-fg2">{sentence(formatDay(c.completed_date).replace(/ de \S+$/, ''))}</span>
            {h.habit_type !== 'boolean' && <span className="figure w-16 shrink-0 text-fg2">{num(Number(c.value))} {h.unit}</span>}
            <input className="input flex-1 py-1 text-sm" placeholder="Observação" defaultValue={c.notes ?? ''} aria-label={`Observação de ${c.completed_date}`}
              onBlur={(e) => { if (e.target.value !== (c.notes ?? '')) void onNote(h, c.completed_date, e.target.value); }} />
          </li>
        ))}
      </ul>
      <div className="flex gap-2">
        <button className="btn-ghost text-negative" onClick={() => { if (h.is_archived || confirm('Arquivar este hábito? O histórico fica guardado.')) onArchive(); }}>{h.is_archived ? 'Restaurar' : 'Arquivar'}</button>
        <button className="btn-primary ml-auto" onClick={onEdit}>Editar</button>
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Form
// ---------------------------------------------------------------------------

function HabitForm({ habit, nextOrder, onClose, onSaved }: { habit: Partial<Habit>; nextOrder: number; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(habit.name ?? '');
  const [description, setDescription] = useState(habit.description ?? '');
  const [type, setType] = useState<Habit['habit_type']>(habit.habit_type ?? 'boolean');
  const [target, setTarget] = useState<number | null>(habit.id ? habit.target_value ?? null : 1);
  const [unit, setUnit] = useState(habit.unit ?? 'vezes');
  const [frequency, setFrequency] = useState<'days' | 'weekly'>(habit.frequency ?? 'days');
  const [perWeek, setPerWeek] = useState(habit.times_per_week ?? 3);
  const [days, setDays] = useState<number[]>(habit.schedule_days ?? []);
  const [time, setTime] = useState(habit.schedule_time?.slice(0, 5) ?? '');
  const [color, setColor] = useState(habit.color ?? '#ea580c');

  async function save(e: FormEvent) {
    e.preventDefault();
    const row = {
      name, description: description || null, habit_type: type, target_value: type === 'boolean' ? 1 : target, unit,
      frequency, times_per_week: frequency === 'weekly' ? perWeek : null,
      schedule_days: frequency === 'days' && days.length ? days : null, schedule_time: time || null, color,
    };
    const ok = habit.id
      ? await write(supabase.from('habits').update(row).eq('id', habit.id))
      : await write(supabase.from('habits').insert({ ...row, sort_order: nextOrder }));
    if (ok) onSaved();
  }

  return (
    <Modal title={habit.id ? 'Editar hábito' : 'Novo hábito'} onClose={onClose}>
      <form onSubmit={save}>
        <Field label="Nome"><input className="input" value={name} onChange={(e) => setName(e.target.value)} required autoFocus /></Field>
        <Field label="Descrição (opcional)"><input className="input" value={description} onChange={(e) => setDescription(e.target.value)} /></Field>
        <Field label="Tipo">
          <select className="input" value={type} onChange={(e) => setType(e.target.value as Habit['habit_type'])}>
            <option value="boolean">Feito / não feito</option>
            <option value="quantity">Quantidade</option>
            <option value="duration">Duração</option>
            <option value="measurable">Medição (registrar um valor)</option>
          </select>
        </Field>
        {type !== 'boolean' && (
          <div className="grid grid-cols-2 gap-2">
            <Field label={type === 'measurable' ? 'Meta (opcional)' : 'Meta por dia'}>
              <input className="input" type="number" min={0} step="any" value={target ?? ''} onChange={(e) => setTarget(e.target.value === '' ? null : Number(e.target.value))} required={type !== 'measurable'} />
            </Field>
            <Field label="Unidade"><input className="input" value={unit} onChange={(e) => setUnit(e.target.value)} /></Field>
          </div>
        )}
        <FieldGroup label="Frequência">
          <div className="segmented w-fit">
            <button type="button" className={frequency === 'days' ? 'tab-active' : 'tab'} aria-pressed={frequency === 'days'} onClick={() => setFrequency('days')}>Dias fixos</button>
            <button type="button" className={frequency === 'weekly' ? 'tab-active' : 'tab'} aria-pressed={frequency === 'weekly'} onClick={() => setFrequency('weekly')}>Vezes por semana</button>
          </div>
        </FieldGroup>
        {frequency === 'days'
          ? <FieldGroup label="Dias (nenhum = todo dia)"><WeekdayPicker value={days} onChange={setDays} /></FieldGroup>
          : <Field label="Vezes por semana"><input className="input w-24" type="number" min={1} max={7} value={perWeek} onChange={(e) => setPerWeek(Math.min(7, Math.max(1, Number(e.target.value) || 1)))} /></Field>}
        <div className="grid grid-cols-2 gap-2">
          <Field label="Horário (opcional)"><input className="input" type="time" value={time} onChange={(e) => setTime(e.target.value)} /></Field>
          <Field label="Cor"><input className="input h-10 p-1" type="color" value={color} onChange={(e) => setColor(e.target.value)} /></Field>
        </div>
        <button className="btn-primary w-full">Salvar</button>
      </form>
    </Modal>
  );
}
