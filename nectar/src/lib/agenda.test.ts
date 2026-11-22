import { describe, expect, it } from 'vitest';
import { monthGrid, moveToDay, weekOf } from './calendar';
import { sentence } from './dates';
import { buildAgenda, projectedRecurringTasks } from './agenda';
import type { Task } from './tasks';

const NOW = new Date(2026, 10, 18, 9, 0); // Wednesday 18 Nov 2026, 09:00

describe('calendar', () => {
  it('lays a month out in whole weeks starting on Sunday', () => {
    const g = monthGrid(2026, 11); // 1 Nov 2026 is a Sunday, 30 Nov a Monday
    expect(g).toHaveLength(5);
    expect(g[0][0]).toBe('2026-11-01');
    expect(g[4][6]).toBe('2026-12-05');
    const feb = monthGrid(2027, 2); // starts on a Monday
    expect(feb[0][0]).toBe('2027-01-31');
  });
  it('finds the week of a day', () => {
    expect(weekOf('2026-11-18')).toEqual(['2026-11-15', '2026-11-16', '2026-11-17', '2026-11-18', '2026-11-19', '2026-11-20', '2026-11-21']);
  });
  it('capitalizes only the first letter of a day title', () => {
    expect(sentence('qua, 18 de novembro')).toBe('Qua, 18 de novembro');
  });
  it('moves a date-time to another day keeping the time', () => {
    const moved = new Date(moveToDay(new Date(2026, 10, 18, 14, 30).toISOString(), '2026-11-25'));
    expect([moved.getDate(), moved.getHours(), moved.getMinutes()]).toEqual([25, 14, 30]);
  });
});

describe('agenda', () => {
  const task = (over: Partial<Task>): Task => ({ id: 't', title: 'Tarefa', description: null, status: 'pending', completed: false, completed_at: null,
    priority: 'medium', due_date: new Date(2026, 10, 18, 15).toISOString(), due_all_day: false, tags: [], is_archived: false, created_at: '', ...over });

  it('gathers items from every module, sorted by day and time', () => {
    const items = buildAgenda('2026-11-17', '2026-11-19', {
      events: [{ id: 'e', title: 'Dentista', start_at: new Date(2026, 10, 18, 14).toISOString(), end_at: new Date(2026, 10, 18, 15).toISOString(), all_day: false, location: 'Centro' }],
      tasks: [task({}), task({ id: 'late', title: 'Atrasada', due_date: new Date(2026, 10, 17, 10).toISOString() })],
      reminders: [{ id: 'r', title: 'Vitamina', datetime: new Date(2026, 10, 18, 8).toISOString(), completed: false, priority: 'medium', alarm_enabled: false, recurring_template_id: null }],
      habits: [{ id: 'h', name: 'Ler', description: null, habit_type: 'boolean', unit: 'x', target_value: 1, monthly_goal: 30, schedule_days: [3], schedule_time: '21:00', color: '#000', is_archived: false }],
      completions: [],
    }, NOW);
    expect(items.map((i) => [i.day, i.time, i.kind, i.title])).toEqual([
      ['2026-11-17', '10:00', 'task', 'Atrasada'],
      ['2026-11-18', '08:00', 'reminder', 'Vitamina'],
      ['2026-11-18', '14:00', 'event', 'Dentista'],
      ['2026-11-18', '15:00', 'task', 'Tarefa'],
      ['2026-11-18', '21:00', 'habit', 'Ler'],
    ]);
    expect(items[0].overdue).toBe(true);
    expect(items[1].overdue).toBe(true); // 08:00 reminder still open at 09:00
    expect(items[2]).toMatchObject({ endTime: '15:00', detail: 'Centro' });
  });
  it('shows a weekly habit on the days it was done and while its weekly target is open', () => {
    const gym = { id: 'g', name: 'Academia', description: null, habit_type: 'boolean' as const, unit: 'x', target_value: 1, monthly_goal: 30,
      schedule_days: null, schedule_time: null, color: '#000', is_archived: false, frequency: 'weekly' as const, times_per_week: 2 };
    const done = (d: string) => ({ id: d, habit_id: 'g', completed_date: d, value: 1 });
    const items = buildAgenda('2026-11-15', '2026-11-21', { habits: [gym], completions: [done('2026-11-16'), done('2026-11-18')] }, NOW);
    expect(items.map((i) => [i.day, i.done])).toEqual([['2026-11-15', false], ['2026-11-16', true], ['2026-11-17', false], ['2026-11-18', true]]);
  });
  it('shows planned workouts from the plan on coming days and logged ones on past days', () => {
    const items = buildAgenda('2026-11-16', '2026-11-20', {
      planSessions: [{ id: 'A', plan_id: 'p', label: 'Treino A', weekdays: [1, 4], order_index: 0, notes: null }],
      workouts: [{ date: '2026-11-16', plan_session_id: 'A', title: 'Treino A' }],
    }, NOW);
    expect(items.map((i) => [i.day, i.title, i.done])).toEqual([['2026-11-16', 'Treino A', true], ['2026-11-19', 'Treino A', false]]);
  });
  it('lists bills: recurring, pending and card invoices, with their sign', () => {
    const items = buildAgenda('2026-11-01', '2026-11-30', {
      templates: [{ id: 'rent', description: 'Aluguel', type: 'expense', amount: 1800, category: null, payment_method: 'pix', bank_id: null, card_id: null, recurrence_days: [10], start_date: '2026-01-01', is_active: true, deleted_at: null , frequency: 'monthly', currency: 'BRL', original_amount: null, fx_rate: null }],
      txs: [{ id: 'c', description: 'Jantar', type: 'expense', amount: 80, date: '2026-11-02', category: null, payment_method: 'credito', bank_id: null, card_id: 'visa', is_pending: false, installment_purchase_id: null, installment_number: null, recurring_template_id: null }],
      cards: [{ id: 'visa', name: 'Visa', bank_id: null, card_type: 'credit', credit_limit: null, closing_day: 5, due_day: 12 }],
      payments: [], skips: [],
    }, NOW);
    expect(items.map((i) => [i.day, i.title, i.amount, i.overdue])).toEqual([['2026-11-10', 'Aluguel', -1800, true], ['2026-11-12', 'Fatura Visa', -80, true]]);
  });
  it('projects recurring tasks on future days only', () => {
    const t = { id: 'x', title: 'Inbox zero', recurrence_days: [1, 3, 5], time_of_day: '09:00', start_date: '2026-01-01', end_date: null, is_active: true };
    expect(projectedRecurringTasks([t], '2026-11-16', '2026-11-22', '2026-11-18').map((p) => p.day)).toEqual(['2026-11-20']);
  });
});

describe('Google events', () => {
  it('say they come from Google Agenda', () => {
    const at = (h: number) => new Date(2026, 10, 18, h).toISOString();
    const items = buildAgenda('2026-11-18', '2026-11-18', {
      events: [
        { id: 'g', title: 'Voo', start_at: at(9), end_at: at(11), all_day: false, location: 'GRU', source: 'google' },
        { id: 'p', title: 'Dentista', start_at: at(14), end_at: null, all_day: false, location: null, source: 'manual' },
      ],
    }, new Date(2026, 10, 18, 8));
    expect(items.map((i) => i.detail)).toEqual(['GRU · Google Agenda', undefined]);
  });
});
