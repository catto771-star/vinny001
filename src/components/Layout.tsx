import { useEffect, useRef, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigationType } from "react-router-dom";
import { transitionKind, type TransitionKind } from "@/lib/transition";
import {
  BedDouble, Settings2, ListChecks, ClipboardCheck, Eye, History, House, LayoutGrid, NotebookPen, Plane, ScrollText,
  Bell, CalendarDays, ChartColumn, ShieldAlert, ShoppingCart, Timer, TreePalm, Shirt, Thermometer, Truck, UserX, Users, UtensilsCrossed, Wrench,
  type LucideIcon,
} from "lucide-react";
import { useAuth } from "@/auth/AuthProvider";
import { useI18n, type MessageKey } from "@/i18n";
import { staffName } from "@/lib/types";
import { BADGE_FOR_PATH, usePendingCounts } from "@/lib/pending";
import { supabase } from "@/lib/supabase";
import { MaintenanceReminder } from "@/pages/Maintenance";
import { Clock } from "./Clock";
import { Dialog } from "./Dialog";
import { ThemeToggle } from "./ThemeToggle";
import { onDutyFor, useOnDuty } from "@/lib/useOnDuty";
import { ActiveLodgeProvider, houseOf, useActiveLodge } from "@/lib/activeLodge";

type Item = { to: string; label: MessageKey; icon: LucideIcon; managementOnly?: boolean };
type Group = { label: MessageKey; items: Item[]; phase?: number };

// Menu em cinco grupos (s.11). Telas de fases futuras aparecem desativadas.
export const GROUPS: Group[] = [
  {
    label: "nav.groupToday",
    items: [
      { to: "/", label: "nav.today", icon: House },
      { to: "/tasks", label: "nav.tasks", icon: ListChecks },
      { to: "/notifications", label: "nav.notifications", icon: Bell, managementOnly: true },
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
  {
    label: "nav.groupServices",
    items: [
      { to: "/fridge", label: "nav.fridge", icon: Thermometer },
      { to: "/deliveries", label: "nav.deliveries", icon: Truck },
      { to: "/dinner", label: "nav.dinner", icon: UtensilsCrossed },
      { to: "/laundry", label: "nav.laundry", icon: Shirt },
    ],
  },
  {
    label: "nav.groupManagement",
    items: [
      { to: "/rota", label: "nav.rota", icon: CalendarDays, managementOnly: true },
      { to: "/purchases", label: "nav.purchases", icon: ShoppingCart, managementOnly: true },
      { to: "/hours", label: "nav.hours", icon: Timer, managementOnly: true },
      { to: "/vacations", label: "nav.vacations", icon: TreePalm },
      { to: "/reports", label: "nav.reports", icon: ChartColumn, managementOnly: true },
      { to: "/users", label: "nav.users", icon: ScrollText, managementOnly: true },
      { to: "/audit", label: "nav.audit", icon: History, managementOnly: true },
      { to: "/settings", label: "nav.settings", icon: Settings2, managementOnly: true },
    ],
  },
];

// Rótulos curtos da barra inferior (celular): uma linha, sem quebra. O menu lateral mantém os nomes completos.
export const BOTTOM_LABELS: Record<string, MessageKey> = {
  "/": "nav.today",
  "/sheet": "nav.shortSheet",
  "/handover": "nav.shortHandover",
  "/residents": "nav.residents",
};

// App dos Admins no celular (PWA): 5 abas — Home, Alerts, Presence, Log e More.
export const BOTTOM_ADMIN: Item[] = [
  { to: "/", label: "nav.today", icon: House },
  { to: "/notifications", label: "nav.alerts", icon: Bell },
  { to: "#presence", label: "nav.presence", icon: Eye },
  { to: "/handover", label: "nav.log", icon: NotebookPen },
];

// Atalhos da barra inferior (celular): o que a recepção mais usa.
const BOTTOM: Item[] = [
  { to: "/", label: "nav.today", icon: House },
  { to: "/sheet", label: "nav.sheet", icon: ClipboardCheck },
  { to: "/handover", label: "nav.handover", icon: NotebookPen },
  { to: "/residents", label: "nav.residents", icon: Users },
];

export function Layout() {
  return (
    <ActiveLodgeProvider>
      <Shell />
    </ActiveLodgeProvider>
  );
}

/** Logo (símbolo das duas casas, sem texto) e nome da casa ativa. */
export function HouseMark({ name }: { name?: string }) {
  return (
    <span className="brand">
      <img className="brand-logo" src="/logo.png" alt="" width={36} height={27} />
      {name && <span className="brand-house">{name}</span>}
    </span>
  );
}

/** Troca a casa ativa na hora (Float): muda a cor do cabeçalho e a casa em que as telas lançam. */
export function HouseSwitch() {
  const { lodges } = useAuth();
  const { activeId, setActiveId } = useActiveLodge();
  const { t } = useI18n();
  if (lodges.length < 2) return null;
  return (
    <div className="house-switch" role="group" aria-label={t("residents.lodge")}>
      {lodges.map((l) => (
        <button
          key={l.id}
          type="button"
          className={`house-option house-${houseOf(l)}${l.id === activeId ? " is-active" : ""}`}
          aria-pressed={l.id === activeId}
          onClick={() => setActiveId(l.id)}
        >
          {l.short_name}
        </button>
      ))}
    </div>
  );
}

/** Quem está trabalhando agora na casa ativa, segundo o Roster (Beta: não há mais "assumir posto"). */
function OnDutyChip() {
  const { t } = useI18n();
  const { activeId } = useActiveLodge();
  const { posts, loading } = useOnDuty();
  if (loading) return null;
  const p = onDutyFor(posts, activeId);
  return (
    <span className={`post-chip${p ? " is-on" : ""}`}>
      {p && <span className="dot" aria-hidden="true" />}
      {p ? t("post.onRoster", { name: staffName(p.staff) }) : t("post.nobodyOnRoster")}
    </span>
  );
}

function Shell() {
  const { staff, post, lodges, isManagement, serverOffsetMs, signOut } = useAuth();
  const { lodge: activeLodge } = useActiveLodge();
  const { t } = useI18n();
  const location = useLocation();
  const navType = useNavigationType();
  // Transição da tela (revisão 7): calculada uma vez por mudança de rota.
  const prevPath = useRef<string | null>(null);
  const kindFor = useRef<{ path: string; kind: TransitionKind }>({ path: "", kind: "none" });
  if (kindFor.current.path !== location.pathname) {
    kindFor.current = { path: location.pathname, kind: transitionKind(prevPath.current, location.pathname, navType) };
  }
  useEffect(() => { prevPath.current = location.pathname; }, [location.pathname]);
  const [scrolled, setScrolled] = useState(false);
  // Menu do celular: tudo ("all") ou só um grupo (aba Presence do app dos Admins).
  const [menuOpen, setMenuOpen] = useState<false | "all" | "presence">(false);

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
  const [unread, setUnread] = useState(0);
  useEffect(() => {
    if (!isManagement) return;
    const load = () => void supabase.rpc("unread_notifications_count").then(({ data }) => setUnread(Number(data ?? 0)));
    load();
    const id = window.setInterval(load, 60_000);
    return () => window.clearInterval(id);
  }, [isManagement, location.pathname]);
  const badge = (to: string) => {
    const key = BADGE_FOR_PATH[to];
    const n = to === "/notifications" ? unread : key ? counts[key] : 0;
    return n > 0 ? <span className="nav-badge" aria-label={String(n)}>{n > 99 ? "99+" : n}</span> : null;
  };

  const groups = GROUPS.map((g) => ({ ...g, items: g.items.filter((i) => !i.managementOnly || isManagement) }));

  const renderNav = (only?: MessageKey) => (
    <>
      {groups.filter((g) => !only || g.label === only).map((group) =>
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
        <HouseMark name={activeLodge?.name} />
        {renderNav()}
      </nav>

      <header className={`topbar${scrolled ? " is-scrolled" : ""}`}>
        <span className="hide-desktop"><HouseMark name={activeLodge?.short_name} /></span>
        <span className="hide-mobile topbar-house">{activeLodge?.name}</span>
        <Clock offsetMs={serverOffsetMs} />
        <HouseSwitch />
        <div className="topbar-right">
          <OnDutyChip />
          <ThemeToggle />
          <span className="user-name hide-mobile">
            {staffName(staff)} · {staff ? t(`users.roles.${staff.role}`) : ""}
          </span>
          <button type="button" className="link-button hide-mobile" onClick={() => void signOut()}>
            {t("auth.signOut")}
          </button>
        </div>
      </header>

      <main className="content" key={location.pathname} data-transition={kindFor.current.kind}>
        <Outlet />
      </main>

      <nav className="bottom-nav" aria-label="Menu">
        {(isManagement ? BOTTOM_ADMIN : BOTTOM).map((item) => item.to === "#presence" ? (
          <button key={item.to} type="button" onClick={() => setMenuOpen("presence")}>
            <span className="bottom-icon"><item.icon size={21} strokeWidth={1.8} aria-hidden="true" /></span>
            {t(item.label)}
          </button>
        ) : (
          <NavLink key={item.to} to={item.to} end={item.to === "/"}>
            <span className="bottom-icon">
              <item.icon size={21} strokeWidth={1.8} aria-hidden="true" />
              {badge(item.to)}
            </span>
            {t(BOTTOM_LABELS[item.to] ?? item.label)}
          </NavLink>
        ))}
        <button type="button" onClick={() => setMenuOpen("all")}>
          <LayoutGrid size={21} strokeWidth={1.8} aria-hidden="true" />
          {isManagement ? t("nav.more") : t("nav.menu")}
        </button>
      </nav>

      <MaintenanceReminder />

      {menuOpen && (
        <Dialog title={menuOpen === "presence" ? t("nav.presence") : t("nav.menu")} onClose={() => setMenuOpen(false)}>
          <div className="drawer-list">
            {renderNav(menuOpen === "presence" ? "nav.groupResidents" : undefined)}
            <div className="inline">
              <ThemeToggle withLabel />
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
