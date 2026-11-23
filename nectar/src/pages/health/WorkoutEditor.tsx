import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { num } from '../../lib/format';
import { ArrowLeft, Pause, Play, Plus, RotateCcw, Timer, X } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { write } from '../../lib/useTable';
import { feedback } from '../../lib/feedback';
import { toDay } from '../../lib/dates';
import { DEFAULT_SETTINGS, lastWorkingSets, MUSCLE_LABEL, suggestNext, type Suggestion, type WorkoutSet } from '../../lib/training';
import { clampRestSeconds, formatRestClock, playRestDoneChime, remainingSeconds, REST_PRESETS } from '../../lib/restTimer';
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

  // Rest timer state
  const [restTotal, setRestTotal] = useState(90);
  const [restLeft, setRestLeft] = useState(0);
  const [restEndsAt, setRestEndsAt] = useState<number | null>(null);
  const [autoRest, setAutoRest] = useState(true);

  function startRest(seconds: number) {
    const clean = clampRestSeconds(seconds || 90);
    if (clean <= 0) return;
    setRestTotal(clean);
    setRestLeft(clean);
    setRestEndsAt(Date.now() + clean * 1000);
  }

  function adjustRest(delta: number) {
    const base = restEndsAt != null ? remainingSeconds(restEndsAt, Date.now()) : restLeft;
    const next = clampRestSeconds(base + delta);
    setRestLeft(next);
    if (next > restTotal) setRestTotal(next);
    if (restEndsAt != null) {
      setRestEndsAt(next > 0 ? Date.now() + next * 1000 : null);
    }
  }

  function togglePauseRest() {
    if (restEndsAt != null) {
      setRestLeft(remainingSeconds(restEndsAt, Date.now()));
      setRestEndsAt(null);
    } else if (restLeft > 0) {
      setRestEndsAt(Date.now() + restLeft * 1000);
    }
  }

  function resetRest() {
    setRestEndsAt(null);
    setRestLeft(0);
  }

  useEffect(() => {
    if (restEndsAt == null) return;
    const tick = () => {
      const left = remainingSeconds(restEndsAt, Date.now());
      setRestLeft(left);
      if (left <= 0) {
        setRestEndsAt(null);
        playRestDoneChime();
        feedback({ kind: 'ok', text: 'Descanso concluído!' });
      }
    };
    tick();
    const id = window.setInterval(tick, 250);
    return () => window.clearInterval(id);
  }, [restEndsAt]);

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
    const restSec = last?.rest_s ?? 90;
    setSets((xs) => {
      const idx = xs.map((s) => s.exercise_id).lastIndexOf(exerciseId);
      const copy = { ...(last ?? { exercise_id: exerciseId, set_type_id: working.id, load_kg: 0, reps: 10, rest_s: 120, effort: null }), key: newKey() };
      return [...xs.slice(0, idx + 1), copy, ...xs.slice(idx + 1)];
    });
    if (autoRest && restSec > 0) startRest(restSec);
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

  const restPct = restTotal > 0 ? Math.min(100, Math.max(0, (restLeft / restTotal) * 100)) : 0;

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <button className="btn-ghost" onClick={onClose}><ArrowLeft size={16} strokeWidth={1.5} />Voltar</button>
        <h2 className="mr-auto text-lg font-medium">{workoutId ? 'Editar treino' : start ? `${start.label}: registrar` : 'Novo treino'}</h2>
        {workoutId && <button className="btn-ghost text-negative" onClick={remove}>Excluir</button>}
        <button className="btn-primary" onClick={save} disabled={saving}>{saving ? 'Salvando…' : 'Salvar treino'}</button>
      </div>

      {/* Rest Timer Bar */}
      <section className="card sticky top-3 z-10 mb-4 p-3.5" aria-label="Cronômetro de descanso">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-2">
            <Timer size={17} strokeWidth={1.6} aria-hidden="true" className={restEndsAt ? 'text-brand' : 'text-fg3'} />
            <span className="figure text-xl font-semibold tracking-tight">{formatRestClock(restLeft)}</span>
          </div>
          <div className="flex flex-wrap items-center gap-1">
            {REST_PRESETS.map((sec) => (
              <button
                key={sec}
                type="button"
                onClick={() => startRest(sec)}
                className={`h-8 rounded-full border px-2.5 text-xs font-medium transition-colors ${restTotal === sec && restLeft > 0 ? 'border-brand bg-brand/10 text-brand-ink' : 'border-line-strong bg-surface text-fg2 hover:bg-raised'}`}
              >
                {sec}s
              </button>
            ))}
          </div>
          {restLeft > 0 && (
            <div className="flex items-center gap-1">
              <button type="button" className="btn-ghost h-8 px-2 text-xs" onClick={() => adjustRest(-15)}>−15s</button>
              <button type="button" className="btn-ghost h-8 px-2 text-xs" onClick={() => adjustRest(15)}>+15s</button>
              <button type="button" className="icon-btn h-8 w-8" onClick={togglePauseRest} aria-label={restEndsAt ? 'Pausar descanso' : 'Retomar descanso'}>
                {restEndsAt ? <Pause size={15} strokeWidth={1.6} /> : <Play size={15} strokeWidth={1.6} />}
              </button>
              <button type="button" className="icon-btn h-8 w-8" onClick={resetRest} aria-label="Zerar cronômetro">
                <RotateCcw size={15} strokeWidth={1.6} />
              </button>
            </div>
          )}
          <label className="ml-auto flex cursor-pointer items-center gap-1.5 text-xs text-fg2">
            <input type="checkbox" checked={autoRest} onChange={(e) => setAutoRest(e.target.checked)} />
            Auto ao +Série
          </label>
        </div>
        {restLeft > 0 && (
          <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-raised" role="progressbar" aria-valuenow={Math.round(restPct)} aria-valuemin={0} aria-valuemax={100} aria-label="Tempo restante de descanso">
            <div className="h-full rounded-full bg-brand transition-[width] duration-200" style={{ width: `${restPct}%` }} />
          </div>
        )}
      </section>

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
              <table className="w-full min-w-[580px] text-sm">
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
                      <td className="whitespace-nowrap">
                        <button type="button" className="icon-btn" title={`Iniciar descanso de ${s.rest_s ?? 90}s`} aria-label={`Iniciar descanso da série ${i + 1}`} onClick={() => startRest(s.rest_s ?? 90)}>
                          <Timer size={15} strokeWidth={1.5} />
                        </button>
                        <button type="button" className="icon-btn hover:text-negative" aria-label={`Apagar série ${i + 1}, ${ex?.name ?? 'exercício'}`} onClick={() => setSets((xs) => xs.filter((x) => x.key !== s.key))}><X size={16} strokeWidth={1.5} /></button>
                      </td>
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
