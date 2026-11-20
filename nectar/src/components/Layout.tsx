import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import {
  Bell, CalendarDays, CheckSquare, Dumbbell, FolderKanban, Gauge, LogOut, Menu, Moon, Notebook, Repeat,
  Bot, Settings, Sun, Target, Wallet, Workflow, type LucideIcon,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { applyTheme, readTheme, type Theme } from '../lib/theme';
import { Modal } from './ui';
import { Motion } from './Motion';
import { Toaster } from './Toaster';

export const SECTIONS: readonly { path: string; label: string; icon: LucideIcon; mobile?: boolean }[] = [
  { path: 'inicio', label: 'Início', icon: Gauge, mobile: true },
  { path: 'assistente', label: 'Assistente', icon: Bot },
  { path: 'agenda', label: 'Agenda', icon: CalendarDays },
  { path: 'tarefas', label: 'Tarefas', icon: CheckSquare, mobile: true },
  { path: 'habitos', label: 'Hábitos', icon: Repeat, mobile: true },
  { path: 'saude', label: 'Saúde', icon: Dumbbell, mobile: true },
  { path: 'projetos', label: 'Projetos', icon: FolderKanban },
  { path: 'lembretes', label: 'Lembretes', icon: Bell },
  { path: 'financas', label: 'Finanças', icon: Wallet },
  { path: 'conhecimento', label: 'Conhecimento', icon: Notebook },
  { path: 'metas', label: 'Metas', icon: Target },
  { path: 'piloto-automatico', label: 'Piloto automático', icon: Workflow },
  { path: 'configuracoes', label: 'Configurações', icon: Settings },
];

const ICON = { size: 18, strokeWidth: 1.5 } as const;

/** The mark: a weight plate seen from the front, drawn flat in one color. */
export function Mark({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden className="text-brand">
      <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" strokeWidth="2.5" />
      <circle cx="12" cy="12" r="3" fill="currentColor" />
    </svg>
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
      isActive ? 'bg-indicator font-medium text-fg shadow-[var(--indicator-shadow)]' : 'text-fg2 hover:text-fg'
    }`;
  const mobile = SECTIONS.filter((s) => s.mobile);
  const inMore = !mobile.some((s) => pathname.startsWith(`/${s.path}`));

  return (
    <div className="min-h-screen md:flex">
      <Motion />
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col px-3 py-5 md:flex">
        <div className="mb-7 flex h-8 items-center gap-2 px-3">
          <Mark />
          <span className="text-[17px] font-semibold tracking-[-0.02em]">Painel</span>
        </div>
        <nav className="slide-group side-nav relative flex flex-col gap-0.5" aria-label="Seções">
          {SECTIONS.map(({ path, label, icon: Icon }) => (
            <NavLink key={path} to={`/${path}`} className={row}>
              {({ isActive }) => (
                <>
                  <Icon {...ICON} className={`transition-colors duration-300 ${isActive ? 'text-brand' : 'text-fg3'}`} />
                  {label}
                </>
              )}
            </NavLink>
          ))}
        </nav>
        <div className="mt-auto pt-3">
          <div className="truncate px-3 pb-2 text-xs text-fg3">{email}</div>
          <div className="flex gap-1">
            <button className="icon-btn" onClick={toggleTheme} aria-label={theme === 'dark' ? 'Usar tema claro' : 'Usar tema escuro'}>
              {theme === 'dark' ? <Sun {...ICON} /> : <Moon {...ICON} />}
            </button>
            <button className="icon-btn" onClick={() => supabase.auth.signOut()} aria-label="Sair"><LogOut {...ICON} /></button>
          </div>
        </div>
      </aside>

      <main key={pathname} className="enter mx-auto w-full min-w-0 max-w-[1440px] px-4 pt-7 pb-36 sm:px-6 md:px-10 md:pt-10 md:pb-16">
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
          className={`relative z-[1] flex h-14 flex-col items-center justify-center gap-1 rounded-[16px] text-[11px] font-medium transition-[color,transform] duration-300 active:scale-[0.94] ${inMore ? 'text-brand-ink' : 'text-fg2'}`}
          onClick={() => setMore(true)}
        >
          <Menu {...ICON} />Mais
        </button>
      </nav>

      {more && (
        <Modal title="Seções" onClose={() => setMore(false)}>
          <nav className="grid grid-cols-2 gap-2">
            {SECTIONS.filter((s) => !s.mobile).map(({ path, label, icon: Icon }) => (
              <NavLink
                key={path} to={`/${path}`} onClick={() => setMore(false)}
                className={({ isActive }) => `flex h-12 items-center gap-2.5 rounded-[14px] px-3.5 text-sm font-medium transition-[background-color,transform] duration-200 active:scale-[0.97] ${isActive ? 'bg-primary text-primary-ink' : 'bg-raised text-fg'}`}
              >
                <Icon {...ICON} />{label}
              </NavLink>
            ))}
          </nav>
          <div className="mt-5 flex gap-2 pt-1">
            <button className="btn-secondary" onClick={toggleTheme}>{theme === 'dark' ? <Sun {...ICON} /> : <Moon {...ICON} />}{theme === 'dark' ? 'Tema claro' : 'Tema escuro'}</button>
            <button className="btn-ghost ml-auto" onClick={() => supabase.auth.signOut()}><LogOut {...ICON} />Sair</button>
          </div>
        </Modal>
      )}
      <Toaster />
    </div>
  );
}
