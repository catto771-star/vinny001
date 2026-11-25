import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import { monthName } from '../../lib/dates';
import { addMonths } from '../../lib/finance';
import { PageHeader } from '../../components/ui';
import { supabase } from '../../lib/supabase';
import { CURRENCIES, formatIn, setDisplay } from '../../lib/money';
import { useRates } from './useRates';
import { useFinance } from './useFinance';
import { TxForm } from './forms';
import Summary from './Summary';
import Statement from './Statement';
import Recurring from './Recurring';
import Installments from './Installments';
import Accounts from './Accounts';
import Analysis from './Analysis';
const TABS = ['Resumo', 'Lançamentos', 'Recorrentes', 'Parceladas', 'Contas', 'Análise'];
export default function Finance() {
    const f = useFinance();
    const now = new Date();
    const [tab, setTab] = useState('Resumo');
    const [ym, setYm] = useState({ year: now.getFullYear(), month: now.getMonth() + 1 });
    const [newTx, setNewTx] = useState(null);
    const shift = (n) => setYm(addMonths(ym.year, ym.month, n));
    // The currency the screens show; values are kept in reais and converted at today's rate.
    const [currency, setCurrency] = useState('BRL');
    const today = useRates(null);
    useEffect(() => {
        void supabase.from('user_settings').select('display_currency').maybeSingle().then(({ data }) => { if (data?.display_currency)
            setCurrency(data.display_currency); });
    }, []);
    const rate = currency === 'BRL' ? 1 : today.rates?.[currency] ?? null;
    setDisplay(currency, rate);
    async function chooseCurrency(c) {
        setCurrency(c);
        const { data } = await supabase.auth.getSession();
        if (data.session)
            await supabase.from('user_settings').upsert({ user_id: data.session.user.id, display_currency: c }, { onConflict: 'user_id' });
    }
    const isCurrent = ym.year === now.getFullYear() && ym.month === now.getMonth() + 1;
    /** Records one occurrence of a recurring entry as a transaction, pre-filled from its template. */
    function pay({ template_id, date }) {
        const t = f.templates.rows.find((x) => x.id === template_id);
        if (!t)
            return;
        setNewTx({
            type: t.type, amount: t.amount, description: t.description, date, category: t.category, payment_method: t.payment_method,
            bank_id: t.bank_id, card_id: t.card_id, recurring_template_id: t.id,
            currency: t.currency, original_amount: t.original_amount, fx_rate: t.fx_rate,
        });
    }
    return (_jsxs(_Fragment, { children: [_jsx(PageHeader, { title: "Finan\u00E7as", subtitle: `${monthName(ym.month).replace(/^./, (c) => c.toUpperCase())} de ${ym.year}`, tabs: TABS, tab: tab, onTab: (t) => setTab(t), action: _jsxs("div", { className: "flex flex-wrap items-center gap-2", children: [_jsx("div", { className: "segmented", role: "group", "aria-label": "Ver valores em", children: CURRENCIES.map((c) => (_jsx("button", { type: "button", className: currency === c.code ? 'tab-active' : 'tab', "aria-pressed": currency === c.code, title: c.name, onClick: () => void chooseCurrency(c.code), children: c.symbol }, c.code))) }), _jsxs("div", { className: "flex items-center gap-0.5", children: [_jsx("button", { type: "button", className: "icon-btn", onClick: () => shift(-1), "aria-label": "M\u00EAs anterior", children: _jsx(ChevronLeft, { size: 16, strokeWidth: 1.5, "aria-hidden": "true" }) }), !isCurrent && _jsx("button", { type: "button", className: "btn-ghost h-8", onClick: () => setYm({ year: now.getFullYear(), month: now.getMonth() + 1 }), children: "Hoje" }), _jsx("button", { type: "button", className: "icon-btn", onClick: () => shift(1), "aria-label": "Pr\u00F3ximo m\u00EAs", children: _jsx(ChevronRight, { size: 16, strokeWidth: 1.5, "aria-hidden": "true" }) })] }), _jsxs("button", { type: "button", className: "btn-primary", onClick: () => setNewTx({}), children: [_jsx(Plus, { size: 16, strokeWidth: 1.5, "aria-hidden": "true" }), "Lan\u00E7amento"] })] }) }), f.txs.error && _jsx("p", { className: "mb-4 text-sm text-negative", children: f.txs.error }), currency !== 'BRL' && (_jsx("p", { className: "-mt-3 mb-4 text-[13px] text-fg3", role: "status", children: rate ? `Valores em ${CURRENCIES.find((c) => c.code === currency).name.toLowerCase()} pela cotação de ${today.date?.split('-').reverse().slice(0, 2).join('/')} (${today.source}): 1 ${CURRENCIES.find((c) => c.code === currency).symbol} = ${formatIn(rate, 'BRL')}.`
                    : today.error ? `Sem cotação agora (${today.error}); valores em reais.` : 'Buscando a cotação…' })), _jsxs("div", { children: [tab === 'Resumo' && _jsx(Summary, { f: f, year: ym.year, month: ym.month, onPay: pay }), tab === 'Lançamentos' && _jsx(Statement, { f: f, year: ym.year, month: ym.month }), tab === 'Recorrentes' && _jsx(Recurring, { f: f, year: ym.year, month: ym.month, onPay: pay }), tab === 'Parceladas' && _jsx(Installments, { f: f }), tab === 'Contas' && _jsx(Accounts, { f: f }), tab === 'Análise' && _jsx(Analysis, { f: f, year: ym.year, month: ym.month })] }, `${currency}-${rate}`), newTx && _jsx(TxForm, { f: f, defaults: newTx, onClose: () => setNewTx(null) })] }));
}
