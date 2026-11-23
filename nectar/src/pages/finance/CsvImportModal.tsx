import { useMemo, useState, type ChangeEvent } from 'react';
import { AlertCircle, CheckCircle2, FileSpreadsheet, Upload } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { write } from '../../lib/useTable';
import { EXPENSE_CATEGORIES, INCOME_CATEGORIES } from '../../lib/finance';
import { formatIn, toBRL, type Currency } from '../../lib/money';
import { parseBankStatement, type BankCsvFormat, type ParsedCsvRow } from '../../lib/csvImport';
import { Field, Modal } from '../../components/ui';
import { useRates } from './useRates';
import type { Finance } from './useFinance';

const FORMAT_LABEL: Record<BankCsvFormat, string> = {
  revolut: 'Revolut',
  wise: 'Wise',
  nubank: 'Nubank / BR',
  generic: 'CSV genérico',
};

const shortDay = (d: string) => `${d.slice(8)}/${d.slice(5, 7)}/${d.slice(2, 4)}`;

export default function CsvImportModal({ f, onClose }: { f: Finance; onClose: () => void }) {
  const fx = useRates(null);
  const [bankId, setBankId] = useState(f.banks.rows[0]?.id ?? '');
  const [rawCsv, setRawCsv] = useState('');
  const [fileName, setFileName] = useState('');
  const [pasteMode, setPasteMode] = useState(false);
  const [deselected, setDeselected] = useState<Set<number>>(new Set());
  const [forceSelected, setForceSelected] = useState<Set<number>>(new Set());
  const [catOverrides, setCatOverrides] = useState<Record<number, string>>({});
  const [importing, setImporting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const selectedBank = f.banks.rows.find((b) => b.id === bankId);
  const defaultCurrency: Currency = selectedBank?.currency ?? 'BRL';

  const parsed = useMemo(
    () => (rawCsv.trim() ? parseBankStatement(rawCsv, f.txs.rows, defaultCurrency) : null),
    [rawCsv, f.txs.rows, defaultCurrency],
  );

  const isSelected = (r: ParsedCsvRow) => (r.duplicate ? forceSelected.has(r.rowIndex) : !deselected.has(r.rowIndex));

  function toggleRow(r: ParsedCsvRow) {
    if (r.duplicate) {
      setForceSelected((prev) => {
        const next = new Set(prev);
        if (next.has(r.rowIndex)) next.delete(r.rowIndex);
        else next.add(r.rowIndex);
        return next;
      });
    } else {
      setDeselected((prev) => {
        const next = new Set(prev);
        if (next.has(r.rowIndex)) next.delete(r.rowIndex);
        else next.add(r.rowIndex);
        return next;
      });
    }
  }

  function handleFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
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
    if (!chosen.length) return;
    setErrorMsg(null);

    const payload = [];
    for (const r of chosen) {
      let amountBrl = r.amount;
      let originalAmount: number | null = null;
      let fxRate: number | null = null;
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

  return (
    <Modal title="Importar extrato CSV" onClose={onClose}>
      <p className="-mt-3 mb-4 text-sm text-fg3">
        Compatível com extratos <strong>Revolut</strong>, <strong>Wise</strong>, <strong>Nubank</strong>, Inter e CSVs genéricos. Duplicados já lançados são desmarcados automaticamente.
      </p>

      <div className="mb-4 grid gap-3 sm:grid-cols-2">
        <Field label="Conta de destino">
          <select className="input" value={bankId} onChange={(e) => setBankId(e.target.value)}>
            <option value="">Nenhuma (sem conta vinculada)</option>
            {f.banks.rows.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}{b.currency && b.currency !== 'BRL' ? ` (${b.currency})` : ''}
              </option>
            ))}
          </select>
        </Field>
        <div>
          <span className="mb-1.5 block text-[13px] leading-5 text-fg2">Arquivo do extrato</span>
          <div className="flex gap-2">
            <label className="btn-secondary flex-1 cursor-pointer justify-center">
              <Upload size={15} strokeWidth={1.6} aria-hidden="true" />
              <span className="truncate">{fileName || 'Escolher .csv'}</span>
              <input type="file" accept=".csv,text/csv" className="sr-only" onChange={handleFile} />
            </label>
            <button type="button" className="btn-ghost shrink-0 text-xs" onClick={() => setPasteMode((v) => !v)}>
              {pasteMode ? 'Ocultar texto' : 'Colar CSV'}
            </button>
          </div>
        </div>
      </div>

      {pasteMode && (
        <Field label="Cole o conteúdo do CSV">
          <textarea
            className="input font-mono text-xs"
            rows={4}
            placeholder="Data,Descrição,Valor&#10;15/11/2026,Lidl,-42.50"
            value={rawCsv}
            onChange={(e) => { setRawCsv(e.target.value); setDeselected(new Set()); setForceSelected(new Set()); setErrorMsg(null); }}
          />
        </Field>
      )}

      {errorMsg && (
        <div className="mb-4 flex items-center gap-2 rounded-xl border border-negative/30 bg-negative/10 px-3 py-2 text-xs text-negative" role="alert">
          <AlertCircle size={15} strokeWidth={1.6} className="shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {parsed && (
        <div className="mb-4">
          <div className="mb-2 flex flex-wrap items-center gap-2 text-xs text-fg2">
            <span className="badge bg-brand/12 text-brand-ink">
              <FileSpreadsheet size={12} strokeWidth={1.6} aria-hidden="true" className="mr-1" />
              {FORMAT_LABEL[parsed.format]}
            </span>
            <span>{parsed.rows.length} {parsed.rows.length === 1 ? 'lançamento lido' : 'lançamentos lidos'}</span>
            {dupCount > 0 && <span className="text-warning">· {dupCount} {dupCount === 1 ? 'possível duplicado' : 'possíveis duplicados'}</span>}
            {parsed.skippedCount > 0 && <span className="text-fg3">· {parsed.skippedCount} ignorados</span>}
          </div>

          {parsed.warnings.map((w, i) => (
            <p key={i} className="mb-2 text-xs text-warning">{w}</p>
          ))}

          {parsed.rows.length > 0 && (
            <div className="max-h-72 overflow-y-auto rounded-xl border border-line">
              <ul className="divide-y divide-line text-sm">
                {parsed.rows.map((r) => {
                  const checked = isSelected(r);
                  const cats = r.type === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;
                  const cat = catOverrides[r.rowIndex] ?? r.category;
                  return (
                    <li key={r.rowIndex} className={`flex flex-wrap items-center gap-2 px-3 py-2 sm:flex-nowrap ${!checked ? 'opacity-50' : ''}`}>
                      <input
                        type="checkbox"
                        className="h-4 w-4 shrink-0"
                        checked={checked}
                        onChange={() => toggleRow(r)}
                        aria-label={`Selecionar ${r.description}`}
                      />
                      <span className="figure w-16 shrink-0 text-xs text-fg3">{shortDay(r.date)}</span>
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-medium">{r.description}</div>
                        {r.duplicate && <span className="text-[11px] text-warning">Já existe lançamento semelhante</span>}
                      </div>
                      <select
                        className="input h-8 w-32 shrink-0 py-0 text-xs"
                        aria-label={`Categoria de ${r.description}`}
                        value={cat}
                        onChange={(e) => setCatOverrides((prev) => ({ ...prev, [r.rowIndex]: e.target.value }))}
                      >
                        {cats.map((c) => <option key={c} value={c}>{c}</option>)}
                      </select>
                      <span className={`figure w-24 shrink-0 text-right text-xs font-medium ${r.type === 'income' ? 'text-positive' : ''}`}>
                        {r.type === 'income' ? '+' : '−'}{formatIn(r.amount, r.currency)}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </div>
      )}

      <div className="flex items-center gap-2">
        <button type="button" className="btn-ghost" onClick={onClose}>Cancelar</button>
        <button
          type="button"
          className="btn-primary ml-auto"
          disabled={importing || chosen.length === 0}
          onClick={() => void importSelected()}
        >
          <CheckCircle2 size={15} strokeWidth={1.6} aria-hidden="true" />
          {importing ? 'Importando…' : `Importar ${chosen.length} ${chosen.length === 1 ? 'lançamento' : 'lançamentos'}`}
        </button>
      </div>
    </Modal>
  );
}
