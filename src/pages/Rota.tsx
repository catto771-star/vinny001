import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useAuth } from "@/auth/AuthProvider";
import { useI18n, type MessageKey } from "@/i18n";
import { supabase } from "@/lib/supabase";
import { errorKey } from "@/lib/errors";
import { defaultTimes, rotaRoles, weekDays, weekStart, type RotaFunction } from "@/lib/management";
import { addDays, dublinParts, dublinWallTimeToDate, formatCivilDate, formatTime, isoDay, operationalDay } from "@/lib/time";
import { staffName, type StaffRole } from "@/lib/types";
import { useLatestRequest } from "@/lib/useLatestRequest";
import { Dialog, DialogCancel } from "@/components/Dialog";
import { Notice } from "@/components/Notice";
import { Skeleton } from "@/components/Skeleton";
import { useToast } from "@/components/Toast";

export type RotaShift = {
  id: string; staff_id: string; lodge_id: string | null; function: RotaFunction;
  starts_at: string; ends_at: string; status: "draft" | "published" | "cancelled";
  planned_starts_at?: string | null; planned_ends_at?: string | null;
};
type Hours = { staff_id: string; full_name: string; planned_minutes: number; effective_minutes: number };
type Gap = { lodge_id: string | null; lodge_code: string | null; kind: "day" | "night" | "float"; starts_at: string; ends_at: string };
type Person = { id: string; full_name: string; display_name: string | null; role: StaffRole };

/** 125 → "2 h 05". */
export function minutesLabel(m: number): string {
  const h = Math.floor(Math.abs(m) / 60);
  const mm = Math.abs(m) % 60;
  return `${h} h ${String(mm).padStart(2, "0")}`;
}
export function signedMinutes(m: number): string {
  return m === 0 ? "0 h 00" : `${m > 0 ? "+" : "−"}${minutesLabel(m)}`;
}

export const FN_LABEL: Record<RotaFunction, MessageKey> = { office: "rota.office", float: "rota.float", cleaner: "rota.cleaner", manager: "rota.managerFn" };

/** Dia civil (Dublin) em que um instante começa. */
function civilDay(iso: string): string {
  const p = dublinParts(new Date(iso));
  return isoDay(p.year, p.month, p.day);
}

/** Rota semanal (s.14): gestão monta e publica; a equipe vê só o publicado. */
export function Rota() {
  const { t, locale } = useI18n();
  const { lodges, isManagement } = useAuth();
  const toast = useToast();
  const latest = useLatestRequest();
  const [start, setStart] = useState(() => weekStart(operationalDay(new Date())));
  const [shifts, setShifts] = useState<RotaShift[] | null>(null);
  const [gaps, setGaps] = useState<Gap[]>([]);
  const [people, setPeople] = useState<Person[]>([]);
  const [hours, setHours] = useState<Hours[]>([]);
  const [editing, setEditing] = useState<{ shift?: RotaShift; day: string } | null>(null);
  const days = useMemo(() => weekDays(start), [start]);
  const from = useMemo(() => dublinWallTimeToDate(start, "00:00"), [start]);
  const to = useMemo(() => dublinWallTimeToDate(addDays(start, 7), "00:00"), [start]);

  const load = useCallback(async () => {
    const isLatest = latest();
    setShifts(null);
    const [{ data: s }, g, h] = await Promise.all([
      supabase.from("rota_shifts").select("id, staff_id, lodge_id, function, starts_at, ends_at, status, planned_starts_at, planned_ends_at")
        .neq("status", "cancelled").lt("starts_at", to.toISOString()).gt("ends_at", from.toISOString()).order("starts_at"),
      isManagement ? supabase.rpc("coverage_gaps", { p_from: from.toISOString(), p_to: to.toISOString() }) : Promise.resolve({ data: [] }),
      isManagement ? supabase.rpc("staff_hours", { p_from: from.toISOString(), p_to: to.toISOString() }) : Promise.resolve({ data: [] }),
    ]);
    if (!isLatest()) return;
    setShifts((s ?? []) as RotaShift[]);
    setGaps(((g as { data: Gap[] | null }).data ?? []) as Gap[]);
    setHours((((h as { data: Hours[] | null }).data ?? []) as Hours[]).filter((x) => x.planned_minutes > 0 || x.effective_minutes > 0));
  }, [from, to, isManagement, latest]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    void supabase.from("staff").select("id, full_name, display_name, role").eq("active", true).order("full_name")
      .then(({ data }) => setPeople((data ?? []) as Person[]));
  }, []);

  async function publish() {
    const { data, error } = await supabase.rpc("publish_rota", { p_from: from.toISOString(), p_to: to.toISOString() });
    if (error) return toast.error(t(errorKey(error)));
    const r = data as { published: number; gaps: number };
    toast.success(t("rota.published", { n: r.published }));
    if (r.gaps > 0) toast.error(t("rota.gaps", { n: r.gaps }));
    await load();
  }

  const person = (id: string) => people.find((p) => p.id === id);
  const lodgeShort = (id: string | null) => lodges.find((l) => l.id === id)?.short_name ?? "";
  const drafts = shifts?.filter((s) => s.status === "draft").length ?? 0;

  return (
    <section className="page">
      <header className="page-header">
        <div>
          <span className="eyebrow">{t("rota.eyebrow", { date: formatCivilDate(start, locale) })}</span>
          <h1>{t("rota.title")}</h1>
        </div>
        <div className="inline">
          <button className="icon-btn" aria-label={t("rota.prev")} onClick={() => setStart(addDays(start, -7))}><ChevronLeft size={18} /></button>
          <button className="icon-btn" aria-label={t("rota.next")} onClick={() => setStart(addDays(start, 7))}><ChevronRight size={18} /></button>
          {isManagement && <button className="primary" onClick={() => void publish()} disabled={drafts === 0}>{t("rota.publish")}{drafts > 0 && ` (${drafts})`}</button>}
        </div>
      </header>
      {!isManagement && <p className="hint">{t("rota.teamHint")}</p>}
      {isManagement && gaps.length > 0 && <Notice kind="warning">{t("rota.gaps", { n: gaps.length })}</Notice>}

      {shifts === null ? (
        <div className="card"><Skeleton rows={6} label={t("app.loading")} /></div>
      ) : (
        <div className="rota-week">
          {days.map((d) => {
            const dayShifts = shifts.filter((s) => civilDay(s.starts_at) === d);
            const dayGaps = gaps.filter((g) => civilDay(g.starts_at) === d);
            return (
              <div className="rota-day card" key={d}>
                <div className="rota-day-head">
                  <strong>{new Intl.DateTimeFormat(locale, { weekday: "short", timeZone: "UTC" }).format(new Date(`${d}T12:00:00Z`))}</strong>
                  <span className="muted">{formatCivilDate(d, locale)}</span>
                </div>
                <ul className="rota-shifts">
                  {dayShifts.map((s) => (
                    <li key={s.id}>
                      <button type="button" className={`rota-shift fn-${s.function}${s.status === "draft" ? " is-draft" : ""}`}
                        disabled={!isManagement} onClick={() => setEditing({ shift: s, day: d })}>
                        <span className="rota-time">{formatTime(s.starts_at, locale)}–{formatTime(s.ends_at, locale)}</span>
                        <span className="rota-who">{staffName(person(s.staff_id)) || "—"}</span>
                        <span className="rota-fn">{t(FN_LABEL[s.function])}{s.lodge_id && ` · ${lodgeShort(s.lodge_id)}`}{s.status === "draft" && ` · ${t("rota.draft")}`}</span>
                        {s.status === "published" && !s.planned_starts_at && <span className="rota-fn">{t("rota.cover")}</span>}
                        {s.planned_starts_at && s.planned_ends_at && (s.planned_starts_at !== s.starts_at || s.planned_ends_at !== s.ends_at) && (
                          <span className="rota-fn">{t("rota.plannedWas", { time: `${formatTime(s.planned_starts_at, locale)}–${formatTime(s.planned_ends_at, locale)}` })}</span>
                        )}
                      </button>
                    </li>
                  ))}
                  {dayGaps.map((g) => (
                    <li key={`${g.kind}-${g.lodge_id}-${g.starts_at}`} className="rota-gap">
                      {g.kind === "float" ? t("rota.float") : `${lodges.find((l) => l.id === g.lodge_id)?.short_name ?? g.lodge_code} · ${t(g.kind === "day" ? "rota.dayShift" : "rota.nightShift")}`} — {t("rota.uncovered")}
                    </li>
                  ))}
                </ul>
                {isManagement && <button className="ghost small" onClick={() => setEditing({ day: d })}>+ {t("rota.add")}</button>}
              </div>
            );
          })}
        </div>
      )}

      {isManagement && hours.length > 0 && (
        <>
          <h2 className="section-title">{t("rota.weekHours")}</h2>
          <table className="table">
            <thead>
              <tr><th>{t("rota.staff")}</th><th className="num">{t("hours.planned")}</th><th className="num">{t("hours.effective")}</th><th className="num">{t("rota.difference")}</th></tr>
            </thead>
            <tbody>
              {hours.map((h) => (
                <tr key={h.staff_id}>
                  <td>{h.full_name}</td>
                  <td className="num mono">{minutesLabel(h.planned_minutes)}</td>
                  <td className="num mono">{minutesLabel(h.effective_minutes)}</td>
                  <td className={`num mono${h.effective_minutes < h.planned_minutes ? " warn-text" : ""}`}>{signedMinutes(h.effective_minutes - h.planned_minutes)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="hint">{t("rota.hoursHint")}</p>
        </>
      )}

      {editing && (
        <ShiftDialog
          day={editing.day}
          shift={editing.shift}
          people={people}
          onClose={() => setEditing(null)}
          onDone={(msg) => {
            setEditing(null);
            toast.success(msg);
            void load();
          }}
        />
      )}
    </section>
  );
}

function ShiftDialog({ day, shift, people, onClose, onDone }: { day: string; shift?: RotaShift; people: Person[]; onClose: () => void; onDone: (msg: string) => void }) {
  const { t, locale } = useI18n();
  const { lodges } = useAuth();
  const initialFn: RotaFunction = shift?.function ?? "office";
  const [fn, setFn] = useState<RotaFunction>(initialFn);
  const [staffId, setStaffId] = useState(shift?.staff_id ?? "");
  const [lodgeId, setLodgeId] = useState(shift?.lodge_id ?? lodges[0]?.id ?? "");
  const [date, setDate] = useState(day);
  const [startT, setStartT] = useState(shift ? formatTime(shift.starts_at, "en-GB") : defaultTimes(initialFn, false).start);
  const [endT, setEndT] = useState(shift ? formatTime(shift.ends_at, "en-GB") : defaultTimes(initialFn, false).end);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const eligible = people.filter((p) => rotaRoles(fn).includes(p.role));

  function pickFn(next: RotaFunction, night = false) {
    setFn(next);
    const d = defaultTimes(next, night);
    setStartT(d.start);
    setEndT(d.end);
    if (!rotaRoles(next).includes(people.find((p) => p.id === staffId)?.role ?? "porter")) setStaffId("");
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const s = dublinWallTimeToDate(date, startT);
    // Fim igual ou antes do início = dia seguinte (Night 19–07, Float 12–24).
    const e2 = dublinWallTimeToDate(endT <= startT ? addDays(date, 1) : date, endT);
    const { error: err } = await supabase.rpc("save_rota_shift", {
      p_id: shift?.id ?? null, p_staff: staffId, p_lodge: fn === "float" ? null : lodgeId, p_function: fn,
      p_start: s.toISOString(), p_end: e2.toISOString(),
    });
    setBusy(false);
    if (err) return setError(t(errorKey(err)));
    onDone(t("rota.saved"));
  }

  const [splitAt, setSplitAt] = useState("12:00");
  const [cover, setCover] = useState("");
  async function split() {
    if (!shift) return;
    const startDay = civilDay(shift.starts_at);
    const at = dublinWallTimeToDate(splitAt <= formatTime(shift.starts_at, "en-GB") ? addDays(startDay, 1) : startDay, splitAt);
    const { error: err } = await supabase.rpc("split_rota_shift", { p_shift: shift.id, p_at: at.toISOString(), p_cover: cover || null });
    if (err) return setError(t(errorKey(err)));
    onDone(t("rota.splitDone"));
  }

  async function cancelShift() {
    if (!shift) return;
    const { error: err } = await supabase.rpc("cancel_rota_shift", { p_id: shift.id });
    if (err) return setError(t(errorKey(err)));
    onDone(t("rota.saved"));
  }

  return (
    <Dialog
      title={shift ? t("app.edit") : t("rota.add")}
      onClose={onClose}
      footer={
        <>
          {shift && <button type="button" className="danger-outline" style={{ marginRight: "auto" }} onClick={() => void cancelShift()}>{t("rota.cancelShift")}</button>}
          <DialogCancel>{t("app.cancel")}</DialogCancel>
          <button type="submit" form="shift-form" className="primary" disabled={!staffId || busy}>{t("app.save")}</button>
        </>
      }
    >
      <form id="shift-form" className="form" onSubmit={submit}>
        <div className="chip-row" role="group" aria-label={t("rota.function")}>
          {(["office", "float", "cleaner", "manager"] as RotaFunction[]).map((f) => (
            <button type="button" key={f} className={`chip${fn === f ? " is-on" : ""}`} aria-pressed={fn === f} onClick={() => pickFn(f)}>{t(FN_LABEL[f])}</button>
          ))}
        </div>
        {fn === "office" && (
          <div className="chip-row">
            <button type="button" className="chip" onClick={() => pickFn("office", false)}>{t("rota.dayShift")} 07–19</button>
            <button type="button" className="chip" onClick={() => pickFn("office", true)}>{t("rota.nightShift")} 19–07</button>
          </div>
        )}
        <div className="form-grid">
          <label>
            {t("rota.staff")}
            <select required value={staffId} onChange={(e) => setStaffId(e.target.value)}>
              <option value="" />
              {eligible.map((p) => <option key={p.id} value={p.id}>{staffName(p)}</option>)}
            </select>
          </label>
          {fn !== "float" && (
            <label>
              Lodge
              <select value={lodgeId} onChange={(e) => setLodgeId(e.target.value)}>
                {lodges.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select>
            </label>
          )}
          <label>{t("rota.day")}<input type="date" required value={date} onChange={(e) => setDate(e.target.value)} /></label>
          <label>{t("rota.start")}<input type="time" required value={startT} onChange={(e) => setStartT(e.target.value)} /></label>
          <label>{t("rota.end")}<input type="time" required value={endT} onChange={(e) => setEndT(e.target.value)} /></label>
        </div>
        {endT <= startT && <p className="hint">{t("rota.end")}: {formatCivilDate(addDays(date, 1), locale)}</p>}
        {shift && (
          <fieldset className="split-box">
            <legend>{t("rota.splitTitle")}</legend>
            <p className="hint">{t("rota.splitHint")}</p>
            <div className="form-grid">
              <label>{t("rota.leftAt")}<input type="time" value={splitAt} onChange={(e) => setSplitAt(e.target.value)} /></label>
              <label>
                {t("rota.coveredBy")}
                <select value={cover} onChange={(e) => setCover(e.target.value)}>
                  <option value="">{t("rota.noCover")}</option>
                  {eligible.filter((p) => p.id !== shift.staff_id).map((p) => <option key={p.id} value={p.id}>{staffName(p)}</option>)}
                </select>
              </label>
            </div>
            <button type="button" onClick={() => void split()}>{t("rota.split")}</button>
          </fieldset>
        )}
        <Notice kind="error">{error}</Notice>
      </form>
    </Dialog>
  );
}
