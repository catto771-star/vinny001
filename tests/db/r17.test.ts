// Revisão 17 — isolamento entre casas (perfil/evidência), conta da recepção e parâmetros que eram ignorados.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Db, type Actor } from "./helpers";

let db: Db;
let admin: Actor, amiensStation: Actor, connollyStation: Actor;
let amiens: string, connolly: string;
beforeEach(async () => {
  db = await Db.open();
  admin = await db.createStaff("manager", "Gestão");
  amiensStation = await db.createStaff("station", "Amiens Reception", { home: "AMIENS" });
  connollyStation = await db.createStaff("station", "Connolly Reception", { home: "CONNOLLY" });
  amiens = await db.lodgeId("AMIENS");
  connolly = await db.lodgeId("CONNOLLY");
});
afterEach(async () => { await db.close(); });

let n = 0;
async function admit(code: "AMIENS" | "CONNOLLY" = "AMIENS", name = "Pat") {
  const [bed] = await db.freeBeds(code);
  await db.as(admin);
  const lodge = code === "AMIENS" ? amiens : connolly;
  const stay = await db.one<{ id: string }>("select public.admit_resident(p_lodge => $1, p_bed => $2, p_first_name => $3, p_pass_id => $4, p_admitted_at => now() - interval '3 days') as id", [lodge, bed, name, `R17-${++n}-${Math.random().toString(36).slice(2, 7)}`]);
  await db.asSuperuser();
  return db.one<{ resident_id: string; id: string }>("select resident_id, id from public.stays where id = $1", [stay.id]);
}

describe("isolamento entre casas", () => {
  it("a conta de uma casa não abre o perfil de residente da outra; a própria casa e a gestão abrem", async () => {
    const { resident_id } = await admit("AMIENS");
    await db.as(connollyStation);
    expect(await db.error("select public.open_resident_profile($1)", [resident_id])).toMatch(/not_authorised/);
    await db.as(amiensStation);
    expect(await db.error("select public.open_resident_profile($1)", [resident_id])).toBeNull();
    await db.as(admin);
    expect(await db.error("select public.open_resident_profile($1)", [resident_id])).toBeNull();
  });
  it("a evidência de presença é interna (sem acesso direto pela API) e segue a mesma regra de visibilidade", async () => {
    const { resident_id } = await admit("AMIENS");
    await db.as(connollyStation);
    expect(await db.error("select * from public.resident_evidence($1, current_date)", [resident_id])).toMatch(/permission denied/);
    await db.asSuperuser();
    expect((await db.one<{ ok: boolean }>("select public.can_see_resident($1) ok", [resident_id])).ok).toBe(true);
    await db.as(connollyStation);
    expect((await db.one<{ ok: boolean }>("select public.can_see_resident($1) ok", [resident_id])).ok).toBe(false);
  });
  it("a busca por PASS ID de ex-residente continua funcionando entre casas (necessária para a re-admissão)", async () => {
    const { resident_id } = await admit("AMIENS");
    const pass = (await db.one<{ p: string }>("select pass_id p from public.residents where id = $1", [resident_id])).p;
    await db.as(connollyStation);
    const rows = await db.query("select * from public.find_former_resident($1)", [pass]);
    expect(rows.rows.length).toBe(1);
  });
});

describe("conta da recepção (station)", () => {
  it("só encerra chamado de manutenção da própria casa", async () => {
    await db.as(amiensStation);
    const r = (await db.one<{ r: { ticket_id: string } }>("select public.create_maintenance($1, 'Room 4', 'Broken window', 'normal', gen_random_uuid()) as r", [amiens])).r;
    await db.as(connollyStation);
    expect(await db.error("select public.maintenance_set_status($1, 'resolved', null, null)", [r.ticket_id])).toMatch(/not_authorised/);
    await db.as(amiensStation);
    expect(await db.error("select public.maintenance_set_status($1, 'resolved', null, null)", [r.ticket_id])).toBeNull();
    expect(await db.error("select public.maintenance_set_status($1, 'in_progress', null, null)", [r.ticket_id])).toMatch(/not_authorised/);
  });
  it("edita o cadastro de residente da própria casa e não o da outra", async () => {
    const { resident_id } = await admit("AMIENS");
    await db.as(amiensStation);
    expect((await db.query("update public.residents set first_name = 'Edited' where id = $1 returning id", [resident_id])).rows.length).toBe(1);
    await db.as(connollyStation);
    expect((await db.query("update public.residents set first_name = 'Hacked' where id = $1 returning id", [resident_id])).rows.length).toBe(0);
  });
});

describe("parâmetros que antes eram ignorados", () => {
  it("shift.day_start / shift.night_start definem o turno", async () => {
    const q = "select public.shift_of(('2026-01-15 06:30:00' || ' Europe/Dublin')::timestamptz) s, public.shift_of(('2026-01-15 19:30:00' || ' Europe/Dublin')::timestamptz) s2";
    await db.asSuperuser();
    expect(await db.one(q)).toMatchObject({ s: "night", s2: "night" });
    await db.query("insert into public.parameters (key, value) values ('shift.day_start', '\"06:00\"'), ('shift.night_start', '\"20:00\"')");
    expect(await db.one(q)).toMatchObject({ s: "day", s2: "day" });
  });
  it("maintenance.reminder_hours define a cadência do lembrete", async () => {
    await db.as(admin);
    const r = (await db.one<{ r: { ticket_id: string } }>("select public.create_maintenance($1, 'Room 4', 'Leak', 'normal', gen_random_uuid()) as r", [amiens])).r;
    await db.asSuperuser();
    await db.query("update public.maintenance_tickets set created_at = now() - interval '40 hours', deadline_at = now() - interval '30 hours' where id = $1", [r.ticket_id]);
    await db.query("update public.maintenance_events set at = now() - interval '10 hours' where ticket_id = $1", [r.ticket_id]);
    await db.as(admin);
    expect((await db.query("select * from public.maintenance_reminders()")).rows.length).toBe(0);
    await db.asSuperuser();
    await db.query("insert into public.parameters (key, value) values ('maintenance.reminder_hours', '6')");
    await db.as(admin);
    expect((await db.query("select * from public.maintenance_reminders()")).rows.length).toBe(1);
  });
  it("o alerta de validade das entregas tem padrão de 2 dias e pode ser alterado", async () => {
    await db.asSuperuser();
    expect((await db.one<{ v: string }>("select public.param_value('delivery.expiry_alert_days') #>> '{}' v")).v).toBe("2");
    await db.as(admin);
    expect(await db.error("select public.set_system_parameter('delivery.expiry_alert_days', '4')")).toBeNull();
  });
});
