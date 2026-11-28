import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/auth/AuthProvider";
import { useI18n } from "@/i18n";
import { supabase } from "@/lib/supabase";
import { notificationText, type NotificationRow } from "@/lib/services";
import { formatDateTime } from "@/lib/time";
import { Skeleton } from "@/components/Skeleton";

/** Notificações (s.11): avisos para a gestão; marcar como lida não resolve o item. */
export function Notifications() {
  const { t, locale } = useI18n();
  const { lodges } = useAuth();
  const [rows, setRows] = useState<NotificationRow[] | null>(null);

  const load = useCallback(async () => {
    const { data } = await supabase.rpc("my_notifications", { p_limit: 100 });
    setRows((data ?? []) as NotificationRow[]);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function read(n: NotificationRow) {
    if (n.read) return;
    setRows((list) => list?.map((x) => (x.id === n.id ? { ...x, read: true } : x)) ?? null);
    await supabase.rpc("mark_notification_read", { p_id: n.id });
  }

  const unread = rows?.filter((n) => !n.read).length ?? 0;
  async function readAll() {
    setRows((list) => list?.map((x) => ({ ...x, read: true })) ?? null);
    await supabase.rpc("mark_all_notifications_read");
  }

  const lodgeName = (id: string | null) => lodges.find((l) => l.id === id)?.short_name ?? "";

  return (
    <section className="page">
      <header className="page-header">
        <div>
          <span className="eyebrow">{t("notifications.readHint")}</span>
          <h1>{t("notifications.title")}</h1>
        </div>
        {unread > 0 && <button type="button" className="primary" onClick={() => void readAll()}>{t("notifications.markAllRead")}</button>}
      </header>
      {rows === null ? (
        <div className="card"><Skeleton rows={6} label={t("app.loading")} /></div>
      ) : rows.length === 0 ? (
        <div className="card empty-state"><p className="pending-empty">{t("notifications.empty")}</p></div>
      ) : (
        <ul className="ticket-list">
          {rows.map((n) => (
            <li key={n.id}>
              <button type="button" className={`ticket notification${n.read ? " is-read" : ""}`} onClick={() => void read(n)}>
                <span className={`notif-dot kind-${n.kind}`} aria-hidden="true" />
                <span className="ticket-main">
                  <strong>{notificationText(n, t, lodgeName)}</strong>
                  <span className="muted">{formatDateTime(n.created_at, locale)}</span>
                </span>
                {!n.read && <span className="ticket-side"><span className="tag">{t("notifications.markRead")}</span></span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
