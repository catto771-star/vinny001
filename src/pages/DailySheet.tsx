import { Fragment, useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "@/auth/AuthProvider";
import { useI18n, type MessageKey } from "@/i18n";
import { supabase } from "@/lib/supabase";
import { useLatestRequest } from "@/lib/useLatestRequest";
import { errorKey } from "@/lib/errors";
import { keyToResult, nextResidentIndex, sheetProgress, slotInstant, type CheckResult, type SheetRow } from "@/lib/presence";
import { roomLabel } from "@/lib/rooms";
import { formatCivilDate, formatDateTime, operationalDay } from "@/lib/time";
import { residentName, staffName } from "@/lib/types";
import { useStaffList } from "@/lib/useStaffList";
import { AnticipateDialog } from "@/components/AnticipateDialog";
import { DateTimeInput } from "@/components/DateTimeInput";
import { LodgeTabs } from "@/components/LodgeTabs";
import { useLodgeState } from "@/lib/activeLodge";
import { Notice } from "@/components/Notice";
import { Skeleton } from "@/components/Skeleton";
import { Tabs } from "@/components/Tabs";
import { useToast } from "@/components/Toast";

export type Run = {
  id: string;
  slot: string;
  status: "pending" | "launched";
  sheet_number: string;
  checked_at: string;
  performed_by: string;
  entered_by: string;
  performed_reported_by_entrant: boolean;
};

// Colunas visíveis a toda a equipe (os horários de digitação ficam só para a gestão).
const RUN_COLUMNS = "id, slot, status, sheet_number, checked_at, performed_by, entered_by, performed_reported_by_entrant";

const RESULT_LABEL: Record<CheckResult, MessageKey> = { seen: "sheet.seen", not_seen: "sheet.notSeen", absent: "sheet.absent" };

/** Folha do dia (s.5): repete a folha de papel; uma célula por check; lançar exige todos marcados. */
export function DailySheet() {
  const { t, locale } = useI18n();
  const { canWriteLodge, serverOffsetMs, lodges } = useAuth();
  const staffList = useStaffList();
  const [lodgeId, setLodgeId] = useLodgeState();
  const [day, setDay] = useState(() => operationalDay(new Date(Date.now() + serverOffsetMs)));
  const [slots, setSlots] = useState<string[]>([]);
  const [slot, setSlot] = useState<string | null>(null);
  const [runs, setRuns] = useState<Run[]>([]);
  const [rows, setRows] = useState<SheetRow[]>([]);
  const [selected, setSelected] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [anticipate, setAnticipate] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [sheetLoading, setSheetLoading] = useState(false);
  const toast = useToast();
  const tableRef = useRef<HTMLDivElement>(null);

  const canWrite = canWriteLodge(lodgeId);
  const run = runs.find((r) => r.slot === slot) ?? null;
  const progress = useMemo(() => sheetProgress(rows), [rows]);
  const now = new Date(Date.now() + serverOffsetMs);
  const slotDue = slot ? slotInstant(day, slot).getTime() <= now.getTime() + 60 * 60_000 : false;

  const beginRuns = useLatestRequest();
  const beginSheet = useLatestRequest();
  const loadRuns = useCallback(async () => {
    const isLatest = beginRuns();
    const [{ data: slotData }, { data: runData }] = await Promise.all([
      supabase.rpc("check_slots", { p_lodge: lodgeId, p_day: day }),
      supabase.from("room_check_runs").select(RUN_COLUMNS).eq("lodge_id", lodgeId).eq("operational_day", day),
    ]);
    if (!isLatest()) return;
    const list = (slotData ?? []) as string[];
    setSlots(list);
    setRuns((runData ?? []) as Run[]);
    setSlot((current) => (current && list.includes(current) ? current : (list.find((s) => slotInstant(day, s).getTime() <= Date.now() + serverOffsetMs) ?? list[0] ?? null)));
  }, [lodgeId, day, serverOffsetMs, beginRuns]);

  const loadSheet = useCallback(async (runId: string) => {
    const isLatest = beginSheet();
    setSheetLoading(true);
    const { data, error: e } = await supabase.rpc("room_check_sheet", { p_run: runId });
    if (!isLatest()) return;
    setSheetLoading(false);
    if (e) return setError(t(errorKey(e)));
    const list = (data ?? []) as SheetRow[];
    setRows(list);
    setSelected((s) => (list[s]?.stay_id ? s : Math.max(0, list.findIndex((r) => r.stay_id))));
  }, [t, beginSheet]);

  useEffect(() => {
    setRows([]);
    setError(null);
    void loadRuns();
  }, [loadRuns]);

  useEffect(() => {
    if (run) void loadSheet(run.id);
    else setRows([]);
  }, [run, loadSheet]);

  async function start() {
    if (!slot) return;
    setBusy(true);
    const { error: e } = await supabase.rpc("open_room_check", { p_lodge: lodgeId, p_day: day, p_slot: slot });
    setBusy(false);
    if (e) return setError(t(errorKey(e)));
    await loadRuns();
  }

  async function mark(index: number, result: CheckResult | "clear") {
    const row = rows[index];
    if (!run || !row?.stay_id || !canWrite) return;
    if (result === "absent" && !row.absence_id) return setError(t("errors.noActiveAbsence"));
    const previous = row.result;
    setError(null);
    setRows((list) => list.map((r, i) => (i === index ? { ...r, result: result === "clear" ? null : result } : r)));
    const { data, error: e } =
      result === "clear"
        ? await supabase.rpc("clear_mark", { p_run: run.id, p_stay: row.stay_id })
        : await supabase.rpc("mark_resident", { p_run: run.id, p_stay: row.stay_id, p_result: result });
    if (e) {
      setRows((list) => list.map((r, i) => (i === index ? { ...r, result: previous } : r)));
      return setError(t(errorKey(e)));
    }
    const info = data as { absence_active?: boolean; absence_id?: string } | null;
    if (info?.absence_active && info.absence_id) setAnticipate(info.absence_id);
  }

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      setSelected((s) => nextResidentIndex(rows, s, e.key === "ArrowDown" ? 1 : -1));
      return;
    }
    const result = keyToResult(e.key);
    if (!result) return;
    e.preventDefault();
    void mark(selected, result);
    if (result !== "clear") setSelected((s) => nextResidentIndex(rows, s, 1));
  }

  async function launch() {
    if (!run) return;
    setBusy(true);
    const { data, error: e } = await supabase.rpc("launch_room_check", { p_run: run.id });
    setBusy(false);
    if (e) return setError(t(errorKey(e)));
    if ((data as { status: string }).status === "already_launched") toast.info(t("sheet.alreadyLaunched"));
    else toast.success(t("sheet.launchedOk"));
    await loadRuns();
  }

  async function updateDetails(checkedAt: Date | null, performedBy: string | null) {
    if (!run) return;
    const { error: e } = await supabase.rpc("set_room_check_details", {
      p_run: run.id,
      p_checked_at: checkedAt ? checkedAt.toISOString() : null,
      p_performed_by: performedBy,
    });
    if (e) return setError(t(errorKey(e)));
    await loadRuns();
  }

  const nameOf = (id: string | null) => staffName(staffList.find((s) => s.id === id)) || "—";
  const lodge = lodges.find((l) => l.id === lodgeId);

  return (
    <section className="page">
      <header className="page-header">
        <h1>{t("sheet.title")}</h1>
        <LodgeTabs value={lodgeId} onChange={setLodgeId} />
      </header>

      <div className="toolbar">
        <label className="inline">
          {t("sheet.day")}
          <input type="date" value={day} onChange={(e) => e.target.value && setDay(e.target.value)} />
        </label>
        <Tabs
          label={t("sheet.title")}
          value={slot ?? ""}
          onChange={setSlot}
          items={slots.map((s) => {
            const r = runs.find((x) => x.slot === s);
            return {
              value: s,
              label: t("sheet.check", { slot: s }),
              hint: (
                <small className={r?.status === "launched" ? "ok-text tab-hint" : "warn-text tab-hint"}>
                  {" · "}
                  {r ? (r.status === "launched" ? t("sheet.launched") : t("sheet.pending")) : t("sheet.notOpened")}
                </small>
              ),
            };
          })}
        />
        <Link className="button-link" to={`/sheet/print?lodge=${lodgeId}&day=${day}`} target="_blank">
          {t("sheet.print")}
        </Link>
      </div>

      <Notice kind="error">{error}</Notice>

      {!run && slot && (
        <div className="card empty-state">
          <span className="eyebrow">{lodge?.name} · {formatCivilDate(day, locale)}</span>
          <h2 className="display-sm">{t("sheet.check", { slot })} · {t("sheet.notOpened")}</h2>
          {!slotDue ? (
            <p>{t("sheet.notYet")}</p>
          ) : canWrite ? (
            <>
              <p className="hint">{t("sheet.keyboardHint")}</p>
              <button className="primary" disabled={busy} onClick={() => void start()}>
                {t("sheet.start")}
              </button>
            </>
          ) : (
            <p className="muted">{t("sheet.readOnly")}</p>
          )}
        </div>
      )}

      {run && (
        <>
          <div className="rc-summary">
            <div className="rc-progress card">
              <span className="eyebrow mono">{t("sheet.check", { slot: run.slot })} · {lodge?.name}</span>
              <div className="rc-count"><span className="big-number">{progress.marked}</span><span className="muted"> / {progress.total}</span></div>
              <div className="meter" aria-hidden="true"><span style={{ width: `${progress.total ? (progress.marked / progress.total) * 100 : 0}%` }} /></div>
              <div className="rc-tally">
                <span><i className="dot-seen" />{rows.filter((r) => r.result === "seen").length} {t("sheet.seen")}</span>
                <span><i className="dot-not_seen" />{rows.filter((r) => r.result === "not_seen").length} {t("sheet.notSeen")}</span>
                <span><i className="dot-absent" />{rows.filter((r) => r.result === "absent").length} {t("sheet.absent")}</span>
              </div>
            </div>
            <div className="rc-keys card" aria-label={t("sheet.keyboardTitle")}>
              <span className="eyebrow mono">{t("sheet.keyboardTitle")}</span>
              <ul>
                <li><kbd>↑</kbd><kbd>↓</kbd> {t("sheet.keyMove")}</li>
                <li><kbd>V</kbd> {t("sheet.seen")}</li>
                <li><kbd>N</kbd> {t("sheet.notSeen")}</li>
                <li><kbd>A</kbd> {t("sheet.absent")}</li>
                <li><kbd>Del</kbd> {t("sheet.keyClear")}</li>
              </ul>
            </div>
          </div>
          <div className="card sheet-header">
            <div>
              <span className="sheet-number">{t("sheet.sheetNumber", { n: run.sheet_number })}</span> · {lodge?.name} ·{" "}
              {run.status === "launched" ? <span className="ok-text">{t("sheet.launched")}</span> : <span className="warn-text">{t("sheet.pending")}</span>}
            </div>
            <span className="muted mono">{t("sheet.plannedAt", { time: run.slot })}</span>
            <label className="inline">
              {t("sheet.checkedAt")}
              {canWrite ? (
                <DateTimeInput value={new Date(run.checked_at)} onChange={(d) => d && void updateDetails(d, null)} />
              ) : (
                <span>{formatDateTime(run.checked_at, locale)}</span>
              )}
            </label>
            <label className="inline">
              {t("sheet.performedBy")}
              <select value={run.performed_by} disabled={!canWrite} onChange={(e) => void updateDetails(null, e.target.value)}>
                {staffList.map((s) => (
                  <option key={s.id} value={s.id}>{staffName(s)}</option>
                ))}
              </select>
              {run.performed_reported_by_entrant && <small className="muted">{t("sheet.reportedBy", { name: nameOf(run.entered_by) })}</small>}
            </label>
          </div>

          {sheetLoading && rows.length === 0 && <div className="card"><Skeleton rows={8} label={t("app.loading")} /></div>}
          <div ref={tableRef} tabIndex={0} className="sheet-table-wrap" onKeyDown={onKeyDown} aria-label={t("sheet.title")}>
            <table className="table sheet-table">
              <thead>
                <tr>
                  <th>{t("sheet.room")}</th>
                  <th>{t("sheet.bed")}</th>
                  <th>{t("sheet.resident")}</th>
                  <th>{t("sheet.dob")}</th>
                  <th>{t("sheet.result")}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <Fragment key={r.bed_id}>
                  {(i === 0 || rows[i - 1].room_id !== r.room_id) && (
                    <tr className="room-sep" aria-hidden="true"><td colSpan={5}>{roomLabel(t, r.room_kind, r.room_code)}</td></tr>
                  )}
                  <tr className={i === selected && r.stay_id ? "row-selected" : ""} onClick={() => r.stay_id && setSelected(i)}>
                    <td className="room-cell">{roomLabel(t, r.room_kind, r.room_code)}</td>
                    <td>{r.bed_number}</td>
                    <td>
                      {r.stay_id ? (
                        <>
                          {residentName(r)}
                          {r.final_warning && <span className="tag tag-danger fw-tag">FW</span>}
                          {r.absence_id && <span className="tag">{t("sheet.absenceTag")}</span>}
                        </>
                      ) : (
                        <em className="muted">{t("sheet.freeBed")}</em>
                      )}
                    </td>
                    <td>{formatCivilDate(r.date_of_birth, locale)}</td>
                    <td>
                      {r.stay_id && (
                        <div className="result-buttons" role="group">
                          {(["seen", "not_seen", "absent"] as CheckResult[]).map((res) => (
                            <button
                              key={res}
                              type="button"
                              className={`small result-${res}${r.result === res ? " selected" : ""}`}
                              aria-pressed={r.result === res}
                              disabled={!canWrite || (res === "absent" && !r.absence_id)}
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelected(i);
                                void mark(i, res);
                              }}
                            >
                              {t(RESULT_LABEL[res])}
                            </button>
                          ))}
                        </div>
                      )}
                    </td>
                  </tr>
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>

          <div className="button-row sticky-actions">
            <span className="progress-text">{t("sheet.progress", { marked: progress.marked, total: progress.total })}</span>
            {canWrite && run.status === "pending" && (
              <button className="primary" disabled={busy || !progress.complete} onClick={() => void launch()}>
                {t("sheet.launch")}
              </button>
            )}
            {canWrite && run.status === "pending" && !progress.complete && <small className="muted">{t("sheet.markAll")}</small>}
          </div>
        </>
      )}

      {anticipate && (
        <AnticipateDialog
          absenceId={anticipate}
          onClose={() => {
            setAnticipate(null);
            if (run) void loadSheet(run.id);
          }}
        />
      )}
    </section>
  );
}
