import { useMemo, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { num } from '../../lib/format';
import {
  BookmarkPlus, ChevronLeft, ChevronRight, Download, Flame, Pin, Plus,
  Sparkles, Trophy, Upload, X,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { write } from '../../lib/useTable';
import { feedback } from '../../lib/feedback';
import { addDays, formatDay, monthName, toDay } from '../../lib/dates';
import { searchKey } from '../../lib/text';
import {
  CARDIO_MET, cardioKcal, DEFAULT_SETTINGS, formatPace, kcalPerMinute,
  MUSCLE_LABEL, paceMinPerKm, personalRecords, workoutSummary,
} from '../../lib/training';
import {
  buildTrainingCalendarMonth, computeWeeklyTrainingStreak, EQUIPMENT_OPTIONS,
  exportWorkoutsHevyCsv, formatSetNotes, hevy1RM, parseHevyOrStrongCsv,
  parseSetNotes, readPinnedExerciseNotes, SESSION_MODALITIES,
  weightedMuscleDistribution, workoutKcal,
} from '../../lib/hevy';
import { findMatchingTrainingHabits } from '../../lib/crossModuleIntelligence';
import { Empty, Field, Modal } from '../../components/ui';
import { openAssistantDrawer } from '../../components/AssistantDrawer';
import { notifyDataChanged } from '../../components/QuickCaptureModal';
import WorkoutEditor from './WorkoutEditor';
import PlanEditor, { type StartSession } from './PlanEditor';
import BodyHeatmap from './BodyHeatmap';
import ExerciseDetailModal from './ExerciseDetailModal';
import { DEFAULT_WEIGHT_KG, type Health } from './useHealth';

const VIEWS = ['Ficha', 'Treinos', 'Cardio', 'Anatomia', 'Recordes', 'Exercícios'] as const;
type View = (typeof VIEWS)[number];

export default function Training({ h }: { h: Health }) {
  const [view, setView] = useState<View>('Ficha');
  const [editing, setEditing] = useState<string | null | undefined>(undefined);
  const [start, setStart] = useState<StartSession | undefined>(undefined);
  const [detailExId, setDetailExId] = useState<string | null>(null);
  const close = () => { setEditing(undefined); setStart(undefined); setView('Treinos'); };

  if (start) return <WorkoutEditor h={h} workoutId={null} start={start} onClose={close} />;
  if (editing !== undefined) return <WorkoutEditor h={h} workoutId={editing} onClose={() => setEditing(undefined)} />;

  return (
    <>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-2">
        <div className="segmented overflow-x-auto">
          {VIEWS.map((v) => (
            <button key={v} className={v === view ? 'tab-active' : 'tab'} onClick={() => setView(v)}>
              {v}
            </button>
          ))}
        </div>
        <button
          type="button"
          className="btn-secondary h-9 text-xs"
          onClick={() =>
            openAssistantDrawer({
              prompt: 'Use analisar_evolucao_treino para avaliar meus treinos recentes, recordes pessoais, equilíbrio muscular, gasto calórico e sinergia com dieta/hábitos.',
              newThread: true,
            })
          }
        >
          <Sparkles size={15} strokeWidth={1.5} /> Treinador IA
        </button>
      </div>

      {view === 'Ficha' && <PlanEditor h={h} onStart={setStart} />}
      {view === 'Treinos' && <WorkoutList h={h} onOpen={setEditing} />}
      {view === 'Cardio' && <CardioList h={h} />}
      {view === 'Anatomia' && <AnatomyAndCalendar h={h} />}
      {view === 'Recordes' && <Records h={h} onInspect={setDetailExId} />}
      {view === 'Exercícios' && <Exercises h={h} onInspect={setDetailExId} />}

      {detailExId && (
        <ExerciseDetailModal h={h} exerciseId={detailExId} onClose={() => setDetailExId(null)} />
      )}
    </>
  );
}

function WorkoutList({ h, onOpen }: { h: Health; onOpen: (id: string | null) => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);
  const weightKg = h.latestWeight ?? DEFAULT_WEIGHT_KG;
  const today = toDay(new Date());

  function handleExportCsv() {
    if (!h.workouts.rows.length) {
      feedback({ kind: 'error', text: 'Nenhum treino registrado para exportar.' });
      return;
    }
    const csv = exportWorkoutsHevyCsv({
      workouts: h.workouts.rows,
      sets: h.sets.rows,
      exercises: h.exerciseById,
      types: h.typeById,
    });
    const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `painel-treinos-hevy-${today}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function handleImportCsv(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setImporting(true);
    try {
      const text = await file.text();
      const drafts = parseHevyOrStrongCsv(text);
      if (!drafts.length) {
        feedback({ kind: 'error', text: 'Formato CSV não reconhecido (use CSV do Hevy ou Strong).' });
        setImporting(false);
        return;
      }

      const workingType = h.setTypes.rows.find((t) => t.drives_progression && t.user_id === null) ?? h.setTypes.rows[0];
      const warmType = h.setTypes.rows.find((t) => searchKey(t.name).includes('aquecimento')) ?? workingType;
      const dropType = h.setTypes.rows.find((t) => searchKey(t.name).includes('drop')) ?? workingType;

      // Map existing exercises by normalized name and create missing ones on the fly
      const exMap = new Map<string, string>();
      for (const ex of h.exercises.rows) exMap.set(searchKey(ex.name), ex.id);

      let importedCount = 0;
      for (const d of drafts) {
        const { data: wRow, error: wErr } = await supabase
          .from('workouts')
          .insert({
            date: d.date,
            title: d.title,
            duration_min: d.duration_min,
            notes: d.description || null,
          })
          .select('id')
          .single();
        if (wErr || !wRow) continue;

        const setPayloads = [];
        for (let idx = 0; idx < d.sets.length; idx++) {
          const st = d.sets[idx];
          const normName = searchKey(st.exerciseName);
          let exId = exMap.get(normName);
          if (!exId) {
            const { data: createdEx } = await supabase
              .from('exercises')
              .insert({ name: st.exerciseName.trim(), muscle_group: 'corpo_inteiro' })
              .select('id')
              .single();
            if (createdEx) {
              exId = String(createdEx.id);
              exMap.set(normName, String(createdEx.id));
            }
          }
          if (!exId) continue;

          const typeId =
            st.indicator === 'warmup' ? warmType.id
              : st.indicator === 'dropset' ? dropType.id
                : workingType.id;

          setPayloads.push({
            workout_id: wRow.id,
            exercise_id: exId,
            set_type_id: typeId,
            position: idx,
            load_kg: st.load_kg,
            reps: st.reps,
            rest_s: 90,
            effort: st.rpe,
            notes: formatSetNotes({
              superset: st.superset,
              indicator: st.indicator === 'failure' ? 'failure' : null,
              cleanNotes: st.notes,
            }),
          });
        }
        if (setPayloads.length) {
          await supabase.from('workout_sets').insert(setPayloads);
        }
        importedCount += 1;
      }

      await Promise.all([h.exercises.reload(), h.workouts.reload(), h.sets.reload()]);
      notifyDataChanged();
      feedback({ kind: 'ok', text: `${importedCount} ${importedCount === 1 ? 'treino importado' : 'treinos importados'} com sucesso!` });
    } catch (err) {
      feedback({ kind: 'error', text: `Falha ao importar CSV: ${(err as Error).message}` });
    }
    setImporting(false);
  }

  async function saveWorkoutAsRoutine(workoutId: string) {
    const w = h.workouts.rows.find((x) => x.id === workoutId);
    if (!w) return;
    let planId = h.workoutPlan?.id;
    if (!planId) {
      const { data, error } = await supabase.from('workout_plans').insert({ name: 'Minha ficha', is_active: true }).select('id').single();
      if (error || !data) return feedback({ kind: 'error', text: `Erro ao criar ficha: ${error?.message}` });
      planId = data.id;
    }

    const existingCount = h.planSessions.rows.filter((s) => s.plan_id === planId).length;
    const { data: sess, error: sErr } = await supabase
      .from('workout_plan_sessions')
      .insert({
        plan_id: planId,
        label: w.title || `Rotina ${formatDay(w.date)}`,
        order_index: existingCount,
      })
      .select('id')
      .single();
    if (sErr || !sess) return feedback({ kind: 'error', text: `Erro ao criar rotina: ${sErr?.message}` });

    const wSets = h.sets.rows.filter((s) => s.workout_id === workoutId).sort((a, b) => a.position - b.position);
    const exOrder = [...new Set(wSets.map((s) => s.exercise_id))];

    const rows = exOrder.map((exId, idx) => {
      const mine = wSets.filter((s) => s.exercise_id === exId && (h.typeById.get(s.set_type_id)?.counts_for_volume ?? true));
      const base = mine.length ? mine : wSets.filter((s) => s.exercise_id === exId);
      const topLoad = Math.max(0, ...base.map((s) => s.load_kg));
      const avgReps = base.length ? Math.round(base.reduce((a, b) => a + b.reps, 0) / base.length) : 10;
      const ss = parseSetNotes(base[0]?.notes).superset;
      return {
        session_id: sess.id,
        exercise_id: exId,
        sets: Math.max(1, base.length),
        reps: String(avgReps),
        load_kg: topLoad > 0 ? topLoad : null,
        rest_s: base[0]?.rest_s ?? 90,
        notes: formatSetNotes({ superset: ss, cleanNotes: '' }),
        order_index: idx,
      };
    });

    if (rows.length) await supabase.from('workout_plan_exercises').insert(rows);
    await Promise.all([h.workoutPlans.reload(), h.planSessions.reload(), h.planExercises.reload()]);
    feedback({ kind: 'ok', text: `"${w.title || 'Treino'}" salvo na sua Ficha de Rotinas!` });
  }

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden" onChange={handleImportCsv} />
        <button
          type="button"
          className="btn-secondary h-9 text-xs"
          disabled={importing}
          onClick={() => fileRef.current?.click()}
          title="Importar histórico de treinos em CSV do Hevy ou Strong"
        >
          <Upload size={14} strokeWidth={1.5} /> {importing ? 'Importando…' : 'Importar CSV Hevy'}
        </button>
        <button
          type="button"
          className="btn-secondary h-9 text-xs"
          onClick={handleExportCsv}
          title="Exportar todos os treinos em CSV padrão Hevy (14 colunas)"
        >
          <Download size={14} strokeWidth={1.5} /> Exportar CSV
        </button>
        <button className="btn-primary ml-auto" onClick={() => onOpen(null)}>
          <Plus size={16} strokeWidth={1.5} />Registrar treino
        </button>
      </div>

      {h.workouts.rows.length === 0 && <div className="card"><Empty>Nenhum treino registrado ainda. Comece pela Ficha, registre ao vivo ou importe seu CSV do Hevy.</Empty></div>}

      <ul className="grid gap-2.5">
        {h.workouts.rows.map((w) => {
          const wSets = h.sets.rows.filter((x) => x.workout_id === w.id);
          const s = workoutSummary(w, h.sets.rows, h.workouts.rows, h.typeById);
          const burn = workoutKcal(w, wSets, h.typeById, weightKg);
          const modLabel = SESSION_MODALITIES.find((m) => m.id === burn.modality)?.label;
          const names = [...new Set(wSets.map((x) => h.exerciseById.get(x.exercise_id)?.name))].filter(Boolean);

          return (
            <li key={w.id} className="card">
              <div className="flex flex-wrap items-baseline gap-2">
                <button className="text-left font-medium text-fg hover:text-brand hover:underline" onClick={() => onOpen(w.id)}>
                  {w.title || 'Treino'}
                </button>
                {burn.modality !== 'musculacao' && modLabel && (
                  <span className="rounded border border-line bg-raised px-1.5 py-0.5 text-[11px] text-fg2">
                    {modLabel}
                  </span>
                )}
                <span className="text-sm text-fg3">
                  {formatDay(w.date)}
                  {burn.durationMin > 0 ? ` · ${w.duration_min ? `${w.duration_min} min` : `~${burn.durationMin} min`}` : ''}
                </span>
                <span className="ml-auto flex flex-wrap items-center gap-2 text-sm">
                  <span>{s.sets} séries · {s.reps} reps · <span className="figure">{num(s.tonnage)}</span> kg</span>
                  <span className="inline-flex items-center gap-1 rounded-md border border-line bg-raised/60 px-2 py-0.5 text-xs text-fg2">
                    <Flame size={12} strokeWidth={1.5} className="text-brand" />
                    <span className="figure">{burn.estimated ? '~' : ''}{num(burn.kcal)} kcal</span>
                  </span>
                </span>
              </div>

              <div className="mt-1.5 flex items-center gap-2">
                <div className="mr-auto truncate text-xs text-fg3">{names.join(', ') || 'Sessão sem exercícios detalhados'}</div>
                <button
                  type="button"
                  className="inline-flex shrink-0 items-center gap-1 text-xs text-fg3 hover:text-fg"
                  onClick={() => void saveWorkoutAsRoutine(w.id)}
                  title="Transformar este treino em uma rotina reutilizável na sua Ficha"
                >
                  <BookmarkPlus size={13} strokeWidth={1.5} /> Salvar como rotina
                </button>
              </div>

              {s.records.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {s.records.map((r) => (
                    <span key={r.exercise_id + r.kind} className="inline-flex items-center gap-1 rounded-md border border-line bg-raised px-2 py-0.5 text-xs text-fg2">
                      <Trophy size={13} strokeWidth={1.5} className="text-brand" />
                      {h.exerciseById.get(r.exercise_id)?.name}:{' '}
                      {r.kind === 'volume' ? `volume ${num(r.value)} kg` : r.kind === '1RM' ? `1RM est. ${num(r.value)} kg` : `carga ${num(r.value)} kg`}
                    </span>
                  ))}
                </div>
              )}
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
      <div className="mb-4 flex"><button className="btn-primary ml-auto" onClick={() => setForm(true)}><Plus size={16} strokeWidth={1.5} />Registrar cardio</button></div>
      {h.cardio.rows.length === 0 && <div className="card"><Empty>Nenhum cardio registrado ainda.</Empty></div>}
      <ul className="grid gap-2">
        {h.cardio.rows.map((c) => {
          const k = cardioKcal(c, weight);
          return (
            <li key={c.id} className="card flex flex-wrap items-baseline gap-3">
              <span className="font-medium capitalize">{c.cardio_type}</span>
              <span className="text-sm text-fg3">{formatDay(c.date)}</span>
              <span className="ml-auto flex items-center gap-2 text-sm">
                <span>
                  {c.distance_km ? `${num(c.distance_km)} km · ` : ''}{Math.round(c.duration_s / 60)} min · {formatPace(paceMinPerKm(c))} · {kcalPerMinute(k.kcal, c.duration_s)} kcal/min
                </span>
                <span className="inline-flex items-center gap-1 rounded-md border border-line bg-raised/60 px-2 py-0.5 text-xs text-fg2">
                  <Flame size={12} strokeWidth={1.5} className="text-brand" />
                  <span className="figure">{k.estimated ? '~' : ''}{num(k.kcal)} kcal</span>
                </span>
              </span>
              <button className="text-xs text-negative" onClick={async () => {
                if (confirm('Excluir este cardio?') && await write(supabase.from('cardio_sessions').delete().eq('id', c.id))) {
                  void h.cardio.reload();
                  notifyDataChanged();
                }
              }}>excluir</button>
            </li>
          );
        })}
      </ul>
      {form && (
        <CardioForm
          h={h}
          onClose={() => setForm(false)}
          onSaved={() => {
            setForm(false);
            void h.cardio.reload();
            void h.habitCompletions.reload();
            notifyDataChanged();
          }}
        />
      )}
    </>
  );
}

function CardioForm({ h, onClose, onSaved }: { h: Health; onClose: () => void; onSaved: () => void }) {
  const [type, setType] = useState('corrida');
  const [date, setDate] = useState(toDay(new Date()));
  const [km, setKm] = useState('');
  const [min, setMin] = useState('');
  const [sec, setSec] = useState('');
  const [kcal, setKcal] = useState('');

  const weight = h.latestWeight ?? DEFAULT_WEIGHT_KG;
  const durPreviewSec = Number(min || 0) * 60 + Number(sec || 0);
  const previewBurn = durPreviewSec > 0
    ? cardioKcal({ cardio_type: type, duration_s: durPreviewSec, kcal: kcal ? Number(kcal) : null }, weight)
    : null;

  async function save(e: FormEvent) {
    e.preventDefault();
    const duration_s = Number(min || 0) * 60 + Number(sec || 0);
    if (duration_s <= 0) return alert('Informe o tempo.');
    if (await write(supabase.from('cardio_sessions').insert({
      cardio_type: type, date, duration_s, distance_km: km ? Number(km) : null, kcal: kcal ? Number(kcal) : null,
    }))) {
      // Auto-sync matching cardio/exercise habit
      const matching = findMatchingTrainingHabits(h.habits?.rows ?? [], 'cardio', h.workoutPlan?.habit_id);
      for (const hb of matching) {
        const exists = h.habitCompletions?.rows.find((c) => c.habit_id === hb.id && c.completed_date === date);
        if (!exists) {
          const val = hb.target_value && hb.target_value > 0 ? hb.target_value : 1;
          await supabase.from('habit_completions').upsert({ habit_id: hb.id, completed_date: date, value: val }, { onConflict: 'habit_id,completed_date' });
        }
      }
      onSaved();
    }
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
          <Field label="Calorias (opcional)"><input className="input" type="number" min={0} value={kcal} onChange={(e) => setKcal(e.target.value)} placeholder={previewBurn ? `~${previewBurn.kcal} kcal est.` : 'estimadas se vazio'} /></Field>
          <Field label="Tempo: minutos"><input className="input" type="number" min={0} value={min} onChange={(e) => setMin(e.target.value)} required /></Field>
          <Field label="Tempo: segundos"><input className="input" type="number" min={0} max={59} value={sec} onChange={(e) => setSec(e.target.value)} /></Field>
        </div>
        {previewBurn && (
          <p className="mt-2 text-xs text-fg2">
            Gasto energético calculado: <strong className="figure">{previewBurn.estimated ? '~' : ''}{num(previewBurn.kcal)} kcal</strong>
          </p>
        )}
        <button className="btn-primary mt-3 w-full justify-center">Salvar</button>
      </form>
    </Modal>
  );
}

function AnatomyAndCalendar({ h }: { h: Health }) {
  const now = new Date();
  const today = toDay(now);
  const [calYear, setCalYear] = useState(now.getFullYear());
  const [calMonth, setCalMonth] = useState(now.getMonth() + 1);
  const [rangeDays, setRangeDays] = useState<number>(30);
  const weightKg = h.latestWeight ?? DEFAULT_WEIGHT_KG;

  const streakWeeks = useMemo(
    () => computeWeeklyTrainingStreak(today, h.trainedDays),
    [today, h.trainedDays],
  );

  const cells = useMemo(
    () =>
      buildTrainingCalendarMonth({
        year: calYear,
        month: calMonth,
        workouts: h.workouts.rows,
        sets: h.sets.rows,
        cardio: h.cardio.rows,
        types: h.typeById,
        weightKg,
      }),
    [calYear, calMonth, h.workouts.rows, h.sets.rows, h.cardio.rows, h.typeById, weightKg],
  );

  const monthActiveCells = cells.filter((c) => c.inMonth && (c.workoutsCount > 0 || c.cardioCount > 0));
  const monthTotalBurn = monthActiveCells.reduce((acc, c) => acc + c.kcalBurned, 0);

  const filteredSets = useMemo(() => {
    if (rangeDays === 0) return h.sets.rows;
    const minDay = addDays(today, -(rangeDays - 1));
    const validIds = new Set(h.workouts.rows.filter((w) => w.date >= minDay && w.date <= today).map((w) => w.id));
    return h.sets.rows.filter((s) => validIds.has(s.workout_id));
  }, [rangeDays, today, h.workouts.rows, h.sets.rows]);

  const muscleRows = useMemo(
    () => weightedMuscleDistribution(filteredSets, h.exerciseById, h.typeById),
    [filteredSets, h.exerciseById, h.typeById],
  );

  function shiftMonth(delta: -1 | 1) {
    let m = calMonth + delta;
    let y = calYear;
    if (m < 1) { m = 12; y -= 1; }
    if (m > 12) { m = 1; y += 1; }
    setCalYear(y);
    setCalMonth(m);
  }

  return (
    <div className="space-y-6">
      {/* Body Heatmap Section */}
      <section className="card">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-base font-medium text-fg">Mapa Muscular & Simetria Corporal</h2>
            <p className="text-xs text-fg3">Cálculo ponderado estilo Hevy: 100% no músculo principal e 50% nos sinergistas secundários</p>
          </div>
          <div className="segmented">
            {([
              [7, '7d'],
              [30, '30d'],
              [90, '90d'],
              [0, 'Tudo'],
            ] as const).map(([d, label]) => (
              <button key={d} type="button" className={rangeDays === d ? 'tab-active' : 'tab'} onClick={() => setRangeDays(d)}>
                {label}
              </button>
            ))}
          </div>
        </div>

        <BodyHeatmap rows={muscleRows} periodLabel={rangeDays === 0 ? 'todo o histórico' : `últimos ${rangeDays} dias`} />
      </section>

      {/* Monthly Consistency Calendar & Streak */}
      <section className="card">
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <div className="mr-auto">
            <h2 className="text-base font-medium capitalize text-fg">{monthName(calMonth)} de {calYear}</h2>
            <p className="text-xs text-fg3">
              <strong>{monthActiveCells.length}</strong> dias ativos no mês ·{' '}
              <strong className="figure">{num(monthTotalBurn)} kcal</strong> gastas ·{' '}
              Sequência atual: <strong className="figure">{streakWeeks} {streakWeeks === 1 ? 'semana' : 'semanas'}</strong>
            </p>
          </div>
          <div className="flex items-center gap-1">
            <button type="button" className="icon-btn" onClick={() => shiftMonth(-1)} aria-label="Mês anterior">
              <ChevronLeft size={16} strokeWidth={1.5} />
            </button>
            <button type="button" className="icon-btn" onClick={() => shiftMonth(1)} aria-label="Próximo mês">
              <ChevronRight size={16} strokeWidth={1.5} />
            </button>
          </div>
        </div>

        <div className="grid grid-cols-7 gap-1.5 text-center text-[11px] text-fg3">
          {['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'].map((w) => (
            <div key={w} className="pb-1 font-medium">{w}</div>
          ))}
          {cells.map((c) => {
            const active = c.workoutsCount + c.cardioCount > 0;
            const isToday = c.date === today;
            return (
              <div
                key={c.date}
                title={active ? `${formatDay(c.date)}: ${c.workoutsCount} treino(s), ${c.cardioCount} cardio(s) · ~${num(c.kcalBurned)} kcal` : formatDay(c.date)}
                className={`flex min-h-[52px] flex-col items-center justify-between rounded-lg border p-1.5 transition-colors ${
                  !c.inMonth
                    ? 'border-transparent opacity-30'
                    : active
                      ? 'border-brand/40 bg-brand/10 text-fg'
                      : isToday
                        ? 'border-line-strong bg-raised/60 text-fg'
                        : 'border-line bg-surface text-fg3'
                }`}
              >
                <span className="figure text-xs font-medium">{c.dayOfMonth}</span>
                {active && (
                  <span className="figure text-[10px] text-brand-ink">
                    {num(c.kcalBurned)} kcal
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}

function Records({ h, onInspect }: { h: Health; onInspect: (id: string) => void }) {
  const records = [...personalRecords(h.sets.rows, h.workouts.rows, h.typeById).values()]
    .sort((a, b) => (h.exerciseById.get(a.exercise_id)?.name ?? '').localeCompare(h.exerciseById.get(b.exercise_id)?.name ?? '', 'pt'));

  // Also compute Hevy 1..30 1RM per exercise so high-rep sets show 1RM too
  const hevyBestByEx = useMemo(() => {
    const map = new Map<string, { val: number; load: number; reps: number }>();
    for (const s of h.sets.rows) {
      if (!(h.typeById.get(s.set_type_id)?.counts_for_volume ?? true) || s.reps <= 0) continue;
      const e1 = hevy1RM(s.load_kg, s.reps);
      if (e1 != null) {
        const cur = map.get(s.exercise_id);
        if (!cur || e1 > cur.val) map.set(s.exercise_id, { val: e1, load: s.load_kg, reps: s.reps });
      }
    }
    return map;
  }, [h.sets.rows, h.typeById]);

  if (!records.length) return <div className="card"><Empty>Os recordes aparecem depois do primeiro treino registrado.</Empty></div>;
  return (
    <div className="card overflow-x-auto p-0">
      <table className="w-full min-w-[600px] text-sm">
        <thead>
          <tr className="text-left text-xs text-fg3">
            <th className="p-3 font-normal">Exercício</th>
            <th className="p-3 font-normal">Carga máxima</th>
            <th className="p-3 font-normal">1RM Estimado</th>
            <th className="p-3 font-normal">Maior volume num treino</th>
          </tr>
        </thead>
        <tbody>
          {records.map((r) => {
            const hv = hevyBestByEx.get(r.exercise_id);
            const best1 = r.best1RM?.value ?? hv?.val ?? null;
            return (
              <tr key={r.exercise_id} className="border-t border-line hover:bg-raised/30">
                <td className="p-3">
                  <button type="button" className="text-left font-medium text-fg hover:text-brand hover:underline" onClick={() => onInspect(r.exercise_id)}>
                    {h.exerciseById.get(r.exercise_id)?.name}
                  </button>
                </td>
                <td className="p-3 figure">
                  {r.maxLoad ? `${num(r.maxLoad.load_kg)} kg × ${r.maxLoad.reps}` : '—'}
                  <div className="text-xs text-fg3">{r.maxLoad && formatDay(r.maxLoad.date)}</div>
                </td>
                <td className="p-3 figure">
                  {best1 ? `${num(best1)} kg` : '—'}
                  <div className="text-xs text-fg3">
                    {r.best1RM
                      ? `${num(r.best1RM.load_kg)} kg × ${r.best1RM.reps}`
                      : hv
                        ? `${num(hv.load)} kg × ${hv.reps}`
                        : ''}
                  </div>
                </td>
                <td className="p-3 figure">
                  {r.bestSessionVolume ? `${num(r.bestSessionVolume.tonnage)} kg` : '—'}
                  <div className="text-xs text-fg3">{r.bestSessionVolume && formatDay(r.bestSessionVolume.date)}</div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function Exercises({ h, onInspect }: { h: Health; onInspect: (id: string) => void }) {
  const [newExercise, setNewExercise] = useState(false);
  const [newType, setNewType] = useState(false);
  const [q, setQ] = useState('');
  const [equipFilter, setEquipFilter] = useState('');
  const pinnedNotes = readPinnedExerciseNotes();
  const used = new Set(h.sets.rows.map((s) => s.exercise_id));
  const groups = Object.keys(MUSCLE_LABEL);

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
      <div>
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <input
            className="input h-9 min-w-[200px] flex-1"
            placeholder="Buscar exercício…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <select
            aria-label="Filtrar equipamento"
            className="input h-9 w-auto py-0 text-xs"
            value={equipFilter}
            onChange={(e) => setEquipFilter(e.target.value)}
          >
            <option value="">Todos os equipamentos</option>
            {EQUIPMENT_OPTIONS.map((eq) => (
              <option key={eq.id} value={eq.id}>{eq.label}</option>
            ))}
          </select>
          <button className="btn-primary h-9" onClick={() => setNewExercise(true)}>
            <Plus size={16} strokeWidth={1.5} />Exercício próprio
          </button>
        </div>

        {groups.map((g) => {
          const list = h.exercises.rows.filter((e) => {
            if (e.muscle_group !== g) return false;
            if (equipFilter && searchKey(e.equipment ?? '') !== searchKey(equipFilter)) return false;
            if (q.trim() && !searchKey(e.name).includes(searchKey(q))) return false;
            return true;
          });
          if (!list.length) return null;
          return (
            <section key={g} className="mb-4">
              <div className="label mb-2">{MUSCLE_LABEL[g]}</div>
              <ul className="card divide-y divide-line p-0">
                {list.map((e) => {
                  const s = h.settingsById.get(e.id) ?? DEFAULT_SETTINGS;
                  const hasPin = Boolean(pinnedNotes[e.id]);
                  return (
                    <li key={e.id} className="flex items-center gap-2 px-4 py-2.5 text-sm">
                      <button
                        type="button"
                        className="mr-auto flex items-center gap-1.5 text-left text-fg hover:text-brand hover:underline"
                        onClick={() => onInspect(e.id)}
                      >
                        <span>{e.name}</span>
                        {e.equipment && <span className="text-xs text-fg3">· {e.equipment}</span>}
                        {e.user_id && <span className="text-xs text-brand">· seu</span>}
                        {hasPin && <Pin size={12} strokeWidth={1.5} className="text-brand" />}
                      </button>
                      {used.has(e.id) && (
                        <span className="figure text-xs text-fg3">
                          {s.rep_min}-{s.rep_max} reps · +{s.load_increment_kg} kg
                        </span>
                      )}
                      <button className="text-xs text-fg underline" onClick={() => onInspect(e.id)}>
                        raio-x
                      </button>
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
              <span className="text-xs text-fg3">{t.drives_progression ? 'progressão' : t.counts_for_volume ? 'conta volume' : 'não conta'}</span>
              {t.user_id && <button className="text-xs text-negative" onClick={async () => {
                if (confirm(`Excluir o tipo "${t.name}"?`) && await write(supabase.from('set_types').delete().eq('id', t.id))) void h.setTypes.reload();
              }}><X size={16} strokeWidth={1.5} /></button>}
            </li>
          ))}
        </ul>
        <button className="btn-ghost" onClick={() => setNewType(true)}><Plus size={16} strokeWidth={1.5} />Tipo de série</button>
        <p className="mt-3 text-xs text-fg3">
          No logger ao vivo, clique no número da série para alternar rapidamente entre Normal (1..N), Aquecimento (W), Drop-set (D) e Falha (F).
        </p>
      </div>

      {newExercise && <ExerciseForm onClose={() => setNewExercise(false)} onSaved={() => { setNewExercise(false); void h.exercises.reload(); }} />}
      {newType && <SetTypeForm onClose={() => setNewType(false)} onSaved={() => { setNewType(false); void h.setTypes.reload(); }} />}
    </div>
  );
}

function ExerciseForm({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState('');
  const [group, setGroup] = useState('peito');
  const [secondary, setSecondary] = useState<string[]>([]);
  const [equipment, setEquipment] = useState('halteres');

  function toggleSec(m: string) {
    setSecondary((prev) => (prev.includes(m) ? prev.filter((x) => x !== m) : [...prev, m]));
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    if (await write(supabase.from('exercises').insert({
      name,
      muscle_group: group,
      secondary_muscles: secondary.filter((s) => s !== group),
      equipment: equipment || null,
    }))) onSaved();
  }
  return (
    <Modal title="Novo exercício próprio" onClose={onClose}>
      <form onSubmit={save} className="space-y-3">
        <Field label="Nome"><input className="input" value={name} onChange={(e) => setName(e.target.value)} required autoFocus /></Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Músculo principal (100%)">
            <select className="input" value={group} onChange={(e) => setGroup(e.target.value)}>
              {Object.entries(MUSCLE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </Field>
          <Field label="Equipamento">
            <select className="input" value={equipment} onChange={(e) => setEquipment(e.target.value)}>
              <option value="">Sem equipamento</option>
              {EQUIPMENT_OPTIONS.map((eq) => <option key={eq.id} value={eq.id}>{eq.label}</option>)}
            </select>
          </Field>
        </div>
        <div>
          <div className="mb-1.5 text-xs text-fg3">Músculos secundários (50% no mapa corporal)</div>
          <div className="flex flex-wrap gap-1.5">
            {Object.entries(MUSCLE_LABEL)
              .filter(([k]) => k !== group)
              .map(([k, label]) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => toggleSec(k)}
                  className={`rounded-md border px-2 py-0.5 text-xs ${
                    secondary.includes(k) ? 'border-brand bg-brand/10 text-fg' : 'border-line text-fg3'
                  }`}
                >
                  {label}
                </button>
              ))}
          </div>
        </div>
        <button className="btn-primary w-full justify-center">Salvar exercício</button>
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
