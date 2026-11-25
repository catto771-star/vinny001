import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
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
import { DEFAULT_WEIGHT_KG } from './useHealth';
const short = (day) => `${day.slice(8)}/${day.slice(5, 7)}`;
const I = { size: 16, strokeWidth: 1.5, 'aria-hidden': true };
export default function Today({ h, onGo }) {
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
        if (!h.workoutPlan)
            return null;
        const planSessions = h.planSessions.rows.filter((s) => s.plan_id === h.workoutPlan.id);
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
            if (isDone)
                doneCount += 1;
            else
                pendingCount += 1;
        }
        return { doneCount, pendingCount };
    }, [h.habits?.rows, h.habitCompletions?.rows, h.workoutPlan?.habit_id, workouts.length, cardio.length, today]);
    const synergy = useMemo(() => computeCrossModuleSynergy({
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
    }), [
        today, workouts.length, cardio.length, scheduledToday, burned, trainingMinutes,
        totals.kcal, totals.protein_g, target, energy.totalExpenditure, weightKg,
        drunkMl, baseWaterGoalMl, h.activeFast?.started_at, trainingHabitsStatus, weekSymmetry,
    ]);
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
    return (_jsxs("div", { className: "space-y-6", children: [_jsxs("div", { className: "grid grid-cols-2 gap-4 xl:grid-cols-4", children: [_jsxs("div", { className: "card", children: [_jsx("div", { className: "label", children: "Peso atual" }), _jsx("div", { className: "figure mt-3 truncate text-[28px] leading-none font-medium text-fg", children: h.latestWeight ? `${num(h.latestWeight)} kg` : '—' }), _jsx("div", { className: "mt-3 text-xs text-fg3", children: goalForecast?.forecastDate
                                    ? `Meta ${num(goalForecast.targetWeightKg)} kg · prev. ${formatDay(goalForecast.forecastDate).split(',')[1]?.trim() ?? goalForecast.forecastDate}`
                                    : trend.length
                                        ? `${trend.length} ${trend.length === 1 ? 'pesagem registrada' : 'pesagens registradas'}`
                                        : 'sem pesagens' })] }), _jsxs("div", { className: "card", children: [_jsx("div", { className: "label", children: "Calorias hoje" }), _jsx("div", { className: "figure mt-3 truncate text-[28px] leading-none font-medium text-fg", children: num(totals.kcal) }), _jsx("div", { className: "mt-3 text-xs text-fg3", children: target ? `meta de ${num(target.kcal)} kcal` : `gasto total ${num(energy.totalExpenditure)} kcal` })] }), _jsxs("div", { className: "card", children: [_jsxs("div", { className: "mb-1 flex items-center justify-between", children: [_jsx("span", { className: "label", children: "Hidrata\u00E7\u00E3o" }), _jsxs("button", { type: "button", className: "rounded border border-line px-1.5 py-0.5 text-[11px] text-fg2 hover:bg-raised", onClick: async () => {
                                            if (await write(supabase.from('water_logs').insert({ date: today, ml: waterCupMl, logged_time: new Date().toTimeString().slice(0, 5) }))) {
                                                void h.waterLogs.reload();
                                            }
                                        }, children: ["+", waterCupMl, " mL"] })] }), _jsxs("div", { className: "figure mt-2 truncate text-[28px] leading-none font-medium text-fg", children: [num(drunkMl), " ", _jsx("span", { className: "text-sm font-normal text-fg3", children: "mL" })] }), _jsxs("div", { className: "mt-3 flex items-center gap-1.5 text-xs text-fg3", children: [_jsx(Droplets, { size: 12, strokeWidth: 1.5, className: "text-info" }), "meta ", num(effectiveWaterGoalMl), " mL (", Math.round((drunkMl / effectiveWaterGoalMl) * 100), "%)", synergy.sweatBonusMl > 0 && _jsxs("span", { className: "text-brand", children: ["+", synergy.sweatBonusMl, " treino"] })] })] }), _jsxs("div", { className: "card", children: [_jsx("div", { className: "label", children: "Gasto total hoje" }), _jsxs("div", { className: "figure mt-3 text-[28px] leading-none font-medium text-fg", children: [num(energy.totalExpenditure), " ", _jsx("span", { className: "text-sm font-normal text-fg3", children: "kcal" })] }), _jsxs("div", { className: "mt-3 text-xs text-fg3", children: ["TMB ", num(energy.bmr), " \u00B7 ", dayType === 'training' ? `Atividades ${num(burned)} kcal` : `${weekCur?.sessions ?? 0} treinos/sem`] })] })] }), synergy.insights.length > 0 && (_jsxs("section", { className: "card", children: [_jsxs("div", { className: "mb-3 flex flex-wrap items-center gap-2", children: [_jsxs("div", { className: "mr-auto", children: [_jsxs("div", { className: "flex items-center gap-2", children: [_jsx("h2", { className: "text-[15px] leading-6 font-medium text-fg", children: "Sinergia entre M\u00F3dulos" }), _jsxs("span", { className: "figure rounded-md border border-line bg-raised px-2 py-0.5 text-xs font-medium text-fg2", children: ["\u00CDndice ", synergy.synergyScore, "%"] })] }), _jsx("p", { className: "text-xs text-fg3", children: "Cruzamento em tempo real entre Treino, Gasto Cal\u00F3rico, Dieta, Hidrata\u00E7\u00E3o, Jejum e H\u00E1bitos" })] }), _jsxs("button", { type: "button", className: "btn-secondary h-8 px-2.5 text-xs", onClick: () => openAssistantDrawer({
                                    prompt: 'Cruze meus dados de hoje (treino, gasto calórico, calorias/proteína consumidas, hidratação, jejum e hábitos) e me dê um plano objetivo para fechar o dia em alta performance.',
                                    newThread: true,
                                }), children: [_jsx(Sparkles, { size: 13, strokeWidth: 1.5 }), " Otimizar dia com IA"] })] }), _jsx("div", { className: "grid gap-2.5 md:grid-cols-2", children: synergy.insights.slice(0, 4).map((ins) => (_jsxs("div", { className: "flex flex-col justify-between rounded-xl border border-line bg-raised/35 p-3", children: [_jsxs("div", { children: [_jsxs("div", { className: "flex items-center gap-1.5 text-xs font-medium text-fg", children: [_jsx("span", { className: `h-2 w-2 shrink-0 rounded-full ${ins.tone === 'positive'
                                                        ? 'bg-positive'
                                                        : ins.tone === 'warning'
                                                            ? 'bg-warning'
                                                            : ins.tone === 'brand'
                                                                ? 'bg-brand'
                                                                : 'bg-fg3'}` }), _jsx("span", { children: ins.title })] }), _jsx("p", { className: "mt-1 text-xs text-fg3", children: ins.detail })] }), _jsxs("div", { className: "mt-2.5 flex items-center gap-2", children: [ins.actionTab && (_jsx("button", { type: "button", className: "text-xs font-medium text-fg2 underline hover:text-fg", onClick: () => onGo(ins.actionTab), children: ins.actionLabel ?? ins.actionTab })), ins.actionRoute && (_jsx(Link, { to: ins.actionRoute, className: "text-xs font-medium text-fg2 underline hover:text-fg", children: ins.actionLabel ?? 'Abrir' })), _jsxs("button", { type: "button", className: "ml-auto inline-flex items-center gap-1 text-xs text-brand hover:underline", onClick: () => openAssistantDrawer({ prompt: ins.aiPrompt, newThread: true }), children: [_jsx(Sparkles, { size: 12, strokeWidth: 1.5 }), " Perguntar \u00E0 IA"] })] })] }, ins.id))) })] })), _jsx(FastingWidget, { h: h, compact: true }), trend.length > 0 && (_jsx(AreaChart, { title: "Evolu\u00E7\u00E3o de peso", subtitle: "M\u00E9dia m\u00F3vel das pesagens registradas", unit: "kg", minZero: false, height: 260, invertDelta: true, tone: "var(--brand)", points: trend.map((t) => ({
                    label: short(t.date),
                    value: t.trend_kg,
                    detail: `pesagem ${num(t.weight_kg)} kg`,
                })) })), _jsxs("div", { className: "grid gap-4 lg:grid-cols-2", children: [_jsxs("section", { className: "card flex flex-col", children: [_jsxs("div", { className: "mb-4 flex items-center gap-2", children: [_jsx("h2", { className: "mr-auto text-[15px] leading-6 font-medium text-fg", children: "Treino de hoje" }), _jsxs("button", { type: "button", className: "btn-ghost h-8 px-2 text-xs", onClick: () => onGo('Treino'), children: ["Abrir treino ", _jsx(ArrowUpRight, { ...I })] })] }), workouts.length === 0 && cardio.length === 0 && (_jsx(Empty, { icon: _jsx(Dumbbell, { size: 18, strokeWidth: 1.5 }), action: _jsx("button", { type: "button", className: "btn-secondary", onClick: () => onGo('Treino'), children: scheduledToday ? `Iniciar ${scheduledToday}` : 'Registrar treino' }), children: scheduledToday ? `Previsto hoje na ficha: ${scheduledToday}` : 'Nenhum treino ou cardio registrado hoje' })), _jsxs("div", { className: "space-y-1.5", children: [workouts.map((w) => {
                                        const wSets = h.sets.rows.filter((x) => x.workout_id === w.id);
                                        const s = workoutSummary(w, h.sets.rows, h.workouts.rows, h.typeById);
                                        const wBurn = workoutKcal(w, wSets, h.typeById, weightKg);
                                        return (_jsxs("div", { className: "flex flex-wrap items-center gap-2 text-sm", children: [_jsx("span", { className: "font-medium text-fg", children: w.title || 'Treino' }), _jsxs("span", { className: "text-fg3", children: ["\u00B7 ", s.sets, " s\u00E9ries \u00B7 ", _jsx("span", { className: "figure", children: num(s.tonnage) }), " kg", s.records.length ? ` · ${s.records.length} PR` : ''] }), _jsxs("span", { className: "ml-auto inline-flex items-center gap-1 text-xs text-fg2", children: [_jsx(Flame, { size: 12, strokeWidth: 1.5, className: "text-brand" }), _jsxs("span", { className: "figure", children: [wBurn.estimated ? '~' : '', num(wBurn.kcal), " kcal"] })] })] }, w.id));
                                    }), cardio.map((c) => {
                                        const cBurn = cardioKcal(c, weightKg);
                                        return (_jsxs("div", { className: "flex flex-wrap items-center gap-2 text-sm", children: [_jsx("span", { className: "font-medium capitalize text-fg", children: c.cardio_type }), _jsxs("span", { className: "text-fg3", children: ["\u00B7 ", Math.round(c.duration_s / 60), " min", c.distance_km ? ` · ${num(c.distance_km)} km` : ''] }), _jsxs("span", { className: "ml-auto inline-flex items-center gap-1 text-xs text-fg2", children: [_jsx(Flame, { size: 12, strokeWidth: 1.5, className: "text-brand" }), _jsxs("span", { className: "figure", children: [cBurn.estimated ? '~' : '', num(cBurn.kcal), " kcal"] })] })] }, c.id));
                                    })] }), nextUp.length > 0 && (_jsxs("div", { className: "mt-4 border-t border-line pt-4", children: [_jsxs("div", { className: "label mb-2", children: ["Pr\u00F3xima sess\u00E3o (", last?.title || 'último treino', ")"] }), _jsx("ul", { className: "space-y-1 text-sm", children: nextUp.map(({ id, s }) => (_jsxs("li", { children: [h.exerciseById.get(id)?.name, ": ", s.action === 'increase_reps' ? `${num(s.load_kg)} kg × ${s.reps.join(', ')}` : `${num(s.load_kg)} kg × ${s.reps}`] }, id))) })] }))] }), _jsxs("section", { className: "card flex flex-col", children: [_jsxs("div", { className: "mb-4 flex items-center gap-2", children: [_jsx("h2", { className: "mr-auto text-[15px] leading-6 font-medium text-fg", children: "Dieta de hoje" }), _jsxs("button", { type: "button", className: "btn-ghost h-8 px-2 text-xs", onClick: () => onGo('Oráculo'), children: [_jsx(Sparkles, { size: 14, strokeWidth: 1.5 }), " Or\u00E1culo IA"] }), _jsxs("button", { type: "button", className: "btn-ghost h-8 px-2 text-xs", onClick: () => onGo('Dieta'), children: ["Abrir dieta ", _jsx(ArrowUpRight, { ...I })] })] }), target ? (_jsxs(_Fragment, { children: [_jsx(TargetBar, { label: "Calorias", consumed: totals.kcal, target: target.kcal, unit: "kcal" }), _jsx(TargetBar, { label: "Prote\u00EDna", consumed: totals.protein_g, target: target.protein_g, unit: "g" }), _jsx(TargetBar, { label: "Carboidrato", consumed: totals.carbs_g, target: target.carbs_g, unit: "g" }), _jsx(TargetBar, { label: "Gordura", consumed: totals.fat_g, target: target.fat_g, unit: "g" }), _jsxs("p", { className: "mt-auto text-xs text-fg3", children: ["Base: ", target.basis] })] })) : (_jsx(Empty, { icon: _jsx(Utensils, { size: 18, strokeWidth: 1.5 }), action: _jsx("button", { type: "button", className: "btn-secondary", onClick: () => onGo('Plano'), children: "Configurar metas no Plano" }), children: "Cadastre suas metas di\u00E1rias de calorias e macros para acompanhar o dia aqui" }))] })] })] }));
}
