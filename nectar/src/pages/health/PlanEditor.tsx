import { useMemo, useState, type FormEvent } from 'react';
import {
  ArrowDown, ArrowUp, BookOpen, CheckCircle2, ClipboardList, Copy, Flame,
  FolderPlus, Play, Plus, Sparkles, Timer, Trash2,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { write } from '../../lib/useTable';
import { feedback } from '../../lib/feedback';
import { toDay, weekdayShort } from '../../lib/dates';
import { num } from '../../lib/format';
import { MUSCLE_LABEL } from '../../lib/training';
import {
  estimateSetsDurationMinutes, formatSessionNotes, formatSetNotes, parseSessionNotes,
  parseSetNotes, PRESET_PROGRAMS, SUPERSET_IDS, SUPERSET_STYLE, workoutKcal,
  type PresetProgram,
} from '../../lib/hevy';
import { serialQueue } from '../../lib/serial';
import { searchKey } from '../../lib/text';
import { draftFromSession, sessionsForDay, type PlanExercise, type PlanSession } from '../../lib/plans';
import { Empty, Field, FieldGroup, Modal, WeekdayPicker } from '../../components/ui';
import { openAssistantDrawer } from '../../components/AssistantDrawer';
import { ExercisePicker } from './WorkoutEditor';
import ExerciseDetailModal from './ExerciseDetailModal';
import { DEFAULT_WEIGHT_KG, type Health } from './useHealth';

export interface StartSession { sessionId: string; label: string; draft: ReturnType<typeof draftFromSession> }

const SPLITS: Record<string, string[]> = {
  'A (corpo inteiro)': ['Treino A'],
  AB: ['Treino A', 'Treino B'],
  ABC: ['Treino A', 'Treino B', 'Treino C'],
  ABCD: ['Treino A', 'Treino B', 'Treino C', 'Treino D'],
  ABCDE: ['Treino A', 'Treino B', 'Treino C', 'Treino D', 'Treino E'],
};

const CUSTOM_FOLDERS_KEY = 'painel:routine-folders:v1';
const I = { size: 16, strokeWidth: 1.5 } as const;

function readSavedFolders(): string[] {
  try {
    const raw = window.localStorage.getItem(CUSTOM_FOLDERS_KEY);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

function saveCustomFolders(folders: string[]) {
  try {
    window.localStorage.setItem(CUSTOM_FOLDERS_KEY, JSON.stringify(folders));
  } catch {
    // Ignore storage errors
  }
}

export default function PlanEditor({ h, onStart }: { h: Health; onStart: (s: StartSession) => void }) {
  const plan = h.workoutPlan;
  const today = toDay(new Date());
  const [selectedFolder, setSelectedFolder] = useState<string>('__all__');
  const [customFolders, setCustomFolders] = useState<string[]>(() => readSavedFolders());
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [showPresets, setShowPresets] = useState(false);
  const [detailExId, setDetailExId] = useState<string | null>(null);

  const sessions = useMemo(
    () => (plan ? h.planSessions.rows.filter((s) => s.plan_id === plan.id).sort((a, b) => a.order_index - b.order_index) : []),
    [plan, h.planSessions.rows],
  );

  const allFolders = useMemo(() => {
    const set = new Set<string>(customFolders);
    for (const s of sessions) {
      const f = parseSessionNotes(s.notes).folder;
      if (f) set.add(f);
    }
    return [...set].sort((a, b) => a.localeCompare(b, 'pt'));
  }, [customFolders, sessions]);

  if (!plan) return <CreatePlan h={h} onOpenPresets={() => setShowPresets(true)} showPresets={showPresets} onClosePresets={() => setShowPresets(false)} />;

  const todays = sessionsForDay(sessions, h.workouts.rows, today);
  const working = h.setTypes.rows.find((t) => t.drives_progression && t.user_id === null) ?? h.setTypes.rows[0];
  const weightKg = h.latestWeight ?? DEFAULT_WEIGHT_KG;

  function start(s: PlanSession) {
    const exercises = h.planExercises.rows.filter((e) => e.session_id === s.id);
    const draft = draftFromSession(exercises, {
      sets: h.sets.rows, workouts: h.workouts.rows, types: h.typeById, settings: h.settingsById, workingTypeId: working.id, day: today,
    });
    onStart({ sessionId: s.id, label: s.label, draft });
  }

  async function addSession() {
    const label = `Treino ${String.fromCharCode(65 + sessions.length)}`;
    const folder = selectedFolder !== '__all__' && selectedFolder !== '__none__' ? selectedFolder : null;
    const notes = formatSessionNotes({ folder, cleanNotes: '' });
    if (await write(supabase.from('workout_plan_sessions').insert({ plan_id: plan!.id, label, order_index: sessions.length, notes }))) {
      void h.planSessions.reload();
    }
  }

  async function duplicateSession(s: PlanSession) {
    const { data, error } = await supabase
      .from('workout_plan_sessions')
      .insert({
        plan_id: plan!.id,
        label: `${s.label} (cópia)`,
        weekdays: [],
        order_index: sessions.length,
        notes: s.notes,
      })
      .select('id')
      .single();
    if (error || !data) return feedback({ kind: 'error', text: `Erro ao duplicar: ${error?.message}` });
    const rows = h.planExercises.rows.filter((e) => e.session_id === s.id).sort((a, b) => a.order_index - b.order_index);
    if (rows.length) {
      await write(
        supabase.from('workout_plan_exercises').insert(
          rows.map((r, idx) => ({
            session_id: data.id,
            exercise_id: r.exercise_id,
            sets: r.sets,
            reps: r.reps,
            load_kg: r.load_kg,
            rest_s: r.rest_s,
            notes: r.notes,
            order_index: idx,
          })),
        ),
      );
    }
    await Promise.all([h.planSessions.reload(), h.planExercises.reload()]);
    feedback({ kind: 'ok', text: `Rotina "${s.label}" duplicada` });
  }

  function handleCreateFolder(e: FormEvent) {
    e.preventDefault();
    const clean = newFolderName.trim();
    if (!clean) return;
    const next = [...new Set([...customFolders, clean])];
    setCustomFolders(next);
    saveCustomFolders(next);
    setSelectedFolder(clean);
    setNewFolderName('');
    setCreatingFolder(false);
  }

  async function importPresetProgram(prog: PresetProgram) {
    let orderIdx = sessions.length;
    for (const r of prog.routines) {
      const notes = formatSessionNotes({ folder: prog.folder, cleanNotes: r.notes });
      const { data, error } = await supabase
        .from('workout_plan_sessions')
        .insert({
          plan_id: plan!.id,
          label: r.label,
          weekdays: r.weekdays,
          order_index: orderIdx++,
          notes,
        })
        .select('id')
        .single();
      if (error || !data) continue;
      const exRows = r.exercises
        .map((spec, idx) => {
          const found = h.exercises.rows.find((ex) => searchKey(ex.name) === searchKey(spec.name))
            ?? h.exercises.rows.find((ex) => searchKey(ex.name).includes(searchKey(spec.name)));
          if (!found) return null;
          return {
            session_id: data.id,
            exercise_id: found.id,
            sets: spec.sets,
            reps: spec.reps,
            rest_s: spec.rest_s,
            notes: formatSetNotes({ superset: spec.superset ?? null, cleanNotes: spec.notes ?? '' }),
            order_index: idx,
          };
        })
        .filter((x): x is NonNullable<typeof x> => x !== null);
      if (exRows.length) {
        await supabase.from('workout_plan_exercises').insert(exRows);
      }
    }
    const nextFolders = [...new Set([...customFolders, prog.folder])];
    setCustomFolders(nextFolders);
    saveCustomFolders(nextFolders);
    setSelectedFolder(prog.folder);
    setShowPresets(false);
    await Promise.all([h.planSessions.reload(), h.planExercises.reload()]);
    feedback({ kind: 'ok', text: `Programa "${prog.title}" importado na pasta "${prog.folder}"!` });
  }

  const filteredSessions = sessions.filter((s) => {
    if (selectedFolder === '__all__') return true;
    const f = parseSessionNotes(s.notes).folder;
    if (selectedFolder === '__none__') return !f;
    return f === selectedFolder;
  });

  const activeHabits = (h.habits?.rows ?? []).filter((hb) => !hb.is_archived);

  return (
    <>
      {/* Treino de Hoje Hero */}
      <section className="card mb-6">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <span className="label">Treino previsto para hoje</span>
          {activeHabits.length > 0 && (
            <label className="flex items-center gap-1.5 text-xs text-fg3">
              <CheckCircle2 size={13} strokeWidth={1.5} className="text-positive" />
              Sincronizar hábito:
              <select
                aria-label="Vincular hábito à ficha"
                className="input h-7 w-auto py-0 px-2 text-xs"
                value={plan.habit_id ?? ''}
                onChange={async (e) => {
                  const val = e.target.value || null;
                  if (await write(supabase.from('workout_plans').update({ habit_id: val }).eq('id', plan.id))) {
                    void h.workoutPlans.reload();
                  }
                }}
              >
                <option value="">Automático (Treinar / Academia)</option>
                {activeHabits.map((hb) => (
                  <option key={hb.id} value={hb.id}>{hb.name}</option>
                ))}
              </select>
            </label>
          )}
        </div>
        {todays.length === 0 ? (
          <p className="text-sm text-fg2">Nenhuma divisão marcada para hoje. Escolha uma abaixo ou marque os dias da semana de cada rotina.</p>
        ) : (
          <div className="flex flex-wrap gap-3">
            {todays.map((s) => {
              const exList = h.planExercises.rows.filter((e) => e.session_id === s.id);
              const totalSets = exList.reduce((acc, e) => acc + Math.max(1, e.sets ?? 3), 0);
              const estMin = estimateSetsDurationMinutes(
                exList.flatMap((e) => Array.from({ length: Math.max(1, e.sets ?? 3) }, () => ({ rest_s: e.rest_s ?? 90 }))),
              );
              const estKcal = workoutKcal({ duration_min: estMin }, [], h.typeById, weightKg).kcal;
              return (
                <div key={s.id} className="flex min-w-60 flex-1 items-center gap-4 rounded-xl border border-line bg-raised p-4">
                  <div className="mr-auto">
                    <div className="text-lg font-medium">{s.label}</div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-2 text-[13px] text-fg3">
                      <span>{exList.length} {exList.length === 1 ? 'exercício' : 'exercícios'} · {totalSets} séries</span>
                      {estMin > 0 && <span>· ~{estMin} min</span>}
                      {estKcal > 0 && <span>· ~{num(estKcal)} kcal</span>}
                    </div>
                  </div>
                  <button className="btn-primary" onClick={() => start(s)} disabled={!exList.length}>
                    <Play {...I} />Começar
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Header + Routine Folders + Program Library + AI Routine Builder */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <PlanName h={h} />
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <button
            type="button"
            className="btn-ghost h-9 text-xs"
            onClick={() =>
              openAssistantDrawer({
                prompt: 'Quero criar uma rotina de treinos personalizada na minha Ficha (gerar_rotina_treino). Considere meu histórico, peso e metas atuais e sugira ou crie as divisões ideais.',
                newThread: true,
              })
            }
          >
            <Sparkles size={15} strokeWidth={1.5} /> Montar com IA
          </button>
          <button type="button" className="btn-secondary h-9 text-xs" onClick={() => setShowPresets(true)}>
            <BookOpen size={15} strokeWidth={1.5} /> Programas prontos
          </button>
          <button type="button" className="btn-secondary h-9 text-xs" onClick={() => setCreatingFolder(true)}>
            <FolderPlus size={15} strokeWidth={1.5} /> Nova pasta
          </button>
          <button className="btn-primary h-9 text-xs" onClick={addSession}>
            <Plus {...I} />Nova rotina
          </button>
        </div>
      </div>

      {/* Folder Filter Bar (Hevy Routine Folders) */}
      {allFolders.length > 0 && (
        <div className="mb-4 flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => setSelectedFolder('__all__')}
            className={`h-7 rounded-lg border px-2.5 text-xs transition-colors ${
              selectedFolder === '__all__' ? 'border-brand bg-brand/10 font-medium text-fg' : 'border-line text-fg3 hover:text-fg'
            }`}
          >
            Todas ({sessions.length})
          </button>
          {allFolders.map((f) => {
            const count = sessions.filter((s) => parseSessionNotes(s.notes).folder === f).length;
            return (
              <button
                key={f}
                type="button"
                onClick={() => setSelectedFolder(f)}
                className={`h-7 rounded-lg border px-2.5 text-xs transition-colors ${
                  selectedFolder === f ? 'border-brand bg-brand/10 font-medium text-fg' : 'border-line text-fg3 hover:text-fg'
                }`}
              >
                {f} ({count})
              </button>
            );
          })}
          {sessions.some((s) => !parseSessionNotes(s.notes).folder) && (
            <button
              type="button"
              onClick={() => setSelectedFolder('__none__')}
              className={`h-7 rounded-lg border px-2.5 text-xs transition-colors ${
                selectedFolder === '__none__' ? 'border-brand bg-brand/10 font-medium text-fg' : 'border-line text-fg3 hover:text-fg'
              }`}
            >
              Sem pasta
            </button>
          )}
        </div>
      )}

      {filteredSessions.length === 0 ? (
        <div className="card">
          <Empty action={<button className="btn-secondary" onClick={addSession}><Plus {...I} />Adicionar rotina</button>}>
            Nenhuma rotina nesta pasta ainda.
          </Empty>
        </div>
      ) : (
        filteredSessions.map((s) => (
          <SessionCard
            key={s.id}
            h={h}
            session={s}
            folders={allFolders}
            weightKg={weightKg}
            onStart={() => start(s)}
            onDuplicate={() => void duplicateSession(s)}
            onInspectExercise={setDetailExId}
          />
        ))
      )}

      {creatingFolder && (
        <Modal title="Nova pasta de rotinas" onClose={() => setCreatingFolder(false)}>
          <form onSubmit={handleCreateFolder} className="space-y-3">
            <Field label="Nome da pasta">
              <input
                className="input"
                placeholder="Ex.: Hipertrofia Inverno, Viagem / Halteres, Força…"
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                required
                autoFocus
              />
            </Field>
            <button className="btn-primary w-full justify-center">Criar pasta</button>
          </form>
        </Modal>
      )}

      {showPresets && (
        <PresetProgramsModal
          onImport={(p) => void importPresetProgram(p)}
          onClose={() => setShowPresets(false)}
        />
      )}

      {detailExId && (
        <ExerciseDetailModal h={h} exerciseId={detailExId} onClose={() => setDetailExId(null)} />
      )}
    </>
  );
}

function PresetProgramsModal({ onImport, onClose }: { onImport: (p: PresetProgram) => void; onClose: () => void }) {
  return (
    <Modal title="Programas Prontos · Biblioteca Estilo Hevy" onClose={onClose}>
      <div className="max-h-[70vh] space-y-3 overflow-y-auto pr-1">
        {PRESET_PROGRAMS.map((p) => (
          <div key={p.id} className="rounded-xl border border-line bg-raised/30 p-3.5">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h3 className="font-medium text-fg">{p.title}</h3>
              <div className="flex gap-1.5 text-[11px] text-fg3">
                <span className="rounded border border-line px-1.5 py-0.5">{p.level}</span>
                <span className="rounded border border-line px-1.5 py-0.5">{p.equipment}</span>
                <span className="rounded border border-line px-1.5 py-0.5">{p.daysPerWeek}x/sem</span>
              </div>
            </div>
            <p className="mt-1 text-xs text-fg2">{p.summary}</p>
            <div className="mt-2 flex flex-wrap gap-1.5 text-[11px] text-fg3">
              {p.routines.map((r) => (
                <span key={r.label} className="rounded bg-raised px-2 py-0.5">
                  {r.label} ({r.exercises.length} ex.)
                </span>
              ))}
            </div>
            <button
              type="button"
              className="btn-primary mt-3 h-8 w-full justify-center text-xs"
              onClick={() => onImport(p)}
            >
              Importar na pasta &ldquo;{p.folder}&rdquo;
            </button>
          </div>
        ))}
      </div>
    </Modal>
  );
}

function CreatePlan({
  h,
  onOpenPresets,
  showPresets,
  onClosePresets,
}: {
  h: Health;
  onOpenPresets: () => void;
  showPresets: boolean;
  onClosePresets: () => void;
}) {
  const [name, setName] = useState('Minha ficha');
  const [split, setSplit] = useState('ABC');
  async function create(e: FormEvent) {
    e.preventDefault();
    const { data, error } = await supabase.from('workout_plans').insert({ name, is_active: true }).select('id').single();
    if (error || !data) return alert(`Não foi possível criar: ${error?.message}`);
    await write(supabase.from('workout_plan_sessions').insert(SPLITS[split].map((label, i) => ({ plan_id: data.id, label, order_index: i }))));
    await Promise.all([h.workoutPlans.reload(), h.planSessions.reload()]);
  }

  async function createFromPreset(prog: PresetProgram) {
    const { data: planData, error } = await supabase.from('workout_plans').insert({ name: prog.title, is_active: true }).select('id').single();
    if (error || !planData) return alert(`Não foi possível criar: ${error?.message}`);
    for (let i = 0; i < prog.routines.length; i++) {
      const r = prog.routines[i];
      const { data: sData } = await supabase
        .from('workout_plan_sessions')
        .insert({
          plan_id: planData.id,
          label: r.label,
          weekdays: r.weekdays,
          order_index: i,
          notes: formatSessionNotes({ folder: prog.folder, cleanNotes: r.notes }),
        })
        .select('id')
        .single();
      if (!sData) continue;
      const exRows = r.exercises
        .map((spec, idx) => {
          const found = h.exercises.rows.find((ex) => searchKey(ex.name) === searchKey(spec.name));
          if (!found) return null;
          return {
            session_id: sData.id,
            exercise_id: found.id,
            sets: spec.sets,
            reps: spec.reps,
            rest_s: spec.rest_s,
            notes: formatSetNotes({ superset: spec.superset ?? null, cleanNotes: spec.notes ?? '' }),
            order_index: idx,
          };
        })
        .filter((x): x is NonNullable<typeof x> => x !== null);
      if (exRows.length) await supabase.from('workout_plan_exercises').insert(exRows);
    }
    onClosePresets();
    await Promise.all([h.workoutPlans.reload(), h.planSessions.reload(), h.planExercises.reload()]);
  }

  return (
    <div className="card max-w-lg">
      <Empty icon={<ClipboardList size={18} strokeWidth={1.5} />}>
        Monte sua ficha em pastas ou importe um Programa Pronto estilo Hevy. O treino do dia já abre preenchido com progressão automática.
      </Empty>
      <form onSubmit={create}>
        <Field label="Nome da ficha"><input className="input" value={name} onChange={(e) => setName(e.target.value)} required /></Field>
        <FieldGroup label="Divisão inicial">
          <div className="segmented">
            {Object.keys(SPLITS).map((k) => <button type="button" key={k} aria-pressed={k === split} className={k === split ? 'tab-active' : 'tab'} onClick={() => setSplit(k)}>{k}</button>)}
          </div>
        </FieldGroup>
        <div className="flex flex-col gap-2 sm:flex-row">
          <button className="btn-primary flex-1 justify-center">Criar ficha vazia</button>
          <button type="button" className="btn-secondary flex-1 justify-center" onClick={onOpenPresets}>
            <BookOpen size={15} strokeWidth={1.5} /> Importar programa pronto
          </button>
        </div>
      </form>
      {showPresets && <PresetProgramsModal onImport={(p) => void createFromPreset(p)} onClose={onClosePresets} />}
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

function SessionCard({
  h,
  session,
  folders,
  weightKg,
  onStart,
  onDuplicate,
  onInspectExercise,
}: {
  h: Health;
  session: PlanSession;
  folders: string[];
  weightKg: number;
  onStart: () => void;
  onDuplicate: () => void;
  onInspectExercise: (id: string) => void;
}) {
  const [picking, setPicking] = useState(false);
  const [label, setLabel] = useState(session.label);
  const [weekdays, setWeekdays] = useState(session.weekdays);
  const parsedNotes = useMemo(() => parseSessionNotes(session.notes), [session.notes]);
  const [queue] = useState(serialQueue);
  const rows = h.planExercises.rows.filter((e) => e.session_id === session.id).sort((a, b) => a.order_index - b.order_index);

  // Hevy Routine Summary Stats (Estimated Duration, Total Sets, Estimated Burn, Muscles)
  const totalSets = rows.reduce((sum, r) => sum + Math.max(1, r.sets ?? 3), 0);
  const estMinutes = estimateSetsDurationMinutes(
    rows.flatMap((r) => Array.from({ length: Math.max(1, r.sets ?? 3) }, () => ({ rest_s: r.rest_s ?? 90 }))),
  );
  const estBurnKcal = rows.length ? workoutKcal({ duration_min: estMinutes }, [], h.typeById, weightKg).kcal : 0;
  const primaryMuscles = [
    ...new Set(
      rows
        .map((r) => (r.exercise_id ? h.exerciseById.get(r.exercise_id)?.muscle_group : null))
        .filter((m): m is string => !!m)
        .map((m) => MUSCLE_LABEL[m] ?? m),
    ),
  ];

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
      <div className="mb-3 flex flex-wrap items-center gap-2.5">
        <input
          className="input h-9 w-48 font-medium"
          aria-label="Nome da divisão"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          onBlur={() => { if (label.trim() && label !== session.label) void update({ label }); }}
        />

        {/* Folder assignment */}
        <select
          aria-label={`Pasta de ${session.label}`}
          className="input h-9 w-auto py-0 px-2.5 text-xs"
          value={parsedNotes.folder ?? ''}
          onChange={(e) => {
            const nextNotes = formatSessionNotes({ folder: e.target.value || null, cleanNotes: parsedNotes.cleanNotes });
            void update({ notes: nextNotes });
          }}
        >
          <option value="">Sem pasta</option>
          {folders.map((f) => (
            <option key={f} value={f}>Pasta: {f}</option>
          ))}
        </select>

        <WeekdayPicker value={weekdays} onChange={(next) => { setWeekdays(next); void update({ weekdays: next }); }} />
        <span className="text-xs text-fg3">{weekdays.length ? weekdays.map(weekdayShort).join(', ') : 'rodízio automático'}</span>

        <div className="ml-auto flex items-center gap-1">
          <button
            type="button"
            className="btn-ghost h-9 px-2.5 text-xs"
            onClick={onDuplicate}
            title="Duplicar esta rotina"
          >
            <Copy size={14} strokeWidth={1.5} /> Duplicar
          </button>
          <button className="btn-primary h-9" onClick={onStart} disabled={!rows.length}>
            <Play {...I} />Começar
          </button>
          <button className="icon-btn" onClick={removeSession} aria-label={`Excluir ${session.label}`}>
            <Trash2 {...I} />
          </button>
        </div>
      </div>

      {/* Hevy Summary Bar: Estimated Duration, Total Sets, Estimated Burn & Muscle Focus */}
      {rows.length > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-3 rounded-lg border border-line bg-raised/40 px-3 py-1.5 text-xs text-fg2">
          <span className="inline-flex items-center gap-1">
            <Timer size={13} strokeWidth={1.5} className="text-fg3" />
            Duração est.: <strong className="figure">~{estMinutes} min</strong>
          </span>
          <span className="inline-flex items-center gap-1">
            <Flame size={13} strokeWidth={1.5} className="text-brand" />
            Gasto est.: <strong className="figure">~{num(estBurnKcal)} kcal</strong>
          </span>
          <span className="figure text-fg3">
            {rows.length} ex. · {totalSets} séries
          </span>
          {primaryMuscles.length > 0 && (
            <span className="ml-auto truncate text-fg3">{primaryMuscles.join(' · ')}</span>
          )}
        </div>
      )}

      {rows.length === 0 ? (
        <p className="mb-3 text-sm text-fg3">Nenhum exercício nesta rotina</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[780px] text-sm">
            <thead>
              <tr className="text-left text-xs text-fg3">
                <th className="pb-2 font-normal">Exercício</th>
                <th className="pb-2 font-normal">Superset</th>
                <th className="pb-2 font-normal">Séries</th>
                <th className="pb-2 font-normal">Reps / Faixa</th>
                <th className="pb-2 font-normal">Carga (kg)</th>
                <th className="pb-2 font-normal">Descanso (s)</th>
                <th className="pb-2 font-normal">Observação</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <ExerciseRow
                  key={r.id}
                  h={h}
                  row={r}
                  first={i === 0}
                  last={i === rows.length - 1}
                  onMove={(d) => move(r, d)}
                  onInspect={() => r.exercise_id && onInspectExercise(r.exercise_id)}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
      <button className="btn-ghost mt-2" onClick={() => setPicking(true)}>
        <Plus {...I} />Exercício
      </button>
      {picking && <ExercisePicker h={h} onPick={add} onClose={() => setPicking(false)} />}
    </section>
  );
}

function ExerciseRow({
  h,
  row,
  first,
  last,
  onMove,
  onInspect,
}: {
  h: Health;
  row: PlanExercise;
  first: boolean;
  last: boolean;
  onMove: (d: -1 | 1) => void;
  onInspect: () => void;
}) {
  const ex = row.exercise_id ? h.exerciseById.get(row.exercise_id) : undefined;
  const parsed = parseSetNotes(row.notes);
  const [v, setV] = useState({
    sets: row.sets?.toString() ?? '',
    reps: row.reps ?? '',
    load_kg: row.load_kg?.toString() ?? '',
    rest_s: row.rest_s?.toString() ?? '',
    superset: parsed.superset ?? '',
    notes: parsed.cleanNotes,
  });
  const [queue] = useState(serialQueue);

  const persist = (next = v) => {
    const patch = {
      sets: next.sets ? Number(next.sets) : null,
      reps: next.reps || null,
      load_kg: next.load_kg ? Number(next.load_kg) : null,
      rest_s: next.rest_s ? Number(next.rest_s) : null,
      notes: formatSetNotes({ superset: next.superset || null, cleanNotes: next.notes }),
    };
    void queue(async () => {
      if (await write(supabase.from('workout_plan_exercises').update(patch).eq('id', row.id))) await h.planExercises.reload();
    });
  };

  const ssStyle = v.superset ? SUPERSET_STYLE[v.superset] : null;

  const cell = (k: 'sets' | 'reps' | 'load_kg' | 'rest_s' | 'notes', label: string, w: string, type = 'text') => (
    <td className="py-1 pr-2">
      <input
        className={`input h-9 ${w}`}
        aria-label={`${label}: ${ex?.name}`}
        type={type}
        value={v[k]}
        onChange={(e) => setV({ ...v, [k]: e.target.value })}
        onBlur={() => persist()}
      />
    </td>
  );

  return (
    <tr className={`border-t border-line ${ssStyle ? 'bg-raised/20' : ''}`}>
      <td className="py-2 pr-3">
        <button type="button" className="text-left font-medium text-fg hover:text-brand hover:underline" onClick={onInspect}>
          {ex?.name ?? 'Exercício'}
        </button>
        <div className="text-xs text-fg3">
          {ex ? MUSCLE_LABEL[ex.muscle_group] : ''}
          {ex?.equipment ? ` · ${ex.equipment}` : ''}
        </div>
      </td>
      <td className="py-1 pr-2">
        <select
          aria-label={`Superset: ${ex?.name}`}
          className={`input h-9 w-20 py-0 px-2 text-xs ${ssStyle ? ssStyle.badge : ''}`}
          value={v.superset}
          onChange={(e) => {
            const next = { ...v, superset: e.target.value };
            setV(next);
            persist(next);
          }}
        >
          <option value="">—</option>
          {SUPERSET_IDS.map((id) => (
            <option key={id} value={id}>SS {id}</option>
          ))}
        </select>
      </td>
      {cell('sets', 'Séries', 'w-16', 'number')}
      {cell('reps', 'Repetições', 'w-20')}
      {cell('load_kg', 'Carga', 'w-20', 'number')}
      {cell('rest_s', 'Descanso', 'w-20', 'number')}
      {cell('notes', 'Observação', 'w-36')}
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
