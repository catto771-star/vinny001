import { describe, expect, it } from 'vitest';
import { DEFAULT_PREFS, dueNotes, zonedToUtc, type UserData } from './lib';

const TZ = 'America/Sao_Paulo';
// Wednesday 18 Nov 2026, 08:02 in São Paulo (11:02 UTC).
const NOW = new Date('2026-11-18T11:02:00Z');
const at = (local: string) => zonedToUtc(local.slice(0, 10), local.slice(11, 16), TZ).toISOString();

const data = (over: Partial<UserData> = {}): UserData => ({
  tz: TZ, prefs: DEFAULT_PREFS, reminderAdvance: [15], taskAdvance: [30], digestTime: '08:00',
  reminders: [], tasks: [], habitsToday: [], bills: [], runs: [], ...over,
});

describe('reminders', () => {
  it('fires at the time and with the chosen advance, once each', () => {
    const r = { id: 'r1', title: 'Vitamina D', datetime: at('2026-11-18 08:15'), completed: false };
    expect(dueNotes(data({ reminders: [r] }), NOW, new Set())).toEqual([
      { key: 'r:r1:15', title: 'Em 15 min: Vitamina D', body: 'Às 08:15', url: '/lembretes' },
    ]);
    expect(dueNotes(data({ reminders: [r] }), NOW, new Set(['r:r1:15']))).toEqual([]);
    const now = new Date('2026-11-18T11:16:00Z');
    expect(dueNotes(data({ reminders: [r] }), now, new Set(['r:r1:15'])).map((n) => n.key)).toEqual(['r:r1:0']);
  });
  it('skips done reminders, old ones and the ones turned off', () => {
    const done = { id: 'r1', title: 'x', datetime: at('2026-11-18 08:00'), completed: true };
    const old = { id: 'r2', title: 'y', datetime: at('2026-11-18 06:00'), completed: false };
    expect(dueNotes(data({ reminders: [done, old] }), NOW, new Set())).toEqual([]);
    const now = { id: 'r3', title: 'z', datetime: at('2026-11-18 08:00'), completed: false };
    expect(dueNotes(data({ reminders: [now], prefs: { ...DEFAULT_PREFS, reminders: false } }), NOW, new Set())).toEqual([]);
  });
});

describe('tasks', () => {
  it('fires for tasks with a time, not for all-day ones', () => {
    const timed = { id: 't1', title: 'Reunião', due_date: at('2026-11-18 08:30'), due_all_day: false, completed: false, is_archived: false };
    const allDay = { id: 't2', title: 'Pagar IPVA', due_date: at('2026-11-18 08:00'), due_all_day: true, completed: false, is_archived: false };
    expect(dueNotes(data({ tasks: [timed, allDay], prefs: { ...DEFAULT_PREFS, digest: false } }), NOW, new Set())).toEqual([
      { key: 't:t1:30', title: 'Tarefa em 30 min', body: 'Reunião · 08:30', url: '/tarefas' },
    ]);
  });
});

describe('daily summary', () => {
  it('sums up the day at the chosen time, once a day', () => {
    const task = (id: string, local: string) => ({ id, title: id, due_date: at(local), due_all_day: true, completed: false, is_archived: false });
    const d = data({
      tasks: [task('a', '2026-11-18 23:59'), task('b', '2026-11-18 23:59'), task('c', '2026-11-16 23:59')],
      habitsToday: ['Ler'], bills: [{ description: 'Luz', amount: 1234.5 }],
    });
    expect(dueNotes(d, NOW, new Set())).toEqual([
      { key: 'd:2026-11-18', title: 'Seu dia', body: '2 tarefas para hoje (1 atrasada) · 1 hábito · contas: Luz R$ 1.234,50', url: '/inicio' },
    ]);
    expect(dueNotes(d, NOW, new Set(['d:2026-11-18']))).toEqual([]);
    expect(dueNotes(d, new Date('2026-11-18T13:00:00Z'), new Set())).toEqual([]); // 10:00, too late for 08:00
  });
  it('says nothing on an empty day', () => {
    expect(dueNotes(data(), NOW, new Set())).toEqual([]);
  });
});

describe('autopilot', () => {
  it('tells recent answers and failures, not old ones', () => {
    const runs = [
      { id: 'a1', title: 'Planejar a semana', status: 'ok', output: 'Segunda:\n  academia e mercado', ran_at: '2026-11-18T10:50:00Z' },
      { id: 'a2', title: 'Revisão', status: 'error', output: 'Modelos ocupados', ran_at: '2026-11-18T10:00:00Z' },
      { id: 'a3', title: 'Antiga', status: 'ok', output: 'x', ran_at: '2026-11-17T10:00:00Z' },
      { id: 'a4', title: 'Na fila', status: 'waiting_ai', output: '', ran_at: '2026-11-18T11:00:00Z' },
    ];
    expect(dueNotes(data({ runs }), NOW, new Set())).toEqual([
      { key: 'a:a1', title: 'Piloto automático: Planejar a semana', body: 'Segunda: academia e mercado', url: '/assistente' },
      { key: 'a:a2', title: 'Piloto automático falhou: Revisão', body: 'Modelos ocupados', url: '/assistente' },
    ]);
  });
});
