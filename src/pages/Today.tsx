import { useNavigate } from "react-router-dom";
import { useAuth } from "@/auth/AuthProvider";
import { useI18n } from "@/i18n";
import { formatCivilDate, formatClock, formatTime, operationalDay, shiftOf } from "@/lib/time";
import { BedBoard } from "@/components/BedBoard";
import { ShiftRuler } from "@/components/ShiftRuler";
import { staffName } from "@/lib/types";
import { useNextCheck } from "@/lib/useNextCheck";
import { useOnDuty } from "@/lib/useOnDuty";
import { useOccupancy } from "@/lib/useOccupancy";
import { PresenceAlertCard } from "@/components/PresenceAlertCard";
import { PendingTile } from "@/components/PendingTile";

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

  const rulerLodges = actionLodge ? [actionLodge] : lodges.map((l) => l.id);

  return (
    <section className="page today">
      {/* Cabeçalho do turno: o dia, quem eu sou no turno e a próxima ação */}
      <div className="today-top">
        <header className="today-head">
          <span className="eyebrow">
            {t("today.operationalDay", { date: formatCivilDate(opDay, locale) })} · {shiftOf(now) === "day" ? t("today.shiftDay") : t("today.shiftNight")}
          </span>
          <h1>{clock.weekday}</h1>
          <p className="today-meta">
            {post
              ? post.function === "float"
                ? t("post.youAreFloat", { time: formatTime(post.started_at, locale) })
                : t("post.youAre", { function: t("post.office"), lodge: lodgeName(post.lodge_id), time: formatTime(post.started_at, locale) })
              : `${staffName(staff)} · ${staff ? t(`users.roles.${staff.role}`) : ""}`}
          </p>
          <div className="button-row">
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
              <span className="muted small-text">{next.pendingCount > 0 ? t("today.checksDue", { n: next.pendingCount }) : t("today.allChecksIn")}</span>
            )}
            {isManagement && !post && <span className="muted small-text">{t("today.managementHint")}</span>}
          </div>
        </header>

        {/* Quem está de serviço */}
        <aside className="duty-card">
          <h2>{t("today.onDuty")}</h2>
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
                      <span className="duty-name"><i className="live-dot" aria-hidden="true" />{staffName(p.staff)}</span>
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
                  <span className="duty-name"><i className="live-dot" aria-hidden="true" />{staffName(floatPost.staff)}</span>
                ) : (
                  <span className="muted">{t("today.nobody")}</span>
                )}
              </span>
              {!dutyLoading && floatPost && <span className="duty-since">{t("today.since", { time: formatTime(floatPost.started_at, locale) })}</span>}
            </li>
          </ul>
        </aside>
      </div>

      {/* Assinatura: a régua do dia operacional com rondas e checks */}
      {lodges.length > 0 && <ShiftRuler lodgeIds={rulerLodges} />}

      <div className="bento">
        <PresenceAlertCard />
        <PendingTile />
      </div>

      {/* Destaque: o quadro de camas de cada Lodge */}
      <div className="board-grid">
        {lodges.map((l) => (
          <BedBoard key={l.id} lodge={l} beds={beds.filter((b) => b.lodge_id === l.id)} />
        ))}
      </div>
    </section>
  );
}
