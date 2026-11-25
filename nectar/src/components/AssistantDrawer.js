import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link, useLocation } from 'react-router-dom';
import { Bot, Maximize2, X } from 'lucide-react';
import { AssistantWorkspace } from './AssistantWorkspace';
/** Opens the global Assistant drawer from anywhere in the app (FAB, ⌘J, or ⌘K). */
export function openAssistantDrawer(detail) {
    window.dispatchEvent(new CustomEvent('painel-open-assistant', { detail: detail ?? {} }));
}
export function AssistantDrawer() {
    const { pathname } = useLocation();
    const [open, setOpen] = useState(false);
    const [pending, setPending] = useState(null);
    const onAssistantPage = pathname === '/assistente' || pathname.startsWith('/assistente/');
    useEffect(() => {
        const onOpen = (e) => {
            const detail = e.detail;
            if (detail?.prompt || detail?.newThread)
                setPending(detail);
            setOpen(true);
        };
        const onKey = (e) => {
            if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'j') {
                e.preventDefault();
                if (!onAssistantPage)
                    setOpen((v) => !v);
            }
            else if (e.key === 'Escape' && open) {
                setOpen(false);
            }
        };
        window.addEventListener('painel-open-assistant', onOpen);
        window.addEventListener('keydown', onKey);
        return () => {
            window.removeEventListener('painel-open-assistant', onOpen);
            window.removeEventListener('keydown', onKey);
        };
    }, [onAssistantPage, open]);
    // Automatically close the drawer if the user navigates to the dedicated /assistente page.
    useEffect(() => {
        if (onAssistantPage && open)
            setOpen(false);
    }, [onAssistantPage, open]);
    return (_jsxs(_Fragment, { children: [!onAssistantPage && !open && (_jsxs("button", { type: "button", onClick: () => setOpen(true), "aria-label": "Abrir Assistente (Ctrl+J)", title: "Abrir Assistente (\u2318J)", className: "fixed right-4 bottom-[calc(5.25rem+env(safe-area-inset-bottom))] z-30 inline-flex h-11 items-center gap-2 rounded-[12px] border border-line-strong bg-surface px-3.5 text-sm font-medium text-fg shadow-[var(--float-shadow)] transition-[background-color,border-color,transform] duration-150 ease-out hover:bg-raised active:scale-[0.98] md:right-6 md:bottom-6", children: [_jsxs("span", { className: "relative inline-flex items-center justify-center", children: [_jsx(Bot, { size: 16, strokeWidth: 1.5, "aria-hidden": "true", className: "text-fg" }), _jsx("span", { className: "absolute -top-0.5 -right-0.5 h-1.5 w-1.5 rounded-full bg-brand", "aria-hidden": "true" })] }), _jsx("span", { className: "hidden sm:inline", children: "Assistente" }), _jsxs("span", { className: "hidden items-center gap-0.5 md:inline-flex", "aria-hidden": "true", children: [_jsx("kbd", { className: "rounded-[4px] border border-line bg-raised px-1 py-0.5 font-mono text-[10px] leading-none text-fg3", children: "\u2318" }), _jsx("kbd", { className: "rounded-[4px] border border-line bg-raised px-1 py-0.5 font-mono text-[10px] leading-none text-fg3", children: "J" })] })] })), open && createPortal(_jsxs("div", { className: "fixed inset-0 z-40 flex justify-end", role: "dialog", "aria-modal": "true", "aria-label": "Painel do Assistente", children: [_jsx("div", { className: "modal-backdrop fixed inset-0 bg-black/50 backdrop-blur-[2px]", onClick: () => setOpen(false), "aria-hidden": "true" }), _jsxs("div", { className: "relative z-10 flex h-full w-full max-w-[540px] flex-col border-l border-line bg-bg shadow-[var(--float-shadow)]", children: [_jsxs("header", { className: "flex h-14 shrink-0 items-center gap-2 border-b border-line px-4", children: [_jsx(Bot, { size: 16, strokeWidth: 1.5, className: "text-brand-ink", "aria-hidden": "true" }), _jsx("span", { className: "mr-auto text-sm font-medium text-fg", children: "Assistente" }), _jsx(Link, { to: "/assistente", onClick: () => setOpen(false), className: "icon-btn", title: "Abrir em tela cheia", "aria-label": "Abrir Assistente em tela cheia", children: _jsx(Maximize2, { size: 15, strokeWidth: 1.5 }) }), _jsx("button", { type: "button", onClick: () => setOpen(false), className: "icon-btn", "aria-label": "Fechar Assistente", children: _jsx(X, { size: 16, strokeWidth: 1.5 }) })] }), _jsx(AssistantWorkspace, { mode: "drawer", initialPrompt: pending?.prompt, initialNewThread: pending?.newThread, onInitialConsumed: () => setPending(null), onNavigateAway: () => setOpen(false) })] })] }), document.body)] }));
}
