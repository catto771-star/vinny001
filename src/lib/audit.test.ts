import { describe, expect, it } from "vitest";
import { diffRecord } from "./audit";

describe("diffRecord", () => {
  it("lista só os campos alterados, ignorando versão", () => {
    expect(diffRecord({ a: 1, b: "x", version: 1 }, { a: 1, b: "y", version: 2 })).toEqual([{ field: "b", before: "x", after: "y" }]);
  });
  it("criação mostra todos os campos com antes nulo", () => {
    expect(diffRecord(null, { id: "1", name: "n" })).toEqual([{ field: "name", before: null, after: "n" }]);
  });
});
