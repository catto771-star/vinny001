// Revisão 16: o service worker guarda o app para abrir sem internet e nunca guarda chamadas ao banco.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sw = readFileSync("public/sw.js", "utf8");
describe("service worker", () => {
  it("guarda a página inicial e responde com ela quando não há internet", () => {
    expect(sw).toMatch(/caches\.open\(SHELL\)/);
    expect(sw).toMatch(/req\.mode === "navigate"/);
    expect(sw).toMatch(/catch\(\(\) => caches\.match\("\/"\)/);
  });
  it("só mexe em arquivos do próprio site: o banco (outro domínio) passa direto", () => {
    expect(sw).toMatch(/url\.origin !== self\.location\.origin/);
  });
  it("mantém as notificações push", () => {
    expect(sw).toMatch(/addEventListener\("push"/);
    expect(sw).toMatch(/addEventListener\("notificationclick"/);
  });
});
