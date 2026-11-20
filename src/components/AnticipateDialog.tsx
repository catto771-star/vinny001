import { useState } from "react";
import { useI18n } from "@/i18n";
import { supabase } from "@/lib/supabase";
import { errorKey } from "@/lib/errors";
import { Dialog, DialogCancel } from "./Dialog";
import { Notice } from "./Notice";

/** B05: residente em ausência comunicada foi visto → "Deseja antecipar a presença deste residente?" */
export function AnticipateDialog({ absenceId, onClose }: { absenceId: string; onClose: (ended: boolean) => void }) {
  const { t } = useI18n();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirm() {
    setBusy(true);
    const { error: e } = await supabase.rpc("end_absence", { p_absence: absenceId, p_returned_at: null });
    setBusy(false);
    if (e) return setError(t(errorKey(e)));
    onClose(true);
  }

  return (
    <Dialog
      title={t("sheet.anticipateTitle")}
      onClose={() => onClose(false)}
      footer={
        <>
          <DialogCancel>{t("sheet.anticipateNo")}</DialogCancel>
          <button className="primary" disabled={busy} onClick={() => void confirm()}>
            {t("sheet.anticipateYes")}
          </button>
        </>
      }
    >
      <p>{t("sheet.anticipateBody")}</p>
      <Notice kind="error">{error}</Notice>
    </Dialog>
  );
}
