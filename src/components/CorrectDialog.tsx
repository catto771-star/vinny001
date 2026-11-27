import { useState } from "react";
import { useI18n } from "@/i18n";
import { errorKey } from "@/lib/errors";
import { Dialog, DialogCancel } from "@/components/Dialog";
import { Notice } from "@/components/Notice";

export type CorrectField = { key: string; label: string; value: string; type?: "text" | "number" | "date"; step?: string };

/** Correção registrada: campos editáveis + motivo obrigatório. `onSubmit` devolve o erro do banco, se houver. */
export function CorrectDialog({ title, fields, onSubmit, onClose, onDone }: {
  title: string;
  fields: CorrectField[];
  onSubmit: (values: Record<string, string>, reason: string) => PromiseLike<{ error: { message?: string } | null }>;
  onClose: () => void;
  onDone: () => void;
}) {
  const { t } = useI18n();
  const [values, setValues] = useState<Record<string, string>>(() => Object.fromEntries(fields.map((f) => [f.key, f.value])));
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    setError(null);
    const { error: err } = await onSubmit(values, reason.trim());
    setBusy(false);
    if (err) return setError(t(errorKey(err)));
    onDone();
  }

  return (
    <Dialog
      title={title}
      onClose={onClose}
      footer={
        <>
          <DialogCancel>{t("app.cancel")}</DialogCancel>
          <button className="primary" disabled={busy || !reason.trim()} onClick={() => void save()}>{t("app.save")}</button>
        </>
      }
    >
      {fields.map((f) => (
        <label key={f.key} className="form">
          {f.label}
          <input type={f.type ?? "text"} step={f.step} value={values[f.key]} onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))} />
        </label>
      ))}
      <label className="form">
        {t("corrections.reason")}
        <input value={reason} maxLength={200} onChange={(e) => setReason(e.target.value)} />
      </label>
      <Notice kind="error">{error}</Notice>
    </Dialog>
  );
}
