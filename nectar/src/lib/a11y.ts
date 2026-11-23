export const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(', ');

/**
 * Computes the next focus index inside a focus trap (e.g. a modal dialog),
 * wrapping around at the boundaries so Tab / Shift+Tab stays inside.
 */
export function nextFocusIndex(currentIndex: number, count: number, shiftKey: boolean): number {
  if (count <= 0) return -1;
  if (currentIndex < 0 || currentIndex >= count) return shiftKey ? count - 1 : 0;
  return shiftKey ? (currentIndex - 1 + count) % count : (currentIndex + 1) % count;
}
