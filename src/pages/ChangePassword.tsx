import { useState, type FormEvent } from "react";
import { useAuth } from "@/auth/AuthProvider";
import { useI18n } from "@/i18n";
import { supabase } from "@/lib/supabase";
import { errorKey } from "@/lib/errors";
import { passwordAcceptable } from "@/lib/password";
import { Notice } from "@/components/Notice";
import { AuthCard } from "./Login";

export function ChangePassword() {
  const { t } = useI18n();
  const { refresh, signOut } = useAuth();
  const [password, setPassword] = useState("");
  const [repeat, setRepeat] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (password !== repeat) return setError(t("auth.passwordsDontMatch"));
    if (!passwordAcceptable(password)) return setError(t("auth.passwordTooWeak"));
    setBusy(true);
    setError(null);
    const { error: updateError } = await supabase.auth.updateUser({ password });
    if (updateError) {
      setBusy(false);
      return setError(updateError.message.includes("same") ? t("auth.passwordTooWeak") : t(errorKey(updateError)));
    }
    const { error: markError } = await supabase.rpc("mark_password_changed");
    setBusy(false);
    if (markError) return setError(t(errorKey(markError)));
    await refresh();
  }

  return (
    <AuthCard title={t("auth.changePasswordTitle")}>
      <p>{t("auth.changePasswordIntro")}</p>
      <form onSubmit={submit} className="form">
        <label>
          {t("auth.newPassword")}
          <input type="password" autoComplete="new-password" required value={password} onChange={(e) => setPassword(e.target.value)} autoFocus />
        </label>
        <label>
          {t("auth.repeatPassword")}
          <input type="password" autoComplete="new-password" required value={repeat} onChange={(e) => setRepeat(e.target.value)} />
        </label>
        <p className="hint">{t("auth.passwordRules")}</p>
        <Notice kind="error">{error}</Notice>
        <button type="submit" className="primary" disabled={busy}>
          {busy ? t("app.saving") : t("app.save")}
        </button>
        <button type="button" className="link-button" onClick={() => void signOut()}>
          {t("auth.signOut")}
        </button>
      </form>
    </AuthCard>
  );
}
