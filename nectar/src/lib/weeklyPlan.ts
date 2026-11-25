import { addDays, parseDay, weekday, type Day } from './dates';
import { formatIn, fromBRL } from './money';

export const FALLBACK_EUR_RATE = 6.2;

/** Converts any Painel transaction amount to Euros (uses exact original_amount when recorded in EUR). */
export function txAmountInEur(
  tx: { amount: number; currency?: 'BRL' | 'USD' | 'EUR'; original_amount?: number | null },
  eurRate?: number | null,
): number {
  if (tx.currency === 'EUR' && tx.original_amount !== null && tx.original_amount !== undefined) {
    return Math.abs(Number(tx.original_amount) || 0);
  }
  const rate = eurRate && eurRate > 0 ? eurRate : FALLBACK_EUR_RATE;
  return fromBRL(Math.abs(Number(tx.amount) || 0), rate);
}

export interface PlannedExpense {
  id: string;
  label: string;
  amount: number;
}

export interface WeeklyPriority {
  id: string;
  text: string;
  done: boolean;
}

export interface WeeklyPlan {
  weekStart: Day; // Monday YYYY-MM-DD
  workoutsTarget: number;
  cardioTarget: number;
  /** 0 = Segunda .. 6 = Domingo */
  dayWorkouts: Record<number, string>;
  kcalDailyTarget: number;
  proteinDailyTarget: number;
  waterMlDailyTarget: number;
  dietDaysTarget: number;
  weeklyBudget: number;
  plannedExpenses: PlannedExpense[];
  tasksTarget: number;
  habitsPctTarget: number;
  priorities: WeeklyPriority[];
  intention: string;
  updatedAt: string;
}

export interface WeekActualInput {
  workouts: readonly { date: Day; name?: string | null; duration_min?: number | null }[];
  cardio: readonly { date: Day; activity?: string | null; duration_min?: number | null }[];
  dailyKcal: Readonly<Record<Day, number>>;
  dailyProtein: Readonly<Record<Day, number>>;
  dailyWaterMl: Readonly<Record<Day, number>>;
  dailySpend: Readonly<Record<Day, number>>;
  tasksDone: number;
  habitsByDay: Readonly<Record<Day, { done: number; due: number }>>;
}

export type ConfrontStatus = 'ok' | 'warn' | 'over' | 'pending';

export interface PillarConfrontation {
  id: 'treinos' | 'dieta' | 'gastos' | 'habitos' | 'tarefas';
  label: string;
  plannedLabel: string;
  actualLabel: string;
  subLabel: string;
  /** 0..100 adherence score for this pillar */
  score: number;
  /** Visual fill 0..100 */
  barPct: number;
  status: ConfrontStatus;
  deltaLabel: string;
}

export interface DayConfrontation {
  day: Day;
  dayIndex: number; // 0 = Seg .. 6 = Dom
  shortLabel: string;
  isToday: boolean;
  isFuture: boolean;
  plannedWorkout: string;
  actualWorkouts: number;
  actualCardioMin: number;
  workoutMet: boolean | null;
  kcal: number;
  protein: number;
  waterMl: number;
  kcalStatus: ConfrontStatus;
  spend: number;
  spendStatus: ConfrontStatus;
  habitsDone: number;
  habitsDue: number;
}

export interface DeviationInsight {
  tone: 'positive' | 'warn' | 'danger';
  text: string;
}

export interface WeekConfrontation {
  weekStart: Day;
  weekEnd: Day;
  daysElapsed: number; // 1..7 (0 if future week)
  overallScore: number;
  pillars: PillarConfrontation[];
  days: DayConfrontation[];
  deviations: DeviationInsight[];
  totalSpent: number;
  plannedExpensesTotal: number;
  avgKcal: number;
  avgProtein: number;
  avgWaterMl: number;
  dietDaysOnTarget: number;
}

export const PLANNING_DAY_OPTIONS = [
  { value: 0, label: 'Domingo', short: 'Dom' },
  { value: 1, label: 'Segunda-feira', short: 'Seg' },
  { value: 2, label: 'Terça-feira', short: 'Ter' },
  { value: 3, label: 'Quarta-feira', short: 'Qua' },
  { value: 4, label: 'Quinta-feira', short: 'Qui' },
  { value: 5, label: 'Sexta-feira', short: 'Sex' },
  { value: 6, label: 'Sábado', short: 'Sáb' },
] as const;

export const MON_WEEKDAYS = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'] as const;

const PLANNING_DAY_KEY = 'painel.planningDay';
const PLANS_KEY = 'painel.weeklyPlans.v1';

/** Returns the 7 days [Monday..Sunday] of the ISO week containing `day`. */
export function monWeekOf(day: Day): Day[] {
  const wd = weekday(day); // 0 = Sun, 1 = Mon .. 6 = Sat
  const diffToMon = wd === 0 ? -6 : 1 - wd;
  const mon = addDays(day, diffToMon);
  return Array.from({ length: 7 }, (_, i) => addDays(mon, i));
}

/**
 * When today is the user's chosen planning day at the end of the week (Sat/Sun),
 * programming points to the UPCOMING Monday..Sunday week; otherwise current week.
 */
export function targetWeekStartForPlanning(today: Day, planningWeekday: number): Day {
  const wd = weekday(today);
  if (wd === planningWeekday && (wd === 0 || wd === 6)) {
    const daysToNextMon = wd === 0 ? 1 : 2;
    return addDays(today, daysToNextMon);
  }
  return monWeekOf(today)[0];
}

export function isPlanningDay(today: Day, planningWeekday: number): boolean {
  return weekday(today) === planningWeekday;
}

export function formatWeekRange(weekStart: Day): string {
  const start = parseDay(weekStart);
  const end = parseDay(addDays(weekStart, 6));
  const fmt = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short' });
  return `${fmt.format(start)} – ${fmt.format(end)}`;
}

export function createDefaultWeeklyPlan(weekStart: Day, overrides: Partial<WeeklyPlan> = {}): WeeklyPlan {
  return {
    weekStart,
    workoutsTarget: 4,
    cardioTarget: 2,
    dayWorkouts: {
      0: 'Treino A',
      1: 'Treino B',
      2: 'Descanso / Cardio',
      3: 'Treino C',
      4: 'Treino D',
      5: 'Cardio / Livre',
      6: 'Descanso',
    },
    kcalDailyTarget: 2200,
    proteinDailyTarget: 150,
    waterMlDailyTarget: 2500,
    dietDaysTarget: 6,
    weeklyBudget: 150,
    plannedExpenses: [],
    tasksTarget: 10,
    habitsPctTarget: 80,
    priorities: [
      { id: 'p1', text: '', done: false },
      { id: 'p2', text: '', done: false },
      { id: 'p3', text: '', done: false },
    ],
    intention: '',
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

export function readPlanningDay(): number {
  try {
    const raw = localStorage.getItem(PLANNING_DAY_KEY);
    if (raw === null) return 0; // Domingo by default
    const n = Number(raw);
    return Number.isInteger(n) && n >= 0 && n <= 6 ? n : 0;
  } catch {
    return 0;
  }
}

export function savePlanningDay(day: number): void {
  const safe = Number.isInteger(day) && day >= 0 && day <= 6 ? day : 0;
  try {
    localStorage.setItem(PLANNING_DAY_KEY, String(safe));
    window.dispatchEvent(new CustomEvent('painel-weekly-plan-changed'));
  } catch {
    /* storage unavailable */
  }
}

export function readAllWeeklyPlans(): Record<Day, WeeklyPlan> {
  try {
    const raw = localStorage.getItem(PLANS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? (parsed as Record<Day, WeeklyPlan>) : {};
  } catch {
    return {};
  }
}

export function readWeeklyPlan(weekStart: Day): WeeklyPlan | null {
  return readAllWeeklyPlans()[weekStart] ?? null;
}

export function saveWeeklyPlanLocal(plan: WeeklyPlan): void {
  try {
    const all = readAllWeeklyPlans();
    all[plan.weekStart] = { ...plan, updatedAt: new Date().toISOString() };
    localStorage.setItem(PLANS_KEY, JSON.stringify(all));
    window.dispatchEvent(new CustomEvent('painel-weekly-plan-changed'));
  } catch {
    /* storage unavailable */
  }
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

function isRestLabel(label: string): boolean {
  const s = label.trim().toLowerCase();
  return !s || s === 'descanso' || s === 'off' || s === 'folga' || s === 'livre';
}

/**
 * Confronts a premeditated WeeklyPlan against actual recorded data for that week.
 */
export function confrontWeek(plan: WeeklyPlan, actual: WeekActualInput, today: Day): WeekConfrontation {
  const days = monWeekOf(plan.weekStart);
  const weekEnd = days[6];
  const daySet = new Set(days);

  const daysElapsed = today < plan.weekStart
    ? 0
    : today > weekEnd
      ? 7
      : days.indexOf(today) + 1;

  const paceRatio = daysElapsed / 7;

  // Workouts & Cardio
  const weekWorkouts = actual.workouts.filter((w) => daySet.has(w.date));
  const weekCardio = actual.cardio.filter((c) => daySet.has(c.date));
  const workoutsDone = weekWorkouts.length;
  const cardioDone = weekCardio.length;

  const workoutExpectedByNow = plan.workoutsTarget * paceRatio;
  const workoutScore = plan.workoutsTarget > 0
    ? clamp(Math.round((workoutsDone / plan.workoutsTarget) * 100), 0, 100)
    : 100;
  const workoutStatus: ConfrontStatus = daysElapsed === 0
    ? 'pending'
    : workoutsDone >= plan.workoutsTarget
      ? 'ok'
      : workoutsDone + 0.5 >= workoutExpectedByNow
        ? 'ok'
        : 'warn';

  // Diet & Hydration
  const loggedDietDays = days.filter((d) => (actual.dailyKcal[d] ?? 0) > 0);
  const dietDaysOnTarget = loggedDietDays.filter((d) => {
    const kcal = actual.dailyKcal[d] ?? 0;
    if (plan.kcalDailyTarget <= 0) return true;
    const diffPct = Math.abs(kcal - plan.kcalDailyTarget) / plan.kcalDailyTarget;
    return diffPct <= 0.12; // ±12% tolerance around daily target
  }).length;

  const avgKcal = loggedDietDays.length > 0
    ? Math.round(loggedDietDays.reduce((s, d) => s + (actual.dailyKcal[d] ?? 0), 0) / loggedDietDays.length)
    : 0;
  const avgProtein = loggedDietDays.length > 0
    ? Math.round(loggedDietDays.reduce((s, d) => s + (actual.dailyProtein[d] ?? 0), 0) / loggedDietDays.length)
    : 0;
  const waterDays = days.filter((d) => (actual.dailyWaterMl[d] ?? 0) > 0);
  const avgWaterMl = waterDays.length > 0
    ? Math.round(waterDays.reduce((s, d) => s + (actual.dailyWaterMl[d] ?? 0), 0) / waterDays.length)
    : 0;

  const dietScore = plan.dietDaysTarget > 0
    ? clamp(Math.round((dietDaysOnTarget / plan.dietDaysTarget) * 100), 0, 100)
    : 100;
  const dietExpectedByNow = plan.dietDaysTarget * paceRatio;
  const dietStatus: ConfrontStatus = daysElapsed === 0
    ? 'pending'
    : dietDaysOnTarget >= plan.dietDaysTarget
      ? 'ok'
      : dietDaysOnTarget + 0.8 >= dietExpectedByNow
        ? 'ok'
        : 'warn';

  // Spending vs Weekly Budget
  const totalSpent = days.reduce((s, d) => s + (actual.dailySpend[d] ?? 0), 0);
  const plannedExpensesTotal = plan.plannedExpenses.reduce((s, e) => s + (Number(e.amount) || 0), 0);
  const effectiveBudget = plan.weeklyBudget > 0 ? plan.weeklyBudget : plannedExpensesTotal;
  const spendPct = effectiveBudget > 0 ? Math.round((totalSpent / effectiveBudget) * 100) : 0;
  const spendExpectedByNow = effectiveBudget * paceRatio;
  const spendStatus: ConfrontStatus = daysElapsed === 0
    ? 'pending'
    : effectiveBudget <= 0
      ? 'ok'
      : totalSpent > effectiveBudget
        ? 'over'
        : totalSpent > spendExpectedByNow * 1.15
          ? 'warn'
          : 'ok';
  const spendScore = effectiveBudget <= 0
    ? 100
    : totalSpent <= effectiveBudget
      ? 100
      : clamp(Math.round(100 - ((totalSpent - effectiveBudget) / effectiveBudget) * 100), 0, 100);

  // Habits
  let hDone = 0;
  let hDue = 0;
  for (const d of days) {
    if (d > today) continue;
    const h = actual.habitsByDay[d];
    if (h) {
      hDone += h.done;
      hDue += h.due;
    }
  }
  const habitsActualPct = hDue > 0 ? Math.round((hDone / hDue) * 100) : 0;
  const habitsScore = plan.habitsPctTarget > 0
    ? clamp(Math.round((habitsActualPct / plan.habitsPctTarget) * 100), 0, 100)
    : 100;
  const habitsStatus: ConfrontStatus = daysElapsed === 0 || hDue === 0
    ? 'pending'
    : habitsActualPct >= plan.habitsPctTarget
      ? 'ok'
      : habitsActualPct >= plan.habitsPctTarget - 15
        ? 'warn'
        : 'over';

  // Tasks & Priorities
  const activePriorities = plan.priorities.filter((p) => p.text.trim().length > 0);
  const donePriorities = activePriorities.filter((p) => p.done).length;
  const taskScore = plan.tasksTarget > 0
    ? clamp(Math.round((actual.tasksDone / plan.tasksTarget) * 100), 0, 100)
    : 100;
  const tasksExpectedByNow = plan.tasksTarget * paceRatio;
  const tasksStatus: ConfrontStatus = daysElapsed === 0
    ? 'pending'
    : actual.tasksDone >= plan.tasksTarget
      ? 'ok'
      : actual.tasksDone + 1 >= tasksExpectedByNow
        ? 'ok'
        : 'warn';

  const pillars: PillarConfrontation[] = [
    {
      id: 'treinos',
      label: 'Treinos & Cardio',
      plannedLabel: `${plan.workoutsTarget} treinos${plan.cardioTarget > 0 ? ` · ${plan.cardioTarget} cardio` : ''}`,
      actualLabel: `${workoutsDone} / ${plan.workoutsTarget}`,
      subLabel: plan.cardioTarget > 0 ? `Cardio: ${cardioDone}/${plan.cardioTarget}` : `${weekWorkouts.reduce((s, w) => s + (w.duration_min ?? 0), 0)} min totais`,
      score: workoutScore,
      barPct: workoutScore,
      status: workoutStatus,
      deltaLabel: workoutsDone >= plan.workoutsTarget
        ? 'Meta batida'
        : `Faltam ${plan.workoutsTarget - workoutsDone}`,
    },
    {
      id: 'dieta',
      label: 'Dieta & Hidratação',
      plannedLabel: `${plan.kcalDailyTarget} kcal/dia · ${plan.proteinDailyTarget}g prot`,
      actualLabel: `${dietDaysOnTarget} / ${plan.dietDaysTarget} dias`,
      subLabel: loggedDietDays.length > 0
        ? `Média ${avgKcal} kcal · ${avgProtein}g prot`
        : 'Sem refeições registradas',
      score: dietScore,
      barPct: dietScore,
      status: dietStatus,
      deltaLabel: loggedDietDays.length === 0
        ? 'Sem registros'
        : avgKcal > plan.kcalDailyTarget * 1.12
          ? `+${avgKcal - plan.kcalDailyTarget} kcal/dia`
          : avgKcal < plan.kcalDailyTarget * 0.88
            ? `${avgKcal - plan.kcalDailyTarget} kcal/dia`
            : 'Dentro da faixa',
    },
    {
      id: 'gastos',
      label: 'Gastos da Semana',
      plannedLabel: effectiveBudget > 0 ? `Teto ${formatIn(effectiveBudget, 'EUR')}` : 'Sem teto',
      actualLabel: `${spendPct}%`,
      subLabel: effectiveBudget > 0
        ? totalSpent <= effectiveBudget
          ? `Restam ${formatIn(effectiveBudget - totalSpent, 'EUR')} do teto`
          : `Estourou em ${formatIn(totalSpent - effectiveBudget, 'EUR')}`
        : 'Defina um teto semanal',
      score: spendScore,
      barPct: clamp(spendPct, 0, 100),
      status: spendStatus,
      deltaLabel: totalSpent > effectiveBudget && effectiveBudget > 0
        ? 'Acima do previsto'
        : spendStatus === 'warn'
          ? 'Ritmo alto'
          : 'Sob controle',
    },
    {
      id: 'habitos',
      label: 'Hábitos',
      plannedLabel: `Meta ${plan.habitsPctTarget}%`,
      actualLabel: hDue > 0 ? `${habitsActualPct}%` : '—',
      subLabel: hDue > 0 ? `${hDone} de ${hDue} check-ins` : 'Sem hábitos no período',
      score: hDue > 0 ? habitsScore : 100,
      barPct: hDue > 0 ? clamp(habitsActualPct, 0, 100) : 0,
      status: habitsStatus,
      deltaLabel: hDue === 0
        ? 'Aguardando'
        : habitsActualPct >= plan.habitsPctTarget
          ? `+${habitsActualPct - plan.habitsPctTarget}pp`
          : `${habitsActualPct - plan.habitsPctTarget}pp`,
    },
    {
      id: 'tarefas',
      label: 'Tarefas & Prioridades',
      plannedLabel: `${plan.tasksTarget} tarefas${activePriorities.length > 0 ? ` · ${activePriorities.length} prio.` : ''}`,
      actualLabel: `${actual.tasksDone} / ${plan.tasksTarget}`,
      subLabel: activePriorities.length > 0
        ? `Prioridades: ${donePriorities}/${activePriorities.length} concluídas`
        : 'Nenhuma prioridade definida',
      score: taskScore,
      barPct: taskScore,
      status: tasksStatus,
      deltaLabel: actual.tasksDone >= plan.tasksTarget
        ? 'Meta batida'
        : `Faltam ${plan.tasksTarget - actual.tasksDone}`,
    },
  ];

  // Overall adherence score (average of active pillars)
  const overallScore = daysElapsed === 0
    ? 0
    : Math.round(pillars.reduce((s, p) => s + p.score, 0) / pillars.length);

  // Day-by-day confrontation
  const dailyBudgetPace = effectiveBudget > 0 ? effectiveBudget / 7 : 0;
  const dayRows: DayConfrontation[] = days.map((d, idx) => {
    const plannedWorkout = (plan.dayWorkouts[idx] ?? '').trim();
    const actualWorkouts = weekWorkouts.filter((w) => w.date === d).length;
    const actualCardioMin = weekCardio
      .filter((c) => c.date === d)
      .reduce((s, c) => s + (c.duration_min ?? 0), 0);
    const isFuture = d > today;
    const isToday = d === today;

    let workoutMet: boolean | null = null;
    if (!isRestLabel(plannedWorkout)) {
      if (actualWorkouts > 0 || (plannedWorkout.toLowerCase().includes('cardio') && actualCardioMin > 0)) {
        workoutMet = true;
      } else if (!isFuture) {
        workoutMet = false;
      }
    }

    const kcal = Math.round(actual.dailyKcal[d] ?? 0);
    const protein = Math.round(actual.dailyProtein[d] ?? 0);
    const waterMl = Math.round(actual.dailyWaterMl[d] ?? 0);
    let kcalStatus: ConfrontStatus = 'pending';
    if (kcal > 0 && plan.kcalDailyTarget > 0) {
      const diff = (kcal - plan.kcalDailyTarget) / plan.kcalDailyTarget;
      kcalStatus = Math.abs(diff) <= 0.12 ? 'ok' : diff > 0.12 ? 'over' : 'warn';
    }

    const spend = actual.dailySpend[d] ?? 0;
    let spendStatus: ConfrontStatus = 'pending';
    if (spend > 0) {
      spendStatus = dailyBudgetPace > 0 && spend > dailyBudgetPace * 1.35 ? 'over' : 'ok';
    }

    const hab = actual.habitsByDay[d] ?? { done: 0, due: 0 };

    return {
      day: d,
      dayIndex: idx,
      shortLabel: MON_WEEKDAYS[idx],
      isToday,
      isFuture,
      plannedWorkout,
      actualWorkouts,
      actualCardioMin,
      workoutMet,
      kcal,
      protein,
      waterMl,
      kcalStatus,
      spend,
      spendStatus,
      habitsDone: hab.done,
      habitsDue: hab.due,
    };
  });

  // Actionable deviations
  const deviations: DeviationInsight[] = [];
  if (daysElapsed > 0) {
    if (effectiveBudget > 0 && totalSpent > effectiveBudget) {
      deviations.push({
        tone: 'danger',
        text: `Gastos ultrapassaram o teto semanal em ${Math.round(((totalSpent - effectiveBudget) / effectiveBudget) * 100)}%.`,
      });
    } else if (spendStatus === 'warn') {
      deviations.push({
        tone: 'warn',
        text: `Ritmo de gastos está acima do previsto para o dia ${daysElapsed} da semana.`,
      });
    }
    if (workoutsDone < plan.workoutsTarget && daysElapsed >= 3 && workoutsDone < Math.floor(workoutExpectedByNow)) {
      deviations.push({
        tone: 'warn',
        text: `Treinos abaixo do ritmo: ${workoutsDone} feitos de ${plan.workoutsTarget} programados.`,
      });
    } else if (workoutsDone >= plan.workoutsTarget && plan.workoutsTarget > 0) {
      deviations.push({
        tone: 'positive',
        text: `Meta semanal de treinos concluída (${workoutsDone}/${plan.workoutsTarget}).`,
      });
    }
    if (loggedDietDays.length > 0 && plan.proteinDailyTarget > 0 && avgProtein < plan.proteinDailyTarget * 0.85) {
      deviations.push({
        tone: 'warn',
        text: `Proteína média (${avgProtein}g/dia) está ${plan.proteinDailyTarget - avgProtein}g abaixo do programado.`,
      });
    }
    if (hDue > 0 && habitsActualPct < plan.habitsPctTarget - 10) {
      deviations.push({
        tone: 'warn',
        text: `Hábitos em ${habitsActualPct}%, abaixo da meta de ${plan.habitsPctTarget}%.`,
      });
    }
    if (deviations.length === 0) {
      deviations.push({
        tone: 'positive',
        text: 'Execução alinhada com o que você programou para a semana.',
      });
    }
  }

  return {
    weekStart: plan.weekStart,
    weekEnd,
    daysElapsed,
    overallScore,
    pillars,
    days: dayRows,
    deviations,
    totalSpent,
    plannedExpensesTotal,
    avgKcal,
    avgProtein,
    avgWaterMl,
    dietDaysOnTarget,
  };
}
