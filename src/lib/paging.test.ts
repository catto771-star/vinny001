import { describe, expect, it } from "vitest";
import { fetchAllPages } from "./paging";

describe("fetchAllPages", () => {
  it("junta todas as páginas até a última vir incompleta", async () => {
    const data = Array.from({ length: 2500 }, (_, i) => i);
    const calls: Array<[number, number]> = [];
    const out = await fetchAllPages(async (from, to) => { calls.push([from, to]); return data.slice(from, to + 1); });
    expect(out).toHaveLength(2500);
    expect(calls).toEqual([[0, 999], [1000, 1999], [2000, 2999]]);
  });
  it("não pede página extra quando o total é múltiplo exato mais uma página vazia", async () => {
    const data = Array.from({ length: 1000 }, (_, i) => i);
    const out = await fetchAllPages(async (from, to) => data.slice(from, to + 1));
    expect(out).toHaveLength(1000);
  });
});
