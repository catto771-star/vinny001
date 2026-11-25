import { useCallback, useEffect, useState } from "react";
import { useI18n, type MessageKey } from "@/i18n";
import { supabase } from "@/lib/supabase";
import { errorKey } from "@/lib/errors";
import { disablePush, enablePush, pushState, type PushState } from "@/lib/push";
import { Notice } from "@/components/Notice";
import { Skeleton } from "@/components/Skeleton";
import { useToast } from "@/components/Toast";
import type { HandoverTag } from "./Handover";

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
export function Settings() {
  const { t } = useI18n();
  const toast = useToast();
  const [tags, setTags] = useState<HandoverTag[] | null>(null);
  const [prefs, setPrefs] = useState<Pref[] | null>(null);
  const [push, setPush] = useState<PushState | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [{ data: g }, { data: p }] = await Promise.all([
      supabase.from("handover_tags").select("id, code, label, sort_order, visible, notify_default").order("sort_order"),
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

  return (
    <section className="page">
      <header className="page-header">
        <div>
          <span className="eyebrow">{t("settings.eyebrow")}</span>
          <h1>{t("settings.title")}</h1>
        </div>
      </header>

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

        <article className="card">
          <h2 className="section-title">{t("settings.handoverTags")}</h2>
          <p className="hint">{t("settings.handoverTagsHint")}</p>
          {tags === null ? <Skeleton rows={6} label={t("app.loading")} /> : (
            <fieldset className="settings-group">
              <legend className="sr-only">{t("settings.handoverTags")}</legend>
              {tags.map((g) => (
                <label key={g.id} className="switch-row">
                  <span><span className={`tag tag-${g.code}`}>{g.label}</span></span>
                  <input type="checkbox" role="switch" checked={g.visible} onChange={() => void toggleTag(g)} aria-label={`${t("settings.showTag")} · ${g.label}`} />
                </label>
              ))}
            </fieldset>
          )}
        </article>
      </div>
    </section>
  );
}
