import { describe, expect, it } from 'vitest';
import {
  averageLeftoverRate, bankBalance, byCategory, cardUsed, dailyExpenses, installmentSchedule, invoiceFor, invoices,
  monthlyFlow, monthSummary, netWorth, recurringInMonth, variableProjection,
  type Bank, type Card, type RecurringTemplate, type Tx,
} from './finance';

let n = 0;
const tx = (over: Partial<Tx>): Tx => ({
  id: `t${n++}`, description: 'x', type: 'expense', amount: 10, date: '2026-11-10', category: null, payment_method: 'pix',
  bank_id: 'nubank', card_id: null, is_pending: false, installment_purchase_id: null, installment_number: null, recurring_template_id: null, ...over,
});
const CARD: Card = { id: 'visa', name: 'Visa', bank_id: 'nubank', card_type: 'credit', credit_limit: 5000, closing_day: 5, due_day: 12 };

describe('credit card invoices', () => {
  it('sends purchases on or after the closing day to the next invoice', () => {
    expect(invoiceFor('2026-11-04', CARD)).toMatchObject({ year: 2026, month: 11, closeDate: '2026-11-05', dueDate: '2026-11-12' });
    expect(invoiceFor('2026-11-05', CARD)).toMatchObject({ year: 2026, month: 12, dueDate: '2026-12-12' });
  });
  it('puts the due date in the following month when it is not after the closing day', () => {
    const c = { closing_day: 25, due_day: 3 };
    expect(invoiceFor('2026-11-20', c)).toMatchObject({ year: 2026, month: 12, closeDate: '2026-11-25', dueDate: '2026-12-03' });
    expect(invoiceFor('2026-12-28', c)).toMatchObject({ year: 2027, month: 2, dueDate: '2027-02-03' });
  });
  it('clamps days to short months', () => {
    expect(invoiceFor('2027-02-15', { closing_day: 30, due_day: 31 })).toMatchObject({ closeDate: '2027-02-28', dueDate: '2027-02-28' });
  });
  it('groups purchases into invoices and counts unpaid ones as used credit', () => {
    const txs = [tx({ card_id: 'visa', payment_method: 'credito', amount: 100.1, date: '2026-11-01' }),
      tx({ card_id: 'visa', payment_method: 'credito', amount: 0.2, date: '2026-11-03' }),
      tx({ card_id: 'visa', payment_method: 'credito', amount: 50, date: '2026-11-20' })];
    const inv = invoices(CARD, txs, []);
    expect(inv.map((i) => [i.month, i.total])).toEqual([[11, 100.3], [12, 50]]);
    expect(cardUsed(CARD, txs, [{ id: 'p', card_id: 'visa', year: 2026, month: 11, amount: 100.3, paid_at: '2026-11-12', bank_id: 'nubank' }])).toBe(50);
  });
});

describe('installments', () => {
  it('splits the total and gives the leftover cents to the first installment', () => {
    const s = installmentSchedule(100, 3, '2026-11-15');
    expect(s.map((p) => p.amount)).toEqual([33.34, 33.33, 33.33]);
    expect(s.map((p) => p.date)).toEqual(['2026-11-15', '2026-12-15', '2027-01-15']);
  });
  it('keeps the day inside short months', () => {
    expect(installmentSchedule(60, 2, '2027-01-31').map((p) => p.date)).toEqual(['2027-01-31', '2027-02-28']);
  });
});

describe('recurring entries', () => {
  const netflix: RecurringTemplate = { id: 'nf', description: 'Netflix', type: 'expense', amount: 55.9, category: 'Assinaturas', payment_method: 'credito',
    bank_id: null, card_id: 'visa', recurrence_days: [31], start_date: '2026-01-01', is_active: true, deleted_at: null };
  it('falls on its day each month, clamped to the month end', () => {
    expect(recurringInMonth([netflix], [], [], 2027, 2).map((o) => o.date)).toEqual(['2027-02-28']);
  });
  it('knows whether the month was paid or skipped, and ignores months before it starts', () => {
    const paid = tx({ recurring_template_id: 'nf', date: '2026-11-30', amount: 55.9 });
    expect(recurringInMonth([netflix], [paid], [], 2026, 11)[0].paid?.id).toBe(paid.id);
    expect(recurringInMonth([netflix], [], [{ recurring_template_id: 'nf', skipped_date: '2026-12-31' }], 2026, 12)[0].skipped).toBe(true);
    expect(recurringInMonth([{ ...netflix, start_date: '2027-01-01' }], [], [], 2026, 12)).toEqual([]);
    expect(recurringInMonth([{ ...netflix, is_active: false }], [], [], 2026, 12)).toEqual([]);
  });
});

describe('balances', () => {
  const bank: Bank = { id: 'nubank', name: 'Nubank', initial_balance: 1000, color: null };
  const other: Bank = { id: 'inter', name: 'Inter', initial_balance: 0, color: null };
  const txs = [
    tx({ type: 'income', amount: 5000, date: '2026-11-05' }),
    tx({ amount: 1200, date: '2026-11-06' }),
    tx({ amount: 300, date: '2026-11-07', is_pending: true }),
    tx({ amount: 80, date: '2026-11-08', payment_method: 'credito', card_id: 'visa', bank_id: null }),
  ];
  const transfers = [{ id: 'tr', from_bank_id: 'nubank', to_bank_id: 'inter', amount: 500, date: '2026-11-09', description: null }];
  const payments = [{ id: 'p', card_id: 'visa', year: 2026, month: 11, amount: 80, paid_at: '2026-11-12', bank_id: 'nubank' }];
  it('adds entries and transfers and subtracts paid invoices, ignoring pending and card purchases', () => {
    expect(bankBalance(bank, txs, transfers, payments)).toBe(1000 + 5000 - 1200 - 500 - 80);
    expect(bankBalance(other, txs, transfers, payments)).toBe(500);
    expect(bankBalance(bank, txs, transfers, payments, '2026-11-05')).toBe(6000);
    expect(netWorth([bank, other], txs, transfers, payments)).toBe(4720);
  });
});

describe('the month', () => {
  const rent: RecurringTemplate = { id: 'rent', description: 'Aluguel', type: 'expense', amount: 1800, category: 'Moradia', payment_method: 'pix',
    bank_id: 'nubank', card_id: null, recurrence_days: [10], start_date: '2026-01-01', is_active: true, deleted_at: null };
  const salary: RecurringTemplate = { ...rent, id: 'sal', description: 'Salário', type: 'income', amount: 6000, recurrence_days: [5] };
  const txs = [
    tx({ type: 'income', amount: 6000, date: '2026-11-05', recurring_template_id: 'sal', category: 'Salário' }),
    tx({ amount: 250.5, date: '2026-11-02', category: 'Mercado' }),
    tx({ amount: 49.5, date: '2026-11-02', category: 'Lazer' }),
    tx({ amount: 100, date: '2026-11-20', category: 'Mercado', is_pending: true }),
    tx({ amount: 300, date: '2026-11-15', installment_purchase_id: 'ip', category: 'Compras' }),
    tx({ amount: 999, date: '2026-10-30', category: 'Mercado' }),
  ];
  const occ = recurringInMonth([rent, salary], txs, [], 2026, 11);
  it('sums received, expected, spent and the leftover', () => {
    expect(monthSummary(txs, occ, 2026, 11)).toEqual({
      received: 6000, toReceive: 0, spent: 600, toSpend: 1900, income: 6000, expense: 2500, leftover: 3500, variable: 400,
    });
  });
  it('builds the day-by-day series and the category ranking', () => {
    const d = dailyExpenses(txs, 2026, 11);
    expect(d).toHaveLength(30);
    expect(d[1].amount).toBe(300);
    expect(byCategory(txs, 'expense', 2026, 11)).toEqual([
      { category: 'Mercado', amount: 350.5 }, { category: 'Compras', amount: 300 }, { category: 'Lazer', amount: 49.5 },
    ]);
    expect(byCategory(txs, 'expense', 2026, 11, true).map((c) => c.category)).toEqual(['Mercado', 'Lazer']);
  });
  it('projects variable spending to the end of the month', () => {
    expect(variableProjection(400, 2026, 11, '2026-11-10')).toEqual({ perDay: 40, projected: 1200 });
    expect(variableProjection(400, 2026, 10, '2026-11-10')).toEqual({ perDay: 12.9, projected: 400 });
    expect(variableProjection(400, 2026, 12, '2026-11-10')).toEqual({ perDay: 0, projected: 0 });
  });
  it('gives the flow and leftover rate month by month', () => {
    const flow = monthlyFlow(txs, 2026, 11, 2);
    expect(flow.map((f) => [f.key, f.income, f.expense, f.rate])).toEqual([['2026-10', 0, 999, null], ['2026-11', 6000, 700, 88.3]]);
    expect(averageLeftoverRate(flow)).toBe(88.3);
  });
});
