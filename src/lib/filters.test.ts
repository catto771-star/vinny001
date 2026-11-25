// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { activeFilters, csv, matchesText, parseFilters, serializeFilters, type FilterDef } from "./filters";

const DEFS: FilterDef[] = [
  { key: "q", label: "Search", type: "search" },
  { key: "kind", label: "Type", type: "select", options: [{ value: "note", label: "Notes" }, { value: "round", label: "Rounds" }] },
  { key: "tags", label: "Tags", type: "multi", options: [{ value: "a", label: "Incident" }, { value: "b", label: "Delivery" }] },
  { key: "from", label: "From", type: "date" },
];

describe("filtros na URL", () => {
  it("lê só as chaves conhecidas e ignora o resto", () => {
    const v = parseFilters(new URLSearchParams("q=fire&kind=note&tags=a,b&x=1"), DEFS);
    expect(v).toEqual({ q: "fire", kind: "note", tags: "a,b" });
  });
  it("grava sem valores vazios, preserva parâmetros alheios e ordena as chaves", () => {
    const base = new URLSearchParams("lodge=abc");
    const p = serializeFilters({ q: "", kind: "note", tags: "b,a", from: "" }, DEFS, base);
    expect(p.toString()).toBe("lodge=abc&kind=note&tags=a%2Cb");
  });
  it("opção desconhecida de select é descartada", () => {
    expect(parseFilters(new URLSearchParams("kind=zzz"), DEFS)).toEqual({});
  });
  it("csv e chips ativos (a busca não vira chip)", () => {
    expect(csv("a,b")).toEqual(["a", "b"]);
    expect(csv("")).toEqual([]);
    const chips = activeFilters(DEFS, { q: "fire", kind: "round", tags: "a,b", from: "2026-11-01" });
    expect(chips.map((c) => `${c.key}:${c.label}`)).toEqual(["kind:Type: Rounds", "tags:Tags: Incident", "tags:Tags: Delivery", "from:From: 2026-11-01"]);
    expect(chips.find((c) => c.label.includes("Delivery"))!.remove).toEqual({ tags: "a" });
  });
  it("busca de texto ignora acento e caixa e exige todas as palavras", () => {
    expect(matchesText(["Pedro Silva", "Fire alarm"], "pedro alarm")).toBe(true);
    expect(matchesText(["Ó Briain"], "o briain")).toBe(true);
    expect(matchesText(["abc"], "abc xyz")).toBe(false);
    expect(matchesText(["abc"], "")).toBe(true);
  });
});
