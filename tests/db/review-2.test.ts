// Revisão 2 (25/11): ajustes pedidos depois do Beta.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Db } from "./helpers";

let db: Db;
beforeEach(async () => {
  db = await Db.open();
});
afterEach(async () => {
  await db.close();
});

describe("Segunda etapa da gestão (item 3)", () => {
  it("com a chave desligada, o Admin entra só com e-mail e senha; ligada, precisa do código", async () => {
    const owner = await db.createStaff("owner", "Owner Sem Codigo");
    await db.asSuperuser();
    await db.query("delete from public.mfa_email_challenges where user_id = $1", [owner.userId]);
    await db.as(owner);
    expect((await db.one("select public.is_management() as m")).m).toBe(false);
    await db.asSuperuser();
    await db.query("insert into public.parameters (key, value, valid_from) values ('security.require_mfa_management', 'false', now() - interval '1 minute')");
    await db.as(owner);
    expect((await db.one("select public.is_management() as m")).m).toBe(true);
  });
});
