import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { FOCUSABLE_SELECTOR, nextFocusIndex } from '../lib/a11y';
export function PageHeader({ title, subtitle, tabs, tab, onTab, action }) {
    return (_jsxs("header", { className: "mb-6 md:mb-8", children: [_jsxs("div", { className: "flex flex-wrap items-end gap-x-6 gap-y-4", children: [_jsxs("div", { className: "mr-auto min-w-0", children: [_jsx("h1", { className: "display", children: title }), subtitle && _jsx("p", { className: "mt-2 text-sm text-fg2", children: subtitle })] }), action] }), tabs && (_jsx("div", { className: "segmented tabs-scroll mt-6", role: "tablist", children: tabs.map((t) => (_jsx("button", { role: "tab", "aria-selected": t === tab, className: t === tab ? 'tab-active' : 'tab', onClick: () => onTab?.(t), children: t }, t))) }))] }));
}
/** A figure set like a scoreboard: mono digits, the unit small and quiet. */
export function Figure({ value, unit, className = '' }) {
    return (_jsxs("span", { className: `figure whitespace-nowrap ${className}`, children: [value, unit && _jsx("span", { className: "ml-1 text-[0.55em] font-normal text-fg3", children: unit })] }));
}
export function Stat({ label, value, unit, hint, loading, accent }) {
    return (_jsxs("div", { className: "min-w-0", children: [_jsx("div", { className: "label", children: label }), loading ? _jsx(Skeleton, { className: "mt-2 h-8 w-20" }) : (_jsx(Figure, { value: value, unit: unit, className: `mt-2 block text-[28px] leading-none font-medium ${accent ? 'text-brand-ink' : ''}` })), hint && _jsx("div", { className: "mt-2 text-xs leading-4 text-fg3", children: hint })] }));
}
export function Skeleton({ className = '', style }) {
    return _jsx("div", { className: `skeleton rounded-[6px] ${className}`, style: style, "aria-hidden": true });
}
/** Placeholder rows while a list loads. */
export function ListSkeleton({ rows = 3 }) {
    return (_jsx("div", { className: "card space-y-4", "aria-busy": "true", "aria-label": "Carregando", children: Array.from({ length: rows }, (_, i) => (_jsxs("div", { className: "flex items-center gap-3", children: [_jsx(Skeleton, { className: "h-5 w-5 shrink-0 rounded-[6px]" }), _jsxs("div", { className: "min-w-0 flex-1 space-y-2", children: [_jsx(Skeleton, { className: "h-3.5", style: { width: `${[72, 54, 64, 46, 58][i % 5]}%` } }), _jsx(Skeleton, { className: "h-2.5 w-24" })] })] }, i))) }));
}
export function Empty({ icon, children, action }) {
    return (_jsxs("div", { className: "flex flex-col items-center gap-3 px-4 py-10 text-center", children: [icon && _jsx("div", { className: "flex h-10 w-10 items-center justify-center rounded-[10px] border border-line bg-raised text-fg3", children: icon }), _jsx("p", { className: "max-w-sm text-sm text-fg2", children: children }), action] }));
}
const prefersReducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
/**
 * A form panel: a sheet that rises from the bottom on phones, a card that
 * settles in the middle on larger screens. Closing by the backdrop, Esc or the
 * X plays the way out before the parent removes it.
 */
export function Modal({ title, onClose, children }) {
    const [closing, setClosing] = useState(false);
    const done = useRef(false);
    const panelRef = useRef(null);
    const titleId = useId();
    const close = useCallback(() => {
        if (done.current)
            return;
        done.current = true;
        if (prefersReducedMotion())
            return onClose();
        setClosing(true);
        window.setTimeout(onClose, 200);
    }, [onClose]);
    useEffect(() => {
        const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
        const panel = panelRef.current;
        if (panel) {
            const auto = panel.querySelector('[autofocus]');
            if (auto)
                auto.focus();
            else if (!panel.contains(document.activeElement))
                panel.focus();
        }
        const onKey = (e) => {
            if (e.key === 'Escape') {
                close();
                return;
            }
            if (e.key !== 'Tab' || !panel)
                return;
            const nodes = Array.from(panel.querySelectorAll(FOCUSABLE_SELECTOR));
            if (!nodes.length) {
                e.preventDefault();
                panel.focus();
                return;
            }
            const idx = nodes.indexOf(document.activeElement);
            const next = nextFocusIndex(idx, nodes.length, e.shiftKey);
            if (next >= 0) {
                e.preventDefault();
                nodes[next].focus();
            }
        };
        window.addEventListener('keydown', onKey);
        const overflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        return () => {
            window.removeEventListener('keydown', onKey);
            document.body.style.overflow = overflow;
            if (opener && opener.isConnected)
                opener.focus();
        };
    }, [close]);
    // Rendered on <body>: an animated page around it must not decide where "the screen" is.
    return createPortal(_jsx("div", { className: "modal-backdrop fixed inset-0 z-30 flex items-end justify-center bg-[rgb(12_12_13/0.38)] backdrop-blur-[2px] sm:items-center sm:p-6", "data-closing": closing || undefined, onClick: close, children: _jsxs("div", { ref: panelRef, tabIndex: -1, className: "modal-panel max-h-[90vh] w-full overflow-y-auto rounded-t-[24px] bg-surface px-5 pt-3 pb-[calc(28px+env(safe-area-inset-bottom))] shadow-[var(--float-shadow)] outline-none sm:max-w-md sm:rounded-[24px] sm:p-6", "data-closing": closing || undefined, onClick: (e) => e.stopPropagation(), role: "dialog", "aria-labelledby": titleId, "aria-modal": "true", children: [_jsx("div", { className: "mx-auto mb-3 h-1 w-10 rounded-full bg-line-strong sm:hidden", "aria-hidden": true }), _jsxs("div", { className: "mb-5 flex items-center gap-2", children: [_jsx("h2", { id: titleId, className: "mr-auto text-xl leading-7 font-semibold tracking-[-0.02em]", children: title }), _jsx("button", { type: "button", className: "icon-btn -mr-2", onClick: close, "aria-label": "Fechar", children: _jsx(X, { size: 18, strokeWidth: 1.75, "aria-hidden": "true" }) })] }), children] }) }), document.body);
}
export function Field({ label, children }) {
    return (_jsxs("label", { className: "mb-4 block", children: [_jsx("span", { className: "mb-1.5 block text-[13px] leading-5 text-fg2", children: label }), children] }));
}
/** A labelled group of buttons. A <label> would hand its text to the first button and click it. */
export function FieldGroup({ label, children }) {
    return (_jsxs("div", { className: "mb-4", role: "group", "aria-label": label, children: [_jsx("span", { className: "mb-1.5 block text-[13px] leading-5 text-fg2", children: label }), children] }));
}
export const WEEKDAY_LETTERS = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];
const WEEKDAY_NAMES = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
export function WeekdayPicker({ value, onChange }) {
    return (_jsx("div", { className: "flex gap-1", children: WEEKDAY_LETTERS.map((l, i) => {
            const on = value.includes(i);
            return (_jsx("button", { type: "button", onClick: () => onChange(on ? value.filter((d) => d !== i) : [...value, i].sort()), className: `h-10 w-10 rounded-[10px] text-sm font-medium transition-[background-color,color,transform] duration-200 ease-out active:scale-[0.92] ${on ? 'bg-primary text-primary-ink' : 'bg-raised text-fg2 hover:text-fg'}`, "aria-pressed": on, "aria-label": WEEKDAY_NAMES[i], children: l }, i));
        }) }));
}
