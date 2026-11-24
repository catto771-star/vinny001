import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { ChevronLeft, ChevronRight, Lock } from "lucide-react";
import { useAuth } from "@/auth/AuthProvider";
import { useI18n, type MessageKey } from "@/i18n";
import { supabase } from "@/lib/supabase";
import { errorKey } from "@/lib/errors";
import { formatCivilDate, operationalDay } from "@/lib/time";
import { staffName, type StaffRole } from "@/lib/types";
import { useLatestRequest } from "@/lib/useLatestRequest";
import { Dialog, DialogCancel } from "@/components/Dialog";
import { Notice } from "@/components/Notice";
import { Skeleton } from "@/components/Skeleton";
import { useToast } from "@/components/Toast";

export type HolidayStatus = "under_review" | "approved" | "locked";
export type CalendarDay = {
  day: string;
  status: HolidayStatus;
  people: { names: { name: string; status: "under_review" | "approved"; vacation_id: string }[]; lock_note: string | null } | null;
};
type Person = { id: string; full_name: string; display_name: string | null; role: StaffRole };
type LockRow = { id: string; starts_on: string; ends_on: string; note: string | null };

const STATUS_LABEL: Record<HolidayStatus, MessageKey> = {
  under_review: "vacations.underReview",
  approved: "vacations.approved",
  locked: "vacations.locked",
};

/** Dias do mês para a grade (segunda a domingo), com vazios antes do dia 1. */
export function monthGrid(year: number, month: number): (string | null)[] {
  const first = new Date(Date.UTC(year, month - 1, 1));
  const days = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const lead = (first.getUTCDay() + 6) % 7;
  const cells: (string | null)[] = Array.from({ length: lead }, () => null);
  for (let d = 1; d <= days; d++) cells.push(`${year}-${String(month).padStart(2, "0")}-${String(d).padStart(2, "0")}`);
  return cells;
}

/** Holidays (escopo Beta 4.2): calendário do ano. A equipe vê só o status do dia; o Admin vê nomes e edita. */
export function Vacations() {
  const { t, locale } = useI18n();
  const { isManagement } = useAuth();
  const toast = useToast();
  const latest = useLatestRequest();
  const [year, setYear] = useState(() => Number(operationalDay(new Date()).slice(0, 4)));
  const [days, setDays] = useState<CalendarDay[] | null>(null);
  const [locks, setLocks] = useState<LockRow[]>([]);
  const [people, setPeople] = useState<Person[]>([]);
  const [registering, setRegistering] = useState(false);
  const [locking, setLocking] = useState(false);
  const [openDay, setOpenDay] = useState<CalendarDay | null>(null);
  const [conflict, setConflict] = useState<number | null>(null);

  const load = useCallback(async () => {
    const isLatest = latest();
    setDays(null);
    const [{ data }, { data: l }] = await Promise.all([
      supabase.rpc("holiday_calendar", { p_year: year }),
      supabase.from("holiday_locks").select("id, starts_on, ends_on, note").eq("active", true).order("starts_on"),
    ]);
    if (!isLatest()) return;
    setDays((data ?? []) as CalendarDay[]);
    setLocks((l ?? []) as LockRow[]);
  }, [year, latest]);

  useEffect(() => void load(), [load]);
  useEffect(() => {
    if (!isManagement) return;
    void supabase.from("staff").select("id, full_name, display_name, role").eq("active", true).order("full_name")
      .then(({ data }) => setPeople(((data ?? []) as Person[]).filter((p) => p.role !== "station")));
  }, [isManagement]);

  const byDay = useMemo(() => new Map((days ?? []).map((d) => [d.day, d])), [days]);
  const monthName = (m: number) => new Intl.DateTimeFormat(locale, { month: "long", timeZone: "UTC" }).format(new Date(Date.UTC(year, m - 1, 1)));
  const weekdays = useMemo(() => [0, 1, 2, 3, 4, 5, 6].map((i) => new Intl.DateTimeFormat(locale, { weekday: "narrow", timeZone: "UTC" }).format(new Date(Date.UTC(2024, 0, 1 + i)))), [locale]);

  async function setStatus(id: string, status: "under_review" | "approved" | "cancelled") {
    const { error } = await supabase.rpc("set_vacation_status", { p_id: id, p_status: status });
    if (error) return toast.error(t(errorKey(error)));
    setOpenDay(null);
    void load();
  }

  async function unlock(id: string) {
    const { error } = await supabase.rpc("unlock_holiday_dates", { p_id: id });
    if (error) return toast.error(t(errorKey(error)));
    void load();
  }

  return (
    <section className="page">
      <header className="page-header">
        <div>
          <span className="eyebrow">{isManagement ? t("vacations.eyebrowAdmin") : t("vacations.eyebrowStaff")}</span>
          <h1>{t("vacations.title")} <span className="mono">{year}</span></h1>
        </div>
        <div className="inline">
          <button className="icon-btn" aria-label={t("vacations.prevYear")} onClick={() => setYear(year - 1)}><ChevronLeft size={18} /></button>
          <button className="icon-btn" aria-label={t("vacations.nextYear")} onClick={() => setYear(year + 1)}><ChevronRight size={18} /></button>
          {isManagement && <button onClick={() => setLocking(true)}><Lock size={15} aria-hidden="true" /> {t("vacations.lock")}</button>}
          {isManagement && <button className="primary" onClick={() => setRegistering(true)}>{t("vacations.register")}</button>}
        </div>
      </header>
      {conflict !== null && conflict > 0 && <Notice kind="warning">{t("vacations.conflict", { n: conflict })}</Notice>}

      <div className="holiday-legend" aria-label={t("vacations.legend")}>
        {(["under_review", "approved", "locked"] as HolidayStatus[]).map((s) => (
          <span key={s}><i className={`holiday-swatch is-${s}`} aria-hidden="true" />{t(STATUS_LABEL[s])}</span>
        ))}
      </div>

      {days === null ? (
        <div className="card"><Skeleton rows={6} label={t("app.loading")} /></div>
      ) : (
        <div className="holiday-year">
          {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
            <article key={m} className="holiday-month card">
              <h2>{monthName(m)}</h2>
              <div className="holiday-grid">
                {weekdays.map((w, i) => <span key={`w${i}`} className="holiday-wd" aria-hidden="true">{w}</span>)}
                {monthGrid(year, m).map((d, i) => {
                  if (!d) return <span key={`e${i}`} />;
                  const info = byDay.get(d);
                  const label = `${formatCivilDate(d, locale)}${info ? ` · ${t(STATUS_LABEL[info.status])}` : ""}`;
                  return (
                    <button
                      key={d}
                      type="button"
                      className={`holiday-day${info ? ` is-${info.status}` : ""}`}
                      aria-label={label}
                      title={label}
                      disabled={!info || !isManagement}
                      onClick={() => info && setOpenDay(info)}
                    >
                      {Number(d.slice(8))}
                    </button>
                  );
                })}
              </div>
            </article>
          ))}
        </div>
      )}

      {isManagement && locks.length > 0 && (
        <>
          <h2 className="section-title">{t("vacations.lockedPeriods")}</h2>
          <ul className="log-list">
            {locks.map((l) => (
              <li key={l.id}>
                <span>{formatCivilDate(l.starts_on, locale)} → {formatCivilDate(l.ends_on, locale)}</span>
                <span className="muted">{l.note}</span>
                <button className="small" onClick={() => void unlock(l.id)}>{t("vacations.unlock")}</button>
              </li>
            ))}
          </ul>
        </>
      )}

      {openDay && (
        <Dialog title={formatCivilDate(openDay.day, locale)} onClose={() => setOpenDay(null)}>
          {openDay.people?.lock_note !== undefined && openDay.status === "locked" && <Notice kind="info">{t("vacations.lockedDay")}{openDay.people?.lock_note ? ` — ${openDay.people.lock_note}` : ""}</Notice>}
          <ul className="log-list">
            {(openDay.people?.names ?? []).map((n) => (
              <li key={`${n.vacation_id}`}>
                <strong>{n.name}</strong>
                <span className={`tag holiday-tag is-${n.status}`}>{t(STATUS_LABEL[n.status])}</span>
                {n.status === "under_review" && <button className="small" onClick={() => void setStatus(n.vacation_id, "approved")}>{t("vacations.approve")}</button>}
                {n.status === "approved" && <button className="small" onClick={() => void setStatus(n.vacation_id, "under_review")}>{t("vacations.backToReview")}</button>}
                <button className="small danger-outline" onClick={() => void setStatus(n.vacation_id, "cancelled")}>{t("vacations.cancel")}</button>
              </li>
            ))}
          </ul>
        </Dialog>
      )}
      {registering && (
        <RegisterDialog
          people={people}
          onClose={() => setRegistering(false)}
          onDone={(conflicts) => {
            setRegistering(false);
            setConflict(conflicts);
            toast.success(t("vacations.saved"));
            void load();
          }}
        />
      )}
      {locking && (
        <LockDialog
          onClose={() => setLocking(false)}
          onDone={() => {
            setLocking(false);
            void load();
          }}
        />
      )}
    </section>
  );
}

function RegisterDialog({ people, onClose, onDone }: { people: Person[]; onClose: () => void; onDone: (conflicts: number) => void }) {
  const { t } = useI18n();
  const today = operationalDay(new Date());
  const [staffId, setStaffId] = useState("");
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);
  const [status, setStatus] = useState<"under_review" | "approved">("under_review");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const { data, error: err } = await supabase.rpc("register_vacation", { p_staff: staffId, p_start: from, p_end: to, p_note: note, p_status: status });
    if (err) return setError(t(errorKey(err)));
    onDone((data as { conflicts: number }).conflicts);
  }

  return (
    <Dialog title={t("vacations.register")} onClose={onClose} footer={<><DialogCancel>{t("app.cancel")}</DialogCancel><button type="submit" form="vac-form" className="primary" disabled={!staffId}>{t("app.save")}</button></>}>
      <form id="vac-form" className="form" onSubmit={submit}>
        <div className="form-grid">
          <label>
            {t("rota.staff")}
            <select required value={staffId} onChange={(e) => setStaffId(e.target.value)}>
              <option value="" />
              {people.map((p) => <option key={p.id} value={p.id}>{staffName(p)}</option>)}
            </select>
          </label>
          <label>
            {t("vacations.status")}
            <select value={status} onChange={(e) => setStatus(e.target.value as "under_review" | "approved")}>
              <option value="under_review">{t("vacations.underReview")}</option>
              <option value="approved">{t("vacations.approved")}</option>
            </select>
          </label>
          <label>{t("vacations.from")}<input type="date" required value={from} onChange={(e) => setFrom(e.target.value)} /></label>
          <label>{t("vacations.until")}<input type="date" required value={to} min={from} onChange={(e) => setTo(e.target.value)} /></label>
        </div>
        <label>{t("vacations.note")} <small>({t("app.optional")})</small><input value={note} onChange={(e) => setNote(e.target.value)} /></label>
        <Notice kind="error">{error}</Notice>
      </form>
    </Dialog>
  );
}

function LockDialog({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const { t } = useI18n();
  const today = operationalDay(new Date());
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  async function submit() {
    const { error: err } = await supabase.rpc("lock_holiday_dates", { p_start: from, p_end: to, p_note: note });
    if (err) return setError(t(errorKey(err)));
    onDone();
  }
  return (
    <Dialog title={t("vacations.lock")} onClose={onClose} footer={<><DialogCancel>{t("app.cancel")}</DialogCancel><button className="primary" onClick={() => void submit()}>{t("vacations.lock")}</button></>}>
      <div className="form">
        <div className="form-grid">
          <label>{t("vacations.from")}<input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></label>
          <label>{t("vacations.until")}<input type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} /></label>
        </div>
        <label>{t("vacations.note")} <small>({t("app.optional")})</small><input value={note} placeholder={t("vacations.lockHint")} onChange={(e) => setNote(e.target.value)} /></label>
        <Notice kind="error">{error}</Notice>
      </div>
    </Dialog>
  );
}
