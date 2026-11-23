import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { ACCENTS, resolveAccent } from './accent';

const css = readFileSync(fileURLToPath(new URL('../index.css', import.meta.url)), 'utf8');

/** The custom properties set by the rule with exactly this selector. */
function vars(selector: string): Record<string, string> {
  const start = css.indexOf(`${selector} {`);
  if (start < 0) return {};
  const body = css.slice(css.indexOf('{', start) + 1, css.indexOf('}', start));
  return Object.fromEntries([...body.matchAll(/(--[\w-]+):\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]));
}

const lum = (hex: string) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a: string, b: string) => {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

/** What the cascade gives each theme: the page defaults, then the accent, then the accent's dark overrides. */
function resolved(key: string, theme: 'light' | 'dark') {
  const base = { ...vars(':root,\n.light') };
  const dark = theme === 'dark' ? vars('.dark') : {};
  const accent = key === 'orange' ? {} : vars(`html[data-accent="${key}"]`);
  const accentDark = key !== 'orange' && theme === 'dark' ? vars(`html.dark[data-accent="${key}"]`) : {};
  return { ...base, ...dark, ...accent, ...accentDark };
}

describe('accent colours', () => {
  it('offers the five colours, orange first and by default', () => {
    expect(ACCENTS.map((a) => a.key)).toEqual(['orange', 'lime', 'yellow', 'purple', 'red']);
    expect(ACCENTS.map((a) => a.label)).toEqual(['Laranja neon', 'Verde-limão', 'Amarelo neon', 'Roxo neon', 'Vermelho Ferrari']);
    expect(resolveAccent(null)).toBe('orange');
    expect(resolveAccent('purple')).toBe('purple');
    expect(resolveAccent('pink')).toBe('orange');
  });

  for (const { key } of ACCENTS) {
    for (const theme of ['light', 'dark'] as const) {
      it(`${key} stays readable in the ${theme} theme`, () => {
        const v = resolved(key, theme);
        const card = v['--surface'];
        const page = v['--bg'];
        // Text in the accent colour (links, labels) on cards and on the page.
        expect(contrast(v['--brand-ink'], card)).toBeGreaterThanOrEqual(4.5);
        expect(contrast(v['--brand-ink'], page)).toBeGreaterThanOrEqual(4.5);
        // Text written on top of a filled accent (today in the calendar, a perfect day).
        expect(contrast(v['--on-brand'], v['--brand'])).toBeGreaterThanOrEqual(4.5);
        // The fill itself is still seen against a dark card; on light it is decoration beside a number.
        if (theme === 'dark') expect(contrast(v['--brand'], card)).toBeGreaterThanOrEqual(3);
        else expect(contrast(v['--brand'], card)).toBeGreaterThanOrEqual(1.8);
      });
    }
  }

  it('keeps warnings amber whatever the accent, so "Atrasada" never turns green', () => {
    for (const theme of ['light', 'dark'] as const) {
      const base = resolved('orange', theme);
      expect(base['--warning']).toMatch(/^#[0-9a-f]{6}$/i);
      expect(contrast(base['--warning'], base['--surface'])).toBeGreaterThanOrEqual(4.5);
      expect(contrast(base['--warning'], base['--bg'])).toBeGreaterThanOrEqual(4.5);
    }
    for (const { key } of ACCENTS) {
      expect(vars(`html[data-accent="${key}"]`)['--warning']).toBeUndefined();
      expect(vars(`html.dark[data-accent="${key}"]`)['--warning']).toBeUndefined();
    }
  });

  it('lets the glow follow the accent instead of a fixed orange', () => {
    expect(vars(':root,\n.light')['--glow']).toContain('var(--brand)');
    expect(vars('.dark')['--glow']).toContain('var(--brand)');
  });
});
