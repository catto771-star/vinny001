// @vitest-environment jsdom
// Revisão 11: antes do login (ou sem casa) o tema usa a paleta de Amiens — sem isso a tela de login perde fundo, campos e botão.
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

let lodges: unknown[] = [];
vi.mock("@/auth/AuthProvider", () => ({
  useAuth: () => ({ lodges, post: null, staff: null, isManagement: false }),
}));
import { ActiveLodgeProvider } from "./activeLodge";
import { DEFAULT_HOUSE, ensureHouse } from "./theme";

afterEach(() => { cleanup(); delete document.documentElement.dataset.house; lodges = []; });

describe("casa padrão do tema", () => {
  it("ensureHouse define Amiens quando não há casa e não mexe em uma casa já definida", () => {
    delete document.documentElement.dataset.house;
    ensureHouse();
    expect(document.documentElement.dataset.house).toBe(DEFAULT_HOUSE);
    document.documentElement.dataset.house = "connolly";
    ensureHouse();
    expect(document.documentElement.dataset.house).toBe("connolly");
  });
  it("sem Lodges carregados (login), a casa ativa não apaga a paleta", () => {
    lodges = [];
    render(<ActiveLodgeProvider><span /></ActiveLodgeProvider>);
    expect(document.documentElement.dataset.house).toBe("amiens");
  });
});
