import { useCallback, useEffect, useMemo, useState } from "react";
import { CalendarRange, ChevronDown, ChevronsDownUp, ChevronsUpDown } from "lucide-react";
import { Link } from "react-router-dom";
import { useAuth } from "@/auth/AuthProvider";
import { useI18n } from "@/i18n";
import { supabase } from "@/lib/supabase";
import { addDays, formatCivilDate, operationalDay } from "@/lib/time";
import { Skeleton } from "./Skeleton";

export type LodgeStats = {
  lodge_id: string; beds_total: number; out_of_use: number; occupied: number; present?: number; out_pending: number; seen_today: number;
  checks_done: number; checks_total: number; rounds_done: number; absences_now: number;
};
export type DayPoint = { day: string; admissions: number; outs: number; no_shows: number; maintenance: number; occupied: number };
export type Totals = { admissions: number; outs: number; no_shows: number; maintenance: number; avg_occupancy: number };
export type Dashboard = { lodges: LodgeStats[]; series: DayPoint[]; totals?: Totals; period?: { from: string; to: string }; maintenance_open: { urgent: number; normal: number; low: number; overdue: number } };

/** Percentual inteiro, sem dividir por zero. */
export function pct(part: number, total: number): number {
  return total > 0 ? Math.round((part / total) * 100) : 0;
}

/** Caminho SVG de uma linha simples (x de 0..w, y invertido de 0..h) para a série. */
export function linePath(values: number[], w: number, h: number, min = Math.min(...values), max = Math.max(...values)): string {
  if (values.length === 0) return "";
  const span = max - min || 1;
  const step = values.length > 1 ? w / (values.length - 1) : 0;
  return values.map((v, i) => `${i === 0 ? "M" : "L"}${(i * step).toFixed(1)},${(h - ((v - min) / span) * h).toFixed(1)}`).join(" ");
}

function Ring({ value, label }: { value: number; label: string }) {
  const r = 26;
  const c = 2 * Math.PI * r;
  return (
    <svg className="ring" viewBox="0 0 64 64" role="img" aria-label={label}>
      <circle cx="32" cy="32" r={r} className="ring-track" />
      <circle cx="32" cy="32" r={r} className="ring-value" strokeDasharray={`${(value / 100) * c} ${c}`} transform="rotate(-90 32 32)" />
      <text x="32" y="36" textAnchor="middle" className="ring-text">{value}%</text>
    </svg>
  );
}

/* ---------- período e cartões recolhíveis (preferências guardadas no navegador) ---------- */
export type PeriodKind = "7" | "14" | "30" | "90" | "custom";
export type Period = { kind: PeriodKind; from: string; to: string };
const PERIOD_KEY = "home.period", COLLAPSE_KEY = "home.collapsed";
const PRESETS: PeriodKind[] = ["7", "14", "30", "90"];

/** Intervalo de um período pré-definido terminando em `today` (dia operacional). */
export function presetRange(kind: Exclude<PeriodKind, "custom">, today: string): { from: string; to: string } {
  return { from: addDays(today, -(Number(kind) - 1)), to: today };
}
/** Período válido: início ≤ fim e no máximo 366 dias. */
export function validPeriod(from: string, to: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to) || to < from) return false;
  return (Date.parse(to) - Date.parse(from)) / 86_400_000 <= 365;
}
function readJson<T>(key: string, fallback: T): T {
  try { const v = window.localStorage.getItem(key); return v ? (JSON.parse(v) as T) : fallback; } catch { return fallback; }
}
function writeJson(key: string, value: unknown): void {
  try { window.localStorage.setItem(key, JSON.stringify(value)); } catch { /* armazenamento indisponível */ }
}

function PeriodFilter({ value, today, onChange }: { value: Period; today: string; onChange: (p: Period) => void }) {
  const { t, locale } = useI18n();
  const [open, setOpen] = useState(false);
  const [from, setFrom] = useState(value.from);
  const [to, setTo] = useState(value.to);
  const ok = validPeriod(from, to);
  return (
    <div className="period-filter" role="group" aria-label={t("home.period")}>
      {PRESETS.map((k) => (
        <button key={k} type="button" className={value.kind === k ? "selected" : ""} aria-pressed={value.kind === k}
          onClick={() => { setOpen(false); onChange({ kind: k, ...presetRange(k as "7", today) }); }}>{t(`home.p${k}` as "home.p7")}</button>
      ))}
      <button type="button" className={value.kind === "custom" ? "selected" : ""} aria-pressed={value.kind === "custom"} aria-expanded={open}
        aria-label={t("home.pCustom")} title={value.kind === "custom" ? `${formatCivilDate(value.from, locale)} → ${formatCivilDate(value.to, locale)}` : t("home.pCustom")}
        onClick={() => { setFrom(value.from); setTo(value.to); setOpen((o) => !o); }}><CalendarRange size={15} aria-hidden="true" /></button>
      {open && (
        <form className="period-pop" onSubmit={(e) => { e.preventDefault(); if (ok) { onChange({ kind: "custom", from, to }); setOpen(false); } }}>
          <label>{t("home.pFrom")}<input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} /></label>
          <label>{t("home.pTo")}<input type="date" value={to} min={from} max={today} onChange={(e) => setTo(e.target.value)} /></label>
          <button type="submit" className="primary small" disabled={!ok}>{t("home.pApply")}</button>
          {!ok && <small className="warn-text">{t("home.pInvalid")}</small>}
        </form>
      )}
    </div>
  );
}

/** Cartão do painel: pode ser recolhido; recolhido mostra uma linha com os números principais. */
function DashCard({ id, title, summary, collapsed, onToggle, children }: { id: string; title: string; summary: React.ReactNode; collapsed: boolean; onToggle: (id: string) => void; children: React.ReactNode }) {
  const { t } = useI18n();
  return (
    <article className={`dash-card${collapsed ? " is-collapsed" : ""}`}>
      <header className="dash-card-head">
        <span className="eyebrow mono">{title}</span>
        <button type="button" className="dash-toggle" aria-expanded={!collapsed} aria-label={t(collapsed ? "home.expand" : "home.collapse", { title })} onClick={() => onToggle(id)}>
          <ChevronDown size={16} aria-hidden="true" />
        </button>
      </header>
      {collapsed ? <p className="dash-summary mono">{summary}</p> : children}
    </article>
  );
}

/** Home: painéis com dados da própria plataforma — ocupação, Seen, checks, movimento e manutenção; período à escolha. */
export function HomeDashboard() {
  const { t, locale } = useI18n();
  const { lodges, serverOffsetMs = 0 } = useAuth();
  const today = operationalDay(new Date(Date.now() + serverOffsetMs));
  const [period, setPeriod] = useState<Period>(() => {
    const saved = readJson<Period | null>(PERIOD_KEY, null);
    if (saved && saved.kind === "custom" && validPeriod(saved.from, saved.to)) return saved;
    const kind = saved && PRESETS.includes(saved.kind) ? saved.kind : "14";
    return { kind, ...presetRange(kind as "14", today) };
  });
  const [collapsed, setCollapsed] = useState<string[]>(() => readJson<string[]>(COLLAPSE_KEY, []));
  const [data, setData] = useState<Dashboard | null>(null);
  const change = (p: Period) => { setPeriod(p); writeJson(PERIOD_KEY, p); };
  const toggle = useCallback((id: string) => setCollapsed((c) => { const n = c.includes(id) ? c.filter((x) => x !== id) : [...c, id]; writeJson(COLLAPSE_KEY, n); return n; }), []);

  // Presets terminam sempre em hoje; o personalizado fica como foi escolhido.
  const range = useMemo(() => (period.kind === "custom" ? { from: period.from, to: period.to } : presetRange(period.kind, today)), [period, today]);
  useEffect(() => {
    const load = () => void supabase.rpc("home_dashboard", { p_from: range.from, p_to: range.to }).then(({ data: d }) => d && setData(d as Dashboard));
    load();
    const id = window.setInterval(load, 120_000);
    return () => window.clearInterval(id);
  }, [range.from, range.to]);

  if (!data) return <div className="card"><Skeleton rows={4} label={t("app.loading")} /></div>;
  const name = (id: string) => lodges.find((l) => l.id === id)?.name ?? "";
  const series = data.series;
  const occ = series.map((p) => p.occupied);
  const maxBar = Math.max(1, ...series.map((p) => Math.max(p.admissions, p.outs)));
  const label = period.kind === "custom" ? `${formatCivilDate(range.from, locale).slice(0, 5)}–${formatCivilDate(range.to, locale).slice(0, 5)}` : t("home.lastDays", { n: period.kind });
  const totals = data.totals ?? { admissions: series.reduce((s, p) => s + p.admissions, 0), outs: series.reduce((s, p) => s + p.outs, 0), no_shows: series.reduce((s, p) => s + p.no_shows, 0), maintenance: 0, avg_occupancy: 0 };
  const allIds = [...data.lodges.map((l) => "house:" + l.lodge_id), "maint", "occ", "move"];
  const allCollapsed = allIds.every((i) => collapsed.includes(i));
  const setAll = (on: boolean) => { const n = on ? allIds : []; setCollapsed(n); writeJson(COLLAPSE_KEY, n); };
  const has = (id: string) => collapsed.includes(id);

  return (
    <section className="dash" aria-label={t("home.dashboard")}>
      <div className="dash-bar">
        <PeriodFilter value={period} today={today} onChange={change} />
        <button type="button" className="dash-all" onClick={() => setAll(!allCollapsed)} aria-label={t(allCollapsed ? "home.expandAll" : "home.collapseAll")} title={t(allCollapsed ? "home.expandAll" : "home.collapseAll")}>
          {allCollapsed ? <ChevronsUpDown size={16} aria-hidden="true" /> : <ChevronsDownUp size={16} aria-hidden="true" />}
        </button>
      </div>
      <div className="dash-houses">
        {data.lodges.map((l) => {
          const free = Math.max(0, l.beds_total - l.occupied - l.out_of_use);
          const present = l.present ?? l.occupied;
          const seenPct = pct(l.seen_today, present);
          return (
            <DashCard key={l.lodge_id} id={"house:" + l.lodge_id} title={name(l.lodge_id)} collapsed={has("house:" + l.lodge_id)} onToggle={toggle}
              summary={`${l.occupied}/${l.beds_total} ${t("home.beds")} · ${seenPct}% ${t("home.seenShort")} · ${l.checks_done}/${l.checks_total} ${t("home.checks")}`}>
              <div className="dash-occ">
                <div>
                  <span className="big-number">{l.occupied}</span><span className="muted"> / {l.beds_total} {t("home.beds")}</span>
                  <div className="stack" aria-hidden="true">
                    <span className="stack-occ" style={{ width: `${pct(l.occupied, l.beds_total)}%` }} />
                    <span className="stack-off" style={{ width: `${pct(l.out_of_use, l.beds_total)}%` }} />
                  </div>
                  <span className="small-text muted">{t("home.occLegend", { free, off: l.out_of_use, out: l.out_pending })}</span>
                </div>
                <Ring value={seenPct} label={t("home.seenToday")} />
              </div>
              <dl className="dash-kpis">
                <div><dt>{t("home.seenToday")}</dt><dd className="mono">{l.seen_today}/{present}</dd></div>
                <div><dt>{t("home.checks")}</dt><dd className="mono">{l.checks_done}/{l.checks_total}</dd></div>
                <div><dt>{t("home.rounds")}</dt><dd className="mono">{l.rounds_done}</dd></div>
                <div><dt>{t("home.away")}</dt><dd className="mono">{l.absences_now}</dd></div>
              </dl>
            </DashCard>
          );
        })}
        <DashCard id="maint" title={t("home.maintenance")} collapsed={has("maint")} onToggle={toggle}
          summary={`${data.maintenance_open.urgent} ${t("home.p_urgent")} · ${data.maintenance_open.normal} ${t("home.p_normal")} · ${data.maintenance_open.low} ${t("home.p_low")}${data.maintenance_open.overdue > 0 ? ` · ${t("home.overdue", { n: data.maintenance_open.overdue })}` : ""}`}>
          <div className="dash-maint">
            {(["urgent", "normal", "low"] as const).map((k) => (
              <Link key={k} to="/maintenance" className={`maint-${k}`}><span className="big-number">{data.maintenance_open[k]}</span><span className="small-text">{t(`home.p_${k}`)}</span></Link>
            ))}
          </div>
          {data.maintenance_open.overdue > 0 && <p className="warn-text small-text">{t("home.overdue", { n: data.maintenance_open.overdue })}</p>}
        </DashCard>
      </div>

      <div className="dash-charts">
        <DashCard id="occ" title={`${t("home.occupancy")} · ${label}`} collapsed={has("occ")} onToggle={toggle}
          summary={`${t("home.avg", { n: totals.avg_occupancy })} · ${t("home.range", { min: Math.min(...occ), max: Math.max(...occ) })}`}>
          <div className="dash-chart-head"><span className="mono small-text muted">{t("home.avg", { n: totals.avg_occupancy })} · {t("home.range", { min: Math.min(...occ), max: Math.max(...occ) })}</span></div>
          <div className="linechart">
            <div className="linechart-y mono" aria-hidden="true"><span>{Math.max(...occ)}</span><span>{Math.min(...occ)}</span></div>
            <svg viewBox="0 0 100 40" preserveAspectRatio="none" role="img" aria-label={`${t("home.occupancy")} · ${label}`}>
              <line x1="0" x2="100" y1="2" y2="2" className="chart-grid" vectorEffect="non-scaling-stroke" />
              <line x1="0" x2="100" y1="38" y2="38" className="chart-grid" vectorEffect="non-scaling-stroke" />
              <path d={linePath(occ, 100, 36)} transform="translate(0, 2)" className="line-occ" vectorEffect="non-scaling-stroke" />
            </svg>
          </div>
          <div className="chart-x mono" aria-hidden="true">
            <span>{formatCivilDate(series[0].day, locale).slice(0, 5)}</span>
            <span>{formatCivilDate(series[series.length - 1].day, locale).slice(0, 5)}</span>
          </div>
        </DashCard>

        <DashCard id="move" title={`${t("home.movement")} · ${label}`} collapsed={has("move")} onToggle={toggle}
          summary={`${totals.admissions} ${t("home.admissions")} · ${totals.outs} ${t("home.outs")} · ${totals.no_shows} No Show`}>
          <div className="dash-chart-head"><span className="chart-legend small-text"><i className="lg-in" />{t("home.admissions")} <i className="lg-out" />{t("home.outs")}</span></div>
          <div className="barchart" role="img" aria-label={`${t("home.movement")} · ${label}`}>
            {series.map((p) => (
              <div key={p.day} className="barchart-col" title={`${formatCivilDate(p.day, locale)} · ${p.admissions} / ${p.outs}`}>
                <span className="bar-in" style={{ height: `${(p.admissions / maxBar) * 100}%` }} />
                <span className="bar-out" style={{ height: `${(p.outs / maxBar) * 100}%` }} />
              </div>
            ))}
          </div>
          <div className="chart-x mono" aria-hidden="true">
            <span>{formatCivilDate(series[0].day, locale).slice(0, 5)}</span>
            <span>{formatCivilDate(series[series.length - 1].day, locale).slice(0, 5)}</span>
          </div>
          <p className="small-text muted">{t("home.noShows14", { n: totals.no_shows })}</p>
        </DashCard>
      </div>
    </section>
  );
}
