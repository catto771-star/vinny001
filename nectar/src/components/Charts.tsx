import { useState, type ReactNode } from 'react';

// Single-series charts drawn in SVG: thin rounded columns or a 2px line,
// hairline grid, hover tooltip, value label on the last point only, and a
// table view. One series per chart, one axis.

export interface Point { label: string; value: number | null; detail?: string }

const SERIES = '#0284c7';
const W = 560;
const H = 180;
const PAD = { top: 16, right: 12, bottom: 24, left: 44 };

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

const fmt = (n: number) => (Math.abs(n) >= 10000 ? `${Math.round(n / 1000)}K` : n.toLocaleString('pt-BR', { maximumFractionDigits: 1 }));

function Frame({ title, subtitle, points, unit, children }: { title: string; subtitle?: string; points: Point[]; unit: string; children: ReactNode }) {
  const [table, setTable] = useState(false);
  return (
    <figure className="card">
      <figcaption className="mb-2 flex items-start gap-2">
        <div className="mr-auto">
          <div className="text-sm font-medium">{title}</div>
          {subtitle && <div className="text-xs text-slate-500">{subtitle}</div>}
        </div>
        <button className="text-xs text-slate-500 underline" onClick={() => setTable(!table)}>{table ? 'ver gráfico' : 'ver tabela'}</button>
      </figcaption>
      {table ? (
        <table className="w-full text-sm">
          <tbody>
            {points.map((p) => (
              <tr key={p.label} className="border-t border-slate-100 dark:border-slate-800">
                <td className="py-1 text-slate-500">{p.label}</td>
                <td className="py-1 text-right">{p.value === null ? '—' : `${fmt(p.value)} ${unit}`}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : children}
    </figure>
  );
}

function Axis({ max, unit }: { max: number; unit: string }) {
  const ticks = [0, max / 2, max];
  const y = (v: number) => PAD.top + (H - PAD.top - PAD.bottom) * (1 - v / max);
  return (
    <g>
      {ticks.map((t) => (
        <g key={t}>
          <line x1={PAD.left} x2={W - PAD.right} y1={y(t)} y2={y(t)} className="stroke-slate-200 dark:stroke-slate-800" strokeWidth={1} />
          <text x={PAD.left - 6} y={y(t) + 4} textAnchor="end" className="fill-slate-500 text-[10px]">{fmt(t)}</text>
        </g>
      ))}
      <text x={4} y={PAD.top - 4} className="fill-slate-500 text-[10px]">{unit}</text>
    </g>
  );
}

function Tooltip({ x, y, point, unit }: { x: number; y: number; point: Point; unit: string }) {
  const text = `${point.label}: ${point.value === null ? 'sem dado' : `${fmt(point.value)} ${unit}`}${point.detail ? ` · ${point.detail}` : ''}`;
  const w = Math.min(260, text.length * 6 + 16);
  const left = Math.min(Math.max(x - w / 2, 0), W - w);
  return (
    <g pointerEvents="none">
      <rect x={left} y={Math.max(0, y - 30)} width={w} height={22} rx={6} className="fill-slate-900 dark:fill-slate-100" />
      <text x={left + 8} y={Math.max(0, y - 30) + 15} className="fill-white text-[11px] dark:fill-slate-900">{text}</text>
    </g>
  );
}

export function ColumnChart({ title, subtitle, points, unit }: { title: string; subtitle?: string; points: Point[]; unit: string }) {
  const [hover, setHover] = useState<number | null>(null);
  const max = niceMax(Math.max(0, ...points.map((p) => p.value ?? 0)));
  const plotW = W - PAD.left - PAD.right;
  const band = plotW / Math.max(1, points.length);
  const bar = Math.min(24, band - 2);
  const y = (v: number) => PAD.top + (H - PAD.top - PAD.bottom) * (1 - v / max);
  const base = y(0);
  const lastIdx = lastIndex(points, (p) => p.value !== null && p.value > 0);
  return (
    <Frame title={title} subtitle={subtitle} points={points} unit={unit}>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={title} onMouseLeave={() => setHover(null)}>
        <Axis max={max} unit={unit} />
        {points.map((p, i) => {
          const cx = PAD.left + band * i + band / 2;
          const v = p.value ?? 0;
          const top = y(v);
          const h = Math.max(0, base - top);
          const r = Math.min(4, h, bar / 2);
          return (
            <g key={p.label} onMouseEnter={() => setHover(i)}>
              <rect x={cx - band / 2} y={PAD.top} width={band} height={H - PAD.top - PAD.bottom} fill="transparent" />
              {h > 0 && (
                <path
                  d={`M${cx - bar / 2},${base} V${top + r} Q${cx - bar / 2},${top} ${cx - bar / 2 + r},${top} H${cx + bar / 2 - r} Q${cx + bar / 2},${top} ${cx + bar / 2},${top + r} V${base} Z`}
                  fill={SERIES}
                  opacity={hover === null || hover === i ? 1 : 0.55}
                />
              )}
              <text x={cx} y={H - 8} textAnchor="middle" className="fill-slate-500 text-[10px]">{p.label}</text>
              {i === lastIdx && hover === null && <text x={cx} y={top - 4} textAnchor="middle" className="fill-slate-700 text-[10px] dark:fill-slate-300">{fmt(v)}</text>}
            </g>
          );
        })}
        {hover !== null && <Tooltip x={PAD.left + band * hover + band / 2} y={y(points[hover].value ?? 0)} point={points[hover]} unit={unit} />}
      </svg>
    </Frame>
  );
}

export function LineChart({ title, subtitle, points, unit, minZero = true }: { title: string; subtitle?: string; points: Point[]; unit: string; minZero?: boolean }) {
  const [hover, setHover] = useState<number | null>(null);
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
  const ticks = [lo, (lo + hi) / 2, hi];
  return (
    <Frame title={title} subtitle={subtitle} points={points} unit={unit}>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={title} onMouseLeave={() => setHover(null)}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={PAD.left} x2={W - PAD.right} y1={y(t)} y2={y(t)} className="stroke-slate-200 dark:stroke-slate-800" strokeWidth={1} />
            <text x={PAD.left - 6} y={y(t) + 4} textAnchor="end" className="fill-slate-500 text-[10px]">{fmt(t)}</text>
          </g>
        ))}
        <text x={4} y={PAD.top - 4} className="fill-slate-500 text-[10px]">{unit}</text>
        <path d={d} fill="none" stroke={SERIES} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        {points.map((p, i) => (
          <g key={p.label + i} onMouseEnter={() => setHover(i)}>
            <rect x={x(i) - Math.max(step, 16) / 2} y={PAD.top} width={Math.max(step, 16)} height={H - PAD.top - PAD.bottom} fill="transparent" />
            {(i === 0 || i === points.length - 1 || points.length <= 8) && (
              <text x={x(i)} y={H - 8} textAnchor="middle" className="fill-slate-500 text-[10px]">{p.label}</text>
            )}
          </g>
        ))}
        {hover !== null && points[hover].value !== null && (
          <line x1={x(hover)} x2={x(hover)} y1={PAD.top} y2={H - PAD.bottom} className="stroke-slate-300 dark:stroke-slate-700" strokeWidth={1} />
        )}
        {points.map((p, i) => p.value !== null && (i === last || i === hover) && (
          <circle key={`dot${i}`} cx={x(i)} cy={y(p.value)} r={4} fill={SERIES} className="stroke-white dark:stroke-slate-900" strokeWidth={2} />
        ))}
        {last >= 0 && hover === null && (
          <text x={x(last) - 6} y={y(points[last].value!) - 8} textAnchor="end" className="fill-slate-700 text-[10px] dark:fill-slate-300">{fmt(points[last].value!)}</text>
        )}
        {hover !== null && <Tooltip x={x(hover)} y={y(points[hover].value ?? lo)} point={points[hover]} unit={unit} />}
      </svg>
    </Frame>
  );
}

/** A bar of progress toward a target, with the numbers beside it. */
export function TargetBar({ label, consumed, target, unit }: { label: string; consumed: number; target: number; unit: string }) {
  const pct = target > 0 ? Math.min(100, (consumed / target) * 100) : 0;
  const over = consumed > target * 1.05;
  return (
    <div className="mb-3">
      <div className="mb-1 flex text-sm">
        <span className="mr-auto">{label}</span>
        <span className="text-slate-500">
          {fmt(consumed)} / {fmt(target)} {unit}
          {over && <span className="ml-1 text-red-600">· {fmt(consumed - target)} acima</span>}
        </span>
      </div>
      <div className="h-2 rounded-full bg-slate-100 dark:bg-slate-800">
        <div className="h-2 rounded-full" style={{ width: `${pct}%`, background: over ? '#dc2626' : SERIES }} />
      </div>
    </div>
  );
}
