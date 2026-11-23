import { ArrowUpRight, Dumbbell, Utensils } from 'lucide-react';
import { toDay } from '../../lib/dates';
import { num } from '../../lib/format';
import { DEFAULT_SETTINGS, lastWorkingSets, suggestNext, weeklyStats, workoutSummary } from '../../lib/training';
import { sumNutrients } from '../../lib/nutrition';
import { weightTrend } from '../../lib/energy';
import { AreaChart, TargetBar } from '../../components/Charts';
import { Empty } from '../../components/ui';
import { energyForDay } from './energyForDay';
import type { Health } from './useHealth';

const short = (day: string) => `${day.slice(8)}/${day.slice(5, 7)}`;
const I = { size: 16, strokeWidth: 1.5, 'aria-hidden': true } as const;

export default function Today({ h, onGo }: { h: Health; onGo: (tab: 'Treino' | 'Dieta' | 'Plano') => void }) {
  const today = toDay(new Date());
  const workouts = h.workouts.rows.filter((w) => w.date === today);
  const cardio = h.cardio.rows.filter((c) => c.date === today);
  const totals = sumNutrients(h.foodLogs.rows.filter((l) => l.date === today));
  const { burned, estimated, dayType, target } = energyForDay(h, today);
  const weekCur = weeklyStats(today, 2, h.sets.rows, h.workouts.rows, h.typeById).at(-1);
  const trend = weightTrend(h.weighIns);

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
            {trend.length ? `${trend.length} ${trend.length === 1 ? 'pesagem registrada' : 'pesagens registradas'}` : 'sem pesagens'}
          </div>
        </div>

        <div className="card">
          <div className="label">Calorias hoje</div>
          <div className="figure mt-3 truncate text-[28px] leading-none font-medium text-fg">
            {num(totals.kcal)}
          </div>
          <div className="mt-3 text-xs text-fg3">
            {target ? `meta de ${num(target.kcal)} kcal` : 'sem meta configurada'}
          </div>
        </div>

        <div className="card">
          <div className="label">Treinos na semana</div>
          <div className="figure mt-3 text-[28px] leading-none font-medium text-fg">
            {weekCur?.sessions ?? 0}
          </div>
          <div className="mt-3 text-xs text-fg3">sessões registradas</div>
        </div>

        <div className="card">
          <div className="label">Gasto estimado</div>
          <div className="figure mt-3 text-[28px] leading-none font-medium text-fg">
            {num(burned)} <span className="text-sm font-normal text-fg3">kcal</span>
          </div>
          <div className="mt-3 text-xs text-fg3">
            {dayType === 'training' ? 'Dia de treino' : 'Dia de descanso'}{estimated && burned ? ' · est.' : ''}
          </div>
        </div>
      </div>

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
              action={<button type="button" className="btn-secondary" onClick={() => onGo('Treino')}>Registrar treino</button>}
            >
              Nenhum treino ou cardio registrado hoje
            </Empty>
          )}
          {workouts.map((w) => {
            const s = workoutSummary(w, h.sets.rows, h.workouts.rows, h.typeById);
            return <p key={w.id} className="text-sm">{w.title || 'Treino'}: {s.sets} séries · {num(s.tonnage)} kg{s.records.length ? ` · ${s.records.length} ${s.records.length === 1 ? 'recorde' : 'recordes'}` : ''}</p>;
          })}
          {cardio.map((c) => <p key={c.id} className="text-sm capitalize">{c.cardio_type}: {Math.round(c.duration_s / 60)} min{c.distance_km ? ` · ${num(c.distance_km)} km` : ''}</p>)}
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



