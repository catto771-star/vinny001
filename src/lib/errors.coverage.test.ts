// Todo código de recusa do banco (raise exception '<codigo>') que uma pessoa pode provocar precisa de
// mensagem própria na interface; senão ela só vê "Algo deu errado". Os internos (a tela nunca os envia)
// ficam numa lista explícita.
import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { errorKey } from "./errors";

const INTERNAL = new Set([
  "invalid_priority", "invalid_status", "invalid_warning_type", "invalid_slot", "invalid_round_slot", "invalid_quantities",
  "invalid_performer", "audit_log_is_immutable", "not_required", "password_session_required",
]);

function codes(): string[] {
  const dir = "supabase/migrations";
  const found = new Set<string>();
  for (const f of readdirSync(dir).filter((x) => x.endsWith(".sql"))) {
    for (const m of readFileSync(`${dir}/${f}`, "utf8").matchAll(/raise exception '([a-z0-9_]+)'/g)) found.add(m[1]);
  }
  return [...found].sort();
}

describe("mensagens para os códigos de recusa do banco", () => {
  it("cada código que a pessoa pode provocar tem mensagem própria (não cai em 'generic')", () => {
    const missing = codes().filter((c) => !INTERNAL.has(c) && errorKey({ message: c }) === "errors.generic");
    expect(missing).toEqual([]);
  });
  it("a lista de internos não esconde um código que já tem mensagem (mantém a lista honesta)", () => {
    const stale = [...INTERNAL].filter((c) => errorKey({ message: c }) !== "errors.generic");
    expect(stale).toEqual([]);
  });
});
