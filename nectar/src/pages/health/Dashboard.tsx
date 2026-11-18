import { useState, type FormEvent } from 'react';
import { supabase } from '../../lib/supabase';
import { write } from '../../lib/useTable';
import { addDays, formatDay, toDay } from '../../lib/dates';
import { MUSCLE_LABEL, weekStart, weeklyStats, weeklyVolumeByMuscle } from '../../lib/training';
import { averageIntake, estimatedMaintenance, weeklyRate, weightTrend } from '../../lib/energy';
import { ColumnChart, LineChart } from '../../components/Charts';
import { Empty, Field, Modal, Stat } from '../../components/ui';
import type { Health } from './useHealth';

const short = (day: string) => `${day.slice(8)}/${day.slice(5, 7)}`;

export default function Dashboard({ h }: { h: Health }) {
  const today = toDay(new Date());
  const [weeks, setWeeks] = useState(8);
  const [monday, setMonday] = useState(weekStart(today));
  const [weighing, setWeighing] = useState(false);
  const stats = weeklyStats(today, weeks, h.sets.rows, h.workouts.rows, h.typeById);
  const muscles = weeklyVolumeByMuscle(monday, h.sets.rows, h.workouts.rows, h.exerciseById, h.typeById);
  const pt = (pick: (w: (typeof stats)[number]) => number | null, detail?: (w: (typeof stats)[number]) => string) =>
    stats.map((w) => ({ label: short(w.week), value: pick(w), detail: detail?.(w) }));

  const trend = weightTrend(h.weighIns);
  const rate = weeklyRate(h.weighIns, today);
  const daily = new Map<string, number>();
  for (const l of h.foodLogs.rows) daily.set(l.date, (daily.get(l.date) ?? 0) + Number(l.kcal));
  const intake = averageIntake(daily, today);
  const maintenance = intake.avg !== null && rate !== null && intake.days >= 7 ? estimatedMaintenance(intake.avg, rate) : null;

  return (
    <>
      <div className="mb-4 flex items-center gap-2">
        <span className="label mr-auto">Treino</span>
        {[4, 8, 12].map((n) => <button key={n} className={n === weeks ? 'tab-active' : 'tab'} onClick={() => setWeeks(n)}>{n} semanas</button>)}
      </div>
      <div className="mb-6 grid gap-4 md:grid-cols-2">
        <ColumnChart title="Volume (tonelagem por semana)" subtitle="carga × repetições das séries que contam volume" unit="kg" points={pt((w) => w.tonnage, (w) => `${w.sets} séries, ${w.reps} reps`)} />
        <ColumnChart title="Frequência (treinos por semana)" unit="treinos" points={pt((w) => w.sessions)} />
        <LineChart title="Densidade" subtitle="tonelagem por minuto, nos treinos com duração registrada" unit="kg/min" points={pt((w) => w.density)} />
        <LineChart title="Intensidade" subtitle="carga média das working sets como % do 1RM estimado" unit="%" points={pt((w) => w.intensityPct, (w) => (w.avgEffort ? `esforço médio ${w.avgEffort}` : 'sem esforço registrado'))} />
      </div>

      <div className="card mb-6">
        <div className="mb-3 flex items-center gap-2">
          <div className="label mr-auto">Volume por grupo muscular</div>
          <button className="btn-ghost" onClick={() => setMonday(addDays(monday, -7))} aria-label="Semana anterior">‹</button>
          <span className="text-sm">semana de {formatDay(monday)}</span>
          <button className="btn-ghost" onClick={() => setMonday(addDays(monday, 7))} aria-label="Próxima semana">›</button>
        </div>
        {!muscles.length ? <Empty>Nenhuma série nesta semana.</Empty> : (
          <table className="w-full text-sm">
            <thead><tr className="text-left text-xs text-slate-500"><th className="pb-1 font-normal">Grupo</th><th className="pb-1 text-right font-normal">Séries</th><th className="pb-1 text-right font-normal">Repetições</th><th className="pb-1 text-right font-normal">Tonelagem</th></tr></thead>
            <tbody>
              {muscles.map((m) => (
                <tr key={m.muscle_group} className="border-t border-slate-100 dark:border-slate-800">
                  <td className="py-1.5">{MUSCLE_LABEL[m.muscle_group] ?? m.muscle_group}</td>
                  <td className="py-1.5 text-right">{m.sets}</td>
                  <td className="py-1.5 text-right">{m.reps}</td>
                  <td className="py-1.5 text-right">{m.tonnage.toLocaleString('pt-BR')} kg</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <p className="mt-2 text-xs text-slate-500">Cada série conta para o grupo principal do exercício.</p>
      </div>

      <div className="mb-4 flex items-center gap-2">
        <span className="label mr-auto">Peso e dieta</span>
        <button className="btn-primary" onClick={() => setWeighing(true)}>+ Registrar peso</button>
      </div>
      <div className="card mb-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Stat label="Tendência" value={trend.length ? `${trend.at(-1)!.trend_kg.toLocaleString('pt-BR')} kg` : '—'} hint={trend.length ? `última pesagem ${trend.at(-1)!.weight_kg} kg` : 'sem pesagens'} />
        <Stat label="Ritmo" value={rate === null ? '—' : `${rate > 0 ? '+' : ''}${rate.toLocaleString('pt-BR')} kg/sem`} hint="últimas 4 semanas" />
        <Stat label="Consumo médio" value={intake.avg === null ? '—' : `${intake.avg} kcal`} hint={`${intake.days} dias registrados`} />
        <Stat label="Manutenção estimada" value={maintenance === null ? '—' : `${maintenance} kcal`} hint={maintenance === null ? 'precisa de 7 dias de diário e pesagens de 1 semana' : 'consumo médio menos a variação de peso'} />
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        {trend.length > 0
          ? <LineChart title="Tendência de peso" subtitle="média móvel das pesagens" unit="kg" minZero={false} points={trend.map((t) => ({ label: short(t.date), value: t.trend_kg, detail: `pesagem ${t.weight_kg} kg` }))} />
          : <div className="card"><Empty>Registre seu peso para ver a tendência.</Empty></div>}
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
    const [y, m, d] = date.split('-').map(Number);
    if (await write(supabase.from('body_measurements').insert({ metric: 'weight_kg', value: Number(kg), measured_at: new Date(y, m - 1, d, 8).toISOString() }))) onSaved();
  }
  return (
    <Modal title="Registrar peso" onClose={onClose}>
      <form onSubmit={save}>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Peso (kg)"><input className="input" type="number" min={20} max={400} step="0.1" value={kg} onChange={(e) => setKg(e.target.value)} required autoFocus /></Field>
          <Field label="Data"><input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} required /></Field>
        </div>
        <button className="btn-primary w-full justify-center">Salvar</button>
      </form>
    </Modal>
  );
}
