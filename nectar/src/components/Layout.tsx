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

const ICON = { size: 18, strokeWidth: 1.6, 'aria-hidden': true } as const;

/** The mark: a crisp glowing emblem in the brand accent. */
export function Mark({ size = 22 }: { size?: number }) {
  return (
    <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] bg-brand/15 ring-1 ring-brand/30">
      <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden className="text-brand">
        <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="2.5" />
        <circle cx="12" cy="12" r="3" fill="currentColor" />
      </svg>
    </span>
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
      className="mb-5 flex flex-wrap items-center gap-2 rounded-xl border border-warning/30 bg-warning/10 px-3.5 py-2 text-xs text-fg"
    >
      <WifiOff size={15} strokeWidth={1.6} aria-hidden="true" className="shrink-0 text-warning" />
      <span className="mr-auto">
        {!online
          ? `Modo offline${pending > 0 ? ` · ${pending} ${pending === 1 ? 'alteração na fila' : 'alterações na fila'}` : ' · alterações ficam salvas na fila para sincronizar'}`
          : `${pending} ${pending === 1 ? 'alteração pendente' : 'alterações pendentes'} para sincronizar`}
      </span>
      {online && pending > 0 && (
        <button type="button" className="btn-secondary h-7 px-2.5 text-xs" disabled={syncing} onClick={() => void syncNow()}>
          <RefreshCw size={13} strokeWidth={1.6} aria-hidden="true" className={syncing ? 'animate-spin' : ''} />
          {syncing ? 'Sincronizando…' : 'Sincronizar agora'}
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
    `relative z-[1] flex h-10 items-center gap-3 rounded-[12px] px-3 text-sm transition-colors duration-200 ${
      isActive ? 'bg-brand font-medium text-on-brand' : 'text-fg2 hover:bg-raised/70 hover:text-fg'
    }`;
  const mobile = SECTIONS.filter((s) => s.mobile);
  const inMore = !mobile.some((s) => pathname.startsWith(`/${s.path}`));
  const handle = email.split('@')[0] || 'Usuário';
  const initials = handle.slice(0, 2).toUpperCase();

  return (
    <div className="min-h-screen md:flex">
      <a href="#main-content" className="skip-link">Pular para o conteúdo</a>
      <Motion />

      {/* Redesigned Deep Navy Sidebar */}
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-line bg-sunken md:flex">
        <div className="flex h-16 shrink-0 items-center gap-2.5 border-b border-line px-5">
          <Mark />
          <div className="min-w-0">
            <span className="block text-[17px] leading-5 font-semibold tracking-[-0.02em]">Painel</span>
            <span className="block text-[11px] text-fg3">Sistema pessoal</span>
          </div>
        </div>
        <nav className="slide-group side-nav relative flex flex-1 flex-col gap-0.5 overflow-y-auto px-3 py-4" aria-label="Seções">
          {SECTIONS.map(({ path, label, icon: Icon, group }, i) => {
            const showGroup = i > 0 && SECTIONS[i - 1].group !== group;
            return (
              <Fragment key={path}>
                {showGroup && (
                  <div className="mt-5 mb-1.5 px-3 text-[11px] font-medium text-fg3 select-none" aria-hidden="true">
                    {group}
                  </div>
                )}
                <NavLink to={`/${path}`} className={row}>
                  {({ isActive }) => (
                    <>
                      <Icon {...ICON} className={`transition-colors duration-200 ${isActive ? 'text-on-brand' : 'text-fg3'}`} />
                      <span className="truncate">{label}</span>
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
            className="flex w-full items-center justify-center gap-2 rounded-[12px] bg-raised px-3 py-2 text-xs font-medium text-fg transition-colors hover:bg-indicator"
          >
            <Wallet size={14} strokeWidth={1.7} className="text-brand-ink" aria-hidden="true" />
            <span>Registrar gasto rápido</span>
          </button>
        </div>
      </aside>

      {/* Main Column with Fixed Top Command Bar */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex h-16 shrink-0 items-center gap-2.5 border-b border-line bg-sunken/85 px-4 backdrop-blur-xl sm:px-6 md:px-8">
          {/* Mobile brand mark */}
          <div className="flex items-center gap-2 md:hidden">
            <Mark size={18} />
            <span className="text-[15px] font-semibold tracking-[-0.02em]">Painel</span>
          </div>

          {/* Primary quick-create button */}
          <button
            type="button"
            onClick={() => openQuickCapture('task')}
            className="hidden h-9 shrink-0 items-center gap-1.5 rounded-full bg-brand px-3.5 text-xs font-semibold text-on-brand transition-transform hover:opacity-95 active:scale-[0.97] sm:inline-flex"
          >
            <Plus size={15} strokeWidth={2.2} aria-hidden="true" />
            <span>Novo</span>
          </button>

          {/* Wide global search pill */}
          <button
            type="button"
            onClick={openCommandPalette}
            className="ml-auto flex h-9 min-w-0 flex-1 items-center gap-2 rounded-full border border-line bg-surface/80 px-3.5 text-xs text-fg2 transition-colors hover:border-line-strong hover:bg-surface hover:text-fg sm:ml-2 sm:max-w-md md:mx-auto md:max-w-lg"
            aria-label="Abrir busca global e comandos (Ctrl+K)"
          >
            <Search size={14} strokeWidth={1.8} aria-hidden="true" className="shrink-0 text-fg3" />
            <span className="mr-auto truncate">Buscar tarefas, finanças, projetos ou agir…</span>
            <kbd className="hidden rounded-md bg-raised px-1.5 py-0.5 font-mono text-[10px] text-fg3 sm:inline">⌘K</kbd>
          </button>

          {/* Right actions: Review, Theme, User pill, Sign out */}
          <div className="flex shrink-0 items-center gap-1.5">
            <button
              type="button"
              onClick={() => openGuidedReview('daily')}
              className="hidden h-9 items-center gap-1.5 rounded-full border border-line bg-surface px-3 text-xs font-medium text-fg2 transition-colors hover:border-line-strong hover:text-fg lg:inline-flex"
            >
              <Compass size={14} strokeWidth={1.7} className="text-brand-ink" aria-hidden="true" />
              <span>Revisão</span>
            </button>
            <button
              type="button"
              onClick={toggleTheme}
              className="flex h-9 w-9 items-center justify-center rounded-full border border-line bg-surface text-fg2 transition-colors hover:border-line-strong hover:text-fg"
              title={theme === 'dark' ? 'Usar tema claro' : 'Usar tema escuro'}
              aria-label={theme === 'dark' ? 'Usar tema claro' : 'Usar tema escuro'}
            >
              {theme === 'dark' ? <Sun size={16} strokeWidth={1.7} /> : <Moon size={16} strokeWidth={1.7} />}
            </button>
            <div className="hidden items-center gap-2 rounded-full border border-line bg-surface py-1 pr-3 pl-1.5 sm:flex" title={email}>
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-br from-[#6366f1] to-[#ec4899] text-[11px] font-semibold text-white">
                {initials}
              </span>
              <span className="max-w-[110px] truncate text-xs font-medium text-fg">{handle}</span>
            </div>
            <button
              type="button"
              className="hidden h-9 w-9 items-center justify-center rounded-full border border-line bg-surface text-fg3 transition-colors hover:border-line-strong hover:text-fg md:flex"
              onClick={() => supabase.auth.signOut()}
              title="Sair"
              aria-label="Sair"
            >
              <LogOut size={15} strokeWidth={1.7} />
            </button>
          </div>
        </header>

        <main id="main-content" tabIndex={-1} key={pathname} className="enter mx-auto w-full min-w-0 max-w-[1440px] flex-1 px-4 pt-6 pb-36 outline-none sm:px-6 md:px-8 md:pt-7 md:pb-16">
          <OfflineStatusBar />
          <Outlet />
        </main>
      </div>

      <nav
        className="glass-nav slide-group fixed inset-x-3 bottom-[max(12px,env(safe-area-inset-bottom))] z-20 grid grid-cols-5 gap-1 rounded-[22px] p-1.5 md:hidden"
        aria-label="Seções principais"
      >
        {mobile.map(({ path, label, icon: Icon }) => (
          <NavLink
            key={path} to={`/${path}`}
            className={({ isActive }) => `relative z-[1] flex h-14 flex-col items-center justify-center gap-1 rounded-[16px] text-[11px] font-medium transition-colors duration-300 active:scale-[0.94] ${isActive ? 'bg-primary text-primary-ink' : 'text-fg2'}`}
          >
            <Icon {...ICON} />{label}
          </NavLink>
        ))}
        <button
          type="button"
          aria-expanded={more}
          aria-haspopup="dialog"
          className={`relative z-[1] flex h-14 flex-col items-center justify-center gap-1 rounded-[16px] text-[11px] font-medium transition-[color,transform] duration-300 active:scale-[0.94] ${inMore ? 'text-brand-ink' : 'text-fg2'}`}
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
            className="mb-3 flex h-11 w-full items-center gap-2.5 rounded-[14px] bg-raised px-3.5 text-sm text-fg2 hover:text-fg"
          >
            <Search size={16} strokeWidth={1.6} aria-hidden="true" className="text-fg3" />
            <span>Buscar tarefas, projetos, notas ou agir…</span>
          </button>
          <nav className="grid grid-cols-2 gap-2" aria-label="Mais seções">
            {SECTIONS.filter((s) => !s.mobile).map(({ path, label, icon: Icon }) => (
              <NavLink
                key={path} to={`/${path}`} onClick={() => setMore(false)}
                className={({ isActive }) => `flex h-12 items-center gap-2.5 rounded-[14px] px-3.5 text-sm font-medium transition-[background-color,transform] duration-200 active:scale-[0.97] ${isActive ? 'bg-primary text-primary-ink' : 'bg-raised text-fg'}`}
              >
                <Icon {...ICON} />
                <span className="truncate">{label}</span>
              </NavLink>
            ))}
          </nav>
          <div className="mt-5 flex gap-2 border-t border-line pt-4">
            <button type="button" className="btn-secondary" onClick={toggleTheme}>{theme === 'dark' ? <Sun {...ICON} /> : <Moon {...ICON} />}{theme === 'dark' ? 'Tema claro' : 'Tema escuro'}</button>
            <button type="button" className="btn-ghost ml-auto" onClick={() => supabase.auth.signOut()}><LogOut {...ICON} />Sair</button>
          </div>
        </Modal>
      )}
      <CommandPalette />
      <QuickCaptureModal />
      <ReviewModal />
      <Toaster />
    </div>
  );
}
