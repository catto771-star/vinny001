// A barra inferior do celular usa rótulos curtos (uma linha), em inglês; o menu lateral mantém os longos.
import { describe, expect, it } from "vitest";
import { BOTTOM_LABELS } from "./Layout";
import { translate } from "@/i18n";

describe("barra inferior (celular)", () => {
  it("cada atalho tem rótulo curto de uma palavra em inglês", () => {
    for (const locale of ["en-IE"] as const) {
      for (const key of Object.values(BOTTOM_LABELS)) {
        const text = translate(locale, key);
        expect(text.length, `${locale} ${key}`).toBeLessThanOrEqual(10);
        expect(text, `${locale} ${key}`).not.toMatch(/\s/);
      }
    }
  });
});
