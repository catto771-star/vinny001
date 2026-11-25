import { jsx as _jsx, Fragment as _Fragment, jsxs as _jsxs } from "react/jsx-runtime";
import { useMemo, useState } from 'react';
import { syncGoogleNow } from '../lib/gcal';
import { Bell, CalendarDays, CheckSquare, ChevronDown, ChevronLeft, ChevronRight, Clock, Dumbbell, MapPin, Plus, Repeat, Wallet } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useTable, write } from '../lib/useTable';
import { addDays, formatDay, formatTime, monthName, toDay, sentence } from '../lib/dates';
import { weekOf } from '../lib/calendar';
import { brl } from '../lib/format';
import { buildAgenda, KIND_LABEL, partitionWeekDay, timeboxRange, unscheduledTasks } from '../lib/agenda';
import { PRIORITY_LABEL } from '../lib/tasks';
import { CellChip, MonthCalendar } from '../components/MonthCalendar';
import { Empty, Field, FieldGroup, ListSkeleton, Modal, PageHeader } from '../components/ui';
const VIEWS = ['Dia', 'Semana', 'Mês'];
const KINDS = ['event', 'task', 'reminder', 'habit', 'workout', 'money'];
const ICON = { event: CalendarDays, task: CheckSquare, reminder: Bell, habit: Repeat, workout: Dumbbell, money: Wallet };
const I = { size: 16, strokeWidth: 1.5 };
const SINGULAR = { event: 'compromisso', task: 'tarefa', reminder: 'lembrete', habit: 'hábito', workout: 'treino', money: 'conta' };
const PRIORITY_DOT = { high: 'bg-negative', medium: 'bg-brand', low: 'bg-fg3/60' };
const DURATIONS = [
    { min: 30, label: '30 min' },
    { min: 60, label: '1h' },
    { min: 90, label: '1h30' },
    { min: 120, label: '2h' },
];
export default function Agenda() {
    const events = useTable('events', '*', { column: 'start_at' });
    const tasks = useTable('tasks');
    const reminders = useTable('reminders');
    const habits = useTable('habits');
    const completions = useTable('habit_completions', 'id,habit_id,completed_date,value');
    const plans = useTable('workout_plans', 'id,is_active');
    const sessions = useTable('workout_plan_sessions');
    const workouts = useTable('workouts', 'date,plan_session_id,title');
    const txs = useTable('transactions');
    const templates = useTable('transaction_recurring_templates');
    const skips = useTable('transaction_recurring_skips');
    const cards = useTable('cards');
    const payments = useTable('card_invoice_payments');
    const now = new Date();
    const today = toDay(now);
    const [view, setView] = useState('Semana');
    const [day, setDay] = useState(today);
    const [ym, setYm] = useState({ year: now.getFullYear(), month: now.getMonth() + 1 });
    const [kinds, setKinds] = useState(new Set(KINDS));
    const [editing, setEditing] = useState(null);
    const [showBacklog, setShowBacklog] = useState(false);
    const [boxingTask, setBoxingTask] = useState(null);
    const loading = events.loading || tasks.loading || txs.loading;
    const [from, to] = view === 'Dia' ? [day, day] : view === 'Semana' ? [weekOf(day)[0], weekOf(day)[6]]
        : [toDay(new Date(ym.year, ym.month - 1, -6)), toDay(new Date(ym.year, ym.month, 7))];
    const activePlan = plans.rows.find((p) => p.is_active);
    const items = useMemo(() => buildAgenda(from, to, {
        events: events.rows, tasks: tasks.rows, reminders: reminders.rows, habits: habits.rows, completions: completions.rows,
        planSessions: sessions.rows.filter((s) => s.plan_id === activePlan?.id), workouts: workouts.rows,
        txs: txs.rows, templates: templates.rows, skips: skips.rows, cards: cards.rows, payments: payments.rows,
    }, now).filter((i) => kinds.has(i.kind)), [from, to, kinds, events.rows, tasks.rows, reminders.rows, habits.rows, completions.rows, sessions.rows, workouts.rows, txs.rows, templates.rows, skips.rows, cards.rows, payments.rows, activePlan?.id]);
    const backlog = useMemo(() => unscheduledTasks(tasks.rows, events.rows), [tasks.rows, events.rows]);
    async function toggle(i) {
        const taskId = i.kind === 'task' ? i.ref : i.kind === 'event' ? i.taskId : null;
        if (taskId) {
            const completed = !i.done;
            tasks.setRows((rows) => rows.map((t) => (t.id === taskId ? { ...t, completed } : t)));
            await write(supabase.from('tasks').update({ completed, status: completed ? 'completed' : 'pending', completed_at: completed ? new Date().toISOString() : null }).eq('id', taskId));
            void tasks.reload();
        }
        else if (i.kind === 'reminder') {
            reminders.setRows((rows) => rows.map((r) => (r.id === i.ref ? { ...r, completed: !i.done } : r)));
            await write(supabase.from('reminders').update({ completed: !i.done }).eq('id', i.ref));
            void reminders.reload();
        }
    }
    const openEvent = (i) => i.kind === 'event' && setEditing(events.rows.find((e) => e.id === i.ref) ?? null);
    const shift = (n) => setDay(addDays(day, view === 'Dia' ? n : 7 * n));
    const title = view === 'Dia' ? formatDay(day) : view === 'Semana' ? `${formatDay(from)} a ${formatDay(to)}` : `${monthName(ym.month)} de ${ym.year}`;
    const reloadAndSyncEvents = () => {
        void events.reload();
        void syncGoogleNow().then((ok) => { if (ok)
            void events.reload(); });
    };
    return (_jsxs(_Fragment, { children: [_jsx(PageHeader, { title: "Agenda", subtitle: sentence(title), tabs: VIEWS, tab: view, onTab: (v) => setView(v), action: _jsxs("div", { className: "flex items-center gap-1", children: [view !== 'Mês' && _jsxs(_Fragment, { children: [_jsx("button", { className: "icon-btn", onClick: () => shift(-1), "aria-label": "Anterior", children: _jsx(ChevronLeft, { ...I }) }), _jsx("button", { className: "btn-ghost h-8", onClick: () => setDay(today), children: "Hoje" }), _jsx("button", { className: "icon-btn", onClick: () => shift(1), "aria-label": "Pr\u00F3ximo", children: _jsx(ChevronRight, { ...I }) })] }), _jsxs("button", { className: "btn-primary ml-2", onClick: () => setEditing({ start_at: new Date(`${day}T09:00:00`).toISOString(), all_day: false }), children: [_jsx(Plus, { ...I }), "Compromisso"] })] }) }), _jsxs("div", { className: "mb-5 flex flex-wrap items-center gap-1.5", role: "group", "aria-label": "Mostrar", children: [KINDS.map((k) => {
                        const on = kinds.has(k);
                        const Icon = ICON[k];
                        return (_jsxs("button", { type: "button", "aria-pressed": on, onClick: () => { const n = new Set(kinds); if (on)
                                n.delete(k);
                            else
                                n.add(k); setKinds(n); }, className: `inline-flex h-9 items-center gap-1.5 rounded-full border px-3 text-[13px] font-medium transition-colors duration-150 md:h-8 ${on ? 'border-primary bg-primary text-primary-ink' : 'border-line-strong bg-surface text-fg2 hover:bg-raised hover:text-fg'}`, children: [_jsx(Icon, { size: 14, strokeWidth: 1.6, "aria-hidden": "true" }), KIND_LABEL[k]] }, k));
                    }), _jsxs("button", { type: "button", "aria-expanded": showBacklog, onClick: () => setShowBacklog((v) => !v), className: `inline-flex h-9 items-center gap-1.5 rounded-full border px-3 text-[13px] font-medium transition-colors duration-150 sm:ml-auto md:h-8 ${showBacklog ? 'border-brand bg-brand/10 text-brand-ink' : 'border-line-strong bg-surface text-fg2 hover:bg-raised hover:text-fg'}`, children: [_jsx(Clock, { size: 14, strokeWidth: 1.6, "aria-hidden": "true" }), _jsx("span", { children: "Para agendar" }), _jsx("span", { className: "figure rounded-full bg-raised px-1.5 text-[11px] text-fg2", children: backlog.length }), _jsx(ChevronDown, { size: 13, strokeWidth: 1.75, "aria-hidden": "true", className: `transition-transform duration-150 ${showBacklog ? 'rotate-180' : ''}` })] })] }), showBacklog && !loading && (_jsx(TimeboxDrawer, { tasks: backlog, today: today, onSchedule: (t) => setBoxingTask(t), onClose: () => setShowBacklog(false) })), loading ? _jsx(ListSkeleton, { rows: 6 }) : view === 'Dia' ? (_jsx(DayList, { items: items, day: day, onToggle: toggle, onOpen: openEvent })) : view === 'Semana' ? (_jsx("div", { className: "grid gap-3 lg:grid-cols-7", children: weekOf(day).map((d) => {
                    const { primary, allDayHabits, habitsDone } = partitionWeekDay(items.filter((i) => i.day === d));
                    return (_jsxs("section", { className: `card flex min-w-0 flex-col p-3.5 ${d === today ? 'ring-1 ring-brand/40' : ''}`, children: [_jsxs("button", { type: "button", className: "mb-3 flex items-baseline justify-between rounded-lg px-1 py-0.5 text-left transition-colors hover:bg-raised", onClick: () => { setDay(d); setView('Dia'); }, children: [_jsxs("div", { children: [_jsx("div", { className: "text-xs text-fg3", children: sentence(formatDay(d).split(',')[0]) }), _jsx("div", { className: `figure text-lg font-medium ${d === today ? 'text-brand-ink' : ''}`, children: Number(d.slice(8)) })] }), d === today && _jsx("span", { className: "badge bg-brand/12 text-brand-ink", children: "hoje" })] }), primary.length > 0 ? (_jsx("ul", { className: "space-y-1", children: primary.map((i) => _jsx(ItemRow, { i: i, compact: true, onToggle: toggle, onOpen: openEvent }, i.key)) })) : allDayHabits.length === 0 ? (_jsx("p", { className: "px-1 py-2 text-xs text-fg3", children: "Dia livre" })) : (_jsx("p", { className: "px-1 py-1 text-xs text-fg3", children: "Sem hor\u00E1rios marcados" })), allDayHabits.length > 0 && (_jsxs("details", { className: "mt-3 border-t border-line pt-2.5", children: [_jsxs("summary", { className: "flex cursor-pointer list-none items-center gap-1.5 rounded-lg px-1.5 py-1 text-xs font-medium text-fg2 transition-colors hover:bg-raised", children: [_jsx(Repeat, { size: 12, strokeWidth: 1.6, "aria-hidden": "true", className: "shrink-0 text-fg3" }), _jsxs("span", { className: "mr-auto truncate", children: [allDayHabits.length, " ", allDayHabits.length === 1 ? 'hábito' : 'hábitos'] }), _jsxs("span", { className: "figure text-fg3", children: [habitsDone, "/", allDayHabits.length] })] }), _jsx("ul", { className: "mt-1.5 space-y-1", children: allDayHabits.map((i) => _jsx(ItemRow, { i: i, compact: true, onToggle: toggle, onOpen: openEvent }, i.key)) })] }))] }, d));
                }) })) : (_jsxs("div", { className: "grid gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]", children: [_jsx(MonthCalendar, { year: ym.year, month: ym.month, onMonth: setYm, selected: day, onSelect: setDay, count: (d) => items.filter((i) => i.day === d).length, renderCell: (d) => {
                            const list = items.filter((i) => i.day === d);
                            return (_jsxs(_Fragment, { children: [list.slice(0, 3).map((i) => _jsxs(CellChip, { done: i.done, overdue: i.overdue, title: i.title, children: [i.time ? `${i.time} ` : '', i.title] }, i.key)), list.length > 3 && _jsxs("div", { className: "px-1.5 text-[11px] text-fg3", children: ["+", list.length - 3] })] }));
                        } }), _jsx(DayList, { items: items, day: day, onToggle: toggle, onOpen: openEvent })] })), editing && _jsx(EventForm, { event: editing, onClose: () => setEditing(null), onSaved: () => { setEditing(null); reloadAndSyncEvents(); } }), boxingTask && (_jsx(TimeboxModal, { task: boxingTask, defaultDay: day, onClose: () => setBoxingTask(null), onSaved: () => { setBoxingTask(null); reloadAndSyncEvents(); } }))] }));
}
function TimeboxDrawer({ tasks, today, onSchedule, onClose }) {
    return (_jsxs("section", { className: "card mb-5", "aria-label": "Tarefas sem hor\u00E1rio para timeboxing", children: [_jsxs("div", { className: "mb-3 flex flex-wrap items-center gap-2", children: [_jsxs("div", { className: "mr-auto", children: [_jsx("div", { className: "text-sm font-medium", children: "Timeboxing \u00B7 Tarefas para agendar" }), _jsx("div", { className: "text-xs text-fg3", children: "Aloque um bloco de hor\u00E1rio na agenda (sincroniza com o Google Agenda se conectado)." })] }), _jsx("button", { type: "button", className: "btn-ghost h-8 text-xs", onClick: onClose, children: "Ocultar" })] }), tasks.length === 0 ? (_jsx("p", { className: "py-2 text-sm text-fg3", children: "Todas as suas tarefas abertas j\u00E1 t\u00EAm hor\u00E1rio ou bloco de foco agendado." })) : (_jsx("ul", { className: "grid gap-2 sm:grid-cols-2 lg:grid-cols-3", children: tasks.slice(0, 12).map((t) => {
                    const due = t.due_date ? toDay(new Date(t.due_date)) : null;
                    const late = due != null && due < today;
                    return (_jsxs("li", { className: "flex min-w-0 items-center gap-2.5 rounded-xl border border-line bg-raised/40 px-3 py-2", children: [_jsx("span", { className: `h-2 w-2 shrink-0 rounded-full ${PRIORITY_DOT[t.priority]}`, title: `Prioridade ${PRIORITY_LABEL[t.priority].toLowerCase()}` }), _jsxs("div", { className: "min-w-0 flex-1", children: [_jsx("div", { className: "truncate text-sm font-medium", children: t.title }), due && (_jsxs("div", { className: `figure text-[11px] ${late ? 'text-negative' : 'text-fg3'}`, children: [late ? 'Atrasada · ' : 'Prazo ', Number(due.slice(8)), "/", due.slice(5, 7)] }))] }), _jsxs("button", { type: "button", className: "btn-secondary h-8 shrink-0 px-2.5 text-xs", onClick: () => onSchedule(t), children: [_jsx(Clock, { size: 13, strokeWidth: 1.6, "aria-hidden": "true" }), "Agendar"] })] }, t.id));
                }) })), tasks.length > 12 && _jsxs("p", { className: "mt-2 text-xs text-fg3", children: ["Mostrando as 12 priorit\u00E1rias de ", tasks.length, " tarefas sem hor\u00E1rio."] })] }));
}
function TimeboxModal({ task, defaultDay, onClose, onSaved }) {
    const initialDay = task.due_date ? toDay(new Date(task.due_date)) : defaultDay;
    const now = new Date();
    const nextHour = String(Math.min(22, Math.max(8, now.getHours() + 1))).padStart(2, '0');
    const [date, setDate] = useState(initialDay < defaultDay ? defaultDay : initialDay);
    const [start, setStart] = useState(`${nextHour}:00`);
    const [duration, setDuration] = useState(60);
    const [saving, setSaving] = useState(false);
    async function save(e) {
        e.preventDefault();
        setSaving(true);
        const { start_at, end_at } = timeboxRange(date, start, duration);
        const ok = await write(supabase.from('events').insert({
            title: task.title,
            start_at,
            end_at,
            all_day: false,
            task_id: task.id,
            notes: task.description || null,
        }));
        setSaving(false);
        if (ok)
            onSaved();
    }
    return (_jsxs(Modal, { title: "Agendar bloco de foco", onClose: onClose, children: [_jsx("p", { className: "-mt-3 mb-4 text-sm text-fg2", children: task.title }), _jsxs("form", { onSubmit: save, children: [_jsxs("div", { className: "grid grid-cols-2 gap-3", children: [_jsx(Field, { label: "Data", children: _jsx("input", { className: "input", type: "date", value: date, onChange: (e) => setDate(e.target.value), required: true }) }), _jsx(Field, { label: "In\u00EDcio", children: _jsx("input", { className: "input", type: "time", value: start, onChange: (e) => setStart(e.target.value), required: true }) })] }), _jsx(FieldGroup, { label: "Dura\u00E7\u00E3o", children: _jsx("div", { className: "segmented w-full", children: DURATIONS.map((d) => (_jsx("button", { type: "button", "aria-pressed": duration === d.min, className: `flex-1 ${duration === d.min ? 'tab-active' : 'tab'}`, onClick: () => setDuration(d.min), children: d.label }, d.min))) }) }), _jsx("p", { className: "mb-4 text-xs text-fg3", children: "Cria um compromisso vinculado \u00E0 tarefa. Ao marcar o bloco como conclu\u00EDdo na agenda, a tarefa tamb\u00E9m \u00E9 conclu\u00EDda." }), _jsxs("div", { className: "flex gap-2", children: [_jsx("button", { type: "button", className: "btn-ghost", onClick: onClose, children: "Cancelar" }), _jsx("button", { className: "btn-primary ml-auto", disabled: saving, children: saving ? 'Agendando…' : 'Confirmar horário' })] })] })] }));
}
function DayList({ items, day, onToggle, onOpen }) {
    const list = items.filter((i) => i.day === day);
    return (_jsxs("section", { className: "card h-fit", children: [_jsx("h2", { className: "mb-3 font-medium", children: sentence(formatDay(day)) }), !list.length ? _jsx(Empty, { icon: _jsx(CalendarDays, { size: 18, strokeWidth: 1.5 }), children: "Nada neste dia" }) : (_jsx("ul", { className: "divide-y divide-line", children: list.map((i) => _jsx(ItemRow, { i: i, onToggle: onToggle, onOpen: onOpen }, i.key)) }))] }));
}
function ItemRow({ i, compact, onToggle, onOpen }) {
    const Icon = ICON[i.kind];
    const checkable = i.kind === 'task' || i.kind === 'reminder' || (i.kind === 'event' && !!i.taskId);
    const tone = i.done ? 'text-fg3 line-through' : i.overdue ? 'text-negative' : '';
    if (compact) {
        return (_jsx("li", { children: _jsxs("button", { className: `flex w-full items-start gap-1.5 rounded-md px-1 py-0.5 text-left text-[12px] leading-4 hover:bg-raised ${tone}`, onClick: () => (i.kind === 'event' ? onOpen(i) : checkable ? onToggle(i) : onOpen(i)), title: i.title, children: [_jsx(Icon, { size: 12, strokeWidth: 1.5, className: "mt-0.5 shrink-0 text-fg3" }), _jsxs("span", { className: "min-w-0", children: [i.time && _jsxs("span", { className: "figure text-fg3", children: [i.time, " "] }), i.title] })] }) }));
    }
    return (_jsxs("li", { className: "flex items-center gap-3 py-2.5 text-sm", children: [_jsx("span", { className: "figure w-11 shrink-0 text-xs text-fg3", children: i.time ?? 'dia' }), checkable
                ? _jsx("input", { type: "checkbox", className: "h-4 w-4", checked: i.done, onChange: () => onToggle(i), "aria-label": `Concluir ${i.title}` })
                : _jsx(Icon, { ...I, className: "shrink-0 text-fg3" }), _jsxs("button", { className: `min-w-0 flex-1 text-left ${tone}`, onClick: () => onOpen(i), disabled: i.kind !== 'event', children: [_jsx("span", { className: "block truncate", children: i.title }), (i.detail || i.endTime) && _jsxs("span", { className: "flex items-center gap-1 text-xs text-fg3", children: [i.endTime && `até ${i.endTime}`, i.detail && _jsxs(_Fragment, { children: [_jsx(MapPin, { size: 12, strokeWidth: 1.5 }), i.detail] })] })] }), i.amount !== undefined && _jsxs("span", { className: `figure text-xs ${i.amount < 0 ? '' : 'text-positive'}`, children: [i.amount < 0 ? '−' : '+', brl(Math.abs(i.amount))] }), _jsx("span", { className: "hidden w-24 text-right text-xs text-fg3 sm:inline", children: i.taskId ? 'foco' : SINGULAR[i.kind] })] }));
}
function EventForm({ event, onClose, onSaved }) {
    const start = event.start_at ? new Date(event.start_at) : new Date();
    const end = event.end_at ? new Date(event.end_at) : new Date(start.getTime() + 3600_000);
    const [title, setTitle] = useState(event.title ?? '');
    const [date, setDate] = useState(toDay(start));
    const [allDay, setAllDay] = useState(event.all_day ?? false);
    const [from, setFrom] = useState(formatTime(start.toISOString()));
    const [until, setUntil] = useState(formatTime(end.toISOString()));
    const [location, setLocation] = useState(event.location ?? '');
    const [notes, setNotes] = useState(event.notes ?? '');
    async function save(e) {
        e.preventDefault();
        const at = (t) => new Date(`${date}T${t}:00`).toISOString();
        if (!allDay && until <= from)
            return alert('O fim precisa ser depois do início');
        const row = { title, all_day: allDay, start_at: allDay ? at('00:00') : at(from), end_at: allDay ? null : at(until), location: location || null, notes: notes || null };
        const ok = event.id ? await write(supabase.from('events').update(row).eq('id', event.id)) : await write(supabase.from('events').insert(row));
        if (ok)
            onSaved();
    }
    async function remove() {
        if (event.id && confirm('Excluir este compromisso?') && await write(supabase.from('events').delete().eq('id', event.id)))
            onSaved();
    }
    return (_jsx(Modal, { title: event.id ? 'Editar compromisso' : 'Novo compromisso', onClose: onClose, children: _jsxs("form", { onSubmit: save, children: [_jsx(Field, { label: "T\u00EDtulo", children: _jsx("input", { className: "input", value: title, onChange: (e) => setTitle(e.target.value), required: true, autoFocus: true, placeholder: "Dentista" }) }), _jsx(Field, { label: "Data", children: _jsx("input", { className: "input", type: "date", value: date, onChange: (e) => setDate(e.target.value), required: true }) }), _jsxs("label", { className: "mb-4 flex items-center gap-2 text-sm", children: [_jsx("input", { type: "checkbox", checked: allDay, onChange: (e) => setAllDay(e.target.checked) }), "Dia inteiro"] }), !allDay && (_jsxs("div", { className: "grid grid-cols-2 gap-3", children: [_jsx(Field, { label: "In\u00EDcio", children: _jsx("input", { className: "input", type: "time", value: from, onChange: (e) => setFrom(e.target.value), required: true }) }), _jsx(Field, { label: "Fim", children: _jsx("input", { className: "input", type: "time", value: until, onChange: (e) => setUntil(e.target.value), required: true }) })] })), _jsx(Field, { label: "Local", children: _jsx("input", { className: "input", value: location, onChange: (e) => setLocation(e.target.value) }) }), _jsx(Field, { label: "Observa\u00E7\u00F5es", children: _jsx("textarea", { className: "input h-20 py-2", value: notes, onChange: (e) => setNotes(e.target.value) }) }), _jsxs("div", { className: "flex gap-2", children: [event.id && _jsx("button", { type: "button", className: "btn-ghost text-negative", onClick: remove, children: "Excluir" }), _jsx("button", { className: "btn-primary ml-auto", children: "Salvar" })] })] }) }));
}
