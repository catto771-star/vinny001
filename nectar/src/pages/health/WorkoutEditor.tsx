import { useMemo, useState, type FormEvent } from 'react';
import { num } from '../../lib/format';
import { ArrowLeft, Plus, X } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { write } from '../../lib/useTable';
import { toDay } from '../../lib/dates';
import { DEFAULT_SETTINGS, lastWorkingSets, MUSCLE_LABEL, suggestNext, type Suggestion, type WorkoutSet } from '../../lib/training';
import { searchKey } from '../../lib/text';
import { Field, Modal } from '../../components/ui';
import type { Health } from './useHealth';
import type { StartSession } from './PlanEditor';

type DraftSet = Omit<WorkoutSet, 'id' | 'workout_id' | 'position'> & { key: string };

let keySeq = 0;
const newKey = () => `k${keySeq++}`;

export default function WorkoutEditor({ h, workoutId, start, onClose }: { h: Health; workoutId: string | null; start?: StartSession; onClose: () => void }) {
  const existing = workoutId ? h.workouts.rows.find((w) => w.id === workoutId) : undefined;
  const planSessionId = existing?.plan_session_id ?? start?.sessionId ?? null;
  const [date, setDate] = useState(existing?.date ?? toDay(new Date()));
  const [title, setTitle] = useState(existing?.title ?? start?.label ?? '');
  const [duration, setDuration] = useState(existing?.duration_min?.toString() ?? '');
  const [notes, setNotes] = useState(existing?.notes ?? '');
  const [sets, setSets] = useState<DraftSet[]>(() => start && !workoutId
    ? start.draft.map((d) => ({ ...d, key: newKey() }))
    : h.sets.rows.filter((s) => s.workout_id === workoutId).sort((a, b) => a.position - b.position)
      .map((s) => ({ key: newKey(), exercise_id: s.exercise_id, set_type_id: s.set_type_id, load_kg: s.load_kg, reps: s.reps, rest_s: s.rest_s, effort: s.effort })));
  const [picking, setPicking] = useState(false);
  const [saving, setSaving] = useState(false);

  const working = h.setTypes.rows.find((t) => t.drives_progression && t.user_id === null) ?? h.setTypes.rows[0];
  const order = [...new Set(sets.map((s) => s.exercise_id))];

  function suggestionFor(exerciseId: string): Suggestion | null {
    const last = lastWorkingSets(exerciseId, h.sets.rows, h.workouts.rows, h.typeById, date);
    return suggestNext(last, h.settingsById.get(exerciseId) ?? DEFAULT_SETTINGS);
  }

  function addExercise(exerciseId: string) {
    const s = suggestionFor(exerciseId);
    const load = s?.load_kg ?? 0;
    const reps = s ? (s.action === 'increase_reps' ? s.reps : Array(s.sets).fill(s.reps)) : [DEFAULT_SETTINGS.rep_min];
    setSets((xs) => [...xs, ...reps.map((r) => ({ key: newKey(), exercise_id: exerciseId, set_type_id: working.id, load_kg: load, reps: r, rest_s: 120, effort: null }))]);
    setPicking(false);
  }

  function addSet(exerciseId: string) {
    const last = [...sets].reverse().find((s) => s.exercise_id === exerciseId);
    setSets((xs) => {
      const idx = xs.map((s) => s.exercise_id).lastIndexOf(exerciseId);
      const copy = { ...(last ?? { exercise_id: exerciseId, set_type_id: working.id, load_kg: 0, reps: 10, rest_s: 120, effort: null }), key: newKey() };
      return [...xs.slice(0, idx + 1), copy, ...xs.slice(idx + 1)];
    });
  }

  const update = (key: string, patch: Partial<DraftSet>) => setSets((xs) => xs.map((s) => (s.key === key ? { ...s, ...patch } : s)));

  async function save() {
    setSaving(true);
    const row = { date, title: title || null, duration_min: duration ? Number(duration) : null, notes: notes || null, plan_session_id: planSessionId };
    let id = workoutId;
    // Old sets are removed only after the new ones are saved, so a failed save loses nothing.
    const oldSetIds = h.sets.rows.filter((s) => s.workout_id === workoutId).map((s) => s.id);
    if (id) {
      if (!(await write(supabase.from('workouts').update(row).eq('id', id)))) return setSaving(false);
    } else {
      const { data, error } = await supabase.from('workouts').insert(row).select('id').single();
      if (error || !data) { alert(`Não foi possível salvar: ${error?.message}`); return setSaving(false); }
      id = data.id;
    }
    // Keep exercises grouped in the order they were added.
    const ordered = order.flatMap((ex) => sets.filter((s) => s.exercise_id === ex));
    if (ordered.length) {
      const ok = await write(supabase.from('workout_sets').insert(ordered.map((s, i) => ({
        workout_id: id, exercise_id: s.exercise_id, set_type_id: s.set_type_id, position: i,
        load_kg: s.load_kg, reps: s.reps, rest_s: s.rest_s, effort: s.effort,
      }))));
      if (!ok) return setSaving(false);
    }
    if (oldSetIds.length && !(await write(supabase.from('workout_sets').delete().in('id', oldSetIds)))) return setSaving(false);
    await Promise.all([h.workouts.reload(), h.sets.reload()]);
    setSaving(false);
    onClose();
  }

  async function remove() {
    if (workoutId && confirm('Excluir este treino e todas as séries dele?') && await write(supabase.from('workouts').delete().eq('id', workoutId))) {
      await Promise.all([h.workouts.reload(), h.sets.reload()]);
      onClose();
    }
  }

  return (
    <div>
      <div className="mb-4 flex items-center gap-2">
        <button className="btn-ghost" onClick={onClose}><ArrowLeft size={16} strokeWidth={1.5} />Voltar</button>
        <h2 className="mr-auto text-lg font-medium">{workoutId ? 'Editar treino' : start ? `${start.label}: registrar` : 'Novo treino'}</h2>
        {workoutId && <button className="btn-ghost text-negative" onClick={remove}>Excluir</button>}
        <button className="btn-primary" onClick={save} disabled={saving}>{saving ? 'Salvando…' : 'Salvar treino'}</button>
      </div>
      <div className="card mb-4 grid gap-3 sm:grid-cols-4">
        <Field label="Data"><input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
        <Field label="Nome (opcional)"><input className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Peito e tríceps" /></Field>
        <Field label="Duração (min)"><input className="input" type="number" min={1} value={duration} onChange={(e) => setDuration(e.target.value)} /></Field>
        <Field label="Notas"><input className="input" value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
      </div>

      {order.map((exId) => {
        const ex = h.exerciseById.get(exId);
        const sug = suggestionFor(exId);
        return (
          <section key={exId} className="card mb-4">
            <div className="mb-2 flex items-baseline gap-2">
              <h3 className="font-medium">{ex?.name ?? 'Exercício'}</h3>
              <span className="text-xs text-fg3">{ex ? MUSCLE_LABEL[ex.muscle_group] : ''}</span>
              <button className="ml-auto text-xs text-negative" onClick={() => setSets((xs) => xs.filter((s) => s.exercise_id !== exId))}>remover</button>
            </div>
            {sug && (
              <p className="mb-3 rounded-lg bg-raised px-3 py-2 text-sm text-fg" data-testid="suggestion">
                <strong>Sugestão:</strong>{' '}
                {sug.action === 'increase_reps' ? `${num(sug.load_kg)} kg × ${sug.reps.join(', ')}` : `${num(sug.load_kg)} kg × ${sug.reps} (${sug.sets} séries)`} · {sug.reason}
              </p>
            )}
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-sm">
                <thead>
                  <tr className="text-left text-xs text-fg3">
                    <th className="pb-1 font-normal">#</th><th className="pb-1 font-normal">Tipo</th><th className="pb-1 font-normal">Carga (kg)</th>
                    <th className="pb-1 font-normal">Reps</th><th className="pb-1 font-normal">Descanso (s)</th><th className="pb-1 font-normal">Esforço (RPE)</th><th />
                  </tr>
                </thead>
                <tbody>
                  {sets.filter((s) => s.exercise_id === exId).map((s, i) => (
                    <tr key={s.key}>
                      <td className="pr-2 text-fg3">{i + 1}</td>
                      <td className="py-1 pr-2">
                        <select className="input py-1" aria-label={`Tipo da série ${i + 1}, ${ex?.name ?? 'exercício'}`} value={s.set_type_id} onChange={(e) => update(s.key, { set_type_id: e.target.value })}>
                          {h.setTypes.rows.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                        </select>
                      </td>
                      <td className="py-1 pr-2"><input className="input py-1" aria-label={`Carga da série ${i + 1}, ${ex?.name ?? 'exercício'}`} type="number" min={0} step="0.5" value={s.load_kg} onChange={(e) => update(s.key, { load_kg: Number(e.target.value) })} /></td>
                      <td className="py-1 pr-2"><input className="input py-1" aria-label={`Repetições da série ${i + 1}, ${ex?.name ?? 'exercício'}`} type="number" min={0} value={s.reps} onChange={(e) => update(s.key, { reps: Number(e.target.value) })} /></td>
                      <td className="py-1 pr-2"><input className="input py-1" aria-label={`Descanso da série ${i + 1}, ${ex?.name ?? 'exercício'}`} type="number" min={0} step={15} value={s.rest_s ?? ''} onChange={(e) => update(s.key, { rest_s: e.target.value === '' ? null : Number(e.target.value) })} /></td>
                      <td className="py-1 pr-2"><input className="input py-1" aria-label={`Esforço da série ${i + 1}, ${ex?.name ?? 'exercício'}`} type="number" min={1} max={10} step={0.5} value={s.effort ?? ''} onChange={(e) => update(s.key, { effort: e.target.value === '' ? null : Number(e.target.value) })} /></td>
                      <td><button className="icon-btn hover:text-negative" aria-label={`Apagar série ${i + 1}, ${ex?.name ?? 'exercício'}`} onClick={() => setSets((xs) => xs.filter((x) => x.key !== s.key))}><X size={16} strokeWidth={1.5} /></button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <button className="btn-ghost mt-2" onClick={() => addSet(exId)}><Plus size={16} strokeWidth={1.5} />Série</button>
          </section>
        );
      })}
      <button className="btn-primary" onClick={() => setPicking(true)}><Plus size={16} strokeWidth={1.5} />Exercício</button>
      {picking && <ExercisePicker h={h} onPick={addExercise} onClose={() => setPicking(false)} />}
    </div>
  );
}

export function ExercisePicker({ h, onPick, onClose }: { h: Health; onPick: (id: string) => void; onClose: () => void }) {
  const [q, setQ] = useState('');
  const [creating, setCreating] = useState(false);
  const [group, setGroup] = useState('peito');
  const list = useMemo(() => {
    const key = searchKey(q);
    return h.exercises.rows.filter((e) => !key || searchKey(e.name).includes(key) || searchKey(MUSCLE_LABEL[e.muscle_group] ?? '').includes(key)).slice(0, 60);
  }, [q, h.exercises.rows]);

  async function create(e: FormEvent) {
    e.preventDefault();
    const { data, error } = await supabase.from('exercises').insert({ name: q.trim(), muscle_group: group }).select('id').single();
    if (error || !data) return alert(`Não foi possível criar: ${error?.message}`);
    await h.exercises.reload();
    onPick(data.id);
  }

  return (
    <Modal title={creating ? 'Novo exercício' : 'Escolher exercício'} onClose={onClose}>
      {creating ? (
        <form onSubmit={create}>
          <Field label="Nome"><input className="input" value={q} onChange={(e) => setQ(e.target.value)} required autoFocus /></Field>
          <Field label="Grupo muscular principal">
            <select className="input" value={group} onChange={(e) => setGroup(e.target.value)}>
              {Object.entries(MUSCLE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </Field>
          <div className="flex gap-2">
            <button type="button" className="btn-ghost" onClick={() => setCreating(false)}><ArrowLeft size={16} strokeWidth={1.5} />Voltar</button>
            <button className="btn-primary ml-auto">Criar e usar</button>
          </div>
        </form>
      ) : (
        <>
          <input className="input mb-3" placeholder="Buscar por nome ou músculo" value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
          <ul className="max-h-80 overflow-y-auto">
            {list.map((e) => (
              <li key={e.id}>
                <button className="w-full rounded-lg px-2 py-2 text-left text-sm hover:bg-raised" onClick={() => onPick(e.id)}>
                  {e.name} <span className="text-xs text-fg3">· {MUSCLE_LABEL[e.muscle_group]}{e.user_id ? ' · seu' : ''}</span>
                </button>
              </li>
            ))}
            {!list.length && <li className="py-4 text-center text-sm text-fg3">Nenhum exercício encontrado</li>}
          </ul>
          <button className="btn-secondary mt-3 w-full" onClick={() => setCreating(true)}><Plus size={16} strokeWidth={1.5} />Criar novo exercício{q.trim() ? `: ${q.trim()}` : ''}</button>
        </>
      )}
    </Modal>
  );
}
