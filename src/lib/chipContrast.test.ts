// Chips selecionados (âmbar e vermelho) precisam de contraste AA (4,5:1) nos dois temas.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const css = readFileSync("src/elevate.css", "utf8") + readFileSync("src/styles.css", "utf8") + readFileSync("src/theme.css", "utf8");
const lum = (hex: string) => {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((x) => (x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
};
const ratio = (a: string, b: string) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
const token = (name: string, theme: "light" | "dark") => {
  const re = theme === "dark" ? new RegExp(`:root\\[data-theme="dark"\\][^{]*\\{[^}]*${name}:(#[0-9a-f]{6})`) : new RegExp(`${name}:\\s*(#[0-9a-f]{6})`);
  return css.match(re)![1];
};
const chipInk = (theme: "light" | "dark", cls: string) => css.match(new RegExp(`:root\\[data-theme="${theme}"\\] \\.tag-chips \\.chip\\.${cls}\\.is-on[^{]*\\{[^}]*color:(#[0-9a-f]{6})`))?.[1];

describe("contraste dos chips selecionados", () => {
  for (const theme of ["light", "dark"] as const) {
    it(`âmbar e vermelho no tema ${theme}`, () => {
      const amber = chipInk(theme, "tag-c-amber");
      const red = chipInk(theme, "tag-c-red");
      expect(amber, "regra do âmbar").toBeTruthy();
      expect(red, "regra do vermelho").toBeTruthy();
      expect(ratio(amber!, token("--warn", theme))).toBeGreaterThanOrEqual(4.5);
      expect(ratio(red!, token("--danger", theme))).toBeGreaterThanOrEqual(4.5);
    });
  }
});
