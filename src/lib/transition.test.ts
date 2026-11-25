import { describe, expect, it } from "vitest";
import { transitionKind } from "./transition";

describe("transições de tela (estilo iOS/Mac)", () => {
  it("entrar num detalhe empurra a tela da direita (push)", () => {
    expect(transitionKind("/residents", "/residents/123", "PUSH")).toBe("push");
  });
  it("voltar (botão voltar ou subir de nível) desliza da esquerda (pop)", () => {
    expect(transitionKind("/residents/123", "/residents", "PUSH")).toBe("pop");
    expect(transitionKind("/rota", "/handover", "POP")).toBe("pop");
  });
  it("trocar de seção pelo menu ou abas é um esmaecer rápido (fade)", () => {
    expect(transitionKind("/rota", "/handover", "PUSH")).toBe("fade");
    expect(transitionKind("/", "/seen", "PUSH")).toBe("fade");
    expect(transitionKind("/seen", "/", "REPLACE")).toBe("fade");
  });
  it("primeira tela ou mesma rota não anima", () => {
    expect(transitionKind(null, "/", "POP")).toBe("none");
    expect(transitionKind("/rota", "/rota", "PUSH")).toBe("none");
  });
});
