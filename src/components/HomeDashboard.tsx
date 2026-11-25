import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "@/auth/AuthProvider";
import { useI18n } from "@/i18n";
import { supabase } from "@/lib/supabase";
import { formatCivilDate } from "@/lib/time";
import { Skeleton } from "./Skeleton";

export type LodgeStats = {
  lodge_id: string; beds_total: number; out_of_use: number; occupied: number; out_pending: number; seen_today: number;
  checks_done: number; checks_total: number; rounds_done: number; absences_now: number;
};
export type DayPoint = { day: string; admissions: number; outs: number; no_shows: number; maintenance: number; occupied: number };
export type Dashboard = { lodges: LodgeStats[]; series: DayPoint[]; maintenance_open: { urgent: number; normal: number; low: number; overdue: number } };

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

/** Home (revisão 25/11): painéis com dados da própria plataforma — ocupação, Seen, checks, movimento e manutenção. */
export function HomeDashboard() {
  const { t, locale } = useI18n();
  const { lodges } = useAuth();
  const [data, setData] = useState<Dashboard | null>(null);
  useEffect(() => {
    const load = () => void supabase.rpc("home_dashboard").then(({ data: d }) => d && setData(d as Dashboard));
    load();
    const id = window.setInterval(load, 120_000);
    return () => window.clearInterval(id);
  }, []);

  if (!data) return <div className="card"><Skeleton rows={4} label={t("app.loading")} /></div>;
  const name = (id: string) => lodges.find((l) => l.id === id)?.name ?? "";
  const series = data.series;
  const occ = series.map((p) => p.occupied);
  const maxBar = Math.max(1, ...series.map((p) => Math.max(p.admissions, p.outs)));
  const W = 560;
  const H = 120;
  const step = W / Math.max(1, series.length);

  return (
    <section className="dash" aria-label={t("home.dashboard")}>
      <div className="dash-houses">
        {data.lodges.map((l) => {
          const free = Math.max(0, l.beds_total - l.occupied - l.out_of_use);
          return (
            <article key={l.lodge_id} className="dash-card">
              <header><span className="eyebrow mono">{name(l.lodge_id)}</span></header>
              <div className="dash-occ">
                <div>
                  <span className="big-number">{l.occupied}</span><span className="muted"> / {l.beds_total} {t("home.beds")}</span>
                  <div className="stack" aria-hidden="true">
                    <span className="stack-occ" style={{ width: `${pct(l.occupied, l.beds_total)}%` }} />
                    <span className="stack-off" style={{ width: `${pct(l.out_of_use, l.beds_total)}%` }} />
                  </div>
                  <span className="small-text muted">{t("home.occLegend", { free, off: l.out_of_use, out: l.out_pending })}</span>
                </div>
                <Ring value={pct(l.seen_today, l.occupied)} label={t("home.seenToday")} />
              </div>
              <dl className="dash-kpis">
                <div><dt>{t("home.seenToday")}</dt><dd className="mono">{l.seen_today}/{l.occupied}</dd></div>
                <div><dt>{t("home.checks")}</dt><dd className="mono">{l.checks_done}/{l.checks_total}</dd></div>
                <div><dt>{t("home.rounds")}</dt><dd className="mono">{l.rounds_done}</dd></div>
                <div><dt>{t("home.away")}</dt><dd className="mono">{l.absences_now}</dd></div>
              </dl>
            </article>
          );
        })}
        <article className="dash-card">
          <header><span className="eyebrow mono">{t("home.maintenance")}</span></header>
          <div className="dash-maint">
            {(["urgent", "normal", "low"] as const).map((k) => (
              <Link key={k} to="/maintenance" className={`maint-${k}`}><span className="big-number">{data.maintenance_open[k]}</span><span className="small-text">{t(`home.p_${k}`)}</span></Link>
            ))}
          </div>
          {data.maintenance_open.overdue > 0 && <p className="warn-text small-text">{t("home.overdue", { n: data.maintenance_open.overdue })}</p>}
        </article>
      </div>

      <article className="dash-card dash-wide">
        <header className="dash-chart-head">
          <span className="eyebrow mono">{t("home.last14")}</span>
          <span className="chart-legend small-text"><i className="lg-occ" />{t("home.occupied")} <i className="lg-in" />{t("home.admissions")} <i className="lg-out" />{t("home.outs")}</span>
        </header>
        <svg className="chart" viewBox={`0 0 ${W} ${H + 24}`} role="img" aria-label={t("home.last14")}>
          {[0, 0.5, 1].map((g) => <line key={g} x1="0" x2={W} y1={H * g} y2={H * g} className="chart-grid" />)}
          {series.map((p, i) => (
            <g key={p.day}>
              <rect x={i * step + step * 0.2} width={step * 0.28} y={H - (p.admissions / maxBar) * (H * 0.45)} height={(p.admissions / maxBar) * (H * 0.45)} className="bar-in" />
              <rect x={i * step + step * 0.52} width={step * 0.28} y={H - (p.outs / maxBar) * (H * 0.45)} height={(p.outs / maxBar) * (H * 0.45)} className="bar-out" />
              {(i % 3 === 0 || i === series.length - 1) && (
                <text x={i * step + step / 2} y={H + 16} textAnchor="middle" className="chart-label">{formatCivilDate(p.day, locale).slice(0, 5)}</text>
              )}
            </g>
          ))}
          <path d={linePath(occ, W - step, H * 0.8)} transform={`translate(${step / 2}, ${H * 0.05})`} className="line-occ" />
        </svg>
        <p className="small-text muted">{t("home.chartNote", { min: Math.min(...occ), max: Math.max(...occ), ns: series.reduce((s, p) => s + p.no_shows, 0) })}</p>
      </article>
    </section>
  );
}
