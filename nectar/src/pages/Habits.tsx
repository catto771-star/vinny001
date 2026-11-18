import { useState, type FormEvent } from 'react';
import { supabase } from '../lib/supabase';
import { useTable, write } from '../lib/useTable';
import { addDays, monthDays, monthName, toDay, weekday, weekdayShort } from '../lib/dates';
import {
  currentStreak, isDone, isPerfectDay, isScheduledOn, monthConsistency, routineFor,
  type Habit, type HabitCompletion,
} from '../lib/habits';
import { Empty, Field, Modal, PageHeader, Stat, WeekdayPicker } from '../components/ui';

const TABS = ['Hoje', 'Hábitos', 'Calendário'] as const;
type Tab = (typeof TABS)[number];

export default function Habits() {
  const [tab, setTab] = useState<Tab>('Hoje');
  const habits = useTable<Habit>('habits', '*', { column: 'created_at' });
  const completions = useTable<HabitCompletion>('habit_completions', 'id,habit_id,completed_date,value');
  const [editing, setEditing] = useState<Partial<Habit> | null>(null);
  const now = new Date();
  const today = toDay(now);
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const active = habits.rows.filter((h) => !h.is_archived);
  const routine = routineFor(active, today);

  async function setValue(habit: Habit, value: number) {
    const existing = completions.rows.find((c) => c.habit_id === habit.id && c.completed_date === today);
    // Show the change at once; the reload below brings the saved state.
    completions.setRows((rows) => {
      const others = rows.filter((c) => !(c.habit_id === habit.id && c.completed_date === today));
      return value > 0 ? [...others, { id: existing?.id ?? 'pending', habit_id: habit.id, completed_date: today, value }] : others;
    });
    if (value <= 0) {
      if (existing) await write(supabase.from('habit_completions').delete().eq('id', existing.id));
    } else if (existing) {
      await write(supabase.from('habit_completions').update({ value }).eq('id', existing.id));
    } else {
      await write(supabase.from('habit_completions').insert({ habit_id: habit.id, completed_date: today, value }));
    }
    void completions.reload();
  }

  const monthStats = active.map((h) => ({ habit: h, ...monthConsistency(h, completions.rows, year, month, today) }));
  const totalScheduled = monthStats.reduce((n, s) => n + s.scheduled, 0);
  const totalDone = monthStats.reduce((n, s) => n + s.done, 0);
  const perfectDays = monthDays(year, month).filter((d) => d <= today && isPerfectDay(active, completions.rows, d)).length;
  const doneToday = routine.filter((h) => isDone(h, completions.rows.find((c) => c.habit_id === h.id && c.completed_date === today))).length;

  return (
    <>
      <PageHeader
        title="Hábitos"
        subtitle={`${monthName(month)} de ${year}`}
        tabs={TABS}
        tab={tab}
        onTab={(t) => setTab(t as Tab)}
        action={<button className="btn-primary" onClick={() => setEditing({})}>+ Novo hábito</button>}
      />
      {habits.error && <p className="mb-4 text-sm text-red-600">{habits.error}</p>}

      {tab === 'Hoje' && (
        <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
          <div>
            <div className="card mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
              <Stat label="Constância no mês" value={`${totalScheduled ? Math.round((totalDone / totalScheduled) * 100) : 0}%`} />
              <Stat label="Dias perfeitos" value={perfectDays} hint={`de ${now.getDate()} dias`} />
              <Stat label="Hoje" value={`${doneToday}/${routine.length}`} />
              <Stat label="Hábitos ativos" value={active.length} />
            </div>
            <WeekStrip habits={active} completions={completions.rows} today={today} />
          </div>
          <div className="card h-fit">
            <div className="label mb-3">Rotina de hoje</div>
            {routine.length === 0 && <Empty>Nenhum hábito para hoje.</Empty>}
            <ul className="space-y-2">
              {routine.map((h) => {
                const c = completions.rows.find((x) => x.habit_id === h.id && x.completed_date === today);
                return (
                  <li key={h.id} className="flex items-center gap-3">
                    {h.habit_type === 'boolean' ? (
                      <input type="checkbox" className="h-5 w-5 accent-sky-600" checked={isDone(h, c)} onChange={() => setValue(h, isDone(h, c) ? 0 : 1)} aria-label={h.name} />
                    ) : (
                      <input type="number" min={0} step="any" className="input w-20 py-1" value={c?.value ?? ''} placeholder="0"
                        onChange={(e) => setValue(h, Number(e.target.value))} aria-label={h.name} />
                    )}
                    <div className="min-w-0 flex-1">
                      <div className={`truncate text-sm ${isDone(h, c) ? 'text-slate-400 line-through' : ''}`}>{h.name}</div>
                      <div className="text-xs text-slate-500">
                        {h.schedule_time ? h.schedule_time.slice(0, 5) : 'sem horário'}
                        {h.habit_type !== 'boolean' && (h.target_value != null ? ` · meta ${h.target_value} ${h.unit}` : ` · ${h.unit}`)}
                      </div>
                    </div>
                    <span className="text-xs text-slate-500" title="Sequência">🔥 {currentStreak(h, completions.rows, today)}</span>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      )}

      {tab === 'Hábitos' && (
        <>
          {active.length === 0 && <div className="card"><Empty>Nenhum hábito ainda.</Empty></div>}
          <ul className="grid gap-2 md:grid-cols-2">
            {monthStats.map(({ habit: h, done, scheduled, rate }) => (
              <li key={h.id}>
                <button className="card flex w-full items-center gap-3 text-left" onClick={() => setEditing(h)}>
                  <span className="h-8 w-1.5 rounded" style={{ background: h.color }} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate">{h.name}</div>
                    <div className="text-xs text-slate-500">
                      {h.schedule_days?.length ? h.schedule_days.map(weekdayShort).join(', ') : 'todo dia'}
                      {h.schedule_time && ` · ${h.schedule_time.slice(0, 5)}`} · {done}/{scheduled} no mês
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-semibold">{Math.round(rate * 100)}%</div>
                    <div className="text-xs text-slate-500">🔥 {currentStreak(h, completions.rows, today)}</div>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        </>
      )}

      {tab === 'Calendário' && <MonthGrid habits={active} completions={completions.rows} year={year} month={month} today={today} />}

      {editing && (
        <HabitForm habit={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); void habits.reload(); }} />
      )}
    </>
  );
}

function WeekStrip({ habits, completions, today }: { habits: Habit[]; completions: HabitCompletion[]; today: string }) {
  const start = addDays(today, -weekday(today));
  const days = Array.from({ length: 7 }, (_, i) => addDays(start, i));
  return (
    <div className="card">
      <div className="label mb-3">Sua semana</div>
      <div className="grid grid-cols-7 gap-2">
        {days.map((d) => {
          const due = routineFor(habits, d);
          const done = due.filter((h) => isDone(h, completions.find((c) => c.habit_id === h.id && c.completed_date === d))).length;
          const perfect = due.length > 0 && done === due.length;
          return (
            <div key={d} className={`rounded-xl p-2 text-center ${d === today ? 'bg-sky-50 dark:bg-sky-950' : ''}`}>
              <div className="text-xs text-slate-500">{weekdayShort(weekday(d))}</div>
              <div className={`mx-auto my-1 flex h-9 w-9 items-center justify-center rounded-full text-sm ${perfect ? 'bg-emerald-500 text-white' : 'border border-slate-200 dark:border-slate-700'}`}>
                {Number(d.slice(8))}
              </div>
              <div className="text-xs text-slate-500">{d <= today ? `${done}/${due.length}` : due.length}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function MonthGrid({ habits, completions, year, month, today }: { habits: Habit[]; completions: HabitCompletion[]; year: number; month: number; today: string }) {
  const days = monthDays(year, month);
  return (
    <div className="card overflow-x-auto">
      <table className="text-xs">
        <thead>
          <tr>
            <th className="sticky left-0 bg-white pr-3 text-left font-medium dark:bg-slate-900">Hábito</th>
            {days.map((d) => <th key={d} className="w-6 font-normal text-slate-500">{Number(d.slice(8))}</th>)}
          </tr>
        </thead>
        <tbody>
          {habits.map((h) => (
            <tr key={h.id}>
              <td className="sticky left-0 max-w-48 truncate bg-white py-1 pr-3 dark:bg-slate-900">{h.name}</td>
              {days.map((d) => {
                const scheduled = isScheduledOn(h, d);
                const ok = isDone(h, completions.find((c) => c.habit_id === h.id && c.completed_date === d));
                const cls = ok ? '' : !scheduled ? 'bg-transparent' : d < today ? 'bg-red-100 dark:bg-red-950' : 'bg-slate-100 dark:bg-slate-800';
                return <td key={d} className="p-0.5"><div className={`h-5 w-5 rounded ${cls}`} style={ok ? { background: h.color } : undefined} /></td>;
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function HabitForm({ habit, onClose, onSaved }: { habit: Partial<Habit>; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(habit.name ?? '');
  const [type, setType] = useState<Habit['habit_type']>(habit.habit_type ?? 'boolean');
  const [target, setTarget] = useState<number | null>(habit.id ? habit.target_value ?? null : 1);
  const [unit, setUnit] = useState(habit.unit ?? 'vezes');
  const [days, setDays] = useState<number[]>(habit.schedule_days ?? []);
  const [time, setTime] = useState(habit.schedule_time?.slice(0, 5) ?? '');
  const [color, setColor] = useState(habit.color ?? '#0ea5e9');

  async function save(e: FormEvent) {
    e.preventDefault();
    const row = {
      name, habit_type: type, target_value: type === 'boolean' ? 1 : target, unit,
      schedule_days: days.length ? days : null, schedule_time: time || null, color,
    };
    const ok = habit.id
      ? await write(supabase.from('habits').update(row).eq('id', habit.id))
      : await write(supabase.from('habits').insert(row));
    if (ok) onSaved();
  }
  async function archive() {
    if (habit.id && confirm('Arquivar este hábito? O histórico fica guardado.') &&
      await write(supabase.from('habits').update({ is_archived: true }).eq('id', habit.id))) onSaved();
  }

  return (
    <Modal title={habit.id ? 'Editar hábito' : 'Novo hábito'} onClose={onClose}>
      <form onSubmit={save}>
        <Field label="Nome"><input className="input" value={name} onChange={(e) => setName(e.target.value)} required autoFocus /></Field>
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
        <Field label="Dias (nenhum = todo dia)"><WeekdayPicker value={days} onChange={setDays} /></Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Horário (opcional)"><input className="input" type="time" value={time} onChange={(e) => setTime(e.target.value)} /></Field>
          <Field label="Cor"><input className="input h-10 p-1" type="color" value={color} onChange={(e) => setColor(e.target.value)} /></Field>
        </div>
        <div className="flex gap-2">
          {habit.id && <button type="button" className="btn-ghost text-red-600" onClick={archive}>Arquivar</button>}
          <button className="btn-primary ml-auto">Salvar</button>
        </div>
      </form>
    </Modal>
  );
}
