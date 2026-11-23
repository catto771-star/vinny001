// What the home screen shows about projects and goals: only the ones in motion,
// the most behind first, a few at a time. Progress and pace come from the same
// rules as the Projetos and Metas screens, so the numbers always agree.
import { diffDays, projectHealth, type Health, type Project } from './projects';
import { goalCurrency, goalPace, goalProgress, targetOf, type Goal, type Pace } from './goals';
import { num, plural } from './format';
import { formatIn } from './money';
import type { Day } from './dates';

const short = (day: Day) => `${Number(day.slice(8))}/${day.slice(5, 7)}`;

export interface ProjectRow { id: string; name: string; color: string; pct: number; health: Health; dueText: string | null; daysLeft: number | null }
export interface GoalRow { id: string; title: string; pct: number; pace: Pace; valueText: string; dueText: string | null; daysLeft: number | null }

const HEALTH_ORDER: Health[] = ['late', 'risk', 'ok', 'open', 'done'];
const PACE_ORDER: Pace[] = ['late', 'behind', 'on', 'open', 'ahead', 'done'];

/** Active and planning projects; the ones needing attention first, then by nearest due date. */
export function projectRows(projects: Project[], pctOf: (p: Project) => number, today: Day, limit = 3): { rows: ProjectRow[]; more: number } {
  const all = projects
    .filter((p) => (p.status === 'active' || p.status === 'planning') && !p.is_template && !p.archived_at)
    .map((p): ProjectRow => {
      const pct = pctOf(p);
      return {
        id: p.id, name: p.name, color: p.color, pct, health: projectHealth(p, pct, today).health,
        dueText: p.due_date ? short(p.due_date) : null, daysLeft: p.due_date ? diffDays(today, p.due_date) : null,
      };
    })
    .sort((a, b) => HEALTH_ORDER.indexOf(a.health) - HEALTH_ORDER.indexOf(b.health) || (a.daysLeft ?? 1e9) - (b.daysLeft ?? 1e9));
  return { rows: all.slice(0, limit), more: Math.max(0, all.length - limit) };
}

/** A goal's value next to its target, in the goal's own unit; empty for a project goal, whose percentage already says it. */
function valueText(goal: Goal, current: number): string {
  if (goal.goal_type === 'project') return ''; // the percentage says it all
  const target = targetOf(goal);
  const fmt = (n: number) => goal.goal_type === 'financial' ? formatIn(n, goalCurrency(goal))
    : goal.goal_type === 'project' ? `${Math.round(n)}%`
      : goal.goal_type === 'habit' ? num(n, 0)
        : num(n);
  const unit = goal.goal_type === 'habit' ? plural(target ?? current, 'vez', 'vezes') : goal.goal_type === 'custom' ? goal.unit : '';
  if (target == null) return `${fmt(current)}${unit ? ` ${unit}` : ''}`;
  return `${fmt(current)} de ${fmt(target)}${unit ? ` ${unit}` : ''}`;
}

/** Active goals; the ones behind pace first. */
export function goalRows(goals: Goal[], valueOf: (g: Goal) => number, today: Day, limit = 3): { rows: GoalRow[]; more: number } {
  const all = goals
    .filter((g) => g.status === 'active')
    .map((g): GoalRow => {
      const current = valueOf(g);
      return {
        id: g.id, title: g.title, pct: Math.round(goalProgress(g, current) * 100), pace: goalPace(g, current, today).pace,
        valueText: valueText(g, current), dueText: g.target_date ? short(g.target_date) : null,
        daysLeft: g.target_date ? diffDays(today, g.target_date) : null,
      };
    })
    .sort((a, b) => PACE_ORDER.indexOf(a.pace) - PACE_ORDER.indexOf(b.pace) || (a.daysLeft ?? 1e9) - (b.daysLeft ?? 1e9));
  return { rows: all.slice(0, limit), more: Math.max(0, all.length - limit) };
}

/**
 * Computes the next value for a 1-tap habit toggle/increment on the Home card:
 * boolean toggles 0 <-> 1, quantity/duration advances by step (or resets to 0
 * once already at/above target), and measurable toggles 0 <-> target.
 */
export function nextHabitQuickValue(
  habit: { habit_type: 'boolean' | 'quantity' | 'duration' | 'measurable'; target_value: number | null },
  currentValue: number,
): number {
  const target = habit.target_value ?? 1;
  if (habit.habit_type === 'boolean') return currentValue > 0 ? 0 : 1;
  if (habit.habit_type === 'measurable') return currentValue >= target ? 0 : target;
  if (currentValue >= target) return 0;
  const step = habit.habit_type === 'duration' && target >= 30 ? 5 : 1;
  return Math.min(target, currentValue + step);
}

