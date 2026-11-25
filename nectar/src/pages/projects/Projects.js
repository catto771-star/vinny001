import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { FolderKanban, LayoutTemplate, Plus, Trash2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { write } from '../../lib/useTable';
import { addDays, toDay } from '../../lib/dates';
import { HEALTH_LABEL, STATUS_LABEL, burnup, fromTemplate, projectHealth, projectProgress, projectUpcomingPlan, } from '../../lib/projects';
import { ColumnChart, DonutChart, RankedBars } from '../../components/Charts';
import { CURRENCIES, formatIn, symbolOf } from '../../lib/money';
import { Empty, Field, FieldGroup, ListSkeleton, Modal, PageHeader, Stat } from '../../components/ui';
import { useProjects } from './useProjects';
import ProjectView from './ProjectView';
const TABS = ['Projetos', 'Análise', 'Modelos'];
const FILTERS = ['Em andamento', 'Pausados', 'Concluídos', 'Arquivados'];
export const HEALTH_TONE = {
    late: 'text-negative', risk: 'text-warning', ok: 'text-positive', done: 'text-fg3', open: 'text-fg3',
};
const short = (day) => `${Number(day.slice(8))}/${day.slice(5, 7)}`;
export default function Projects() {
    const data = useProjects();
    const [params, setParams] = useSearchParams();
    const [tab, setTab] = useState('Projetos');
    const [filter, setFilter] = useState('Em andamento');
    const [creating, setCreating] = useState(null);
    const today = toDay(new Date());
    const openId = params.get('p');
    const open = data.projects.rows.find((p) => p.id === openId);
    const real = data.projects.rows.filter((p) => !p.is_template);
    const templates = data.projects.rows.filter((p) => p.is_template);
    const loading = data.projects.loading || data.tasks.loading;
    if (open)
        return _jsx(ProjectView, { project: open, data: data, today: today, onBack: () => setParams({}) });
    const shown = real.filter((p) => {
        if (filter === 'Arquivados')
            return !!p.archived_at;
        if (p.archived_at)
            return false;
        if (filter === 'Pausados')
            return p.status === 'paused';
        if (filter === 'Concluídos')
            return p.status === 'completed';
        return p.status === 'active' || p.status === 'planning';
    });
    const summary = real.filter((p) => !p.archived_at).map((p) => {
        const prog = projectProgress(data.tasksOf(p.id), data.stepsOf(p.id));
        return { p, prog, ...projectHealth(p, prog.pct, today) };
    });
    const going = summary.filter((s) => s.p.status === 'active' || s.p.status === 'planning');
    const openTasksCount = going.reduce((n, s) => n + data.tasksOf(s.p.id).filter((t) => !t.completed && !t.is_archived).length, 0);
    const riskCount = going.filter((s) => s.health === 'late' || s.health === 'risk').length;
    const doneCount = summary.filter((s) => s.p.status === 'completed').length;
    return (_jsxs(_Fragment, { children: [_jsx(PageHeader, { title: "Projetos", subtitle: `${going.length} em andamento`, tabs: TABS, tab: tab, onTab: (t) => setTab(t), action: _jsxs("button", { className: "btn-primary", onClick: () => setCreating({}), children: [_jsx(Plus, { size: 16, strokeWidth: 1.5 }), "Novo projeto"] }) }), data.projects.error && _jsx("p", { className: "mb-4 text-sm text-negative", children: data.projects.error }), loading && _jsx(ListSkeleton, { rows: 4 }), tab === 'Projetos' && !loading && (_jsxs(_Fragment, { children: [_jsxs("div", { className: "mb-6 grid grid-cols-2 gap-4 xl:grid-cols-4", children: [_jsxs("div", { className: "card", children: [_jsx("div", { className: "label", children: "Em andamento" }), _jsx("div", { className: "figure mt-3 text-[28px] leading-none font-medium text-fg", children: going.length })] }), _jsxs("div", { className: "card", children: [_jsx("div", { className: "label", children: "Subetapas abertas" }), _jsx("div", { className: "figure mt-3 text-[28px] leading-none font-medium text-fg", children: openTasksCount })] }), _jsxs("div", { className: "card", children: [_jsx("div", { className: "label", children: "Em risco ou atraso" }), _jsx("div", { className: `figure mt-3 text-[28px] leading-none font-medium ${riskCount > 0 ? 'text-warning' : 'text-fg'}`, children: riskCount })] }), _jsxs("div", { className: "card", children: [_jsx("div", { className: "label", children: "Conclu\u00EDdos" }), _jsx("div", { className: "figure mt-3 text-[28px] leading-none font-medium text-fg", children: doneCount })] })] }), _jsx("div", { className: "segmented mb-6 w-fit max-w-full overflow-x-auto", role: "tablist", "aria-label": "Filtro", children: FILTERS.map((f) => _jsx("button", { role: "tab", "aria-selected": f === filter, className: f === filter ? 'tab-active' : 'tab', onClick: () => setFilter(f), children: f }, f)) }), shown.length === 0 && (_jsx("div", { className: "card", children: _jsx(Empty, { icon: _jsx(FolderKanban, { size: 18, strokeWidth: 1.5 }), action: filter === 'Em andamento' ? _jsx("button", { className: "btn-secondary", onClick: () => setCreating({}), children: "Novo projeto" }) : undefined, children: filter === 'Em andamento' ? 'Nenhum projeto em andamento' : `Nenhum projeto em ${filter.toLowerCase()}` }) })), _jsx("ul", { className: "grid gap-4 md:grid-cols-2 xl:grid-cols-3", children: shown.map((p) => _jsx(ProjectCard, { project: p, data: data, today: today, onOpen: () => setParams({ p: p.id }) }, p.id)) })] })), tab === 'Análise' && !loading && _jsx(Analysis, { data: data, today: today }), tab === 'Modelos' && !loading && (_jsxs(_Fragment, { children: [_jsx("p", { className: "mb-4 max-w-2xl text-sm text-fg2", children: "Um modelo guarda os marcos (com a dist\u00E2ncia em dias do in\u00EDcio) e as tarefas de um projeto. Para criar um, abra um projeto e use \"Salvar como modelo\"." }), templates.length === 0 && _jsx("div", { className: "card", children: _jsx(Empty, { icon: _jsx(LayoutTemplate, { size: 18, strokeWidth: 1.5 }), children: "Nenhum modelo ainda" }) }), _jsx("ul", { className: "grid gap-4 md:grid-cols-2", children: templates.map((t) => (_jsxs("li", { className: "card", children: [_jsxs("div", { className: "mb-1 flex items-center gap-2", children: [_jsx("span", { className: "h-2 w-2 rounded-full", style: { background: t.color } }), _jsx("span", { className: "mr-auto font-medium", children: t.name }), _jsx("button", { className: "icon-btn", "aria-label": `Excluir modelo ${t.name}`, onClick: async () => {
                                                if (confirm('Excluir este modelo?') && await write(supabase.from('projects').delete().eq('id', t.id)))
                                                    void data.reload();
                                            }, children: _jsx(Trash2, { size: 16, strokeWidth: 1.5 }) })] }), _jsxs("p", { className: "mb-3 text-sm text-fg3", children: [data.stepsOf(t.id).length, " marcos \u00B7 ", t.template_tasks.length, " tarefas"] }), _jsx("ul", { className: "mb-4 space-y-1 text-sm text-fg2", children: data.stepsOf(t.id).map((s) => _jsxs("li", { children: [s.title, s.offset_days != null && _jsxs("span", { className: "figure text-fg3", children: [" \u00B7 dia ", s.offset_days] })] }, s.id)) }), _jsx("button", { className: "btn-secondary", onClick: () => setCreating({ template: t }), children: "Usar modelo" })] }, t.id))) })] })), creating && (_jsx(ProjectForm, { data: data, templates: templates, template: creating.template, onClose: () => setCreating(null), onSaved: (id) => { setCreating(null); setParams({ p: id }); } }))] }));
}
function ProjectCard({ project: p, data, today, onOpen }) {
    const steps = data.stepsOf(p.id);
    const tasks = data.tasksOf(p.id);
    const prog = projectProgress(tasks, steps);
    const { health } = projectHealth(p, prog.pct, today);
    const plan = projectUpcomingPlan(steps, tasks, 2, 2, 3);
    const hasUpcoming = plan.nextSteps.length > 0 || plan.looseSubsteps.length > 0;
    return (_jsx("li", { className: "min-w-0", children: _jsxs("button", { type: "button", className: "card glow flex h-full w-full min-w-0 flex-col p-5 text-left", onClick: onOpen, children: [_jsxs("div", { className: "mb-4 flex w-full items-center justify-between gap-2 text-xs", children: [_jsxs("span", { className: "inline-flex min-w-0 items-center gap-2 text-fg3", children: [_jsx("span", { className: "h-2 w-2 shrink-0 rounded-full", style: { background: p.color }, "aria-hidden": "true" }), _jsx("span", { className: "truncate", children: p.due_date ? `Prazo ${short(p.due_date)}` : 'Sem prazo' })] }), _jsx("span", { className: `shrink-0 font-medium ${p.status === 'paused' ? 'text-fg3' : HEALTH_TONE[health]}`, children: p.status === 'paused' ? STATUS_LABEL.paused : HEALTH_LABEL[health] })] }), _jsx("h3", { className: "w-full truncate text-[15px] leading-6 font-medium text-fg", children: p.name }), p.description && _jsx("p", { className: "mt-1 line-clamp-2 w-full text-xs leading-5 text-fg3", children: p.description }), _jsxs("div", { className: "mt-4 w-full", children: [_jsxs("div", { className: "mb-2 flex items-center gap-3", children: [_jsx("div", { className: "h-1 flex-1 overflow-hidden rounded-full bg-raised", role: "progressbar", "aria-valuenow": prog.pct, "aria-valuemin": 0, "aria-valuemax": 100, "aria-label": `Progresso de ${p.name}`, children: _jsx("div", { className: "meter-fill h-full rounded-full", style: { width: `${Math.max(prog.pct, prog.total > 0 ? 3 : 0)}%`, background: p.color } }) }), _jsxs("span", { className: "figure shrink-0 text-xs font-medium text-fg", children: [prog.pct, "%"] })] }), _jsxs("div", { className: "flex items-center justify-between text-xs text-fg3", children: [_jsx("span", { children: prog.total === 0 ? 'Sem etapas cadastradas' : prog.by === 'steps' ? `${prog.done} de ${prog.total} etapas` : `${prog.done} de ${prog.total} subetapas` }), p.budget != null && _jsx("span", { className: "figure", children: formatIn(Number(p.budget), p.budget_currency ?? 'BRL') })] })] }), _jsxs("div", { className: "mt-4 w-full flex-1 border-t border-line pt-4", children: [_jsxs("div", { className: "mb-2 flex items-center justify-between", children: [_jsx("span", { className: "text-xs font-medium text-fg2", children: "Pr\u00F3ximas etapas e subetapas" }), (plan.remainingSteps > 0 || plan.remainingTasks > 0) && (_jsxs("span", { className: "figure text-xs text-fg3", children: [plan.remainingSteps > 0 ? `${plan.remainingSteps} et.` : '', plan.remainingSteps > 0 && plan.remainingTasks > 0 ? ' · ' : '', plan.remainingTasks > 0 ? `${plan.remainingTasks} sub.` : ''] }))] }), !hasUpcoming ? (_jsx("div", { className: "rounded-[8px] border border-line bg-sunken/60 px-3 py-2 text-xs text-fg3", children: prog.total > 0 && prog.pct >= 100
                                ? 'Todas as etapas e subetapas concluídas'
                                : 'Abrir para cadastrar etapas e subetapas' })) : (_jsxs("div", { className: "space-y-2", children: [plan.nextSteps.map((item) => (_jsxs("div", { className: "rounded-[8px] border border-line bg-sunken/60 p-3", children: [_jsxs("div", { className: "flex items-center gap-2 text-xs font-medium text-fg", children: [_jsx("span", { className: "h-1.5 w-1.5 shrink-0 rounded-full", style: { background: p.color }, "aria-hidden": "true" }), _jsx("span", { className: "min-w-0 flex-1 truncate", children: item.step.title }), item.step.due_date && _jsx("span", { className: "figure shrink-0 text-xs text-fg3", children: short(item.step.due_date) }), item.totalSubsteps > 0 && (_jsxs("span", { className: "figure shrink-0 text-xs text-fg3", children: [item.doneSubsteps, "/", item.totalSubsteps] }))] }), item.substeps.length > 0 && (_jsx("ul", { className: "mt-2 space-y-1 border-l border-line-strong pl-3", children: item.substeps.map((sub) => (_jsxs("li", { className: "flex items-center gap-2 text-xs text-fg2", children: [_jsx("span", { className: `h-1.5 w-1.5 shrink-0 rounded-full ${sub.status === 'in_progress' ? 'bg-warning' : 'bg-fg3/50'}`, "aria-hidden": "true" }), _jsx("span", { className: "truncate", children: sub.title })] }, sub.id))) }))] }, item.step.id))), plan.looseSubsteps.length > 0 && (_jsx("ul", { className: "space-y-1.5 rounded-[8px] border border-line bg-sunken/60 p-3", children: plan.looseSubsteps.map((sub) => (_jsxs("li", { className: "flex items-center gap-2 text-xs text-fg2", children: [_jsx("span", { className: `h-1.5 w-1.5 shrink-0 rounded-full ${sub.status === 'in_progress' ? 'bg-warning' : sub.priority === 'high' ? 'bg-negative' : 'bg-fg3/50'}`, "aria-hidden": "true" }), _jsx("span", { className: "min-w-0 flex-1 truncate", children: sub.title })] }, sub.id))) }))] }))] })] }) }));
}
function Analysis({ data, today }) {
    const live = data.projects.rows.filter((p) => !p.is_template && !p.archived_at);
    const allTasks = live.flatMap((p) => data.tasksOf(p.id));
    const weeks = burnup(allTasks, today, 12);
    const doneIn = (from) => allTasks.filter((t) => {
        const d = t.completed && t.completed_at ? toDay(new Date(t.completed_at)) : null;
        return d !== null && d >= from && d <= addDays(from, 6);
    }).length;
    const perWeek = weeks.map((w) => ({ label: short(w.week), value: doneIn(w.week), detail: `${w.done} de ${w.scope} feitas até aqui` }));
    const rows = live.filter((p) => p.status !== 'completed').map((p) => {
        const prog = projectProgress(data.tasksOf(p.id), data.stepsOf(p.id));
        const h = projectHealth(p, prog.pct, today);
        return { label: p.name, value: prog.pct, detail: h.expected != null ? `${HEALTH_LABEL[h.health].toLowerCase()} · esperado ${h.expected}%` : HEALTH_LABEL[h.health].toLowerCase() };
    }).sort((a, b) => b.value - a.value);
    const counts = Object.keys(STATUS_LABEL).map((s) => ({ s, n: live.filter((p) => p.status === s).length }));
    if (!live.length)
        return _jsx("div", { className: "card", children: _jsx(Empty, { icon: _jsx(FolderKanban, { size: 18, strokeWidth: 1.5 }), children: "Crie um projeto para ver a an\u00E1lise" }) });
    return (_jsxs("div", { className: "grid gap-6 lg:grid-cols-2", children: [_jsx("div", { className: "card grid grid-cols-2 gap-4 sm:grid-cols-4 lg:col-span-2", children: counts.map(({ s, n }) => _jsx(Stat, { label: STATUS_LABEL[s], value: n }, s)) }), _jsx(ColumnChart, { title: "Tarefas conclu\u00EDdas por semana", subtitle: "Todos os projetos, \u00FAltimas 12 semanas", points: perWeek, unit: "tarefas" }), _jsx(DonutChart, { title: "Projetos por status", subtitle: "Distribui\u00E7\u00E3o atual da carteira", centerLabel: "Projetos", format: (n) => String(Math.round(n)), rows: counts.map(({ s, n }) => ({ label: STATUS_LABEL[s], value: n })) }), _jsxs("section", { className: "card lg:col-span-2", children: [_jsxs("div", { className: "mb-4", children: [_jsx("div", { className: "font-medium", children: "Progresso por projeto" }), _jsx("div", { className: "text-[13px] leading-5 text-fg3", children: "Comparado ao tempo j\u00E1 passado at\u00E9 o prazo" })] }), rows.length ? _jsx(RankedBars, { rows: rows, unit: "%", format: (n) => String(Math.round(n)) }) : _jsx("p", { className: "text-sm text-fg3", children: "Nenhum projeto aberto." })] })] }));
}
const COLORS = ['#ea580c', '#0ea5e9', '#22c55e', '#a855f7', '#eab308', '#ec4899', '#64748b'];
export function ProjectForm({ data, project, templates = [], template, onClose, onSaved }) {
    const [name, setName] = useState(project?.name ?? '');
    const [description, setDescription] = useState(project?.description ?? '');
    const [status, setStatus] = useState(project?.status ?? 'active');
    const [priority, setPriority] = useState(project?.priority ?? 'medium');
    const [start, setStart] = useState(project?.start_date ?? toDay(new Date()));
    const [due, setDue] = useState(project?.due_date ?? '');
    const [budget, setBudget] = useState(project?.budget != null ? String(project.budget) : '');
    const [budgetCurrency, setBudgetCurrency] = useState(project?.budget_currency ?? 'BRL');
    const [color, setColor] = useState(project?.color ?? template?.color ?? COLORS[0]);
    const [templateId, setTemplateId] = useState(template?.id ?? '');
    const [saving, setSaving] = useState(false);
    async function save(e) {
        e.preventDefault();
        setSaving(true);
        const parsedBudget = budget.trim() ? Number(budget.replace(',', '.')) : null;
        const row = {
            name, description: description || null, status, priority, start_date: start, due_date: due || null, color,
            budget: parsedBudget != null && Number.isFinite(parsedBudget) ? parsedBudget : null,
            budget_currency: budgetCurrency,
        };
        if (project) {
            await data.patchProject(project.id, row);
            onSaved(project.id);
            return;
        }
        const { data: created, error } = await supabase.from('projects').insert(row).select('id').single();
        if (error || !created) {
            alert(`Não foi possível salvar: ${error?.message}`);
            setSaving(false);
            return;
        }
        const tpl = templates.find((t) => t.id === templateId);
        if (tpl) {
            const plan = fromTemplate(tpl, data.stepsOf(tpl.id), start);
            const { data: steps } = plan.steps.length
                ? await supabase.from('project_steps').insert(plan.steps.map((s) => ({ ...s, project_id: created.id }))).select('id,order_index')
                : { data: [] };
            const stepId = (i) => (i == null ? null : steps?.find((s) => s.order_index === i)?.id ?? null);
            if (plan.tasks.length) {
                const { data: tasks } = await supabase.from('tasks')
                    .insert(plan.tasks.map((t) => ({ title: t.title, description: t.description, priority: t.priority, project_step_id: stepId(t.step) }))).select('id');
                if (tasks?.length)
                    await write(supabase.from('project_tasks').insert(tasks.map((t, position) => ({ project_id: created.id, task_id: t.id, position }))));
            }
        }
        await data.reload();
        onSaved(created.id);
    }
    return (_jsx(Modal, { title: project ? 'Editar projeto' : 'Novo projeto', onClose: onClose, children: _jsxs("form", { onSubmit: save, children: [!project && templates.length > 0 && (_jsx(Field, { label: "A partir de um modelo", children: _jsxs("select", { className: "input", value: templateId, onChange: (e) => setTemplateId(e.target.value), children: [_jsx("option", { value: "", children: "Em branco" }), templates.map((t) => _jsx("option", { value: t.id, children: t.name }, t.id))] }) })), _jsx(Field, { label: "Nome", children: _jsx("input", { className: "input", value: name, onChange: (e) => setName(e.target.value), required: true, autoFocus: true }) }), _jsx(Field, { label: "Descri\u00E7\u00E3o", children: _jsx("textarea", { className: "input", rows: 2, value: description, onChange: (e) => setDescription(e.target.value) }) }), _jsxs("div", { className: "grid grid-cols-2 gap-2", children: [_jsx(Field, { label: "In\u00EDcio", children: _jsx("input", { className: "input", type: "date", value: start, onChange: (e) => setStart(e.target.value), required: true }) }), _jsx(Field, { label: "Prazo (opcional)", children: _jsx("input", { className: "input", type: "date", value: due, min: start, onChange: (e) => setDue(e.target.value) }) }), _jsx(Field, { label: "Situa\u00E7\u00E3o", children: _jsx("select", { className: "input", value: status, onChange: (e) => setStatus(e.target.value), children: Object.keys(STATUS_LABEL).map((s) => _jsx("option", { value: s, children: STATUS_LABEL[s] }, s)) }) }), _jsx(Field, { label: "Prioridade", children: _jsxs("select", { className: "input", value: priority, onChange: (e) => setPriority(e.target.value), children: [_jsx("option", { value: "high", children: "Alta" }), _jsx("option", { value: "medium", children: "M\u00E9dia" }), _jsx("option", { value: "low", children: "Baixa" })] }) })] }), _jsxs("div", { className: "grid grid-cols-2 gap-2", children: [_jsx(Field, { label: `Orçamento (${symbolOf(budgetCurrency)}, opcional)`, children: _jsx("input", { className: "input figure", inputMode: "decimal", placeholder: "Ex.: 2500", value: budget, onChange: (e) => setBudget(e.target.value) }) }), _jsx(FieldGroup, { label: "Moeda do or\u00E7amento", children: _jsx("div", { className: "segmented w-full", children: CURRENCIES.map((c) => (_jsx("button", { type: "button", className: `flex-1 ${budgetCurrency === c.code ? 'tab-active' : 'tab'}`, "aria-pressed": budgetCurrency === c.code, onClick: () => setBudgetCurrency(c.code), children: c.symbol }, c.code))) }) })] }), _jsxs("div", { className: "mb-4", role: "group", "aria-label": "Cor", children: [_jsx("span", { className: "mb-1.5 block text-[13px] leading-5 text-fg2", children: "Cor" }), _jsx("div", { className: "flex gap-2", children: COLORS.map((c) => (_jsx("button", { type: "button", "aria-label": `Cor ${c}`, "aria-pressed": c === color, onClick: () => setColor(c), className: `h-7 w-7 rounded-full ${c === color ? 'ring-2 ring-fg ring-offset-2 ring-offset-surface' : ''}`, style: { background: c } }, c))) })] }), _jsx("button", { className: "btn-primary w-full", disabled: saving, children: saving ? 'Salvando…' : 'Salvar' })] }) }));
}
