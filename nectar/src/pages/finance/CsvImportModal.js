import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useMemo, useState } from 'react';
import { AlertCircle, CheckCircle2, FileSpreadsheet, Upload } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { write } from '../../lib/useTable';
import { EXPENSE_CATEGORIES, INCOME_CATEGORIES } from '../../lib/finance';
import { formatIn, toBRL } from '../../lib/money';
import { parseBankStatement } from '../../lib/csvImport';
import { Field, Modal } from '../../components/ui';
import { useRates } from './useRates';
const FORMAT_LABEL = {
    revolut: 'Revolut',
    wise: 'Wise',
    nubank: 'Nubank / BR',
    generic: 'CSV genérico',
};
const shortDay = (d) => `${d.slice(8)}/${d.slice(5, 7)}/${d.slice(2, 4)}`;
export default function CsvImportModal({ f, onClose }) {
    const fx = useRates(null);
    const [bankId, setBankId] = useState(f.banks.rows[0]?.id ?? '');
    const [rawCsv, setRawCsv] = useState('');
    const [fileName, setFileName] = useState('');
    const [pasteMode, setPasteMode] = useState(false);
    const [deselected, setDeselected] = useState(new Set());
    const [forceSelected, setForceSelected] = useState(new Set());
    const [catOverrides, setCatOverrides] = useState({});
    const [importing, setImporting] = useState(false);
    const [errorMsg, setErrorMsg] = useState(null);
    const selectedBank = f.banks.rows.find((b) => b.id === bankId);
    const defaultCurrency = selectedBank?.currency ?? 'BRL';
    const parsed = useMemo(() => (rawCsv.trim() ? parseBankStatement(rawCsv, f.txs.rows, defaultCurrency) : null), [rawCsv, f.txs.rows, defaultCurrency]);
    const isSelected = (r) => (r.duplicate ? forceSelected.has(r.rowIndex) : !deselected.has(r.rowIndex));
    function toggleRow(r) {
        if (r.duplicate) {
            setForceSelected((prev) => {
                const next = new Set(prev);
                if (next.has(r.rowIndex))
                    next.delete(r.rowIndex);
                else
                    next.add(r.rowIndex);
                return next;
            });
        }
        else {
            setDeselected((prev) => {
                const next = new Set(prev);
                if (next.has(r.rowIndex))
                    next.delete(r.rowIndex);
                else
                    next.add(r.rowIndex);
                return next;
            });
        }
    }
    function handleFile(e) {
        const file = e.target.files?.[0];
        if (!file)
            return;
        setFileName(file.name);
        setDeselected(new Set());
        setForceSelected(new Set());
        setCatOverrides({});
        setErrorMsg(null);
        const reader = new FileReader();
        reader.onload = () => setRawCsv(String(reader.result ?? ''));
        reader.readAsText(file, 'UTF-8');
    }
    const chosen = parsed ? parsed.rows.filter(isSelected) : [];
    const dupCount = parsed ? parsed.rows.filter((r) => r.duplicate).length : 0;
    async function importSelected() {
        if (!chosen.length)
            return;
        setErrorMsg(null);
        const payload = [];
        for (const r of chosen) {
            let amountBrl = r.amount;
            let originalAmount = null;
            let fxRate = null;
            if (r.currency !== 'BRL') {
                const q = fx.rates?.[r.currency];
                if (!q || q <= 0) {
                    setErrorMsg(`Cotação para ${r.currency} indisponível no momento. Tente novamente em instantes.`);
                    return;
                }
                fxRate = q;
                originalAmount = r.amount;
                amountBrl = toBRL(r.amount, q);
            }
            payload.push({
                type: r.type,
                description: r.description,
                amount: amountBrl,
                currency: r.currency,
                original_amount: originalAmount,
                fx_rate: fxRate,
                date: r.date,
                category: catOverrides[r.rowIndex] ?? r.category,
                payment_method: 'debito',
                bank_id: bankId || null,
                is_pending: false,
            });
        }
        setImporting(true);
        const ok = await write(supabase.from('transactions').insert(payload));
        setImporting(false);
        if (ok) {
            await f.reloadMoney();
            onClose();
        }
    }
    return (_jsxs(Modal, { title: "Importar extrato CSV", onClose: onClose, children: [_jsxs("p", { className: "-mt-3 mb-4 text-sm text-fg3", children: ["Compat\u00EDvel com extratos ", _jsx("strong", { children: "Revolut" }), ", ", _jsx("strong", { children: "Wise" }), ", ", _jsx("strong", { children: "Nubank" }), ", Inter e CSVs gen\u00E9ricos. Duplicados j\u00E1 lan\u00E7ados s\u00E3o desmarcados automaticamente."] }), _jsxs("div", { className: "mb-4 grid gap-3 sm:grid-cols-2", children: [_jsx(Field, { label: "Conta de destino", children: _jsxs("select", { className: "input", value: bankId, onChange: (e) => setBankId(e.target.value), children: [_jsx("option", { value: "", children: "Nenhuma (sem conta vinculada)" }), f.banks.rows.map((b) => (_jsxs("option", { value: b.id, children: [b.name, b.currency && b.currency !== 'BRL' ? ` (${b.currency})` : ''] }, b.id)))] }) }), _jsxs("div", { children: [_jsx("span", { className: "mb-1.5 block text-[13px] leading-5 text-fg2", children: "Arquivo do extrato" }), _jsxs("div", { className: "flex gap-2", children: [_jsxs("label", { className: "btn-secondary flex-1 cursor-pointer justify-center", children: [_jsx(Upload, { size: 15, strokeWidth: 1.6, "aria-hidden": "true" }), _jsx("span", { className: "truncate", children: fileName || 'Escolher .csv' }), _jsx("input", { type: "file", accept: ".csv,text/csv", className: "sr-only", onChange: handleFile })] }), _jsx("button", { type: "button", className: "btn-ghost shrink-0 text-xs", onClick: () => setPasteMode((v) => !v), children: pasteMode ? 'Ocultar texto' : 'Colar CSV' })] })] })] }), pasteMode && (_jsx(Field, { label: "Cole o conte\u00FAdo do CSV", children: _jsx("textarea", { className: "input font-mono text-xs", rows: 4, placeholder: "Data,Descri\u00E7\u00E3o,Valor\n15/11/2026,Lidl,-42.50", value: rawCsv, onChange: (e) => { setRawCsv(e.target.value); setDeselected(new Set()); setForceSelected(new Set()); setErrorMsg(null); } }) })), errorMsg && (_jsxs("div", { className: "mb-4 flex items-center gap-2 rounded-xl border border-negative/30 bg-negative/10 px-3 py-2 text-xs text-negative", role: "alert", children: [_jsx(AlertCircle, { size: 15, strokeWidth: 1.6, className: "shrink-0" }), _jsx("span", { children: errorMsg })] })), parsed && (_jsxs("div", { className: "mb-4", children: [_jsxs("div", { className: "mb-2 flex flex-wrap items-center gap-2 text-xs text-fg2", children: [_jsxs("span", { className: "badge bg-brand/12 text-brand-ink", children: [_jsx(FileSpreadsheet, { size: 12, strokeWidth: 1.6, "aria-hidden": "true", className: "mr-1" }), FORMAT_LABEL[parsed.format]] }), _jsxs("span", { children: [parsed.rows.length, " ", parsed.rows.length === 1 ? 'lançamento lido' : 'lançamentos lidos'] }), dupCount > 0 && _jsxs("span", { className: "text-warning", children: ["\u00B7 ", dupCount, " ", dupCount === 1 ? 'possível duplicado' : 'possíveis duplicados'] }), parsed.skippedCount > 0 && _jsxs("span", { className: "text-fg3", children: ["\u00B7 ", parsed.skippedCount, " ignorados"] })] }), parsed.warnings.map((w, i) => (_jsx("p", { className: "mb-2 text-xs text-warning", children: w }, i))), parsed.rows.length > 0 && (_jsx("div", { className: "max-h-72 overflow-y-auto rounded-xl border border-line", children: _jsx("ul", { className: "divide-y divide-line text-sm", children: parsed.rows.map((r) => {
                                const checked = isSelected(r);
                                const cats = r.type === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;
                                const cat = catOverrides[r.rowIndex] ?? r.category;
                                return (_jsxs("li", { className: `flex flex-wrap items-center gap-2 px-3 py-2 sm:flex-nowrap ${!checked ? 'opacity-50' : ''}`, children: [_jsx("input", { type: "checkbox", className: "h-4 w-4 shrink-0", checked: checked, onChange: () => toggleRow(r), "aria-label": `Selecionar ${r.description}` }), _jsx("span", { className: "figure w-16 shrink-0 text-xs text-fg3", children: shortDay(r.date) }), _jsxs("div", { className: "min-w-0 flex-1", children: [_jsx("div", { className: "truncate font-medium", children: r.description }), r.duplicate && _jsx("span", { className: "text-[11px] text-warning", children: "J\u00E1 existe lan\u00E7amento semelhante" })] }), _jsx("select", { className: "input h-8 w-32 shrink-0 py-0 text-xs", "aria-label": `Categoria de ${r.description}`, value: cat, onChange: (e) => setCatOverrides((prev) => ({ ...prev, [r.rowIndex]: e.target.value })), children: cats.map((c) => _jsx("option", { value: c, children: c }, c)) }), _jsxs("span", { className: `figure w-24 shrink-0 text-right text-xs font-medium ${r.type === 'income' ? 'text-positive' : ''}`, children: [r.type === 'income' ? '+' : '−', formatIn(r.amount, r.currency)] })] }, r.rowIndex));
                            }) }) }))] })), _jsxs("div", { className: "flex items-center gap-2", children: [_jsx("button", { type: "button", className: "btn-ghost", onClick: onClose, children: "Cancelar" }), _jsxs("button", { type: "button", className: "btn-primary ml-auto", disabled: importing || chosen.length === 0, onClick: () => void importSelected(), children: [_jsx(CheckCircle2, { size: 15, strokeWidth: 1.6, "aria-hidden": "true" }), importing ? 'Importando…' : `Importar ${chosen.length} ${chosen.length === 1 ? 'lançamento' : 'lançamentos'}`] })] })] }));
}
