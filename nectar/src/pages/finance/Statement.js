import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useState } from 'react';
import { formatIn, money } from '../../lib/money';
import { ArrowDownLeft, ArrowUpRight, ListOrdered, Search, Upload } from 'lucide-react';
import { formatDay } from '../../lib/dates';
import { monthKey, PAYMENT_LABEL } from '../../lib/finance';
import { searchKey } from '../../lib/text';
import { Empty, ListSkeleton } from '../../components/ui';
import { TxForm } from './forms';
import CsvImportModal from './CsvImportModal';
export default function Statement({ f, year, month }) {
    const [q, setQ] = useState('');
    const [type, setType] = useState('all');
    const [editing, setEditing] = useState(null);
    const [importing, setImporting] = useState(false);
    const key = monthKey(year, month);
    const rows = f.txs.rows.filter((t) => t.date.startsWith(key) && (type === 'all' || t.type === type) &&
        (!q || searchKey(`${t.description} ${t.category ?? ''}`).includes(searchKey(q))));
    const days = [...new Set(rows.map((t) => t.date))].sort().reverse();
    const where = (t) => (t.card_id ? f.cardById.get(t.card_id)?.name : t.bank_id ? f.bankById.get(t.bank_id)?.name : null);
    return (_jsxs(_Fragment, { children: [_jsxs("div", { className: "mb-4 flex flex-wrap items-center gap-2", children: [_jsxs("div", { className: "relative w-full max-w-xs", children: [_jsx(Search, { size: 16, strokeWidth: 1.5, className: "pointer-events-none absolute left-3 top-3 text-fg3" }), _jsx("input", { className: "input pl-9", placeholder: "Buscar", "aria-label": "Buscar lan\u00E7amento", value: q, onChange: (e) => setQ(e.target.value) })] }), _jsx("div", { className: "segmented", children: [['all', 'Tudo'], ['expense', 'Saídas'], ['income', 'Entradas']].map(([k, l]) => _jsx("button", { className: type === k ? 'tab-active' : 'tab', onClick: () => setType(k), children: l }, k)) }), _jsxs("button", { type: "button", className: "btn-secondary sm:ml-auto", onClick: () => setImporting(true), children: [_jsx(Upload, { size: 15, strokeWidth: 1.6, "aria-hidden": "true" }), "Importar CSV"] })] }), f.loading ? _jsx(ListSkeleton, { rows: 5 }) : !rows.length ? _jsx("div", { className: "card", children: _jsx(Empty, { icon: _jsx(ListOrdered, { size: 18, strokeWidth: 1.5 }), children: "Nenhum lan\u00E7amento neste m\u00EAs" }) }) : days.map((d) => (_jsxs("section", { className: "mb-4", children: [_jsx("div", { className: "label mb-2", children: formatDay(d) }), _jsx("ul", { className: "card divide-y divide-line p-0", children: rows.filter((t) => t.date === d).map((t) => (_jsx("li", { children: _jsxs("button", { className: "flex w-full items-center gap-3 px-5 py-3 text-left text-sm hover:bg-raised/50", onClick: () => setEditing(t), children: [_jsx("span", { className: "text-fg3", children: t.type === 'income' ? _jsx(ArrowDownLeft, { size: 16, strokeWidth: 1.5 }) : _jsx(ArrowUpRight, { size: 16, strokeWidth: 1.5 }) }), _jsxs("span", { className: "min-w-0 flex-1", children: [_jsx("span", { className: "block truncate", children: t.description }), _jsx("span", { className: "block text-xs text-fg3", children: [t.category, t.payment_method ? PAYMENT_LABEL[t.payment_method] : null, where(t),
                                                    t.installment_number ? `parcela ${t.installment_number}` : null, t.is_pending ? 'pendente' : null].filter(Boolean).join(' · ') })] }), _jsxs("span", { className: "text-right", children: [_jsxs("span", { className: `figure block ${t.type === 'income' ? 'text-positive' : ''}`, children: [t.type === 'income' ? '+' : '−', money(t.amount)] }), t.currency && t.currency !== 'BRL' && t.original_amount != null && (_jsxs("span", { className: "figure block text-[11px] text-fg3", title: "Valor e cota\u00E7\u00E3o do lan\u00E7amento", children: [formatIn(Number(t.original_amount), t.currency), " \u00B7 ", String(t.fx_rate).replace('.', ',')] }))] })] }) }, t.id))) })] }, d))), editing && _jsx(TxForm, { f: f, tx: editing, onClose: () => setEditing(null) }), importing && _jsx(CsvImportModal, { f: f, onClose: () => setImporting(false) })] }));
}
