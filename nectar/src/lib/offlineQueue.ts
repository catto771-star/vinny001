// Resilient offline write queue for PWA usage.
// Queues Supabase table mutations in localStorage when offline or when a network
// error occurs, then flushes them strictly in FIFO order once connectivity returns.

export type OfflineOpKind = 'insert' | 'update' | 'upsert' | 'delete';

export interface OfflineMutation {
  id: string;
  table: string;
  op: OfflineOpKind;
  payload?: Record<string, unknown>;
  match?: Record<string, unknown>;
  onConflict?: string;
  label?: string;
  createdAt: string;
}

export const OFFLINE_QUEUE_KEY = 'painel.offlineQueue.v1';

type Listener = (queue: OfflineMutation[]) => void;
const listeners = new Set<Listener>();

function storage(): Storage | null {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch {
    return null;
  }
}

export function loadOfflineQueue(): OfflineMutation[] {
  const s = storage();
  if (!s) return [];
  try {
    const raw = s.getItem(OFFLINE_QUEUE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as OfflineMutation[]) : [];
  } catch {
    return [];
  }
}

function saveOfflineQueue(queue: OfflineMutation[]): void {
  const s = storage();
  if (s) {
    try {
      if (queue.length === 0) s.removeItem(OFFLINE_QUEUE_KEY);
      else s.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(queue));
    } catch { /* ignore quota errors */ }
  }
  for (const fn of listeners) fn(queue);
}

export function subscribeOfflineQueue(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function enqueueOfflineMutation(
  mutation: Omit<OfflineMutation, 'id' | 'createdAt'>,
): OfflineMutation {
  const item: OfflineMutation = {
    ...mutation,
    id: typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `q-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    createdAt: new Date().toISOString(),
  };
  const next = [...loadOfflineQueue(), item];
  saveOfflineQueue(next);
  return item;
}

export function clearOfflineQueue(): void {
  saveOfflineQueue([]);
}

/** Heuristic to detect network/offline errors vs real DB validation/RLS errors. */
export function isLikelyOfflineError(err: unknown): boolean {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return true;
  const msg = typeof err === 'string'
    ? err
    : (err && typeof err === 'object' && 'message' in err ? String((err as { message: unknown }).message) : '');
  return /failed to fetch|networkerror|load failed|fetch failed|offline|network request failed/i.test(msg);
}

export type MutationExecutor = (m: OfflineMutation) => Promise<{ error: { message: string } | null }>;

export interface FlushResult {
  synced: number;
  remaining: number;
  failedError: string | null;
}

let flushing: Promise<FlushResult> | null = null;

/**
 * Replays queued mutations in FIFO order. Stops immediately if a network error
 * occurs (preserving remaining items for later); drops items that fail permanently
 * only if requested, or stops and reports the error so no data is silently lost.
 */
export async function flushOfflineQueue(executor: MutationExecutor): Promise<FlushResult> {
  if (flushing) return flushing;
  flushing = (async () => {
    const queue = loadOfflineQueue();
    if (!queue.length) return { synced: 0, remaining: 0, failedError: null };

    let synced = 0;
    const remaining: OfflineMutation[] = [];
    let failedError: string | null = null;

    for (let i = 0; i < queue.length; i++) {
      const item = queue[i];
      try {
        const res = await executor(item);
        if (res.error) {
          failedError = res.error.message;
          remaining.push(...queue.slice(i));
          break;
        }
        synced++;
      } catch (err) {
        failedError = err instanceof Error ? err.message : String(err);
        remaining.push(...queue.slice(i));
        break;
      }
    }

    saveOfflineQueue(remaining);
    return { synced, remaining: remaining.length, failedError };
  })();

  try {
    return await flushing;
  } finally {
    flushing = null;
  }
}
