import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useState } from 'react';
import { CURRENCIES, formatIn, symbolOf, toBRL } from '../../lib/money';
import { useRates } from './useRates';
import { supabase } from '../../lib/supabase';
import { write } from '../../lib/useTable';
import { toDay } from '../../lib/dates';
import { EXPENSE_CATEGORIES, INCOME_CATEGORIES, PAYMENT_LABEL } from '../../lib/finance';
import { Field, FieldGroup, Modal } from '../../components/ui';
export function TypeToggle({ value, onChange }) {
    return (_jsx(FieldGroup, { label: "Tipo", children: _jsx("div", { className: "segmented", children: ['expense', 'income'].map((t) => (_jsx("button", { type: "button", "aria-pressed": value === t, className: value === t ? 'tab-active' : 'tab', onClick: () => onChange(t), children: t === 'expense' ? 'Saída' : 'Entrada' }, t))) }) }));
}
export function CategoryField({ type, value, onChange }) {
    const list = type === 'expense' ? EXPENSE_CATEGORIES : INCOME_CATEGORIES;
    return (_jsxs(Field, { label: "Categoria", children: [_jsx("input", { className: "input", list: `cat-${type}`, value: value, onChange: (e) => onChange(e.target.value), placeholder: list[0] }), _jsx("datalist", { id: `cat-${type}`, children: list.map((c) => _jsx("option", { value: c }, c)) })] }));
}
/** Where the money comes from or goes to: an account, or a credit card for card purchases. */
export function PaymentFields({ f, type, method, setMethod, bankId, setBankId, cardId, setCardId }) {
    const credit = f.cards.rows.filter((c) => c.card_type === 'credit');
    const methods = Object.keys(PAYMENT_LABEL).filter((m) => type === 'expense' || m !== 'credito');
    return (_jsxs("div", { className: "grid grid-cols-2 gap-3", children: [_jsx(Field, { label: "Forma de pagamento", children: _jsx("select", { className: "input", value: method, onChange: (e) => setMethod(e.target.value), children: methods.map((m) => _jsx("option", { value: m, children: PAYMENT_LABEL[m] }, m)) }) }), method === 'credito' ? (_jsx(Field, { label: "Cart\u00E3o", children: _jsxs("select", { className: "input", value: cardId, onChange: (e) => setCardId(e.target.value), required: true, children: [_jsx("option", { value: "", children: "Escolha" }), credit.map((c) => _jsx("option", { value: c.id, children: c.name }, c.id))] }) })) : (_jsx(Field, { label: "Conta", children: _jsxs("select", { className: "input", value: bankId, onChange: (e) => setBankId(e.target.value), children: [_jsx("option", { value: "", children: "Nenhuma" }), f.banks.rows.map((b) => _jsx("option", { value: b.id, children: b.name }, b.id))] }) }))] }));
}
export function TxForm({ f, tx, defaults, onClose }) {
    const base = { ...defaults, ...tx };
    const [type, setType] = useState(base.type ?? 'expense');
    const [amount, setAmount] = useState(base.amount?.toString() ?? '');
    const [description, setDescription] = useState(base.description ?? '');
    const [date, setDate] = useState(base.date ?? toDay(new Date()));
    const [category, setCategory] = useState(base.category ?? '');
    const [method, setMethod] = useState(base.payment_method ?? 'pix');
    const [bankId, setBankId] = useState(base.bank_id ?? f.banks.rows[0]?.id ?? '');
    const [cardId, setCardId] = useState(base.card_id ?? '');
    const [projectId, setProjectId] = useState(base.project_id ?? '');
    const [pending, setPending] = useState(base.is_pending ?? false);
    // In another currency: the amount typed is in that currency and the rate (reais per unit) comes
    // from the transaction's date, unless edited by hand (then it stays as typed).
    const [currency, setCurrency] = useState(base.currency ?? 'BRL');
    const [original, setOriginal] = useState(base.original_amount?.toString() ?? '');
    const [rateText, setRateText] = useState(base.fx_rate?.toString() ?? '');
    const [rateEdited, setRateEdited] = useState(!!base.fx_rate);
    const quote = useRates(currency === 'BRL' ? null : date < toDay(new Date()) ? date : null);
    const quoted = currency === 'BRL' ? null : quote.rates?.[currency] ?? null;
    useEffect(() => { if (!rateEdited && quoted)
        setRateText(String(quoted)); }, [quoted, rateEdited]);
    const rate = Number(rateText.replace(',', '.'));
    const foreign = Number(original.replace(',', '.'));
    const inReais = currency !== 'BRL' && foreign > 0 && rate > 0 ? toBRL(foreign, rate) : null;
    async function save(e) {
        e.preventDefault();
        const credit = method === 'credito';
        if (currency !== 'BRL' && inReais === null) {
            alert('Informe o valor e a cotação.');
            return;
        }
        const money = currency === 'BRL'
            ? { amount: Number(amount), currency, original_amount: null, fx_rate: null }
            : { amount: inReais, currency, original_amount: foreign, fx_rate: rate };
        const row = {
            type, ...money, description, date, category: category || null, payment_method: method,
            bank_id: credit ? null : bankId || null, card_id: credit ? cardId || null : null, is_pending: credit ? false : pending,
            recurring_template_id: base.recurring_template_id ?? null,
            project_id: projectId || null,
        };
        const ok = tx?.id ? await write(supabase.from('transactions').update(row).eq('id', tx.id)) : await write(supabase.from('transactions').insert(row));
        if (ok) {
            await f.reloadMoney();
            onClose();
        }
    }
    async function remove() {
        if (tx?.id && confirm('Excluir este lançamento?') && await write(supabase.from('transactions').delete().eq('id', tx.id))) {
            await f.reloadMoney();
            onClose();
        }
    }
    return (_jsx(Modal, { title: tx?.id ? 'Editar lançamento' : 'Novo lançamento', onClose: onClose, children: _jsxs("form", { onSubmit: save, children: [_jsx(TypeToggle, { value: type, onChange: (t) => { setType(t); if (t === 'income' && method === 'credito')
                        setMethod('pix'); } }), _jsxs("div", { className: "mb-4 flex items-center gap-2", role: "group", "aria-label": "Moeda", children: [_jsx("span", { className: "text-[13px] text-fg2", children: "Moeda" }), _jsx("div", { className: "segmented", children: CURRENCIES.map((c) => (_jsx("button", { type: "button", className: currency === c.code ? 'tab-active' : 'tab', "aria-pressed": currency === c.code, title: c.name, onClick: () => { setCurrency(c.code); setRateEdited(false); if (c.code !== 'BRL' && !original && amount)
                                    setOriginal(amount); }, children: c.symbol }, c.code))) })] }), _jsxs("div", { className: "grid grid-cols-2 gap-3", children: [currency === 'BRL'
                            ? _jsx(Field, { label: "Valor (R$)", children: _jsx("input", { className: "input figure", type: "number", min: 0.01, step: "0.01", value: amount, onChange: (e) => setAmount(e.target.value), required: true, autoFocus: true }) })
                            : _jsx(Field, { label: `Valor (${symbolOf(currency)})`, children: _jsx("input", { className: "input figure", type: "number", min: 0.01, step: "0.01", value: original, onChange: (e) => setOriginal(e.target.value), required: true, autoFocus: true }) }), _jsx(Field, { label: "Data", children: _jsx("input", { className: "input", type: "date", value: date, onChange: (e) => { setDate(e.target.value); if (currency !== 'BRL')
                                    setRateEdited(false); }, required: true }) })] }), currency !== 'BRL' && (_jsxs("div", { className: "mb-4 rounded-xl border border-line p-3", children: [_jsxs("div", { className: "grid grid-cols-2 items-end gap-3", children: [_jsx(Field, { label: `Cotação (R$ por 1 ${symbolOf(currency)})`, children: _jsx("input", { className: "input figure", inputMode: "decimal", value: rateText, onChange: (e) => { setRateText(e.target.value); setRateEdited(true); }, required: true }) }), _jsxs("div", { className: "mb-4", children: [_jsx("div", { className: "text-[13px] text-fg2", children: "Em reais" }), _jsx("div", { className: "figure text-lg", children: inReais === null ? '—' : formatIn(inReais, 'BRL') })] })] }), _jsxs("p", { className: "text-xs text-fg3", children: [quote.error ? `Sem cotação automática (${quote.error}); digite a cotação.`
                                    : quoted ? `${rateEdited && Number(rateText) !== quoted ? `Cotação editada. A de ${quote.date?.split('-').reverse().join('/')} é ${quoted}. ` : `Cotação de ${quote.date?.split('-').reverse().join('/')}${quote.at ? `, ${quote.at.slice(11)}` : ''} (${quote.source}). `}`
                                        : 'Buscando a cotação…', rateEdited && quoted && Number(rateText) !== quoted && _jsx("button", { type: "button", className: "underline", onClick: () => { setRateEdited(false); setRateText(String(quoted)); }, children: "Usar a do dia" })] })] })), _jsx(Field, { label: "Descri\u00E7\u00E3o", children: _jsx("input", { className: "input", value: description, onChange: (e) => setDescription(e.target.value), required: true, placeholder: type === 'expense' ? 'Mercado' : 'Salário' }) }), _jsx(CategoryField, { type: type, value: category, onChange: setCategory }), _jsx(PaymentFields, { f: f, type: type, method: method, setMethod: setMethod, bankId: bankId, setBankId: setBankId, cardId: cardId, setCardId: setCardId }), f.activeProjects.length > 0 && (_jsx(Field, { label: "Projeto (opcional)", children: _jsxs("select", { className: "input", value: projectId, onChange: (e) => setProjectId(e.target.value), children: [_jsx("option", { value: "", children: "Nenhum" }), f.activeProjects.map((p) => _jsx("option", { value: p.id, children: p.name }, p.id))] }) })), method !== 'credito' && (_jsxs("label", { className: "mb-4 flex items-center gap-2 text-sm", children: [_jsx("input", { type: "checkbox", checked: pending, onChange: (e) => setPending(e.target.checked) }), type === 'expense' ? 'Ainda não paguei' : 'Ainda não recebi'] })), _jsxs("div", { className: "flex gap-2", children: [tx?.id && _jsx("button", { type: "button", className: "btn-ghost text-negative", onClick: remove, children: "Excluir" }), _jsx("button", { className: "btn-primary ml-auto", children: "Salvar" })] })] }) }));
}
export function BankForm({ f, bank, onClose }) {
    const [name, setName] = useState(bank?.name ?? '');
    const [initial, setInitial] = useState(bank?.initial_balance?.toString() ?? '0');
    const [currency, setCurrency] = useState(bank?.currency ?? 'BRL');
    async function save(e) {
        e.preventDefault();
        const row = { name, initial_balance: Number(initial), currency };
        const ok = bank ? await write(supabase.from('banks').update(row).eq('id', bank.id)) : await write(supabase.from('banks').insert(row));
        if (ok) {
            await f.banks.reload();
            onClose();
        }
    }
    async function remove() {
        if (bank && confirm(`Excluir a conta ${bank.name}? Os lançamentos ficam, sem conta.`) && await write(supabase.from('banks').delete().eq('id', bank.id))) {
            await f.banks.reload();
            onClose();
        }
    }
    return (_jsx(Modal, { title: bank ? 'Editar conta' : 'Nova conta', onClose: onClose, children: _jsxs("form", { onSubmit: save, children: [_jsx(Field, { label: "Nome", children: _jsx("input", { className: "input", value: name, onChange: (e) => setName(e.target.value), placeholder: "Nubank, Ita\u00FA, carteira\u2026", required: true, autoFocus: true }) }), _jsx(FieldGroup, { label: "Moeda da conta", children: _jsx("div", { className: "segmented", children: CURRENCIES.map((c) => (_jsx("button", { type: "button", className: currency === c.code ? 'tab-active' : 'tab', "aria-pressed": currency === c.code, title: c.name, onClick: () => setCurrency(c.code), children: c.symbol }, c.code))) }) }), _jsx(Field, { label: `Saldo inicial (${symbolOf(currency)})`, children: _jsx("input", { className: "input figure", type: "number", step: "0.01", value: initial, onChange: (e) => setInitial(e.target.value), required: true }) }), _jsx("p", { className: "mb-4 text-xs text-fg3", children: "O saldo de hoje \u00E9 o inicial mais tudo o que voc\u00EA registrar a partir dele" }), _jsxs("div", { className: "flex gap-2", children: [bank && _jsx("button", { type: "button", className: "btn-ghost text-negative", onClick: remove, children: "Excluir" }), _jsx("button", { className: "btn-primary ml-auto", children: "Salvar" })] })] }) }));
}
export function CardForm({ f, card, onClose }) {
    const [name, setName] = useState(card?.name ?? '');
    const [bankId, setBankId] = useState(card?.bank_id ?? f.banks.rows[0]?.id ?? '');
    const [limit, setLimit] = useState(card?.credit_limit?.toString() ?? '');
    const [closing, setClosing] = useState(card?.closing_day?.toString() ?? '');
    const [due, setDue] = useState(card?.due_day?.toString() ?? '');
    async function save(e) {
        e.preventDefault();
        const row = { name, card_type: 'credit', bank_id: bankId || null, credit_limit: limit ? Number(limit) : null, closing_day: Number(closing), due_day: Number(due) };
        const ok = card ? await write(supabase.from('cards').update(row).eq('id', card.id)) : await write(supabase.from('cards').insert(row));
        if (ok) {
            await f.cards.reload();
            onClose();
        }
    }
    async function remove() {
        if (card && confirm(`Excluir o cartão ${card.name}?`) && await write(supabase.from('cards').delete().eq('id', card.id))) {
            await f.cards.reload();
            onClose();
        }
    }
    return (_jsx(Modal, { title: card ? 'Editar cartão' : 'Novo cartão de crédito', onClose: onClose, children: _jsxs("form", { onSubmit: save, children: [_jsx(Field, { label: "Nome", children: _jsx("input", { className: "input", value: name, onChange: (e) => setName(e.target.value), placeholder: "Nubank Visa", required: true, autoFocus: true }) }), _jsx(Field, { label: "Conta que paga a fatura", children: _jsxs("select", { className: "input", value: bankId, onChange: (e) => setBankId(e.target.value), children: [_jsx("option", { value: "", children: "Nenhuma" }), f.banks.rows.map((b) => _jsx("option", { value: b.id, children: b.name }, b.id))] }) }), _jsxs("div", { className: "grid grid-cols-3 gap-3", children: [_jsx(Field, { label: "Limite (R$)", children: _jsx("input", { className: "input figure", type: "number", min: 0, step: "0.01", value: limit, onChange: (e) => setLimit(e.target.value) }) }), _jsx(Field, { label: "Fecha dia", children: _jsx("input", { className: "input figure", type: "number", min: 1, max: 31, value: closing, onChange: (e) => setClosing(e.target.value), required: true }) }), _jsx(Field, { label: "Vence dia", children: _jsx("input", { className: "input figure", type: "number", min: 1, max: 31, value: due, onChange: (e) => setDue(e.target.value), required: true }) })] }), _jsx("p", { className: "mb-4 text-xs text-fg3", children: "Compras no dia do fechamento ou depois entram na fatura seguinte" }), _jsxs("div", { className: "flex gap-2", children: [card && _jsx("button", { type: "button", className: "btn-ghost text-negative", onClick: remove, children: "Excluir" }), _jsx("button", { className: "btn-primary ml-auto", children: "Salvar" })] })] }) }));
}
export function TransferForm({ f, onClose }) {
    const [from, setFrom] = useState(f.banks.rows[0]?.id ?? '');
    const [to, setTo] = useState(f.banks.rows[1]?.id ?? '');
    const [amount, setAmount] = useState('');
    const [date, setDate] = useState(toDay(new Date()));
    async function save(e) {
        e.preventDefault();
        if (from === to)
            return alert('Escolha contas diferentes');
        if (await write(supabase.from('transfers').insert({ from_bank_id: from, to_bank_id: to, amount: Number(amount), date }))) {
            await f.transfers.reload();
            onClose();
        }
    }
    return (_jsx(Modal, { title: "Transferir entre contas", onClose: onClose, children: _jsxs("form", { onSubmit: save, children: [_jsxs("div", { className: "grid grid-cols-2 gap-3", children: [_jsx(Field, { label: "De", children: _jsx("select", { className: "input", value: from, onChange: (e) => setFrom(e.target.value), children: f.banks.rows.map((b) => _jsx("option", { value: b.id, children: b.name }, b.id)) }) }), _jsx(Field, { label: "Para", children: _jsx("select", { className: "input", value: to, onChange: (e) => setTo(e.target.value), children: f.banks.rows.map((b) => _jsx("option", { value: b.id, children: b.name }, b.id)) }) }), _jsx(Field, { label: "Valor (R$)", children: _jsx("input", { className: "input figure", type: "number", min: 0.01, step: "0.01", value: amount, onChange: (e) => setAmount(e.target.value), required: true }) }), _jsx(Field, { label: "Data", children: _jsx("input", { className: "input", type: "date", value: date, onChange: (e) => setDate(e.target.value), required: true }) })] }), _jsx("button", { className: "btn-primary w-full", children: "Transferir" })] }) }));
}
