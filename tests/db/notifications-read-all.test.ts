// "Mark all as read" nas Notificações: marca só as do próprio usuário, só as que ele pode ver, e é repetível.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Db, type Actor } from "./helpers";

let db: Db;
let manager: Actor;
let owner: Actor;
let officeA: Actor;
let amiens: string;

beforeEach(async () => {
  db = await Db.open();
  manager = await db.createStaff("manager", "Gestão");
  owner = await db.createStaff("owner", "Dono");
  officeA = await db.createStaff("porter", "Office Amiens");
  amiens = await db.lodgeId("AMIENS");
  await db.as(officeA);
  await db.query("select public.assume_post('office', $1)", [amiens]);
  // três avisos para a gestão (geladeira fora da faixa, em temperaturas diferentes)
  for (const t of ["9.0", "9.5", "10.0"]) await db.query("select public.record_fridge_temperature($1, $2::numeric, null)", [amiens, t]);
});

afterEach(async () => {
  await db.close();
});

describe("mark_all_notifications_read", () => {
  it("marca todas as não lidas de uma vez e devolve quantas marcou", async () => {
    await db.as(manager);
    expect((await db.one("select public.unread_notifications_count() as n")).n).toBe(3);
    const r = await db.one<{ n: number }>("select public.mark_all_notifications_read() as n");
    expect(r.n).toBe(3);
    expect((await db.one("select public.unread_notifications_count() as n")).n).toBe(0);
    const list = await db.query("select read from public.my_notifications(50)");
    expect(list.rows.every((x) => x.read === true)).toBe(true);
  });

  it("repetir não marca de novo (devolve 0) e não duplica registros de leitura", async () => {
    await db.as(manager);
    await db.query("select public.mark_all_notifications_read()");
    expect((await db.one<{ n: number }>("select public.mark_all_notifications_read() as n")).n).toBe(0);
    expect((await db.one("select count(*)::int as n from public.notification_reads")).n).toBe(3);
  });

  it("só vale para quem clicou: a leitura de um Admin não marca a do outro", async () => {
    await db.as(manager);
    await db.query("select public.mark_all_notifications_read()");
    await db.as(owner);
    expect((await db.one("select public.unread_notifications_count() as n")).n).toBe(3);
  });

  it("respeita as notificações novas: o que chega depois continua não lido", async () => {
    await db.as(manager);
    await db.query("select public.mark_all_notifications_read()");
    await db.as(officeA);
    await db.query("select public.record_fridge_temperature($1, 11.0, null)", [amiens]);
    await db.as(manager);
    expect((await db.one("select public.unread_notifications_count() as n")).n).toBe(1);
  });

  it("conta da casa (Office) não tem avisos da gestão para marcar: devolve 0", async () => {
    await db.as(officeA);
    expect((await db.one<{ n: number }>("select public.mark_all_notifications_read() as n")).n).toBe(0);
  });
});
