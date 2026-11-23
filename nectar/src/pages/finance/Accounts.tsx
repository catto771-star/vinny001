import { useState } from 'react';
import { money } from '../../lib/money';
import { ArrowLeftRight, Landmark, Pencil, Plus } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { write } from '../../lib/useTable';
import { formatDay, toDay } from '../../lib/dates';
import { bankBalance, cardUsed, invoices, netWorth, type Card, type Invoice } from '../../lib/finance';
import { DonutChart } from '../../components/Charts';
import { Empty, Field, Figure, Modal } from '../../components/ui';
import { BankForm, CardForm, TransferForm } from './forms';
import type { Finance } from './useFinance';

const I = { size: 16, strokeWidth: 1.5 } as const;

export default function Accounts({ f }: { f: Finance }) {
  const [bank, setBank] = useState<Finance['banks']['rows'][number] | null | undefined>(undefined);
  const [card, setCard] = useState<Card | null | undefined>(undefined);
  const [transfer, setTransfer] = useState(false);
  const [paying, setPaying] = useState<{ card: Card; inv: Invoice } | null>(null);
  const today = toDay(new Date());
  const totalWorth = netWorth(f.banks.rows, f.txs.rows, f.transfers.rows, f.payments.rows, today);
  const accountRows = f.banks.rows.map((b) => ({
    bank: b,
    balance: bankBalance(b, f.txs.rows, f.transfers.rows, f.payments.rows, today),
  }));
  const positiveSum = accountRows.reduce((s, r) => s + Math.max(0, r.balance), 0);

  return (
    <div className="grid gap-6 xl:grid-cols-2">
      <section className="space-y-4">
        <div className="flex items-center gap-2">
          <h2 className="mr-auto font-medium">Contas</h2>
          {f.banks.rows.length > 1 && <button className="btn-ghost" onClick={() => setTransfer(true)}><ArrowLeftRight {...I} />Transferir</button>}
          <button className="btn-secondary" onClick={() => setBank(null)}><Plus {...I} />Conta</button>
        </div>
        {!f.banks.rows.length ? <div className="card"><Empty icon={<Landmark size={18} strokeWidth={1.5} />} action={<button className="btn-secondary" onClick={() => setBank(null)}>Adicionar conta</button>}>Seu patrimônio começa aqui: cadastre suas contas com o saldo de hoje</Empty></div> : (
          <>
            {positiveSum > 0 && (
              <DonutChart
                title="Distribuição do patrimônio"
                subtitle={`Total consolidado: ${money(totalWorth)}`}
                centerLabel="Patrimônio"
                format={money}
                rows={accountRows.map((r) => ({ label: r.bank.name, value: Math.max(0, r.balance), color: r.bank.color || undefined }))}
              />
            )}
            <ul className="grid gap-4 sm:grid-cols-2">
              {accountRows.map(({ bank: b, balance }, idx) => {
                const share = positiveSum > 0 && balance > 0 ? Math.round((balance / positiveSum) * 100) : 0;
                const finishes = [
                  'linear-gradient(155deg, #27272b 0%, #18181b 55%, #111113 100%)',
                  'linear-gradient(155deg, #22262b 0%, #16191d 55%, #101215 100%)',
                  'linear-gradient(155deg, #282623 0%, #1a1816 55%, #121110 100%)',
                ];
                return (
                  <li
                    key={b.id}
                    className="relative flex min-h-[156px] min-w-0 flex-col justify-between overflow-hidden rounded-[14px] p-5 text-[#ededed]"
                    style={{
                      background: finishes[idx % finishes.length],
                      boxShadow: 'inset 0 1px 0 rgb(255 255 255 / 0.14), 0 0 0 1px rgb(255 255 255 / 0.08)',
                    }}
                  >
                    <div className="flex items-center gap-2">
                      <span className="inline-flex min-w-0 flex-1 items-center gap-2 text-sm font-medium text-[#ededed]">
                        <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: b.color || 'var(--brand)' }} aria-hidden="true" />
                        <span className="truncate">{b.name}</span>
                      </span>
                      <span className="rounded-[4px] border border-white/12 bg-white/6 px-2 py-0.5 font-mono text-[11px] leading-4 text-[#a1a1a6]">
                        {b.currency ?? 'BRL'}
                      </span>
                      <button
                        type="button"
                        className="inline-flex h-8 w-8 items-center justify-center rounded-[8px] border border-white/10 bg-white/5 text-[#a1a1a6] transition-colors duration-150 hover:bg-white/12 hover:text-[#ededed]"
                        onClick={() => setBank(b)}
                        aria-label={`Editar ${b.name}`}
                      >
                        <Pencil {...I} />
                      </button>
                    </div>
                    <div className="my-3 flex items-center justify-between gap-4">
                      <svg width="34" height="24" viewBox="0 0 34 24" aria-hidden="true">
                        <rect x="0.5" y="0.5" width="33" height="23" rx="4.5" fill="#a1a1aa" fillOpacity="0.22" stroke="#a1a1aa" strokeOpacity="0.55" strokeWidth="1" />
                        <path d="M11 1v22M23 1v22M1 9h10M23 9h10M1 15h10M23 15h10" stroke="#e4e4e7" strokeOpacity="0.4" strokeWidth="1" />
                      </svg>
                      <Figure value={money(balance)} className="truncate text-[24px] leading-none font-medium text-[#ededed]" />
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="h-1 flex-1 overflow-hidden rounded-full bg-white/10">
                        <div className="h-full rounded-full" style={{ width: `${share}%`, background: b.color || '#ededed' }} />
                      </div>
                      <span className="figure text-xs text-[#a1a1a6]">{share}%</span>
                    </div>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </section>

      <section>
        <div className="mb-3 flex items-center gap-2">
          <h2 className="mr-auto font-medium">Cartões de crédito</h2>
          <button className="btn-secondary" onClick={() => setCard(null)}><Plus {...I} />Cartão</button>
        </div>
        {!f.cards.rows.length && <div className="card"><Empty>Cadastre seus cartões com o dia de fechamento e de vencimento</Empty></div>}
        <div className="space-y-4">
          {f.cards.rows.map((c) => {
            const used = cardUsed(c, f.txs.rows, f.payments.rows);
            const invs = invoices(c, f.txs.rows, f.payments.rows);
            const open = invs.filter((i) => !i.paid);
            return (
              <article key={c.id} className="card">
                <div className="mb-3 flex items-start gap-2">
                  <div className="mr-auto">
                    <div className="font-medium">{c.name}</div>
                    <div className="text-[13px] text-fg3">fecha dia {c.closing_day} · vence dia {c.due_day}</div>
                  </div>
                  <button className="icon-btn" onClick={() => setCard(c)} aria-label={`Editar ${c.name}`}><Pencil {...I} /></button>
                </div>
                {c.credit_limit ? (
                  <>
                    <div className="mb-1 flex text-sm"><span className="mr-auto text-fg2">Limite usado</span><span className="figure">{money(used)}</span><span className="figure ml-1 text-fg3">/ {money(c.credit_limit)}</span></div>
                    <div className="mb-4 h-1.5 rounded-sm bg-raised"><div className="h-1.5 rounded-sm bg-brand" style={{ width: `${Math.min(100, (used / c.credit_limit) * 100)}%` }} /></div>
                  </>
                ) : null}
                {!open.length ? <p className="text-sm text-fg3">Nenhuma fatura em aberto</p> : (
                  <ul className="divide-y divide-line text-sm">
                    {open.slice(0, 4).map((inv) => (
                      <li key={inv.dueDate} className="flex items-center gap-3 py-2">
                        <span className="mr-auto">Fatura de {formatDay(inv.dueDate)}<span className="ml-2 text-xs text-fg3">{inv.closeDate > today ? 'aberta' : 'fechada'} · {inv.items.length} {inv.items.length === 1 ? 'compra' : 'compras'}</span></span>
                        <span className="figure">{money(inv.total)}</span>
                        <button className="btn-ghost h-8" onClick={() => setPaying({ card: c, inv })}>Pagar</button>
                      </li>
                    ))}
                  </ul>
                )}
              </article>
            );
          })}
        </div>
      </section>

      {bank !== undefined && <BankForm f={f} bank={bank ?? undefined} onClose={() => setBank(undefined)} />}
      {card !== undefined && <CardForm f={f} card={card ?? undefined} onClose={() => setCard(undefined)} />}
      {transfer && <TransferForm f={f} onClose={() => setTransfer(false)} />}
      {paying && <PayInvoice f={f} card={paying.card} inv={paying.inv} onClose={() => setPaying(null)} />}
    </div>
  );
}

function PayInvoice({ f, card, inv, onClose }: { f: Finance; card: Card; inv: Invoice; onClose: () => void }) {
  const [bankId, setBankId] = useState(card.bank_id ?? f.banks.rows[0]?.id ?? '');
  const [amount, setAmount] = useState(inv.total.toString());
  const [date, setDate] = useState(toDay(new Date()));
  async function pay() {
    if (await write(supabase.from('card_invoice_payments').insert({ card_id: card.id, year: inv.year, month: inv.month, amount: Number(amount), paid_at: date, bank_id: bankId || null }))) {
      await f.payments.reload();
      onClose();
    }
  }
  return (
    <Modal title={`Pagar fatura ${card.name}`} onClose={onClose}>
      <p className="mb-4 text-sm text-fg2">Vencimento {formatDay(inv.dueDate)} · {inv.items.length} {inv.items.length === 1 ? 'compra' : 'compras'}</p>
      <ul className="mb-4 max-h-40 overflow-y-auto text-sm">
        {inv.items.map((t) => <li key={t.id} className="flex border-t border-line py-1.5"><span className="mr-auto truncate">{t.description}</span><span className="figure text-fg2">{money(t.amount)}</span></li>)}
      </ul>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Valor (R$)"><input className="input figure" type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} /></Field>
        <Field label="Pago em"><input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
      </div>
      <Field label="Saiu da conta">
        <select className="input" value={bankId} onChange={(e) => setBankId(e.target.value)}>
          <option value="">Nenhuma</option>
          {f.banks.rows.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>
      </Field>
      <button className="btn-primary w-full" onClick={pay}>Registrar pagamento</button>
    </Modal>
  );
}
