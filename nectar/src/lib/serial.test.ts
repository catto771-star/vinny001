import { describe, expect, it } from 'vitest';
import { latestPerKey, serialQueue } from './serial';

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

describe('latestPerKey', () => {
  it('writes only the latest value queued for a key, and does not make other keys wait', async () => {
    const submit = latestPerKey();
    const calls: string[] = [];
    const gates: (() => void)[] = [];
    const task = (label: string) => () => { calls.push(label); return new Promise<void>((r) => gates.push(r)); };
    const a = submit('a', task('a1'));
    submit('a', task('a2'));
    submit('a', task('a3'));
    submit('b', task('b1'));
    expect(calls).toEqual(['a1', 'b1']); // b did not wait for a
    expect(submit.busy()).toBe(true);
    gates[0]();
    await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
    expect(calls).toEqual(['a1', 'b1', 'a3']); // a2 was superseded
    gates[1](); gates[2]();
    await a;
    await submit.idle();
    expect(submit.busy()).toBe(false);
  });
  it('keeps going after a failed write', async () => {
    const submit = latestPerKey();
    const calls: string[] = [];
    submit('a', () => { calls.push('fail'); return Promise.reject(new Error('x')); });
    submit('a', () => { calls.push('ok'); return Promise.resolve(); });
    await submit.idle();
    expect(calls).toEqual(['fail', 'ok']);
  });
});
