// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { groupIndexOfPath, nextOpen, readOpen, writeOpen } from "./navGroups";

const GROUPS = [["/", "/tasks", "/notifications"], ["/residents", "/sheet", "/no-shows"], ["/handover", "/maintenance"]];
afterEach(() => { window.localStorage.clear(); vi.restoreAllMocks(); });

describe("menu lateral retraído", () => {
  it("acha o grupo da rota ativa, inclusive em telas de detalhe", () => {
    expect(groupIndexOfPath(GROUPS, "/handover")).toBe(2);
    expect(groupIndexOfPath(GROUPS, "/residents/123")).toBe(1);
    expect(groupIndexOfPath(GROUPS, "/")).toBe(0);
    expect(groupIndexOfPath(GROUPS, "/desconhecida")).toBe(-1);
  });
  it("alterna abrir e fechar sem repetir", () => {
    expect(nextOpen([], "a")).toEqual(["a"]);
    expect(nextOpen(["a", "b"], "a")).toEqual(["b"]);
  });
  it("guarda e lê o estado; armazenamento quebrado não derruba", () => {
    writeOpen(["nav.groupOccurrences"]);
    expect(readOpen()).toEqual(["nav.groupOccurrences"]);
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("blocked"); });
    expect(() => writeOpen(["x"])).not.toThrow();
    vi.restoreAllMocks();
    window.localStorage.setItem("nav.open", "{lixo");
    expect(readOpen()).toEqual([]);
  });
});
