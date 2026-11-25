import { describe, expect, it } from 'vitest';
import { evaluateBudgets, monthElapsedShare, projectCashFlow } from './cashflow';
const tpl = (over) => ({
    id: 'r1', description: 'Aluguel', type: 'expense', amount: 1500, category: 'Moradia', payment_method: 'pix',
    bank_id: 'b1', card_id: null, start_date: '2026-01-01', is_active: true, deleted_at: null,
    recurrence_days: [10], frequency: 'monthly', currency: 'BRL', original_amount: null, fx_rate: null, ...over,
});
const tx = (over) => ({
    id: 't1', description: 'Compra', type: 'expense', amount: 100, date: '2026-11-15', category: 'Mercado',
    payment_method: 'pix', bank_id: 'b1', card_id: null, is_pending: false,
    installment_purchase_id: null, installment_number: null, recurring_template_id: null, ...over,
});
describe('projectCashFlow', () => {
    it('projects balance over 30 days combining recurring templates, pending txs and unpaid card invoices', () => {
        const card = { id: 'c1', name: 'Nubank', bank_id: 'b1', card_type: 'credit', credit_limit: 5000, closing_day: 5, due_day: 12 };
        const result = projectCashFlow({
            startDay: '2026-11-01',
            days: 30,
            startingBalance: 2000,
            templates: [
                tpl({ id: 'sal', description: 'Salário', type: 'income', amount: 4000, recurrence_days: [5] }),
                tpl({ id: 'rent', description: 'Aluguel', type: 'expense', amount: 1800, recurrence_days: [10] }),
            ],
            txs: [
                tx({ id: 'pend1', description: 'Freelance pendente', type: 'income', amount: 500, date: '2026-11-20', is_pending: true }),
                tx({ id: 'card1', description: 'Jantar', type: 'expense', amount: 300, date: '2026-11-02', payment_method: 'credito', bank_id: null, card_id: 'c1' }),
            ],
            skips: [],
            cards: [card],
            payments: [],
        });
        // 2000 + 4000 (Nov 5) - 1800 (Nov 10) - 300 (Nov 12 invoice) + 500 (Nov 20) = 4400
        expect(result.startingBalance).toBe(2000);
        expect(result.totalIn).toBe(4500);
        expect(result.totalOut).toBe(2100);
        expect(result.endingBalance).toBe(4400);
        expect(result.netChange).toBe(2400);
        expect(result.negativeDays).toBe(0);
        expect(result.events.map((e) => [e.day, e.kind, e.amount])).toEqual([
            ['2026-11-05', 'recurring', 4000],
            ['2026-11-10', 'recurring', -1800],
            ['2026-11-12', 'invoice', -300],
            ['2026-11-20', 'pending', 500],
        ]);
    });
    it('tracks lowest balance and negative days across 60/90-day horizons', () => {
        const result = projectCashFlow({
            startDay: '2026-11-01',
            days: 60,
            startingBalance: 1000,
            templates: [
                tpl({ id: 'rent', description: 'Aluguel', type: 'expense', amount: 1500, recurrence_days: [5] }),
                tpl({ id: 'sal', description: 'Salário', type: 'income', amount: 3000, recurrence_days: [15] }),
            ],
            txs: [],
            skips: [{ recurring_template_id: 'rent', skipped_date: '2026-12-05' }],
            cards: [],
            payments: [],
        });
        // Nov 5: 1000 - 1500 = -500 (negative from Nov 5 to Nov 14 = 10 days)
        // Nov 15: -500 + 3000 = 2500
        // Dec 5: skipped!
        // Dec 15: 2500 + 3000 = 5500
        expect(result.minBalance).toBe(-500);
        expect(result.minBalanceDay).toBe('2026-11-05');
        expect(result.negativeDays).toBe(10);
        expect(result.endingBalance).toBe(5500);
    });
});
describe('evaluateBudgets', () => {
    it('computes month elapsed share for past, current, and future months', () => {
        expect(monthElapsedShare(2026, 10, '2026-11-15')).toBe(1);
        expect(monthElapsedShare(2026, 11, '2026-11-15')).toBe(0.5); // 15/30
        expect(monthElapsedShare(2026, 12, '2026-11-15')).toBe(0);
    });
    it('evaluates ok, warn (pace or >=80%), and over statuses and converts EUR budgets', () => {
        const rows = evaluateBudgets([
            { id: 'b1', category: 'Mercado', monthly_limit: 1000, currency: 'BRL' },
            { id: 'b2', category: 'Alimentação', monthly_limit: 500, currency: 'BRL' },
            { id: 'b3', category: 'Transporte', monthly_limit: 100, currency: 'EUR' },
        ], [
            tx({ id: '1', category: 'Mercado', amount: 1200, date: '2026-11-10' }),
            tx({ id: '2', category: 'Alimentação', amount: 360, date: '2026-11-12' }), // 72% on day 15 (50% expected) -> +22pp ahead -> warn
            tx({ id: '3', category: 'Transporte', amount: 186, date: '2026-11-14' }), // 186 / 620 = 30% -> ok
            tx({ id: '4', category: 'Mercado', amount: 500, date: '2026-10-10' }), // previous month ignored
            tx({ id: '5', type: 'income', category: 'Mercado', amount: 900, date: '2026-11-14' }), // income ignored
        ], 2026, 11, '2026-11-15', { EUR: 6.2 });
        expect(rows.map((r) => [r.budget.category, r.pct, r.status])).toEqual([
            ['Mercado', 120, 'over'],
            ['Alimentação', 72, 'warn'],
            ['Transporte', 30, 'ok'],
        ]);
        expect(rows[0].remainingBrl).toBe(-200);
        expect(rows[2].limitBrl).toBe(620);
        expect(rows[2].expectedPct).toBe(50);
    });
});
