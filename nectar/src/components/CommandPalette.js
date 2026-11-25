import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { Bot, CheckSquare, CornerDownLeft, FolderKanban, Moon, Notebook, Plus, Repeat, Search, Sparkles, Sun, Target, Wallet, X, } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { applyTheme, readTheme } from '../lib/theme';
import { filterCommands, nextCommandIndex } from '../lib/commands';
import { SECTIONS } from './Layout';
import { openQuickCapture } from './QuickCaptureModal';
import { openGuidedReview } from './ReviewModal';
import { openAssistantDrawer } from './AssistantDrawer';
export function openCommandPalette() {
    window.dispatchEvent(new Event('painel-open-palette'));
}
const SECTION_KEYWORDS = {
    inicio: 'home dashboard resumo hoje',
    assistente: 'ia chat ai claude conversa',
    agenda: 'calendario compromissos google semana',
    tarefas: 'todo afazeres lista',
    habitos: 'rotina sequencia streak',
    lembretes: 'alarme notificacao',
    saude: 'treino dieta calorias corpo peso academia',
    financas: 'dinheiro gastos receitas contas cartoes euro dolar real',
    projetos: 'kanban marcos',
    metas: 'objetivos alvos progresso',
    conhecimento: 'notas diario segundo cerebro obsidian',
    'piloto-automatico': 'automacoes cron',
    configuracoes: 'preferencias conta tema cor conectores',
};
const GROUP_ICON = {
    Ações: Sparkles,
    'Ir para': CornerDownLeft,
    Tarefas: CheckSquare,
    Projetos: FolderKanban,
    Metas: Target,
    Hábitos: Repeat,
    Notas: Notebook,
};
export function CommandPalette() {
    const [open, setOpen] = useState(false);
    useEffect(() => {
        const onKey = (e) => {
            if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
                e.preventDefault();
                setOpen((v) => !v);
            }
        };
        const onOpen = () => setOpen(true);
        window.addEventListener('keydown', onKey);
        window.addEventListener('painel-open-palette', onOpen);
        return () => {
            window.removeEventListener('keydown', onKey);
            window.removeEventListener('painel-open-palette', onOpen);
        };
    }, []);
    if (!open)
        return null;
    return _jsx(PaletteDialog, { onClose: () => setOpen(false) });
}
function PaletteDialog({ onClose }) {
    const navigate = useNavigate();
    const [query, setQuery] = useState('');
    const [active, setActive] = useState(0);
    const [dynamic, setDynamic] = useState([]);
    const [loading, setLoading] = useState(true);
    const inputRef = useRef(null);
    useEffect(() => {
        const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
        inputRef.current?.focus();
        const overflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        let cancelled = false;
        void Promise.all([
            supabase.from('tasks').select('id,title,due_date').eq('completed', false).eq('is_archived', false).limit(80),
            supabase.from('projects').select('id,name,status').eq('is_template', false).is('archived_at', null).limit(40),
            supabase.from('goals').select('id,title,status').eq('status', 'active').limit(40),
            supabase.from('habits').select('id,name').eq('is_archived', false).limit(50),
            supabase.from('knowledge_blocks').select('id,title').order('updated_at', { ascending: false }).limit(80),
        ]).then(([t, p, g, h, n]) => {
            if (cancelled)
                return;
            const items = [
                ...(t.data ?? []).map((x) => ({
                    id: `task:${x.id}`, group: 'Tarefas', title: x.title,
                    subtitle: x.due_date ? `Prazo ${x.due_date.slice(8, 10)}/${x.due_date.slice(5, 7)}` : 'Aberta',
                    to: '/tarefas',
                })),
                ...(p.data ?? []).map((x) => ({
                    id: `proj:${x.id}`, group: 'Projetos', title: x.name,
                    subtitle: x.status === 'paused' ? 'Pausado' : x.status === 'completed' ? 'Concluído' : 'Em andamento',
                    to: `/projetos?p=${x.id}`,
                })),
                ...(g.data ?? []).map((x) => ({
                    id: `goal:${x.id}`, group: 'Metas', title: x.title, subtitle: 'Meta ativa', to: '/metas',
                })),
                ...(h.data ?? []).map((x) => ({
                    id: `habit:${x.id}`, group: 'Hábitos', title: x.name, subtitle: 'Rotina', to: '/habitos',
                })),
                ...(n.data ?? []).map((x) => ({
                    id: `note:${x.id}`, group: 'Notas', title: x.title || 'Sem título', subtitle: 'Conhecimento', to: '/conhecimento',
                })),
            ];
            setDynamic(items);
            setLoading(false);
        });
        return () => {
            cancelled = true;
            document.body.style.overflow = overflow;
            if (opener && opener.isConnected)
                opener.focus();
        };
    }, []);
    const baseItems = useMemo(() => {
        const dark = readTheme() === 'dark';
        return [
            { id: 'act:task', group: 'Ações', title: 'Nova tarefa rápida', subtitle: 'Criar tarefa sem sair da tela', keywords: 'adicionar criar todo', action: 'capture:task' },
            { id: 'act:money', group: 'Ações', title: 'Novo lançamento financeiro', subtitle: 'Registrar gasto ou receita em €, R$ ou US$', keywords: 'despesa gasto receita euro dinheiro', action: 'capture:money' },
            { id: 'act:note', group: 'Ações', title: 'Nova nota rápida', subtitle: 'Salvar ideia no Conhecimento', keywords: 'anotacao segundo cerebro', action: 'capture:note' },
            { id: 'act:review-daily', group: 'Ações', title: 'Revisão diária guiada', subtitle: 'Zerar atrasos, revisar rotina e definir foco', keywords: 'planejar dia ritual', action: 'review:daily' },
            { id: 'act:review-weekly', group: 'Ações', title: 'Revisão semanal guiada', subtitle: 'Projetos, metas, finanças e constância da semana', keywords: 'planejar semana ritual', action: 'review:weekly' },
            { id: 'act:theme', group: 'Ações', title: dark ? 'Usar tema claro' : 'Usar tema escuro', subtitle: 'Alternar aparência', keywords: 'dark light modo', action: 'theme' },
            ...SECTIONS.map((s) => ({
                id: `nav:${s.path}`,
                group: 'Ir para',
                title: s.label,
                subtitle: s.group,
                keywords: SECTION_KEYWORDS[s.path] ?? '',
                to: `/${s.path}`,
            })),
        ];
    }, []);
    const results = useMemo(() => {
        const matched = filterCommands([...baseItems, ...dynamic], query, 17);
        const trimmed = query.trim();
        if (!trimmed) {
            return [
                { id: 'act-assistant', group: 'Ações', title: 'Abrir Assistente', subtitle: '⌘J · painel lateral', action: 'assistant:open', keywords: 'ia chat copilot assistente' },
                ...matched,
            ];
        }
        return [
            ...matched,
            {
                id: 'act-ask-assistant',
                group: 'Ações',
                title: `Perguntar ao Assistente: "${trimmed}"`,
                subtitle: 'Executar com contexto da tela',
                action: `assistant:ask:${trimmed}`,
                keywords: trimmed,
            },
        ];
    }, [baseItems, dynamic, query]);
    const safeActive = results.length ? Math.min(active, results.length - 1) : -1;
    function run(item) {
        onClose();
        if (item.to) {
            navigate(item.to);
            return;
        }
        if (item.action === 'assistant:open') {
            openAssistantDrawer();
            return;
        }
        if (item.action?.startsWith('assistant:ask:')) {
            openAssistantDrawer({ prompt: item.action.slice('assistant:ask:'.length) });
            return;
        }
        if (item.action === 'capture:task')
            openQuickCapture('task');
        else if (item.action === 'capture:money')
            openQuickCapture('money');
        else if (item.action === 'capture:note')
            openQuickCapture('note');
        else if (item.action === 'review:daily')
            openGuidedReview('daily');
        else if (item.action === 'review:weekly')
            openGuidedReview('weekly');
        else if (item.action === 'theme')
            applyTheme(readTheme() === 'dark' ? 'light' : 'dark');
    }
    function iconFor(item) {
        if (item.action?.startsWith('assistant:'))
            return Bot;
        if (item.action === 'capture:money')
            return Wallet;
        if (item.action === 'capture:task')
            return Plus;
        if (item.action === 'capture:note')
            return Notebook;
        if (item.action === 'theme')
            return readTheme() === 'dark' ? Sun : Moon;
        return GROUP_ICON[item.group];
    }
    return createPortal(_jsx("div", { className: "modal-backdrop fixed inset-0 z-40 flex items-start justify-center bg-black/50 px-4 pt-[12vh] backdrop-blur-[2px]", onClick: onClose, children: _jsxs("div", { role: "dialog", "aria-modal": "true", "aria-label": "Paleta de comandos e busca global", className: "modal-panel w-full max-w-xl overflow-hidden rounded-[14px] border border-line-strong bg-surface shadow-[var(--float-shadow)]", onClick: (e) => e.stopPropagation(), onKeyDown: (e) => {
                if (e.key === 'Escape') {
                    e.preventDefault();
                    onClose();
                    return;
                }
                if (e.key === 'Enter' && safeActive >= 0) {
                    e.preventDefault();
                    run(results[safeActive]);
                    return;
                }
                if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key)) {
                    e.preventDefault();
                    setActive(nextCommandIndex(safeActive, results.length, e.key));
                }
            }, children: [_jsxs("div", { className: "flex items-center gap-3 border-b border-line px-4 py-3", children: [_jsx(Search, { size: 16, strokeWidth: 1.5, className: "shrink-0 text-fg3", "aria-hidden": "true" }), _jsx("input", { ref: inputRef, className: "w-full bg-transparent text-sm text-fg outline-none placeholder:text-fg3", placeholder: "Buscar ou perguntar ao Assistente", "aria-label": "Buscar ou digitar comando", value: query, onChange: (e) => { setQuery(e.target.value); setActive(0); } }), query && (_jsx("button", { type: "button", className: "icon-btn h-7 w-7", onClick: () => { setQuery(''); setActive(0); inputRef.current?.focus(); }, "aria-label": "Limpar busca", children: _jsx(X, { size: 15, strokeWidth: 1.5, "aria-hidden": "true" }) })), _jsx("kbd", { className: "hidden rounded-[4px] border border-line bg-raised px-1.5 py-0.5 font-mono text-[11px] text-fg3 sm:inline", children: "Esc" })] }), _jsx("div", { className: "max-h-[58vh] overflow-y-auto p-2", role: "listbox", "aria-label": "Resultados", children: results.length === 0 ? (_jsx("p", { className: "px-4 py-10 text-center text-sm text-fg3", children: loading ? 'Carregando dados…' : `Nada encontrado para "${query}"` })) : (results.map((item, i) => {
                        const prev = results[i - 1];
                        const showGroup = !prev || prev.group !== item.group;
                        const Icon = iconFor(item);
                        const selected = i === safeActive;
                        return (_jsxs("div", { children: [showGroup && (_jsx("div", { className: "px-3 pt-3 pb-1 text-xs font-normal text-fg3", children: item.group })), _jsxs("button", { type: "button", role: "option", "aria-selected": selected, onMouseEnter: () => setActive(i), onClick: () => run(item), className: `flex w-full items-center gap-3 rounded-[8px] px-3 py-2 text-left text-sm transition-colors duration-100 ${selected ? 'bg-raised text-fg' : 'text-fg2 hover:bg-raised/60'}`, children: [_jsx(Icon, { size: 16, strokeWidth: 1.5, "aria-hidden": "true", className: `shrink-0 ${selected ? 'text-fg' : 'text-fg3'}` }), _jsx("span", { className: "min-w-0 flex-1 truncate font-medium text-fg", children: item.title }), item.subtitle && _jsx("span", { className: "max-w-[40%] shrink-0 truncate text-xs text-fg3", children: item.subtitle })] })] }, item.id));
                    })) }), _jsxs("div", { className: "flex items-center justify-between border-t border-line px-4 py-2 text-xs text-fg3", children: [_jsx("span", { children: "\u2191\u2193 navegar \u00B7 \u21B5 executar" }), _jsx("span", { className: "font-mono", children: "\u2318K busca \u00B7 \u2318J assistente" })] })] }) }), document.body);
}
