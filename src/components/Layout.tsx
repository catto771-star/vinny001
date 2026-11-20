import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "@/auth/AuthProvider";
import { useI18n, type MessageKey } from "@/i18n";
import { formatTime } from "@/lib/time";
import { staffName } from "@/lib/types";
import { Clock } from "./Clock";
import { LanguageSelect } from "./LanguageSelect";

type Item = { to: string; label: MessageKey; managementOnly?: boolean; phase?: number };
type Group = { label: MessageKey; items: Item[] };

// Menu em cinco grupos (s.11). Telas de fases futuras aparecem desativadas.
const GROUPS: Group[] = [
  { label: "nav.groupToday", items: [{ to: "/", label: "nav.today" }] },
  {
    label: "nav.groupResidents",
    items: [
      { to: "/residents", label: "nav.residents" },
      { to: "/beds", label: "nav.bedMap" },
    ],
  },
  { label: "nav.groupOccurrences", items: [] },
  { label: "nav.groupServices", items: [] },
  {
    label: "nav.groupManagement",
    items: [
      { to: "/users", label: "nav.users", managementOnly: true },
      { to: "/audit", label: "nav.audit", managementOnly: true },
    ],
  },
];

const FUTURE: Record<string, number> = {
  "nav.groupOccurrences": 1,
  "nav.groupServices": 2,
};

export function Layout() {
  const { staff, post, lodges, isManagement, serverOffsetMs, signOut } = useAuth();
  const { t, locale } = useI18n();
  const navigate = useNavigate();

  const lodgeName = (id: string | null) => lodges.find((l) => l.id === id)?.short_name ?? "";

  return (
    <div className="shell">
      <header className="topbar">
        <div className="brand">{t("app.name")}</div>
        <Clock offsetMs={serverOffsetMs} />
        <div className="topbar-right">
          <button type="button" className="post-chip" onClick={() => navigate("/post")}>
            {post
              ? post.function === "float"
                ? t("post.youAreFloat", { time: formatTime(post.started_at, locale) })
                : t("post.youAre", {
                    function: t("post.office"),
                    lodge: lodgeName(post.lodge_id),
                    time: formatTime(post.started_at, locale),
                  })
              : t("post.noPost")}
          </button>
          <LanguageSelect persist />
          <span className="user-name">
            {staffName(staff)} · {staff ? t(`users.roles.${staff.role}`) : ""}
          </span>
          <button type="button" className="link-button" onClick={() => void signOut()}>
            {t("auth.signOut")}
          </button>
        </div>
      </header>

      <nav className="sidebar" aria-label="Menu">
        {GROUPS.map((group) => {
          const items = group.items.filter((i) => !i.managementOnly || isManagement);
          const future = FUTURE[group.label];
          if (items.length === 0 && !future) return null;
          return (
            <div className="nav-group" key={group.label}>
              <div className="nav-group-label">{t(group.label)}</div>
              {items.map((item) => (
                <NavLink key={item.to} to={item.to} end={item.to === "/"} className="nav-item">
                  {t(item.label)}
                </NavLink>
              ))}
              {future && <div className="nav-item nav-item-disabled">{t("app.comingInPhase", { phase: future })}</div>}
            </div>
          );
        })}
      </nav>

      <main className="content">
        <Outlet />
      </main>
    </div>
  );
}
