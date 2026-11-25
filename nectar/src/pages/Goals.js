import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useState } from 'react';
import { Check, CheckCircle2, Pause, Play, Plus, Target, Trash2 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useTable, write } from '../lib/useTable';
import { formatDay, sentence, toDay } from '../lib/dates';
import { num, plural } from '../lib/format';
import { CURRENCIES, formatIn, symbolOf } from '../lib/money';
import { bankBalance } from '../lib/finance';
import { projectProgress } from '../lib/projects';
import { PACE_LABEL, TYPE_LABEL, currentValue, goalCurrency, goalPace, goalProgress, goalSeries, linkedBankIdsOf, sumLinkedAccountsInGoalCurrency, targetOf, } from '../lib/goals';
import { AreaChart } from '../components/Charts';
import { Empty, Field, FieldGroup, ListSkeleton, Modal, PageHeader, Stat } from '../components/ui';
import { useProjects } from './projects/useProjects';
import { useRates } from './finance/useRates';
const TABS = ['Ativas', 'Pausadas', 'Concluídas'];
const TAB_STATUS = { Ativas: 'active', Pausadas: 'paused', Concluídas: 'completed' };
export const PACE_TONE = { done: 'text-positive', ahead: 'text-positive', on: 'text-fg2', behind: 'text-warning', late: 'text-negative', open: 'text-fg3' };
const GOAL_DOT = {
    financial: '#4cc38a',
    project: '#818cf8',
    habit: '#eab308',
    custom: 'var(--brand)',
};
const short = (day) => `${Number(day.slice(8))}/${day.slice(5, 7)}`;
/** A value in the goal's unit: money in its chosen currency, a project as %. */
function fmt(goal, n) {
    if (n == null)
        return '—';
    if (goal.goal_type === 'financial')
        return formatIn(n, goalCurrency(goal));
    if (goal.goal_type === 'project')
        return `${Math.round(n)}%`;
    if (goal.goal_type === 'habit')
        return `${num(n, 0)} ${plural(n, 'vez', 'vezes')}`;
    return `${num(n)}${goal.unit ? ` ${goal.unit}` : ''}`;
}
export default function Goals() {
    const [tab, setTab] = useState('Ativas');
    const goals = useTable('goals', '*', { column: 'created_at' });
    const entries = useTable('goal_entries', '*', { column: 'date' });
    const habits = useTable('habits');
    const completions = useTable('habit_completions', 'id,habit_id,completed_date,value');
    const banks = useTable('banks');
    const txs = useTable('transactions');
    const transfers = useTable('transfers');
    const payments = useTable('card_invoice_payments');
    const projects = useProjects();
    const fx = useRates(null);
    const [editing, setEditing] = useState(null);
    const [openId, setOpenId] = useState(null);
    const today = toDay(new Date());
    const bankById = new Map(banks.rows.map((b) => [b.id, b]));
    const balanceBrlOf = (id) => {
        const bank = bankById.get(id);
        return bank ? bankBalance(bank, txs.rows, transfers.rows, payments.rows) : 0;
    };
    const valueOf = (g) => currentValue(g, {
        entries: entries.rows, habits: habits.rows, completions: completions.rows,
        projectPct: g.linked_project_id ? projectProgress(projects.tasksOf(g.linked_project_id), projects.stepsOf(g.linked_project_id)).pct : undefined,
        bankBalance: sumLinkedAccountsInGoalCurrency(g, banks.rows, balanceBrlOf, fx.rates),
    });
    const rows = goals.rows.map((g) => {
        const current = valueOf(g);
        return { g, current, progress: goalProgress(g, current), ...goalPace(g, current, today) };
    });
    const shown = rows.filter((r) => r.g.status === TAB_STATUS[tab]);
    const active = rows.filter((r) => r.g.status === 'active');
    const onPaceCount = active.filter((r) => r.pace === 'on' || r.pace === 'ahead' || r.pace === 'done').length;
    const lateCount = active.filter((r) => r.pace === 'behind' || r.pace === 'late').length;
    const completedCount = rows.filter((r) => r.g.status === 'completed').length;
    const linkName = (g) => {
        if (g.goal_type === 'habit')
            return habits.rows.find((h) => h.id === g.linked_habit_id)?.name;
        if (g.goal_type === 'project')
            return projects.projects.rows.find((p) => p.id === g.linked_project_id)?.name;
        if (g.goal_type === 'financial') {
            const names = linkedBankIdsOf(g).map((id) => bankById.get(id)?.name).filter((x) => !!x);
            return names.length ? names.join(' + ') : 'aportes';
        }
        return undefined;
    };
    const open = rows.find((r) => r.g.id === openId);
    async function setStatus(g, status) {
        goals.setRows((list) => list.map((x) => (x.id === g.id ? { ...x, status } : x)));
        await write(supabase.from('goals').update({ status }).eq('id', g.id));
    }
    return (_jsxs(_Fragment, { children: [_jsx(PageHeader, { title: "Metas", subtitle: `${active.length} ${plural(active.length, 'ativa', 'ativas')}`, tabs: TABS, tab: tab, onTab: (t) => setTab(t), action: _jsxs("button", { className: "btn-primary", onClick: () => setEditing({}), children: [_jsx(Plus, { size: 16, strokeWidth: 1.5 }), "Nova meta"] }) }), goals.error && _jsx("p", { className: "mb-4 text-sm text-negative", children: goals.error }), goals.loading ? _jsx(ListSkeleton, { rows: 3 }) : (_jsxs(_Fragment, { children: [tab === 'Ativas' && (_jsxs("div", { className: "mb-6 grid grid-cols-2 gap-4 xl:grid-cols-4", children: [_jsxs("div", { className: "card", children: [_jsx("div", { className: "label", children: "Metas ativas" }), _jsx("div", { className: "figure mt-3 text-[28px] leading-none font-medium text-fg", children: active.length })] }), _jsxs("div", { className: "card", children: [_jsx("div", { className: "label", children: "No ritmo" }), _jsx("div", { className: "figure mt-3 text-[28px] leading-none font-medium text-fg", children: onPaceCount })] }), _jsxs("div", { className: "card", children: [_jsx("div", { className: "label", children: "Atrasadas" }), _jsx("div", { className: `figure mt-3 text-[28px] leading-none font-medium ${lateCount > 0 ? 'text-warning' : 'text-fg'}`, children: lateCount })] }), _jsxs("div", { className: "card", children: [_jsx("div", { className: "label", children: "Conclu\u00EDdas" }), _jsx("div", { className: "figure mt-3 text-[28px] leading-none font-medium text-fg", children: completedCount })] })] })), shown.length === 0 && (_jsx("div", { className: "card", children: _jsx(Empty, { icon: _jsx(Target, { size: 18, strokeWidth: 1.5 }), action: tab === 'Ativas' ? _jsx("button", { className: "btn-secondary", onClick: () => setEditing({}), children: "Nova meta" }) : undefined, children: tab === 'Ativas' ? 'Nenhuma meta ativa' : `Nenhuma meta ${tab.toLowerCase().replace(/s$/, '')}` }) })), _jsx("ul", { className: "grid gap-4 md:grid-cols-2 xl:grid-cols-3", children: shown.map(({ g, current, progress, pace, expected, daysLeft, perWeek, projected }) => {
                            const dot = GOAL_DOT[g.goal_type];
                            return (_jsx("li", { className: "min-w-0", children: _jsxs("button", { type: "button", className: "card glow flex h-full w-full min-w-0 flex-col p-5 text-left", onClick: () => setOpenId(g.id), children: [_jsxs("div", { className: "mb-4 flex w-full items-center justify-between gap-2 text-xs", children: [_jsxs("span", { className: "inline-flex min-w-0 items-center gap-2 text-fg3", children: [_jsx("span", { className: "h-2 w-2 shrink-0 rounded-full", style: { background: dot }, "aria-hidden": "true" }), _jsxs("span", { className: "truncate", children: [TYPE_LABEL[g.goal_type], linkName(g) ? ` · ${linkName(g)}` : ''] })] }), _jsx("span", { className: `shrink-0 font-medium ${PACE_TONE[pace]}`, children: PACE_LABEL[pace] })] }), _jsx("div", { className: "w-full truncate text-[15px] leading-6 font-medium text-fg", children: g.title }), _jsxs("div", { className: "mt-3 flex w-full items-baseline justify-between gap-2", children: [_jsxs("div", { className: "flex flex-wrap items-baseline gap-x-2", children: [_jsx("span", { className: "figure text-[24px] leading-none font-medium text-fg", children: fmt(g, current) }), _jsxs("span", { className: "figure text-xs text-fg3", children: ["de ", fmt(g, targetOf(g))] })] }), _jsxs("span", { className: "figure shrink-0 text-xs font-medium text-fg2", children: [Math.round(progress * 100), "%"] })] }), _jsxs("div", { className: "mt-4 w-full", children: [_jsx(ProgressBar, { progress: progress, expected: expected, label: g.title }), _jsx("div", { className: "mt-3 text-xs text-fg3", children: pace === 'done' ? (g.status === 'completed' ? 'Concluída' : 'Meta batida: marque como concluída')
                                                        : daysLeft == null ? (projected ? `Nesse ritmo, chega lá em ${short(projected)}` : '\u00a0') : daysLeft < 0 ? `Venceu em ${short(g.target_date)}`
                                                            : `${daysLeft === 0 ? 'Vence hoje' : `Faltam ${daysLeft} ${plural(daysLeft, 'dia', 'dias')}`}${perWeek != null && perWeek > 0 ? ` · ${fmt(g, perWeek)} por semana` : ''}` })] })] }) }, g.id));
                        }) })] })), open && (_jsx(GoalDetail, { row: open, entries: entries.rows.filter((e) => e.goal_id === open.g.id), linkName: linkName(open.g), today: today, onClose: () => setOpenId(null), onEdit: () => { setEditing(open.g); setOpenId(null); }, onStatus: (s) => setStatus(open.g, s), onEntries: () => entries.reload(), onDelete: async () => {
                    if (confirm('Excluir esta meta e os registros dela?') && await write(supabase.from('goals').delete().eq('id', open.g.id))) {
                        setOpenId(null);
                        void goals.reload();
                    }
                } })), editing && (_jsx(GoalForm, { goal: editing, habits: habits.rows.filter((h) => !h.is_archived), banks: banks.rows, projects: projects.projects.rows.filter((p) => !p.is_template && !p.archived_at), onClose: () => setEditing(null), onSaved: () => { setEditing(null); void goals.reload(); } }))] }));
}
/** The bar, with a tick where progress should be by now. */
function ProgressBar({ progress, expected, label }) {
    return (_jsxs("div", { className: "relative h-1.5 rounded-full bg-raised", role: "progressbar", "aria-valuenow": Math.round(progress * 100), "aria-valuemin": 0, "aria-valuemax": 100, "aria-label": `Progresso: ${label}`, children: [_jsx("div", { className: "h-1.5 rounded-full bg-brand", style: { width: `${progress * 100}%` } }), expected != null && expected > 0 && expected < 1 && (_jsx("span", { className: "absolute -top-1 h-3.5 w-0.5 rounded bg-fg2", style: { left: `calc(${expected * 100}% - 1px)` }, title: `Esperado até hoje: ${Math.round(expected * 100)}%` }))] }));
}
function GoalDetail({ row, entries, linkName, today, onClose, onEdit, onStatus, onEntries, onDelete }) {
    const { g, current, progress, pace, expected, perWeek, projected } = row;
    const linkedCount = linkedBankIdsOf(g).length;
    const manual = g.goal_type === 'custom' || (g.goal_type === 'financial' && linkedCount === 0);
    const curSymbol = symbolOf(goalCurrency(g));
    const [value, setValue] = useState('');
    const [date, setDate] = useState(today);
    const [note, setNote] = useState('');
    const series = goalSeries(g, entries);
    async function add(e) {
        e.preventDefault();
        const v = Number(value.replace(',', '.'));
        if (!Number.isFinite(v))
            return;
        if (await write(supabase.from('goal_entries').insert({ goal_id: g.id, value: v, date, note: note || null }))) {
            setValue('');
            setNote('');
            onEntries();
        }
    }
    return (_jsxs(Modal, { title: g.title, onClose: onClose, children: [_jsxs("p", { className: "-mt-3 mb-4 text-sm text-fg3", children: [TYPE_LABEL[g.goal_type], linkName ? ` · ${linkName}` : '', " \u00B7 desde ", short(g.start_date), g.target_date ? ` até ${short(g.target_date)}` : ''] }), g.description && _jsx("p", { className: "mb-4 text-sm text-fg2", children: g.description }), _jsxs("div", { className: "mb-4 grid grid-cols-2 gap-4", children: [_jsx(Stat, { label: "Agora", value: fmt(g, current), accent: true }), _jsx(Stat, { label: "Meta", value: fmt(g, targetOf(g)) }), _jsx(Stat, { label: "Ritmo", value: _jsx("span", { className: PACE_TONE[pace], children: PACE_LABEL[pace] }), hint: expected != null ? `esperado ${Math.round(expected * 100)}% até hoje` : undefined }), _jsx(Stat, { label: "Progresso", value: `${Math.round(progress * 100)}%`, hint: pace === 'done' ? undefined : [perWeek != null && perWeek > 0 ? `${fmt(g, perWeek)}/semana` : null, projected ? `nesse ritmo: ${short(projected)}` : null].filter(Boolean).join(' · ') || undefined })] }), _jsx("div", { className: "mb-5", children: _jsx(ProgressBar, { progress: progress, expected: expected, label: g.title }) }), series.length > 1 && (_jsx("div", { className: "-mx-5 mb-5 sm:mx-0", children: _jsx(AreaChart, { title: "Evolu\u00E7\u00E3o", points: series.map((p) => ({ label: short(p.date), value: p.value })), unit: g.goal_type === 'financial' ? curSymbol : g.unit, minZero: g.measure === 'sum', height: 180 }) })), manual && (_jsxs(_Fragment, { children: [_jsxs("form", { onSubmit: add, className: "mb-4 grid grid-cols-[1fr_1fr] gap-2", children: [_jsx(Field, { label: g.measure === 'last' ? `Novo valor${g.unit ? ` (${g.unit})` : ''}` : g.goal_type === 'financial' ? `Aporte (${curSymbol})` : `Somar${g.unit ? ` (${g.unit})` : ''}`, children: _jsx("input", { className: "input", inputMode: "decimal", value: value, onChange: (e) => setValue(e.target.value), required: true }) }), _jsx(Field, { label: "Data do registro", children: _jsx("input", { className: "input", type: "date", value: date, max: today, onChange: (e) => setDate(e.target.value), required: true }) }), _jsxs("div", { className: "col-span-2 flex gap-2", children: [_jsx("input", { className: "input", placeholder: "Observa\u00E7\u00E3o (opcional)", "aria-label": "Observa\u00E7\u00E3o do registro", value: note, onChange: (e) => setNote(e.target.value) }), _jsx("button", { className: "btn-primary shrink-0", children: "Registrar" })] })] }), entries.length > 0 && (_jsx("ul", { className: "mb-5 max-h-48 space-y-1 overflow-y-auto text-sm", children: [...entries].sort((a, b) => b.date.localeCompare(a.date)).map((e) => (_jsxs("li", { className: "flex items-center gap-2", children: [_jsx("span", { className: "w-28 shrink-0 text-fg3", children: sentence(formatDay(e.date).replace(/ de \S+$/, '')) }), _jsxs("span", { className: "figure shrink-0", children: [g.measure === 'sum' && Number(e.value) > 0 ? '+' : '', fmt(g, Number(e.value))] }), _jsx("span", { className: "min-w-0 flex-1 truncate text-fg3", children: e.note }), _jsx("button", { className: "icon-btn h-7 w-7", "aria-label": `Apagar registro de ${e.date}`, onClick: async () => {
                                        if (await write(supabase.from('goal_entries').delete().eq('id', e.id)))
                                            onEntries();
                                    }, children: _jsx(Trash2, { size: 14, strokeWidth: 1.5 }) })] }, e.id))) }))] })), !manual && (_jsxs("p", { className: "mb-5 text-xs text-fg3", children: ["O valor vem ", g.goal_type === 'habit' ? 'dos registros do hábito' : g.goal_type === 'project' ? 'do progresso do projeto' : linkedCount > 1 ? `da soma das ${linkedCount} contas vinculadas (convertido para ${curSymbol})` : `do saldo da conta (em ${curSymbol})`, ", sem registro manual."] })), _jsxs("div", { className: "flex flex-wrap gap-2", children: [g.status !== 'completed' && _jsxs("button", { className: "btn-secondary", onClick: () => { onStatus('completed'); onClose(); }, children: [_jsx(CheckCircle2, { size: 16, strokeWidth: 1.5 }), "Concluir"] }), g.status === 'active' && _jsxs("button", { className: "btn-ghost", onClick: () => { onStatus('paused'); onClose(); }, children: [_jsx(Pause, { size: 16, strokeWidth: 1.5 }), "Pausar"] }), g.status !== 'active' && _jsxs("button", { className: "btn-ghost", onClick: () => { onStatus('active'); onClose(); }, children: [_jsx(Play, { size: 16, strokeWidth: 1.5 }), "Reativar"] }), _jsx("button", { className: "btn-ghost text-negative", onClick: onDelete, children: "Excluir" }), _jsx("button", { className: "btn-primary ml-auto", onClick: onEdit, children: "Editar" })] })] }));
}
function GoalForm({ goal, habits, projects, banks, onClose, onSaved }) {
    const [title, setTitle] = useState(goal.title ?? '');
    const [description, setDescription] = useState(goal.description ?? '');
    const [type, setType] = useState(goal.goal_type ?? 'custom');
    const [currency, setCurrency] = useState(goalCurrency(goal));
    const [unit, setUnit] = useState(goal.unit ?? '');
    const [measure, setMeasure] = useState(goal.measure ?? 'sum');
    const [progressFromZero, setProgressFromZero] = useState(goal.progress_from_zero ?? !(goal.goal_type === 'custom' && goal.measure === 'last'));
    const [start, setStart] = useState(String(goal.start_value ?? 0));
    const [target, setTarget] = useState(goal.target_value != null ? String(goal.target_value) : '');
    const [startDate, setStartDate] = useState(goal.start_date ?? toDay(new Date()));
    const [targetDate, setTargetDate] = useState(goal.target_date ?? '');
    const [habitId, setHabitId] = useState(goal.linked_habit_id ?? '');
    const [projectId, setProjectId] = useState(goal.linked_project_id ?? '');
    const [bankIds, setBankIds] = useState(() => linkedBankIdsOf({ linked_bank_id: goal.linked_bank_id ?? null, linked_bank_ids: goal.linked_bank_ids }));
    const n = (s) => Number(s.replace(',', '.'));
    const curSymbol = symbolOf(currency);
    function toggleBank(id) {
        setBankIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
    }
    async function save(e) {
        e.preventDefault();
        const row = {
            title, description: description || null, goal_type: type, start_date: startDate, target_date: targetDate || null,
            currency: type === 'financial' ? currency : 'BRL',
            unit: type === 'custom' ? unit : '', measure: type === 'custom' ? measure : 'sum',
            progress_from_zero: type === 'custom' && measure === 'last' ? progressFromZero : true,
            start_value: type === 'custom' || (type === 'financial' && bankIds.length === 0) ? n(start) || 0 : 0,
            target_value: type === 'project' ? 100 : target === '' ? null : n(target),
            linked_habit_id: type === 'habit' ? habitId || null : null,
            linked_project_id: type === 'project' ? projectId || null : null,
            linked_bank_id: type === 'financial' ? (bankIds[0] ?? null) : null,
            linked_bank_ids: type === 'financial' ? bankIds : [],
        };
        const ok = goal.id ? await write(supabase.from('goals').update(row).eq('id', goal.id)) : await write(supabase.from('goals').insert(row));
        if (ok)
            onSaved();
    }
    return (_jsx(Modal, { title: goal.id ? 'Editar meta' : 'Nova meta', onClose: onClose, children: _jsxs("form", { onSubmit: save, children: [_jsx(Field, { label: "T\u00EDtulo", children: _jsx("input", { className: "input", value: title, onChange: (e) => setTitle(e.target.value), required: true, autoFocus: true }) }), _jsx(Field, { label: "Tipo", children: _jsxs("select", { className: "input", value: type, onChange: (e) => setType(e.target.value), children: [_jsx("option", { value: "custom", children: "Pessoal (voc\u00EA registra o progresso)" }), _jsx("option", { value: "financial", children: "Financeira (aportes ou saldo de contas)" }), _jsx("option", { value: "habit", children: "H\u00E1bito (vezes feitas no per\u00EDodo)" }), _jsx("option", { value: "project", children: "Projeto (progresso do projeto)" })] }) }), type === 'custom' && (_jsxs(_Fragment, { children: [_jsxs("div", { className: "grid grid-cols-2 gap-2", children: [_jsx(Field, { label: "Unidade", children: _jsx("input", { className: "input", placeholder: "km, kg, livros\u2026", value: unit, onChange: (e) => setUnit(e.target.value) }) }), _jsx(Field, { label: "Como medir", children: _jsxs("select", { className: "input", value: measure, onChange: (e) => {
                                            const next = e.target.value;
                                            setMeasure(next);
                                            if (!goal.id)
                                                setProgressFromZero(next === 'sum');
                                        }, children: [_jsx("option", { value: "sum", children: "Somar registros" }), _jsx("option", { value: "last", children: "\u00DAltimo valor" })] }) })] }), measure === 'last' ? (_jsxs("label", { className: "-mt-1 mb-4 flex items-start gap-2 rounded-xl border border-line bg-raised/40 p-3 text-xs text-fg2", children: [_jsx("input", { type: "checkbox", className: "mt-0.5 h-4 w-4 shrink-0", checked: progressFromZero, onChange: (e) => setProgressFromZero(e.target.checked) }), _jsxs("span", { children: [_jsx("strong", { className: "font-medium text-fg", children: "Contar progresso a partir do zero" }), _jsx("span", { className: "mt-0.5 block text-fg3", children: progressFromZero
                                                ? 'Ex.: já tenho 1.194 de 5.000 = 24% concluído.'
                                                : 'Ex.: chegar a 82 kg partindo de 92 kg; a meta pode ser menor que o início.' })] })] })) : (_jsx("p", { className: "-mt-2 mb-4 text-xs text-fg3", children: "Ex.: correr 300 km, ler 12 livros." }))] })), type === 'financial' && (_jsxs(_Fragment, { children: [_jsx(FieldGroup, { label: "Moeda da meta", children: _jsx("div", { className: "segmented", children: CURRENCIES.map((c) => (_jsxs("button", { type: "button", className: currency === c.code ? 'tab-active' : 'tab', "aria-pressed": currency === c.code, title: c.name, onClick: () => setCurrency(c.code), children: [c.symbol, " ", c.code] }, c.code))) }) }), _jsx(FieldGroup, { label: "Contas vinculadas (opcional)", children: banks.length === 0 ? (_jsx("p", { className: "text-xs text-fg3", children: "Nenhuma conta cadastrada em Finan\u00E7as \u2014 registre aportes manualmente." })) : (_jsxs(_Fragment, { children: [_jsx("div", { className: "flex flex-wrap gap-1.5", children: banks.map((b) => {
                                            const on = bankIds.includes(b.id);
                                            return (_jsxs("button", { type: "button", "aria-pressed": on, onClick: () => toggleBank(b.id), className: `inline-flex h-9 items-center gap-1.5 rounded-full border px-3 text-xs font-medium transition-colors ${on ? 'border-primary bg-primary text-primary-ink' : 'border-line-strong bg-surface text-fg2 hover:bg-raised hover:text-fg'}`, children: [on && _jsx(Check, { size: 13, strokeWidth: 2.2, "aria-hidden": "true" }), _jsx("span", { children: b.name }), b.currency && b.currency !== 'BRL' && _jsxs("span", { className: on ? 'opacity-80' : 'text-fg3', children: ["(", symbolOf(b.currency), ")"] })] }, b.id));
                                        }) }), _jsx("p", { className: "mt-1.5 text-xs text-fg3", children: bankIds.length === 0
                                            ? 'Nenhuma conta marcada: você registra aportes manualmente.'
                                            : bankIds.length === 1
                                                ? `Acompanha automaticamente o saldo desta conta em ${curSymbol}.`
                                                : `Soma o saldo das ${bankIds.length} contas selecionadas, convertido para ${curSymbol}.` })] })) })] })), type === 'habit' && (_jsx(Field, { label: "H\u00E1bito", children: _jsxs("select", { className: "input", value: habitId, onChange: (e) => setHabitId(e.target.value), required: true, children: [_jsx("option", { value: "", children: "Escolha" }), habits.map((h) => _jsx("option", { value: h.id, children: h.name }, h.id))] }) })), type === 'project' && (_jsx(Field, { label: "Projeto", children: _jsxs("select", { className: "input", value: projectId, onChange: (e) => setProjectId(e.target.value), required: true, children: [_jsx("option", { value: "", children: "Escolha" }), projects.map((p) => _jsx("option", { value: p.id, children: p.name }, p.id))] }) })), type !== 'project' && (_jsxs("div", { className: "grid grid-cols-2 gap-2", children: [(type === 'custom' || (type === 'financial' && bankIds.length === 0)) && (_jsx(Field, { label: type === 'financial' ? `Já guardado (${curSymbol})` : 'Valor inicial', children: _jsx("input", { className: "input", inputMode: "decimal", value: start, onChange: (e) => setStart(e.target.value) }) })), _jsx(Field, { label: type === 'habit' ? 'Meta (vezes)' : type === 'financial' ? `Meta (${curSymbol})` : 'Meta', children: _jsx("input", { className: "input", inputMode: "decimal", value: target, onChange: (e) => setTarget(e.target.value), required: true }) })] })), _jsxs("div", { className: "grid grid-cols-2 gap-2", children: [_jsx(Field, { label: "In\u00EDcio", children: _jsx("input", { className: "input", type: "date", value: startDate, onChange: (e) => setStartDate(e.target.value), required: true }) }), _jsx(Field, { label: "Prazo (opcional)", children: _jsx("input", { className: "input", type: "date", value: targetDate, min: startDate, onChange: (e) => setTargetDate(e.target.value) }) })] }), _jsx(Field, { label: "Por qu\u00EA (opcional)", children: _jsx("textarea", { className: "input", rows: 2, value: description, onChange: (e) => setDescription(e.target.value) }) }), _jsx("button", { className: "btn-primary w-full", children: "Salvar" })] }) }));
}
