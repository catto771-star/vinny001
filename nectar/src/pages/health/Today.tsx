import { Activity, ArrowUpRight, Dumbbell, Flame, Scale, Utensils } from 'lucide-react';
import { toDay } from '../../lib/dates';
import { num } from '../../lib/format';
import { DEFAULT_SETTINGS, lastWorkingSets, suggestNext, weeklyStats, workoutSummary } from '../../lib/training';
import { sumNutrients } from '../../lib/nutrition';
import { weightTrend } from '../../lib/energy';
import { AreaChart, ProgressRing, TargetBar } from '../../components/Charts';
import { Empty } from '../../components/ui';
import { energyForDay } from './energyForDay';
import type { Health } from './useHealth';

const short = (day: string) => `${day.slice(8)}/${day.slice(5, 7)}`;

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

  const pct = (v: number, goal: number) => (goal > 0 ? Math.min(100, (v / goal) * 100) : 0);

  return (
    <div className="space-y-5">
      {/* 4 Vivid LMS Health KPI Cards */}
      <div className="grid grid-cols-2 gap-3.5 xl:grid-cols-4">
        <div className="kpi-indigo flex items-center gap-3.5">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white/18"><Scale size={20} /></span>
          <div className="min-w-0">
            <div className="figure truncate text-[24px] leading-7 font-bold">
              {h.latestWeight ? `${num(h.latestWeight)} kg` : '—'}
            </div>
            <div className="mt-0.5 text-xs text-white/85">Peso atual</div>
          </div>
        </div>
        <div className="kpi-gold flex items-center gap-3.5">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-black/12"><Flame size={20} /></span>
          <div className="min-w-0">
            <div className="figure truncate text-[24px] leading-7 font-bold">{num(totals.kcal)}</div>
            <div className="mt-0.5 text-xs font-medium opacity-80">
              {target ? `de ${num(target.kcal)} kcal` : 'kcal hoje'}
            </div>
          </div>
        </div>
        <div className="kpi-teal flex items-center gap-3.5">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white/18"><Dumbbell size={20} /></span>
          <div className="min-w-0">
            <div className="figure text-[24px] leading-7 font-bold">{weekCur?.sessions ?? 0}</div>
            <div className="mt-0.5 text-xs text-white/85">Treinos na semana</div>
          </div>
        </div>
        <div className="kpi-pink flex items-center gap-3.5">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white/18"><Activity size={20} /></span>
          <div className="min-w-0">
            <div className="figure text-[24px] leading-7 font-bold">{num(burned)} <span className="text-xs font-normal opacity-80">kcal</span></div>
            <div className="mt-0.5 text-xs text-white/85">{dayType === 'training' ? 'Dia de treino' : 'Dia de descanso'}{estimated && burned ? ' · est.' : ''}</div>
          </div>
        </div>
      </div>

      {/* Weight Evolution AreaChart visible immediately when weigh-ins exist */}
      {trend.length > 0 && (
        <AreaChart
          title="Evolução de peso"
          subtitle="Média móvel das suas pesagens registradas"
          unit="kg"
          minZero={false}
          height={230}
          invertDelta
          tone="#38bdf8"
          points={trend.map((t) => ({
            label: short(t.date),
            value: t.trend_kg,
            detail: `pesagem ${num(t.weight_kg)} kg`,
          }))}
        />
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="card flex flex-col">
          <div className="mb-3 flex items-center gap-2">
            <h2 className="mr-auto text-[15px] font-semibold">Treino de hoje</h2>
            <button type="button" className="btn-ghost h-8 px-2.5 text-xs" onClick={() => onGo('Treino')}>
              Abrir treino <ArrowUpRight size={14} strokeWidth={1.75} aria-hidden="true" />
            </button>
          </div>
          {workouts.length === 0 && cardio.length === 0 && (
            <Empty
              icon={<Dumbbell size={18} strokeWidth={1.5} />}
              action={<button type="button" className="btn-secondary" onClick={() => onGo('Treino')}>Registrar treino</button>}
            >
              Nenhum treino ou cardio registrado hoje.
            </Empty>
          )}
          {workouts.map((w) => {
            const s = workoutSummary(w, h.sets.rows, h.workouts.rows, h.typeById);
            return <p key={w.id} className="text-sm">{w.title || 'Treino'}: {s.sets} séries · {num(s.tonnage)} kg{s.records.length ? ` · ${s.records.length} ${s.records.length === 1 ? 'recorde' : 'recordes'}` : ''}</p>;
          })}
          {cardio.map((c) => <p key={c.id} className="text-sm capitalize">{c.cardio_type}: {Math.round(c.duration_s / 60)} min{c.distance_km ? ` · ${num(c.distance_km)} km` : ''}</p>)}
          {nextUp.length > 0 && (
            <div className="mt-4 border-t border-line pt-4">
              <div className="label mb-1">Próxima sessão ({last?.title || 'último treino'})</div>
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
            <h2 className="mr-auto text-[15px] font-semibold">Dieta de hoje</h2>
            <button type="button" className="btn-ghost h-8 px-2.5 text-xs" onClick={() => onGo('Dieta')}>
              Abrir dieta <ArrowUpRight size={14} strokeWidth={1.75} aria-hidden="true" />
            </button>
          </div>
          {target ? (
            <>
              <div className="mb-5 grid grid-cols-4 gap-2 rounded-2xl bg-raised/60 p-3.5 text-center">
                <div className="flex flex-col items-center gap-1.5">
                  <ProgressRing
                    pct={pct(totals.kcal, target.kcal)}
                    size={62}
                    strokeWidth={5.5}
                    tone={totals.kcal > target.kcal * 1.05 ? '#fb7185' : '#f5b700'}
                  />
                  <span className="text-[11px] font-medium text-fg2">Calorias</span>
                </div>
                <div className="flex flex-col items-center gap-1.5">
                  <ProgressRing pct={pct(totals.protein_g, target.protein_g)} size={62} strokeWidth={5.5} tone="#38bdf8" />
                  <span className="text-[11px] font-medium text-fg2">Proteína</span>
                </div>
                <div className="flex flex-col items-center gap-1.5">
                  <ProgressRing pct={pct(totals.carbs_g, target.carbs_g)} size={62} strokeWidth={5.5} tone="#2dd4bf" />
                  <span className="text-[11px] font-medium text-fg2">Carbo</span>
                </div>
                <div className="flex flex-col items-center gap-1.5">
                  <ProgressRing pct={pct(totals.fat_g, target.fat_g)} size={62} strokeWidth={5.5} tone="#ec4899" />
                  <span className="text-[11px] font-medium text-fg2">Gordura</span>
                </div>
              </div>
              <TargetBar label="Calorias" consumed={totals.kcal} target={target.kcal} unit="kcal" />
              <TargetBar label="Proteína" consumed={totals.protein_g} target={target.protein_g} unit="g" />
              <TargetBar label="Carboidrato" consumed={totals.carbs_g} target={target.carbs_g} unit="g" />
              <TargetBar label="Gordura" consumed={totals.fat_g} target={target.fat_g} unit="g" />
              <p className="mt-auto text-xs text-fg3">Base: {target.basis}.</p>
            </>
          ) : (
            <Empty
              icon={<Utensils size={18} strokeWidth={1.5} />}
              action={<button type="button" className="btn-secondary" onClick={() => onGo('Plano')}>Configurar metas no Plano</button>}
            >
              Cadastre suas metas diárias de calorias e macros para acompanhar o dia aqui.
            </Empty>
          )}
        </section>
      </div>
    </div>
  );
}


