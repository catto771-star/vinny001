import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight, Droplets, Dumbbell, Flame, Sparkles, Utensils } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { write } from '../../lib/useTable';
import { addDays, formatDay, toDay } from '../../lib/dates';
import { num } from '../../lib/format';
import { cardioKcal, DEFAULT_SETTINGS, lastWorkingSets, suggestNext, weeklyStats, weekStart, workoutSummary } from '../../lib/training';
import { analyzeMuscleSymmetry, weightedMuscleDistribution, workoutKcal } from '../../lib/hevy';
import { sessionsForDay } from '../../lib/plans';
import { computeCrossModuleSynergy, findMatchingTrainingHabits } from '../../lib/crossModuleIntelligence';
import { sumNutrients } from '../../lib/nutrition';
import { weightTrend } from '../../lib/energy';
import { computeEnergySummary, computeWeightGoalForecast } from '../../lib/metabolism';
import { AreaChart, TargetBar } from '../../components/Charts';
import { Empty } from '../../components/ui';
import { openAssistantDrawer } from '../../components/AssistantDrawer';
import FastingWidget from './FastingWidget';
import { energyForDay } from './energyForDay';
import { DEFAULT_WEIGHT_KG, type Health } from './useHealth';

const short = (day: string) => `${day.slice(8)}/${day.slice(5, 7)}`;
const I = { size: 16, strokeWidth: 1.5, 'aria-hidden': true } as const;

export default function Today({ h, onGo }: { h: Health; onGo: (tab: 'Treino' | 'Dieta' | 'Plano' | 'Oráculo' | 'Jejum' | 'Painel') => void }) {
  const today = toDay(new Date());
  const weightKg = h.latestWeight ?? DEFAULT_WEIGHT_KG;
  const workouts = h.workouts.rows.filter((w) => w.date === today);
  const cardio = h.cardio.rows.filter((c) => c.date === today);
  const todayLogs = h.foodLogs.rows.filter((l) => l.date === today);
  const totals = sumNutrients(todayLogs);
  const { burned, trainingMinutes, dayType, target } = energyForDay(h, today);
  const weekCur = weeklyStats(today, 2, h.sets.rows, h.workouts.rows, h.typeById).at(-1);
  const trend = weightTrend(h.weighIns);

  const drunkMl = h.waterLogs.rows.filter((w) => w.date === today).reduce((acc, w) => acc + w.ml, 0);
  const baseWaterGoalMl = h.profile?.water_goal_ml ?? 2500;
  const waterCupMl = h.profile?.water_cup_ml ?? 250;

  const energy = computeEnergySummary({
    consumedKcal: totals.kcal,
    macros: totals,
    metabolic: {
      weightKg,
      heightCm: h.profile?.height_cm,
      sex: h.profile?.sex,
      birthDate: h.profile?.birth_date,
      bodyFatPct: h.latestBodyFatPct,
      customBmr: h.profile?.custom_bmr,
      asOfDate: today,
    },
    activityLevel: h.profile?.activity_level ?? 'lightly_active',
    exerciseBurnedKcal: burned,
    includeTef: h.profile?.include_tef ?? true,
    targetKcal: target?.kcal ?? null,
  });

  // Cross-module weekly muscle symmetry + scheduled routine + habit status
  const weekSymmetry = useMemo(() => {
    const mon = weekStart(today);
    const end = addDays(mon, 7);
    const weekIds = new Set(h.workouts.rows.filter((w) => w.date >= mon && w.date < end).map((w) => w.id));
    const weekSets = h.sets.rows.filter((s) => weekIds.has(s.workout_id));
    return analyzeMuscleSymmetry(weightedMuscleDistribution(weekSets, h.exerciseById, h.typeById));
  }, [today, h.workouts.rows, h.sets.rows, h.exerciseById, h.typeById]);

  const scheduledToday = useMemo(() => {
    if (!h.workoutPlan) return null;
    const planSessions = h.planSessions.rows.filter((s) => s.plan_id === h.workoutPlan!.id);
    const found = sessionsForDay(planSessions, h.workouts.rows, today);
    return found[0]?.label ?? null;
  }, [h.workoutPlan, h.planSessions.rows, h.workouts.rows, today]);

  const trainingHabitsStatus = useMemo(() => {
    const matched = findMatchingTrainingHabits(h.habits?.rows ?? [], workouts.length === 0 && cardio.length > 0 ? 'cardio' : 'workout', h.workoutPlan?.habit_id);
    let doneCount = 0;
    let pendingCount = 0;
    for (const hb of matched) {
      const comp = h.habitCompletions?.rows.find((c) => c.habit_id === hb.id && c.completed_date === today);
      const isDone = comp && (hb.target_value == null ? comp.value > 0 : comp.value >= hb.target_value);
      if (isDone) doneCount += 1;
      else pendingCount += 1;
    }
    return { doneCount, pendingCount };
  }, [h.habits?.rows, h.habitCompletions?.rows, h.workoutPlan?.habit_id, workouts.length, cardio.length, today]);

  const synergy = useMemo(
    () =>
      computeCrossModuleSynergy({
        today,
        trainedToday: workouts.length + cardio.length > 0,
        scheduledSessionLabel: scheduledToday,
        burnedKcalToday: burned,
        trainingMinutesToday: trainingMinutes,
        consumedKcal: totals.kcal,
        targetKcal: target?.kcal ?? null,
        totalExpenditureKcal: energy.totalExpenditure,
        consumedProteinG: totals.protein_g,
        targetProteinG: target?.protein_g ?? null,
        weightKg,
        drunkWaterMl: drunkMl,
        baseWaterGoalMl,
        activeFastStartedAt: h.activeFast?.started_at ?? null,
        completedTrainingHabitsCount: trainingHabitsStatus.doneCount,
        pendingTrainingHabitsCount: trainingHabitsStatus.pendingCount,
        pushPullRatio: weekSymmetry.pushPullRatio,
        legsSetsWeek: weekSymmetry.legsSets,
        upperSetsWeek: weekSymmetry.pushSets + weekSymmetry.pullSets,
      }),
    [
      today, workouts.length, cardio.length, scheduledToday, burned, trainingMinutes,
      totals.kcal, totals.protein_g, target, energy.totalExpenditure, weightKg,
      drunkMl, baseWaterGoalMl, h.activeFast?.started_at, trainingHabitsStatus, weekSymmetry,
    ],
  );

  const effectiveWaterGoalMl = synergy.adjustedWaterGoalMl;

  const goalForecast = h.profile?.target_weight_kg && h.latestWeight
    ? computeWeightGoalForecast({
        currentWeightKg: h.latestWeight,
        targetWeightKg: h.profile.target_weight_kg,
        weeklyRateKg: h.profile.weekly_rate_kg,
        maintenanceKcal: energy.bmr + energy.baselineActivity,
        today,
      })
    : null;

  // Next steps for the exercises of the most recent workout.
  const last = h.workouts.rows.find((w) => w.date < today);
  const nextUp = last
    ? [...new Set(h.sets.rows.filter((s) => s.workout_id === last.id).map((s) => s.exercise_id))].map((id) => ({
      id, s: suggestNext(lastWorkingSets(id, h.sets.rows, h.workouts.rows, h.typeById, today), h.settingsById.get(id) ?? DEFAULT_SETTINGS),
    })).filter((x) => x.s)
    : [];

  return (
    <div className="space-y-6">
      {/* 4 Quiet Graphite Stat Cards */}
      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <div className="card">
          <div className="label">Peso atual</div>
          <div className="figure mt-3 truncate text-[28px] leading-none font-medium text-fg">
            {h.latestWeight ? `${num(h.latestWeight)} kg` : '—'}
          </div>
          <div className="mt-3 text-xs text-fg3">
            {goalForecast?.forecastDate
              ? `Meta ${num(goalForecast.targetWeightKg)} kg · prev. ${formatDay(goalForecast.forecastDate).split(',')[1]?.trim() ?? goalForecast.forecastDate}`
              : trend.length
                ? `${trend.length} ${trend.length === 1 ? 'pesagem registrada' : 'pesagens registradas'}`
                : 'sem pesagens'}
          </div>
        </div>

        <div className="card">
          <div className="label">Calorias hoje</div>
          <div className="figure mt-3 truncate text-[28px] leading-none font-medium text-fg">
            {num(totals.kcal)}
          </div>
          <div className="mt-3 text-xs text-fg3">
            {target ? `meta de ${num(target.kcal)} kcal` : `gasto total ${num(energy.totalExpenditure)} kcal`}
          </div>
        </div>

        <div className="card">
          <div className="mb-1 flex items-center justify-between">
            <span className="label">Hidratação</span>
            <button
              type="button"
              className="rounded border border-line px-1.5 py-0.5 text-[11px] text-fg2 hover:bg-raised"
              onClick={async () => {
                if (await write(supabase.from('water_logs').insert({ date: today, ml: waterCupMl, logged_time: new Date().toTimeString().slice(0, 5) }))) {
                  void h.waterLogs.reload();
                }
              }}
            >
              +{waterCupMl} mL
            </button>
          </div>
          <div className="figure mt-2 truncate text-[28px] leading-none font-medium text-fg">
            {num(drunkMl)} <span className="text-sm font-normal text-fg3">mL</span>
          </div>
          <div className="mt-3 flex items-center gap-1.5 text-xs text-fg3">
            <Droplets size={12} strokeWidth={1.5} className="text-info" />
            meta {num(effectiveWaterGoalMl)} mL ({Math.round((drunkMl / effectiveWaterGoalMl) * 100)}%)
            {synergy.sweatBonusMl > 0 && <span className="text-brand">+{synergy.sweatBonusMl} treino</span>}
          </div>
        </div>

        <div className="card">
          <div className="label">Gasto total hoje</div>
          <div className="figure mt-3 text-[28px] leading-none font-medium text-fg">
            {num(energy.totalExpenditure)} <span className="text-sm font-normal text-fg3">kcal</span>
          </div>
          <div className="mt-3 text-xs text-fg3">
            TMB {num(energy.bmr)} · {dayType === 'training' ? `Atividades ${num(burned)} kcal` : `${weekCur?.sessions ?? 0} treinos/sem`}
          </div>
        </div>
      </div>

      {/* Cross-Module Synergy Hub */}
      {synergy.insights.length > 0 && (
        <section className="card">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <div className="mr-auto">
              <div className="flex items-center gap-2">
                <h2 className="text-[15px] leading-6 font-medium text-fg">Sinergia entre Módulos</h2>
                <span className="figure rounded-md border border-line bg-raised px-2 py-0.5 text-xs font-medium text-fg2">
                  Índice {synergy.synergyScore}%
                </span>
              </div>
              <p className="text-xs text-fg3">
                Cruzamento em tempo real entre Treino, Gasto Calórico, Dieta, Hidratação, Jejum e Hábitos
              </p>
            </div>
            <button
              type="button"
              className="btn-secondary h-8 px-2.5 text-xs"
              onClick={() =>
                openAssistantDrawer({
                  prompt: 'Cruze meus dados de hoje (treino, gasto calórico, calorias/proteína consumidas, hidratação, jejum e hábitos) e me dê um plano objetivo para fechar o dia em alta performance.',
                  newThread: true,
                })
              }
            >
              <Sparkles size={13} strokeWidth={1.5} /> Otimizar dia com IA
            </button>
          </div>

          <div className="grid gap-2.5 md:grid-cols-2">
            {synergy.insights.slice(0, 4).map((ins) => (
              <div
                key={ins.id}
                className="flex flex-col justify-between rounded-xl border border-line bg-raised/35 p-3"
              >
                <div>
                  <div className="flex items-center gap-1.5 text-xs font-medium text-fg">
                    <span
                      className={`h-2 w-2 shrink-0 rounded-full ${
                        ins.tone === 'positive'
                          ? 'bg-positive'
                          : ins.tone === 'warning'
                            ? 'bg-warning'
                            : ins.tone === 'brand'
                              ? 'bg-brand'
                              : 'bg-fg3'
                      }`}
                    />
                    <span>{ins.title}</span>
                  </div>
                  <p className="mt-1 text-xs text-fg3">{ins.detail}</p>
                </div>

                <div className="mt-2.5 flex items-center gap-2">
                  {ins.actionTab && (
                    <button
                      type="button"
                      className="text-xs font-medium text-fg2 underline hover:text-fg"
                      onClick={() => onGo(ins.actionTab!)}
                    >
                      {ins.actionLabel ?? ins.actionTab}
                    </button>
                  )}
                  {ins.actionRoute && (
                    <Link to={ins.actionRoute} className="text-xs font-medium text-fg2 underline hover:text-fg">
                      {ins.actionLabel ?? 'Abrir'}
                    </Link>
                  )}
                  <button
                    type="button"
                    className="ml-auto inline-flex items-center gap-1 text-xs text-brand hover:underline"
                    onClick={() => openAssistantDrawer({ prompt: ins.aiPrompt, newThread: true })}
                  >
                    <Sparkles size={12} strokeWidth={1.5} /> Perguntar à IA
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Live Intermittent Fasting Card */}
      <FastingWidget h={h} compact />

      {/* Centerpiece Weight Evolution Chart */}
      {trend.length > 0 && (
        <AreaChart
          title="Evolução de peso"
          subtitle="Média móvel das pesagens registradas"
          unit="kg"
          minZero={false}
          height={260}
          invertDelta
          tone="var(--brand)"
          points={trend.map((t) => ({
            label: short(t.date),
            value: t.trend_kg,
            detail: `pesagem ${num(t.weight_kg)} kg`,
          }))}
        />
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="card flex flex-col">
          <div className="mb-4 flex items-center gap-2">
            <h2 className="mr-auto text-[15px] leading-6 font-medium text-fg">Treino de hoje</h2>
            <button type="button" className="btn-ghost h-8 px-2 text-xs" onClick={() => onGo('Treino')}>
              Abrir treino <ArrowUpRight {...I} />
            </button>
          </div>
          {workouts.length === 0 && cardio.length === 0 && (
            <Empty
              icon={<Dumbbell size={18} strokeWidth={1.5} />}
              action={<button type="button" className="btn-secondary" onClick={() => onGo('Treino')}>{scheduledToday ? `Iniciar ${scheduledToday}` : 'Registrar treino'}</button>}
            >
              {scheduledToday ? `Previsto hoje na ficha: ${scheduledToday}` : 'Nenhum treino ou cardio registrado hoje'}
            </Empty>
          )}
          <div className="space-y-1.5">
            {workouts.map((w) => {
              const wSets = h.sets.rows.filter((x) => x.workout_id === w.id);
              const s = workoutSummary(w, h.sets.rows, h.workouts.rows, h.typeById);
              const wBurn = workoutKcal(w, wSets, h.typeById, weightKg);
              return (
                <div key={w.id} className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="font-medium text-fg">{w.title || 'Treino'}</span>
                  <span className="text-fg3">
                    · {s.sets} séries · <span className="figure">{num(s.tonnage)}</span> kg
                    {s.records.length ? ` · ${s.records.length} PR` : ''}
                  </span>
                  <span className="ml-auto inline-flex items-center gap-1 text-xs text-fg2">
                    <Flame size={12} strokeWidth={1.5} className="text-brand" />
                    <span className="figure">{wBurn.estimated ? '~' : ''}{num(wBurn.kcal)} kcal</span>
                  </span>
                </div>
              );
            })}
            {cardio.map((c) => {
              const cBurn = cardioKcal(c, weightKg);
              return (
                <div key={c.id} className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="font-medium capitalize text-fg">{c.cardio_type}</span>
                  <span className="text-fg3">
                    · {Math.round(c.duration_s / 60)} min{c.distance_km ? ` · ${num(c.distance_km)} km` : ''}
                  </span>
                  <span className="ml-auto inline-flex items-center gap-1 text-xs text-fg2">
                    <Flame size={12} strokeWidth={1.5} className="text-brand" />
                    <span className="figure">{cBurn.estimated ? '~' : ''}{num(cBurn.kcal)} kcal</span>
                  </span>
                </div>
              );
            })}
          </div>
          {nextUp.length > 0 && (
            <div className="mt-4 border-t border-line pt-4">
              <div className="label mb-2">Próxima sessão ({last?.title || 'último treino'})</div>
              <ul className="space-y-1 text-sm">
                {nextUp.map(({ id, s }) => (
                  <li key={id}>{h.exerciseById.get(id)?.name}: {s!.action === 'increase_reps' ? `${num(s!.load_kg)} kg × ${s!.reps.join(', ')}` : `${num(s!.load_kg)} kg × ${s!.reps}`}</li>
                ))}
              </ul>
            </div>
          )}
        </section>

        <section className="card flex flex-col">
          <div className="mb-4 flex items-center gap-2">
            <h2 className="mr-auto text-[15px] leading-6 font-medium text-fg">Dieta de hoje</h2>
            <button type="button" className="btn-ghost h-8 px-2 text-xs" onClick={() => onGo('Oráculo')}>
              <Sparkles size={14} strokeWidth={1.5} /> Oráculo IA
            </button>
            <button type="button" className="btn-ghost h-8 px-2 text-xs" onClick={() => onGo('Dieta')}>
              Abrir dieta <ArrowUpRight {...I} />
            </button>
          </div>
          {target ? (
            <>
              <TargetBar label="Calorias" consumed={totals.kcal} target={target.kcal} unit="kcal" />
              <TargetBar label="Proteína" consumed={totals.protein_g} target={target.protein_g} unit="g" />
              <TargetBar label="Carboidrato" consumed={totals.carbs_g} target={target.carbs_g} unit="g" />
              <TargetBar label="Gordura" consumed={totals.fat_g} target={target.fat_g} unit="g" />
              <p className="mt-auto text-xs text-fg3">Base: {target.basis}</p>
            </>
          ) : (
            <Empty
              icon={<Utensils size={18} strokeWidth={1.5} />}
              action={<button type="button" className="btn-secondary" onClick={() => onGo('Plano')}>Configurar metas no Plano</button>}
            >
              Cadastre suas metas diárias de calorias e macros para acompanhar o dia aqui
            </Empty>
          )}
        </section>
      </div>
    </div>
  );
}
