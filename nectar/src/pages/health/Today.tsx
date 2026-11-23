import { ArrowUpRight, Dumbbell, Utensils } from 'lucide-react';
import { toDay } from '../../lib/dates';
import { num } from '../../lib/format';
import { DEFAULT_SETTINGS, lastWorkingSets, suggestNext, workoutSummary } from '../../lib/training';
import { sumNutrients } from '../../lib/nutrition';
import { TargetBar } from '../../components/Charts';
import { Empty, Stat } from '../../components/ui';
import { energyForDay } from './energyForDay';
import type { Health } from './useHealth';

export default function Today({ h, onGo }: { h: Health; onGo: (tab: 'Treino' | 'Dieta' | 'Plano') => void }) {
  const today = toDay(new Date());
  const workouts = h.workouts.rows.filter((w) => w.date === today);
  const cardio = h.cardio.rows.filter((c) => c.date === today);
  const totals = sumNutrients(h.foodLogs.rows.filter((l) => l.date === today));
  const { burned, estimated, dayType, target } = energyForDay(h, today);
  // Next steps for the exercises of the most recent workout.
  const last = h.workouts.rows.find((w) => w.date < today);
  const nextUp = last
    ? [...new Set(h.sets.rows.filter((s) => s.workout_id === last.id).map((s) => s.exercise_id))].map((id) => ({
      id, s: suggestNext(lastWorkingSets(id, h.sets.rows, h.workouts.rows, h.typeById, today), h.settingsById.get(id) ?? DEFAULT_SETTINGS),
    })).filter((x) => x.s)
    : [];

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <section className="card flex flex-col">
        <div className="mb-3 flex items-center gap-2">
          <h2 className="label mr-auto">Treino de hoje</h2>
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
        <div className="mt-auto grid grid-cols-2 gap-4 border-t border-line pt-4">
          <Stat label="Gasto do treino" value={burned} unit="kcal" hint={estimated && burned ? 'estimado' : undefined} />
          <Stat label="Tipo do dia" value={dayType === 'training' ? 'Treino' : 'Descanso'} />
        </div>
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
        <div className="mb-3 flex items-center gap-2">
          <h2 className="label mr-auto">Dieta de hoje</h2>
          <button type="button" className="btn-ghost h-8 px-2.5 text-xs" onClick={() => onGo('Dieta')}>
            Abrir dieta <ArrowUpRight size={14} strokeWidth={1.75} aria-hidden="true" />
          </button>
        </div>
        {target ? (
          <>
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
  );
}
