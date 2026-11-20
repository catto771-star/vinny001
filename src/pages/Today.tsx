import { Link } from "react-router-dom";
import { useAuth } from "@/auth/AuthProvider";
import { useI18n } from "@/i18n";
import { formatCivilDate, formatTime, operationalDay, shiftOf } from "@/lib/time";
import { staffName } from "@/lib/types";
import { useOnDuty } from "@/lib/useOnDuty";
import { summarise, useOccupancy } from "@/lib/useOccupancy";
import { Notice } from "@/components/Notice";

export function Today() {
  const { t, locale } = useI18n();
  const { lodges, post, isManagement, serverOffsetMs } = useAuth();
  const { posts } = useOnDuty();
  const { beds } = useOccupancy();
  const now = new Date(Date.now() + serverOffsetMs);
  const opDay = operationalDay(now);
  const floatPost = posts.find((p) => p.function === "float");

  return (
    <section className="page">
      <header className="page-header">
        <h1>{t("today.title")}</h1>
        <div className="muted">
          {t("today.operationalDay", { date: formatCivilDate(opDay, locale) })} ·{" "}
          {shiftOf(now) === "day" ? t("today.shiftDay") : t("today.shiftNight")}
        </div>
      </header>

      {!post && !isManagement && (
        <Notice kind="warning">
          {t("post.needPost")} <Link to="/post">{t("post.take")}</Link>
        </Notice>
      )}

      <div className="card-grid">
        <article className="card">
          <h2>{t("today.onDuty")}</h2>
          <ul className="plain-list">
            {lodges.map((l) => {
              const p = posts.find((x) => x.function === "office" && x.lodge_id === l.id);
              return (
                <li key={l.id}>
                  <strong>{t("today.officeOf", { lodge: l.short_name })}:</strong>{" "}
                  {p ? `${staffName(p.staff)} — ${t("today.since", { time: formatTime(p.started_at, locale) })}` : <span className="warn-text">{t("today.nobody")}</span>}
                </li>
              );
            })}
            <li>
              <strong>{t("today.floatRole")}:</strong>{" "}
              {floatPost ? `${staffName(floatPost.staff)} — ${t("today.since", { time: formatTime(floatPost.started_at, locale) })}` : t("today.nobody")}
            </li>
          </ul>
        </article>

        <article className="card">
          <h2>{t("today.occupancy")}</h2>
          <ul className="plain-list">
            {lodges.map((l) => {
              const s = summarise(beds.filter((b) => b.lodge_id === l.id));
              return (
                <li key={l.id}>
                  <strong>{l.short_name}:</strong> {s.occupied} {t("today.occupied")} · {s.free} {t("today.free")}
                  {s.outOfService > 0 && ` · ${s.outOfService} ${t("today.outOfService")}`}
                </li>
              );
            })}
          </ul>
          <Link to="/beds">{t("nav.bedMap")} →</Link>
        </article>

        <article className="card">
          <h2>{t("today.pending")}</h2>
          <p className="muted">{t("today.noPending")}</p>
          <p className="hint">{t("app.comingInPhase", { phase: 1 })}</p>
        </article>
      </div>
    </section>
  );
}
