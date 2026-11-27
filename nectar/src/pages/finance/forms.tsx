import { useEffect, useState, type FormEvent } from 'react';
import { CURRENCIES, formatIn, symbolOf, toBRL, type Currency } from '../../lib/money';
import { useRates } from './useRates';
import { supabase } from '../../lib/supabase';
import { write } from '../../lib/useTable';
import { toDay } from '../../lib/dates';
import { EXPENSE_CATEGORIES, INCOME_CATEGORIES, PAYMENT_LABEL, type PaymentMethod, type Tx, type TxType } from '../../lib/finance';
import { Field, FieldGroup, Modal } from '../../components/ui';
import type { Finance } from './useFinance';

export function TypeToggle({ value, onChange }: { value: TxType; onChange: (t: TxType) => void }) {
  return (
    <FieldGroup label="Tipo">
      <div className="segmented">
        {(['expense', 'income'] as const).map((t) => (
          <button type="button" key={t} aria-pressed={value === t} className={value === t ? 'tab-active' : 'tab'} onClick={() => onChange(t)}>{t === 'expense' ? 'Saída' : 'Entrada'}</button>
        ))}
      </div>
    </FieldGroup>
  );
}

export function CategoryField({ type, value, onChange }: { type: TxType; value: string; onChange: (v: string) => void }) {
  const list = type === 'expense' ? EXPENSE_CATEGORIES : INCOME_CATEGORIES;
  return (
    <Field label="Categoria">
      <input className="input" list={`cat-${type}`} value={value} onChange={(e) => onChange(e.target.value)} placeholder={list[0]} />
      <datalist id={`cat-${type}`}>{list.map((c) => <option key={c} value={c} />)}</datalist>
    </Field>
  );
}

/** Where the money comes from or goes to: an account, or a credit card for card purchases. */
export function PaymentFields({ f, type, method, setMethod, bankId, setBankId, cardId, setCardId }: {
  f: Finance; type: TxType; method: PaymentMethod; setMethod: (m: PaymentMethod) => void;
  bankId: string; setBankId: (v: string) => void; cardId: string; setCardId: (v: string) => void;
}) {
  const credit = f.cards.rows.filter((c) => c.card_type === 'credit');
  const methods = (Object.keys(PAYMENT_LABEL) as PaymentMethod[]).filter((m) => type === 'expense' || m !== 'credito');
  return (
    <div className="grid grid-cols-2 gap-3">
      <Field label="Forma de pagamento">
        <select className="input" value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod)}>
          {methods.map((m) => <option key={m} value={m}>{PAYMENT_LABEL[m]}</option>)}
        </select>
      </Field>
      {method === 'credito' ? (
        <Field label="Cartão">
          <select className="input" value={cardId} onChange={(e) => setCardId(e.target.value)} required>
            <option value="">Escolha</option>
            {credit.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </Field>
      ) : (
        <Field label="Conta">
          <select className="input" value={bankId} onChange={(e) => setBankId(e.target.value)}>
            <option value="">Nenhuma</option>
            {f.banks.rows.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        </Field>
      )}
    </div>
  );
}

export function TxForm({ f, tx, defaults, onClose }: { f: Finance; tx?: Partial<Tx>; defaults?: Partial<Tx>; onClose: () => void }) {
  const base = { ...defaults, ...tx };
  const [type, setType] = useState<TxType>(base.type ?? 'expense');
  const [amount, setAmount] = useState(base.amount?.toString() ?? '');
  const [description, setDescription] = useState(base.description ?? '');
  const [date, setDate] = useState(base.date ?? toDay(new Date()));
  const [category, setCategory] = useState(base.category ?? '');
  const [method, setMethod] = useState<PaymentMethod>((base.payment_method as PaymentMethod) ?? 'pix');
  const [bankId, setBankId] = useState(base.bank_id ?? f.banks.rows[0]?.id ?? '');
  const [cardId, setCardId] = useState(base.card_id ?? '');
  const [projectId, setProjectId] = useState(base.project_id ?? '');
  const [pending, setPending] = useState(base.is_pending ?? false);
  // In another currency: the amount typed is in that currency and the rate (reais per unit) comes
  // from the transaction's date, unless edited by hand (then it stays as typed).
  const [currency, setCurrency] = useState<Currency>(base.currency ?? 'BRL');
  const [original, setOriginal] = useState(base.original_amount?.toString() ?? '');
  const [rateText, setRateText] = useState(base.fx_rate?.toString() ?? '');
  const [rateEdited, setRateEdited] = useState(!!base.fx_rate);
  const quote = useRates(currency === 'BRL' ? null : date < toDay(new Date()) ? date : null);
  const quoted = currency === 'BRL' ? null : quote.rates?.[currency] ?? null;
  useEffect(() => { if (!rateEdited && quoted) setRateText(String(quoted)); }, [quoted, rateEdited]);
  const rate = Number(rateText.replace(',', '.'));
  const foreign = Number(original.replace(',', '.'));
  const inReais = currency !== 'BRL' && foreign > 0 && rate > 0 ? toBRL(foreign, rate) : null;

  async function save(e: FormEvent) {
    e.preventDefault();
    const credit = method === 'credito';
    if (currency !== 'BRL' && inReais === null) { alert('Informe o valor e a cotação.'); return; }
    const money: { amount: number; currency: Currency; original_amount: number | null; fx_rate: number | null } = currency === 'BRL'
      ? { amount: Number(amount), currency, original_amount: null, fx_rate: null }
      : { amount: inReais!, currency, original_amount: foreign, fx_rate: rate };
    const row = {
      type, ...money, description, date, category: category || null, payment_method: method,
      bank_id: credit ? null : bankId || null, card_id: credit ? cardId || null : null, is_pending: credit ? false : pending,
      recurring_template_id: base.recurring_template_id ?? null,
      project_id: projectId || null,
    };
    const ok = tx?.id ? await write(supabase.from('transactions').update(row).eq('id', tx.id)) : await write(supabase.from('transactions').insert(row));
    if (ok) { await f.reloadMoney(); onClose(); }
  }
  async function remove() {
    if (tx?.id && confirm('Excluir este lançamento?') && await write(supabase.from('transactions').delete().eq('id', tx.id))) { await f.reloadMoney(); onClose(); }
  }

  return (
    <Modal title={tx?.id ? 'Editar lançamento' : 'Novo lançamento'} onClose={onClose}>
      <form onSubmit={save}>
        <TypeToggle value={type} onChange={(t) => { setType(t); if (t === 'income' && method === 'credito') setMethod('pix'); }} />
        <div className="mb-4 flex items-center gap-2" role="group" aria-label="Moeda">
          <span className="text-[13px] text-fg2">Moeda</span>
          <div className="segmented">
            {CURRENCIES.map((c) => (
              <button key={c.code} type="button" className={currency === c.code ? 'tab-active' : 'tab'} aria-pressed={currency === c.code} title={c.name}
                onClick={() => { setCurrency(c.code); setRateEdited(false); if (c.code !== 'BRL' && !original && amount) setOriginal(amount); }}>{c.symbol}</button>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          {currency === 'BRL'
            ? <Field label="Valor (R$)"><input className="input figure" type="number" min={0.01} step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} required autoFocus /></Field>
            : <Field label={`Valor (${symbolOf(currency)})`}><input className="input figure" type="number" min={0.01} step="0.01" value={original} onChange={(e) => setOriginal(e.target.value)} required autoFocus /></Field>}
          <Field label="Data"><input className="input" type="date" value={date} onChange={(e) => { setDate(e.target.value); if (currency !== 'BRL') setRateEdited(false); }} required /></Field>
        </div>
        {currency !== 'BRL' && (
          <div className="mb-4 rounded-xl border border-line p-3">
            <div className="grid grid-cols-2 items-end gap-3">
              <Field label={`Cotação (R$ por 1 ${symbolOf(currency)})`}>
                <input className="input figure" inputMode="decimal" value={rateText} onChange={(e) => { setRateText(e.target.value); setRateEdited(true); }} required />
              </Field>
              <div className="mb-4">
                <div className="text-[13px] text-fg2">Em reais</div>
                <div className="figure text-lg">{inReais === null ? '—' : formatIn(inReais, 'BRL')}</div>
              </div>
            </div>
            <p className="text-xs text-fg3">
              {quote.error ? `Sem cotação automática (${quote.error}); digite a cotação.`
                : quoted ? `${rateEdited && Number(rateText) !== quoted ? `Cotação editada. A de ${quote.date?.split('-').reverse().join('/')} é ${quoted}. ` : `Cotação de ${quote.date?.split('-').reverse().join('/')}${quote.at ? `, ${quote.at.slice(11)}` : ''} (${quote.source}). `}`
                  : 'Buscando a cotação…'}
              {rateEdited && quoted && Number(rateText) !== quoted && <button type="button" className="underline" onClick={() => { setRateEdited(false); setRateText(String(quoted)); }}>Usar a do dia</button>}
            </p>
          </div>
        )}
        <Field label="Descrição"><input className="input" value={description} onChange={(e) => setDescription(e.target.value)} required placeholder={type === 'expense' ? 'Mercado' : 'Salário'} /></Field>
        <CategoryField type={type} value={category} onChange={setCategory} />
        <PaymentFields f={f} type={type} method={method} setMethod={setMethod} bankId={bankId} setBankId={setBankId} cardId={cardId} setCardId={setCardId} />
        {f.activeProjects.length > 0 && (
          <Field label="Projeto (opcional)">
            <select className="input" value={projectId} onChange={(e) => setProjectId(e.target.value)}>
              <option value="">Nenhum</option>
              {f.activeProjects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </Field>
        )}
        {method !== 'credito' && (
          <label className="mb-4 flex items-center gap-2 text-sm">
            <input type="checkbox" checked={pending} onChange={(e) => setPending(e.target.checked)} />
            {type === 'expense' ? 'Ainda não paguei' : 'Ainda não recebi'}
          </label>
        )}
        <div className="flex gap-2">
          {tx?.id && <button type="button" className="btn-ghost text-negative" onClick={remove}>Excluir</button>}
          <button className="btn-primary ml-auto">Salvar</button>
        </div>
      </form>
    </Modal>
  );
}

export function BankForm({ f, bank, onClose }: { f: Finance; bank?: { id: string; name: string; initial_balance: number; currency?: Currency }; onClose: () => void }) {
  const [name, setName] = useState(bank?.name ?? '');
  const [initial, setInitial] = useState(bank?.initial_balance?.toString() ?? '0');
  const [currency, setCurrency] = useState<Currency>(bank?.currency ?? 'BRL');
  async function save(e: FormEvent) {
    e.preventDefault();
    const row = { name, initial_balance: Number(initial), currency };
    const ok = bank ? await write(supabase.from('banks').update(row).eq('id', bank.id)) : await write(supabase.from('banks').insert(row));
    if (ok) { await f.banks.reload(); onClose(); }
  }
  async function remove() {
    if (bank && confirm(`Excluir a conta ${bank.name}? Os lançamentos ficam, sem conta.`) && await write(supabase.from('banks').delete().eq('id', bank.id))) { await f.banks.reload(); onClose(); }
  }
  return (
    <Modal title={bank ? 'Editar conta' : 'Nova conta'} onClose={onClose}>
      <form onSubmit={save}>
        <Field label="Nome"><input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Nubank, Itaú, carteira…" required autoFocus /></Field>
        <FieldGroup label="Moeda da conta">
          <div className="segmented">
            {CURRENCIES.map((c) => (
              <button key={c.code} type="button" className={currency === c.code ? 'tab-active' : 'tab'} aria-pressed={currency === c.code} title={c.name} onClick={() => setCurrency(c.code)}>{c.symbol}</button>
            ))}
          </div>
        </FieldGroup>
        <Field label={`Saldo inicial (${symbolOf(currency)})`}><input className="input figure" type="number" step="0.01" value={initial} onChange={(e) => setInitial(e.target.value)} required /></Field>
        <p className="mb-4 text-xs text-fg3">O saldo de hoje é o inicial mais tudo o que você registrar a partir dele</p>
        <div className="flex gap-2">
          {bank && <button type="button" className="btn-ghost text-negative" onClick={remove}>Excluir</button>}
          <button className="btn-primary ml-auto">Salvar</button>
        </div>
      </form>
    </Modal>
  );
}

export function CardForm({ f, card, onClose }: { f: Finance; card?: { id: string; name: string; bank_id: string | null; credit_limit: number | null; closing_day: number | null; due_day: number | null }; onClose: () => void }) {
  const [name, setName] = useState(card?.name ?? '');
  const [bankId, setBankId] = useState(card?.bank_id ?? f.banks.rows[0]?.id ?? '');
  const [limit, setLimit] = useState(card?.credit_limit?.toString() ?? '');
  const [closing, setClosing] = useState(card?.closing_day?.toString() ?? '');
  const [due, setDue] = useState(card?.due_day?.toString() ?? '');
  async function save(e: FormEvent) {
    e.preventDefault();
    const row = { name, card_type: 'credit', bank_id: bankId || null, credit_limit: limit ? Number(limit) : null, closing_day: Number(closing), due_day: Number(due) };
    const ok = card ? await write(supabase.from('cards').update(row).eq('id', card.id)) : await write(supabase.from('cards').insert(row));
    if (ok) { await f.cards.reload(); onClose(); }
  }
  async function remove() {
    if (card && confirm(`Excluir o cartão ${card.name}?`) && await write(supabase.from('cards').delete().eq('id', card.id))) { await f.cards.reload(); onClose(); }
  }
  return (
    <Modal title={card ? 'Editar cartão' : 'Novo cartão de crédito'} onClose={onClose}>
      <form onSubmit={save}>
        <Field label="Nome"><input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Nubank Visa" required autoFocus /></Field>
        <Field label="Conta que paga a fatura">
          <select className="input" value={bankId} onChange={(e) => setBankId(e.target.value)}>
            <option value="">Nenhuma</option>
            {f.banks.rows.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        </Field>
        <div className="grid grid-cols-3 gap-3">
          <Field label="Limite (R$)"><input className="input figure" type="number" min={0} step="0.01" value={limit} onChange={(e) => setLimit(e.target.value)} /></Field>
          <Field label="Fecha dia"><input className="input figure" type="number" min={1} max={31} value={closing} onChange={(e) => setClosing(e.target.value)} required /></Field>
          <Field label="Vence dia"><input className="input figure" type="number" min={1} max={31} value={due} onChange={(e) => setDue(e.target.value)} required /></Field>
        </div>
        <p className="mb-4 text-xs text-fg3">Compras no dia do fechamento ou depois entram na fatura seguinte</p>
        <div className="flex gap-2">
          {card && <button type="button" className="btn-ghost text-negative" onClick={remove}>Excluir</button>}
          <button className="btn-primary ml-auto">Salvar</button>
        </div>
      </form>
    </Modal>
  );
}

export function TransferForm({ f, onClose }: { f: Finance; onClose: () => void }) {
  const [from, setFrom] = useState(f.banks.rows[0]?.id ?? '');
  const [to, setTo] = useState(f.banks.rows[1]?.id ?? '');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(toDay(new Date()));
  async function save(e: FormEvent) {
    e.preventDefault();
    if (from === to) return alert('Escolha contas diferentes');
    if (await write(supabase.from('transfers').insert({ from_bank_id: from, to_bank_id: to, amount: Number(amount), date }))) { await f.transfers.reload(); onClose(); }
  }
  return (
    <Modal title="Transferir entre contas" onClose={onClose}>
      <form onSubmit={save}>
        <div className="grid grid-cols-2 gap-3">
          <Field label="De"><select className="input" value={from} onChange={(e) => setFrom(e.target.value)}>{f.banks.rows.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select></Field>
          <Field label="Para"><select className="input" value={to} onChange={(e) => setTo(e.target.value)}>{f.banks.rows.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select></Field>
          <Field label="Valor (R$)"><input className="input figure" type="number" min={0.01} step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} required /></Field>
          <Field label="Data"><input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} required /></Field>
        </div>
        <button className="btn-primary w-full">Transferir</button>
      </form>
    </Modal>
  );
}
