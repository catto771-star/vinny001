import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { Fragment, useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { Bell, CalendarDays, CheckSquare, Compass, Dumbbell, FolderKanban, Gauge, LogOut, Menu, Moon, Notebook, Plus, RefreshCw, Repeat, Bot, Search, Settings, Sun, Target, Wallet, WifiOff, Workflow, } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { flushPendingOfflineWrites } from '../lib/useTable';
import { loadOfflineQueue, subscribeOfflineQueue } from '../lib/offlineQueue';
import { applyTheme, readTheme } from '../lib/theme';
import { Modal } from './ui';
import { Motion } from './Motion';
import { Toaster } from './Toaster';
import { CommandPalette, openCommandPalette } from './CommandPalette';
import { QuickCaptureModal, openQuickCapture } from './QuickCaptureModal';
import { ReviewModal, openGuidedReview } from './ReviewModal';
import { AssistantDrawer } from './AssistantDrawer';
export const SECTIONS = [
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
const ICON = { size: 16, strokeWidth: 1.5, 'aria-hidden': true };
/** Flat geometric mark in solid accent — no box, ring or glow. */
export function Mark({ size = 20 }) {
    return (_jsxs("svg", { width: size, height: size, viewBox: "0 0 24 24", "aria-hidden": "true", className: "shrink-0 text-brand", children: [_jsx("circle", { cx: "12", cy: "12", r: "8.5", fill: "none", stroke: "currentColor", strokeWidth: "2.2" }), _jsx("circle", { cx: "12", cy: "12", r: "3", fill: "currentColor" })] }));
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
        if (navigator.onLine && loadOfflineQueue().length > 0)
            void syncNow();
        return () => {
            unsub();
            window.removeEventListener('online', onOnline);
            window.removeEventListener('offline', onOffline);
        };
    }, []);
    if (online && pending === 0)
        return null;
    return (_jsxs("div", { role: "status", className: "mb-6 flex flex-wrap items-center gap-2 rounded-[10px] border border-warning/30 bg-surface px-4 py-2 text-xs text-fg", children: [_jsx(WifiOff, { ...ICON, className: "shrink-0 text-warning" }), _jsx("span", { className: "mr-auto", children: !online
                    ? `Modo offline${pending > 0 ? ` · ${pending} ${pending === 1 ? 'alteração na fila' : 'alterações na fila'}` : ' · alterações ficam salvas na fila para sincronizar'}`
                    : `${pending} ${pending === 1 ? 'alteração pendente' : 'alterações pendentes'} para sincronizar` }), online && pending > 0 && (_jsxs("button", { type: "button", className: "btn-secondary h-7 px-3 text-xs", disabled: syncing, onClick: () => void syncNow(), children: [_jsx(RefreshCw, { size: 14, strokeWidth: 1.5, "aria-hidden": "true", className: syncing ? 'animate-spin' : '' }), syncing ? 'Sincronizando' : 'Sincronizar agora'] }))] }));
}
export default function Layout({ email }) {
    const [theme, setTheme] = useState(readTheme());
    useEffect(() => {
        const follow = (e) => setTheme(e.detail);
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
    const row = ({ isActive }) => `relative z-[1] flex h-9 items-center gap-3 rounded-[8px] px-3 text-sm transition-colors duration-150 ${isActive ? 'bg-indicator font-medium text-fg' : 'text-fg2 hover:bg-raised/60 hover:text-fg'}`;
    const mobile = SECTIONS.filter((s) => s.mobile);
    const inMore = !mobile.some((s) => pathname.startsWith(`/${s.path}`));
    const handle = email.split('@')[0] || 'Usuário';
    const initials = handle.slice(0, 2).toUpperCase();
    return (_jsxs("div", { className: "min-h-screen md:flex", children: [_jsx("a", { href: "#main-content", className: "skip-link", children: "Pular para o conte\u00FAdo" }), _jsx(Motion, {}), _jsxs("aside", { className: "sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-line bg-sunken md:flex", children: [_jsxs("div", { className: "flex h-14 shrink-0 items-center gap-3 border-b border-line px-4", children: [_jsx(Mark, { size: 20 }), _jsx("span", { className: "text-base leading-none font-semibold text-fg", children: "Painel" })] }), _jsx("nav", { className: "slide-group side-nav relative flex flex-1 flex-col gap-1 overflow-y-auto px-3 py-4", "aria-label": "Se\u00E7\u00F5es", children: SECTIONS.map(({ path, label, icon: Icon, group }, i) => {
                            const showGroup = i > 0 && SECTIONS[i - 1].group !== group;
                            return (_jsxs(Fragment, { children: [showGroup && (_jsx("div", { className: "mt-6 mb-2 px-3 text-xs leading-4 font-normal text-fg3 select-none", "aria-hidden": "true", children: group })), _jsx(NavLink, { to: `/${path}`, className: row, children: ({ isActive }) => (_jsxs(_Fragment, { children: [_jsx(Icon, { ...ICON, className: `shrink-0 transition-colors duration-150 ${isActive ? 'text-fg' : 'text-fg3'}` }), _jsx("span", { className: "mr-auto truncate", children: label }), isActive && _jsx("span", { className: "h-1.5 w-1.5 shrink-0 rounded-full bg-brand", "aria-hidden": "true" })] })) })] }, path));
                        }) }), _jsx("div", { className: "border-t border-line p-3", children: _jsxs("button", { type: "button", onClick: () => openQuickCapture('money'), className: "flex h-9 w-full items-center justify-center gap-2 rounded-[8px] border border-line bg-surface px-3 text-xs font-medium text-fg2 transition-colors duration-150 hover:border-line-strong hover:text-fg", children: [_jsx(Wallet, { ...ICON, className: "text-fg3" }), _jsx("span", { children: "Registrar gasto" })] }) })] }), _jsxs("div", { className: "flex min-w-0 flex-1 flex-col", children: [_jsxs("header", { className: "sticky top-0 z-20 flex h-14 shrink-0 items-center gap-3 border-b border-line bg-bg/90 px-4 backdrop-blur-md sm:px-6 md:px-8", children: [_jsxs("div", { className: "flex items-center gap-2 md:hidden", children: [_jsx(Mark, { size: 18 }), _jsx("span", { className: "text-base leading-none font-semibold text-fg", children: "Painel" })] }), _jsxs("button", { type: "button", onClick: () => openQuickCapture('task'), className: "hidden h-8 shrink-0 items-center gap-1.5 rounded-[8px] bg-primary px-3 text-xs font-medium text-primary-ink transition-opacity duration-150 hover:opacity-90 active:scale-[0.98] sm:inline-flex", style: { boxShadow: 'inset 0 1px 0 rgb(255 255 255 / 0.12)' }, children: [_jsx(Plus, { ...ICON }), _jsx("span", { children: "Novo" })] }), _jsxs("button", { type: "button", onClick: openCommandPalette, className: "ml-auto flex h-8 min-w-0 flex-1 items-center gap-2 rounded-[8px] border border-line bg-surface px-3 text-xs text-fg3 transition-colors duration-150 hover:border-line-strong hover:text-fg2 sm:ml-0 sm:max-w-xs md:max-w-sm", "aria-label": "Abrir busca e comandos (Ctrl+K)", children: [_jsx(Search, { ...ICON, className: "shrink-0 text-fg3" }), _jsx("span", { className: "mr-auto truncate", children: "Buscar" }), _jsxs("span", { className: "hidden items-center gap-1 sm:inline-flex", "aria-hidden": "true", children: [_jsx("kbd", { className: "rounded-[4px] border border-line bg-raised px-1.5 py-0.5 font-mono text-[11px] leading-none text-fg3", children: "\u2318" }), _jsx("kbd", { className: "rounded-[4px] border border-line bg-raised px-1.5 py-0.5 font-mono text-[11px] leading-none text-fg3", children: "K" })] })] }), _jsxs("div", { className: "ml-auto flex shrink-0 items-center gap-2", children: [_jsxs("button", { type: "button", onClick: () => openGuidedReview('daily'), className: "hidden h-8 items-center gap-2 rounded-[8px] border border-line bg-surface px-3 text-xs font-medium text-fg2 transition-colors duration-150 hover:border-line-strong hover:text-fg lg:inline-flex", children: [_jsx(Compass, { ...ICON, className: "text-fg3" }), _jsx("span", { children: "Revis\u00E3o" })] }), _jsx("button", { type: "button", onClick: toggleTheme, className: "flex h-8 w-8 items-center justify-center rounded-[8px] border border-line bg-surface text-fg3 transition-colors duration-150 hover:border-line-strong hover:text-fg", title: theme === 'dark' ? 'Usar tema claro' : 'Usar tema escuro', "aria-label": theme === 'dark' ? 'Usar tema claro' : 'Usar tema escuro', children: theme === 'dark' ? _jsx(Sun, { ...ICON }) : _jsx(Moon, { ...ICON }) }), _jsxs("div", { className: "hidden h-8 items-center gap-2 rounded-[8px] border border-line bg-surface px-2 sm:flex", title: email, children: [_jsx("span", { className: "flex h-5 w-5 items-center justify-center rounded-[4px] bg-raised font-mono text-[11px] font-medium text-fg2", children: initials }), _jsx("span", { className: "max-w-[112px] truncate text-xs text-fg2", children: handle })] }), _jsx("button", { type: "button", className: "hidden h-8 w-8 items-center justify-center rounded-[8px] border border-line bg-surface text-fg3 transition-colors duration-150 hover:border-line-strong hover:text-fg md:flex", onClick: () => supabase.auth.signOut(), title: "Sair", "aria-label": "Sair", children: _jsx(LogOut, { ...ICON }) })] })] }), _jsxs("main", { id: "main-content", tabIndex: -1, className: "enter mx-auto w-full min-w-0 max-w-[1440px] flex-1 px-4 pt-6 pb-32 outline-none sm:px-6 md:px-8 md:pt-8 md:pb-16", children: [_jsx(OfflineStatusBar, {}), _jsx(Outlet, {})] }, pathname)] }), _jsxs("nav", { className: "glass-nav slide-group fixed inset-x-3 bottom-[max(12px,env(safe-area-inset-bottom))] z-20 grid grid-cols-5 gap-1 rounded-[14px] p-1 md:hidden", "aria-label": "Se\u00E7\u00F5es principais", children: [mobile.map(({ path, label, icon: Icon }) => (_jsxs(NavLink, { to: `/${path}`, className: ({ isActive }) => `relative z-[1] flex h-12 flex-col items-center justify-center gap-1 rounded-[10px] text-xs font-medium transition-colors duration-150 active:scale-[0.97] ${isActive ? 'bg-indicator text-fg' : 'text-fg3'}`, children: [_jsx(Icon, { ...ICON }), label] }, path))), _jsxs("button", { type: "button", "aria-expanded": more, "aria-haspopup": "dialog", className: `relative z-[1] flex h-12 flex-col items-center justify-center gap-1 rounded-[10px] text-xs font-medium transition-colors duration-150 active:scale-[0.97] ${inMore ? 'text-fg' : 'text-fg3'}`, onClick: () => setMore(true), children: [_jsx(Menu, { ...ICON }), "Mais"] })] }), more && (_jsxs(Modal, { title: "Se\u00E7\u00F5es", onClose: () => setMore(false), children: [_jsxs("button", { type: "button", onClick: () => { setMore(false); openCommandPalette(); }, className: "mb-3 flex h-10 w-full items-center gap-2 rounded-[8px] border border-line bg-raised px-3 text-sm text-fg2 hover:text-fg", children: [_jsx(Search, { ...ICON, className: "text-fg3" }), _jsx("span", { children: "Buscar" })] }), _jsx("nav", { className: "grid grid-cols-2 gap-2", "aria-label": "Mais se\u00E7\u00F5es", children: SECTIONS.filter((s) => !s.mobile).map(({ path, label, icon: Icon }) => (_jsxs(NavLink, { to: `/${path}`, onClick: () => setMore(false), className: ({ isActive }) => `flex h-10 items-center gap-2 rounded-[8px] px-3 text-sm font-medium transition-colors duration-150 active:scale-[0.98] ${isActive ? 'bg-primary text-primary-ink' : 'bg-raised text-fg'}`, children: [_jsx(Icon, { ...ICON }), _jsx("span", { className: "truncate", children: label })] }, path))) }), _jsxs("div", { className: "mt-4 flex gap-2 border-t border-line pt-4", children: [_jsxs("button", { type: "button", className: "btn-secondary", onClick: toggleTheme, children: [theme === 'dark' ? _jsx(Sun, { ...ICON }) : _jsx(Moon, { ...ICON }), theme === 'dark' ? 'Tema claro' : 'Tema escuro'] }), _jsxs("button", { type: "button", className: "btn-ghost ml-auto", onClick: () => supabase.auth.signOut(), children: [_jsx(LogOut, { ...ICON }), "Sair"] })] })] })), _jsx(CommandPalette, {}), _jsx(AssistantDrawer, {}), _jsx(QuickCaptureModal, {}), _jsx(ReviewModal, {}), _jsx(Toaster, {})] }));
}
