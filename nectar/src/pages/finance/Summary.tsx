import { CalendarClock, Receipt } from 'lucide-react';
import { conv, displayCurrency, money, symbolOf } from '../../lib/money';
import { formatDay, toDay } from '../../lib/dates';
import { byCategory, cardUsed, dailyExpenses, invoices, monthKey, monthSummary, netWorth, recurringInMonth, bankBalance } from '../../lib/finance';
import { ColumnChart, RankedBars } from '../../components/Charts';
import { Empty, Stat } from '../../components/ui';
import type { Finance } from './useFinance';

export default function Summary({ f, year, month, onPay }: { f: Finance; year: number; month: number; onPay: (o: { template_id: string; date: string }) => void }) {
  const today = toDay(new Date());
  const occ = recurringInMonth(f.activeTemplates, f.txs.rows, f.skips.rows, year, month);
  const s = monthSummary(f.txs.rows, occ, year, month);
  const worth = netWorth(f.banks.rows, f.txs.rows, f.transfers.rows, f.payments.rows, today);
  const daily = dailyExpenses(f.txs.rows, year, month);
  const categories = byCategory(f.txs.rows, 'expense', year, month);
  const key = monthKey(year, month);
  const dueInvoices = f.cards.rows.flatMap((c) => invoices(c, f.txs.rows, f.payments.rows).filter((i) => !i.paid && monthKey(i.year, i.month) === key).map((i) => ({ card: c, i })));
  const toPay = [
    ...occ.filter((o) => !o.paid && !o.skipped && o.template.type === 'expense').map((o) => ({ key: `r${o.template.id}${o.date}`, date: o.date, label: o.template.description, amount: o.template.amount, action: () => onPay({ template_id: o.template.id, date: o.date }) })),
    ...f.txs.rows.filter((t) => t.is_pending && t.type === 'expense' && t.date.startsWith(key)).map((t) => ({ key: t.id, date: t.date, label: t.description, amount: t.amount, action: undefined })),
    ...dueInvoices.map(({ card, i }) => ({ key: `i${card.id}${i.month}`, date: i.dueDate, label: `Fatura ${card.name}`, amount: i.total, action: undefined })),
  ].sort((a, b) => a.date.localeCompare(b.date));

  return (
    <>
      <section className="card mb-6 grid grid-cols-2 gap-6 lg:grid-cols-4">
        <Stat label="Sai no mês" value={money(s.expense)} accent loading={f.loading} hint={`${money(s.spent)} pago · ${money(s.toSpend)} previsto`} />
        <Stat label="Entra no mês" value={money(s.income)} loading={f.loading} hint={`${money(s.received)} recebido · ${money(s.toReceive)} a receber`} />
        <Stat label="Sobra do mês" value={money(s.leftover)} loading={f.loading} hint="entra menos sai, com o previsto" />
        <Stat label="Patrimônio" value={money(worth)} loading={f.loading} hint={`${f.banks.rows.length} ${f.banks.rows.length === 1 ? 'conta' : 'contas'}, hoje`} />
      </section>

      <div className="mb-6 grid gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <ColumnChart title="Dia a dia" subtitle="saídas registradas em cada dia do mês; hoje em destaque" unit={symbolOf(displayCurrency())} height={280} highlightLast={false}
          highlight={today.startsWith(key) ? Number(today.slice(8, 10)) - 1 : -1}
          points={daily.map((d) => ({ label: String(d.day), value: conv(d.amount) }))} />
        <section className="card h-fit">
          <div className="mb-4 font-medium">Para onde foi</div>
          {categories.length ? <RankedBars unit="" format={money} rows={categories.slice(0, 8).map((c) => ({ label: c.category, value: c.amount, detail: s.expense ? `${Math.round((c.amount / s.expense) * 100)}% do que sai no mês` : undefined }))} />
            : <Empty>As categorias aparecem quando houver saídas no mês</Empty>}
        </section>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <section className="card">
          <div className="mb-3 font-medium">A pagar neste mês</div>
          {toPay.length === 0 ? <Empty icon={<CalendarClock size={18} strokeWidth={1.5} />}>Nada pendente</Empty> : (
            <ul className="divide-y divide-line">
              {toPay.map((p) => (
                <li key={p.key} className="flex items-center gap-3 py-2.5 text-sm">
                  <span className={`figure w-14 text-xs ${p.date < today ? 'text-negative' : 'text-fg3'}`}>{p.date.slice(8)}/{p.date.slice(5, 7)}</span>
                  <span className="mr-auto truncate">{p.label}</span>
                  <span className="figure">{money(p.amount)}</span>
                  {p.action && <button className="btn-ghost h-8" onClick={p.action}>Pagar</button>}
                </li>
              ))}
            </ul>
          )}
        </section>
        <section className="card">
          <div className="mb-3 font-medium">Contas e cartões</div>
          {!f.banks.rows.length && !f.cards.rows.length ? <Empty icon={<Receipt size={18} strokeWidth={1.5} />}>Cadastre suas contas e cartões na aba Contas</Empty> : (
            <ul className="divide-y divide-line text-sm">
              {f.banks.rows.map((b) => (
                <li key={b.id} className="flex py-2.5"><span className="mr-auto">{b.name}</span><span className="figure">{money(bankBalance(b, f.txs.rows, f.transfers.rows, f.payments.rows, today))}</span></li>
              ))}
              {f.cards.rows.map((c) => {
                const used = cardUsed(c, f.txs.rows, f.payments.rows);
                const next = invoices(c, f.txs.rows, f.payments.rows).find((i) => !i.paid);
                return (
                  <li key={c.id} className="flex py-2.5">
                    <span className="mr-auto">{c.name}<span className="ml-2 text-xs text-fg3">{next ? `fatura vence ${formatDay(next.dueDate)}` : 'sem fatura aberta'}</span></span>
                    <span className="figure">{money(used)}{c.credit_limit ? <span className="text-fg3"> / {money(c.credit_limit)}</span> : null}</span>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </>
  );
}
