import { describe, expect, it } from 'vitest';
import { hasChartData, nextChartIndex } from './charts';

describe('charts helpers', () => {
  it('treats all-null or all-zero series as empty', () => {
    expect(hasChartData([])).toBe(false);
    expect(hasChartData([{ label: '1', value: null }, { label: '2', value: 0 }])).toBe(false);
    expect(hasChartData([{ label: '1', value: 0 }, { label: '2', value: 12.5 }])).toBe(true);
    expect(hasChartData([{ label: '1', value: -5 }])).toBe(true);
  });

  it('navigates points cleanly with keyboard keys', () => {
    expect(nextChartIndex(null, 5, 'ArrowRight')).toBe(0);
    expect(nextChartIndex(0, 5, 'ArrowRight')).toBe(1);
    expect(nextChartIndex(4, 5, 'ArrowRight')).toBe(4);
    expect(nextChartIndex(null, 5, 'ArrowLeft')).toBe(4);
    expect(nextChartIndex(2, 5, 'ArrowLeft')).toBe(1);
    expect(nextChartIndex(0, 5, 'ArrowLeft')).toBe(0);
    expect(nextChartIndex(2, 5, 'Home')).toBe(0);
    expect(nextChartIndex(2, 5, 'End')).toBe(4);
    expect(nextChartIndex(2, 5, 'Escape')).toBeNull();
    expect(nextChartIndex(2, 5, 'Enter')).toBe(2);
    expect(nextChartIndex(null, 0, 'ArrowRight')).toBeNull();
  });
});
