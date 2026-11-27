import { useMemo, useState, type FormEvent } from 'react';
import { CalendarClock, Gauge, Plus, Receipt } from 'lucide-react';
import { CURRENCIES, conv, displayCurrency, money, symbolOf, type Currency } from '../../lib/money';
import { formatDay, monthName, toDay } from '../../lib/dates';
import {
  EXPENSE_CATEGORIES, bankBalance, byCategory, cardUsed, dailyExpenses, invoices, monthKey, monthSummary,
  netWorth, netWorthHistory, recurringInMonth,
} from '../../lib/finance';
import { evaluateBudgets, projectCashFlow, type BudgetStatus, type CategoryBudget } from '../../lib/cashflow';
import { supabase } from '../../lib/supabase';
import { write } from '../../lib/useTable';
import { AreaChart, ColumnChart, DonutChart } from '../../components/Charts';
import { Empty, Field, FieldGroup, Figure, Modal, Skeleton } from '../../components/ui';
import { useRates } from './useRates';
import type { Finance } from './useFinance';

const BUDGET_BADGE: Record<BudgetStatus, { label: string; cls: string; bar: string }> = {
  ok: { label: 'No ritmo', cls: 'text-positive', bar: 'bg-brand' },
  warn: { label: 'Atenção', cls: 'text-warning', bar: 'bg-warning' },
  over: { label: 'Acima do limite', cls: 'text-negative', bar: 'bg-negative' },
};

const CARD_FINISHES = [
  'linear-gradient(155deg, #27272b 0%, #18181b 55%, #111113 100%)',
  'linear-gradient(155deg, #22262b 0%, #16191d 55%, #101215 100%)',
  'linear-gradient(155deg, #282623 0%, #1a1816 55%, #121110 100%)',
];

const shortDay = (d: string) => `${Number(d.slice(8))}/${d.slice(5, 7)}`;

function MetallicChip() {
  return (
    <svg width="34" height="24" viewBox="0 0 34 24" aria-hidden="true">
      <rect x="0.5" y="0.5" width="33" height="23" rx="4.5" fill="#a1a1aa" fillOpacity="0.22" stroke="#a1a1aa" strokeOpacity="0.55" strokeWidth="1" />
      <path d="M11 1v22M23 1v22M1 9h10M23 9h10M1 15h10M23 15h10" stroke="#e4e4e7" strokeOpacity="0.4" strokeWidth="1" />
    </svg>
  );
}

export default function Summary({ f, year, month, onPay }: { f: Finance; year: number; month: number; onPay: (o: { template_id: string; date: string }) => void }) {
  const [editingBudget, setEditingBudget] = useState<Partial<CategoryBudget> | null>(null);
  const [mainChart, setMainChart] = useState<'fluxo' | 'patrimonio' | 'diario'>('fluxo');
  const [donutMode, setDonutMode] = useState<'auto' | 'categorias' | 'contas'>('auto');
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

  const projection = useMemo(() => projectCashFlow({
    startDay: today,
    days: 30,
    startingBalance: worth,
    templates: f.activeTemplates,
    txs: f.txs.rows,
    skips: f.skips.rows,
    cards: f.cards.rows,
    payments: f.payments.rows,
  }), [today, worth, f.activeTemplates, f.txs.rows, f.skips.rows, f.cards.rows, f.payments.rows]);

  const worthCurve = useMemo(
    () => netWorthHistory(f.banks.rows, f.txs.rows, f.transfers.rows, f.payments.rows, year, month, 6, today),
    [f.banks.rows, f.txs.rows, f.transfers.rows, f.payments.rows, year, month, today],
  );

  const saveRate = s.income > 0 ? Math.max(0, Math.min(100, Math.round((s.leftover / s.income) * 100))) : 0;
  const accountRows = f.banks.rows.map((b) => ({
    bank: b,
    balance: bankBalance(b, f.txs.rows, f.transfers.rows, f.payments.rows, today),
  }));
  const positiveSum = accountRows.reduce((acc, r) => acc + Math.max(0, r.balance), 0);
  const bankSlices = accountRows.map((r) => ({
    label: r.bank.name,
    value: Math.max(0, r.balance),
    color: r.bank.color || undefined,
  }));

  const effectiveDonut = donutMode === 'auto' ? (categories.length > 0 ? 'categorias' : 'contas') : donutMode;

  const chartSwitch = (
    <div className="segmented" role="tablist" aria-label="Tipo de gráfico">
      <button type="button" role="tab" aria-selected={mainChart === 'fluxo'} className={mainChart === 'fluxo' ? 'tab-active' : 'tab'} onClick={() => setMainChart('fluxo')}>Fluxo 30d</button>
      <button type="button" role="tab" aria-selected={mainChart === 'patrimonio'} className={mainChart === 'patrimonio' ? 'tab-active' : 'tab'} onClick={() => setMainChart('patrimonio')}>Patrimônio</button>
      <button type="button" role="tab" aria-selected={mainChart === 'diario'} className={mainChart === 'diario' ? 'tab-active' : 'tab'} onClick={() => setMainChart('diario')}>Dia a dia</button>
    </div>
  );

  const donutSwitch = (
    <div className="segmented" role="tablist" aria-label="Visão do gráfico de pizza">
      <button type="button" role="tab" aria-selected={effectiveDonut === 'contas'} className={effectiveDonut === 'contas' ? 'tab-active' : 'tab'} onClick={() => setDonutMode('contas')}>Contas</button>
      <button type="button" role="tab" aria-selected={effectiveDonut === 'categorias'} className={effectiveDonut === 'categorias' ? 'tab-active' : 'tab'} onClick={() => setDonutMode('categorias')}>Gastos</button>
    </div>
  );

  return (
    <>
      {/* 4 Quiet Graphite Stat Cards */}
      <section className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-label="Resumo do mês">
        <div className="card flex min-w-0 flex-col justify-between">
          <div className="label">Patrimônio total</div>
          {f.loading ? <Skeleton className="mt-3 h-7 w-32" /> : (
            <Figure value={money(worth)} className="mt-3 block truncate text-[28px] leading-none font-medium text-fg" />
          )}
          <div className="mt-3 text-xs text-fg3">
            {f.banks.rows.length} {f.banks.rows.length === 1 ? 'conta ativa' : 'contas ativas'} · hoje
          </div>
        </div>

        <div className="card flex min-w-0 flex-col justify-between">
          <div className="label">Entra no mês</div>
          {f.loading ? <Skeleton className="mt-3 h-7 w-28" /> : (
            <Figure value={money(s.income)} className="mt-3 block truncate text-[28px] leading-none font-medium text-fg" />
          )}
          <div className="mt-3 text-xs text-fg3">{money(s.received)} recebido · {money(s.toReceive)} a receber</div>
        </div>

        <div className="card flex min-w-0 flex-col justify-between">
          <div className="label">Sai no mês</div>
          {f.loading ? <Skeleton className="mt-3 h-7 w-28" /> : (
            <Figure value={money(s.expense)} className="mt-3 block truncate text-[28px] leading-none font-medium text-fg" />
          )}
          <div className="mt-3 text-xs text-fg3">{money(s.spent)} pago · {money(s.toSpend)} previsto</div>
        </div>

        <div className="card flex min-w-0 flex-col justify-between">
          <div className="label">Sobra do mês</div>
          {f.loading ? <Skeleton className="mt-3 h-7 w-28" /> : (
            <Figure
              value={money(s.leftover)}
              className={`mt-3 block truncate text-[28px] leading-none font-medium ${s.leftover < 0 ? 'text-negative' : 'text-fg'}`}
            />
          )}
          <div className="figure mt-3 text-xs text-fg3">
            {s.income > 0 ? <span className={s.leftover >= 0 ? 'text-positive' : 'text-negative'}>{saveRate}% da entrada</span> : 'sem entradas no mês'}
          </div>
        </div>
      </section>

      {/* Main Chart (Moment 1) + Allocation Donut */}
      <div className="mb-6 grid gap-4 xl:grid-cols-[minmax(0,1.45fr)_minmax(0,1fr)]">
        <div className="min-w-0">
          {mainChart === 'fluxo' && (
            <AreaChart
              title="Previsão de fluxo de caixa"
              subtitle={`Previsto em 30 dias: ${money(projection.endingBalance)} · menor saldo ${money(projection.minBalance)}`}
              unit={symbolOf(displayCurrency())}
              height={292}
              aside={chartSwitch}
              tone="var(--brand)"
              deltaContext="em 30 dias"
              points={projection.points.map((pt) => ({
                label: shortDay(pt.day),
                value: conv(pt.balance),
                detail: pt.events.length ? pt.events.map((e) => `${e.amount >= 0 ? '+' : '−'}${money(Math.abs(e.amount))} ${e.label}`).join(' · ') : undefined,
              }))}
            />
          )}
          {mainChart === 'patrimonio' && (
            <AreaChart
              title="Evolução do patrimônio"
              subtitle="Saldo consolidado ao final de cada mês"
              unit={symbolOf(displayCurrency())}
              minZero={false}
              height={292}
              aside={chartSwitch}
              tone="var(--positive)"
              deltaContext="em 6 meses"
              points={worthCurve.map((p) => ({
                label: `${monthName(p.month).slice(0, 3)}/${String(p.year).slice(2)}`,
                value: conv(p.value),
                detail: `em ${shortDay(p.date)}`,
              }))}
            />
          )}
          {mainChart === 'diario' && (
            <ColumnChart
              title="Dia a dia"
              subtitle="Saídas registradas em cada dia do mês; hoje em destaque"
              unit={symbolOf(displayCurrency())}
              height={292}
              highlightLast={false}
              aside={chartSwitch}
              highlight={today.startsWith(key) ? Number(today.slice(8, 10)) - 1 : -1}
              points={daily.map((d) => ({ label: String(d.day), value: conv(d.amount) }))}
            />
          )}
        </div>

        <DonutChart
          title={effectiveDonut === 'contas' ? 'Alocação do patrimônio' : 'Para onde foi'}
          subtitle={effectiveDonut === 'contas' ? 'Distribuição do saldo entre suas contas' : 'Saídas por categoria neste mês'}
          centerLabel={effectiveDonut === 'contas' ? 'Contas' : 'Saídas'}
          format={money}
          maxSlices={6}
          size={136}
          aside={donutSwitch}
          emptyText={effectiveDonut === 'contas' ? 'Cadastre contas na aba Contas' : 'As categorias aparecem quando houver saídas no mês'}
          rows={effectiveDonut === 'contas'
            ? bankSlices
            : categories.map((c) => ({ label: c.category, value: c.amount }))}
        />
      </div>

      {/* Physical Matte Carbon / Titanium Bank Cards (Moment 2) */}
      {accountRows.length > 0 && (
        <section className="mb-6" aria-label="Suas contas">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-[15px] leading-6 font-medium text-fg">Carteiras e contas</h2>
            <span className="figure text-xs text-fg3">{accountRows.length} {accountRows.length === 1 ? 'conta' : 'contas'}</span>
          </div>
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {accountRows.map(({ bank: b, balance }, idx) => {
              const share = positiveSum > 0 && balance > 0 ? Math.round((balance / positiveSum) * 100) : 0;
              return (
                <li
                  key={b.id}
                  className="relative flex min-h-[156px] min-w-0 flex-col justify-between overflow-hidden rounded-[14px] p-5 text-[#ededed]"
                  style={{
                    background: CARD_FINISHES[idx % CARD_FINISHES.length],
                    boxShadow: 'inset 0 1px 0 rgb(255 255 255 / 0.14), 0 0 0 1px rgb(255 255 255 / 0.08)',
                  }}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="inline-flex min-w-0 items-center gap-2 text-sm font-medium text-[#ededed]">
                      <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: b.color || 'var(--brand)' }} aria-hidden="true" />
                      <span className="truncate">{b.name}</span>
                    </span>
                    <span className="rounded-[4px] border border-white/12 bg-white/6 px-2 py-0.5 font-mono text-[11px] leading-4 text-[#a1a1a6]">
                      {b.currency ?? 'BRL'}
                    </span>
                  </div>
                  <div className="my-3 flex items-center justify-between gap-4">
                    <MetallicChip />
                    <Figure value={money(balance)} className="truncate text-[24px] leading-none font-medium text-[#ededed]" />
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="h-1 flex-1 overflow-hidden rounded-full bg-white/10">
                      <div className="h-full rounded-full" style={{ width: `${share}%`, background: b.color || '#ededed' }} />
                    </div>
                    <span className="figure text-xs text-[#a1a1a6]">{share}% do total</span>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      )}

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
          <div className="mb-3 font-medium">Cartões de crédito</div>
          {!f.cards.rows.length ? <Empty icon={<Receipt size={18} strokeWidth={1.5} />}>Cadastre seus cartões na aba Contas</Empty> : (
            <ul className="divide-y divide-line text-sm">
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
