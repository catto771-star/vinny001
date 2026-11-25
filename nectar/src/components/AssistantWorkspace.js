import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useEffect, useLayoutEffect, useMemo, useRef, useState, } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ArrowUp, ArrowUpRight, Bot, Brain, CheckCircle2, ImagePlus, KeyRound, MessageSquarePlus, Mic, MicOff, Plus, RotateCcw, Sunrise, Trash2, Workflow, X, } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useTable, write } from '../lib/useTable';
import { formatDay, formatTime, sentence, toDay } from '../lib/dates';
import { pieces } from '../lib/chat';
import { AI_MODELS, modelLabel } from '../lib/prefs';
import { AUTOMATIONS_THREAD_ID, DEFAULT_THREAD_ID, actionLinkOf, createThreadId, expandSlashCommand, filterThreadMessages, groupThreads, matchSlashCommands, playbooksForRoute, screenContextFromLocation, titleFromMessage, } from '../lib/assistant';
import { Empty, ListSkeleton } from './ui';
import { notifyDataChanged } from './QuickCaptureModal';
const MEMORY_CATEGORIES = [
    { key: 'preferencia', label: 'Preferência' },
    { key: 'financas', label: 'Finanças' },
    { key: 'rotina', label: 'Rotina' },
    { key: 'projetos', label: 'Projetos' },
    { key: 'saude', label: 'Saúde' },
    { key: 'aprendizado', label: 'Aprendizado' },
];
const UNDO_TABLES = new Set([
    'tasks', 'reminders', 'events', 'habit_completions', 'transactions', 'transfers',
    'category_budgets', 'knowledge_blocks', 'goal_entries', 'project_steps',
    'food_logs', 'water_logs', 'fasting_sessions', 'body_measurements', 'workouts',
    'workout_plan_sessions', 'cardio_sessions', 'assistant_memories',
]);
const I = { size: 16, strokeWidth: 1.5, 'aria-hidden': true };
/** Compresses a chosen or pasted image client-side to a compact JPEG data URL (max 1024px) for multimodal analysis. */
function compressImage(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onerror = () => reject(new Error('Não foi possível ler a imagem'));
        reader.onload = () => {
            const img = new Image();
            img.onerror = () => reject(new Error('Formato de imagem não suportado'));
            img.onload = () => {
                const max = 1024;
                const scale = Math.min(1, max / Math.max(img.width, img.height));
                const w = Math.max(1, Math.round(img.width * scale));
                const h = Math.max(1, Math.round(img.height * scale));
                const canvas = document.createElement('canvas');
                canvas.width = w;
                canvas.height = h;
                const ctx = canvas.getContext('2d');
                if (!ctx)
                    return reject(new Error('Canvas indisponível'));
                ctx.drawImage(img, 0, 0, w, h);
                resolve(canvas.toDataURL('image/jpeg', 0.82));
            };
            img.src = String(reader.result);
        };
        reader.readAsDataURL(file);
    });
}
function getSpeechCtor() {
    const w = window;
    return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}
export function AssistantWorkspace({ mode, initialPrompt, initialNewThread, onInitialConsumed, onNavigateAway, }) {
    const location = useLocation();
    const screenCtx = useMemo(() => screenContextFromLocation(location.pathname, location.search), [location.pathname, location.search]);
    const playbooks = useMemo(() => playbooksForRoute(location.pathname), [location.pathname]);
    const messages = useTable('chat_messages', 'id,content,is_user,created_at,metadata', { column: 'created_at' });
    const memories = useTable('assistant_memories', 'id,category,content,updated_at', { column: 'updated_at', ascending: false });
    const [activeThreadId, setActiveThreadId] = useState(DEFAULT_THREAD_ID);
    const [draftThreads, setDraftThreads] = useState([]);
    const [drawerTab, setDrawerTab] = useState('chat');
    const [showMemoriesPane, setShowMemoriesPane] = useState(mode === 'page');
    const [selectedModel, setSelectedModel] = useState('anthropic/claude-sonnet-4');
    const [aiConfigured, setAiConfigured] = useState(null);
    const [text, setText] = useState('');
    const [image, setImage] = useState(null);
    const [sending, setSending] = useState(false);
    const [listening, setListening] = useState(false);
    const [slashIndex, setSlashIndex] = useState(0);
    const [undone, setUndone] = useState(() => new Set());
    const [error, setError] = useState(null);
    const [newMemText, setNewMemText] = useState('');
    const [newMemCat, setNewMemCat] = useState('preferencia');
    const [savingMem, setSavingMem] = useState(false);
    const end = useRef(null);
    const box = useRef(null);
    const fileInput = useRef(null);
    const recRef = useRef(null);
    const initialFiredRef = useRef(null);
    const threads = useMemo(() => {
        const grouped = groupThreads(messages.rows);
        const existingIds = new Set(grouped.map((t) => t.id));
        const extras = draftThreads
            .filter((d) => !existingIds.has(d.id))
            .map((d) => ({
            id: d.id,
            title: d.title,
            lastMessage: 'Nova conversa',
            updatedAt: new Date().toISOString(),
            count: 0,
            kind: 'chat',
        }));
        return [...extras, ...grouped];
    }, [messages.rows, draftThreads]);
    const threadMessages = useMemo(() => filterThreadMessages(messages.rows, activeThreadId).slice(-120), [messages.rows, activeThreadId]);
    const currentThread = threads.find((t) => t.id === activeThreadId);
    const slashMatches = useMemo(() => matchSlashCommands(text), [text]);
    const voiceSupported = typeof window !== 'undefined' && !!getSpeechCtor();
    useEffect(() => {
        let alive = true;
        void supabase.functions.invoke('assistant', { body: { status: true } }).then(({ data }) => {
            if (!alive || !data)
                return;
            setAiConfigured(Boolean(data.configured));
            if (typeof data.preferred_model === 'string' && data.preferred_model)
                setSelectedModel(data.preferred_model);
        });
        return () => { alive = false; };
    }, []);
    useEffect(() => { end.current?.scrollIntoView({ block: 'end' }); }, [threadMessages.length, sending, activeThreadId]);
    useEffect(() => () => { recRef.current?.stop(); }, []);
    useEffect(() => { setSlashIndex(0); }, [slashMatches.length]);
    useLayoutEffect(() => {
        const el = box.current;
        if (el) {
            el.style.height = 'auto';
            el.style.height = `${Math.min(144, el.scrollHeight)}px`;
        }
    }, [text]);
    function startNewThread() {
        const id = createThreadId();
        setDraftThreads((prev) => [{ id, title: 'Nova conversa' }, ...prev]);
        setActiveThreadId(id);
        setDrawerTab('chat');
        setError(null);
        window.setTimeout(() => box.current?.focus(), 20);
        return id;
    }
    useEffect(() => {
        if (!initialPrompt && !initialNewThread)
            return;
        const key = `${initialPrompt ?? ''}|${initialNewThread ? '1' : '0'}`;
        if (initialFiredRef.current === key)
            return;
        initialFiredRef.current = key;
        const targetThread = initialNewThread ? startNewThread() : activeThreadId;
        if (initialPrompt) {
            setDrawerTab('chat');
            void send(initialPrompt, targetThread);
        }
        onInitialConsumed?.();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [initialPrompt, initialNewThread]);
    async function changeModel(nextModel) {
        setSelectedModel(nextModel);
        const { data: { user } } = await supabase.auth.getUser();
        if (!user)
            return;
        await write(supabase.from('user_settings').upsert({ user_id: user.id, assistant_model: nextModel }, { onConflict: 'user_id' }));
    }
    function toggleVoice() {
        if (listening) {
            recRef.current?.stop();
            setListening(false);
            return;
        }
        const Ctor = getSpeechCtor();
        if (!Ctor)
            return;
        const rec = new Ctor();
        rec.lang = 'pt-BR';
        rec.interimResults = false;
        rec.onresult = (e) => {
            const spoken = Array.from(e.results).map((r) => r[0]?.transcript ?? '').join(' ').trim();
            if (spoken)
                setText((prev) => (prev ? `${prev.trimEnd()} ${spoken}` : spoken));
        };
        rec.onerror = () => setListening(false);
        rec.onend = () => setListening(false);
        recRef.current = rec;
        setListening(true);
        rec.start();
    }
    async function onPickImage(e) {
        const file = e.target.files?.[0];
        e.target.value = '';
        if (!file)
            return;
        try {
            setError(null);
            setImage(await compressImage(file));
        }
        catch (err) {
            setError({ missingKey: false, message: err.message });
        }
    }
    async function onPaste(e) {
        const item = Array.from(e.clipboardData.items).find((it) => it.type.startsWith('image/'));
        if (!item)
            return;
        const file = item.getAsFile();
        if (!file)
            return;
        e.preventDefault();
        try {
            setError(null);
            setImage(await compressImage(file));
        }
        catch (err) {
            setError({ missingKey: false, message: err.message });
        }
    }
    function applySlash(cmd) {
        if (cmd.immediate) {
            setText('');
            void send(cmd.template);
            return;
        }
        setText(`${cmd.cmd} `);
        box.current?.focus();
    }
    async function send(rawMessage, explicitThreadId) {
        const expanded = expandSlashCommand(rawMessage);
        const attached = image;
        if ((!expanded && !attached) || sending)
            return;
        if (listening) {
            recRef.current?.stop();
            setListening(false);
        }
        const threadId = explicitThreadId ?? (activeThreadId === AUTOMATIONS_THREAD_ID ? startNewThread() : activeThreadId);
        const existingThread = threads.find((t) => t.id === threadId);
        const threadTitle = threadId === DEFAULT_THREAD_ID
            ? 'Conversa geral'
            : existingThread && existingThread.title !== 'Nova conversa'
                ? existingThread.title
                : titleFromMessage(expanded || 'Análise de imagem');
        setText('');
        setImage(null);
        setError(null);
        setSending(true);
        setDrawerTab('chat');
        const shownText = expanded || 'Analisar imagem anexada';
        const local = {
            id: `local-${Date.now()}`,
            content: attached ? `${shownText} [imagem anexada]` : shownText,
            is_user: true,
            created_at: new Date().toISOString(),
            metadata: { thread_id: threadId, thread_title: threadTitle },
        };
        messages.setRows((rows) => [...rows, local]);
        const { data, error: e } = await supabase.functions.invoke('assistant', {
            body: {
                message: expanded,
                thread_id: threadId,
                thread_title: threadTitle,
                context: screenCtx,
                ...(attached ? { image: attached } : {}),
            },
        });
        if (e) {
            const body = await e.context?.json?.().catch(() => null);
            setError({ missingKey: body?.error === 'missing_key', message: body?.message ?? 'Não consegui falar com o assistente agora. Tente novamente' });
            messages.setRows((rows) => rows.filter((r) => r.id !== local.id));
            setText(rawMessage);
            setImage(attached);
        }
        else if (data?.saved === false) {
            messages.setRows((rows) => [...rows, {
                    id: `local-${Date.now()}-a`,
                    content: data.reply,
                    is_user: false,
                    created_at: new Date().toISOString(),
                    metadata: { actions: data.actions, model: data.model, thread_id: threadId, thread_title: threadTitle },
                }]);
            setError({ missingKey: false, message: `A resposta não foi salva no histórico (${data.saveError ?? 'erro desconhecido'})` });
        }
        else if (data) {
            await Promise.all([messages.reload(), memories.reload()]);
            if (data.actions?.length)
                notifyDataChanged();
        }
        setSending(false);
    }
    async function undoAction(key, spec) {
        if (!UNDO_TABLES.has(spec.table) || undone.has(key))
            return;
        const ok = spec.op === 'delete'
            ? await write(supabase.from(spec.table).delete().eq('id', spec.id))
            : await write(supabase.from(spec.table).update(spec.patch ?? {}).eq('id', spec.id));
        if (ok) {
            setUndone((prev) => new Set(prev).add(key));
            notifyDataChanged();
            if (spec.table === 'assistant_memories')
                void memories.reload();
        }
    }
    async function deleteThread(threadId) {
        const ids = filterThreadMessages(messages.rows, threadId).map((m) => m.id);
        if (!ids.length) {
            setDraftThreads((prev) => prev.filter((d) => d.id !== threadId));
            if (activeThreadId === threadId)
                setActiveThreadId(DEFAULT_THREAD_ID);
            return;
        }
        if (!confirm('Apagar esta conversa? Tarefas, notas, memórias e registros criados continuam salvos.'))
            return;
        if (await write(supabase.from('chat_messages').delete().in('id', ids))) {
            messages.setRows((rows) => rows.filter((r) => !ids.includes(r.id)));
            setDraftThreads((prev) => prev.filter((d) => d.id !== threadId));
            if (activeThreadId === threadId)
                setActiveThreadId(DEFAULT_THREAD_ID);
        }
    }
    async function addMemory(e) {
        e.preventDefault();
        const content = newMemText.trim();
        if (!content || savingMem)
            return;
        setSavingMem(true);
        const ok = await write(supabase.from('assistant_memories').insert({ category: newMemCat, content, source: 'user' }));
        if (ok) {
            setNewMemText('');
            await memories.reload();
        }
        setSavingMem(false);
    }
    async function removeMemory(id) {
        memories.setRows((rows) => rows.filter((m) => m.id !== id));
        await write(supabase.from('assistant_memories').delete().eq('id', id));
    }
    function onKey(e) {
        if (slashMatches.length > 0) {
            if (e.key === 'ArrowDown') {
                e.preventDefault();
                setSlashIndex((i) => (i + 1) % slashMatches.length);
                return;
            }
            if (e.key === 'ArrowUp') {
                e.preventDefault();
                setSlashIndex((i) => (i - 1 + slashMatches.length) % slashMatches.length);
                return;
            }
            if (e.key === 'Tab' || (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing)) {
                e.preventDefault();
                applySlash(slashMatches[slashIndex] ?? slashMatches[0]);
                return;
            }
            if (e.key === 'Escape') {
                e.preventDefault();
                setText('');
                return;
            }
        }
        if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault();
            void send(text);
        }
    }
    const threadsList = (_jsxs("div", { className: "flex h-full flex-col", children: [_jsxs("div", { className: "mb-3 flex items-center justify-between gap-2", children: [_jsx("span", { className: "text-xs font-medium text-fg2", children: "Conversas" }), _jsxs("button", { type: "button", onClick: startNewThread, className: "inline-flex h-7 items-center gap-1.5 rounded-[6px] border border-line bg-raised px-2 text-xs font-medium text-fg transition-colors duration-150 hover:border-line-strong", children: [_jsx(MessageSquarePlus, { size: 14, strokeWidth: 1.5, "aria-hidden": "true" }), _jsx("span", { children: "Nova" })] })] }), _jsxs("ul", { className: "flex-1 space-y-1 overflow-y-auto", children: [threads.length === 0 && (_jsx("li", { className: "rounded-[8px] border border-line bg-sunken/60 px-3 py-2 text-xs text-fg3", children: "Nenhuma conversa salva ainda" })), threads.map((t) => {
                        const active = t.id === activeThreadId;
                        return (_jsxs("li", { className: "group flex items-center gap-1", children: [_jsxs("button", { type: "button", onClick: () => { setActiveThreadId(t.id); setDrawerTab('chat'); }, className: `flex min-w-0 flex-1 flex-col rounded-[8px] px-3 py-2 text-left transition-colors duration-150 ${active ? 'border border-line-strong bg-raised text-fg' : 'text-fg2 hover:bg-raised/60 hover:text-fg'}`, children: [_jsxs("div", { className: "flex w-full items-center gap-2", children: [t.kind === 'automation'
                                                    ? _jsx(Workflow, { size: 14, strokeWidth: 1.5, className: "shrink-0 text-fg3", "aria-hidden": "true" })
                                                    : _jsx("span", { className: `h-1.5 w-1.5 shrink-0 rounded-full ${active ? 'bg-brand' : 'bg-fg3/40'}`, "aria-hidden": "true" }), _jsx("span", { className: "mr-auto truncate text-xs font-medium", children: t.title }), _jsx("span", { className: "figure shrink-0 text-[11px] text-fg3", children: t.count })] }), _jsx("span", { className: "mt-1 w-full truncate text-xs text-fg3", children: t.lastMessage })] }), t.count > 0 && (_jsx("button", { type: "button", onClick: () => void deleteThread(t.id), className: "icon-btn h-7 w-7 opacity-0 transition-opacity duration-150 group-hover:opacity-100 focus:opacity-100", "aria-label": `Apagar conversa ${t.title}`, title: "Apagar conversa", children: _jsx(Trash2, { size: 14, strokeWidth: 1.5 }) }))] }, t.id));
                    })] })] }));
    const memoriesPanel = (_jsxs("div", { className: "flex h-full flex-col", children: [_jsxs("div", { className: "mb-3 flex items-center justify-between gap-2", children: [_jsxs("div", { className: "flex items-center gap-2", children: [_jsx(Brain, { ...I, className: "text-fg3" }), _jsx("span", { className: "text-xs font-medium text-fg2", children: "Mem\u00F3ria do Assistente" })] }), _jsx("span", { className: "figure text-xs text-fg3", children: memories.rows.length })] }), _jsx("p", { className: "mb-3 text-xs leading-4 text-fg3", children: "Regras e prefer\u00EAncias usadas automaticamente em todas as conversas" }), _jsxs("form", { onSubmit: (e) => void addMemory(e), className: "mb-4 space-y-2", children: [_jsx("input", { type: "text", value: newMemText, onChange: (e) => setNewMemText(e.target.value), placeholder: "Ex.: Gastos em euro v\u00E3o na Revolut", className: "input h-8 w-full text-xs", maxLength: 300 }), _jsxs("div", { className: "flex gap-2", children: [_jsx("select", { value: newMemCat, onChange: (e) => setNewMemCat(e.target.value), "aria-label": "Categoria da mem\u00F3ria", className: "input h-8 flex-1 px-2 text-xs", children: MEMORY_CATEGORIES.map((c) => _jsx("option", { value: c.key, children: c.label }, c.key)) }), _jsxs("button", { type: "submit", disabled: savingMem || !newMemText.trim(), className: "btn-secondary h-8 shrink-0 px-3 text-xs", children: [_jsx(Plus, { size: 14, strokeWidth: 1.5, "aria-hidden": "true" }), _jsx("span", { children: "Salvar" })] })] })] }), _jsxs("ul", { className: "flex-1 space-y-2 overflow-y-auto", children: [memories.loading && _jsx(ListSkeleton, { rows: 2 }), !memories.loading && memories.rows.length === 0 && (_jsx("li", { className: "rounded-[8px] border border-line bg-sunken/60 p-3 text-xs text-fg3", children: "Nenhuma regra salva ainda. Adicione acima ou diga no chat: \u201C/memoria \u2026\u201D" })), memories.rows.map((m) => (_jsxs("li", { className: "group flex items-start gap-2 rounded-[8px] border border-line bg-sunken/60 p-3", children: [_jsxs("div", { className: "min-w-0 flex-1", children: [_jsx("div", { className: "text-[11px] text-fg3", children: MEMORY_CATEGORIES.find((c) => c.key === m.category)?.label ?? m.category }), _jsx("p", { className: "mt-1 text-xs leading-4 text-fg", children: m.content })] }), _jsx("button", { type: "button", onClick: () => void removeMemory(m.id), className: "icon-btn h-6 w-6 shrink-0 opacity-60 hover:opacity-100", "aria-label": `Remover memória: ${m.content}`, children: _jsx(X, { size: 13, strokeWidth: 1.5 }) })] }, m.id)))] })] }));
    let lastDay = '';
    const chatArea = (_jsxs("div", { className: "flex min-h-0 flex-1 flex-col", children: [_jsxs("div", { className: "flex flex-wrap items-center gap-2 border-b border-line px-4 py-3", children: [_jsxs("div", { className: "mr-auto flex min-w-0 items-center gap-2", children: [_jsx("span", { className: `h-1.5 w-1.5 shrink-0 rounded-full ${aiConfigured === false ? 'bg-warning' : 'bg-positive'}`, "aria-hidden": "true" }), _jsx("span", { className: "truncate text-xs font-medium text-fg", children: currentThread?.title ?? 'Conversa geral' }), mode === 'drawer' && (_jsx("span", { className: "rounded-[4px] border border-line bg-sunken px-1.5 py-0.5 text-[11px] text-fg3", children: screenCtx.label }))] }), _jsx("select", { value: selectedModel, onChange: (e) => void changeModel(e.target.value), "aria-label": "Modelo de IA", className: "h-7 rounded-[6px] border border-line bg-sunken px-2 text-xs text-fg2 outline-none transition-colors duration-150 hover:border-line-strong hover:text-fg", children: AI_MODELS.map((m) => (_jsx("option", { value: m.id, children: m.label }, m.id))) }), mode === 'page' && (_jsxs("button", { type: "button", onClick: () => setShowMemoriesPane((v) => !v), className: `hidden h-7 items-center gap-1.5 rounded-[6px] border px-2 text-xs transition-colors duration-150 xl:inline-flex ${showMemoriesPane ? 'border-line-strong bg-raised text-fg' : 'border-line bg-sunken text-fg3 hover:text-fg'}`, children: [_jsx(Brain, { size: 14, strokeWidth: 1.5, "aria-hidden": "true" }), _jsx("span", { children: "Mem\u00F3rias" }), _jsx("span", { className: "figure text-[11px] text-fg3", children: memories.rows.length })] })), threadMessages.length > 0 && (_jsx("button", { type: "button", onClick: () => void deleteThread(activeThreadId), className: "icon-btn h-7 w-7", title: "Apagar esta conversa", "aria-label": "Apagar esta conversa", children: _jsx(Trash2, { size: 14, strokeWidth: 1.5 }) }))] }), _jsxs("div", { className: "min-h-0 flex-1 overflow-y-auto px-4 py-5", role: "log", "aria-live": "polite", children: [messages.loading && _jsx(ListSkeleton, { rows: 3 }), !messages.loading && threadMessages.length === 0 && (_jsxs("div", { className: "mx-auto max-w-xl py-4", children: [_jsx(Empty, { icon: _jsx(Bot, { size: 18, strokeWidth: 1.5 }), children: "Crie planos de etapas em projetos, lance gastos em EUR/BRL, transfira entre contas, registre treinos ou envie foto de recibo e refei\u00E7\u00E3o" }), _jsx("div", { className: "mt-4 grid gap-2 sm:grid-cols-2", "aria-label": "A\u00E7\u00F5es r\u00E1pidas", children: playbooks.map((pb) => (_jsxs("button", { type: "button", onClick: () => void send(pb.prompt), className: "flex items-center justify-between gap-2 rounded-[10px] border border-line bg-sunken/70 px-3 py-2.5 text-left text-xs font-medium text-fg2 transition-colors duration-150 hover:border-line-strong hover:bg-raised hover:text-fg", children: [_jsx("span", { className: "truncate", children: pb.label }), _jsx(ArrowUpRight, { size: 14, strokeWidth: 1.5, className: "shrink-0 text-fg3", "aria-hidden": "true" })] }, pb.id))) }), _jsxs("p", { className: "mt-4 text-center text-xs text-fg3", children: ["Dica: digite ", _jsx("kbd", { className: "rounded-[4px] border border-line bg-raised px-1.5 py-0.5 font-mono text-[11px]", children: "/" }), " para ver comandos r\u00E1pidos ou cole uma imagem com ", _jsx("kbd", { className: "rounded-[4px] border border-line bg-raised px-1.5 py-0.5 font-mono text-[11px]", children: "Ctrl+V" })] })] })), _jsxs("ol", { className: "mx-auto max-w-3xl space-y-4", children: [threadMessages.map((m) => {
                                const day = toDay(new Date(m.created_at));
                                const divider = day !== lastDay;
                                lastDay = day;
                                return (_jsxs("li", { children: [divider && _jsx("div", { className: "my-4 text-center text-xs text-fg3", children: day === toDay(new Date()) ? 'Hoje' : sentence(formatDay(day)) }), _jsx(Bubble, { m: m, undone: undone, onUndo: undoAction, onNavigate: onNavigateAway })] }, m.id));
                            }), sending && (_jsxs("li", { className: "flex items-center gap-2 text-xs text-fg3", "aria-label": "O assistente est\u00E1 respondendo", children: [_jsx("span", { className: "h-1.5 w-1.5 rounded-full bg-brand", "aria-hidden": "true" }), _jsx("span", { children: "Consultando dados e executando a\u00E7\u00F5es\u2026" })] }))] }), _jsx("div", { ref: end })] }), error && (_jsxs("div", { className: `mx-4 mb-3 flex items-start gap-2 rounded-[8px] border px-3 py-2 text-xs ${error.missingKey ? 'border-warning/40 text-fg2' : 'border-negative/40 text-negative'}`, role: "alert", children: [error.missingKey && _jsx(KeyRound, { size: 15, strokeWidth: 1.5, className: "mt-0.5 shrink-0 text-warning" }), _jsx("span", { children: error.message })] })), threadMessages.length > 0 && !sending && slashMatches.length === 0 && (_jsx("div", { className: "flex gap-1.5 overflow-x-auto px-4 pb-2 tabs-scroll", "aria-label": "A\u00E7\u00F5es r\u00E1pidas", children: playbooks.map((pb) => (_jsx("button", { type: "button", onClick: () => void send(pb.prompt), className: "shrink-0 rounded-[6px] border border-line bg-sunken px-2.5 py-1 text-xs text-fg3 transition-colors duration-150 hover:border-line-strong hover:text-fg", children: pb.label }, pb.id))) })), image && (_jsxs("div", { className: "mx-4 mb-2 flex items-center gap-3 rounded-[8px] border border-line bg-sunken p-2", children: [_jsx("img", { src: image, alt: "Pr\u00E9via da imagem anexada", className: "h-10 w-10 rounded-[6px] object-cover" }), _jsx("span", { className: "mr-auto text-xs text-fg2", children: "Imagem pronta para leitura (recibo, prato ou anota\u00E7\u00E3o)" }), _jsx("button", { type: "button", className: "icon-btn h-7 w-7", onClick: () => setImage(null), "aria-label": "Remover imagem", children: _jsx(X, { size: 14, strokeWidth: 1.5 }) })] })), slashMatches.length > 0 && (_jsx("div", { className: "mx-4 mb-2 overflow-hidden rounded-[10px] border border-line-strong bg-surface", role: "listbox", "aria-label": "Comandos r\u00E1pidos", children: slashMatches.map((cmd, idx) => (_jsxs("button", { type: "button", role: "option", "aria-selected": idx === slashIndex, onMouseEnter: () => setSlashIndex(idx), onClick: () => applySlash(cmd), className: `flex w-full items-center gap-3 px-3 py-2 text-left text-xs transition-colors duration-150 ${idx === slashIndex ? 'bg-raised text-fg' : 'text-fg2 hover:bg-raised/60'}`, children: [_jsx("span", { className: "w-24 shrink-0 font-mono font-medium text-brand-ink", children: cmd.cmd }), _jsx("span", { className: "shrink-0 font-medium text-fg", children: cmd.label }), _jsx("span", { className: "min-w-0 flex-1 truncate text-right text-fg3 hidden sm:inline", children: cmd.description })] }, cmd.cmd))) })), _jsxs("form", { className: "flex items-end gap-2 border-t border-line p-3", onSubmit: (e) => { e.preventDefault(); void send(text); }, children: [_jsx("input", { ref: fileInput, type: "file", accept: "image/*", className: "hidden", onChange: (e) => void onPickImage(e) }), _jsx("button", { type: "button", className: "icon-btn shrink-0", onClick: () => fileInput.current?.click(), disabled: sending, title: "Anexar foto de recibo ou prato", "aria-label": "Anexar foto", children: _jsx(ImagePlus, { ...I }) }), voiceSupported && (_jsx("button", { type: "button", className: `icon-btn shrink-0 ${listening ? 'bg-negative/15 text-negative' : ''}`, onClick: toggleVoice, disabled: sending, title: listening ? 'Parar ditado' : 'Ditar por voz', "aria-label": listening ? 'Parar ditado por voz' : 'Ditar por voz', "aria-pressed": listening, children: listening ? _jsx(MicOff, { ...I }) : _jsx(Mic, { ...I }) })), _jsx("textarea", { ref: box, rows: 1, className: "input max-h-36 min-h-9 flex-1 resize-none py-2", placeholder: listening ? 'Ouvindo… fale seu pedido' : 'Escreva um pedido ou digite / para comandos', "aria-label": "Mensagem para o assistente", value: text, onChange: (e) => setText(e.target.value), onKeyDown: onKey, onPaste: (e) => void onPaste(e), maxLength: 4000 }), _jsx("button", { type: "submit", className: "btn-primary h-9 w-9 shrink-0 justify-center p-0", disabled: sending || (!text.trim() && !image), "aria-label": "Enviar", children: _jsx(ArrowUp, { ...I }) })] })] }));
    if (mode === 'drawer') {
        return (_jsxs("div", { className: "flex min-h-0 flex-1 flex-col", children: [_jsxs("div", { className: "flex items-center gap-1 border-b border-line px-4 py-2", children: [_jsxs("div", { className: "segmented", role: "tablist", "aria-label": "Vis\u00E3o do assistente", children: [_jsx("button", { type: "button", role: "tab", "aria-selected": drawerTab === 'chat', className: drawerTab === 'chat' ? 'tab-active' : 'tab', onClick: () => setDrawerTab('chat'), children: "Chat" }), _jsx("button", { type: "button", role: "tab", "aria-selected": drawerTab === 'threads', className: drawerTab === 'threads' ? 'tab-active' : 'tab', onClick: () => setDrawerTab('threads'), children: "Conversas" }), _jsxs("button", { type: "button", role: "tab", "aria-selected": drawerTab === 'memories', className: drawerTab === 'memories' ? 'tab-active' : 'tab', onClick: () => setDrawerTab('memories'), children: ["Mem\u00F3rias (", memories.rows.length, ")"] })] }), _jsxs("button", { type: "button", onClick: startNewThread, className: "ml-auto inline-flex h-8 items-center gap-1.5 rounded-[8px] border border-line bg-surface px-2.5 text-xs font-medium text-fg2 transition-colors duration-150 hover:border-line-strong hover:text-fg", title: "Nova conversa", children: [_jsx(MessageSquarePlus, { size: 14, strokeWidth: 1.5, "aria-hidden": "true" }), _jsx("span", { children: "Nova" })] })] }), drawerTab === 'chat' && chatArea, drawerTab === 'threads' && _jsx("div", { className: "min-h-0 flex-1 p-4", children: threadsList }), drawerTab === 'memories' && _jsx("div", { className: "min-h-0 flex-1 p-4", children: memoriesPanel })] }));
    }
    // Full page mode: 3-column desktop workspace (Threads | Chat | Memories)
    return (_jsxs("div", { className: "flex min-h-0 flex-1 flex-col", children: [_jsx("div", { className: "mb-4 flex items-center gap-2 lg:hidden", children: _jsxs("div", { className: "segmented", role: "tablist", "aria-label": "Vis\u00E3o do assistente", children: [_jsx("button", { type: "button", role: "tab", "aria-selected": drawerTab === 'chat', className: drawerTab === 'chat' ? 'tab-active' : 'tab', onClick: () => setDrawerTab('chat'), children: "Chat" }), _jsx("button", { type: "button", role: "tab", "aria-selected": drawerTab === 'threads', className: drawerTab === 'threads' ? 'tab-active' : 'tab', onClick: () => setDrawerTab('threads'), children: "Conversas" }), _jsx("button", { type: "button", role: "tab", "aria-selected": drawerTab === 'memories', className: drawerTab === 'memories' ? 'tab-active' : 'tab', onClick: () => setDrawerTab('memories'), children: "Mem\u00F3rias" })] }) }), _jsxs("div", { className: "grid min-h-0 flex-1 gap-4 lg:grid-cols-12", children: [_jsx("aside", { className: `card min-h-0 flex-col p-4 lg:col-span-3 ${drawerTab === 'threads' ? 'flex' : 'hidden lg:flex'}`, children: threadsList }), _jsx("section", { className: `card min-h-0 flex-col p-0 ${showMemoriesPane ? 'lg:col-span-9 xl:col-span-6' : 'lg:col-span-9'} ${drawerTab === 'chat' ? 'flex' : 'hidden lg:flex'}`, "aria-label": "Conversa", children: chatArea }), showMemoriesPane && (_jsx("aside", { className: `card min-h-0 flex-col p-4 xl:col-span-3 ${drawerTab === 'memories' ? 'flex' : 'hidden xl:flex'}`, children: memoriesPanel }))] })] }));
}
function Bubble({ m, undone, onUndo, onNavigate, }) {
    const time = formatTime(m.created_at);
    if (m.is_user) {
        return (_jsx("div", { className: "flex justify-end", children: _jsxs("div", { className: "max-w-[85%] rounded-[12px] rounded-br-[4px] border border-line bg-raised px-4 py-2.5 text-sm leading-6 whitespace-pre-wrap text-fg", children: [m.content, _jsx("div", { className: "figure mt-1 text-right text-[11px] text-fg3", children: time })] }) }));
    }
    const briefing = m.metadata?.kind === 'briefing';
    const auto = m.metadata?.kind === 'automation';
    const modelName = m.metadata?.model ? modelLabel(m.metadata.model) : null;
    return (_jsxs("div", { className: `max-w-[94%] ${briefing || auto ? 'rounded-[12px] border border-line bg-sunken/70 px-4 py-3' : ''}`, children: [_jsxs("div", { className: "mb-1.5 flex flex-wrap items-center gap-2 text-xs text-fg3", children: [briefing
                        ? _jsx(Sunrise, { size: 14, strokeWidth: 1.5, className: "text-brand-ink", "aria-hidden": "true" })
                        : auto
                            ? _jsx(Workflow, { size: 14, strokeWidth: 1.5, className: "text-brand-ink", "aria-hidden": "true" })
                            : _jsx(Bot, { size: 14, strokeWidth: 1.5, "aria-hidden": "true" }), _jsx("span", { children: briefing ? 'Resumo do dia · Piloto automático' : auto ? `Piloto automático · ${m.metadata?.title ?? 'pedido à IA'}` : modelName ?? 'Assistente' }), _jsxs("span", { className: "figure", children: ["\u00B7 ", time] })] }), _jsx(Rich, { text: m.content }), !!m.metadata?.actions?.length && (_jsx("ul", { className: "mt-3 space-y-1.5", "aria-label": "A\u00E7\u00F5es executadas", children: m.metadata.actions.map((a, i) => {
                    const key = `${m.id}:${i}`;
                    const isUndone = undone.has(key);
                    const link = actionLinkOf(a);
                    return (_jsxs("li", { className: `flex flex-wrap items-center gap-2 rounded-[8px] border px-3 py-2 text-xs ${isUndone ? 'border-line bg-sunken text-fg3 line-through' : 'border-line bg-sunken/80 text-fg'}`, children: [_jsx(CheckCircle2, { size: 14, strokeWidth: 1.5, className: isUndone ? 'shrink-0 text-fg3' : 'shrink-0 text-positive', "aria-hidden": "true" }), _jsx("span", { className: "mr-auto min-w-0", children: a.summary }), link && !isUndone && (_jsxs(Link, { to: link, onClick: onNavigate, className: "inline-flex items-center gap-1 rounded-[6px] border border-line bg-surface px-2 py-0.5 text-xs font-medium text-fg2 transition-colors duration-150 hover:border-line-strong hover:text-fg", children: [_jsx("span", { children: "Abrir" }), _jsx(ArrowUpRight, { size: 12, strokeWidth: 1.5, "aria-hidden": "true" })] })), a.undo && !isUndone && (_jsxs("button", { type: "button", onClick: () => onUndo(key, a.undo), className: "inline-flex items-center gap-1 rounded-[6px] border border-line bg-surface px-2 py-0.5 text-xs text-fg3 transition-colors duration-150 hover:border-line-strong hover:text-fg", "aria-label": `Desfazer: ${a.summary}`, children: [_jsx(RotateCcw, { size: 12, strokeWidth: 1.5, "aria-hidden": "true" }), _jsx("span", { children: "Desfazer" })] }))] }, key));
                }) }))] }));
}
function Line({ spans }) {
    return _jsx(_Fragment, { children: spans.map((s, i) => (s.code ? _jsx("code", { className: "rounded-[4px] bg-raised px-1 font-mono text-xs", children: s.text }, i) : s.bold ? _jsx("strong", { className: "font-medium text-fg", children: s.text }, i) : _jsx("span", { children: s.text }, i))) });
}
function Rich({ text }) {
    return (_jsx("div", { className: "space-y-2 text-sm leading-6 text-fg", children: pieces(text).map((p, i) => {
            if (p.kind === 'h')
                return _jsx("div", { className: "font-medium text-fg", children: _jsx(Line, { spans: p.spans }) }, i);
            if (p.kind === 'p')
                return _jsx("p", { className: "whitespace-pre-wrap", children: _jsx(Line, { spans: p.spans }) }, i);
            const Tag = p.kind;
            return _jsx(Tag, { className: `space-y-1 pl-5 ${p.kind === 'ul' ? 'list-disc' : 'list-decimal'} marker:text-fg3`, children: p.items.map((it, k) => _jsx("li", { children: _jsx(Line, { spans: it }) }, k)) }, i);
        }) }));
}
