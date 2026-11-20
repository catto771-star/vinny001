import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight, Bell, Check, CheckSquare } from 'lucide-react';
import { useTable } from '../lib/useTable';
import { formatDay, formatTime, toDay } from '../lib/dates';
import { num, plural } from '../lib/format';
import { bucketTasks, type Task } from '../lib/tasks';
import { isDone, routineFor, type Habit, type HabitCompletion } from '../lib/habits';
import { reminderPanel, type Reminder } from '../lib/reminders';
import { sumNutrients } from '../lib/nutrition';
import { workoutSummary } from '../lib/training';
import { dayHeadline, greeting } from '../lib/today';
import { Empty, Figure, Skeleton } from '../components/ui';
import { useHealth } from './health/useHealth';
import { energyForDay } from './health/energyForDay';

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const WEEKDAY = new Intl.DateTimeFormat('pt-BR', { weekday: 'short' });

/** A bento tile: the whole tile opens its section. */
function Tile({ to, title, meta, className = '', children }: { to: string; title: string; meta?: ReactNode; className?: string; children: ReactNode }) {
  return (
    <Link to={to} className={`card glow group flex min-w-0 flex-col outline-none ${className}`}>
      <div className="mb-4 flex items-center gap-2">
        <h2 className="label mr-auto">{title}</h2>
        {meta}
        <ArrowUpRight size={16} strokeWidth={1.75} className="text-fg3 transition-transform duration-300 ease-out group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-fg" />
      </div>
      {children}
    </Link>
  );
}

/** A thin meter that fills in when the tile appears. */
function Meter({ value, max, tone = 'var(--brand)', thick = false }: { value: number; max: number; tone?: string; thick?: boolean }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div className={`${thick ? 'h-2.5' : 'h-1.5'} overflow-hidden rounded-full bg-raised`} role="presentation">
      <div className="meter-fill h-full rounded-full" style={{ width: `${pct}%`, background: value > max * 1.05 ? 'var(--negative)' : tone }} />
    </div>
  );
}

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
  const done = (x: Habit) => isDone(x, completions.rows.find((c) => c.habit_id === x.id && c.completed_date === today));
  const doneHabits = routine.filter(done).length;
  const panel = reminderPanel(reminders.rows, now);
  const next = [...panel.overdue, ...panel.today, ...panel.thisWeek].slice(0, 4);
  const workout = h.workouts.rows.find((w) => w.date === today);
  const summary = workout ? workoutSummary(workout, h.sets.rows, h.workouts.rows, h.typeById) : null;
  const eaten = sumNutrients(h.foodLogs.rows.filter((l) => l.date === today));
  const { target, dayType } = energyForDay(h, today);

  const loadingTasks = tasks.loading;
  const loadingHabits = habits.loading || completions.loading;
  const loadingFood = h.foodLogs.loading;
  const ready = !loadingTasks && !loadingHabits && !loadingFood;
  const headline = dayHeadline({ tasksLeft: dueToday.length, habitsLeft: routine.length - doneHabits, kcalLeft: target ? target.kcal - eaten.kcal : null });

  return (
    <>
      <header className="mb-8 md:mb-10">
        <p className="label">{greeting(now.getHours())} · {capitalize(formatDay(today))}</p>
        {ready
          ? <h1 className="display mt-3 max-w-[18ch]">{headline}</h1>
          : <div className="mt-4 space-y-3" aria-busy="true" aria-label="Carregando"><Skeleton className="h-10 w-[80%] max-w-xl" /><Skeleton className="h-10 w-[55%] max-w-sm" /></div>}
      </header>

      <div className="stagger grid grid-cols-2 gap-3 md:gap-4 lg:grid-cols-12">
        {/* Calories: the tile that leads the day. */}
        <Tile to="/saude" title="Calorias" className="col-span-2 lg:order-1 lg:col-span-5"
          meta={<span className="text-xs text-fg3">{dayType === 'training' ? 'dia de treino' : 'dia de descanso'}</span>}>
          {loadingFood ? <Skeleton className="h-14 w-40" /> : (
            <div className="flex items-baseline gap-2">
              <Figure value={num(eaten.kcal)} className="text-[clamp(44px,13vw,64px)] leading-none font-medium tracking-[-0.04em]" />
              {target && <span className="figure text-[15px] text-fg3">/ {num(target.kcal)} kcal</span>}
            </div>
          )}
          <p className="mt-2 text-sm text-fg2">
            {!target ? 'Cadastre suas metas em Saúde › Plano.'
              : eaten.kcal <= target.kcal ? `Faltam ${num(target.kcal - eaten.kcal)} kcal para a meta.` : `${num(eaten.kcal - target.kcal)} kcal acima da meta.`}
          </p>
          {target && (
            <>
              <div className="mt-5"><Meter value={eaten.kcal} max={target.kcal} thick /></div>
              <dl className="mt-6 grid grid-cols-3 gap-4">
                {([['Proteína', eaten.protein_g, target.protein_g], ['Carbo', eaten.carbs_g, target.carbs_g], ['Gordura', eaten.fat_g, target.fat_g]] as const).map(([label, value, goal]) => (
                  <div key={label} className="min-w-0">
                    <dt className="text-xs text-fg3">{label}</dt>
                    <dd className="mt-1 whitespace-nowrap"><span className="figure text-[17px] text-fg">{num(value)}</span><span className="figure text-xs text-fg3"> / {num(goal)} g</span></dd>
                    <div className="mt-2"><Meter value={value} max={goal} tone="var(--fg)" /></div>
                  </div>
                ))}
              </dl>
            </>
          )}
        </Tile>

        {/* Habits: one segment per habit of today. */}
        <Tile to="/habitos" title="Hábitos" className="col-span-1 lg:order-3 lg:col-span-4">
          {loadingHabits ? <Skeleton className="h-9 w-20" /> : (
            <Figure value={doneHabits} unit={`de ${routine.length}`} className="text-[34px] leading-none font-medium" />
          )}
          <div className="mt-4 flex gap-1" aria-hidden>
            {(loadingHabits ? [0, 1, 2, 3] : routine).map((x, i) => (
              <span key={typeof x === 'number' ? i : x.id} className={`h-2 flex-1 rounded-full transition-colors duration-500 ${typeof x !== 'number' && done(x) ? 'bg-primary' : 'bg-raised'}`} />
            ))}
          </div>
          {!loadingHabits && (
            <ul className="mt-4 hidden space-y-1.5 text-sm sm:block">
              {routine.slice(0, 4).map((x) => (
                <li key={x.id} className={`flex items-center gap-2 ${done(x) ? 'text-fg3' : 'text-fg'}`}>
                  <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full ${done(x) ? 'bg-primary text-primary-ink' : 'ring-1 ring-line-strong'}`}>{done(x) && <Check size={10} strokeWidth={3} />}</span>
                  <span className="truncate">{x.name}</span>
                </li>
              ))}
            </ul>
          )}
          {!loadingHabits && routine.length > doneHabits && (
            <p className="mt-3 truncate text-xs text-fg3 sm:hidden">Falta: {routine.filter((x) => !done(x)).map((x) => x.name).join(', ')}</p>
          )}
        </Tile>

        {/* Workout */}
        <Tile to="/saude" title="Treino" className="col-span-1 lg:order-4 lg:col-span-3">
          {h.workouts.loading ? <Skeleton className="h-9 w-24" /> : summary ? (
            <>
              <Figure value={num(summary.tonnage)} unit="kg" className="text-[34px] leading-none font-medium" />
              <p className="mt-3 truncate text-sm font-medium">{workout?.title || 'Treino registrado'}</p>
              <p className="mt-0.5 text-xs text-fg3">
                {summary.sets} {plural(summary.sets, 'série', 'séries')}
                {summary.records.length > 0 && <> · <span className="text-brand-ink">{summary.records.length} {plural(summary.records.length, 'recorde', 'recordes')}</span></>}
              </p>
            </>
          ) : (
            <>
              <p className="text-[22px] leading-7 font-semibold tracking-[-0.02em]">{dayType === 'training' ? 'Treino pendente' : 'Descanso'}</p>
              <p className="mt-2 text-xs text-fg3">{dayType === 'training' ? 'Registre as séries em Saúde › Treino.' : 'Recuperação também conta.'}</p>
            </>
          )}
        </Tile>

        {/* Tasks */}
        <Tile to="/tarefas" title="Para hoje" className="col-span-2 lg:order-2 lg:col-span-7"
          meta={!loadingTasks && <span className="figure text-xs text-fg3">{doneToday} de {doneToday + dueToday.length} feitas</span>}>
          {loadingTasks ? (
            <div className="space-y-4">{[70, 52, 64, 44].map((w) => <Skeleton key={w} className="h-4" style={{ width: `${w}%` }} />)}</div>
          ) : dueToday.length === 0 ? <Empty icon={<CheckSquare size={18} strokeWidth={1.5} />}>Nenhuma tarefa para hoje</Empty> : (
            <ul className="-my-1">
              {dueToday.slice(0, 6).map((t) => {
                const late = b.overdue.includes(t);
                return (
                  <li key={t.id} className="flex items-center gap-3 border-b border-line py-3 text-[15px] last:border-0">
                    <span className={`h-2 w-2 shrink-0 rounded-full ${t.priority === 'high' ? 'bg-negative' : t.priority === 'medium' ? 'bg-brand' : 'bg-fg3/40'}`} aria-hidden />
                    <span className="mr-auto truncate">{t.title}</span>
                    {late ? <span className="shrink-0 rounded-full bg-negative/10 px-2 py-0.5 text-xs font-medium text-negative">atrasada</span>
                      : t.due_date && !t.due_all_day && <span className="figure shrink-0 text-xs text-fg3">{formatTime(t.due_date)}</span>}
                  </li>
                );
              })}
            </ul>
          )}
        </Tile>

        {/* Next reminders */}
        <Tile to="/lembretes" title="A seguir" className="col-span-2 lg:order-5 lg:col-span-5">
          {reminders.loading ? (
            <div className="space-y-3">{[60, 45, 52].map((w) => <Skeleton key={w} className="h-4" style={{ width: `${w}%` }} />)}</div>
          ) : next.length === 0 ? <Empty icon={<Bell size={18} strokeWidth={1.5} />}>Nenhum lembrete pendente</Empty> : (
            <ol className="relative space-y-3 border-l border-line-strong pl-4">
              {next.map((r) => {
                const late = panel.overdue.includes(r);
                return (
                  <li key={r.id} className="relative flex items-baseline gap-3 text-[15px]">
                    <span className={`absolute top-[7px] -left-[21px] h-2 w-2 rounded-full ring-4 ring-surface ${late ? 'bg-negative' : 'bg-brand'}`} aria-hidden />
                    <span className={`figure w-[74px] shrink-0 text-[13px] ${late ? 'text-negative' : 'text-fg3'}`}>
                      {toDay(new Date(r.datetime)) !== today && <span className="mr-1">{WEEKDAY.format(new Date(r.datetime)).replace('.', '')}</span>}{formatTime(r.datetime)}
                    </span>
                    <span className="truncate">{r.title}</span>
                  </li>
                );
              })}
            </ol>
          )}
        </Tile>
      </div>
    </>
  );
}
