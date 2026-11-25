import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useState } from 'react';
import { ArrowRight, CalendarCheck2, Check, CheckCircle2, ChevronLeft, FolderKanban, Sparkles, Target, Wallet } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useTable, write } from '../lib/useTable';
import { addDays, formatDay, toDay } from '../lib/dates';
import { moveToDay } from '../lib/calendar';
import { money } from '../lib/money';
import { buildReview, formatReviewDiary } from '../lib/review';
import { currentValue } from '../lib/goals';
import { bankBalance, recurringInMonth } from '../lib/finance';
import { MOODS } from '../lib/knowledge';
import { useProjects } from '../pages/projects/useProjects';
import { useRates } from '../pages/finance/useRates';
import { Field, ListSkeleton, Modal } from './ui';
import { notifyDataChanged } from './QuickCaptureModal';
export function openGuidedReview(mode = 'daily') {
    window.dispatchEvent(new CustomEvent('painel-open-review', { detail: mode }));
}
const STEPS = ['Pendências', 'Rotina e foco', 'Projetos e finanças', 'Fechamento'];
export function ReviewModal() {
    const [mode, setMode] = useState(null);
    useEffect(() => {
        const onOpen = (e) => setMode(e.detail ?? 'daily');
        window.addEventListener('painel-open-review', onOpen);
        return () => window.removeEventListener('painel-open-review', onOpen);
    }, []);
    if (!mode)
        return null;
    return _jsx(ReviewDialog, { initialMode: mode, onClose: () => setMode(null) });
}
function ReviewDialog({ initialMode, onClose }) {
    const [mode, setMode] = useState(initialMode);
    const [step, setStep] = useState(0);
    const [focus, setFocus] = useState('');
    const [focusSaved, setFocusSaved] = useState(false);
    const [reflection, setReflection] = useState('');
    const [mood, setMood] = useState(4);
    const [savingDiary, setSavingDiary] = useState(false);
    const tasks = useTable('tasks');
    const reminders = useTable('reminders', '*', { column: 'datetime' });
    const habits = useTable('habits');
    const completions = useTable('habit_completions', 'id,habit_id,completed_date,value');
    const projects = useProjects();
    const goals = useTable('goals');
    const entries = useTable('goal_entries');
    const banks = useTable('banks');
    const txs = useTable('transactions');
    const templates = useTable('transaction_recurring_templates');
    const skips = useTable('transaction_recurring_skips');
    const payments = useTable('card_invoice_payments');
    useRates(null);
    const now = new Date();
    const today = toDay(now);
    const tomorrow = addDays(today, 1);
    const loading = tasks.loading || habits.loading || projects.projects.loading || goals.loading;
    const occ = recurringInMonth(templates.rows.filter((t) => t.is_active && !t.deleted_at), txs.rows, skips.rows, now.getFullYear(), now.getMonth() + 1);
    const upcomingBills = [
        ...occ.filter((o) => !o.paid && !o.skipped && o.template.type === 'expense' && o.date >= today).map((o) => ({ date: o.date, label: o.template.description, amount: o.template.amount })),
        ...txs.rows.filter((t) => t.is_pending && t.type === 'expense' && t.date >= today).map((t) => ({ date: t.date, label: t.description, amount: t.amount })),
    ];
    const summary = buildReview(mode, {
        tasks: tasks.rows,
        reminders: reminders.rows,
        habits: habits.rows,
        completions: completions.rows,
        projects: projects.projects.rows,
        tasksOf: projects.tasksOf,
        stepsOf: projects.stepsOf,
        goals: goals.rows,
        goalValueOf: (g) => {
            const bank = banks.rows.find((b) => b.id === g.linked_bank_id);
            return currentValue(g, {
                entries: entries.rows,
                habits: habits.rows,
                completions: completions.rows,
                bankBalance: bank ? bankBalance(bank, txs.rows, [], payments.rows) : undefined,
            });
        },
        upcomingBills,
    }, now);
    async function completeTask(t) {
        tasks.setRows((rows) => rows.map((x) => (x.id === t.id ? { ...x, completed: true, completed_at: new Date().toISOString() } : x)));
        await write(supabase.from('tasks').update({ completed: true, status: 'completed', completed_at: new Date().toISOString() }).eq('id', t.id));
        notifyDataChanged();
    }
    async function rescheduleTask(t, targetDay) {
        const due_date = !t.due_date || t.due_all_day ? new Date(`${targetDay}T12:00:00`).toISOString() : moveToDay(t.due_date, targetDay);
        tasks.setRows((rows) => rows.map((x) => (x.id === t.id ? { ...x, due_date } : x)));
        await write(supabase.from('tasks').update({ due_date }).eq('id', t.id));
        notifyDataChanged();
    }
    async function completeReminder(r) {
        reminders.setRows((rows) => rows.map((x) => (x.id === r.id ? { ...x, completed: true } : x)));
        await write(supabase.from('reminders').update({ completed: true }).eq('id', r.id));
        notifyDataChanged();
    }
    async function createFocusTask() {
        const title = focus.trim();
        if (!title)
            return;
        const ok = await write(supabase.from('tasks').insert({
            title,
            priority: 'high',
            due_date: new Date(`${today}T12:00:00`).toISOString(),
            due_all_day: true,
        }));
        if (ok) {
            setFocusSaved(true);
            notifyDataChanged();
            void tasks.reload();
        }
    }
    async function finish(saveToDiary) {
        if (saveToDiary) {
            setSavingDiary(true);
            const entry = formatReviewDiary(summary, focus, reflection);
            await write(supabase.from('diary_entries').upsert({
                date: today,
                title: entry.title,
                content: entry.content,
                mood,
            }, { onConflict: 'user_id,date' }));
            setSavingDiary(false);
            notifyDataChanged();
        }
        onClose();
    }
    return (_jsxs(Modal, { title: mode === 'daily' ? 'Revisão diária' : 'Revisão semanal', onClose: onClose, children: [_jsxs("div", { className: "mb-4 flex items-center justify-between gap-2", children: [_jsxs("div", { className: "segmented", role: "tablist", "aria-label": "Tipo de revis\u00E3o", children: [_jsx("button", { type: "button", role: "tab", "aria-selected": mode === 'daily', className: mode === 'daily' ? 'tab-active' : 'tab', onClick: () => setMode('daily'), children: "Di\u00E1ria" }), _jsx("button", { type: "button", role: "tab", "aria-selected": mode === 'weekly', className: mode === 'weekly' ? 'tab-active' : 'tab', onClick: () => setMode('weekly'), children: "Semanal" })] }), _jsxs("span", { className: "figure text-xs text-fg3", children: ["Passo ", step + 1, " de ", STEPS.length] })] }), _jsx("div", { className: "mb-5 flex gap-1", "aria-hidden": "true", children: STEPS.map((s, i) => (_jsx("span", { className: `h-1.5 flex-1 rounded-full transition-colors duration-300 ${i <= step ? 'bg-brand' : 'bg-raised'}` }, s))) }), loading ? _jsx(ListSkeleton, { rows: 3 }) : (_jsxs("div", { className: "min-h-[220px]", children: [step === 0 && (_jsxs("div", { className: "space-y-4", children: [_jsxs("div", { className: "flex items-center gap-2 text-sm font-medium", children: [_jsx(CalendarCheck2, { size: 16, strokeWidth: 1.6, className: "text-brand", "aria-hidden": "true" }), _jsxs("span", { children: ["Pend\u00EAncias e atrasos (", formatDay(today), ")"] })] }), summary.overdueTasks.length === 0 && summary.overdueReminders.length === 0 ? (_jsxs("div", { className: "rounded-[14px] bg-positive/10 px-4 py-5 text-center text-sm text-positive", children: [_jsx(CheckCircle2, { size: 20, strokeWidth: 1.75, className: "mx-auto mb-1.5", "aria-hidden": "true" }), "Tudo em dia! Nenhuma tarefa nem lembrete atrasado."] })) : (_jsxs("ul", { className: "space-y-2", children: [summary.overdueTasks.map((t) => (_jsxs("li", { className: "rounded-[14px] bg-raised p-3", children: [_jsx("div", { className: "mb-2 text-sm font-medium", children: t.title }), _jsxs("div", { className: "flex flex-wrap gap-1.5", children: [_jsx("button", { type: "button", className: "btn-secondary h-8 px-2.5 text-xs", onClick: () => void rescheduleTask(t, today), children: "Mover p/ hoje" }), _jsx("button", { type: "button", className: "btn-secondary h-8 px-2.5 text-xs", onClick: () => void rescheduleTask(t, tomorrow), children: "Amanh\u00E3" }), _jsxs("button", { type: "button", className: "btn-ghost h-8 px-2.5 text-xs text-positive", onClick: () => void completeTask(t), children: [_jsx(Check, { size: 14, "aria-hidden": "true" }), "Concluir"] })] })] }, t.id))), summary.overdueReminders.map((r) => (_jsxs("li", { className: "flex items-center gap-2 rounded-[14px] bg-raised px-3 py-2.5 text-sm", children: [_jsx("span", { className: "mr-auto truncate", children: r.title }), _jsxs("button", { type: "button", className: "btn-ghost h-8 px-2.5 text-xs text-positive", onClick: () => void completeReminder(r), children: [_jsx(Check, { size: 14, "aria-hidden": "true" }), "Feito"] })] }, r.id)))] })), _jsxs("p", { className: "text-xs text-fg3", children: ["Voc\u00EA tem ", _jsx("strong", { className: "figure text-fg", children: summary.todayTasks.length }), " ", summary.todayTasks.length === 1 ? 'tarefa' : 'tarefas', " programadas para hoje."] })] })), step === 1 && (_jsxs("div", { className: "space-y-4", children: [_jsxs("div", { className: "grid grid-cols-2 gap-3", children: [_jsxs("div", { className: "rounded-[14px] bg-raised p-3.5", children: [_jsx("div", { className: "label", children: "H\u00E1bitos hoje" }), _jsxs("div", { className: "figure mt-1 text-2xl font-medium", children: [summary.habitsDoneToday, _jsxs("span", { className: "text-sm text-fg3", children: [" / ", summary.habitsTotalToday] })] })] }), _jsxs("div", { className: "rounded-[14px] bg-raised p-3.5", children: [_jsx("div", { className: "label", children: "\u00DAltimos 7 dias" }), _jsxs("div", { className: "figure mt-1 text-2xl font-medium text-brand-ink", children: [Math.round(summary.weeklyHabitRate * 100), "%"] })] })] }), _jsx(Field, { label: mode === 'daily' ? 'Qual é a prioridade nº 1 de hoje?' : 'Qual é a grande entrega desta semana?', children: _jsxs("div", { className: "flex gap-2", children: [_jsx("input", { className: "input flex-1", value: focus, onChange: (e) => { setFocus(e.target.value); setFocusSaved(false); }, placeholder: "Ex.: Concluir m\u00F3dulo QQI Level 5" }), _jsx("button", { type: "button", className: "btn-secondary shrink-0", disabled: !focus.trim() || focusSaved, onClick: () => void createFocusTask(), children: focusSaved ? 'Criada' : 'Criar tarefa' })] }) })] })), step === 2 && (_jsxs("div", { className: "space-y-4", children: [_jsxs("div", { className: "rounded-[14px] bg-raised p-3.5", children: [_jsxs("div", { className: "mb-2 flex items-center gap-1.5 text-xs font-medium text-fg2", children: [_jsx(Wallet, { size: 14, strokeWidth: 1.6, "aria-hidden": "true" }), _jsx("span", { children: "Contas nos pr\u00F3ximos 7 dias" }), _jsx("span", { className: "figure ml-auto text-fg", children: money(summary.billsTotal) })] }), summary.billsNext7Days.length === 0 ? (_jsx("p", { className: "text-xs text-fg3", children: "Nenhuma conta prevista para os pr\u00F3ximos 7 dias." })) : (_jsx("ul", { className: "space-y-1 text-xs", children: summary.billsNext7Days.slice(0, 5).map((b, i) => (_jsxs("li", { className: "flex items-center gap-2", children: [_jsxs("span", { className: "figure text-fg3", children: [b.date.slice(8), "/", b.date.slice(5, 7)] }), _jsx("span", { className: "mr-auto truncate", children: b.label }), _jsx("span", { className: "figure", children: money(b.amount) })] }, i))) }))] }), _jsxs("div", { className: "rounded-[14px] bg-raised p-3.5", children: [_jsxs("div", { className: "mb-2 flex items-center gap-1.5 text-xs font-medium text-fg2", children: [_jsx(FolderKanban, { size: 14, strokeWidth: 1.6, "aria-hidden": "true" }), _jsxs("span", { children: ["Projetos que pedem aten\u00E7\u00E3o (", summary.projectsNeedingAttention.length, ")"] })] }), summary.projectsNeedingAttention.length === 0 ? (_jsx("p", { className: "text-xs text-fg3", children: "Todos os projetos est\u00E3o no ritmo." })) : (_jsx("ul", { className: "space-y-1 text-xs", children: summary.projectsNeedingAttention.slice(0, 5).map(({ project, reason }) => (_jsxs("li", { className: "flex items-center gap-2", children: [_jsx("span", { className: "mr-auto truncate font-medium text-fg", children: project.name }), _jsx("span", { className: "shrink-0 text-fg3", children: reason })] }, project.id))) }))] }), summary.goalsBehind.length > 0 && (_jsxs("div", { className: "rounded-[14px] bg-warning/10 p-3.5", children: [_jsxs("div", { className: "mb-1.5 flex items-center gap-1.5 text-xs font-medium text-warning", children: [_jsx(Target, { size: 14, strokeWidth: 1.6, "aria-hidden": "true" }), _jsxs("span", { children: ["Metas fora do ritmo (", summary.goalsBehind.length, ")"] })] }), _jsx("ul", { className: "space-y-1 text-xs text-fg2", children: summary.goalsBehind.map(({ goal, paceLabel }) => (_jsxs("li", { className: "flex items-center gap-2", children: [_jsx("span", { className: "mr-auto truncate", children: goal.title }), _jsx("span", { className: "shrink-0 text-warning", children: paceLabel })] }, goal.id))) })] }))] })), step === 3 && (_jsxs("div", { className: "space-y-4", children: [_jsxs("div", { className: "flex items-center gap-2 text-sm font-medium", children: [_jsx(Sparkles, { size: 16, strokeWidth: 1.6, className: "text-brand", "aria-hidden": "true" }), _jsx("span", { children: "Fechamento da revis\u00E3o" })] }), _jsx(Field, { label: "Reflex\u00E3o r\u00E1pida (opcional \u2014 salva no Di\u00E1rio de hoje)", children: _jsx("textarea", { className: "input h-24 py-2.5", value: reflection, onChange: (e) => setReflection(e.target.value), placeholder: "O que funcionou bem? O que ajustar amanh\u00E3?" }) }), _jsxs("div", { children: [_jsx("span", { className: "mb-1.5 block text-[13px] text-fg2", children: "Como est\u00E1 sua energia hoje?" }), _jsx("div", { className: "flex flex-wrap gap-1.5", children: MOODS.map((label, i) => {
                                            const v = i + 1;
                                            return (_jsx("button", { type: "button", "aria-pressed": mood === v, onClick: () => setMood(v), className: `rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${mood === v ? 'bg-primary text-primary-ink' : 'bg-raised text-fg2 hover:text-fg'}`, children: label }, label));
                                        }) })] })] }))] })), _jsxs("div", { className: "mt-6 flex items-center gap-2 border-t border-line pt-4", children: [step > 0 ? (_jsxs("button", { type: "button", className: "btn-ghost", onClick: () => setStep(step - 1), children: [_jsx(ChevronLeft, { size: 16, strokeWidth: 1.6, "aria-hidden": "true" }), "Voltar"] })) : (_jsx("button", { type: "button", className: "btn-ghost", onClick: onClose, children: "Fechar" })), step < STEPS.length - 1 ? (_jsxs("button", { type: "button", className: "btn-primary ml-auto", onClick: () => setStep(step + 1), children: ["Continuar ", _jsx(ArrowRight, { size: 16, strokeWidth: 1.6, "aria-hidden": "true" })] })) : (_jsxs("div", { className: "ml-auto flex gap-2", children: [_jsx("button", { type: "button", className: "btn-secondary", onClick: () => void finish(false), children: "Concluir" }), _jsx("button", { type: "button", className: "btn-primary", disabled: savingDiary, onClick: () => void finish(true), children: savingDiary ? 'Salvando…' : 'Salvar no Diário' })] }))] })] }));
}
