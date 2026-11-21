import { describe, expect, it } from 'vitest';
import { goalRows, projectRows } from './homeProgress';
import type { Goal } from './goals';
import type { Project } from './projects';

const TODAY = '2026-11-21';
const project = (over: Partial<Project>): Project => ({
  id: 'p', name: 'Projeto', description: null, status: 'active', priority: 'medium', due_date: null,
  start_date: '2026-11-01', color: '#ea580c', is_template: false, template_tasks: [], archived_at: null, created_at: '2026-11-01', ...over,
});
const goal = (over: Partial<Goal>): Goal => ({
  id: 'g', title: 'Meta', description: null, goal_type: 'custom', status: 'active', unit: 'kg', start_value: 0, target_value: 100,
  measure: 'sum', start_date: '2026-11-01', target_date: null, linked_habit_id: null, linked_project_id: null, linked_bank_id: null, created_at: '2026-11-01', ...over,
});

describe('projects on the home screen', () => {
  const pct = (map: Record<string, number>) => (p: Project) => map[p.id] ?? 0;

  it('shows only live projects, the most behind first', () => {
    const { rows } = projectRows([
      project({ id: 'ok', name: 'No ritmo', due_date: '2026-12-31' }),
      project({ id: 'late', name: 'Atrasado', due_date: '2026-11-10' }),
      project({ id: 'done', name: 'Feito', status: 'completed' }),
      project({ id: 'paused', name: 'Pausado', status: 'paused' }),
      project({ id: 'risk', name: 'Em risco', start_date: '2026-10-01', due_date: '2026-12-01' }),
    ], pct({ ok: 30, late: 40, risk: 10 }), TODAY);
    expect(rows.map((r) => r.name)).toEqual(['Atrasado', 'Em risco', 'No ritmo']);
    expect(rows.map((r) => r.health)).toEqual(['late', 'risk', 'ok']);
  });
  it('carries the progress and the due date to show', () => {
    const { rows: [r] } = projectRows([project({ id: 'a', name: 'Reforma', due_date: '2026-12-14' })], pct({ a: 33 }), TODAY);
    expect(r).toMatchObject({ id: 'a', name: 'Reforma', pct: 33, dueText: '14/12', daysLeft: 23 });
  });
  it('keeps the list short and reports how many were left out', () => {
    const many = Array.from({ length: 6 }, (_, i) => project({ id: `p${i}`, name: `P${i}`, due_date: `2026-12-${10 + i}` }));
    const { rows, more } = projectRows(many, () => 0, TODAY, 3);
    expect(rows).toHaveLength(3);
    expect(more).toBe(3);
  });
});

describe('goals on the home screen', () => {
  it('shows only active goals, the most behind first', () => {
    const { rows } = goalRows([
      goal({ id: 'ahead', title: 'Adiantada', target_date: '2026-12-31', start_date: '2026-11-01' }),
      goal({ id: 'behind', title: 'Atrasada', target_date: '2026-11-30', start_date: '2026-11-01' }),
      goal({ id: 'done', title: 'Pausada', status: 'paused' }),
      goal({ id: 'open', title: 'Sem prazo' }),
    ], (g) => ({ ahead: 80, behind: 5 }[g.id] ?? 10), TODAY);
    expect(rows.map((r) => r.title)).toEqual(['Atrasada', 'Sem prazo', 'Adiantada']);
    expect(rows.map((r) => r.pace)).toEqual(['behind', 'open', 'ahead']);
  });
  it('states progress as a share of the target and a readable value', () => {
    const { rows: [r] } = goalRows([goal({ id: 'a', title: 'Ler 12 livros', unit: 'livros', target_value: 12, goal_type: 'custom' })], () => 9, TODAY);
    expect(r).toMatchObject({ pct: 75, valueText: '9 de 12 livros' });
    const { rows: [m] } = goalRows([goal({ id: 'b', title: 'Reserva', goal_type: 'financial', target_value: 30000, linked_bank_id: 'x' })], () => 20500, TODAY);
    expect(m.valueText.replace(/\s/g, ' ')).toBe('R$ 20.500,00 de R$ 30.000,00');
    const { rows: [p] } = goalRows([goal({ id: 'c', title: 'Casa pronta', goal_type: 'project', linked_project_id: 'p' })], () => 33, TODAY);
    expect(p).toMatchObject({ pct: 33, valueText: '' }); // the percentage already says it
  });
});
