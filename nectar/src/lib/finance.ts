import { daysInMonth, type Day } from './dates';

// Money is handled in integer cents inside every calculation so sums never
// drift; values come in and go out as reais with two decimals.
export const cents = (reais: number | string | null | undefined) => Math.round(Number(reais ?? 0) * 100);
export const reais = (c: number) => c / 100;

export type TxType = 'income' | 'expense';
export type PaymentMethod = 'pix' | 'debito' | 'credito' | 'dinheiro' | 'boleto' | 'transferencia';

export const PAYMENT_LABEL: Record<PaymentMethod, string> = {
  pix: 'Pix', debito: 'Débito', credito: 'Crédito', dinheiro: 'Dinheiro', boleto: 'Boleto', transferencia: 'Transferência',
};

export const EXPENSE_CATEGORIES = ['Moradia', 'Mercado', 'Alimentação', 'Transporte', 'Saúde', 'Educação', 'Lazer', 'Assinaturas',
  'Compras', 'Contas', 'Cuidados pessoais', 'Pets', 'Viagem', 'Impostos', 'Investimentos', 'Presentes', 'Outros'];
export const INCOME_CATEGORIES = ['Salário', 'Freelance', 'Rendimentos', 'Reembolso', 'Vendas', 'Outros'];

export interface Tx {
  id: string; description: string; type: TxType; amount: number; date: Day; category: string | null;
  payment_method: string | null; bank_id: string | null; card_id: string | null; is_pending: boolean;
  installment_purchase_id: string | null; installment_number: number | null; is_advance_payment?: boolean;
  recurring_template_id: string | null;
  /** Amount above is in reais; a purchase in another currency keeps what was spent and the rate (reais per unit). */
  currency?: 'BRL' | 'USD' | 'EUR'; original_amount?: number | null; fx_rate?: number | null;
  project_id?: string | null;
}
/** initial_balance is in the account's own currency; currency defaults to reais. */
export interface Bank { id: string; name: string; initial_balance: number; color: string | null; currency?: 'BRL' | 'USD' | 'EUR' }
export interface Card { id: string; name: string; bank_id: string | null; card_type: 'credit' | 'debit'; credit_limit: number | null; closing_day: number | null; due_day: number | null }
export interface Transfer { id: string; from_bank_id: string; to_bank_id: string; amount: number; date: Day; description: string | null }
export interface InvoicePayment { id: string; card_id: string; year: number; month: number; amount: number; paid_at: Day; bank_id: string | null }
export interface RecurringTemplate {
  id: string; description: string; type: TxType; amount: number; category: string | null; payment_method: string | null;
  bank_id: string | null; card_id: string | null; start_date: Day; is_active: boolean; deleted_at: string | null;
  /** 'monthly': recurrence_days are days of the month. 'weekly': recurrence_days are weekdays, 0 = Sunday. */
  recurrence_days: number[]; frequency: 'monthly' | 'weekly';
  /** The currency the value was agreed in; amount is its reais equivalent at fx_rate. */
  currency: 'BRL' | 'USD' | 'EUR'; original_amount: number | null; fx_rate: number | null;
}
export interface Skip { recurring_template_id: string; skipped_date: Day }

const pad = (n: number) => String(n).padStart(2, '0');
/** A day of a month, clamped to the month's last day (31 in February becomes 28 or 29). */
export function dayOf(year: number, month: number, day: number): Day {
  return `${year}-${pad(month)}-${pad(Math.min(day, daysInMonth(year, month)))}`;
}
export function addMonths(year: number, month: number, n: number): { year: number; month: number } {
  const i = year * 12 + (month - 1) + n;
  return { year: Math.floor(i / 12), month: (i % 12) + 1 };
}
const ym = (d: Day) => ({ year: Number(d.slice(0, 4)), month: Number(d.slice(5, 7)) });
export const monthKey = (year: number, month: number) => `${year}-${pad(month)}`;

// ---------------------------------------------------------------------------
// Credit card invoices
// ---------------------------------------------------------------------------

export interface InvoiceRef { year: number; month: number; closeDate: Day; dueDate: Day }

/**
 * The invoice a credit card purchase belongs to. Purchases on or after the
 * closing day go to the next invoice. The invoice is named by its due month:
 * the due day falls in the month after closing when it is not after the
 * closing day, otherwise in the closing month.
 */
export function invoiceFor(date: Day, card: Pick<Card, 'closing_day' | 'due_day'>): InvoiceRef {
  const closing = card.closing_day ?? 1;
  const due = card.due_day ?? closing;
  const { year, month } = ym(date);
  const day = Number(date.slice(8, 10));
  const close = day >= Math.min(closing, daysInMonth(year, month)) ? addMonths(year, month, 1) : { year, month };
  const dueMonth = due <= closing ? addMonths(close.year, close.month, 1) : close;
  return {
    year: dueMonth.year, month: dueMonth.month,
    closeDate: dayOf(close.year, close.month, closing), dueDate: dayOf(dueMonth.year, dueMonth.month, due),
  };
}

export interface Invoice extends InvoiceRef { card_id: string; total: number; items: Tx[]; paid: InvoicePayment | null }

/** Invoices of a credit card, oldest first, with their purchases and payment. */
export function invoices(card: Card, txs: Tx[], payments: InvoicePayment[]): Invoice[] {
  const map = new Map<string, Invoice>();
  for (const t of txs) {
    if (t.card_id !== card.id || t.type !== 'expense') continue;
    const ref = invoiceFor(t.date, card);
    const key = monthKey(ref.year, ref.month);
    const inv = map.get(key) ?? { ...ref, card_id: card.id, total: 0, items: [], paid: null };
    inv.total = reais(cents(inv.total) + cents(t.amount));
    inv.items.push(t);
    map.set(key, inv);
  }
  for (const inv of map.values()) inv.paid = payments.find((p) => p.card_id === card.id && p.year === inv.year && p.month === inv.month) ?? null;
  return [...map.values()].sort((a, b) => a.dueDate.localeCompare(b.dueDate));
}

/** Credit in use: the total of invoices not yet paid. */
export function cardUsed(card: Card, txs: Tx[], payments: InvoicePayment[]): number {
  return reais(invoices(card, txs, payments).filter((i) => !i.paid).reduce((s, i) => s + cents(i.total), 0));
}

// ---------------------------------------------------------------------------
// Installments
// ---------------------------------------------------------------------------

/**
 * Splits a purchase into monthly installments. The cents that do not divide
 * evenly go to the first installment, so the parts always add up to the total.
 */
export function installmentSchedule(total: number, count: number, firstDate: Day): { number: number; date: Day; amount: number }[] {
  const t = cents(total);
  const base = Math.floor(t / count);
  const rest = t - base * count;
  const { year, month } = ym(firstDate);
  const day = Number(firstDate.slice(8, 10));
  return Array.from({ length: count }, (_, i) => {
    const m = addMonths(year, month, i);
    return { number: i + 1, date: dayOf(m.year, m.month, day), amount: reais(base + (i === 0 ? rest : 0)) };
  });
}

// ---------------------------------------------------------------------------
// Recurring entries
// ---------------------------------------------------------------------------

export interface Occurrence { template: RecurringTemplate; date: Day; paid: Tx | null; skipped: boolean }

/** The dates a recurring entry falls on in a month, with whether each was paid or skipped. */
export function recurringInMonth(templates: RecurringTemplate[], txs: Tx[], skips: Skip[], year: number, month: number): Occurrence[] {
  const out: Occurrence[] = [];
  const first = dayOf(year, month, 1);
  const last = dayOf(year, month, 31);
  for (const t of templates) {
    if (!t.is_active || t.deleted_at) continue;
    if (t.start_date > last) continue;
    if (t.frequency === 'weekly') {
      out.push(...weeklyInMonth(t, txs, skips, year, month));
      continue;
    }
    const paidThisMonth = txs.filter((x) => x.recurring_template_id === t.id && x.date >= first && x.date <= last)
      .sort((a, b) => a.date.localeCompare(b.date));
    [...new Set(t.recurrence_days)].sort((a, b) => a - b).forEach((d, i) => {
      const date = dayOf(year, month, d);
      if (date < t.start_date) return;
      out.push({
        template: t, date, paid: paidThisMonth[i] ?? null,
        skipped: skips.some((s) => s.recurring_template_id === t.id && s.skipped_date === date),
      });
    });
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

/** A weekly entry's dates in the month, each matched with the logged entry of that week (a day either side). */
function weeklyInMonth(t: RecurringTemplate, txs: Tx[], skips: Skip[], year: number, month: number): Occurrence[] {
  const days = new Set(t.recurrence_days);
  const dates: Day[] = [];
  for (let d = 1; d <= daysInMonth(year, month); d++) {
    const date = dayOf(year, month, d);
    if (date < t.start_date || !days.has(new Date(Date.UTC(year, month - 1, d)).getUTCDay())) continue;
    dates.push(date);
  }
  const candidates = txs.filter((x) => x.recurring_template_id === t.id && x.date >= dayOf(year, month, 1) && x.date <= dayOf(year, month, 31))
    .sort((a, b) => a.date.localeCompare(b.date));
  const used = new Set<string>();
  const gap = (a: Day, b: Day) => Math.abs(Date.parse(a) - Date.parse(b)) / 86400000;
  return dates.map((date) => {
    const paid = candidates.find((x) => !used.has(x.id) && gap(x.date, date) <= 3) ?? null;
    if (paid) used.add(paid.id);
    return { template: t, date, paid, skipped: skips.some((s) => s.recurring_template_id === t.id && s.skipped_date === date) };
  });
}

/** The monthly cost or income of a template, to compare with others. A week is 52/12 of a month. */
export function monthlyEquivalent(t: RecurringTemplate): number {
  const perPeriod = Number(t.amount) * t.recurrence_days.length;
  return t.frequency === 'weekly' ? perPeriod * 52 / 12 : perPeriod;
}

// ---------------------------------------------------------------------------
// Balances
// ---------------------------------------------------------------------------

/** Money moved by a transaction through a bank account (credit card purchases do not touch it). */
export function touchesBank(t: Tx): boolean {
  return !!t.bank_id && !t.is_pending && t.payment_method !== 'credito' && !t.card_id;
}

// Reais per unit of each foreign currency, today's. Set by the screens that load the rates.
let bankRates: Partial<Record<'USD' | 'EUR', number>> = {};
export function setBankRates(rates: Partial<Record<'USD' | 'EUR', number>>) {
  bankRates = { ...rates };
}

/** Balance of an account up to a day: initial, entries, transfers and card invoices paid from it. */
export function bankBalance(bank: Bank, txs: Tx[], transfers: Transfer[], payments: InvoicePayment[], upTo?: Day): number {
  const own = bank.currency ?? 'BRL';
  const rate = own === 'BRL' ? 1 : bankRates[own];
  // Money in reais, expressed in the account's currency at today's rate.
  const native = (reais: number) => (own === 'BRL' ? reais : rate ? reais / rate : 0);
  const inRange = (d: Day) => !upTo || d <= upTo;
  let c = cents(bank.initial_balance);
  for (const t of txs) {
    if (t.bank_id !== bank.id || !touchesBank(t) || !inRange(t.date)) continue;
    const value = t.currency === own && t.original_amount != null ? Number(t.original_amount) : native(Number(t.amount));
    c += t.type === 'income' ? cents(value) : -cents(value);
  }
  for (const tr of transfers) {
    if (!inRange(tr.date)) continue;
    if (tr.to_bank_id === bank.id) c += cents(native(Number(tr.amount)));
    if (tr.from_bank_id === bank.id) c -= cents(native(Number(tr.amount)));
  }
  for (const p of payments) if (p.bank_id === bank.id && inRange(p.paid_at)) c -= cents(native(Number(p.amount)));
  // Reais accounts stay exact; a foreign account is converted once, at the end.
  return own === 'BRL' ? reais(c) : Math.round(reais(c) * (rate ?? 0) * 100) / 100;
}

export function netWorth(banks: Bank[], txs: Tx[], transfers: Transfer[], payments: InvoicePayment[], upTo?: Day): number {
  return reais(banks.reduce((s, b) => s + cents(bankBalance(b, txs, transfers, payments, upTo)), 0));
}

export interface NetWorthPoint { key: string; year: number; month: number; date: Day; value: number }

/** Net worth at the end of each of the last `count` months (clamped to `today` for the current month). */
export function netWorthHistory(
  banks: Bank[], txs: Tx[], transfers: Transfer[], payments: InvoicePayment[],
  year: number, month: number, count: number, today?: Day,
): NetWorthPoint[] {
  return Array.from({ length: count }, (_, i) => {
    const m = addMonths(year, month, i - count + 1);
    const end = dayOf(m.year, m.month, 31);
    const date = today && end > today && monthKey(m.year, m.month) === today.slice(0, 7) ? today : end;
    return {
      key: monthKey(m.year, m.month),
      year: m.year,
      month: m.month,
      date,
      value: netWorth(banks, txs, transfers, payments, date),
    };
  });
}

// ---------------------------------------------------------------------------
// The month
// ---------------------------------------------------------------------------

export interface MonthSummary {
  received: number; toReceive: number; spent: number; toSpend: number;
  income: number; expense: number; leftover: number;
  /** Expenses that are neither recurring nor installments. */
  variable: number;
}

/**
 * What came in and went out in a month, by transaction date. Pending entries
 * and recurring ones not yet recorded (and not skipped) count as expected.
 */
export function monthSummary(txs: Tx[], occurrences: Occurrence[], year: number, month: number): MonthSummary {
  const key = monthKey(year, month);
  const inMonth = txs.filter((t) => t.date.startsWith(key));
  let received = 0, toReceive = 0, spent = 0, toSpend = 0, variable = 0;
  for (const t of inMonth) {
    const c = cents(t.amount);
    if (t.type === 'income') { if (t.is_pending) toReceive += c; else received += c; }
    else {
      if (t.is_pending) toSpend += c; else spent += c;
      if (!t.recurring_template_id && !t.installment_purchase_id) variable += c;
    }
  }
  for (const o of occurrences) {
    if (o.paid || o.skipped) continue;
    if (o.template.type === 'income') toReceive += cents(o.template.amount);
    else toSpend += cents(o.template.amount);
  }
  const income = received + toReceive;
  const expense = spent + toSpend;
  return {
    received: reais(received), toReceive: reais(toReceive), spent: reais(spent), toSpend: reais(toSpend),
    income: reais(income), expense: reais(expense), leftover: reais(income - expense), variable: reais(variable),
  };
}

/** Expenses per day of the month (recorded ones), for the day-by-day chart. */
export function dailyExpenses(txs: Tx[], year: number, month: number): { day: number; amount: number }[] {
  const n = daysInMonth(year, month);
  const acc = Array.from({ length: n }, () => 0);
  const key = monthKey(year, month);
  for (const t of txs) if (t.type === 'expense' && !t.is_pending && t.date.startsWith(key)) acc[Number(t.date.slice(8, 10)) - 1] += cents(t.amount);
  return acc.map((c, i) => ({ day: i + 1, amount: reais(c) }));
}

/** Total per category in a month, largest first. */
export function byCategory(txs: Tx[], type: TxType, year: number, month: number, variableOnly = false): { category: string; amount: number }[] {
  const key = monthKey(year, month);
  const acc = new Map<string, number>();
  for (const t of txs) {
    if (t.type !== type || !t.date.startsWith(key)) continue;
    if (variableOnly && (t.recurring_template_id || t.installment_purchase_id)) continue;
    const k = t.category || 'Sem categoria';
    acc.set(k, (acc.get(k) ?? 0) + cents(t.amount));
  }
  return [...acc.entries()].map(([category, c]) => ({ category, amount: reais(c) })).sort((a, b) => b.amount - a.amount);
}

/**
 * Where variable spending will end the month: the daily average so far,
 * carried to the month's last day. Past months return what was spent.
 */
export function variableProjection(variable: number, year: number, month: number, today: Day): { perDay: number; projected: number } {
  const n = daysInMonth(year, month);
  const key = monthKey(year, month);
  const elapsed = today.startsWith(key) ? Number(today.slice(8, 10)) : today > dayOf(year, month, n) ? n : 0;
  if (!elapsed) return { perDay: 0, projected: 0 };
  const perDay = Math.round(cents(variable) / elapsed);
  return { perDay: reais(perDay), projected: reais(elapsed >= n ? cents(variable) : perDay * n) };
}

export interface MonthFlow { key: string; year: number; month: number; income: number; expense: number; leftover: number; rate: number | null }

/** Income, expense and leftover rate for each of the last `count` months up to the given one. */
export function monthlyFlow(txs: Tx[], year: number, month: number, count: number): MonthFlow[] {
  return Array.from({ length: count }, (_, i) => {
    const m = addMonths(year, month, i - count + 1);
    const key = monthKey(m.year, m.month);
    let inc = 0, exp = 0;
    for (const t of txs) {
      if (!t.date.startsWith(key)) continue;
      if (t.type === 'income') inc += cents(t.amount); else exp += cents(t.amount);
    }
    return { key, year: m.year, month: m.month, income: reais(inc), expense: reais(exp), leftover: reais(inc - exp), rate: inc ? Math.round(((inc - exp) / inc) * 1000) / 10 : null };
  });
}

/** Average leftover rate over the months that had income. */
export function averageLeftoverRate(flow: MonthFlow[]): number | null {
  const rates = flow.map((f) => f.rate).filter((r): r is number => r !== null);
  return rates.length ? Math.round((rates.reduce((a, b) => a + b, 0) / rates.length) * 10) / 10 : null;
}
