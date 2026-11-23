import { useId, useState, type ReactNode } from 'react';
import { num } from '../lib/format';
import {
  donutSlices, hasChartData, nextChartIndex, seriesDelta, smoothSvgPath,
  type ChartPoint, type DonutInput,
} from '../lib/charts';
import type { OverallHeatCell } from '../lib/habits';

// SVG data visualizations built on the theme's tokens. Crisp hairline grids,
// mono tabular figures, hover/tap/keyboard inspection, smooth curves, donut
// breakdowns, progress rings, sparklines, segmented meters and heatmaps.

export type Point = ChartPoint;

const ACCENT = 'var(--brand)';
const NEUTRAL = 'var(--chart-neutral)';
const PAD = { top: 24, right: 28, bottom: 28, left: 60 };

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

export function DeltaBadge({ pct, diff, unit, invert = false, context }: { pct: number | null; diff: number; unit?: string; invert?: boolean; context?: string }) {
  if (diff === 0 && pct === 0) {
    return <span className="figure text-xs text-fg3">0%{context ? ` ${context}` : ''}</span>;
  }
  const good = invert ? diff < 0 : diff > 0;
  const cls = good ? 'text-positive' : 'text-negative';
  const sign = diff > 0 ? '+' : '−';
  const text = pct !== null
    ? `${sign}${num(Math.abs(pct), 1)}%`
    : `${sign}${fmt(Math.abs(diff))}${unit ? ` ${unit}` : ''}`;
  return (
    <span className={`figure text-xs font-medium ${cls}`}>
      {text}
      {context && <span className="font-normal text-fg3"> {context}</span>}
    </span>
  );
}

export function ChartFrame({ title, subtitle, points, unit, children, aside, badge, emptyText = 'Sem registros neste período' }: {
  title: string; subtitle?: string; points: Point[]; unit: string; children: ReactNode; aside?: ReactNode; badge?: ReactNode; emptyText?: string;
}) {
  const [table, setTable] = useState(false);
  const populated = hasChartData(points);
  return (
    <figure className="card">
      <figcaption className="mb-4 flex flex-wrap items-start gap-3">
        <div className="mr-auto min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium">{title}</span>
            {badge}
          </div>
          {subtitle && <div className="mt-0.5 text-[13px] leading-5 text-fg3">{subtitle}</div>}
        </div>
        {aside}
        {populated && (
          <button
            type="button"
            aria-pressed={table}
            className="rounded-lg px-2.5 py-1 text-[13px] font-medium text-fg2 transition-colors duration-150 hover:bg-raised hover:text-fg"
            onClick={() => setTable(!table)}
          >
            {table ? 'Ver gráfico' : 'Ver tabela'}
          </button>
        )}
      </figcaption>
      {!populated ? (
        <div className="flex min-h-[140px] items-center justify-center rounded-[14px] bg-raised/50 px-4 py-8 text-center text-sm text-fg3">
          {emptyText}
        </div>
      ) : table ? (
        <table className="w-full text-sm">
          <tbody>
            {points.map((p, idx) => (
              <tr key={`${p.label}-${idx}`} className="border-t border-line">
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
      {ticks.map((t, i) => (
        <g key={`${t}-${i}`}>
          <line x1={PAD.left} x2={w - PAD.right} y1={y(t)} y2={y(t)} className="stroke-line" strokeDasharray={i === 0 ? undefined : '3 3'} strokeWidth={1} />
          <text x={PAD.left - 8} y={y(t) + 4} textAnchor="end" className="fill-fg3 font-mono text-[11px]">{fmt(t)}</text>
        </g>
      ))}
      <text x={PAD.left - 8} y={PAD.top - 9} textAnchor="end" className="fill-fg3 font-mono text-[11px]">{unit}</text>
    </g>
  );
}

function Tooltip({ x, y, w, point, unit }: { x: number; y: number; w: number; point: Point; unit: string }) {
  const text = `${point.label}: ${point.value === null ? 'sem dado' : `${fmt(point.value)} ${unit}`}${point.detail ? ` · ${point.detail}` : ''}`;
  const tw = Math.min(320, text.length * 6.4 + 24);
  const left = Math.min(Math.max(x - tw / 2, 4), w - tw - 4);
  const top = Math.max(2, y - 36);
  return (
    <g pointerEvents="none">
      <rect x={left} y={top} width={tw} height={26} rx={8} className="fill-surface stroke-line-strong" strokeWidth={1} />
      <text x={left + 12} y={top + 17} className="fill-fg text-[11px] font-medium">{text}</text>
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
  const bar = Math.min(26, Math.max(4, band - 5));
  const y = (v: number) => PAD.top + (H - PAD.top - PAD.bottom) * (1 - v / max);
  const base = y(0);
  const lastIdx = lastIndex(points, (p) => p.value !== null && p.value > 0);
  const labelEvery = points.length > 16 ? 2 : 1;
  return (
    <ChartFrame title={title} subtitle={subtitle} points={points} unit={unit} aside={aside}>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-brand"
        role="img"
        tabIndex={0}
        aria-label={`${title}. Use as setas esquerda e direita para inspecionar os valores.`}
        onMouseLeave={() => setHover(null)}
        onBlur={() => setHover(null)}
        onKeyDown={(e) => {
          const next = nextChartIndex(hover, points.length, e.key);
          if (next !== hover) { e.preventDefault(); setHover(next); }
        }}
      >
        <Grid ticks={[0, max / 2, max]} y={y} w={W} unit={unit} />
        {points.map((p, i) => {
          const cx = PAD.left + band * i + band / 2;
          const v = p.value ?? 0;
          const top = y(v);
          const h = Math.max(0, base - top);
          const r = Math.min(6, h, bar / 2);
          const lead = highlight !== undefined ? i === highlight : highlightLast ? i === points.length - 1 : i === lastIdx;
          const showLabel = i % labelEvery === 0 || i === points.length - 1 || i === hover;
          return (
            <g key={p.label + i} onMouseEnter={() => setHover(i)} onClick={() => setHover((cur) => (cur === i ? null : i))} className="cursor-pointer">
              <rect x={cx - band / 2} y={PAD.top} width={band} height={H - PAD.top - PAD.bottom} fill="transparent" />
              {h > 0 && (
                <path
                  d={`M${cx - bar / 2},${base} V${top + r} Q${cx - bar / 2},${top} ${cx - bar / 2 + r},${top} H${cx + bar / 2 - r} Q${cx + bar / 2},${top} ${cx + bar / 2},${top + r} V${base} Z`}
                  fill={lead || hover === i ? ACCENT : NEUTRAL}
                  className="transition-opacity duration-150"
                  opacity={hover === null || hover === i ? 1 : 0.45}
                />
              )}
              {showLabel && <text x={cx} y={H - 10} textAnchor="middle" className="fill-fg3 font-mono text-[11px]">{p.label}</text>}
              {i === lastIdx && hover === null && <text x={cx} y={top - 7} textAnchor="middle" className="fill-fg2 font-mono text-[11px]">{fmt(v)}</text>}
            </g>
          );
        })}
        {hover !== null && <Tooltip x={PAD.left + band * hover + band / 2} y={y(points[hover].value ?? 0)} w={W} point={points[hover]} unit={unit} />}
      </svg>
    </ChartFrame>
  );
}

/** Smooth area chart with subtle vertical wash, crosshair, and contextual period delta. */
export function AreaChart({ title, subtitle, points, unit, minZero = true, height = 240, aside, tone = ACCENT, showDelta = true, invertDelta = false, deltaContext, emptyText }: {
  title: string; subtitle?: string; points: Point[]; unit: string; minZero?: boolean; height?: number; aside?: ReactNode;
  tone?: string; showDelta?: boolean; invertDelta?: boolean; deltaContext?: string; emptyText?: string;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const gradId = useId().replace(/:/g, '');
  const W = 640;
  const H = height;
  const values = points.map((p) => p.value).filter((v): v is number => v !== null);
  const rawMin = values.length ? Math.min(...values) : 0;
  const rawMax = values.length ? Math.max(...values) : 1;
  const flat = values.length > 0 && rawMax === rawMin;
  const flatPad = Math.max(2, Math.round(Math.abs(rawMax) * 0.1));
  const lo = minZero
    ? Math.min(0, Math.floor(rawMin))
    : flat
      ? Math.max(0, Math.floor(rawMin - flatPad))
      : Math.floor(rawMin - Math.max(1, (rawMax - rawMin) * 0.15));
  const hi = !values.length
    ? 1
    : flat
      ? (minZero ? niceMax(Math.max(1, rawMax * 1.25 - lo)) + lo : Math.ceil(rawMax + flatPad))
      : niceMax(Math.max(1, rawMax - lo)) + lo;
  const plotW = W - PAD.left - PAD.right;
  const step = points.length > 1 ? plotW / (points.length - 1) : 0;
  const x = (i: number) => PAD.left + (points.length > 1 ? step * i : plotW / 2);
  const y = (v: number) => PAD.top + (H - PAD.top - PAD.bottom) * (1 - (v - lo) / (hi - lo || 1));
  const base = H - PAD.bottom;

  // Build smooth path per contiguous run of non-null points
  const segments: { x: number; y: number }[][] = [];
  let curSeg: { x: number; y: number }[] = [];
  points.forEach((p, i) => {
    if (p.value === null) {
      if (curSeg.length) { segments.push(curSeg); curSeg = []; }
      return;
    }
    curSeg.push({ x: x(i), y: y(p.value) });
  });
  if (curSeg.length) segments.push(curSeg);

  const last = lastIndex(points, (p) => p.value !== null);
  const delta = showDelta ? seriesDelta(points) : null;
  const labelStride = points.length > 10 ? Math.ceil(points.length / 7) : 1;

  return (
    <ChartFrame
      title={title}
      subtitle={subtitle}
      points={points}
      unit={unit}
      aside={aside}
      emptyText={emptyText}
      badge={delta && <DeltaBadge pct={delta.pct} diff={delta.diff} unit={unit} invert={invertDelta} context={deltaContext} />}
    >
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full rounded-[8px] outline-none focus-visible:ring-2 focus-visible:ring-brand"
        role="img"
        tabIndex={0}
        aria-label={`${title}. Use as setas esquerda e direita para inspecionar os valores.`}
        onMouseLeave={() => setHover(null)}
        onBlur={() => setHover(null)}
        onKeyDown={(e) => {
          const next = nextChartIndex(hover, points.length, e.key);
          if (next !== hover) { e.preventDefault(); setHover(next); }
        }}
      >
        <defs>
          <linearGradient id={`area-${gradId}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={tone} stopOpacity="0.18" />
            <stop offset="100%" stopColor={tone} stopOpacity="0.01" />
          </linearGradient>
        </defs>
        <Grid ticks={[lo, Math.round(lo + (hi - lo) / 2), hi]} y={y} w={W} unit={unit} />
        {segments.map((seg, sIdx) => {
          const linePath = smoothSvgPath(seg, 0.18);
          const areaPath = seg.length > 1
            ? `${linePath} L${seg[seg.length - 1].x.toFixed(1)},${base.toFixed(1)} L${seg[0].x.toFixed(1)},${base.toFixed(1)} Z`
            : '';
          return (
            <g key={sIdx}>
              {areaPath && <path d={areaPath} fill={`url(#area-${gradId})`} />}
              <path d={linePath} fill="none" stroke={tone} strokeWidth={2.25} strokeLinejoin="round" strokeLinecap="round" />
            </g>
          );
        })}
        {points.map((p, i) => (
          <g key={p.label + i} onMouseEnter={() => setHover(i)} onClick={() => setHover((cur) => (cur === i ? null : i))} className="cursor-pointer">
            <rect x={x(i) - Math.max(step, 18) / 2} y={PAD.top} width={Math.max(step, 18)} height={H - PAD.top - PAD.bottom} fill="transparent" />
            {(i === 0 || i === points.length - 1 || i % labelStride === 0) && (
              <text x={x(i)} y={H - 10} textAnchor={i === points.length - 1 ? 'end' : i === 0 ? 'start' : 'middle'} className="fill-fg3 font-mono text-[11px]">{p.label}</text>
            )}
          </g>
        ))}
        {hover !== null && points[hover].value !== null && (
          <line x1={x(hover)} x2={x(hover)} y1={PAD.top} y2={base} className="stroke-line-strong" strokeDasharray="3 3" strokeWidth={1} />
        )}
        {points.map((p, i) => p.value !== null && (i === last || i === hover) && (
          <g key={`dot${i}`}>
            <circle cx={x(i)} cy={y(p.value)} r={7} fill={tone} fillOpacity={0.18} />
            <circle cx={x(i)} cy={y(p.value)} r={4} fill={tone} className="stroke-surface" strokeWidth={2} />
          </g>
        ))}
        {last >= 0 && hover === null && (
          <text x={x(last) - 8} y={Math.max(PAD.top + 8, y(points[last].value!) - 11)} textAnchor="end" className="fill-fg font-mono text-[11px] font-medium">{fmt(points[last].value!)}</text>
        )}
        {hover !== null && <Tooltip x={x(hover)} y={y(points[hover].value ?? lo)} w={W} point={points[hover]} unit={unit} />}
      </svg>
    </ChartFrame>
  );
}

export function LineChart({ title, subtitle, points, unit, minZero = true, height = 220, aside }: {
  title: string; subtitle?: string; points: Point[]; unit: string; minZero?: boolean; height?: number; aside?: ReactNode;
}) {
  return <AreaChart title={title} subtitle={subtitle} points={points} unit={unit} minZero={minZero} height={height} aside={aside} showDelta={false} />;
}

/** Interactive donut chart with centered live readout and tabular legend. */
export function DonutChart({ title, subtitle, rows, format = num, unit = '', centerLabel = 'Total', maxSlices = 5, size = 164, emptyText = 'Sem dados no período', bare = false, aside }: {
  title?: string; subtitle?: string; rows: readonly DonutInput[]; format?: (n: number) => string; unit?: string;
  centerLabel?: string; maxSlices?: number; size?: number; emptyText?: string; bare?: boolean; aside?: ReactNode;
}) {
  const [active, setActive] = useState<number | null>(null);
  const slices = donutSlices(rows, maxSlices);
  const total = slices.reduce((s, x) => s + x.value, 0);
  const r = 60;
  const stroke = 14;
  const C = 2 * Math.PI * r;
  const gap = slices.length > 1 ? 3 : 0;

  let offset = 0;
  const arcs = slices.map((s) => {
    const segLen = Math.max(0, s.share * C - gap);
    const arc = { slice: s, segLen, offset };
    offset += s.share * C;
    return arc;
  });

  const focused = active !== null ? slices[active] : null;
  const centerValue = focused ? format(focused.value) : format(total);
  const centerSub = focused ? `${focused.label} · ${num(focused.pct, 1)}%` : centerLabel;

  const content = (
    <>
      {title && (
        <div className="mb-4 flex flex-wrap items-start gap-2">
          <div className="mr-auto min-w-0">
            <div className="font-medium">{title}</div>
            {subtitle && <div className="mt-0.5 text-[13px] leading-5 text-fg3">{subtitle}</div>}
          </div>
          {aside}
        </div>
      )}
      {!slices.length ? (
        <div className="flex min-h-[140px] items-center justify-center rounded-[14px] bg-raised/50 px-4 py-8 text-center text-sm text-fg3">
          {emptyText}
        </div>
      ) : (
        <div className="flex flex-col items-center gap-5 sm:flex-row sm:items-center">
          <div className="relative shrink-0" style={{ width: size, height: size }}>
            <svg viewBox="0 0 156 156" className="h-full w-full -rotate-90" role="img" aria-label={title ?? 'Distribuição'}>
              <circle cx="78" cy="78" r={r} fill="none" stroke="var(--raised)" strokeWidth={stroke} />
              {arcs.map(({ slice, segLen, offset: arcOffset }, i) => (
                <circle
                  key={slice.label}
                  cx="78"
                  cy="78"
                  r={r}
                  fill="none"
                  stroke={slice.color}
                  strokeWidth={active === i ? stroke + 3 : stroke}
                  strokeDasharray={`${segLen} ${C}`}
                  strokeDashoffset={-arcOffset}
                  strokeLinecap="butt"
                  className="cursor-pointer transition-opacity duration-150"
                  opacity={active === null || active === i ? 1 : 0.35}
                  onMouseEnter={() => setActive(i)}
                  onMouseLeave={() => setActive(null)}
                  onClick={() => setActive((cur) => (cur === i ? null : i))}
                />
              ))}
            </svg>
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center px-6 text-center">
              <span className={`figure max-w-full truncate leading-tight font-semibold text-fg ${size < 156 ? 'text-[12px]' : 'text-[14px]'}`}>
                {centerValue}{unit ? ` ${unit}` : ''}
              </span>
              <span className="mt-0.5 max-w-full truncate text-[10px] leading-4 text-fg3">{centerSub}</span>
            </div>
          </div>

          <ul className="w-full min-w-0 flex-1 space-y-2">
            {slices.map((s, i) => (
              <li key={s.label}>
                <button
                  type="button"
                  onMouseEnter={() => setActive(i)}
                  onMouseLeave={() => setActive(null)}
                  onClick={() => setActive((cur) => (cur === i ? null : i))}
                  className={`flex w-full items-center gap-2.5 rounded-lg px-2 py-1 text-left text-sm transition-colors ${active === i ? 'bg-raised' : 'hover:bg-raised/50'}`}
                >
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: s.color }} aria-hidden="true" />
                  <span className="min-w-0 flex-1 truncate text-fg2">{s.label}</span>
                  <span className="figure shrink-0 text-xs font-medium text-fg">{format(s.value)}{unit ? ` ${unit}` : ''}</span>
                  <span className="figure w-11 shrink-0 text-right text-xs text-fg3">{num(s.pct, 0)}%</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  );

  return bare ? <div className="min-w-0">{content}</div> : <section className="card min-w-0">{content}</section>;
}

/** Compact circular progress ring for daily execution, macros, projects, and goals. */
export function ProgressRing({ pct, size = 56, strokeWidth = 5, tone = ACCENT, label, sublabel, track = 'var(--raised)' }: {
  pct: number; size?: number; strokeWidth?: number; tone?: string; label?: ReactNode; sublabel?: string; track?: string;
}) {
  const clamped = Math.max(0, Math.min(100, Number.isFinite(pct) ? pct : 0));
  const r = (size - strokeWidth) / 2;
  const C = 2 * Math.PI * r;
  const dash = (clamped / 100) * C;
  return (
    <div className="relative inline-flex shrink-0 items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90" aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={track} strokeWidth={strokeWidth} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={tone}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={`${dash} ${C}`}
          className="transition-[stroke-dasharray] duration-500 ease-out"
        />
      </svg>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
        <span className={`figure leading-none font-semibold ${size >= 76 ? 'text-[15px]' : size >= 54 ? 'text-[12px]' : 'text-[10px]'}`}>
          {label ?? `${Math.round(clamped)}%`}
        </span>
        {sublabel && <span className="mt-0.5 text-[9px] leading-none text-fg3">{sublabel}</span>}
      </div>
    </div>
  );
}

/** Inline mini sparkline for KPI bento cards. */
export function Sparkline({ values, width = 92, height = 32, tone = ACCENT }: {
  values: readonly number[]; width?: number; height?: number; tone?: string;
}) {
  const id = useId().replace(/:/g, '');
  if (values.length < 2) return null;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const pad = 4;
  const coords = values.map((v, i) => ({
    x: pad + ((width - pad * 2) * i) / (values.length - 1),
    y: pad + (height - pad * 2) * (1 - (v - min) / span),
  }));
  const line = smoothSvgPath(coords, 0.2);
  const last = coords[coords.length - 1];
  const area = `${line} L${last.x.toFixed(1)},${height} L${coords[0].x.toFixed(1)},${height} Z`;
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="shrink-0 overflow-visible" aria-hidden="true">
      <defs>
        <linearGradient id={`spk-${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={tone} stopOpacity="0.28" />
          <stop offset="100%" stopColor={tone} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#spk-${id})`} />
      <path d={line} fill="none" stroke={tone} strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={last.x} cy={last.y} r={2.5} fill={tone} />
    </svg>
  );
}

/** Segmented block score bar inspired by fintech score gauges (e.g. savings rate / consistency). */
export function SegmentedMeter({ pct, segments = 16, tone = ACCENT, height = 14, label }: {
  pct: number; segments?: number; tone?: string; height?: number; label?: string;
}) {
  const clamped = Math.max(0, Math.min(100, Number.isFinite(pct) ? pct : 0));
  const filled = Math.round((clamped / 100) * segments);
  return (
    <div
      className="flex w-full items-center gap-[3px]"
      role="progressbar"
      aria-valuenow={Math.round(clamped)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label ?? 'Progresso'}
    >
      {Array.from({ length: segments }, (_, i) => (
        <span
          key={i}
          className="flex-1 rounded-[3px] transition-colors duration-300"
          style={{
            height,
            background: i < filled ? tone : 'var(--raised)',
          }}
        />
      ))}
    </div>
  );
}

const HEAT_BG: Record<0 | 1 | 2 | 3 | 4, string> = {
  0: 'var(--raised)',
  1: 'color-mix(in srgb, var(--brand) 24%, var(--raised))',
  2: 'color-mix(in srgb, var(--brand) 48%, var(--raised))',
  3: 'color-mix(in srgb, var(--brand) 74%, var(--raised))',
  4: 'var(--brand)',
};
const HEAT_DAYS = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];

/** 12-week habit consistency heatmap with interactive cell inspection. */
export function ActivityHeatmap({ weeks, title = 'Mapa de constância', subtitle }: {
  weeks: OverallHeatCell[][]; title?: string; subtitle?: string;
}) {
  const [selected, setSelected] = useState<OverallHeatCell | null>(null);
  const totalDays = weeks.flat().filter((c) => !c.future && c.due > 0);
  const perfectDays = totalDays.filter((c) => c.level === 4).length;

  return (
    <section className="card min-w-0">
      <div className="mb-4 flex flex-wrap items-start gap-2">
        <div className="mr-auto">
          <div className="font-medium">{title}</div>
          <div className="mt-0.5 text-[13px] text-fg3">
            {selected
              ? `${selected.day.slice(8)}/${selected.day.slice(5, 7)} · ${selected.due > 0 ? `${selected.done} de ${selected.due} hábitos` : 'sem hábitos programados'}`
              : subtitle ?? `${perfectDays} ${perfectDays === 1 ? 'dia perfeito' : 'dias perfeitos'} nas últimas ${weeks.length} semanas`}
          </div>
        </div>
        <div className="flex items-center gap-1.5 text-[11px] text-fg3" aria-hidden="true">
          <span>Menos</span>
          {([0, 1, 2, 3, 4] as const).map((lvl) => (
            <span key={lvl} className="h-3 w-3 rounded-[3px]" style={{ background: HEAT_BG[lvl] }} />
          ))}
          <span>Mais</span>
        </div>
      </div>

      <div className="overflow-x-auto pb-1">
        <div className="flex w-full min-w-[260px] items-start gap-1.5 sm:gap-2">
          <div className="grid shrink-0 grid-rows-7 gap-1 pt-0.5 text-[10px] text-fg3 select-none sm:gap-1.5" aria-hidden="true">
            {HEAT_DAYS.map((d, i) => (
              <span key={i} className="flex h-3 items-center sm:h-3.5">{i % 2 === 1 ? d : ''}</span>
            ))}
          </div>
          <div className="grid min-w-0 flex-1 gap-1 sm:gap-1.5" style={{ gridTemplateColumns: `repeat(${weeks.length}, minmax(0, 1fr))` }}>
            {weeks.map((week, wi) => (
              <div key={wi} className="grid grid-rows-7 gap-1 sm:gap-1.5">
                {week.map((cell) => (
                  <button
                    key={cell.day}
                    type="button"
                    disabled={cell.future}
                    onMouseEnter={() => !cell.future && setSelected(cell)}
                    onMouseLeave={() => setSelected(null)}
                    onFocus={() => !cell.future && setSelected(cell)}
                    onBlur={() => setSelected(null)}
                    aria-label={`${cell.day}: ${cell.done} de ${cell.due} hábitos`}
                    className={`h-3 w-full rounded-[3px] transition-transform duration-150 sm:h-3.5 sm:rounded-[4px] ${cell.future ? 'opacity-20' : 'hover:scale-110 focus-visible:ring-2 focus-visible:ring-brand'}`}
                    style={{ background: HEAT_BG[cell.level] }}
                  />
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
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
      <div className="h-1.5 rounded-full bg-raised">
        <div className="h-1.5 rounded-full transition-[width] duration-300" style={{ width: `${pct}%`, background: over ? 'var(--negative)' : ACCENT }} />
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
            <span className="mr-auto truncate pr-2">{r.label}</span>
            <span className="figure shrink-0 text-fg2">{format(r.value)}{unit ? ` ${unit}` : ''}</span>
          </div>
          <div className="h-1.5 rounded-full bg-raised"><div className="h-1.5 rounded-full" style={{ width: `${(r.value / max) * 100}%`, background: i === 0 ? ACCENT : NEUTRAL }} /></div>
          {r.detail && <div className="figure mt-1 text-xs text-fg3">{r.detail}</div>}
        </li>
      ))}
    </ul>
  );
}

