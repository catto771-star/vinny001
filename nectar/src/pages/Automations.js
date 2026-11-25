import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useState } from 'react';
import { Bell, Bot, CheckSquare, Play, Plus, Sunrise, Workflow } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useTable, write } from '../lib/useTable';
import { ACTION_LABEL, PRESETS, nextRun, runTimeText, scheduleText } from '../lib/automations';
import { Empty, Field, FieldGroup, ListSkeleton, Modal, PageHeader, WeekdayPicker } from '../components/ui';
const TABS = ['Automações', 'Histórico'];
const ICON = { briefing: Sunrise, task: CheckSquare, reminder: Bell, ai: Bot };
const STATUS = {
    ok: { label: 'Feito', tone: 'text-positive' }, waiting_ai: { label: 'Na fila da IA', tone: 'text-brand-ink' },
    running: { label: 'A IA está respondendo', tone: 'text-brand-ink' }, error: { label: 'Erro', tone: 'text-negative' },
};
const when = runTimeText;
export default function Automations() {
    const [tab, setTab] = useState('Automações');
    const automations = useTable('automations', '*', { column: 'time_of_day' });
    const runs = useTable('automation_runs', 'id,automation_id,ran_at,status,output', { column: 'ran_at', ascending: false });
    const [editing, setEditing] = useState(null);
    const [running, setRunning] = useState(null);
    const now = new Date();
    const titleOf = (id) => automations.rows.find((a) => a.id === id)?.title ?? 'Automação excluída';
    async function toggle(a) {
        automations.setRows((rows) => rows.map((x) => (x.id === a.id ? { ...x, is_active: !a.is_active } : x)));
        await write(supabase.from('automations').update({ is_active: !a.is_active }).eq('id', a.id));
    }
    async function runNow(a) {
        setRunning(a.id);
        const { error } = await supabase.rpc('run_automation_now', { p_id: a.id });
        if (error)
            alert(`Não foi possível rodar: ${error.message}`);
        else if (a.action === 'ai') {
            // The request waits for the AI: show it waiting, then ask the assistant to answer now.
            await runs.reload();
            await supabase.functions.invoke('assistant', { body: { process_runs: true } });
        }
        await Promise.all([runs.reload(), automations.reload()]);
        setRunning(null);
    }
    return (_jsxs(_Fragment, { children: [_jsx(PageHeader, { title: "Piloto autom\u00E1tico", subtitle: `O que o app faz sozinho, nos dias e horários que você escolher · ${automations.rows.filter((a) => a.is_active).length} ativas`, tabs: TABS, tab: tab, onTab: (t) => setTab(t), action: _jsxs("button", { className: "btn-primary", onClick: () => setEditing({}), children: [_jsx(Plus, { size: 16, strokeWidth: 1.5 }), "Nova automa\u00E7\u00E3o"] }) }), automations.error && _jsx("p", { className: "mb-4 text-sm text-negative", children: automations.error }), automations.loading ? _jsx(ListSkeleton, { rows: 3 }) : tab === 'Automações' ? (_jsxs(_Fragment, { children: [automations.rows.length === 0 && (_jsx("div", { className: "card mb-6", children: _jsx(Empty, { icon: _jsx(Workflow, { size: 18, strokeWidth: 1.5 }), children: "Nenhuma automa\u00E7\u00E3o ainda. Comece por uma das sugest\u00F5es abaixo." }) })), _jsx("ul", { className: "grid gap-4 md:grid-cols-2", children: automations.rows.map((a) => {
                            const Icon = ICON[a.action];
                            const next = nextRun(a, now);
                            const last = runs.rows.find((r) => r.automation_id === a.id);
                            return (_jsxs("li", { className: `card flex flex-col ${a.is_active ? '' : 'opacity-70'}`, children: [_jsxs("div", { className: "mb-2 flex items-start gap-3", children: [_jsx("span", { className: "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-line bg-raised text-fg2", children: _jsx(Icon, { size: 18, strokeWidth: 1.5 }) }), _jsxs("button", { className: "min-w-0 flex-1 text-left", onClick: () => setEditing(a), children: [_jsx("div", { className: "truncate font-medium hover:underline", children: a.title }), _jsxs("div", { className: "text-xs text-fg3", children: [ACTION_LABEL[a.action], " \u00B7 ", scheduleText(a)] })] }), _jsxs("label", { className: "relative inline-flex shrink-0 cursor-pointer items-center", children: [_jsx("input", { type: "checkbox", role: "switch", className: "peer sr-only", checked: a.is_active, onChange: () => toggle(a), "aria-label": `Ativar ${a.title}` }), _jsx("span", { className: "h-7 w-12 rounded-full bg-sunken transition-colors duration-300 ease-out peer-checked:bg-primary peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-brand" }), _jsx("span", { className: "absolute left-1 h-5 w-5 rounded-full bg-white shadow-[0_1px_3px_rgb(0_0_0/0.25)] transition-transform duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] peer-checked:translate-x-5" })] })] }), a.prompt && a.action !== 'briefing' && _jsx("p", { className: "mb-2 line-clamp-2 text-sm text-fg2", children: a.prompt }), last && (_jsxs("div", { className: "mb-3 rounded-lg bg-raised/60 px-3 py-2 text-xs", children: [_jsx("span", { className: STATUS[last.status].tone, children: STATUS[last.status].label }), _jsxs("span", { className: "text-fg3", children: [" \u00B7 ", when(new Date(last.ran_at), now)] }), _jsx("p", { className: "mt-1 line-clamp-3 whitespace-pre-wrap text-fg2", children: last.output })] })), _jsxs("div", { className: "mt-auto flex items-center gap-2 text-xs text-fg3", children: [_jsx("span", { className: "mr-auto", children: next ? `Próxima: ${when(next, now)}` : 'Pausada' }), _jsxs("button", { className: "btn-ghost h-8 text-sm", disabled: running === a.id, onClick: () => runNow(a), children: [_jsx(Play, { size: 14, strokeWidth: 1.5 }), running === a.id ? 'Rodando…' : 'Rodar agora'] })] })] }, a.id));
                        }) }), _jsxs("section", { className: "mt-8", "aria-label": "Sugest\u00F5es", children: [_jsx("div", { className: "label mb-3", children: "Sugest\u00F5es" }), _jsx("ul", { className: "grid gap-2 sm:grid-cols-2 xl:grid-cols-4", children: PRESETS.map((p) => {
                                    const Icon = ICON[p.action];
                                    return (_jsx("li", { children: _jsxs("button", { className: "card flex w-full items-center gap-3 p-3 text-left hover:border-line-strong", onClick: () => setEditing(p), children: [_jsx(Icon, { size: 16, strokeWidth: 1.5, className: "shrink-0 text-fg3" }), _jsxs("span", { className: "min-w-0", children: [_jsx("span", { className: "block truncate text-sm", children: p.title }), _jsx("span", { className: "block text-xs text-fg3", children: scheduleText(p) })] })] }) }, p.title));
                                }) })] })] })) : (_jsxs("section", { className: "card", "aria-label": "Hist\u00F3rico de execu\u00E7\u00F5es", children: [runs.rows.length === 0 && _jsx(Empty, { icon: _jsx(Workflow, { size: 18, strokeWidth: 1.5 }), children: "Nenhuma execu\u00E7\u00E3o ainda" }), _jsx("ul", { className: "divide-y divide-line", children: runs.rows.slice(0, 100).map((r) => (_jsxs("li", { className: "py-3", children: [_jsxs("div", { className: "mb-1 flex flex-wrap items-baseline gap-2 text-sm", children: [_jsx("span", { className: "mr-auto font-medium", children: titleOf(r.automation_id) }), _jsx("span", { className: `text-xs ${STATUS[r.status].tone}`, children: STATUS[r.status].label }), _jsx("span", { className: "text-xs text-fg3", children: when(new Date(r.ran_at), now) })] }), _jsx("p", { className: "text-sm whitespace-pre-wrap text-fg2", children: r.output })] }, r.id))) })] })), editing && (_jsx(AutomationForm, { automation: editing, onClose: () => setEditing(null), onSaved: () => { setEditing(null); void automations.reload(); }, onDeleted: (id) => { setEditing(null); automations.setRows((rows) => rows.filter((a) => a.id !== id)); } }))] }));
}
function AutomationForm({ automation, onClose, onSaved, onDeleted }) {
    const [title, setTitle] = useState(automation.title ?? '');
    const [action, setAction] = useState(automation.action ?? 'briefing');
    const [prompt, setPrompt] = useState(automation.prompt ?? '');
    const [priority, setPriority] = useState(automation.payload?.priority ?? 'medium');
    const [days, setDays] = useState(automation.weekdays ?? []);
    const [time, setTime] = useState(automation.time_of_day?.slice(0, 5) ?? '07:00');
    async function save(e) {
        e.preventDefault();
        const row = { title, action, prompt: action === 'briefing' ? '' : prompt, payload: action === 'task' ? { priority } : {}, weekdays: days, time_of_day: time };
        const ok = automation.id
            ? await write(supabase.from('automations').update(row).eq('id', automation.id))
            : await write(supabase.from('automations').insert(row));
        if (ok)
            onSaved();
    }
    async function remove() {
        if (automation.id && confirm('Excluir esta automação e o histórico dela?') && await write(supabase.from('automations').delete().eq('id', automation.id)))
            onDeleted(automation.id);
    }
    return (_jsx(Modal, { title: automation.id ? 'Editar automação' : 'Nova automação', onClose: onClose, children: _jsxs("form", { onSubmit: save, children: [_jsx(Field, { label: "Nome", children: _jsx("input", { className: "input", value: title, onChange: (e) => setTitle(e.target.value), required: true, autoFocus: true }) }), _jsx(Field, { label: "O que fazer", children: _jsxs("select", { className: "input", value: action, onChange: (e) => setAction(e.target.value), children: [_jsx("option", { value: "briefing", children: "Resumo do dia (tarefas, lembretes, h\u00E1bitos e contas)" }), _jsx("option", { value: "task", children: "Criar uma tarefa" }), _jsx("option", { value: "reminder", children: "Criar um lembrete" }), _jsx("option", { value: "ai", children: "Pedido \u00E0 IA" })] }) }), action === 'task' && (_jsxs("div", { className: "grid grid-cols-[1fr_120px] gap-2", children: [_jsx(Field, { label: "T\u00EDtulo da tarefa", children: _jsx("input", { className: "input", value: prompt, onChange: (e) => setPrompt(e.target.value), required: true }) }), _jsx(Field, { label: "Prioridade", children: _jsxs("select", { className: "input", value: priority, onChange: (e) => setPriority(e.target.value), children: [_jsx("option", { value: "high", children: "Alta" }), _jsx("option", { value: "medium", children: "M\u00E9dia" }), _jsx("option", { value: "low", children: "Baixa" })] }) })] })), action === 'reminder' && _jsx(Field, { label: "Texto do lembrete", children: _jsx("input", { className: "input", value: prompt, onChange: (e) => setPrompt(e.target.value), required: true }) }), action === 'ai' && (_jsxs(_Fragment, { children: [_jsx(Field, { label: "Pedido", children: _jsx("textarea", { className: "input", rows: 3, value: prompt, onChange: (e) => setPrompt(e.target.value), required: true }) }), _jsx("p", { className: "-mt-2 mb-4 text-xs text-fg3", children: "A IA responde no hor\u00E1rio, com acesso aos seus dados (pode criar tarefas, lembretes etc.). A resposta aparece no Assistente e no hist\u00F3rico." })] })), action === 'briefing' && _jsx("p", { className: "-mt-2 mb-4 text-xs text-fg3", children: "O resumo aparece no hist\u00F3rico e, depois, no chat do assistente." }), _jsx(FieldGroup, { label: "Dias (nenhum = todo dia)", children: _jsx(WeekdayPicker, { value: days, onChange: setDays }) }), _jsx(Field, { label: "Hor\u00E1rio", children: _jsx("input", { className: "input w-32", type: "time", value: time, onChange: (e) => setTime(e.target.value), required: true }) }), _jsxs("div", { className: "flex gap-2", children: [automation.id && _jsx("button", { type: "button", className: "btn-ghost text-negative", onClick: remove, children: "Excluir" }), _jsx("button", { className: "btn-primary ml-auto", children: "Salvar" })] })] }) }));
}
