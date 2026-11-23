import { useState, type FormEvent } from 'react';
import { CalendarClock, Gauge, Plus, Receipt } from 'lucide-react';
import { CURRENCIES, conv, displayCurrency, money, symbolOf, type Currency } from '../../lib/money';
import { formatDay, toDay } from '../../lib/dates';
import { EXPENSE_CATEGORIES, bankBalance, byCategory, cardUsed, dailyExpenses, invoices, monthKey, monthSummary, netWorth, recurringInMonth } from '../../lib/finance';
import { evaluateBudgets, type BudgetStatus, type CategoryBudget } from '../../lib/cashflow';
import { supabase } from '../../lib/supabase';
import { write } from '../../lib/useTable';
import { ColumnChart, RankedBars } from '../../components/Charts';
import { Empty, Field, FieldGroup, Modal, Stat } from '../../components/ui';
import { useRates } from './useRates';
import type { Finance } from './useFinance';

const BUDGET_BADGE: Record<BudgetStatus, { label: string; cls: string; bar: string }> = {
  ok: { label: 'No ritmo', cls: 'bg-positive/10 text-positive', bar: 'bg-brand' },
  warn: { label: 'Atenção', cls: 'bg-warning/10 text-warning', bar: 'bg-warning' },
  over: { label: 'Acima do limite', cls: 'bg-negative/10 text-negative', bar: 'bg-negative' },
};

export default function Summary({ f, year, month, onPay }: { f: Finance; year: number; month: number; onPay: (o: { template_id: string; date: string }) => void }) {
  const [editingBudget, setEditingBudget] = useState<Partial<CategoryBudget> | null>(null);
  const fx = useRates(null);
  const today = toDay(new Date());
  const occ = recurringInMonth(f.activeTemplates, f.txs.rows, f.skips.rows, year, month);
  const s = monthSummary(f.txs.rows, occ, year, month);
  const worth = netWorth(f.banks.rows, f.txs.rows, f.transfers.rows, f.payments.rows, today);
  const daily = dailyExpenses(f.txs.rows, year, month);
  const categories = byCategory(f.txs.rows, 'expense', year, month);
  const budgetRows = evaluateBudgets(f.budgets.rows, f.txs.rows, year, month, today, fx.rates);
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

      {/* Monthly category budgets with pace marker */}
      <section className="card mb-6" aria-label="Orçamento por categoria">
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <div className="mr-auto">
            <div className="font-medium">Orçamento por categoria</div>
            <div className="text-[13px] text-fg3">
              Limites mensais com marcador de ritmo{budgetRows[0] && budgetRows[0].expectedPct > 0 && budgetRows[0].expectedPct < 100 ? ` · hoje em ${budgetRows[0].expectedPct}% do mês` : ''}
            </div>
          </div>
          <button type="button" className="btn-secondary h-9" onClick={() => setEditingBudget({ currency: displayCurrency() })}>
            <Plus size={15} strokeWidth={1.6} aria-hidden="true" />Definir limite
          </button>
        </div>
        {budgetRows.length === 0 ? (
          <Empty icon={<Gauge size={18} strokeWidth={1.5} />}>
            Defina tetos mensais para categorias como Mercado, Alimentação ou Lazer e acompanhe o ritmo de gasto no mês.
          </Empty>
        ) : (
          <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {budgetRows.map((r) => {
              const meta = BUDGET_BADGE[r.status];
              return (
                <li key={r.budget.id} className="min-w-0">
                  <button
                    type="button"
                    onClick={() => setEditingBudget(r.budget)}
                    className="flex w-full min-w-0 flex-col rounded-xl border border-line bg-raised/40 p-3.5 text-left transition-colors hover:bg-raised/70 focus-visible:ring-2 focus-visible:ring-brand"
                  >
                    <div className="mb-1.5 flex w-full min-w-0 items-center gap-2">
                      <span className="mr-auto truncate text-sm font-medium">{r.budget.category}</span>
                      <span className={`badge ${meta.cls}`}>{meta.label}</span>
                    </div>
                    <div className="mb-2 flex flex-wrap items-baseline gap-x-2 text-xs">
                      <span className="figure text-sm font-medium text-fg">{money(r.spentBrl)}</span>
                      <span className="figure text-fg3">de {money(r.limitBrl)}</span>
                      <span className={`figure ml-auto font-medium ${r.status === 'over' ? 'text-negative' : 'text-fg2'}`}>{r.pct}%</span>
                    </div>
                    <div
                      className="relative h-2 rounded-full bg-raised"
                      role="progressbar"
                      aria-valuenow={Math.min(100, r.pct)}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-label={`Orçamento de ${r.budget.category}`}
                    >
                      <div className={`h-2 rounded-full ${meta.bar}`} style={{ width: `${Math.min(100, r.pct)}%` }} />
                      {r.expectedPct > 0 && r.expectedPct < 100 && (
                        <span
                          className="absolute -top-1 h-4 w-0.5 rounded bg-fg2"
                          style={{ left: `calc(${r.expectedPct}% - 1px)` }}
                          title={`Ritmo esperado hoje: ${r.expectedPct}%`}
                        />
                      )}
                    </div>
                    <div className="mt-2 flex items-center justify-between text-xs text-fg3">
                      <span className={r.remainingBrl < 0 ? 'text-negative' : ''}>
                        {r.remainingBrl >= 0 ? `Restam ${money(r.remainingBrl)}` : `Estourou ${money(-r.remainingBrl)}`}
                      </span>
                      {r.expectedPct > 0 && r.expectedPct < 100 && <span className="figure">mês em {r.expectedPct}%</span>}
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>

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

      {editingBudget && (
        <BudgetModal
          budget={editingBudget}
          existing={f.budgets.rows}
          onClose={() => setEditingBudget(null)}
          onSaved={() => { setEditingBudget(null); void f.budgets.reload(); }}
        />
      )}
    </>
  );
}

function BudgetModal({ budget, existing, onClose, onSaved }: {
  budget: Partial<CategoryBudget>;
  existing: CategoryBudget[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [category, setCategory] = useState(budget.category ?? '');
  const [limit, setLimit] = useState(budget.monthly_limit != null ? String(budget.monthly_limit) : '');
  const [currency, setCurrency] = useState<Currency>(budget.currency ?? 'BRL');
  const [saving, setSaving] = useState(false);

  async function save(e: FormEvent) {
    e.preventDefault();
    const val = Number(limit.replace(',', '.'));
    const cat = category.trim();
    if (!cat || !Number.isFinite(val) || val <= 0) return;
    setSaving(true);
    const match = budget.id ? { id: budget.id } : existing.find((b) => b.category.toLowerCase() === cat.toLowerCase());
    const ok = match
      ? await write(supabase.from('category_budgets').update({ category: cat, monthly_limit: val, currency, updated_at: new Date().toISOString() }).eq('id', match.id))
      : await write(supabase.from('category_budgets').insert({ category: cat, monthly_limit: val, currency }));
    setSaving(false);
    if (ok) onSaved();
  }

  async function remove() {
    if (budget.id && confirm(`Remover o limite de ${budget.category}?`) && await write(supabase.from('category_budgets').delete().eq('id', budget.id))) {
      onSaved();
    }
  }

  return (
    <Modal title={budget.id ? `Limite: ${budget.category}` : 'Novo limite mensal'} onClose={onClose}>
      <form onSubmit={save}>
        <Field label="Categoria">
          <input className="input" list="budget-cats" value={category} onChange={(e) => setCategory(e.target.value)} placeholder="Mercado, Alimentação, Lazer…" required autoFocus />
          <datalist id="budget-cats">{EXPENSE_CATEGORIES.map((c) => <option key={c} value={c} />)}</datalist>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label={`Limite mensal (${symbolOf(currency)})`}>
            <input className="input figure" inputMode="decimal" value={limit} onChange={(e) => setLimit(e.target.value)} required placeholder="1200" />
          </Field>
          <FieldGroup label="Moeda">
            <div className="segmented w-full">
              {CURRENCIES.map((c) => (
                <button key={c.code} type="button" className={`flex-1 ${currency === c.code ? 'tab-active' : 'tab'}`} aria-pressed={currency === c.code} onClick={() => setCurrency(c.code)}>
                  {c.symbol}
                </button>
              ))}
            </div>
          </FieldGroup>
        </div>
        <p className="mb-4 text-xs text-fg3">Compara os gastos desta categoria no mês com o limite e mostra uma marca vertical com o ritmo esperado para o dia de hoje.</p>
        <div className="flex gap-2">
          {budget.id && <button type="button" className="btn-ghost text-negative" onClick={remove}>Remover</button>}
          <button className="btn-primary ml-auto" disabled={saving}>{saving ? 'Salvando…' : 'Salvar'}</button>
        </div>
      </form>
    </Modal>
  );
}
