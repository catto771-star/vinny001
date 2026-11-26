import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useSearchParams } from "react-router-dom";
import { useAuth } from "@/auth/AuthProvider";
import { Tabs } from "@/components/Tabs";
import { AccountSettings } from "./settings/AccountSettings";
import { SystemSettings } from "./settings/SystemSettings";
import { useI18n, type MessageKey } from "@/i18n";
import { supabase } from "@/lib/supabase";
import { errorKey } from "@/lib/errors";
import { disablePush, enablePush, pushState, type PushState } from "@/lib/push";
import { Notice } from "@/components/Notice";
import { Skeleton } from "@/components/Skeleton";
import { useToast } from "@/components/Toast";
import { TAG_COLORS, type HandoverTag, type TagColor } from "./Handover";
import { Dialog, DialogCancel } from "@/components/Dialog";

type Pref = { key: string; label: string; group: "handover" | "maintenance" | "other"; enabled: boolean };

const GROUPS: { key: Pref["group"]; title: MessageKey }[] = [
  { key: "handover", title: "settings.gHandover" },
  { key: "maintenance", title: "settings.gMaintenance" },
  { key: "other", title: "settings.gOther" },
];

/**
 * Configurações do Admin (revisão 3): quais tags aparecem no Handover (vale para todos) e quais
 * notificações chegam no celular deste Admin (cada um escolhe as suas).
 */
function useSettingsData() {
  const { t } = useI18n();
  const toast = useToast();
  const [tags, setTags] = useState<HandoverTag[] | null>(null);
  const [prefs, setPrefs] = useState<Pref[] | null>(null);
  const [push, setPush] = useState<PushState | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [{ data: g }, { data: p }] = await Promise.all([
      supabase.from("handover_tags").select("id, code, label, color, sort_order, visible, notify_default").order("sort_order"),
      supabase.rpc("my_push_prefs"),
    ]);
    setTags((g ?? []) as HandoverTag[]);
    setPrefs((p ?? []) as Pref[]);
  }, []);

  useEffect(() => {
    void load();
    void pushState().then(setPush).catch(() => setPush("unsupported"));
  }, [load]);

  async function toggleTag(g: HandoverTag) {
    setTags((list) => list?.map((x) => (x.id === g.id ? { ...x, visible: !g.visible } : x)) ?? null);
    const { error: e } = await supabase.rpc("set_handover_tag", { p_tag: g.id, p_visible: !g.visible });
    if (e) {
      toast.error(t(errorKey(e)));
      void load();
    }
  }

  async function togglePref(p: Pref) {
    setPrefs((list) => list?.map((x) => (x.key === p.key ? { ...x, enabled: !p.enabled } : x)) ?? null);
    const { error: e } = await supabase.rpc("set_push_pref", { p_key: p.key, p_enabled: !p.enabled });
    if (e) {
      toast.error(t(errorKey(e)));
      void load();
    }
  }

  async function switchPush() {
    setError(null);
    try {
      if (push === "on") await disablePush();
      else await enablePush();
      setPush(await pushState());
      toast.success(push === "on" ? t("settings.pushOff") : t("settings.pushOn"));
    } catch (e) {
      const m = (e as Error).message;
      setError(m === "push_denied" ? t("settings.pushDenied") : m === "push_not_configured" ? t("settings.pushNotConfigured") : t(errorKey(e as { message: string })));
    }
  }

  return { t, tags, prefs, push, error, toggleTag, togglePref, switchPush, reload: load };
}

export function Settings() {
  const { t } = useI18n();
  const { isManagement } = useAuth();
  const [params, setParams] = useSearchParams();
  const tabs = [
    { value: "account", label: t("settings.tabAccount") },
    ...(isManagement ? [
      { value: "notifications", label: t("settings.tabNotifications") },
      { value: "handover", label: t("settings.tabHandover") },
      { value: "system", label: t("settings.tabSystem") },
    ] : []),
  ];
  const wanted = params.get("tab") ?? "account";
  const tab = tabs.some((x) => x.value === wanted) ? wanted : "account";
  return (
    <section className="page">
      <header className="page-header">
        <div>
          <span className="eyebrow">{t("settings.eyebrow")}</span>
          <h1>{t("settings.title")}</h1>
        </div>
      </header>
      {tabs.length > 1 && (
        <Tabs label={t("settings.title")} value={tab} onChange={(v) => setParams(v === "account" ? {} : { tab: v }, { replace: true })} items={tabs} />
      )}
      {tab === "account" && <AccountSettings />}
      {isManagement && tab === "notifications" && <NotificationSettings />}
      {isManagement && tab === "handover" && <HandoverTagSettings />}
      {isManagement && tab === "system" && <SystemSettings />}
    </section>
  );
}

function NotificationSettings() {
  const { t, prefs, push, error, togglePref, switchPush } = useSettingsData();
  return (
    <>
      <article className="card settings-push">
        <div>
          <h2 className="section-title">{t("settings.thisDevice")}</h2>
          <p className="hint">
            {push === "needs-install" ? t("settings.needsInstall")
              : push === "unsupported" ? t("settings.unsupported")
              : push === "denied" ? t("settings.pushDenied")
              : push === "on" ? t("settings.deviceOn") : t("settings.deviceOff")}
          </p>
        </div>
        {(push === "on" || push === "off") && (
          <button className={push === "on" ? "" : "primary"} onClick={() => void switchPush()}>
            {push === "on" ? t("settings.turnOff") : t("settings.turnOn")}
          </button>
        )}
      </article>
      <Notice kind="error">{error}</Notice>

      <div className="settings-grid">
        <article className="card">
          <h2 className="section-title">{t("settings.myNotifications")}</h2>
          <p className="hint">{t("settings.myNotificationsHint")}</p>
          {prefs === null ? <Skeleton rows={6} label={t("app.loading")} /> : GROUPS.map((gr) => (
            <fieldset key={gr.key} className="settings-group">
              <legend>{t(gr.title)}</legend>
              {prefs.filter((p) => p.group === gr.key).map((p) => (
                <label key={p.key} className="switch-row">
                  <span>{p.label}</span>
                  <input type="checkbox" role="switch" checked={p.enabled} onChange={() => void togglePref(p)} aria-label={`${t(gr.title)} · ${p.label}`} />
                </label>
              ))}
            </fieldset>
          ))}
        </article>

      </div>
    </>
  );
}

function HandoverTagSettings() {
  const { t, tags, toggleTag, reload } = useSettingsData();
  const [dialog, setDialog] = useState<null | "add" | HandoverTag>(null);
  const [error, setError] = useState<string | null>(null);
  async function call(name: string, args: Record<string, unknown>) {
    setError(null);
    const { error: e } = await supabase.rpc(name, args);
    if (e) { setError(t(errorKey(e))); return false; }
    await reload();
    return true;
  }
  return (
    <div className="settings-grid">
      <article className="card settings-wide">
        <div className="toolbar">
          <h2 className="section-title">{t("settings.handoverTags")}</h2>
          <button type="button" className="primary" onClick={() => setDialog("add")}>{t("settings.addTag")}</button>
        </div>
        <p className="hint">{t("settings.handoverTagsHint")}</p>
        <Notice kind="error">{error}</Notice>
        {tags === null ? <Skeleton rows={6} label={t("app.loading")} /> : (
          <ul className="tag-admin-list">
            {tags.map((g, i) => (
              <li key={g.id} className={g.visible ? "" : "is-removed"}>
                <span className={`tag tag-c-${g.color}`}>{g.label}</span>
                <label className="switch-row">
                  <span>{t("settings.showTag")}</span>
                  <input type="checkbox" role="switch" checked={g.visible} onChange={() => void toggleTag(g)} aria-label={`${t("settings.showTag")} · ${g.label}`} />
                </label>
                <label className="switch-row">
                  <span>{t("settings.notifyDefault")}</span>
                  <input type="checkbox" role="switch" checked={g.notify_default} aria-label={`${t("settings.notifyDefault")} · ${g.label}`}
                    onChange={() => void call("update_handover_tag", { p_tag: g.id, p_label: g.label, p_color: g.color, p_notify: !g.notify_default })} />
                </label>
                <span className="inline">
                  <button type="button" className="small" disabled={i === 0} aria-label={t("settings.moveUp", { name: g.label })} onClick={() => void call("move_handover_tag", { p_tag: g.id, p_dir: -1 })}>↑</button>
                  <button type="button" className="small" disabled={i === tags.length - 1} aria-label={t("settings.moveDown", { name: g.label })} onClick={() => void call("move_handover_tag", { p_tag: g.id, p_dir: 1 })}>↓</button>
                  <button type="button" className="small" aria-label={t("settings.editNamed", { name: g.label })} onClick={() => setDialog(g)}>{t("app.edit")}</button>
                </span>
              </li>
            ))}
          </ul>
        )}
      </article>
      {dialog && <TagDialog tag={dialog === "add" ? null : dialog} onClose={() => setDialog(null)}
        onSave={(label, color, notify) => (dialog === "add"
          ? call("add_handover_tag", { p_label: label, p_color: color, p_notify: notify })
          : call("update_handover_tag", { p_tag: dialog.id, p_label: label, p_color: color, p_notify: notify }))} />}
    </div>
  );
}

function TagDialog({ tag, onClose, onSave }: { tag: HandoverTag | null; onClose: () => void; onSave: (label: string, color: TagColor, notify: boolean) => Promise<boolean> }) {
  const { t } = useI18n();
  const [label, setLabel] = useState(tag?.label ?? "");
  const [color, setColor] = useState<TagColor>(tag?.color ?? "grey");
  const [notify, setNotify] = useState(tag?.notify_default ?? false);
  const [busy, setBusy] = useState(false);
  async function go(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    if (await onSave(label, color, notify)) onClose();
    setBusy(false);
  }
  const title = tag ? t("settings.editTag") : t("settings.addTag");
  return (
    <Dialog title={title} onClose={onClose}
      footer={<><DialogCancel>{t("app.cancel")}</DialogCancel><button type="submit" form="tag-form" className="primary" disabled={busy || !label.trim()}>{tag ? t("app.save") : t("settings.addTag")}</button></>}>
      <form id="tag-form" className="form" onSubmit={(e) => void go(e)}>
        <label>{t("settings.tagName")}<input required maxLength={30} value={label} onChange={(e) => setLabel(e.target.value)} autoFocus /></label>
        <label>{t("settings.tagColour")}
          <select value={color} onChange={(e) => setColor(e.target.value as TagColor)}>
            {TAG_COLORS.map((c) => <option key={c} value={c}>{t(`settings.colour_${c}` as MessageKey)}</option>)}
          </select>
        </label>
        <label className="inline-check"><input type="checkbox" checked={notify} onChange={(e) => setNotify(e.target.checked)} aria-label={t("settings.notifyDefaultLong")} /> {t("settings.notifyDefaultLong")}</label>
        <span className={`tag tag-c-${color}`}>{label.trim() || t("settings.tagPreview")}</span>
      </form>
    </Dialog>
  );
}
