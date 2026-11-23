import { Fragment, useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import {
  Bell, CalendarDays, CheckSquare, Compass, Dumbbell, FolderKanban, Gauge, LogOut, Menu, Moon, Notebook, Plus, RefreshCw, Repeat,
  Bot, Search, Settings, Sun, Target, Wallet, WifiOff, Workflow, type LucideIcon,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { flushPendingOfflineWrites } from '../lib/useTable';
import { loadOfflineQueue, subscribeOfflineQueue } from '../lib/offlineQueue';
import { applyTheme, readTheme, type Theme } from '../lib/theme';
import { Modal } from './ui';
import { Motion } from './Motion';
import { Toaster } from './Toaster';
import { CommandPalette, openCommandPalette } from './CommandPalette';
import { QuickCaptureModal, openQuickCapture } from './QuickCaptureModal';
import { ReviewModal, openGuidedReview } from './ReviewModal';
import { AssistantDrawer } from './AssistantDrawer';

type NavGroup = 'Dia a dia' | 'Vida e finanças' | 'Sistema';

export const SECTIONS: readonly { path: string; label: string; icon: LucideIcon; group: NavGroup; mobile?: boolean }[] = [
  { path: 'inicio', label: 'Início', icon: Gauge, group: 'Dia a dia', mobile: true },
  { path: 'assistente', label: 'Assistente', icon: Bot, group: 'Dia a dia' },
  { path: 'agenda', label: 'Agenda', icon: CalendarDays, group: 'Dia a dia' },
  { path: 'tarefas', label: 'Tarefas', icon: CheckSquare, group: 'Dia a dia', mobile: true },
  { path: 'habitos', label: 'Hábitos', icon: Repeat, group: 'Dia a dia', mobile: true },
  { path: 'lembretes', label: 'Lembretes', icon: Bell, group: 'Dia a dia' },
  { path: 'saude', label: 'Saúde', icon: Dumbbell, group: 'Vida e finanças', mobile: true },
  { path: 'financas', label: 'Finanças', icon: Wallet, group: 'Vida e finanças' },
  { path: 'projetos', label: 'Projetos', icon: FolderKanban, group: 'Vida e finanças' },
  { path: 'metas', label: 'Metas', icon: Target, group: 'Vida e finanças' },
  { path: 'conhecimento', label: 'Conhecimento', icon: Notebook, group: 'Vida e finanças' },
  { path: 'piloto-automatico', label: 'Piloto automático', icon: Workflow, group: 'Sistema' },
  { path: 'configuracoes', label: 'Configurações', icon: Settings, group: 'Sistema' },
];

const ICON = { size: 16, strokeWidth: 1.5, 'aria-hidden': true } as const;

/** Flat geometric mark in solid accent — no box, ring or glow. */
export function Mark({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" className="shrink-0 text-brand">
      <circle cx="12" cy="12" r="8.5" fill="none" stroke="currentColor" strokeWidth="2.2" />
      <circle cx="12" cy="12" r="3" fill="currentColor" />
    </svg>
  );
}

function OfflineStatusBar() {
  const [online, setOnline] = useState(() => (typeof navigator === 'undefined' ? true : navigator.onLine));
  const [pending, setPending] = useState(() => loadOfflineQueue().length);
  const [syncing, setSyncing] = useState(false);

  async function syncNow() {
    setSyncing(true);
    await flushPendingOfflineWrites();
    setPending(loadOfflineQueue().length);
    setSyncing(false);
  }

  useEffect(() => {
    const unsub = subscribeOfflineQueue((q) => setPending(q.length));
    const onOnline = () => { setOnline(true); void syncNow(); };
    const onOffline = () => setOnline(false);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    if (navigator.onLine && loadOfflineQueue().length > 0) void syncNow();
    return () => {
      unsub();
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, []);

  if (online && pending === 0) return null;

  return (
    <div
      role="status"
      className="mb-6 flex flex-wrap items-center gap-2 rounded-[10px] border border-warning/30 bg-surface px-4 py-2 text-xs text-fg"
    >
      <WifiOff {...ICON} className="shrink-0 text-warning" />
      <span className="mr-auto">
        {!online
          ? `Modo offline${pending > 0 ? ` · ${pending} ${pending === 1 ? 'alteração na fila' : 'alterações na fila'}` : ' · alterações ficam salvas na fila para sincronizar'}`
          : `${pending} ${pending === 1 ? 'alteração pendente' : 'alterações pendentes'} para sincronizar`}
      </span>
      {online && pending > 0 && (
        <button type="button" className="btn-secondary h-7 px-3 text-xs" disabled={syncing} onClick={() => void syncNow()}>
          <RefreshCw size={14} strokeWidth={1.5} aria-hidden="true" className={syncing ? 'animate-spin' : ''} />
          {syncing ? 'Sincronizando' : 'Sincronizar agora'}
        </button>
      )}
    </div>
  );
}

export default function Layout({ email }: { email: string }) {
  const [theme, setTheme] = useState<Theme>(readTheme());
  useEffect(() => {
    const follow = (e: Event) => setTheme((e as CustomEvent<Theme>).detail);
    window.addEventListener('painel-theme', follow);
    return () => window.removeEventListener('painel-theme', follow);
  }, []);
  const [more, setMore] = useState(false);
  const { pathname } = useLocation();
  const toggleTheme = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    applyTheme(next);
    setTheme(next);
  };
  const row = ({ isActive }: { isActive: boolean }) =>
    `relative z-[1] flex h-9 items-center gap-3 rounded-[8px] px-3 text-sm transition-colors duration-150 ${
      isActive ? 'bg-indicator font-medium text-fg' : 'text-fg2 hover:bg-raised/60 hover:text-fg'
    }`;
  const mobile = SECTIONS.filter((s) => s.mobile);
  const inMore = !mobile.some((s) => pathname.startsWith(`/${s.path}`));
  const handle = email.split('@')[0] || 'Usuário';
  const initials = handle.slice(0, 2).toUpperCase();

  return (
    <div className="min-h-screen md:flex">
      <a href="#main-content" className="skip-link">Pular para o conteúdo</a>
      <Motion />

      {/* Quiet Graphite Sidebar on 4px grid */}
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-line bg-sunken md:flex">
        <div className="flex h-14 shrink-0 items-center gap-3 border-b border-line px-4">
          <Mark size={20} />
          <span className="text-base leading-none font-semibold text-fg">Painel</span>
        </div>
        <nav className="slide-group side-nav relative flex flex-1 flex-col gap-1 overflow-y-auto px-3 py-4" aria-label="Seções">
          {SECTIONS.map(({ path, label, icon: Icon, group }, i) => {
            const showGroup = i > 0 && SECTIONS[i - 1].group !== group;
            return (
              <Fragment key={path}>
                {showGroup && (
                  <div className="mt-6 mb-2 px-3 text-xs leading-4 font-normal text-fg3 select-none" aria-hidden="true">
                    {group}
                  </div>
                )}
                <NavLink to={`/${path}`} className={row}>
                  {({ isActive }) => (
                    <>
                      <Icon {...ICON} className={`shrink-0 transition-colors duration-150 ${isActive ? 'text-fg' : 'text-fg3'}`} />
                      <span className="mr-auto truncate">{label}</span>
                      {isActive && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-brand" aria-hidden="true" />}
                    </>
                  )}
                </NavLink>
              </Fragment>
            );
          })}
        </nav>
        <div className="border-t border-line p-3">
          <button
            type="button"
            onClick={() => openQuickCapture('money')}
            className="flex h-9 w-full items-center justify-center gap-2 rounded-[8px] border border-line bg-surface px-3 text-xs font-medium text-fg2 transition-colors duration-150 hover:border-line-strong hover:text-fg"
          >
            <Wallet {...ICON} className="text-fg3" />
            <span>Registrar gasto</span>
          </button>
        </div>
      </aside>

      {/* Main Column with Quiet Top Command Bar */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex h-14 shrink-0 items-center gap-3 border-b border-line bg-bg/90 px-4 backdrop-blur-md sm:px-6 md:px-8">
          <div className="flex items-center gap-2 md:hidden">
            <Mark size={18} />
            <span className="text-base leading-none font-semibold text-fg">Painel</span>
          </div>

          <button
            type="button"
            onClick={() => openQuickCapture('task')}
            className="hidden h-8 shrink-0 items-center gap-1.5 rounded-[8px] bg-primary px-3 text-xs font-medium text-primary-ink transition-opacity duration-150 hover:opacity-90 active:scale-[0.98] sm:inline-flex"
            style={{ boxShadow: 'inset 0 1px 0 rgb(255 255 255 / 0.12)' }}
          >
            <Plus {...ICON} />
            <span>Novo</span>
          </button>

          <button
            type="button"
            onClick={openCommandPalette}
            className="ml-auto flex h-8 min-w-0 flex-1 items-center gap-2 rounded-[8px] border border-line bg-surface px-3 text-xs text-fg3 transition-colors duration-150 hover:border-line-strong hover:text-fg2 sm:ml-0 sm:max-w-xs md:max-w-sm"
            aria-label="Abrir busca e comandos (Ctrl+K)"
          >
            <Search {...ICON} className="shrink-0 text-fg3" />
            <span className="mr-auto truncate">Buscar</span>
            <span className="hidden items-center gap-1 sm:inline-flex" aria-hidden="true">
              <kbd className="rounded-[4px] border border-line bg-raised px-1.5 py-0.5 font-mono text-[11px] leading-none text-fg3">⌘</kbd>
              <kbd className="rounded-[4px] border border-line bg-raised px-1.5 py-0.5 font-mono text-[11px] leading-none text-fg3">K</kbd>
            </span>
          </button>

          <div className="ml-auto flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={() => openGuidedReview('daily')}
              className="hidden h-8 items-center gap-2 rounded-[8px] border border-line bg-surface px-3 text-xs font-medium text-fg2 transition-colors duration-150 hover:border-line-strong hover:text-fg lg:inline-flex"
            >
              <Compass {...ICON} className="text-fg3" />
              <span>Revisão</span>
            </button>
            <button
              type="button"
              onClick={toggleTheme}
              className="flex h-8 w-8 items-center justify-center rounded-[8px] border border-line bg-surface text-fg3 transition-colors duration-150 hover:border-line-strong hover:text-fg"
              title={theme === 'dark' ? 'Usar tema claro' : 'Usar tema escuro'}
              aria-label={theme === 'dark' ? 'Usar tema claro' : 'Usar tema escuro'}
            >
              {theme === 'dark' ? <Sun {...ICON} /> : <Moon {...ICON} />}
            </button>
            <div className="hidden h-8 items-center gap-2 rounded-[8px] border border-line bg-surface px-2 sm:flex" title={email}>
              <span className="flex h-5 w-5 items-center justify-center rounded-[4px] bg-raised font-mono text-[11px] font-medium text-fg2">
                {initials}
              </span>
              <span className="max-w-[112px] truncate text-xs text-fg2">{handle}</span>
            </div>
            <button
              type="button"
              className="hidden h-8 w-8 items-center justify-center rounded-[8px] border border-line bg-surface text-fg3 transition-colors duration-150 hover:border-line-strong hover:text-fg md:flex"
              onClick={() => supabase.auth.signOut()}
              title="Sair"
              aria-label="Sair"
            >
              <LogOut {...ICON} />
            </button>
          </div>
        </header>

        <main id="main-content" tabIndex={-1} key={pathname} className="enter mx-auto w-full min-w-0 max-w-[1440px] flex-1 px-4 pt-6 pb-32 outline-none sm:px-6 md:px-8 md:pt-8 md:pb-16">
          <OfflineStatusBar />
          <Outlet />
        </main>
      </div>

      <nav
        className="glass-nav slide-group fixed inset-x-3 bottom-[max(12px,env(safe-area-inset-bottom))] z-20 grid grid-cols-5 gap-1 rounded-[14px] p-1 md:hidden"
        aria-label="Seções principais"
      >
        {mobile.map(({ path, label, icon: Icon }) => (
          <NavLink
            key={path} to={`/${path}`}
            className={({ isActive }) => `relative z-[1] flex h-12 flex-col items-center justify-center gap-1 rounded-[10px] text-xs font-medium transition-colors duration-150 active:scale-[0.97] ${isActive ? 'bg-indicator text-fg' : 'text-fg3'}`}
          >
            <Icon {...ICON} />{label}
          </NavLink>
        ))}
        <button
          type="button"
          aria-expanded={more}
          aria-haspopup="dialog"
          className={`relative z-[1] flex h-12 flex-col items-center justify-center gap-1 rounded-[10px] text-xs font-medium transition-colors duration-150 active:scale-[0.97] ${inMore ? 'text-fg' : 'text-fg3'}`}
          onClick={() => setMore(true)}
        >
          <Menu {...ICON} />Mais
        </button>
      </nav>

      {more && (
        <Modal title="Seções" onClose={() => setMore(false)}>
          <button
            type="button"
            onClick={() => { setMore(false); openCommandPalette(); }}
            className="mb-3 flex h-10 w-full items-center gap-2 rounded-[8px] border border-line bg-raised px-3 text-sm text-fg2 hover:text-fg"
          >
            <Search {...ICON} className="text-fg3" />
            <span>Buscar</span>
          </button>
          <nav className="grid grid-cols-2 gap-2" aria-label="Mais seções">
            {SECTIONS.filter((s) => !s.mobile).map(({ path, label, icon: Icon }) => (
              <NavLink
                key={path} to={`/${path}`} onClick={() => setMore(false)}
                className={({ isActive }) => `flex h-10 items-center gap-2 rounded-[8px] px-3 text-sm font-medium transition-colors duration-150 active:scale-[0.98] ${isActive ? 'bg-primary text-primary-ink' : 'bg-raised text-fg'}`}
              >
                <Icon {...ICON} />
                <span className="truncate">{label}</span>
              </NavLink>
            ))}
          </nav>
          <div className="mt-4 flex gap-2 border-t border-line pt-4">
            <button type="button" className="btn-secondary" onClick={toggleTheme}>{theme === 'dark' ? <Sun {...ICON} /> : <Moon {...ICON} />}{theme === 'dark' ? 'Tema claro' : 'Tema escuro'}</button>
            <button type="button" className="btn-ghost ml-auto" onClick={() => supabase.auth.signOut()}><LogOut {...ICON} />Sair</button>
          </div>
        </Modal>
      )}
      <CommandPalette />
      <AssistantDrawer />
      <QuickCaptureModal />
      <ReviewModal />
      <Toaster />
    </div>
  );
}
