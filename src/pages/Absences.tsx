import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "@/auth/AuthProvider";
import { useI18n } from "@/i18n";
import { supabase } from "@/lib/supabase";
import { useLatestRequest } from "@/lib/useLatestRequest";
import { errorKey } from "@/lib/errors";
import { roomLabel } from "@/lib/rooms";
import { formatDateTime } from "@/lib/time";
import { residentName } from "@/lib/types";
import { useOccupancy } from "@/lib/useOccupancy";
import { DateTimeInput } from "@/components/DateTimeInput";
import { Dialog, DialogCancel } from "@/components/Dialog";
import { LodgeTabs } from "@/components/LodgeTabs";
import { useLodgeState } from "@/lib/activeLodge";
import { Notice } from "@/components/Notice";
import { Skeleton } from "@/components/Skeleton";
import { useToast } from "@/components/Toast";

type AbsenceRow = {
  id: string;
  stay_id: string;
  resident_id: string;
  starts_at: string;
  expected_return_at: string;
  ended_at: string | null;
  notes: string | null;
  residents: { first_name: string; last_name: string } | null;
};

export function absenceState(a: Pick<AbsenceRow, "ended_at" | "expected_return_at">, now: Date): "active" | "overdue" | "ended" {
  if (a.ended_at) return "ended";
  return new Date(a.expected_return_at).getTime() < now.getTime() ? "overdue" : "active";
}

/** Ausências comunicadas (s.5): protegem a cama e impedem No Show; retorno vencido é pendência. */
export function Absences() {
  const { t, locale } = useI18n();
  const { canWriteLodge, serverOffsetMs } = useAuth();
  const [lodgeId, setLodgeId] = useLodgeState();
  const { beds } = useOccupancy(lodgeId);
  const [rows, setRows] = useState<AbsenceRow[]>([]);
  const [registering, setRegistering] = useState(false);
  const [returning, setReturning] = useState<AbsenceRow | null>(null);
  const [error, setError] = useState<string | null>(null);
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const now = new Date(Date.now() + serverOffsetMs);
  const canWrite = canWriteLodge(lodgeId);

  const begin = useLatestRequest();
  const load = useCallback(async () => {
    const isLatest = begin();
    const { data, error: e } = await supabase
      .from("absences")
      .select("id, stay_id, resident_id, starts_at, expected_return_at, ended_at, notes, residents(first_name, last_name), stays!inner(lodge_id)")
      .eq("stays.lodge_id", lodgeId)
      .order("ended_at", { ascending: false, nullsFirst: true })
      .order("expected_return_at")
      .limit(200);
    if (!isLatest()) return;
    setLoading(false);
    if (e) return setError(t(errorKey(e)));
    setRows((data ?? []) as unknown as AbsenceRow[]);
  }, [lodgeId, t, begin]);

  useEffect(() => {
    void load();
  }, [load]);

  const roomOf = (stayId: string) => {
    const b = beds.find((x) => x.stay_id === stayId);
    return b ? `${roomLabel(t, b.room_kind, b.room_code)} · ${b.bed_number}` : "";
  };

  return (
    <section className="page">
      <header className="page-header">
        <h1>{t("absences.title")}</h1>
        <LodgeTabs value={lodgeId} onChange={setLodgeId} />
      </header>
      <p className="hint">{t("absences.protectsBed")}</p>
      {canWrite && (
        <div className="button-row">
          <button className="primary" onClick={() => setRegistering(true)}>{t("absences.register")}</button>
        </div>
      )}
      <Notice kind="error">{error}</Notice>

      {loading ? <div className="card"><Skeleton rows={5} label={t("app.loading")} /></div> : (
      <table className="table">
        <thead>
          <tr>
            <th>{t("sheet.resident")}</th>
            <th>{t("sheet.room")}</th>
            <th>{t("absences.startsAt")}</th>
            <th>{t("absences.expectedReturn")}</th>
            <th>{t("residents.filterStatus")}</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {rows.map((a) => {
            const state = absenceState(a, now);
            return (
              <tr key={a.id} className={state === "ended" ? "row-inactive" : ""}>
                <td>
                  <Link to={`/residents/${a.resident_id}`}>{a.residents ? residentName(a.residents) : ""}</Link>
                  {a.notes && <div className="muted small-text">{a.notes}</div>}
                </td>
                <td className="room-cell">{roomOf(a.stay_id)}</td>
                <td>{formatDateTime(a.starts_at, locale)}</td>
                <td>{formatDateTime(a.expected_return_at, locale)}</td>
                <td>
                  {state === "overdue" ? (
                    <span className="tag tag-danger">{t("absences.overdue")}</span>
                  ) : state === "active" ? (
                    t("absences.active")
                  ) : (
                    `${t("absences.returned")} ${formatDateTime(a.ended_at!, locale)}`
                  )}
                </td>
                <td>
                  {state !== "ended" && canWrite && (
                    <button className="small" onClick={() => setReturning(a)}>{t("absences.recordReturn")}</button>
                  )}
                </td>
              </tr>
            );
          })}
          {rows.length === 0 && (
            <tr><td colSpan={6} className="muted">{t("absences.empty")}</td></tr>
          )}
        </tbody>
      </table>
      )}

      {registering && (
        <RegisterAbsence
          stays={beds.filter((b) => b.stay_id && b.stay_status === "active")}
          onClose={() => setRegistering(false)}
          onDone={() => {
            setRegistering(false);
            toast.success(t("absences.saved"));
            void load();
          }}
        />
      )}
      {returning && (
        <RecordReturn
          absence={returning}
          onClose={() => setReturning(null)}
          onDone={() => {
            setReturning(null);
            toast.success(t("residents.saved"));
            void load();
          }}
        />
      )}
    </section>
  );
}

function RegisterAbsence({
  stays,
  onClose,
  onDone,
}: {
  stays: ReturnType<typeof useOccupancy>["beds"];
  onClose: () => void;
  onDone: () => void;
}) {
  const { t } = useI18n();
  const [stayId, setStayId] = useState("");
  const [startsAt, setStartsAt] = useState<Date | null>(new Date());
  const [expected, setExpected] = useState<Date | null>(null);
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!stayId || !startsAt || !expected) return;
    setBusy(true);
    const { error: err } = await supabase.rpc("register_absence", {
      p_stay: stayId,
      p_starts_at: startsAt.toISOString(),
      p_expected_return_at: expected.toISOString(),
      p_notes: notes,
    });
    setBusy(false);
    if (err) return setError(t(errorKey(err)));
    onDone();
  }

  return (
    <Dialog
      title={t("absences.register")}
      onClose={onClose}
      footer={
        <>
          <DialogCancel>{t("app.cancel")}</DialogCancel>
          <button type="submit" form="absence-form" className="primary" disabled={busy || !stayId || !startsAt || !expected}>
            {t("app.save")}
          </button>
        </>
      }
    >
      <form id="absence-form" className="form" onSubmit={submit}>
        <label>
          {t("sheet.resident")}
          <select required value={stayId} onChange={(e) => setStayId(e.target.value)} autoFocus>
            <option value="" />
            {stays.map((b) => (
              <option key={b.stay_id!} value={b.stay_id!}>
                {roomLabel(t, b.room_kind, b.room_code)} · {b.bed_number} — {residentName(b)}
              </option>
            ))}
          </select>
        </label>
        <label>
          {t("absences.startsAt")}
          <DateTimeInput required value={startsAt} onChange={setStartsAt} />
        </label>
        <label>
          {t("absences.expectedReturn")}
          <DateTimeInput required value={expected} onChange={setExpected} />
        </label>
        <label>
          {t("absences.notes")} <small>({t("app.optional")})</small>
          <textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </label>
        <Notice kind="error">{error}</Notice>
      </form>
    </Dialog>
  );
}

function RecordReturn({ absence, onClose, onDone }: { absence: AbsenceRow; onClose: () => void; onDone: () => void }) {
  const { t } = useI18n();
  const [at, setAt] = useState<Date | null>(new Date());
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    const { error: err } = await supabase.rpc("end_absence", { p_absence: absence.id, p_returned_at: at ? at.toISOString() : null });
    if (err) return setError(t(errorKey(err)));
    onDone();
  }

  return (
    <Dialog
      title={t("absences.recordReturn")}
      onClose={onClose}
      footer={
        <>
          <DialogCancel>{t("app.cancel")}</DialogCancel>
          <button className="primary" onClick={() => void submit()}>{t("app.save")}</button>
        </>
      }
    >
      <p>{absence.residents ? residentName(absence.residents) : ""}</p>
      <label className="form">
        {t("absences.returnedAt")}
        <DateTimeInput required value={at} onChange={setAt} />
      </label>
      <Notice kind="error">{error}</Notice>
    </Dialog>
  );
}
