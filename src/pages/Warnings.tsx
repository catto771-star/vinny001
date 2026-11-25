import { useCallback, useEffect, useMemo, useState } from "react";
import { FilterBar } from "@/components/FilterBar";
import { matchesText, type FilterDef } from "@/lib/filters";
import { useUrlFilters } from "@/lib/useUrlFilters";
import { Link } from "react-router-dom";
import { useAuth } from "@/auth/AuthProvider";
import { useI18n } from "@/i18n";
import { supabase } from "@/lib/supabase";
import { errorKey } from "@/lib/errors";
import { formatDateTime } from "@/lib/time";
import { residentName, staffName } from "@/lib/types";
import { useLatestRequest } from "@/lib/useLatestRequest";
import { useOccupancy } from "@/lib/useOccupancy";
import { useStaffList } from "@/lib/useStaffList";
import { Dialog, DialogCancel } from "@/components/Dialog";
import { LodgeTabs } from "@/components/LodgeTabs";
import { useLodgeState } from "@/lib/activeLodge";
import { Skeleton } from "@/components/Skeleton";
import { useToast } from "@/components/Toast";
import { WARNING_LABEL, WarningDialog, type WarningType } from "@/components/WarningDialog";

type WarningRow = {
  id: string;
  resident_id: string;
  type: WarningType;
  note: string | null;
  issued_by: string;
  issued_at: string;
  active: boolean;
  deactivation_reason: string | null;
  residents: { first_name: string; last_name: string } | null;
};

/** Warnings (s.7): Verbal, Written e Final Written; FW ativo vira etiqueta; só a gestão desativa FW. */
export function Warnings() {
  const { t, locale } = useI18n();
  const { canWriteLodge, isManagement } = useAuth();
  const toast = useToast();
  const staffList = useStaffList();
  const [lodgeId, setLodgeId] = useLodgeState();
  const { beds } = useOccupancy(lodgeId);
  const [rows, setRows] = useState<WarningRow[] | null>(null);
  const [recording, setRecording] = useState(false);
  const [deactivating, setDeactivating] = useState<WarningRow | null>(null);
  const [reason, setReason] = useState("");
  const begin = useLatestRequest();

  const load = useCallback(async () => {
    const isLatest = begin();
    setRows(null);
    const { data } = await supabase
      .from("warnings")
      .select("id, resident_id, type, note, issued_by, issued_at, active, deactivation_reason, residents(first_name, last_name)")
      .eq("lodge_id", lodgeId)
      .order("issued_at", { ascending: false })
      .limit(200);
    if (!isLatest()) return;
    setRows((data ?? []) as unknown as WarningRow[]);
  }, [lodgeId, begin]);

  useEffect(() => {
    void load();
  }, [load]);

  const filterDefs: FilterDef[] = useMemo(() => [
    { key: "q", label: t("filters.search"), type: "search" },
    { key: "type", label: t("filters.type"), type: "select", primary: true, options: (Object.keys(WARNING_LABEL) as WarningType[]).map((k) => ({ value: k, label: t(WARNING_LABEL[k]) })) },
    { key: "status", label: t("filters.status"), type: "select", options: [{ value: "active", label: t("filters.active") }, { value: "inactive", label: t("warnings.inactive") }] },
    { key: "by", label: t("filters.issuedBy"), type: "select", options: staffList.map((x) => ({ value: x.id, label: staffName(x) })) },
    { key: "from", label: t("filters.from"), type: "date" },
    { key: "to", label: t("filters.to"), type: "date" },
  ], [t, staffList]);
  const { values: fv, set: setFilters, clear: clearFilters } = useUrlFilters(filterDefs);
  const filtering = Object.keys(fv).length > 0;
  const shown = (rows ?? [])
    .filter((w) => matchesText([w.residents ? residentName(w.residents) : "", w.note], fv.q ?? ""))
    .filter((w) => !fv.type || w.type === fv.type)
    .filter((w) => !fv.status || (fv.status === "active" ? w.active : !w.active))
    .filter((w) => !fv.by || w.issued_by === fv.by)
    .filter((w) => (!fv.from || w.issued_at.slice(0, 10) >= fv.from) && (!fv.to || w.issued_at.slice(0, 10) <= fv.to));

  async function deactivate() {
    if (!deactivating) return;
    const { error } = await supabase.rpc("deactivate_final_warning", { p_id: deactivating.id, p_reason: reason });
    if (error) return toast.error(t(errorKey(error)));
    toast.success(t("warnings.deactivated"));
    setDeactivating(null);
    setReason("");
    await load();
  }

  const nameOf = (id: string) => staffName(staffList.find((s) => s.id === id)) || "—";

  return (
    <section className="page">
      <header className="page-header">
        <h1>{t("warnings.title")}</h1>
        <LodgeTabs value={lodgeId} onChange={setLodgeId} />
      </header>
      <div className="toolbar">
        {canWriteLodge(lodgeId) && <button className="primary" onClick={() => setRecording(true)}>{t("warnings.record")}</button>}
        <span className="hint">{t("warnings.neverExpire")}</span>
      </div>
      <FilterBar defs={filterDefs} values={fv} onChange={setFilters} onClear={clearFilters} count={filtering && rows ? shown.length : undefined} />

      {rows === null ? (
        <div className="card"><Skeleton rows={5} label={t("app.loading")} /></div>
      ) : shown.length === 0 ? (
        <div className="card empty-state"><p className="muted">{t("warnings.empty")}</p></div>
      ) : (
        <table className="table table-cards">
          <tbody>
            {shown.map((w) => (
              <tr key={w.id} className={!w.active ? "row-inactive" : ""}>
                <td className="cell-main">
                  <Link to={`/residents/${w.resident_id}`}>{w.residents ? residentName(w.residents) : ""}</Link>
                  {w.type === "final_written" && w.active && <span className="tag tag-danger fw-tag">FW</span>}
                </td>
                <td>{t(WARNING_LABEL[w.type])}{!w.active && ` · ${t("warnings.inactive")}`}</td>
                <td>{w.note}</td>
                <td className="nowrap">{formatDateTime(w.issued_at, locale)} · {nameOf(w.issued_by)}</td>
                <td>
                  {isManagement && w.type === "final_written" && w.active && (
                    <button className="small danger-outline" onClick={() => setDeactivating(w)}>{t("warnings.deactivate")}</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {recording && (
        <WarningDialog
          residents={beds}
          onClose={() => setRecording(false)}
          onDone={() => {
            setRecording(false);
            toast.success(t("warnings.recorded"));
            void load();
          }}
        />
      )}
      {deactivating && (
        <Dialog
          title={t("warnings.deactivate")}
          onClose={() => setDeactivating(null)}
          footer={
            <>
              <DialogCancel>{t("app.cancel")}</DialogCancel>
              <button className="danger" disabled={!reason.trim()} onClick={() => void deactivate()}>{t("warnings.deactivate")}</button>
            </>
          }
        >
          <p>{deactivating.residents ? residentName(deactivating.residents) : ""}</p>
          <label className="form">
            {t("warnings.deactivateReason")}
            <textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} autoFocus />
          </label>
        </Dialog>
      )}
    </section>
  );
}
