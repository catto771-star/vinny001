import { useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import {
  Bell, CalendarDays, CheckSquare, Dumbbell, FolderKanban, Gauge, LogOut, Menu, Moon, Notebook, Repeat,
  Settings, Sun, Target, Wallet, Workflow, type LucideIcon,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { applyTheme, readTheme, type Theme } from '../lib/theme';
import { Modal } from './ui';

export const SECTIONS: readonly { path: string; label: string; icon: LucideIcon; mobile?: boolean }[] = [
  { path: 'inicio', label: 'Início', icon: Gauge, mobile: true },
  { path: 'agenda', label: 'Agenda', icon: CalendarDays },
  { path: 'tarefas', label: 'Tarefas', icon: CheckSquare, mobile: true },
  { path: 'habitos', label: 'Hábitos', icon: Repeat, mobile: true },
  { path: 'saude', label: 'Saúde', icon: Dumbbell, mobile: true },
  { path: 'projetos', label: 'Projetos', icon: FolderKanban },
  { path: 'lembretes', label: 'Lembretes', icon: Bell },
  { path: 'financas', label: 'Finanças', icon: Wallet },
  { path: 'conhecimento', label: 'Conhecimento', icon: Notebook },
  { path: 'metas', label: 'Metas', icon: Target },
  { path: 'automacoes', label: 'Automações', icon: Workflow },
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
  const [more, setMore] = useState(false);
  const toggleTheme = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    applyTheme(next);
    setTheme(next);
  };
  const row = ({ isActive }: { isActive: boolean }) =>
    `flex h-9 items-center gap-2.5 rounded-lg px-3 text-sm transition-colors duration-150 ${
      isActive ? 'bg-raised text-fg shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]' : 'text-fg2 hover:bg-raised/60 hover:text-fg'
    }`;

  return (
    <div className="min-h-screen md:flex">
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-line bg-sunken px-3 py-4 md:flex">
        <div className="mb-6 flex h-8 items-center gap-2 px-3">
          <Mark />
          <span className="text-[17px] font-medium">Painel</span>
        </div>
        <nav className="flex flex-col gap-0.5" aria-label="Seções">
          {SECTIONS.map(({ path, label, icon: Icon }) => (
            <NavLink key={path} to={`/${path}`} className={row}>
              {({ isActive }) => (
                <>
                  <Icon {...ICON} className={isActive ? 'text-brand' : 'text-fg3'} />
                  {label}
                </>
              )}
            </NavLink>
          ))}
        </nav>
        <div className="mt-auto border-t border-line pt-3">
          <div className="truncate px-3 pb-2 text-xs text-fg3">{email}</div>
          <div className="flex gap-1">
            <button className="icon-btn" onClick={toggleTheme} aria-label={theme === 'dark' ? 'Usar tema claro' : 'Usar tema escuro'}>
              {theme === 'dark' ? <Sun {...ICON} /> : <Moon {...ICON} />}
            </button>
            <button className="icon-btn" onClick={() => supabase.auth.signOut()} aria-label="Sair"><LogOut {...ICON} /></button>
          </div>
        </div>
      </aside>

      <main className="enter mx-auto w-full min-w-0 max-w-[1440px] px-4 pb-28 pt-6 md:px-8 md:pb-12 md:pt-8">
        <Outlet />
      </main>

      <nav className="fixed inset-x-0 bottom-0 z-20 grid grid-cols-5 border-t border-line bg-sunken/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden" aria-label="Seções principais">
        {SECTIONS.filter((s) => s.mobile).map(({ path, label, icon: Icon }) => (
          <NavLink key={path} to={`/${path}`} className={({ isActive }) => `flex h-16 flex-col items-center justify-center gap-1 text-[11px] ${isActive ? 'text-fg' : 'text-fg3'}`}>
            {({ isActive }) => (<><Icon {...ICON} className={isActive ? 'text-brand' : ''} />{label}</>)}
          </NavLink>
        ))}
        <button className="flex h-16 flex-col items-center justify-center gap-1 text-[11px] text-fg3" onClick={() => setMore(true)}>
          <Menu {...ICON} />Mais
        </button>
      </nav>

      {more && (
        <Modal title="Seções" onClose={() => setMore(false)}>
          <nav className="grid grid-cols-2 gap-2">
            {SECTIONS.filter((s) => !s.mobile).map(({ path, label, icon: Icon }) => (
              <NavLink key={path} to={`/${path}`} onClick={() => setMore(false)} className="flex h-11 items-center gap-2.5 rounded-[10px] border border-line bg-raised px-3 text-sm">
                <Icon {...ICON} className="text-fg3" />{label}
              </NavLink>
            ))}
          </nav>
          <div className="mt-4 flex gap-2 border-t border-line pt-4">
            <button className="btn-secondary" onClick={toggleTheme}>{theme === 'dark' ? <Sun {...ICON} /> : <Moon {...ICON} />}{theme === 'dark' ? 'Tema claro' : 'Tema escuro'}</button>
            <button className="btn-ghost ml-auto" onClick={() => supabase.auth.signOut()}><LogOut {...ICON} />Sair</button>
          </div>
        </Modal>
      )}
    </div>
  );
}
