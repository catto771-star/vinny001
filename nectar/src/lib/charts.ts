export interface ChartPoint {
  label: string;
  value: number | null;
  detail?: string;
}

/** True when at least one point has a non-null, non-zero value worth plotting. */
export function hasChartData(points: readonly ChartPoint[]): boolean {
  return points.some((p) => p.value !== null && p.value !== 0);
}

/** Keyboard navigation over chart data points (ArrowLeft/ArrowRight/Home/End/Escape). */
export function nextChartIndex(current: number | null, length: number, key: string): number | null {
  if (length <= 0) return null;
  if (key === 'Escape') return null;
  if (key === 'Home') return 0;
  if (key === 'End') return length - 1;
  if (key === 'ArrowRight') return current === null ? 0 : Math.min(length - 1, current + 1);
  if (key === 'ArrowLeft') return current === null ? length - 1 : Math.max(0, current - 1);
  return current;
}
