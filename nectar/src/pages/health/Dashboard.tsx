import { useMemo, useState, type FormEvent } from 'react';
import { ChevronLeft, ChevronRight, Download, Plus, Printer, Scale } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { write } from '../../lib/useTable';
import { addDays, formatDay, toDay, type Day } from '../../lib/dates';
import { change, num } from '../../lib/format';
import {
  MUSCLE_LABEL, activeExerciseIds, cardioKcal, exerciseProgression, weekStart, weeklyStats, weeklyVolumeByMuscle, workoutSummary,
  type WeekStats,
} from '../../lib/training';
import { weightedMuscleDistribution, workoutKcal } from '../../lib/hevy';
import { averageIntake, estimatedMaintenance, weeklyRate, weightTrend } from '../../lib/energy';
import {
  COMPARISON_METRICS,
  buildFoodLogsCsv,
  buildHealthComparisonSeries,
  buildPeriodNutritionReport,
  type ComparisonMetricId,
  type ReportDayFilter,
} from '../../lib/nutritionReport';
import { HIGHLIGHTED_KEYS, MICRONUTRIENTS, rdaFor } from '../../lib/micronutrients';
import { AreaChart, ColumnChart, DonutChart, DualAxisChart, NutrientRing, RankedBars } from '../../components/Charts';
import { Empty, Field, Modal, Stat } from '../../components/ui';
import { DEFAULT_WEIGHT_KG, type Health } from './useHealth';

const short = (day: string) => `${day.slice(8)}/${day.slice(5, 7)}`;

const METRICS = {
  Volume: { unit: 'kg', pick: (w: WeekStats & { kcalBurned?: number }) => w.tonnage, chart: 'column', subtitle: 'Tonelagem: carga × repetições das séries que contam volume' },
  Frequência: { unit: 'treinos', pick: (w: WeekStats & { kcalBurned?: number }) => w.sessions, chart: 'column', subtitle: 'Treinos registrados por semana' },
  'Gasto ativo': { unit: 'kcal', pick: (w: WeekStats & { kcalBurned?: number }) => w.kcalBurned ?? 0, chart: 'column', subtitle: 'Calorias gastas somando sessões de treino e cardio da semana' },
  Densidade: { unit: 'kg/min', pick: (w: WeekStats & { kcalBurned?: number }) => w.density, chart: 'area', subtitle: 'Tonelagem por minuto, nos treinos com duração registrada' },
  Intensidade: { unit: '%', pick: (w: WeekStats & { kcalBurned?: number }) => w.intensityPct, chart: 'area', subtitle: 'Carga média das working sets como % do 1RM estimado' },
} as const;
type Metric = keyof typeof METRICS;
type LoadMode = 'maxLoad' | 'best1RM' | 'tonnage';

export default function Dashboard({ h }: { h: Health }) {
  const today = toDay(new Date());
  const weightKg = h.latestWeight ?? DEFAULT_WEIGHT_KG;
  const [weeks, setWeeks] = useState(8);
  const [metric, setMetric] = useState<Metric>('Volume');
  const [monday, setMonday] = useState(weekStart(today));
  const [weightedMuscleMode, setWeightedMuscleMode] = useState(true);
  const [weighing, setWeighing] = useState(false);
  const [loadMode, setLoadMode] = useState<LoadMode>('maxLoad');

  // Dual-Axis Comparison Chart state
  const [compDays, setCompDays] = useState<number>(30);
  const [leftMetric, setLeftMetric] = useState<ComparisonMetricId>('weight_kg');
  const [rightMetric, setRightMetric] = useState<ComparisonMetricId>('kcal');

  // Nutrition Period Report state
  const [reportDays, setReportDays] = useState<number>(7);
  const [dayFilter, setDayFilter] = useState<ReportDayFilter>('all_logged');
  const [includeSupplements, setIncludeSupplements] = useState<boolean>(true);

  const exerciseIds = useMemo(
    () => activeExerciseIds(h.sets.rows, h.workouts.rows, h.typeById),
    [h.sets.rows, h.workouts.rows, h.typeById],
  );
  const [selectedExId, setSelectedExId] = useState<string>('');
  const activeExId = selectedExId && exerciseIds.includes(selectedExId) ? selectedExId : (exerciseIds[0] ?? '');
  const progression = useMemo(
    () => (activeExId ? exerciseProgression(activeExId, h.sets.rows, h.workouts.rows, h.typeById) : []),
    [activeExId, h.sets.rows, h.workouts.rows, h.typeById],
  );

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
    detail:
      metric === 'Volume' ? `${w.sets} séries · ~${num(w.kcalBurned)} kcal`
        : metric === 'Gasto ativo' ? `${w.sessions} sessões`
          : metric === 'Intensidade' && w.avgEffort ? `esforço médio ${num(w.avgEffort)}`
            : undefined,
  }));
  const primaryMuscles = weeklyVolumeByMuscle(monday, h.sets.rows, h.workouts.rows, h.exerciseById, h.typeById);
  const weightedMuscles = useMemo(() => {
    const end = addDays(monday, 7);
    const inWeek = new Set(h.workouts.rows.filter((w) => w.date >= monday && w.date < end).map((w) => w.id));
    return weightedMuscleDistribution(
      h.sets.rows.filter((s) => inWeek.has(s.workout_id)),
      h.exerciseById,
      h.typeById,
    );
  }, [monday, h.workouts.rows, h.sets.rows, h.exerciseById, h.typeById]);

  const trend = weightTrend(h.weighIns);
  const rate = weeklyRate(h.weighIns, today);
  const daily = new Map<string, number>();
  for (const l of h.foodLogs.rows) daily.set(l.date, (daily.get(l.date) ?? 0) + Number(l.kcal));
  const intake = averageIntake(daily, today);
  const maintenance = intake.avg !== null && rate !== null && intake.days >= 7 ? estimatedMaintenance(intake.avg, rate) : null;
  const vs = 'semana passada';

  // Daily workout tonnage map for Dual-Axis comparison
  const tonnageByDay = useMemo(() => {
    const map = new Map<Day, number>();
    for (const w of h.workouts.rows) {
      const s = workoutSummary(w, h.sets.rows, h.workouts.rows, h.typeById);
      map.set(w.date, (map.get(w.date) ?? 0) + s.tonnage);
    }
    return map;
  }, [h.workouts.rows, h.sets.rows, h.typeById]);

  const leftDef = COMPARISON_METRICS.find((x) => x.id === leftMetric)!;
  const rightDef = COMPARISON_METRICS.find((x) => x.id === rightMetric)!;
  const dualSeries = useMemo(
    () =>
      buildHealthComparisonSeries({
        endDay: today,
        days: compDays,
        leftMetric,
        rightMetric,
        foodLogs: h.foodLogs.rows,
        waterLogs: h.waterLogs.rows,
        measurements: h.measurements.rows,
        fasts: h.fasts.rows,
        tonnageByDay,
      }),
    [today, compDays, leftMetric, rightMetric, h.foodLogs.rows, h.waterLogs.rows, h.measurements.rows, h.fasts.rows, tonnageByDay],
  );

  const completedDays = useMemo(
    () => new Set<Day>(h.overrides.rows.filter((o) => o.completed).map((o) => o.date)),
    [h.overrides.rows],
  );

  const report = useMemo(
    () =>
      buildPeriodNutritionReport({
        endDay: today,
        days: reportDays,
        foodLogs: h.foodLogs.rows,
        waterLogs: h.waterLogs.rows,
        completedDays,
        dayFilter,
        includeSupplements,
        sex: h.profile?.sex,
      }),
    [today, reportDays, h.foodLogs.rows, h.waterLogs.rows, completedDays, dayFilter, includeSupplements, h.profile?.sex],
  );

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

  const selector = (
    <div className="segmented">
      {[4, 8, 12].map((n) => <button key={n} className={n === weeks ? 'tab-active' : 'tab'} onClick={() => setWeeks(n)}>{n} sem</button>)}
    </div>
  );

  const exName = h.exerciseById.get(activeExId)?.name ?? 'Exercício';
  const progPoints = progression.map((p) => ({
    label: short(p.date),
    value: loadMode === 'maxLoad' ? p.maxLoad : loadMode === 'best1RM' ? p.best1RM : p.tonnage,
    detail: `${num(p.maxLoad)} kg × ${p.topReps} · ${p.sets} ${p.sets === 1 ? 'série' : 'séries'}`,
  }));

  return (
    <>
      <section className="card mb-6 grid grid-cols-2 gap-6 lg:grid-cols-4">
        <Stat label="Volume nesta semana" value={num(cur.tonnage)} unit="kg" loading={loading} accent hint={change(cur.tonnage, prev.tonnage, vs) ?? `${cur.sets} séries`} />
        <Stat label="Treinos" value={cur.sessions} loading={loading} hint={cur.sessions === prev.sessions ? 'igual à semana passada' : `${prev.sessions} na semana passada`} />
        <Stat label="Densidade" value={num(cur.density)} unit={cur.density === null ? undefined : 'kg/min'} loading={loading} hint={cur.density && prev.density ? change(cur.density, prev.density, vs) : 'registre a duração dos treinos'} />
        <Stat label="Intensidade" value={num(cur.intensityPct)} unit={cur.intensityPct === null ? undefined : '% 1RM'} loading={loading} hint={cur.avgEffort ? `esforço médio ${num(cur.avgEffort)}` : 'registre o esforço das séries'} />
      </section>

      {/* Dual-Axis Analytics Comparison Chart (Cronometer Trends -> Charts) */}
      <div className="mb-6">
        <DualAxisChart
          title="Análise Cruzada · Duplo Eixo"
          subtitle="Correlacione peso, calorias, carboidratos líquidos, hidratação, jejum e volume de treino"
          rows={dualSeries}
          leftLabel={leftDef.label}
          leftUnit={leftDef.unit}
          rightLabel={rightDef.label}
          rightUnit={rightDef.unit}
          aside={
            <div className="flex flex-wrap items-center gap-2">
              <select
                aria-label="Métrica esquerda"
                className="input h-8 w-auto py-0 text-xs"
                value={leftMetric}
                onChange={(e) => setLeftMetric(e.target.value as ComparisonMetricId)}
              >
                {COMPARISON_METRICS.map((cm) => <option key={cm.id} value={cm.id}>{cm.label}</option>)}
              </select>
              <span className="text-xs text-fg3">×</span>
              <select
                aria-label="Métrica direita"
                className="input h-8 w-auto py-0 text-xs"
                value={rightMetric}
                onChange={(e) => setRightMetric(e.target.value as ComparisonMetricId)}
              >
                {COMPARISON_METRICS.map((cm) => <option key={cm.id} value={cm.id}>{cm.label}</option>)}
              </select>
              <div className="segmented">
                {[14, 30, 90].map((d) => (
                  <button key={d} type="button" className={compDays === d ? 'tab-active' : 'tab'} onClick={() => setCompDays(d)}>
                    {d}d
                  </button>
                ))}
              </div>
            </div>
          }
        />
      </div>

      {/* Period Nutrition Report + Clinical Print / CSV Export */}
      <section className="card mb-8">
        <div className="mb-4 flex flex-wrap items-start gap-3">
          <div className="mr-auto">
            <h2 className="text-base font-medium text-fg">Relatório Nutricional por Período</h2>
            <p className="text-xs text-fg3">
              Média diária calculada sobre <strong>{report.countedDays}</strong> de {report.totalCalendarDays} dias ({short(report.startDay)} a {short(report.endDay)}).
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="segmented">
              {[7, 14, 30, 90].map((d) => (
                <button key={d} type="button" className={reportDays === d ? 'tab-active' : 'tab'} onClick={() => setReportDays(d)}>
                  {d}d
                </button>
              ))}
            </div>
            <select
              aria-label="Filtro de dias do relatório"
              className="input h-8 w-auto py-0 text-xs"
              value={dayFilter}
              onChange={(e) => setDayFilter(e.target.value as ReportDayFilter)}
            >
              <option value="all_logged">Dias com registros</option>
              <option value="completed_only">Apenas dias completos</option>
              <option value="all_calendar">Todos os dias do calendário</option>
            </select>
            <label className="flex items-center gap-1.5 text-xs text-fg2">
              <input type="checkbox" checked={includeSupplements} onChange={(e) => setIncludeSupplements(e.target.checked)} />
              Suplementos
            </label>
            <button type="button" className="btn-secondary h-8 px-2.5 text-xs" onClick={downloadCsv}>
              <Download size={14} strokeWidth={1.5} /> CSV
            </button>
            <button type="button" className="btn-secondary h-8 px-2.5 text-xs" onClick={() => window.print()}>
              <Printer size={14} strokeWidth={1.5} /> Imprimir / PDF
            </button>
          </div>
        </div>

        <div className="mb-5 grid grid-cols-2 gap-3 rounded-xl border border-line bg-raised/40 p-3.5 sm:grid-cols-3 lg:grid-cols-6">
          <div>
            <div className="text-[11px] text-fg3">Média kcal/dia</div>
            <div className="figure mt-0.5 text-lg font-medium text-fg">{num(report.averageMacros.kcal)}</div>
          </div>
          <div>
            <div className="text-[11px] text-fg3">Proteína/dia</div>
            <div className="figure mt-0.5 text-lg font-medium text-fg">{num(report.averageMacros.protein_g)} g</div>
          </div>
          <div>
            <div className="text-[11px] text-fg3">Carbo Líq./dia</div>
            <div className="figure mt-0.5 text-lg font-medium text-fg">{num(report.averageMacros.net_carbs_g)} g</div>
          </div>
          <div>
            <div className="text-[11px] text-fg3">Gordura/dia</div>
            <div className="figure mt-0.5 text-lg font-medium text-fg">{num(report.averageMacros.fat_g)} g</div>
          </div>
          <div>
            <div className="text-[11px] text-fg3">Fibras/dia</div>
            <div className="figure mt-0.5 text-lg font-medium text-fg">{num(report.averageMacros.fiber_g)} g</div>
          </div>
          <div>
            <div className="text-[11px] text-fg3">Água bebida/dia</div>
            <div className="figure mt-0.5 text-lg font-medium text-fg">{num(report.averageWaterMl)} mL</div>
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <div>
            <div className="label mb-3">Scores Médios do Período</div>
            <div className="space-y-2.5">
              {report.scores.map((s) => (
                <div key={s.id}>
                  <div className="mb-1 flex items-baseline justify-between text-xs">
                    <span className="text-fg2">{s.label}</span>
                    <span className="figure font-medium text-fg">{s.pct}%</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-raised">
                    <div
                      className="h-1.5 rounded-full"
                      style={{ width: `${s.pct}%`, background: s.pct >= 80 ? 'var(--positive)' : 'var(--brand)' }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div>
            <div className="label mb-3">Média de Micronutrientes Chave</div>
            <div className="grid grid-cols-4 gap-3">
              {HIGHLIGHTED_KEYS.map((key) => {
                const meta = MICRONUTRIENTS.find((x) => x.key === key)!;
                const rda = rdaFor(meta, h.profile?.sex);
                const val = report.averageMicros[key] ?? 0;
                const pct = rda > 0 ? Math.round((val / rda) * 100) : 0;
                return (
                  <NutrientRing
                    key={key}
                    label={meta.shortLabel}
                    pct={pct}
                    sublabel={`${num(val, val < 10 ? 1 : 0)}${meta.unit}`}
                    size={56}
                  />
                );
              })}
            </div>
          </div>
        </div>
      </section>

      {/* Exercise load & 1RM progression curve */}
      <div className="mb-6">
        <AreaChart
          title={`Evolução de carga · ${exName}`}
          subtitle={loadMode === 'maxLoad' ? 'Carga máxima por sessão' : loadMode === 'best1RM' ? '1RM estimado (fórmula de Epley) por sessão' : 'Tonelagem total do exercício por sessão'}
          unit="kg"
          minZero={false}
          height={250}
          emptyText="Registre treinos com séries de trabalho para acompanhar a evolução de carga por exercício"
          points={progPoints}
          aside={exerciseIds.length > 0 ? (
            <div className="flex flex-wrap items-center gap-2">
              <select
                aria-label="Escolher exercício"
                className="input h-9 w-auto max-w-[220px] py-0 text-xs"
                value={activeExId}
                onChange={(e) => setSelectedExId(e.target.value)}
              >
                {exerciseIds.map((id) => (
                  <option key={id} value={id}>{h.exerciseById.get(id)?.name ?? id}</option>
                ))}
              </select>
              <div className="segmented">
                <button type="button" className={loadMode === 'maxLoad' ? 'tab-active' : 'tab'} onClick={() => setLoadMode('maxLoad')}>Carga</button>
                <button type="button" className={loadMode === 'best1RM' ? 'tab-active' : 'tab'} onClick={() => setLoadMode('best1RM')}>1RM</button>
                <button type="button" className={loadMode === 'tonnage' ? 'tab-active' : 'tab'} onClick={() => setLoadMode('tonnage')}>Volume</button>
              </div>
            </div>
          ) : undefined}
        />
      </div>

      <div className="mb-8 grid gap-6 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <div className="min-w-0">
          <div className="segmented mb-3">
            {(Object.keys(METRICS) as Metric[]).map((k) => <button key={k} className={k === metric ? 'tab-active' : 'tab'} onClick={() => setMetric(k)}>{k}</button>)}
          </div>
          {m.chart === 'column'
            ? <ColumnChart title={metric} subtitle={m.subtitle} unit={m.unit} points={points} height={290} aside={selector} />
            : <AreaChart title={metric} subtitle={m.subtitle} unit={m.unit} points={points} height={290} aside={selector} />}
        </div>
        <section className="card h-fit min-w-0 xl:mt-12">
          <div className="mb-3 flex items-center gap-1">
            <div className="mr-auto">
              <div className="font-medium">Séries por grupo muscular</div>
              <div className="text-[13px] text-fg3">semana de {formatDay(monday)}</div>
            </div>
            <button className="icon-btn" onClick={() => setMonday(addDays(monday, -7))} aria-label="Semana anterior"><ChevronLeft size={16} strokeWidth={1.5} /></button>
            <button className="icon-btn" onClick={() => setMonday(addDays(monday, 7))} aria-label="Próxima semana"><ChevronRight size={16} strokeWidth={1.5} /></button>
          </div>
          <div className="segmented mb-4">
            <button type="button" className={weightedMuscleMode ? 'tab-active' : 'tab'} onClick={() => setWeightedMuscleMode(true)}>
              Ponderado (1 + ½)
            </button>
            <button type="button" className={!weightedMuscleMode ? 'tab-active' : 'tab'} onClick={() => setWeightedMuscleMode(false)}>
              Só principal
            </button>
          </div>
          {!(weightedMuscleMode ? weightedMuscles.length : primaryMuscles.length) ? <Empty>Nenhuma série nesta semana.</Empty> : (
            <div className="space-y-4">
              <DonutChart
                bare
                size={150}
                centerLabel="Séries"
                unit=""
                format={(n) => num(n, weightedMuscleMode ? 1 : 0)}
                rows={
                  weightedMuscleMode
                    ? weightedMuscles.map((x) => ({ label: x.label, value: x.weightedSets }))
                    : primaryMuscles.map((x) => ({ label: MUSCLE_LABEL[x.muscle_group] ?? x.muscle_group, value: x.sets }))
                }
              />
              <div className="border-t border-line pt-4">
                <RankedBars
                  unit="séries"
                  rows={
                    weightedMuscleMode
                      ? weightedMuscles.map((x) => ({
                          label: x.label,
                          value: x.weightedSets,
                          detail: `${x.primarySets} prim. + ${x.secondarySets}×0,5 sec.`,
                        }))
                      : primaryMuscles.map((x) => ({
                          label: MUSCLE_LABEL[x.muscle_group] ?? x.muscle_group,
                          value: x.sets,
                          detail: `${x.reps} repetições · ${num(x.tonnage)} kg`,
                        }))
                  }
                />
              </div>
            </div>
          )}
          <p className="mt-4 text-xs text-fg3">
            {weightedMuscleMode
              ? 'Modo Hevy: 1,0 série no músculo principal e 0,5 em cada músculo secundário'
              : 'Cada série conta apenas para o grupo principal do exercício'}
          </p>
        </section>
      </div>

      <div className="mb-4 flex items-center gap-2">
        <h2 className="mr-auto text-lg font-medium">Peso e dieta</h2>
        <button className="btn-secondary" onClick={() => setWeighing(true)}><Plus size={16} strokeWidth={1.5} />Registrar peso</button>
      </div>
      <div className="grid gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        {trend.length > 0
          ? <AreaChart title="Tendência de peso" subtitle="Média móvel das pesagens" unit="kg" minZero={false} height={260} invertDelta points={trend.map((t) => ({ label: short(t.date), value: t.trend_kg, detail: `pesagem ${num(t.weight_kg)} kg` }))} />
          : <div className="card"><Empty icon={<Scale size={18} strokeWidth={1.5} />} action={<button className="btn-secondary" onClick={() => setWeighing(true)}>Registrar peso</button>}>Registre seu peso para ver a tendência e cruzá-la com o que você come</Empty></div>}
        <section className="card grid h-fit grid-cols-2 gap-6 xl:grid-cols-1">
          <Stat label="Tendência" value={trend.length ? num(trend.at(-1)!.trend_kg) : '—'} unit={trend.length ? 'kg' : undefined} loading={h.measurements.loading} hint={trend.length ? `última pesagem ${num(trend.at(-1)!.weight_kg)} kg` : 'sem pesagens'} />
          <Stat label="Ritmo" value={rate === null ? '—' : `${rate > 0 ? '+' : ''}${num(rate, 2)}`} unit={rate === null ? undefined : 'kg/sem'} loading={h.measurements.loading} hint="últimas 4 semanas" />
          <Stat label="Consumo médio" value={intake.avg === null ? '—' : num(intake.avg)} unit={intake.avg === null ? undefined : 'kcal'} loading={h.foodLogs.loading} hint={`${intake.days} ${intake.days === 1 ? 'dia registrado' : 'dias registrados'}`} />
          <Stat label="Manutenção estimada" value={maintenance === null ? '—' : num(maintenance)} unit={maintenance === null ? undefined : 'kcal'} loading={h.foodLogs.loading} hint={maintenance === null ? 'precisa de 7 dias de diário e pesagens de uma semana' : 'consumo médio menos a variação de peso'} />
        </section>
      </div>
      {weighing && <WeighInForm onClose={() => setWeighing(false)} onSaved={() => { setWeighing(false); void h.measurements.reload(); }} />}
    </>
  );
}

function WeighInForm({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [kg, setKg] = useState('');
  const [date, setDate] = useState(toDay(new Date()));
  async function save(e: FormEvent) {
    e.preventDefault();
    const [y, mo, d] = date.split('-').map(Number);
    if (await write(supabase.from('body_measurements').insert({ metric: 'weight_kg', value: Number(kg), measured_at: new Date(y, mo - 1, d, 8).toISOString() }))) onSaved();
  }
  return (
    <Modal title="Registrar peso" onClose={onClose}>
      <form onSubmit={save}>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Peso (kg)"><input className="input" type="number" min={20} max={400} step="0.1" value={kg} onChange={(e) => setKg(e.target.value)} required autoFocus /></Field>
          <Field label="Data"><input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} required /></Field>
        </div>
        <button className="btn-primary w-full justify-center">Salvar</button>
      </form>
    </Modal>
  );
}
