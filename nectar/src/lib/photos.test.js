import { describe, expect, it } from 'vitest';
import { comparisonPair, fitWithin, photoPath } from './photos';
describe('body photos', () => {
    it('shrinks big photos to 1600 px on the long side, keeping the shape', () => {
        expect(fitWithin(3000, 4000)).toEqual({ width: 1200, height: 1600 });
        expect(fitWithin(4032, 3024)).toEqual({ width: 1600, height: 1200 });
        expect(fitWithin(800, 600)).toEqual({ width: 800, height: 600 });
    });
    it('stores photos in the user folder, with a clean extension', () => {
        expect(photoPath('u1', '2026-11-19', 'front', 'IMG 2024.JPEG', 'abc')).toBe('u1/2026-11-19-front-abc.jpg');
        expect(photoPath('u1', '2026-11-19', 'side', 'semextensao', 'abc')).toBe('u1/2026-11-19-side-abc.jpg');
        expect(photoPath('u1', '2026-11-19', 'back', 'foto.webp', 'abc')).toBe('u1/2026-11-19-back-abc.webp');
    });
    it('compares with the previous assessment unless another is chosen', () => {
        const list = [{ id: 'c' }, { id: 'b' }, { id: 'a' }]; // newest first
        expect(comparisonPair(list, null, null)).toEqual({ current: { id: 'c' }, other: { id: 'b' } });
        expect(comparisonPair(list, 'c', 'a')).toEqual({ current: { id: 'c' }, other: { id: 'a' } });
        expect(comparisonPair(list, 'a', null)).toEqual({ current: { id: 'a' }, other: null });
        expect(comparisonPair(list, 'b', 'b')).toEqual({ current: { id: 'b' }, other: { id: 'a' } });
        expect(comparisonPair([], null, null)).toEqual({ current: null, other: null });
    });
});
