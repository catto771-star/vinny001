// Revisão 7: texto nunca sai da caixa. Botões, campos e cartões de várias linhas não podem virar
// "pílula" (raio 999px), senão o canto arredondado corta o texto (ex.: turnos do Roster no celular).
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const css = ["src/theme.css", "src/styles.css"].map((f) => readFileSync(f, "utf8")).join("\n");

/** Regras CSS (seletor → declarações), sem comentários e sem @media. */
function rules(src: string): { sel: string[]; body: string }[] {
  const flat = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/@media[^{]*\{/g, "");
  return [...flat.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({ sel: m[1].split(",").map((s) => s.trim()), body: m[2] }));
}

// Elementos que podem ter mais de uma linha de texto.
const MULTILINE = ["button", "textarea", ".bed", ".rota-shift", ".button-link"];

describe("texto dentro da caixa", () => {
  it("nenhum elemento de várias linhas recebe raio de pílula", () => {
    const bad = rules(css)
      .filter((r) => /border-radius:\s*(999|9999)px/.test(r.body))
      .flatMap((r) => r.sel.filter((s) => MULTILINE.includes(s)));
    expect(bad).toEqual([]);
  });

  it("botões quebram palavras longas e não passam da largura disponível", () => {
    const btn = rules(css).filter((r) => r.sel.includes("button")).map((r) => r.body).join(";");
    expect(btn).toMatch(/overflow-wrap:\s*anywhere/);
    expect(btn).toMatch(/max-width:\s*100%/);
  });
});

describe("espaçamento (revisão 10)", () => {
  it("abas soltas na página têm folga embaixo (não ficam coladas no conteúdo)", () => {
    const r = rules(css).find((x) => x.sel.includes(".page > .tabs"));
    expect(r?.body).toMatch(/margin-bottom:\s*1rem/);
  });
});
