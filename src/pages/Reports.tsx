import { useCallback, useEffect, useState } from "react";
import { useI18n, type MessageKey } from "@/i18n";
import { supabase } from "@/lib/supabase";
import { blocksOf, breakdownLabelKey, detailMetric, formatEUR, formatMetric, orderedMetrics, periodRange, REPORT_CATEGORIES, reportBlocks, type PeriodKind } from "@/lib/management";
import { addDays, formatCivilDate, formatDateTime, operationalDay } from "@/lib/time";
import { useAuth } from "@/auth/AuthProvider";
import { useLatestRequest } from "@/lib/useLatestRequest";
import { Dialog } from "@/components/Dialog";
import { Tabs } from "@/components/Tabs";
import { Skeleton } from "@/components/Skeleton";
import { STATUS_LABEL } from "./Purchases";

type Detail = { ref_id: string; label: string; at: string | null; extra: string | null; lodge_id: string | null };
type Report = Record<string, unknown>;
type Purch = { orders: number; placed: number; by_status: Record<"created" | "placed" | "awaiting" | "delivered", number>; items: number; total: number; lines_without_price: number;
  by_category: { category: string; total: number; items: number }[]; top_items: { name: string; qty: number; total: number }[] };

/** Categoria Compras: pedidos do Tesco no período (as duas casas juntas). */
function PurchasesReport({ data }: { data: Purch | null }) {
  const { t, locale } = useI18n();
  if (!data) return <div className="card"><Skeleton rows={4} label={t("app.loading")} /></div>;
  const max = Math.max(...data.by_category.map((c) => Number(c.total)), 1);
  return (
    <div className="report-grid">
      <article className="card report-block">
        <h2 className="eyebrow">{t("reports.c_purchases")}</h2>
        <dl className="report-metrics">
          <div className="report-metric"><dt>{t("reports.p_orders")}</dt><dd>{data.orders}</dd></div>
          <div className="report-metric"><dt>{t("reports.p_items")}</dt><dd>{data.items}</dd></div>
          <div className="report-metric"><dt>{t("reports.p_total")}</dt><dd>{formatEUR(Number(data.total), locale)}</dd></div>
        </dl>
        <dl className="report-metrics">
          {(["created", "placed", "awaiting", "delivered"] as const).map((s) => (
            <div key={s} className="report-metric"><dt>{t(STATUS_LABEL[s])}</dt><dd>{data.by_status?.[s] ?? 0}</dd></div>
          ))}
        </dl>
        {data.lines_without_price > 0 && <p className="hint">{t("reports.p_missing", { n: data.lines_without_price })}</p>}
        <p className="hint">{t("reports.p_note")}</p>
      </article>
      <article className="card report-block">
        <h2 className="eyebrow">{t("reports.p_byCategory")}</h2>
        <ul className="report-bars">
          {data.by_category.map((c) => (
            <li key={c.category}>
              <span className="report-bar-label">{c.category}</span>
              <span className="report-bar"><span style={{ width: `${(Number(c.total) / max) * 100}%` }} /></span>
              <span className="mono">{formatEUR(Number(c.total), locale)}</span>
            </li>
          ))}
        </ul>
      </article>
      <article className="card report-block">
        <h2 className="eyebrow">{t("reports.p_top")}</h2>
        <ul className="report-bars">
          {data.top_items.map((i) => (
            <li key={i.name}><span className="report-bar-label">{i.name}</span><span className="mono muted">× {i.qty}</span><span className="mono">{formatEUR(Number(i.total), locale)}</span></li>
          ))}
        </ul>
      </article>
    </div>
  );
}

/** Resumo mensal por Lodge (s.15): cada número abre os registros que o formam. */
export function Reports() {
  const { t, locale } = useI18n();
  const { lodges } = useAuth();
  const latest = useLatestRequest();
  // Beta 4.4: período livre (dia, semana, quinzena, mês, intervalo) e casa (uma ou as duas).
  const [kind, setKind] = useState<PeriodKind>("month");
  const [anchor, setAnchor] = useState(() => operationalDay(new Date()));
  const [custom, setCustom] = useState(() => ({ from: addDays(operationalDay(new Date()), -6), to: operationalDay(new Date()) }));
  const [house, setHouse] = useState("both");
  const [category, setCategory] = useState("occupancy");
  const [purchases, setPurchases] = useState<Purch | null>(null);
  const [report, setReport] = useState<Report | null>(null);
  const [perHouse, setPerHouse] = useState<Record<string, Report>>({});
  const [detail, setDetail] = useState<{ title: string; rows: Detail[] | null } | null>(null);
  const range = periodRange(kind, anchor, custom);
  const selected = house === "both" ? lodges.map((l) => l.id) : [house];
  const key = selected.join(",");

  const load = useCallback(async () => {
    if (!key) return;
    const isLatest = latest();
    setReport(null);
    const ids = key.split(",");
    const calls = [supabase.rpc("report_period", { p_lodges: ids, p_from: range.from, p_to: range.to })];
    if (ids.length > 1) for (const id of ids) calls.push(supabase.rpc("report_period", { p_lodges: [id], p_from: range.from, p_to: range.to }));
    const results = await Promise.all(calls);
    if (!isLatest()) return;
    setReport((results[0].data ?? {}) as Report);
    const split: Record<string, Report> = {};
    if (ids.length > 1) ids.forEach((id, i) => (split[id] = (results[i + 1].data ?? {}) as Report));
    setPerHouse(split);
  }, [key, range.from, range.to, latest]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (category !== "purchases") return;
    setPurchases(null);
    void supabase.rpc("report_purchases", { p_from: range.from, p_to: range.to }).then(({ data }) => setPurchases((data ?? null) as Purch | null));
  }, [category, range.from, range.to]);

  async function openDetail(metric: string, title: string) {
    setDetail({ title, rows: null });
    const { data } = await supabase.rpc("report_details_period", { p_lodges: key.split(","), p_from: range.from, p_to: range.to, p_metric: metric });
    setDetail({ title, rows: (data ?? []) as Detail[] });
  }

  const short = (id: string | null) => lodges.find((l) => l.id === id)?.short_name ?? "";
  const split = (block: string, k: string) => {
    const ids = Object.keys(perHouse);
    if (ids.length < 2) return null;
    const parts = ids.map((id) => {
      const v = (perHouse[id]?.[block] as Record<string, unknown> | null | undefined)?.[k];
      return typeof v === "number" || typeof v === "string" ? `${short(id)} ${format(k, v)}` : null;
    }).filter(Boolean);
    return parts.length ? <small className="report-split mono">{parts.join(" · ")}</small> : null;
  };
  const label = (key: string) => t(`reports.m_${key}` as MessageKey);
  const format = (key: string, v: number | string) => formatMetric(key, v, locale);

  return (
    <section className="page">
      <header className="page-header">
        <div>
          <span className="eyebrow">{t("reports.eyebrow")}</span>
          <h1>{t("reports.title")}</h1>
        </div>
        <button className="no-print" onClick={() => window.print()}>{t("reports.print")}</button>
      </header>
      <div className="toolbar no-print">
        <Tabs
          label={t("reports.period")}
          value={kind}
          onChange={(v) => setKind(v as PeriodKind)}
          items={(["day", "week", "fortnight", "month", "custom"] as PeriodKind[]).map((k) => ({ value: k, label: t(`reports.p_${k}` as MessageKey) }))}
        />
        {kind === "custom" ? (
          <>
            <label className="inline">{t("vacations.from")}<input type="date" value={custom.from} onChange={(e) => e.target.value && setCustom({ ...custom, from: e.target.value })} /></label>
            <label className="inline">{t("vacations.until")}<input type="date" value={custom.to} min={custom.from} onChange={(e) => e.target.value && setCustom({ ...custom, to: e.target.value })} /></label>
          </>
        ) : (
          <label className="inline">{t("reports.reference")}<input type="date" value={anchor} onChange={(e) => e.target.value && setAnchor(e.target.value)} /></label>
        )}
      </div>
      <div className="toolbar">
        <Tabs
          label={t("residents.lodge")}
          value={house}
          onChange={setHouse}
          items={[...lodges.map((l) => ({ value: l.id, label: l.name })), { value: "both", label: t("reports.bothHouses") }]}
        />
        <span className="eyebrow">{formatCivilDate(range.from, locale)} → {formatCivilDate(addDays(range.to, -1), locale)}</span>
      </div>
      <Tabs label={t("reports.category")} value={category} onChange={setCategory}
        items={REPORT_CATEGORIES.map((c) => ({ value: c.key, label: t(`reports.c_${c.key}` as MessageKey) }))} />
      {category === "purchases" ? (
        <PurchasesReport data={purchases} />
      ) : report === null ? (
        <div className="report-grid">{[0, 1, 2, 3].map((i) => <div key={i} className="card"><Skeleton rows={3} label={t("app.loading")} /></div>)}</div>
      ) : (
        <div className="report-grid">
          {blocksOf(category, reportBlocks(report)).map((b) => (
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
                        {split(b.key, k)}
                      </dd>
                    </div>
                  );
                })}
              </dl>
              {Object.entries(b.data).filter(([, v]) => v && typeof v === "object").map(([k, v]) => {
                const entries = Array.isArray(v) ? (v as { location: string; count: number }[]).map((x) => [x.location, x.count] as const) : Object.entries(v as Record<string, number>);
                if (entries.length === 0) return null;
                const max = Math.max(...entries.map(([, n]) => Number(n) || 0), 1);
                return (
                  <ul key={k} className="report-bars">
                    {entries.map(([name, n]) => {
                      const key = breakdownLabelKey(k, String(name));
                      return (
                        <li key={String(name)}>
                          <span className="report-bar-label">{key ? t(key) : name}</span>
                          <span className="report-bar"><span style={{ width: `${(Number(n) / max) * 100}%` }} /></span>
                          <span className="mono">{n}</span>
                        </li>
                      );
                    })}
                  </ul>
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
                    <td><span className="chip">{short(r.lodge_id)}</span></td>
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
