import { Fragment, useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import {
  Bell, CalendarDays, CheckSquare, Dumbbell, FolderKanban, Gauge, LogOut, Menu, Moon, Notebook, RefreshCw, Repeat,
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
import { QuickCaptureModal } from './QuickCaptureModal';
import { ReviewModal } from './ReviewModal';

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

const ICON = { size: 18, strokeWidth: 1.5, 'aria-hidden': true } as const;

/** The mark: a weight plate seen from the front, drawn flat in one color. */
export function Mark({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden className="text-brand">
      <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" strokeWidth="2.5" />
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
    `relative z-[1] flex h-9 items-center gap-2.5 rounded-[10px] px-3 text-sm transition-colors duration-300 ${
      isActive ? 'bg-indicator font-medium text-fg shadow-[var(--indicator-shadow)]' : 'text-fg2 hover:bg-raised/60 hover:text-fg'
    }`;
  const mobile = SECTIONS.filter((s) => s.mobile);
  const inMore = !mobile.some((s) => pathname.startsWith(`/${s.path}`));

  return (
    <div className="min-h-screen md:flex">
      <a href="#main-content" className="skip-link">Pular para o conteúdo</a>
      <Motion />
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col overflow-y-auto px-3 py-5 md:flex">
        <div className="mb-4 flex h-8 items-center gap-2 px-3">
          <Mark />
          <span className="text-[17px] font-semibold tracking-[-0.02em]">Painel</span>
        </div>
        <button
          type="button"
          onClick={openCommandPalette}
          className="mb-4 flex h-9 items-center gap-2 rounded-[10px] bg-raised px-3 text-xs text-fg2 transition-colors hover:bg-sunken hover:text-fg"
          aria-label="Abrir busca global e comandos (Ctrl+K)"
        >
          <Search size={14} strokeWidth={1.75} aria-hidden="true" className="text-fg3" />
          <span className="mr-auto">Buscar ou agir…</span>
          <kbd className="rounded bg-surface px-1.5 py-0.5 font-mono text-[10px] text-fg3 shadow-[var(--indicator-shadow)]">⌘K</kbd>
        </button>
        <nav className="slide-group side-nav relative flex flex-col gap-0.5" aria-label="Seções">
          {SECTIONS.map(({ path, label, icon: Icon, group }, i) => {
            const showGroup = i > 0 && SECTIONS[i - 1].group !== group;
            return (
              <Fragment key={path}>
                {showGroup && (
                  <div className="mt-4 mb-1 px-3 text-[11px] font-medium tracking-[0.06em] text-fg3 uppercase select-none" aria-hidden="true">
                    {group}
                  </div>
                )}
                <NavLink to={`/${path}`} className={row}>
                  {({ isActive }) => (
                    <>
                      <Icon {...ICON} className={`transition-colors duration-300 ${isActive ? 'text-brand' : 'text-fg3'}`} />
                      <span className="truncate">{label}</span>
                    </>
                  )}
                </NavLink>
              </Fragment>
            );
          })}
        </nav>
        <div className="mt-auto border-t border-line pt-3">
          <div className="truncate px-3 pb-2 text-xs text-fg3" title={email}>{email}</div>
          <div className="flex gap-1 px-1">
            <button
              className="icon-btn"
              onClick={toggleTheme}
              title={theme === 'dark' ? 'Usar tema claro' : 'Usar tema escuro'}
              aria-label={theme === 'dark' ? 'Usar tema claro' : 'Usar tema escuro'}
            >
              {theme === 'dark' ? <Sun {...ICON} /> : <Moon {...ICON} />}
            </button>
            <button className="icon-btn" onClick={() => supabase.auth.signOut()} title="Sair" aria-label="Sair">
              <LogOut {...ICON} />
            </button>
          </div>
        </div>
      </aside>

      <main id="main-content" tabIndex={-1} key={pathname} className="enter mx-auto w-full min-w-0 max-w-[1440px] px-4 pt-7 pb-36 outline-none sm:px-6 md:px-10 md:pt-10 md:pb-16">
        <OfflineStatusBar />
        <Outlet />
      </main>

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
