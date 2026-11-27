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

// Revisão 15: regra permanente — nada de texto fora da caixa. O estouro real é verificado por
// tests/e2e/text-overflow.e2e.cjs (todas as telas); aqui ficam as regras de CSS que o evitam.
const elevate = readFileSync("src/elevate.css", "utf8");
describe("texto dentro da caixa (revisão 15)", () => {
  it("nome do residente no Bed map quebra em até 2 linhas e depois corta com reticências", () => {
    expect(elevate).toMatch(/\.bed-body strong\s*\{[^}]*-webkit-line-clamp:\s*2/);
    expect(elevate).toMatch(/\.bed-body strong\s*\{[^}]*overflow:\s*hidden/);
  });
  it("célula da cama não soma preenchimento ao botão (era o que empurrava o nome para fora do cartão)", () => {
    expect(elevate).toMatch(/\.room-card \.bed-list li\s*\{[^}]*padding:\s*0/);
  });
  it("iniciais cabem no círculo: 28px e fonte pequena", () => {
    expect(elevate).toMatch(/\.avatar\s*\{[^}]*width:\s*28px[^}]*font-size:\s*\.625rem/);
  });
  it("botão principal com brilho colorido reduzido (sombra colorida a 55%)", () => {
    expect(elevate).toMatch(/button\.primary[\s\S]*?color-mix\(in srgb, var\(--hc-vivid\) 55%, transparent\)/);
  });
  it("check do Dinner e das tarefas é desenhado em CSS, centralizado no quadrado", () => {
    expect(elevate).toMatch(/\.task-check:empty::after\s*\{[^}]*left:\s*50%[^}]*top:\s*50%/);
  });
});

describe("janelas centralizadas (revisão 15)", () => {
  it("no computador o dialog é centralizado na tela (inset 0 + margin auto)", () => {
    expect(elevate).toMatch(/@media \(min-width: 720px\)\s*\{\s*\.dialog\s*\{[^}]*position:\s*fixed[^}]*inset:\s*0[^}]*margin:\s*auto/);
  });
});

describe("espaçamento em Registers (revisão 15)", () => {
  it("sub-abas de Registers têm folga embaixo, separadas do seletor de casa", () => {
    expect(elevate).toMatch(/\.registers > \.tabs\s*\{[^}]*margin-bottom:\s*1rem/);
  });
});

describe("Home do Admin (revisão 16)", () => {
  it("filtro de período compacto e cartões recolhíveis têm estilo próprio", () => {
    expect(elevate).toMatch(/\.period-filter\s*\{/);
    expect(elevate).toMatch(/\.dash-card\.is-collapsed/);
  });
  it("botão de pendência moderno: contador, texto que corta com reticências e seta redonda", () => {
    expect(elevate).toMatch(/\.pending-go\s*\{[^}]*border-radius:\s*999px/);
    expect(elevate).toMatch(/\.pending-label\s*\{[^}]*text-overflow:\s*ellipsis/);
  });
  it("cama cancelada é desenhada como cama livre com marca", () => {
    expect(elevate).toMatch(/\.bed-cell\.cancelled::after/);
  });
});
