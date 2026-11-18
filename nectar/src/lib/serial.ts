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
