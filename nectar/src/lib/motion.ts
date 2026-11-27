// Geometry for the sliding indicator under the active tab. The indicator is
// one shape per tab group, moved with a transform, so switching tabs glides
// instead of jumping.

export interface Box { left: number; top: number; width: number; height: number }

/** CSS variables that place the indicator over a tab; null when there is no tab to point at. */
export function indicatorVars(box: Box | null): Record<'--ind-x' | '--ind-y' | '--ind-w' | '--ind-h', string> | null {
  if (!box || box.width <= 0 || box.height <= 0) return null;
  const px = (n: number) => `${Math.round(n)}px`;
  return { '--ind-x': px(box.left), '--ind-y': px(box.top), '--ind-w': px(box.width), '--ind-h': px(box.height) };
}
