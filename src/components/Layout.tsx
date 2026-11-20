import { useEffect, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import {
  BedDouble, CalendarCheck, ClipboardCheck, Eye, History, House, LayoutGrid, ListChecks, NotebookPen, Plane, ScrollText,
  ShieldAlert, UserX, Users, Wrench,
  type LucideIcon,
} from "lucide-react";
import { useAuth } from "@/auth/AuthProvider";
import { useI18n, type MessageKey } from "@/i18n";
import { formatTime } from "@/lib/time";
import { staffName } from "@/lib/types";
import { BADGE_FOR_PATH, usePendingCounts } from "@/lib/pending";
import { MaintenanceReminder } from "@/pages/Maintenance";
import { Clock } from "./Clock";
import { Dialog } from "./Dialog";
import { LanguageSelect } from "./LanguageSelect";

type Item = { to: string; label: MessageKey; icon: LucideIcon; managementOnly?: boolean };
type Group = { label: MessageKey; items: Item[]; phase?: number };

// Menu em cinco grupos (s.11). Telas de fases futuras aparecem desativadas.
export const GROUPS: Group[] = [
  {
    label: "nav.groupToday",
    items: [
      { to: "/", label: "nav.today", icon: House },
      { to: "/tasks", label: "nav.tasks", icon: ListChecks },
    ],
  },
  {
    label: "nav.groupResidents",
    items: [
      { to: "/residents", label: "nav.residents", icon: Users },
      { to: "/sheet", label: "nav.sheet", icon: ClipboardCheck },
      { to: "/seen", label: "nav.seen", icon: Eye },
      { to: "/absences", label: "nav.absences", icon: Plane },
      { to: "/no-shows", label: "nav.noShows", icon: UserX },
      { to: "/warnings", label: "nav.warnings", icon: ShieldAlert },
      { to: "/beds", label: "nav.bedMap", icon: BedDouble },
    ],
  },
  {
    label: "nav.groupOccurrences",
    items: [
      { to: "/handover", label: "nav.handover", icon: NotebookPen },
      { to: "/maintenance", label: "nav.maintenance", icon: Wrench },
    ],
  },
  { label: "nav.groupServices", items: [], phase: 2 },
  {
    label: "nav.groupManagement",
    items: [
      { to: "/users", label: "nav.users", icon: ScrollText, managementOnly: true },
      { to: "/audit", label: "nav.audit", icon: History, managementOnly: true },
    ],
  },
];

// Atalhos da barra inferior (celular): o que a recepção mais usa.
const BOTTOM: Item[] = [
  { to: "/", label: "nav.today", icon: House },
  { to: "/sheet", label: "nav.sheet", icon: ClipboardCheck },
  { to: "/handover", label: "nav.handover", icon: NotebookPen },
  { to: "/tasks", label: "nav.tasks", icon: CalendarCheck },
];

export function Layout() {
  const { staff, post, lodges, isManagement, serverOffsetMs, signOut } = useAuth();
  const { t, locale } = useI18n();
  const navigate = useNavigate();
  const location = useLocation();
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => setMenuOpen(false), [location.pathname]);

  // Bolinhas vermelhas: Lodge do posto (Office) ou os dois (gestão, Float).
  const badgeLodges = post?.function === "office" && post.lodge_id && !isManagement ? [post.lodge_id] : lodges.map((l) => l.id);
  const counts = usePendingCounts(badgeLodges, location.pathname);
  const badge = (to: string) => {
    const key = BADGE_FOR_PATH[to];
    const n = key ? counts[key] : 0;
    return n > 0 ? <span className="nav-badge" aria-label={String(n)}>{n > 99 ? "99+" : n}</span> : null;
  };

  const lodgeName = (id: string | null) => lodges.find((l) => l.id === id)?.short_name ?? "";
  const groups = GROUPS.map((g) => ({ ...g, items: g.items.filter((i) => !i.managementOnly || isManagement) }));

  const navList = (
    <>
      {groups.map((group) =>
        group.items.length === 0 && !group.phase ? null : (
          <div className="nav-group" key={group.label}>
            <div className="nav-group-label eyebrow">{t(group.label)}</div>
            {group.items.map((item) => (
              <NavLink key={item.to} to={item.to} end={item.to === "/"} className="nav-item">
                <item.icon size={17} strokeWidth={1.8} aria-hidden="true" />
                {t(item.label)}
                {badge(item.to)}
              </NavLink>
            ))}
            {group.phase && <div className="nav-item-disabled">{t("app.comingInPhase", { phase: group.phase })}</div>}
          </div>
        ),
      )}
    </>
  );

  return (
    <div className="shell">
      <nav className="sidebar" aria-label="Menu">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">DS</span>
          {t("app.name")}
        </div>
        {navList}
      </nav>

      <header className={`topbar${scrolled ? " is-scrolled" : ""}`}>
        <span className="brand hide-desktop">
          <span className="brand-mark" aria-hidden="true">DS</span>
        </span>
        <Clock offsetMs={serverOffsetMs} />
        <div className="topbar-right">
          <button type="button" className={`post-chip${post ? " is-on" : ""}`} onClick={() => navigate("/post")}>
            {post && <span className="dot" aria-hidden="true" />}
            <span className="hide-mobile">
              {post
                ? post.function === "float"
                  ? t("post.youAreFloat", { time: formatTime(post.started_at, locale) })
                  : t("post.youAre", { function: t("post.office"), lodge: lodgeName(post.lodge_id), time: formatTime(post.started_at, locale) })
                : t("post.noPost")}
            </span>
            <span className="hide-desktop">{post ? (post.function === "float" ? "Float" : lodgeName(post.lodge_id)) : t("post.noPost")}</span>
          </button>
          <span className="hide-mobile"><LanguageSelect persist /></span>
          <span className="user-name hide-mobile">
            {staffName(staff)} · {staff ? t(`users.roles.${staff.role}`) : ""}
          </span>
          <button type="button" className="link-button hide-mobile" onClick={() => void signOut()}>
            {t("auth.signOut")}
          </button>
        </div>
      </header>

      <main className="content" key={location.pathname}>
        <Outlet />
      </main>

      <nav className="bottom-nav" aria-label="Menu">
        {BOTTOM.map((item) => (
          <NavLink key={item.to} to={item.to} end={item.to === "/"}>
            <span className="bottom-icon">
              <item.icon size={21} strokeWidth={1.8} aria-hidden="true" />
              {badge(item.to)}
            </span>
            {t(item.label)}
          </NavLink>
        ))}
        <button type="button" onClick={() => setMenuOpen(true)}>
          <LayoutGrid size={21} strokeWidth={1.8} aria-hidden="true" />
          {t("nav.menu")}
        </button>
      </nav>

      <MaintenanceReminder />

      {menuOpen && (
        <Dialog title={t("nav.menu")} onClose={() => setMenuOpen(false)}>
          <div className="drawer-list">
            {navList}
            <div className="inline">
              <LanguageSelect persist />
              <button type="button" className="link-button" onClick={() => void signOut()}>
                {t("auth.signOut")} · {staffName(staff)}
              </button>
            </div>
          </div>
        </Dialog>
      )}
    </div>
  );
}
