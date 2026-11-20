import { useState, type FormEvent } from "react";
import { useAuth } from "@/auth/AuthProvider";
import { useI18n } from "@/i18n";
import { supabase, supabaseConfigured } from "@/lib/supabase";
import { errorKey } from "@/lib/errors";
import { Clock } from "@/components/Clock";
import { LanguageSelect } from "@/components/LanguageSelect";
import { Notice } from "@/components/Notice";

export function Login() {
  const { t } = useI18n();
  const { notice } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error: signInError } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setBusy(false);
    if (signInError) {
      if (signInError.status === 429) setError(t("auth.tooManyAttempts"));
      else if (signInError.status === 400) setError(t("auth.invalidCredentials"));
      else setError(t(errorKey(signInError)));
    }
  }

  return (
    <AuthCard title={t("auth.title")}>
      {!supabaseConfigured && <Notice kind="error">VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY</Notice>}
      <Notice kind="info">{notice}</Notice>
      <form onSubmit={submit} className="form">
        <label>
          {t("auth.email")}
          <input type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} autoFocus />
        </label>
        <label>
          {t("auth.password")}
          <input type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        </label>
        <Notice kind="error">{error}</Notice>
        <button type="submit" className="primary" disabled={busy}>
          {busy ? t("auth.signingIn") : t("auth.signIn")}
        </button>
        <p className="hint">{t("auth.personalAccountOnly")}</p>
      </form>
    </AuthCard>
  );
}

export function AuthCard({ title, children }: { title: string; children: React.ReactNode }) {
  const { t } = useI18n();
  return (
    <div className="auth-page">
      <div className="auth-top">
        <Clock />
        <LanguageSelect persist={false} />
      </div>
      <div className="auth-card">
        <div className="brand brand-large">
          <span className="brand-mark" aria-hidden="true">DS</span>
          {t("app.name")}
        </div>
        <h1>{title}</h1>
        {children}
      </div>
    </div>
  );
}
