import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle, CalendarCheck2, CalendarRange, Check, CheckCircle2, ChevronLeft, ChevronRight,
  Copy, Dumbbell, Flame, Plus, Repeat, Save, Sparkles, Target, Trash2, Utensils, Wallet,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useTable } from '../lib/useTable';
import { addDays, toDay, type Day } from '../lib/dates';
import { formatIn } from '../lib/money';
import { sumNutrients } from '../lib/nutrition';
import { isDone, isScheduledOn, type Habit, type HabitCompletion } from '../lib/habits';
import type { Task } from '../lib/tasks';
import type { Tx } from '../lib/finance';
import {
  confrontWeek, createDefaultWeeklyPlan, formatWeekRange, isPlanningDay,
  MON_WEEKDAYS, monWeekOf, PLANNING_DAY_OPTIONS, readAllWeeklyPlans,
  readPlanningDay, readWeeklyPlan, savePlanningDay, saveWeeklyPlanLocal,
  targetWeekStartForPlanning, txAmountInEur, type ConfrontStatus, type WeeklyPlan as WeeklyPlanModel,
} from '../lib/weeklyPlan';
import { useHealth } from './health/useHealth';
import { useRates } from './finance/useRates';
import { Field, PageHeader } from '../components/ui';
import { feedback } from '../lib/feedback';

const eur = (n: number | null | undefined) => formatIn(n, 'EUR');
const toast = (text: string, kind: 'ok' | 'error' = 'ok') => feedback({ kind, text });

const I = { size: 16, strokeWidth: 1.5, 'aria-hidden': true } as const;

type Tab = 'confronto' | 'programar' | 'historico';

const STATUS_BADGE: Record<ConfrontStatus, { label: string; cls: string }> = {
  ok: { label: 'No previsto', cls: 'bg-positive/15 text-positive' },
  warn: { label: 'Atenção', cls: 'bg-warning/15 text-warning' },
  over: { label: 'Desvio', cls: 'bg-negative/15 text-negative' },
  pending: { label: 'Aguardando', cls: 'bg-raised text-fg3' },
};

const PILLAR_ICON = {
  treinos: Dumbbell,
  dieta: Utensils,
  gastos: Wallet,
  habitos: Repeat,
  tarefas: Target,
} as const;

export default function WeeklyPlan() {
  const today = toDay(new Date());
  const [planningDay, setPlanningDay] = useState<number>(() => readPlanningDay());
  const defaultWeek = useMemo(() => targetWeekStartForPlanning(today, planningDay), [today, planningDay]);
  const [weekStart, setWeekStart] = useState<Day>(() => monWeekOf(today)[0]);
  const [tab, setTab] = useState<Tab>('confronto');
  const [savedPlans, setSavedPlans] = useState<Record<Day, WeeklyPlanModel>>(() => readAllWeeklyPlans());
  const [draft, setDraft] = useState<WeeklyPlanModel>(() => readWeeklyPlan(monWeekOf(today)[0]) ?? createDefaultWeeklyPlan(monWeekOf(today)[0]));
  const [newExpLabel, setNewExpLabel] = useState('');
  const [newExpAmount, setNewExpAmount] = useState('');
  const [saving, setSaving] = useState(false);

  // Pull real data from across Painel
  const h = useHealth();
  const fx = useRates(null);
  const txs = useTable<Tx>('transactions');
  const tasks = useTable<Task>('tasks');
  const habits = useTable<Habit>('habits');
  const completions = useTable<HabitCompletion>('habit_completions', 'id,habit_id,completed_date,value');

  // Hydrate plans & planning_weekday from Supabase when available (graceful fallback to localStorage)
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const { data } = await supabase
          .from('weekly_plans')
          .select('week_start, plan')
          .order('week_start', { ascending: false })
          .limit(24);
        if (!active || !data) return;
        const merged = { ...readAllWeeklyPlans() };
        for (const row of data as { week_start: Day; plan: WeeklyPlanModel }[]) {
          if (row.week_start && row.plan && typeof row.plan === 'object') {
            const local = merged[row.week_start];
            const remoteUpdated = row.plan.updatedAt ?? '';
            const localUpdated = local?.updatedAt ?? '';
            if (!local || remoteUpdated >= localUpdated) {
              merged[row.week_start] = { ...createDefaultWeeklyPlan(row.week_start), ...row.plan, weekStart: row.week_start };
              saveWeeklyPlanLocal(merged[row.week_start]);
            }
          }
        }
        setSavedPlans(merged);
      } catch {
        /* offline or table not migrated yet — localStorage works seamlessly */
      }
    })();
    return () => { active = false; };
  }, []);

  // Sync draft when changing weekStart
  useEffect(() => {
    const existing = savedPlans[weekStart] ?? readWeeklyPlan(weekStart);
    setDraft(existing ?? createDefaultWeeklyPlan(weekStart));
  }, [weekStart, savedPlans]);

  const hasSavedPlan = Boolean(savedPlans[weekStart]);
  const isTodayPlanningDay = isPlanningDay(today, planningDay);
  const planningDayLabel = PLANNING_DAY_OPTIONS.find((o) => o.value === planningDay)?.label ?? 'Domingo';
  const currentMon = monWeekOf(today)[0];

  // Build actuals for the selected week
  const actuals = useMemo(() => {
    const days = monWeekOf(weekStart);
    const daySet = new Set(days);

    const dailyKcal: Record<Day, number> = {};
    const dailyProtein: Record<Day, number> = {};
    const dailyWaterMl: Record<Day, number> = {};
    const dailySpend: Record<Day, number> = {};
    const habitsByDay: Record<Day, { done: number; due: number }> = {};

    for (const d of days) {
      const logs = h.foodLogs.rows.filter((l) => l.date === d);
      const totals = sumNutrients(logs);
      dailyKcal[d] = Math.round(totals.kcal);
      dailyProtein[d] = Math.round(totals.protein_g);

      dailyWaterMl[d] = h.waterLogs.rows
        .filter((w) => w.date === d)
        .reduce((s, w) => s + (Number(w.ml) || 0), 0);

      dailySpend[d] = txs.rows
        .filter((t) => t.type === 'expense' && t.date === d)
        .reduce((s, t) => s + txAmountInEur(t, fx.rates?.EUR), 0);

      const dueHabits = habits.rows.filter((hb) => !hb.is_archived && hb.frequency !== 'weekly' && isScheduledOn(hb, d));
      const doneCount = dueHabits.filter((hb) => {
        const comp = completions.rows.find((c) => c.habit_id === hb.id && c.completed_date === d);
        return isDone(hb, comp);
      }).length;
      habitsByDay[d] = { done: doneCount, due: dueHabits.length };
    }

    const tasksDone = tasks.rows.filter((t) => {
      if (!t.completed_at) return false;
      const doneDay = t.completed_at.slice(0, 10);
      return daySet.has(doneDay);
    }).length;

    return {
      workouts: h.workouts.rows.filter((w) => daySet.has(w.date)),
      cardio: h.cardio.rows.filter((c) => daySet.has(c.date)),
      dailyKcal,
      dailyProtein,
      dailyWaterMl,
      dailySpend,
      tasksDone,
      habitsByDay,
    };
  }, [weekStart, h.foodLogs.rows, h.waterLogs.rows, h.workouts.rows, h.cardio.rows, txs.rows, fx.rates?.EUR, tasks.rows, habits.rows, completions.rows]);

  const activePlan = savedPlans[weekStart] ?? draft;
  const confrontation = useMemo(
    () => confrontWeek(activePlan, actuals, today),
    [activePlan, actuals, today],
  );

  // Active workout plan sessions for quick-fill
  const activeSessions = useMemo(() => {
    if (!h.workoutPlan) return [];
    return h.planSessions.rows
      .filter((s) => s.plan_id === h.workoutPlan!.id)
      .sort((a, b) => a.order_index - b.order_index);
  }, [h.workoutPlan, h.planSessions.rows]);

  function handleChangePlanningDay(day: number) {
    setPlanningDay(day);
    savePlanningDay(day);
    toast(`Dia de programação definido para ${PLANNING_DAY_OPTIONS.find((o) => o.value === day)?.label}`);
    void supabase.from('user_settings').update({ planning_weekday: day }).neq('user_id', '00000000-0000-0000-0000-000000000000');
  }

  async function persistPlan(planToSave: WeeklyPlanModel, silent = false) {
    setSaving(true);
    const stamped: WeeklyPlanModel = { ...planToSave, updatedAt: new Date().toISOString() };
    saveWeeklyPlanLocal(stamped);
    setSavedPlans((prev) => ({ ...prev, [stamped.weekStart]: stamped }));
    try {
      await supabase
        .from('weekly_plans')
        .upsert({ week_start: stamped.weekStart, plan: stamped, updated_at: stamped.updatedAt }, { onConflict: 'user_id,week_start' });
    } catch {
      /* saved locally */
    }
    setSaving(false);
    if (!silent) {
      toast('Programação da semana salva');
      setTab('confronto');
    }
  }

  function pullCurrentTargets() {
    const dayWorkouts: Record<number, string> = { ...draft.dayWorkouts };
    if (activeSessions.length > 0) {
      for (let i = 0; i < 7; i++) {
        dayWorkouts[i] = i < activeSessions.length ? activeSessions[i].label : 'Descanso';
      }
    }
    const dietTarget = h.plan ? h.targets.rows.find((t) => t.plan_id === h.plan!.id) : null;
    const waterGoal = h.profile?.water_goal_ml ?? draft.waterMlDailyTarget;
    setDraft((prev) => ({
      ...prev,
      workoutsTarget: activeSessions.length > 0 ? activeSessions.length : prev.workoutsTarget,
      dayWorkouts,
      kcalDailyTarget: dietTarget?.kcal ? Math.round(dietTarget.kcal) : prev.kcalDailyTarget,
      proteinDailyTarget: dietTarget?.protein_g ? Math.round(dietTarget.protein_g) : prev.proteinDailyTarget,
      waterMlDailyTarget: waterGoal,
    }));
    toast('Metas atuais puxadas da Ficha e Dieta');
  }

  function copyPreviousWeek() {
    const prevStart = addDays(weekStart, -7);
    const prevPlan = savedPlans[prevStart] ?? readWeeklyPlan(prevStart);
    if (!prevPlan) {
      toast('Nenhuma programação encontrada na semana anterior', 'error');
      return;
    }
    setDraft({
      ...prevPlan,
      weekStart,
      priorities: prevPlan.priorities.map((p) => ({ ...p, done: false })),
      updatedAt: new Date().toISOString(),
    });
    toast('Programação copiada da semana anterior');
  }

  function addPlannedExpense() {
    const label = newExpLabel.trim();
    const amount = Number(newExpAmount.replace(',', '.'));
    if (!label || !(amount > 0)) return;
    setDraft((prev) => {
      const nextExpenses = [...prev.plannedExpenses, { id: crypto.randomUUID(), label, amount }];
      const sum = nextExpenses.reduce((s, e) => s + e.amount, 0);
      return {
        ...prev,
        plannedExpenses: nextExpenses,
        weeklyBudget: Math.max(prev.weeklyBudget, Math.round(sum)),
      };
    });
    setNewExpLabel('');
    setNewExpAmount('');
  }

  function togglePriority(id: string) {
    const updated: WeeklyPlanModel = {
      ...activePlan,
      priorities: activePlan.priorities.map((p) => (p.id === id ? { ...p, done: !p.done } : p)),
    };
    setDraft(updated);
    void persistPlan(updated, true);
  }

  const historyList = useMemo(
    () => Object.values(savedPlans).sort((a, b) => b.weekStart.localeCompare(a.weekStart)),
    [savedPlans],
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Programação da Semana"
        subtitle={`Dia de programar: ${planningDayLabel} · Confronto automático entre previsto e realizado`}
        action={
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              className="btn-secondary h-9 px-3 text-xs"
              onClick={() => setWeekStart(addDays(weekStart, -7))}
              aria-label="Semana anterior"
            >
              <ChevronLeft {...I} />
            </button>
            <button
              type="button"
              className="btn-secondary h-9 px-3.5 text-xs"
              onClick={() => setWeekStart(currentMon)}
            >
              <CalendarRange {...I} />
              <span className="figure">{formatWeekRange(weekStart)}</span>
            </button>
            <button
              type="button"
              className="btn-secondary h-9 px-3 text-xs"
              onClick={() => setWeekStart(addDays(weekStart, 7))}
              aria-label="Próxima semana"
            >
              <ChevronRight {...I} />
            </button>
            {tab !== 'programar' && (
              <button
                type="button"
                className="btn-primary h-9 px-4 text-xs"
                onClick={() => setTab('programar')}
              >
                <Sparkles {...I} />
                {hasSavedPlan ? 'Editar programação' : 'Programar semana'}
              </button>
            )}
          </div>
        }
      />

      {/* Planning day banner when today is the user's chosen day and target week isn't programmed yet */}
      {isTodayPlanningDay && !savedPlans[defaultWeek] && (
        <div className="card-hero flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand text-on-brand shadow-[var(--btn-primary-shadow)]">
              <CalendarCheck2 size={18} strokeWidth={2} aria-hidden="true" />
            </div>
            <div>
              <p className="text-sm font-semibold text-fg">
                Hoje ({planningDayLabel}) é seu dia de programar a semana
              </p>
              <p className="mt-0.5 text-xs text-fg2">
                Defina treinos, dieta, teto de gastos, hábitos e prioridades para {formatWeekRange(defaultWeek)} e acompanhe o confronto ao longo dos dias.
              </p>
            </div>
          </div>
          <button
            type="button"
            className="btn-primary h-9 px-4 text-xs"
            onClick={() => { setWeekStart(defaultWeek); setTab('programar'); }}
          >
            Programar agora
          </button>
        </div>
      )}

      {/* Tabs */}
      <div className="segmented" role="tablist" aria-label="Visões da semana">
        <button type="button" role="tab" aria-selected={tab === 'confronto'} className={tab === 'confronto' ? 'tab-active' : 'tab'} onClick={() => setTab('confronto')}>
          Confronto (Previsto × Real)
        </button>
        <button type="button" role="tab" aria-selected={tab === 'programar'} className={tab === 'programar' ? 'tab-active' : 'tab'} onClick={() => setTab('programar')}>
          Programar Semana
        </button>
        <button type="button" role="tab" aria-selected={tab === 'historico'} className={tab === 'historico' ? 'tab-active' : 'tab'} onClick={() => setTab('historico')}>
          Histórico ({historyList.length})
        </button>
      </div>

      {/* TAB 1: CONFRONTO */}
      {tab === 'confronto' && (
        <div className="space-y-6">
          {/* Hero Score Card */}
          <section className="card-hero">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <p className="label uppercase tracking-wider">Aderência ao premeditado · {formatWeekRange(weekStart)}</p>
                <div className="mt-2 flex items-baseline gap-3">
                  <span className="figure text-5xl text-fg">{confrontation.overallScore}%</span>
                  <span className={`badge ${
                    confrontation.daysElapsed === 0
                      ? 'bg-raised text-fg3'
                      : confrontation.overallScore >= 80
                        ? 'bg-positive/15 text-positive'
                        : confrontation.overallScore >= 55
                          ? 'bg-warning/15 text-warning'
                          : 'bg-negative/15 text-negative'
                  }`}>
                    {confrontation.daysElapsed === 0
                      ? 'Semana futura'
                      : confrontation.overallScore >= 80
                        ? 'Execução forte'
                        : confrontation.overallScore >= 55
                          ? 'Ajustes pontuais'
                          : 'Fora do planejado'}
                  </span>
                </div>
                {!hasSavedPlan && (
                  <p className="mt-2 text-xs text-fg2">
                    Usando metas padrão. Clique em <strong>Programar semana</strong> para definir seu plano real desta semana.
                  </p>
                )}
                {activePlan.intention.trim() && (
                  <p className="mt-2 text-sm text-fg2">
                    Intenção: <span className="font-medium text-fg">{activePlan.intention}</span>
                  </p>
                )}
              </div>

              <div className="flex flex-col items-end gap-2">
                <div className="text-right text-xs text-fg2">
                  Dia <span className="figure text-fg">{confrontation.daysElapsed}/7</span> da semana
                </div>
                <div className="h-2.5 w-48 overflow-hidden rounded-full bg-sunken shadow-[var(--track-inset)]">
                  <div
                    className="meter-fill h-full rounded-full bg-brand"
                    style={{ width: `${confrontation.overallScore}%` }}
                  />
                </div>
              </div>
            </div>
          </section>

          {/* 5 Pillar Confrontation Cards */}
          <div className="stagger grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
            {confrontation.pillars.map((p) => {
              const Icon = PILLAR_ICON[p.id];
              const badge = STATUS_BADGE[p.status];
              const actualDisplay = p.id === 'gastos'
                ? eur(confrontation.totalSpent)
                : p.actualLabel;
              const plannedDisplay = p.id === 'gastos' && activePlan.weeklyBudget > 0
                ? `Teto ${eur(activePlan.weeklyBudget)}`
                : p.plannedLabel;
              return (
                <div key={p.id} className="card flex flex-col justify-between gap-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="flex items-center gap-2 text-xs font-medium text-fg2">
                      <Icon {...I} className="text-brand-ink" />
                      {p.label}
                    </span>
                    <span className={`badge text-[11px] ${badge.cls}`}>{badge.label}</span>
                  </div>
                  <div>
                    <div className="figure text-2xl text-fg">{actualDisplay}</div>
                    <div className="mt-0.5 text-xs text-fg3">Previsto: {plannedDisplay}</div>
                  </div>
                  <div className="space-y-1.5">
                    <div className="h-2 overflow-hidden rounded-full bg-sunken shadow-[var(--track-inset)]">
                      <div
                        className={`h-full rounded-full transition-all duration-300 ${
                          p.status === 'over' ? 'bg-negative' : p.status === 'warn' ? 'bg-warning' : 'bg-brand'
                        }`}
                        style={{ width: `${p.barPct}%` }}
                      />
                    </div>
                    <div className="flex items-center justify-between text-[11px] text-fg2">
                      <span className="truncate">{p.subLabel}</span>
                      <span className="figure shrink-0 font-semibold text-fg">{p.deltaLabel}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Deviations + Weekly Priorities */}
          <div className="grid gap-4 lg:grid-cols-2">
            <section className="card space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-fg">Desvios & Leitura da Semana</h2>
                <Flame {...I} className="text-brand-ink" />
              </div>
              {confrontation.deviations.length === 0 ? (
                <p className="text-xs text-fg3">Esta semana ainda não começou. Assim que os registros entrarem, o confronto aparece aqui.</p>
              ) : (
                <ul className="space-y-2">
                  {confrontation.deviations.map((d, idx) => (
                    <li key={idx} className="flex items-start gap-2.5 rounded-[14px] bg-raised/70 px-3.5 py-2.5 text-xs text-fg">
                      {d.tone === 'positive'
                        ? <CheckCircle2 size={15} className="mt-0.5 shrink-0 text-positive" />
                        : <AlertTriangle size={15} className={`mt-0.5 shrink-0 ${d.tone === 'danger' ? 'text-negative' : 'text-warning'}`} />}
                      <span>{d.text}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="card space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-fg">Prioridades da Semana</h2>
                <button type="button" className="btn-ghost h-7 px-2.5 text-xs" onClick={() => setTab('programar')}>
                  Editar
                </button>
              </div>
              {activePlan.priorities.filter((p) => p.text.trim()).length === 0 ? (
                <p className="text-xs text-fg3">Nenhuma prioridade definida para esta semana. Defina até 3 prioridades na aba Programar Semana.</p>
              ) : (
                <ul className="space-y-2">
                  {activePlan.priorities.filter((p) => p.text.trim()).map((p) => (
                    <li key={p.id}>
                      <button
                        type="button"
                        onClick={() => togglePriority(p.id)}
                        className="flex w-full items-center gap-3 rounded-[14px] bg-raised/70 px-3.5 py-2.5 text-left text-sm transition-colors hover:bg-raised"
                      >
                        <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${
                          p.done ? 'border-brand bg-brand text-on-brand' : 'border-line-strong bg-surface'
                        }`}>
                          {p.done && <Check size={12} strokeWidth={3} />}
                        </span>
                        <span className={p.done ? 'text-fg3 line-through' : 'text-fg'}>{p.text}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>

          {/* Day-by-Day Confrontation Matrix */}
          <section className="card space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="text-sm font-semibold text-fg">Grade Dia a Dia: Previsto × Realizado</h2>
                <p className="text-xs text-fg3">Cada dia confronta o treino previsto, calorias, gastos e hábitos registrados.</p>
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-7">
              {confrontation.days.map((d) => (
                <div
                  key={d.day}
                  className={`flex flex-col justify-between gap-2.5 rounded-[16px] p-3 transition-colors ${
                    d.isToday
                      ? 'bg-[var(--tonal)] ring-1 ring-brand/40'
                      : 'bg-raised/60'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-fg">
                      {d.shortLabel} <span className="figure font-normal text-fg3">{d.day.slice(8)}/{d.day.slice(5, 7)}</span>
                    </span>
                    {d.isToday && <span className="h-2 w-2 rounded-full bg-brand" title="Hoje" />}
                  </div>

                  {/* Planned vs Actual Workout */}
                  <div className="space-y-1 border-t border-line pt-2 text-[11px]">
                    <div className="truncate font-medium text-fg2" title={d.plannedWorkout || 'Livre'}>
                      {d.plannedWorkout || 'Livre'}
                    </div>
                    <div className="flex items-center gap-1">
                      {d.workoutMet === true && <span className="badge bg-positive/15 px-1.5 py-0 text-[10px] text-positive">Treino ✓</span>}
                      {d.workoutMet === false && <span className="badge bg-negative/15 px-1.5 py-0 text-[10px] text-negative">Pendente</span>}
                      {d.workoutMet === null && d.actualWorkouts > 0 && <span className="badge bg-positive/15 px-1.5 py-0 text-[10px] text-positive">Extra ✓</span>}
                      {d.actualCardioMin > 0 && <span className="figure text-[10px] text-fg3">{d.actualCardioMin}m cardio</span>}
                    </div>
                  </div>

                  {/* Diet, Spend, Habits */}
                  <div className="space-y-1 border-t border-line pt-2 text-[11px]">
                    <div className="flex items-center justify-between">
                      <span className="text-fg3">Dieta</span>
                      <span className={`figure ${
                        d.kcalStatus === 'ok' ? 'text-positive' : d.kcalStatus === 'over' ? 'text-negative' : 'text-fg2'
                      }`}>
                        {d.kcal > 0 ? `${d.kcal} kcal` : '—'}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-fg3">Gastos</span>
                      <span className={`figure ${d.spendStatus === 'over' ? 'text-negative' : 'text-fg2'}`}>
                        {d.spend > 0 ? eur(d.spend) : '—'}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-fg3">Hábitos</span>
                      <span className="figure text-fg2">
                        {d.habitsDue > 0 ? `${d.habitsDone}/${d.habitsDue}` : '—'}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>
      )}

      {/* TAB 2: PROGRAMAR SEMANA */}
      {tab === 'programar' && (
        <div className="space-y-6">
          {/* Planning Day Selector + Quick-Fill Toolbar */}
          <section className="card space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold text-fg">Dia fixo para programar a semana</h2>
                <p className="text-xs text-fg3">Escolha o dia da semana em que você senta para planejar treinos, dieta e gastos.</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button type="button" className="btn-secondary h-9 px-3.5 text-xs" onClick={pullCurrentTargets}>
                  <Sparkles {...I} />
                  Puxar das metas atuais
                </button>
                <button type="button" className="btn-secondary h-9 px-3.5 text-xs" onClick={copyPreviousWeek}>
                  <Copy {...I} />
                  Copiar semana anterior
                </button>
              </div>
            </div>
            <div className="flex flex-wrap gap-2" role="group" aria-label="Dia de programação">
              {PLANNING_DAY_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  data-active={planningDay === opt.value}
                  aria-pressed={planningDay === opt.value}
                  className="tactile-chip"
                  onClick={() => handleChangePlanningDay(opt.value)}
                >
                  {opt.short}
                </button>
              ))}
            </div>
          </section>

          <div className="grid gap-6 lg:grid-cols-2">
            {/* Workouts & Day-by-Day Schedule */}
            <section className="card space-y-4">
              <div className="flex items-center gap-2">
                <Dumbbell {...I} className="text-brand-ink" />
                <h2 className="text-sm font-semibold text-fg">Treinos & Cardio ({formatWeekRange(weekStart)})</h2>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Treinos na semana">
                  <input
                    type="number"
                    min={0}
                    max={14}
                    className="input figure"
                    value={draft.workoutsTarget}
                    onChange={(e) => setDraft({ ...draft, workoutsTarget: Math.max(0, Number(e.target.value) || 0) })}
                  />
                </Field>
                <Field label="Sessões de cardio">
                  <input
                    type="number"
                    min={0}
                    max={14}
                    className="input figure"
                    value={draft.cardioTarget}
                    onChange={(e) => setDraft({ ...draft, cardioTarget: Math.max(0, Number(e.target.value) || 0) })}
                  />
                </Field>
              </div>
              <div className="space-y-2">
                <p className="label">O que está previsto em cada dia</p>
                <div className="grid gap-2">
                  {MON_WEEKDAYS.map((wdLabel, idx) => (
                    <div key={wdLabel} className="flex items-center gap-2">
                      <span className="w-10 shrink-0 text-xs font-semibold text-fg2">{wdLabel}</span>
                      <input
                        type="text"
                        className="input h-9 text-xs"
                        placeholder="Ex: Treino A — Peito ou Descanso"
                        list="active-sessions-list"
                        value={draft.dayWorkouts[idx] ?? ''}
                        onChange={(e) => setDraft({
                          ...draft,
                          dayWorkouts: { ...draft.dayWorkouts, [idx]: e.target.value },
                        })}
                      />
                    </div>
                  ))}
                  <datalist id="active-sessions-list">
                    <option value="Descanso" />
                    <option value="Cardio" />
                    {activeSessions.map((s) => (
                      <option key={s.id} value={s.label} />
                    ))}
                  </datalist>
                </div>
              </div>
            </section>

            {/* Diet & Hydration */}
            <section className="card space-y-4">
              <div className="flex items-center gap-2">
                <Utensils {...I} className="text-brand-ink" />
                <h2 className="text-sm font-semibold text-fg">Dieta & Hidratação</h2>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Meta diária (kcal)">
                  <input
                    type="number"
                    min={0}
                    step={50}
                    className="input figure"
                    value={draft.kcalDailyTarget}
                    onChange={(e) => setDraft({ ...draft, kcalDailyTarget: Math.max(0, Number(e.target.value) || 0) })}
                  />
                </Field>
                <Field label="Proteína diária (g)">
                  <input
                    type="number"
                    min={0}
                    step={5}
                    className="input figure"
                    value={draft.proteinDailyTarget}
                    onChange={(e) => setDraft({ ...draft, proteinDailyTarget: Math.max(0, Number(e.target.value) || 0) })}
                  />
                </Field>
                <Field label="Água diária (ml)">
                  <input
                    type="number"
                    min={0}
                    step={250}
                    className="input figure"
                    value={draft.waterMlDailyTarget}
                    onChange={(e) => setDraft({ ...draft, waterMlDailyTarget: Math.max(0, Number(e.target.value) || 0) })}
                  />
                </Field>
                <Field label="Dias dentro da meta (0–7)">
                  <input
                    type="number"
                    min={0}
                    max={7}
                    className="input figure"
                    value={draft.dietDaysTarget}
                    onChange={(e) => setDraft({ ...draft, dietDaysTarget: Math.min(7, Math.max(0, Number(e.target.value) || 0)) })}
                  />
                </Field>
              </div>
            </section>

            {/* Weekly Budget & Planned Expenses */}
            <section className="card space-y-4">
              <div className="flex items-center gap-2">
                <Wallet {...I} className="text-brand-ink" />
                <h2 className="text-sm font-semibold text-fg">Gastos & Orçamento da Semana</h2>
              </div>
              <Field label="Teto total de gastos da semana (€)">
                <input
                  type="number"
                  min={0}
                  step={10}
                  className="input figure"
                  value={draft.weeklyBudget}
                  onChange={(e) => setDraft({ ...draft, weeklyBudget: Math.max(0, Number(e.target.value) || 0) })}
                />
              </Field>
              <div className="space-y-2">
                <p className="label">Gastos previstos específicos (opcional)</p>
                <div className="flex gap-2">
                  <input
                    type="text"
                    className="input h-9 flex-1 text-xs"
                    placeholder="Ex: Supermercado, Combustível"
                    value={newExpLabel}
                    onChange={(e) => setNewExpLabel(e.target.value)}
                  />
                  <input
                    type="number"
                    className="input figure h-9 w-28 text-xs"
                    placeholder="Valor (€)"
                    value={newExpAmount}
                    onChange={(e) => setNewExpAmount(e.target.value)}
                  />
                  <button type="button" className="btn-secondary h-9 px-3 text-xs" onClick={addPlannedExpense}>
                    <Plus {...I} />
                  </button>
                </div>
                {draft.plannedExpenses.length > 0 && (
                  <ul className="space-y-1.5 pt-1">
                    {draft.plannedExpenses.map((exp) => (
                      <li key={exp.id} className="flex items-center justify-between rounded-[12px] bg-raised/70 px-3 py-2 text-xs">
                        <span className="text-fg">{exp.label}</span>
                        <div className="flex items-center gap-2">
                          <span className="figure text-fg2">{eur(exp.amount)}</span>
                          <button
                            type="button"
                            className="icon-btn h-6 w-6"
                            aria-label={`Remover ${exp.label}`}
                            onClick={() => setDraft({ ...draft, plannedExpenses: draft.plannedExpenses.filter((x) => x.id !== exp.id) })}
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </section>

            {/* Tasks, Habits & 3 Priorities */}
            <section className="card space-y-4">
              <div className="flex items-center gap-2">
                <Target {...I} className="text-brand-ink" />
                <h2 className="text-sm font-semibold text-fg">Hábitos, Tarefas & Prioridades</h2>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Meta de tarefas concluídas">
                  <input
                    type="number"
                    min={0}
                    className="input figure"
                    value={draft.tasksTarget}
                    onChange={(e) => setDraft({ ...draft, tasksTarget: Math.max(0, Number(e.target.value) || 0) })}
                  />
                </Field>
                <Field label="Meta de hábitos (%)">
                  <input
                    type="number"
                    min={0}
                    max={100}
                    step={5}
                    className="input figure"
                    value={draft.habitsPctTarget}
                    onChange={(e) => setDraft({ ...draft, habitsPctTarget: Math.min(100, Math.max(0, Number(e.target.value) || 0)) })}
                  />
                </Field>
              </div>
              <div className="space-y-2">
                <p className="label">3 prioridades-chave da semana</p>
                {draft.priorities.map((p, idx) => (
                  <input
                    key={p.id}
                    type="text"
                    className="input h-9 text-xs"
                    placeholder={`Prioridade ${idx + 1}`}
                    value={p.text}
                    onChange={(e) => setDraft({
                      ...draft,
                      priorities: draft.priorities.map((x) => (x.id === p.id ? { ...x, text: e.target.value } : x)),
                    })}
                  />
                ))}
              </div>
              <Field label="Intenção / foco principal da semana">
                <input
                  type="text"
                  className="input h-9 text-xs"
                  placeholder="Ex: Fechar a semana 100% na dieta e sem gastos por impulso"
                  value={draft.intention}
                  onChange={(e) => setDraft({ ...draft, intention: e.target.value })}
                />
              </Field>
            </section>
          </div>

          <div className="flex justify-end gap-3">
            <button type="button" className="btn-secondary" onClick={() => setTab('confronto')}>
              Cancelar
            </button>
            <button
              type="button"
              className="btn-primary px-6"
              disabled={saving}
              onClick={() => void persistPlan(draft)}
            >
              <Save {...I} />
              {saving ? 'Salvando...' : 'Salvar programação da semana'}
            </button>
          </div>
        </div>
      )}

      {/* TAB 3: HISTÓRICO */}
      {tab === 'historico' && (
        <section className="card space-y-3">
          <h2 className="text-sm font-semibold text-fg">Semanas programadas</h2>
          {historyList.length === 0 ? (
            <p className="text-xs text-fg3">Você ainda não salvou nenhuma programação semanal.</p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {historyList.map((pl) => (
                <button
                  key={pl.weekStart}
                  type="button"
                  onClick={() => { setWeekStart(pl.weekStart); setTab('confronto'); }}
                  className="flex flex-col gap-2 rounded-[16px] bg-raised/70 p-4 text-left transition-colors hover:bg-raised"
                >
                  <div className="flex items-center justify-between">
                    <span className="figure text-sm font-semibold text-fg">{formatWeekRange(pl.weekStart)}</span>
                    <span className="badge bg-surface text-[11px] text-fg2">Ver confronto</span>
                  </div>
                  <div className="flex flex-wrap gap-2 text-xs text-fg2">
                    <span>{pl.workoutsTarget} treinos</span>
                    <span>·</span>
                    <span>{pl.kcalDailyTarget} kcal</span>
                    <span>·</span>
                    <span>Teto {eur(pl.weeklyBudget)}</span>
                  </div>
                  {pl.intention && <p className="truncate text-xs text-fg3">{pl.intention}</p>}
                </button>
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
