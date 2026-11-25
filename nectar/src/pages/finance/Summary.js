import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useMemo, useState } from 'react';
import { CalendarClock, Gauge, Plus, Receipt } from 'lucide-react';
import { CURRENCIES, conv, displayCurrency, money, symbolOf } from '../../lib/money';
import { formatDay, monthName, toDay } from '../../lib/dates';
import { EXPENSE_CATEGORIES, bankBalance, byCategory, cardUsed, dailyExpenses, invoices, monthKey, monthSummary, netWorth, netWorthHistory, recurringInMonth, } from '../../lib/finance';
import { evaluateBudgets, projectCashFlow } from '../../lib/cashflow';
import { supabase } from '../../lib/supabase';
import { write } from '../../lib/useTable';
import { AreaChart, ColumnChart, DonutChart } from '../../components/Charts';
import { Empty, Field, FieldGroup, Figure, Modal, Skeleton } from '../../components/ui';
import { useRates } from './useRates';
const BUDGET_BADGE = {
    ok: { label: 'No ritmo', cls: 'text-positive', bar: 'bg-brand' },
    warn: { label: 'Atenção', cls: 'text-warning', bar: 'bg-warning' },
    over: { label: 'Acima do limite', cls: 'text-negative', bar: 'bg-negative' },
};
const CARD_FINISHES = [
    'linear-gradient(155deg, #27272b 0%, #18181b 55%, #111113 100%)',
    'linear-gradient(155deg, #22262b 0%, #16191d 55%, #101215 100%)',
    'linear-gradient(155deg, #282623 0%, #1a1816 55%, #121110 100%)',
];
const shortDay = (d) => `${Number(d.slice(8))}/${d.slice(5, 7)}`;
function MetallicChip() {
    return (_jsxs("svg", { width: "34", height: "24", viewBox: "0 0 34 24", "aria-hidden": "true", children: [_jsx("rect", { x: "0.5", y: "0.5", width: "33", height: "23", rx: "4.5", fill: "#a1a1aa", fillOpacity: "0.22", stroke: "#a1a1aa", strokeOpacity: "0.55", strokeWidth: "1" }), _jsx("path", { d: "M11 1v22M23 1v22M1 9h10M23 9h10M1 15h10M23 15h10", stroke: "#e4e4e7", strokeOpacity: "0.4", strokeWidth: "1" })] }));
}
export default function Summary({ f, year, month, onPay }) {
    const [editingBudget, setEditingBudget] = useState(null);
    const [mainChart, setMainChart] = useState('fluxo');
    const [donutMode, setDonutMode] = useState('auto');
    const fx = useRates(null);
    const today = toDay(new Date());
    const occ = recurringInMonth(f.activeTemplates, f.txs.rows, f.skips.rows, year, month);
    const s = monthSummary(f.txs.rows, occ, year, month);
    const worth = netWorth(f.banks.rows, f.txs.rows, f.transfers.rows, f.payments.rows, today);
    const daily = dailyExpenses(f.txs.rows, year, month);
    const categories = byCategory(f.txs.rows, 'expense', year, month);
    const budgetRows = evaluateBudgets(f.budgets.rows, f.txs.rows, year, month, today, fx.rates);
    const key = monthKey(year, month);
    const dueInvoices = f.cards.rows.flatMap((c) => invoices(c, f.txs.rows, f.payments.rows).filter((i) => !i.paid && monthKey(i.year, i.month) === key).map((i) => ({ card: c, i })));
    const toPay = [
        ...occ.filter((o) => !o.paid && !o.skipped && o.template.type === 'expense').map((o) => ({ key: `r${o.template.id}${o.date}`, date: o.date, label: o.template.description, amount: o.template.amount, action: () => onPay({ template_id: o.template.id, date: o.date }) })),
        ...f.txs.rows.filter((t) => t.is_pending && t.type === 'expense' && t.date.startsWith(key)).map((t) => ({ key: t.id, date: t.date, label: t.description, amount: t.amount, action: undefined })),
        ...dueInvoices.map(({ card, i }) => ({ key: `i${card.id}${i.month}`, date: i.dueDate, label: `Fatura ${card.name}`, amount: i.total, action: undefined })),
    ].sort((a, b) => a.date.localeCompare(b.date));
    const projection = useMemo(() => projectCashFlow({
        startDay: today,
        days: 30,
        startingBalance: worth,
        templates: f.activeTemplates,
        txs: f.txs.rows,
        skips: f.skips.rows,
        cards: f.cards.rows,
        payments: f.payments.rows,
    }), [today, worth, f.activeTemplates, f.txs.rows, f.skips.rows, f.cards.rows, f.payments.rows]);
    const worthCurve = useMemo(() => netWorthHistory(f.banks.rows, f.txs.rows, f.transfers.rows, f.payments.rows, year, month, 6, today), [f.banks.rows, f.txs.rows, f.transfers.rows, f.payments.rows, year, month, today]);
    const saveRate = s.income > 0 ? Math.max(0, Math.min(100, Math.round((s.leftover / s.income) * 100))) : 0;
    const accountRows = f.banks.rows.map((b) => ({
        bank: b,
        balance: bankBalance(b, f.txs.rows, f.transfers.rows, f.payments.rows, today),
    }));
    const positiveSum = accountRows.reduce((acc, r) => acc + Math.max(0, r.balance), 0);
    const bankSlices = accountRows.map((r) => ({
        label: r.bank.name,
        value: Math.max(0, r.balance),
        color: r.bank.color || undefined,
    }));
    const effectiveDonut = donutMode === 'auto' ? (categories.length > 0 ? 'categorias' : 'contas') : donutMode;
    const chartSwitch = (_jsxs("div", { className: "segmented", role: "tablist", "aria-label": "Tipo de gr\u00E1fico", children: [_jsx("button", { type: "button", role: "tab", "aria-selected": mainChart === 'fluxo', className: mainChart === 'fluxo' ? 'tab-active' : 'tab', onClick: () => setMainChart('fluxo'), children: "Fluxo 30d" }), _jsx("button", { type: "button", role: "tab", "aria-selected": mainChart === 'patrimonio', className: mainChart === 'patrimonio' ? 'tab-active' : 'tab', onClick: () => setMainChart('patrimonio'), children: "Patrim\u00F4nio" }), _jsx("button", { type: "button", role: "tab", "aria-selected": mainChart === 'diario', className: mainChart === 'diario' ? 'tab-active' : 'tab', onClick: () => setMainChart('diario'), children: "Dia a dia" })] }));
    const donutSwitch = (_jsxs("div", { className: "segmented", role: "tablist", "aria-label": "Vis\u00E3o do gr\u00E1fico de pizza", children: [_jsx("button", { type: "button", role: "tab", "aria-selected": effectiveDonut === 'contas', className: effectiveDonut === 'contas' ? 'tab-active' : 'tab', onClick: () => setDonutMode('contas'), children: "Contas" }), _jsx("button", { type: "button", role: "tab", "aria-selected": effectiveDonut === 'categorias', className: effectiveDonut === 'categorias' ? 'tab-active' : 'tab', onClick: () => setDonutMode('categorias'), children: "Gastos" })] }));
    return (_jsxs(_Fragment, { children: [_jsxs("section", { className: "mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4", "aria-label": "Resumo do m\u00EAs", children: [_jsxs("div", { className: "card flex min-w-0 flex-col justify-between", children: [_jsx("div", { className: "label", children: "Patrim\u00F4nio total" }), f.loading ? _jsx(Skeleton, { className: "mt-3 h-7 w-32" }) : (_jsx(Figure, { value: money(worth), className: "mt-3 block truncate text-[28px] leading-none font-medium text-fg" })), _jsxs("div", { className: "mt-3 text-xs text-fg3", children: [f.banks.rows.length, " ", f.banks.rows.length === 1 ? 'conta ativa' : 'contas ativas', " \u00B7 hoje"] })] }), _jsxs("div", { className: "card flex min-w-0 flex-col justify-between", children: [_jsx("div", { className: "label", children: "Entra no m\u00EAs" }), f.loading ? _jsx(Skeleton, { className: "mt-3 h-7 w-28" }) : (_jsx(Figure, { value: money(s.income), className: "mt-3 block truncate text-[28px] leading-none font-medium text-fg" })), _jsxs("div", { className: "mt-3 text-xs text-fg3", children: [money(s.received), " recebido \u00B7 ", money(s.toReceive), " a receber"] })] }), _jsxs("div", { className: "card flex min-w-0 flex-col justify-between", children: [_jsx("div", { className: "label", children: "Sai no m\u00EAs" }), f.loading ? _jsx(Skeleton, { className: "mt-3 h-7 w-28" }) : (_jsx(Figure, { value: money(s.expense), className: "mt-3 block truncate text-[28px] leading-none font-medium text-fg" })), _jsxs("div", { className: "mt-3 text-xs text-fg3", children: [money(s.spent), " pago \u00B7 ", money(s.toSpend), " previsto"] })] }), _jsxs("div", { className: "card flex min-w-0 flex-col justify-between", children: [_jsx("div", { className: "label", children: "Sobra do m\u00EAs" }), f.loading ? _jsx(Skeleton, { className: "mt-3 h-7 w-28" }) : (_jsx(Figure, { value: money(s.leftover), className: `mt-3 block truncate text-[28px] leading-none font-medium ${s.leftover < 0 ? 'text-negative' : 'text-fg'}` })), _jsx("div", { className: "figure mt-3 text-xs text-fg3", children: s.income > 0 ? _jsxs("span", { className: s.leftover >= 0 ? 'text-positive' : 'text-negative', children: [saveRate, "% da entrada"] }) : 'sem entradas no mês' })] })] }), _jsxs("div", { className: "mb-6 grid gap-4 xl:grid-cols-[minmax(0,1.45fr)_minmax(0,1fr)]", children: [_jsxs("div", { className: "min-w-0", children: [mainChart === 'fluxo' && (_jsx(AreaChart, { title: "Previs\u00E3o de fluxo de caixa", subtitle: `Previsto em 30 dias: ${money(projection.endingBalance)} · menor saldo ${money(projection.minBalance)}`, unit: symbolOf(displayCurrency()), height: 292, aside: chartSwitch, tone: "var(--brand)", deltaContext: "em 30 dias", points: projection.points.map((pt) => ({
                                    label: shortDay(pt.day),
                                    value: conv(pt.balance),
                                    detail: pt.events.length ? pt.events.map((e) => `${e.amount >= 0 ? '+' : '−'}${money(Math.abs(e.amount))} ${e.label}`).join(' · ') : undefined,
                                })) })), mainChart === 'patrimonio' && (_jsx(AreaChart, { title: "Evolu\u00E7\u00E3o do patrim\u00F4nio", subtitle: "Saldo consolidado ao final de cada m\u00EAs", unit: symbolOf(displayCurrency()), minZero: false, height: 292, aside: chartSwitch, tone: "var(--positive)", deltaContext: "em 6 meses", points: worthCurve.map((p) => ({
                                    label: `${monthName(p.month).slice(0, 3)}/${String(p.year).slice(2)}`,
                                    value: conv(p.value),
                                    detail: `em ${shortDay(p.date)}`,
                                })) })), mainChart === 'diario' && (_jsx(ColumnChart, { title: "Dia a dia", subtitle: "Sa\u00EDdas registradas em cada dia do m\u00EAs; hoje em destaque", unit: symbolOf(displayCurrency()), height: 292, highlightLast: false, aside: chartSwitch, highlight: today.startsWith(key) ? Number(today.slice(8, 10)) - 1 : -1, points: daily.map((d) => ({ label: String(d.day), value: conv(d.amount) })) }))] }), _jsx(DonutChart, { title: effectiveDonut === 'contas' ? 'Alocação do patrimônio' : 'Para onde foi', subtitle: effectiveDonut === 'contas' ? 'Distribuição do saldo entre suas contas' : 'Saídas por categoria neste mês', centerLabel: effectiveDonut === 'contas' ? 'Contas' : 'Saídas', format: money, maxSlices: 6, size: 136, aside: donutSwitch, emptyText: effectiveDonut === 'contas' ? 'Cadastre contas na aba Contas' : 'As categorias aparecem quando houver saídas no mês', rows: effectiveDonut === 'contas'
                            ? bankSlices
                            : categories.map((c) => ({ label: c.category, value: c.amount })) })] }), accountRows.length > 0 && (_jsxs("section", { className: "mb-6", "aria-label": "Suas contas", children: [_jsxs("div", { className: "mb-3 flex items-center justify-between", children: [_jsx("h2", { className: "text-[15px] leading-6 font-medium text-fg", children: "Carteiras e contas" }), _jsxs("span", { className: "figure text-xs text-fg3", children: [accountRows.length, " ", accountRows.length === 1 ? 'conta' : 'contas'] })] }), _jsx("ul", { className: "grid gap-4 sm:grid-cols-2 lg:grid-cols-3", children: accountRows.map(({ bank: b, balance }, idx) => {
                            const share = positiveSum > 0 && balance > 0 ? Math.round((balance / positiveSum) * 100) : 0;
                            return (_jsxs("li", { className: "relative flex min-h-[156px] min-w-0 flex-col justify-between overflow-hidden rounded-[14px] p-5 text-[#ededed]", style: {
                                    background: CARD_FINISHES[idx % CARD_FINISHES.length],
                                    boxShadow: 'inset 0 1px 0 rgb(255 255 255 / 0.14), 0 0 0 1px rgb(255 255 255 / 0.08)',
                                }, children: [_jsxs("div", { className: "flex items-center justify-between gap-2", children: [_jsxs("span", { className: "inline-flex min-w-0 items-center gap-2 text-sm font-medium text-[#ededed]", children: [_jsx("span", { className: "h-2 w-2 shrink-0 rounded-full", style: { background: b.color || 'var(--brand)' }, "aria-hidden": "true" }), _jsx("span", { className: "truncate", children: b.name })] }), _jsx("span", { className: "rounded-[4px] border border-white/12 bg-white/6 px-2 py-0.5 font-mono text-[11px] leading-4 text-[#a1a1a6]", children: b.currency ?? 'BRL' })] }), _jsxs("div", { className: "my-3 flex items-center justify-between gap-4", children: [_jsx(MetallicChip, {}), _jsx(Figure, { value: money(balance), className: "truncate text-[24px] leading-none font-medium text-[#ededed]" })] }), _jsxs("div", { className: "flex items-center gap-3", children: [_jsx("div", { className: "h-1 flex-1 overflow-hidden rounded-full bg-white/10", children: _jsx("div", { className: "h-full rounded-full", style: { width: `${share}%`, background: b.color || '#ededed' } }) }), _jsxs("span", { className: "figure text-xs text-[#a1a1a6]", children: [share, "% do total"] })] })] }, b.id));
                        }) })] })), _jsxs("section", { className: "card mb-6", "aria-label": "Or\u00E7amento por categoria", children: [_jsxs("div", { className: "mb-4 flex flex-wrap items-center gap-2", children: [_jsxs("div", { className: "mr-auto", children: [_jsx("div", { className: "font-medium", children: "Or\u00E7amento por categoria" }), _jsxs("div", { className: "text-[13px] text-fg3", children: ["Limites mensais com marcador de ritmo", budgetRows[0] && budgetRows[0].expectedPct > 0 && budgetRows[0].expectedPct < 100 ? ` · hoje em ${budgetRows[0].expectedPct}% do mês` : ''] })] }), _jsxs("button", { type: "button", className: "btn-secondary h-9", onClick: () => setEditingBudget({ currency: displayCurrency() }), children: [_jsx(Plus, { size: 15, strokeWidth: 1.6, "aria-hidden": "true" }), "Definir limite"] })] }), budgetRows.length === 0 ? (_jsx(Empty, { icon: _jsx(Gauge, { size: 18, strokeWidth: 1.5 }), children: "Defina tetos mensais para categorias como Mercado, Alimenta\u00E7\u00E3o ou Lazer e acompanhe o ritmo de gasto no m\u00EAs." })) : (_jsx("ul", { className: "grid gap-4 md:grid-cols-2 xl:grid-cols-3", children: budgetRows.map((r) => {
                            const meta = BUDGET_BADGE[r.status];
                            return (_jsx("li", { className: "min-w-0", children: _jsxs("button", { type: "button", onClick: () => setEditingBudget(r.budget), className: "flex w-full min-w-0 flex-col rounded-xl border border-line bg-raised/40 p-3.5 text-left transition-colors hover:bg-raised/70 focus-visible:ring-2 focus-visible:ring-brand", children: [_jsxs("div", { className: "mb-1.5 flex w-full min-w-0 items-center gap-2", children: [_jsx("span", { className: "mr-auto truncate text-sm font-medium", children: r.budget.category }), _jsx("span", { className: `badge ${meta.cls}`, children: meta.label })] }), _jsxs("div", { className: "mb-2 flex flex-wrap items-baseline gap-x-2 text-xs", children: [_jsx("span", { className: "figure text-sm font-medium text-fg", children: money(r.spentBrl) }), _jsxs("span", { className: "figure text-fg3", children: ["de ", money(r.limitBrl)] }), _jsxs("span", { className: `figure ml-auto font-medium ${r.status === 'over' ? 'text-negative' : 'text-fg2'}`, children: [r.pct, "%"] })] }), _jsxs("div", { className: "relative h-2 rounded-full bg-raised", role: "progressbar", "aria-valuenow": Math.min(100, r.pct), "aria-valuemin": 0, "aria-valuemax": 100, "aria-label": `Orçamento de ${r.budget.category}`, children: [_jsx("div", { className: `h-2 rounded-full ${meta.bar}`, style: { width: `${Math.min(100, r.pct)}%` } }), r.expectedPct > 0 && r.expectedPct < 100 && (_jsx("span", { className: "absolute -top-1 h-4 w-0.5 rounded bg-fg2", style: { left: `calc(${r.expectedPct}% - 1px)` }, title: `Ritmo esperado hoje: ${r.expectedPct}%` }))] }), _jsxs("div", { className: "mt-2 flex items-center justify-between text-xs text-fg3", children: [_jsx("span", { className: r.remainingBrl < 0 ? 'text-negative' : '', children: r.remainingBrl >= 0 ? `Restam ${money(r.remainingBrl)}` : `Estourou ${money(-r.remainingBrl)}` }), r.expectedPct > 0 && r.expectedPct < 100 && _jsxs("span", { className: "figure", children: ["m\u00EAs em ", r.expectedPct, "%"] })] })] }) }, r.budget.id));
                        }) }))] }), _jsxs("div", { className: "grid gap-6 xl:grid-cols-2", children: [_jsxs("section", { className: "card", children: [_jsx("div", { className: "mb-3 font-medium", children: "A pagar neste m\u00EAs" }), toPay.length === 0 ? _jsx(Empty, { icon: _jsx(CalendarClock, { size: 18, strokeWidth: 1.5 }), children: "Nada pendente" }) : (_jsx("ul", { className: "divide-y divide-line", children: toPay.map((p) => (_jsxs("li", { className: "flex items-center gap-3 py-2.5 text-sm", children: [_jsxs("span", { className: `figure w-14 text-xs ${p.date < today ? 'text-negative' : 'text-fg3'}`, children: [p.date.slice(8), "/", p.date.slice(5, 7)] }), _jsx("span", { className: "mr-auto truncate", children: p.label }), _jsx("span", { className: "figure", children: money(p.amount) }), p.action && _jsx("button", { className: "btn-ghost h-8", onClick: p.action, children: "Pagar" })] }, p.key))) }))] }), _jsxs("section", { className: "card", children: [_jsx("div", { className: "mb-3 font-medium", children: "Cart\u00F5es de cr\u00E9dito" }), !f.cards.rows.length ? _jsx(Empty, { icon: _jsx(Receipt, { size: 18, strokeWidth: 1.5 }), children: "Cadastre seus cart\u00F5es na aba Contas" }) : (_jsx("ul", { className: "divide-y divide-line text-sm", children: f.cards.rows.map((c) => {
                                    const used = cardUsed(c, f.txs.rows, f.payments.rows);
                                    const next = invoices(c, f.txs.rows, f.payments.rows).find((i) => !i.paid);
                                    return (_jsxs("li", { className: "flex py-2.5", children: [_jsxs("span", { className: "mr-auto", children: [c.name, _jsx("span", { className: "ml-2 text-xs text-fg3", children: next ? `fatura vence ${formatDay(next.dueDate)}` : 'sem fatura aberta' })] }), _jsxs("span", { className: "figure", children: [money(used), c.credit_limit ? _jsxs("span", { className: "text-fg3", children: [" / ", money(c.credit_limit)] }) : null] })] }, c.id));
                                }) }))] })] }), editingBudget && (_jsx(BudgetModal, { budget: editingBudget, existing: f.budgets.rows, onClose: () => setEditingBudget(null), onSaved: () => { setEditingBudget(null); void f.budgets.reload(); } }))] }));
}
function BudgetModal({ budget, existing, onClose, onSaved }) {
    const [category, setCategory] = useState(budget.category ?? '');
    const [limit, setLimit] = useState(budget.monthly_limit != null ? String(budget.monthly_limit) : '');
    const [currency, setCurrency] = useState(budget.currency ?? 'BRL');
    const [saving, setSaving] = useState(false);
    async function save(e) {
        e.preventDefault();
        const val = Number(limit.replace(',', '.'));
        const cat = category.trim();
        if (!cat || !Number.isFinite(val) || val <= 0)
            return;
        setSaving(true);
        const match = budget.id ? { id: budget.id } : existing.find((b) => b.category.toLowerCase() === cat.toLowerCase());
        const ok = match
            ? await write(supabase.from('category_budgets').update({ category: cat, monthly_limit: val, currency, updated_at: new Date().toISOString() }).eq('id', match.id))
            : await write(supabase.from('category_budgets').insert({ category: cat, monthly_limit: val, currency }));
        setSaving(false);
        if (ok)
            onSaved();
    }
    async function remove() {
        if (budget.id && confirm(`Remover o limite de ${budget.category}?`) && await write(supabase.from('category_budgets').delete().eq('id', budget.id))) {
            onSaved();
        }
    }
    return (_jsx(Modal, { title: budget.id ? `Limite: ${budget.category}` : 'Novo limite mensal', onClose: onClose, children: _jsxs("form", { onSubmit: save, children: [_jsxs(Field, { label: "Categoria", children: [_jsx("input", { className: "input", list: "budget-cats", value: category, onChange: (e) => setCategory(e.target.value), placeholder: "Mercado, Alimenta\u00E7\u00E3o, Lazer\u2026", required: true, autoFocus: true }), _jsx("datalist", { id: "budget-cats", children: EXPENSE_CATEGORIES.map((c) => _jsx("option", { value: c }, c)) })] }), _jsxs("div", { className: "grid grid-cols-2 gap-3", children: [_jsx(Field, { label: `Limite mensal (${symbolOf(currency)})`, children: _jsx("input", { className: "input figure", inputMode: "decimal", value: limit, onChange: (e) => setLimit(e.target.value), required: true, placeholder: "1200" }) }), _jsx(FieldGroup, { label: "Moeda", children: _jsx("div", { className: "segmented w-full", children: CURRENCIES.map((c) => (_jsx("button", { type: "button", className: `flex-1 ${currency === c.code ? 'tab-active' : 'tab'}`, "aria-pressed": currency === c.code, onClick: () => setCurrency(c.code), children: c.symbol }, c.code))) }) })] }), _jsx("p", { className: "mb-4 text-xs text-fg3", children: "Compara os gastos desta categoria no m\u00EAs com o limite e mostra uma marca vertical com o ritmo esperado para o dia de hoje." }), _jsxs("div", { className: "flex gap-2", children: [budget.id && _jsx("button", { type: "button", className: "btn-ghost text-negative", onClick: remove, children: "Remover" }), _jsx("button", { className: "btn-primary ml-auto", disabled: saving, children: saving ? 'Salvando…' : 'Salvar' })] })] }) }));
}
