import { describe, expect, it } from "vitest";
import { generateTemporaryPassword, passwordAcceptable } from "./password";

describe("senhas", () => {
  it("regras de senha forte", () => {
    expect(passwordAcceptable("short1")).toBe(false);
    expect(passwordAcceptable("onlyletterslong")).toBe(false);
    expect(passwordAcceptable("1234567890")).toBe(false);
    expect(passwordAcceptable("lodge2026dublin")).toBe(true);
  });
  it("primeira senha gerada sempre cumpre as regras", () => {
    for (let i = 0; i < 200; i++) expect(passwordAcceptable(generateTemporaryPassword())).toBe(true);
  });
});
