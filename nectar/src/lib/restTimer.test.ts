import { describe, expect, it } from 'vitest';
import { clampRestSeconds, formatRestClock, remainingSeconds } from './restTimer';

describe('restTimer', () => {
  it('formats seconds as MM:SS and clamps negatives to 00:00', () => {
    expect(formatRestClock(90)).toBe('01:30');
    expect(formatRestClock(5)).toBe('00:05');
    expect(formatRestClock(0)).toBe('00:00');
    expect(formatRestClock(-12)).toBe('00:00');
    expect(formatRestClock(185)).toBe('03:05');
  });

  it('computes remaining seconds accurately from target timestamp', () => {
    const start = 1_000_000;
    expect(remainingSeconds(start + 90_000, start)).toBe(90);
    expect(remainingSeconds(start + 100, start)).toBe(1);
    expect(remainingSeconds(start - 500, start)).toBe(0);
  });

  it('clamps adjustments within valid bounds', () => {
    expect(clampRestSeconds(-15)).toBe(0);
    expect(clampRestSeconds(105)).toBe(105);
    expect(clampRestSeconds(5000)).toBe(3600);
  });
});
