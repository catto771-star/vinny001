// Os avisos de push precisam chegar com o celular bloqueado e o app fechado: o Android (modo Doze) segura
// mensagens de prioridade normal até o aparelho acordar. Por isso o servidor envia com prioridade alta.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const fn = readFileSync("supabase/functions/send-push/index.ts", "utf8");
const sw = readFileSync("public/sw.js", "utf8");

describe("push com o app fechado", () => {
  it("send-push envia com urgency 'high' (fura o Doze do Android) e TTL", () => {
    const call = fn.slice(fn.indexOf("webpush.sendNotification"));
    expect(call).toMatch(/urgency:\s*"high"/);
    expect(call).toMatch(/TTL:\s*\d+/);
  });
  it("o service worker mostra a notificação dentro do evento push (funciona sem a página aberta)", () => {
    const handler = sw.slice(sw.indexOf('addEventListener("push"'), sw.indexOf('addEventListener("notificationclick"'));
    expect(handler).toMatch(/event\.waitUntil\(/);
    expect(handler).toMatch(/self\.registration\.showNotification/);
    expect(handler).not.toMatch(/clients\.matchAll/); // nunca depende de uma janela aberta
  });
});

describe("limite de notificações do Android", () => {
  it("o service worker mantém no máximo 40 avisos abertos e fecha os mais antigos antes de mostrar o novo", () => {
    const handler = sw.slice(sw.indexOf("const MAX_OPEN"), sw.indexOf('addEventListener("notificationclick"'));
    expect(handler).toMatch(/getNotifications\(\)/);
    expect(handler).toMatch(/MAX_OPEN\s*=\s*40|const MAX_OPEN/);
    expect(handler).toMatch(/\.close\(\)/);
    // limpa ANTES de mostrar o novo, para o novo nunca ser descartado pelo limite de 50 do Android
    expect(handler.indexOf("getNotifications")).toBeLessThan(handler.indexOf("showNotification"));
  });
});
