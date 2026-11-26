import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useAuth } from "@/auth/AuthProvider";
import { useI18n } from "@/i18n";
import { supabase } from "@/lib/supabase";
import { errorKey } from "@/lib/errors";
import { roomLabel } from "@/lib/rooms";
import { formatCivilDate } from "@/lib/time";
import { residentName, type BedOccupancy } from "@/lib/types";
import { useOccupancy } from "@/lib/useOccupancy";
import { Dialog, DialogCancel } from "./Dialog";
import { DateTimeField } from "./DateTimeField";
import { Notice } from "./Notice";

type FormerResident = { resident_id: string; first_name: string; last_name: string; date_of_birth: string | null; pass_id: string; has_open_stay: boolean; last_ended_at: string | null; last_house: string | null };

/** Escolha de cama livre, agrupada por Lodge e quarto, só nos Lodges onde o usuário pode registrar. */
export function FreeBedSelect({
  value,
  onChange,
  exclude,
  allowLodge,
  onLoadingChange,
}: {
  value: string;
  onChange: (bedId: string, lodgeId: string) => void;
  exclude?: string;
  allowLodge: (lodgeId: string) => boolean;
  /** Avisa quando a lista de camas termina de carregar: antes disso o campo está vazio. */
  onLoadingChange?: (loading: boolean) => void;
}) {
  const { t } = useI18n();
  const { lodges } = useAuth();
  const { beds, loading } = useOccupancy();

  useEffect(() => {
    onLoadingChange?.(loading);
  }, [loading, onLoadingChange]);
  const free = beds.filter((b) => (!b.stay_id || b.stay_status === "out_pending") && b.bed_status === "in_use" && b.bed_id !== exclude && allowLodge(b.lodge_id));

  return (
    <select
      required
      disabled={loading}
      value={value}
      onChange={(e) => {
        const bed = free.find((b) => b.bed_id === e.target.value);
        if (bed) onChange(bed.bed_id, bed.lodge_id);
      }}
    >
      <option value="">{t("residents.chooseBed")}</option>
      {lodges
        .filter((l) => allowLodge(l.id))
        .map((l) => (
          <optgroup key={l.id} label={l.name}>
            {free
              .filter((b) => b.lodge_id === l.id)
              .map((b: BedOccupancy) => (
                <option key={b.bed_id} value={b.bed_id}>
                  {roomLabel(t, b.room_kind, b.room_code)} — {t("beds.bedN", { n: b.bed_number })}{b.stay_status === "out_pending" ? ` · ${t("beds.cancelledOf", { name: residentName(b) })}` : ""}
                </option>
              ))}
          </optgroup>
        ))}
    </select>
  );
}

export function AdmitDialog({
  onClose,
  onDone,
  initialBed,
}: {
  onClose: () => void;
  onDone: (residentId: string) => void;
  initialBed?: { bedId: string; lodgeId: string };
}) {
  const { t, locale } = useI18n();
  const { canWriteLodge } = useAuth();
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [dob, setDob] = useState("");
  const [passId, setPassId] = useState("");
  const [bedId, setBedId] = useState(initialBed?.bedId ?? "");
  const [lodgeId, setLodgeId] = useState(initialBed?.lodgeId ?? "");
  const [admittedAt, setAdmittedAt] = useState<Date | null>(null);
  const [found, setFound] = useState<FormerResident | null>(null);
  const [chosen, setChosen] = useState<FormerResident | null>(null);
  const [busy, setBusy] = useState(false);
  const [bedsLoading, setBedsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // PASS ID já cadastrado? Avisa e pergunta se quer puxar o cadastro (ex-residente) ou bloqueia (já internado).
  useEffect(() => {
    const id = passId.trim();
    if (chosen || id.length < 3) { setFound(null); return; }
    const handle = window.setTimeout(async () => {
      const { data } = await supabase.rpc("find_former_resident", { p_pass_id: id });
      const row = Array.isArray(data) ? (data[0] as FormerResident | undefined) : undefined;
      setFound(row ?? null);
    }, 300);
    return () => window.clearTimeout(handle);
  }, [passId, chosen]);

  const valid = useMemo(
    () => !bedsLoading && !!bedId && (chosen ? true : firstName.trim().length > 0 && passId.trim().length > 0 && !found),
    [bedsLoading, bedId, chosen, firstName, passId, found],
  );

  function loadFormer(r: FormerResident) {
    setChosen(r);
    setFound(null);
    setFirstName(r.first_name);
    setLastName(r.last_name);
    setDob(r.date_of_birth ?? "");
    setPassId(r.pass_id);
  }
  function changePassId() {
    setChosen(null);
    setFound(null);
    setFirstName("");
    setLastName("");
    setDob("");
    setPassId("");
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!valid) return;
    setBusy(true);
    setError(null);
    const { data: stayId, error: rpcError } = await supabase.rpc("admit_resident", {
      p_lodge: lodgeId,
      p_bed: bedId,
      p_resident_id: chosen?.resident_id ?? null,
      p_first_name: chosen ? null : firstName.trim(),
      p_last_name: chosen ? null : lastName.trim(),
      p_date_of_birth: !chosen && dob ? dob : null,
      p_pass_id: chosen ? null : passId.trim(),
      p_admitted_at: admittedAt ? admittedAt.toISOString() : null,
    });
    if (rpcError) {
      setBusy(false);
      return setError(t(errorKey(rpcError)));
    }
    const { data: stay } = await supabase.from("stays").select("resident_id").eq("id", stayId as string).single();
    setBusy(false);
    onDone((stay as { resident_id: string } | null)?.resident_id ?? "");
  }

  const fullName = found ? residentName(found as unknown as { first_name: string; last_name: string }) : "";
  return (
    <Dialog
      title={t("residents.admitTitle")}
      onClose={onClose}
      wide
      footer={
        <>
          <DialogCancel>{t("app.cancel")}</DialogCancel>
          <button type="submit" form="admit-form" className="primary" disabled={!valid || busy}>
            {busy ? t("app.saving") : t("residents.admit")}
          </button>
        </>
      }
    >
      <form id="admit-form" className="form" onSubmit={submit}>
        <label>
          {t("residents.passId")}
          <input required value={passId} onChange={(e) => setPassId(e.target.value)} disabled={!!chosen} autoFocus autoComplete="off" />
        </label>

        {found && (
          <div className="notice notice-warning former-alert" role="alert">
            {found.has_open_stay ? (
              <p>{t("residents.alreadyResidentHere", { name: fullName, house: found.last_house ?? "" })}</p>
            ) : (
              <>
                <p><strong>{t("residents.formerFound")}</strong></p>
                <p>{t("residents.formerDetails", { name: fullName, dob: formatCivilDate(found.date_of_birth, locale), left: found.last_ended_at ? formatCivilDate(found.last_ended_at.slice(0, 10), locale) : "—" })}</p>
                <div className="row-actions">
                  <button type="button" className="primary" onClick={() => loadFormer(found)}>{t("residents.formerUse")}</button>
                  <button type="button" onClick={changePassId}>{t("residents.formerChange")}</button>
                </div>
              </>
            )}
          </div>
        )}
        {chosen && (
          <div className="notice notice-info former-alert">
            <p>{t("residents.formerLoaded", { name: residentName(chosen as unknown as { first_name: string; last_name: string }) })}</p>
            <button type="button" onClick={changePassId}>{t("residents.formerChange")}</button>
          </div>
        )}

        <div className="form-grid">
          <label>
            {t("residents.firstName")}
            <input required value={firstName} onChange={(e) => setFirstName(e.target.value)} disabled={!!chosen} />
          </label>
          <label>
            {t("residents.lastName")}
            <input value={lastName} onChange={(e) => setLastName(e.target.value)} disabled={!!chosen} />
          </label>
          <label>
            {t("residents.dateOfBirth")}
            <input type="date" value={dob} onChange={(e) => setDob(e.target.value)} disabled={!!chosen} />
          </label>
        </div>

        <label>
          {t("residents.bed")}
          <FreeBedSelect value={bedId} allowLodge={canWriteLodge} onLoadingChange={setBedsLoading} onChange={(b, l) => { setBedId(b); setLodgeId(l); }} />
        </label>

        <DateTimeField label="residents.admittedAt" value={admittedAt} onChange={setAdmittedAt} />
        <Notice kind="error">{error}</Notice>
      </form>
    </Dialog>
  );
}
