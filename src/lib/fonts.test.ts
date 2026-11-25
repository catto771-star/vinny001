// Revisão 9: fontes do iPhone (San Francisco) nos aparelhos Apple e Inter nos demais.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const css = readFileSync("src/theme.css", "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
const ui = /--font-ui\s*:\s*([^;}]+)/.exec(css)?.[1] ?? "";

describe("fontes do sistema", () => {
  it("pede a San Francisco do iPhone/Mac primeiro (-apple-system, SF Pro) e cai na Inter", () => {
    const list = ui.split(",").map((s) => s.trim().replace(/["']/g, ""));
    expect(list[0]).toBe("-apple-system");
    expect(list).toContain("BlinkMacSystemFont");
    expect(list).toContain("SF Pro Text");
    expect(list.indexOf("Inter")).toBeGreaterThan(list.indexOf("SF Pro Text"));
    expect(list.at(-1)).toBe("sans-serif");
  });
  it("não carrega mais a Plus Jakarta Sans", () => {
    expect(css).not.toMatch(/jakarta/i);
  });
  it("números e relógio usam a mesma família, com algarismos tabulares", () => {
    expect(css).toMatch(/font-variant-numeric:\s*tabular-nums/);
  });
});
