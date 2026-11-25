import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useState } from 'react';
import { money } from '../../lib/money';
import { ArrowLeftRight, Landmark, Pencil, Plus } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { write } from '../../lib/useTable';
import { formatDay, toDay } from '../../lib/dates';
import { bankBalance, cardUsed, invoices, netWorth } from '../../lib/finance';
import { DonutChart } from '../../components/Charts';
import { Empty, Field, Figure, Modal } from '../../components/ui';
import { BankForm, CardForm, TransferForm } from './forms';
const I = { size: 16, strokeWidth: 1.5 };
export default function Accounts({ f }) {
    const [bank, setBank] = useState(undefined);
    const [card, setCard] = useState(undefined);
    const [transfer, setTransfer] = useState(false);
    const [paying, setPaying] = useState(null);
    const today = toDay(new Date());
    const totalWorth = netWorth(f.banks.rows, f.txs.rows, f.transfers.rows, f.payments.rows, today);
    const accountRows = f.banks.rows.map((b) => ({
        bank: b,
        balance: bankBalance(b, f.txs.rows, f.transfers.rows, f.payments.rows, today),
    }));
    const positiveSum = accountRows.reduce((s, r) => s + Math.max(0, r.balance), 0);
    return (_jsxs("div", { className: "grid gap-6 xl:grid-cols-2", children: [_jsxs("section", { className: "space-y-4", children: [_jsxs("div", { className: "flex items-center gap-2", children: [_jsx("h2", { className: "mr-auto font-medium", children: "Contas" }), f.banks.rows.length > 1 && _jsxs("button", { className: "btn-ghost", onClick: () => setTransfer(true), children: [_jsx(ArrowLeftRight, { ...I }), "Transferir"] }), _jsxs("button", { className: "btn-secondary", onClick: () => setBank(null), children: [_jsx(Plus, { ...I }), "Conta"] })] }), !f.banks.rows.length ? _jsx("div", { className: "card", children: _jsx(Empty, { icon: _jsx(Landmark, { size: 18, strokeWidth: 1.5 }), action: _jsx("button", { className: "btn-secondary", onClick: () => setBank(null), children: "Adicionar conta" }), children: "Seu patrim\u00F4nio come\u00E7a aqui: cadastre suas contas com o saldo de hoje" }) }) : (_jsxs(_Fragment, { children: [positiveSum > 0 && (_jsx(DonutChart, { title: "Distribui\u00E7\u00E3o do patrim\u00F4nio", subtitle: `Total consolidado: ${money(totalWorth)}`, centerLabel: "Patrim\u00F4nio", format: money, rows: accountRows.map((r) => ({ label: r.bank.name, value: Math.max(0, r.balance), color: r.bank.color || undefined })) })), _jsx("ul", { className: "grid gap-4 sm:grid-cols-2", children: accountRows.map(({ bank: b, balance }, idx) => {
                                    const share = positiveSum > 0 && balance > 0 ? Math.round((balance / positiveSum) * 100) : 0;
                                    const finishes = [
                                        'linear-gradient(155deg, #27272b 0%, #18181b 55%, #111113 100%)',
                                        'linear-gradient(155deg, #22262b 0%, #16191d 55%, #101215 100%)',
                                        'linear-gradient(155deg, #282623 0%, #1a1816 55%, #121110 100%)',
                                    ];
                                    return (_jsxs("li", { className: "relative flex min-h-[156px] min-w-0 flex-col justify-between overflow-hidden rounded-[14px] p-5 text-[#ededed]", style: {
                                            background: finishes[idx % finishes.length],
                                            boxShadow: 'inset 0 1px 0 rgb(255 255 255 / 0.14), 0 0 0 1px rgb(255 255 255 / 0.08)',
                                        }, children: [_jsxs("div", { className: "flex items-center gap-2", children: [_jsxs("span", { className: "inline-flex min-w-0 flex-1 items-center gap-2 text-sm font-medium text-[#ededed]", children: [_jsx("span", { className: "h-2 w-2 shrink-0 rounded-full", style: { background: b.color || 'var(--brand)' }, "aria-hidden": "true" }), _jsx("span", { className: "truncate", children: b.name })] }), _jsx("span", { className: "rounded-[4px] border border-white/12 bg-white/6 px-2 py-0.5 font-mono text-[11px] leading-4 text-[#a1a1a6]", children: b.currency ?? 'BRL' }), _jsx("button", { type: "button", className: "inline-flex h-8 w-8 items-center justify-center rounded-[8px] border border-white/10 bg-white/5 text-[#a1a1a6] transition-colors duration-150 hover:bg-white/12 hover:text-[#ededed]", onClick: () => setBank(b), "aria-label": `Editar ${b.name}`, children: _jsx(Pencil, { ...I }) })] }), _jsxs("div", { className: "my-3 flex items-center justify-between gap-4", children: [_jsxs("svg", { width: "34", height: "24", viewBox: "0 0 34 24", "aria-hidden": "true", children: [_jsx("rect", { x: "0.5", y: "0.5", width: "33", height: "23", rx: "4.5", fill: "#a1a1aa", fillOpacity: "0.22", stroke: "#a1a1aa", strokeOpacity: "0.55", strokeWidth: "1" }), _jsx("path", { d: "M11 1v22M23 1v22M1 9h10M23 9h10M1 15h10M23 15h10", stroke: "#e4e4e7", strokeOpacity: "0.4", strokeWidth: "1" })] }), _jsx(Figure, { value: money(balance), className: "truncate text-[24px] leading-none font-medium text-[#ededed]" })] }), _jsxs("div", { className: "flex items-center gap-3", children: [_jsx("div", { className: "h-1 flex-1 overflow-hidden rounded-full bg-white/10", children: _jsx("div", { className: "h-full rounded-full", style: { width: `${share}%`, background: b.color || '#ededed' } }) }), _jsxs("span", { className: "figure text-xs text-[#a1a1a6]", children: [share, "%"] })] })] }, b.id));
                                }) })] }))] }), _jsxs("section", { children: [_jsxs("div", { className: "mb-3 flex items-center gap-2", children: [_jsx("h2", { className: "mr-auto font-medium", children: "Cart\u00F5es de cr\u00E9dito" }), _jsxs("button", { className: "btn-secondary", onClick: () => setCard(null), children: [_jsx(Plus, { ...I }), "Cart\u00E3o"] })] }), !f.cards.rows.length && _jsx("div", { className: "card", children: _jsx(Empty, { children: "Cadastre seus cart\u00F5es com o dia de fechamento e de vencimento" }) }), _jsx("div", { className: "space-y-4", children: f.cards.rows.map((c) => {
                            const used = cardUsed(c, f.txs.rows, f.payments.rows);
                            const invs = invoices(c, f.txs.rows, f.payments.rows);
                            const open = invs.filter((i) => !i.paid);
                            return (_jsxs("article", { className: "card", children: [_jsxs("div", { className: "mb-3 flex items-start gap-2", children: [_jsxs("div", { className: "mr-auto", children: [_jsx("div", { className: "font-medium", children: c.name }), _jsxs("div", { className: "text-[13px] text-fg3", children: ["fecha dia ", c.closing_day, " \u00B7 vence dia ", c.due_day] })] }), _jsx("button", { className: "icon-btn", onClick: () => setCard(c), "aria-label": `Editar ${c.name}`, children: _jsx(Pencil, { ...I }) })] }), c.credit_limit ? (_jsxs(_Fragment, { children: [_jsxs("div", { className: "mb-1 flex text-sm", children: [_jsx("span", { className: "mr-auto text-fg2", children: "Limite usado" }), _jsx("span", { className: "figure", children: money(used) }), _jsxs("span", { className: "figure ml-1 text-fg3", children: ["/ ", money(c.credit_limit)] })] }), _jsx("div", { className: "mb-4 h-1.5 rounded-sm bg-raised", children: _jsx("div", { className: "h-1.5 rounded-sm bg-brand", style: { width: `${Math.min(100, (used / c.credit_limit) * 100)}%` } }) })] })) : null, !open.length ? _jsx("p", { className: "text-sm text-fg3", children: "Nenhuma fatura em aberto" }) : (_jsx("ul", { className: "divide-y divide-line text-sm", children: open.slice(0, 4).map((inv) => (_jsxs("li", { className: "flex items-center gap-3 py-2", children: [_jsxs("span", { className: "mr-auto", children: ["Fatura de ", formatDay(inv.dueDate), _jsxs("span", { className: "ml-2 text-xs text-fg3", children: [inv.closeDate > today ? 'aberta' : 'fechada', " \u00B7 ", inv.items.length, " ", inv.items.length === 1 ? 'compra' : 'compras'] })] }), _jsx("span", { className: "figure", children: money(inv.total) }), _jsx("button", { className: "btn-ghost h-8", onClick: () => setPaying({ card: c, inv }), children: "Pagar" })] }, inv.dueDate))) }))] }, c.id));
                        }) })] }), bank !== undefined && _jsx(BankForm, { f: f, bank: bank ?? undefined, onClose: () => setBank(undefined) }), card !== undefined && _jsx(CardForm, { f: f, card: card ?? undefined, onClose: () => setCard(undefined) }), transfer && _jsx(TransferForm, { f: f, onClose: () => setTransfer(false) }), paying && _jsx(PayInvoice, { f: f, card: paying.card, inv: paying.inv, onClose: () => setPaying(null) })] }));
}
function PayInvoice({ f, card, inv, onClose }) {
    const [bankId, setBankId] = useState(card.bank_id ?? f.banks.rows[0]?.id ?? '');
    const [amount, setAmount] = useState(inv.total.toString());
    const [date, setDate] = useState(toDay(new Date()));
    async function pay() {
        if (await write(supabase.from('card_invoice_payments').insert({ card_id: card.id, year: inv.year, month: inv.month, amount: Number(amount), paid_at: date, bank_id: bankId || null }))) {
            await f.payments.reload();
            onClose();
        }
    }
    return (_jsxs(Modal, { title: `Pagar fatura ${card.name}`, onClose: onClose, children: [_jsxs("p", { className: "mb-4 text-sm text-fg2", children: ["Vencimento ", formatDay(inv.dueDate), " \u00B7 ", inv.items.length, " ", inv.items.length === 1 ? 'compra' : 'compras'] }), _jsx("ul", { className: "mb-4 max-h-40 overflow-y-auto text-sm", children: inv.items.map((t) => _jsxs("li", { className: "flex border-t border-line py-1.5", children: [_jsx("span", { className: "mr-auto truncate", children: t.description }), _jsx("span", { className: "figure text-fg2", children: money(t.amount) })] }, t.id)) }), _jsxs("div", { className: "grid grid-cols-2 gap-3", children: [_jsx(Field, { label: "Valor (R$)", children: _jsx("input", { className: "input figure", type: "number", step: "0.01", value: amount, onChange: (e) => setAmount(e.target.value) }) }), _jsx(Field, { label: "Pago em", children: _jsx("input", { className: "input", type: "date", value: date, onChange: (e) => setDate(e.target.value) }) })] }), _jsx(Field, { label: "Saiu da conta", children: _jsxs("select", { className: "input", value: bankId, onChange: (e) => setBankId(e.target.value), children: [_jsx("option", { value: "", children: "Nenhuma" }), f.banks.rows.map((b) => _jsx("option", { value: b.id, children: b.name }, b.id))] }) }), _jsx("button", { className: "btn-primary w-full", onClick: pay, children: "Registrar pagamento" })] }));
}
