import { describe, expect, it } from 'vitest';
import { nextToast, toastDuration } from './feedback';

describe('save feedback', () => {
  it('shows one "Salvo" for a burst of saves instead of a pile of toasts', () => {
    const a = nextToast(null, { kind: 'ok', text: 'Salvo' }, 1000);
    const b = nextToast(a, { kind: 'ok', text: 'Salvo' }, 1800);
    expect(b.id).toBe(a.id);
    expect(b.at).toBe(1800);
    const c = nextToast(b, { kind: 'ok', text: 'Salvo' }, 5000);
    expect(c.id).not.toBe(a.id);
  });
  it('always shows an error on its own, and keeps it longer', () => {
    const ok = nextToast(null, { kind: 'ok', text: 'Salvo' }, 1000);
    const err = nextToast(ok, { kind: 'error', text: 'Não foi possível salvar: sem conexão' }, 1100);
    expect(err.id).not.toBe(ok.id);
    expect(err.kind).toBe('error');
    expect(toastDuration('error')).toBeGreaterThan(toastDuration('ok'));
  });
});
