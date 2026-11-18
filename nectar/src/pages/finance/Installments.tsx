import { useState, type FormEvent } from 'react';
import { CreditCard, FastForward, Plus } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { write } from '../../lib/useTable';
import { formatDay, toDay } from '../../lib/dates';
import { brl } from '../../lib/format';
import { cents, installmentSchedule, invoiceFor, reais } from '../../lib/finance';
import { Empty, Field, Modal } from '../../components/ui';
import { CategoryField } from './forms';
import type { Finance, InstallmentPurchase } from './useFinance';

export default function Installments({ f }: { f: Finance }) {
  const [form, setForm] = useState(false);
  const today = toDay(new Date());
  const list = f.purchases.rows.filter((p) => p.status !== 'cancelled');
  const parts = (p: InstallmentPurchase) => f.txs.rows.filter((t) => t.installment_purchase_id === p.id).sort((a, b) => (a.installment_number ?? 0) - (b.installment_number ?? 0));

  async function anticipate(p: InstallmentPurchase) {
    const future = parts(p).filter((t) => t.date > today);
    if (!future.length || !confirm(`Antecipar ${future.length} parcelas (${brl(reais(future.reduce((s, t) => s + cents(t.amount), 0)))}) para hoje?`)) return;
    const ok = await write(supabase.from('transactions').update({ date: today, is_advance_payment: true }).in('id', future.map((t) => t.id)));
    if (ok) { await write(supabase.from('installment_purchases').update({ status: 'finished' }).eq('id', p.id)); await Promise.all([f.txs.reload(), f.purchases.reload()]); }
  }
  async function remove(p: InstallmentPurchase) {
    if (confirm(`Excluir a compra ${p.description} e todas as parcelas?`) && await write(supabase.from('installment_purchases').delete().eq('id', p.id))) await Promise.all([f.txs.reload(), f.purchases.reload()]);
  }

  return (
    <>
      <div className="mb-4 flex"><button className="btn-primary ml-auto" onClick={() => setForm(true)}><Plus size={16} strokeWidth={1.5} />Compra parcelada</button></div>
      {!list.length ? (
        <div className="card"><Empty icon={<CreditCard size={18} strokeWidth={1.5} />} action={<button className="btn-secondary" onClick={() => setForm(true)}>Nova compra parcelada</button>}>Cadastre compras em 2x, 6x, 12x: cada parcela cai na fatura certa</Empty></div>
      ) : (
        <ul className="grid gap-3">
          {list.map((p) => {
            const ps = parts(p);
            const done = ps.filter((t) => t.date <= today).length;
            const left = reais(ps.filter((t) => t.date > today).reduce((s, t) => s + cents(t.amount), 0));
            const next = ps.find((t) => t.date > today);
            const card = p.card_id ? f.cardById.get(p.card_id) : undefined;
            return (
              <li key={p.id} className="card">
                <div className="mb-3 flex flex-wrap items-start gap-3">
                  <div className="mr-auto">
                    <div className="font-medium">{p.description}</div>
                    <div className="text-[13px] text-fg3">{[card?.name, p.category, `${p.installments_count}x de ${brl(ps[ps.length - 1]?.amount ?? p.total_amount / p.installments_count)}`].filter(Boolean).join(' · ')}</div>
                  </div>
                  <div className="text-right">
                    <div className="figure">{brl(p.total_amount)}</div>
                    <div className="text-xs text-fg3">{left ? `${brl(left)} a pagar` : 'quitada'}</div>
                  </div>
                </div>
                <div className="mb-2 flex gap-1">
                  {ps.map((t) => <div key={t.id} className={`h-1.5 flex-1 rounded-sm ${t.date <= today ? 'bg-brand' : 'bg-raised'}`} title={`${t.installment_number}ª · ${formatDay(t.date)}`} />)}
                </div>
                <div className="flex flex-wrap items-center gap-2 text-[13px] text-fg3">
                  <span className="figure">{done}/{p.installments_count} pagas</span>
                  {next && <span>· próxima {formatDay(next.date)}{card ? `, fatura de ${formatDay(invoiceFor(next.date, card).dueDate)}` : ''}</span>}
                  <span className="ml-auto flex gap-1">
                    {next && <button className="btn-ghost h-8" onClick={() => anticipate(p)}><FastForward size={16} strokeWidth={1.5} />Antecipar</button>}
                    <button className="btn-ghost h-8 text-negative" onClick={() => remove(p)}>Excluir</button>
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {form && <PurchaseForm f={f} onClose={() => setForm(false)} />}
    </>
  );
}

function PurchaseForm({ f, onClose }: { f: Finance; onClose: () => void }) {
  const credit = f.cards.rows.filter((c) => c.card_type === 'credit');
  const [description, setDescription] = useState('');
  const [total, setTotal] = useState('');
  const [count, setCount] = useState('10');
  const [first, setFirst] = useState(toDay(new Date()));
  const [cardId, setCardId] = useState(credit[0]?.id ?? '');
  const [category, setCategory] = useState('');
  const preview = total && Number(count) > 0 ? installmentSchedule(Number(total), Number(count), first) : [];

  async function save(e: FormEvent) {
    e.preventDefault();
    const { data, error } = await supabase.from('installment_purchases').insert({
      description, total_amount: Number(total), installments_count: Number(count), first_installment_date: first, card_id: cardId || null, category: category || null,
    }).select('id').single();
    if (error || !data) return alert(`Não foi possível salvar: ${error?.message}`);
    const ok = await write(supabase.from('transactions').insert(preview.map((p) => ({
      type: 'expense', description: `${description} (${p.number}/${preview.length})`, amount: p.amount, date: p.date, category: category || null,
      payment_method: cardId ? 'credito' : 'boleto', card_id: cardId || null, bank_id: null, installment_purchase_id: data.id, installment_number: p.number,
    }))));
    if (!ok) await supabase.from('installment_purchases').delete().eq('id', data.id);
    await Promise.all([f.txs.reload(), f.purchases.reload()]);
    if (ok) onClose();
  }

  return (
    <Modal title="Nova compra parcelada" onClose={onClose}>
      <form onSubmit={save}>
        <Field label="Descrição"><input className="input" value={description} onChange={(e) => setDescription(e.target.value)} required placeholder="Notebook" autoFocus /></Field>
        <div className="grid grid-cols-3 gap-3">
          <Field label="Total (R$)"><input className="input figure" type="number" min={0.01} step="0.01" value={total} onChange={(e) => setTotal(e.target.value)} required /></Field>
          <Field label="Parcelas"><input className="input figure" type="number" min={1} max={72} value={count} onChange={(e) => setCount(e.target.value)} required /></Field>
          <Field label="1ª parcela"><input className="input" type="date" value={first} onChange={(e) => setFirst(e.target.value)} required /></Field>
        </div>
        <Field label="Cartão">
          <select className="input" value={cardId} onChange={(e) => setCardId(e.target.value)}>
            <option value="">Sem cartão (boleto, carnê)</option>
            {credit.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </Field>
        <CategoryField type="expense" value={category} onChange={setCategory} />
        {preview.length > 0 && <p className="mb-4 text-sm text-fg2"><span className="figure">{preview.length}x</span> de <span className="figure">{brl(preview[preview.length - 1].amount)}</span>{preview[0].amount !== preview[preview.length - 1].amount ? ` (a 1ª de ${brl(preview[0].amount)})` : ''}, até {formatDay(preview[preview.length - 1].date)}</p>}
        <button className="btn-primary w-full">Salvar</button>
      </form>
    </Modal>
  );
}
