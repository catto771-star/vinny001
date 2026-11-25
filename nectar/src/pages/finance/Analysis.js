import { jsxs as _jsxs, jsx as _jsx, Fragment as _Fragment } from "react/jsx-runtime";
import { useMemo, useState } from 'react';
import { conv, displayCurrency, money, symbolOf } from '../../lib/money';
import { monthName, toDay } from '../../lib/dates';
import { addMonths, averageLeftoverRate, byCategory, cents, monthlyFlow, netWorth, netWorthHistory, reais } from '../../lib/finance';
import { projectCashFlow } from '../../lib/cashflow';
import { AreaChart, ColumnChart, DonutChart, RankedBars } from '../../components/Charts';
import { Stat } from '../../components/ui';
const HORIZONS = [30, 60, 90];
const KIND_TAG = { recurring: 'recorrente', pending: 'pendente', invoice: 'fatura' };
const shortDay = (d) => `${Number(d.slice(8))}/${d.slice(5, 7)}`;
export default function Analysis({ f, year, month }) {
    const [months, setMonths] = useState(6);
    const [horizon, setHorizon] = useState(30);
    const today = toDay(new Date());
    const worth = netWorth(f.banks.rows, f.txs.rows, f.transfers.rows, f.payments.rows, today);
    const worthCurve = useMemo(() => netWorthHistory(f.banks.rows, f.txs.rows, f.transfers.rows, f.payments.rows, year, month, months, today), [f.banks.rows, f.txs.rows, f.transfers.rows, f.payments.rows, year, month, months, today]);
    const projection = useMemo(() => projectCashFlow({
        startDay: today,
        days: horizon,
        startingBalance: worth,
        templates: f.activeTemplates,
        txs: f.txs.rows,
        skips: f.skips.rows,
        cards: f.cards.rows,
        payments: f.payments.rows,
    }), [today, horizon, worth, f.activeTemplates, f.txs.rows, f.skips.rows, f.cards.rows, f.payments.rows]);
    // Sample curve cleanly (~20-31 points) while always keeping first, last, and lowest-balance day
    const step = horizon === 30 ? 1 : horizon === 60 ? 2 : 3;
    const chartPoints = projection.points
        .filter((pt, idx) => idx === 0 || idx === projection.points.length - 1 || pt.day === projection.minBalanceDay || idx % step === 0)
        .map((pt) => ({
        label: shortDay(pt.day),
        value: conv(pt.balance),
        detail: pt.events.length
            ? pt.events.map((e) => `${e.amount >= 0 ? '+' : '−'}${money(Math.abs(e.amount))} ${e.label}`).join(' · ')
            : undefined,
    }));
    const flow = monthlyFlow(f.txs.rows, year, month, months);
    const rate = averageLeftoverRate(flow);
    const income = reais(flow.reduce((s, m) => s + cents(m.income), 0));
    const expense = reais(flow.reduce((s, m) => s + cents(m.expense), 0));
    const cats = new Map();
    for (let i = 0; i < months; i++) {
        const m = addMonths(year, month, -i);
        for (const c of byCategory(f.txs.rows, 'expense', m.year, m.month))
            cats.set(c.category, (cats.get(c.category) ?? 0) + cents(c.amount));
    }
    const ranking = [...cats.entries()].map(([label, c]) => ({ label, value: reais(c) })).sort((a, b) => b.value - a.value);
    const short = (y, m) => `${monthName(m).slice(0, 3)}/${String(y).slice(2)}`;
    const selector = (_jsx("div", { className: "segmented", children: [3, 6, 12].map((n) => _jsxs("button", { className: n === months ? 'tab-active' : 'tab', onClick: () => setMonths(n), children: [n, " meses"] }, n)) }));
    const horizonSelector = (_jsx("div", { className: "segmented", role: "group", "aria-label": "Horizonte da previs\u00E3o", children: HORIZONS.map((d) => (_jsxs("button", { type: "button", "aria-pressed": d === horizon, className: d === horizon ? 'tab-active' : 'tab', onClick: () => setHorizon(d), children: [d, " dias"] }, d))) }));
    return (_jsxs(_Fragment, { children: [_jsxs("div", { className: "mb-6 space-y-4", children: [_jsxs("section", { className: "card grid grid-cols-2 gap-6 lg:grid-cols-4", "aria-label": "Resumo da previs\u00E3o de caixa", children: [_jsx(Stat, { label: "Saldo hoje", value: money(projection.startingBalance), hint: `${f.banks.rows.length} ${f.banks.rows.length === 1 ? 'conta' : 'contas'}` }), _jsx(Stat, { label: `Previsto em ${horizon}d`, value: _jsx("span", { className: projection.endingBalance < 0 ? 'text-negative' : '', children: money(projection.endingBalance) }), accent: true, hint: `${projection.netChange >= 0 ? '+' : '−'}${money(Math.abs(projection.netChange))} no período` }), _jsx(Stat, { label: "Menor saldo", value: _jsx("span", { className: projection.minBalance < 0 ? 'text-negative' : '', children: money(projection.minBalance) }), hint: projection.negativeDays > 0 ? `${projection.negativeDays} ${projection.negativeDays === 1 ? 'dia' : 'dias'} no vermelho (${shortDay(projection.minBalanceDay)})` : `em ${shortDay(projection.minBalanceDay)}` }), _jsx(Stat, { label: "Previsto entrar / sair", value: money(projection.totalIn), hint: `saídas previstas: ${money(projection.totalOut)}` })] }), _jsx(AreaChart, { title: `Previsão de fluxo de caixa (${horizon} dias)`, subtitle: "Saldo projetado somando recorrentes, pendentes e faturas em aberto", points: chartPoints, unit: symbolOf(displayCurrency()), height: 250, aside: horizonSelector, tone: projection.endingBalance < projection.startingBalance ? 'var(--warning)' : 'var(--brand)' }), projection.events.length > 0 && (_jsxs("details", { className: "card", children: [_jsxs("summary", { className: "flex cursor-pointer list-none items-center justify-between text-sm font-medium", children: [_jsxs("span", { children: ["Movimenta\u00E7\u00F5es previstas nos pr\u00F3ximos ", horizon, " dias (", projection.events.length, ")"] }), _jsx("span", { className: "text-xs text-fg3", children: "ver lista" })] }), _jsx("ul", { className: "mt-3 max-h-64 divide-y divide-line overflow-y-auto text-sm", children: projection.events.map((ev) => (_jsxs("li", { className: "flex items-center gap-3 py-2", children: [_jsx("span", { className: "figure w-12 shrink-0 text-xs text-fg3", children: shortDay(ev.day) }), _jsx("span", { className: "min-w-0 flex-1 truncate", children: ev.label }), _jsx("span", { className: "badge bg-raised text-fg3", children: KIND_TAG[ev.kind] }), _jsxs("span", { className: `figure shrink-0 text-right ${ev.amount >= 0 ? 'text-positive' : ''}`, children: [ev.amount >= 0 ? '+' : '−', money(Math.abs(ev.amount))] })] }, ev.key))) })] }))] }), _jsx("div", { className: "mb-6", children: _jsx(AreaChart, { title: "Evolu\u00E7\u00E3o do patrim\u00F4nio", subtitle: `Saldo consolidado das contas ao final de cada mês (${months} meses)`, unit: symbolOf(displayCurrency()), minZero: false, height: 250, aside: selector, tone: "var(--positive)", points: worthCurve.map((p) => ({
                        label: short(p.year, p.month),
                        value: conv(p.value),
                        detail: `em ${shortDay(p.date)}`,
                    })) }) }), _jsxs("section", { className: "card mb-6 grid grid-cols-2 gap-6 lg:grid-cols-4", children: [_jsx(Stat, { label: "Taxa de sobra m\u00E9dia", value: rate === null ? '—' : String(rate).replace('.', ','), unit: rate === null ? undefined : '%', accent: true, hint: "sobra sobre o que entrou, nos meses com entrada" }), _jsx(Stat, { label: "Entrou no per\u00EDodo", value: money(income) }), _jsx(Stat, { label: "Saiu no per\u00EDodo", value: money(expense) }), _jsx(Stat, { label: "Sobrou no per\u00EDodo", value: money(reais(cents(income) - cents(expense))) })] }), _jsxs("div", { className: "grid gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]", children: [_jsxs("div", { className: "min-w-0 space-y-6", children: [_jsx(ColumnChart, { title: "Sobra m\u00EAs a m\u00EAs", subtitle: "Entradas menos sa\u00EDdas de cada m\u00EAs", unit: symbolOf(displayCurrency()), height: 270, points: flow.map((m) => ({ label: short(m.year, m.month), value: conv(Math.max(0, m.leftover)), detail: `entrou ${money(m.income)}, saiu ${money(m.expense)}${m.leftover < 0 ? `, faltou ${money(-m.leftover)}` : ''}` })) }), _jsxs("section", { className: "card overflow-x-auto", children: [_jsx("div", { className: "mb-3 font-medium", children: "Fluxo m\u00EAs a m\u00EAs" }), _jsxs("table", { className: "w-full min-w-[480px] text-sm", children: [_jsx("thead", { children: _jsxs("tr", { className: "text-left text-xs text-fg3", children: [_jsx("th", { className: "pb-2 font-normal", children: "M\u00EAs" }), _jsx("th", { className: "pb-2 text-right font-normal", children: "Entrou" }), _jsx("th", { className: "pb-2 text-right font-normal", children: "Saiu" }), _jsx("th", { className: "pb-2 text-right font-normal", children: "Sobra" }), _jsx("th", { className: "pb-2 text-right font-normal", children: "Taxa" })] }) }), _jsx("tbody", { children: [...flow].reverse().map((m) => (_jsxs("tr", { className: "border-t border-line", children: [_jsxs("td", { className: "py-2 capitalize", children: [monthName(m.month), " ", m.year] }), _jsx("td", { className: "figure py-2 text-right", children: money(m.income) }), _jsx("td", { className: "figure py-2 text-right", children: money(m.expense) }), _jsx("td", { className: `figure py-2 text-right ${m.leftover < 0 ? 'text-negative' : ''}`, children: money(m.leftover) }), _jsx("td", { className: "figure py-2 text-right text-fg3", children: m.rate === null ? '—' : `${String(m.rate).replace('.', ',')}%` })] }, m.key))) })] })] })] }), _jsxs("section", { className: "card h-fit min-w-0 space-y-5", children: [_jsx(DonutChart, { bare: true, title: "Categorias no per\u00EDodo", subtitle: `Últimos ${months} meses`, centerLabel: "Total", format: money, size: 150, emptyText: "Sem sa\u00EDdas no per\u00EDodo", rows: ranking }), ranking.length > 0 && (_jsxs("div", { className: "border-t border-line pt-4", children: [_jsx("div", { className: "label mb-3", children: "M\u00E9dia mensal" }), _jsx(RankedBars, { unit: "", format: money, rows: ranking.slice(0, 6).map((r) => ({ ...r, detail: `média de ${money(reais(Math.round(cents(r.value) / months)))} por mês` })) })] }))] })] })] }));
}
