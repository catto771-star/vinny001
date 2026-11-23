import { useEffect, useRef, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight, Bell, Check, CheckSquare, FolderKanban, Plus, Search, Sparkles, Target, Wallet } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useTable, write } from '../lib/useTable';
import { latestPerKey } from '../lib/serial';
import { formatDay, formatTime, toDay } from '../lib/dates';
import { num, plural } from '../lib/format';
import { bucketTasks, type Task } from '../lib/tasks';
import { isDone, routineFor, type Habit, type HabitCompletion } from '../lib/habits';
import { reminderPanel, type Reminder } from '../lib/reminders';
import { sumNutrients } from '../lib/nutrition';
import { workoutSummary } from '../lib/training';
import { goalRows, nextHabitQuickValue, projectRows } from '../lib/homeProgress';
import { PACE_LABEL, currentValue, type Goal, type GoalEntry } from '../lib/goals';
import { HEALTH_LABEL, projectProgress } from '../lib/projects';
import { bankBalance, type Bank, type InvoicePayment, type Transfer, type Tx } from '../lib/finance';
import { calorieStatus, dayHeadline, greeting } from '../lib/today';
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
  deficit: 'bg-positive/10 text-positive',
  goal: 'bg-positive/10 text-positive',
  surplus: 'bg-warning/10 text-warning',
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
        <ArrowUpRight size={16} strokeWidth={1.75} aria-hidden="true" className="text-fg3 transition-transform duration-300 ease-out group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-fg" />
      </Link>
      {children}
    </section>
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
  useRates(null); // today's rates value the euro and dollar accounts
  const goals = useTable<Goal>('goals', '*', { column: 'created_at' });
  const entries = useTable<GoalEntry>('goal_entries', '*', { column: 'date' });
  const banks = useTable<Bank>('banks');
  const txs = useTable<Tx>('transactions');
  const transfers = useTable<Transfer>('transfers');
  const payments = useTable<InvoicePayment>('card_invoice_payments');
  const habitQueue = useRef(latestPerKey()).current;
  const now = new Date();
  const today = toDay(now);

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
    await write(supabase.from('tasks').update({ completed, status: completed ? 'completed' : 'pending', completed_at }).eq('id', task.id));
    void tasks.reload();
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
      if (nextVal <= 0) await write(supabase.from('habit_completions').delete().eq('habit_id', habit.id).eq('completed_date', today));
      else await write(supabase.from('habit_completions').upsert({ habit_id: habit.id, completed_date: today, value: nextVal }, { onConflict: 'habit_id,completed_date' }));
    }).then(() => { if (!habitQueue.busy()) void completions.reload(); });
  }

  async function toggleReminder(r: Reminder) {
    reminders.setRows((rows) => rows.map((x) => (x.id === r.id ? { ...x, completed: !r.completed } : x)));
    await write(supabase.from('reminders').update({ completed: !r.completed }).eq('id', r.id));
    void reminders.reload();
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
      <header className="mb-7 flex flex-wrap items-end justify-between gap-4 md:mb-8">
        <div className="min-w-0">
          <p className="label">{greeting(now.getHours())} · {capitalize(formatDay(today))}</p>
          {ready
            ? <h1 className="mt-2 max-w-[46ch] text-[20px] leading-7 font-medium tracking-[-0.02em] text-fg md:text-[24px] md:leading-8">{headline}</h1>
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
            <Sparkles size={15} strokeWidth={1.6} aria-hidden="true" />Revisão
          </button>
          <button type="button" className="icon-btn h-10 w-10 bg-surface md:hidden" onClick={openCommandPalette} aria-label="Buscar ou executar comando">
            <Search size={17} strokeWidth={1.6} aria-hidden="true" />
          </button>
        </div>
      </header>

      <div className="stagger grid grid-cols-2 gap-3 md:gap-4 lg:grid-cols-12">
        {/* Calories: a compact read of the day, in four lines. */}
        <Tile to="/saude" title="Calorias" className="order-4 col-span-2 lg:order-2 lg:col-span-4"
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
              <p className={`mt-3 inline-flex w-fit items-center rounded-full px-3 py-1 text-xs font-medium ${CAL_TONE[cal.state]}`}>{cal.verdict}</p>
              <p className="figure mt-4 text-xs text-fg3">
                P {num(eaten.protein_g)}/{num(target.protein_g)} · C {num(eaten.carbs_g)}/{num(target.carbs_g)} · G {num(eaten.fat_g)}/{num(target.fat_g)} g
              </p>
            </>
          )}
        </Tile>

        {/* Habits: interactive 1-tap check directly from Home. */}
        <Tile to="/habitos" title="Hábitos" className="order-2 col-span-2 sm:col-span-1 lg:order-3 lg:col-span-4">
          {loadingHabits ? <Skeleton className="h-9 w-20" /> : (
            <Figure value={doneHabits} unit={`de ${routine.length}`} className="text-[28px] leading-8 font-medium" />
          )}
          <div className="mt-4 flex gap-1" aria-hidden>
            {(loadingHabits ? [0, 1, 2, 3] : routine).map((x, i) => (
              <span key={typeof x === 'number' ? i : x.id} className={`h-2 flex-1 rounded-full transition-colors duration-500 ${typeof x !== 'number' && done(x) ? 'bg-primary' : 'bg-raised'}`} />
            ))}
          </div>
          {!loadingHabits && routine.length > 0 && (
            <ul className="mt-4 space-y-1 text-sm">
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
                      <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full transition-colors ${isComplete ? 'bg-primary text-primary-ink' : 'ring-1 ring-line-strong'}`}>
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
        </Tile>

        {/* Workout */}
        <Tile to="/saude" title="Treino" className="order-3 col-span-2 sm:col-span-1 lg:order-4 lg:col-span-3">
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

        {/* Tasks: interactive completion directly from Home. */}
        <Tile to="/tarefas" title="Para hoje" className="order-1 col-span-2 lg:order-1 lg:col-span-8"
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
                    {late ? <span className="badge bg-negative/10 text-negative">atrasada</span>
                      : t.due_date && !t.due_all_day && <span className="figure shrink-0 text-xs text-fg3">{formatTime(t.due_date)}</span>}
                  </li>
                );
              })}
            </ul>
          )}
        </Tile>

        {/* Next reminders: checkable directly from Home. */}
        <Tile to="/lembretes" title="A seguir" className="order-5 col-span-2 lg:order-5 lg:col-span-5">
          {reminders.loading ? (
            <div className="space-y-3">{[60, 45, 52].map((w) => <Skeleton key={w} className="h-4" style={{ width: `${w}%` }} />)}</div>
          ) : next.length === 0 ? <Empty icon={<Bell size={18} strokeWidth={1.5} />}>Nenhum lembrete pendente</Empty> : (
            <ol className="relative space-y-2.5 border-l border-line-strong pl-4">
              {next.map((r) => {
                const late = panel.overdue.includes(r);
                return (
                  <li key={r.id} className="relative flex items-center gap-2.5 text-[15px]">
                    <span className={`absolute top-[9px] -left-[21px] h-2 w-2 rounded-full ring-4 ring-surface ${late ? 'bg-negative' : 'bg-brand'}`} aria-hidden />
                    <input
                      type="checkbox"
                      className="h-4 w-4 shrink-0 cursor-pointer"
                      checked={r.completed}
                      onChange={() => void toggleReminder(r)}
                      aria-label={`Concluir lembrete ${r.title}`}
                    />
                    <span className={`figure w-[72px] shrink-0 text-[13px] ${late ? 'text-negative' : 'text-fg3'}`}>
                      {toDay(new Date(r.datetime)) !== today && <span className="mr-1">{WEEKDAY.format(new Date(r.datetime)).replace('.', '')}</span>}{formatTime(r.datetime)}
                    </span>
                    <span className="min-w-0 flex-1 truncate">{r.title}</span>
                  </li>
                );
              })}
            </ol>
          )}
        </Tile>

        {/* Projects in motion */}
        <Tile to="/projetos" title="Projetos" className="order-6 col-span-2 lg:order-6 lg:col-span-6"
          meta={projectList.more > 0 && <span className="text-xs text-fg3">+{projectList.more} em andamento</span>}>
          {loadingProjects ? (
            <div className="space-y-5">{[0, 1].map((i) => <div key={i} className="space-y-2"><Skeleton className="h-4 w-1/2" /><Skeleton className="h-1.5 w-full" /></div>)}</div>
          ) : projectList.rows.length === 0 ? <Empty icon={<FolderKanban size={18} strokeWidth={1.5} />}>Nenhum projeto em andamento</Empty> : (
            <ul className="space-y-5">
              {projectList.rows.map((r) => (
                <li key={r.id}>
                  <Link to={`/projetos?p=${r.id}`} className="group block rounded-lg focus-visible:ring-2 focus-visible:ring-brand">
                    <div className="mb-2 flex items-baseline gap-3">
                      <span className="mr-auto truncate text-[15px] font-medium group-hover:underline">{r.name}</span>
                      <span className="figure text-sm">{r.pct}%</span>
                    </div>
                    <Meter value={r.pct} max={100} tone={r.color} />
                    <p className="mt-1.5 text-xs text-fg3">
                      <span className={HEALTH_TONE[r.health]}>{HEALTH_LABEL[r.health]}</span>
                      {r.dueText && <> · prazo {r.dueText}{r.daysLeft != null && r.daysLeft >= 0 && <> ({r.daysLeft} {plural(r.daysLeft, 'dia', 'dias')})</>}</>}
                    </p>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Tile>

        {/* Goals in motion */}
        <Tile to="/metas" title="Metas" className="order-7 col-span-2 lg:order-7 lg:col-span-6"
          meta={goalList.more > 0 && <span className="text-xs text-fg3">+{goalList.more} ativas</span>}>
          {loadingGoals ? (
            <div className="space-y-5">{[0, 1].map((i) => <div key={i} className="space-y-2"><Skeleton className="h-4 w-1/2" /><Skeleton className="h-1.5 w-full" /></div>)}</div>
          ) : goalList.rows.length === 0 ? <Empty icon={<Target size={18} strokeWidth={1.5} />}>Nenhuma meta ativa</Empty> : (
            <ul className="space-y-5">
              {goalList.rows.map((r) => (
                <li key={r.id}>
                  <Link to="/metas" className="group block rounded-lg focus-visible:ring-2 focus-visible:ring-brand">
                    <div className="mb-2 flex items-baseline gap-3">
                      <span className="mr-auto truncate text-[15px] font-medium group-hover:underline">{r.title}</span>
                      <span className="figure text-sm">{r.pct}%</span>
                    </div>
                    <Meter value={r.pct} max={100} tone="var(--brand)" />
                    <p className="mt-1.5 text-xs text-fg3">
                      <span className={PACE_TONE[r.pace]}>{PACE_LABEL[r.pace]}</span>
                      {r.valueText && <>{' · '}<span className="figure">{r.valueText}</span></>}
                      {r.dueText && <> · até {r.dueText}</>}
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
