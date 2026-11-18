import { useState, type FormEvent } from 'react';
import { supabase } from '../../lib/supabase';
import { write } from '../../lib/useTable';
import { formatDay, toDay } from '../../lib/dates';
import {
  CARDIO_MET, cardioKcal, DEFAULT_SETTINGS, formatPace, kcalPerMinute, MAX_REPS, MUSCLE_LABEL, paceMinPerKm,
  personalRecords, workoutSummary,
} from '../../lib/training';
import { Empty, Field, Modal } from '../../components/ui';
import WorkoutEditor from './WorkoutEditor';
import { DEFAULT_WEIGHT_KG, type Health } from './useHealth';

const VIEWS = ['Treinos', 'Cardio', 'Recordes', 'Exercícios'] as const;
type View = (typeof VIEWS)[number];

export default function Training({ h }: { h: Health }) {
  const [view, setView] = useState<View>('Treinos');
  const [editing, setEditing] = useState<string | null | undefined>(undefined);

  if (editing !== undefined) return <WorkoutEditor h={h} workoutId={editing} onClose={() => setEditing(undefined)} />;

  return (
    <>
      <div className="mb-4 flex flex-wrap gap-1">
        {VIEWS.map((v) => <button key={v} className={v === view ? 'tab-active' : 'tab'} onClick={() => setView(v)}>{v}</button>)}
      </div>
      {view === 'Treinos' && <WorkoutList h={h} onOpen={setEditing} />}
      {view === 'Cardio' && <CardioList h={h} />}
      {view === 'Recordes' && <Records h={h} />}
      {view === 'Exercícios' && <Exercises h={h} />}
    </>
  );
}

function WorkoutList({ h, onOpen }: { h: Health; onOpen: (id: string | null) => void }) {
  return (
    <>
      <div className="mb-4 flex"><button className="btn-primary ml-auto" onClick={() => onOpen(null)}>+ Registrar treino</button></div>
      {h.workouts.rows.length === 0 && <div className="card"><Empty>Nenhum treino registrado ainda.</Empty></div>}
      <ul className="grid gap-2">
        {h.workouts.rows.map((w) => {
          const s = workoutSummary(w, h.sets.rows, h.workouts.rows, h.typeById);
          const names = [...new Set(h.sets.rows.filter((x) => x.workout_id === w.id).map((x) => h.exerciseById.get(x.exercise_id)?.name))].filter(Boolean);
          return (
            <li key={w.id}>
              <button className="card w-full text-left" onClick={() => onOpen(w.id)}>
                <div className="flex flex-wrap items-baseline gap-2">
                  <span className="font-medium">{w.title || 'Treino'}</span>
                  <span className="text-sm text-slate-500">{formatDay(w.date)}{w.duration_min ? ` · ${w.duration_min} min` : ''}</span>
                  <span className="ml-auto text-sm">{s.sets} séries · {s.reps} reps · {s.tonnage.toLocaleString('pt-BR')} kg</span>
                </div>
                <div className="mt-1 truncate text-xs text-slate-500">{names.join(', ')}</div>
                {s.records.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {s.records.map((r) => (
                      <span key={r.exercise_id + r.kind} className="rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-900 dark:bg-amber-950 dark:text-amber-200">
                        🏆 {h.exerciseById.get(r.exercise_id)?.name}: {r.kind === 'volume' ? `volume ${r.value} kg` : r.kind === '1RM' ? `1RM est. ${r.value} kg` : `carga ${r.value} kg`}
                      </span>
                    ))}
                  </div>
                )}
              </button>
            </li>
          );
        })}
      </ul>
    </>
  );
}

const CARDIO_TYPES = Object.keys(CARDIO_MET);

function CardioList({ h }: { h: Health }) {
  const [form, setForm] = useState(false);
  const weight = h.latestWeight ?? DEFAULT_WEIGHT_KG;
  return (
    <>
      <div className="mb-4 flex"><button className="btn-primary ml-auto" onClick={() => setForm(true)}>+ Registrar cardio</button></div>
      {h.cardio.rows.length === 0 && <div className="card"><Empty>Nenhum cardio registrado ainda.</Empty></div>}
      <ul className="grid gap-2">
        {h.cardio.rows.map((c) => {
          const k = cardioKcal(c, weight);
          return (
            <li key={c.id} className="card flex flex-wrap items-baseline gap-3">
              <span className="font-medium capitalize">{c.cardio_type}</span>
              <span className="text-sm text-slate-500">{formatDay(c.date)}</span>
              <span className="ml-auto text-sm">
                {c.distance_km ? `${c.distance_km} km · ` : ''}{Math.round(c.duration_s / 60)} min · {formatPace(paceMinPerKm(c))} ·{' '}
                {k.kcal} kcal{k.estimated ? ' (est.)' : ''} · {kcalPerMinute(k.kcal, c.duration_s)} kcal/min
              </span>
              <button className="text-xs text-red-600" onClick={async () => {
                if (confirm('Excluir este cardio?') && await write(supabase.from('cardio_sessions').delete().eq('id', c.id))) void h.cardio.reload();
              }}>excluir</button>
            </li>
          );
        })}
      </ul>
      {form && <CardioForm onClose={() => setForm(false)} onSaved={() => { setForm(false); void h.cardio.reload(); }} />}
    </>
  );
}

function CardioForm({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [type, setType] = useState('corrida');
  const [date, setDate] = useState(toDay(new Date()));
  const [km, setKm] = useState('');
  const [min, setMin] = useState('');
  const [sec, setSec] = useState('');
  const [kcal, setKcal] = useState('');
  async function save(e: FormEvent) {
    e.preventDefault();
    const duration_s = Number(min || 0) * 60 + Number(sec || 0);
    if (duration_s <= 0) return alert('Informe o tempo.');
    if (await write(supabase.from('cardio_sessions').insert({
      cardio_type: type, date, duration_s, distance_km: km ? Number(km) : null, kcal: kcal ? Number(kcal) : null,
    }))) onSaved();
  }
  return (
    <Modal title="Registrar cardio" onClose={onClose}>
      <form onSubmit={save}>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Tipo">
            <select className="input capitalize" value={type} onChange={(e) => setType(e.target.value)}>
              {CARDIO_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </Field>
          <Field label="Data"><input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} required /></Field>
          <Field label="Distância (km)"><input className="input" type="number" min={0} step="0.01" value={km} onChange={(e) => setKm(e.target.value)} /></Field>
          <Field label="Calorias (opcional)"><input className="input" type="number" min={0} value={kcal} onChange={(e) => setKcal(e.target.value)} placeholder="estimadas se vazio" /></Field>
          <Field label="Tempo: minutos"><input className="input" type="number" min={0} value={min} onChange={(e) => setMin(e.target.value)} required /></Field>
          <Field label="Tempo: segundos"><input className="input" type="number" min={0} max={59} value={sec} onChange={(e) => setSec(e.target.value)} /></Field>
        </div>
        <button className="btn-primary mt-2 w-full justify-center">Salvar</button>
      </form>
    </Modal>
  );
}

function Records({ h }: { h: Health }) {
  const records = [...personalRecords(h.sets.rows, h.workouts.rows, h.typeById).values()]
    .sort((a, b) => (h.exerciseById.get(a.exercise_id)?.name ?? '').localeCompare(h.exerciseById.get(b.exercise_id)?.name ?? '', 'pt'));
  if (!records.length) return <div className="card"><Empty>Os recordes aparecem depois do primeiro treino registrado.</Empty></div>;
  return (
    <div className="card overflow-x-auto p-0">
      <table className="w-full min-w-[560px] text-sm">
        <thead>
          <tr className="text-left text-xs text-slate-500">
            <th className="p-3 font-normal">Exercício</th><th className="p-3 font-normal">Carga máxima</th>
            <th className="p-3 font-normal">1RM estimado</th><th className="p-3 font-normal">Maior volume num treino</th>
          </tr>
        </thead>
        <tbody>
          {records.map((r) => (
            <tr key={r.exercise_id} className="border-t border-slate-100 dark:border-slate-800">
              <td className="p-3">{h.exerciseById.get(r.exercise_id)?.name}</td>
              <td className="p-3">{r.maxLoad ? `${r.maxLoad.load_kg} kg × ${r.maxLoad.reps}` : '—'}<div className="text-xs text-slate-500">{r.maxLoad && formatDay(r.maxLoad.date)}</div></td>
              <td className="p-3">{r.best1RM ? `${r.best1RM.value} kg` : '—'}<div className="text-xs text-slate-500">{r.best1RM && `${r.best1RM.load_kg} kg × ${r.best1RM.reps}`}</div></td>
              <td className="p-3">{r.bestSessionVolume ? `${r.bestSessionVolume.tonnage.toLocaleString('pt-BR')} kg` : '—'}<div className="text-xs text-slate-500">{r.bestSessionVolume && formatDay(r.bestSessionVolume.date)}</div></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Exercises({ h }: { h: Health }) {
  const [settingsFor, setSettingsFor] = useState<string | null>(null);
  const [newExercise, setNewExercise] = useState(false);
  const [newType, setNewType] = useState(false);
  const used = new Set(h.sets.rows.map((s) => s.exercise_id));
  const groups = Object.keys(MUSCLE_LABEL);
  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
      <div>
        <div className="mb-3 flex"><button className="btn-primary ml-auto" onClick={() => setNewExercise(true)}>+ Exercício próprio</button></div>
        {groups.map((g) => {
          const list = h.exercises.rows.filter((e) => e.muscle_group === g);
          if (!list.length) return null;
          return (
            <section key={g} className="mb-4">
              <div className="label mb-2">{MUSCLE_LABEL[g]}</div>
              <ul className="card divide-y divide-slate-100 p-0 dark:divide-slate-800">
                {list.map((e) => {
                  const s = h.settingsById.get(e.id) ?? DEFAULT_SETTINGS;
                  return (
                    <li key={e.id} className="flex items-center gap-2 px-4 py-2 text-sm">
                      <span className="mr-auto">{e.name}{e.user_id && <span className="text-xs text-slate-500"> · seu</span>}</span>
                      {used.has(e.id) && <span className="text-xs text-slate-500">{s.rep_min}-{s.rep_max} reps · +{s.load_increment_kg} kg</span>}
                      <button className="text-xs text-sky-700 underline" onClick={() => setSettingsFor(e.id)}>progressão</button>
                    </li>
                  );
                })}
              </ul>
            </section>
          );
        })}
      </div>
      <div className="card h-fit">
        <div className="label mb-2">Tipos de série</div>
        <ul className="mb-3 space-y-1 text-sm">
          {h.setTypes.rows.map((t) => (
            <li key={t.id} className="flex gap-2">
              <span className="mr-auto">{t.name}</span>
              <span className="text-xs text-slate-500">{t.drives_progression ? 'progressão' : t.counts_for_volume ? 'conta volume' : 'não conta'}</span>
              {t.user_id && <button className="text-xs text-red-600" onClick={async () => {
                if (confirm(`Excluir o tipo "${t.name}"?`) && await write(supabase.from('set_types').delete().eq('id', t.id))) void h.setTypes.reload();
              }}>✕</button>}
            </li>
          ))}
        </ul>
        <button className="btn-ghost" onClick={() => setNewType(true)}>+ Tipo de série</button>
        <p className="mt-3 text-xs text-slate-500">Só working sets geram sugestão de progressão. Os outros tipos contam ou não no volume e nos recordes, conforme a configuração.</p>
      </div>
      {settingsFor && <SettingsForm h={h} exerciseId={settingsFor} onClose={() => setSettingsFor(null)} />}
      {newExercise && <ExerciseForm onClose={() => setNewExercise(false)} onSaved={() => { setNewExercise(false); void h.exercises.reload(); }} />}
      {newType && <SetTypeForm onClose={() => setNewType(false)} onSaved={() => { setNewType(false); void h.setTypes.reload(); }} />}
    </div>
  );
}

function SettingsForm({ h, exerciseId, onClose }: { h: Health; exerciseId: string; onClose: () => void }) {
  const current = h.settingsById.get(exerciseId) ?? DEFAULT_SETTINGS;
  const [min, setMin] = useState(current.rep_min);
  const [max, setMax] = useState(current.rep_max);
  const [inc, setInc] = useState(current.load_increment_kg);
  async function save(e: FormEvent) {
    e.preventDefault();
    if (min > max) return alert('O mínimo não pode passar do máximo.');
    if (await write(supabase.from('exercise_settings').upsert({ exercise_id: exerciseId, rep_min: min, rep_max: max, load_increment_kg: inc }, { onConflict: 'user_id,exercise_id' }))) {
      await h.settings.reload();
      onClose();
    }
  }
  return (
    <Modal title={`Progressão: ${h.exerciseById.get(exerciseId)?.name}`} onClose={onClose}>
      <form onSubmit={save}>
        <div className="grid grid-cols-3 gap-2">
          <Field label="Reps mínimas"><input className="input" type="number" min={1} max={MAX_REPS} value={min} onChange={(e) => setMin(Number(e.target.value))} /></Field>
          <Field label={`Reps máximas (até ${MAX_REPS})`}><input className="input" type="number" min={1} max={MAX_REPS} value={max} onChange={(e) => setMax(Number(e.target.value))} /></Field>
          <Field label="Aumento (kg)"><input className="input" type="number" min={0.25} step={0.25} value={inc} onChange={(e) => setInc(Number(e.target.value))} /></Field>
        </div>
        <p className="mb-3 text-xs text-slate-500">Quando todas as working sets chegam às reps máximas, a próxima sessão sugere subir a carga pelo aumento e voltar às reps mínimas.</p>
        <button className="btn-primary w-full justify-center">Salvar</button>
      </form>
    </Modal>
  );
}

function ExerciseForm({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState('');
  const [group, setGroup] = useState('peito');
  const [equipment, setEquipment] = useState('');
  async function save(e: FormEvent) {
    e.preventDefault();
    if (await write(supabase.from('exercises').insert({ name, muscle_group: group, equipment: equipment || null }))) onSaved();
  }
  return (
    <Modal title="Novo exercício" onClose={onClose}>
      <form onSubmit={save}>
        <Field label="Nome"><input className="input" value={name} onChange={(e) => setName(e.target.value)} required autoFocus /></Field>
        <Field label="Grupo muscular principal">
          <select className="input" value={group} onChange={(e) => setGroup(e.target.value)}>
            {Object.entries(MUSCLE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </Field>
        <Field label="Equipamento (opcional)"><input className="input" value={equipment} onChange={(e) => setEquipment(e.target.value)} /></Field>
        <button className="btn-primary w-full justify-center">Salvar</button>
      </form>
    </Modal>
  );
}

function SetTypeForm({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState('');
  const [volume, setVolume] = useState(true);
  async function save(e: FormEvent) {
    e.preventDefault();
    if (await write(supabase.from('set_types').insert({ name, counts_for_volume: volume, drives_progression: false, sort_order: 50 }))) onSaved();
  }
  return (
    <Modal title="Novo tipo de série" onClose={onClose}>
      <form onSubmit={save}>
        <Field label="Nome"><input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Rest-pause, Cluster set…" required autoFocus /></Field>
        <label className="mb-4 flex items-center gap-2 text-sm"><input type="checkbox" checked={volume} onChange={(e) => setVolume(e.target.checked)} /> Conta no volume e nos recordes</label>
        <button className="btn-primary w-full justify-center">Salvar</button>
      </form>
    </Modal>
  );
}
