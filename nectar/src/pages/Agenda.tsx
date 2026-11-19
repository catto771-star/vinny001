import { useMemo, useState, type FormEvent } from 'react';
import { syncGoogleNow } from '../lib/gcal';
import { Bell, CalendarDays, CheckSquare, ChevronLeft, ChevronRight, Dumbbell, MapPin, Plus, Repeat, Wallet, type LucideIcon } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useTable, write } from '../lib/useTable';
import { addDays, formatDay, formatTime, monthName, toDay, sentence } from '../lib/dates';
import { weekOf } from '../lib/calendar';
import { brl } from '../lib/format';
import { buildAgenda, KIND_LABEL, type AgendaItem, type AgendaKind, type Event } from '../lib/agenda';
import type { Task } from '../lib/tasks';
import type { Reminder } from '../lib/reminders';
import type { Habit, HabitCompletion } from '../lib/habits';
import type { PlanSession } from '../lib/plans';
import type { Card, InvoicePayment, RecurringTemplate, Skip, Tx } from '../lib/finance';
import { CellChip, MonthCalendar } from '../components/MonthCalendar';
import { Empty, Field, ListSkeleton, Modal, PageHeader } from '../components/ui';

const VIEWS = ['Dia', 'Semana', 'Mês'] as const;
type View = (typeof VIEWS)[number];
const KINDS: AgendaKind[] = ['event', 'task', 'reminder', 'habit', 'workout', 'money'];
const ICON: Record<AgendaKind, LucideIcon> = { event: CalendarDays, task: CheckSquare, reminder: Bell, habit: Repeat, workout: Dumbbell, money: Wallet };
const I = { size: 16, strokeWidth: 1.5 } as const;
const SINGULAR: Record<AgendaKind, string> = { event: 'compromisso', task: 'tarefa', reminder: 'lembrete', habit: 'hábito', workout: 'treino', money: 'conta' };

export default function Agenda() {
  const events = useTable<Event & { notes: string | null }>('events', '*', { column: 'start_at' });
  const tasks = useTable<Task>('tasks');
  const reminders = useTable<Reminder>('reminders');
  const habits = useTable<Habit>('habits');
  const completions = useTable<HabitCompletion>('habit_completions', 'id,habit_id,completed_date,value');
  const plans = useTable<{ id: string; is_active: boolean }>('workout_plans', 'id,is_active');
  const sessions = useTable<PlanSession>('workout_plan_sessions');
  const workouts = useTable<{ date: string; plan_session_id: string | null; title: string | null }>('workouts', 'date,plan_session_id,title');
  const txs = useTable<Tx>('transactions');
  const templates = useTable<RecurringTemplate>('transaction_recurring_templates');
  const skips = useTable<Skip>('transaction_recurring_skips');
  const cards = useTable<Card>('cards');
  const payments = useTable<InvoicePayment>('card_invoice_payments');

  const now = new Date();
  const today = toDay(now);
  const [view, setView] = useState<View>('Semana');
  const [day, setDay] = useState(today);
  const [ym, setYm] = useState({ year: now.getFullYear(), month: now.getMonth() + 1 });
  const [kinds, setKinds] = useState<Set<AgendaKind>>(new Set(KINDS));
  const [editing, setEditing] = useState<Partial<Event & { notes: string | null }> | null>(null);
  const loading = events.loading || tasks.loading || txs.loading;

  const [from, to] = view === 'Dia' ? [day, day] : view === 'Semana' ? [weekOf(day)[0], weekOf(day)[6]]
    : [toDay(new Date(ym.year, ym.month - 1, -6)), toDay(new Date(ym.year, ym.month, 7))];
  const activePlan = plans.rows.find((p) => p.is_active);
  const items = useMemo(() => buildAgenda(from, to, {
    events: events.rows, tasks: tasks.rows, reminders: reminders.rows, habits: habits.rows, completions: completions.rows,
    planSessions: sessions.rows.filter((s) => s.plan_id === activePlan?.id), workouts: workouts.rows,
    txs: txs.rows, templates: templates.rows, skips: skips.rows, cards: cards.rows, payments: payments.rows,
  }, now).filter((i) => kinds.has(i.kind)),
  [from, to, kinds, events.rows, tasks.rows, reminders.rows, habits.rows, completions.rows, sessions.rows, workouts.rows, txs.rows, templates.rows, skips.rows, cards.rows, payments.rows, activePlan?.id]);

  async function toggle(i: AgendaItem) {
    if (i.kind === 'task') {
      const completed = !i.done;
      tasks.setRows((rows) => rows.map((t) => (t.id === i.ref ? { ...t, completed } : t)));
      await write(supabase.from('tasks').update({ completed, status: completed ? 'completed' : 'pending', completed_at: completed ? new Date().toISOString() : null }).eq('id', i.ref!));
      void tasks.reload();
    } else if (i.kind === 'reminder') {
      reminders.setRows((rows) => rows.map((r) => (r.id === i.ref ? { ...r, completed: !i.done } : r)));
      await write(supabase.from('reminders').update({ completed: !i.done }).eq('id', i.ref!));
      void reminders.reload();
    }
  }
  const openEvent = (i: AgendaItem) => i.kind === 'event' && setEditing(events.rows.find((e) => e.id === i.ref) ?? null);
  const shift = (n: number) => setDay(addDays(day, view === 'Dia' ? n : 7 * n));
  const title = view === 'Dia' ? formatDay(day) : view === 'Semana' ? `${formatDay(from)} a ${formatDay(to)}` : `${monthName(ym.month)} de ${ym.year}`;

  return (
    <>
      <PageHeader
        title="Agenda"
        subtitle={sentence(title)}
        tabs={VIEWS} tab={view} onTab={(v) => setView(v as View)}
        action={
          <div className="flex items-center gap-1">
            {view !== 'Mês' && <>
              <button className="icon-btn" onClick={() => shift(-1)} aria-label="Anterior"><ChevronLeft {...I} /></button>
              <button className="btn-ghost h-8" onClick={() => setDay(today)}>Hoje</button>
              <button className="icon-btn" onClick={() => shift(1)} aria-label="Próximo"><ChevronRight {...I} /></button>
            </>}
            <button className="btn-primary ml-2" onClick={() => setEditing({ start_at: new Date(`${day}T09:00:00`).toISOString(), all_day: false })}><Plus {...I} />Compromisso</button>
          </div>
        }
      />
      <div className="mb-5 flex flex-wrap gap-1" role="group" aria-label="Mostrar">
        {KINDS.map((k) => {
          const on = kinds.has(k);
          const Icon = ICON[k];
          return (
            <button key={k} aria-pressed={on} onClick={() => { const n = new Set(kinds); if (on) n.delete(k); else n.add(k); setKinds(n); }}
              className={`inline-flex h-8 items-center gap-1.5 rounded-lg border px-3 text-[13px] transition-colors duration-150 ${on ? 'border-line-strong bg-raised text-fg' : 'border-line text-fg3 hover:text-fg2'}`}>
              <Icon size={14} strokeWidth={1.5} />{KIND_LABEL[k]}
            </button>
          );
        })}
      </div>

      {loading ? <ListSkeleton rows={6} /> : view === 'Dia' ? (
        <DayList items={items} day={day} onToggle={toggle} onOpen={openEvent} />
      ) : view === 'Semana' ? (
        <div className="grid gap-3 lg:grid-cols-7">
          {weekOf(day).map((d) => (
            <section key={d} className={`card p-3 ${d === today ? 'border-line-strong' : ''}`}>
              <button className="mb-2 w-full text-left" onClick={() => { setDay(d); setView('Dia'); }}>
                <div className="text-xs text-fg3">{sentence(formatDay(d).split(',')[0])}</div>
                <div className={`figure text-lg ${d === today ? 'text-brand-ink' : ''}`}>{Number(d.slice(8))}</div>
              </button>
              <ul className="space-y-1">
                {items.filter((i) => i.day === d).map((i) => <ItemRow key={i.key} i={i} compact onToggle={toggle} onOpen={openEvent} />)}
              </ul>
            </section>
          ))}
        </div>
      ) : (
        <div className="grid gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
          <MonthCalendar
            year={ym.year} month={ym.month} onMonth={setYm} selected={day} onSelect={setDay}
            count={(d) => items.filter((i) => i.day === d).length}
            renderCell={(d) => {
              const list = items.filter((i) => i.day === d);
              return (
                <>
                  {list.slice(0, 3).map((i) => <CellChip key={i.key} done={i.done} overdue={i.overdue} title={i.title}>{i.time ? `${i.time} ` : ''}{i.title}</CellChip>)}
                  {list.length > 3 && <div className="px-1.5 text-[11px] text-fg3">+{list.length - 3}</div>}
                </>
              );
            }}
          />
          <DayList items={items} day={day} onToggle={toggle} onOpen={openEvent} />
        </div>
      )}
      {editing && <EventForm event={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); void events.reload(); void syncGoogleNow().then((ok) => { if (ok) void events.reload(); }); }} />}
    </>
  );
}

function DayList({ items, day, onToggle, onOpen }: { items: AgendaItem[]; day: string; onToggle: (i: AgendaItem) => void; onOpen: (i: AgendaItem) => void }) {
  const list = items.filter((i) => i.day === day);
  return (
    <section className="card h-fit">
      <h2 className="mb-3 font-medium">{sentence(formatDay(day))}</h2>
      {!list.length ? <Empty icon={<CalendarDays size={18} strokeWidth={1.5} />}>Nada neste dia</Empty> : (
        <ul className="divide-y divide-line">{list.map((i) => <ItemRow key={i.key} i={i} onToggle={onToggle} onOpen={onOpen} />)}</ul>
      )}
    </section>
  );
}

function ItemRow({ i, compact, onToggle, onOpen }: { i: AgendaItem; compact?: boolean; onToggle: (i: AgendaItem) => void; onOpen: (i: AgendaItem) => void }) {
  const Icon = ICON[i.kind];
  const checkable = i.kind === 'task' || i.kind === 'reminder';
  const tone = i.done ? 'text-fg3 line-through' : i.overdue ? 'text-negative' : '';
  if (compact) {
    return (
      <li>
        <button className={`flex w-full items-start gap-1.5 rounded-md px-1 py-0.5 text-left text-[12px] leading-4 hover:bg-raised ${tone}`} onClick={() => (checkable ? onToggle(i) : onOpen(i))} title={i.title}>
          <Icon size={12} strokeWidth={1.5} className="mt-0.5 shrink-0 text-fg3" />
          <span className="min-w-0">{i.time && <span className="figure text-fg3">{i.time} </span>}{i.title}</span>
        </button>
      </li>
    );
  }
  return (
    <li className="flex items-center gap-3 py-2.5 text-sm">
      <span className="figure w-11 shrink-0 text-xs text-fg3">{i.time ?? 'dia'}</span>
      {checkable
        ? <input type="checkbox" className="h-4 w-4" checked={i.done} onChange={() => onToggle(i)} aria-label={`Concluir ${i.title}`} />
        : <Icon {...I} className="shrink-0 text-fg3" />}
      <button className={`min-w-0 flex-1 text-left ${tone}`} onClick={() => onOpen(i)} disabled={i.kind !== 'event'}>
        <span className="block truncate">{i.title}</span>
        {(i.detail || i.endTime) && <span className="flex items-center gap-1 text-xs text-fg3">{i.endTime && `até ${i.endTime}`}{i.detail && <><MapPin size={12} strokeWidth={1.5} />{i.detail}</>}</span>}
      </button>
      {i.amount !== undefined && <span className={`figure text-xs ${i.amount < 0 ? '' : 'text-positive'}`}>{i.amount < 0 ? '−' : '+'}{brl(Math.abs(i.amount))}</span>}
      <span className="hidden w-20 text-right text-xs text-fg3 sm:inline">{SINGULAR[i.kind]}</span>
    </li>
  );
}

function EventForm({ event, onClose, onSaved }: { event: Partial<Event & { notes: string | null }>; onClose: () => void; onSaved: () => void }) {
  const start = event.start_at ? new Date(event.start_at) : new Date();
  const end = event.end_at ? new Date(event.end_at) : new Date(start.getTime() + 3600_000);
  const [title, setTitle] = useState(event.title ?? '');
  const [date, setDate] = useState(toDay(start));
  const [allDay, setAllDay] = useState(event.all_day ?? false);
  const [from, setFrom] = useState(formatTime(start.toISOString()));
  const [until, setUntil] = useState(formatTime(end.toISOString()));
  const [location, setLocation] = useState(event.location ?? '');
  const [notes, setNotes] = useState(event.notes ?? '');

  async function save(e: FormEvent) {
    e.preventDefault();
    const at = (t: string) => new Date(`${date}T${t}:00`).toISOString();
    if (!allDay && until <= from) return alert('O fim precisa ser depois do início');
    const row = { title, all_day: allDay, start_at: allDay ? at('00:00') : at(from), end_at: allDay ? null : at(until), location: location || null, notes: notes || null };
    const ok = event.id ? await write(supabase.from('events').update(row).eq('id', event.id)) : await write(supabase.from('events').insert(row));
    if (ok) onSaved();
  }
  async function remove() {
    if (event.id && confirm('Excluir este compromisso?') && await write(supabase.from('events').delete().eq('id', event.id))) onSaved();
  }
  return (
    <Modal title={event.id ? 'Editar compromisso' : 'Novo compromisso'} onClose={onClose}>
      <form onSubmit={save}>
        <Field label="Título"><input className="input" value={title} onChange={(e) => setTitle(e.target.value)} required autoFocus placeholder="Dentista" /></Field>
        <Field label="Data"><input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} required /></Field>
        <label className="mb-4 flex items-center gap-2 text-sm"><input type="checkbox" checked={allDay} onChange={(e) => setAllDay(e.target.checked)} />Dia inteiro</label>
        {!allDay && (
          <div className="grid grid-cols-2 gap-3">
            <Field label="Início"><input className="input" type="time" value={from} onChange={(e) => setFrom(e.target.value)} required /></Field>
            <Field label="Fim"><input className="input" type="time" value={until} onChange={(e) => setUntil(e.target.value)} required /></Field>
          </div>
        )}
        <Field label="Local"><input className="input" value={location} onChange={(e) => setLocation(e.target.value)} /></Field>
        <Field label="Observações"><textarea className="input h-20 py-2" value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
        <div className="flex gap-2">
          {event.id && <button type="button" className="btn-ghost text-negative" onClick={remove}>Excluir</button>}
          <button className="btn-primary ml-auto">Salvar</button>
        </div>
      </form>
    </Modal>
  );
}
