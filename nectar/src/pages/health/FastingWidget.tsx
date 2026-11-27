import { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Clock, Flame, Play, Square, Trash2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { write } from '../../lib/useTable';
import { num } from '../../lib/format';
import {
  FASTING_PROTOCOLS,
  METABOLIC_STAGES,
  computeFastingStatus,
  formatFastingDuration,
  summarizeFasts,
} from '../../lib/fasting';
import { NutrientRing } from '../../components/Charts';
import { Field, Modal } from '../../components/ui';
import type { Health } from './useHealth';

const I = { size: 16, strokeWidth: 1.5, 'aria-hidden': true } as const;

function toLocalDatetimeValue(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function formatDateTimePt(d: Date): string {
  return d.toLocaleString('pt-BR', {
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function FastingWidget({ h, compact = false }: { h: Health; compact?: boolean }) {
  const [now, setNow] = useState(() => new Date());
  const [starting, setStarting] = useState(false);
  const [ending, setEnding] = useState(false);
  const [endNotes, setEndNotes] = useState('');

  const active = h.activeFast;

  useEffect(() => {
    if (!active) return;
    const id = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(id);
  }, [active?.id]);

  const status = useMemo(
    () => (active ? computeFastingStatus(active, now) : null),
    [active, now],
  );
  const summary = useMemo(() => summarizeFasts(h.fasts.rows, now), [h.fasts.rows, now]);
  const history = h.fasts.rows.filter((f) => f.ended_at !== null).slice(0, compact ? 3 : 8);

  async function finishFast() {
    if (!active) return;
    const ok = await write(
      supabase
        .from('fasting_sessions')
        .update({ ended_at: new Date().toISOString(), notes: endNotes.trim() || active.notes || null })
        .eq('id', active.id),
    );
    if (ok) {
      setEnding(false);
      setEndNotes('');
      await h.fasts.reload();
    }
  }

  async function cancelFast() {
    if (!active || !confirm('Cancelar e descartar este jejum em andamento?')) return;
    if (await write(supabase.from('fasting_sessions').delete().eq('id', active.id))) {
      await h.fasts.reload();
    }
  }

  return (
    <div className="space-y-4">
      <section className="card">
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <div className="mr-auto">
            <h2 className="text-[15px] leading-6 font-medium text-fg">Jejum intermitente</h2>
            <p className="text-xs text-fg3">
              {active
                ? `Protocolo ${active.protocol} (${num(active.target_hours)}h)`
                : 'Escolha um protocolo pré-definido ou personalize as horas com prévia exata de término'}
            </p>
          </div>
          {!active && compact && (
            <button type="button" className="btn-primary" onClick={() => setStarting(true)}>
              <Play {...I} /> Iniciar jejum
            </button>
          )}
          {active && (
            <button type="button" className="btn-primary" onClick={() => setEnding(true)}>
              <Square {...I} /> Terminar jejum
            </button>
          )}
        </div>

        {active && status ? (
          <div className="rounded-xl border border-line bg-raised/40 p-4">
            <div className="flex flex-wrap items-center gap-5">
              <NutrientRing
                label={status.goalReached ? 'Meta batida' : 'Progresso'}
                pct={status.pct}
                size={84}
              />
              <div className="min-w-0 flex-1 space-y-1.5">
                <div className="flex flex-wrap items-baseline gap-3">
                  <div>
                    <div className="text-[11px] text-fg3">Tempo em jejum</div>
                    <div className="figure text-2xl font-medium text-fg">
                      {formatFastingDuration(status.elapsedMs, true)}
                    </div>
                  </div>
                  <div className="border-l border-line pl-3">
                    <div className="text-[11px] text-fg3">
                      {status.goalReached ? 'Além da meta' : 'Faltam'}
                    </div>
                    <div className="figure text-sm font-medium text-fg2">
                      {status.goalReached
                        ? `+${formatFastingDuration(status.elapsedMs - status.targetMs)}`
                        : formatFastingDuration(status.remainingMs)}
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-fg2">
                  <span className="inline-flex items-center gap-1">
                    <Clock size={13} strokeWidth={1.5} className="text-fg3" />
                    Início: <strong className="font-medium text-fg">{formatDateTimePt(new Date(active.started_at))}</strong>
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <CheckCircle2 size={13} strokeWidth={1.5} className="text-positive" />
                    Término previsto: <strong className="font-medium text-fg">{formatDateTimePt(status.expectedEndAt)}</strong>
                  </span>
                </div>

                <div className="pt-1 text-xs text-fg3">
                  <span className="inline-flex items-center gap-1 font-medium text-fg2">
                    <Flame size={13} strokeWidth={1.5} className="text-warning" />
                    {status.stage.label}:
                  </span>{' '}
                  {status.stage.description}
                </div>
              </div>

              <button
                type="button"
                className="btn-ghost text-xs text-fg3 hover:text-negative"
                onClick={cancelFast}
                title="Descartar jejum"
              >
                Cancelar
              </button>
            </div>
          </div>
        ) : compact ? (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-raised/30 px-4 py-3 text-sm">
            <div className="text-fg2">
              Nenhum jejum ativo agora.
              {summary.completedCount > 0 && (
                <span className="ml-2 text-xs text-fg3">
                  {summary.completedCount} concluídos · média {num(summary.averageHours)}h · recorde {num(summary.longestHours)}h
                </span>
              )}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {['16:8', '18:6', '20:4'].map((preset) => (
                <button
                  key={preset}
                  type="button"
                  className="btn-secondary h-8 px-2.5 text-xs"
                  onClick={async () => {
                    const p = FASTING_PROTOCOLS.find((x) => x.id === preset)!;
                    if (await write(supabase.from('fasting_sessions').insert({
                      protocol: p.id,
                      target_hours: p.fastHours,
                      started_at: new Date().toISOString(),
                    }))) {
                      await h.fasts.reload();
                    }
                  }}
                >
                  Iniciar {preset}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <StartFastConfigurator onStarted={() => h.fasts.reload()} />
        )}

        {!compact && history.length > 0 && (
          <div className="mt-5 border-t border-line pt-4">
            <div className="mb-2 flex items-center justify-between">
              <div className="label">Histórico recente</div>
              <div className="text-xs text-fg3">
                {summary.completedCount} concluídos · média {num(summary.averageHours)}h · recorde {num(summary.longestHours)}h
              </div>
            </div>
            <ul className="divide-y divide-line text-sm">
              {history.map((f) => {
                const st = computeFastingStatus(f);
                return (
                  <li key={f.id} className="flex items-center gap-3 py-2">
                    <span className="rounded-md border border-line px-2 py-0.5 font-mono text-xs text-fg2">
                      {f.protocol}
                    </span>
                    <span className="mr-auto text-xs text-fg3">
                      {formatDateTimePt(new Date(f.started_at))} → {f.ended_at ? formatDateTimePt(new Date(f.ended_at)) : ''}
                      {f.notes ? ` · ${f.notes}` : ''}
                    </span>
                    <span className={`figure text-xs font-medium ${st.goalReached ? 'text-positive' : 'text-fg2'}`}>
                      {num(st.elapsedHours, 1)}h / {num(f.target_hours)}h
                    </span>
                    <button
                      type="button"
                      className="text-fg3 hover:text-negative"
                      aria-label="Excluir registro de jejum"
                      onClick={async () => {
                        if (await write(supabase.from('fasting_sessions').delete().eq('id', f.id))) {
                          void h.fasts.reload();
                        }
                      }}
                    >
                      <Trash2 size={14} strokeWidth={1.5} />
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        {starting && (
          <Modal title="Configurar jejum intermitente" onClose={() => setStarting(false)}>
            <StartFastConfigurator
              onStarted={async () => {
                setStarting(false);
                await h.fasts.reload();
              }}
            />
          </Modal>
        )}

        {ending && active && status && (
          <Modal title="Terminar jejum" onClose={() => setEnding(false)}>
            <div className="mb-4 rounded-xl border border-line bg-raised/40 p-3 text-sm">
              <div className="flex items-baseline justify-between">
                <span className="text-fg2">Tempo total em jejum</span>
                <span className="figure text-lg font-medium text-fg">{formatFastingDuration(status.elapsedMs)}</span>
              </div>
              <div className="mt-1 text-xs text-fg3">
                Meta do protocolo {active.protocol}: {num(active.target_hours)}h ({status.pct}% concluído)
              </div>
            </div>
            <Field label="Observações (opcional)">
              <input
                className="input"
                placeholder="Como se sentiu, energia, refeição de quebra…"
                value={endNotes}
                onChange={(e) => setEndNotes(e.target.value)}
              />
            </Field>
            <div className="flex gap-2">
              <button type="button" className="btn-ghost" onClick={() => setEnding(false)}>Continuar jejum</button>
              <button type="button" className="btn-primary ml-auto" onClick={finishFast}>
                Confirmar término
              </button>
            </div>
          </Modal>
        )}
      </section>

      {!compact && (
        <section className="card">
          <div className="label mb-3">Fases metabólicas do jejum</div>
          <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-5">
            {METABOLIC_STAGES.map((stage, idx) => {
              const isCurrent = status?.stage.id === stage.id;
              const nextMin = METABOLIC_STAGES[idx + 1]?.minHours;
              return (
                <div
                  key={stage.id}
                  className={`rounded-xl border p-3 text-xs ${
                    isCurrent ? 'border-brand bg-raised text-fg' : 'border-line bg-raised/25 text-fg2'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium text-fg">{stage.label}</span>
                    <span className="figure shrink-0 font-mono text-[11px] text-fg3">
                      {nextMin ? `${stage.minHours}–${nextMin}h` : `${stage.minHours}h+`}
                    </span>
                  </div>
                  <p className="mt-1 text-[11px] leading-relaxed text-fg3">{stage.description}</p>
                </div>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}

function StartFastConfigurator({ onStarted }: { onStarted: () => void | Promise<void> }) {
  const [protocolId, setProtocolId] = useState<string>('16:8');
  const [customHours, setCustomHours] = useState<number>(16);
  const [startLocal, setStartLocal] = useState<string>(() => toLocalDatetimeValue(new Date()));
  const [notes, setNotes] = useState('');

  const selectedPreset = FASTING_PROTOCOLS.find((p) => p.id === protocolId);
  const targetHours = protocolId === 'custom' ? Math.max(1, customHours || 16) : (selectedPreset?.fastHours ?? 16);
  const startDate = useMemo(() => {
    const parsed = new Date(startLocal);
    return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
  }, [startLocal]);
  const expectedEnd = useMemo(
    () => new Date(startDate.getTime() + targetHours * 3_600_000),
    [startDate, targetHours],
  );

  async function submit() {
    const label = protocolId === 'custom' ? `${targetHours}h` : protocolId;
    if (await write(supabase.from('fasting_sessions').insert({
      protocol: label,
      target_hours: targetHours,
      started_at: startDate.toISOString(),
      notes: notes.trim() || null,
    }))) {
      await onStarted();
    }
  }

  return (
    <div>
      <div className="mb-4">
        <div className="label mb-2">Protocolo</div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {FASTING_PROTOCOLS.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => { setProtocolId(p.id); setCustomHours(p.fastHours); }}
              className={`rounded-lg border px-3 py-2 text-left text-xs transition-colors ${
                protocolId === p.id ? 'border-brand bg-raised text-fg' : 'border-line text-fg2 hover:bg-raised/60'
              }`}
            >
              <div className="font-mono text-sm font-medium text-fg">{p.label}</div>
              <div className="mt-0.5 truncate text-[11px] text-fg3">{p.fastHours}h jejum</div>
            </button>
          ))}
          <button
            type="button"
            onClick={() => setProtocolId('custom')}
            className={`rounded-lg border px-3 py-2 text-left text-xs transition-colors ${
              protocolId === 'custom' ? 'border-brand bg-raised text-fg' : 'border-line text-fg2 hover:bg-raised/60'
            }`}
          >
            <div className="text-sm font-medium text-fg">Personalizado</div>
            <div className="mt-0.5 text-[11px] text-fg3">Livre (1–168h)</div>
          </button>
        </div>
        {selectedPreset && (
          <p className="mt-2 text-xs text-fg3">{selectedPreset.subtitle}</p>
        )}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {protocolId === 'custom' && (
          <Field label="Duração do jejum (horas)">
            <input
              className="input"
              type="number"
              min={1}
              max={168}
              step="0.5"
              value={customHours}
              onChange={(e) => setCustomHours(Number(e.target.value))}
            />
          </Field>
        )}

        <Field label="Início do jejum (ajuste se começou antes)">
          <input
            className="input"
            type="datetime-local"
            value={startLocal}
            onChange={(e) => setStartLocal(e.target.value)}
          />
        </Field>

        <Field label="Nota (opcional)">
          <input
            className="input"
            placeholder="Ex.: Última refeição foi jantar leve"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </Field>
      </div>

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-raised/50 px-4 py-3 text-sm">
        <div>
          <div className="text-xs text-fg3">Prévia exata de término ({num(targetHours)} horas de jejum)</div>
          <div className="mt-0.5 font-medium text-fg">{formatDateTimePt(expectedEnd)}</div>
        </div>
        <button type="button" className="btn-primary" onClick={submit}>
          <Play {...I} /> Iniciar jejum ({protocolId === 'custom' ? `${num(targetHours)}h` : protocolId})
        </button>
      </div>
    </div>
  );
}

