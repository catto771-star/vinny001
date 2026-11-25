import { useMemo } from 'react';
import { useTable } from '../../lib/useTable';
/** Everything the finance screens read, loaded once and shared by the tabs. */
export function useFinance() {
    const banks = useTable('banks', '*', { column: 'created_at' });
    const cards = useTable('cards', '*', { column: 'created_at' });
    const txs = useTable('transactions', '*', { column: 'date', ascending: false });
    const transfers = useTable('transfers', '*', { column: 'date', ascending: false });
    const payments = useTable('card_invoice_payments');
    const templates = useTable('transaction_recurring_templates', '*', { column: 'created_at' });
    const skips = useTable('transaction_recurring_skips');
    const purchases = useTable('installment_purchases', '*', { column: 'first_installment_date', ascending: false });
    const budgets = useTable('category_budgets', '*', { column: 'category' });
    const projects = useTable('projects', 'id,name,is_template,archived_at', { column: 'name' });
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
