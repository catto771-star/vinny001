// Revisão 8: paleta por casa no claro e no escuro. Todo par texto/fundo cumpre WCAG AA (4,5:1) e as casas
// nunca voltam a ficar parecidas no modo claro.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const css = readFileSync("src/theme.css", "utf8").replace(/\/\*[\s\S]*?\*\//g, "");

function block(theme: string, house: string): Record<string, string> {
  const re = new RegExp(`:root\\[data-theme="${theme}"\\]\\[data-house="${house}"\\]\\s*\\{([^}]*)\\}`, "g");
  const out: Record<string, string> = {};
  for (const m of css.matchAll(re)) for (const d of m[1].matchAll(/(--[\w-]+)\s*:\s*([^;]+);?/g)) out[d[1]] = d[2].trim();
  return out;
}
function lum(hex: string) {
  const h = hex.replace("#", "");
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
const ratio = (a: string, b: string) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
const stops = (v: string) => [...v.matchAll(/#[0-9a-fA-F]{6}/g)].map((m) => m[0]);

const CASES = [["light", "amiens"], ["light", "connolly"], ["dark", "amiens"], ["dark", "connolly"]] as const;

describe.each(CASES)("paleta %s / %s", (theme, house) => {
  const t = block(theme, house);
  it("define todos os tokens", () => {
    for (const k of ["--bg", "--surface", "--surface-2", "--ink", "--ink-2", "--ink-3", "--hc", "--hc2", "--on-hc", "--hero", "--on-hero", "--hero-btn-ink"]) expect(t[k], k).toBeTruthy();
  });
  it("texto legível sobre os fundos (AA)", () => {
    for (const ink of ["--ink", "--ink-2", "--ink-3", "--hc"]) for (const bg of ["--bg", "--surface", "--surface-2"]) {
      expect(ratio(t[ink], t[bg]), `${ink} on ${bg}`).toBeGreaterThanOrEqual(4.5);
    }
  });
  it("texto sobre a cor da casa e sobre o gradiente (AA)", () => {
    expect(ratio(t["--on-hc"], t["--hc"])).toBeGreaterThanOrEqual(4.5);
    for (const s of stops(t["--hero"])) expect(ratio(t["--on-hero"], s), `hero ${s}`).toBeGreaterThanOrEqual(4.5);
  });
  it("botão branco do topo (No Shows) é legível", () => {
    expect(ratio(t["--hero-btn-ink"], "#ffffff")).toBeGreaterThanOrEqual(4.5);
  });
});

describe("as casas se distinguem", () => {
  for (const theme of ["light", "dark"]) {
    it(`no modo ${theme} o fundo e as superfícies têm matiz diferente`, () => {
      const a = block(theme, "amiens"), c = block(theme, "connolly");
      expect(a["--bg"]).not.toBe(c["--bg"]);
      expect(a["--surface-2"]).not.toBe(c["--surface-2"]);
      const rgb = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
      const [ar, , ab] = rgb(a["--surface-2"]); const [cr, , cb] = rgb(c["--surface-2"]);
      expect(ar - ab).toBeGreaterThan(0); // âmbar/areia: mais vermelho que azul
      expect(cb - cr).toBeGreaterThan(0); // gelo/azul: mais azul que vermelho
    });
  }
  it("--hero é definido uma única vez por casa e tema", () => {
    for (const [theme, house] of CASES) {
      const re = new RegExp(`:root\\[data-theme="${theme}"\\]\\[data-house="${house}"\\][^{]*\\{[^}]*--hero\\s*:`, "g");
      expect((css.match(re) ?? []).length, `${theme}/${house}`).toBe(1);
    }
  });
});
