import { describe, expect, it } from 'vitest';
import { brl, change, num, plural } from './format';
import { resolveTheme } from './theme';

describe('number format', () => {
  it('uses the Brazilian separators everywhere', () => {
    expect(num(1980)).toBe('1.980');
    expect(num(82.5)).toBe('82,5');
    expect(num(2787)).toBe('2.787');
    expect(num(0.333, 2)).toBe('0,33');
    expect(num(null)).toBe('—');
  });
  it('formats money in reais', () => {
    expect(brl(1234.5).replace(/\s/g, ' ')).toBe('R$ 1.234,50');
  });
  it('says what a change compares to', () => {
    expect(change(112, 100, 'semana passada')).toBe('+12% vs semana passada');
    expect(change(90, 100, 'semana passada')).toBe('−10% vs semana passada');
    expect(change(5, 0, 'semana passada')).toBeNull();
  });
});

describe('theme', () => {
  it('defaults to dark and keeps a saved choice', () => {
    expect(resolveTheme(null)).toBe('dark');
    expect(resolveTheme('light')).toBe('light');
    expect(resolveTheme('purple')).toBe('dark');
  });
});

describe('plural', () => {
  it('uses the singular only for exactly one', () => {
    expect([0, 1, 2].map((n) => plural(n, 'dia', 'dias'))).toEqual(['dias', 'dia', 'dias']);
    expect(plural(1, 'vez', 'vezes')).toBe('vez');
  });
});
