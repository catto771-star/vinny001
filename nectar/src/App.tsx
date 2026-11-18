import { useEffect, useState, type ReactElement } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import type { Session } from '@supabase/supabase-js';
import { isConfigured, supabase } from './lib/supabase';
import Layout, { SECTIONS } from './components/Layout';
import Login from './pages/Login';
import Home from './pages/Home';
import Tasks from './pages/Tasks';
import Habits from './pages/Habits';
import Reminders from './pages/Reminders';
import Placeholder from './pages/Placeholder';
import Settings from './pages/Settings';
import Health from './pages/health/Health';

const READY: Record<string, ReactElement> = {
  inicio: <Home />,
  tarefas: <Tasks />,
  habitos: <Habits />,
  lembretes: <Reminders />,
  saude: <Health />,
};

export default function App() {
  const [session, setSession] = useState<Session | null | undefined>(undefined);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);

  if (!isConfigured) {
    return (
      <div className="mx-auto max-w-lg p-8">
        <h1 className="text-xl font-semibold">Configure o Supabase</h1>
        <p className="mt-2 text-sm text-slate-600">
          Copie <code>.env.example</code> para <code>.env.local</code> e preencha a URL e a chave do seu projeto.
        </p>
      </div>
    );
  }
  if (session === undefined) return null;
  if (!session) return <Login />;

  return (
    <Routes>
      <Route element={<Layout email={session.user.email ?? ''} />}>
        <Route index element={<Navigate to="/inicio" replace />} />
        {SECTIONS.map((s) => (
          <Route
            key={s.path}
            path={s.path}
            element={s.path === 'configuracoes' ? <Settings email={session.user.email ?? ''} /> : READY[s.path] ?? <Placeholder title={s.label} />}
          />
        ))}
        <Route path="*" element={<Navigate to="/inicio" replace />} />
      </Route>
    </Routes>
  );
}
