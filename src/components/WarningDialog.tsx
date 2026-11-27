import { useState, type FormEvent } from "react";
import { useI18n, type MessageKey } from "@/i18n";
import { supabase } from "@/lib/supabase";
import { errorKey } from "@/lib/errors";
import { roomLabel } from "@/lib/rooms";
import { residentName, type BedOccupancy } from "@/lib/types";
import { Dialog, DialogCancel } from "./Dialog";
import { Notice } from "./Notice";
import { Tabs } from "./Tabs";

export type WarningType = "warning" | "final_warning";
export const WARNING_LABEL: Record<WarningType, MessageKey> = {
  warning: "warnings.t_warning",
  final_warning: "warnings.t_final_warning",
};

/** Registrar Warning (s.7): ligado à anotação do Handover e ao perfil; qualquer usuário registra. */
export function WarningDialog({
  residents,
  initialStay,
  onClose,
  onDone,
}: {
  residents: BedOccupancy[];
  initialStay?: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const { t } = useI18n();
  const [stayId, setStayId] = useState(initialStay ?? "");
  const [type, setType] = useState<WarningType>("warning");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    const { error: err } = await supabase.rpc("record_warning", { p_stay: stayId, p_type: type, p_note: note });
    setBusy(false);
    if (err) return setError(t(errorKey(err)));
    onDone();
  }

  return (
    <Dialog
      title={t("warnings.record")}
      onClose={onClose}
      footer={
        <>
          <DialogCancel>{t("app.cancel")}</DialogCancel>
          <button type="submit" form="warning-form" className={type === "final_warning" ? "danger" : "primary"} disabled={busy || !stayId}>
            {t("warnings.record")}
          </button>
        </>
      }
    >
      <form id="warning-form" className="form" onSubmit={submit}>
        <label>
          {t("sheet.resident")}
          <select required value={stayId} onChange={(e) => setStayId(e.target.value)} autoFocus={!initialStay}>
            <option value="" />
            {residents.filter((b) => b.stay_id).map((b) => (
              <option key={b.stay_id!} value={b.stay_id!}>
                {roomLabel(t, b.room_kind, b.room_code)} · {b.bed_number} — {residentName(b)}
              </option>
            ))}
          </select>
        </label>
        <div className="field">
          <span>{t("warnings.type")}</span>
          <Tabs
            label={t("warnings.type")}
            value={type}
            onChange={(v) => setType(v as WarningType)}
            items={(["warning", "final_warning"] as WarningType[]).map((w) => ({ value: w, label: t(WARNING_LABEL[w]) }))}
          />
        </div>
        <label>
          {t("warnings.note")}
          <textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} />
        </label>
        <p className="hint">{t("warnings.neverExpire")}</p>
        <Notice kind="error">{error}</Notice>
      </form>
    </Dialog>
  );
}
