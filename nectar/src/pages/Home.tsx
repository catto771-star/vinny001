import { Link } from 'react-router-dom';
import { ArrowUpRight, Bell, CheckSquare } from 'lucide-react';
import { useTable } from '../lib/useTable';
import { formatDay, formatTime, toDay } from '../lib/dates';
import { num } from '../lib/format';
import { bucketTasks, type Task } from '../lib/tasks';
import { isDone, routineFor, type Habit, type HabitCompletion } from '../lib/habits';
import { reminderPanel, type Reminder } from '../lib/reminders';
import { sumNutrients } from '../lib/nutrition';
import { workoutSummary } from '../lib/training';
import { TargetBar } from '../components/Charts';
import { Empty, Stat } from '../components/ui';
import { useHealth } from './health/useHealth';
import { energyForDay } from './health/energyForDay';

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export default function Home() {
  const tasks = useTable<Task>('tasks');
  const habits = useTable<Habit>('habits');
  const completions = useTable<HabitCompletion>('habit_completions', 'id,habit_id,completed_date,value');
  const reminders = useTable<Reminder>('reminders', '*', { column: 'datetime' });
  const h = useHealth();
  const now = new Date();
  const today = toDay(now);

  const b = bucketTasks(tasks.rows, now);
  const dueToday = [...b.overdue, ...b.today];
  const doneToday = b.done.filter((t) => t.completed_at && toDay(new Date(t.completed_at)) === today).length;
  const routine = routineFor(habits.rows, today, completions.rows);
  const doneHabits = routine.filter((x) => isDone(x, completions.rows.find((c) => c.habit_id === x.id && c.completed_date === today))).length;
  const panel = reminderPanel(reminders.rows, now);
  const next = [...panel.overdue, ...panel.today, ...panel.thisWeek].slice(0, 5);
  const workout = h.workouts.rows.find((w) => w.date === today);
  const tonnage = workout ? workoutSummary(workout, h.sets.rows, h.workouts.rows, h.typeById).tonnage : null;
  const eaten = sumNutrients(h.foodLogs.rows.filter((l) => l.date === today));
  const { target } = energyForDay(h, today);

  return (
    <>
      <header className="mb-6">
        <h1 className="text-[28px] leading-8 font-medium tracking-[-0.01em]">{capitalize(formatDay(today))}</h1>
        <p className="mt-1 text-sm text-fg3">Placar do dia</p>
      </header>

      <section className="card mb-6 grid grid-cols-2 gap-6 lg:grid-cols-4">
        <Stat label="Calorias" value={num(eaten.kcal)} unit={target ? `/ ${num(target.kcal)} kcal` : 'kcal'} accent loading={h.foodLogs.loading}
          hint={target ? (eaten.kcal <= target.kcal ? `faltam ${num(target.kcal - eaten.kcal)} kcal` : `${num(eaten.kcal - target.kcal)} kcal acima`) : 'sem meta cadastrada'} />
        <Stat label="Tarefas" value={doneToday} unit={`/ ${doneToday + dueToday.length}`} loading={tasks.loading} hint={b.overdue.length ? `${b.overdue.length} atrasadas` : 'nada atrasado'} />
        <Stat label="Hábitos" value={doneHabits} unit={`/ ${routine.length}`} loading={habits.loading || completions.loading} hint="feitos hoje" />
        <Stat label="Treino" value={tonnage === null ? '—' : num(tonnage)} unit={tonnage === null ? undefined : 'kg'} loading={h.workouts.loading} hint={workout ? (workout.title || 'treino registrado') : 'nenhum treino hoje'} />
      </section>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <section className="card">
          <div className="mb-3 flex items-center">
            <h2 className="mr-auto font-medium">Para hoje</h2>
            <Link to="/tarefas" className="btn-ghost">Tarefas<ArrowUpRight size={16} strokeWidth={1.5} /></Link>
          </div>
          {dueToday.length === 0
            ? <Empty icon={<CheckSquare size={18} strokeWidth={1.5} />}>Nenhuma tarefa para hoje</Empty>
            : (
              <ul className="divide-y divide-line">
                {dueToday.slice(0, 8).map((t) => (
                  <li key={t.id} className="flex items-center gap-3 py-2.5 text-sm">
                    <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${t.priority === 'high' ? 'bg-negative' : t.priority === 'medium' ? 'bg-brand' : 'bg-fg3'}`} />
                    <span className="mr-auto truncate">{t.title}</span>
                    {b.overdue.includes(t) ? <span className="text-xs text-negative">atrasada</span> : t.due_date && !t.due_all_day && <span className="figure text-xs text-fg3">{formatTime(t.due_date)}</span>}
                  </li>
                ))}
              </ul>
            )}
        </section>

        <div className="space-y-6">
          <section className="card">
            <div className="mb-3 flex items-center">
              <h2 className="mr-auto font-medium">A seguir</h2>
              <Link to="/lembretes" className="icon-btn" aria-label="Abrir lembretes"><ArrowUpRight size={16} strokeWidth={1.5} /></Link>
            </div>
            {next.length === 0 ? <Empty icon={<Bell size={18} strokeWidth={1.5} />}>Nenhum lembrete pendente</Empty> : (
              <ul className="space-y-2 text-sm">
                {next.map((r) => (
                  <li key={r.id} className="flex gap-3">
                    <span className={`figure w-12 shrink-0 ${panel.overdue.includes(r) ? 'text-negative' : 'text-fg3'}`}>{formatTime(r.datetime)}</span>
                    <span className="truncate">{r.title}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
          {target && (
            <section className="card">
              <div className="mb-4 flex items-center">
                <h2 className="mr-auto font-medium">Macros</h2>
                <Link to="/saude" className="icon-btn" aria-label="Abrir saúde"><ArrowUpRight size={16} strokeWidth={1.5} /></Link>
              </div>
              <TargetBar label="Proteína" consumed={eaten.protein_g} target={target.protein_g} unit="g" />
              <TargetBar label="Carboidrato" consumed={eaten.carbs_g} target={target.carbs_g} unit="g" />
              <TargetBar label="Gordura" consumed={eaten.fat_g} target={target.fat_g} unit="g" />
            </section>
          )}
        </div>
      </div>
    </>
  );
}
