// Revisão 11: visual em alto relevo (botões, cartões, campos), transições rápidas estilo iOS/Mac e ritmo de espaçamento.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const css = readFileSync("src/elevate.css", "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
const rules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({ sel: m[1].split(",").map((s) => s.trim()), body: m[2] }));
const rule = (sel: string) => rules.filter((r) => r.sel.includes(sel)).map((r) => r.body).join(";");
/** Regras cujo seletor CONTÉM o trecho (os botões em relevo são uma lista de seletores). */
const like = (part: string) => rules.filter((r) => r.sel.some((x) => x.includes(part))).map((r) => r.body).join(";");

describe("tokens de relevo por tema", () => {
  for (const theme of ["light", "dark"]) {
    it(`define sombras e realces no modo ${theme}`, () => {
      const body = rules.filter((r) => r.sel.some((s) => s.startsWith(`:root[data-theme="${theme}"]`) && !s.includes(" "))).map((r) => r.body).join(";");
      for (const t of ["--sh-1", "--sh-2", "--sh-3", "--hi", "--sheen"]) expect(body, t).toContain(t + ":");
    });
  }
});

describe("botões em alto relevo", () => {
  it("botão comum tem realce superior, sombra em camadas e gradiente", () => {
    const b = like("button:not([class])");
    expect(b).toMatch(/box-shadow:[^;]*var\(--hi\)/);
    expect(b).toMatch(/var\(--sh-1\)/);
    expect(b).toMatch(/linear-gradient/);
  });
  it("botão principal usa o gradiente da casa com brilho e sombra colorida", () => {
    const b = like("button.primary");
    expect(b).toMatch(/var\(--hero\)/);
    expect(b).toMatch(/var\(--hc-vivid\)/);
  });
  it("ao passar o mouse sobe 1px; ao pressionar afunda (transform) e a sombra diminui", () => {
    expect(like("button:not([class]):hover:not(:disabled)")).toMatch(/translateY\(-1px\)/);
    expect(like("button:not([class]):active:not(:disabled)")).toMatch(/translateY\(1px\)/);
  });
});

describe("transições rápidas e elegantes", () => {
  it("usam a curva do iOS e duram no máximo 240ms; respeitam 'reduzir movimento'", () => {
    const t = like("button:not([class])");
    expect(t).toMatch(/transition:[^;]*var\(--ios-ease\)/);
    for (const m of t.matchAll(/(\d+)ms/g)) expect(Number(m[1])).toBeLessThanOrEqual(240);
    expect(css).toMatch(/prefers-reduced-motion:\s*reduce/);
  });
});

describe("ritmo de espaçamento", () => {
  it("a página empilha os blocos com um espaço único (sem margens soltas), abas não esticam", () => {
    const page = rule(".page");
    expect(page).toMatch(/display:\s*flex/);
    expect(page).toMatch(/flex-direction:\s*column/);
    expect(page).toMatch(/gap:\s*1\.25rem/);
    expect(rule(".page > .tabs")).toMatch(/align-self:\s*flex-start/);
  });
  it("a coluna de conteúdo pode encolher (minmax(0,1fr)): nada empurra o topo para fora da janela", () => {
    expect(css).toMatch(/\.shell\s*\{[^}]*grid-template-columns:\s*15\.5rem\s+minmax\(0,\s*1fr\)/);
    expect(rule(".content")).toMatch(/min-width:\s*0/);
  });
  it("o painel de ocupação deixa o texto quebrar em vez de empurrar o anel para a borda", () => {
    expect(rule(".dash-occ > div:first-child")).toMatch(/min-width:\s*0/);
    expect(rule(".dash-card")).toMatch(/grid-template-columns:\s*minmax\(0,\s*1fr\)/);
    expect(rule(".dash-kpis")).toMatch(/repeat\(auto-fit/);
  });
  it("o topo cede espaço em ordem (nome do usuário ≤1400px, chip do plantão ≤1180px) e fica em uma linha no celular", () => {
    expect(css).toMatch(/@media \(max-width:\s*1400px\)\s*\{[^}]*\.topbar \.user-name[^}]*display:\s*none\s*!important/);
    expect(css).toMatch(/@media \(max-width:\s*1180px\)\s*\{[^}]*post-chip[^}]*display:\s*none/);
    expect(css).toMatch(/@media \(max-width:\s*719px\)\s*\{[^}]*\.topbar\s*\{[^}]*flex-wrap:\s*nowrap/);
  });
  it("no escuro o logo do login ganha cartão branco (o azul-marinho some no preto)", () => {
    expect(rule(':root[data-theme="dark"] .auth-logo')).toMatch(/background:\s*#fff/);
  });
  it("seta do menu em cascata tem folga na borda (>= .75rem)", () => {
    expect(rule(":root[data-theme] .nav-group-toggle")).toMatch(/padding:\s*0\s+\.75rem/);
  });
});

describe("campos de seleção e de data (revisão 12)", () => {
  const sel = like("select:not([multiple])");
  it("a seta é desenhada por nós (appearance none), na cor do tema, longe da borda", () => {
    expect(sel).toMatch(/appearance:\s*none/);
    expect(sel).toMatch(/linear-gradient[^;]*var\(--ink-2\)/);
    const pos = /background-position:\s*calc\(100%\s*-\s*(\d+)px\)/.exec(sel);
    expect(Number(pos?.[1])).toBeGreaterThanOrEqual(18);
  });
  it("o texto nunca corre por baixo da seta (padding à direita >= 2.5rem)", () => {
    expect(sel).toMatch(/padding-right:\s*(2\.[5-9]|[3-9])\d*rem/);
  });
  it("ícone nativo de data/hora tem folga na borda", () => {
    expect(like("::-webkit-calendar-picker-indicator")).toMatch(/margin-right:\s*\d+px/);
    expect(like('input[type="date"]')).toMatch(/padding-right:\s*\.?\d/);
  });
});

describe("tabela do Audit em telas estreitas (revisão 12)", () => {
  it("rola dentro do próprio quadro (não empurra a página) e vira cartões no celular", () => {
    expect(rule(".table-scroll")).toMatch(/overflow-x:\s*auto/);
    expect(css).toMatch(/@media \(max-width:\s*719px\)\s*\{[^}]*\.audit-table thead[^}]*display:\s*none/);
  });
});

describe("texto longo em cartões (revisão 13)", () => {
  it("descrição do pedido de manutenção quebra de linha em vez de vazar ou truncar", () => {
    const r = rule(".ticket-main .muted");
    expect(r).toMatch(/white-space:\s*normal/);
    expect(r).toMatch(/overflow-wrap:\s*anywhere/);
  });
});

describe("cores das tags (revisão 14)", () => {
  it("cada cor da lista tem estilo para a etiqueta e para o chip selecionado", () => {
    for (const c of ["red", "amber", "blue", "green", "violet"]) {
      expect(css).toContain(`.tag.tag-c-${c}`);
      expect(css).toContain(`.chip.tag-c-${c}.is-on`);
    }
  });
});
