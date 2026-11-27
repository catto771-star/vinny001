import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "@/auth/AuthProvider";
import { useI18n } from "@/i18n";
import { supabase } from "@/lib/supabase";
import { isAfterPresenceAlert } from "@/lib/presence";
import { roomLabel } from "@/lib/rooms";
import { residentName } from "@/lib/types";

type Alert = {
  complete: boolean;
  pending_slots: string[];
  without_evidence: { stay_id: string; resident_id: string; first_name: string; last_name: string; room_kind: "room" | "apartment"; room_code: string; bed_number: number }[];
};

/** Aviso das 18h30 (s.5): quem ainda não tem evidência no dia. Não registra nada. */
export function PresenceAlertCard() {
  const { t } = useI18n();
  const { lodges, post, isManagement, serverOffsetMs } = useAuth();
  const now = new Date(Date.now() + serverOffsetMs);
  const visible = isAfterPresenceAlert(now);
  const lodgeIds = post?.function === "office" && post.lodge_id && !isManagement ? [post.lodge_id] : lodges.map((l) => l.id);
  const [alerts, setAlerts] = useState<Record<string, Alert>>({});

  useEffect(() => {
    if (!visible) return;
    for (const id of lodgeIds) {
      void supabase.rpc("presence_alert", { p_lodge: id }).then(({ data }) => {
        if (data) setAlerts((a) => ({ ...a, [id]: data as Alert }));
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, lodgeIds.join(",")]);

  if (!visible) return null;

  return (
    <article className="bento-tile tile-alert span-6">
      <span className="eyebrow">{t("noShows.alertTitle")}</span>
      <p className="hint">{t("noShows.alertHint")} <Link to="/seen">{t("noShows.openSeen")} →</Link></p>
      <div className="alert-columns">
      {lodgeIds.map((id) => {
        const a = alerts[id];
        const lodge = lodges.find((l) => l.id === id);
        if (!a) return null;
        return (
          <div key={id}>
            <strong>{lodge?.short_name}</strong>
            {!a.complete && <p className="warn-text small-text">{t("noShows.alertIncomplete", { slots: a.pending_slots.join(", ") })}</p>}
            {a.without_evidence.length === 0 ? (
              <p className="muted">{t("noShows.alertNone")}</p>
            ) : (
              <ul className="plain-list">
                {a.without_evidence.map((r) => (
                  <li key={r.stay_id}>
                    <span className="room-cell">{roomLabel(t, r.room_kind, r.room_code)} · {r.bed_number}</span> —{" "}
                    <Link to={`/residents/${r.resident_id}`}>{residentName(r)}</Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        );
      })}
      </div>
    </article>
  );
}
