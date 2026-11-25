import { describe, expect, it } from 'vitest';
import { addDays, daysInMonth, formatDay, formatTime, greeting, monthDays, monthName, parseDay, sentence, toDay, weekday, weekdayShort } from './dates';
describe('dates utilities', () => {
    it('converts between Date and YYYY-MM-DD cleanly without UTC drift', () => {
        const d = parseDay('2026-11-22');
        expect(toDay(d)).toBe('2026-11-22');
        expect(weekday('2026-11-22')).toBe(0);
        expect(weekdayShort(0)).toBe('dom');
        expect(weekdayShort(6)).toBe('sáb');
    });
    it('adds days and calculates month lengths including leap years', () => {
        expect(addDays('2026-11-30', 1)).toBe('2026-12-01');
        expect(addDays('2026-01-01', -1)).toBe('2025-12-31');
        expect(daysInMonth(2026, 2)).toBe(28);
        expect(daysInMonth(2028, 2)).toBe(29);
        const nov = monthDays(2026, 11);
        expect(nov).toHaveLength(30);
        expect(nov[0]).toBe('2026-11-01');
        expect(nov[29]).toBe('2026-11-30');
    });
    it('formats Portuguese day names, times, greetings and sentence case', () => {
        expect(monthName(11)).toBe('novembro');
        expect(formatDay('2026-11-22')).toBe('dom, 22 de novembro');
        expect(sentence(formatDay('2026-11-22'))).toBe('Dom, 22 de novembro');
        expect(formatTime(new Date(2026, 10, 22, 7, 5).toISOString())).toBe('07:05');
        expect(greeting(new Date(2026, 10, 22, 8, 0))).toBe('Bom dia');
        expect(greeting(new Date(2026, 10, 22, 14, 0))).toBe('Boa tarde');
        expect(greeting(new Date(2026, 10, 22, 20, 0))).toBe('Boa noite');
    });
});
