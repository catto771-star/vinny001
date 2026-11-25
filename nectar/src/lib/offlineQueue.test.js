import { beforeEach, describe, expect, it, vi } from 'vitest';
import { clearOfflineQueue, enqueueOfflineMutation, flushOfflineQueue, isLikelyOfflineError, loadOfflineQueue, subscribeOfflineQueue, } from './offlineQueue';
describe('offlineQueue', () => {
    beforeEach(() => {
        const store = new Map();
        vi.stubGlobal('localStorage', {
            getItem: (k) => store.get(k) ?? null,
            setItem: (k, v) => { store.set(k, v); },
            removeItem: (k) => { store.delete(k); },
        });
        clearOfflineQueue();
    });
    it('enqueues mutations in FIFO order and notifies subscribers', () => {
        const counts = [];
        const unsub = subscribeOfflineQueue((q) => counts.push(q.length));
        enqueueOfflineMutation({ table: 'tasks', op: 'update', payload: { completed: true }, match: { id: 't1' }, label: 'Concluir tarefa' });
        enqueueOfflineMutation({ table: 'habit_completions', op: 'upsert', payload: { habit_id: 'h1', value: 1 }, onConflict: 'habit_id,completed_date' });
        unsub();
        expect(loadOfflineQueue().map((m) => m.table)).toEqual(['tasks', 'habit_completions']);
        expect(counts).toEqual([1, 2]);
    });
    it('flushes all queued items when online and preserves remaining items on failure', async () => {
        enqueueOfflineMutation({ table: 'tasks', op: 'update', payload: { completed: true }, match: { id: 't1' } });
        enqueueOfflineMutation({ table: 'reminders', op: 'update', payload: { completed: true }, match: { id: 'r1' } });
        let calls = 0;
        const partial = await flushOfflineQueue(async () => {
            calls++;
            if (calls === 2)
                return { error: { message: 'Failed to fetch' } };
            return { error: null };
        });
        expect(partial).toEqual({ synced: 1, remaining: 1, failedError: 'Failed to fetch' });
        expect(loadOfflineQueue().map((m) => m.table)).toEqual(['reminders']);
        const full = await flushOfflineQueue(async () => ({ error: null }));
        expect(full).toEqual({ synced: 1, remaining: 0, failedError: null });
        expect(loadOfflineQueue()).toEqual([]);
    });
    it('identifies network/offline errors vs validation errors', () => {
        expect(isLikelyOfflineError({ message: 'TypeError: Failed to fetch' })).toBe(true);
        expect(isLikelyOfflineError('NetworkError when attempting to fetch resource.')).toBe(true);
        expect(isLikelyOfflineError({ message: 'duplicate key value violates unique constraint' })).toBe(false);
    });
});
