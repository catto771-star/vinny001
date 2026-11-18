import { NavLink, Outlet } from 'react-router-dom';
import { supabase } from '../lib/supabase';

export const SECTIONS = [
  { path: 'inicio', label: 'Início', icon: '◎' },
  { path: 'agenda', label: 'Agenda', icon: '◷' },
  { path: 'tarefas', label: 'Tarefas', icon: '☑' },
  { path: 'habitos', label: 'Hábitos', icon: '↻' },
  { path: 'projetos', label: 'Projetos', icon: '▤' },
  { path: 'lembretes', label: 'Lembretes', icon: '⏰' },
  { path: 'financas', label: 'Finanças', icon: '$' },
  { path: 'conhecimento', label: 'Conhecimento', icon: '✎' },
  { path: 'metas', label: 'Metas', icon: '⚑' },
  { path: 'automacoes', label: 'Automações', icon: '⚙' },
  { path: 'configuracoes', label: 'Configurações', icon: '☰' },
] as const;

export default function Layout({ email }: { email: string }) {
  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <nav className="flex shrink-0 gap-1 overflow-x-auto border-b border-slate-200 bg-white p-2 md:sticky md:top-0 md:h-screen md:w-52 md:flex-col md:border-b-0 md:border-r dark:border-slate-800 dark:bg-slate-900">
        <div className="hidden px-3 pb-4 pt-2 text-lg font-semibold md:block">Painel</div>
        {SECTIONS.map((s) => (
          <NavLink
            key={s.path}
            to={`/${s.path}`}
            className={({ isActive }) =>
              `flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-sm ${
                isActive
                  ? 'bg-sky-50 font-medium text-sky-700 dark:bg-sky-950 dark:text-sky-300'
                  : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'
              }`
            }
          >
            <span className="w-4 text-center" aria-hidden>{s.icon}</span>
            {s.label}
          </NavLink>
        ))}
        <div className="mt-auto hidden px-3 py-2 text-xs text-slate-500 md:block">
          <div className="truncate">{email}</div>
          <button className="mt-1 underline" onClick={() => supabase.auth.signOut()}>Sair</button>
        </div>
      </nav>
      <main className="min-w-0 flex-1 p-4 md:p-8">
        <Outlet />
      </main>
    </div>
  );
}
