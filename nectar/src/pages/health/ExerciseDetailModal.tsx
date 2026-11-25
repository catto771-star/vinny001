import { useMemo, useState, type FormEvent } from 'react';
import { Pin, Sparkles, Trophy } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { write } from '../../lib/useTable';
import { feedback } from '../../lib/feedback';
import { formatDay } from '../../lib/dates';
import { num } from '../../lib/format';
import { DEFAULT_SETTINGS, MAX_REPS, MUSCLE_LABEL } from '../../lib/training';
import {
  classifySetIndicator,
  hevy1RM,
  numberSetsLikeHevy,
  parseSetNotes,
  readPinnedExerciseNotes,
  SUPERSET_STYLE,
  writePinnedExerciseNote,
} from '../../lib/hevy';
import { AreaChart } from '../../components/Charts';
import { Empty, Field, Modal } from '../../components/ui';
import { openAssistantDrawer } from '../../components/AssistantDrawer';
import type { Health } from './useHealth';

type Tab = 'Estatísticas' | 'Histórico' | 'Configuração';
type ChartMode = 'hevy1RM' | 'maxLoad' | 'bestSetVol' | 'tonnage';

const short = (day: string) => `${day.slice(8)}/${day.slice(5, 7)}`;

export default function ExerciseDetailModal({
  h,
  exerciseId,
  onClose,
  onPinnedChange,
}: {
  h: Health;
  exerciseId: string;
  onClose: () => void;
  onPinnedChange?: (notes: Record<string, string>) => void;
}) {
  const ex = h.exerciseById.get(exerciseId);
  const [tab, setTab] = useState<Tab>('Estatísticas');
  const [chartMode, setChartMode] = useState<ChartMode>('hevy1RM');

  // Pinned note + progression settings
  const [pinned, setPinned] = useState(() => readPinnedExerciseNotes()[exerciseId] ?? '');
  const currentSettings = h.settingsById.get(exerciseId) ?? DEFAULT_SETTINGS;
  const [repMin, setRepMin] = useState(currentSettings.rep_min);
  const [repMax, setRepMax] = useState(currentSettings.rep_max);
  const [incKg, setIncKg] = useState(currentSettings.load_increment_kg);

  const history = useMemo(() => {
    const workoutById = new Map(h.workouts.rows.map((w) => [w.id, w]));
    const byWorkout = new Map<string, typeof h.sets.rows>();
    for (const s of h.sets.rows) {
      if (s.exercise_id !== exerciseId || !workoutById.has(s.workout_id)) continue;
      const list = byWorkout.get(s.workout_id) ?? [];
      list.push(s);
      byWorkout.set(s.workout_id, list);
    }

    const sessions = [...byWorkout.entries()].map(([workoutId, rawSets]) => {
      const w = workoutById.get(workoutId)!;
      const ordered = [...rawSets].sort((a, b) => a.position - b.position);
      const indicators = ordered.map((s) => {
        const sn = parseSetNotes(s.notes);
        return classifySetIndicator(h.typeById.get(s.set_type_id)?.name, sn.indicator);
      });
      const numbered = numberSetsLikeHevy(indicators);

      let maxLoad = 0;
      let topReps = 0;
      let best1RM = 0;
      let bestSetVol = 0;
      let tonnage = 0;
      let maxReps = 0;
      let workingSetsCount = 0;

      ordered.forEach((s, idx) => {
        const counts = h.typeById.get(s.set_type_id)?.counts_for_volume ?? true;
        if (!counts || s.reps <= 0) return;
        workingSetsCount += 1;
        const setVol = s.load_kg * s.reps;
        tonnage += setVol;
        if (setVol > bestSetVol) bestSetVol = setVol;
        if (s.reps > maxReps) maxReps = s.reps;
        if (s.load_kg > maxLoad || (s.load_kg === maxLoad && s.reps > topReps)) {
          maxLoad = s.load_kg;
          topReps = s.reps;
        }
        const e1 = hevy1RM(s.load_kg, s.reps);
        if (e1 != null && e1 > best1RM) best1RM = e1;
        void numbered[idx];
      });

      return {
        workoutId,
        date: w.date,
        title: w.title || 'Treino',
        sets: ordered,
        numbered,
        maxLoad,
        topReps,
        best1RM: best1RM > 0 ? best1RM : null,
        bestSetVol: Math.round(bestSetVol * 10) / 10,
        tonnage: Math.round(tonnage * 10) / 10,
        maxReps,
        workingSetsCount,
      };
    });

    return sessions.sort((a, b) => a.date.localeCompare(b.date) || a.workoutId.localeCompare(b.workoutId));
  }, [exerciseId, h.sets.rows, h.workouts.rows, h.typeById]);

  const prs = useMemo(() => {
    let best1RM: { val: number; date: string; detail: string } | null = null;
    let bestWeight: { val: number; date: string; detail: string } | null = null;
    let bestSetVol: { val: number; date: string } | null = null;
    let bestSessionVol: { val: number; date: string } | null = null;
    let mostReps: { val: number; date: string } | null = null;

    for (const s of history) {
      if (s.best1RM && (!best1RM || s.best1RM > best1RM.val)) {
        best1RM = { val: s.best1RM, date: s.date, detail: `${num(s.maxLoad)} kg × ${s.topReps}` };
      }
      if (s.maxLoad > 0 && (!bestWeight || s.maxLoad > bestWeight.val)) {
        bestWeight = { val: s.maxLoad, date: s.date, detail: `${s.topReps} reps` };
      }
      if (s.bestSetVol > 0 && (!bestSetVol || s.bestSetVol > bestSetVol.val)) {
        bestSetVol = { val: s.bestSetVol, date: s.date };
      }
      if (s.tonnage > 0 && (!bestSessionVol || s.tonnage > bestSessionVol.val)) {
        bestSessionVol = { val: s.tonnage, date: s.date };
      }
      if (s.maxReps > 0 && (!mostReps || s.maxReps > mostReps.val)) {
        mostReps = { val: s.maxReps, date: s.date };
      }
    }
    return { best1RM, bestWeight, bestSetVol, bestSessionVol, mostReps };
  }, [history]);

  if (!ex) return null;

  async function saveConfig(e: FormEvent) {
    e.preventDefault();
    if (repMin > repMax) return alert('O mínimo de repetições não pode passar do máximo.');
    const safeMin = Math.max(1, Math.min(MAX_REPS, repMin));
    const safeMax = Math.max(safeMin, Math.min(MAX_REPS, repMax));

    // Persist pinned note locally + sync to Assistant Memories so the AI Coach remembers setup cues
    const updatedNotes = writePinnedExerciseNote(exerciseId, pinned);
    onPinnedChange?.(updatedNotes);
    if (pinned.trim()) {
      const prefix = `Nota técnica (${ex!.name}):`;
      const { data: existingMem } = await supabase
        .from('assistant_memories')
        .select('id,content')
        .eq('category', 'saude')
        .ilike('content', `${prefix}%`)
        .limit(1);
      if (existingMem?.length) {
        await supabase.from('assistant_memories').update({ content: `${prefix} ${pinned.trim()}` }).eq('id', existingMem[0].id);
      } else {
        await supabase.from('assistant_memories').insert({ category: 'saude', source: 'user', content: `${prefix} ${pinned.trim()}` });
      }
    }

    const ok = await write(
      supabase.from('exercise_settings').upsert(
        { exercise_id: exerciseId, rep_min: safeMin, rep_max: safeMax, load_increment_kg: incKg },
        { onConflict: 'user_id,exercise_id' },
      ),
    );
    if (ok) {
      await h.settings.reload();
      feedback({ kind: 'ok', text: 'Configuração e nota fixada salvas' });
    }
  }

  const chartPoints = history
    .filter((s) => s.workingSetsCount > 0)
    .map((s) => ({
      label: short(s.date),
      value:
        chartMode === 'hevy1RM' ? s.best1RM
          : chartMode === 'maxLoad' ? s.maxLoad
            : chartMode === 'bestSetVol' ? s.bestSetVol
              : s.tonnage,
      detail: `${num(s.maxLoad)} kg × ${s.topReps} · ${s.workingSetsCount} séries`,
    }));

  return (
    <Modal title={ex.name} onClose={onClose}>
      <div className="space-y-4">
        {/* Metadata chips */}
        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          <span className="rounded-md border border-line bg-raised px-2 py-0.5 text-fg2">
            Primário: <strong>{MUSCLE_LABEL[ex.muscle_group] ?? ex.muscle_group}</strong> (100%)
          </span>
          {ex.secondary_muscles?.map((sm) => (
            <span key={sm} className="rounded-md border border-line px-2 py-0.5 text-fg3">
              Sec.: {MUSCLE_LABEL[sm] ?? sm} (50%)
            </span>
          ))}
          {ex.equipment && (
            <span className="rounded-md border border-line px-2 py-0.5 capitalize text-fg3">
              {ex.equipment}
            </span>
          )}
          <button
            type="button"
            className="btn-ghost ml-auto h-7 px-2 text-xs"
            onClick={() => {
              onClose();
              openAssistantDrawer({
                prompt: `Analise minha progressão no exercício "${ex.name}" (${history.length} sessões registradas, melhor 1RM ${prs.best1RM ? `${num(prs.best1RM.val)} kg` : 'sem histórico'}) e sugira como destravar carga/execução nas próximas semanas.`,
                newThread: true,
              });
            }}
          >
            <Sparkles size={13} strokeWidth={1.5} /> Analisar com IA
          </button>
        </div>

        {pinned.trim() && tab !== 'Configuração' && (
          <div className="flex items-start gap-2 rounded-lg border border-brand/30 bg-brand/5 px-3 py-2 text-xs text-fg2">
            <Pin size={13} strokeWidth={1.5} className="mt-0.5 shrink-0 text-brand" />
            <span>{pinned}</span>
          </div>
        )}

        <div className="segmented">
          {(['Estatísticas', 'Histórico', 'Configuração'] as const).map((t) => (
            <button key={t} type="button" className={tab === t ? 'tab-active' : 'tab'} onClick={() => setTab(t)}>
              {t}
            </button>
          ))}
        </div>

        {tab === 'Estatísticas' && (
          <div className="space-y-4">
            {/* PR Medals */}
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
              <div className="rounded-lg border border-line bg-raised/40 p-2.5">
                <div className="flex items-center gap-1 text-[11px] text-fg3">
                  <Trophy size={12} strokeWidth={1.5} className="text-brand" /> Melhor 1RM
                </div>
                <div className="figure mt-1 text-base font-medium text-fg">
                  {prs.best1RM ? `${num(prs.best1RM.val)} kg` : '—'}
                </div>
                {prs.best1RM && <div className="text-[11px] text-fg3">{prs.best1RM.detail}</div>}
              </div>

              <div className="rounded-lg border border-line bg-raised/40 p-2.5">
                <div className="text-[11px] text-fg3">Maior Carga</div>
                <div className="figure mt-1 text-base font-medium text-fg">
                  {prs.bestWeight ? `${num(prs.bestWeight.val)} kg` : '—'}
                </div>
                {prs.bestWeight && <div className="text-[11px] text-fg3">{prs.bestWeight.detail}</div>}
              </div>

              <div className="rounded-lg border border-line bg-raised/40 p-2.5">
                <div className="text-[11px] text-fg3">Melhor Série</div>
                <div className="figure mt-1 text-base font-medium text-fg">
                  {prs.bestSetVol ? `${num(prs.bestSetVol.val)} kg` : '—'}
                </div>
                {prs.bestSetVol && <div className="text-[11px] text-fg3">{formatDay(prs.bestSetVol.date)}</div>}
              </div>

              <div className="rounded-lg border border-line bg-raised/40 p-2.5">
                <div className="text-[11px] text-fg3">Maior Volume</div>
                <div className="figure mt-1 text-base font-medium text-fg">
                  {prs.bestSessionVol ? `${num(prs.bestSessionVol.val)} kg` : '—'}
                </div>
                {prs.bestSessionVol && <div className="text-[11px] text-fg3">{prs.mostReps ? `máx ${prs.mostReps.val} reps` : ''}</div>}
              </div>
            </div>

            {/* Chart selector */}
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs text-fg3">{history.length} sessões registradas</span>
              <div className="segmented">
                {([
                  ['hevy1RM', '1RM'],
                  ['maxLoad', 'Carga'],
                  ['bestSetVol', 'Série'],
                  ['tonnage', 'Volume'],
                ] as const).map(([id, label]) => (
                  <button
                    key={id}
                    type="button"
                    className={chartMode === id ? 'tab-active' : 'tab'}
                    onClick={() => setChartMode(id)}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <AreaChart
              title={
                chartMode === 'hevy1RM' ? '1RM Estimado (curva 1–30 reps)'
                  : chartMode === 'maxLoad' ? 'Maior Carga por Sessão'
                    : chartMode === 'bestSetVol' ? 'Melhor Série (kg × reps)'
                      : 'Volume Total por Sessão'
              }
              unit="kg"
              minZero={false}
              height={200}
              emptyText="Registre uma sessão deste exercício para visualizar os gráficos de evolução."
              points={chartPoints}
            />
          </div>
        )}

        {tab === 'Histórico' && (
          <div className="max-h-96 space-y-2.5 overflow-y-auto pr-1">
            {history.length === 0 ? (
              <Empty>Nenhuma sessão registrada para este exercício ainda.</Empty>
            ) : (
              [...history].reverse().map((s) => (
                <div key={s.workoutId} className="rounded-xl border border-line bg-raised/30 p-3">
                  <div className="mb-2 flex items-baseline justify-between gap-2">
                    <span className="text-sm font-medium text-fg">{s.title}</span>
                    <span className="text-xs text-fg3">{formatDay(s.date)} · vol. {num(s.tonnage)} kg</span>
                  </div>
                  <div className="space-y-1">
                    {s.sets.map((row, idx) => {
                      const badge = s.numbered[idx]?.badge ?? String(idx + 1);
                      const sn = parseSetNotes(row.notes);
                      const ssStyle = sn.superset ? SUPERSET_STYLE[sn.superset] : null;
                      return (
                        <div key={row.id} className="flex items-center gap-2 text-xs">
                          <span
                            className={`inline-flex h-5 w-6 items-center justify-center rounded font-medium ${
                              badge === 'W' ? 'bg-warning/15 text-warning'
                                : badge === 'D' ? 'bg-info/15 text-info'
                                  : badge === 'F' ? 'bg-negative/15 text-negative'
                                    : 'bg-raised text-fg2'
                            }`}
                          >
                            {badge}
                          </span>
                          <span className="figure text-fg">
                            {num(row.load_kg)} kg × {row.reps}
                          </span>
                          {row.effort != null && (
                            <span className="rounded border border-line px-1.5 py-0.2 text-[11px] text-fg3">
                              @{num(row.effort, 1)}
                            </span>
                          )}
                          {ssStyle && (
                            <span className={`rounded border px-1.5 py-0.2 text-[10px] ${ssStyle.badge}`}>
                              {ssStyle.label}
                            </span>
                          )}
                          {hevy1RM(row.load_kg, row.reps) && badge !== 'W' && (
                            <span className="ml-auto figure text-[11px] text-fg3">
                              1RM {num(hevy1RM(row.load_kg, row.reps)!)} kg
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {tab === 'Configuração' && (
          <form onSubmit={saveConfig} className="space-y-3">
            <Field label="Nota Fixada Permanente (visível em todo treino deste exercício)">
              <textarea
                className="input min-h-[72px] py-2 text-sm"
                placeholder="Ex.: Banco no furo 3, escapulas retraídas, pegada na linha do anel…"
                value={pinned}
                onChange={(e) => setPinned(e.target.value)}
              />
            </Field>
            <p className="text-[11px] text-fg3">
              Sincronizada também com a memória de Saúde do Assistente IA para orientações personalizadas.
            </p>

            <div className="grid grid-cols-3 gap-2">
              <Field label="Reps mínimas">
                <input className="input" type="number" min={1} max={MAX_REPS} value={repMin} onChange={(e) => setRepMin(Number(e.target.value))} />
              </Field>
              <Field label={`Reps máximas (até ${MAX_REPS})`}>
                <input className="input" type="number" min={1} max={MAX_REPS} value={repMax} onChange={(e) => setRepMax(Number(e.target.value))} />
              </Field>
              <Field label="Incremento (kg)">
                <input className="input" type="number" min={0.25} step={0.25} value={incKg} onChange={(e) => setIncKg(Number(e.target.value))} />
              </Field>
            </div>

            <button className="btn-primary w-full justify-center">Salvar nota e progressão</button>
          </form>
        )}
      </div>
    </Modal>
  );
}
