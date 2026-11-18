import { useState, type ReactNode } from 'react';
import { num } from '../lib/format';

// Single-series charts in SVG, on the theme's tokens. Bars are neutral and
// only the current period takes the accent; a line takes the accent. Mono
// labels on a hairline grid, a hover tooltip, a value on the last point
// only, and a table view.

export interface Point { label: string; value: number | null; detail?: string }

const ACCENT = 'var(--brand)';
const NEUTRAL = 'var(--chart-neutral)';
const PAD = { top: 20, right: 16, bottom: 28, left: 48 };

function niceMax(max: number): number {
  if (max <= 0) return 1;
  const exp = 10 ** Math.floor(Math.log10(max));
  const f = max / exp;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * exp;
}

function lastIndex<T>(xs: T[], ok: (x: T) => boolean): number {
  for (let i = xs.length - 1; i >= 0; i--) if (ok(xs[i])) return i;
  return -1;
}

const fmt = (n: number) => (Math.abs(n) >= 10000 ? `${num(n / 1000, 0)} mil` : num(n));

export function ChartFrame({ title, subtitle, points, unit, children, aside }: {
  title: string; subtitle?: string; points: Point[]; unit: string; children: ReactNode; aside?: ReactNode;
}) {
  const [table, setTable] = useState(false);
  return (
    <figure className="card">
      <figcaption className="mb-4 flex flex-wrap items-start gap-3">
        <div className="mr-auto">
          <div className="font-medium">{title}</div>
          {subtitle && <div className="text-[13px] leading-5 text-fg3">{subtitle}</div>}
        </div>
        {aside}
        <button className="text-[13px] text-fg3 underline-offset-4 hover:text-fg hover:underline" onClick={() => setTable(!table)}>{table ? 'Ver gráfico' : 'Ver tabela'}</button>
      </figcaption>
      {table ? (
        <table className="w-full text-sm">
          <tbody>
            {points.map((p) => (
              <tr key={p.label} className="border-t border-line">
                <td className="py-1.5 text-fg2">{p.label}</td>
                <td className="figure py-1.5 text-right">{p.value === null ? '—' : `${fmt(p.value)} ${unit}`}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : children}
    </figure>
  );
}

function Grid({ ticks, y, w, unit }: { ticks: number[]; y: (v: number) => number; w: number; unit: string }) {
  return (
    <g>
      {ticks.map((t) => (
        <g key={t}>
          <line x1={PAD.left} x2={w - PAD.right} y1={y(t)} y2={y(t)} className="stroke-line" strokeWidth={1} />
          <text x={PAD.left - 8} y={y(t) + 4} textAnchor="end" className="fill-fg3 font-mono text-[10px]">{fmt(t)}</text>
        </g>
      ))}
      <text x={PAD.left - 8} y={PAD.top - 8} textAnchor="end" className="fill-fg3 font-mono text-[10px]">{unit}</text>
    </g>
  );
}

function Tooltip({ x, y, w, point, unit }: { x: number; y: number; w: number; point: Point; unit: string }) {
  const text = `${point.label}: ${point.value === null ? 'sem dado' : `${fmt(point.value)} ${unit}`}${point.detail ? ` · ${point.detail}` : ''}`;
  const tw = Math.min(300, text.length * 6.2 + 20);
  const left = Math.min(Math.max(x - tw / 2, 0), w - tw);
  const top = Math.max(0, y - 34);
  return (
    <g pointerEvents="none">
      <rect x={left} y={top} width={tw} height={24} rx={6} className="fill-raised stroke-line-strong" strokeWidth={1} />
      <text x={left + 10} y={top + 16} className="fill-fg text-[11px]">{text}</text>
    </g>
  );
}

export function ColumnChart({ title, subtitle, points, unit, height = 220, highlightLast = true, highlight, aside }: {
  title: string; subtitle?: string; points: Point[]; unit: string; height?: number; highlightLast?: boolean;
  /** Index of the bar that takes the accent, like today; wins over highlightLast. */
  highlight?: number; aside?: ReactNode;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 640;
  const H = height;
  const max = niceMax(Math.max(0, ...points.map((p) => p.value ?? 0)));
  const plotW = W - PAD.left - PAD.right;
  const band = plotW / Math.max(1, points.length);
  const bar = Math.min(24, band - 4);
  const y = (v: number) => PAD.top + (H - PAD.top - PAD.bottom) * (1 - v / max);
  const base = y(0);
  const lastIdx = lastIndex(points, (p) => p.value !== null && p.value > 0);
  return (
    <ChartFrame title={title} subtitle={subtitle} points={points} unit={unit} aside={aside}>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={title} onMouseLeave={() => setHover(null)}>
        <Grid ticks={[0, max / 2, max]} y={y} w={W} unit={unit} />
        {points.map((p, i) => {
          const cx = PAD.left + band * i + band / 2;
          const v = p.value ?? 0;
          const top = y(v);
          const h = Math.max(0, base - top);
          const r = Math.min(4, h, bar / 2);
          const lead = highlight !== undefined ? i === highlight : highlightLast ? i === points.length - 1 : i === lastIdx;
          return (
            <g key={p.label + i} onMouseEnter={() => setHover(i)}>
              <rect x={cx - band / 2} y={PAD.top} width={band} height={H - PAD.top - PAD.bottom} fill="transparent" />
              {h > 0 && (
                <path
                  d={`M${cx - bar / 2},${base} V${top + r} Q${cx - bar / 2},${top} ${cx - bar / 2 + r},${top} H${cx + bar / 2 - r} Q${cx + bar / 2},${top} ${cx + bar / 2},${top + r} V${base} Z`}
                  fill={lead ? ACCENT : NEUTRAL}
                  className="transition-opacity duration-150"
                  opacity={hover === null || hover === i ? 1 : 0.6}
                />
              )}
              <text x={cx} y={H - 10} textAnchor="middle" className="fill-fg3 font-mono text-[10px]">{p.label}</text>
              {i === lastIdx && hover === null && <text x={cx} y={top - 6} textAnchor="middle" className="fill-fg2 font-mono text-[11px]">{fmt(v)}</text>}
            </g>
          );
        })}
        {hover !== null && <Tooltip x={PAD.left + band * hover + band / 2} y={y(points[hover].value ?? 0)} w={W} point={points[hover]} unit={unit} />}
      </svg>
    </ChartFrame>
  );
}

export function LineChart({ title, subtitle, points, unit, minZero = true, height = 220, aside }: {
  title: string; subtitle?: string; points: Point[]; unit: string; minZero?: boolean; height?: number; aside?: ReactNode;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 640;
  const H = height;
  const values = points.map((p) => p.value).filter((v): v is number => v !== null);
  const lo = minZero || !values.length ? 0 : Math.floor(Math.min(...values) - 1);
  const hi = values.length ? niceMax(Math.max(...values) - lo) + lo : 1;
  const plotW = W - PAD.left - PAD.right;
  const step = points.length > 1 ? plotW / (points.length - 1) : 0;
  const x = (i: number) => PAD.left + (points.length > 1 ? step * i : plotW / 2);
  const y = (v: number) => PAD.top + (H - PAD.top - PAD.bottom) * (1 - (v - lo) / (hi - lo || 1));
  let d = '';
  points.forEach((p, i) => {
    if (p.value === null) return;
    d += `${d && points[i - 1]?.value !== null ? 'L' : 'M'}${x(i)},${y(p.value)} `;
  });
  const last = lastIndex(points, (p) => p.value !== null);
  return (
    <ChartFrame title={title} subtitle={subtitle} points={points} unit={unit} aside={aside}>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={title} onMouseLeave={() => setHover(null)}>
        <Grid ticks={[lo, (lo + hi) / 2, hi]} y={y} w={W} unit={unit} />
        <path d={d} fill="none" stroke={ACCENT} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        {points.map((p, i) => (
          <g key={p.label + i} onMouseEnter={() => setHover(i)}>
            <rect x={x(i) - Math.max(step, 16) / 2} y={PAD.top} width={Math.max(step, 16)} height={H - PAD.top - PAD.bottom} fill="transparent" />
            {(i === 0 || i === points.length - 1 || points.length <= 8) && (
              <text x={x(i)} y={H - 10} textAnchor="middle" className="fill-fg3 font-mono text-[10px]">{p.label}</text>
            )}
          </g>
        ))}
        {hover !== null && points[hover].value !== null && (
          <line x1={x(hover)} x2={x(hover)} y1={PAD.top} y2={H - PAD.bottom} className="stroke-line-strong" strokeWidth={1} />
        )}
        {points.map((p, i) => p.value !== null && (i === last || i === hover) && (
          <circle key={`dot${i}`} cx={x(i)} cy={y(p.value)} r={4} fill={ACCENT} className="stroke-surface" strokeWidth={2} />
        ))}
        {last >= 0 && hover === null && (
          <text x={x(last) - 8} y={y(points[last].value!) - 10} textAnchor="end" className="fill-fg2 font-mono text-[11px]">{fmt(points[last].value!)}</text>
        )}
        {hover !== null && <Tooltip x={x(hover)} y={y(points[hover].value ?? lo)} w={W} point={points[hover]} unit={unit} />}
      </svg>
    </ChartFrame>
  );
}

/** Progress toward a target, with the numbers beside it. */
export function TargetBar({ label, consumed, target, unit }: { label: string; consumed: number; target: number; unit: string }) {
  const pct = target > 0 ? Math.min(100, (consumed / target) * 100) : 0;
  const over = consumed > target * 1.05;
  return (
    <div className="mb-4">
      <div className="mb-1.5 flex items-baseline text-sm">
        <span className="mr-auto text-fg2">{label}</span>
        <span className="figure text-fg">{num(consumed)}</span>
        <span className="figure ml-1 text-fg3">/ {num(target)} {unit}</span>
      </div>
      <div className="h-1.5 rounded-sm bg-raised">
        <div className="h-1.5 rounded-sm transition-[width] duration-300" style={{ width: `${pct}%`, background: over ? 'var(--negative)' : ACCENT }} />
      </div>
      {over && <div className="mt-1 text-xs text-negative">{num(consumed - target)} {unit} acima</div>}
    </div>
  );
}

/** A ranked list with thin bars: the secondary data block next to a main chart. */
export function RankedBars({ rows, unit, format = num }: { rows: { label: string; value: number; detail?: string }[]; unit: string; format?: (n: number) => string }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <ul className="space-y-3">
      {rows.map((r, i) => (
        <li key={r.label}>
          <div className="mb-1 flex items-baseline text-sm">
            <span className="mr-auto">{r.label}</span>
            <span className="figure text-fg2">{format(r.value)}{unit ? ` ${unit}` : ''}</span>
          </div>
          <div className="h-1 rounded-sm bg-raised"><div className="h-1 rounded-sm" style={{ width: `${(r.value / max) * 100}%`, background: i === 0 ? ACCENT : NEUTRAL }} /></div>
          {r.detail && <div className="figure mt-1 text-xs text-fg3">{r.detail}</div>}
        </li>
      ))}
    </ul>
  );
}
