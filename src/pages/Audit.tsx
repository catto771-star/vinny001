import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { useI18n, type MessageKey } from "@/i18n";
import { supabase } from "@/lib/supabase";
import { errorKey } from "@/lib/errors";
import { useLatestRequest } from "@/lib/useLatestRequest";
import { diffRecord } from "@/lib/audit";
import { MODULES, fieldLabel, formatAuditValue, moduleTables, tableLabel } from "@/lib/auditLabels";
import { csv, type FilterDef, type FilterValues } from "@/lib/filters";
import { toCsv } from "@/lib/csv";
import { useUrlFilters } from "@/lib/useUrlFilters";
import { formatDateTime } from "@/lib/time";
import { staffName, type Staff } from "@/lib/types";
import { FilterBar } from "@/components/FilterBar";
import { Notice } from "@/components/Notice";
import { Skeleton } from "@/components/Skeleton";
import { Tabs } from "@/components/Tabs";
import { useToast } from "@/components/Toast";

type Tab = "changes" | "reads";
type AuditRow = {
  id: number; occurred_at: string; actor_staff_id: string | null; actor_name: string | null;
  action: "INSERT" | "UPDATE" | "DELETE"; table_name: string; record_id: string | null;
  old_data: Record<string, unknown> | null; new_data: Record<string, unknown> | null;
};
type ReadRow = { id: number; occurred_at: string; actor_staff_id: string | null; actor_name: string | null; resident_id: string | null; resident_name: string | null; context: string | null };

const PAGE = 100;
const RANGE_DAYS: Record<string, number> = { today: 0, "7d": 7, "30d": 30, "90d": 90, "365d": 365 };
const ACTION_LABEL: Record<AuditRow["action"], MessageKey> = { INSERT: "audit.insert", UPDATE: "audit.update", DELETE: "audit.delete" };

/** Período dos filtros: De/Até (dia inteiro) valem mais que o atalho; sem nada, o servidor usa 30 dias. */
export function periodParams(fv: FilterValues, now = new Date()): { p_from: string | null; p_to: string | null } {
  const day = (iso: string) => new Date(`${iso}T00:00:00`);
  let from: Date | null = null;
  let to: Date | null = null;
  if (fv.from) from = day(fv.from);
  else if (fv.range && fv.range in RANGE_DAYS) {
    from = new Date(now);
    from.setHours(0, 0, 0, 0);
    from.setDate(from.getDate() - RANGE_DAYS[fv.range]);
  }
  if (fv.to) {
    to = day(fv.to);
    to.setDate(to.getDate() + 1);
  }
  return { p_from: from ? from.toISOString() : null, p_to: to ? to.toISOString() : null };
}

/** Audit (s.10): quem fez o quê e quando, com filtros, detalhe antes → depois, histórico por registro e exportação. */
export function Audit() {
  const { t, locale } = useI18n();
  const toast = useToast();
  const [tab, setTab] = useState<Tab>("changes");
  const [staff, setStaff] = useState<Staff[]>([]);
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [reads, setReads] = useState<ReadRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<number | null>(null);
  const begin = useLatestRequest();

  useEffect(() => {
    void supabase.from("staff").select("*").then(({ data }) => setStaff((data ?? []) as Staff[]));
  }, []);

  const people = useMemo(() => staff.map((s) => ({ value: s.id, label: staffName(s) })), [staff]);
  const defs: FilterDef[] = useMemo(() => {
    const range: FilterDef = { key: "range", label: t("audit.range"), type: "select", primary: true, options: Object.keys(RANGE_DAYS).map((k) => ({ value: k, label: t(`audit.r_${k}` as MessageKey) })) };
    const person: FilterDef = { key: "actor", label: t("audit.person"), type: "select", options: people };
    const dates: FilterDef[] = [{ key: "from", label: t("filters.from"), type: "date" }, { key: "to", label: t("filters.to"), type: "date" }];
    if (tab === "reads") return [{ key: "q", label: t("audit.searchResident"), type: "search" }, range, person, ...dates];
    return [
      { key: "q", label: t("audit.search"), type: "search" },
      range,
      { key: "module", label: t("audit.module"), type: "multi", primary: true, options: MODULES.map((m) => ({ value: m.code, label: m.label })) },
      { key: "action", label: t("audit.action"), type: "multi", options: (["INSERT", "UPDATE", "DELETE"] as const).map((a) => ({ value: a, label: t(ACTION_LABEL[a]) })) },
      person,
      { key: "record", label: t("audit.record"), type: "text" },
      ...dates,
    ];
  }, [t, tab, people]);
  const { values: fv, set: setFilters, clear } = useUrlFilters(defs);
  const fvKey = JSON.stringify(fv);

  const fetchPage = useCallback(async (before: number | null) => {
    const common = { ...periodParams(fv), p_actor: fv.actor || null, p_q: fv.q || null, p_limit: PAGE, p_before: before };
    if (tab === "reads") {
      const { data, error: e } = await supabase.rpc("search_access_log", common);
      return { data: (data ?? []) as ReadRow[], error: e };
    }
    const { data, error: e } = await supabase.rpc("search_audit", {
      ...common, p_tables: moduleTables(csv(fv.module)), p_actions: csv(fv.action), p_record: fv.record || null,
    });
    return { data: (data ?? []) as AuditRow[], error: e };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, fvKey]);

  useEffect(() => {
    const isLatest = begin();
    setLoading(true);
    setError(null);
    setOpen(null);
    void fetchPage(null).then(({ data, error: e }) => {
      if (!isLatest()) return;
      if (e) setError(t(errorKey(e)));
      if (tab === "reads") setReads(data as ReadRow[]); else setRows(data as AuditRow[]);
      setHasMore(data.length === PAGE);
      setLoading(false);
    });
  }, [fetchPage, begin, tab, t]);

  async function loadMore() {
    const last = (tab === "reads" ? reads : rows).at(-1);
    if (!last) return;
    const { data, error: e } = await fetchPage(last.id);
    if (e) return setError(t(errorKey(e)));
    if (tab === "reads") setReads((r) => [...r, ...(data as ReadRow[])]); else setRows((r) => [...r, ...(data as AuditRow[])]);
    setHasMore(data.length === PAGE);
  }

  const ctx = useMemo(() => ({ names: new Map(staff.map((s) => [s.id, staffName(s)])), format: (iso: string) => formatDateTime(iso, locale) }), [staff, locale]);
  const who = (name: string | null) => name ?? t("audit.system");
  const changesOf = (r: AuditRow) => diffRecord(r.old_data, r.new_data);
  const line = (c: { field: string; before: unknown; after: unknown }, r: AuditRow) => (
    <li key={c.field}>
      <span className="diff-field">{fieldLabel(c.field)}</span>{" "}
      {r.action !== "INSERT" && <><del>{formatAuditValue(c.before, ctx)}</del> → </>}
      <ins>{formatAuditValue(c.after, ctx)}</ins>
    </li>
  );

  function exportCsv() {
    const head = ["When", "Who", "Action", "Module", "Record", "Field", "Before", "After"];
    const body: string[][] = [];
    for (const r of rows) {
      const base = [formatDateTime(r.occurred_at, locale), who(r.actor_name), t(ACTION_LABEL[r.action]), tableLabel(r.table_name), r.record_id ?? ""];
      const ch = changesOf(r);
      if (ch.length === 0) body.push([...base, "", "", ""]);
      for (const c of ch) body.push([...base, fieldLabel(c.field), formatAuditValue(c.before, ctx), formatAuditValue(c.after, ctx)]);
    }
    const blob = new Blob([toCsv([head, ...body], { bom: true })], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `audit-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  async function copy(id: string) {
    try { await navigator.clipboard.writeText(id); toast.success(t("audit.copied")); } catch { /* sem permissão da área de transferência */ }
  }

  const count = tab === "reads" ? reads.length : rows.length;
  return (
    <section className="page">
      <header className="page-header">
        <h1>{t("audit.title")}</h1>
        <Tabs label={t("audit.title")} value={tab} onChange={(v) => { setTab(v as Tab); clear(); }}
          items={[{ value: "changes", label: t("audit.changes") }, { value: "reads", label: t("audit.reads") }]} />
      </header>

      <FilterBar defs={defs} values={fv} onChange={setFilters} onClear={clear} />
      <div className="audit-bar">
        <span className="small-text muted" role="status">{loading ? "" : t("audit.count", { n: count })}</span>
        {tab === "changes" && rows.length > 0 && <button type="button" className="small" onClick={exportCsv}>{t("audit.exportCsv")}</button>}
      </div>
      <Notice kind="error">{error}</Notice>

      {loading ? (
        <div className="card"><Skeleton rows={6} label={t("app.loading")} /></div>
      ) : count === 0 ? (
        <div className="card empty-state"><p className="muted">{t("audit.empty")}</p></div>
      ) : tab === "changes" ? (
        <div className="table-scroll">
        <table className="table audit-table">
          <thead>
            <tr><th>{t("audit.when")}</th><th>{t("audit.who")}</th><th>{t("audit.what")}</th><th>{t("audit.before")} → {t("audit.after")}</th><th><span className="sr-only">{t("audit.details")}</span></th></tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const ch = changesOf(r);
              const isOpen = open === r.id;
              return (
                <Fragment key={r.id}>
                  <tr>
                    <td className="nowrap">{formatDateTime(r.occurred_at, locale)}</td>
                    <td>{who(r.actor_name)}</td>
                    <td>{t(ACTION_LABEL[r.action])} · {tableLabel(r.table_name)}</td>
                    <td>
                      <ul className="diff">
                        {ch.slice(0, isOpen ? 0 : 2).map((c) => line(c, r))}
                        {!isOpen && ch.length > 2 && <li className="muted">{t("audit.more", { n: ch.length - 2 })}</li>}
                      </ul>
                    </td>
                    <td className="audit-actions">
                      <button type="button" className="small" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? null : r.id)}>{isOpen ? t("audit.hide") : t("audit.details")}</button>
                      {r.record_id && <button type="button" className="small" onClick={() => setFilters({ record: r.record_id! })}>{t("audit.history")}</button>}
                    </td>
                  </tr>
                  {isOpen && (
                    <tr className="audit-detail">
                      <td colSpan={5}>
                        <ul className="diff">{ch.map((c) => line(c, r))}</ul>
                        {r.record_id && (
                          <p className="small-text muted">
                            {t("audit.record")}: <code>{r.record_id}</code>{" "}
                            <button type="button" className="link-button" onClick={() => void copy(r.record_id!)}>{t("audit.copyId")}</button>
                          </p>
                        )}
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
        </div>
      ) : (
        <table className="table">
          <thead><tr><th>{t("audit.when")}</th><th>{t("audit.who")}</th><th>{t("audit.what")}</th></tr></thead>
          <tbody>
            {reads.map((r) => (
              <tr key={r.id}>
                <td className="nowrap">{formatDateTime(r.occurred_at, locale)}</td>
                <td>{who(r.actor_name)}</td>
                <td>{t("audit.openedProfileOf", { name: r.resident_name ?? "" })}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {hasMore && !loading && <button type="button" className="audit-more" onClick={() => void loadMore()}>{t("audit.loadMore")}</button>}
    </section>
  );
}
