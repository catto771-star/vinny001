import { useCallback, useEffect, useState } from "react";
import { useI18n, type MessageKey } from "@/i18n";
import { supabase } from "@/lib/supabase";
import { breakdownLabelKey, detailMetric, formatMetric, orderedMetrics, reportBlocks } from "@/lib/management";
import { formatDateTime, operationalDay } from "@/lib/time";
import { useLatestRequest } from "@/lib/useLatestRequest";
import { Dialog } from "@/components/Dialog";
import { LodgeTabs, useDefaultLodge } from "@/components/LodgeTabs";
import { Skeleton } from "@/components/Skeleton";

type Detail = { ref_id: string; label: string; at: string | null; extra: string | null };

/** Resumo mensal por Lodge (s.15): cada número abre os registros que o formam. */
export function Reports() {
  const { t, locale } = useI18n();
  const latest = useLatestRequest();
  const defaultLodge = useDefaultLodge();
  const [lodge, setLodge] = useState(defaultLodge);
  const [month, setMonth] = useState(() => operationalDay(new Date()).slice(0, 7));
  const [report, setReport] = useState<Record<string, unknown> | null>(null);
  const [detail, setDetail] = useState<{ title: string; rows: Detail[] | null } | null>(null);

  useEffect(() => {
    if (!lodge && defaultLodge) setLodge(defaultLodge);
  }, [defaultLodge, lodge]);

  const load = useCallback(async () => {
    if (!lodge) return;
    const isLatest = latest();
    setReport(null);
    const { data } = await supabase.rpc("report_monthly", { p_lodge: lodge, p_month: `${month}-01` });
    if (isLatest()) setReport((data ?? {}) as Record<string, unknown>);
  }, [lodge, month, latest]);

  useEffect(() => {
    void load();
  }, [load]);

  async function openDetail(metric: string, title: string) {
    setDetail({ title, rows: null });
    const { data } = await supabase.rpc("report_details", { p_lodge: lodge, p_month: `${month}-01`, p_metric: metric });
    setDetail({ title, rows: (data ?? []) as Detail[] });
  }

  const label = (key: string) => t(`reports.m_${key}` as MessageKey);
  const format = (key: string, v: number | string) => formatMetric(key, v, locale);

  return (
    <section className="page">
      <header className="page-header">
        <div>
          <span className="eyebrow">{t("reports.eyebrow")}</span>
          <h1>{t("reports.title")}</h1>
        </div>
        <div className="inline no-print">
          <label className="inline">{t("reports.month")}<input type="month" value={month} onChange={(e) => e.target.value && setMonth(e.target.value)} /></label>
          <button onClick={() => window.print()}>{t("reports.print")}</button>
        </div>
      </header>
      <LodgeTabs value={lodge} onChange={setLodge} />
      {report === null ? (
        <div className="report-grid">{[0, 1, 2, 3].map((i) => <div key={i} className="card"><Skeleton rows={3} label={t("app.loading")} /></div>)}</div>
      ) : (
        <div className="report-grid">
          {reportBlocks(report).map((b) => (
            <article key={b.key} className={`card report-block block-${b.key}`}>
              <h2 className="eyebrow">{t(`reports.b_${b.key}` as MessageKey)}</h2>
              <dl className="report-metrics">
                {orderedMetrics(b.key, b.data).map(([k, v]) => {
                  const metric = detailMetric(b.key, k);
                  return (
                    <div key={k} className="report-metric">
                      <dt>{label(k)}</dt>
                      <dd>
                        {metric ? (
                          <button type="button" className="metric-link" onClick={() => void openDetail(metric, `${t(`reports.b_${b.key}` as MessageKey)} · ${label(k)}`)}>{format(k, v)}</button>
                        ) : (
                          <span>{format(k, v)}</span>
                        )}
                      </dd>
                    </div>
                  );
                })}
              </dl>
              {Object.entries(b.data).filter(([, v]) => v && typeof v === "object").map(([k, v]) => {
                const entries = Array.isArray(v) ? (v as { location: string; count: number }[]).map((x) => [x.location, x.count] as const) : Object.entries(v as Record<string, number>);
                if (entries.length === 0) return null;
                return (
                  <p key={k} className="report-breakdown muted">
                    {entries.map(([name, n]) => {
                      const key = breakdownLabelKey(k, String(name));
                      return `${key ? t(key) : name}: ${n}`;
                    }).join(" · ")}
                  </p>
                );
              })}
            </article>
          ))}
        </div>
      )}
      {detail && (
        <Dialog wide title={detail.title} onClose={() => setDetail(null)}>
          {detail.rows === null ? <Skeleton rows={4} label={t("app.loading")} /> : detail.rows.length === 0 ? <p className="muted">{t("reports.noDetails")}</p> : (
            <table className="table table-cards">
              <tbody>
                {detail.rows.map((r) => (
                  <tr key={r.ref_id}>
                    <td className="cell-main">{r.label}</td>
                    <td className="nowrap">{r.at ? formatDateTime(r.at, locale) : ""}</td>
                    <td className="muted">{r.extra}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Dialog>
      )}
    </section>
  );
}
