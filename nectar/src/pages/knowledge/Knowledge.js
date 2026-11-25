import { jsx as _jsx, Fragment as _Fragment, jsxs as _jsxs } from "react/jsx-runtime";
import { useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ChevronLeft, ChevronRight, CheckSquare, FileText, Inbox, Network, Trash2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { write } from '../../lib/useTable';
import { latestPerKey } from '../../lib/serial';
import { addDays, formatDay, sentence, toDay } from '../../lib/dates';
import { num } from '../../lib/format';
import { newBlock } from '../../lib/blocks';
import { MOODS, averageMood, layoutGraph, writingStreak } from '../../lib/knowledge';
import { LineChart } from '../../components/Charts';
import { CellChip, MonthCalendar } from '../../components/MonthCalendar';
import { Empty, ListSkeleton, PageHeader, Stat } from '../../components/ui';
import { Notes } from './Notes';
import { useKnowledge } from './useKnowledge';
const TABS = ['Notas', 'Mapa', 'Diário', 'Captura'];
export default function Knowledge() {
    const data = useKnowledge();
    const [params, setParams] = useSearchParams();
    const [tab, setTab] = useState('Notas');
    // The open note lives in state, so switching notes happens in the same click
    // (a URL change renders later, as a transition); the URL only mirrors it.
    const [selected, setSelected] = useState(() => params.get('nota'));
    const select = (id) => { setSelected(id); if (id)
        setTab('Notas'); setParams(id ? { nota: id } : {}, { replace: true }); };
    const pending = data.captures.rows.filter((c) => !c.processed_into).length;
    return (_jsxs(_Fragment, { children: [_jsx(PageHeader, { title: "Conhecimento", subtitle: `${data.notes.rows.length} notas${pending ? ` · ${pending} na captura` : ''}`, tabs: TABS, tab: tab, onTab: (t) => setTab(t) }), data.notes.error && _jsx("p", { className: "mb-4 text-sm text-negative", children: data.notes.error }), data.notes.loading ? _jsx(ListSkeleton, { rows: 4 }) : (_jsxs(_Fragment, { children: [tab === 'Notas' && _jsx(Notes, { data: data, selected: selected, onSelect: select }), tab === 'Mapa' && _jsx(KnowledgeMap, { data: data, onOpen: select }), tab === 'Diário' && _jsx(Diary, { data: data }), tab === 'Captura' && _jsx(CaptureInbox, { data: data, onOpen: select })] }))] }));
}
// ---------------------------------------------------------------------------
// Map
// ---------------------------------------------------------------------------
function KnowledgeMap({ data, onOpen }) {
    const [area, setArea] = useState('');
    const [loose, setLoose] = useState(false);
    const [hover, setHover] = useState(null);
    const notes = data.notes.rows.filter((n) => !area || n.area_id === area);
    const ids = new Set(notes.map((n) => n.id));
    const edges = data.connections.rows.filter((c) => ids.has(c.source_block_id) && ids.has(c.target_block_id)).map((c) => [c.source_block_id, c.target_block_id]);
    const linked = new Set(edges.flat());
    const shown = notes.filter((n) => loose || linked.has(n.id));
    const key = shown.map((n) => n.id).join() + edges.map((e) => e.join('>')).join();
    const pos = useMemo(() => layoutGraph(shown.map((n) => n.id), edges), [key]); // eslint-disable-line react-hooks/exhaustive-deps
    const at = new Map(pos.map((p) => [p.id, p]));
    const colorOf = (areaId) => data.areas.rows.find((a) => a.id === areaId)?.color ?? 'var(--chart-neutral)';
    const near = hover ? new Set(edges.filter((e) => e.includes(hover)).flat()) : null;
    return (_jsxs("section", { className: "card", "aria-label": "Mapa de conex\u00F5es", children: [_jsxs("div", { className: "mb-3 flex flex-wrap items-center gap-3", children: [_jsxs("div", { className: "mr-auto", children: [_jsx("div", { className: "font-medium", children: "Mapa de conex\u00F5es" }), _jsxs("div", { className: "text-[13px] text-fg3", children: [edges.length, " conex\u00F5es entre ", linked.size, " notas. Toque numa nota para abrir."] })] }), _jsxs("select", { className: "input w-auto py-1.5 text-sm", "aria-label": "Filtrar \u00E1rea", value: area, onChange: (e) => setArea(e.target.value), children: [_jsx("option", { value: "", children: "Todas as \u00E1reas" }), data.areas.rows.map((a) => _jsx("option", { value: a.id, children: a.name }, a.id))] }), _jsxs("label", { className: "flex items-center gap-2 text-sm text-fg2", children: [_jsx("input", { type: "checkbox", className: "accent-[var(--brand)]", checked: loose, onChange: (e) => setLoose(e.target.checked) }), "Notas sem conex\u00E3o"] })] }), shown.length === 0 ? _jsx(Empty, { icon: _jsx(Network, { size: 18, strokeWidth: 1.5 }), children: "Nenhuma conex\u00E3o ainda. Escreva [[T\u00EDtulo de outra nota]] numa nota para ligar as duas." }) : (_jsxs("svg", { viewBox: "0 0 800 520", className: "w-full rounded-xl bg-raised/30", role: "img", "aria-label": "Notas e suas conex\u00F5es", children: [edges.map(([a, b], i) => {
                        const p = at.get(a);
                        const q = at.get(b);
                        if (!p || !q)
                            return null;
                        const on = !near || (near.has(a) && near.has(b) && (a === hover || b === hover));
                        return _jsx("line", { x1: p.x, y1: p.y, x2: q.x, y2: q.y, className: "stroke-line-strong", strokeWidth: on && hover ? 1.5 : 1, opacity: on ? 1 : 0.25 }, i);
                    }), shown.map((n) => {
                        const p = at.get(n.id);
                        if (!p)
                            return null;
                        const r = 5 + n.importance * 1.5;
                        const dim = near && !near.has(n.id) && n.id !== hover;
                        return (_jsxs("g", { transform: `translate(${p.x},${p.y})`, className: "cursor-pointer", opacity: dim ? 0.3 : 1, onMouseEnter: () => setHover(n.id), onMouseLeave: () => setHover(null), onClick: () => onOpen(n.id), role: "link", "aria-label": `Abrir ${n.title}`, tabIndex: 0, onKeyDown: (e) => { if (e.key === 'Enter')
                                onOpen(n.id); }, children: [_jsx("circle", { r: r, fill: colorOf(n.area_id), className: "stroke-surface", strokeWidth: 2 }), _jsx("text", { y: r + 13, textAnchor: "middle", className: "fill-fg2 text-[11px]", children: n.title.length > 22 ? `${n.title.slice(0, 21)}…` : n.title })] }, n.id));
                    })] }))] }));
}
// ---------------------------------------------------------------------------
// Diary
// ---------------------------------------------------------------------------
function Diary({ data }) {
    const today = toDay(new Date());
    const [day, setDay] = useState(today);
    const [ym, setYm] = useState({ year: Number(today.slice(0, 4)), month: Number(today.slice(5, 7)) });
    const entries = data.diary.rows;
    const entry = entries.find((e) => e.date === day);
    const from30 = addDays(today, -29);
    const avg = averageMood(entries, from30, today);
    const monthKey = `${ym.year}-${String(ym.month).padStart(2, '0')}`;
    const points = Array.from({ length: 30 }, (_, i) => addDays(from30, i)).map((d) => ({ label: `${Number(d.slice(8))}/${d.slice(5, 7)}`, value: entries.find((e) => e.date === d)?.mood ?? null }));
    // The editor reads the day's entry once, when it opens: wait for the entries.
    if (data.diary.loading)
        return _jsx(ListSkeleton, { rows: 4 });
    return (_jsxs("div", { className: "grid gap-6 lg:grid-cols-[1fr_380px]", children: [_jsx(DiaryEditor, { day: day, entry: entry, data: data, today: today, onDay: setDay }, day), _jsxs("div", { className: "space-y-6", children: [_jsxs("div", { className: "card grid grid-cols-3 gap-4", children: [_jsx(Stat, { label: "Sequ\u00EAncia", value: writingStreak(entries, today), unit: "dias", accent: true }), _jsx(Stat, { label: "Humor (30 dias)", value: avg == null ? '—' : num(avg), hint: avg == null ? undefined : MOODS[Math.round(avg) - 1] }), _jsx(Stat, { label: "No m\u00EAs", value: entries.filter((e) => e.date.startsWith(monthKey)).length })] }), _jsx(MonthCalendar, { year: ym.year, month: ym.month, onMonth: setYm, selected: day, onSelect: (d) => { if (d <= today)
                            setDay(d); }, count: (d) => (entries.some((e) => e.date === d) ? 1 : 0), renderCell: (d) => { const e = entries.find((x) => x.date === d); return e ? _jsx(CellChip, { children: e.mood ? MOODS[e.mood - 1] : 'escrito' }) : null; } }), _jsx(LineChart, { title: "Humor", subtitle: "\u00DAltimos 30 dias, de 1 (p\u00E9ssimo) a 5 (\u00F3timo)", points: points, unit: "", minZero: false, height: 180 })] })] }));
}
function DiaryEditor({ day, entry, data, today, onDay }) {
    const [mood, setMood] = useState(entry?.mood ?? null);
    const [title, setTitle] = useState(entry?.title ?? '');
    const [content, setContent] = useState(entry?.content ?? '');
    const [status, setStatus] = useState('idle');
    const saves = useRef(latestPerKey()).current;
    const timer = useRef(undefined);
    function save(next, wait = 700) {
        setStatus('saving');
        clearTimeout(timer.current);
        const run = () => saves(day, async () => {
            const row = { date: day, mood: next.mood, title: next.title || null, content: next.content };
            const { data: saved, error } = await supabase.from('diary_entries').upsert(row, { onConflict: 'user_id,date' }).select('id,date,title,content,mood').single();
            if (error) {
                alert(`Não foi possível salvar: ${error.message}`);
                return;
            }
            data.diary.setRows((rows) => [saved, ...rows.filter((r) => r.date !== day)].sort((a, b) => b.date.localeCompare(a.date)));
            setStatus('saved');
        });
        if (wait)
            timer.current = setTimeout(run, wait);
        else
            void run();
    }
    return (_jsxs("section", { className: "card h-fit", "aria-label": "Registro do dia", children: [_jsxs("div", { className: "mb-4 flex items-center gap-2", children: [_jsx("button", { className: "icon-btn", onClick: () => onDay(addDays(day, -1)), "aria-label": "Dia anterior", children: _jsx(ChevronLeft, { size: 16, strokeWidth: 1.5 }) }), _jsx("div", { className: "font-medium", children: day === today ? 'Hoje' : sentence(formatDay(day)) }), _jsx("button", { className: "icon-btn", disabled: day >= today, onClick: () => onDay(addDays(day, 1)), "aria-label": "Pr\u00F3ximo dia", children: _jsx(ChevronRight, { size: 16, strokeWidth: 1.5 }) }), _jsx("span", { className: "ml-auto text-xs text-fg3", "aria-live": "polite", children: status === 'saving' ? 'Salvando…' : status === 'saved' ? 'Salvo' : '' }), entry && _jsx("button", { className: "icon-btn text-negative", "aria-label": "Apagar registro do dia", onClick: async () => {
                            if (confirm('Apagar o registro deste dia?') && await write(supabase.from('diary_entries').delete().eq('id', entry.id))) {
                                data.diary.setRows((rows) => rows.filter((r) => r.id !== entry.id));
                                setMood(null);
                                setTitle('');
                                setContent('');
                                setStatus('idle');
                            }
                        }, children: _jsx(Trash2, { size: 16, strokeWidth: 1.5 }) })] }), _jsxs("div", { className: "mb-4", role: "group", "aria-label": "Humor do dia", children: [_jsx("div", { className: "label mb-2", children: "Como foi o dia?" }), _jsx("div", { className: "grid grid-cols-5 gap-2", children: MOODS.map((m, i) => (_jsxs("button", { type: "button", "aria-pressed": mood === i + 1, className: `rounded-xl border py-2 text-sm transition-colors duration-150 ${mood === i + 1 ? 'border-brand bg-brand/15 text-fg' : 'border-line text-fg2 hover:bg-raised'}`, onClick: () => { const v = mood === i + 1 ? null : i + 1; setMood(v); save({ mood: v, title, content }, 0); }, children: [_jsx("span", { className: "figure block text-lg", children: i + 1 }), m] }, m))) })] }), _jsx("input", { className: "mb-3 w-full bg-transparent text-lg font-medium outline-none placeholder:text-fg3", placeholder: "T\u00EDtulo (opcional)", "aria-label": "T\u00EDtulo do dia", value: title, onChange: (e) => { setTitle(e.target.value); save({ mood, title: e.target.value, content }); } }), _jsx("textarea", { className: "input min-h-64 resize-y text-[15px] leading-6", placeholder: "O que aconteceu, o que aprendeu, pelo que \u00E9 grato\u2026", "aria-label": "Texto do di\u00E1rio", value: content, onChange: (e) => { setContent(e.target.value); save({ mood, title, content: e.target.value }); } })] }));
}
// ---------------------------------------------------------------------------
// Quick capture
// ---------------------------------------------------------------------------
function CaptureInbox({ data, onOpen }) {
    const [text, setText] = useState('');
    const open = data.captures.rows.filter((c) => !c.processed_into);
    const done = data.captures.rows.filter((c) => c.processed_into);
    async function add(e) {
        e?.preventDefault();
        if (!text.trim())
            return;
        if (await write(supabase.from('brain_entries').insert({ content: text.trim() }))) {
            setText('');
            void data.captures.reload();
        }
    }
    const split = (content) => {
        const [first, ...rest] = content.split('\n');
        return { title: first.slice(0, 120).trim() || 'Captura', body: rest.join('\n').trim() };
    };
    async function mark(id, processed_into) {
        data.captures.setRows((rows) => rows.map((c) => (c.id === id ? { ...c, processed_into } : c)));
        await write(supabase.from('brain_entries').update({ processed_into }).eq('id', id));
    }
    async function toNote(id, content) {
        const { title, body } = split(content);
        const blocks = body ? body.split('\n').map((l) => newBlock('paragraph', l)) : [];
        const noteId = data.createNote({ title, content: blocks, content_text: body });
        if (noteId) {
            await mark(id, 'nota');
            onOpen(noteId);
        }
    }
    async function toTask(id, content) {
        const { title, body } = split(content);
        if (await write(supabase.from('tasks').insert({ title, description: body || null })))
            await mark(id, 'tarefa');
    }
    const ago = (iso) => {
        const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
        return m < 1 ? 'agora' : m < 60 ? `há ${m} min` : m < 1440 ? `há ${Math.round(m / 60)} h` : sentence(formatDay(toDay(new Date(iso))));
    };
    return (_jsxs("div", { className: "grid gap-6 lg:grid-cols-[1fr_1fr]", children: [_jsxs("form", { className: "card h-fit", onSubmit: add, children: [_jsx("div", { className: "label mb-2", children: "Captura r\u00E1pida" }), _jsx("p", { className: "mb-3 text-sm text-fg3", children: "Tire da cabe\u00E7a agora e decida depois: vira nota, tarefa ou some. A primeira linha vira o t\u00EDtulo." }), _jsx("textarea", { className: "input mb-3 min-h-32", placeholder: "Ideia, link, lembrete solto\u2026", "aria-label": "Nova captura", value: text, onChange: (e) => setText(e.target.value), onKeyDown: (e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey))
                            void add(); } }), _jsxs("button", { className: "btn-primary w-full", children: ["Guardar ", _jsx("span", { className: "ml-1 text-xs opacity-60", children: "Ctrl+Enter" })] })] }), _jsxs("section", { "aria-label": "Caixa de entrada", children: [_jsxs("div", { className: "label mb-3", children: ["Para processar (", open.length, ")"] }), open.length === 0 && _jsx("div", { className: "card", children: _jsx(Empty, { icon: _jsx(Inbox, { size: 18, strokeWidth: 1.5 }), children: "Caixa vazia" }) }), _jsx("ul", { className: "space-y-2", children: open.map((c) => (_jsxs("li", { className: "card p-4", children: [_jsx("p", { className: "mb-3 text-sm whitespace-pre-wrap", children: c.content }), _jsxs("div", { className: "flex flex-wrap items-center gap-1", children: [_jsx("span", { className: "mr-auto text-xs text-fg3", children: ago(c.created_at) }), _jsxs("button", { className: "btn-ghost h-8 text-sm", onClick: () => toNote(c.id, c.content), children: [_jsx(FileText, { size: 14, strokeWidth: 1.5 }), "Virar nota"] }), _jsxs("button", { className: "btn-ghost h-8 text-sm", onClick: () => toTask(c.id, c.content), children: [_jsx(CheckSquare, { size: 14, strokeWidth: 1.5 }), "Virar tarefa"] }), _jsx("button", { className: "icon-btn", "aria-label": "Excluir captura", onClick: async () => {
                                                if (await write(supabase.from('brain_entries').delete().eq('id', c.id)))
                                                    data.captures.setRows((rows) => rows.filter((x) => x.id !== c.id));
                                            }, children: _jsx(Trash2, { size: 14, strokeWidth: 1.5 }) })] })] }, c.id))) }), done.length > 0 && (_jsxs("details", { className: "mt-4", children: [_jsxs("summary", { className: "label cursor-pointer", children: ["Processadas (", done.length, ")"] }), _jsx("ul", { className: "mt-2 space-y-1 text-sm text-fg3", children: done.slice(0, 30).map((c) => _jsxs("li", { className: "truncate", children: [c.processed_into === 'nota' ? 'Nota' : 'Tarefa', ": ", c.content.split('\n')[0]] }, c.id)) })] }))] })] }));
}
