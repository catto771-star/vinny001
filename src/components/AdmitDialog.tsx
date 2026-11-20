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

type FormerResident = { id: string; first_name: string; last_name: string; date_of_birth: string | null; pass_id: string | null };

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
  const free = beds.filter((b) => !b.stay_id && b.bed_status === "in_use" && b.bed_id !== exclude && allowLodge(b.lodge_id));

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
                  {roomLabel(t, b.room_kind, b.room_code)} — {t("beds.bedN", { n: b.bed_number })}
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
  const [mode, setMode] = useState<"new" | "existing">("new");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [dob, setDob] = useState("");
  const [passId, setPassId] = useState("");
  const [bedId, setBedId] = useState(initialBed?.bedId ?? "");
  const [lodgeId, setLodgeId] = useState(initialBed?.lodgeId ?? "");
  const [admittedAt, setAdmittedAt] = useState<Date | null>(null);
  const [query, setQuery] = useState("");
  const [former, setFormer] = useState<FormerResident[]>([]);
  const [chosen, setChosen] = useState<FormerResident | null>(null);
  const [busy, setBusy] = useState(false);
  const [bedsLoading, setBedsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Ex-residentes sem estadia aberta (readmissão).
  useEffect(() => {
    if (mode !== "existing" || query.trim().length < 2) {
      setFormer([]);
      return;
    }
    const term = query.trim().replace(/[%,()]/g, " ");
    const handle = window.setTimeout(async () => {
      const { data } = await supabase
        .from("residents")
        .select("id, first_name, last_name, date_of_birth, pass_id, stays(status)")
        .or(`first_name.ilike.%${term}%,last_name.ilike.%${term}%,pass_id.ilike.%${term}%`)
        .limit(20);
      const rows = (data ?? []) as Array<FormerResident & { stays: { status: string }[] }>;
      setFormer(rows.filter((r) => r.stays.every((s) => s.status === "ended")));
    }, 250);
    return () => window.clearTimeout(handle);
  }, [mode, query]);

  const valid = useMemo(
    () => !bedsLoading && !!bedId && (mode === "new" ? firstName.trim().length > 0 : !!chosen),
    [bedsLoading, bedId, mode, firstName, chosen],
  );

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!valid) return;
    setBusy(true);
    setError(null);
    const { data: stayId, error: rpcError } = await supabase.rpc("admit_resident", {
      p_lodge: lodgeId,
      p_bed: bedId,
      p_resident_id: mode === "existing" ? chosen?.id : null,
      p_first_name: mode === "new" ? firstName.trim() : null,
      p_last_name: mode === "new" ? lastName.trim() : null,
      p_date_of_birth: mode === "new" && dob ? dob : null,
      p_pass_id: mode === "new" && passId.trim() ? passId.trim() : null,
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
        <div className="segmented">
          <button type="button" className={mode === "new" ? "selected" : ""} onClick={() => setMode("new")}>
            {t("residents.newResident")}
          </button>
          <button type="button" className={mode === "existing" ? "selected" : ""} onClick={() => setMode("existing")}>
            {t("residents.existingResident")}
          </button>
        </div>

        {mode === "new" ? (
          <div className="form-grid">
            <label>
              {t("residents.firstName")}
              <input required value={firstName} onChange={(e) => setFirstName(e.target.value)} autoFocus />
            </label>
            <label>
              {t("residents.lastName")}
              <input value={lastName} onChange={(e) => setLastName(e.target.value)} />
            </label>
            <label>
              {t("residents.dateOfBirth")}
              <input type="date" value={dob} onChange={(e) => setDob(e.target.value)} />
            </label>
            <label>
              {t("residents.passId")} <small>({t("app.optional")})</small>
              <input value={passId} onChange={(e) => setPassId(e.target.value)} />
            </label>
          </div>
        ) : (
          <div className="form">
            <label>
              {t("app.search")}
              <input value={query} onChange={(e) => { setQuery(e.target.value); setChosen(null); }} placeholder={t("residents.searchPlaceholder")} autoFocus />
            </label>
            <ul className="pick-list">
              {former.map((r) => (
                <li key={r.id}>
                  <button type="button" className={chosen?.id === r.id ? "selected" : ""} onClick={() => setChosen(r)}>
                    <strong>{residentName(r)}</strong> {formatCivilDate(r.date_of_birth, locale)} {r.pass_id && `· ${r.pass_id}`}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

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
