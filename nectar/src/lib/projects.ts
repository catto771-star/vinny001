import { addDays, parseDay, toDay, type Day } from './dates';
import { weekOf } from './calendar';
import { cents, reais, type Tx } from './finance';
import { fromBRL, type Currency } from './money';
import type { Priority, Task } from './tasks';

export type ProjectStatus = 'planning' | 'active' | 'paused' | 'completed';
export const STATUS_LABEL: Record<ProjectStatus, string> = { planning: 'Planejamento', active: 'Ativo', paused: 'Pausado', completed: 'Concluído' };

export interface Project {
  id: string;
  name: string;
  description: string | null;
  status: ProjectStatus;
  priority: Priority;
  due_date: Day | null;
  start_date: Day;
  color: string;
  budget?: number | null;
  budget_currency?: Currency | null;
  is_template: boolean;
  template_tasks: TemplateTask[];
  archived_at: string | null;
  created_at: string;
}

export interface Step {
  id: string;
  project_id: string;
  title: string;
  description: string | null;
  due_date: Day | null;
  completed: boolean;
  completed_at: string | null;
  order_index: number;
  offset_days: number | null;
}

/** A task kept inside a template; `step` is the index of its milestone, if any. */
export interface TemplateTask { title: string; description?: string | null; priority?: Priority; step?: number | null }

export type ProjectTask = Task & { project_step_id?: string | null };
export type Column = 'pending' | 'in_progress' | 'completed';
export const COLUMNS: { key: Column; label: string }[] = [
  { key: 'pending', label: 'A fazer' }, { key: 'in_progress', label: 'Fazendo' }, { key: 'completed', label: 'Feito' },
];

export function diffDays(from: Day, to: Day): number {
  return Math.round((parseDay(to).getTime() - parseDay(from).getTime()) / 86400000);
}

/** The column a task sits in: a completed task is done whatever its status says. */
export function columnOf(task: Pick<Task, 'status' | 'completed'>): Column {
  return task.completed ? 'completed' : task.status === 'in_progress' ? 'in_progress' : 'pending';
}

/** The fields to write when a task moves to a column. */
export function moveTo(column: Column, now: Date): Pick<Task, 'status' | 'completed' | 'completed_at'> {
  return column === 'completed'
    ? { status: 'completed', completed: true, completed_at: now.toISOString() }
    : { status: column, completed: false, completed_at: null };
}

/** Tasks per column; inside a column, by position (when set), then priority, then creation. */
export function kanban<T extends ProjectTask & { position?: number | null }>(tasks: T[]): Record<Column, T[]> {
  const out: Record<Column, T[]> = { pending: [], in_progress: [], completed: [] };
  const rank = { high: 0, medium: 1, low: 2 };
  for (const t of tasks.filter((x) => !x.is_archived)) out[columnOf(t)].push(t);
  for (const list of Object.values(out)) {
    list.sort((a, b) => (a.position ?? 1e9) - (b.position ?? 1e9) || rank[a.priority] - rank[b.priority] || a.created_at.localeCompare(b.created_at));
  }
  out.completed.sort((a, b) => (b.completed_at ?? '').localeCompare(a.completed_at ?? ''));
  return out;
}

/** Progress from the tasks when there are any, else from the milestones. */
export function projectProgress(tasks: ProjectTask[], steps: Step[]): { done: number; total: number; pct: number; by: 'tasks' | 'steps' | null } {
  const live = tasks.filter((t) => !t.is_archived);
  if (live.length) {
    const done = live.filter((t) => t.completed).length;
    return { done, total: live.length, pct: Math.round((done / live.length) * 100), by: 'tasks' };
  }
  if (steps.length) {
    const done = steps.filter((s) => s.completed).length;
    return { done, total: steps.length, pct: Math.round((done / steps.length) * 100), by: 'steps' };
  }
  return { done: 0, total: 0, pct: 0, by: null };
}

export type Health = 'done' | 'late' | 'risk' | 'ok' | 'open';
export const HEALTH_LABEL: Record<Health, string> = { done: 'Concluído', late: 'Atrasado', risk: 'Em risco', ok: 'No ritmo', open: 'Sem prazo' };

/**
 * Late once the due date passed; at risk when progress trails the share of
 * time already gone by more than 20 points; on pace otherwise.
 */
export function projectHealth(p: Pick<Project, 'status' | 'start_date' | 'due_date'>, pct: number, today: Day): { health: Health; expected: number | null } {
  if (p.status === 'completed' || pct >= 100) return { health: 'done', expected: null };
  if (!p.due_date) return { health: 'open', expected: null };
  if (today > p.due_date) return { health: 'late', expected: 100 };
  const span = Math.max(1, diffDays(p.start_date, p.due_date));
  const expected = Math.round((Math.min(span, Math.max(0, diffDays(p.start_date, today))) / span) * 100);
  return { health: expected - pct > 20 ? 'risk' : 'ok', expected };
}

/** The first milestone not done yet, in order. */
export function nextStep(steps: Step[]): Step | null {
  return [...steps].sort((a, b) => a.order_index - b.order_index).find((s) => !s.completed) ?? null;
}

/** Per week (Sunday first), tasks created and done so far: the burn-up chart. */
export function burnup(tasks: ProjectTask[], today: Day, weeks = 8): { week: Day; scope: number; done: number }[] {
  const live = tasks.filter((t) => !t.is_archived);
  const start = weekOf(today)[0];
  return Array.from({ length: weeks }, (_, i) => {
    const week = addDays(start, -7 * (weeks - 1 - i));
    const end = addDays(week, 6);
    return {
      week,
      scope: live.filter((t) => toDay(new Date(t.created_at)) <= end).length,
      done: live.filter((t) => t.completed && t.completed_at && toDay(new Date(t.completed_at)) <= end).length,
    };
  });
}

export interface TrailEvent { at: string; kind: 'start' | 'task' | 'step' | 'due'; title: string }

/** What happened in the project, newest first: start, tasks and milestones done. */
export function trajectory(p: Pick<Project, 'created_at' | 'start_date' | 'name'>, tasks: ProjectTask[], steps: Step[]): TrailEvent[] {
  const events: TrailEvent[] = [{ at: `${p.start_date}T00:00:00`, kind: 'start', title: `Início de ${p.name}` }];
  for (const t of tasks) if (t.completed && t.completed_at) events.push({ at: t.completed_at, kind: 'task', title: t.title });
  for (const s of steps) if (s.completed && s.completed_at) events.push({ at: s.completed_at, kind: 'step', title: s.title });
  return events.sort((a, b) => b.at.localeCompare(a.at));
}

/** A template from a project: milestone dates become days after the start, tasks are copied without dates. */
export function toTemplate(p: Pick<Project, 'start_date'>, steps: Step[], tasks: ProjectTask[]): { steps: { title: string; description: string | null; order_index: number; offset_days: number | null }[]; template_tasks: TemplateTask[] } {
  const ordered = [...steps].sort((a, b) => a.order_index - b.order_index);
  return {
    steps: ordered.map((s, i) => ({
      title: s.title, description: s.description, order_index: i,
      offset_days: s.due_date ? Math.max(0, diffDays(p.start_date, s.due_date)) : null,
    })),
    template_tasks: tasks.filter((t) => !t.is_archived).map((t) => {
      const i = ordered.findIndex((s) => s.id === t.project_step_id);
      return { title: t.title, description: t.description, priority: t.priority, step: i < 0 ? null : i };
    }),
  };
}

/** A new project's milestones and tasks from a template, dated from the chosen start. */
export function fromTemplate(template: Pick<Project, 'template_tasks'>, steps: Step[], start: Day): {
  steps: { title: string; description: string | null; order_index: number; due_date: Day | null }[];
  tasks: { title: string; description: string | null; priority: Priority; step: number | null }[];
} {
  const ordered = [...steps].sort((a, b) => a.order_index - b.order_index);
  return {
    steps: ordered.map((s, i) => ({ title: s.title, description: s.description, order_index: i, due_date: s.offset_days == null ? null : addDays(start, s.offset_days) })),
    tasks: (template.template_tasks ?? []).map((t) => ({
      title: t.title, description: t.description ?? null, priority: t.priority ?? 'medium',
      step: t.step != null && t.step < ordered.length ? t.step : null,
    })),
  };
}

export interface ProjectBudgetSummary {
  currency: Currency;
  budget: number | null;
  expenseBrl: number;
  incomeBrl: number;
  /** Total project expenses expressed in `currency` (null if non-BRL rate is unavailable). */
  spent: number | null;
  /** Percentage of budget used (0..∞), or null when no budget is set. */
  pct: number | null;
  overBudget: boolean;
  txCount: number;
  byCategory: { category: string; amountBrl: number }[];
}

/** Summarizes transactions linked to a project against its optional budget. */
export function projectBudgetSummary(
  project: Pick<Project, 'id' | 'budget' | 'budget_currency'>,
  txs: readonly Tx[],
  rates?: Partial<Record<'USD' | 'EUR', number>>,
): ProjectBudgetSummary {
  const mine = txs.filter((t) => t.project_id === project.id);
  let expenseCents = 0;
  let incomeCents = 0;
  const catCents = new Map<string, number>();

  for (const t of mine) {
    const c = cents(t.amount);
    if (t.type === 'expense') {
      expenseCents += c;
      const cat = t.category?.trim() || 'Sem categoria';
      catCents.set(cat, (catCents.get(cat) ?? 0) + c);
    } else {
      incomeCents += c;
    }
  }

  const currency: Currency = project.budget_currency ?? 'BRL';
  const expenseBrl = reais(expenseCents);
  const incomeBrl = reais(incomeCents);
  const budget = project.budget != null && Number.isFinite(Number(project.budget)) ? Number(project.budget) : null;

  let spent: number | null = expenseBrl;
  if (currency !== 'BRL') {
    const rate = rates?.[currency];
    spent = rate && rate > 0 ? fromBRL(expenseBrl, rate) : null;
  }

  const pct = budget != null && budget > 0 && spent != null ? Math.round((spent / budget) * 100) : null;
  const overBudget = budget != null && spent != null && spent > budget;
  const byCategory = [...catCents.entries()]
    .map(([category, c]) => ({ category, amountBrl: reais(c) }))
    .sort((a, b) => b.amountBrl - a.amountBrl);

  return { currency, budget, expenseBrl, incomeBrl, spent, pct, overBudget, txCount: mine.length, byCategory };
}

export interface UpcomingStepItem {
  step: Step;
  substeps: ProjectTask[];
  doneSubsteps: number;
  totalSubsteps: number;
}

export interface ProjectUpcomingPlan {
  nextSteps: UpcomingStepItem[];
  looseSubsteps: ProjectTask[];
  remainingSteps: number;
  remainingTasks: number;
}

/** Extracts the next open milestones (etapas) with their open tasks (subetapas), plus ungrouped open tasks. */
export function projectUpcomingPlan(
  steps: readonly Step[],
  tasks: readonly ProjectTask[],
  maxSteps = 2,
  maxSubstepsPerStep = 2,
  maxLoose = 3,
): ProjectUpcomingPlan {
  const rank = { high: 0, medium: 1, low: 2 };
  const sortTasks = (list: ProjectTask[]) => [...list].sort(
    (a, b) => (a.status === 'in_progress' ? -1 : 0) - (b.status === 'in_progress' ? -1 : 0)
      || rank[a.priority] - rank[b.priority]
      || a.created_at.localeCompare(b.created_at),
  );
  const liveTasks = tasks.filter((t) => !t.is_archived);
  const openTasks = liveTasks.filter((t) => !t.completed);
  const orderedOpenSteps = [...steps].sort((a, b) => a.order_index - b.order_index).filter((s) => !s.completed);
  const stepIds = new Set(steps.map((s) => s.id));

  const nextSteps: UpcomingStepItem[] = orderedOpenSteps.slice(0, maxSteps).map((s) => {
    const linked = liveTasks.filter((t) => t.project_step_id === s.id);
    const openLinked = sortTasks(linked.filter((t) => !t.completed));
    return {
      step: s,
      substeps: openLinked.slice(0, maxSubstepsPerStep),
      doneSubsteps: linked.filter((t) => t.completed).length,
      totalSubsteps: linked.length,
    };
  });

  const looseOpen = sortTasks(openTasks.filter((t) => !t.project_step_id || !stepIds.has(t.project_step_id)));
  const looseSubsteps = nextSteps.length === 0 ? looseOpen.slice(0, maxLoose) : looseOpen.slice(0, Math.max(0, maxLoose - nextSteps.length));

  return {
    nextSteps,
    looseSubsteps,
    remainingSteps: orderedOpenSteps.length,
    remainingTasks: openTasks.length,
  };
}

