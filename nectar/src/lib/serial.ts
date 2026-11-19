/**
 * Runs async tasks one after another, in the order they were queued. Used for
 * saves fired by quick successive edits: without it a slow early save can land
 * after a later one and overwrite it. A failed task does not stop the queue.
 */
export function serialQueue() {
  let tail: Promise<unknown> = Promise.resolve();
  return <T>(task: () => Promise<T>): Promise<T> => {
    const run = tail.then(task, task);
    tail = run.catch(() => undefined);
    return run;
  };
}

/**
 * Writes per key (a habit and a day, say): one write at a time for a key, and a
 * write queued while another runs is replaced by any later one, so ten quick
 * clicks cost two requests, not ten. Different keys do not wait for each other.
 */
export function latestPerKey() {
  const pending = new Map<string, () => Promise<unknown>>();
  const running = new Map<string, Promise<void>>();
  function submit(key: string, task: () => Promise<unknown>): Promise<void> {
    pending.set(key, task);
    let run = running.get(key);
    if (!run) {
      run = (async () => {
        for (let next = pending.get(key); next; next = pending.get(key)) {
          pending.delete(key);
          try { await next(); } catch { /* the caller reports its own errors */ }
        }
        running.delete(key);
      })();
      running.set(key, run);
    }
    return run;
  }
  submit.busy = () => running.size > 0;
  submit.idle = async () => { while (running.size) await Promise.all(running.values()); };
  return submit;
}

/**
 * Like latestPerKey, for partial changes: changes queued for a key while a
 * save runs are merged, later fields winning, and written together next.
 */
export function mergingWriter<P extends object>() {
  const submit = latestPerKey();
  const waiting = new Map<string, P>();
  function save(key: string, patch: P, write: (merged: P) => Promise<unknown>): Promise<void> {
    waiting.set(key, { ...(waiting.get(key) ?? {}), ...patch } as P);
    return submit(key, async () => {
      const merged = waiting.get(key);
      waiting.delete(key);
      if (merged) await write(merged);
    });
  }
  save.busy = submit.busy;
  save.idle = submit.idle;
  return save;
}
