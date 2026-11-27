// Segunda etapa por código enviado por e-mail (em vez de autenticador com QR Code).
// Regra: Manager/Owner/Developer só têm permissões de gestão numa sessão aberta pelo
// código de e-mail, e esse código precisa ter sido pedido numa sessão com senha
// (assim quem só tem acesso ao e-mail, sem a senha, não entra).
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Db, type Actor } from "./helpers";

let db: Db;
let manager: Actor;
let porter: Actor;

beforeEach(async () => {
  db = await Db.open();
  manager = await db.createStaff("manager", "Gestão");
  porter = await db.createStaff("porter", "Porter");
  // Começa sem nenhum pedido de código para o Manager.
  await db.asSuperuser();
  await db.query("delete from public.mfa_email_challenges where user_id = $1", [manager.userId]);
});

afterEach(async () => {
  await db.close();
});

async function claims(actor: Actor, method: "password" | "otp", secondsFromNow = 0) {
  await db.asSuperuser();
  const ts = Math.floor(Date.now() / 1000) + secondsFromNow;
  await db.query("select set_config('request.jwt.claims', $1, true)", [
    JSON.stringify({ sub: actor.userId, role: "authenticated", amr: [{ method, timestamp: ts }] }),
  ]);
  await db.query("set local role authenticated");
}

const isManagement = async () => (await db.one<{ m: boolean }>("select public.is_management() as m")).m;

describe("Segunda etapa por código de e-mail", () => {
  it("Só a senha não dá permissões de gestão", async () => {
    await claims(manager, "password");
    expect(await isManagement()).toBe(false);
  });

  it("Senha → pede código → entra com o código: gestão liberada", async () => {
    await claims(manager, "password");
    await db.query("select public.begin_email_verification()");
    await claims(manager, "otp", 30);
    expect(await isManagement()).toBe(true);
  });

  it("Código de e-mail sem ter passado pela senha não vale (quem só tem o e-mail não entra)", async () => {
    await claims(manager, "otp");
    expect(await isManagement()).toBe(false);
  });

  it("Pedir o código exige uma sessão com senha", async () => {
    await claims(manager, "otp");
    expect(await db.error("select public.begin_email_verification()")).toMatch(/password_session_required/);
  });

  it("Código usado muito depois do pedido (mais de 15 min) não vale", async () => {
    await claims(manager, "password");
    await db.query("select public.begin_email_verification()");
    await claims(manager, "otp", 16 * 60);
    expect(await isManagement()).toBe(false);
  });

  it("Pedido de outra pessoa não serve para mim", async () => {
    const other = await db.createStaff("owner", "Outro");
    await claims(other, "password");
    await db.query("select public.begin_email_verification()");
    await claims(manager, "otp", 30);
    expect(await isManagement()).toBe(false);
  });

  it("Limite de pedidos: no máximo 5 em 15 minutos", async () => {
    await claims(manager, "password");
    for (let i = 0; i < 5; i++) await db.query("select public.begin_email_verification()");
    expect(await db.error("select public.begin_email_verification()")).toMatch(/too_many_code_requests/);
  });

  it("Porter não precisa da segunda etapa e não pede código", async () => {
    await claims(porter, "password");
    expect(await db.error("select public.begin_email_verification()")).toMatch(/not_required/);
    expect((await db.one("select public.is_active_staff() as a")).a).toBe(true);
  });

  it("mfa_satisfied informa à tela se falta o código", async () => {
    await claims(manager, "password");
    expect((await db.one("select public.mfa_satisfied() as m")).m).toBe(false);
    await claims(porter, "password");
    expect((await db.one("select public.mfa_satisfied() as m")).m).toBe(true);
  });

  it("Ninguém lê nem altera a tabela de pedidos de código", async () => {
    await claims(manager, "otp");
    expect(await db.error("select * from public.mfa_email_challenges")).toMatch(/permission denied/);
    expect(await db.error("insert into public.mfa_email_challenges (user_id) values ($1)", [manager.userId])).toMatch(/permission denied/);
  });
});

describe("Idioma do e-mail (B54)", () => {
  it("O idioma do cadastro vai para os dados do login, usados no modelo do e-mail", async () => {
    await db.as(porter);
    await db.query("select public.set_my_locale('pl-PL')");
    await db.asSuperuser();
    const r = await db.one("select raw_user_meta_data->>'locale' as locale from auth.users where id = $1", [porter.userId]);
    expect(r.locale).toBe("pl-PL");
  });

  it("Ao criar o cadastro, o idioma também é copiado", async () => {
    await db.asSuperuser();
    const r = await db.one("select raw_user_meta_data->>'locale' as locale from auth.users where id = $1", [manager.userId]);
    expect(r.locale).toBe("en-IE");
  });
});
