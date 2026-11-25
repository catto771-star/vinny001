import { useState } from 'react';
import { Sparkles } from 'lucide-react';
import { num } from '../../lib/format';
import { MUSCLE_LABEL } from '../../lib/training';
import { analyzeMuscleSymmetry, type WeightedMuscleRow } from '../../lib/hevy';
import { openAssistantDrawer } from '../../components/AssistantDrawer';

interface BodyHeatmapProps {
  rows: readonly WeightedMuscleRow[];
  periodLabel?: string;
  compact?: boolean;
}

export default function BodyHeatmap({ rows, periodLabel = 'período selecionado', compact = false }: BodyHeatmapProps) {
  const [hovered, setHovered] = useState<string | null>(null);
  const byMuscle = new Map(rows.map((r) => [r.muscle_group, r]));
  const symmetry = analyzeMuscleSymmetry(rows);

  const intensityOf = (muscle: string) => {
    const r = byMuscle.get(muscle);
    if (!r) return 0;
    return Math.max(0.18, r.intensity);
  };

  const fillFor = (muscle: string) => {
    const alpha = intensityOf(muscle);
    const active = hovered === muscle;
    if (alpha <= 0) return 'var(--raised)';
    return `color-mix(in oklab, var(--brand) ${Math.round((active ? Math.min(1, alpha + 0.15) : alpha) * 88)}%, var(--raised))`;
  };

  const strokeFor = (muscle: string) =>
    hovered === muscle ? 'var(--brand)' : intensityOf(muscle) > 0 ? 'color-mix(in oklab, var(--brand) 55%, var(--line-strong))' : 'var(--line-strong)';

  const bind = (muscle: string) => ({
    fill: fillFor(muscle),
    stroke: strokeFor(muscle),
    strokeWidth: hovered === muscle ? 1.6 : 1,
    className: 'cursor-pointer transition-colors duration-150',
    onMouseEnter: () => setHovered(muscle),
    onMouseLeave: () => setHovered(null),
  });

  const activeRow = hovered ? byMuscle.get(hovered) : rows[0];

  return (
    <div className={compact ? 'space-y-4' : 'grid gap-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]'}>
      {/* Front & Back Anatomical SVG */}
      <div className="rounded-xl border border-line bg-bg/40 p-4">
        <div className="mb-3 flex items-center justify-between text-xs text-fg3">
          <span>Mapa anatômico (1,0× primário + 0,5× secundário)</span>
          <span className="figure text-fg2">
            {hovered
              ? `${MUSCLE_LABEL[hovered] ?? hovered}: ${num(byMuscle.get(hovered)?.weightedSets ?? 0, 1)} séries`
              : activeRow
                ? `Destaque: ${activeRow.label} (${num(activeRow.weightedSets, 1)} séries)`
                : 'Passe o cursor sobre um músculo'}
          </span>
        </div>

        <div className="grid grid-cols-2 gap-4">
          {/* FRONT VIEW */}
          <div className="flex flex-col items-center">
            <span className="mb-1.5 text-[11px] font-medium text-fg3">Frente</span>
            <svg viewBox="0 0 140 250" className="h-56 w-auto select-none" role="img" aria-label="Mapa muscular frontal">
              {/* Head & Neck */}
              <circle cx="70" cy="22" r="13" fill="var(--raised)" stroke="var(--line-strong)" strokeWidth="1" />
              <rect x="64" y="35" width="12" height="8" rx="3" fill="var(--raised)" stroke="var(--line-strong)" strokeWidth="1" />

              {/* Shoulders (Deltoids) */}
              <ellipse cx="42" cy="54" rx="10" ry="11" {...bind('ombros')} />
              <ellipse cx="98" cy="54" rx="10" ry="11" {...bind('ombros')} />

              {/* Chest (Pectorals) */}
              <path d="M50 45 Q70 43 70 50 L70 72 Q56 74 49 65 Z" {...bind('peito')} />
              <path d="M90 45 Q70 43 70 50 L70 72 Q84 74 91 65 Z" {...bind('peito')} />

              {/* Biceps */}
              <rect x="31" y="66" width="11" height="26" rx="5.5" {...bind('biceps')} />
              <rect x="98" y="66" width="11" height="26" rx="5.5" {...bind('biceps')} />

              {/* Forearms */}
              <rect x="27" y="95" width="10" height="28" rx="5" {...bind('antebraco')} />
              <rect x="103" y="95" width="10" height="28" rx="5" {...bind('antebraco')} />

              {/* Abdominals / Core */}
              <rect x="54" y="74" width="32" height="44" rx="6" {...bind('abdomen')} />
              <line x1="70" y1="76" x2="70" y2="116" stroke="var(--line)" strokeWidth="0.8" pointerEvents="none" />
              <line x1="56" y1="88" x2="84" y2="88" stroke="var(--line)" strokeWidth="0.8" pointerEvents="none" />
              <line x1="56" y1="101" x2="84" y2="101" stroke="var(--line)" strokeWidth="0.8" pointerEvents="none" />

              {/* Quadriceps */}
              <path d="M51 121 L68 121 L66 178 Q56 181 50 174 Z" {...bind('quadriceps')} />
              <path d="M72 121 L89 121 L90 174 Q84 181 74 178 Z" {...bind('quadriceps')} />

              {/* Calves (Anterior / Tibialis + Gastroc) */}
              <rect x="52" y="183" width="13" height="44" rx="6" {...bind('panturrilhas')} />
              <rect x="75" y="183" width="13" height="44" rx="6" {...bind('panturrilhas')} />
            </svg>
          </div>

          {/* BACK VIEW */}
          <div className="flex flex-col items-center">
            <span className="mb-1.5 text-[11px] font-medium text-fg3">Costas</span>
            <svg viewBox="0 0 140 250" className="h-56 w-auto select-none" role="img" aria-label="Mapa muscular posterior">
              {/* Head & Neck */}
              <circle cx="70" cy="22" r="13" fill="var(--raised)" stroke="var(--line-strong)" strokeWidth="1" />
              <rect x="64" y="35" width="12" height="8" rx="3" fill="var(--raised)" stroke="var(--line-strong)" strokeWidth="1" />

              {/* Rear Delts / Shoulders */}
              <ellipse cx="42" cy="54" rx="10" ry="11" {...bind('ombros')} />
              <ellipse cx="98" cy="54" rx="10" ry="11" {...bind('ombros')} />

              {/* Back (Traps + Lats + Erectors) */}
              <path d="M50 44 L90 44 L86 112 L54 112 Z" {...bind('costas')} />
              <line x1="70" y1="45" x2="70" y2="111" stroke="var(--line)" strokeWidth="0.8" pointerEvents="none" />

              {/* Triceps */}
              <rect x="31" y="66" width="11" height="26" rx="5.5" {...bind('triceps')} />
              <rect x="98" y="66" width="11" height="26" rx="5.5" {...bind('triceps')} />

              {/* Forearms */}
              <rect x="27" y="95" width="10" height="28" rx="5" {...bind('antebraco')} />
              <rect x="103" y="95" width="10" height="28" rx="5" {...bind('antebraco')} />

              {/* Glutes */}
              <ellipse cx="60" cy="124" rx="11" ry="11" {...bind('gluteos')} />
              <ellipse cx="80" cy="124" rx="11" ry="11" {...bind('gluteos')} />

              {/* Hamstrings */}
              <rect x="51" y="137" width="15" height="41" rx="6.5" {...bind('posteriores')} />
              <rect x="74" y="137" width="15" height="41" rx="6.5" {...bind('posteriores')} />

              {/* Calves */}
              <rect x="52" y="183" width="13" height="44" rx="6" {...bind('panturrilhas')} />
              <rect x="75" y="183" width="13" height="44" rx="6" {...bind('panturrilhas')} />
            </svg>
          </div>
        </div>
      </div>

      {/* Symmetry & Ranked Weighted Breakdown */}
      {!compact && (
        <div className="flex flex-col justify-between space-y-4">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="label">Equilíbrio de Cadeias ({periodLabel})</div>
              <button
                type="button"
                className="btn-ghost h-7 px-2 text-xs"
                onClick={() =>
                  openAssistantDrawer({
                    prompt: `Analise meu equilíbrio muscular (${periodLabel}): Empurrar ${symmetry.pushSets} séries, Puxar ${symmetry.pullSets} séries, Pernas ${symmetry.legsSets} séries, Core ${symmetry.coreSets} séries. Sugira ajustes práticos na minha ficha.`,
                    newThread: true,
                  })
                }
              >
                <Sparkles size={13} strokeWidth={1.5} /> Avaliar com IA
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
              {[
                { label: 'Empurrar', val: symmetry.pushSets },
                { label: 'Puxar', val: symmetry.pullSets },
                { label: 'Pernas', val: symmetry.legsSets },
                { label: 'Core / Global', val: symmetry.coreSets },
              ].map((c) => (
                <div key={c.label} className="rounded-lg border border-line bg-raised/40 px-3 py-2">
                  <div className="text-[11px] text-fg3">{c.label}</div>
                  <div className="figure mt-0.5 text-base font-medium text-fg">{num(c.val, 1)}</div>
                </div>
              ))}
            </div>

            <p className="rounded-lg border border-line bg-raised/30 px-3 py-2 text-xs text-fg2">
              {symmetry.balanceNote}
            </p>
          </div>

          {rows.length > 0 && (
            <div className="space-y-2">
              <div className="label">Volume Ponderado por Músculo</div>
              <div className="max-h-48 space-y-1.5 overflow-y-auto pr-1">
                {rows.map((r) => (
                  <div
                    key={r.muscle_group}
                    className="flex items-center gap-2 text-xs"
                    onMouseEnter={() => setHovered(r.muscle_group)}
                    onMouseLeave={() => setHovered(null)}
                  >
                    <span className="w-28 truncate text-fg2">{r.label}</span>
                    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-raised">
                      <div
                        className="h-full rounded-full bg-brand transition-[width] duration-200"
                        style={{ width: `${Math.round(r.intensity * 100)}%` }}
                      />
                    </div>
                    <span className="figure w-24 text-right text-fg">
                      {num(r.weightedSets, 1)} <span className="text-fg3">({r.primarySets}+{r.secondarySets}×½)</span>
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
