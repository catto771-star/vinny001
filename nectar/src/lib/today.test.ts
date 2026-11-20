import { describe, expect, it } from 'vitest';
import { dayHeadline, greeting } from './today';

describe('the day in one sentence', () => {
  it('lists what is left, in plain Portuguese', () => {
    expect(dayHeadline({ tasksLeft: 3, habitsLeft: 2, kcalLeft: 1471 })).toBe('3 tarefas, 2 hábitos e 1.471 kcal pela frente.');
    expect(dayHeadline({ tasksLeft: 1, habitsLeft: 0, kcalLeft: 300 })).toBe('1 tarefa e 300 kcal pela frente.');
    expect(dayHeadline({ tasksLeft: 0, habitsLeft: 1, kcalLeft: null })).toBe('1 hábito pela frente.');
  });
  it('says so when the day is done', () => {
    expect(dayHeadline({ tasksLeft: 0, habitsLeft: 0, kcalLeft: 0 })).toBe('Tudo em dia por hoje.');
    expect(dayHeadline({ tasksLeft: 0, habitsLeft: 0, kcalLeft: -120 })).toBe('Tudo em dia por hoje.');
  });
  it('greets by the time of day', () => {
    expect([5, 11, 12, 17, 18, 23, 2].map(greeting)).toEqual(['Bom dia', 'Bom dia', 'Boa tarde', 'Boa tarde', 'Boa noite', 'Boa noite', 'Boa noite']);
  });
});
