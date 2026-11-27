import { useMemo, useState, type FormEvent } from "react";
import { useI18n, type MessageKey } from "@/i18n";
import { supabase } from "@/lib/supabase";
import { errorKey } from "@/lib/errors";
import { formatDateTime } from "@/lib/time";
import { Dialog, DialogCancel } from "./Dialog";
import { Notice } from "./Notice";
import { Tabs } from "./Tabs";

export type Priority = "urgent" | "normal" | "low";
const DEFAULT_HOURS: Record<Priority, number> = { urgent: 24, normal: 168, low: 720 };
export const PRIORITY_LABEL: Record<Priority, MessageKey> = { urgent: "maintenance.p_urgent", normal: "maintenance.p_normal", low: "maintenance.p_low" };

/** Novo chamado (s.7): só local, descrição e prioridade; prazo sugerido; um clique não duplica (B32). */
export function MaintenanceDialog({ lodgeId, onClose, onDone }: { lodgeId: string; onClose: () => void; onDone: () => void }) {
  const { t, locale } = useI18n();
  const [location, setLocation] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<Priority>("normal");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Mesmo pedido mesmo se o botão for clicado duas vezes (o servidor não duplica).
  const requestKey = useMemo(() => crypto.randomUUID(), []);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error: err } = await supabase.rpc("create_maintenance", {
      p_lodge: lodgeId,
      p_location: location,
      p_description: description,
      p_priority: priority,
      p_request_key: requestKey,
    });
    setBusy(false);
    if (err) return setError(t(errorKey(err)));
    onDone();
  }

  return (
    <Dialog
      title={t("maintenance.new")}
      onClose={onClose}
      footer={
        <>
          <DialogCancel>{t("app.cancel")}</DialogCancel>
          <button type="submit" form="maintenance-form" className="primary" disabled={busy || !location.trim() || !description.trim()}>
            {t("app.save")}
          </button>
        </>
      }
    >
      <form id="maintenance-form" className="form" onSubmit={submit}>
        <label>
          {t("maintenance.location")}
          <input required value={location} onChange={(e) => setLocation(e.target.value)} autoFocus />
        </label>
        <label>
          {t("maintenance.description")}
          <textarea required rows={3} value={description} onChange={(e) => setDescription(e.target.value)} />
        </label>
        <div className="field">
          <span>{t("maintenance.priority")}</span>
          <Tabs
            label={t("maintenance.priority")}
            value={priority}
            onChange={(v) => setPriority(v as Priority)}
            items={(["urgent", "normal", "low"] as Priority[]).map((p) => ({ value: p, label: t(PRIORITY_LABEL[p]) }))}
          />
        </div>
        <p className="hint">
          {t("maintenance.deadlineHint", { deadline: formatDateTime(new Date(Date.now() + DEFAULT_HOURS[priority] * 3_600_000), locale) })}
        </p>
        <Notice kind="error">{error}</Notice>
      </form>
    </Dialog>
  );
}
