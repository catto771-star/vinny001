import { useState, type FormEvent } from 'react';
import { ArrowDown, ArrowUp, ClipboardList, Play, Plus, Trash2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { write } from '../../lib/useTable';
import { toDay, weekdayShort } from '../../lib/dates';
import { MUSCLE_LABEL } from '../../lib/training';
import { serialQueue } from '../../lib/serial';
import { draftFromSession, sessionsForDay, type PlanExercise, type PlanSession } from '../../lib/plans';
import { Empty, Field, FieldGroup, WeekdayPicker } from '../../components/ui';
import { ExercisePicker } from './WorkoutEditor';
import type { Health } from './useHealth';

export interface StartSession { sessionId: string; label: string; draft: ReturnType<typeof draftFromSession> }

const SPLITS: Record<string, string[]> = {
  'A (corpo inteiro)': ['Treino A'],
  AB: ['Treino A', 'Treino B'],
  ABC: ['Treino A', 'Treino B', 'Treino C'],
  ABCD: ['Treino A', 'Treino B', 'Treino C', 'Treino D'],
  ABCDE: ['Treino A', 'Treino B', 'Treino C', 'Treino D', 'Treino E'],
};

const I = { size: 16, strokeWidth: 1.5 } as const;

export default function PlanEditor({ h, onStart }: { h: Health; onStart: (s: StartSession) => void }) {
  const plan = h.workoutPlan;
  const today = toDay(new Date());
  if (!plan) return <CreatePlan h={h} />;
  const sessions = h.planSessions.rows.filter((s) => s.plan_id === plan.id).sort((a, b) => a.order_index - b.order_index);
  const todays = sessionsForDay(sessions, h.workouts.rows, today);
  const working = h.setTypes.rows.find((t) => t.drives_progression && t.user_id === null) ?? h.setTypes.rows[0];

  function start(s: PlanSession) {
    const exercises = h.planExercises.rows.filter((e) => e.session_id === s.id);
    const draft = draftFromSession(exercises, {
      sets: h.sets.rows, workouts: h.workouts.rows, types: h.typeById, settings: h.settingsById, workingTypeId: working.id, day: today,
    });
    onStart({ sessionId: s.id, label: s.label, draft });
  }

  async function addSession() {
    const label = `Treino ${String.fromCharCode(65 + sessions.length)}`;
    if (await write(supabase.from('workout_plan_sessions').insert({ plan_id: plan!.id, label, order_index: sessions.length }))) void h.planSessions.reload();
  }

  return (
    <>
      <section className="card mb-6">
        <div className="label mb-3">Treino de hoje</div>
        {todays.length === 0 ? (
          <p className="text-sm text-fg2">Nenhuma divisão marcada para hoje. Escolha uma abaixo ou marque os dias de cada divisão</p>
        ) : (
          <div className="flex flex-wrap gap-3">
            {todays.map((s) => {
              const n = h.planExercises.rows.filter((e) => e.session_id === s.id).length;
              return (
                <div key={s.id} className="flex min-w-60 flex-1 items-center gap-4 rounded-xl border border-line bg-raised p-4">
                  <div className="mr-auto">
                    <div className="text-lg font-medium">{s.label}</div>
                    <div className="text-[13px] text-fg3">{n} {n === 1 ? 'exercício' : 'exercícios'}</div>
                  </div>
                  <button className="btn-primary" onClick={() => start(s)} disabled={!n}><Play {...I} />Começar</button>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <PlanName h={h} />
        <button className="btn-secondary ml-auto" onClick={addSession}><Plus {...I} />Divisão</button>
      </div>
      {sessions.map((s) => <SessionCard key={s.id} h={h} session={s} onStart={() => start(s)} />)}
    </>
  );
}

function CreatePlan({ h }: { h: Health }) {
  const [name, setName] = useState('Minha ficha');
  const [split, setSplit] = useState('ABC');
  async function create(e: FormEvent) {
    e.preventDefault();
    const { data, error } = await supabase.from('workout_plans').insert({ name, is_active: true }).select('id').single();
    if (error || !data) return alert(`Não foi possível criar: ${error?.message}`);
    await write(supabase.from('workout_plan_sessions').insert(SPLITS[split].map((label, i) => ({ plan_id: data.id, label, order_index: i }))));
    await Promise.all([h.workoutPlans.reload(), h.planSessions.reload()]);
  }
  return (
    <div className="card max-w-lg">
      <Empty icon={<ClipboardList size={18} strokeWidth={1.5} />}>Monte sua ficha: divisões com os exercícios, séries e repetições. O treino do dia sai dela já preenchido</Empty>
      <form onSubmit={create}>
        <Field label="Nome da ficha"><input className="input" value={name} onChange={(e) => setName(e.target.value)} required /></Field>
        <FieldGroup label="Divisão">
          <div className="segmented">
            {Object.keys(SPLITS).map((k) => <button type="button" key={k} aria-pressed={k === split} className={k === split ? 'tab-active' : 'tab'} onClick={() => setSplit(k)}>{k}</button>)}
          </div>
        </FieldGroup>
        <button className="btn-primary w-full">Criar ficha</button>
      </form>
    </div>
  );
}

function PlanName({ h }: { h: Health }) {
  const plan = h.workoutPlan!;
  const [name, setName] = useState(plan.name);
  return (
    <input
      className="input h-9 max-w-xs bg-transparent text-lg font-medium" aria-label="Nome da ficha" value={name}
      onChange={(e) => setName(e.target.value)}
      onBlur={async () => { if (name.trim() && name !== plan.name && await write(supabase.from('workout_plans').update({ name }).eq('id', plan.id))) void h.workoutPlans.reload(); }}
    />
  );
}

function SessionCard({ h, session, onStart }: { h: Health; session: PlanSession; onStart: () => void }) {
  const [picking, setPicking] = useState(false);
  const [label, setLabel] = useState(session.label);
  // Weekdays live here so quick taps build on each other instead of on the last saved value.
  const [weekdays, setWeekdays] = useState(session.weekdays);
  const [queue] = useState(serialQueue);
  const rows = h.planExercises.rows.filter((e) => e.session_id === session.id).sort((a, b) => a.order_index - b.order_index);

  const update = (patch: Partial<PlanSession>) => queue(async () => {
    if (await write(supabase.from('workout_plan_sessions').update(patch).eq('id', session.id))) await h.planSessions.reload();
  });
  async function add(exerciseId: string) {
    setPicking(false);
    if (await write(supabase.from('workout_plan_exercises').insert({ session_id: session.id, exercise_id: exerciseId, sets: 3, reps: '8-12', rest_s: 90, order_index: rows.length }))) void h.planExercises.reload();
  }
  async function move(row: PlanExercise, dir: -1 | 1) {
    const other = rows[rows.indexOf(row) + dir];
    if (!other) return;
    await Promise.all([
      supabase.from('workout_plan_exercises').update({ order_index: other.order_index }).eq('id', row.id),
      supabase.from('workout_plan_exercises').update({ order_index: row.order_index }).eq('id', other.id),
    ]);
    void h.planExercises.reload();
  }
  async function removeSession() {
    if (confirm(`Excluir a divisão ${session.label} e os exercícios dela?`) && await write(supabase.from('workout_plan_sessions').delete().eq('id', session.id))) {
      void h.planSessions.reload();
      void h.planExercises.reload();
    }
  }

  return (
    <section className="card mb-4">
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <input className="input h-9 w-40 font-medium" aria-label="Nome da divisão" value={label} onChange={(e) => setLabel(e.target.value)}
          onBlur={() => { if (label.trim() && label !== session.label) void update({ label }); }} />
        <WeekdayPicker value={weekdays} onChange={(next) => { setWeekdays(next); void update({ weekdays: next }); }} />
        <span className="text-[13px] text-fg3">{weekdays.length ? weekdays.map(weekdayShort).join(', ') : 'sem dia fixo: entra em rodízio'}</span>
        <div className="ml-auto flex gap-1">
          <button className="btn-primary" onClick={onStart} disabled={!rows.length}><Play {...I} />Começar</button>
          <button className="icon-btn" onClick={removeSession} aria-label={`Excluir ${session.label}`}><Trash2 {...I} /></button>
        </div>
      </div>
      {rows.length === 0 ? <p className="mb-3 text-sm text-fg3">Nenhum exercício nesta divisão</p> : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="text-left text-xs text-fg3">
                <th className="pb-2 font-normal">Exercício</th><th className="pb-2 font-normal">Séries</th><th className="pb-2 font-normal">Repetições</th>
                <th className="pb-2 font-normal">Carga (kg)</th><th className="pb-2 font-normal">Descanso (s)</th><th className="pb-2 font-normal">Observação</th><th />
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => <ExerciseRow key={r.id} h={h} row={r} first={i === 0} last={i === rows.length - 1} onMove={(d) => move(r, d)} />)}
            </tbody>
          </table>
        </div>
      )}
      <button className="btn-ghost mt-2" onClick={() => setPicking(true)}><Plus {...I} />Exercício</button>
      {picking && <ExercisePicker h={h} onPick={add} onClose={() => setPicking(false)} />}
    </section>
  );
}

function ExerciseRow({ h, row, first, last, onMove }: { h: Health; row: PlanExercise; first: boolean; last: boolean; onMove: (d: -1 | 1) => void }) {
  const ex = row.exercise_id ? h.exerciseById.get(row.exercise_id) : undefined;
  const [v, setV] = useState({ sets: row.sets?.toString() ?? '', reps: row.reps ?? '', load_kg: row.load_kg?.toString() ?? '', rest_s: row.rest_s?.toString() ?? '', notes: row.notes ?? '' });
  // Saves run in order, so a quick series of edits always ends with the latest values stored.
  const [queue] = useState(serialQueue);
  const save = () => {
    const patch = {
      sets: v.sets ? Number(v.sets) : null, reps: v.reps || null, load_kg: v.load_kg ? Number(v.load_kg) : null,
      rest_s: v.rest_s ? Number(v.rest_s) : null, notes: v.notes || null,
    };
    void queue(async () => { if (await write(supabase.from('workout_plan_exercises').update(patch).eq('id', row.id))) await h.planExercises.reload(); });
  };
  const cell = (k: keyof typeof v, label: string, w: string, type = 'text') => (
    <td className="py-1 pr-2"><input className={`input h-9 ${w}`} aria-label={`${label}: ${ex?.name}`} type={type} value={v[k]} onChange={(e) => setV({ ...v, [k]: e.target.value })} onBlur={save} /></td>
  );
  return (
    <tr className="border-t border-line">
      <td className="py-2 pr-3">
        <div>{ex?.name ?? 'Exercício'}</div>
        <div className="text-xs text-fg3">{ex ? MUSCLE_LABEL[ex.muscle_group] : ''}</div>
      </td>
      {cell('sets', 'Séries', 'w-16', 'number')}
      {cell('reps', 'Repetições', 'w-20')}
      {cell('load_kg', 'Carga', 'w-20', 'number')}
      {cell('rest_s', 'Descanso', 'w-20', 'number')}
      {cell('notes', 'Observação', 'w-40')}
      <td className="whitespace-nowrap">
        <button className="icon-btn" disabled={first} onClick={() => onMove(-1)} aria-label={`Subir ${ex?.name}`}><ArrowUp {...I} /></button>
        <button className="icon-btn" disabled={last} onClick={() => onMove(1)} aria-label={`Descer ${ex?.name}`}><ArrowDown {...I} /></button>
        <button className="icon-btn hover:text-negative" aria-label={`Remover ${ex?.name}`} onClick={async () => {
          if (await write(supabase.from('workout_plan_exercises').delete().eq('id', row.id))) void h.planExercises.reload();
        }}><Trash2 {...I} /></button>
      </td>
    </tr>
  );
}
