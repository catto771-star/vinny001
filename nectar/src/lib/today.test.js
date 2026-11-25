import { describe, expect, it } from 'vitest';
import { calorieStatus, dayHeadline, greeting } from './today';
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
describe('calories in four lines', () => {
    it('reads like "99,4% completo", "0,6% restante", "você está em déficit"', () => {
        expect(calorieStatus(2387, 2400)).toEqual({ state: 'deficit', pct: 99.4, done: '99,4% completo', rest: '0,6% restante', verdict: 'Você está em déficit de 13 kcal' });
    });
    it('never rounds up to complete while there is still something to eat', () => {
        expect(calorieStatus(2399, 2400)).toMatchObject({ pct: 99.9, rest: '0,1% restante', verdict: 'Você está em déficit de 1 kcal' });
    });
    it('says the goal was hit', () => {
        expect(calorieStatus(2400, 2400)).toEqual({ state: 'goal', pct: 100, done: '100% completo', rest: '0% restante', verdict: 'Meta batida' });
    });
    it('turns to surplus above the goal', () => {
        expect(calorieStatus(2480, 2400)).toEqual({ state: 'surplus', pct: 103.3, done: '103,3% da meta', rest: '3,3% acima', verdict: 'Você está em superávit de 80 kcal' });
    });
    it('does not call an untouched day a deficit', () => {
        expect(calorieStatus(0, 2200)).toEqual({ state: 'empty', pct: 0, done: '0% completo', rest: '100% restante', verdict: 'Nada registrado hoje' });
    });
});
