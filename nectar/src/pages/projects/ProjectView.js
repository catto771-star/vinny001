import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowDown, ArrowLeft, ArrowUp, ArrowUpRight, BookOpen, CheckCircle2, ChevronLeft, ChevronRight, Flag, Link2, Play, Plus, Unlink, Wallet, } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useTable, write } from '../../lib/useTable';
import { formatDay, sentence, toDay } from '../../lib/dates';
import { newBlock } from '../../lib/blocks';
import { excerpt } from '../../lib/knowledge';
import { EXPENSE_CATEGORIES } from '../../lib/finance';
import { CURRENCIES, formatIn, symbolOf, toBRL } from '../../lib/money';
import { COLUMNS, HEALTH_LABEL, STATUS_LABEL, burnup, diffDays, kanban, moveTo, projectBudgetSummary, projectHealth, projectProgress, toTemplate, trajectory, } from '../../lib/projects';
import { PRIORITY_LABEL } from '../../lib/tasks';
import { ColumnChart } from '../../components/Charts';
import { Empty, Field, FieldGroup, Modal, PageHeader, Stat } from '../../components/ui';
import { useRates } from '../finance/useRates';
import { dueFromDay } from './useProjects';
import { HEALTH_TONE, ProjectForm } from './Projects';
const VIEWS = ['Quadro', 'Marcos', 'Notas', 'Custos', 'Trajetória'];
const DOT = { high: 'bg-negative', medium: 'bg-brand', low: 'bg-fg3' };
const short = (day) => `${Number(day.slice(8))}/${day.slice(5, 7)}`;
const taskDay = (t) => (t.due_date ? toDay(new Date(t.due_date)) : null);
export default function ProjectView({ project: p, data, today, onBack }) {
    const [view, setView] = useState('Quadro');
    const [editing, setEditing] = useState(false);
    const [taskOpen, setTaskOpen] = useState(null);
    const notes = useTable('knowledge_blocks', 'id,area_id,project_id,title,content_text,summary,tags,importance,is_pinned,is_favorite,created_at,updated_at', { column: 'updated_at', ascending: false });
    const txs = useTable('transactions', '*', { column: 'date', ascending: false });
    const banks = useTable('banks', '*', { column: 'created_at' });
    const fx = useRates(null);
    const tasks = data.tasksOf(p.id);
    const steps = data.stepsOf(p.id);
    const prog = projectProgress(tasks, steps);
    const { health, expected } = projectHealth(p, prog.pct, today);
    const left = p.due_date ? diffDays(today, p.due_date) : null;
    const budgetSummary = projectBudgetSummary(p, txs.rows, fx.rates);
    const showBudgetStat = budgetSummary.budget != null || budgetSummary.txCount > 0;
    async function saveAsTemplate() {
        const tpl = toTemplate(p, steps, tasks);
        const { data: created, error } = await supabase.from('projects')
            .insert({ name: `${p.name} (modelo)`, description: p.description, color: p.color, priority: p.priority, status: 'planning', is_template: true, template_tasks: tpl.template_tasks })
            .select('id').single();
        if (error || !created) {
            alert(`Não foi possível salvar: ${error?.message}`);
            return;
        }
        if (tpl.steps.length)
            await write(supabase.from('project_steps').insert(tpl.steps.map((s) => ({ ...s, project_id: created.id }))));
        await data.reload();
        alert('Modelo salvo. Ele aparece na aba Modelos.');
    }
    async function remove() {
        if (!confirm(`Excluir o projeto e as ${tasks.length} tarefas dele? Isso não pode ser desfeito.`))
            return;
        if (tasks.length)
            await write(supabase.from('tasks').delete().in('id', tasks.map((t) => t.id)));
        if (await write(supabase.from('projects').delete().eq('id', p.id))) {
            onBack();
            void data.reload();
        }
    }
    return (_jsxs(_Fragment, { children: [_jsxs("button", { className: "btn-ghost -ml-2 mb-2", onClick: onBack, children: [_jsx(ArrowLeft, { size: 16, strokeWidth: 1.5 }), "Projetos"] }), _jsx(PageHeader, { title: p.name, subtitle: [STATUS_LABEL[p.status], p.description].filter(Boolean).join(' · '), tabs: VIEWS, tab: view, onTab: (v) => setView(v), action: _jsx("button", { className: "btn-secondary", onClick: () => setEditing(true), children: "Editar" }) }), _jsxs("div", { className: "card mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4", children: [_jsx(Stat, { label: "Progresso", value: `${prog.pct}%`, accent: true, hint: prog.by === 'steps' ? `${prog.done}/${prog.total} marcos` : `${prog.done}/${prog.total} tarefas` }), _jsx(Stat, { label: "Situa\u00E7\u00E3o", value: _jsx("span", { className: HEALTH_TONE[health], children: p.status === 'paused' ? STATUS_LABEL.paused : HEALTH_LABEL[health] }), hint: expected != null && health !== 'late' ? `esperado ${expected}% até hoje` : undefined }), _jsx(Stat, { label: "Prazo", value: p.due_date ? short(p.due_date) : '—', hint: left == null || p.status === 'completed' ? undefined : left < 0 ? `${-left} dias de atraso` : left === 0 ? 'vence hoje' : `faltam ${left} dias` }), showBudgetStat ? (_jsx(Stat, { label: "Custos", value: _jsx("span", { className: budgetSummary.overBudget ? 'text-negative' : '', children: budgetSummary.spent != null ? formatIn(budgetSummary.spent, budgetSummary.currency) : formatIn(budgetSummary.expenseBrl, 'BRL') }), hint: budgetSummary.budget != null ? `de ${formatIn(budgetSummary.budget, budgetSummary.currency)}${budgetSummary.pct != null ? ` (${budgetSummary.pct}%)` : ''}` : `${budgetSummary.txCount} ${budgetSummary.txCount === 1 ? 'lançamento' : 'lançamentos'}` })) : (_jsx(Stat, { label: "Marcos", value: steps.filter((s) => s.completed).length, unit: `/ ${steps.length}` }))] }), view === 'Quadro' && _jsx(Board, { project: p, tasks: tasks, steps: steps, data: data, today: today, onOpen: setTaskOpen }), view === 'Marcos' && _jsx(Milestones, { project: p, tasks: tasks, steps: steps, data: data, today: today }), view === 'Notas' && _jsx(ProjectNotes, { project: p, notes: notes.rows, onReload: () => void notes.reload() }), view === 'Custos' && _jsx(ProjectCosts, { project: p, summary: budgetSummary, txs: txs.rows, banks: banks.rows, rates: fx.rates, today: today, onReload: () => void txs.reload(), onEditBudget: () => setEditing(true) }), view === 'Trajetória' && _jsx(Trail, { project: p, tasks: tasks, steps: steps, today: today }), _jsxs("div", { className: "mt-8 flex flex-wrap gap-2 border-t border-line pt-4", children: [p.status !== 'completed' && _jsxs("button", { className: "btn-secondary", onClick: () => data.patchProject(p.id, { status: 'completed' }), children: [_jsx(CheckCircle2, { size: 16, strokeWidth: 1.5 }), "Concluir projeto"] }), _jsx("button", { className: "btn-ghost", onClick: saveAsTemplate, children: "Salvar como modelo" }), _jsx("button", { className: "btn-ghost", onClick: () => { void data.patchProject(p.id, { archived_at: p.archived_at ? null : new Date().toISOString() }); if (!p.archived_at)
                            onBack(); }, children: p.archived_at ? 'Desarquivar' : 'Arquivar' }), _jsx("button", { className: "btn-ghost ml-auto text-negative", onClick: remove, children: "Excluir" })] }), editing && _jsx(ProjectForm, { data: data, project: p, onClose: () => setEditing(false), onSaved: () => setEditing(false) }), taskOpen && _jsx(TaskForm, { task: taskOpen, project: p, steps: steps, data: data, onClose: () => setTaskOpen(null) })] }));
}
// ---------------------------------------------------------------------------
// Board
// ---------------------------------------------------------------------------
function Board({ project, tasks, steps, data, today, onOpen }) {
    const board = kanban(tasks);
    const [over, setOver] = useState(null);
    const [title, setTitle] = useState('');
    const move = (t, c) => { if (columnIndex(t) !== COLUMNS.findIndex((x) => x.key === c))
        void data.patchTask(t.id, moveTo(c, new Date())); };
    const columnIndex = (t) => COLUMNS.findIndex((x) => board[x.key].includes(t));
    async function add(e) {
        e.preventDefault();
        if (!title.trim())
            return;
        const value = title.trim();
        setTitle('');
        await data.addTask(project.id, { title: value });
    }
    return (_jsx("div", { className: "grid gap-4 md:grid-cols-3", children: COLUMNS.map(({ key, label }, ci) => (_jsxs("section", { "aria-label": label, className: `card flex min-h-48 flex-col p-3 transition-colors duration-150 ${over === key ? 'outline outline-1 outline-brand' : ''}`, onDragOver: (e) => { e.preventDefault(); setOver(key); }, onDragLeave: () => setOver(null), onDrop: (e) => {
                e.preventDefault();
                setOver(null);
                const t = tasks.find((x) => x.id === e.dataTransfer.getData('text/plain'));
                if (t)
                    move(t, key);
            }, children: [_jsxs("div", { className: "mb-3 flex items-center gap-2 px-1", children: [_jsx("span", { className: "label mr-auto", children: label }), _jsx("span", { className: "figure text-xs text-fg3", children: board[key].length })] }), _jsx("ul", { className: "space-y-2", children: board[key].map((t) => {
                        const step = steps.find((s) => s.id === t.project_step_id);
                        const day = taskDay(t);
                        return (_jsxs("li", { draggable: true, onDragStart: (e) => { e.dataTransfer.setData('text/plain', t.id); e.dataTransfer.effectAllowed = 'move'; }, className: "cursor-grab rounded-xl border border-line bg-raised/60 p-3 active:cursor-grabbing", children: [_jsx("button", { className: `block w-full text-left text-sm ${t.completed ? 'text-fg3 line-through' : ''}`, onClick: () => onOpen(t), children: t.title }), _jsxs("div", { className: "mt-2 flex items-center gap-2 text-xs text-fg3", children: [_jsx("span", { className: `h-1.5 w-1.5 rounded-full ${DOT[t.priority]}`, title: `Prioridade ${PRIORITY_LABEL[t.priority].toLowerCase()}` }), day && _jsx("span", { className: `figure ${!t.completed && day < today ? 'text-negative' : ''}`, children: short(day) }), step && _jsxs("span", { className: "truncate", children: [_jsx(Flag, { size: 11, strokeWidth: 1.5, className: "mr-0.5 inline" }), step.title] }), _jsxs("span", { className: "ml-auto flex gap-0.5", children: [ci > 0 && _jsx("button", { className: "icon-btn h-6 w-6", onClick: () => move(t, COLUMNS[ci - 1].key), "aria-label": `Mover ${t.title} para ${COLUMNS[ci - 1].label}`, children: _jsx(ChevronLeft, { size: 14, strokeWidth: 1.5 }) }), ci < 2 && _jsx("button", { className: "icon-btn h-6 w-6", onClick: () => move(t, COLUMNS[ci + 1].key), "aria-label": `Mover ${t.title} para ${COLUMNS[ci + 1].label}`, children: ci === 0 ? _jsx(Play, { size: 12, strokeWidth: 1.5 }) : _jsx(ChevronRight, { size: 14, strokeWidth: 1.5 }) })] })] })] }, t.id));
                    }) }), key === 'pending' && (_jsxs("form", { onSubmit: add, className: "mt-2 flex gap-1", children: [_jsx("input", { className: "input py-1.5 text-sm", placeholder: "Nova tarefa", "aria-label": "Nova tarefa do projeto", value: title, onChange: (e) => setTitle(e.target.value) }), _jsx("button", { className: "icon-btn", "aria-label": "Adicionar tarefa", children: _jsx(Plus, { size: 16, strokeWidth: 1.5 }) })] })), board[key].length === 0 && key !== 'pending' && _jsx("p", { className: "px-1 py-6 text-center text-xs text-fg3", children: "Arraste tarefas para c\u00E1" })] }, key))) }));
}
function TaskForm({ task, project, steps, data, onClose }) {
    const [title, setTitle] = useState(task.title ?? '');
    const [description, setDescription] = useState(task.description ?? '');
    const [priority, setPriority] = useState(task.priority ?? 'medium');
    const [day, setDay] = useState(task.due_date ? toDay(new Date(task.due_date)) : '');
    const [stepId, setStepId] = useState(task.project_step_id ?? '');
    async function save(e) {
        e.preventDefault();
        const keepTime = task.due_date && !task.due_all_day && toDay(new Date(task.due_date)) === day;
        const row = {
            title, description: description || null, priority, project_step_id: stepId || null,
            due_date: keepTime ? task.due_date : dueFromDay(day), due_all_day: keepTime ? false : !!day,
        };
        if (task.id)
            void data.patchTask(task.id, row);
        else
            await data.addTask(project.id, row);
        onClose();
    }
    async function remove() {
        if (task.id && confirm('Excluir esta tarefa?') && await write(supabase.from('tasks').delete().eq('id', task.id))) {
            void data.reload();
            onClose();
        }
    }
    return (_jsx(Modal, { title: task.id ? 'Tarefa do projeto' : 'Nova tarefa', onClose: onClose, children: _jsxs("form", { onSubmit: save, children: [_jsx(Field, { label: "T\u00EDtulo", children: _jsx("input", { className: "input", value: title, onChange: (e) => setTitle(e.target.value), required: true, autoFocus: true }) }), _jsx(Field, { label: "Descri\u00E7\u00E3o", children: _jsx("textarea", { className: "input", rows: 3, value: description, onChange: (e) => setDescription(e.target.value) }) }), _jsxs("div", { className: "grid grid-cols-2 gap-2", children: [_jsx(Field, { label: "Data", children: _jsx("input", { className: "input", type: "date", value: day, onChange: (e) => setDay(e.target.value) }) }), _jsx(Field, { label: "Prioridade", children: _jsxs("select", { className: "input", value: priority, onChange: (e) => setPriority(e.target.value), children: [_jsx("option", { value: "high", children: "Alta" }), _jsx("option", { value: "medium", children: "M\u00E9dia" }), _jsx("option", { value: "low", children: "Baixa" })] }) })] }), _jsx(Field, { label: "Marco", children: _jsxs("select", { className: "input", value: stepId, onChange: (e) => setStepId(e.target.value), children: [_jsx("option", { value: "", children: "Nenhum" }), steps.map((s) => _jsx("option", { value: s.id, children: s.title }, s.id))] }) }), _jsx("p", { className: "mb-4 text-xs text-fg3", children: "As tarefas do projeto tamb\u00E9m aparecem em Tarefas e na Agenda quando t\u00EAm data." }), _jsxs("div", { className: "flex gap-2", children: [task.id && _jsx("button", { type: "button", className: "btn-ghost text-negative", onClick: remove, children: "Excluir" }), _jsx("button", { className: "btn-primary ml-auto", children: "Salvar" })] })] }) }));
}
// ---------------------------------------------------------------------------
// Milestones
// ---------------------------------------------------------------------------
function Milestones({ project, tasks, steps, data, today }) {
    const [title, setTitle] = useState('');
    const [due, setDue] = useState('');
    const [editing, setEditing] = useState(null);
    async function add(e) {
        e.preventDefault();
        if (await write(supabase.from('project_steps').insert({ project_id: project.id, title, due_date: due || null, order_index: steps.length }))) {
            setTitle('');
            setDue('');
            void data.steps.reload();
        }
    }
    function swap(i, j) {
        if (j < 0 || j >= steps.length)
            return;
        void data.patchStep(steps[i].id, { order_index: j });
        void data.patchStep(steps[j].id, { order_index: i });
        steps.forEach((s, k) => { if (k !== i && k !== j && s.order_index !== k)
            void data.patchStep(s.id, { order_index: k }); });
    }
    return (_jsxs("div", { className: "grid gap-6 lg:grid-cols-[1fr_340px]", children: [_jsxs("section", { className: "card", "aria-label": "Marcos", children: [steps.length === 0 && _jsx(Empty, { icon: _jsx(Flag, { size: 18, strokeWidth: 1.5 }), children: "Marcos s\u00E3o as etapas do projeto, com data. Adicione o primeiro ao lado." }), _jsx("ol", { className: "relative", children: steps.map((s, i) => {
                            const mine = tasks.filter((t) => t.project_step_id === s.id && !t.is_archived);
                            const late = !s.completed && s.due_date && s.due_date < today;
                            return (_jsxs("li", { className: "relative flex gap-3 pb-5 last:pb-0", children: [i < steps.length - 1 && _jsx("span", { className: "absolute top-6 bottom-0 left-[9px] w-px bg-line", "aria-hidden": true }), _jsx("input", { type: "checkbox", className: "relative mt-0.5 h-5 w-5 shrink-0 accent-[var(--brand)]", checked: s.completed, "aria-label": s.title, onChange: () => data.patchStep(s.id, { completed: !s.completed, completed_at: s.completed ? null : new Date().toISOString() }) }), _jsxs("div", { className: "min-w-0 flex-1", children: [_jsx("button", { className: `text-left text-sm hover:underline ${s.completed ? 'text-fg3 line-through' : ''}`, onClick: () => setEditing(s), children: s.title }), _jsxs("div", { className: "figure text-xs text-fg3", children: [s.due_date ? _jsx("span", { className: late ? 'text-negative' : '', children: sentence(formatDay(s.due_date)) }) : 'sem data', mine.length > 0 && ` · ${mine.filter((t) => t.completed).length}/${mine.length} tarefas`] }), s.description && _jsx("p", { className: "mt-1 text-sm text-fg2", children: s.description })] }), _jsxs("div", { className: "flex shrink-0", children: [_jsx("button", { className: "icon-btn h-7 w-7", disabled: i === 0, onClick: () => swap(i, i - 1), "aria-label": `Subir ${s.title}`, children: _jsx(ArrowUp, { size: 14, strokeWidth: 1.5 }) }), _jsx("button", { className: "icon-btn h-7 w-7", disabled: i === steps.length - 1, onClick: () => swap(i, i + 1), "aria-label": `Descer ${s.title}`, children: _jsx(ArrowDown, { size: 14, strokeWidth: 1.5 }) })] })] }, s.id));
                        }) })] }), _jsxs("form", { className: "card h-fit", onSubmit: add, children: [_jsx("div", { className: "label mb-3", children: "Novo marco" }), _jsx(Field, { label: "T\u00EDtulo do marco", children: _jsx("input", { className: "input", value: title, onChange: (e) => setTitle(e.target.value), required: true }) }), _jsx(Field, { label: "Data do marco (opcional)", children: _jsx("input", { className: "input", type: "date", value: due, onChange: (e) => setDue(e.target.value) }) }), _jsx("button", { className: "btn-primary w-full", children: "Adicionar marco" })] }), editing && _jsx(StepForm, { step: editing, data: data, onClose: () => setEditing(null) })] }));
}
function StepForm({ step, data, onClose }) {
    const [title, setTitle] = useState(step.title);
    const [description, setDescription] = useState(step.description ?? '');
    const [due, setDue] = useState(step.due_date ?? '');
    return (_jsx(Modal, { title: "Editar marco", onClose: onClose, children: _jsxs("form", { onSubmit: (e) => { e.preventDefault(); void data.patchStep(step.id, { title, description: description || null, due_date: due || null }); onClose(); }, children: [_jsx(Field, { label: "T\u00EDtulo", children: _jsx("input", { className: "input", value: title, onChange: (e) => setTitle(e.target.value), required: true, autoFocus: true }) }), _jsx(Field, { label: "Descri\u00E7\u00E3o", children: _jsx("textarea", { className: "input", rows: 2, value: description, onChange: (e) => setDescription(e.target.value) }) }), _jsx(Field, { label: "Data", children: _jsx("input", { className: "input", type: "date", value: due, onChange: (e) => setDue(e.target.value) }) }), _jsxs("div", { className: "flex gap-2", children: [_jsx("button", { type: "button", className: "btn-ghost text-negative", onClick: async () => {
                                if (confirm('Excluir este marco? As tarefas dele continuam no projeto.') && await write(supabase.from('project_steps').delete().eq('id', step.id))) {
                                    void data.reload();
                                    onClose();
                                }
                            }, children: "Excluir" }), _jsx("button", { className: "btn-primary ml-auto", children: "Salvar" })] })] }) }));
}
// ---------------------------------------------------------------------------
// Trajectory
// ---------------------------------------------------------------------------
const KIND = { start: 'Início', task: 'Tarefa concluída', step: 'Marco atingido', due: 'Prazo' };
function Trail({ project, tasks, steps, today }) {
    const weeks = burnup(tasks, today, 8);
    const events = trajectory(project, tasks, steps);
    const upcoming = steps.filter((s) => !s.completed && s.due_date).sort((a, b) => a.due_date.localeCompare(b.due_date));
    return (_jsxs("div", { className: "grid gap-6 lg:grid-cols-[1fr_380px]", children: [_jsxs("div", { className: "space-y-6", children: [_jsx(ColumnChart, { title: "Tarefas feitas (acumulado)", subtitle: "Por semana; a dica mostra o total de tarefas no projeto", points: weeks.map((w) => ({ label: short(w.week), value: w.done, detail: `de ${w.scope} no escopo` })), unit: "tarefas" }), upcoming.length > 0 && (_jsxs("section", { className: "card", children: [_jsx("div", { className: "label mb-3", children: "Pr\u00F3ximos marcos" }), _jsx("ul", { className: "space-y-2 text-sm", children: upcoming.map((s) => {
                                    const d = diffDays(today, s.due_date);
                                    return (_jsxs("li", { className: "flex gap-2", children: [_jsx("span", { className: "mr-auto", children: s.title }), _jsx("span", { className: `figure text-xs ${d < 0 ? 'text-negative' : 'text-fg3'}`, children: d < 0 ? `${-d} dias atrasado` : d === 0 ? 'hoje' : `em ${d} dias` })] }, s.id));
                                }) })] }))] }), _jsxs("section", { className: "card h-fit", "aria-label": "Linha do tempo", children: [_jsx("div", { className: "label mb-3", children: "Linha do tempo" }), _jsx("ol", { className: "space-y-3", children: events.map((e, i) => (_jsxs("li", { className: "flex gap-3 text-sm", children: [_jsx("span", { className: `mt-1.5 h-2 w-2 shrink-0 rounded-full ${e.kind === 'step' ? 'bg-brand' : e.kind === 'start' ? 'bg-fg2' : 'bg-positive'}` }), _jsxs("div", { className: "min-w-0", children: [_jsx("div", { className: "truncate", children: e.title }), _jsxs("div", { className: "text-xs text-fg3", children: [KIND[e.kind], " \u00B7 ", sentence(formatDay(toDay(new Date(e.at))))] })] })] }, i))) })] })] }));
}
// ---------------------------------------------------------------------------
// Notes (Knowledge integration)
// ---------------------------------------------------------------------------
function ProjectNotes({ project, notes, onReload }) {
    const linked = notes.filter((n) => n.project_id === project.id);
    const available = notes.filter((n) => n.project_id !== project.id);
    const [title, setTitle] = useState('');
    const [body, setBody] = useState('');
    const [linkId, setLinkId] = useState('');
    const [saving, setSaving] = useState(false);
    async function createNote(e) {
        e.preventDefault();
        if (!title.trim())
            return;
        setSaving(true);
        const text = body.trim();
        const ok = await write(supabase.from('knowledge_blocks').insert({
            title: title.trim(),
            project_id: project.id,
            content: [newBlock('paragraph', text)],
            content_text: text,
            tags: [],
            importance: 2,
        }));
        setSaving(false);
        if (ok) {
            setTitle('');
            setBody('');
            onReload();
        }
    }
    async function linkExisting(e) {
        e.preventDefault();
        if (!linkId)
            return;
        if (await write(supabase.from('knowledge_blocks').update({ project_id: project.id }).eq('id', linkId))) {
            setLinkId('');
            onReload();
        }
    }
    async function unlink(noteId) {
        if (await write(supabase.from('knowledge_blocks').update({ project_id: null }).eq('id', noteId)))
            onReload();
    }
    return (_jsxs("div", { className: "grid gap-6 lg:grid-cols-[1fr_340px]", children: [_jsxs("section", { className: "card", "aria-label": "Notas do projeto", children: [_jsxs("div", { className: "mb-3 flex items-center gap-2", children: [_jsx("span", { className: "label mr-auto", children: "Notas vinculadas" }), _jsx("span", { className: "figure text-xs text-fg3", children: linked.length })] }), linked.length === 0 ? (_jsx(Empty, { icon: _jsx(BookOpen, { size: 18, strokeWidth: 1.5 }), children: "Nenhuma nota vinculada ainda. Crie uma nota do projeto ou conecte uma nota existente do Conhecimento." })) : (_jsx("ul", { className: "divide-y divide-line", children: linked.map((n) => (_jsxs("li", { className: "flex items-start gap-3 py-3 first:pt-0 last:pb-0", children: [_jsxs(Link, { to: `/conhecimento?nota=${n.id}`, className: "group min-w-0 flex-1 rounded-lg focus-visible:ring-2 focus-visible:ring-brand", children: [_jsxs("div", { className: "flex items-center gap-1.5 font-medium group-hover:underline", children: [_jsx("span", { className: "truncate", children: n.title }), _jsx(ArrowUpRight, { size: 14, strokeWidth: 1.6, "aria-hidden": "true", className: "shrink-0 text-fg3" })] }), n.content_text && _jsx("p", { className: "mt-0.5 line-clamp-2 text-xs text-fg3", children: excerpt(n.content_text, 160) }), _jsxs("div", { className: "mt-1 text-[11px] text-fg3", children: ["Atualizada em ", short(toDay(new Date(n.updated_at)))] })] }), _jsx("button", { type: "button", className: "icon-btn h-8 w-8 shrink-0", onClick: () => void unlink(n.id), "aria-label": `Desvincular nota ${n.title}`, title: "Desvincular do projeto", children: _jsx(Unlink, { size: 14, strokeWidth: 1.5 }) })] }, n.id))) }))] }), _jsxs("div", { className: "space-y-4", children: [_jsxs("form", { className: "card", onSubmit: createNote, children: [_jsx("div", { className: "label mb-3", children: "Nova nota do projeto" }), _jsx(Field, { label: "T\u00EDtulo", children: _jsx("input", { className: "input", placeholder: "Ex.: Decis\u00F5es de arquitetura, Lista de fornecedores\u2026", value: title, onChange: (e) => setTitle(e.target.value), required: true }) }), _jsx(Field, { label: "Texto inicial (opcional)", children: _jsx("textarea", { className: "input", rows: 3, value: body, onChange: (e) => setBody(e.target.value) }) }), _jsx("button", { className: "btn-primary w-full", disabled: saving, children: saving ? 'Criando…' : 'Criar e vincular' })] }), available.length > 0 && (_jsxs("form", { className: "card", onSubmit: linkExisting, children: [_jsx("div", { className: "label mb-3", children: "Vincular nota existente" }), _jsx(Field, { label: "Nota do Conhecimento", children: _jsxs("select", { className: "input", value: linkId, onChange: (e) => setLinkId(e.target.value), required: true, children: [_jsx("option", { value: "", children: "Escolha uma nota" }), available.map((n) => _jsx("option", { value: n.id, children: n.title }, n.id))] }) }), _jsxs("button", { className: "btn-secondary w-full", children: [_jsx(Link2, { size: 15, strokeWidth: 1.5 }), "Vincular nota"] })] }))] })] }));
}
// ---------------------------------------------------------------------------
// Costs & Budget (Finance integration)
// ---------------------------------------------------------------------------
function ProjectCosts({ project, summary, txs, banks, rates, today, onReload, onEditBudget, }) {
    const linked = txs.filter((t) => t.project_id === project.id);
    const recentUnlinked = txs.filter((t) => !t.project_id).slice(0, 40);
    const [description, setDescription] = useState('');
    const [amount, setAmount] = useState('');
    const [currency, setCurrency] = useState(summary.currency);
    const [date, setDate] = useState(today);
    const [category, setCategory] = useState('Compras');
    const [bankId, setBankId] = useState(banks[0]?.id ?? '');
    const [linkTxId, setLinkTxId] = useState('');
    const [saving, setSaving] = useState(false);
    async function addCost(e) {
        e.preventDefault();
        const raw = Number(amount.replace(',', '.'));
        if (!Number.isFinite(raw) || raw <= 0)
            return;
        let amountBrl = raw;
        let fxRate = null;
        let originalAmount = null;
        if (currency !== 'BRL') {
            const q = rates?.[currency];
            if (!q || q <= 0) {
                alert('Cotação indisponível no momento. Registre em R$ ou pela aba Finanças.');
                return;
            }
            fxRate = q;
            originalAmount = raw;
            amountBrl = toBRL(raw, q);
        }
        setSaving(true);
        const ok = await write(supabase.from('transactions').insert({
            type: 'expense',
            description: description.trim(),
            amount: amountBrl,
            currency,
            original_amount: originalAmount,
            fx_rate: fxRate,
            date,
            category: category || null,
            payment_method: 'pix',
            bank_id: bankId || null,
            is_pending: false,
            project_id: project.id,
        }));
        setSaving(false);
        if (ok) {
            setDescription('');
            setAmount('');
            onReload();
        }
    }
    async function linkExistingTx(e) {
        e.preventDefault();
        if (!linkTxId)
            return;
        if (await write(supabase.from('transactions').update({ project_id: project.id }).eq('id', linkTxId))) {
            setLinkTxId('');
            onReload();
        }
    }
    async function unlinkTx(id) {
        if (await write(supabase.from('transactions').update({ project_id: null }).eq('id', id)))
            onReload();
    }
    return (_jsxs("div", { className: "grid gap-6 lg:grid-cols-[1fr_340px]", children: [_jsxs("div", { className: "space-y-4", children: [_jsxs("section", { className: "card", children: [_jsxs("div", { className: "mb-3 flex flex-wrap items-center gap-2", children: [_jsx("span", { className: "label mr-auto", children: "Resumo financeiro" }), _jsx("button", { type: "button", className: "btn-ghost h-8 text-xs", onClick: onEditBudget, children: summary.budget != null ? 'Ajustar orçamento' : 'Definir orçamento' })] }), _jsxs("div", { className: "grid grid-cols-2 gap-4 sm:grid-cols-3", children: [_jsx(Stat, { label: "Total gasto", value: _jsx("span", { className: summary.overBudget ? 'text-negative' : '', children: summary.spent != null ? formatIn(summary.spent, summary.currency) : formatIn(summary.expenseBrl, 'BRL') }), hint: summary.currency !== 'BRL' && summary.expenseBrl > 0 ? `≈ ${formatIn(summary.expenseBrl, 'BRL')}` : undefined, accent: true }), _jsx(Stat, { label: "Or\u00E7amento", value: summary.budget != null ? formatIn(summary.budget, summary.currency) : '—', hint: summary.pct != null ? (summary.overBudget ? `${summary.pct}% (acima do limite)` : `${summary.pct}% utilizado`) : 'sem teto definido' }), _jsx(Stat, { label: "Entradas / reembolsos", value: summary.incomeBrl > 0 ? formatIn(summary.incomeBrl, 'BRL') : '—', hint: `${summary.txCount} ${summary.txCount === 1 ? 'lançamento' : 'lançamentos'}` })] }), summary.budget != null && summary.pct != null && (_jsx("div", { className: "mt-4", children: _jsx("div", { className: "h-2 overflow-hidden rounded-full bg-raised", role: "progressbar", "aria-valuenow": Math.min(100, summary.pct), "aria-valuemin": 0, "aria-valuemax": 100, "aria-label": "Uso do or\u00E7amento", children: _jsx("div", { className: `h-full rounded-full ${summary.overBudget ? 'bg-negative' : 'bg-brand'}`, style: { width: `${Math.min(100, summary.pct)}%` } }) }) }))] }), _jsxs("section", { className: "card", "aria-label": "Lan\u00E7amentos do projeto", children: [_jsxs("div", { className: "mb-3 flex items-center gap-2", children: [_jsx("span", { className: "label mr-auto", children: "Lan\u00E7amentos vinculados" }), _jsx("span", { className: "figure text-xs text-fg3", children: linked.length })] }), linked.length === 0 ? (_jsx(Empty, { icon: _jsx(Wallet, { size: 18, strokeWidth: 1.5 }), children: "Nenhum custo vinculado. Registre um gasto ao lado ou marque este projeto ao lan\u00E7ar em Finan\u00E7as." })) : (_jsx("ul", { className: "divide-y divide-line", children: linked.map((t) => (_jsxs("li", { className: "flex items-center gap-3 py-2.5 text-sm", children: [_jsx("span", { className: "figure w-12 shrink-0 text-xs text-fg3", children: short(t.date) }), _jsxs("div", { className: "min-w-0 flex-1", children: [_jsx("div", { className: "truncate font-medium", children: t.description }), t.category && _jsx("div", { className: "text-xs text-fg3", children: t.category })] }), _jsxs("span", { className: `figure shrink-0 text-sm ${t.type === 'income' ? 'text-positive' : ''}`, children: [t.type === 'income' ? '+' : '−', t.currency && t.currency !== 'BRL' && t.original_amount != null
                                                    ? formatIn(Number(t.original_amount), t.currency)
                                                    : formatIn(Number(t.amount), 'BRL')] }), _jsx("button", { type: "button", className: "icon-btn h-7 w-7 shrink-0", onClick: () => void unlinkTx(t.id), "aria-label": `Desvincular ${t.description}`, title: "Desvincular do projeto", children: _jsx(Unlink, { size: 14, strokeWidth: 1.5 }) })] }, t.id))) }))] })] }), _jsxs("div", { className: "space-y-4", children: [_jsxs("form", { className: "card", onSubmit: addCost, children: [_jsx("div", { className: "label mb-3", children: "Registrar custo do projeto" }), _jsx(Field, { label: "Descri\u00E7\u00E3o", children: _jsx("input", { className: "input", placeholder: "Ex.: Dom\u00EDnio, passagem, material\u2026", value: description, onChange: (e) => setDescription(e.target.value), required: true }) }), _jsxs("div", { className: "grid grid-cols-2 gap-2", children: [_jsx(Field, { label: `Valor (${symbolOf(currency)})`, children: _jsx("input", { className: "input figure", inputMode: "decimal", value: amount, onChange: (e) => setAmount(e.target.value), required: true }) }), _jsx(FieldGroup, { label: "Moeda", children: _jsx("div", { className: "segmented w-full", children: CURRENCIES.map((c) => (_jsx("button", { type: "button", className: `flex-1 ${currency === c.code ? 'tab-active' : 'tab'}`, "aria-pressed": currency === c.code, onClick: () => setCurrency(c.code), children: c.symbol }, c.code))) }) })] }), _jsxs("div", { className: "grid grid-cols-2 gap-2", children: [_jsx(Field, { label: "Data", children: _jsx("input", { className: "input", type: "date", value: date, onChange: (e) => setDate(e.target.value), required: true }) }), _jsx(Field, { label: "Categoria", children: _jsx("select", { className: "input", value: category, onChange: (e) => setCategory(e.target.value), children: EXPENSE_CATEGORIES.map((c) => _jsx("option", { value: c, children: c }, c)) }) })] }), banks.length > 0 && (_jsx(Field, { label: "Conta", children: _jsxs("select", { className: "input", value: bankId, onChange: (e) => setBankId(e.target.value), children: [_jsx("option", { value: "", children: "Nenhuma" }), banks.map((b) => _jsx("option", { value: b.id, children: b.name }, b.id))] }) })), _jsx("button", { className: "btn-primary w-full", disabled: saving, children: saving ? 'Salvando…' : 'Registrar custo' })] }), recentUnlinked.length > 0 && (_jsxs("form", { className: "card", onSubmit: linkExistingTx, children: [_jsx("div", { className: "label mb-3", children: "Vincular lan\u00E7amento existente" }), _jsx(Field, { label: "Lan\u00E7amentos recentes", children: _jsxs("select", { className: "input", value: linkTxId, onChange: (e) => setLinkTxId(e.target.value), required: true, children: [_jsx("option", { value: "", children: "Escolha um lan\u00E7amento" }), recentUnlinked.map((t) => (_jsxs("option", { value: t.id, children: [short(t.date), " \u00B7 ", t.description, " (", formatIn(Number(t.amount), 'BRL'), ")"] }, t.id)))] }) }), _jsxs("button", { className: "btn-secondary w-full", children: [_jsx(Link2, { size: 15, strokeWidth: 1.5 }), "Vincular lan\u00E7amento"] })] }))] })] }));
}
