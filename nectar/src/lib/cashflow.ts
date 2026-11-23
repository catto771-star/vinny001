import { addDays, daysInMonth, type Day } from './dates';
import {
  cents, invoices, monthKey, reais, recurringInMonth,
  type Card, type InvoicePayment, type RecurringTemplate, type Skip, type Tx,
} from './finance';
import { toBRL, type Currency } from './money';
import { searchKey } from './text';

// ---------------------------------------------------------------------------
// 30 / 60 / 90-day Cash Flow Projection
// ---------------------------------------------------------------------------

export type HorizonDays = 30 | 60 | 90;

export interface CashEvent {
  key: string;
  day: Day;
  label: string;
  /** Signed amount in BRL: positive for inflows, negative for outflows. */
  amount: number;
  kind: 'recurring' | 'pending' | 'invoice';
}

export interface CashFlowPoint {
  day: Day;
  balance: number;
  delta: number;
  events: CashEvent[];
}

export interface CashFlowProjection {
  startDay: Day;
  endDay: Day;
  days: HorizonDays;
  startingBalance: number;
  endingBalance: number;
  totalIn: number;
  totalOut: number;
  netChange: number;
  minBalance: number;
  minBalanceDay: Day;
  negativeDays: number;
  points: CashFlowPoint[];
  events: CashEvent[];
}

export function projectCashFlow(input: {
  startDay: Day;
  days: HorizonDays;
  startingBalance: number;
  templates: RecurringTemplate[];
  txs: Tx[];
  skips: Skip[];
  cards: Card[];
  payments: InvoicePayment[];
}): CashFlowProjection {
  const { startDay, days, startingBalance, templates, txs, skips, cards, payments } = input;
  const endDay = addDays(startDay, days);
  const inWindow = (d: Day) => d >= startDay && d <= endDay;

  const events: CashEvent[] = [];

  // 1. Unpaid, non-skipped recurring occurrences across every month touched by [startDay, endDay]
  const months = new Set<string>();
  for (let d = startDay; d <= endDay; d = addDays(d, 1)) months.add(d.slice(0, 7));
  for (const ym of months) {
    const [y, m] = ym.split('-').map(Number);
    for (const o of recurringInMonth(templates, txs, skips, y, m)) {
      if (o.paid || o.skipped || !inWindow(o.date)) continue;
      const amt = o.template.type === 'expense' ? -Math.abs(Number(o.template.amount)) : Math.abs(Number(o.template.amount));
      events.push({
        key: `rec:${o.template.id}:${o.date}`,
        day: o.date,
        label: o.template.description,
        amount: amt,
        kind: 'recurring',
      });
    }
  }

  // 2. Pending non-card transactions inside the window
  for (const t of txs) {
    if (!t.is_pending || t.card_id || !inWindow(t.date)) continue;
    const amt = t.type === 'expense' ? -Math.abs(Number(t.amount)) : Math.abs(Number(t.amount));
    events.push({
      key: `pend:${t.id}`,
      day: t.date,
      label: t.description,
      amount: amt,
      kind: 'pending',
    });
  }

  // 3. Unpaid credit card invoices due inside the window
  for (const card of cards) {
    for (const inv of invoices(card, txs, payments)) {
      if (inv.paid || !inWindow(inv.dueDate) || inv.total <= 0) continue;
      events.push({
        key: `inv:${card.id}:${inv.year}-${inv.month}`,
        day: inv.dueDate,
        label: `Fatura ${card.name}`,
        amount: -Math.abs(inv.total),
        kind: 'invoice',
      });
    }
  }

  events.sort((a, b) => a.day.localeCompare(b.day) || a.amount - b.amount || a.label.localeCompare(b.label, 'pt'));

  const byDay = new Map<Day, CashEvent[]>();
  for (const ev of events) {
    const list = byDay.get(ev.day);
    if (list) list.push(ev);
    else byDay.set(ev.day, [ev]);
  }

  let runningCents = cents(startingBalance);
  let totalInCents = 0;
  let totalOutCents = 0;
  let minCents = runningCents;
  let minBalanceDay: Day = startDay;
  let negativeDays = 0;
  const points: CashFlowPoint[] = [];

  for (let d = startDay; d <= endDay; d = addDays(d, 1)) {
    const dayEvents = byDay.get(d) ?? [];
    let deltaCents = 0;
    for (const ev of dayEvents) {
      const c = cents(ev.amount);
      deltaCents += c;
      if (c >= 0) totalInCents += c;
      else totalOutCents += -c;
    }
    runningCents += deltaCents;
    if (runningCents < minCents) {
      minCents = runningCents;
      minBalanceDay = d;
    }
    if (runningCents < 0) negativeDays += 1;
    points.push({
      day: d,
      balance: reais(runningCents),
      delta: reais(deltaCents),
      events: dayEvents,
    });
  }

  return {
    startDay,
    endDay,
    days,
    startingBalance: reais(cents(startingBalance)),
    endingBalance: reais(runningCents),
    totalIn: reais(totalInCents),
    totalOut: reais(totalOutCents),
    netChange: reais(runningCents - cents(startingBalance)),
    minBalance: reais(minCents),
    minBalanceDay,
    negativeDays,
    points,
    events,
  };
}

// ---------------------------------------------------------------------------
// Monthly Category Budgets with Pace Marker
// ---------------------------------------------------------------------------

export interface CategoryBudget {
  id: string;
  category: string;
  monthly_limit: number;
  currency?: Currency;
}

export type BudgetStatus = 'ok' | 'warn' | 'over';

export interface BudgetRow {
  budget: CategoryBudget;
  limitBrl: number;
  spentBrl: number;
  remainingBrl: number;
  /** Share of budget used (0..∞), e.g. 75 for 75%. */
  pct: number;
  /** Expected share by today in this month (0..100). */
  expectedPct: number;
  status: BudgetStatus;
}

/** Share of the month elapsed at `today` (0 for future months, 1 for past months). */
export function monthElapsedShare(year: number, month: number, today: Day): number {
  const viewed = monthKey(year, month);
  const current = today.slice(0, 7);
  if (viewed < current) return 1;
  if (viewed > current) return 0;
  const dayNum = Number(today.slice(8, 10));
  return Math.min(1, Math.max(0, dayNum / daysInMonth(year, month)));
}

/** Evaluates monthly category budgets against actual expenses in the given month. */
export function evaluateBudgets(
  budgets: readonly CategoryBudget[],
  txs: readonly Tx[],
  year: number,
  month: number,
  today: Day,
  rates?: Partial<Record<'USD' | 'EUR', number>>,
): BudgetRow[] {
  const key = monthKey(year, month);
  const spentByKey = new Map<string, number>();

  for (const t of txs) {
    if (t.type !== 'expense' || !t.date.startsWith(key)) continue;
    const catKey = searchKey(t.category || 'Outros');
    spentByKey.set(catKey, (spentByKey.get(catKey) ?? 0) + cents(t.amount));
  }

  const expectedPct = Math.round(monthElapsedShare(year, month, today) * 100);

  return budgets
    .map((b): BudgetRow => {
      const cur: Currency = b.currency ?? 'BRL';
      const rawLimit = Number(b.monthly_limit);
      const limitBrl = cur === 'BRL'
        ? reais(cents(rawLimit))
        : (rates?.[cur] && rates[cur]! > 0 ? toBRL(rawLimit, rates[cur]!) : reais(cents(rawLimit)));
      const spentCents = spentByKey.get(searchKey(b.category)) ?? 0;
      const limitCents = cents(limitBrl);
      const spentBrl = reais(spentCents);
      const remainingBrl = reais(limitCents - spentCents);
      const pct = limitCents > 0 ? Math.round((spentCents / limitCents) * 100) : 0;

      const status: BudgetStatus =
        spentCents > limitCents ? 'over'
          : (pct >= 80 || (expectedPct > 0 && expectedPct < 100 && pct - expectedPct > 15)) ? 'warn'
            : 'ok';

      return { budget: b, limitBrl, spentBrl, remainingBrl, pct, expectedPct, status };
    })
    .sort((a, b) => b.pct - a.pct || b.spentBrl - a.spentBrl || a.budget.category.localeCompare(b.budget.category, 'pt'));
}
