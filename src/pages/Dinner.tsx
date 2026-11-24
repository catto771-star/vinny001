import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/auth/AuthProvider";
import { useI18n } from "@/i18n";
import { supabase } from "@/lib/supabase";
import { errorKey } from "@/lib/errors";
import { slotInstant } from "@/lib/presence";
import { roomLabel } from "@/lib/rooms";
import { formatCivilDate, formatTime, operationalDay } from "@/lib/time";
import { residentName, staffName } from "@/lib/types";
import { useLatestRequest } from "@/lib/useLatestRequest";
import { useStaffList } from "@/lib/useStaffList";
import { Dialog, DialogCancel } from "@/components/Dialog";
import { LodgeTabs } from "@/components/LodgeTabs";
import { useLodgeState } from "@/lib/activeLodge";
import { ResidentPicker } from "@/components/ResidentPicker";
import { Notice } from "@/components/Notice";
import { Skeleton } from "@/components/Skeleton";
import { useToast } from "@/components/Toast";

export type DinnerRow = {
  stay_id: string; resident_id: string; first_name: string; last_name: string; room_kind: "room" | "apartment";
  room_code: string; room_sort: number; bed_number: number; served: boolean | null; marked_by: string | null; final_warning: boolean;
};
type Summary = { service_id: string | null; leftovers: number | null; packaged: number | null; close_note: string | null; closed_at: string | null; closed_by: string | null; served_count: number; not_served_count: number; residents_count: number };
const kitchen = (l: { has_dinner: boolean }) => l.has_dinner;

/** Dinner (s.8): uma marca por residente; "Sim" vale como Seen Night; Manager fecha sobras depois das 22h. */
export function Dinner() {
  const { t, locale } = useI18n();
  const { canWriteLodge, isManagement, staff, serverOffsetMs } = useAuth();
  const toast = useToast();
  const staffList = useStaffList();
  const now = new Date(Date.now() + serverOffsetMs);
  const [lodgeId, setLodgeId] = useLodgeState(kitchen);
  const [day, setDay] = useState(() => operationalDay(now));
  const [rows, setRows] = useState<DinnerRow[] | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [closing, setClosing] = useState(false);
  const begin = useLatestRequest();
  // Beta: liberado a qualquer hora; antes das 18h pede confirmação uma vez.
  const early = slotInstant(day, "18:00").getTime() > now.getTime();
  const [earlyOk, setEarlyOk] = useState(false);
  const [pending, setPending] = useState<{ row: DinnerRow; served: boolean } | null>(null);
  const [pick, setPick] = useState("");
  const finished = slotInstant(day, "22:00").getTime() <= now.getTime();
  const canWrite = canWriteLodge(lodgeId) && (!summary?.closed_at || isManagement);

  const load = useCallback(async () => {
    if (!lodgeId) return;
    const isLatest = begin();
    setRows(null);
    const [{ data }, { data: s }] = await Promise.all([
      supabase.rpc("dinner_sheet", { p_lodge: lodgeId, p_day: day }),
      supabase.rpc("dinner_summary", { p_lodge: lodgeId, p_day: day }),
    ]);
    if (!isLatest()) return;
    setRows((data ?? []) as DinnerRow[]);
    setSummary(((s ?? []) as Summary[])[0] ?? null);
  }, [lodgeId, day, begin]);

  useEffect(() => {
    void load();
  }, [load]);

  function mark(row: DinnerRow, served: boolean) {
    if (early && !earlyOk) return setPending({ row, served });
    void save(row, served);
  }

  async function save(row: DinnerRow, served: boolean) {
    setRows((list) => list?.map((r) => (r.stay_id === row.stay_id ? { ...r, served } : r)) ?? null);
    const { error } = await supabase.rpc("mark_dinner", { p_lodge: lodgeId, p_day: day, p_stay: row.stay_id, p_served: served });
    if (error) {
      toast.error(t(errorKey(error)));
      return load();
    }
    const { data: s } = await supabase.rpc("dinner_summary", { p_lodge: lodgeId, p_day: day });
    setSummary(((s ?? []) as Summary[])[0] ?? null);
  }

  const served = rows?.filter((r) => r.served === true).length ?? 0;
  const notServed = rows?.filter((r) => r.served === false).length ?? 0;
  const unmarked = (rows?.length ?? 0) - served - notServed;
  const canClose = isManagement && finished && (!summary?.closed_at ? staff?.role !== "owner" : staff?.role === "owner" || staff?.role === "developer");

  return (
    <section className="page">
      <header className="page-header">
        <div>
          <span className="eyebrow">{t("dinner.eyebrow")}</span>
          <h1>{t("dinner.title")}</h1>
        </div>
        <LodgeTabs value={lodgeId} onChange={setLodgeId} only={kitchen} />
      </header>
      {!lodgeId && <Notice kind="info">{t("dinner.onlyAmiens")}</Notice>}

      <div className="toolbar">
        <input type="date" value={day} onChange={(e) => e.target.value && setDay(e.target.value)} aria-label={t("sheet.day")} />
        <span className="eyebrow">{formatCivilDate(day, locale)}</span>
      </div>

      <div className="stat-row">
        <div><span className="big-number">{served}</span><span className="muted"> {t("dinner.served")}</span></div>
        <div><span className="big-number">{notServed}</span><span className="muted"> {t("dinner.notServed")}</span></div>
        <div><span className="big-number">{unmarked}</span><span className="muted"> {t("dinner.unmarked")}</span></div>
        {canClose && (
          <button className="primary" onClick={() => setClosing(true)}>{summary?.closed_at ? t("dinner.edit") : t("dinner.close")}</button>
        )}
      </div>
      {early && <Notice kind="info">{t("dinner.earlyHint")}</Notice>}
      {!early && !finished && isManagement && <p className="hint">{t("dinner.closeAfter22")}</p>}
      {canWrite && rows && rows.length > 0 && (
        <div className="card">
          <strong>{t("dinner.whoTook")}</strong>
          <ResidentPicker
            value={pick}
            emptyLabel={t("dinner.chooseResident")}
            options={rows.map((r) => ({ id: r.stay_id, label: `${roomLabel(t, r.room_kind, r.room_code)} · ${r.bed_number} — ${residentName(r)}` }))}
            onChange={(id) => {
              setPick("");
              const row = rows.find((r) => r.stay_id === id);
              if (row) mark(row, true);
            }}
          />
        </div>
      )}
      {summary?.closed_at && (
        <Notice kind="success">
          {t("dinner.closed", {
            name: staffName(staffList.find((s) => s.id === summary.closed_by)),
            time: formatTime(summary.closed_at, locale),
            leftovers: summary.leftovers ?? 0,
            packaged: summary.packaged ?? 0,
          })}
        </Notice>
      )}

      {rows === null ? (
        <div className="card"><Skeleton rows={8} label={t("app.loading")} /></div>
      ) : (
        <ul className="task-list">
          {rows.map((r) => (
            <li key={r.stay_id} className={`task-item${r.served ? " is-done" : ""}`}>
              <span className="task-check" aria-hidden="true">{r.served ? "✓" : ""}</span>
              <div className="task-main">
                <span className="task-title">
                  {residentName(r)}
                  {r.final_warning && <span className="tag tag-danger fw-tag">FW</span>}
                </span>
                <span className="task-meta"><span className="room-cell">{roomLabel(t, r.room_kind, r.room_code)}</span> · {r.bed_number}</span>
              </div>
              <div className="result-buttons" role="group" aria-label={residentName(r)}>
                <button type="button" className={`small result-seen${r.served === true ? " selected" : ""}`} aria-pressed={r.served === true} disabled={!canWrite} onClick={() => mark(r, true)}>
                  {t("dinner.yes")}
                </button>
                <button type="button" className={`small result-not_seen${r.served === false ? " selected" : ""}`} aria-pressed={r.served === false} disabled={!canWrite} onClick={() => mark(r, false)}>
                  {t("dinner.no")}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {pending && (
        <Dialog
          title={t("dinner.earlyTitle")}
          onClose={() => setPending(null)}
          footer={
            <>
              <DialogCancel>{t("app.cancel")}</DialogCancel>
              <button
                className="primary"
                onClick={() => {
                  setEarlyOk(true);
                  void save(pending.row, pending.served);
                  setPending(null);
                }}
              >
                {t("dinner.earlyConfirm")}
              </button>
            </>
          }
        >
          <p>{t("dinner.earlyBody", { name: residentName(pending.row) })}</p>
        </Dialog>
      )}

      {closing && (
        <CloseDinner
          lodgeId={lodgeId}
          day={day}
          initial={summary}
          onClose={() => setClosing(false)}
          onDone={() => {
            setClosing(false);
            toast.success(t("dinner.closedOk"));
            void load();
          }}
        />
      )}
    </section>
  );
}

function CloseDinner({ lodgeId, day, initial, onClose, onDone }: { lodgeId: string; day: string; initial: Summary | null; onClose: () => void; onDone: () => void }) {
  const { t } = useI18n();
  const [leftovers, setLeftovers] = useState(String(initial?.leftovers ?? ""));
  const [packaged, setPackaged] = useState(String(initial?.packaged ?? ""));
  const [note, setNote] = useState(initial?.close_note ?? "");
  const [error, setError] = useState<string | null>(null);
  const valid = /^\d+$/.test(leftovers) && /^\d+$/.test(packaged);

  async function submit() {
    const { error: err } = await supabase.rpc("close_dinner", { p_lodge: lodgeId, p_day: day, p_leftovers: Number(leftovers), p_packaged: Number(packaged), p_note: note });
    if (err) return setError(t(errorKey(err)));
    onDone();
  }

  return (
    <Dialog
      title={initial?.closed_at ? t("dinner.edit") : t("dinner.close")}
      onClose={onClose}
      footer={
        <>
          <DialogCancel>{t("app.cancel")}</DialogCancel>
          <button className="primary" disabled={!valid} onClick={() => void submit()}>{t("app.save")}</button>
        </>
      }
    >
      <div className="form">
        <div className="form-grid">
          <label>{t("dinner.leftovers")}<input inputMode="numeric" value={leftovers} onChange={(e) => setLeftovers(e.target.value)} autoFocus /></label>
          <label>{t("dinner.packaged")}<input inputMode="numeric" value={packaged} onChange={(e) => setPackaged(e.target.value)} /></label>
        </div>
        <label>{t("dinner.closeNote")} <small>({t("app.optional")})</small><input value={note} onChange={(e) => setNote(e.target.value)} /></label>
        <Notice kind="error">{error}</Notice>
      </div>
    </Dialog>
  );
}
