import { jsxs as _jsxs, jsx as _jsx, Fragment as _Fragment } from "react/jsx-runtime";
import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Download, Plus, Printer, Scale } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { write } from '../../lib/useTable';
import { addDays, formatDay, toDay } from '../../lib/dates';
import { change, num } from '../../lib/format';
import { MUSCLE_LABEL, activeExerciseIds, cardioKcal, exerciseProgression, weekStart, weeklyStats, weeklyVolumeByMuscle, workoutSummary, } from '../../lib/training';
import { weightedMuscleDistribution, workoutKcal } from '../../lib/hevy';
import { averageIntake, estimatedMaintenance, weeklyRate, weightTrend } from '../../lib/energy';
import { COMPARISON_METRICS, buildFoodLogsCsv, buildHealthComparisonSeries, buildPeriodNutritionReport, } from '../../lib/nutritionReport';
import { HIGHLIGHTED_KEYS, MICRONUTRIENTS, rdaFor } from '../../lib/micronutrients';
import { AreaChart, ColumnChart, DonutChart, DualAxisChart, NutrientRing, RankedBars } from '../../components/Charts';
import { Empty, Field, Modal, Stat } from '../../components/ui';
import { DEFAULT_WEIGHT_KG } from './useHealth';
const short = (day) => `${day.slice(8)}/${day.slice(5, 7)}`;
const METRICS = {
    Volume: { unit: 'kg', pick: (w) => w.tonnage, chart: 'column', subtitle: 'Tonelagem: carga × repetições das séries que contam volume' },
    Frequência: { unit: 'treinos', pick: (w) => w.sessions, chart: 'column', subtitle: 'Treinos registrados por semana' },
    'Gasto ativo': { unit: 'kcal', pick: (w) => w.kcalBurned ?? 0, chart: 'column', subtitle: 'Calorias gastas somando sessões de treino e cardio da semana' },
    Densidade: { unit: 'kg/min', pick: (w) => w.density, chart: 'area', subtitle: 'Tonelagem por minuto, nos treinos com duração registrada' },
    Intensidade: { unit: '%', pick: (w) => w.intensityPct, chart: 'area', subtitle: 'Carga média das working sets como % do 1RM estimado' },
};
export default function Dashboard({ h }) {
    const today = toDay(new Date());
    const weightKg = h.latestWeight ?? DEFAULT_WEIGHT_KG;
    const [weeks, setWeeks] = useState(8);
    const [metric, setMetric] = useState('Volume');
    const [monday, setMonday] = useState(weekStart(today));
    const [weightedMuscleMode, setWeightedMuscleMode] = useState(true);
    const [weighing, setWeighing] = useState(false);
    const [loadMode, setLoadMode] = useState('maxLoad');
    // Dual-Axis Comparison Chart state
    const [compDays, setCompDays] = useState(30);
    const [leftMetric, setLeftMetric] = useState('weight_kg');
    const [rightMetric, setRightMetric] = useState('kcal');
    // Nutrition Period Report state
    const [reportDays, setReportDays] = useState(7);
    const [dayFilter, setDayFilter] = useState('all_logged');
    const [includeSupplements, setIncludeSupplements] = useState(true);
    const exerciseIds = useMemo(() => activeExerciseIds(h.sets.rows, h.workouts.rows, h.typeById), [h.sets.rows, h.workouts.rows, h.typeById]);
    const [selectedExId, setSelectedExId] = useState('');
    const activeExId = selectedExId && exerciseIds.includes(selectedExId) ? selectedExId : (exerciseIds[0] ?? '');
    const progression = useMemo(() => (activeExId ? exerciseProgression(activeExId, h.sets.rows, h.workouts.rows, h.typeById) : []), [activeExId, h.sets.rows, h.workouts.rows, h.typeById]);
    const loading = h.workouts.loading || h.sets.loading;
    const baseStats = weeklyStats(today, Math.max(weeks, 2), h.sets.rows, h.workouts.rows, h.typeById);
    const stats = useMemo(() => {
        return baseStats.map((ws) => {
            const end = addDays(ws.week, 7);
            let kcalBurned = 0;
            for (const w of h.workouts.rows) {
                if (w.date >= ws.week && w.date < end && w.date <= today) {
                    const wSets = h.sets.rows.filter((s) => s.workout_id === w.id);
                    kcalBurned += workoutKcal(w, wSets, h.typeById, weightKg).kcal;
                }
            }
            for (const c of h.cardio.rows) {
                if (c.date >= ws.week && c.date < end && c.date <= today) {
                    kcalBurned += cardioKcal(c, weightKg).kcal;
                }
            }
            return { ...ws, kcalBurned };
        });
    }, [baseStats, h.workouts.rows, h.sets.rows, h.cardio.rows, h.typeById, weightKg, today]);
    const [prev, cur] = stats.slice(-2);
    const shown = stats.slice(-weeks);
    const m = METRICS[metric];
    const points = shown.map((w) => ({
        label: short(w.week), value: m.pick(w),
        detail: metric === 'Volume' ? `${w.sets} séries · ~${num(w.kcalBurned)} kcal`
            : metric === 'Gasto ativo' ? `${w.sessions} sessões`
                : metric === 'Intensidade' && w.avgEffort ? `esforço médio ${num(w.avgEffort)}`
                    : undefined,
    }));
    const primaryMuscles = weeklyVolumeByMuscle(monday, h.sets.rows, h.workouts.rows, h.exerciseById, h.typeById);
    const weightedMuscles = useMemo(() => {
        const end = addDays(monday, 7);
        const inWeek = new Set(h.workouts.rows.filter((w) => w.date >= monday && w.date < end).map((w) => w.id));
        return weightedMuscleDistribution(h.sets.rows.filter((s) => inWeek.has(s.workout_id)), h.exerciseById, h.typeById);
    }, [monday, h.workouts.rows, h.sets.rows, h.exerciseById, h.typeById]);
    const trend = weightTrend(h.weighIns);
    const rate = weeklyRate(h.weighIns, today);
    const daily = new Map();
    for (const l of h.foodLogs.rows)
        daily.set(l.date, (daily.get(l.date) ?? 0) + Number(l.kcal));
    const intake = averageIntake(daily, today);
    const maintenance = intake.avg !== null && rate !== null && intake.days >= 7 ? estimatedMaintenance(intake.avg, rate) : null;
    const vs = 'semana passada';
    // Daily workout tonnage map for Dual-Axis comparison
    const tonnageByDay = useMemo(() => {
        const map = new Map();
        for (const w of h.workouts.rows) {
            const s = workoutSummary(w, h.sets.rows, h.workouts.rows, h.typeById);
            map.set(w.date, (map.get(w.date) ?? 0) + s.tonnage);
        }
        return map;
    }, [h.workouts.rows, h.sets.rows, h.typeById]);
    const leftDef = COMPARISON_METRICS.find((x) => x.id === leftMetric);
    const rightDef = COMPARISON_METRICS.find((x) => x.id === rightMetric);
    const dualSeries = useMemo(() => buildHealthComparisonSeries({
        endDay: today,
        days: compDays,
        leftMetric,
        rightMetric,
        foodLogs: h.foodLogs.rows,
        waterLogs: h.waterLogs.rows,
        measurements: h.measurements.rows,
        fasts: h.fasts.rows,
        tonnageByDay,
    }), [today, compDays, leftMetric, rightMetric, h.foodLogs.rows, h.waterLogs.rows, h.measurements.rows, h.fasts.rows, tonnageByDay]);
    const completedDays = useMemo(() => new Set(h.overrides.rows.filter((o) => o.completed).map((o) => o.date)), [h.overrides.rows]);
    const report = useMemo(() => buildPeriodNutritionReport({
        endDay: today,
        days: reportDays,
        foodLogs: h.foodLogs.rows,
        waterLogs: h.waterLogs.rows,
        completedDays,
        dayFilter,
        includeSupplements,
        sex: h.profile?.sex,
    }), [today, reportDays, h.foodLogs.rows, h.waterLogs.rows, completedDays, dayFilter, includeSupplements, h.profile?.sex]);
    function downloadCsv() {
        const csv = buildFoodLogsCsv(h.foodLogs.rows);
        const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `painel-diario-nutricional-${today}.csv`;
        a.click();
        URL.revokeObjectURL(url);
    }
    const selector = (_jsx("div", { className: "segmented", children: [4, 8, 12].map((n) => _jsxs("button", { className: n === weeks ? 'tab-active' : 'tab', onClick: () => setWeeks(n), children: [n, " sem"] }, n)) }));
    const exName = h.exerciseById.get(activeExId)?.name ?? 'Exercício';
    const progPoints = progression.map((p) => ({
        label: short(p.date),
        value: loadMode === 'maxLoad' ? p.maxLoad : loadMode === 'best1RM' ? p.best1RM : p.tonnage,
        detail: `${num(p.maxLoad)} kg × ${p.topReps} · ${p.sets} ${p.sets === 1 ? 'série' : 'séries'}`,
    }));
    return (_jsxs(_Fragment, { children: [_jsxs("section", { className: "card mb-6 grid grid-cols-2 gap-6 lg:grid-cols-4", children: [_jsx(Stat, { label: "Volume nesta semana", value: num(cur.tonnage), unit: "kg", loading: loading, accent: true, hint: change(cur.tonnage, prev.tonnage, vs) ?? `${cur.sets} séries` }), _jsx(Stat, { label: "Treinos", value: cur.sessions, loading: loading, hint: cur.sessions === prev.sessions ? 'igual à semana passada' : `${prev.sessions} na semana passada` }), _jsx(Stat, { label: "Densidade", value: num(cur.density), unit: cur.density === null ? undefined : 'kg/min', loading: loading, hint: cur.density && prev.density ? change(cur.density, prev.density, vs) : 'registre a duração dos treinos' }), _jsx(Stat, { label: "Intensidade", value: num(cur.intensityPct), unit: cur.intensityPct === null ? undefined : '% 1RM', loading: loading, hint: cur.avgEffort ? `esforço médio ${num(cur.avgEffort)}` : 'registre o esforço das séries' })] }), _jsx("div", { className: "mb-6", children: _jsx(DualAxisChart, { title: "An\u00E1lise Cruzada \u00B7 Duplo Eixo", subtitle: "Correlacione peso, calorias, carboidratos l\u00EDquidos, hidrata\u00E7\u00E3o, jejum e volume de treino", rows: dualSeries, leftLabel: leftDef.label, leftUnit: leftDef.unit, rightLabel: rightDef.label, rightUnit: rightDef.unit, aside: _jsxs("div", { className: "flex flex-wrap items-center gap-2", children: [_jsx("select", { "aria-label": "M\u00E9trica esquerda", className: "input h-8 w-auto py-0 text-xs", value: leftMetric, onChange: (e) => setLeftMetric(e.target.value), children: COMPARISON_METRICS.map((cm) => _jsx("option", { value: cm.id, children: cm.label }, cm.id)) }), _jsx("span", { className: "text-xs text-fg3", children: "\u00D7" }), _jsx("select", { "aria-label": "M\u00E9trica direita", className: "input h-8 w-auto py-0 text-xs", value: rightMetric, onChange: (e) => setRightMetric(e.target.value), children: COMPARISON_METRICS.map((cm) => _jsx("option", { value: cm.id, children: cm.label }, cm.id)) }), _jsx("div", { className: "segmented", children: [14, 30, 90].map((d) => (_jsxs("button", { type: "button", className: compDays === d ? 'tab-active' : 'tab', onClick: () => setCompDays(d), children: [d, "d"] }, d))) })] }) }) }), _jsxs("section", { className: "card mb-8", children: [_jsxs("div", { className: "mb-4 flex flex-wrap items-start gap-3", children: [_jsxs("div", { className: "mr-auto", children: [_jsx("h2", { className: "text-base font-medium text-fg", children: "Relat\u00F3rio Nutricional por Per\u00EDodo" }), _jsxs("p", { className: "text-xs text-fg3", children: ["M\u00E9dia di\u00E1ria calculada sobre ", _jsx("strong", { children: report.countedDays }), " de ", report.totalCalendarDays, " dias (", short(report.startDay), " a ", short(report.endDay), ")."] })] }), _jsxs("div", { className: "flex flex-wrap items-center gap-2", children: [_jsx("div", { className: "segmented", children: [7, 14, 30, 90].map((d) => (_jsxs("button", { type: "button", className: reportDays === d ? 'tab-active' : 'tab', onClick: () => setReportDays(d), children: [d, "d"] }, d))) }), _jsxs("select", { "aria-label": "Filtro de dias do relat\u00F3rio", className: "input h-8 w-auto py-0 text-xs", value: dayFilter, onChange: (e) => setDayFilter(e.target.value), children: [_jsx("option", { value: "all_logged", children: "Dias com registros" }), _jsx("option", { value: "completed_only", children: "Apenas dias completos" }), _jsx("option", { value: "all_calendar", children: "Todos os dias do calend\u00E1rio" })] }), _jsxs("label", { className: "flex items-center gap-1.5 text-xs text-fg2", children: [_jsx("input", { type: "checkbox", checked: includeSupplements, onChange: (e) => setIncludeSupplements(e.target.checked) }), "Suplementos"] }), _jsxs("button", { type: "button", className: "btn-secondary h-8 px-2.5 text-xs", onClick: downloadCsv, children: [_jsx(Download, { size: 14, strokeWidth: 1.5 }), " CSV"] }), _jsxs("button", { type: "button", className: "btn-secondary h-8 px-2.5 text-xs", onClick: () => window.print(), children: [_jsx(Printer, { size: 14, strokeWidth: 1.5 }), " Imprimir / PDF"] })] })] }), _jsxs("div", { className: "mb-5 grid grid-cols-2 gap-3 rounded-xl border border-line bg-raised/40 p-3.5 sm:grid-cols-3 lg:grid-cols-6", children: [_jsxs("div", { children: [_jsx("div", { className: "text-[11px] text-fg3", children: "M\u00E9dia kcal/dia" }), _jsx("div", { className: "figure mt-0.5 text-lg font-medium text-fg", children: num(report.averageMacros.kcal) })] }), _jsxs("div", { children: [_jsx("div", { className: "text-[11px] text-fg3", children: "Prote\u00EDna/dia" }), _jsxs("div", { className: "figure mt-0.5 text-lg font-medium text-fg", children: [num(report.averageMacros.protein_g), " g"] })] }), _jsxs("div", { children: [_jsx("div", { className: "text-[11px] text-fg3", children: "Carbo L\u00EDq./dia" }), _jsxs("div", { className: "figure mt-0.5 text-lg font-medium text-fg", children: [num(report.averageMacros.net_carbs_g), " g"] })] }), _jsxs("div", { children: [_jsx("div", { className: "text-[11px] text-fg3", children: "Gordura/dia" }), _jsxs("div", { className: "figure mt-0.5 text-lg font-medium text-fg", children: [num(report.averageMacros.fat_g), " g"] })] }), _jsxs("div", { children: [_jsx("div", { className: "text-[11px] text-fg3", children: "Fibras/dia" }), _jsxs("div", { className: "figure mt-0.5 text-lg font-medium text-fg", children: [num(report.averageMacros.fiber_g), " g"] })] }), _jsxs("div", { children: [_jsx("div", { className: "text-[11px] text-fg3", children: "\u00C1gua bebida/dia" }), _jsxs("div", { className: "figure mt-0.5 text-lg font-medium text-fg", children: [num(report.averageWaterMl), " mL"] })] })] }), _jsxs("div", { className: "grid gap-6 lg:grid-cols-2", children: [_jsxs("div", { children: [_jsx("div", { className: "label mb-3", children: "Scores M\u00E9dios do Per\u00EDodo" }), _jsx("div", { className: "space-y-2.5", children: report.scores.map((s) => (_jsxs("div", { children: [_jsxs("div", { className: "mb-1 flex items-baseline justify-between text-xs", children: [_jsx("span", { className: "text-fg2", children: s.label }), _jsxs("span", { className: "figure font-medium text-fg", children: [s.pct, "%"] })] }), _jsx("div", { className: "h-1.5 rounded-full bg-raised", children: _jsx("div", { className: "h-1.5 rounded-full", style: { width: `${s.pct}%`, background: s.pct >= 80 ? 'var(--positive)' : 'var(--brand)' } }) })] }, s.id))) })] }), _jsxs("div", { children: [_jsx("div", { className: "label mb-3", children: "M\u00E9dia de Micronutrientes Chave" }), _jsx("div", { className: "grid grid-cols-4 gap-3", children: HIGHLIGHTED_KEYS.map((key) => {
                                            const meta = MICRONUTRIENTS.find((x) => x.key === key);
                                            const rda = rdaFor(meta, h.profile?.sex);
                                            const val = report.averageMicros[key] ?? 0;
                                            const pct = rda > 0 ? Math.round((val / rda) * 100) : 0;
                                            return (_jsx(NutrientRing, { label: meta.shortLabel, pct: pct, sublabel: `${num(val, val < 10 ? 1 : 0)}${meta.unit}`, size: 56 }, key));
                                        }) })] })] })] }), _jsx("div", { className: "mb-6", children: _jsx(AreaChart, { title: `Evolução de carga · ${exName}`, subtitle: loadMode === 'maxLoad' ? 'Carga máxima por sessão' : loadMode === 'best1RM' ? '1RM estimado (fórmula de Epley) por sessão' : 'Tonelagem total do exercício por sessão', unit: "kg", minZero: false, height: 250, emptyText: "Registre treinos com s\u00E9ries de trabalho para acompanhar a evolu\u00E7\u00E3o de carga por exerc\u00EDcio", points: progPoints, aside: exerciseIds.length > 0 ? (_jsxs("div", { className: "flex flex-wrap items-center gap-2", children: [_jsx("select", { "aria-label": "Escolher exerc\u00EDcio", className: "input h-9 w-auto max-w-[220px] py-0 text-xs", value: activeExId, onChange: (e) => setSelectedExId(e.target.value), children: exerciseIds.map((id) => (_jsx("option", { value: id, children: h.exerciseById.get(id)?.name ?? id }, id))) }), _jsxs("div", { className: "segmented", children: [_jsx("button", { type: "button", className: loadMode === 'maxLoad' ? 'tab-active' : 'tab', onClick: () => setLoadMode('maxLoad'), children: "Carga" }), _jsx("button", { type: "button", className: loadMode === 'best1RM' ? 'tab-active' : 'tab', onClick: () => setLoadMode('best1RM'), children: "1RM" }), _jsx("button", { type: "button", className: loadMode === 'tonnage' ? 'tab-active' : 'tab', onClick: () => setLoadMode('tonnage'), children: "Volume" })] })] })) : undefined }) }), _jsxs("div", { className: "mb-8 grid gap-6 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]", children: [_jsxs("div", { className: "min-w-0", children: [_jsx("div", { className: "segmented mb-3", children: Object.keys(METRICS).map((k) => _jsx("button", { className: k === metric ? 'tab-active' : 'tab', onClick: () => setMetric(k), children: k }, k)) }), m.chart === 'column'
                                ? _jsx(ColumnChart, { title: metric, subtitle: m.subtitle, unit: m.unit, points: points, height: 290, aside: selector })
                                : _jsx(AreaChart, { title: metric, subtitle: m.subtitle, unit: m.unit, points: points, height: 290, aside: selector })] }), _jsxs("section", { className: "card h-fit min-w-0 xl:mt-12", children: [_jsxs("div", { className: "mb-3 flex items-center gap-1", children: [_jsxs("div", { className: "mr-auto", children: [_jsx("div", { className: "font-medium", children: "S\u00E9ries por grupo muscular" }), _jsxs("div", { className: "text-[13px] text-fg3", children: ["semana de ", formatDay(monday)] })] }), _jsx("button", { className: "icon-btn", onClick: () => setMonday(addDays(monday, -7)), "aria-label": "Semana anterior", children: _jsx(ChevronLeft, { size: 16, strokeWidth: 1.5 }) }), _jsx("button", { className: "icon-btn", onClick: () => setMonday(addDays(monday, 7)), "aria-label": "Pr\u00F3xima semana", children: _jsx(ChevronRight, { size: 16, strokeWidth: 1.5 }) })] }), _jsxs("div", { className: "segmented mb-4", children: [_jsx("button", { type: "button", className: weightedMuscleMode ? 'tab-active' : 'tab', onClick: () => setWeightedMuscleMode(true), children: "Ponderado (1 + \u00BD)" }), _jsx("button", { type: "button", className: !weightedMuscleMode ? 'tab-active' : 'tab', onClick: () => setWeightedMuscleMode(false), children: "S\u00F3 principal" })] }), !(weightedMuscleMode ? weightedMuscles.length : primaryMuscles.length) ? _jsx(Empty, { children: "Nenhuma s\u00E9rie nesta semana." }) : (_jsxs("div", { className: "space-y-4", children: [_jsx(DonutChart, { bare: true, size: 150, centerLabel: "S\u00E9ries", unit: "", format: (n) => num(n, weightedMuscleMode ? 1 : 0), rows: weightedMuscleMode
                                            ? weightedMuscles.map((x) => ({ label: x.label, value: x.weightedSets }))
                                            : primaryMuscles.map((x) => ({ label: MUSCLE_LABEL[x.muscle_group] ?? x.muscle_group, value: x.sets })) }), _jsx("div", { className: "border-t border-line pt-4", children: _jsx(RankedBars, { unit: "s\u00E9ries", rows: weightedMuscleMode
                                                ? weightedMuscles.map((x) => ({
                                                    label: x.label,
                                                    value: x.weightedSets,
                                                    detail: `${x.primarySets} prim. + ${x.secondarySets}×0,5 sec.`,
                                                }))
                                                : primaryMuscles.map((x) => ({
                                                    label: MUSCLE_LABEL[x.muscle_group] ?? x.muscle_group,
                                                    value: x.sets,
                                                    detail: `${x.reps} repetições · ${num(x.tonnage)} kg`,
                                                })) }) })] })), _jsx("p", { className: "mt-4 text-xs text-fg3", children: weightedMuscleMode
                                    ? 'Modo Hevy: 1,0 série no músculo principal e 0,5 em cada músculo secundário'
                                    : 'Cada série conta apenas para o grupo principal do exercício' })] })] }), _jsxs("div", { className: "mb-4 flex items-center gap-2", children: [_jsx("h2", { className: "mr-auto text-lg font-medium", children: "Peso e dieta" }), _jsxs("button", { className: "btn-secondary", onClick: () => setWeighing(true), children: [_jsx(Plus, { size: 16, strokeWidth: 1.5 }), "Registrar peso"] })] }), _jsxs("div", { className: "grid gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]", children: [trend.length > 0
                        ? _jsx(AreaChart, { title: "Tend\u00EAncia de peso", subtitle: "M\u00E9dia m\u00F3vel das pesagens", unit: "kg", minZero: false, height: 260, invertDelta: true, points: trend.map((t) => ({ label: short(t.date), value: t.trend_kg, detail: `pesagem ${num(t.weight_kg)} kg` })) })
                        : _jsx("div", { className: "card", children: _jsx(Empty, { icon: _jsx(Scale, { size: 18, strokeWidth: 1.5 }), action: _jsx("button", { className: "btn-secondary", onClick: () => setWeighing(true), children: "Registrar peso" }), children: "Registre seu peso para ver a tend\u00EAncia e cruz\u00E1-la com o que voc\u00EA come" }) }), _jsxs("section", { className: "card grid h-fit grid-cols-2 gap-6 xl:grid-cols-1", children: [_jsx(Stat, { label: "Tend\u00EAncia", value: trend.length ? num(trend.at(-1).trend_kg) : '—', unit: trend.length ? 'kg' : undefined, loading: h.measurements.loading, hint: trend.length ? `última pesagem ${num(trend.at(-1).weight_kg)} kg` : 'sem pesagens' }), _jsx(Stat, { label: "Ritmo", value: rate === null ? '—' : `${rate > 0 ? '+' : ''}${num(rate, 2)}`, unit: rate === null ? undefined : 'kg/sem', loading: h.measurements.loading, hint: "\u00FAltimas 4 semanas" }), _jsx(Stat, { label: "Consumo m\u00E9dio", value: intake.avg === null ? '—' : num(intake.avg), unit: intake.avg === null ? undefined : 'kcal', loading: h.foodLogs.loading, hint: `${intake.days} ${intake.days === 1 ? 'dia registrado' : 'dias registrados'}` }), _jsx(Stat, { label: "Manuten\u00E7\u00E3o estimada", value: maintenance === null ? '—' : num(maintenance), unit: maintenance === null ? undefined : 'kcal', loading: h.foodLogs.loading, hint: maintenance === null ? 'precisa de 7 dias de diário e pesagens de uma semana' : 'consumo médio menos a variação de peso' })] })] }), weighing && _jsx(WeighInForm, { onClose: () => setWeighing(false), onSaved: () => { setWeighing(false); void h.measurements.reload(); } })] }));
}
function WeighInForm({ onClose, onSaved }) {
    const [kg, setKg] = useState('');
    const [date, setDate] = useState(toDay(new Date()));
    async function save(e) {
        e.preventDefault();
        const [y, mo, d] = date.split('-').map(Number);
        if (await write(supabase.from('body_measurements').insert({ metric: 'weight_kg', value: Number(kg), measured_at: new Date(y, mo - 1, d, 8).toISOString() })))
            onSaved();
    }
    return (_jsx(Modal, { title: "Registrar peso", onClose: onClose, children: _jsxs("form", { onSubmit: save, children: [_jsxs("div", { className: "grid grid-cols-2 gap-3", children: [_jsx(Field, { label: "Peso (kg)", children: _jsx("input", { className: "input", type: "number", min: 20, max: 400, step: "0.1", value: kg, onChange: (e) => setKg(e.target.value), required: true, autoFocus: true }) }), _jsx(Field, { label: "Data", children: _jsx("input", { className: "input", type: "date", value: date, onChange: (e) => setDate(e.target.value), required: true }) })] }), _jsx("button", { className: "btn-primary w-full justify-center", children: "Salvar" })] }) }));
}
