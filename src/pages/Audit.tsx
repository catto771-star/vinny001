import { useEffect, useMemo, useState } from "react";
import { useI18n, type MessageKey } from "@/i18n";
import { supabase } from "@/lib/supabase";
import { diffRecord } from "@/lib/audit";
import { formatDateTime } from "@/lib/time";
import { staffName, type Staff } from "@/lib/types";

type AuditRow = {
  id: number;
  occurred_at: string;
  actor_staff_id: string | null;
  action: "INSERT" | "UPDATE" | "DELETE";
  table_name: string;
  record_id: string | null;
  old_data: Record<string, unknown> | null;
  new_data: Record<string, unknown> | null;
};

type ReadRow = {
  id: number;
  occurred_at: string;
  actor_staff_id: string | null;
  resident: { first_name: string; last_name: string } | null;
};

const TABLES = ["staff", "residents", "stays", "duty_posts", "beds", "rooms", "lodges", "parameters"] as const;

function show(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

/** Auditoria (s.10): quem fez o quê e quando, com valor anterior e novo; e quem abriu perfis. */
export function Audit() {
  const { t, locale } = useI18n();
  const [tab, setTab] = useState<"changes" | "reads">("changes");
  const [table, setTable] = useState<string>("");
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [reads, setReads] = useState<ReadRow[]>([]);
  const [staff, setStaff] = useState<Staff[]>([]);

  useEffect(() => {
    void supabase.from("staff").select("*").then(({ data }) => setStaff((data ?? []) as Staff[]));
  }, []);

  useEffect(() => {
    if (tab === "changes") {
      let q = supabase.from("audit_log").select("*").order("occurred_at", { ascending: false }).limit(200);
      if (table) q = q.eq("table_name", table);
      void q.then(({ data }) => setRows((data ?? []) as AuditRow[]));
    } else {
      void supabase
        .from("access_log")
        .select("id, occurred_at, actor_staff_id, resident:residents(first_name, last_name)")
        .order("occurred_at", { ascending: false })
        .limit(200)
        .then(({ data }) => setReads((data ?? []) as unknown as ReadRow[]));
    }
  }, [tab, table]);

  const names = useMemo(() => new Map(staff.map((s) => [s.id, staffName(s)])), [staff]);
  const who = (id: string | null) => (id ? names.get(id) ?? id.slice(0, 8) : t("audit.system"));
  const actionLabel: Record<AuditRow["action"], MessageKey> = { INSERT: "audit.insert", UPDATE: "audit.update", DELETE: "audit.delete" };

  return (
    <section className="page">
      <header className="page-header">
        <h1>{t("audit.title")}</h1>
        <div className="tabs" role="tablist">
          <button role="tab" className={tab === "changes" ? "tab selected" : "tab"} aria-selected={tab === "changes"} onClick={() => setTab("changes")}>{t("audit.changes")}</button>
          <button role="tab" className={tab === "reads" ? "tab selected" : "tab"} aria-selected={tab === "reads"} onClick={() => setTab("reads")}>{t("audit.reads")}</button>
        </div>
      </header>

      {tab === "changes" ? (
        <>
          <div className="toolbar">
            <select value={table} onChange={(e) => setTable(e.target.value)} aria-label={t("audit.what")}>
              <option value="">{t("app.all")}</option>
              {TABLES.map((name) => <option key={name} value={name}>{t(`audit.tables.${name}`)}</option>)}
            </select>
          </div>
          <table className="table">
            <thead>
              <tr>
                <th>{t("audit.when")}</th>
                <th>{t("audit.who")}</th>
                <th>{t("audit.what")}</th>
                <th>{t("audit.before")} → {t("audit.after")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="nowrap">{formatDateTime(r.occurred_at, locale)}</td>
                  <td>{who(r.actor_staff_id)}</td>
                  <td>
                    {t(actionLabel[r.action])} · {TABLES.includes(r.table_name as (typeof TABLES)[number]) ? t(`audit.tables.${r.table_name as (typeof TABLES)[number]}`) : r.table_name}
                  </td>
                  <td>
                    <ul className="diff">
                      {diffRecord(r.old_data, r.new_data).map((c) => (
                        <li key={c.field}>
                          <code>{c.field}</code>: {r.action !== "INSERT" && <><del>{show(c.before)}</del> → </>}
                          <ins>{show(c.after)}</ins>
                        </li>
                      ))}
                    </ul>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      ) : (
        <table className="table">
          <thead>
            <tr>
              <th>{t("audit.when")}</th>
              <th>{t("audit.who")}</th>
              <th>{t("audit.what")}</th>
            </tr>
          </thead>
          <tbody>
            {reads.map((r) => (
              <tr key={r.id}>
                <td className="nowrap">{formatDateTime(r.occurred_at, locale)}</td>
                <td>{who(r.actor_staff_id)}</td>
                <td>{t("audit.openedProfileOf", { name: r.resident ? `${r.resident.first_name} ${r.resident.last_name}` : "" })}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
