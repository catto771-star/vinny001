import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, CornerDownRight, Download, FileText, Link2, Notebook, Pin, Plus, Search, Sparkles, Star, Trash2, Upload, X } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { write } from '../../lib/useTable';
import { feedback } from '../../lib/feedback';
import { blocksToText, wikiLinks } from '../../lib/blocks';
import { excerpt, linkedNotes, searchNotes, syncWikiLinks } from '../../lib/knowledge';
import { backlinksOf, markdownFileName, markdownToNote, NOTE_TEMPLATES, noteToMarkdown } from '../../lib/markdown';
import { Empty, Field, Modal } from '../../components/ui';
import { BlockEditor } from './BlockEditor';
const AREA_COLORS = ['#ea580c', '#0ea5e9', '#22c55e', '#a855f7', '#eab308', '#ec4899', '#64748b'];
function downloadMarkdown(filename, content) {
    const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
}
export function Notes({ data, selected, onSelect }) {
    const [filter, setFilter] = useState('all');
    const [query, setQuery] = useState('');
    const [areaForm, setAreaForm] = useState(null);
    const [pickingTemplate, setPickingTemplate] = useState(false);
    const [importing, setImporting] = useState(false);
    const mdInputRef = useRef(null);
    const notes = data.notes.rows;
    const inFilter = notes.filter((n) => filter === 'all' || (filter === 'fav' ? n.is_favorite : filter === 'none' ? !n.area_id : n.area_id === filter));
    const list = searchNotes(inFilter, query);
    const note = notes.find((n) => n.id === selected) ?? null;
    const areaOf = (n) => data.areas.rows.find((a) => a.id === n.area_id);
    const currentAreaId = filter !== 'all' && filter !== 'fav' && filter !== 'none' ? filter : null;
    function create() {
        const id = data.createNote({ area_id: currentAreaId });
        if (id)
            onSelect(id);
    }
    function createFromTemplate(tpl) {
        const blocks = tpl.buildBlocks();
        const id = data.createNote({
            area_id: currentAreaId,
            title: tpl.defaultTitle,
            tags: [...tpl.tags],
            content: blocks,
            content_text: blocksToText(blocks),
        });
        setPickingTemplate(false);
        if (id)
            onSelect(id);
    }
    async function importMarkdownFiles(e) {
        const files = Array.from(e.target.files ?? []);
        e.target.value = '';
        if (!files.length)
            return;
        setImporting(true);
        try {
            const created = [];
            const now = new Date().toISOString();
            const rows = await Promise.all(files.map(async (file) => {
                const parsed = markdownToNote(await file.text(), file.name);
                const id = crypto.randomUUID();
                const row = {
                    id,
                    area_id: currentAreaId,
                    title: parsed.title,
                    content: parsed.blocks,
                    content_text: parsed.content_text,
                    tags: parsed.tags,
                    importance: 3,
                    is_pinned: false,
                    is_favorite: false,
                };
                created.push({ ...row, summary: null, created_at: now, updated_at: now });
                return row;
            }));
            const ok = await write(supabase.from('knowledge_blocks').insert(rows));
            if (ok) {
                const allNotes = [...created, ...data.notes.rows];
                const existingConns = [...data.connections.rows];
                const toAdd = [];
                for (const n of created) {
                    const { add } = syncWikiLinks(n, wikiLinks(n.content_text ?? ''), allNotes, existingConns);
                    for (const target of add)
                        toAdd.push({ source_block_id: n.id, target_block_id: target, auto_generated: true });
                }
                if (toAdd.length)
                    await supabase.from('knowledge_connections').insert(toAdd);
                await Promise.all([data.notes.reload(), data.connections.reload()]);
                feedback({ kind: 'ok', text: `${created.length} ${created.length === 1 ? 'nota importada' : 'notas importadas'}` });
                if (created[0])
                    onSelect(created[0].id);
            }
        }
        finally {
            setImporting(false);
        }
    }
    const chip = (key, label, count, color, emoji, area) => (_jsxs("li", { className: "group flex items-center", children: [_jsxs("button", { className: `flex min-w-0 flex-1 items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-sm transition-colors duration-150 ${filter === key ? 'bg-raised text-fg' : 'text-fg2 hover:bg-raised/50'}`, onClick: () => { setFilter(key); onSelect(null); }, "aria-pressed": filter === key, children: [emoji ? _jsx("span", { className: "w-4 text-center", children: emoji }) : _jsx("span", { className: "ml-1 h-2 w-2 shrink-0 rounded-full", style: { background: color ?? 'var(--fg3)' } }), _jsx("span", { className: "mr-auto truncate", children: label }), _jsx("span", { className: "figure text-xs text-fg3", children: count })] }), area && _jsx("button", { className: "icon-btn h-7 w-7 opacity-0 group-hover:opacity-100 focus:opacity-100", "aria-label": `Editar área ${area.name}`, onClick: () => setAreaForm(area), children: "\u22EF" })] }, key));
    return (_jsxs("div", { className: "grid gap-6 lg:grid-cols-[220px_300px_1fr]", children: [_jsxs("aside", { className: note ? 'hidden min-w-0 lg:block' : 'min-w-0', "aria-label": "\u00C1reas", children: [_jsxs("ul", { className: "flex gap-1 overflow-x-auto pb-1 lg:block lg:space-y-0.5 lg:overflow-visible", children: [chip('all', 'Todas as notas', notes.length), chip('fav', 'Favoritas', notes.filter((n) => n.is_favorite).length, '#eab308'), data.areas.rows.map((a) => chip(a.id, a.name, notes.filter((n) => n.area_id === a.id).length, a.color, a.emoji, a)), notes.some((n) => !n.area_id) && chip('none', 'Sem área', notes.filter((n) => !n.area_id).length)] }), _jsxs("div", { className: "mt-2 space-y-1", children: [_jsxs("button", { className: "btn-ghost w-full justify-start", onClick: () => setAreaForm({}), children: [_jsx(Plus, { size: 16, strokeWidth: 1.5 }), "Nova \u00E1rea"] }), _jsxs("button", { type: "button", className: "btn-ghost w-full justify-start", disabled: importing, onClick: () => mdInputRef.current?.click(), children: [_jsx(Upload, { size: 15, strokeWidth: 1.5, "aria-hidden": "true" }), importing ? 'Importando…' : 'Importar .md'] }), _jsx("input", { ref: mdInputRef, type: "file", accept: ".md,text/markdown,text/plain", multiple: true, className: "sr-only", onChange: (e) => void importMarkdownFiles(e) })] })] }), _jsxs("section", { className: note ? 'hidden min-w-0 lg:block' : 'min-w-0', "aria-label": "Lista de notas", children: [_jsxs("div", { className: "mb-3 flex gap-1.5", children: [_jsxs("label", { className: "relative flex-1", children: [_jsx(Search, { size: 16, strokeWidth: 1.5, className: "pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-fg3" }), _jsx("input", { className: "input pl-9", placeholder: "Buscar notas", "aria-label": "Buscar notas", value: query, onChange: (e) => setQuery(e.target.value) })] }), _jsx("button", { type: "button", className: "btn-secondary px-2.5", onClick: () => setPickingTemplate(true), title: "Criar a partir de um modelo", "aria-label": "Modelos de nota", children: _jsx(Sparkles, { size: 15, strokeWidth: 1.6, "aria-hidden": "true" }) }), _jsx("button", { className: "btn-primary px-3", onClick: create, "aria-label": "Nova nota", children: _jsx(Plus, { size: 16, strokeWidth: 1.5 }) })] }), list.length === 0 && (_jsx("div", { className: "card", children: _jsx(Empty, { icon: _jsx(Notebook, { size: 18, strokeWidth: 1.5 }), action: !query ? _jsx("button", { className: "btn-secondary", onClick: create, children: "Nova nota" }) : undefined, children: query ? 'Nada encontrado' : 'Nenhuma nota aqui' }) })), _jsx("ul", { className: "space-y-2", children: list.map((n) => {
                            const area = areaOf(n);
                            return (_jsx("li", { children: _jsxs("button", { className: `card w-full p-3 text-left transition-colors duration-150 ${n.id === selected ? 'border-brand/60' : 'hover:border-line-strong'}`, onClick: () => onSelect(n.id), children: [_jsxs("div", { className: "flex items-center gap-1.5", children: [n.is_pinned && _jsx(Pin, { size: 12, strokeWidth: 1.5, className: "shrink-0 text-brand-ink", "aria-label": "Fixada" }), _jsx("span", { className: "mr-auto truncate text-sm font-medium", children: n.title || 'Sem título' }), n.is_favorite && _jsx(Star, { size: 12, strokeWidth: 1.5, className: "shrink-0 fill-current text-[#eab308]", "aria-label": "Favorita" })] }), n.content_text && _jsx("p", { className: "mt-1 line-clamp-2 text-xs text-fg3", children: excerpt(n.content_text) }), _jsxs("div", { className: "mt-1.5 flex flex-wrap items-center gap-1.5 text-[11px] text-fg3", children: [area && _jsxs("span", { className: "flex items-center gap-1", children: [_jsx("span", { className: "h-1.5 w-1.5 rounded-full", style: { background: area.color ?? 'var(--fg3)' } }), area.name] }), n.tags.slice(0, 3).map((t) => _jsxs("span", { className: "rounded bg-raised px-1.5", children: ["#", t] }, t))] })] }) }, n.id));
                        }) })] }), _jsx("section", { className: note ? 'min-w-0' : 'hidden min-w-0 lg:block', "aria-label": "Nota", children: note ? _jsx(NoteEditor, { note: note, data: data, onOpen: onSelect, onClose: () => onSelect(null) }, note.id)
                    : _jsx("div", { className: "card", children: _jsx(Empty, { icon: _jsx(Notebook, { size: 18, strokeWidth: 1.5 }), children: "Escolha uma nota, use um modelo ou importe arquivos .md" }) }) }), areaForm && _jsx(AreaForm, { area: areaForm, data: data, onClose: () => setAreaForm(null), onDeleted: () => setFilter('all') }), pickingTemplate && (_jsx(Modal, { title: "Criar nota com modelo", onClose: () => setPickingTemplate(false), children: _jsxs("ul", { className: "space-y-2", children: [_jsx("li", { children: _jsxs("button", { type: "button", onClick: () => { setPickingTemplate(false); create(); }, className: "flex w-full items-start gap-3 rounded-xl border border-line bg-raised/40 p-3 text-left transition-colors hover:bg-raised", children: [_jsx(FileText, { size: 17, strokeWidth: 1.5, className: "mt-0.5 shrink-0 text-fg3", "aria-hidden": "true" }), _jsxs("div", { children: [_jsx("div", { className: "text-sm font-medium", children: "Nota em branco" }), _jsx("div", { className: "text-xs text-fg3", children: "Comece livremente com texto, listas e [[links]]" })] })] }) }), NOTE_TEMPLATES.map((tpl) => (_jsx("li", { children: _jsxs("button", { type: "button", onClick: () => createFromTemplate(tpl), className: "flex w-full items-start gap-3 rounded-xl border border-line bg-raised/40 p-3 text-left transition-colors hover:bg-raised", children: [_jsx(Sparkles, { size: 17, strokeWidth: 1.5, className: "mt-0.5 shrink-0 text-brand", "aria-hidden": "true" }), _jsxs("div", { children: [_jsx("div", { className: "text-sm font-medium", children: tpl.name }), _jsx("div", { className: "text-xs text-fg3", children: tpl.description })] })] }) }, tpl.id)))] }) }))] }));
}
function NoteEditor({ note, data, onOpen, onClose }) {
    const [title, setTitle] = useState(note.title);
    const [tags, setTags] = useState(note.tags.join(', '));
    const [status, setStatus] = useState('saved');
    const timer = useRef(undefined);
    const pending = useRef({});
    const titleRef = useRef(null);
    useEffect(() => { if (note.title === 'Sem título' && !note.content_text)
        titleRef.current?.select(); }, [note.id]); // eslint-disable-line react-hooks/exhaustive-deps
    useEffect(() => () => { clearTimeout(timer.current); flush(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
    function flush() {
        const patch = pending.current;
        pending.current = {};
        if (!Object.keys(patch).length)
            return;
        void data.saveNote(note.id, patch).then(() => setStatus('saved'));
    }
    /** Text edits wait a moment and go together; toggles save at once. */
    function change(patch, wait = 600) {
        pending.current = { ...pending.current, ...patch };
        setStatus('saving');
        clearTimeout(timer.current);
        if (wait)
            timer.current = setTimeout(flush, wait);
        else
            flush();
    }
    const links = linkedNotes(note.id, data.connections.rows, data.notes.rows);
    const outgoing = links.filter((l) => l.direction === 'out');
    const backlinks = backlinksOf(note, data.connections.rows, data.notes.rows);
    const others = data.notes.rows.filter((n) => n.id !== note.id && !links.some((l) => l.note.id === n.id));
    const area = data.areas.rows.find((a) => a.id === note.area_id);
    function exportMd() {
        const md = noteToMarkdown({ ...note, title }, area?.name);
        downloadMarkdown(markdownFileName(title || note.title), md);
    }
    async function remove() {
        if (!confirm('Excluir esta nota?'))
            return;
        clearTimeout(timer.current);
        pending.current = {};
        if (await write(supabase.from('knowledge_blocks').delete().eq('id', note.id))) {
            data.notes.setRows((rows) => rows.filter((n) => n.id !== note.id));
            void data.connections.reload();
            onClose();
        }
    }
    async function connect(target) {
        if (target && await write(supabase.from('knowledge_connections').insert({ source_block_id: note.id, target_block_id: target })))
            void data.connections.reload();
    }
    return (_jsxs("div", { className: "space-y-4", children: [_jsxs("div", { className: "card", children: [_jsxs("div", { className: "mb-3 flex items-center gap-1", children: [_jsxs("button", { className: "btn-ghost -ml-2 lg:hidden", onClick: onClose, children: [_jsx(ArrowLeft, { size: 16, strokeWidth: 1.5 }), "Notas"] }), _jsx("span", { className: "mr-auto text-xs text-fg3", "aria-live": "polite", children: status === 'saving' ? 'Salvando…' : 'Salvo' }), _jsx("button", { type: "button", className: "icon-btn", title: "Exportar nota em Markdown (.md)", "aria-label": "Exportar nota em Markdown", onClick: exportMd, children: _jsx(Download, { size: 16, strokeWidth: 1.5 }) }), _jsx("button", { className: `icon-btn ${note.is_pinned ? 'text-brand-ink' : ''}`, "aria-pressed": note.is_pinned, "aria-label": "Fixar nota", onClick: () => change({ is_pinned: !note.is_pinned }, 0), children: _jsx(Pin, { size: 16, strokeWidth: 1.5 }) }), _jsx("button", { className: `icon-btn ${note.is_favorite ? 'text-[#eab308]' : ''}`, "aria-pressed": note.is_favorite, "aria-label": "Favoritar nota", onClick: () => change({ is_favorite: !note.is_favorite }, 0), children: _jsx(Star, { size: 16, strokeWidth: 1.5, className: note.is_favorite ? 'fill-current' : '' }) }), _jsx("button", { className: "icon-btn text-negative", "aria-label": "Excluir nota", onClick: remove, children: _jsx(Trash2, { size: 16, strokeWidth: 1.5 }) })] }), _jsx("input", { ref: titleRef, className: "mb-3 w-full bg-transparent text-2xl leading-8 font-medium outline-none placeholder:text-fg3", placeholder: "T\u00EDtulo", "aria-label": "T\u00EDtulo da nota", value: title, onChange: (e) => { setTitle(e.target.value); change({ title: e.target.value }); } }), _jsxs("div", { className: "mb-4 flex flex-wrap gap-2 text-sm", children: [_jsxs("select", { className: "input w-auto py-1 text-sm", "aria-label": "\u00C1rea da nota", value: note.area_id ?? '', onChange: (e) => change({ area_id: e.target.value || null }, 0), children: [_jsx("option", { value: "", children: "Sem \u00E1rea" }), data.areas.rows.map((a) => _jsxs("option", { value: a.id, children: [a.emoji ? `${a.emoji} ` : '', a.name] }, a.id))] }), _jsx("select", { className: "input w-auto py-1 text-sm", "aria-label": "Import\u00E2ncia", value: note.importance, onChange: (e) => change({ importance: Number(e.target.value) }, 0), children: [1, 2, 3, 4, 5].map((i) => _jsxs("option", { value: i, children: ["Import\u00E2ncia ", i] }, i)) }), _jsx("input", { className: "input min-w-40 flex-1 py-1 text-sm", placeholder: "Tags, separadas por v\u00EDrgula", "aria-label": "Tags", value: tags, onChange: (e) => { setTags(e.target.value); change({ tags: e.target.value.split(',').map((t) => t.trim().replace(/^#/, '')).filter(Boolean) }); } })] }), _jsx(BlockEditor, { initial: note.content, onChange: (blocks) => change({ content: blocks, content_text: blocksToText(blocks) }) })] }), _jsxs("div", { className: "card", "aria-label": "Backlinks", children: [_jsxs("div", { className: "label mb-2 flex items-center gap-2", children: [_jsx(CornerDownRight, { size: 14, strokeWidth: 1.5, "aria-hidden": "true" }), "Referenciada por (Backlinks)", _jsx("span", { className: "figure ml-auto text-xs text-fg3", children: backlinks.length })] }), backlinks.length === 0 ? (_jsxs("p", { className: "text-sm text-fg3", children: ["Nenhuma outra nota cita ", _jsxs("span", { className: "font-mono text-xs", children: ["[[", title || 'esta nota', "]]"] }), " ainda."] })) : (_jsx("ul", { className: "divide-y divide-line", children: backlinks.map(({ note: src, snippet }) => (_jsx("li", { className: "py-2 first:pt-0 last:pb-0", children: _jsxs("button", { type: "button", className: "block w-full rounded-lg text-left hover:underline", onClick: () => onOpen(src.id), children: [_jsx("div", { className: "text-sm font-medium", children: src.title || 'Sem título' }), snippet && _jsx("p", { className: "mt-0.5 line-clamp-2 text-xs text-fg3", children: snippet })] }) }, src.id))) }))] }), _jsxs("div", { className: "card", children: [_jsxs("div", { className: "label mb-2 flex items-center gap-2", children: [_jsx(Link2, { size: 14, strokeWidth: 1.5 }), "Conex\u00F5es desta nota"] }), outgoing.length === 0 && _jsx("p", { className: "mb-3 text-sm text-fg3", children: "Escreva [[T\u00EDtulo de outra nota]] no texto para conectar, ou escolha abaixo." }), outgoing.length > 0 && (_jsx("ul", { className: "mb-3 flex flex-wrap gap-2", children: outgoing.map(({ note: n, connection: c }) => (_jsxs("li", { className: "flex items-center rounded-lg bg-raised text-sm", children: [_jsx("button", { className: "px-2.5 py-1 hover:underline", onClick: () => onOpen(n.id), title: c.auto_generated ? 'Via [[link]]' : 'Conexão manual', children: n.title || 'Sem título' }), !c.auto_generated && (_jsx("button", { className: "icon-btn h-6 w-6", "aria-label": `Desconectar ${n.title}`, onClick: async () => {
                                        if (await write(supabase.from('knowledge_connections').delete().eq('id', c.id)))
                                            void data.connections.reload();
                                    }, children: _jsx(X, { size: 12, strokeWidth: 1.5 }) }))] }, n.id))) })), others.length > 0 && (_jsxs("select", { className: "input py-1.5 text-sm", "aria-label": "Conectar a outra nota", value: "", onChange: (e) => void connect(e.target.value), children: [_jsx("option", { value: "", children: "Conectar a\u2026" }), others.map((n) => _jsx("option", { value: n.id, children: n.title || 'Sem título' }, n.id))] }))] })] }));
}
function AreaForm({ area, data, onClose, onDeleted }) {
    const [name, setName] = useState(area.name ?? '');
    const [emoji, setEmoji] = useState(area.emoji ?? '');
    const [color, setColor] = useState(area.color ?? AREA_COLORS[1]);
    const [description, setDescription] = useState(area.description ?? '');
    async function save(e) {
        e.preventDefault();
        const row = { name, emoji: emoji || null, color, description: description || null };
        const ok = area.id ? await write(supabase.from('knowledge_areas').update(row).eq('id', area.id)) : await write(supabase.from('knowledge_areas').insert(row));
        if (ok) {
            void data.areas.reload();
            onClose();
        }
    }
    return (_jsx(Modal, { title: area.id ? 'Editar área' : 'Nova área', onClose: onClose, children: _jsxs("form", { onSubmit: save, children: [_jsxs("div", { className: "grid grid-cols-[1fr_88px] gap-2", children: [_jsx(Field, { label: "Nome da \u00E1rea", children: _jsx("input", { className: "input", value: name, onChange: (e) => setName(e.target.value), required: true, autoFocus: true }) }), _jsx(Field, { label: "Emoji", children: _jsx("input", { className: "input text-center", maxLength: 4, value: emoji, onChange: (e) => setEmoji(e.target.value) }) })] }), _jsx(Field, { label: "Descri\u00E7\u00E3o", children: _jsx("input", { className: "input", value: description, onChange: (e) => setDescription(e.target.value) }) }), _jsxs("div", { className: "mb-4", role: "group", "aria-label": "Cor", children: [_jsx("span", { className: "mb-1.5 block text-[13px] leading-5 text-fg2", children: "Cor" }), _jsx("div", { className: "flex gap-2", children: AREA_COLORS.map((c) => (_jsx("button", { type: "button", "aria-label": `Cor ${c}`, "aria-pressed": c === color, onClick: () => setColor(c), className: `h-7 w-7 rounded-full ${c === color ? 'ring-2 ring-fg ring-offset-2 ring-offset-surface' : ''}`, style: { background: c } }, c))) })] }), _jsxs("div", { className: "flex gap-2", children: [area.id && _jsx("button", { type: "button", className: "btn-ghost text-negative", onClick: async () => {
                                if (confirm('Excluir esta área? As notas continuam, sem área.') && await write(supabase.from('knowledge_areas').delete().eq('id', area.id))) {
                                    void data.areas.reload();
                                    void data.notes.reload();
                                    onDeleted();
                                    onClose();
                                }
                            }, children: "Excluir" }), _jsx("button", { className: "btn-primary ml-auto", children: "Salvar" })] })] }) }));
}
