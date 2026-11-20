import { useEffect, useState, type FormEvent } from "react";
import { useAuth } from "@/auth/AuthProvider";
import { useI18n } from "@/i18n";
import { supabase } from "@/lib/supabase";
import { Notice } from "@/components/Notice";
import { AuthCard } from "./Login";

type Prepared = { id: string; qr: string | null; secret: string | null };
let inflight: Promise<Prepared | null> | null = null;

/**
 * Devolve o fator TOTP verificado ou inscreve um novo. Uma única execução por vez:
 * duas inscrições simultâneas (duplo render, duplo clique) colidiriam no Supabase.
 */
function prepareFactor(): Promise<Prepared | null> {
  inflight ??= (async () => {
    const { data: factors } = await supabase.auth.mfa.listFactors();
    const verified = factors?.totp?.find((f) => f.status === "verified");
    if (verified) return { id: verified.id, qr: null, secret: null };
    for (const f of factors?.all ?? []) {
      if (f.status !== "verified") await supabase.auth.mfa.unenroll({ factorId: f.id });
    }
    const { data, error } = await supabase.auth.mfa.enroll({ factorType: "totp", friendlyName: `DS Lodge ${new Date().toISOString()}` });
    if (error || !data || data.type !== "totp") return null;
    return { id: data.id, qr: data.totp.qr_code, secret: data.totp.secret };
  })().finally(() => {
    window.setTimeout(() => (inflight = null), 0);
  });
  return inflight;
}

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
    void prepareFactor().then((result) => {
      if (cancelled) return;
      if (!result) return setError(t("errors.generic"));
      setFactorId(result.id);
      setQr(result.qr);
      setSecret(result.secret);
    });
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
