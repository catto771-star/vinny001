import { useEffect, useState, type FormEvent } from 'react';
import { Bell, Repeat } from 'lucide-react';
import { Plus } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useTable, write } from '../lib/useTable';
import { addDays, formatDay, formatTime, toDay, weekdayShort } from '../lib/dates';
import { missingOccurrences, reminderPanel, type Reminder, type ReminderTemplate } from '../lib/reminders';
import { Empty, Field, ListSkeleton, Modal, PageHeader, Stat, WeekdayPicker } from '../components/ui';

const TABS = ['Lembretes', 'Recorrentes'] as const;
type Tab = (typeof TABS)[number];

export default function Reminders() {
  const [tab, setTab] = useState<Tab>('Lembretes');
  const reminders = useTable<Reminder>('reminders', '*', { column: 'datetime' });
  const templates = useTable<ReminderTemplate>('reminder_recurring_templates', '*', { column: 'time_of_day' });
  const [editing, setEditing] = useState<Partial<Reminder> | null>(null);
  const [editingTpl, setEditingTpl] = useState<Partial<ReminderTemplate> | null>(null);
  const now = new Date();
  const panel = reminderPanel(reminders.rows, now);

  // Materialize the next 7 days of each recurring reminder.
  useEffect(() => {
    if (reminders.loading || templates.loading) return;
    const today = toDay(new Date());
    const rows = templates.rows.flatMap((t) =>
      missingOccurrences(t, reminders.rows, today, addDays(today, 7)).map((o) => ({
        title: t.title, datetime: o.datetime, alarm_enabled: t.alarm_enabled, recurring_template_id: t.id,
      })));
    if (rows.length) void supabase.from('reminders').insert(rows).then(() => reminders.reload());
  }, [templates.rows, templates.loading, reminders.loading]);

  async function toggle(r: Reminder) {
    reminders.setRows((rows) => rows.map((x) => (x.id === r.id ? { ...x, completed: !r.completed } : x)));
    await write(supabase.from('reminders').update({ completed: !r.completed }).eq('id', r.id));
    void reminders.reload();
  }

  const group = (title: string, items: Reminder[], tone = '') => items.length > 0 && (
    <section className="mb-4">
      <div className={`label mb-2 flex gap-2 ${tone}`}>{title}<span className="figure text-fg3">{items.length}</span></div>
      <ul className="card divide-y divide-line p-0">
        {items.map((r) => (
          <li key={r.id} className="flex items-center gap-3 px-4 py-3">
            <input type="checkbox" className="h-4 w-4" checked={r.completed} onChange={() => toggle(r)} aria-label={`Concluir ${r.title}`} />
            <button className="flex-1 text-left" onClick={() => setEditing(r)}>
              <div className={`text-sm ${r.completed ? 'text-fg3 line-through' : ''}`}>{r.title}</div>
              <div className="text-xs text-fg3">
                {formatDay(toDay(new Date(r.datetime)))} · {formatTime(r.datetime)}
                {r.recurring_template_id && ' · recorrente'}{r.alarm_enabled && ' · alarme'}
              </div>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );

  return (
    <>
      <PageHeader
        title="Lembretes"
        subtitle={`agora ${formatTime(now.toISOString())}`}
        tabs={TABS}
        tab={tab}
        onTab={(t) => setTab(t as Tab)}
        action={tab === 'Lembretes'
          ? <button className="btn-primary" onClick={() => setEditing({})}><Plus size={16} strokeWidth={1.5} />Novo lembrete</button>
          : <button className="btn-primary" onClick={() => setEditingTpl({})}><Plus size={16} strokeWidth={1.5} />Nova recorrência</button>}
      />
      {reminders.error && <p className="mb-4 text-sm text-negative">{reminders.error}</p>}

      {tab === 'Lembretes' && (
        <>
          <div className="card mb-6 grid grid-cols-3 gap-4">
            <Stat label="Hoje" value={panel.today.length} />
            <Stat label="Atrasados" value={panel.overdue.length} />
            <Stat label="Próximos 7 dias" value={panel.thisWeek.length} />
          </div>
          {group('Atrasados', panel.overdue, 'text-negative')}
          {group('Hoje', panel.today)}
          {group('Esta semana', panel.thisWeek)}
          {group('Depois', panel.later)}
          {group('Concluídos', panel.done.slice(0, 20), 'text-positive')}
          {reminders.loading ? <ListSkeleton /> : !reminders.rows.length && <div className="card"><Empty icon={<Bell size={18} strokeWidth={1.5} />} action={<button className="btn-secondary" onClick={() => setEditing({})}>Novo lembrete</button>}>Nada agendado à frente</Empty></div>}
        </>
      )}

      {tab === 'Recorrentes' && (
        <>
          {templates.rows.length === 0 && <div className="card"><Empty icon={<Repeat size={18} strokeWidth={1.5} />}>Nenhum recorrente ainda. Vitamina, academia, fatura: cadastre uma vez</Empty></div>}
          <ul className="grid gap-2">
            {templates.rows.map((t) => (
              <li key={t.id}>
                <button className="card w-full text-left" onClick={() => setEditingTpl(t)}>
                  <div className={t.is_active ? '' : 'text-fg3'}>{t.title}</div>
                  <div className="text-xs text-fg3">
                    {t.recurrence_days.length ? t.recurrence_days.map(weekdayShort).join(', ') : 'todo dia'} · {t.time_of_day.slice(0, 5)}
                    {!t.is_active && ' · pausado'}
                  </div>
                </button>
              </li>
            ))}
          </ul>
        </>
      )}

      {editing && <ReminderForm reminder={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); void reminders.reload(); }} />}
      {editingTpl && (
        <TemplateForm template={editingTpl} onClose={() => setEditingTpl(null)}
          onSaved={() => { setEditingTpl(null); void templates.reload(); void reminders.reload(); }} />
      )}
    </>
  );
}

function ReminderForm({ reminder, onClose, onSaved }: { reminder: Partial<Reminder>; onClose: () => void; onSaved: () => void }) {
  const at = reminder.datetime ? new Date(reminder.datetime) : new Date(Date.now() + 3600_000);
  const [title, setTitle] = useState(reminder.title ?? '');
  const [date, setDate] = useState(toDay(at));
  const [time, setTime] = useState(formatTime(at.toISOString()));
  const [alarm, setAlarm] = useState(reminder.alarm_enabled ?? false);

  async function save(e: FormEvent) {
    e.preventDefault();
    const [y, m, d] = date.split('-').map(Number);
    const [hh, mm] = time.split(':').map(Number);
    const row = { title, datetime: new Date(y, m - 1, d, hh, mm).toISOString(), alarm_enabled: alarm };
    const ok = reminder.id
      ? await write(supabase.from('reminders').update(row).eq('id', reminder.id))
      : await write(supabase.from('reminders').insert(row));
    if (ok) onSaved();
  }
  async function remove() {
    if (reminder.id && confirm('Excluir este lembrete?') && await write(supabase.from('reminders').delete().eq('id', reminder.id))) onSaved();
  }

  return (
    <Modal title={reminder.id ? 'Editar lembrete' : 'Novo lembrete'} onClose={onClose}>
      <form onSubmit={save}>
        <Field label="O que lembrar"><input className="input" value={title} onChange={(e) => setTitle(e.target.value)} required autoFocus /></Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Data"><input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} required /></Field>
          <Field label="Hora"><input className="input" type="time" value={time} onChange={(e) => setTime(e.target.value)} required /></Field>
        </div>
        <label className="mb-4 flex items-center gap-2 text-sm"><input type="checkbox" checked={alarm} onChange={(e) => setAlarm(e.target.checked)} /> Alarme</label>
        <div className="flex gap-2">
          {reminder.id && <button type="button" className="btn-ghost text-negative" onClick={remove}>Excluir</button>}
          <button className="btn-primary ml-auto">Salvar</button>
        </div>
      </form>
    </Modal>
  );
}

function TemplateForm({ template, onClose, onSaved }: { template: Partial<ReminderTemplate>; onClose: () => void; onSaved: () => void }) {
  const [title, setTitle] = useState(template.title ?? '');
  const [days, setDays] = useState<number[]>(template.recurrence_days ?? []);
  const [time, setTime] = useState(template.time_of_day?.slice(0, 5) ?? '08:00');
  const [endDate, setEndDate] = useState(template.end_date ?? '');
  const [active, setActive] = useState(template.is_active ?? true);

  async function save(e: FormEvent) {
    e.preventDefault();
    const row = { title, recurrence_days: days, time_of_day: time, end_date: endDate || null, is_active: active };
    const ok = template.id
      ? await write(supabase.from('reminder_recurring_templates').update(row).eq('id', template.id))
      : await write(supabase.from('reminder_recurring_templates').insert(row));
    if (ok) onSaved();
  }
  async function remove() {
    if (template.id && confirm('Excluir esta recorrência e os próximos lembretes dela?')) {
      await supabase.from('reminders').delete().eq('recurring_template_id', template.id).eq('completed', false);
      if (await write(supabase.from('reminder_recurring_templates').delete().eq('id', template.id))) onSaved();
    }
  }

  return (
    <Modal title={template.id ? 'Editar recorrência' : 'Nova recorrência'} onClose={onClose}>
      <form onSubmit={save}>
        <Field label="O que lembrar"><input className="input" value={title} onChange={(e) => setTitle(e.target.value)} required autoFocus /></Field>
        <Field label="Dias (nenhum = todo dia)"><WeekdayPicker value={days} onChange={setDays} /></Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Hora"><input className="input" type="time" value={time} onChange={(e) => setTime(e.target.value)} required /></Field>
          <Field label="Até (opcional)"><input className="input" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} /></Field>
        </div>
        <label className="mb-4 flex items-center gap-2 text-sm"><input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} /> Ativa</label>
        <div className="flex gap-2">
          {template.id && <button type="button" className="btn-ghost text-negative" onClick={remove}>Excluir</button>}
          <button className="btn-primary ml-auto">Salvar</button>
        </div>
      </form>
    </Modal>
  );
}
