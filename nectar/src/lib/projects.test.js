import { describe, expect, it } from 'vitest';
import { burnup, columnOf, diffDays, fromTemplate, kanban, moveTo, nextStep, projectBudgetSummary, projectHealth, projectProgress, projectUpcomingPlan, toTemplate, trajectory, } from './projects';
const task = (over) => ({
    id: 't', title: 'T', description: null, status: 'pending', completed: false, completed_at: null, priority: 'medium',
    due_date: null, due_all_day: false, tags: [], is_archived: false, created_at: '2026-11-01T12:00:00Z', ...over,
});
const step = (over) => ({
    id: 's', project_id: 'p', title: 'S', description: null, due_date: null, completed: false, completed_at: null, order_index: 0, offset_days: null, ...over,
});
const tx = (over) => ({
    id: 'tx', description: 'Gasto', type: 'expense', amount: 100, date: '2026-11-10', category: 'Compras',
    payment_method: 'pix', bank_id: null, card_id: null, is_pending: false, installment_purchase_id: null,
    installment_number: null, recurring_template_id: null, project_id: 'p1', ...over,
});
const TODAY = '2026-11-18';
describe('board', () => {
    it('puts a completed task in Feito whatever its status', () => {
        expect(columnOf({ status: 'in_progress', completed: true })).toBe('completed');
        expect(columnOf({ status: 'in_progress', completed: false })).toBe('in_progress');
        expect(columnOf({ status: 'completed', completed: false })).toBe('pending');
    });
    it('writes status and completion together when a task moves', () => {
        const now = new Date('2026-11-18T10:00:00Z');
        expect(moveTo('completed', now)).toEqual({ status: 'completed', completed: true, completed_at: '2026-11-18T10:00:00.000Z' });
        expect(moveTo('in_progress', now)).toEqual({ status: 'in_progress', completed: false, completed_at: null });
    });
    it('groups tasks by column, high priority first, latest done first', () => {
        const b = kanban([
            task({ id: 'a', priority: 'low' }), task({ id: 'b', priority: 'high' }), task({ id: 'c', status: 'in_progress' }),
            task({ id: 'd', completed: true, completed_at: '2026-11-10T00:00:00Z' }), task({ id: 'e', completed: true, completed_at: '2026-11-12T00:00:00Z' }),
            task({ id: 'x', is_archived: true }),
        ]);
        expect(b.pending.map((t) => t.id)).toEqual(['b', 'a']);
        expect(b.in_progress.map((t) => t.id)).toEqual(['c']);
        expect(b.completed.map((t) => t.id)).toEqual(['e', 'd']);
    });
});
describe('progress and health', () => {
    it('measures by tasks, then by milestones', () => {
        expect(projectProgress([task({ completed: true }), task({}), task({}), task({ completed: true })], [])).toMatchObject({ pct: 50, by: 'tasks' });
        expect(projectProgress([], [step({ completed: true }), step({}), step({})])).toMatchObject({ done: 1, total: 3, pct: 33, by: 'steps' });
        expect(projectProgress([], [])).toMatchObject({ pct: 0, by: null });
    });
    it('flags late and at-risk projects against the time gone by', () => {
        const p = { status: 'active', start_date: '2026-11-01', due_date: '2026-12-01' };
        // 17 of 30 days gone: 57% expected.
        expect(projectHealth(p, 50, TODAY)).toEqual({ health: 'ok', expected: 57 });
        expect(projectHealth(p, 30, TODAY)).toEqual({ health: 'risk', expected: 57 });
        expect(projectHealth({ ...p, due_date: '2026-11-10' }, 90, TODAY).health).toBe('late');
        expect(projectHealth({ ...p, due_date: null }, 10, TODAY).health).toBe('open');
        expect(projectHealth({ ...p, status: 'completed' }, 10, TODAY).health).toBe('done');
    });
    it('finds the next milestone in order', () => {
        expect(nextStep([step({ id: '2', order_index: 2 }), step({ id: '0', order_index: 0, completed: true }), step({ id: '1', order_index: 1 })])?.id).toBe('1');
        expect(nextStep([step({ completed: true })])).toBeNull();
    });
});
describe('history', () => {
    it('builds a weekly burn-up of scope and done', () => {
        const b = burnup([
            task({ created_at: '2026-11-02T12:00:00Z', completed: true, completed_at: '2026-11-10T12:00:00Z' }),
            task({ created_at: '2026-11-09T12:00:00Z' }),
            task({ created_at: '2026-11-16T12:00:00Z', completed: true, completed_at: '2026-11-17T12:00:00Z' }),
        ], TODAY, 3);
        expect(b).toEqual([
            { week: '2026-11-01', scope: 1, done: 0 },
            { week: '2026-11-08', scope: 2, done: 1 },
            { week: '2026-11-15', scope: 3, done: 2 },
        ]);
    });
    it('lists what happened, newest first', () => {
        const t = trajectory({ created_at: '', start_date: '2026-11-01', name: 'Casa' }, [task({ title: 'Orçar', completed: true, completed_at: '2026-11-05T10:00:00Z' }), task({ title: 'Aberta' })], [step({ title: 'Projeto aprovado', completed: true, completed_at: '2026-11-08T10:00:00Z' })]);
        expect(t.map((e) => [e.kind, e.title])).toEqual([['step', 'Projeto aprovado'], ['task', 'Orçar'], ['start', 'Início de Casa']]);
    });
});
describe('templates', () => {
    const steps = [step({ id: 'b', title: 'Obra', order_index: 1, due_date: '2026-11-21' }), step({ id: 'a', title: 'Orçamento', order_index: 0, due_date: '2026-11-08' })];
    it('keeps milestone dates as days after the start and tasks without dates', () => {
        const t = toTemplate({ start_date: '2026-11-01' }, steps, [task({ title: 'Pedir 3 orçamentos', priority: 'high', project_step_id: 'a' }), task({ title: 'Solta' })]);
        expect(t.steps).toEqual([
            { title: 'Orçamento', description: null, order_index: 0, offset_days: 7 },
            { title: 'Obra', description: null, order_index: 1, offset_days: 20 },
        ]);
        expect(t.template_tasks).toEqual([
            { title: 'Pedir 3 orçamentos', description: null, priority: 'high', step: 0 },
            { title: 'Solta', description: null, priority: 'medium', step: null },
        ]);
    });
    it('dates a new project from the chosen start', () => {
        const tpl = [step({ title: 'Orçamento', order_index: 0, offset_days: 7 }), step({ title: 'Livre', order_index: 1 })];
        const n = fromTemplate({ template_tasks: [{ title: 'Pedir', step: 0 }, { title: 'Fora', step: 9 }] }, tpl, '2026-12-01');
        expect(n.steps.map((s) => [s.title, s.due_date])).toEqual([['Orçamento', '2026-12-08'], ['Livre', null]]);
        expect(n.tasks).toEqual([{ title: 'Pedir', description: null, priority: 'medium', step: 0 }, { title: 'Fora', description: null, priority: 'medium', step: null }]);
    });
    it('counts days between dates', () => {
        expect(diffDays('2026-11-01', '2026-11-18')).toBe(17);
        expect(diffDays('2026-10-25', '2026-11-05')).toBe(11); // across the DST-free Brazilian calendar
    });
});
describe('projectBudgetSummary', () => {
    it('sums linked expenses and income in BRL and compares against budget', () => {
        const summary = projectBudgetSummary({ id: 'p1', budget: 1000, budget_currency: 'BRL' }, [
            tx({ id: '1', amount: 300, category: 'Compras', project_id: 'p1' }),
            tx({ id: '2', amount: 450.5, category: 'Serviços', project_id: 'p1' }),
            tx({ id: '3', type: 'income', amount: 200, category: 'Reembolso', project_id: 'p1' }),
            tx({ id: '4', amount: 999, project_id: 'other' }),
        ]);
        expect(summary).toMatchObject({
            currency: 'BRL', budget: 1000, expenseBrl: 750.5, incomeBrl: 200, spent: 750.5, pct: 75, overBudget: false, txCount: 3,
        });
        expect(summary.byCategory).toEqual([
            { category: 'Serviços', amountBrl: 450.5 },
            { category: 'Compras', amountBrl: 300 },
        ]);
    });
    it('converts expenses to EUR budget and detects overrun', () => {
        const summary = projectBudgetSummary({ id: 'p1', budget: 500, budget_currency: 'EUR' }, [tx({ id: '1', amount: 3720, project_id: 'p1' })], { EUR: 6.2 });
        expect(summary).toMatchObject({ currency: 'EUR', spent: 600, pct: 120, overBudget: true });
    });
});
describe('projectUpcomingPlan', () => {
    it('groups upcoming open milestones with their prioritized open substeps and loose tasks', () => {
        const steps = [
            step({ id: 's1', title: 'Módulo 1', order_index: 0, completed: true }),
            step({ id: 's2', title: 'Módulo 2', order_index: 1, completed: false }),
            step({ id: 's3', title: 'Módulo 3', order_index: 2, completed: false }),
        ];
        const tasks = [
            task({ id: 't1', title: 'Aula 1', project_step_id: 's2', completed: true }),
            task({ id: 't2', title: 'Aula 2', project_step_id: 's2', priority: 'low' }),
            task({ id: 't3', title: 'Prova', project_step_id: 's2', status: 'in_progress', priority: 'high' }),
            task({ id: 't4', title: 'Revisão geral', project_step_id: null, priority: 'medium' }),
        ];
        const plan = projectUpcomingPlan(steps, tasks, 2, 2, 3);
        expect(plan.remainingSteps).toBe(2);
        expect(plan.remainingTasks).toBe(3);
        expect(plan.nextSteps.map((x) => x.step.title)).toEqual(['Módulo 2', 'Módulo 3']);
        expect(plan.nextSteps[0].substeps.map((t) => t.title)).toEqual(['Prova', 'Aula 2']);
        expect(plan.nextSteps[0]).toMatchObject({ doneSubsteps: 1, totalSubsteps: 3 });
        expect(plan.looseSubsteps.map((t) => t.title)).toEqual(['Revisão geral']);
    });
});
