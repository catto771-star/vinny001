import { useMemo } from 'react';
import { useTable } from '../../lib/useTable';
import type { Bank, Card, InvoicePayment, RecurringTemplate, Skip, Transfer, Tx } from '../../lib/finance';
import type { CategoryBudget } from '../../lib/cashflow';

export interface InstallmentPurchase {
  id: string; card_id: string | null; description: string; category: string | null; total_amount: number;
  installments_count: number; first_installment_date: string; status: 'active' | 'finished' | 'cancelled';
}

/** Everything the finance screens read, loaded once and shared by the tabs. */
export function useFinance() {
  const banks = useTable<Bank>('banks', '*', { column: 'created_at' });
  const cards = useTable<Card>('cards', '*', { column: 'created_at' });
  const txs = useTable<Tx>('transactions', '*', { column: 'date', ascending: false });
  const transfers = useTable<Transfer>('transfers', '*', { column: 'date', ascending: false });
  const payments = useTable<InvoicePayment>('card_invoice_payments');
  const templates = useTable<RecurringTemplate>('transaction_recurring_templates', '*', { column: 'created_at' });
  const skips = useTable<Skip>('transaction_recurring_skips');
  const purchases = useTable<InstallmentPurchase>('installment_purchases', '*', { column: 'first_installment_date', ascending: false });
  const budgets = useTable<CategoryBudget>('category_budgets', '*', { column: 'category' });
  const projects = useTable<{ id: string; name: string; is_template: boolean; archived_at: string | null }>('projects', 'id,name,is_template,archived_at', { column: 'name' });
  const derived = useMemo(() => ({
    bankById: new Map(banks.rows.map((b) => [b.id, b])),
    cardById: new Map(cards.rows.map((c) => [c.id, c])),
    activeTemplates: templates.rows.filter((t) => !t.deleted_at),
    activeProjects: projects.rows.filter((p) => !p.is_template && !p.archived_at),
  }), [banks.rows, cards.rows, templates.rows, projects.rows]);
  const loading = banks.loading || txs.loading || cards.loading;
  const reloadMoney = () => Promise.all([txs.reload(), transfers.reload(), payments.reload()]);
  return { banks, cards, txs, transfers, payments, templates, skips, purchases, budgets, projects, loading, reloadMoney, ...derived };
}

export type Finance = ReturnType<typeof useFinance>;
