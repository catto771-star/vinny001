import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent } from "react";
import { NavLink, Outlet, useLocation, useNavigationType } from "react-router-dom";
import { transitionKind, type TransitionKind } from "@/lib/transition";
import {
  BedDouble, Settings2, ListChecks, ClipboardCheck, Eye, History, House, LayoutGrid, NotebookPen, Plane, ScrollText,
  Bell, CalendarDays, FileText, ChartColumn, ChevronDown, ShieldAlert, ShoppingCart, Timer, TreePalm, Shirt, Thermometer, Truck, UserX, Users, UtensilsCrossed, Wrench,
  type LucideIcon,
} from "lucide-react";
import { useAuth } from "@/auth/AuthProvider";
import { useI18n, type MessageKey } from "@/i18n";
import { staffName } from "@/lib/types";
import { badgeFor, groupBadgeTotal, usePendingCounts } from "@/lib/pending";
import { groupIndexOfPath, nextOpen, readOpen, writeOpen } from "@/lib/navGroups";
import { supabase } from "@/lib/supabase";
import { MaintenanceReminder } from "@/pages/Maintenance";
import { Clock } from "./Clock";
import { Dialog } from "./Dialog";
import { ThemeToggle } from "./ThemeToggle";
import { onDutyFor, useOnDuty } from "@/lib/useOnDuty";
import { useContinuitySnapshot } from "@/lib/continuity";
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
      { to: "/continuity", label: "nav.continuity", icon: FileText },
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
      { to: "/settings", label: "nav.settings", icon: Settings2 },
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

/** Mantém a cópia da folha de continuidade atualizada (a cada hora, com o sistema aberto). */
function ContinuityKeeper() {
  const { lodges, staff } = useAuth();
  const { posts } = useOnDuty();
  useContinuitySnapshot(staff?.id ?? null, !!staff, lodges, posts);
  return null;
}

export function Layout() {
  return (
    <ActiveLodgeProvider>
      <ContinuityKeeper />
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
  const { lodges, isManagement } = useAuth();
  const { activeId, setActiveId } = useActiveLodge();
  const { t } = useI18n();
  // Só Admin alterna entre as casas; conta de casa (station) fica presa à sua.
  if (!isManagement || lodges.length < 2) return null;
  const active = lodges.find((l) => l.id === activeId);
  const idx = Math.max(0, lodges.findIndex((l) => l.id === activeId));
  const move = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (!["ArrowRight", "ArrowLeft", "ArrowDown", "ArrowUp"].includes(e.key)) return;
    e.preventDefault();
    const step = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : -1;
    const next = lodges[(idx + step + lodges.length) % lodges.length];
    setActiveId(next.id);
    (e.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('[role="radio"]')[lodges.indexOf(next)])?.focus();
  };
  return (
    <div className="house-toggle" role="radiogroup" aria-label={t("nav.activeHouse")} data-active={houseOf(active)} style={{ "--n": lodges.length, "--i": idx } as CSSProperties}>
      <span className="house-toggle-thumb" aria-hidden="true" />
      {lodges.map((l) => (
        <button key={l.id} type="button" role="radio" aria-checked={l.id === activeId} tabIndex={l.id === activeId ? 0 : -1}
          className={`house-toggle-opt house-${houseOf(l)}`} onClick={() => setActiveId(l.id)} onKeyDown={move}>
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
    const n = badgeFor(to, counts, unread);
    return n > 0 ? <span className="nav-badge" aria-label={String(n)}>{n > 99 ? "99+" : n}</span> : null;
  };

  const groups = GROUPS.map((g) => ({ ...g, items: g.items.filter((i) => !i.managementOnly || isManagement) }));

  // Módulos retraídos: o da rota ativa abre sozinho; a escolha fica guardada.
  const [openGroups, setOpenGroups] = useState<string[]>(readOpen);
  useEffect(() => {
    const i = groupIndexOfPath(groups.map((g) => g.items.map((x) => x.to)), location.pathname);
    if (i >= 0) setOpenGroups((o) => (o.includes(groups[i].label) ? o : [...o, groups[i].label]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname]);
  useEffect(() => writeOpen(openGroups), [openGroups]);

  const renderNav = (only?: MessageKey) => (
    <>
      {groups.filter((g) => !only || g.label === only).map((group) => {
        if (group.items.length === 0 && !group.phase) return null;
        const id = `nav-${group.label.replace(/\W/g, "-")}`;
        const open = !!only || openGroups.includes(group.label);
        const total = groupBadgeTotal(group.items.map((i) => i.to), counts, unread);
        return (
          <div className={`nav-group${open ? " is-open" : ""}`} key={group.label}>
            {only ? (
              <div className="nav-group-label eyebrow">{t(group.label)}</div>
            ) : (
              <button type="button" className="nav-group-toggle" id={`${id}-btn`} aria-expanded={open} aria-controls={`${id}-panel`}
                onClick={() => setOpenGroups((o) => nextOpen(o, group.label))}>
                <span className="nav-group-title">{t(group.label)}</span>
                {total > 0 && <span className="nav-badge" aria-label={t("nav.pendingTotal", { n: total })}>{total > 99 ? "99+" : total}</span>}
                <ChevronDown className="nav-chevron" size={16} aria-hidden="true" />
              </button>
            )}
            <div className="nav-sub" id={`${id}-panel`} role="group" aria-labelledby={only ? undefined : `${id}-btn`}>
              <div className="nav-sub-inner">
                {group.items.map((item) => (
                  <NavLink key={item.to} to={item.to} end={item.to === "/"} className="nav-item">
                    <item.icon size={17} strokeWidth={1.8} aria-hidden="true" />
                    {t(item.label)}
                    {badge(item.to)}
                  </NavLink>
                ))}
                {group.phase && <div className="nav-item-disabled">{t("app.comingInPhase", { phase: group.phase })}</div>}
              </div>
            </div>
          </div>
        );
      })}
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
            {staffName(staff)} · {staff ? t(`users.rolesShort.${staff.role}`) : ""}
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
