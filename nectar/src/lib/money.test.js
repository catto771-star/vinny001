import { afterEach, describe, expect, it } from 'vitest';
import { conv, formatIn, fromBRL, money, setDisplay, toBRL } from './money';
afterEach(() => setDisplay('BRL', null));
describe('currencies', () => {
    it('formats each currency the Brazilian way', () => {
        expect(formatIn(1234.5, 'BRL')).toBe('R$ 1.234,50');
        expect(formatIn(1234.5, 'USD')).toBe('US$ 1.234,50');
        expect(formatIn(1234.5, 'EUR')).toBe('€ 1.234,50');
        expect(formatIn(null, 'USD')).toBe('—');
    });
    it('converts to reais at the rate, to the cent', () => {
        expect(toBRL(20, 5.4123)).toBe(108.25);
        expect(fromBRL(108.25, 5.4123)).toBe(20);
    });
    it('shows reais in the chosen currency', () => {
        expect(money(541.23)).toBe('R$ 541,23');
        setDisplay('USD', 5.4123);
        expect(money(541.23)).toBe('US$ 100,00');
        expect(conv(541.23)).toBe(100);
        setDisplay('EUR', null); // no rate yet: stays in reais
        expect(money(10)).toBe('R$ 10,00');
    });
});
