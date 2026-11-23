import { useState } from 'react';
import { formatIn, money } from '../../lib/money';
import { ArrowDownLeft, ArrowUpRight, ListOrdered, Search, Upload } from 'lucide-react';
import { formatDay } from '../../lib/dates';
import { monthKey, PAYMENT_LABEL, type PaymentMethod, type Tx } from '../../lib/finance';
import { searchKey } from '../../lib/text';
import { Empty, ListSkeleton } from '../../components/ui';
import { TxForm } from './forms';
import CsvImportModal from './CsvImportModal';
import type { Finance } from './useFinance';

export default function Statement({ f, year, month }: { f: Finance; year: number; month: number }) {
  const [q, setQ] = useState('');
  const [type, setType] = useState<'all' | 'expense' | 'income'>('all');
  const [editing, setEditing] = useState<Tx | null>(null);
  const [importing, setImporting] = useState(false);
  const key = monthKey(year, month);
  const rows = f.txs.rows.filter((t) => t.date.startsWith(key) && (type === 'all' || t.type === type) &&
    (!q || searchKey(`${t.description} ${t.category ?? ''}`).includes(searchKey(q))));
  const days = [...new Set(rows.map((t) => t.date))].sort().reverse();
  const where = (t: Tx) => (t.card_id ? f.cardById.get(t.card_id)?.name : t.bank_id ? f.bankById.get(t.bank_id)?.name : null);

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative w-full max-w-xs">
          <Search size={16} strokeWidth={1.5} className="pointer-events-none absolute left-3 top-3 text-fg3" />
          <input className="input pl-9" placeholder="Buscar" aria-label="Buscar lançamento" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <div className="segmented">
          {([['all', 'Tudo'], ['expense', 'Saídas'], ['income', 'Entradas']] as const).map(([k, l]) => <button key={k} className={type === k ? 'tab-active' : 'tab'} onClick={() => setType(k)}>{l}</button>)}
        </div>
        <button type="button" className="btn-secondary sm:ml-auto" onClick={() => setImporting(true)}>
          <Upload size={15} strokeWidth={1.6} aria-hidden="true" />Importar CSV
        </button>
      </div>
      {f.loading ? <ListSkeleton rows={5} /> : !rows.length ? <div className="card"><Empty icon={<ListOrdered size={18} strokeWidth={1.5} />}>Nenhum lançamento neste mês</Empty></div> : days.map((d) => (
        <section key={d} className="mb-4">
          <div className="label mb-2">{formatDay(d)}</div>
          <ul className="card divide-y divide-line p-0">
            {rows.filter((t) => t.date === d).map((t) => (
              <li key={t.id}>
                <button className="flex w-full items-center gap-3 px-5 py-3 text-left text-sm hover:bg-raised/50" onClick={() => setEditing(t)}>
                  <span className="text-fg3">{t.type === 'income' ? <ArrowDownLeft size={16} strokeWidth={1.5} /> : <ArrowUpRight size={16} strokeWidth={1.5} />}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate">{t.description}</span>
                    <span className="block text-xs text-fg3">
                      {[t.category, t.payment_method ? PAYMENT_LABEL[t.payment_method as PaymentMethod] : null, where(t),
                        t.installment_number ? `parcela ${t.installment_number}` : null, t.is_pending ? 'pendente' : null].filter(Boolean).join(' · ')}
                    </span>
                  </span>
                  <span className="text-right">
                    <span className={`figure block ${t.type === 'income' ? 'text-positive' : ''}`}>{t.type === 'income' ? '+' : '−'}{money(t.amount)}</span>
                    {t.currency && t.currency !== 'BRL' && t.original_amount != null && (
                      <span className="figure block text-[11px] text-fg3" title="Valor e cotação do lançamento">{formatIn(Number(t.original_amount), t.currency)} · {String(t.fx_rate).replace('.', ',')}</span>
                    )}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}
      {editing && <TxForm f={f} tx={editing} onClose={() => setEditing(null)} />}
      {importing && <CsvImportModal f={f} onClose={() => setImporting(false)} />}
    </>
  );
}
