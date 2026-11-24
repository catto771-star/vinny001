import { useState, type FormEvent } from "react";
import { useAuth } from "@/auth/AuthProvider";
import { useI18n } from "@/i18n";
import { supabase } from "@/lib/supabase";
import { errorKey } from "@/lib/errors";
import { Notice } from "@/components/Notice";
import { AuthCard } from "./Login";

/** "catto771@gmail.com" → "c*******@gmail.com" */
export function maskEmail(email: string): string {
  const [user, domain] = email.split("@");
  if (!domain) return email;
  return `${user.slice(0, 1)}${"*".repeat(Math.max(user.length - 1, 3))}@${domain}`;
}

const RESEND_SECONDS = 60;

/**
 * Segunda etapa de Manager/Owner/Developer: código enviado por e-mail (s.4).
 * O pedido é registrado primeiro na sessão com senha (begin_email_verification);
 * o código abre a sessão que o banco reconhece como verificada.
 * O envio só acontece quando a pessoa clica — nunca sozinho, para não gastar o limite de e-mails.
 */
export function EmailCode() {
  const { t } = useI18n();
  const { session, signOut } = useAuth();
  const email = session?.user.email ?? "";
  const [sent, setSent] = useState(false);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);

  function startCooldown() {
    setCooldown(RESEND_SECONDS);
    const id = window.setInterval(() => {
      setCooldown((s) => {
        if (s <= 1) window.clearInterval(id);
        return s - 1;
      });
    }, 1000);
  }

  async function send() {
    setBusy(true);
    setError(null);
    const { error: beginError } = await supabase.rpc("begin_email_verification");
    if (beginError) {
      setBusy(false);
      return setError(/too_many_code_requests/.test(beginError.message) ? t("auth.tooManyCodes") : t(errorKey(beginError)));
    }
    const { error: sendError } = await supabase.auth.signInWithOtp({ email, options: { shouldCreateUser: false } });
    setBusy(false);
    if (sendError) {
      const status = (sendError as { status?: number }).status;
      return setError(status === 429 || /rate limit/i.test(sendError.message) ? t("auth.tooManyCodes") : t(errorKey(sendError)));
    }
    setSent(true);
    startCooldown();
  }

  async function verify(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error: verifyError } = await supabase.auth.verifyOtp({ email, token: code.trim(), type: "email" });
    setBusy(false);
    if (verifyError) return setError(t("auth.mfaInvalid"));
    // A nova sessão dispara o recarregamento do acesso (AuthProvider).
  }

  return (
    <AuthCard title={t("auth.mfaTitle")}>
      <p>{t("auth.emailCodeIntro", { email: maskEmail(email) })}</p>

      {sent && <Notice kind="success">{t("auth.codeSent", { email: maskEmail(email) })}</Notice>}

      {sent ? (
        <form onSubmit={verify} className="form">
          <label>
            {t("auth.code")}
            <input
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={10}
              required
              value={code}
              onChange={(e) => setCode(e.target.value)}
              autoFocus
            />
          </label>
          <Notice kind="error">{error}</Notice>
          <button type="submit" className="primary" disabled={busy || code.trim().length < 6}>
            {t("auth.mfaVerify")}
          </button>
          <button type="button" disabled={busy || cooldown > 0} onClick={() => void send()}>
            {t("auth.resendCode")}
            {cooldown > 0 ? ` (${cooldown})` : ""}
          </button>
          <p className="hint">{t("auth.checkSpam")}</p>
        </form>
      ) : (
        <div className="form">
          <Notice kind="error">{error}</Notice>
          <button type="button" className="primary" disabled={busy || !email} onClick={() => void send()}>
            {t("auth.sendCode")}
          </button>
        </div>
      )}

      <button type="button" className="link-button" onClick={() => void signOut()}>
        {t("auth.signOut")}
      </button>
    </AuthCard>
  );
}
