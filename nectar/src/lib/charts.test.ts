import { describe, expect, it } from 'vitest';
import { donutSlices, hasChartData, nextChartIndex, seriesDelta, smoothSvgPath } from './charts';

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

  it('aggregates donut slices, ignores non-positive rows, and folds overflow into Outros', () => {
    expect(donutSlices([{ label: 'A', value: 0 }, { label: 'B', value: -10 }])).toEqual([]);
    const slices = donutSlices([
      { label: 'Lazer', value: 100 },
      { label: 'Moradia', value: 500 },
      { label: 'Mercado', value: 250 },
      { label: 'Transporte', value: 80 },
      { label: 'Saúde', value: 50 },
      { label: 'Pets', value: 20 },
    ], 4);
    expect(slices.map((s) => [s.label, s.value, s.pct])).toEqual([
      ['Moradia', 500, 50],
      ['Mercado', 250, 25],
      ['Lazer', 100, 10],
      ['Outros', 150, 15],
    ]);
    expect(slices.reduce((sum, s) => sum + s.share, 0)).toBeCloseTo(1, 5);
  });

  it('computes series delta between first and last valid points', () => {
    expect(seriesDelta([{ label: 'Jan', value: 100 }])).toBeNull();
    expect(seriesDelta([
      { label: 'Jan', value: null },
      { label: 'Fev', value: 200 },
      { label: 'Mar', value: 250 },
      { label: 'Abr', value: null },
    ])).toEqual({ first: 200, last: 250, diff: 50, pct: 25 });
    expect(seriesDelta([
      { label: 'Jan', value: 0 },
      { label: 'Fev', value: 120 },
    ])).toEqual({ first: 0, last: 120, diff: 120, pct: null });
  });

  it('builds smooth SVG Bezier paths safely for 0, 1, 2, and many coordinates', () => {
    expect(smoothSvgPath([])).toBe('');
    expect(smoothSvgPath([{ x: 10, y: 20 }])).toBe('M10,20');
    expect(smoothSvgPath([{ x: 10, y: 20 }, { x: 40, y: 10 }])).toBe('M10,20 L40,10');
    const path = smoothSvgPath([{ x: 0, y: 50 }, { x: 50, y: 20 }, { x: 100, y: 40 }]);
    expect(path.startsWith('M0.0,50.0 C')).toBe(true);
    expect(path.endsWith('100.0,40.0')).toBe(true);
  });
});

