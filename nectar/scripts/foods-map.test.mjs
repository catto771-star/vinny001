import { describe, expect, it } from 'vitest';
import { cofidFood, foodsInsertSql, nutrient, parseCsv, searchKey, tacoFood, uniqueExternalIds } from './foods-map.mjs';

describe('parseCsv', () => {
  it('handles quoted commas, escaped quotes and CRLF', () => {
    expect(parseCsv('a,"b, c","d ""e"""\r\n1,2,3\n')).toEqual([['a', 'b, c', 'd "e"'], ['1', '2', '3']]);
  });
});

describe('nutrient', () => {
  it('reads trace as zero and unknown as null', () => {
    expect(nutrient('Tr')).toBe(0);
    expect(nutrient('N')).toBeNull();
    expect(nutrient('')).toBeNull();
    expect(nutrient(null)).toBeNull();
  });
  it('rounds and never returns a negative value', () => {
    expect(nutrient('2.58825')).toBe(2.6);
    expect(nutrient('123.53', 0)).toBe(124);
    expect(nutrient('-0.3')).toBe(0);
  });
});

describe('tacoFood', () => {
  it('maps a TACO row', () => {
    expect(tacoFood({ numero_alimento: '1', descricao: 'Arroz, integral, cozido', energia_kcal: '123.53', proteina_g: '2.588',
      carboidrato_g: '25.80975', lipideos_g: '1.0003', fibra_g: '2.749' }))
      .toEqual({ source: 'TACO', country: 'BR', external_id: '1', name: 'Arroz, integral, cozido', kcal: 124, protein_g: 2.6, carbs_g: 25.8, fat_g: 1, fiber_g: 2.7 });
  });
  it('skips a row without energy', () => {
    expect(tacoFood({ numero_alimento: '9', descricao: 'x', energia_kcal: '' })).toBeNull();
  });
});

describe('cofidFood', () => {
  it('maps a CoFID row and prefers AOAC fibre over NSP', () => {
    expect(cofidFood({ 'Food Code': '11-788', 'Food Name': 'Porridge oats, unfortified', 'Energy (kcal) (kcal)': 381,
      'Protein (g)': 10.9, 'Carbohydrate (g)': 70.7, 'Fat (g)': 8.1, 'AOAC fibre (g)': 9, 'NSP (g)': 6.8 }))
      .toMatchObject({ source: 'CoFID', country: 'UK', external_id: '11-788', kcal: 381, protein_g: 10.9, fiber_g: 9 });
  });
  it('falls back to NSP fibre and treats trace carbohydrate as zero', () => {
    expect(cofidFood({ 'Food Code': '13-146', 'Food Name': 'Agar', 'Energy (kcal) (kcal)': 16, 'Carbohydrate (g)': 'Tr', 'NSP (g)': 'N' }))
      .toMatchObject({ carbs_g: 0, fiber_g: null });
  });
});

describe('searchKey', () => {
  it('drops accents, case and extra spaces', () => {
    expect(searchKey('  Feijão,  carioca, COZIDO ')).toBe('feijao, carioca, cozido');
    expect(searchKey('Pão de queijo')).toBe('pao de queijo');
  });
});

describe('foodsInsertSql', () => {
  it('escapes quotes and batches inserts', () => {
    const foods = [1, 2, 3].map((i) => ({ source: 'TACO', country: 'BR', external_id: String(i), name: "Pão d'água", kcal: 1, protein_g: 0, carbs_g: 0, fat_g: 0, fiber_g: null }));
    const sql = foodsInsertSql(foods, 2);
    expect(sql).toContain("'Pão d''água', 'pao d''agua'");
    expect(sql.match(/insert into/g)).toHaveLength(2);
  });
});

describe('uniqueExternalIds', () => {
  it('keeps both foods when the source reuses a code (CoFID 13-669)', () => {
    const foods = [
      { source: 'CoFID', external_id: '13-669', name: 'Aubergine, roasted' },
      { source: 'CoFID', external_id: '13-669', name: 'Watercress, raw' },
      { source: 'TACO', external_id: '13-669', name: 'Same code, other source' },
    ];
    expect(uniqueExternalIds(foods).map((f) => f.external_id)).toEqual(['13-669', '13-669#2', '13-669']);
  });
});
