import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight, Bell, Check, CheckSquare, FolderKanban, Target } from 'lucide-react';
import { useTable } from '../lib/useTable';
import { formatDay, formatTime, toDay } from '../lib/dates';
import { num, plural } from '../lib/format';
import { bucketTasks, type Task } from '../lib/tasks';
import { isDone, routineFor, type Habit, type HabitCompletion } from '../lib/habits';
import { reminderPanel, type Reminder } from '../lib/reminders';
import { sumNutrients } from '../lib/nutrition';
import { workoutSummary } from '../lib/training';
import { goalRows, projectRows } from '../lib/homeProgress';
import { PACE_LABEL, currentValue, type Goal, type GoalEntry } from '../lib/goals';
import { HEALTH_LABEL, projectProgress } from '../lib/projects';
import { bankBalance, type Bank, type InvoicePayment, type Transfer, type Tx } from '../lib/finance';
import { calorieStatus, dayHeadline, greeting } from '../lib/today';
import { Empty, Figure, Skeleton } from '../components/ui';
import { useProjects } from './projects/useProjects';
import { HEALTH_TONE } from './projects/Projects';
import { PACE_TONE } from './Goals';
import { useHealth } from './health/useHealth';
import { energyForDay } from './health/energyForDay';

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const WEEKDAY = new Intl.DateTimeFormat('pt-BR', { weekday: 'short' });
const CAL_TONE = {
  empty: 'bg-raised text-fg2',
  deficit: 'bg-positive/10 text-positive',
  goal: 'bg-positive/10 text-positive',
  surplus: 'bg-warning/10 text-warning',
} as const;

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
  const projects = useProjects();
  const goals = useTable<Goal>('goals', '*', { column: 'created_at' });
  const entries = useTable<GoalEntry>('goal_entries', '*', { column: 'date' });
  const banks = useTable<Bank>('banks');
  const txs = useTable<Tx>('transactions');
  const transfers = useTable<Transfer>('transfers');
  const payments = useTable<InvoicePayment>('card_invoice_payments');
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
  const cal = calorieStatus(eaten.kcal, target?.kcal ?? 0);

  const projectPct = (id: string) => projectProgress(projects.tasksOf(id), projects.stepsOf(id)).pct;
  const projectList = projectRows(projects.projects.rows, (p) => projectPct(p.id), today);
  const goalList = goalRows(goals.rows, (g) => {
    const bank = banks.rows.find((b) => b.id === g.linked_bank_id);
    return currentValue(g, {
      entries: entries.rows, habits: habits.rows, completions: completions.rows,
      projectPct: g.linked_project_id ? projectPct(g.linked_project_id) : undefined,
      bankBalance: bank ? bankBalance(bank, txs.rows, transfers.rows, payments.rows) : undefined,
    });
  }, today);
  const loadingProjects = projects.projects.loading || projects.tasks.loading || projects.steps.loading || projects.links.loading;
  const loadingGoals = goals.loading || entries.loading || banks.loading || txs.loading;

  const loadingTasks = tasks.loading;
  const loadingHabits = habits.loading || completions.loading;
  const loadingFood = h.foodLogs.loading;
  const ready = !loadingTasks && !loadingHabits && !loadingFood;
  const headline = dayHeadline({ tasksLeft: dueToday.length, habitsLeft: routine.length - doneHabits, kcalLeft: target ? target.kcal - eaten.kcal : null });

  return (
    <>
      <header className="mb-7 md:mb-8">
        <p className="label">{greeting(now.getHours())} · {capitalize(formatDay(today))}</p>
        {ready
          ? <h1 className="mt-2 max-w-[46ch] text-[20px] leading-7 font-medium tracking-[-0.02em] text-fg md:text-[24px] md:leading-8">{headline}</h1>
          : <div className="mt-3" aria-busy="true" aria-label="Carregando"><Skeleton className="h-6 w-[70%] max-w-md" /></div>}
      </header>

      <div className="stagger grid grid-cols-2 gap-3 md:gap-4 lg:grid-cols-12">
        {/* Calories: a compact read of the day, in four lines. */}
        <Tile to="/saude" title="Calorias" className="col-span-2 lg:order-2 lg:col-span-4"
          meta={<span className="text-xs text-fg3">{dayType === 'training' ? 'dia de treino' : 'dia de descanso'}</span>}>
          {loadingFood ? <div className="space-y-3"><Skeleton className="h-8 w-40" /><Skeleton className="h-3.5 w-28" /><Skeleton className="h-3 w-24" /></div> : !target ? (
            <>
              <Figure value={num(eaten.kcal)} unit="kcal" className="text-[28px] leading-8 font-medium" />
              <p className="mt-2 text-sm text-fg2">Cadastre suas metas em Saúde › Plano.</p>
            </>
          ) : (
            <>
              <div className="flex items-baseline gap-1.5">
                <Figure value={num(eaten.kcal)} className="text-[28px] leading-8 font-medium tracking-[-0.03em]" />
                <span className="figure text-sm text-fg3">/ {num(target.kcal)} kcal</span>
              </div>
              <div className="mt-3"><Meter value={eaten.kcal} max={target.kcal} /></div>
              <p className="mt-3 text-sm font-medium">{cal.done}</p>
              <p className="mt-0.5 text-xs text-fg3">{cal.rest}</p>
              <p className={`mt-3 inline-flex items-center rounded-full px-3 py-1 text-xs font-medium ${CAL_TONE[cal.state]}`}>{cal.verdict}</p>
              <p className="figure mt-4 text-xs text-fg3">
                P {num(eaten.protein_g)}/{num(target.protein_g)} · C {num(eaten.carbs_g)}/{num(target.carbs_g)} · G {num(eaten.fat_g)}/{num(target.fat_g)} g
              </p>
            </>
          )}
        </Tile>

        {/* Habits: one segment per habit of today. */}
        <Tile to="/habitos" title="Hábitos" className="col-span-1 lg:order-3 lg:col-span-4">
          {loadingHabits ? <Skeleton className="h-9 w-20" /> : (
            <Figure value={doneHabits} unit={`de ${routine.length}`} className="text-[28px] leading-8 font-medium" />
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
              <Figure value={num(summary.tonnage)} unit="kg" className="text-[28px] leading-8 font-medium" />
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
        <Tile to="/tarefas" title="Para hoje" className="col-span-2 lg:order-1 lg:col-span-8"
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

        {/* Projects in motion */}
        <Tile to="/projetos" title="Projetos" className="col-span-2 lg:order-6 lg:col-span-6"
          meta={projectList.more > 0 && <span className="text-xs text-fg3">+{projectList.more} em andamento</span>}>
          {loadingProjects ? (
            <div className="space-y-5">{[0, 1].map((i) => <div key={i} className="space-y-2"><Skeleton className="h-4 w-1/2" /><Skeleton className="h-1.5 w-full" /></div>)}</div>
          ) : projectList.rows.length === 0 ? <Empty icon={<FolderKanban size={18} strokeWidth={1.5} />}>Nenhum projeto em andamento</Empty> : (
            <ul className="space-y-5">
              {projectList.rows.map((r) => (
                <li key={r.id}>
                  <div className="mb-2 flex items-baseline gap-3">
                    <span className="mr-auto truncate text-[15px] font-medium">{r.name}</span>
                    <span className="figure text-sm">{r.pct}%</span>
                  </div>
                  <Meter value={r.pct} max={100} tone={r.color} />
                  <p className="mt-1.5 text-xs text-fg3">
                    <span className={HEALTH_TONE[r.health]}>{HEALTH_LABEL[r.health]}</span>
                    {r.dueText && <> · prazo {r.dueText}{r.daysLeft != null && r.daysLeft >= 0 && <> ({r.daysLeft} {plural(r.daysLeft, 'dia', 'dias')})</>}</>}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Tile>

        {/* Goals in motion */}
        <Tile to="/metas" title="Metas" className="col-span-2 lg:order-7 lg:col-span-6"
          meta={goalList.more > 0 && <span className="text-xs text-fg3">+{goalList.more} ativas</span>}>
          {loadingGoals ? (
            <div className="space-y-5">{[0, 1].map((i) => <div key={i} className="space-y-2"><Skeleton className="h-4 w-1/2" /><Skeleton className="h-1.5 w-full" /></div>)}</div>
          ) : goalList.rows.length === 0 ? <Empty icon={<Target size={18} strokeWidth={1.5} />}>Nenhuma meta ativa</Empty> : (
            <ul className="space-y-5">
              {goalList.rows.map((r) => (
                <li key={r.id}>
                  <div className="mb-2 flex items-baseline gap-3">
                    <span className="mr-auto truncate text-[15px] font-medium">{r.title}</span>
                    <span className="figure text-sm">{r.pct}%</span>
                  </div>
                  <Meter value={r.pct} max={100} tone="var(--brand)" />
                  <p className="mt-1.5 text-xs text-fg3">
                    <span className={PACE_TONE[r.pace]}>{PACE_LABEL[r.pace]}</span>
                    {r.valueText && <>{' · '}<span className="figure">{r.valueText}</span></>}
                    {r.dueText && <> · até {r.dueText}</>}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Tile>
      </div>
    </>
  );
}
