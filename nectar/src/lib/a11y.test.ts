import { describe, expect, it } from 'vitest';
import { FOCUSABLE_SELECTOR, nextFocusIndex } from './a11y';

describe('a11y focus trap', () => {
  it('wraps forward and backward at the boundaries', () => {
    expect(nextFocusIndex(0, 3, false)).toBe(1);
    expect(nextFocusIndex(2, 3, false)).toBe(0);
    expect(nextFocusIndex(0, 3, true)).toBe(2);
    expect(nextFocusIndex(2, 3, true)).toBe(1);
  });

  it('recovers when focus is outside the list and handles empty lists', () => {
    expect(nextFocusIndex(-1, 3, false)).toBe(0);
    expect(nextFocusIndex(-1, 3, true)).toBe(2);
    expect(nextFocusIndex(0, 0, false)).toBe(-1);
  });

  it('excludes disabled controls and hidden inputs from the focusable selector', () => {
    expect(FOCUSABLE_SELECTOR).toContain('button:not([disabled])');
    expect(FOCUSABLE_SELECTOR).toContain('input:not([disabled]):not([type="hidden"])');
  });
});
