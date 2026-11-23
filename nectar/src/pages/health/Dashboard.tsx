import { useMemo, useState, type FormEvent } from 'react';
import { ChevronLeft, ChevronRight, Plus, Scale } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { write } from '../../lib/useTable';
import { addDays, formatDay, toDay } from '../../lib/dates';
import { change, num } from '../../lib/format';
import {
  MUSCLE_LABEL, activeExerciseIds, exerciseProgression, weekStart, weeklyStats, weeklyVolumeByMuscle,
  type WeekStats,
} from '../../lib/training';
import { averageIntake, estimatedMaintenance, weeklyRate, weightTrend } from '../../lib/energy';
import { AreaChart, ColumnChart, DonutChart, RankedBars } from '../../components/Charts';
import { Empty, Field, Modal, Stat } from '../../components/ui';
import type { Health } from './useHealth';

const short = (day: string) => `${day.slice(8)}/${day.slice(5, 7)}`;

const METRICS = {
  Volume: { unit: 'kg', pick: (w: WeekStats) => w.tonnage, chart: 'column', subtitle: 'Tonelagem: carga × repetições das séries que contam volume' },
  Frequência: { unit: 'treinos', pick: (w: WeekStats) => w.sessions, chart: 'column', subtitle: 'Treinos registrados por semana' },
  Densidade: { unit: 'kg/min', pick: (w: WeekStats) => w.density, chart: 'area', subtitle: 'Tonelagem por minuto, nos treinos com duração registrada' },
  Intensidade: { unit: '%', pick: (w: WeekStats) => w.intensityPct, chart: 'area', subtitle: 'Carga média das working sets como % do 1RM estimado' },
} as const;
type Metric = keyof typeof METRICS;
type LoadMode = 'maxLoad' | 'best1RM' | 'tonnage';

export default function Dashboard({ h }: { h: Health }) {
  const today = toDay(new Date());
  const [weeks, setWeeks] = useState(8);
  const [metric, setMetric] = useState<Metric>('Volume');
  const [monday, setMonday] = useState(weekStart(today));
  const [weighing, setWeighing] = useState(false);
  const [loadMode, setLoadMode] = useState<LoadMode>('maxLoad');

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
  const stats = weeklyStats(today, Math.max(weeks, 2), h.sets.rows, h.workouts.rows, h.typeById);
  const [prev, cur] = stats.slice(-2);
  const shown = stats.slice(-weeks);
  const m = METRICS[metric];
  const points = shown.map((w) => ({
    label: short(w.week), value: m.pick(w),
    detail: metric === 'Volume' ? `${w.sets} séries, ${w.reps} repetições` : metric === 'Intensidade' && w.avgEffort ? `esforço médio ${num(w.avgEffort)}` : undefined,
  }));
  const muscles = weeklyVolumeByMuscle(monday, h.sets.rows, h.workouts.rows, h.exerciseById, h.typeById);

  const trend = weightTrend(h.weighIns);
  const rate = weeklyRate(h.weighIns, today);
  const daily = new Map<string, number>();
  for (const l of h.foodLogs.rows) daily.set(l.date, (daily.get(l.date) ?? 0) + Number(l.kcal));
  const intake = averageIntake(daily, today);
  const maintenance = intake.avg !== null && rate !== null && intake.days >= 7 ? estimatedMaintenance(intake.avg, rate) : null;
  const vs = 'semana passada';
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
          <div className="mb-4 flex items-center gap-1">
            <div className="mr-auto">
              <div className="font-medium">Séries por grupo muscular</div>
              <div className="text-[13px] text-fg3">semana de {formatDay(monday)}</div>
            </div>
            <button className="icon-btn" onClick={() => setMonday(addDays(monday, -7))} aria-label="Semana anterior"><ChevronLeft size={16} strokeWidth={1.5} /></button>
            <button className="icon-btn" onClick={() => setMonday(addDays(monday, 7))} aria-label="Próxima semana"><ChevronRight size={16} strokeWidth={1.5} /></button>
          </div>
          {!muscles.length ? <Empty>Nenhuma série nesta semana.</Empty> : (
            <div className="space-y-4">
              <DonutChart
                bare
                size={150}
                centerLabel="Séries"
                unit=""
                format={(n) => String(Math.round(n))}
                rows={muscles.map((x) => ({ label: MUSCLE_LABEL[x.muscle_group] ?? x.muscle_group, value: x.sets }))}
              />
              <div className="border-t border-line pt-4">
                <RankedBars unit="séries" rows={muscles.map((x) => ({ label: MUSCLE_LABEL[x.muscle_group] ?? x.muscle_group, value: x.sets, detail: `${x.reps} repetições · ${num(x.tonnage)} kg` }))} />
              </div>
            </div>
          )}
          <p className="mt-4 text-xs text-fg3">Cada série conta para o grupo principal do exercício</p>
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
        <button className="btn-primary w-full">Salvar</button>
      </form>
    </Modal>
  );
}
