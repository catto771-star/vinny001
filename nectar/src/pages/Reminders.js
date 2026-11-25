import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useEffect, useState } from 'react';
import { Bell, Repeat } from 'lucide-react';
import { Plus } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useTable, write } from '../lib/useTable';
import { addDays, formatDay, formatTime, toDay, weekdayShort } from '../lib/dates';
import { missingOccurrences, reminderPanel } from '../lib/reminders';
import { Empty, Field, FieldGroup, ListSkeleton, Modal, PageHeader, Stat, WeekdayPicker } from '../components/ui';
const TABS = ['Lembretes', 'Recorrentes'];
export default function Reminders() {
    const [tab, setTab] = useState('Lembretes');
    const reminders = useTable('reminders', '*', { column: 'datetime' });
    const templates = useTable('reminder_recurring_templates', '*', { column: 'time_of_day' });
    const [editing, setEditing] = useState(null);
    const [editingTpl, setEditingTpl] = useState(null);
    const now = new Date();
    const panel = reminderPanel(reminders.rows, now);
    // Materialize the next 7 days of each recurring reminder.
    useEffect(() => {
        if (reminders.loading || templates.loading)
            return;
        const today = toDay(new Date());
        const rows = templates.rows.flatMap((t) => missingOccurrences(t, reminders.rows, today, addDays(today, 7)).map((o) => ({
            title: t.title, datetime: o.datetime, alarm_enabled: t.alarm_enabled, recurring_template_id: t.id,
        })));
        if (rows.length)
            void supabase.from('reminders').insert(rows).then(() => reminders.reload());
    }, [templates.rows, templates.loading, reminders.loading]);
    async function toggle(r) {
        reminders.setRows((rows) => rows.map((x) => (x.id === r.id ? { ...x, completed: !r.completed } : x)));
        await write(supabase.from('reminders').update({ completed: !r.completed }).eq('id', r.id));
        void reminders.reload();
    }
    const group = (title, items, tone = '') => items.length > 0 && (_jsxs("section", { className: "mb-4", children: [_jsxs("div", { className: `label mb-2 flex gap-2 ${tone}`, children: [title, _jsx("span", { className: "figure text-fg3", children: items.length })] }), _jsx("ul", { className: "card divide-y divide-line p-0", children: items.map((r) => (_jsxs("li", { className: "flex items-center gap-3 px-4 py-3", children: [_jsx("input", { type: "checkbox", className: "h-4 w-4", checked: r.completed, onChange: () => toggle(r), "aria-label": `Concluir ${r.title}` }), _jsxs("button", { className: "flex-1 text-left", onClick: () => setEditing(r), children: [_jsx("div", { className: `text-sm ${r.completed ? 'text-fg3 line-through' : ''}`, children: r.title }), _jsxs("div", { className: "text-xs text-fg3", children: [formatDay(toDay(new Date(r.datetime))), " \u00B7 ", formatTime(r.datetime), r.recurring_template_id && ' · recorrente', r.alarm_enabled && ' · alarme'] })] })] }, r.id))) })] }));
    return (_jsxs(_Fragment, { children: [_jsx(PageHeader, { title: "Lembretes", subtitle: `agora ${formatTime(now.toISOString())}`, tabs: TABS, tab: tab, onTab: (t) => setTab(t), action: tab === 'Lembretes'
                    ? _jsxs("button", { className: "btn-primary", onClick: () => setEditing({}), children: [_jsx(Plus, { size: 16, strokeWidth: 1.5 }), "Novo lembrete"] })
                    : _jsxs("button", { className: "btn-primary", onClick: () => setEditingTpl({}), children: [_jsx(Plus, { size: 16, strokeWidth: 1.5 }), "Nova recorr\u00EAncia"] }) }), reminders.error && _jsx("p", { className: "mb-4 text-sm text-negative", children: reminders.error }), tab === 'Lembretes' && (_jsxs(_Fragment, { children: [_jsxs("div", { className: "card mb-6 grid grid-cols-3 gap-4", children: [_jsx(Stat, { label: "Hoje", value: panel.today.length }), _jsx(Stat, { label: "Atrasados", value: panel.overdue.length }), _jsx(Stat, { label: "Pr\u00F3ximos 7 dias", value: panel.thisWeek.length })] }), group('Atrasados', panel.overdue, 'text-negative'), group('Hoje', panel.today), group('Esta semana', panel.thisWeek), group('Depois', panel.later), group('Concluídos', panel.done.slice(0, 20), 'text-positive'), reminders.loading ? _jsx(ListSkeleton, {}) : !reminders.rows.length && _jsx("div", { className: "card", children: _jsx(Empty, { icon: _jsx(Bell, { size: 18, strokeWidth: 1.5 }), action: _jsx("button", { className: "btn-secondary", onClick: () => setEditing({}), children: "Novo lembrete" }), children: "Nada agendado \u00E0 frente" }) })] })), tab === 'Recorrentes' && (_jsxs(_Fragment, { children: [templates.rows.length === 0 && _jsx("div", { className: "card", children: _jsx(Empty, { icon: _jsx(Repeat, { size: 18, strokeWidth: 1.5 }), children: "Nenhum recorrente ainda. Vitamina, academia, fatura: cadastre uma vez" }) }), _jsx("ul", { className: "grid gap-2", children: templates.rows.map((t) => (_jsx("li", { children: _jsxs("button", { className: "card w-full text-left", onClick: () => setEditingTpl(t), children: [_jsx("div", { className: t.is_active ? '' : 'text-fg3', children: t.title }), _jsxs("div", { className: "text-xs text-fg3", children: [t.recurrence_days.length ? t.recurrence_days.map(weekdayShort).join(', ') : 'todo dia', " \u00B7 ", t.time_of_day.slice(0, 5), !t.is_active && ' · pausado'] })] }) }, t.id))) })] })), editing && _jsx(ReminderForm, { reminder: editing, onClose: () => setEditing(null), onSaved: () => { setEditing(null); void reminders.reload(); } }), editingTpl && (_jsx(TemplateForm, { template: editingTpl, onClose: () => setEditingTpl(null), onSaved: () => { setEditingTpl(null); void templates.reload(); void reminders.reload(); } }))] }));
}
function ReminderForm({ reminder, onClose, onSaved }) {
    const at = reminder.datetime ? new Date(reminder.datetime) : new Date(Date.now() + 3600_000);
    const [title, setTitle] = useState(reminder.title ?? '');
    const [date, setDate] = useState(toDay(at));
    const [time, setTime] = useState(formatTime(at.toISOString()));
    const [alarm, setAlarm] = useState(reminder.alarm_enabled ?? false);
    async function save(e) {
        e.preventDefault();
        const [y, m, d] = date.split('-').map(Number);
        const [hh, mm] = time.split(':').map(Number);
        const row = { title, datetime: new Date(y, m - 1, d, hh, mm).toISOString(), alarm_enabled: alarm };
        const ok = reminder.id
            ? await write(supabase.from('reminders').update(row).eq('id', reminder.id))
            : await write(supabase.from('reminders').insert(row));
        if (ok)
            onSaved();
    }
    async function remove() {
        if (reminder.id && confirm('Excluir este lembrete?') && await write(supabase.from('reminders').delete().eq('id', reminder.id)))
            onSaved();
    }
    return (_jsx(Modal, { title: reminder.id ? 'Editar lembrete' : 'Novo lembrete', onClose: onClose, children: _jsxs("form", { onSubmit: save, children: [_jsx(Field, { label: "O que lembrar", children: _jsx("input", { className: "input", value: title, onChange: (e) => setTitle(e.target.value), required: true, autoFocus: true }) }), _jsxs("div", { className: "grid grid-cols-2 gap-2", children: [_jsx(Field, { label: "Data", children: _jsx("input", { className: "input", type: "date", value: date, onChange: (e) => setDate(e.target.value), required: true }) }), _jsx(Field, { label: "Hora", children: _jsx("input", { className: "input", type: "time", value: time, onChange: (e) => setTime(e.target.value), required: true }) })] }), _jsxs("label", { className: "mb-4 flex items-center gap-2 text-sm", children: [_jsx("input", { type: "checkbox", checked: alarm, onChange: (e) => setAlarm(e.target.checked) }), " Alarme"] }), _jsxs("div", { className: "flex gap-2", children: [reminder.id && _jsx("button", { type: "button", className: "btn-ghost text-negative", onClick: remove, children: "Excluir" }), _jsx("button", { className: "btn-primary ml-auto", children: "Salvar" })] })] }) }));
}
function TemplateForm({ template, onClose, onSaved }) {
    const [title, setTitle] = useState(template.title ?? '');
    const [days, setDays] = useState(template.recurrence_days ?? []);
    const [time, setTime] = useState(template.time_of_day?.slice(0, 5) ?? '08:00');
    const [endDate, setEndDate] = useState(template.end_date ?? '');
    const [active, setActive] = useState(template.is_active ?? true);
    async function save(e) {
        e.preventDefault();
        const row = { title, recurrence_days: days, time_of_day: time, end_date: endDate || null, is_active: active };
        const ok = template.id
            ? await write(supabase.from('reminder_recurring_templates').update(row).eq('id', template.id))
            : await write(supabase.from('reminder_recurring_templates').insert(row));
        if (ok)
            onSaved();
    }
    async function remove() {
        if (template.id && confirm('Excluir esta recorrência e os próximos lembretes dela?')) {
            await supabase.from('reminders').delete().eq('recurring_template_id', template.id).eq('completed', false);
            if (await write(supabase.from('reminder_recurring_templates').delete().eq('id', template.id)))
                onSaved();
        }
    }
    return (_jsx(Modal, { title: template.id ? 'Editar recorrência' : 'Nova recorrência', onClose: onClose, children: _jsxs("form", { onSubmit: save, children: [_jsx(Field, { label: "O que lembrar", children: _jsx("input", { className: "input", value: title, onChange: (e) => setTitle(e.target.value), required: true, autoFocus: true }) }), _jsx(FieldGroup, { label: "Dias (nenhum = todo dia)", children: _jsx(WeekdayPicker, { value: days, onChange: setDays }) }), _jsxs("div", { className: "grid grid-cols-2 gap-2", children: [_jsx(Field, { label: "Hora", children: _jsx("input", { className: "input", type: "time", value: time, onChange: (e) => setTime(e.target.value), required: true }) }), _jsx(Field, { label: "At\u00E9 (opcional)", children: _jsx("input", { className: "input", type: "date", value: endDate, onChange: (e) => setEndDate(e.target.value) }) })] }), _jsxs("label", { className: "mb-4 flex items-center gap-2 text-sm", children: [_jsx("input", { type: "checkbox", checked: active, onChange: (e) => setActive(e.target.checked) }), " Ativa"] }), _jsxs("div", { className: "flex gap-2", children: [template.id && _jsx("button", { type: "button", className: "btn-ghost text-negative", onClick: remove, children: "Excluir" }), _jsx("button", { className: "btn-primary ml-auto", children: "Salvar" })] })] }) }));
}
