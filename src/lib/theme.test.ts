// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { applyTheme, currentTheme, defaultTheme, initialTheme } from "./theme";

afterEach(() => window.localStorage.clear());

describe("modo claro/escuro", () => {
  it("padrão: escuro no celular e no app instalado, claro no computador", () => {
    expect(defaultTheme(390, false)).toBe("dark");
    expect(defaultTheme(1440, true)).toBe("dark");
    expect(defaultTheme(1440, false)).toBe("light");
  });
  it("a escolha da pessoa fica guardada e vale na próxima vez", () => {
    applyTheme("dark", true);
    expect(currentTheme()).toBe("dark");
    expect(initialTheme()).toBe("dark");
    applyTheme("light", true);
    expect(initialTheme()).toBe("light");
  });
});
