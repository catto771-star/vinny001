import { jsxs as _jsxs, jsx as _jsx, Fragment as _Fragment } from "react/jsx-runtime";
import { useEffect, useState } from 'react';
import { CURRENCIES, money, symbolOf, toBRL } from '../../lib/money';
import { Plus, Repeat } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { write } from '../../lib/useTable';
import { formatDay, toDay } from '../../lib/dates';
import { monthlyEquivalent, recurringInMonth } from '../../lib/finance';
import { Empty, Field, Modal, WeekdayPicker } from '../../components/ui';
import { useRates } from './useRates';
import { CategoryField, PaymentFields, TypeToggle } from './forms';
export default function Recurring({ f, year, month, onPay }) {
    const [editing, setEditing] = useState(null);
    const occ = recurringInMonth(f.activeTemplates, f.txs.rows, f.skips.rows, year, month);
    const monthly = f.activeTemplates.filter((t) => t.is_active && t.type === 'expense').reduce((s, t) => s + monthlyEquivalent(t), 0);
    async function skip(templateId, date, undo) {
        const q = undo
            ? supabase.from('transaction_recurring_skips').delete().eq('recurring_template_id', templateId).eq('skipped_date', date)
            : supabase.from('transaction_recurring_skips').insert({ recurring_template_id: templateId, skipped_date: date });
        if (await write(q))
            void f.skips.reload();
    }
    return (_jsxs(_Fragment, { children: [_jsxs("div", { className: "mb-4 flex items-center gap-2", children: [_jsxs("p", { className: "mr-auto text-sm text-fg2", children: ["Assinaturas e contas fixas: cadastre uma vez e marque como pagas a cada m\u00EAs", monthly > 0 ? ` · ${money(monthly)} por mês em saídas fixas` : ''] }), _jsxs("button", { className: "btn-primary", onClick: () => setEditing({}), children: [_jsx(Plus, { size: 16, strokeWidth: 1.5 }), "Recorrente"] })] }), !occ.length && !f.activeTemplates.length ? (_jsx("div", { className: "card", children: _jsx(Empty, { icon: _jsx(Repeat, { size: 18, strokeWidth: 1.5 }), action: _jsx("button", { className: "btn-secondary", onClick: () => setEditing({}), children: "Criar recorrente" }), children: "Netflix, aluguel, academia, sal\u00E1rio: entram sozinhos todo m\u00EAs" }) })) : (_jsxs("ul", { className: "card divide-y divide-line p-0", children: [occ.map((o) => (_jsxs("li", { className: "flex flex-wrap items-center gap-3 px-5 py-3 text-sm", children: [_jsxs("button", { className: "min-w-0 flex-1 text-left", onClick: () => setEditing(o.template), children: [_jsx("span", { className: "block truncate", children: o.template.description }), _jsxs("span", { className: "block text-xs text-fg3", children: [formatDay(o.date), o.template.category ? ` · ${o.template.category}` : ''] })] }), _jsx("span", { className: `figure ${o.template.type === 'income' ? 'text-positive' : ''}`, children: money(o.template.amount) }), o.paid ? _jsx("span", { className: "w-28 text-right text-xs text-positive", children: o.template.type === 'income' ? 'recebido' : 'pago' })
                                : o.skipped ? _jsx("button", { className: "btn-ghost h-8 w-28", onClick: () => skip(o.template.id, o.date, true), children: "Pulado \u00B7 desfazer" })
                                    : (_jsxs("span", { className: "flex w-28 justify-end gap-1", children: [_jsx("button", { className: "btn-secondary h-8 px-3", onClick: () => onPay({ template_id: o.template.id, date: o.date }), children: o.template.type === 'income' ? 'Receber' : 'Pagar' }), _jsx("button", { className: "btn-ghost h-8 px-2", onClick: () => skip(o.template.id, o.date, false), children: "Pular" })] }))] }, o.template.id + o.date))), f.activeTemplates.filter((t) => !t.is_active).map((t) => (_jsx("li", { className: "px-5 py-3 text-sm text-fg3", children: _jsxs("button", { onClick: () => setEditing(t), children: [t.description, " \u00B7 pausada"] }) }, t.id)))] })), editing && _jsx(TemplateForm, { f: f, template: editing, onClose: () => setEditing(null) })] }));
}
function TemplateForm({ f, template, onClose }) {
    const [type, setType] = useState(template.type ?? 'expense');
    const [description, setDescription] = useState(template.description ?? '');
    const [amount, setAmount] = useState(template.amount?.toString() ?? '');
    const [category, setCategory] = useState(template.category ?? '');
    const [method, setMethod] = useState(template.payment_method ?? 'pix');
    const [bankId, setBankId] = useState(template.bank_id ?? f.banks.rows[0]?.id ?? '');
    const [cardId, setCardId] = useState(template.card_id ?? '');
    const [frequency, setFrequency] = useState(template.frequency ?? 'monthly');
    const [day, setDay] = useState(template.recurrence_days?.[0]?.toString() ?? '10');
    const [weekdays, setWeekdays] = useState(template.frequency === 'weekly' ? template.recurrence_days ?? [3] : [3]);
    const [currency, setCurrency] = useState(template.currency ?? 'BRL');
    const [original, setOriginal] = useState(template.original_amount?.toString() ?? '');
    const [rateText, setRateText] = useState(template.fx_rate?.toString() ?? '');
    const [rateEdited, setRateEdited] = useState(!!template.fx_rate);
    const quote = useRates(null);
    const quoted = currency === 'BRL' ? null : quote.rates?.[currency] ?? null;
    useEffect(() => { if (!rateEdited && quoted)
        setRateText(String(quoted)); }, [quoted, rateEdited]);
    const foreign = Number(original.replace(',', '.'));
    const rate = Number(rateText.replace(',', '.'));
    const reais = currency === 'BRL' ? Number(amount) : foreign > 0 && rate > 0 ? toBRL(foreign, rate) : 0;
    const [start, setStart] = useState(template.start_date ?? toDay(new Date()));
    const [active, setActive] = useState(template.is_active ?? true);
    async function save(e) {
        e.preventDefault();
        const credit = method === 'credito';
        const row = {
            type, description, amount: Math.round(reais * 100) / 100, category: category || null, payment_method: method,
            bank_id: credit ? null : bankId || null, card_id: credit ? cardId || null : null,
            recurrence_days: frequency === 'weekly' ? weekdays : [Number(day)], frequency, start_date: start, is_active: active,
            currency, original_amount: currency === 'BRL' ? null : foreign, fx_rate: currency === 'BRL' ? null : rate,
        };
        const ok = template.id ? await write(supabase.from('transaction_recurring_templates').update(row).eq('id', template.id)) : await write(supabase.from('transaction_recurring_templates').insert(row));
        if (ok) {
            await f.templates.reload();
            onClose();
        }
    }
    async function remove() {
        if (template.id && confirm('Excluir este recorrente? Os lançamentos já feitos ficam.') &&
            await write(supabase.from('transaction_recurring_templates').update({ deleted_at: new Date().toISOString(), is_active: false }).eq('id', template.id))) {
            await f.templates.reload();
            onClose();
        }
    }
    return (_jsx(Modal, { title: template.id ? 'Editar recorrente' : 'Novo recorrente', onClose: onClose, children: _jsxs("form", { onSubmit: save, children: [_jsx(TypeToggle, { value: type, onChange: setType }), _jsx(Field, { label: "Descri\u00E7\u00E3o", children: _jsx("input", { className: "input", value: description, onChange: (e) => setDescription(e.target.value), required: true, placeholder: "Netflix", autoFocus: true }) }), _jsxs("div", { className: "mb-4 flex flex-wrap items-center gap-2", role: "group", "aria-label": "Moeda", children: [_jsx("span", { className: "text-[13px] text-fg2", children: "Moeda" }), _jsx("div", { className: "segmented", children: CURRENCIES.map((c) => (_jsx("button", { type: "button", className: currency === c.code ? 'tab-active' : 'tab', "aria-pressed": currency === c.code, title: c.name, onClick: () => { setCurrency(c.code); setRateEdited(false); }, children: c.symbol }, c.code))) })] }), _jsxs("div", { className: "mb-4 flex items-center gap-2", role: "group", "aria-label": "Frequ\u00EAncia", children: [_jsx("span", { className: "text-[13px] text-fg2", children: "Repete" }), _jsx("div", { className: "segmented", children: [['monthly', 'Todo mês'], ['weekly', 'Toda semana']].map(([k, l]) => (_jsx("button", { type: "button", className: frequency === k ? 'tab-active' : 'tab', "aria-pressed": frequency === k, onClick: () => setFrequency(k), children: l }, k))) })] }), _jsxs("div", { className: "grid grid-cols-2 gap-3", children: [currency === 'BRL'
                            ? _jsx(Field, { label: "Valor (R$)", children: _jsx("input", { className: "input figure", type: "number", min: 0.01, step: "0.01", value: amount, onChange: (e) => setAmount(e.target.value), required: true }) })
                            : _jsx(Field, { label: `Valor (${symbolOf(currency)})`, children: _jsx("input", { className: "input figure", type: "number", min: 0.01, step: "0.01", value: original, onChange: (e) => setOriginal(e.target.value), required: true }) }), _jsx(Field, { label: "A partir de", children: _jsx("input", { className: "input", type: "date", value: start, onChange: (e) => setStart(e.target.value), required: true }) })] }), currency !== 'BRL' && (_jsxs("div", { className: "mb-4 grid grid-cols-2 gap-3", children: [_jsx(Field, { label: `Cotação (R$ por 1 ${symbolOf(currency)})`, children: _jsx("input", { className: "input figure", inputMode: "decimal", value: rateText, onChange: (e) => { setRateText(e.target.value); setRateEdited(true); }, required: true }) }), _jsxs("div", { className: "min-w-0", children: [_jsx("span", { className: "mb-1.5 block text-[13px] text-fg2", children: "Em reais" }), _jsx("span", { className: "figure text-lg", children: reais > 0 ? money(reais) : '—' })] })] })), frequency === 'monthly'
                    ? _jsx(Field, { label: "Dia do m\u00EAs", children: _jsx("input", { className: "input figure", type: "number", min: 1, max: 31, value: day, onChange: (e) => setDay(e.target.value), required: true }) })
                    : (_jsxs("div", { className: "mb-4", role: "group", "aria-label": "Dias da semana", children: [_jsx("span", { className: "mb-1.5 block text-[13px] leading-5 text-fg2", children: "Dias da semana" }), _jsx(WeekdayPicker, { value: weekdays, onChange: setWeekdays })] })), _jsx(CategoryField, { type: type, value: category, onChange: setCategory }), _jsx(PaymentFields, { f: f, type: type, method: method, setMethod: setMethod, bankId: bankId, setBankId: setBankId, cardId: cardId, setCardId: setCardId }), _jsxs("label", { className: "mb-4 flex items-center gap-2 text-sm", children: [_jsx("input", { type: "checkbox", checked: active, onChange: (e) => setActive(e.target.checked) }), "Ativo"] }), _jsxs("div", { className: "flex gap-2", children: [template.id && _jsx("button", { type: "button", className: "btn-ghost text-negative", onClick: remove, children: "Excluir" }), _jsx("button", { className: "btn-primary ml-auto", children: "Salvar" })] })] }) }));
}
