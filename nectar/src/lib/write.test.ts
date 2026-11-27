import { describe, expect, it } from 'vitest';
import { onFeedback, type ToastEvent } from './feedback';
import { write } from './useTable';

describe('saving', () => {
  it('confirms a save and reports a failure as a toast, not an alert', async () => {
    const seen: ToastEvent[] = [];
    const stop = onFeedback((e) => seen.push(e));
    expect(await write(Promise.resolve({ error: null }))).toBe(true);
    expect(await write(Promise.resolve({ error: { message: 'sem conexão' } }))).toBe(false);
    stop();
    expect(seen).toEqual([{ kind: 'ok', text: 'Salvo' }, { kind: 'error', text: 'Não foi possível salvar: sem conexão' }]);
  });
});
