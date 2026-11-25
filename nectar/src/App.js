import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useState } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { isConfigured, supabase } from './lib/supabase';
import Layout, { SECTIONS } from './components/Layout';
import { readStart } from './lib/prefs';
import Login from './pages/Login';
import Home from './pages/Home';
import Tasks from './pages/Tasks';
import Habits from './pages/Habits';
import Reminders from './pages/Reminders';
import Placeholder from './pages/Placeholder';
import Settings from './pages/Settings';
import Health from './pages/health/Health';
import Finance from './pages/finance/Finance';
import Agenda from './pages/Agenda';
import Projects from './pages/projects/Projects';
import Goals from './pages/Goals';
import Knowledge from './pages/knowledge/Knowledge';
import Automations from './pages/Automations';
import Assistant from './pages/Assistant';
const READY = {
    inicio: _jsx(Home, {}),
    assistente: _jsx(Assistant, {}),
    tarefas: _jsx(Tasks, {}),
    habitos: _jsx(Habits, {}),
    lembretes: _jsx(Reminders, {}),
    saude: _jsx(Health, {}),
    financas: _jsx(Finance, {}),
    agenda: _jsx(Agenda, {}),
    projetos: _jsx(Projects, {}),
    metas: _jsx(Goals, {}),
    conhecimento: _jsx(Knowledge, {}),
    'piloto-automatico': _jsx(Automations, {}),
};
export default function App() {
    const [session, setSession] = useState(undefined);
    useEffect(() => {
        supabase.auth.getSession().then(({ data }) => setSession(data.session));
        const { data } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
        return () => data.subscription.unsubscribe();
    }, []);
    if (!isConfigured) {
        return (_jsxs("div", { className: "mx-auto max-w-lg p-8", children: [_jsx("h1", { className: "text-xl font-semibold", children: "Configure o Supabase" }), _jsxs("p", { className: "mt-2 text-sm text-slate-600", children: ["Copie ", _jsx("code", { children: ".env.example" }), " para ", _jsx("code", { children: ".env.local" }), " e preencha a URL e a chave do seu projeto."] })] }));
    }
    if (session === undefined)
        return null;
    if (!session)
        return _jsx(Login, {});
    return (_jsx(Routes, { children: _jsxs(Route, { element: _jsx(Layout, { email: session.user.email ?? '' }), children: [_jsx(Route, { index: true, element: _jsx(Navigate, { to: `/${readStart(SECTIONS.map((x) => x.path))}`, replace: true }) }), SECTIONS.map((s) => (_jsx(Route, { path: s.path, element: s.path === 'configuracoes' ? _jsx(Settings, { email: session.user.email ?? '' }) : READY[s.path] ?? _jsx(Placeholder, { title: s.label }) }, s.path))), _jsx(Route, { path: "automacoes", element: _jsx(Navigate, { to: "/piloto-automatico", replace: true }) }), _jsx(Route, { path: "*", element: _jsx(Navigate, { to: "/inicio", replace: true }) })] }) }));
}
