import { describe, expect, it } from 'vitest';
import { buildReview, formatReviewDiary } from './review';
const NOW = new Date(2026, 10, 22, 18, 0); // Sun 22 Nov 2026, 18:00
const task = (over) => ({
    id: 't', title: 'Tarefa', description: null, status: 'pending', completed: false, completed_at: null,
    priority: 'medium', due_date: null, due_all_day: true, tags: [], is_archived: false, created_at: '2026-11-01', ...over,
});
const project = (over) => ({
    id: 'p', name: 'Projeto', description: null, status: 'active', priority: 'medium', due_date: null,
    start_date: '2026-11-01', color: '#f25000', is_template: false, template_tasks: [], archived_at: null, created_at: '2026-11-01', ...over,
});
const goal = (over) => ({
    id: 'g', title: 'Meta', description: null, goal_type: 'custom', status: 'active', unit: '%', start_value: 0,
    target_value: 100, measure: 'sum', start_date: '2026-11-01', target_date: '2026-11-30',
    linked_habit_id: null, linked_project_id: null, linked_bank_id: null, created_at: '2026-11-01', ...over,
});
describe('guided review', () => {
    it('collects overdue items, projects needing attention, behind goals, and 7-day bills', () => {
        const summary = buildReview('weekly', {
            tasks: [
                task({ id: 'late', title: 'Atrasada', due_date: new Date(2026, 10, 20, 12).toISOString() }),
                task({ id: 'today', title: 'Plantão', due_date: new Date(2026, 10, 22, 19).toISOString(), due_all_day: false }),
            ],
            reminders: [
                { id: 'r1', title: 'Remédio', datetime: new Date(2026, 10, 22, 10).toISOString(), completed: false, priority: 'medium', alarm_enabled: false, recurring_template_id: null },
            ],
            habits: [
                { id: 'h1', name: 'Ler', description: null, habit_type: 'boolean', unit: 'x', target_value: 1, monthly_goal: 30, schedule_days: null, schedule_time: null, color: '#000', is_archived: false, created_at: '2026-11-22' },
            ],
            completions: [{ id: 'c1', habit_id: 'h1', completed_date: '2026-11-22', value: 1 }],
            projects: [project({ id: 'p1', name: 'Sem tarefas' })],
            tasksOf: () => [],
            stepsOf: () => [],
            goals: [goal({ id: 'g1', title: 'Meta atrasada' })],
            goalValueOf: () => 5,
            upcomingBills: [
                { date: '2026-11-25', label: 'Aluguel', amount: 800 },
                { date: '2026-12-10', label: 'Longe', amount: 500 },
            ],
        }, NOW);
        expect(summary.overdueTasks.map((t) => t.id)).toEqual(['late']);
        expect(summary.todayTasks.map((t) => t.id)).toEqual(['today']);
        expect(summary.overdueReminders).toHaveLength(1);
        expect(summary.habitsDoneToday).toBe(1);
        expect(summary.habitsTotalToday).toBe(1);
        expect(summary.projectsNeedingAttention[0].reason).toBe('Sem tarefas nem marcos');
        expect(summary.goalsBehind[0].paceLabel).toBe('Atrasada');
        expect(summary.billsNext7Days).toHaveLength(1);
        expect(summary.billsTotal).toBe(800);
        const note = formatReviewDiary(summary, 'Fechar módulo QQI', 'Semana produtiva.');
        expect(note.title).toBe('Revisão semanal');
        expect(note.content).toContain('Foco definido: Fechar módulo QQI');
        expect(note.content).toContain('Semana produtiva.');
    });
});
