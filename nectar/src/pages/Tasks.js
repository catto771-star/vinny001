import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useEffect, useMemo, useState } from 'react';
import { CalendarDays, CheckSquare, Plus, Repeat } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useTable, write } from '../lib/useTable';
import { bucketTasks, PRIORITY_LABEL, taskStats } from '../lib/tasks';
import { formatDay, formatTime, toDay, weekday, weekdayShort, sentence } from '../lib/dates';
import { moveToDay } from '../lib/calendar';
import { projectedRecurringTasks } from '../lib/agenda';
import { CellChip, MonthCalendar } from '../components/MonthCalendar';
import { Empty, Field, FieldGroup, ListSkeleton, Modal, PageHeader, Stat, WeekdayPicker } from '../components/ui';
const TABS = ['Hoje', 'Tarefas', 'Calendário', 'Recorrentes', 'Análise'];
const PRIORITY_DOT = { high: 'bg-negative', medium: 'bg-brand', low: 'bg-fg3' };
export default function Tasks() {
    const [tab, setTab] = useState('Hoje');
    const tasks = useTable('tasks', '*', { column: 'due_date' });
    const tags = useTable('task_tags', '*', { column: 'name' });
    const templates = useTable('task_recurring_templates', '*', { column: 'created_at' });
    const [editing, setEditing] = useState(null);
    const [search, setSearch] = useState('');
    const [tagFilter, setTagFilter] = useState(null);
    const now = new Date();
    useGenerateRecurring(templates.rows, tasks.reload);
    const visible = useMemo(() => tasks.rows.filter((t) => (!tagFilter || t.tags.includes(tagFilter)) &&
        (!search || t.title.toLowerCase().includes(search.toLowerCase()))), [tasks.rows, tagFilter, search]);
    const buckets = bucketTasks(visible, now);
    const stats = taskStats(tasks.rows, now);
    async function toggle(task) {
        const completed = !task.completed;
        tasks.setRows((rows) => rows.map((t) => (t.id === task.id ? { ...t, completed } : t)));
        await write(supabase.from('tasks').update({
            completed, status: completed ? 'completed' : 'pending', completed_at: completed ? new Date().toISOString() : null,
        }).eq('id', task.id));
        void tasks.reload();
    }
    const list = (title, items, tone = '') => items.length > 0 && (_jsxs("section", { className: "mb-4", children: [_jsxs("div", { className: `label mb-2 flex gap-2 ${tone}`, children: [title, _jsx("span", { className: "figure text-fg3", children: items.length })] }), _jsx("ul", { className: "card divide-y divide-line p-0", children: items.map((t) => _jsx(TaskRow, { task: t, tags: tags.rows, onToggle: () => toggle(t), onOpen: () => setEditing(t) }, t.id)) })] }));
    return (_jsxs(_Fragment, { children: [_jsx(PageHeader, { title: "Tarefas", subtitle: formatDay(toDay(now)), tabs: TABS, tab: tab, onTab: (t) => setTab(t), action: _jsxs("button", { className: "btn-primary", onClick: () => setEditing({}), children: [_jsx(Plus, { size: 16, strokeWidth: 1.5 }), "Nova tarefa"] }) }), tasks.error && _jsx("p", { className: "mb-4 text-sm text-negative", children: tasks.error }), tab === 'Hoje' && (_jsxs("div", { className: "grid gap-6 lg:grid-cols-[1fr_280px]", children: [_jsxs("div", { children: [_jsxs("div", { className: "card mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4", children: [_jsx(Stat, { label: "Abertas", value: stats.open }), _jsx(Stat, { label: "Atrasadas", value: stats.overdue }), _jsx(Stat, { label: "Para hoje", value: stats.dueToday }), _jsx(Stat, { label: "Feitas hoje", value: stats.completedToday })] }), list('Atrasadas', buckets.overdue, 'text-negative'), list('Hoje', buckets.today), tasks.loading ? _jsx(ListSkeleton, {}) : !buckets.overdue.length && !buckets.today.length && _jsx("div", { className: "card mb-4", children: _jsx(Empty, { icon: _jsx(CheckSquare, { size: 18, strokeWidth: 1.5 }), children: "Nada atrasado nem para hoje" }) }), list('Feitas hoje', buckets.done.filter((t) => t.completed_at && toDay(new Date(t.completed_at)) === toDay(now)), 'text-positive')] }), _jsx(PriorityCard, { stats: stats })] })), tab === 'Tarefas' && (_jsxs(_Fragment, { children: [_jsxs("div", { className: "mb-4 flex flex-wrap gap-2", children: [_jsx("input", { className: "input max-w-xs", placeholder: "Buscar tarefa", value: search, onChange: (e) => setSearch(e.target.value) }), _jsx("button", { className: tagFilter ? 'tab' : 'tab-active', onClick: () => setTagFilter(null), children: "Todas" }), tags.rows.map((g) => (_jsxs("button", { className: tagFilter === g.name ? 'tab-active' : 'tab', onClick: () => setTagFilter(g.name), children: [_jsx("span", { className: "mr-2 inline-block h-2 w-2 rounded-full", style: { background: g.color } }), g.name] }, g.id)))] }), list('Atrasadas', buckets.overdue, 'text-negative'), list('Hoje', buckets.today), list('Próximas', buckets.upcoming), list('Sem data', buckets.noDate), list('Concluídas', buckets.done.slice(0, 30), 'text-positive'), tasks.loading ? _jsx(ListSkeleton, {}) : !visible.length && _jsx("div", { className: "card", children: _jsx(Empty, { icon: _jsx(CheckSquare, { size: 18, strokeWidth: 1.5 }), action: _jsx("button", { className: "btn-secondary", onClick: () => setEditing({}), children: "Nova tarefa" }), children: search || tagFilter ? 'Nenhuma tarefa com esse filtro' : 'Nenhuma tarefa ainda' }) })] })), tab === 'Calendário' && (_jsx(TasksCalendar, { tasks: tasks.rows, templates: templates.rows, tags: tags.rows, onToggle: toggle, onOpen: (t) => setEditing(t), onNew: (day) => setEditing({ due_date: new Date(`${day}T12:00:00`).toISOString(), due_all_day: true }), onMove: async (id, day) => {
                    const t = tasks.rows.find((x) => x.id === id);
                    if (!t || !t.due_date)
                        return;
                    const due_date = t.due_all_day ? new Date(`${day}T12:00:00`).toISOString() : moveToDay(t.due_date, day);
                    tasks.setRows((rows) => rows.map((x) => (x.id === id ? { ...x, due_date } : x)));
                    await write(supabase.from('tasks').update({ due_date }).eq('id', id));
                    void tasks.reload();
                } })), tab === 'Recorrentes' && _jsx(RecurringTab, { templates: templates.rows, reload: templates.reload }), tab === 'Análise' && (_jsxs("div", { className: "grid gap-6 md:grid-cols-2", children: [_jsxs("div", { className: "card", children: [_jsx("div", { className: "label mb-4", children: "Conclu\u00EDdas nos \u00FAltimos 7 dias" }), _jsx("div", { className: "flex h-40 items-end gap-2", children: stats.completedLast7.map((d) => {
                                    const max = Math.max(1, ...stats.completedLast7.map((x) => x.count));
                                    return (_jsxs("div", { className: "flex flex-1 flex-col items-center gap-1", children: [_jsx("span", { className: "text-xs text-fg3", children: d.count }), _jsx("div", { className: "w-full rounded-t bg-brand", style: { height: `${(d.count / max) * 100}%`, minHeight: 2 } }), _jsx("span", { className: "text-xs text-fg3", children: weekdayShort(weekday(d.day)) })] }, d.day));
                                }) })] }), _jsx(PriorityCard, { stats: stats })] })), editing && (_jsx(TaskForm, { task: editing, tags: tags.rows, onClose: () => setEditing(null), onSaved: () => { setEditing(null); void tasks.reload(); void tags.reload(); } }))] }));
}
function PriorityCard({ stats }) {
    return (_jsxs("div", { className: "card h-fit", children: [_jsx("div", { className: "label mb-3", children: "Abertas por prioridade" }), ['high', 'medium', 'low'].map((p) => (_jsxs("div", { className: "mb-2 flex items-center gap-2 text-sm", children: [_jsx("span", { className: `h-2 w-2 rounded-full ${PRIORITY_DOT[p]}` }), _jsx("span", { className: "w-14", children: PRIORITY_LABEL[p] }), _jsx("div", { className: "h-1.5 flex-1 rounded bg-raised", children: _jsx("div", { className: `h-1.5 rounded ${PRIORITY_DOT[p]}`, style: { width: `${stats.open ? (stats.openByPriority[p] / stats.open) * 100 : 0}%` } }) }), _jsx("span", { className: "w-6 text-right", children: stats.openByPriority[p] })] }, p)))] }));
}
function TaskRow({ task, tags, onToggle, onOpen }) {
    return (_jsxs("li", { className: "flex items-center gap-3 px-4 py-3", children: [_jsx("input", { type: "checkbox", className: "h-4 w-4", checked: task.completed, onChange: onToggle, "aria-label": `Concluir ${task.title}` }), _jsxs("button", { className: "min-w-0 flex-1 text-left", onClick: onOpen, children: [_jsx("div", { className: `truncate text-sm ${task.completed ? 'text-fg3 line-through' : ''}`, children: task.title }), _jsxs("div", { className: "flex flex-wrap items-center gap-2 text-xs text-fg3", children: [_jsx("span", { className: `h-1.5 w-1.5 rounded-full ${PRIORITY_DOT[task.priority]}` }), task.due_date && _jsxs("span", { children: [formatDay(toDay(new Date(task.due_date))), !task.due_all_day && ` · ${formatTime(task.due_date)}`] }), task.tags.map((name) => {
                                const tag = tags.find((g) => g.name === name);
                                return _jsx("span", { className: "rounded px-1.5", style: { background: `${tag?.color ?? '#64748b'}22`, color: tag?.color ?? '#64748b' }, children: name }, name);
                            })] })] })] }));
}
function TaskForm({ task, tags, onClose, onSaved }) {
    const due = task.due_date ? new Date(task.due_date) : null;
    const [title, setTitle] = useState(task.title ?? '');
    const [description, setDescription] = useState(task.description ?? '');
    const [priority, setPriority] = useState(task.priority ?? 'medium');
    const [date, setDate] = useState(due ? toDay(due) : '');
    const [time, setTime] = useState(due && !task.due_all_day ? formatTime(task.due_date) : '');
    const [selected, setSelected] = useState(task.tags ?? []);
    const [newTag, setNewTag] = useState('');
    async function save(e) {
        e.preventDefault();
        let due_date = null;
        if (date) {
            const [y, m, d] = date.split('-').map(Number);
            const [hh, mm] = (time || '23:59').split(':').map(Number);
            due_date = new Date(y, m - 1, d, hh, mm).toISOString();
        }
        const allTags = [...selected];
        if (newTag.trim()) {
            const name = newTag.trim();
            if (!tags.some((g) => g.name === name))
                await write(supabase.from('task_tags').insert({ name }));
            if (!allTags.includes(name))
                allTags.push(name);
        }
        const row = { title, description: description || null, priority, due_date, due_all_day: !!date && !time, tags: allTags };
        const ok = task.id
            ? await write(supabase.from('tasks').update(row).eq('id', task.id))
            : await write(supabase.from('tasks').insert(row));
        if (ok)
            onSaved();
    }
    async function remove() {
        if (task.id && confirm('Excluir esta tarefa?') && await write(supabase.from('tasks').delete().eq('id', task.id)))
            onSaved();
    }
    return (_jsx(Modal, { title: task.id ? 'Editar tarefa' : 'Nova tarefa', onClose: onClose, children: _jsxs("form", { onSubmit: save, children: [_jsx(Field, { label: "T\u00EDtulo", children: _jsx("input", { className: "input", value: title, onChange: (e) => setTitle(e.target.value), required: true, autoFocus: true }) }), _jsx(Field, { label: "Descri\u00E7\u00E3o", children: _jsx("textarea", { className: "input", rows: 2, value: description, onChange: (e) => setDescription(e.target.value) }) }), _jsxs("div", { className: "grid grid-cols-2 gap-2", children: [_jsx(Field, { label: "Data", children: _jsx("input", { className: "input", type: "date", value: date, onChange: (e) => setDate(e.target.value) }) }), _jsx(Field, { label: "Hora (opcional)", children: _jsx("input", { className: "input", type: "time", value: time, onChange: (e) => setTime(e.target.value), disabled: !date }) })] }), _jsx(Field, { label: "Prioridade", children: _jsx("select", { className: "input", value: priority, onChange: (e) => setPriority(e.target.value), children: ['high', 'medium', 'low'].map((p) => _jsx("option", { value: p, children: PRIORITY_LABEL[p] }, p)) }) }), _jsxs(Field, { label: "Tags", children: [_jsx("div", { className: "mb-2 flex flex-wrap gap-1", children: tags.map((g) => {
                                const on = selected.includes(g.name);
                                return (_jsx("button", { type: "button", className: on ? 'tab-active' : 'tab', onClick: () => setSelected(on ? selected.filter((n) => n !== g.name) : [...selected, g.name]), children: g.name }, g.id));
                            }) }), _jsx("input", { className: "input", placeholder: "Nova tag", value: newTag, onChange: (e) => setNewTag(e.target.value) })] }), _jsxs("div", { className: "flex gap-2", children: [task.id && _jsx("button", { type: "button", className: "btn-ghost text-negative", onClick: remove, children: "Excluir" }), _jsx("button", { className: "btn-primary ml-auto", children: "Salvar" })] })] }) }));
}
/** Creates today's task for each active recurring template, once. */
function useGenerateRecurring(templates, reload) {
    useEffect(() => {
        if (!templates.length)
            return;
        const today = toDay(new Date());
        const due = templates.filter((t) => t.is_active && t.start_date <= today && (!t.end_date || t.end_date >= today) &&
            (t.recurrence_days.length === 0 || t.recurrence_days.includes(weekday(today))));
        if (!due.length)
            return;
        (async () => {
            const { data } = await supabase.from('task_recurrences').select('recurring_template_id').eq('generated_date', today);
            const done = new Set((data ?? []).map((r) => r.recurring_template_id));
            let created = false;
            for (const t of due.filter((x) => !done.has(x.id))) {
                const [y, m, d] = today.split('-').map(Number);
                const [hh, mm] = (t.time_of_day ?? '23:59').split(':').map(Number);
                const { data: task } = await supabase.from('tasks').insert({
                    title: t.title, description: t.description, priority: t.priority, tags: t.tags,
                    due_date: new Date(y, m - 1, d, hh, mm).toISOString(), due_all_day: !t.time_of_day,
                }).select('id').single();
                if (task) {
                    // The unique key stops a second tab from generating the same day twice.
                    const { error } = await supabase.from('task_recurrences').insert({ recurring_template_id: t.id, task_id: task.id, generated_date: today });
                    if (error)
                        await supabase.from('tasks').delete().eq('id', task.id);
                    else
                        created = true;
                }
            }
            if (created)
                await reload();
        })();
    }, [templates, reload]);
}
function RecurringTab({ templates, reload }) {
    const [editing, setEditing] = useState(null);
    return (_jsxs(_Fragment, { children: [_jsx("div", { className: "mb-4 flex", children: _jsxs("button", { className: "btn-primary ml-auto", onClick: () => setEditing({}), children: [_jsx(Plus, { size: 16, strokeWidth: 1.5 }), "Nova recorrente"] }) }), templates.length === 0 && _jsx("div", { className: "card", children: _jsx(Empty, { icon: _jsx(Repeat, { size: 18, strokeWidth: 1.5 }), children: "Nenhuma tarefa recorrente. Ela aparece sozinha em Hoje nos dias escolhidos" }) }), _jsx("ul", { className: "grid gap-2", children: templates.map((t) => (_jsx("li", { children: _jsx("button", { className: "card flex w-full items-center gap-3 text-left", onClick: () => setEditing(t), children: _jsxs("div", { className: "flex-1", children: [_jsx("div", { className: t.is_active ? '' : 'text-fg3', children: t.title }), _jsxs("div", { className: "text-xs text-fg3", children: [t.recurrence_days.length ? t.recurrence_days.map(weekdayShort).join(', ') : 'todo dia', t.time_of_day && ` · ${t.time_of_day.slice(0, 5)}`, !t.is_active && ' · pausada'] })] }) }) }, t.id))) }), editing && _jsx(TemplateForm, { template: editing, onClose: () => setEditing(null), onSaved: () => { setEditing(null); void reload(); } })] }));
}
function TemplateForm({ template, onClose, onSaved }) {
    const [title, setTitle] = useState(template.title ?? '');
    const [days, setDays] = useState(template.recurrence_days ?? []);
    const [time, setTime] = useState(template.time_of_day?.slice(0, 5) ?? '');
    const [priority, setPriority] = useState(template.priority ?? 'medium');
    const [active, setActive] = useState(template.is_active ?? true);
    async function save(e) {
        e.preventDefault();
        const row = { title, recurrence_days: days, time_of_day: time || null, priority, is_active: active };
        const ok = template.id
            ? await write(supabase.from('task_recurring_templates').update(row).eq('id', template.id))
            : await write(supabase.from('task_recurring_templates').insert(row));
        if (ok)
            onSaved();
    }
    async function remove() {
        if (template.id && confirm('Excluir esta recorrência? As tarefas já criadas ficam.') &&
            await write(supabase.from('task_recurring_templates').delete().eq('id', template.id)))
            onSaved();
    }
    return (_jsx(Modal, { title: template.id ? 'Editar recorrente' : 'Nova recorrente', onClose: onClose, children: _jsxs("form", { onSubmit: save, children: [_jsx(Field, { label: "T\u00EDtulo", children: _jsx("input", { className: "input", value: title, onChange: (e) => setTitle(e.target.value), required: true, autoFocus: true }) }), _jsx(FieldGroup, { label: "Dias (nenhum = todo dia)", children: _jsx(WeekdayPicker, { value: days, onChange: setDays }) }), _jsxs("div", { className: "grid grid-cols-2 gap-2", children: [_jsx(Field, { label: "Hora (opcional)", children: _jsx("input", { className: "input", type: "time", value: time, onChange: (e) => setTime(e.target.value) }) }), _jsx(Field, { label: "Prioridade", children: _jsx("select", { className: "input", value: priority, onChange: (e) => setPriority(e.target.value), children: ['high', 'medium', 'low'].map((p) => _jsx("option", { value: p, children: PRIORITY_LABEL[p] }, p)) }) })] }), _jsxs("label", { className: "mb-4 flex items-center gap-2 text-sm", children: [_jsx("input", { type: "checkbox", checked: active, onChange: (e) => setActive(e.target.checked) }), " Ativa"] }), _jsxs("div", { className: "flex gap-2", children: [template.id && _jsx("button", { type: "button", className: "btn-ghost text-negative", onClick: remove, children: "Excluir" }), _jsx("button", { className: "btn-primary ml-auto", children: "Salvar" })] })] }) }));
}
function TasksCalendar({ tasks, templates, tags, onToggle, onOpen, onNew, onMove }) {
    const now = new Date();
    const today = toDay(now);
    const [ym, setYm] = useState({ year: now.getFullYear(), month: now.getMonth() + 1 });
    const [selected, setSelected] = useState(today);
    const [showRecurring, setShowRecurring] = useState(true);
    const dayOf = (t) => (t.due_date ? toDay(new Date(t.due_date)) : null);
    const byDay = new Map();
    for (const t of tasks) {
        const d = dayOf(t);
        if (!d || t.is_archived)
            continue;
        byDay.set(d, [...(byDay.get(d) ?? []), t]);
    }
    for (const list of byDay.values())
        list.sort((a, b) => Number(a.completed) - Number(b.completed) || (a.due_date ?? '').localeCompare(b.due_date ?? ''));
    const projected = showRecurring ? projectedRecurringTasks(templates, toDay(new Date(ym.year, ym.month - 1, -6)), toDay(new Date(ym.year, ym.month, 7)), today) : [];
    const projectedOn = (d) => projected.filter((p) => p.day === d);
    const selectedTasks = byDay.get(selected) ?? [];
    return (_jsxs("div", { className: "grid gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]", children: [_jsx(MonthCalendar, { year: ym.year, month: ym.month, onMonth: setYm, selected: selected, onSelect: setSelected, count: (d) => (byDay.get(d)?.length ?? 0) + projectedOn(d).length, onDrop: (d, id) => onMove(id, d), aside: _jsxs("label", { className: "order-last flex w-full items-center gap-2 text-[13px] text-fg2 sm:order-none sm:mr-2 sm:w-auto", children: [_jsx("input", { type: "checkbox", checked: showRecurring, onChange: (e) => setShowRecurring(e.target.checked) }), "Recorrentes"] }), renderCell: (d) => {
                    const list = byDay.get(d) ?? [];
                    const proj = projectedOn(d);
                    const all = list.length + proj.length;
                    return (_jsxs(_Fragment, { children: [list.slice(0, 3).map((t) => (_jsx(CellChip, { done: t.completed, overdue: !t.completed && d < today, draggable: !t.completed, payload: t.id, title: t.title, children: t.title }, t.id))), list.length < 3 && proj.slice(0, 3 - list.length).map((p) => _jsx(CellChip, { dashed: true, title: `${p.title} (recorrente)`, children: p.title }, p.template_id + p.day)), all > 3 && _jsxs("div", { className: "px-1.5 text-[11px] text-fg3", children: ["+", all - 3] })] }));
                } }), _jsxs("section", { className: "card h-fit", children: [_jsxs("div", { className: "mb-3 flex items-center gap-2", children: [_jsx("h2", { className: "mr-auto font-medium", children: sentence(formatDay(selected)) }), _jsxs("button", { className: "btn-secondary h-8", onClick: () => onNew(selected), children: [_jsx(Plus, { size: 16, strokeWidth: 1.5 }), "Tarefa"] })] }), !selectedTasks.length && !projectedOn(selected).length ? _jsx(Empty, { icon: _jsx(CalendarDays, { size: 18, strokeWidth: 1.5 }), children: "Nada neste dia" }) : (_jsxs("ul", { className: "divide-y divide-line", children: [selectedTasks.map((t) => _jsx(TaskRow, { task: t, tags: tags, onToggle: () => onToggle(t), onOpen: () => onOpen(t) }, t.id)), projectedOn(selected).map((p) => (_jsxs("li", { className: "flex items-center gap-3 px-4 py-3 text-sm text-fg3", children: [_jsx(Repeat, { size: 16, strokeWidth: 1.5 }), _jsx("span", { className: "mr-auto", children: p.title }), p.time && _jsx("span", { className: "figure text-xs", children: p.time }), _jsx("span", { className: "text-xs", children: "recorrente" })] }, p.template_id)))] })), _jsx("p", { className: "mt-4 hidden text-xs text-fg3 md:block", children: "Arraste uma tarefa para outro dia para remarc\u00E1-la" })] })] }));
}
