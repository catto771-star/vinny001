import { useCallback, useEffect, useState } from 'react';
import { supabase } from './supabase';
import { feedback } from './feedback';
import {
  enqueueOfflineMutation, flushOfflineQueue, isLikelyOfflineError,
  type OfflineMutation,
} from './offlineQueue';

/** Loads every row of a table for the signed-in user and reloads on demand. */
export function useTable<T>(table: string, select = '*', order?: { column: string; ascending?: boolean }) {
  const [rows, setRows] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    let query = supabase.from(table).select(select);
    if (order) query = query.order(order.column, { ascending: order.ascending ?? true });
    const { data, error: err } = await query;
    if (err) setError(err.message);
    else {
      setError(null);
      setRows((data ?? []) as T[]);
    }
    setLoading(false);
  }, [table, select, order?.column, order?.ascending]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { rows, setRows, loading, error, reload };
}

/** Runs a write, confirms it with a small "Salvo" and surfaces its error instead of failing silently. */
export async function write<T>(promise: PromiseLike<{ error: { message: string } | null; data?: T }>) {
  const { error } = await promise;
  if (error) {
    feedback({ kind: 'error', text: `Não foi possível salvar: ${error.message}` });
    return false;
  }
  feedback({ kind: 'ok', text: 'Salvo' });
  return true;
}

/** Executes a single offline-queued Supabase mutation. */
export async function executeOfflineMutation(m: OfflineMutation): Promise<{ error: { message: string } | null }> {
  if (m.op === 'insert') {
    const { error } = await supabase.from(m.table).insert(m.payload ?? {});
    return { error };
  }
  if (m.op === 'upsert') {
    const { error } = await supabase.from(m.table).upsert(m.payload ?? {}, m.onConflict ? { onConflict: m.onConflict } : undefined);
    return { error };
  }
  if (m.op === 'update') {
    let q = supabase.from(m.table).update(m.payload ?? {});
    for (const [k, v] of Object.entries(m.match ?? {})) q = q.eq(k, v);
    const { error } = await q;
    return { error };
  }
  let q = supabase.from(m.table).delete();
  for (const [k, v] of Object.entries(m.match ?? {})) q = q.eq(k, v);
  const { error } = await q;
  return { error };
}

/** Replays every pending offline write in FIFO order and refreshes listening screens. */
export async function flushPendingOfflineWrites(): Promise<number> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return 0;
  const res = await flushOfflineQueue(executeOfflineMutation);
  if (res.synced > 0) {
    window.dispatchEvent(new CustomEvent('painel-data-changed'));
    feedback({ kind: 'ok', text: `${res.synced} ${res.synced === 1 ? 'alteração sincronizada' : 'alterações sincronizadas'}` });
  }
  return res.synced;
}

/**
 * Performs a table mutation and transparently queues it for replay when the
 * device is offline or encounters a transient network error.
 */
export async function queuedWrite(mutation: Omit<OfflineMutation, 'id' | 'createdAt'>): Promise<'saved' | 'queued' | 'error'> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    enqueueOfflineMutation(mutation);
    feedback({ kind: 'ok', text: 'Salvo offline — será sincronizado' });
    return 'queued';
  }
  try {
    const { error } = await executeOfflineMutation({ ...mutation, id: 'live', createdAt: '' });
    if (error) {
      if (isLikelyOfflineError(error)) {
        enqueueOfflineMutation(mutation);
        feedback({ kind: 'ok', text: 'Salvo offline — será sincronizado' });
        return 'queued';
      }
      feedback({ kind: 'error', text: `Não foi possível salvar: ${error.message}` });
      return 'error';
    }
    feedback({ kind: 'ok', text: 'Salvo' });
    return 'saved';
  } catch (err) {
    if (isLikelyOfflineError(err)) {
      enqueueOfflineMutation(mutation);
      feedback({ kind: 'ok', text: 'Salvo offline — será sincronizado' });
      return 'queued';
    }
    feedback({ kind: 'error', text: `Não foi possível salvar: ${(err as Error).message}` });
    return 'error';
  }
}
