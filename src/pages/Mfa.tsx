import { useEffect, useState, type FormEvent } from "react";
import { useAuth } from "@/auth/AuthProvider";
import { useI18n } from "@/i18n";
import { supabase } from "@/lib/supabase";
import { Notice } from "@/components/Notice";
import { AuthCard } from "./Login";

/** Verificação em duas etapas (TOTP) para Manager, Owner e Developer (s.4). */
export function Mfa({ enrol }: { enrol: boolean }) {
  const { t } = useI18n();
  const { refresh, signOut } = useAuth();
  const [factorId, setFactorId] = useState<string | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function prepare() {
      const { data: factors } = await supabase.auth.mfa.listFactors();
      const verified = factors?.totp?.find((f) => f.status === "verified");
      if (verified) {
        if (!cancelled) setFactorId(verified.id);
        return;
      }
      // Remove inscrições não concluídas antes de criar uma nova.
      for (const f of factors?.all ?? []) {
        if (f.status !== "verified") await supabase.auth.mfa.unenroll({ factorId: f.id });
      }
      const { data, error: enrolError } = await supabase.auth.mfa.enroll({ factorType: "totp", friendlyName: "DS Lodge" });
      if (cancelled) return;
      if (enrolError || !data || data.type !== "totp") return setError(t("errors.generic"));
      setFactorId(data.id);
      setQr(data.totp.qr_code);
      setSecret(data.totp.secret);
    }
    void prepare();
    return () => {
      cancelled = true;
    };
  }, [t]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!factorId) return;
    setBusy(true);
    setError(null);
    const { error: verifyError } = await supabase.auth.mfa.challengeAndVerify({ factorId, code: code.trim() });
    setBusy(false);
    if (verifyError) return setError(t("auth.mfaInvalid"));
    await refresh();
  }

  return (
    <AuthCard title={t("auth.mfaTitle")}>
      <p>{enrol && qr ? t("auth.mfaEnrolIntro") : t("auth.mfaVerifyIntro")}</p>
      {qr && (
        <div className="mfa-qr">
          <img src={qr} alt="QR" width={180} height={180} />
          <code className="mfa-secret">{secret}</code>
        </div>
      )}
      <form onSubmit={submit} className="form">
        <label>
          {t("auth.mfaCode")}
          <input inputMode="numeric" autoComplete="one-time-code" pattern="\d{6}" maxLength={6} required value={code} onChange={(e) => setCode(e.target.value)} autoFocus />
        </label>
        <Notice kind="error">{error}</Notice>
        <button type="submit" className="primary" disabled={busy || !factorId}>
          {t("auth.mfaVerify")}
        </button>
        <button type="button" className="link-button" onClick={() => void signOut()}>
          {t("auth.signOut")}
        </button>
      </form>
    </AuthCard>
  );
}
