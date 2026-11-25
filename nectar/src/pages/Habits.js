import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useMemo, useRef, useState } from 'react';
import { AlertTriangle, ArchiveRestore, ArrowDown, ArrowUp, ChevronLeft, ChevronRight, Flame, Minus, Plus, Repeat, Trophy } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useTable, write } from '../lib/useTable';
import { latestPerKey, serialQueue } from '../lib/serial';
import { addDays, formatDay, monthDays, monthName, sentence, toDay, weekday, weekdayShort } from '../lib/dates';
import { weekOf } from '../lib/calendar';
import { num, plural } from '../lib/format';
import { PARTS, atRisk, bestStreak, completionRate, currentStreak, heatmap, isDone, isPerfectDay, isWeekly, monthConsistency, overallHeatmap, partOfDay, routineFor, weekdayRates, weeklyProgress, } from '../lib/habits';
import { ActivityHeatmap, ColumnChart, LineChart, ProgressRing, RankedBars } from '../components/Charts';
import { MonthCalendar, CellChip } from '../components/MonthCalendar';
import { Empty, Field, FieldGroup, ListSkeleton, Modal, PageHeader, Stat, WeekdayPicker } from '../components/ui';
const TABS = ['Hoje', 'Hábitos', 'Calendário', 'Análise'];
const byOrder = (a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0);
const find = (completions, habit, day) => completions.find((c) => c.habit_id === habit.id && c.completed_date === day);
const pct = (rate) => `${Math.round(rate * 100)}%`;
const streakUnit = (h, n) => (isWeekly(h) ? plural(n, 'semana', 'semanas') : plural(n, 'dia', 'dias'));
function scheduleText(h) {
    if (isWeekly(h))
        return `${h.times_per_week}x por semana`;
    return h.schedule_days?.length ? h.schedule_days.map(weekdayShort).join(', ') : 'todo dia';
}
export default function Habits() {
    const [tab, setTab] = useState('Hoje');
    const habits = useTable('habits', '*', { column: 'created_at' });
    const completions = useTable('habit_completions', 'id,habit_id,completed_date,value,notes');
    const [editing, setEditing] = useState(null);
    const [detailId, setDetailId] = useState(null);
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
    const setValue = (habit, day, value) => {
        completions.setRows((list) => {
            const old = list.find((c) => c.habit_id === habit.id && c.completed_date === day);
            const others = list.filter((c) => c !== old);
            return value > 0 ? [...others, { id: old?.id ?? `new-${habit.id}-${day}`, habit_id: habit.id, completed_date: day, value, notes: old?.notes ?? null }] : others;
        });
        void values(`${habit.id}|${day}`, async () => {
            if (value <= 0)
                await write(supabase.from('habit_completions').delete().eq('habit_id', habit.id).eq('completed_date', day));
            else
                await write(supabase.from('habit_completions').upsert({ habit_id: habit.id, completed_date: day, value }, { onConflict: 'habit_id,completed_date' }));
        }).then(() => { if (!values.busy())
            void completions.reload(); });
    };
    async function setNote(habit, day, notes) {
        completions.setRows((list) => list.map((c) => (c.habit_id === habit.id && c.completed_date === day ? { ...c, notes } : c)));
        await queue(() => write(supabase.from('habit_completions').update({ notes: notes || null }).eq('habit_id', habit.id).eq('completed_date', day)));
    }
    async function move(habit, by) {
        const list = [...active];
        const i = list.findIndex((h) => h.id === habit.id);
        const j = i + by;
        if (j < 0 || j >= list.length)
            return;
        [list[i], list[j]] = [list[j], list[i]];
        const order = new Map(list.map((h, k) => [h.id, k]));
        habits.setRows((hs) => hs.map((h) => (order.has(h.id) ? { ...h, sort_order: order.get(h.id) } : h)));
        const changed = list.filter((h, k) => (h.sort_order ?? 0) !== k);
        await queue(async () => { for (const h of changed)
            await write(supabase.from('habits').update({ sort_order: order.get(h.id) }).eq('id', h.id)); });
    }
    async function setArchived(habit, is_archived) {
        habits.setRows((hs) => hs.map((h) => (h.id === habit.id ? { ...h, is_archived } : h)));
        await queue(() => write(supabase.from('habits').update({ is_archived }).eq('id', habit.id)));
    }
    const detail = all.find((h) => h.id === detailId) ?? null;
    const empty = !habits.loading && active.length === 0 && (_jsx("div", { className: "card", children: _jsx(Empty, { icon: _jsx(Repeat, { size: 18, strokeWidth: 1.5 }), action: _jsx("button", { className: "btn-secondary", onClick: () => setEditing({}), children: "Novo h\u00E1bito" }), children: "Nenhum h\u00E1bito ainda" }) }));
    return (_jsxs(_Fragment, { children: [_jsx(PageHeader, { title: "H\u00E1bitos", subtitle: `${sentence(monthName(month))} de ${year}`, tabs: TABS, tab: tab, onTab: (t) => setTab(t), action: _jsxs("button", { className: "btn-primary", onClick: () => setEditing({}), children: [_jsx(Plus, { size: 16, strokeWidth: 1.5 }), "Novo h\u00E1bito"] }) }), habits.error && _jsx("p", { className: "mb-4 text-sm text-negative", children: habits.error }), habits.loading && _jsx(ListSkeleton, { rows: 4 }), tab === 'Hoje' && !habits.loading && (empty || _jsx(TodayView, { habits: active, completions: rows, today: today, year: year, month: month, setValue: setValue, onOpen: setDetailId })), tab === 'Hábitos' && !habits.loading && (_jsxs(_Fragment, { children: [empty, _jsx("ul", { className: "space-y-2", children: active.map((h, i) => {
                            const m = monthConsistency(h, rows, year, month, today);
                            return (_jsxs("li", { className: "card flex items-center gap-3 py-3", children: [_jsx("span", { className: "h-9 w-1.5 shrink-0 rounded", style: { background: h.color } }), _jsxs("button", { className: "min-w-0 flex-1 text-left", onClick: () => setDetailId(h.id), children: [_jsx("div", { className: "truncate", children: h.name }), _jsxs("div", { className: "truncate text-xs text-fg3", children: [scheduleText(h), h.schedule_time && ` · ${h.schedule_time.slice(0, 5)}`, " \u00B7 ", m.done, "/", m.scheduled, " no m\u00EAs"] })] }), _jsxs("div", { className: "text-right", children: [_jsx("div", { className: "figure text-sm font-medium", children: pct(m.rate) }), _jsxs("div", { className: "figure flex items-center justify-end gap-1 text-xs text-fg3", title: isWeekly(h) ? 'Sequência em semanas' : 'Sequência em dias', children: [_jsx(Flame, { size: 14, strokeWidth: 1.5 }), currentStreak(h, rows, today)] })] }), _jsxs("div", { className: "flex flex-col gap-0.5", children: [_jsx("button", { className: "icon-btn h-8 w-8 md:h-6 md:w-6", disabled: i === 0, onClick: () => move(h, -1), "aria-label": `Subir ${h.name}`, children: _jsx(ArrowUp, { size: 14, strokeWidth: 1.5 }) }), _jsx("button", { className: "icon-btn h-8 w-8 md:h-6 md:w-6", disabled: i === active.length - 1, onClick: () => move(h, 1), "aria-label": `Descer ${h.name}`, children: _jsx(ArrowDown, { size: 14, strokeWidth: 1.5 }) })] })] }, h.id));
                        }) }), archived.length > 0 && (_jsxs("details", { className: "mt-6", children: [_jsxs("summary", { className: "label cursor-pointer", children: ["Arquivados (", archived.length, ")"] }), _jsx("ul", { className: "mt-3 space-y-2", children: archived.map((h) => (_jsxs("li", { className: "card flex items-center gap-3 py-3", children: [_jsx("span", { className: "h-6 w-1.5 rounded opacity-50", style: { background: h.color } }), _jsx("span", { className: "mr-auto truncate text-fg2", children: h.name }), _jsxs("button", { className: "btn-ghost", onClick: () => setArchived(h, false), children: [_jsx(ArchiveRestore, { size: 16, strokeWidth: 1.5 }), "Restaurar"] })] }, h.id))) })] }))] })), tab === 'Calendário' && !habits.loading && (empty || _jsx(CalendarView, { habits: active, completions: rows, today: today, setValue: setValue, onOpen: setDetailId })), tab === 'Análise' && !habits.loading && (empty || _jsx(AnalysisView, { habits: active, completions: rows, today: today })), detail && (_jsx(HabitDetail, { habit: detail, completions: rows, today: today, onClose: () => setDetailId(null), onEdit: () => { setEditing(detail); setDetailId(null); }, onArchive: () => { void setArchived(detail, !detail.is_archived); setDetailId(null); }, onNote: setNote })), editing && (_jsx(HabitForm, { habit: editing, nextOrder: all.length, onClose: () => setEditing(null), onSaved: () => { setEditing(null); void habits.reload(); } }))] }));
}
// ---------------------------------------------------------------------------
// Today: the week strip, the day's routine by part of the day, habits at risk
// ---------------------------------------------------------------------------
function TodayView({ habits, completions, today, year, month, setValue, onOpen }) {
    const [day, setDay] = useState(today);
    const routine = routineFor(habits, day, completions);
    const doneDay = routine.filter((h) => isDone(h, find(completions, h, day))).length;
    const stats = habits.map((h) => monthConsistency(h, completions, year, month, today));
    const scheduled = stats.reduce((n, s) => n + s.scheduled, 0);
    const done = stats.reduce((n, s) => n + s.done, 0);
    const perfect = monthDays(year, month).filter((d) => d <= today && isPerfectDay(habits, completions, d)).length;
    const risky = day === today ? atRisk(habits, completions, today) : [];
    const best = Math.max(0, ...habits.map((h) => (isWeekly(h) ? 0 : currentStreak(h, completions, today))));
    const todayRoutine = routineFor(habits, today, completions);
    const todayDone = todayRoutine.filter((h) => isDone(h, find(completions, h, today))).length;
    const todayPct = todayRoutine.length ? Math.round((todayDone / todayRoutine.length) * 100) : 0;
    return (_jsxs("div", { className: "grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px]", children: [_jsxs("div", { className: "min-w-0 space-y-6", children: [_jsxs("div", { className: "card grid grid-cols-2 gap-4 sm:grid-cols-4", children: [_jsx(Stat, { label: "Const\u00E2ncia no m\u00EAs", value: pct(scheduled ? done / scheduled : 0), accent: true }), _jsx(Stat, { label: "Dias perfeitos", value: perfect, hint: `de ${Number(today.slice(8))} dias` }), _jsxs("div", { className: "flex items-center gap-3", children: [_jsx(ProgressRing, { pct: todayPct, size: 50, strokeWidth: 4.5, tone: todayPct >= 100 ? 'var(--positive)' : 'var(--brand)' }), _jsxs("div", { className: "min-w-0", children: [_jsx("div", { className: "label", children: "Hoje" }), _jsxs("div", { className: "figure mt-0.5 text-lg font-medium", children: [todayDone, _jsxs("span", { className: "text-xs text-fg3", children: ["/", todayRoutine.length] })] })] })] }), _jsx(Stat, { label: "Maior sequ\u00EAncia ativa", value: best, unit: plural(best, 'dia', 'dias') })] }), _jsx(WeekStrip, { habits: habits, completions: completions, today: today, selected: day, onSelect: setDay }), risky.length > 0 && (_jsxs("div", { className: "card border-brand/40", children: [_jsxs("div", { className: "label mb-2 flex items-center gap-2 text-warning", children: [_jsx(AlertTriangle, { size: 14, strokeWidth: 1.5 }), "Em risco hoje"] }), _jsx("p", { className: "text-sm text-fg2", children: "Sem registro hoje, estas sequ\u00EAncias zeram:" }), _jsx("ul", { className: "mt-2 flex flex-wrap gap-2", children: risky.map((h) => (_jsxs("li", { className: "figure flex items-center gap-1 rounded-lg bg-raised px-2 py-1 text-xs", children: [h.name, " ", _jsx(Flame, { size: 12, strokeWidth: 1.5, className: "text-brand-ink" }), isWeekly(h) ? `${currentStreak(h, completions, addDays(weekOf(today)[0], -1))} sem.` : currentStreak(h, completions, today)] }, h.id))) })] }))] }), _jsxs("section", { className: "card h-fit min-w-0", "aria-label": "Rotina do dia", children: [_jsxs("div", { className: "mb-3 flex items-baseline gap-2", children: [_jsx("div", { className: "label mr-auto", children: day === today ? 'Rotina de hoje' : sentence(formatDay(day)) }), _jsxs("span", { className: "figure text-xs text-fg3", children: [doneDay, "/", routine.length] })] }), routine.length === 0 && _jsx(Empty, { icon: _jsx(Repeat, { size: 18, strokeWidth: 1.5 }), children: "Nenhum h\u00E1bito para este dia" }), PARTS.map((part) => {
                        const list = routine.filter((h) => partOfDay(h.schedule_time) === part);
                        if (!list.length)
                            return null;
                        return (_jsxs("div", { className: "mb-4 last:mb-0", children: [_jsx("div", { className: "mb-1 text-xs text-fg3", children: part }), _jsx("ul", { className: "divide-y divide-line", children: list.map((h) => _jsx(HabitRow, { habit: h, day: day, completions: completions, today: today, setValue: setValue, onOpen: onOpen }, h.id)) })] }, part));
                    }), _jsx(OffRoutine, { habits: habits, due: routine, day: day, completions: completions, today: today, setValue: setValue, onOpen: onOpen })] })] }));
}
/** Habits not due on a day, still open to logging: done on a free day, or before the habit existed. */
function OffRoutine({ habits, due, ...row }) {
    const others = habits.filter((h) => !due.includes(h));
    if (!others.length)
        return null;
    return (_jsxs("details", { className: "mt-4 border-t border-line pt-3", children: [_jsxs("summary", { className: "cursor-pointer text-xs text-fg3", children: ["Fora da rotina deste dia (", others.length, ")"] }), _jsx("ul", { className: "divide-y divide-line", children: others.map((h) => _jsx(HabitRow, { habit: h, ...row }, h.id)) })] }));
}
function WeekStrip({ habits, completions, today, selected, onSelect }) {
    const days = weekOf(selected);
    const thisWeek = days.includes(today);
    return (_jsxs("div", { className: "card min-w-0", children: [_jsxs("div", { className: "mb-3 flex items-center gap-2", children: [_jsx("div", { className: "label mr-auto", children: thisWeek ? 'Sua semana' : `Semana de ${Number(days[0].slice(8))}/${days[0].slice(5, 7)}` }), _jsx("button", { className: "icon-btn", onClick: () => onSelect(addDays(selected, -7)), "aria-label": "Semana anterior", children: _jsx(ChevronLeft, { size: 16, strokeWidth: 1.5 }) }), !thisWeek && _jsx("button", { className: "btn-ghost h-8", onClick: () => onSelect(today), children: "Hoje" }), _jsx("button", { className: "icon-btn", disabled: thisWeek, onClick: () => onSelect(addDays(selected, 7) > today ? today : addDays(selected, 7)), "aria-label": "Pr\u00F3xima semana", children: _jsx(ChevronRight, { size: 16, strokeWidth: 1.5 }) })] }), _jsx("div", { className: "grid grid-cols-7 gap-0.5 sm:gap-2", children: days.map((d) => {
                    const due = routineFor(habits, d, completions);
                    const done = due.filter((h) => isDone(h, find(completions, h, d))).length;
                    const perfect = d <= today && isPerfectDay(habits, completions, d) && due.length > 0;
                    const future = d > today;
                    return (_jsxs("button", { disabled: future, onClick: () => onSelect(d), "aria-pressed": d === selected, "aria-label": formatDay(d), className: `min-w-0 rounded-xl px-0.5 py-1.5 text-center transition-colors duration-150 disabled:opacity-40 sm:p-1.5 ${d === selected ? 'bg-raised outline outline-1 outline-line-strong' : 'hover:bg-raised/50'}`, children: [_jsx("div", { className: "truncate text-[11px] text-fg3 sm:text-xs", children: weekdayShort(weekday(d)) }), _jsx("div", { className: `figure mx-auto my-1 flex h-8 w-8 items-center justify-center rounded-full text-xs sm:h-9 sm:w-9 sm:text-sm ${perfect ? 'bg-brand text-on-brand' : d === today ? 'border border-brand' : 'border border-line'}`, children: Number(d.slice(8)) }), _jsx("div", { className: "figure truncate text-[11px] text-fg3 sm:text-xs", children: future ? '' : `${done}/${due.length}` })] }, d));
                }) })] }));
}
/** One habit on a day: a check, a −/+ counter with a progress bar, or a value field. */
function HabitRow({ habit: h, day, completions, today, setValue, onOpen }) {
    const c = find(completions, h, day);
    const value = c?.value ?? 0;
    const done = isDone(h, c);
    const target = h.target_value ?? 0;
    const weekly = isWeekly(h) ? weeklyProgress(h, completions, day) : null;
    const step = h.habit_type === 'duration' && target >= 30 ? 5 : 1;
    return (_jsxs("li", { className: "flex items-center gap-3 py-2.5", children: [h.habit_type === 'boolean' && (_jsx("input", { type: "checkbox", className: "h-5 w-5 shrink-0 accent-[var(--brand)]", checked: done, onChange: () => setValue(h, day, done ? 0 : 1), "aria-label": h.name })), _jsxs("div", { className: "min-w-0 flex-1", children: [_jsx("button", { className: `block max-w-full truncate text-left text-sm hover:underline ${done ? 'text-fg3 line-through' : ''}`, onClick: () => onOpen(h.id), children: h.name }), _jsxs("div", { className: "figure truncate text-xs text-fg3", children: [h.schedule_time ? h.schedule_time.slice(0, 5) : 'sem horário', weekly && ` · ${weekly.done}/${weekly.target} na semana`, (h.habit_type === 'quantity' || h.habit_type === 'duration') && ` · ${num(value)}/${num(target)} ${h.unit}`, h.habit_type === 'measurable' && h.target_value != null && ` · meta ${num(h.target_value)} ${h.unit}`] }), (h.habit_type === 'quantity' || h.habit_type === 'duration') && target > 0 && (_jsx("div", { className: "mt-1.5 h-1 rounded-sm bg-raised", role: "progressbar", "aria-valuemin": 0, "aria-valuemax": target, "aria-valuenow": value, "aria-label": `Progresso: ${h.name}`, children: _jsx("div", { className: "h-1 rounded-sm transition-[width] duration-150", style: { width: `${Math.min(100, (value / target) * 100)}%`, background: done ? 'var(--positive)' : 'var(--brand)' } }) }))] }), (h.habit_type === 'quantity' || h.habit_type === 'duration') && (_jsxs("div", { className: "flex shrink-0 items-center gap-1", children: [_jsx("button", { className: "icon-btn h-8 w-8", disabled: value <= 0, onClick: () => setValue(h, day, Math.max(0, value - step)), "aria-label": `Diminuir ${h.name}`, children: _jsx(Minus, { size: 14, strokeWidth: 1.5 }) }), _jsx(ValueInput, { value: value, onCommit: (v) => setValue(h, day, v), label: `Quantidade de ${h.name}` }), _jsx("button", { className: "icon-btn h-8 w-8", onClick: () => setValue(h, day, value + step), "aria-label": `Aumentar ${h.name}`, children: _jsx(Plus, { size: 14, strokeWidth: 1.5 }) })] })), h.habit_type === 'measurable' && _jsx(ValueInput, { value: value, onCommit: (v) => setValue(h, day, v), label: `Valor de ${h.name}`, unit: h.unit }), _jsxs("span", { className: "figure flex w-10 shrink-0 items-center justify-end gap-1 text-xs text-fg3", title: isWeekly(h) ? 'Sequência em semanas' : 'Sequência em dias', children: [_jsx(Flame, { size: 14, strokeWidth: 1.5 }), currentStreak(h, completions, today)] })] }));
}
/** A number field that saves on blur or Enter, not on every keystroke. */
function ValueInput({ value, onCommit, label, unit }) {
    const [text, setText] = useState(null);
    const commit = () => {
        if (text === null)
            return;
        const v = Number(text.replace(',', '.'));
        if (Number.isFinite(v) && v !== value)
            onCommit(Math.max(0, v));
        setText(null);
    };
    return (_jsxs("label", { className: "flex shrink-0 items-center gap-1", children: [_jsx("input", { className: "input figure w-16 px-2 py-1 text-center", inputMode: "decimal", "aria-label": label, value: text ?? (value ? String(value).replace('.', ',') : ''), placeholder: "0", onChange: (e) => setText(e.target.value), onBlur: commit, onKeyDown: (e) => { if (e.key === 'Enter')
                    e.target.blur(); } }), unit && _jsx("span", { className: "text-xs text-fg3", children: unit })] }));
}
// ---------------------------------------------------------------------------
// Calendar: the month, and any past day can be filled in
// ---------------------------------------------------------------------------
function CalendarView({ habits, completions, today, setValue, onOpen }) {
    const [ym, setYm] = useState({ year: Number(today.slice(0, 4)), month: Number(today.slice(5, 7)) });
    const [selected, setSelected] = useState(today);
    const due = (d) => (d > today ? [] : routineFor(habits, d, completions));
    return (_jsxs("div", { className: "grid gap-6 lg:grid-cols-[1fr_380px]", children: [_jsx(MonthCalendar, { year: ym.year, month: ym.month, onMonth: setYm, selected: selected, onSelect: setSelected, count: (d) => due(d).length, renderCell: (d) => {
                    const list = due(d);
                    if (!list.length)
                        return null;
                    const n = list.filter((h) => isDone(h, find(completions, h, d))).length;
                    if (isPerfectDay(habits, completions, d))
                        return _jsx(CellChip, { done: true, children: `${n}/${list.length} · perfeito` });
                    return _jsx(CellChip, { overdue: d < today && n === 0, children: `${n}/${list.length} feitos` });
                } }), _jsxs("section", { className: "card h-fit", "aria-label": "H\u00E1bitos do dia", children: [_jsx("div", { className: "label mb-3", children: sentence(formatDay(selected)) }), selected > today ? _jsx("p", { className: "text-sm text-fg3", children: "Dias futuros ainda n\u00E3o podem ser registrados." }) : (_jsxs(_Fragment, { children: [due(selected).length === 0 && _jsx(Empty, { icon: _jsx(Repeat, { size: 18, strokeWidth: 1.5 }), children: "Nenhum h\u00E1bito neste dia" }), _jsx("ul", { className: "divide-y divide-line", children: due(selected).map((h) => _jsx(HabitRow, { habit: h, day: selected, completions: completions, today: today, setValue: setValue, onOpen: onOpen }, h.id)) }), _jsx(OffRoutine, { habits: habits, due: due(selected), day: selected, completions: completions, today: today, setValue: setValue, onOpen: onOpen })] }))] })] }));
}
// ---------------------------------------------------------------------------
// Analysis
// ---------------------------------------------------------------------------
function AnalysisView({ habits, completions, today }) {
    const heatWeeks = useMemo(() => overallHeatmap(habits, completions, today, 12), [habits, completions, today]);
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
    return (_jsxs("div", { className: "grid gap-6 lg:grid-cols-2", children: [_jsx("div", { className: "min-w-0 lg:col-span-2", children: _jsx(ActivityHeatmap, { weeks: heatWeeks, title: "Mapa de const\u00E2ncia" }) }), _jsx(ColumnChart, { title: "Dias perfeitos por semana", subtitle: "\u00DAltimas 12 semanas, s\u00F3 h\u00E1bitos de dias fixos", points: perfect, unit: "dias" }), _jsx(ColumnChart, { title: "Desempenho por dia da semana", subtitle: worst ? `Últimas 8 semanas · dia mais fraco: ${worst.label}` : 'Últimas 8 semanas', points: days, unit: "%", highlightLast: false, highlight: weekday(today) }), _jsxs("section", { className: "card min-w-0 lg:col-span-2", children: [_jsxs("div", { className: "mb-4", children: [_jsx("div", { className: "font-medium", children: "Const\u00E2ncia por h\u00E1bito" }), _jsx("div", { className: "text-[13px] leading-5 text-fg3", children: "\u00DAltimos 30 dias" })] }), _jsx(RankedBars, { rows: byHabit, unit: "%", format: (n) => num(n, 0) })] })] }));
}
// ---------------------------------------------------------------------------
// Detail: streaks, heatmap, values over time and notes
// ---------------------------------------------------------------------------
const CELL = { missed: 'bg-negative/15', off: 'bg-raised', future: 'bg-transparent' };
function HabitDetail({ habit: h, completions, today, onClose, onEdit, onArchive, onNote }) {
    const mine = completions.filter((c) => c.habit_id === h.id).sort((a, b) => b.completed_date.localeCompare(a.completed_date));
    const streak = currentStreak(h, completions, today);
    const best = bestStreak(h, completions, today);
    const map = heatmap(h, completions, today, 26);
    const total = mine.filter((c) => isDone(h, c)).length;
    const values = h.habit_type !== 'boolean' ? [...mine].slice(0, 30).reverse() : [];
    return (_jsxs(Modal, { title: h.name, onClose: onClose, children: [_jsxs("p", { className: "-mt-3 mb-4 text-sm text-fg3", children: [scheduleText(h), h.schedule_time && ` · ${h.schedule_time.slice(0, 5)}`, h.description && ` · ${h.description}`] }), _jsxs("div", { className: "mb-5 grid grid-cols-2 gap-4", children: [_jsx(Stat, { label: "Sequ\u00EAncia atual", value: streak, unit: streakUnit(h, streak), accent: true }), _jsx(Stat, { label: "Recorde", value: _jsxs("span", { className: "inline-flex items-center gap-1", children: [_jsx(Trophy, { size: 16, strokeWidth: 1.5, className: "text-fg3" }), best] }), unit: streakUnit(h, best) }), _jsx(Stat, { label: "\u00DAltimos 30 dias", value: pct(completionRate(h, completions, today, 30)) }), _jsx(Stat, { label: "Total", value: total, unit: plural(total, 'vez', 'vezes') })] }), _jsx("div", { className: "label mb-2", children: "\u00DAltimos 6 meses" }), _jsx("div", { className: "mb-5 flex gap-[3px] overflow-x-auto pb-1", role: "img", "aria-label": `Mapa de ${h.name}: ${total} registros`, children: map.map((week) => (_jsx("div", { className: "flex flex-col gap-[3px]", children: week.map(({ day, state }) => (_jsx("div", { title: `${formatDay(day)}: ${state === 'done' ? 'feito' : state === 'missed' ? 'não feito' : '—'}`, className: `h-[10px] w-[10px] rounded-[2px] ${state === 'done' ? '' : CELL[state]}`, style: state === 'done' ? { background: h.color } : undefined }, day))) }, week[0].day))) }), values.length > 1 && (_jsx("div", { className: "-mx-5 mb-5 sm:mx-0", children: _jsx(LineChart, { title: "Valores registrados", points: values.map((c) => ({ label: `${Number(c.completed_date.slice(8))}/${c.completed_date.slice(5, 7)}`, value: Number(c.value) })), unit: h.unit, height: 180 }) })), _jsx("div", { className: "label mb-2", children: "Registros e observa\u00E7\u00F5es" }), mine.length === 0 && _jsx("p", { className: "mb-4 text-sm text-fg3", children: "Nenhum registro ainda." }), _jsx("ul", { className: "mb-5 max-h-64 space-y-2 overflow-y-auto", children: mine.slice(0, 20).map((c) => (_jsxs("li", { className: "flex items-center gap-2 text-sm", children: [_jsx("span", { className: "w-24 shrink-0 text-fg2", children: sentence(formatDay(c.completed_date).replace(/ de \S+$/, '')) }), h.habit_type !== 'boolean' && _jsxs("span", { className: "figure w-16 shrink-0 text-fg2", children: [num(Number(c.value)), " ", h.unit] }), _jsx("input", { className: "input flex-1 py-1 text-sm", placeholder: "Observa\u00E7\u00E3o", defaultValue: c.notes ?? '', "aria-label": `Observação de ${c.completed_date}`, onBlur: (e) => { if (e.target.value !== (c.notes ?? ''))
                                void onNote(h, c.completed_date, e.target.value); } })] }, c.completed_date))) }), _jsxs("div", { className: "flex gap-2", children: [_jsx("button", { className: "btn-ghost text-negative", onClick: () => { if (h.is_archived || confirm('Arquivar este hábito? O histórico fica guardado.'))
                            onArchive(); }, children: h.is_archived ? 'Restaurar' : 'Arquivar' }), _jsx("button", { className: "btn-primary ml-auto", onClick: onEdit, children: "Editar" })] })] }));
}
// ---------------------------------------------------------------------------
// Form
// ---------------------------------------------------------------------------
function HabitForm({ habit, nextOrder, onClose, onSaved }) {
    const [name, setName] = useState(habit.name ?? '');
    const [description, setDescription] = useState(habit.description ?? '');
    const [type, setType] = useState(habit.habit_type ?? 'boolean');
    const [target, setTarget] = useState(habit.id ? habit.target_value ?? null : 1);
    const [unit, setUnit] = useState(habit.unit ?? 'vezes');
    const [frequency, setFrequency] = useState(habit.frequency ?? 'days');
    const [perWeek, setPerWeek] = useState(habit.times_per_week ?? 3);
    const [days, setDays] = useState(habit.schedule_days ?? []);
    const [time, setTime] = useState(habit.schedule_time?.slice(0, 5) ?? '');
    const [color, setColor] = useState(habit.color ?? '#ea580c');
    async function save(e) {
        e.preventDefault();
        const row = {
            name, description: description || null, habit_type: type, target_value: type === 'boolean' ? 1 : target, unit,
            frequency, times_per_week: frequency === 'weekly' ? perWeek : null,
            schedule_days: frequency === 'days' && days.length ? days : null, schedule_time: time || null, color,
        };
        const ok = habit.id
            ? await write(supabase.from('habits').update(row).eq('id', habit.id))
            : await write(supabase.from('habits').insert({ ...row, sort_order: nextOrder }));
        if (ok)
            onSaved();
    }
    return (_jsx(Modal, { title: habit.id ? 'Editar hábito' : 'Novo hábito', onClose: onClose, children: _jsxs("form", { onSubmit: save, children: [_jsx(Field, { label: "Nome", children: _jsx("input", { className: "input", value: name, onChange: (e) => setName(e.target.value), required: true, autoFocus: true }) }), _jsx(Field, { label: "Descri\u00E7\u00E3o (opcional)", children: _jsx("input", { className: "input", value: description, onChange: (e) => setDescription(e.target.value) }) }), _jsx(Field, { label: "Tipo", children: _jsxs("select", { className: "input", value: type, onChange: (e) => setType(e.target.value), children: [_jsx("option", { value: "boolean", children: "Feito / n\u00E3o feito" }), _jsx("option", { value: "quantity", children: "Quantidade" }), _jsx("option", { value: "duration", children: "Dura\u00E7\u00E3o" }), _jsx("option", { value: "measurable", children: "Medi\u00E7\u00E3o (registrar um valor)" })] }) }), type !== 'boolean' && (_jsxs("div", { className: "grid grid-cols-2 gap-2", children: [_jsx(Field, { label: type === 'measurable' ? 'Meta (opcional)' : 'Meta por dia', children: _jsx("input", { className: "input", type: "number", min: 0, step: "any", value: target ?? '', onChange: (e) => setTarget(e.target.value === '' ? null : Number(e.target.value)), required: type !== 'measurable' }) }), _jsx(Field, { label: "Unidade", children: _jsx("input", { className: "input", value: unit, onChange: (e) => setUnit(e.target.value) }) })] })), _jsx(FieldGroup, { label: "Frequ\u00EAncia", children: _jsxs("div", { className: "segmented w-fit", children: [_jsx("button", { type: "button", className: frequency === 'days' ? 'tab-active' : 'tab', "aria-pressed": frequency === 'days', onClick: () => setFrequency('days'), children: "Dias fixos" }), _jsx("button", { type: "button", className: frequency === 'weekly' ? 'tab-active' : 'tab', "aria-pressed": frequency === 'weekly', onClick: () => setFrequency('weekly'), children: "Vezes por semana" })] }) }), frequency === 'days'
                    ? _jsx(FieldGroup, { label: "Dias (nenhum = todo dia)", children: _jsx(WeekdayPicker, { value: days, onChange: setDays }) })
                    : _jsx(Field, { label: "Vezes por semana", children: _jsx("input", { className: "input w-24", type: "number", min: 1, max: 7, value: perWeek, onChange: (e) => setPerWeek(Math.min(7, Math.max(1, Number(e.target.value) || 1))) }) }), _jsxs("div", { className: "grid grid-cols-2 gap-2", children: [_jsx(Field, { label: "Hor\u00E1rio (opcional)", children: _jsx("input", { className: "input", type: "time", value: time, onChange: (e) => setTime(e.target.value) }) }), _jsx(Field, { label: "Cor", children: _jsx("input", { className: "input h-10 p-1", type: "color", value: color, onChange: (e) => setColor(e.target.value) }) })] }), _jsx("button", { className: "btn-primary w-full", children: "Salvar" })] }) }));
}
