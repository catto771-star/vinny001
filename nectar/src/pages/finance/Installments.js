import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useState } from 'react';
import { money } from '../../lib/money';
import { CreditCard, FastForward, Plus } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { write } from '../../lib/useTable';
import { formatDay, toDay } from '../../lib/dates';
import { cents, installmentSchedule, invoiceFor, reais } from '../../lib/finance';
import { Empty, Field, Modal } from '../../components/ui';
import { CategoryField } from './forms';
export default function Installments({ f }) {
    const [form, setForm] = useState(false);
    const today = toDay(new Date());
    const list = f.purchases.rows.filter((p) => p.status !== 'cancelled');
    const parts = (p) => f.txs.rows.filter((t) => t.installment_purchase_id === p.id).sort((a, b) => (a.installment_number ?? 0) - (b.installment_number ?? 0));
    async function anticipate(p) {
        const future = parts(p).filter((t) => t.date > today);
        if (!future.length || !confirm(`Antecipar ${future.length} parcelas (${money(reais(future.reduce((s, t) => s + cents(t.amount), 0)))}) para hoje?`))
            return;
        const ok = await write(supabase.from('transactions').update({ date: today, is_advance_payment: true }).in('id', future.map((t) => t.id)));
        if (ok) {
            await write(supabase.from('installment_purchases').update({ status: 'finished' }).eq('id', p.id));
            await Promise.all([f.txs.reload(), f.purchases.reload()]);
        }
    }
    async function remove(p) {
        if (confirm(`Excluir a compra ${p.description} e todas as parcelas?`) && await write(supabase.from('installment_purchases').delete().eq('id', p.id)))
            await Promise.all([f.txs.reload(), f.purchases.reload()]);
    }
    return (_jsxs(_Fragment, { children: [_jsx("div", { className: "mb-4 flex", children: _jsxs("button", { className: "btn-primary ml-auto", onClick: () => setForm(true), children: [_jsx(Plus, { size: 16, strokeWidth: 1.5 }), "Compra parcelada"] }) }), !list.length ? (_jsx("div", { className: "card", children: _jsx(Empty, { icon: _jsx(CreditCard, { size: 18, strokeWidth: 1.5 }), action: _jsx("button", { className: "btn-secondary", onClick: () => setForm(true), children: "Nova compra parcelada" }), children: "Cadastre compras em 2x, 6x, 12x: cada parcela cai na fatura certa" }) })) : (_jsx("ul", { className: "grid gap-3", children: list.map((p) => {
                    const ps = parts(p);
                    const done = ps.filter((t) => t.date <= today).length;
                    const left = reais(ps.filter((t) => t.date > today).reduce((s, t) => s + cents(t.amount), 0));
                    const next = ps.find((t) => t.date > today);
                    const card = p.card_id ? f.cardById.get(p.card_id) : undefined;
                    return (_jsxs("li", { className: "card", children: [_jsxs("div", { className: "mb-3 flex flex-wrap items-start gap-3", children: [_jsxs("div", { className: "mr-auto", children: [_jsx("div", { className: "font-medium", children: p.description }), _jsx("div", { className: "text-[13px] text-fg3", children: [card?.name, p.category, `${p.installments_count}x de ${money(ps[ps.length - 1]?.amount ?? p.total_amount / p.installments_count)}`].filter(Boolean).join(' · ') })] }), _jsxs("div", { className: "text-right", children: [_jsx("div", { className: "figure", children: money(p.total_amount) }), _jsx("div", { className: "text-xs text-fg3", children: left ? `${money(left)} a pagar` : 'quitada' })] })] }), _jsx("div", { className: "mb-2 flex gap-1", children: ps.map((t) => _jsx("div", { className: `h-1.5 flex-1 rounded-sm ${t.date <= today ? 'bg-brand' : 'bg-raised'}`, title: `${t.installment_number}ª · ${formatDay(t.date)}` }, t.id)) }), _jsxs("div", { className: "flex flex-wrap items-center gap-2 text-[13px] text-fg3", children: [_jsxs("span", { className: "figure", children: [done, "/", p.installments_count, " pagas"] }), next && _jsxs("span", { children: ["\u00B7 pr\u00F3xima ", formatDay(next.date), card ? `, fatura de ${formatDay(invoiceFor(next.date, card).dueDate)}` : ''] }), _jsxs("span", { className: "ml-auto flex gap-1", children: [next && _jsxs("button", { className: "btn-ghost h-8", onClick: () => anticipate(p), children: [_jsx(FastForward, { size: 16, strokeWidth: 1.5 }), "Antecipar"] }), _jsx("button", { className: "btn-ghost h-8 text-negative", onClick: () => remove(p), children: "Excluir" })] })] })] }, p.id));
                }) })), form && _jsx(PurchaseForm, { f: f, onClose: () => setForm(false) })] }));
}
function PurchaseForm({ f, onClose }) {
    const credit = f.cards.rows.filter((c) => c.card_type === 'credit');
    const [description, setDescription] = useState('');
    const [total, setTotal] = useState('');
    const [count, setCount] = useState('10');
    const [first, setFirst] = useState(toDay(new Date()));
    const [cardId, setCardId] = useState(credit[0]?.id ?? '');
    const [category, setCategory] = useState('');
    const preview = total && Number(count) > 0 ? installmentSchedule(Number(total), Number(count), first) : [];
    async function save(e) {
        e.preventDefault();
        const { data, error } = await supabase.from('installment_purchases').insert({
            description, total_amount: Number(total), installments_count: Number(count), first_installment_date: first, card_id: cardId || null, category: category || null,
        }).select('id').single();
        if (error || !data)
            return alert(`Não foi possível salvar: ${error?.message}`);
        const ok = await write(supabase.from('transactions').insert(preview.map((p) => ({
            type: 'expense', description: `${description} (${p.number}/${preview.length})`, amount: p.amount, date: p.date, category: category || null,
            payment_method: cardId ? 'credito' : 'boleto', card_id: cardId || null, bank_id: null, installment_purchase_id: data.id, installment_number: p.number,
        }))));
        if (!ok)
            await supabase.from('installment_purchases').delete().eq('id', data.id);
        await Promise.all([f.txs.reload(), f.purchases.reload()]);
        if (ok)
            onClose();
    }
    return (_jsx(Modal, { title: "Nova compra parcelada", onClose: onClose, children: _jsxs("form", { onSubmit: save, children: [_jsx(Field, { label: "Descri\u00E7\u00E3o", children: _jsx("input", { className: "input", value: description, onChange: (e) => setDescription(e.target.value), required: true, placeholder: "Notebook", autoFocus: true }) }), _jsxs("div", { className: "grid grid-cols-3 gap-3", children: [_jsx(Field, { label: "Total (R$)", children: _jsx("input", { className: "input figure", type: "number", min: 0.01, step: "0.01", value: total, onChange: (e) => setTotal(e.target.value), required: true }) }), _jsx(Field, { label: "Parcelas", children: _jsx("input", { className: "input figure", type: "number", min: 1, max: 72, value: count, onChange: (e) => setCount(e.target.value), required: true }) }), _jsx(Field, { label: "1\u00AA parcela", children: _jsx("input", { className: "input", type: "date", value: first, onChange: (e) => setFirst(e.target.value), required: true }) })] }), _jsx(Field, { label: "Cart\u00E3o", children: _jsxs("select", { className: "input", value: cardId, onChange: (e) => setCardId(e.target.value), children: [_jsx("option", { value: "", children: "Sem cart\u00E3o (boleto, carn\u00EA)" }), credit.map((c) => _jsx("option", { value: c.id, children: c.name }, c.id))] }) }), _jsx(CategoryField, { type: "expense", value: category, onChange: setCategory }), preview.length > 0 && _jsxs("p", { className: "mb-4 text-sm text-fg2", children: [_jsxs("span", { className: "figure", children: [preview.length, "x"] }), " de ", _jsx("span", { className: "figure", children: money(preview[preview.length - 1].amount) }), preview[0].amount !== preview[preview.length - 1].amount ? ` (a 1ª de ${money(preview[0].amount)})` : '', ", at\u00E9 ", formatDay(preview[preview.length - 1].date)] }), _jsx("button", { className: "btn-primary w-full", children: "Salvar" })] }) }));
}
