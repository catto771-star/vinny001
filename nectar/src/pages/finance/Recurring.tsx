import { useEffect, useState, type FormEvent } from 'react';
import { CURRENCIES, money, symbolOf, toBRL, type Currency } from '../../lib/money';
import { Plus, Repeat } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { write } from '../../lib/useTable';
import { formatDay, toDay } from '../../lib/dates';
import { monthlyEquivalent, recurringInMonth, type PaymentMethod, type RecurringTemplate, type TxType } from '../../lib/finance';
import { Empty, Field, Modal, WeekdayPicker } from '../../components/ui';
import { useRates } from './useRates';
import { CategoryField, PaymentFields, TypeToggle } from './forms';
import type { Finance } from './useFinance';

export default function Recurring({ f, year, month, onPay }: { f: Finance; year: number; month: number; onPay: (o: { template_id: string; date: string }) => void }) {
  const [editing, setEditing] = useState<Partial<RecurringTemplate> | null>(null);
  const occ = recurringInMonth(f.activeTemplates, f.txs.rows, f.skips.rows, year, month);
  const monthly = f.activeTemplates.filter((t) => t.is_active && t.type === 'expense').reduce((s, t) => s + monthlyEquivalent(t), 0);

  async function skip(templateId: string, date: string, undo: boolean) {
    const q = undo
      ? supabase.from('transaction_recurring_skips').delete().eq('recurring_template_id', templateId).eq('skipped_date', date)
      : supabase.from('transaction_recurring_skips').insert({ recurring_template_id: templateId, skipped_date: date });
    if (await write(q)) void f.skips.reload();
  }

  return (
    <>
      <div className="mb-4 flex items-center gap-2">
        <p className="mr-auto text-sm text-fg2">Assinaturas e contas fixas: cadastre uma vez e marque como pagas a cada mês{monthly > 0 ? ` · ${money(monthly)} por mês em saídas fixas` : ''}</p>
        <button className="btn-primary" onClick={() => setEditing({})}><Plus size={16} strokeWidth={1.5} />Recorrente</button>
      </div>
      {!occ.length && !f.activeTemplates.length ? (
        <div className="card"><Empty icon={<Repeat size={18} strokeWidth={1.5} />} action={<button className="btn-secondary" onClick={() => setEditing({})}>Criar recorrente</button>}>Netflix, aluguel, academia, salário: entram sozinhos todo mês</Empty></div>
      ) : (
        <ul className="card divide-y divide-line p-0">
          {occ.map((o) => (
            <li key={o.template.id + o.date} className="flex flex-wrap items-center gap-3 px-5 py-3 text-sm">
              <button className="min-w-0 flex-1 text-left" onClick={() => setEditing(o.template)}>
                <span className="block truncate">{o.template.description}</span>
                <span className="block text-xs text-fg3">{formatDay(o.date)}{o.template.category ? ` · ${o.template.category}` : ''}</span>
              </button>
              <span className={`figure ${o.template.type === 'income' ? 'text-positive' : ''}`}>{money(o.template.amount)}</span>
              {o.paid ? <span className="w-28 text-right text-xs text-positive">{o.template.type === 'income' ? 'recebido' : 'pago'}</span>
                : o.skipped ? <button className="btn-ghost h-8 w-28" onClick={() => skip(o.template.id, o.date, true)}>Pulado · desfazer</button>
                  : (
                    <span className="flex w-28 justify-end gap-1">
                      <button className="btn-secondary h-8 px-3" onClick={() => onPay({ template_id: o.template.id, date: o.date })}>{o.template.type === 'income' ? 'Receber' : 'Pagar'}</button>
                      <button className="btn-ghost h-8 px-2" onClick={() => skip(o.template.id, o.date, false)}>Pular</button>
                    </span>
                  )}
            </li>
          ))}
          {f.activeTemplates.filter((t) => !t.is_active).map((t) => (
            <li key={t.id} className="px-5 py-3 text-sm text-fg3"><button onClick={() => setEditing(t)}>{t.description} · pausada</button></li>
          ))}
        </ul>
      )}
      {editing && <TemplateForm f={f} template={editing} onClose={() => setEditing(null)} />}
    </>
  );
}

function TemplateForm({ f, template, onClose }: { f: Finance; template: Partial<RecurringTemplate>; onClose: () => void }) {
  const [type, setType] = useState<TxType>(template.type ?? 'expense');
  const [description, setDescription] = useState(template.description ?? '');
  const [amount, setAmount] = useState(template.amount?.toString() ?? '');
  const [category, setCategory] = useState(template.category ?? '');
  const [method, setMethod] = useState<PaymentMethod>((template.payment_method as PaymentMethod) ?? 'pix');
  const [bankId, setBankId] = useState(template.bank_id ?? f.banks.rows[0]?.id ?? '');
  const [cardId, setCardId] = useState(template.card_id ?? '');
  const [frequency, setFrequency] = useState<'monthly' | 'weekly'>(template.frequency ?? 'monthly');
  const [day, setDay] = useState(template.recurrence_days?.[0]?.toString() ?? '10');
  const [weekdays, setWeekdays] = useState<number[]>(template.frequency === 'weekly' ? template.recurrence_days ?? [3] : [3]);
  const [currency, setCurrency] = useState<Currency>(template.currency ?? 'BRL');
  const [original, setOriginal] = useState(template.original_amount?.toString() ?? '');
  const [rateText, setRateText] = useState(template.fx_rate?.toString() ?? '');
  const [rateEdited, setRateEdited] = useState(!!template.fx_rate);
  const quote = useRates(null);
  const quoted = currency === 'BRL' ? null : quote.rates?.[currency] ?? null;
  useEffect(() => { if (!rateEdited && quoted) setRateText(String(quoted)); }, [quoted, rateEdited]);
  const foreign = Number(original.replace(',', '.'));
  const rate = Number(rateText.replace(',', '.'));
  const reais = currency === 'BRL' ? Number(amount) : foreign > 0 && rate > 0 ? toBRL(foreign, rate) : 0;
  const [start, setStart] = useState(template.start_date ?? toDay(new Date()));
  const [active, setActive] = useState(template.is_active ?? true);

  async function save(e: FormEvent) {
    e.preventDefault();
    const credit = method === 'credito';
    const row = {
      type, description, amount: Math.round(reais * 100) / 100, category: category || null, payment_method: method,
      bank_id: credit ? null : bankId || null, card_id: credit ? cardId || null : null,
      recurrence_days: frequency === 'weekly' ? weekdays : [Number(day)], frequency, start_date: start, is_active: active,
      currency, original_amount: currency === 'BRL' ? null : foreign, fx_rate: currency === 'BRL' ? null : rate,
    };
    const ok = template.id ? await write(supabase.from('transaction_recurring_templates').update(row).eq('id', template.id)) : await write(supabase.from('transaction_recurring_templates').insert(row));
    if (ok) { await f.templates.reload(); onClose(); }
  }
  async function remove() {
    if (template.id && confirm('Excluir este recorrente? Os lançamentos já feitos ficam.') &&
      await write(supabase.from('transaction_recurring_templates').update({ deleted_at: new Date().toISOString(), is_active: false }).eq('id', template.id))) { await f.templates.reload(); onClose(); }
  }
  return (
    <Modal title={template.id ? 'Editar recorrente' : 'Novo recorrente'} onClose={onClose}>
      <form onSubmit={save}>
        <TypeToggle value={type} onChange={setType} />
        <Field label="Descrição"><input className="input" value={description} onChange={(e) => setDescription(e.target.value)} required placeholder="Netflix" autoFocus /></Field>
        <div className="mb-4 flex flex-wrap items-center gap-2" role="group" aria-label="Moeda">
          <span className="text-[13px] text-fg2">Moeda</span>
          <div className="segmented">
            {CURRENCIES.map((c) => (
              <button key={c.code} type="button" className={currency === c.code ? 'tab-active' : 'tab'} aria-pressed={currency === c.code} title={c.name}
                onClick={() => { setCurrency(c.code); setRateEdited(false); }}>{c.symbol}</button>
            ))}
          </div>
        </div>
        <div className="mb-4 flex items-center gap-2" role="group" aria-label="Frequência">
          <span className="text-[13px] text-fg2">Repete</span>
          <div className="segmented">
            {([['monthly', 'Todo mês'], ['weekly', 'Toda semana']] as const).map(([k, l]) => (
              <button key={k} type="button" className={frequency === k ? 'tab-active' : 'tab'} aria-pressed={frequency === k} onClick={() => setFrequency(k)}>{l}</button>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          {currency === 'BRL'
            ? <Field label="Valor (R$)"><input className="input figure" type="number" min={0.01} step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} required /></Field>
            : <Field label={`Valor (${symbolOf(currency)})`}><input className="input figure" type="number" min={0.01} step="0.01" value={original} onChange={(e) => setOriginal(e.target.value)} required /></Field>}
          <Field label="A partir de"><input className="input" type="date" value={start} onChange={(e) => setStart(e.target.value)} required /></Field>
        </div>
        {currency !== 'BRL' && (
          <div className="mb-4 grid grid-cols-2 gap-3">
            <Field label={`Cotação (R$ por 1 ${symbolOf(currency)})`}><input className="input figure" inputMode="decimal" value={rateText} onChange={(e) => { setRateText(e.target.value); setRateEdited(true); }} required /></Field>
            <div className="min-w-0"><span className="mb-1.5 block text-[13px] text-fg2">Em reais</span><span className="figure text-lg">{reais > 0 ? money(reais) : '—'}</span></div>
          </div>
        )}
        {frequency === 'monthly'
          ? <Field label="Dia do mês"><input className="input figure" type="number" min={1} max={31} value={day} onChange={(e) => setDay(e.target.value)} required /></Field>
          : (
            <div className="mb-4" role="group" aria-label="Dias da semana">
              <span className="mb-1.5 block text-[13px] leading-5 text-fg2">Dias da semana</span>
              <WeekdayPicker value={weekdays} onChange={setWeekdays} />
            </div>
          )}
        <CategoryField type={type} value={category} onChange={setCategory} />
        <PaymentFields f={f} type={type} method={method} setMethod={setMethod} bankId={bankId} setBankId={setBankId} cardId={cardId} setCardId={setCardId} />
        <label className="mb-4 flex items-center gap-2 text-sm"><input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />Ativo</label>
        <div className="flex gap-2">
          {template.id && <button type="button" className="btn-ghost text-negative" onClick={remove}>Excluir</button>}
          <button className="btn-primary ml-auto">Salvar</button>
        </div>
      </form>
    </Modal>
  );
}
