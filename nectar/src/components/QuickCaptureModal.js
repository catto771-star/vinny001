import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { write } from '../lib/useTable';
import { addDays, toDay } from '../lib/dates';
import { newBlock } from '../lib/blocks';
import { CURRENCIES, displayCurrency, symbolOf, toBRL } from '../lib/money';
import { EXPENSE_CATEGORIES, INCOME_CATEGORIES } from '../lib/finance';
import { useRates } from '../pages/finance/useRates';
import { Field, FieldGroup, Modal } from './ui';
export function openQuickCapture(tab = 'task') {
    window.dispatchEvent(new CustomEvent('painel-quick-capture', { detail: tab }));
}
export function notifyDataChanged() {
    window.dispatchEvent(new Event('painel-data-changed'));
}
const TAB_LABEL = { task: 'Tarefa', money: 'Finanças', note: 'Nota' };
export function QuickCaptureModal() {
    const [open, setOpen] = useState(null);
    useEffect(() => {
        const onOpen = (e) => setOpen(e.detail ?? 'task');
        window.addEventListener('painel-quick-capture', onOpen);
        return () => window.removeEventListener('painel-quick-capture', onOpen);
    }, []);
    if (!open)
        return null;
    return _jsx(QuickCaptureDialog, { initial: open, onClose: () => setOpen(null) });
}
function QuickCaptureDialog({ initial, onClose }) {
    const [tab, setTab] = useState(initial);
    const [saving, setSaving] = useState(false);
    // Task state
    const [taskTitle, setTaskTitle] = useState('');
    const [taskWhen, setTaskWhen] = useState('today');
    const [priority, setPriority] = useState('medium');
    // Money state
    const [txType, setTxType] = useState('expense');
    const [currency, setCurrency] = useState(displayCurrency());
    const [amountText, setAmountText] = useState('');
    const [txDesc, setTxDesc] = useState('');
    const [txCat, setTxCat] = useState('');
    const [banks, setBanks] = useState([]);
    const [bankId, setBankId] = useState('');
    const quote = useRates(null);
    // Note state
    const [noteTitle, setNoteTitle] = useState('');
    const [noteText, setNoteText] = useState('');
    useEffect(() => {
        void supabase.from('banks').select('id,name,currency').order('name').then(({ data }) => {
            const list = (data ?? []);
            setBanks(list);
            if (list.length) {
                const match = list.find((b) => b.currency === displayCurrency()) ?? list[0];
                setBankId(match.id);
            }
        });
    }, []);
    async function submitTask(e) {
        e.preventDefault();
        const title = taskTitle.trim();
        if (!title || saving)
            return;
        setSaving(true);
        const today = toDay(new Date());
        const day = taskWhen === 'today' ? today : taskWhen === 'tomorrow' ? addDays(today, 1) : null;
        const ok = await write(supabase.from('tasks').insert({
            title,
            priority,
            due_date: day ? new Date(`${day}T12:00:00`).toISOString() : null,
            due_all_day: !!day,
        }));
        setSaving(false);
        if (ok) {
            notifyDataChanged();
            onClose();
        }
    }
    async function submitMoney(e) {
        e.preventDefault();
        const val = Number(amountText.replace(',', '.'));
        const description = txDesc.trim();
        if (!(val > 0) || !description || saving)
            return;
        const rate = currency === 'BRL' ? null : quote.rates?.[currency] ?? null;
        if (currency !== 'BRL' && !rate)
            return;
        setSaving(true);
        const amount = currency === 'BRL' ? val : toBRL(val, rate);
        const ok = await write(supabase.from('transactions').insert({
            type: txType,
            description,
            amount,
            currency,
            original_amount: currency === 'BRL' ? null : val,
            fx_rate: rate,
            date: toDay(new Date()),
            category: txCat.trim() || null,
            payment_method: 'debito',
            bank_id: bankId || null,
            card_id: null,
            is_pending: false,
        }));
        setSaving(false);
        if (ok) {
            notifyDataChanged();
            onClose();
        }
    }
    async function submitNote(e) {
        e.preventDefault();
        const title = noteTitle.trim();
        if (!title || saving)
            return;
        setSaving(true);
        const lines = noteText.split('\n');
        const blocks = lines.map((l) => newBlock('paragraph', l));
        const ok = await write(supabase.from('knowledge_blocks').insert({
            title,
            content: blocks,
            content_text: noteText.trim(),
            tags: [],
            importance: 2,
            is_pinned: false,
            is_favorite: false,
        }));
        setSaving(false);
        if (ok) {
            notifyDataChanged();
            onClose();
        }
    }
    const rateMissing = currency !== 'BRL' && !quote.rates?.[currency];
    const categories = txType === 'expense' ? EXPENSE_CATEGORIES : INCOME_CATEGORIES;
    return (_jsxs(Modal, { title: "Captura r\u00E1pida", onClose: onClose, children: [_jsx("div", { className: "segmented mb-5 w-full", role: "tablist", "aria-label": "Tipo de registro", children: ['task', 'money', 'note'].map((t) => (_jsx("button", { type: "button", role: "tab", "aria-selected": tab === t, className: `flex-1 justify-center ${tab === t ? 'tab-active' : 'tab'}`, onClick: () => setTab(t), children: TAB_LABEL[t] }, t))) }), tab === 'task' && (_jsxs("form", { onSubmit: submitTask, children: [_jsx(Field, { label: "O que precisa ser feito?", children: _jsx("input", { className: "input", value: taskTitle, onChange: (e) => setTaskTitle(e.target.value), placeholder: "Ex.: Enviar atividade do QQI", required: true, autoFocus: true }) }), _jsxs("div", { className: "grid grid-cols-2 gap-3", children: [_jsx(FieldGroup, { label: "Quando", children: _jsx("div", { className: "segmented w-full", children: [['today', 'Hoje'], ['tomorrow', 'Amanhã'], ['none', 'Sem data']].map(([v, l]) => (_jsx("button", { type: "button", "aria-pressed": taskWhen === v, className: `flex-1 justify-center px-2 ${taskWhen === v ? 'tab-active' : 'tab'}`, onClick: () => setTaskWhen(v), children: l }, v))) }) }), _jsx(FieldGroup, { label: "Prioridade", children: _jsx("div", { className: "segmented w-full", children: [['high', 'Alta'], ['medium', 'Média'], ['low', 'Baixa']].map(([v, l]) => (_jsx("button", { type: "button", "aria-pressed": priority === v, className: `flex-1 justify-center px-2 ${priority === v ? 'tab-active' : 'tab'}`, onClick: () => setPriority(v), children: l }, v))) }) })] }), _jsxs("div", { className: "mt-2 flex justify-end gap-2", children: [_jsx("button", { type: "button", className: "btn-ghost", onClick: onClose, children: "Cancelar" }), _jsx("button", { className: "btn-primary", disabled: saving || !taskTitle.trim(), children: saving ? 'Salvando…' : 'Criar tarefa' })] })] })), tab === 'money' && (_jsxs("form", { onSubmit: submitMoney, children: [_jsxs("div", { className: "mb-4 flex flex-wrap items-center gap-2", children: [_jsx("div", { className: "segmented", role: "group", "aria-label": "Tipo", children: [['expense', 'Saída'], ['income', 'Entrada']].map(([v, l]) => (_jsx("button", { type: "button", "aria-pressed": txType === v, className: txType === v ? 'tab-active' : 'tab', onClick: () => setTxType(v), children: l }, v))) }), _jsx("div", { className: "segmented ml-auto", role: "group", "aria-label": "Moeda", children: CURRENCIES.map((c) => (_jsx("button", { type: "button", "aria-pressed": currency === c.code, className: currency === c.code ? 'tab-active' : 'tab', onClick: () => setCurrency(c.code), children: c.symbol }, c.code))) })] }), _jsxs("div", { className: "grid grid-cols-2 gap-3", children: [_jsx(Field, { label: `Valor (${symbolOf(currency)})`, children: _jsx("input", { className: "input figure", type: "number", min: 0.01, step: "0.01", inputMode: "decimal", value: amountText, onChange: (e) => setAmountText(e.target.value), placeholder: "0,00", required: true, autoFocus: true }) }), _jsx(Field, { label: "Conta", children: _jsxs("select", { className: "input", value: bankId, onChange: (e) => setBankId(e.target.value), children: [_jsx("option", { value: "", children: "Nenhuma" }), banks.map((b) => _jsx("option", { value: b.id, children: b.name }, b.id))] }) })] }), _jsx(Field, { label: "Descri\u00E7\u00E3o", children: _jsx("input", { className: "input", value: txDesc, onChange: (e) => setTxDesc(e.target.value), placeholder: "Ex.: Tesco, Almo\u00E7o, Renda", required: true }) }), _jsxs(Field, { label: "Categoria (opcional)", children: [_jsx("input", { className: "input", list: "quick-cats", value: txCat, onChange: (e) => setTxCat(e.target.value), placeholder: categories[0] }), _jsx("datalist", { id: "quick-cats", children: categories.map((c) => _jsx("option", { value: c }, c)) })] }), rateMissing && _jsxs("p", { className: "mb-3 text-xs text-fg3", children: ["Buscando cota\u00E7\u00E3o de ", currency, "\u2026"] }), _jsxs("div", { className: "mt-2 flex justify-end gap-2", children: [_jsx("button", { type: "button", className: "btn-ghost", onClick: onClose, children: "Cancelar" }), _jsx("button", { className: "btn-primary", disabled: saving || rateMissing || !txDesc.trim() || !amountText, children: saving ? 'Salvando…' : 'Registrar' })] })] })), tab === 'note' && (_jsxs("form", { onSubmit: submitNote, children: [_jsx(Field, { label: "T\u00EDtulo da nota", children: _jsx("input", { className: "input", value: noteTitle, onChange: (e) => setNoteTitle(e.target.value), placeholder: "Ex.: Ideia para o projeto", required: true, autoFocus: true }) }), _jsx(Field, { label: "Conte\u00FAdo", children: _jsx("textarea", { className: "input h-28 py-2.5", value: noteText, onChange: (e) => setNoteText(e.target.value), placeholder: "Escreva livremente\u2026" }) }), _jsxs("div", { className: "mt-2 flex justify-end gap-2", children: [_jsx("button", { type: "button", className: "btn-ghost", onClick: onClose, children: "Cancelar" }), _jsx("button", { className: "btn-primary", disabled: saving || !noteTitle.trim(), children: saving ? 'Salvando…' : 'Salvar nota' })] })] }))] }));
}
