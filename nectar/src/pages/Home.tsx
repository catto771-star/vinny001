import { useEffect, useRef, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight, Bell, Check, CheckSquare, Compass, FolderKanban, Plus, Search, Target, Wallet } from 'lucide-react';
import { useTable, queuedWrite } from '../lib/useTable';
import { latestPerKey } from '../lib/serial';
import { formatDay, formatTime, toDay } from '../lib/dates';
import { num, plural } from '../lib/format';
import { money } from '../lib/money';
import { bucketTasks, type Task } from '../lib/tasks';
import { isDone, routineFor, type Habit, type HabitCompletion } from '../lib/habits';
import { reminderPanel, type Reminder } from '../lib/reminders';
import { sumNutrients } from '../lib/nutrition';
import { weeklyStats, workoutSummary } from '../lib/training';
import { goalRows, nextHabitQuickValue, projectRows } from '../lib/homeProgress';
import { PACE_LABEL, currentValue, sumLinkedAccountsInGoalCurrency, type Goal, type GoalEntry } from '../lib/goals';
import { HEALTH_LABEL, projectProgress } from '../lib/projects';
import { bankBalance, netWorth, netWorthHistory, type Bank, type InvoicePayment, type Transfer, type Tx } from '../lib/finance';
import { seriesDelta } from '../lib/charts';
import { calorieStatus, dayHeadline, greeting } from '../lib/today';
import { DeltaBadge, ProgressRing, SegmentedMeter, Sparkline } from '../components/Charts';
import { Empty, Figure, Skeleton } from '../components/ui';
import { openQuickCapture } from '../components/QuickCaptureModal';
import { openCommandPalette } from '../components/CommandPalette';
import { openGuidedReview } from '../components/ReviewModal';
import { useProjects } from './projects/useProjects';
import { useRates } from './finance/useRates';
import { HEALTH_TONE } from './projects/Projects';
import { PACE_TONE } from './Goals';
import { useHealth } from './health/useHealth';
import { energyForDay } from './health/energyForDay';

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const WEEKDAY = new Intl.DateTimeFormat('pt-BR', { weekday: 'short' });
const CAL_TONE = {
  empty: 'bg-raised text-fg2',
  deficit: 'bg-positive/12 text-positive',
  goal: 'bg-positive/12 text-positive',
  surplus: 'bg-warning/12 text-warning',
} as const;

/** A bento tile whose header opens the full section, allowing direct interactive actions inside. */
function Tile({ to, title, meta, className = '', children }: { to: string; title: string; meta?: ReactNode; className?: string; children: ReactNode }) {
  return (
    <section className={`card glow flex min-w-0 flex-col ${className}`}>
      <Link
        to={to}
        className="group -mx-1 -mt-1 mb-3 flex items-center gap-2 rounded-lg px-1 py-1 focus-visible:ring-2 focus-visible:ring-brand"
      >
        <h2 className="label mr-auto">{title}</h2>
        {meta}
        <ArrowUpRight size={15} strokeWidth={1.75} aria-hidden="true" className="text-fg3 transition-transform duration-200 ease-out group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-fg" />
      </Link>
      {children}
    </section>
  );
}

export default function Home() {
  const tasks = useTable<Task>('tasks');
  const habits = useTable<Habit>('habits');
  const completions = useTable<HabitCompletion>('habit_completions', 'id,habit_id,completed_date,value');
  const reminders = useTable<Reminder>('reminders', '*', { column: 'datetime' });
  const h = useHealth();
  const projects = useProjects();
  const fx = useRates(null); // today's rates value euro and dollar accounts and multi-currency goals
  const goals = useTable<Goal>('goals', '*', { column: 'created_at' });
  const entries = useTable<GoalEntry>('goal_entries', '*', { column: 'date' });
  const banks = useTable<Bank>('banks');
  const txs = useTable<Tx>('transactions');
  const transfers = useTable<Transfer>('transfers');
  const payments = useTable<InvoicePayment>('card_invoice_payments');
  const habitQueue = useRef(latestPerKey()).current;
  const now = new Date();
  const today = toDay(now);
  const curYear = now.getFullYear();
  const curMonth = now.getMonth() + 1;

  useEffect(() => {
    const refresh = () => {
      void tasks.reload();
      void habits.reload();
      void completions.reload();
      void reminders.reload();
      void txs.reload();
    };
    window.addEventListener('painel-data-changed', refresh);
    return () => window.removeEventListener('painel-data-changed', refresh);
  }, [tasks.reload, habits.reload, completions.reload, reminders.reload, txs.reload]);

  async function toggleTask(task: Task) {
    const completed = !task.completed;
    const completed_at = completed ? new Date().toISOString() : null;
    tasks.setRows((rows) => rows.map((t) => (t.id === task.id ? { ...t, completed, completed_at } : t)));
    const res = await queuedWrite({
      table: 'tasks',
      op: 'update',
      payload: { completed, status: completed ? 'completed' : 'pending', completed_at },
      match: { id: task.id },
      label: task.title,
    });
    if (res === 'saved') void tasks.reload();
  }

  function quickHabit(habit: Habit) {
    const existing = completions.rows.find((c) => c.habit_id === habit.id && c.completed_date === today);
    const nextVal = nextHabitQuickValue(habit, existing?.value ?? 0);
    completions.setRows((list) => {
      const others = list.filter((c) => !(c.habit_id === habit.id && c.completed_date === today));
      return nextVal > 0
        ? [...others, { id: existing?.id ?? `new-${habit.id}-${today}`, habit_id: habit.id, completed_date: today, value: nextVal }]
        : others;
    });
    void habitQueue(`${habit.id}|${today}`, async () => {
      const res = nextVal <= 0
        ? await queuedWrite({ table: 'habit_completions', op: 'delete', match: { habit_id: habit.id, completed_date: today }, label: habit.name })
        : await queuedWrite({ table: 'habit_completions', op: 'upsert', payload: { habit_id: habit.id, completed_date: today, value: nextVal }, onConflict: 'habit_id,completed_date', label: habit.name });
      if (res === 'saved' && !habitQueue.busy()) void completions.reload();
    });
  }

  async function toggleReminder(r: Reminder) {
    reminders.setRows((rows) => rows.map((x) => (x.id === r.id ? { ...x, completed: !r.completed } : x)));
    const res = await queuedWrite({
      table: 'reminders',
      op: 'update',
      payload: { completed: !r.completed },
      match: { id: r.id },
      label: r.title,
    });
    if (res === 'saved') void reminders.reload();
  }

  const b = bucketTasks(tasks.rows, now);
  const dueToday = [...b.overdue, ...b.today];
  const doneToday = b.done.filter((t) => t.completed_at && toDay(new Date(t.completed_at)) === today).length;
  const routine = routineFor(habits.rows, today, completions.rows);
  const completionOf = (x: Habit) => completions.rows.find((c) => c.habit_id === x.id && c.completed_date === today);
  const done = (x: Habit) => isDone(x, completionOf(x));
  const doneHabits = routine.filter(done).length;
  const panel = reminderPanel(reminders.rows, now);
  const next = [...panel.overdue, ...panel.today, ...panel.thisWeek].slice(0, 4);
  const workout = h.workouts.rows.find((w) => w.date === today);
  const summary = workout ? workoutSummary(workout, h.sets.rows, h.workouts.rows, h.typeById) : null;
  const weekTraining = weeklyStats(today, 6, h.sets.rows, h.workouts.rows, h.typeById);
  const curWeekTraining = weekTraining.at(-1);
  const workoutSpark = weekTraining.map((w) => w.tonnage);
  const eaten = sumNutrients(h.foodLogs.rows.filter((l) => l.date === today));
  const { target, dayType } = energyForDay(h, today);
  const cal = calorieStatus(eaten.kcal, target?.kcal ?? 0);

  const worth = netWorth(banks.rows, txs.rows, transfers.rows, payments.rows, today);
  const worthSeries = netWorthHistory(banks.rows, txs.rows, transfers.rows, payments.rows, curYear, curMonth, 6, today);
  const worthDelta = seriesDelta(worthSeries.map((p) => ({ label: p.key, value: p.value })));

  const totalActions = doneToday + dueToday.length + routine.length;
  const completedActions = doneToday + doneHabits;
  const dayExecPct = totalActions > 0 ? Math.round((completedActions / totalActions) * 100) : 100;

  const projectPct = (id: string) => projectProgress(projects.tasksOf(id), projects.stepsOf(id)).pct;
  const projectList = projectRows(projects.projects.rows, (p) => projectPct(p.id), today);
  const bankById = new Map(banks.rows.map((x) => [x.id, x]));
  const balanceBrlOf = (id: string) => {
    const bank = bankById.get(id);
    return bank ? bankBalance(bank, txs.rows, transfers.rows, payments.rows) : 0;
  };
  const goalList = goalRows(goals.rows, (g) => currentValue(g, {
    entries: entries.rows, habits: habits.rows, completions: completions.rows,
    projectPct: g.linked_project_id ? projectPct(g.linked_project_id) : undefined,
    bankBalance: sumLinkedAccountsInGoalCurrency(g, banks.rows, balanceBrlOf, fx.rates),
  }), today);
  const loadingProjects = projects.projects.loading || projects.tasks.loading || projects.steps.loading || projects.links.loading;
  const loadingGoals = goals.loading || entries.loading || banks.loading || txs.loading;
  const loadingFinance = banks.loading || txs.loading;

  const loadingTasks = tasks.loading;
  const loadingHabits = habits.loading || completions.loading;
  const loadingFood = h.foodLogs.loading;
  const ready = !loadingTasks && !loadingHabits && !loadingFood;
  const headline = dayHeadline({ tasksLeft: dueToday.length, habitsLeft: routine.length - doneHabits, kcalLeft: target ? target.kcal - eaten.kcal : null });

  return (
    <>
      <header className="mb-7 flex flex-wrap items-end justify-between gap-4 md:mb-8">
        <div className="min-w-0">
          <p className="label">{greeting(now.getHours())} · {capitalize(formatDay(today))}</p>
          {ready
            ? <h1 className="mt-1.5 max-w-[46ch] text-[22px] leading-7 font-semibold tracking-[-0.025em] text-fg md:text-[26px] md:leading-8">{headline}</h1>
            : <div className="mt-3" aria-busy="true" aria-label="Carregando"><Skeleton className="h-6 w-[70%] max-w-md" /></div>}
        </div>
        <div className="flex flex-wrap items-center gap-2" aria-label="Ações rápidas">
          <button type="button" className="btn-primary h-10 px-3.5 md:h-9" onClick={() => openQuickCapture('task')}>
            <Plus size={15} strokeWidth={1.75} aria-hidden="true" />Tarefa
          </button>
          <button type="button" className="btn-secondary h-10 px-3.5 md:h-9" onClick={() => openQuickCapture('money')}>
            <Wallet size={15} strokeWidth={1.6} aria-hidden="true" />Gasto
          </button>
          <button type="button" className="btn-secondary h-10 px-3.5 md:h-9" onClick={() => openGuidedReview('daily')}>
            <Compass size={15} strokeWidth={1.6} aria-hidden="true" />Revisão
          </button>
          <button type="button" className="icon-btn h-10 w-10 bg-surface md:hidden" onClick={openCommandPalette} aria-label="Buscar ou executar comando">
            <Search size={17} strokeWidth={1.6} aria-hidden="true" />
          </button>
        </div>
      </header>

      {/* Top visual KPI bento strip */}
      <div className="stagger mb-5 grid grid-cols-1 gap-3 sm:grid-cols-2 md:gap-4 xl:grid-cols-4">
        {/* 1. Daily Execution Ring */}
        <Tile to="/habitos" title="Ritmo de hoje" className="justify-between">
          {!ready ? <Skeleton className="h-14 w-full" /> : (
            <div className="flex items-center gap-4">
              <ProgressRing pct={dayExecPct} size={62} strokeWidth={5.5} tone={dayExecPct >= 100 ? 'var(--positive)' : 'var(--brand)'} />
              <div className="min-w-0 flex-1">
                <div className="figure text-lg font-semibold">{completedActions} <span className="text-xs font-normal text-fg3">de {totalActions}</span></div>
                <p className="mt-0.5 text-xs text-fg3">{doneToday} {plural(doneToday, 'tarefa', 'tarefas')} · {doneHabits} {plural(doneHabits, 'hábito', 'hábitos')}</p>
                <div className="mt-2.5">
                  <SegmentedMeter pct={dayExecPct} segments={12} height={6} tone={dayExecPct >= 100 ? 'var(--positive)' : 'var(--brand)'} label="Ritmo do dia" />
                </div>
              </div>
            </div>
          )}
        </Tile>

        {/* 2. Net Worth + 6-month Sparkline */}
        <Tile
          to="/financas"
          title="Patrimônio"
          meta={!loadingFinance && worthDelta && worthDelta.diff !== 0 && <DeltaBadge pct={worthDelta.pct} diff={worthDelta.diff} />}
          className="justify-between"
        >
          {loadingFinance ? <Skeleton className="h-14 w-full" /> : (
            <div className="flex flex-col gap-2">
              <Figure value={money(worth)} className="block text-[22px] leading-7 font-semibold" />
              <div className="flex items-end justify-between gap-2">
                <p className="text-xs text-fg3">
                  {banks.rows.length} {plural(banks.rows.length, 'conta', 'contas')} · 6 meses
                </p>
                {worthSeries.some((p) => p.value !== 0) && (
                  <Sparkline
                    values={worthSeries.map((p) => p.value)}
                    width={76}
                    height={26}
                    tone={worthDelta && worthDelta.diff < 0 ? 'var(--negative)' : 'var(--positive)'}
                  />
                )}
              </div>
            </div>
          )}
        </Tile>

        {/* 3. Calories ProgressRing + Macros */}
        <Tile
          to="/saude"
          title="Calorias"
          meta={<span className="text-xs text-fg3">{dayType === 'training' ? 'treino' : 'descanso'}</span>}
          className="justify-between"
        >
          {loadingFood ? <Skeleton className="h-14 w-full" /> : !target ? (
            <div className="flex items-center justify-between gap-3">
              <div>
                <Figure value={num(eaten.kcal)} unit="kcal" className="text-[22px] leading-7 font-semibold" />
                <p className="mt-1 text-xs text-fg3">Defina metas em Saúde › Plano</p>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-3.5">
              <ProgressRing
                pct={cal.pct}
                size={62}
                strokeWidth={5.5}
                tone={cal.state === 'surplus' ? 'var(--warning)' : cal.state === 'goal' ? 'var(--positive)' : 'var(--brand)'}
                label={`${Math.round(cal.pct)}%`}
              />
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-1">
                  <Figure value={num(eaten.kcal)} className="text-base font-semibold" />
                  <span className="figure text-xs text-fg3">/ {num(target.kcal)} kcal</span>
                </div>
                <span className={`mt-1 inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium ${CAL_TONE[cal.state]}`}>
                  {cal.verdict}
                </span>
                <p className="figure mt-1.5 truncate text-[11px] text-fg3">
                  P {num(eaten.protein_g)}g · C {num(eaten.carbs_g)}g · G {num(eaten.fat_g)}g
                </p>
              </div>
            </div>
          )}
        </Tile>

        {/* 4. Workout + Weekly Volume Sparkline */}
        <Tile
          to="/saude"
          title="Treino"
          meta={!h.workouts.loading && curWeekTraining && <span className="figure text-xs text-fg3">{curWeekTraining.sessions} na semana</span>}
          className="justify-between"
        >
          {h.workouts.loading ? <Skeleton className="h-14 w-full" /> : (
            <div className="flex items-end justify-between gap-3">
              <div className="min-w-0">
                {summary ? (
                  <>
                    <Figure value={num(summary.tonnage)} unit="kg" className="text-[22px] leading-7 font-semibold" />
                    <p className="mt-1 truncate text-xs text-fg3">
                      {workout?.title || 'Treino'} · {summary.sets} {plural(summary.sets, 'série', 'séries')}
                      {summary.records.length > 0 && <> · <span className="text-brand-ink">{summary.records.length} PR</span></>}
                    </p>
                  </>
                ) : (
                  <>
                    <p className="text-[19px] leading-6 font-semibold tracking-[-0.02em]">
                      {dayType === 'training' ? 'Treino pendente' : 'Dia de descanso'}
                    </p>
                    <p className="mt-1 truncate text-xs text-fg3">
                      {curWeekTraining && curWeekTraining.tonnage > 0
                        ? `${num(curWeekTraining.tonnage)} kg nesta semana`
                        : dayType === 'training' ? 'Registre em Saúde › Treino' : 'Recuperação também conta'}
                    </p>
                  </>
                )}
              </div>
              {workoutSpark.some((v) => v > 0) && <Sparkline values={workoutSpark} width={78} height={34} tone="var(--brand)" />}
            </div>
          )}
        </Tile>
      </div>

      {/* Main interactive bento workspace */}
      <div className="stagger grid grid-cols-1 gap-3 md:gap-4 lg:grid-cols-12">
        {/* Tasks: interactive completion directly from Home. */}
        <Tile to="/tarefas" title="Para hoje" className="lg:col-span-8"
          meta={!loadingTasks && <span className="figure text-xs text-fg3">{doneToday} de {doneToday + dueToday.length} feitas</span>}>
          {loadingTasks ? (
            <div className="space-y-4">{[70, 52, 64, 44].map((w) => <Skeleton key={w} className="h-4" style={{ width: `${w}%` }} />)}</div>
          ) : dueToday.length === 0 ? (
            <Empty
              icon={<CheckSquare size={18} strokeWidth={1.5} />}
              action={<button type="button" className="btn-secondary" onClick={() => openQuickCapture('task')}>Adicionar tarefa</button>}
            >
              Nenhuma tarefa para hoje
            </Empty>
          ) : (
            <ul className="-my-1">
              {dueToday.slice(0, 6).map((t) => {
                const late = b.overdue.includes(t);
                return (
                  <li key={t.id} className="flex items-center gap-3 border-b border-line py-2.5 text-[15px] last:border-0">
                    <input
                      type="checkbox"
                      className="h-5 w-5 shrink-0 cursor-pointer"
                      checked={t.completed}
                      onChange={() => void toggleTask(t)}
                      aria-label={`Concluir ${t.title}`}
                    />
                    <span className={`h-2 w-2 shrink-0 rounded-full ${t.priority === 'high' ? 'bg-negative' : t.priority === 'medium' ? 'bg-brand' : 'bg-fg3/40'}`} aria-hidden />
                    <Link to="/tarefas" className="mr-auto min-w-0 truncate hover:underline">{t.title}</Link>
                    {late ? <span className="badge bg-negative/12 text-negative">atrasada</span>
                      : t.due_date && !t.due_all_day && <span className="figure shrink-0 text-xs text-fg3">{formatTime(t.due_date)}</span>}
                  </li>
                );
              })}
            </ul>
          )}
        </Tile>

        {/* Habits: interactive 1-tap check directly from Home. */}
        <Tile
          to="/habitos"
          title="Hábitos"
          className="lg:col-span-4"
          meta={!loadingHabits && <span className="figure text-xs text-fg3">{doneHabits}/{routine.length}</span>}
        >
          {loadingHabits ? <Skeleton className="h-9 w-20" /> : (
            <>
              <div className="mb-3">
                <SegmentedMeter
                  pct={routine.length ? (doneHabits / routine.length) * 100 : 0}
                  segments={Math.min(18, Math.max(8, routine.length || 8))}
                  height={8}
                  tone={doneHabits === routine.length && routine.length > 0 ? 'var(--positive)' : 'var(--brand)'}
                  label="Hábitos concluídos hoje"
                />
              </div>
              {routine.length > 0 && (
                <ul className="space-y-0.5 text-sm">
                  {routine.slice(0, 5).map((x) => {
                    const isComplete = done(x);
                    const c = completionOf(x);
                    const val = c?.value ?? 0;
                    const showProgress = (x.habit_type === 'quantity' || x.habit_type === 'duration') && x.target_value;
                    return (
                      <li key={x.id}>
                        <button
                          type="button"
                          onClick={() => quickHabit(x)}
                          aria-pressed={isComplete}
                          className="flex w-full items-center gap-2.5 rounded-lg px-1.5 py-1.5 text-left transition-colors hover:bg-raised active:scale-[0.99]"
                        >
                          <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full transition-colors ${isComplete ? 'bg-brand text-on-brand' : 'ring-1 ring-line-strong'}`}>
                            {isComplete && <Check size={11} strokeWidth={3} aria-hidden="true" />}
                          </span>
                          <span className={`min-w-0 flex-1 truncate ${isComplete ? 'text-fg3 line-through' : 'text-fg'}`}>{x.name}</span>
                          {showProgress && (
                            <span className="figure shrink-0 text-xs text-fg3">{num(val)}/{num(x.target_value!)}</span>
                          )}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </>
          )}
        </Tile>

        {/* Next reminders: checkable directly from Home. */}
        <Tile to="/lembretes" title="A seguir" className="lg:col-span-4">
          {reminders.loading ? (
            <div className="space-y-3">{[60, 45, 52].map((w) => <Skeleton key={w} className="h-4" style={{ width: `${w}%` }} />)}</div>
          ) : next.length === 0 ? <Empty icon={<Bell size={18} strokeWidth={1.5} />}>Nenhum lembrete pendente</Empty> : (
            <ol className="relative space-y-2.5 border-l border-line-strong pl-4">
              {next.map((r) => {
                const late = panel.overdue.includes(r);
                return (
                  <li key={r.id} className="relative flex items-center gap-2.5 text-sm">
                    <span className={`absolute top-[7px] -left-[21px] h-2 w-2 rounded-full ring-4 ring-surface ${late ? 'bg-negative' : 'bg-brand'}`} aria-hidden />
                    <input
                      type="checkbox"
                      className="h-4 w-4 shrink-0 cursor-pointer"
                      checked={r.completed}
                      onChange={() => void toggleReminder(r)}
                      aria-label={`Concluir lembrete ${r.title}`}
                    />
                    <span className={`figure w-[68px] shrink-0 text-xs ${late ? 'text-negative' : 'text-fg3'}`}>
                      {toDay(new Date(r.datetime)) !== today && <span className="mr-1">{WEEKDAY.format(new Date(r.datetime)).replace('.', '')}</span>}{formatTime(r.datetime)}
                    </span>
                    <span className="min-w-0 flex-1 truncate">{r.title}</span>
                  </li>
                );
              })}
            </ol>
          )}
        </Tile>

        {/* Projects in motion with LMS-style ProgressRing */}
        <Tile to="/projetos" title="Projetos" className="lg:col-span-4"
          meta={projectList.more > 0 && <span className="text-xs text-fg3">+{projectList.more} em andamento</span>}>
          {loadingProjects ? (
            <div className="space-y-4">{[0, 1].map((i) => <div key={i} className="space-y-2"><Skeleton className="h-4 w-1/2" /><Skeleton className="h-1.5 w-full" /></div>)}</div>
          ) : projectList.rows.length === 0 ? <Empty icon={<FolderKanban size={18} strokeWidth={1.5} />}>Nenhum projeto em andamento</Empty> : (
            <ul className="space-y-3.5">
              {projectList.rows.map((r) => (
                <li key={r.id}>
                  <Link to={`/projetos?p=${r.id}`} className="group flex items-center gap-3 rounded-xl p-1 -mx-1 transition-colors hover:bg-raised/60 focus-visible:ring-2 focus-visible:ring-brand">
                    <ProgressRing pct={r.pct} size={44} strokeWidth={4} tone={r.color} />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium group-hover:underline">{r.name}</div>
                      <p className="mt-0.5 truncate text-xs text-fg3">
                        <span className={HEALTH_TONE[r.health]}>{HEALTH_LABEL[r.health]}</span>
                        {r.dueText && <> · {r.dueText}{r.daysLeft != null && r.daysLeft >= 0 && <> ({r.daysLeft}d)</>}</>}
                      </p>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Tile>

        {/* Goals in motion with compact ProgressRing */}
        <Tile to="/metas" title="Metas" className="lg:col-span-4"
          meta={goalList.more > 0 && <span className="text-xs text-fg3">+{goalList.more} ativas</span>}>
          {loadingGoals ? (
            <div className="space-y-4">{[0, 1].map((i) => <div key={i} className="space-y-2"><Skeleton className="h-4 w-1/2" /><Skeleton className="h-1.5 w-full" /></div>)}</div>
          ) : goalList.rows.length === 0 ? <Empty icon={<Target size={18} strokeWidth={1.5} />}>Nenhuma meta ativa</Empty> : (
            <ul className="space-y-3.5">
              {goalList.rows.map((r) => (
                <li key={r.id}>
                  <Link to="/metas" className="group flex items-center gap-3 rounded-xl p-1 -mx-1 transition-colors hover:bg-raised/60 focus-visible:ring-2 focus-visible:ring-brand">
                    <ProgressRing pct={r.pct} size={44} strokeWidth={4} tone={r.pace === 'done' || r.pace === 'ahead' ? 'var(--positive)' : r.pace === 'late' ? 'var(--negative)' : 'var(--brand)'} />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium group-hover:underline">{r.title}</div>
                      <p className="mt-0.5 truncate text-xs text-fg3">
                        <span className={PACE_TONE[r.pace]}>{PACE_LABEL[r.pace]}</span>
                        {r.valueText && <>{' · '}<span className="figure">{r.valueText}</span></>}
                      </p>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Tile>
      </div>
    </>
  );
}

