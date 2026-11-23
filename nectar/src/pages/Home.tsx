import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowUpRight, Bell, Check, CheckSquare, FolderKanban, Target,
} from 'lucide-react';
import { useTable, queuedWrite } from '../lib/useTable';
import { latestPerKey } from '../lib/serial';
import { addDays, formatDay, formatTime, monthName, toDay } from '../lib/dates';
import { weekOf } from '../lib/calendar';
import { num, plural } from '../lib/format';
import { conv, displayCurrency, money, symbolOf } from '../lib/money';
import { bucketTasks, type Task } from '../lib/tasks';
import { isDone, isPerfectDay, routineFor, type Habit, type HabitCompletion } from '../lib/habits';
import { reminderPanel, type Reminder } from '../lib/reminders';
import { sumNutrients } from '../lib/nutrition';
import { weeklyStats, workoutSummary } from '../lib/training';
import { goalRows, nextHabitQuickValue, projectRows } from '../lib/homeProgress';
import { PACE_LABEL, currentValue, sumLinkedAccountsInGoalCurrency, type Goal, type GoalEntry } from '../lib/goals';
import { HEALTH_LABEL, projectProgress, projectUpcomingPlan } from '../lib/projects';
import {
  bankBalance, netWorth, netWorthHistory, type Bank, type Card, type InvoicePayment,
  type RecurringTemplate, type Skip, type Transfer, type Tx,
} from '../lib/finance';
import { projectCashFlow } from '../lib/cashflow';
import { dayHeadline } from '../lib/today';
import { AreaChart, ColumnChart } from '../components/Charts';
import { Empty, Skeleton } from '../components/ui';
import { openQuickCapture } from '../components/QuickCaptureModal';
import { useProjects } from './projects/useProjects';
import { useRates } from './finance/useRates';
import { HEALTH_TONE } from './projects/Projects';
import { PACE_TONE } from './Goals';
import { useHealth } from './health/useHealth';
import { energyForDay } from './health/energyForDay';

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const WEEKDAY = new Intl.DateTimeFormat('pt-BR', { weekday: 'short' });
const shortDay = (d: string) => `${Number(d.slice(8))}/${d.slice(5, 7)}`;
const I = { size: 16, strokeWidth: 1.5, 'aria-hidden': true } as const;

type HeroChartMode = 'fluxo' | 'patrimonio' | 'habitos';

/** Section card whose header links to the full screen. */
function Tile({ to, title, meta, className = '', children }: { to: string; title: string; meta?: ReactNode; className?: string; children: ReactNode }) {
  return (
    <section className={`card glow flex min-w-0 flex-col ${className}`}>
      <Link
        to={to}
        className="group -mx-1 -mt-1 mb-4 flex items-center gap-2 rounded-[8px] px-1 py-1 focus-visible:ring-2 focus-visible:ring-brand"
      >
        <h2 className="mr-auto text-[15px] leading-6 font-medium text-fg">{title}</h2>
        {meta}
        <ArrowUpRight {...I} className="text-fg3 transition-colors duration-150 group-hover:text-fg" />
      </Link>
      {children}
    </section>
  );
}

export default function Home() {
  const [heroMode, setHeroMode] = useState<HeroChartMode>('fluxo');
  const tasks = useTable<Task>('tasks');
  const habits = useTable<Habit>('habits');
  const completions = useTable<HabitCompletion>('habit_completions', 'id,habit_id,completed_date,value');
  const reminders = useTable<Reminder>('reminders', '*', { column: 'datetime' });
  const h = useHealth();
  const projects = useProjects();
  const fx = useRates(null);
  const goals = useTable<Goal>('goals', '*', { column: 'created_at' });
  const entries = useTable<GoalEntry>('goal_entries', '*', { column: 'date' });
  const banks = useTable<Bank>('banks');
  const cards = useTable<Card>('cards');
  const txs = useTable<Tx>('transactions');
  const transfers = useTable<Transfer>('transfers');
  const payments = useTable<InvoicePayment>('card_invoice_payments');
  const templates = useTable<RecurringTemplate>('transaction_recurring_templates', '*', { column: 'created_at' });
  const skips = useTable<Skip>('transaction_recurring_skips');
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
  const next = [...panel.overdue, ...panel.today, ...panel.thisWeek].slice(0, 5);
  const workout = h.workouts.rows.find((w) => w.date === today);
  const summary = workout ? workoutSummary(workout, h.sets.rows, h.workouts.rows, h.typeById) : null;
  const curWeekTraining = weeklyStats(today, 2, h.sets.rows, h.workouts.rows, h.typeById).at(-1);
  const eaten = sumNutrients(h.foodLogs.rows.filter((l) => l.date === today));
  const { target } = energyForDay(h, today);

  const worth = netWorth(banks.rows, txs.rows, transfers.rows, payments.rows, today);
  const worthSeries = useMemo(
    () => netWorthHistory(banks.rows, txs.rows, transfers.rows, payments.rows, curYear, curMonth, 6, today),
    [banks.rows, txs.rows, transfers.rows, payments.rows, curYear, curMonth, today],
  );
  const activeTemplates = useMemo(
    () => templates.rows.filter((t) => !t.deleted_at),
    [templates.rows],
  );
  const cashflow = useMemo(() => projectCashFlow({
    startDay: today,
    days: 30,
    startingBalance: worth,
    templates: activeTemplates,
    txs: txs.rows,
    skips: skips.rows,
    cards: cards.rows,
    payments: payments.rows,
  }), [today, worth, activeTemplates, txs.rows, skips.rows, cards.rows, payments.rows]);

  const habitWeeks = useMemo(() => {
    const active = habits.rows.filter((x) => !x.is_archived);
    return Array.from({ length: 8 }, (_, i) => {
      const w = weekOf(addDays(today, -7 * (7 - i)));
      const perfect = w.filter((d) => d <= today && isPerfectDay(active, completions.rows, d)).length;
      return { label: shortDay(w[0]), value: perfect };
    });
  }, [habits.rows, completions.rows, today]);

  const totalActions = doneToday + dueToday.length + routine.length;
  const completedActions = doneToday + doneHabits;
  const dayExecPct = totalActions > 0 ? Math.round((completedActions / totalActions) * 100) : 100;
  const taskTotal = doneToday + dueToday.length;
  const taskPct = taskTotal > 0 ? Math.round((doneToday / taskTotal) * 100) : 100;
  const habitPct = routine.length > 0 ? Math.round((doneHabits / routine.length) * 100) : 100;
  const kcalPct = target && target.kcal > 0 ? Math.min(100, Math.round((eaten.kcal / target.kcal) * 100)) : 0;

  const activeProjects = projects.projects.rows.filter((p) => !p.is_template && !p.archived_at && (p.status === 'active' || p.status === 'planning'));
  const projectPct = (id: string) => projectProgress(projects.tasksOf(id), projects.stepsOf(id)).pct;
  const avgProjectPct = activeProjects.length
    ? Math.round(activeProjects.reduce((s, p) => s + projectPct(p.id), 0) / activeProjects.length)
    : 0;
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
  const headline = dayHeadline({
    tasksLeft: dueToday.length,
    habitsLeft: routine.length - doneHabits,
    kcalLeft: target ? target.kcal - eaten.kcal : null,
  }).replace(/\.$/, '');

  const heroSwitch = (
    <div className="segmented" role="tablist" aria-label="Gráfico principal">
      <button type="button" role="tab" aria-selected={heroMode === 'fluxo'} className={heroMode === 'fluxo' ? 'tab-active' : 'tab'} onClick={() => setHeroMode('fluxo')}>Fluxo 30d</button>
      <button type="button" role="tab" aria-selected={heroMode === 'patrimonio'} className={heroMode === 'patrimonio' ? 'tab-active' : 'tab'} onClick={() => setHeroMode('patrimonio')}>Patrimônio</button>
      <button type="button" role="tab" aria-selected={heroMode === 'habitos'} className={heroMode === 'habitos' ? 'tab-active' : 'tab'} onClick={() => setHeroMode('habitos')}>Hábitos</button>
    </div>
  );

  const weekDaysStrip = weekOf(today);

  return (
    <>
      <header className="mb-6">
        <h1 className="display">
          {capitalize(formatDay(today))}{' '}
          <span className="font-normal text-fg3">{curYear}</span>
        </h1>
        {ready
          ? <p className="mt-2 text-sm text-fg2">{headline}</p>
          : <div className="mt-2" aria-busy="true" aria-label="Carregando"><Skeleton className="h-5 w-64" /></div>}
      </header>

      {/* Row 1: 4 Quiet Graphite Stat Cards (numbers, label, context only) */}
      <div className="stagger mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Link to="/habitos" className="card glow flex flex-col justify-between">
          <div className="label">Ritmo de hoje</div>
          <div className="figure mt-3 text-[28px] leading-none font-medium text-fg">
            {ready ? `${dayExecPct}%` : '—'}
          </div>
          <div className="figure mt-3 text-xs text-fg3">
            {completedActions} de {totalActions} concluídos
          </div>
        </Link>

        <Link to="/financas" className="card glow flex flex-col justify-between">
          <div className="label">Patrimônio total</div>
          <div className="figure mt-3 truncate text-[28px] leading-none font-medium text-fg">
            {loadingFinance ? '—' : money(worth)}
          </div>
          <div className="mt-3 text-xs text-fg3">
            {banks.rows.length} {plural(banks.rows.length, 'conta ativa', 'contas ativas')}
          </div>
        </Link>

        <Link to="/projetos" className="card glow flex flex-col justify-between">
          <div className="label">Projetos em curso</div>
          <div className="figure mt-3 text-[28px] leading-none font-medium text-fg">
            {loadingProjects ? '—' : activeProjects.length}
          </div>
          <div className="figure mt-3 text-xs text-fg3">
            média {avgProjectPct}% concluído
          </div>
        </Link>

        <Link to="/saude" className="card glow flex flex-col justify-between">
          <div className="label">{h.latestWeight ? 'Peso atual' : 'Saúde hoje'}</div>
          <div className="figure mt-3 truncate text-[28px] leading-none font-medium text-fg">
            {h.latestWeight ? `${num(h.latestWeight)} kg` : summary ? `${num(summary.tonnage)} kg` : `${num(eaten.kcal)} kcal`}
          </div>
          <div className="mt-3 text-xs text-fg3">
            {curWeekTraining ? `${curWeekTraining.sessions} ${plural(curWeekTraining.sessions, 'treino', 'treinos')} na semana` : 'sem treinos na semana'}
          </div>
        </Link>
      </div>

      {/* Row 2: Wide Centerpiece Chart (8 cols) + Ranked Execution Summary (4 cols) */}
      <div className="stagger mb-6 grid grid-cols-1 gap-4 xl:grid-cols-12">
        <div className="min-w-0 xl:col-span-8">
          {heroMode === 'fluxo' && (
            <AreaChart
              title="Previsão de fluxo de caixa"
              subtitle={`Saldo projetado em 30 dias: ${money(cashflow.endingBalance)} (${cashflow.netChange >= 0 ? '+' : '−'}${money(Math.abs(cashflow.netChange))})`}
              unit={symbolOf(displayCurrency())}
              height={288}
              aside={heroSwitch}
              tone="var(--brand)"
              deltaContext="em 30 dias"
              points={cashflow.points.map((pt) => ({
                label: shortDay(pt.day),
                value: conv(pt.balance),
                detail: pt.events.length ? pt.events.map((e) => `${e.amount >= 0 ? '+' : '−'}${money(Math.abs(e.amount))} ${e.label}`).join(' · ') : undefined,
              }))}
            />
          )}
          {heroMode === 'patrimonio' && (
            <AreaChart
              title="Evolução do patrimônio"
              subtitle="Saldo consolidado ao final de cada mês"
              unit={symbolOf(displayCurrency())}
              minZero={false}
              height={288}
              aside={heroSwitch}
              tone="var(--positive)"
              deltaContext="em 6 meses"
              points={worthSeries.map((p) => ({
                label: `${monthName(p.month).slice(0, 3)}/${String(p.year).slice(2)}`,
                value: conv(p.value),
                detail: `em ${shortDay(p.date)}`,
              }))}
            />
          )}
          {heroMode === 'habitos' && (
            <ColumnChart
              title="Dias perfeitos por semana"
              subtitle="Últimas 8 semanas de constância"
              unit="dias"
              height={288}
              aside={heroSwitch}
              points={habitWeeks}
            />
          )}
        </div>

        <section className="card flex min-w-0 flex-col justify-between xl:col-span-4">
          <div>
            <div className="flex items-center justify-between">
              <h2 className="text-[15px] leading-6 font-medium text-fg">Foco do dia</h2>
              <span className="figure text-xs text-fg3">{completedActions}/{totalActions}</span>
            </div>
            <p className="mt-1 text-xs text-fg3">Execução combinada de tarefas e hábitos</p>

            <div className="mt-6 flex items-baseline gap-2">
              <span className="figure text-[32px] leading-none font-medium text-fg">{dayExecPct}%</span>
              <span className="text-xs text-fg3">concluído hoje</span>
            </div>

            <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-raised" role="progressbar" aria-valuenow={dayExecPct} aria-valuemin={0} aria-valuemax={100} aria-label="Progresso do dia">
              <div className="h-full rounded-full bg-brand" style={{ width: `${dayExecPct}%` }} />
            </div>
          </div>

          <div className="mt-6 space-y-4 border-t border-line pt-5">
            <div>
              <div className="mb-1.5 flex items-center justify-between text-xs">
                <span className="text-fg2">Tarefas</span>
                <span className="figure text-fg">{doneToday}/{taskTotal}</span>
              </div>
              <div className="h-1 overflow-hidden rounded-full bg-raised">
                <div className="h-full rounded-full bg-fg" style={{ width: `${taskPct}%` }} />
              </div>
            </div>
            <div>
              <div className="mb-1.5 flex items-center justify-between text-xs">
                <span className="text-fg2">Hábitos</span>
                <span className="figure text-fg">{doneHabits}/{routine.length}</span>
              </div>
              <div className="h-1 overflow-hidden rounded-full bg-raised">
                <div className="h-full rounded-full bg-fg2" style={{ width: `${habitPct}%` }} />
              </div>
            </div>
            <div>
              <div className="mb-1.5 flex items-center justify-between text-xs">
                <span className="text-fg2">Energia registrada</span>
                <span className="figure text-fg">{num(eaten.kcal)}{target ? ` / ${num(target.kcal)}` : ''} kcal</span>
              </div>
              <div className="h-1 overflow-hidden rounded-full bg-raised">
                <div className="h-full rounded-full bg-fg3" style={{ width: `${kcalPct}%` }} />
              </div>
            </div>
          </div>
        </section>
      </div>

      {/* Row 3: Daily Operations */}
      <div className="stagger mb-6 grid grid-cols-1 gap-4 lg:grid-cols-12">
        <Tile to="/tarefas" title="Para hoje" className="lg:col-span-5"
          meta={!loadingTasks && <span className="figure text-xs text-fg3">{doneToday} de {taskTotal}</span>}>
          {loadingTasks ? (
            <div className="space-y-3">{[70, 52, 64].map((w) => <Skeleton key={w} className="h-4" style={{ width: `${w}%` }} />)}</div>
          ) : dueToday.length === 0 ? (
            <Empty
              icon={<CheckSquare size={18} strokeWidth={1.5} />}
              action={<button type="button" className="btn-secondary" onClick={() => openQuickCapture('task')}>Adicionar tarefa</button>}
            >
              Nenhuma tarefa pendente para hoje
            </Empty>
          ) : (
            <ul>
              {dueToday.slice(0, 6).map((t) => {
                const late = b.overdue.includes(t);
                return (
                  <li key={t.id} className="flex h-10 items-center gap-3 border-b border-line text-sm last:border-0">
                    <input
                      type="checkbox"
                      className="h-4 w-4 shrink-0 cursor-pointer"
                      checked={t.completed}
                      onChange={() => void toggleTask(t)}
                      aria-label={`Concluir ${t.title}`}
                    />
                    <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${t.priority === 'high' ? 'bg-negative' : t.priority === 'medium' ? 'bg-warning' : 'bg-fg3/50'}`} aria-hidden="true" />
                    <Link to="/tarefas" className="mr-auto min-w-0 truncate text-fg hover:underline">{t.title}</Link>
                    {late ? <span className="text-xs text-negative">atrasada</span>
                      : t.due_date && !t.due_all_day && <span className="figure shrink-0 text-xs text-fg3">{formatTime(t.due_date)}</span>}
                  </li>
                );
              })}
            </ul>
          )}
        </Tile>

        <Tile
          to="/habitos"
          title="Hábitos de hoje"
          className="lg:col-span-4"
          meta={!loadingHabits && <span className="figure text-xs text-fg3">{doneHabits}/{routine.length}</span>}
        >
          {loadingHabits ? <Skeleton className="h-12 w-full" /> : (
            <ul className="space-y-1 text-sm">
              {routine.slice(0, 6).map((x) => {
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
                      className="flex h-9 w-full items-center gap-3 rounded-[8px] px-2 text-left transition-colors duration-150 hover:bg-raised"
                    >
                      <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-[4px] border transition-colors duration-150 ${isComplete ? 'border-positive bg-positive text-primary-ink' : 'border-line-strong'}`}>
                        {isComplete && <Check size={12} strokeWidth={2} aria-hidden="true" />}
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
        </Tile>

        <Tile to="/lembretes" title="Agenda da semana" className="lg:col-span-3">
          <div className="mb-4 grid grid-cols-7 gap-1 text-center">
            {weekDaysStrip.map((d) => {
              const isToday = d === today;
              const wd = capitalize(WEEKDAY.format(new Date(`${d}T12:00:00`)).replace('.', '').slice(0, 1));
              return (
                <div
                  key={d}
                  className={`flex flex-col items-center rounded-[8px] py-2 ${isToday ? 'border border-line-strong bg-raised text-fg' : 'bg-sunken/70 text-fg3'}`}
                >
                  <span className="text-xs leading-4">{wd}</span>
                  <span className="figure mt-0.5 text-xs font-medium">{Number(d.slice(8))}</span>
                  <span className={`mt-1 h-1.5 w-1.5 rounded-full ${isToday ? 'bg-brand' : 'bg-transparent'}`} aria-hidden="true" />
                </div>
              );
            })}
          </div>
          {reminders.loading ? (
            <div className="space-y-3">{[60, 45, 52].map((w) => <Skeleton key={w} className="h-4" style={{ width: `${w}%` }} />)}</div>
          ) : next.length === 0 ? <Empty icon={<Bell size={18} strokeWidth={1.5} />}>Nenhum lembrete próximo</Empty> : (
            <ol className="space-y-1 text-sm">
              {next.map((r) => {
                const late = panel.overdue.includes(r);
                return (
                  <li key={r.id} className="flex h-9 items-center gap-2 rounded-[8px] px-2 hover:bg-raised/60">
                    <input
                      type="checkbox"
                      className="h-4 w-4 shrink-0 cursor-pointer"
                      checked={r.completed}
                      onChange={() => void toggleReminder(r)}
                      aria-label={`Concluir lembrete ${r.title}`}
                    />
                    <span className="min-w-0 flex-1 truncate text-xs text-fg">{r.title}</span>
                    <span className={`figure shrink-0 text-xs ${late ? 'text-negative' : 'text-fg3'}`}>{formatTime(r.datetime)}</span>
                  </li>
                );
              })}
            </ol>
          )}
        </Tile>
      </div>

      {/* Row 4: Projects + Active Goals */}
      <div className="stagger grid grid-cols-1 gap-4 lg:grid-cols-12">
        <Tile to="/projetos" title="Projetos em andamento" className="lg:col-span-8"
          meta={projectList.more > 0 && <span className="figure text-xs text-fg3">+{projectList.more}</span>}>
          {loadingProjects ? (
            <div className="grid gap-4 sm:grid-cols-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-36 w-full rounded-[10px]" />)}</div>
          ) : projectList.rows.length === 0 ? <Empty icon={<FolderKanban size={18} strokeWidth={1.5} />}>Nenhum projeto em andamento</Empty> : (
            <ul className="grid gap-4 sm:grid-cols-3">
              {projectList.rows.map((r) => {
                const plan = projectUpcomingPlan(projects.stepsOf(r.id), projects.tasksOf(r.id), 1, 2, 2);
                const firstStep = plan.nextSteps[0];
                return (
                  <li key={r.id} className="min-w-0">
                    <Link
                      to={`/projetos?p=${r.id}`}
                      className="group flex h-full flex-col rounded-[10px] border border-line bg-sunken/50 p-4 transition-colors duration-150 hover:border-line-strong"
                    >
                      <div className="flex items-center justify-between gap-2 text-xs text-fg3">
                        <span className="inline-flex items-center gap-2 truncate">
                          <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: r.color }} aria-hidden="true" />
                          <span>{r.dueText ? `Prazo ${r.dueText}` : 'Sem prazo'}</span>
                        </span>
                        <span className="figure font-medium text-fg">{r.pct}%</span>
                      </div>
                      <div className="mt-3 h-1 overflow-hidden rounded-full bg-raised">
                        <div className="h-full rounded-full" style={{ width: `${Math.max(r.pct, 0)}%`, background: r.color }} />
                      </div>
                      <div className="mt-3 truncate text-sm font-medium text-fg group-hover:underline">{r.name}</div>
                      <div className="mt-1 text-xs">
                        <span className={HEALTH_TONE[r.health]}>{HEALTH_LABEL[r.health]}</span>
                      </div>
                      <div className="mt-4 flex-1 border-t border-line pt-3 text-xs text-fg3">
                        {firstStep ? (
                          <>
                            <div className="truncate font-medium text-fg2">{firstStep.step.title}</div>
                            {firstStep.substeps.map((sub) => (
                              <div key={sub.id} className="mt-1 truncate pl-2 text-xs text-fg3">· {sub.title}</div>
                            ))}
                          </>
                        ) : plan.looseSubsteps.length > 0 ? (
                          plan.looseSubsteps.map((sub) => (
                            <div key={sub.id} className="truncate text-xs text-fg3">· {sub.title}</div>
                          ))
                        ) : (
                          <span>Abrir para definir etapas</span>
                        )}
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </Tile>

        <Tile to="/metas" title="Metas ativas" className="lg:col-span-4"
          meta={goalList.more > 0 && <span className="figure text-xs text-fg3">+{goalList.more}</span>}>
          {loadingGoals ? (
            <div className="space-y-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
          ) : goalList.rows.length === 0 ? <Empty icon={<Target size={18} strokeWidth={1.5} />}>Nenhuma meta ativa</Empty> : (
            <ul className="space-y-3">
              {goalList.rows.map((r) => (
                <li key={r.id}>
                  <Link to="/metas" className="group block rounded-[10px] border border-line bg-sunken/50 p-3 transition-colors duration-150 hover:border-line-strong">
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-sm font-medium text-fg group-hover:underline">{r.title}</span>
                      <span className="figure shrink-0 text-xs font-medium text-fg2">{r.pct}%</span>
                    </div>
                    <div className="mt-2 h-1 overflow-hidden rounded-full bg-raised">
                      <div className="h-full rounded-full bg-brand" style={{ width: `${Math.max(r.pct, 0)}%` }} />
                    </div>
                    <p className="mt-2 truncate text-xs text-fg3">
                      <span className={PACE_TONE[r.pace]}>{PACE_LABEL[r.pace]}</span>
                      {r.valueText && <>{' · '}<span className="figure">{r.valueText}</span></>}
                    </p>
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



