import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useAuth } from "@/auth/AuthProvider";
import { LOCALES, useI18n, type Locale } from "@/i18n";
import { supabase } from "@/lib/supabase";
import { errorKey } from "@/lib/errors";
import { generateTemporaryPassword } from "@/lib/password";
import { formatDate } from "@/lib/time";
import { staffName, type Staff, type StaffRole } from "@/lib/types";
import { Dialog, DialogCancel } from "@/components/Dialog";
import { Tabs } from "@/components/Tabs";
import { Notice } from "@/components/Notice";
import { useToast } from "@/components/Toast";

const CREATABLE_ROLES: StaffRole[] = ["porter", "cleaner", "manager", "owner"];

async function callAdmin(body: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke("admin-users", { body });
  if (error) {
    // A função devolve { error } no corpo; tenta ler a mensagem real.
    const context = (error as { context?: Response }).context;
    try {
      const payload = context ? await context.json() : null;
      return { error: { message: payload?.error ?? error.message } };
    } catch {
      return { error };
    }
  }
  return { data, error: null };
}

/** Usuários (s.4): só Manager/Owner/Developer criam, redefinem senha e desativam. */
export function Users() {
  const { t, locale } = useI18n();
  const { lodges, staff: me } = useAuth();
  const [list, setList] = useState<Staff[]>([]);
  const [showActive, setShowActive] = useState(true);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Staff | null>(null);
  const [password, setPassword] = useState<{ name: string; value: string } | null>(null);
  const [confirmDeactivate, setConfirmDeactivate] = useState<Staff | null>(null);
  const [error, setError] = useState<string | null>(null);
  const toast = useToast();

  const load = useCallback(async () => {
    const { data } = await supabase.from("staff").select("*").order("active", { ascending: false }).order("full_name");
    setList((data ?? []) as Staff[]);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function resetPassword(s: Staff) {
    const value = generateTemporaryPassword();
    const { error: e } = await callAdmin({ action: "reset_password", staff_id: s.id, password: value });
    if (e) return setError(t(errorKey(e)));
    setError(null);
    setPassword({ name: staffName(s), value });
    toast.success(t("users.resetPasswordDone"));
  }

  async function setActive(s: Staff, active: boolean) {
    const { error: e } = await callAdmin({ action: "set_active", staff_id: s.id, active });
    setConfirmDeactivate(null);
    if (e) return setError(t(errorKey(e)));
    setError(null);
    await load();
  }

  const lodgeName = (id: string | null) => lodges.find((l) => l.id === id)?.short_name ?? "";

  return (
    <section className="page">
      <header className="page-header">
        <h1>{t("users.title")}</h1>
        <div className="inline">
          <Tabs
            size="sm"
            label={t("users.title")}
            value={showActive ? "active" : "inactive"}
            onChange={(v) => setShowActive(v === "active")}
            items={[
              { value: "active", label: t("users.tabActive") },
              { value: "inactive", label: t("users.tabInactive") },
            ]}
          />
          <button className="primary" onClick={() => setCreating(true)}>{t("users.add")}</button>
        </div>
      </header>

      <Notice kind="error">{error}</Notice>
      {password && (
        <Notice kind="warning">
          {password.name} — {t("users.temporaryPassword")}: <code className="password">{password.value}</code>
          <br />
          {t("users.temporaryPasswordHint")}
        </Notice>
      )}

      <table className="table">
        <thead>
          <tr>
            <th>{t("users.name")}</th>
            <th>{t("users.role")}</th>
            <th>{t("users.email")}</th>
            <th>{t("users.homeLodge")}</th>
            <th>{t("users.language")}</th>
            <th>{t("users.status")}</th>
            <th>{t("app.actions")}</th>
          </tr>
        </thead>
        <tbody>
          {list.filter((s) => s.active === showActive).map((s) => (
            <tr key={s.id} className={s.active ? "" : "row-inactive"}>
              <td>
                <strong>{s.full_name}</strong>
                {s.display_name && <span className="muted"> ({s.display_name})</span>}
              </td>
              <td>{t(`users.roles.${s.role}`)}</td>
              <td>{s.user_id ? s.email : <span className="muted">{t("users.noLogin")}</span>}</td>
              <td>{lodgeName(s.home_lodge_id)}</td>
              <td>{t(`lang.${s.locale}`)}</td>
              <td>{s.active ? t("users.active") : `${t("users.inactive")} ${s.deactivated_at ? formatDate(s.deactivated_at, locale) : ""}`}</td>
              <td className="actions">
                {s.role !== "developer" && s.id !== me?.id && (
                  <>
                    <button className="small" onClick={() => setEditing(s)}>{t("app.edit")}</button>
                    {s.user_id && s.active && <button className="small" onClick={() => void resetPassword(s)}>{t("users.resetPassword")}</button>}
                    {s.active ? (
                      <button className="small danger-outline" onClick={() => setConfirmDeactivate(s)}>{t("users.deactivate")}</button>
                    ) : (
                      <button className="small" onClick={() => void setActive(s, true)}>{t("users.reactivate")}</button>
                    )}
                  </>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {creating && (
        <StaffForm
          onClose={() => setCreating(false)}
          onCreated={(name, value) => {
            setCreating(false);
            toast.success(t("users.createdSuccess"));
            setPassword(value ? { name, value } : null);
            void load();
          }}
        />
      )}
      {editing && (
        <StaffForm
          existing={editing}
          onClose={() => setEditing(null)}
          onCreated={() => {
            setEditing(null);
            toast.success(t("residents.saved"));
            void load();
          }}
        />
      )}
      {confirmDeactivate && (
        <Dialog
          title={t("users.deactivate")}
          onClose={() => setConfirmDeactivate(null)}
          footer={
            <>
              <DialogCancel>{t("app.cancel")}</DialogCancel>
              <button className="danger" onClick={() => void setActive(confirmDeactivate, false)}>{t("users.deactivate")}</button>
            </>
          }
        >
          <p>{t("users.deactivateConfirm", { name: staffName(confirmDeactivate) })}</p>
        </Dialog>
      )}
    </section>
  );
}

function StaffForm({
  existing,
  onClose,
  onCreated,
}: {
  existing?: Staff;
  onClose: () => void;
  onCreated: (name: string, password: string | null) => void;
}) {
  const { t } = useI18n();
  const { lodges } = useAuth();
  const [fullName, setFullName] = useState(existing?.full_name ?? "");
  const [displayName, setDisplayName] = useState(existing?.display_name ?? "");
  const [email, setEmail] = useState(existing?.email ?? "");
  const [role, setRole] = useState<StaffRole>(existing?.role ?? "porter");
  const [locale, setLocale] = useState<Locale>(existing?.locale ?? "pt-PT");
  const [homeLodge, setHomeLodge] = useState(existing?.home_lodge_id ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const needsLogin = role !== "cleaner";

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    if (existing) {
      // Edição do cadastro (não muda login nem e-mail de acesso).
      const { error: updateError } = await supabase
        .from("staff")
        .update({
          full_name: fullName.trim(),
          display_name: displayName.trim() || null,
          role: existing.user_id ? (role === "cleaner" ? existing.role : role) : role,
          locale,
          home_lodge_id: homeLodge || null,
          version: existing.version,
        })
        .eq("id", existing.id);
      setBusy(false);
      if (updateError) return setError(t(errorKey(updateError)));
      return onCreated(fullName, null);
    }
    const password = needsLogin ? generateTemporaryPassword() : null;
    const { error: createError } = await callAdmin({
      action: "create",
      full_name: fullName,
      display_name: displayName || null,
      email: email || null,
      role,
      locale,
      home_lodge_id: homeLodge || null,
      password,
    });
    setBusy(false);
    if (createError) return setError(createError.message && !createError.message.includes("_") ? createError.message : t(errorKey(createError)));
    onCreated(displayName || fullName, password);
  }

  return (
    <Dialog
      title={existing ? t("app.edit") : t("users.add")}
      onClose={onClose}
      footer={
        <>
          <DialogCancel>{t("app.cancel")}</DialogCancel>
          <button type="submit" form="staff-form" className="primary" disabled={busy}>{busy ? t("app.saving") : t("app.save")}</button>
        </>
      }
    >
      <form id="staff-form" className="form" onSubmit={submit}>
        <div className="form-grid">
          <label>{t("users.name")}<input required value={fullName} onChange={(e) => setFullName(e.target.value)} autoFocus /></label>
          <label>{t("users.displayName")} <small>({t("app.optional")})</small><input value={displayName} onChange={(e) => setDisplayName(e.target.value)} /></label>
          <label>
            {t("users.role")}
            <select value={role} onChange={(e) => setRole(e.target.value as StaffRole)} disabled={!!existing?.user_id && existing.role === "cleaner"}>
              {CREATABLE_ROLES.filter((r) => !(existing?.user_id && r === "cleaner")).map((r) => (
                <option key={r} value={r}>{t(`users.roles.${r}`)}</option>
              ))}
            </select>
          </label>
          {!existing && needsLogin && (
            <label>{t("users.email")}<input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></label>
          )}
          <label>
            {t("users.language")}
            <select value={locale} onChange={(e) => setLocale(e.target.value as Locale)}>
              {LOCALES.map((l) => <option key={l} value={l}>{t(`lang.${l}`)}</option>)}
            </select>
          </label>
          <label>
            {t("users.homeLodge")}
            <select value={homeLodge} onChange={(e) => setHomeLodge(e.target.value)}>
              <option value="">{t("app.none")}</option>
              {lodges.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          </label>
        </div>
        {role === "cleaner" ? <p className="hint">{t("users.cleanerNoLogin")}</p> : !existing && <p className="hint">{t("users.temporaryPasswordHint")}</p>}
        <Notice kind="error">{error}</Notice>
      </form>
    </Dialog>
  );
}
