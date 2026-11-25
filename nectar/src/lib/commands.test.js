import { describe, expect, it } from 'vitest';
import { filterCommands, nextCommandIndex } from './commands';
const ITEMS = [
    { id: 'act-task', group: 'Ações', title: 'Nova tarefa rápida', action: 'capture:task' },
    { id: 'nav-fin', group: 'Ir para', title: 'Finanças', keywords: 'dinheiro gastos euro', to: '/financas' },
    { id: 'nav-hab', group: 'Ir para', title: 'Hábitos', to: '/habitos' },
    { id: 't-1', group: 'Tarefas', title: 'Plantão DS Lodge', subtitle: 'Hoje · 19:00', to: '/tarefas' },
    { id: 'p-1', group: 'Projetos', title: 'QQI Level 5 Healthcare', subtitle: 'Em andamento', to: '/projetos?p=1' },
    { id: 'n-1', group: 'Notas', title: 'Resumo de Nutrição', subtitle: 'Saúde', to: '/conhecimento' },
];
describe('command palette filtering', () => {
    it('shows quick actions and navigation by default when query is empty', () => {
        const out = filterCommands(ITEMS, '');
        expect(out.map((i) => i.id)).toEqual(['act-task', 'nav-fin', 'nav-hab']);
    });
    it('matches accents-insensitively across titles, subtitles, and keywords', () => {
        expect(filterCommands(ITEMS, 'plantao').map((i) => i.id)).toEqual(['t-1']);
        expect(filterCommands(ITEMS, 'nutricao').map((i) => i.id)).toEqual(['n-1']);
        expect(filterCommands(ITEMS, 'euro').map((i) => i.id)).toEqual(['nav-fin']);
    });
    it('ranks title prefix hits above substring or keyword matches', () => {
        const out = filterCommands([
            { id: 'sub', group: 'Notas', title: 'Notas sobre hábitos', to: '/conhecimento' },
            { id: 'pre', group: 'Ir para', title: 'Hábitos', to: '/habitos' },
        ], 'habitos');
        expect(out.map((i) => i.id)).toEqual(['pre', 'sub']);
    });
    it('navigates command index cleanly with keyboard arrows', () => {
        expect(nextCommandIndex(0, 4, 'ArrowDown')).toBe(1);
        expect(nextCommandIndex(3, 4, 'ArrowDown')).toBe(0);
        expect(nextCommandIndex(0, 4, 'ArrowUp')).toBe(3);
        expect(nextCommandIndex(2, 4, 'Home')).toBe(0);
        expect(nextCommandIndex(0, 4, 'End')).toBe(3);
        expect(nextCommandIndex(0, 0, 'ArrowDown')).toBe(-1);
    });
});
