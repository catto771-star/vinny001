import { describe, expect, it } from "vitest";
import { catalogues, LOCALES, translate } from "./index";

function leaves(node: unknown, prefix = ""): Map<string, string> {
  const out = new Map<string, string>();
  if (typeof node === "string") {
    out.set(prefix, node);
    return out;
  }
  for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
    for (const [k, v] of leaves(value, prefix ? `${prefix}.${key}` : key)) out.set(k, v);
  }
  return out;
}

const reference = leaves(catalogues["en-IE"]);

describe("Idiomas (s.15.1)", () => {
  it.each(LOCALES)("B53: %s tem exatamente as mesmas chaves que en-IE, nenhuma vazia", (locale) => {
    const current = leaves(catalogues[locale]);
    expect([...current.keys()].sort()).toEqual([...reference.keys()].sort());
    for (const [key, value] of current) expect(value.trim(), key).not.toBe("");
  });

  it.each(LOCALES)("%s usa as mesmas variáveis {x} que en-IE", (locale) => {
    const current = leaves(catalogues[locale]);
    const vars = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
    for (const [key, value] of reference) expect(vars(current.get(key) ?? ""), key).toEqual(vars(value));
  });

  it("Termos de trabalho ficam em inglês nos três idiomas", () => {
    for (const locale of LOCALES) {
      expect(translate(locale, "post.office")).toBe("Office On Duty");
      expect(translate(locale, "post.float")).toBe("Float");
    }
  });

  it("B52: inglês com ortografia irlandesa", () => {
    const all = [...reference.values()].join(" ");
    expect(all).not.toMatch(/\b(canceled|organization|color|recognized)\b/i);
  });

  it("Beta: só inglês; chave ausente devolve a própria chave e interpola variáveis", () => {
    expect(LOCALES).toEqual(["en-IE"]);
    expect(translate("en-IE", "today.since", { time: "07:00" })).toBe("since 07:00");
    expect(translate("en-IE", "missing.key" as never)).toBe("missing.key");
  });

  it("Beta: nenhum texto menciona a marca antiga nem fica em português", () => {
    const all = [...reference.values()].join(" \n ");
    expect(all).not.toMatch(/DS Lodge/);
    expect(all).not.toMatch(/\b(não|você|está|turno|senha|código|ação|Português|Polski)\b/i);
  });
});
