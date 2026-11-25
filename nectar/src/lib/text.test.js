import { describe, expect, it } from 'vitest';
import { searchKey, searchWords } from './text';
describe('food search text', () => {
    it('normalizes like the seed generator', () => {
        expect(searchKey('Feijão,  Carioca')).toBe('feijao, carioca');
    });
    it('splits a query into at most five words', () => {
        expect(searchWords('  arroz   integral ')).toEqual(['arroz', 'integral']);
        expect(searchWords('a b c d e f g')).toHaveLength(5);
    });
});
