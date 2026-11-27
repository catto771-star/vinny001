import { useState, type FormEvent } from "react";
import { useAuth } from "@/auth/AuthProvider";
import { useI18n } from "@/i18n";
import { supabase } from "@/lib/supabase";
import { errorKey } from "@/lib/errors";
import { passwordAcceptable } from "@/lib/password";
import { staffName } from "@/lib/types";
import { applyTheme, currentTheme, type ThemeMode } from "@/lib/theme";
import { readStartHouse, writeStartHouse } from "@/lib/activeLodge";
import { Notice } from "@/components/Notice";
import { useToast } from "@/components/Toast";

/** Configurações pessoais (todos os perfis): perfil, troca de senha, aparência e sessões. */
export function AccountSettings() {
  const { t } = useI18n();
  const { staff, session, lodges, isManagement, refresh } = useAuth();
  const toast = useToast();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [repeat, setRepeat] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [theme, setTheme] = useState<ThemeMode>(currentTheme);
  const [displayName, setDisplayName] = useState(staff?.display_name ?? "");
  const [startHouse, setStartHouse] = useState(() => readStartHouse() ?? "last");
  const email = session?.user?.email ?? staff?.email ?? "";
  const house = lodges.find((l) => l.id === staff?.home_lodge_id)?.name;

  async function changePassword(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (next !== repeat) return setError(t("auth.passwordsDontMatch"));
    if (!passwordAcceptable(next)) return setError(t("auth.passwordTooWeak"));
    if (next === current) return setError(t("settings.sameAsCurrent"));
    setBusy(true);
    // Confere a senha atual (quem esqueceu a tela aberta não consegue trocar a senha de outra pessoa).
    const { error: checkError } = await supabase.auth.signInWithPassword({ email, password: current });
    if (checkError) {
      setBusy(false);
      return setError(t("settings.currentWrong"));
    }
    const { error: updateError } = await supabase.auth.updateUser({ password: next });
    if (updateError) {
      setBusy(false);
      return setError(updateError.message.includes("same") ? t("settings.sameAsCurrent") : t(errorKey(updateError)));
    }
    await supabase.auth.signOut({ scope: "others" });
    setBusy(false);
    setCurrent("");
    setNext("");
    setRepeat("");
    toast.success(t("settings.passwordChanged"));
  }

  async function signOutOthers() {
    const { error: err } = await supabase.auth.signOut({ scope: "others" });
    if (err) return toast.error(t(errorKey(err)));
    toast.success(t("settings.signedOutOthers"));
  }

  async function saveName() {
    const { error: err } = await supabase.rpc("set_my_display_name", { p_name: displayName });
    if (err) return toast.error(t(errorKey(err)));
    await refresh();
    toast.success(t("settings.nameSaved"));
  }

  function chooseStartHouse(v: string) {
    setStartHouse(v);
    writeStartHouse(v === "last" ? null : v);
  }

  function chooseTheme(mode: ThemeMode) {
    applyTheme(mode, true);
    setTheme(mode);
  }

  return (
    <div className="settings-grid">
      {isManagement && (
      <article className="card">
        <h2 className="section-title">{t("settings.profile")}</h2>
        <dl className="profile-list">
          <div><dt>{t("settings.profileName")}</dt><dd>{staffName(staff)}</dd></div>
          <div><dt>{t("settings.profileEmail")}</dt><dd>{email}</dd></div>
          <div><dt>{t("settings.profileRole")}</dt><dd>{staff ? t(`users.roles.${staff.role}`) : ""}</dd></div>
          {house && <div><dt>{t("settings.profileHouse")}</dt><dd>{house}</dd></div>}
        </dl>
        <div className="inline-field">
          <label>
            {t("settings.displayName")}
            <input type="text" maxLength={40} value={displayName} placeholder={staff?.full_name ?? ""} onChange={(e) => setDisplayName(e.target.value)} />
          </label>
          <button type="button" onClick={() => void saveName()}>{t("settings.saveName")}</button>
        </div>
      </article>
      )}

      {isManagement && (
      <article className="card">
        <h2 className="section-title">{t("settings.password")}</h2>
        <form className="form" onSubmit={(e) => void changePassword(e)}>
          <label>
            {t("settings.currentPassword")}
            <input type="password" autoComplete="current-password" required value={current} onChange={(e) => setCurrent(e.target.value)} />
          </label>
          <label>
            {t("auth.newPassword")}
            <input type="password" autoComplete="new-password" required value={next} onChange={(e) => setNext(e.target.value)} />
          </label>
          <label>
            {t("auth.repeatPassword")}
            <input type="password" autoComplete="new-password" required value={repeat} onChange={(e) => setRepeat(e.target.value)} />
          </label>
          <p className="hint">{t("settings.passwordHint")}</p>
          <Notice kind="error">{error}</Notice>
          <button type="submit" className="primary" disabled={busy}>{busy ? t("app.saving") : t("settings.changePassword")}</button>
        </form>
      </article>
      )}

      <article className="card">
        <h2 className="section-title">{t("settings.appearance")}</h2>
        <p className="hint">{t("settings.appearanceHint")}</p>
        {isManagement && lodges.length > 1 && (
          <label className="filter-field">
            <span>{t("settings.startHouse")}</span>
            <select value={startHouse} onChange={(e) => chooseStartHouse(e.target.value)}>
              <option value="last">{t("settings.startLast")}</option>
              {lodges.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          </label>
        )}
        <div className="segmented" role="radiogroup" aria-label={t("settings.appearance")}>
          {(["light", "dark"] as const).map((m) => (
            <button key={m} type="button" role="radio" aria-checked={theme === m} className={theme === m ? "selected" : ""} onClick={() => chooseTheme(m)}>
              {t(m === "light" ? "settings.themeLight" : "settings.themeDark")}
            </button>
          ))}
        </div>
      </article>

      {isManagement && (
      <article className="card">
        <h2 className="section-title">{t("settings.sessions")}</h2>
        <p className="hint">{t("settings.sessionsHint")}</p>
        <button type="button" onClick={() => void signOutOthers()}>{t("settings.signOutOthers")}</button>
      </article>
      )}
    </div>
  );
}
