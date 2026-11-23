import { addDays, formatDay, toDay, type Day } from './dates';
import { bucketTasks, type Task } from './tasks';
import { isDone, routineFor, type Habit, type HabitCompletion } from './habits';
import { reminderPanel, type Reminder } from './reminders';
import { projectHealth, projectProgress, type Project, type Step } from './projects';
import { goalPace, type Goal } from './goals';

export type ReviewMode = 'daily' | 'weekly';

export interface ReviewSources {
  tasks: Task[];
  reminders: Reminder[];
  habits: Habit[];
  completions: HabitCompletion[];
  projects: Project[];
  tasksOf: (projectId: string) => Task[];
  stepsOf: (projectId: string) => Step[];
  goals: Goal[];
  goalValueOf: (g: Goal) => number;
  upcomingBills: { date: Day; label: string; amount: number }[];
}

export interface ReviewSummary {
  mode: ReviewMode;
  today: Day;
  overdueTasks: Task[];
  todayTasks: Task[];
  overdueReminders: Reminder[];
  todayReminders: Reminder[];
  habitsDoneToday: number;
  habitsTotalToday: number;
  weeklyHabitRate: number;
  projectsNeedingAttention: { project: Project; reason: string; pct: number }[];
  goalsBehind: { goal: Goal; paceLabel: string }[];
  billsNext7Days: { date: Day; label: string; amount: number }[];
  billsTotal: number;
}

/**
 * Aggregates everything relevant for a 3-minute Daily or Weekly Guided Review
 * from the same domain rules used across the app.
 */
export function buildReview(mode: ReviewMode, src: ReviewSources, now: Date): ReviewSummary {
  const today = toDay(now);
  const horizon = addDays(today, 7);
  const tb = bucketTasks(src.tasks, now);
  const rp = reminderPanel(src.reminders, now);

  const activeHabits = src.habits.filter((h) => !h.is_archived);
  const todayRoutine = routineFor(activeHabits, today, src.completions);
  const doneOn = (h: Habit, day: Day) =>
    isDone(h, src.completions.find((c) => c.habit_id === h.id && c.completed_date === day));
  const habitsDoneToday = todayRoutine.filter((h) => doneOn(h, today)).length;

  let weekScheduled = 0;
  let weekDone = 0;
  for (let i = 0; i < 7; i++) {
    const d = addDays(today, -i);
    const due = routineFor(activeHabits, d, src.completions);
    weekScheduled += due.length;
    weekDone += due.filter((h) => doneOn(h, d)).length;
  }

  const projectsNeedingAttention = src.projects
    .filter((p) => !p.is_template && !p.archived_at && (p.status === 'active' || p.status === 'planning'))
    .map((project) => {
      const ts = src.tasksOf(project.id);
      const st = src.stepsOf(project.id);
      const prog = projectProgress(ts, st);
      const health = projectHealth(project, prog.pct, today).health;
      const reason = health === 'late' ? 'Prazo vencido' : health === 'risk' ? 'Em risco' : ts.length === 0 && st.length === 0 ? 'Sem tarefas nem marcos' : '';
      return { project, reason, pct: prog.pct };
    })
    .filter((x) => x.reason !== '');

  const goalsBehind = src.goals
    .filter((g) => g.status === 'active')
    .map((goal) => ({ goal, pace: goalPace(goal, src.goalValueOf(goal), today).pace }))
    .filter((x) => x.pace === 'behind' || x.pace === 'late')
    .map((x) => ({ goal: x.goal, paceLabel: x.pace === 'late' ? 'Prazo vencido' : 'Atrasada' }));

  const billsNext7Days = src.upcomingBills
    .filter((b) => b.date <= horizon)
    .sort((a, b) => a.date.localeCompare(b.date));
  const billsTotal = billsNext7Days.reduce((s, b) => s + b.amount, 0);

  return {
    mode,
    today,
    overdueTasks: tb.overdue,
    todayTasks: tb.today,
    overdueReminders: rp.overdue,
    todayReminders: rp.today,
    habitsDoneToday,
    habitsTotalToday: todayRoutine.length,
    weeklyHabitRate: weekScheduled ? weekDone / weekScheduled : 0,
    projectsNeedingAttention,
    goalsBehind,
    billsNext7Days,
    billsTotal,
  };
}

/** Formats a short, readable review entry to store in the Diary when the user finishes. */
export function formatReviewDiary(summary: ReviewSummary, focus: string, reflection: string): { title: string; content: string } {
  const label = summary.mode === 'daily' ? 'Revisão diária' : 'Revisão semanal';
  const lines = [
    `${label} (${formatDay(summary.today)})`,
    `Hábitos hoje: ${summary.habitsDoneToday}/${summary.habitsTotalToday} · Últimos 7 dias: ${Math.round(summary.weeklyHabitRate * 100)}%`,
    `Pendências: ${summary.overdueTasks.length} atrasadas, ${summary.todayTasks.length} para hoje`,
  ];
  if (focus.trim()) lines.push(`Foco definido: ${focus.trim()}`);
  if (reflection.trim()) lines.push('', reflection.trim());
  return { title: label, content: lines.join('\n') };
}
