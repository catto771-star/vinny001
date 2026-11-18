import { describe, expect, it } from 'vitest';
import { serialQueue } from './serial';

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe('serialQueue', () => {
  it('runs saves in the order they were asked, so a slow early save cannot overwrite a later one', async () => {
    const queue = serialQueue();
    const stored: string[] = [];
    // The first save is slower than the second, as happens with network requests.
    const a = queue(async () => { await wait(30); stored.push('sem carga'); });
    const b = queue(async () => { await wait(1); stored.push('carga 100'); });
    await Promise.all([a, b]);
    expect(stored).toEqual(['sem carga', 'carga 100']);
    expect(stored.at(-1)).toBe('carga 100');
  });
  it('keeps going after a failed save', async () => {
    const queue = serialQueue();
    const stored: string[] = [];
    await queue(async () => { throw new Error('offline'); }).catch(() => {});
    await queue(async () => { stored.push('ok'); });
    expect(stored).toEqual(['ok']);
  });
});
