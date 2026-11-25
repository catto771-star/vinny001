import { addDays } from './dates';
import { isDone } from './habits';
import { cents, reais } from './finance';
import { fromBRL } from './money';
import { diffDays } from './projects';
export const TYPE_LABEL = { custom: 'Pessoal', financial: 'Financeira', habit: 'Hábito', project: 'Projeto' };
/** The currency a financial goal is tracked in (defaults to BRL). */
export function goalCurrency(goal) {
    return goal.currency ?? 'BRL';
}
/** Deduplicated list of linked bank account IDs, supporting both legacy single and multi-account columns. */
export function linkedBankIdsOf(goal) {
    const list = goal.linked_bank_ids?.length ? goal.linked_bank_ids : goal.linked_bank_id ? [goal.linked_bank_id] : [];
    return [...new Set(list.filter(Boolean))];
}
/**
 * Sums the BRL balances of all accounts linked to a financial goal and converts
 * the combined total into the goal's native currency using today's exchange rates.
 */
export function sumLinkedAccountsInGoalCurrency(goal, banks, balanceBrlOf, rates) {
    const ids = linkedBankIdsOf(goal);
    if (!ids.length)
        return undefined;
    const known = new Set(banks.map((b) => b.id));
    const totalBrl = reais(ids.filter((id) => known.has(id)).reduce((sum, id) => sum + cents(balanceBrlOf(id)), 0));
    const cur = goalCurrency(goal);
    if (cur === 'BRL')
        return totalBrl;
    const rate = rates?.[cur];
    return rate && rate > 0 ? fromBRL(totalBrl, rate) : 0;
}
const mine = (goal, entries) => entries.filter((e) => e.goal_id === goal.id).sort((a, b) => a.date.localeCompare(b.date));
/** Where the goal stands now, in its own unit. */
export function currentValue(goal, src) {
    if (goal.goal_type === 'project')
        return src.projectPct ?? 0;
    if (goal.goal_type === 'habit') {
        const habit = src.habits?.find((h) => h.id === goal.linked_habit_id);
        if (!habit)
            return 0;
        return (src.completions ?? []).filter((c) => c.habit_id === habit.id && c.completed_date >= goal.start_date &&
            (!goal.target_date || c.completed_date <= goal.target_date) && isDone(habit, c)).length;
    }
    if (goal.goal_type === 'financial' && linkedBankIdsOf(goal).length > 0)
        return src.bankBalance ?? 0;
    const list = mine(goal, src.entries);
    if (goal.measure === 'last')
        return list.length ? Number(list[list.length - 1].value) : Number(goal.start_value);
    return Number(goal.start_value) + list.reduce((s, e) => s + Number(e.value), 0);
}
/** The target, with a project's fixed at 100%. */
export function targetOf(goal) {
    return goal.goal_type === 'project' ? 100 : goal.target_value == null ? null : Number(goal.target_value);
}
/**
 * Share of the way to the target (0..1). A goal that adds up counts from zero,
 * so what was already saved counts; one measured by the latest reading counts
 * from its start (which also works downward, like losing weight) unless
 * `progress_from_zero` is explicitly enabled.
 */
export function goalProgress(goal, current) {
    const target = targetOf(goal);
    if (target == null)
        return 0;
    const fromZero = goal.progress_from_zero ?? !(goal.goal_type === 'custom' && goal.measure === 'last');
    const start = fromZero ? 0 : Number(goal.start_value);
    if (target === start)
        return current === target ? 1 : 0;
    return Math.min(1, Math.max(0, (current - start) / (target - start)));
}
export const PACE_LABEL = { done: 'Batida', ahead: 'Adiantada', on: 'No ritmo', behind: 'Atrasada', late: 'Prazo vencido', open: 'Sem prazo' };
/**
 * Compares progress with the share of time gone by: ahead or behind by more
 * than 10 points. Also what is still needed per week, and when the current
 * rate would reach the target.
 */
export function goalPace(goal, current, today) {
    const progress = goalProgress(goal, current);
    const target = targetOf(goal);
    const elapsed = Math.max(0, diffDays(goal.start_date, today));
    const projected = progress > 0 && progress < 1 && elapsed > 0 ? addDays(goal.start_date, Math.ceil(elapsed / progress)) : null;
    if (goal.status === 'completed' || progress >= 1)
        return { pace: 'done', expected: null, daysLeft: null, perWeek: null, projected: null };
    if (!goal.target_date)
        return { pace: 'open', expected: null, daysLeft: null, perWeek: null, projected };
    const daysLeft = diffDays(today, goal.target_date);
    const remaining = target == null ? null : target - current;
    if (daysLeft < 0)
        return { pace: 'late', expected: 1, daysLeft, perWeek: null, projected };
    const span = Math.max(1, diffDays(goal.start_date, goal.target_date));
    const expected = Math.min(1, elapsed / span);
    const perWeek = remaining == null ? null : remaining / Math.max(1, daysLeft / 7);
    const pace = progress - expected > 0.1 ? 'ahead' : expected - progress > 0.1 ? 'behind' : 'on';
    return { pace, expected, daysLeft, perWeek, projected };
}
/** Value over time from the entries: running total for 'sum', each reading for 'last'. */
export function goalSeries(goal, entries) {
    const list = mine(goal, entries);
    const byDay = new Map();
    let total = Number(goal.start_value);
    for (const e of list) {
        total = goal.measure === 'last' ? Number(e.value) : total + Number(e.value);
        byDay.set(e.date, total);
    }
    return [...byDay].map(([date, value]) => ({ date, value }));
}
