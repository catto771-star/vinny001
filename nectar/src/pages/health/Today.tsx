import { toDay } from '../../lib/dates';
import { num } from '../../lib/format';
import { DEFAULT_SETTINGS, lastWorkingSets, suggestNext, workoutSummary } from '../../lib/training';
import { sumNutrients } from '../../lib/nutrition';
import { TargetBar } from '../../components/Charts';
import { Empty, Stat } from '../../components/ui';
import { energyForDay } from './energyForDay';
import type { Health } from './useHealth';

export default function Today({ h, onGo }: { h: Health; onGo: (tab: 'Treino' | 'Dieta') => void }) {
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
      <section className="card">
        <div className="mb-3 flex items-center"><div className="label mr-auto">Treino de hoje</div><button className="btn-ghost" onClick={() => onGo('Treino')}>abrir</button></div>
        {workouts.length === 0 && cardio.length === 0 && <Empty>Nada registrado hoje.</Empty>}
        {workouts.map((w) => {
          const s = workoutSummary(w, h.sets.rows, h.workouts.rows, h.typeById);
          return <p key={w.id} className="text-sm">{w.title || 'Treino'}: {s.sets} séries · {num(s.tonnage)} kg{s.records.length ? ` · ${s.records.length} ${s.records.length === 1 ? 'recorde' : 'recordes'}` : ''}</p>;
        })}
        {cardio.map((c) => <p key={c.id} className="text-sm capitalize">{c.cardio_type}: {Math.round(c.duration_s / 60)} min{c.distance_km ? ` · ${num(c.distance_km)} km` : ''}</p>)}
        <div className="mt-3 grid grid-cols-2 gap-4">
          <Stat label="Gasto do treino" value={`${burned} kcal`} hint={estimated && burned ? 'estimado' : undefined} />
          <Stat label="Tipo do dia" value={dayType === 'training' ? 'Treino' : 'Descanso'} />
        </div>
        {nextUp.length > 0 && (
          <div className="mt-4">
            <div className="label mb-1">Próxima sessão ({last?.title || 'último treino'})</div>
            <ul className="space-y-1 text-sm">
              {nextUp.map(({ id, s }) => (
                <li key={id}>{h.exerciseById.get(id)?.name}: {s!.action === 'increase_reps' ? `${num(s!.load_kg)} kg × ${s!.reps.join(', ')}` : `${num(s!.load_kg)} kg × ${s!.reps}`}</li>
              ))}
            </ul>
          </div>
        )}
      </section>
      <section className="card">
        <div className="mb-3 flex items-center"><div className="label mr-auto">Dieta de hoje</div><button className="btn-ghost" onClick={() => onGo('Dieta')}>abrir</button></div>
        {target ? (
          <>
            <TargetBar label="Calorias" consumed={totals.kcal} target={target.kcal} unit="kcal" />
            <TargetBar label="Proteína" consumed={totals.protein_g} target={target.protein_g} unit="g" />
            <TargetBar label="Carboidrato" consumed={totals.carbs_g} target={target.carbs_g} unit="g" />
            <TargetBar label="Gordura" consumed={totals.fat_g} target={target.fat_g} unit="g" />
            <p className="text-xs text-fg3">Base: {target.basis}.</p>
          </>
        ) : <Empty>Cadastre as metas na aba Plano para acompanhar o dia.</Empty>}
      </section>
    </div>
  );
}
