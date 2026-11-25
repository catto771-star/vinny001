import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight, Bell, Check, CheckSquare, FolderKanban, Target, } from 'lucide-react';
import { useTable, queuedWrite } from '../lib/useTable';
import { latestPerKey } from '../lib/serial';
import { addDays, formatDay, formatTime, monthName, toDay } from '../lib/dates';
import { weekOf } from '../lib/calendar';
import { num, plural } from '../lib/format';
import { conv, displayCurrency, money, symbolOf } from '../lib/money';
import { bucketTasks } from '../lib/tasks';
import { isDone, isPerfectDay, routineFor } from '../lib/habits';
import { reminderPanel } from '../lib/reminders';
import { sumNutrients } from '../lib/nutrition';
import { weeklyStats, workoutSummary } from '../lib/training';
import { goalRows, nextHabitQuickValue, projectRows } from '../lib/homeProgress';
import { PACE_LABEL, currentValue, sumLinkedAccountsInGoalCurrency } from '../lib/goals';
import { HEALTH_LABEL, projectProgress, projectUpcomingPlan } from '../lib/projects';
import { bankBalance, netWorth, netWorthHistory, } from '../lib/finance';
import { projectCashFlow } from '../lib/cashflow';
import { dayHeadline } from '../lib/today';
import { AreaChart, ColumnChart } from '../components/Charts';
import { Empty, Skeleton } from '../components/ui';
import { openQuickCapture } from '../components/QuickCaptureModal';
import { useProjects } from './projects/useProjects';
import { useRates } from './finance/useRates';
import { HEALTH_TONE } from './projects/Projects';
import { PACE_TONE } from './Goals';
import { useHealth } from './health/useHealth';
import { energyForDay } from './health/energyForDay';
const capitalize = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const WEEKDAY = new Intl.DateTimeFormat('pt-BR', { weekday: 'short' });
const shortDay = (d) => `${Number(d.slice(8))}/${d.slice(5, 7)}`;
const I = { size: 16, strokeWidth: 1.5, 'aria-hidden': true };
/** Section card whose header links to the full screen. */
function Tile({ to, title, meta, className = '', children }) {
    return (_jsxs("section", { className: `card glow flex min-w-0 flex-col ${className}`, children: [_jsxs(Link, { to: to, className: "group -mx-1 -mt-1 mb-4 flex items-center gap-2 rounded-[8px] px-1 py-1 focus-visible:ring-2 focus-visible:ring-brand", children: [_jsx("h2", { className: "mr-auto text-[15px] leading-6 font-medium text-fg", children: title }), meta, _jsx(ArrowUpRight, { ...I, className: "text-fg3 transition-colors duration-150 group-hover:text-fg" })] }), children] }));
}
export default function Home() {
    const [heroMode, setHeroMode] = useState('fluxo');
    const tasks = useTable('tasks');
    const habits = useTable('habits');
    const completions = useTable('habit_completions', 'id,habit_id,completed_date,value');
    const reminders = useTable('reminders', '*', { column: 'datetime' });
    const h = useHealth();
    const projects = useProjects();
    const fx = useRates(null);
    const goals = useTable('goals', '*', { column: 'created_at' });
    const entries = useTable('goal_entries', '*', { column: 'date' });
    const banks = useTable('banks');
    const cards = useTable('cards');
    const txs = useTable('transactions');
    const transfers = useTable('transfers');
    const payments = useTable('card_invoice_payments');
    const templates = useTable('transaction_recurring_templates', '*', { column: 'created_at' });
    const skips = useTable('transaction_recurring_skips');
    const habitQueue = useRef(latestPerKey()).current;
    const now = new Date();
    const today = toDay(now);
    const curYear = now.getFullYear();
    const curMonth = now.getMonth() + 1;
    useEffect(() => {
        const refresh = () => {
            void tasks.reload();
            void habits.reload();
            void completions.reload();
            void reminders.reload();
            void txs.reload();
            void h.workouts.reload();
            void h.sets.reload();
            void h.cardio.reload();
            void h.foodLogs.reload();
            void h.waterLogs.reload();
        };
        window.addEventListener('painel-data-changed', refresh);
        return () => window.removeEventListener('painel-data-changed', refresh);
    }, [tasks.reload, habits.reload, completions.reload, reminders.reload, txs.reload, h.workouts.reload, h.sets.reload, h.cardio.reload, h.foodLogs.reload, h.waterLogs.reload]);
    async function toggleTask(task) {
        const completed = !task.completed;
        const completed_at = completed ? new Date().toISOString() : null;
        tasks.setRows((rows) => rows.map((t) => (t.id === task.id ? { ...t, completed, completed_at } : t)));
        const res = await queuedWrite({
            table: 'tasks',
            op: 'update',
            payload: { completed, status: completed ? 'completed' : 'pending', completed_at },
            match: { id: task.id },
            label: task.title,
        });
        if (res === 'saved')
            void tasks.reload();
    }
    function quickHabit(habit) {
        const existing = completions.rows.find((c) => c.habit_id === habit.id && c.completed_date === today);
        const nextVal = nextHabitQuickValue(habit, existing?.value ?? 0);
        completions.setRows((list) => {
            const others = list.filter((c) => !(c.habit_id === habit.id && c.completed_date === today));
            return nextVal > 0
                ? [...others, { id: existing?.id ?? `new-${habit.id}-${today}`, habit_id: habit.id, completed_date: today, value: nextVal }]
                : others;
        });
        void habitQueue(`${habit.id}|${today}`, async () => {
            const res = nextVal <= 0
                ? await queuedWrite({ table: 'habit_completions', op: 'delete', match: { habit_id: habit.id, completed_date: today }, label: habit.name })
                : await queuedWrite({ table: 'habit_completions', op: 'upsert', payload: { habit_id: habit.id, completed_date: today, value: nextVal }, onConflict: 'habit_id,completed_date', label: habit.name });
            if (res === 'saved' && !habitQueue.busy())
                void completions.reload();
        });
    }
    async function toggleReminder(r) {
        reminders.setRows((rows) => rows.map((x) => (x.id === r.id ? { ...x, completed: !r.completed } : x)));
        const res = await queuedWrite({
            table: 'reminders',
            op: 'update',
            payload: { completed: !r.completed },
            match: { id: r.id },
            label: r.title,
        });
        if (res === 'saved')
            void reminders.reload();
    }
    const b = bucketTasks(tasks.rows, now);
    const dueToday = [...b.overdue, ...b.today];
    const doneToday = b.done.filter((t) => t.completed_at && toDay(new Date(t.completed_at)) === today).length;
    const routine = routineFor(habits.rows, today, completions.rows);
    const completionOf = (x) => completions.rows.find((c) => c.habit_id === x.id && c.completed_date === today);
    const done = (x) => isDone(x, completionOf(x));
    const doneHabits = routine.filter(done).length;
    const panel = reminderPanel(reminders.rows, now);
    const next = [...panel.overdue, ...panel.today, ...panel.thisWeek].slice(0, 5);
    const workout = h.workouts.rows.find((w) => w.date === today);
    const summary = workout ? workoutSummary(workout, h.sets.rows, h.workouts.rows, h.typeById) : null;
    const curWeekTraining = weeklyStats(today, 2, h.sets.rows, h.workouts.rows, h.typeById).at(-1);
    const eaten = sumNutrients(h.foodLogs.rows.filter((l) => l.date === today));
    const { burned, target } = energyForDay(h, today);
    const worth = netWorth(banks.rows, txs.rows, transfers.rows, payments.rows, today);
    const worthSeries = useMemo(() => netWorthHistory(banks.rows, txs.rows, transfers.rows, payments.rows, curYear, curMonth, 6, today), [banks.rows, txs.rows, transfers.rows, payments.rows, curYear, curMonth, today]);
    const activeTemplates = useMemo(() => templates.rows.filter((t) => !t.deleted_at), [templates.rows]);
    const cashflow = useMemo(() => projectCashFlow({
        startDay: today,
        days: 30,
        startingBalance: worth,
        templates: activeTemplates,
        txs: txs.rows,
        skips: skips.rows,
        cards: cards.rows,
        payments: payments.rows,
    }), [today, worth, activeTemplates, txs.rows, skips.rows, cards.rows, payments.rows]);
    const habitWeeks = useMemo(() => {
        const active = habits.rows.filter((x) => !x.is_archived);
        return Array.from({ length: 8 }, (_, i) => {
            const w = weekOf(addDays(today, -7 * (7 - i)));
            const perfect = w.filter((d) => d <= today && isPerfectDay(active, completions.rows, d)).length;
            return { label: shortDay(w[0]), value: perfect };
        });
    }, [habits.rows, completions.rows, today]);
    const totalActions = doneToday + dueToday.length + routine.length;
    const completedActions = doneToday + doneHabits;
    const dayExecPct = totalActions > 0 ? Math.round((completedActions / totalActions) * 100) : 100;
    const taskTotal = doneToday + dueToday.length;
    const taskPct = taskTotal > 0 ? Math.round((doneToday / taskTotal) * 100) : 100;
    const habitPct = routine.length > 0 ? Math.round((doneHabits / routine.length) * 100) : 100;
    const kcalPct = target && target.kcal > 0 ? Math.min(100, Math.round((eaten.kcal / target.kcal) * 100)) : 0;
    const activeProjects = projects.projects.rows.filter((p) => !p.is_template && !p.archived_at && (p.status === 'active' || p.status === 'planning'));
    const projectPct = (id) => projectProgress(projects.tasksOf(id), projects.stepsOf(id)).pct;
    const avgProjectPct = activeProjects.length
        ? Math.round(activeProjects.reduce((s, p) => s + projectPct(p.id), 0) / activeProjects.length)
        : 0;
    const projectList = projectRows(projects.projects.rows, (p) => projectPct(p.id), today);
    const bankById = new Map(banks.rows.map((x) => [x.id, x]));
    const balanceBrlOf = (id) => {
        const bank = bankById.get(id);
        return bank ? bankBalance(bank, txs.rows, transfers.rows, payments.rows) : 0;
    };
    const goalList = goalRows(goals.rows, (g) => currentValue(g, {
        entries: entries.rows, habits: habits.rows, completions: completions.rows,
        projectPct: g.linked_project_id ? projectPct(g.linked_project_id) : undefined,
        bankBalance: sumLinkedAccountsInGoalCurrency(g, banks.rows, balanceBrlOf, fx.rates),
    }), today);
    const loadingProjects = projects.projects.loading || projects.tasks.loading || projects.steps.loading || projects.links.loading;
    const loadingGoals = goals.loading || entries.loading || banks.loading || txs.loading;
    const loadingFinance = banks.loading || txs.loading;
    const loadingTasks = tasks.loading;
    const loadingHabits = habits.loading || completions.loading;
    const loadingFood = h.foodLogs.loading;
    const ready = !loadingTasks && !loadingHabits && !loadingFood;
    const headline = dayHeadline({
        tasksLeft: dueToday.length,
        habitsLeft: routine.length - doneHabits,
        kcalLeft: target ? target.kcal - eaten.kcal : null,
    }).replace(/\.$/, '');
    const heroSwitch = (_jsxs("div", { className: "segmented", role: "tablist", "aria-label": "Gr\u00E1fico principal", children: [_jsx("button", { type: "button", role: "tab", "aria-selected": heroMode === 'fluxo', className: heroMode === 'fluxo' ? 'tab-active' : 'tab', onClick: () => setHeroMode('fluxo'), children: "Fluxo 30d" }), _jsx("button", { type: "button", role: "tab", "aria-selected": heroMode === 'patrimonio', className: heroMode === 'patrimonio' ? 'tab-active' : 'tab', onClick: () => setHeroMode('patrimonio'), children: "Patrim\u00F4nio" }), _jsx("button", { type: "button", role: "tab", "aria-selected": heroMode === 'habitos', className: heroMode === 'habitos' ? 'tab-active' : 'tab', onClick: () => setHeroMode('habitos'), children: "H\u00E1bitos" })] }));
    const weekDaysStrip = weekOf(today);
    return (_jsxs(_Fragment, { children: [_jsxs("header", { className: "mb-6", children: [_jsxs("h1", { className: "display", children: [capitalize(formatDay(today)), ' ', _jsx("span", { className: "font-normal text-fg3", children: curYear })] }), ready
                        ? _jsx("p", { className: "mt-2 text-sm text-fg2", children: headline })
                        : _jsx("div", { className: "mt-2", "aria-busy": "true", "aria-label": "Carregando", children: _jsx(Skeleton, { className: "h-5 w-64" }) })] }), _jsxs("div", { className: "stagger mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4", children: [_jsxs(Link, { to: "/habitos", className: "card glow flex flex-col justify-between", children: [_jsx("div", { className: "label", children: "Ritmo de hoje" }), _jsx("div", { className: "figure mt-3 text-[28px] leading-none font-medium text-fg", children: ready ? `${dayExecPct}%` : '—' }), _jsxs("div", { className: "figure mt-3 text-xs text-fg3", children: [completedActions, " de ", totalActions, " conclu\u00EDdos"] })] }), _jsxs(Link, { to: "/financas", className: "card glow flex flex-col justify-between", children: [_jsx("div", { className: "label", children: "Patrim\u00F4nio total" }), _jsx("div", { className: "figure mt-3 truncate text-[28px] leading-none font-medium text-fg", children: loadingFinance ? '—' : money(worth) }), _jsxs("div", { className: "mt-3 text-xs text-fg3", children: [banks.rows.length, " ", plural(banks.rows.length, 'conta ativa', 'contas ativas')] })] }), _jsxs(Link, { to: "/projetos", className: "card glow flex flex-col justify-between", children: [_jsx("div", { className: "label", children: "Projetos em curso" }), _jsx("div", { className: "figure mt-3 text-[28px] leading-none font-medium text-fg", children: loadingProjects ? '—' : activeProjects.length }), _jsxs("div", { className: "figure mt-3 text-xs text-fg3", children: ["m\u00E9dia ", avgProjectPct, "% conclu\u00EDdo"] })] }), _jsxs(Link, { to: "/saude", className: "card glow flex flex-col justify-between", children: [_jsx("div", { className: "label", children: h.latestWeight ? 'Peso atual' : 'Saúde hoje' }), _jsx("div", { className: "figure mt-3 truncate text-[28px] leading-none font-medium text-fg", children: h.latestWeight ? `${num(h.latestWeight)} kg` : summary ? `${num(summary.tonnage)} kg` : `${num(eaten.kcal)} kcal` }), _jsx("div", { className: "mt-3 text-xs text-fg3", children: burned > 0
                                    ? `~${num(burned)} kcal gastas hoje · ${curWeekTraining?.sessions ?? 1} na sem.`
                                    : curWeekTraining
                                        ? `${curWeekTraining.sessions} ${plural(curWeekTraining.sessions, 'treino', 'treinos')} na semana`
                                        : 'sem treinos na semana' })] })] }), _jsxs("div", { className: "stagger mb-6 grid grid-cols-1 gap-4 xl:grid-cols-12", children: [_jsxs("div", { className: "min-w-0 xl:col-span-8", children: [heroMode === 'fluxo' && (_jsx(AreaChart, { title: "Previs\u00E3o de fluxo de caixa", subtitle: `Saldo projetado em 30 dias: ${money(cashflow.endingBalance)} (${cashflow.netChange >= 0 ? '+' : '−'}${money(Math.abs(cashflow.netChange))})`, unit: symbolOf(displayCurrency()), height: 288, aside: heroSwitch, tone: "var(--brand)", deltaContext: "em 30 dias", points: cashflow.points.map((pt) => ({
                                    label: shortDay(pt.day),
                                    value: conv(pt.balance),
                                    detail: pt.events.length ? pt.events.map((e) => `${e.amount >= 0 ? '+' : '−'}${money(Math.abs(e.amount))} ${e.label}`).join(' · ') : undefined,
                                })) })), heroMode === 'patrimonio' && (_jsx(AreaChart, { title: "Evolu\u00E7\u00E3o do patrim\u00F4nio", subtitle: "Saldo consolidado ao final de cada m\u00EAs", unit: symbolOf(displayCurrency()), minZero: false, height: 288, aside: heroSwitch, tone: "var(--positive)", deltaContext: "em 6 meses", points: worthSeries.map((p) => ({
                                    label: `${monthName(p.month).slice(0, 3)}/${String(p.year).slice(2)}`,
                                    value: conv(p.value),
                                    detail: `em ${shortDay(p.date)}`,
                                })) })), heroMode === 'habitos' && (_jsx(ColumnChart, { title: "Dias perfeitos por semana", subtitle: "\u00DAltimas 8 semanas de const\u00E2ncia", unit: "dias", height: 288, aside: heroSwitch, points: habitWeeks }))] }), _jsxs("section", { className: "card flex min-w-0 flex-col justify-between xl:col-span-4", children: [_jsxs("div", { children: [_jsxs("div", { className: "flex items-center justify-between", children: [_jsx("h2", { className: "text-[15px] leading-6 font-medium text-fg", children: "Foco do dia" }), _jsxs("span", { className: "figure text-xs text-fg3", children: [completedActions, "/", totalActions] })] }), _jsx("p", { className: "mt-1 text-xs text-fg3", children: "Execu\u00E7\u00E3o combinada de tarefas e h\u00E1bitos" }), _jsxs("div", { className: "mt-6 flex items-baseline gap-2", children: [_jsxs("span", { className: "figure text-[32px] leading-none font-medium text-fg", children: [dayExecPct, "%"] }), _jsx("span", { className: "text-xs text-fg3", children: "conclu\u00EDdo hoje" })] }), _jsx("div", { className: "mt-4 h-1.5 overflow-hidden rounded-full bg-raised", role: "progressbar", "aria-valuenow": dayExecPct, "aria-valuemin": 0, "aria-valuemax": 100, "aria-label": "Progresso do dia", children: _jsx("div", { className: "h-full rounded-full bg-brand", style: { width: `${dayExecPct}%` } }) })] }), _jsxs("div", { className: "mt-6 space-y-4 border-t border-line pt-5", children: [_jsxs("div", { children: [_jsxs("div", { className: "mb-1.5 flex items-center justify-between text-xs", children: [_jsx("span", { className: "text-fg2", children: "Tarefas" }), _jsxs("span", { className: "figure text-fg", children: [doneToday, "/", taskTotal] })] }), _jsx("div", { className: "h-1 overflow-hidden rounded-full bg-raised", children: _jsx("div", { className: "h-full rounded-full bg-fg", style: { width: `${taskPct}%` } }) })] }), _jsxs("div", { children: [_jsxs("div", { className: "mb-1.5 flex items-center justify-between text-xs", children: [_jsx("span", { className: "text-fg2", children: "H\u00E1bitos" }), _jsxs("span", { className: "figure text-fg", children: [doneHabits, "/", routine.length] })] }), _jsx("div", { className: "h-1 overflow-hidden rounded-full bg-raised", children: _jsx("div", { className: "h-full rounded-full bg-fg2", style: { width: `${habitPct}%` } }) })] }), _jsxs("div", { children: [_jsxs("div", { className: "mb-1.5 flex items-center justify-between text-xs", children: [_jsx("span", { className: "text-fg2", children: "Energia registrada" }), _jsxs("span", { className: "figure text-fg", children: [num(eaten.kcal), target ? ` / ${num(target.kcal)}` : '', " kcal"] })] }), _jsx("div", { className: "h-1 overflow-hidden rounded-full bg-raised", children: _jsx("div", { className: "h-full rounded-full bg-fg3", style: { width: `${kcalPct}%` } }) })] })] })] })] }), _jsxs("div", { className: "stagger mb-6 grid grid-cols-1 gap-4 lg:grid-cols-12", children: [_jsx(Tile, { to: "/tarefas", title: "Para hoje", className: "lg:col-span-5", meta: !loadingTasks && _jsxs("span", { className: "figure text-xs text-fg3", children: [doneToday, " de ", taskTotal] }), children: loadingTasks ? (_jsx("div", { className: "space-y-3", children: [70, 52, 64].map((w) => _jsx(Skeleton, { className: "h-4", style: { width: `${w}%` } }, w)) })) : dueToday.length === 0 ? (_jsx(Empty, { icon: _jsx(CheckSquare, { size: 18, strokeWidth: 1.5 }), action: _jsx("button", { type: "button", className: "btn-secondary", onClick: () => openQuickCapture('task'), children: "Adicionar tarefa" }), children: "Nenhuma tarefa pendente para hoje" })) : (_jsx("ul", { children: dueToday.slice(0, 6).map((t) => {
                                const late = b.overdue.includes(t);
                                return (_jsxs("li", { className: "flex h-10 items-center gap-3 border-b border-line text-sm last:border-0", children: [_jsx("input", { type: "checkbox", className: "h-4 w-4 shrink-0 cursor-pointer", checked: t.completed, onChange: () => void toggleTask(t), "aria-label": `Concluir ${t.title}` }), _jsx("span", { className: `h-1.5 w-1.5 shrink-0 rounded-full ${t.priority === 'high' ? 'bg-negative' : t.priority === 'medium' ? 'bg-warning' : 'bg-fg3/50'}`, "aria-hidden": "true" }), _jsx(Link, { to: "/tarefas", className: "mr-auto min-w-0 truncate text-fg hover:underline", children: t.title }), late ? _jsx("span", { className: "text-xs text-negative", children: "atrasada" })
                                            : t.due_date && !t.due_all_day && _jsx("span", { className: "figure shrink-0 text-xs text-fg3", children: formatTime(t.due_date) })] }, t.id));
                            }) })) }), _jsx(Tile, { to: "/habitos", title: "H\u00E1bitos de hoje", className: "lg:col-span-4", meta: !loadingHabits && _jsxs("span", { className: "figure text-xs text-fg3", children: [doneHabits, "/", routine.length] }), children: loadingHabits ? _jsx(Skeleton, { className: "h-12 w-full" }) : (_jsx("ul", { className: "space-y-1 text-sm", children: routine.slice(0, 6).map((x) => {
                                const isComplete = done(x);
                                const c = completionOf(x);
                                const val = c?.value ?? 0;
                                const showProgress = (x.habit_type === 'quantity' || x.habit_type === 'duration') && x.target_value;
                                return (_jsx("li", { children: _jsxs("button", { type: "button", onClick: () => quickHabit(x), "aria-pressed": isComplete, className: "flex h-9 w-full items-center gap-3 rounded-[8px] px-2 text-left transition-colors duration-150 hover:bg-raised", children: [_jsx("span", { className: `flex h-4 w-4 shrink-0 items-center justify-center rounded-[4px] border transition-colors duration-150 ${isComplete ? 'border-positive bg-positive text-primary-ink' : 'border-line-strong'}`, children: isComplete && _jsx(Check, { size: 12, strokeWidth: 2, "aria-hidden": "true" }) }), _jsx("span", { className: `min-w-0 flex-1 truncate ${isComplete ? 'text-fg3 line-through' : 'text-fg'}`, children: x.name }), showProgress && (_jsxs("span", { className: "figure shrink-0 text-xs text-fg3", children: [num(val), "/", num(x.target_value)] }))] }) }, x.id));
                            }) })) }), _jsxs(Tile, { to: "/lembretes", title: "Agenda da semana", className: "lg:col-span-3", children: [_jsx("div", { className: "mb-4 grid grid-cols-7 gap-1 text-center", children: weekDaysStrip.map((d) => {
                                    const isToday = d === today;
                                    const wd = capitalize(WEEKDAY.format(new Date(`${d}T12:00:00`)).replace('.', '').slice(0, 1));
                                    return (_jsxs("div", { className: `flex flex-col items-center rounded-[8px] py-2 ${isToday ? 'border border-line-strong bg-raised text-fg' : 'bg-sunken/70 text-fg3'}`, children: [_jsx("span", { className: "text-xs leading-4", children: wd }), _jsx("span", { className: "figure mt-0.5 text-xs font-medium", children: Number(d.slice(8)) }), _jsx("span", { className: `mt-1 h-1.5 w-1.5 rounded-full ${isToday ? 'bg-brand' : 'bg-transparent'}`, "aria-hidden": "true" })] }, d));
                                }) }), reminders.loading ? (_jsx("div", { className: "space-y-3", children: [60, 45, 52].map((w) => _jsx(Skeleton, { className: "h-4", style: { width: `${w}%` } }, w)) })) : next.length === 0 ? _jsx(Empty, { icon: _jsx(Bell, { size: 18, strokeWidth: 1.5 }), children: "Nenhum lembrete pr\u00F3ximo" }) : (_jsx("ol", { className: "space-y-1 text-sm", children: next.map((r) => {
                                    const late = panel.overdue.includes(r);
                                    return (_jsxs("li", { className: "flex h-9 items-center gap-2 rounded-[8px] px-2 hover:bg-raised/60", children: [_jsx("input", { type: "checkbox", className: "h-4 w-4 shrink-0 cursor-pointer", checked: r.completed, onChange: () => void toggleReminder(r), "aria-label": `Concluir lembrete ${r.title}` }), _jsx("span", { className: "min-w-0 flex-1 truncate text-xs text-fg", children: r.title }), _jsx("span", { className: `figure shrink-0 text-xs ${late ? 'text-negative' : 'text-fg3'}`, children: formatTime(r.datetime) })] }, r.id));
                                }) }))] })] }), _jsxs("div", { className: "stagger grid grid-cols-1 gap-4 lg:grid-cols-12", children: [_jsx(Tile, { to: "/projetos", title: "Projetos em andamento", className: "lg:col-span-8", meta: projectList.more > 0 && _jsxs("span", { className: "figure text-xs text-fg3", children: ["+", projectList.more] }), children: loadingProjects ? (_jsx("div", { className: "grid gap-4 sm:grid-cols-3", children: [0, 1, 2].map((i) => _jsx(Skeleton, { className: "h-36 w-full rounded-[10px]" }, i)) })) : projectList.rows.length === 0 ? _jsx(Empty, { icon: _jsx(FolderKanban, { size: 18, strokeWidth: 1.5 }), children: "Nenhum projeto em andamento" }) : (_jsx("ul", { className: "grid gap-4 sm:grid-cols-3", children: projectList.rows.map((r) => {
                                const plan = projectUpcomingPlan(projects.stepsOf(r.id), projects.tasksOf(r.id), 1, 2, 2);
                                const firstStep = plan.nextSteps[0];
                                return (_jsx("li", { className: "min-w-0", children: _jsxs(Link, { to: `/projetos?p=${r.id}`, className: "group flex h-full flex-col rounded-[10px] border border-line bg-sunken/50 p-4 transition-colors duration-150 hover:border-line-strong", children: [_jsxs("div", { className: "flex items-center justify-between gap-2 text-xs text-fg3", children: [_jsxs("span", { className: "inline-flex items-center gap-2 truncate", children: [_jsx("span", { className: "h-1.5 w-1.5 shrink-0 rounded-full", style: { background: r.color }, "aria-hidden": "true" }), _jsx("span", { children: r.dueText ? `Prazo ${r.dueText}` : 'Sem prazo' })] }), _jsxs("span", { className: "figure font-medium text-fg", children: [r.pct, "%"] })] }), _jsx("div", { className: "mt-3 h-1 overflow-hidden rounded-full bg-raised", children: _jsx("div", { className: "h-full rounded-full", style: { width: `${Math.max(r.pct, 0)}%`, background: r.color } }) }), _jsx("div", { className: "mt-3 truncate text-sm font-medium text-fg group-hover:underline", children: r.name }), _jsx("div", { className: "mt-1 text-xs", children: _jsx("span", { className: HEALTH_TONE[r.health], children: HEALTH_LABEL[r.health] }) }), _jsx("div", { className: "mt-4 flex-1 border-t border-line pt-3 text-xs text-fg3", children: firstStep ? (_jsxs(_Fragment, { children: [_jsx("div", { className: "truncate font-medium text-fg2", children: firstStep.step.title }), firstStep.substeps.map((sub) => (_jsxs("div", { className: "mt-1 truncate pl-2 text-xs text-fg3", children: ["\u00B7 ", sub.title] }, sub.id)))] })) : plan.looseSubsteps.length > 0 ? (plan.looseSubsteps.map((sub) => (_jsxs("div", { className: "truncate text-xs text-fg3", children: ["\u00B7 ", sub.title] }, sub.id)))) : (_jsx("span", { children: "Abrir para definir etapas" })) })] }) }, r.id));
                            }) })) }), _jsx(Tile, { to: "/metas", title: "Metas ativas", className: "lg:col-span-4", meta: goalList.more > 0 && _jsxs("span", { className: "figure text-xs text-fg3", children: ["+", goalList.more] }), children: loadingGoals ? (_jsx("div", { className: "space-y-3", children: [0, 1, 2].map((i) => _jsx(Skeleton, { className: "h-12 w-full" }, i)) })) : goalList.rows.length === 0 ? _jsx(Empty, { icon: _jsx(Target, { size: 18, strokeWidth: 1.5 }), children: "Nenhuma meta ativa" }) : (_jsx("ul", { className: "space-y-3", children: goalList.rows.map((r) => (_jsx("li", { children: _jsxs(Link, { to: "/metas", className: "group block rounded-[10px] border border-line bg-sunken/50 p-3 transition-colors duration-150 hover:border-line-strong", children: [_jsxs("div", { className: "flex items-center justify-between gap-2", children: [_jsx("span", { className: "truncate text-sm font-medium text-fg group-hover:underline", children: r.title }), _jsxs("span", { className: "figure shrink-0 text-xs font-medium text-fg2", children: [r.pct, "%"] })] }), _jsx("div", { className: "mt-2 h-1 overflow-hidden rounded-full bg-raised", children: _jsx("div", { className: "h-full rounded-full bg-brand", style: { width: `${Math.max(r.pct, 0)}%` } }) }), _jsxs("p", { className: "mt-2 truncate text-xs text-fg3", children: [_jsx("span", { className: PACE_TONE[r.pace], children: PACE_LABEL[r.pace] }), r.valueText && _jsxs(_Fragment, { children: [' · ', _jsx("span", { className: "figure", children: r.valueText })] })] })] }) }, r.id))) })) })] })] }));
}
