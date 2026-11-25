// Revisão 12 — mais configurações: nome de exibição (pessoal) e janela de tolerância do Room Check (Admin).
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Db, type Actor } from "./helpers";

let db: Db;
let manager: Actor, station: Actor;
let amiens: string;

beforeEach(async () => {
  db = await Db.open();
  manager = await db.createStaff("manager", "Gestão Silva");
  station = await db.createStaff("station", "Amiens Reception");
  amiens = await db.lodgeId("AMIENS");
});
afterEach(async () => { await db.close(); });

/** Põe um horário de check daqui a N minutos (hora de Dublin) e devolve o horário e o dia operacional. */
async function slotIn(minutes: number) {
  await db.asSuperuser();
  const r = await db.one<{ slot: string; day: string }>(
    `select to_char((now() + make_interval(mins => $1)) at time zone 'Europe/Dublin', 'HH24:MI') as slot, public.operational_day(now() + make_interval(mins => $1))::text as day`, [minutes]);
  await db.query("insert into public.parameters (key, value, valid_from) values ('presence.check_times', $1::jsonb, now() - interval '3 days')", [JSON.stringify([r.slot])]);
  return r;
}

describe("janela de tolerância do Room Check", () => {
  it("padrão 60 minutos; Admin muda de 5 a 180 e o banco recusa fora disso", async () => {
    await db.as(manager);
    expect((await db.one("select public.param_value('presence.check_window_minutes') as v")).v).toBe(60);
    expect(await db.error("select public.set_system_parameter('presence.check_window_minutes', '30'::jsonb)")).toBeNull();
    for (const bad of ["3", "181", '"30"', "30.5"]) {
      expect(await db.error(`select public.set_system_parameter('presence.check_window_minutes', '${bad}'::jsonb)`)).toMatch(/invalid_parameter/);
    }
  });
  it("com 60 min, abrir um check 45 min antes é aceito; com 30 min, é recusado", async () => {
    const { slot, day } = await slotIn(45);
    await db.as(manager);
    expect(await db.error("select public.open_room_check($1, $2::date, $3)", [amiens, day, slot])).toBeNull();
    await db.query("select public.set_system_parameter('presence.check_window_minutes', '30'::jsonb)");
    await db.asSuperuser();
    await db.query("delete from public.room_check_runs");
    await db.as(manager);
    expect(await db.error("select public.open_room_check($1, $2::date, $3)", [amiens, day, slot])).toMatch(/check_in_future/);
  });
  it("a ronda do Handover segue a mesma janela", async () => {
    await db.asSuperuser();
    const r = await db.one<{ slot: string; day: string }>("select to_char((now() + interval '45 minutes') at time zone 'Europe/Dublin','HH24:MI') as slot, public.operational_day(now() + interval '45 minutes')::text as day");
    await db.query("insert into public.parameters (key, value, valid_from) values ('rounds.hours', $1::jsonb, now() - interval '3 days')", [JSON.stringify([r.slot])]);
    await db.as(manager);
    expect(await db.error("select public.room_check_done($1, $2::date, $3)", [amiens, r.day, r.slot])).toBeNull();
    await db.query("select public.set_system_parameter('presence.check_window_minutes', '30'::jsonb)");
    await db.asSuperuser();
    await db.query("delete from public.handover_entries where kind = 'round'");
    await db.as(manager);
    expect(await db.error("select public.room_check_done($1, $2::date, $3)", [amiens, r.day, r.slot])).toMatch(/round_in_future/);
  });
});

describe("nome de exibição (pessoal)", () => {
  it("cada pessoa muda o próprio nome de exibição e pode limpar; só afeta a própria linha", async () => {
    await db.as(manager);
    expect(await db.error("select public.set_my_display_name('Siobhán')")).toBeNull();
    await db.asSuperuser();
    expect((await db.one("select display_name from public.staff where id = $1", [manager.staffId])).display_name).toBe("Siobhán");
    expect((await db.one("select display_name from public.staff where id = $1", [station.staffId])).display_name).toBeNull();
    await db.as(manager);
    expect(await db.error("select public.set_my_display_name('')")).toBeNull();
    await db.asSuperuser();
    expect((await db.one("select display_name from public.staff where id = $1", [manager.staffId])).display_name).toBeNull();
  });
  it("recusa nome com mais de 40 caracteres; a mudança fica na auditoria", async () => {
    await db.as(manager);
    expect(await db.error("select public.set_my_display_name($1)", ["x".repeat(41)])).toMatch(/invalid_name/);
    await db.query("select public.set_my_display_name('Siobhán')");
    await db.asSuperuser();
    expect((await db.one("select count(*)::int as n from public.audit_log where table_name = 'staff' and record_id = $1 and new_data ->> 'display_name' = 'Siobhán'", [manager.staffId])).n).toBe(1);
  });
});
