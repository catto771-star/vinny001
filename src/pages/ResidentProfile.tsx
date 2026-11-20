import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Link, useParams } from "react-router-dom";
import { useAuth } from "@/auth/AuthProvider";
import { useI18n } from "@/i18n";
import { supabase } from "@/lib/supabase";
import { errorKey } from "@/lib/errors";
import { roomLabel } from "@/lib/rooms";
import { formatCivilDate, formatDateTime } from "@/lib/time";
import { residentName, type StayStatus } from "@/lib/types";
import { FreeBedSelect } from "@/components/AdmitDialog";
import { DateTimeField } from "@/components/DateTimeField";
import { Dialog, DialogCancel } from "@/components/Dialog";
import { Notice } from "@/components/Notice";
import { Skeleton } from "@/components/Skeleton";
import { useToast } from "@/components/Toast";

type Resident = {
  id: string;
  first_name: string;
  last_name: string;
  date_of_birth: string | null;
  pass_id: string | null;
  notes: string | null;
  version: number;
  is_demo: boolean;
};

type Stay = {
  id: string;
  lodge_id: string;
  lodge_code: string;
  room_code: string;
  room_kind: "room" | "apartment";
  bed_number: number;
  status: StayStatus;
  admitted_at: string;
  ended_at: string | null;
  end_reason: "out" | "transfer" | null;
  out_reason: string | null;
  out_decided_at: string | null;
  out_decided_by_name: string | null;
  version: number;
};

type Action = "edit" | "decideOut" | "effectOut" | "transfer" | null;

export function ResidentProfile() {
  const { id = "" } = useParams();
  const { t, locale } = useI18n();
  const { lodges, canWriteLodge, isManagement, post } = useAuth();
  const [resident, setResident] = useState<Resident | null>(null);
  const [stays, setStays] = useState<Stay[]>([]);
  const [error, setError] = useState<string | null>(null);
  const toast = useToast();
  const [action, setAction] = useState<Action>(null);

  // A abertura do perfil passa sempre por open_resident_profile, que registra a leitura (B19).
  const load = useCallback(async () => {
    const { data, error: rpcError } = await supabase.rpc("open_resident_profile", { p_resident: id });
    if (rpcError) return setError(t(errorKey(rpcError)));
    const profile = data as { resident: Resident; stays: Stay[] };
    setResident(profile.resident);
    setStays(profile.stays);
  }, [id, t]);

  useEffect(() => {
    void load();
  }, [load]);

  const open = stays.find((s) => s.status !== "ended") ?? null;
  const lodgeName = (lodgeId: string) => lodges.find((l) => l.id === lodgeId)?.name ?? "";
  const canWriteHere = !!open && canWriteLodge(open.lodge_id);
  const canEdit = isManagement || !!post;

  async function done(message: string) {
    setAction(null);
    toast.success(message);
    setError(null);
    await load();
  }

  if (!resident) {
    return (
      <section className="page">
        <Notice kind="error">{error}</Notice>
        {!error && <div className="card"><Skeleton rows={6} label={t("app.loading")} /></div>}
      </section>
    );
  }

  return (
    <section className="page">
      <header className="page-header">
        <div>
          <Link to="/residents" className="muted">← {t("residents.title")}</Link>
          <h1>
            {residentName(resident)}
            {open && <span className="room-highlight">{roomLabel(t, open.room_kind, open.room_code)} · {t("beds.bedN", { n: open.bed_number })}</span>}
          </h1>
          <p className="hint">{t("residents.viewLogged")}</p>
        </div>
      </header>

      <Notice kind="error">{error}</Notice>

      <div className="card-grid">
        <article className="card">
          <dl className="details">
            <dt>{t("residents.dateOfBirth")}</dt>
            <dd>{formatCivilDate(resident.date_of_birth, locale) || t("app.none")}</dd>
            <dt>{t("residents.passId")}</dt>
            <dd>{resident.pass_id || t("app.none")}</dd>
            <dt>{t("residents.lodge")}</dt>
            <dd>{open ? lodgeName(open.lodge_id) : t("app.none")}</dd>
            <dt>{t("residents.notes")}</dt>
            <dd className="pre">{resident.notes || t("app.none")}</dd>
          </dl>
          {canEdit && <button onClick={() => setAction("edit")}>{t("residents.editDetails")}</button>}
        </article>

        {open && (
          <article className="card">
            <h2>{open.status === "out_pending" ? t("residents.stayOutPending") : t("residents.stayActive")}</h2>
            {open.status === "out_pending" && (
              <Notice kind="warning">
                {t("residents.outPendingBy", { name: open.out_decided_by_name ?? "", time: formatDateTime(open.out_decided_at ?? "", locale), reason: open.out_reason ?? "" })}
              </Notice>
            )}
            <div className="button-row">
              {open.status === "active" && canWriteHere && (
                <>
                  <button onClick={() => setAction("transfer")}>{t("residents.transfer")}</button>
                  <button className="danger-outline" onClick={() => setAction("decideOut")}>{t("residents.decideOut")}</button>
                </>
              )}
              {open.status === "out_pending" && canWriteHere && (
                <button
                  onClick={async () => {
                    const { error: e } = await supabase.rpc("withdraw_out", { p_stay: open.id });
                    if (e) setError(t(errorKey(e)));
                    else void done(t("residents.saved"));
                  }}
                >
                  {t("residents.withdrawOut")}
                </button>
              )}
              {isManagement && (
                <button className="danger" onClick={() => setAction("effectOut")}>{t("residents.effectOut")}</button>
              )}
            </div>
          </article>
        )}
      </div>

      <h2>{t("residents.stays")}</h2>
      <table className="table">
        <thead>
          <tr>
            <th>{t("residents.lodge")}</th>
            <th>{t("residents.room")}</th>
            <th>{t("residents.bed")}</th>
            <th>{t("residents.admitted")}</th>
            <th>{t("residents.ended")}</th>
            <th>{t("residents.filterStatus")}</th>
          </tr>
        </thead>
        <tbody>
          {stays.map((s) => (
            <tr key={s.id}>
              <td>{lodgeName(s.lodge_id)}</td>
              <td className="room-cell">{roomLabel(t, s.room_kind, s.room_code)}</td>
              <td>{s.bed_number}</td>
              <td>{formatDateTime(s.admitted_at, locale)}</td>
              <td>{s.ended_at ? formatDateTime(s.ended_at, locale) : ""}</td>
              <td>
                {s.status === "active"
                  ? t("residents.stayActive")
                  : s.status === "out_pending"
                    ? t("residents.stayOutPending")
                    : s.end_reason === "transfer"
                      ? t("residents.endReasonTransfer")
                      : `${t("residents.endReasonOut")}${s.out_reason ? ` — ${s.out_reason}` : ""}`}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {action === "edit" && <EditResident resident={resident} onClose={() => setAction(null)} onDone={() => void done(t("residents.saved"))} />}
      {action === "decideOut" && open && <DecideOut stayId={open.id} onClose={() => setAction(null)} onDone={() => void done(t("residents.saved"))} />}
      {action === "effectOut" && open && <EffectOut stayId={open.id} onClose={() => setAction(null)} onDone={() => void done(t("residents.saved"))} />}
      {action === "transfer" && open && <Transfer stay={open} onClose={() => setAction(null)} onDone={() => void done(t("residents.saved"))} />}
    </section>
  );
}

function useSubmit(onDone: () => void) {
  const { t } = useI18n();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function run(fn: () => PromiseLike<{ error: unknown }>) {
    setBusy(true);
    setError(null);
    const { error: e } = await fn();
    setBusy(false);
    if (e) setError(t(errorKey(e)));
    else onDone();
  }
  return { busy, error, run };
}

function EditResident({ resident, onClose, onDone }: { resident: Resident; onClose: () => void; onDone: () => void }) {
  const { t } = useI18n();
  const [form, setForm] = useState({
    first_name: resident.first_name,
    last_name: resident.last_name,
    date_of_birth: resident.date_of_birth ?? "",
    pass_id: resident.pass_id ?? "",
    notes: resident.notes ?? "",
  });
  const { busy, error, run } = useSubmit(onDone);

  function submit(e: FormEvent) {
    e.preventDefault();
    void run(() =>
      supabase
        .from("residents")
        .update({
          first_name: form.first_name.trim(),
          last_name: form.last_name.trim(),
          date_of_birth: form.date_of_birth || null,
          pass_id: form.pass_id.trim() || null,
          notes: form.notes.trim() || null,
          version: resident.version,
        })
        .eq("id", resident.id),
    );
  }

  const set = (key: keyof typeof form) => (e: { target: { value: string } }) => setForm({ ...form, [key]: e.target.value });

  return (
    <Dialog
      title={t("residents.editDetails")}
      onClose={onClose}
      footer={
        <>
          <DialogCancel>{t("app.cancel")}</DialogCancel>
          <button type="submit" form="edit-resident" className="primary" disabled={busy}>{t("app.save")}</button>
        </>
      }
    >
      <form id="edit-resident" className="form" onSubmit={submit}>
        <div className="form-grid">
          <label>{t("residents.firstName")}<input required value={form.first_name} onChange={set("first_name")} /></label>
          <label>{t("residents.lastName")}<input value={form.last_name} onChange={set("last_name")} /></label>
          <label>{t("residents.dateOfBirth")}<input type="date" value={form.date_of_birth} onChange={set("date_of_birth")} /></label>
          <label>{t("residents.passId")}<input value={form.pass_id} onChange={set("pass_id")} /></label>
        </div>
        <label>{t("residents.notes")}<textarea rows={3} value={form.notes} onChange={set("notes")} /></label>
        <Notice kind="error">{error}</Notice>
      </form>
    </Dialog>
  );
}

function DecideOut({ stayId, onClose, onDone }: { stayId: string; onClose: () => void; onDone: () => void }) {
  const { t } = useI18n();
  const [reason, setReason] = useState("");
  const { busy, error, run } = useSubmit(onDone);
  return (
    <Dialog
      title={t("residents.decideOutTitle")}
      onClose={onClose}
      footer={
        <>
          <DialogCancel>{t("app.cancel")}</DialogCancel>
          <button className="danger" disabled={busy || !reason.trim()} onClick={() => void run(() => supabase.rpc("decide_out", { p_stay: stayId, p_reason: reason }))}>
            {t("residents.decideOut")}
          </button>
        </>
      }
    >
      <p>{t("residents.decideOutIntro")}</p>
      <label className="form">
        {t("residents.outReason")}
        <textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} autoFocus />
      </label>
      <Notice kind="error">{error}</Notice>
    </Dialog>
  );
}

function EffectOut({ stayId, onClose, onDone }: { stayId: string; onClose: () => void; onDone: () => void }) {
  const { t } = useI18n();
  const [at, setAt] = useState<Date | null>(null);
  const { busy, error, run } = useSubmit(onDone);
  return (
    <Dialog
      title={t("residents.effectOutTitle")}
      onClose={onClose}
      footer={
        <>
          <DialogCancel>{t("app.cancel")}</DialogCancel>
          <button className="danger" disabled={busy} onClick={() => void run(() => supabase.rpc("effect_out", { p_stay: stayId, p_ended_at: at ? at.toISOString() : null }))}>
            {t("residents.effectOut")}
          </button>
        </>
      }
    >
      <p>{t("residents.effectOutIntro")}</p>
      <DateTimeField label="residents.outAt" value={at} onChange={setAt} />
      <Notice kind="error">{error}</Notice>
    </Dialog>
  );
}

function Transfer({ stay, onClose, onDone }: { stay: Stay; onClose: () => void; onDone: () => void }) {
  const { t } = useI18n();
  const { canWriteLodge } = useAuth();
  const [bedId, setBedId] = useState("");
  const [bedsLoading, setBedsLoading] = useState(true);
  const [at, setAt] = useState<Date | null>(null);
  const { busy, error, run } = useSubmit(onDone);
  // Pode transferir quem escreve no Lodge de origem ou de destino.
  const allow = (lodgeId: string) => canWriteLodge(stay.lodge_id) || canWriteLodge(lodgeId);
  return (
    <Dialog
      title={t("residents.transferTitle")}
      onClose={onClose}
      footer={
        <>
          <DialogCancel>{t("app.cancel")}</DialogCancel>
          <button className="primary" disabled={busy || bedsLoading || !bedId} onClick={() => void run(() => supabase.rpc("transfer_resident", { p_stay: stay.id, p_new_bed: bedId, p_at: at ? at.toISOString() : null }))}>
            {t("residents.transfer")}
          </button>
        </>
      }
    >
      <label className="form">
        {t("residents.bed")}
        <FreeBedSelect value={bedId} onChange={(b) => setBedId(b)} allowLodge={allow} onLoadingChange={setBedsLoading} />
      </label>
      <DateTimeField label="residents.transferAt" value={at} onChange={setAt} />
      <Notice kind="error">{error}</Notice>
    </Dialog>
  );
}
