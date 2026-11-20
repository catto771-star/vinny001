import { type MouseEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/auth/AuthProvider";
import { useI18n } from "@/i18n";
import { formatCivilDate, formatClock, formatTime, operationalDay, shiftOf } from "@/lib/time";
import { staffName } from "@/lib/types";
import { useNextCheck } from "@/lib/useNextCheck";
import { useOnDuty } from "@/lib/useOnDuty";
import { summarise, useOccupancy } from "@/lib/useOccupancy";
import { PresenceAlertCard } from "@/components/PresenceAlertCard";
import { PendingTile } from "@/components/PendingTile";
import { TaskAlerts } from "@/components/TaskAlerts";

/** Brilho que segue o cursor nos blocos do bento (um dos dois efeitos de impacto — docs/DESIGN.md). */
function trackGlow(e: MouseEvent<HTMLElement>) {
  const tile = (e.target as HTMLElement).closest<HTMLElement>(".bento-tile");
  if (!tile) return;
  const r = tile.getBoundingClientRect();
  tile.style.setProperty("--mx", `${e.clientX - r.left}px`);
  tile.style.setProperty("--my", `${e.clientY - r.top}px`);
}

export function Today() {
  const { t, locale } = useI18n();
  const { lodges, post, staff, isManagement, serverOffsetMs } = useAuth();
  const navigate = useNavigate();
  const { posts, loading: dutyLoading } = useOnDuty();
  const { beds } = useOccupancy();
  const now = new Date(Date.now() + serverOffsetMs);
  const opDay = operationalDay(now);
  const clock = formatClock(now, locale);
  const actionLodge = post?.function === "office" ? post.lodge_id : null;
  const next = useNextCheck(actionLodge, serverOffsetMs);
  const floatPost = posts.find((p) => p.function === "float");
  const needsPost = !post && !isManagement;

  const lodgeName = (id: string | null) => lodges.find((l) => l.id === id)?.short_name ?? "";

  return (
    <section className="page">
      <div className="bento" onMouseMove={trackGlow}>
        {/* Ação principal do turno */}
        <article className="bento-tile bento-hero span-4">
          <div>
            <span className="eyebrow">
              {t("today.operationalDay", { date: formatCivilDate(opDay, locale) })} ·{" "}
              {shiftOf(now) === "day" ? t("today.shiftDay") : t("today.shiftNight")}
            </span>
            <h1 style={{ marginTop: "0.6rem" }}>{clock.weekday}</h1>
            <p className="hero-meta">
              {post
                ? post.function === "float"
                  ? t("post.youAreFloat", { time: formatTime(post.started_at, locale) })
                  : t("post.youAre", { function: t("post.office"), lodge: lodgeName(post.lodge_id), time: formatTime(post.started_at, locale) })
                : `${staffName(staff)} · ${staff ? t(`users.roles.${staff.role}`) : ""}`}
            </p>
          </div>
          <div className="button-row" style={{ marginTop: 0 }}>
            {needsPost ? (
              <button className="primary" onClick={() => navigate("/post")}>{t("post.take")}</button>
            ) : actionLodge && next.slot ? (
              <button className="primary" onClick={() => navigate("/sheet")}>{t("today.nextCheck", { slot: next.slot })}</button>
            ) : isManagement && !post ? (
              <button className="primary" onClick={() => navigate("/no-shows")}>{t("nav.noShows")}</button>
            ) : (
              <button className="primary" onClick={() => navigate("/sheet")}>{t("today.openSheet")}</button>
            )}
            {actionLodge && !next.loading && (
              <span className="hero-meta">{next.pendingCount > 0 ? t("today.checksDue", { n: next.pendingCount }) : t("today.allChecksIn")}</span>
            )}
            {isManagement && !post && <span className="hero-meta">{t("today.managementHint")}</span>}
          </div>
        </article>

        {/* Quem está de serviço */}
        <article className="bento-tile span-2">
          <span className="eyebrow">{t("today.onDuty")}</span>
          <ul className="duty-list">
            {lodges.map((l) => {
              const p = posts.find((x) => x.function === "office" && x.lodge_id === l.id);
              return (
                <li key={l.id}>
                  <span>
                    <span className="duty-role">{t("today.officeOf", { lodge: l.short_name })}</span>
                    <br />
                    {dutyLoading ? (
                      <span className="muted">{t("app.loading")}</span>
                    ) : p ? (
                      <span className="duty-name">{staffName(p.staff)}</span>
                    ) : (
                      <span className="warn-text">{t("today.nobody")}</span>
                    )}
                  </span>
                  {!dutyLoading && p && <span className="duty-since">{t("today.since", { time: formatTime(p.started_at, locale) })}</span>}
                </li>
              );
            })}
            <li>
              <span>
                <span className="duty-role">{t("today.floatRole")}</span>
                <br />
                {dutyLoading ? (
                  <span className="muted">{t("app.loading")}</span>
                ) : floatPost ? (
                  <span className="duty-name">{staffName(floatPost.staff)}</span>
                ) : (
                  <span className="muted">{t("today.nobody")}</span>
                )}
              </span>
              {!dutyLoading && floatPost && <span className="duty-since">{t("today.since", { time: formatTime(floatPost.started_at, locale) })}</span>}
            </li>
          </ul>
        </article>

        <PresenceAlertCard />
        <PendingTile />

        {/* Ocupação por Lodge */}
        {lodges.map((l) => {
          const s = summarise(beds.filter((b) => b.lodge_id === l.id));
          const pct = s.total ? Math.round((s.occupied / s.total) * 100) : 0;
          return (
            <Link key={l.id} to="/beds" className="bento-tile span-3" style={{ color: "inherit", textDecoration: "none" }}>
              <span className="eyebrow">{t("today.occupancy")} · {l.name}</span>
              <div className="big-number" style={{ marginTop: "0.8rem" }}>
                {s.occupied}
                <small>{t("today.beds", { total: s.total })}</small>
              </div>
              <div className="meter" aria-hidden="true"><span style={{ width: `${pct}%` }} /></div>
              <span className="muted small-text">
                {s.free} {t("today.free")}
                {s.outOfService > 0 && ` · ${s.outOfService} ${t("today.outOfService")}`}
              </span>
            </Link>
          );
        })}
      </div>
      {post && <TaskAlerts />}
    </section>
  );
}
