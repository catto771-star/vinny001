// Beta — perfis Staff (conta da casa) e Admin; "preenchido por" no Handover; horas pelo Roster (escopo 2 e 4.3).
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Db, type Actor } from "./helpers";

let db: Db;
let admin: Actor;
let station: Actor; // conta da casa (login institucional de Amiens)
let pedro: Actor; // Porter sem login
let ana: Actor; // Porter sem login
let cleaner: Actor;
let amiens: string;
let connolly: string;

beforeEach(async () => {
  db = await Db.open();
  admin = await db.createStaff("manager", "Admin");
  station = await db.createStaff("station", "Amiens Reception");
  pedro = await db.createStaff("porter", "Pedro", { login: false });
  ana = await db.createStaff("porter", "Ana", { login: false });
  cleaner = await db.createStaff("cleaner", "Clara");
  amiens = await db.lodgeId("AMIENS");
  connolly = await db.lodgeId("CONNOLLY");
  await db.asSuperuser();
  await db.query("update public.staff set home_lodge_id = $1 where id = $2", [amiens, station.staffId]);
});

afterEach(async () => {
  await db.close();
});

/** Turno publicado no Roster (horários em UTC). */
async function shift(staff: Actor, fn: "office" | "float" | "cleaner", lodge: string | null, start: string, end: string) {
  await db.as(admin);
  const id = (await db.one<{ id: string }>("select public.save_rota_shift(null, $1, $2, $3, $4::timestamptz, $5::timestamptz) as id", [staff.staffId, lodge, fn, start, end])).id;
  await db.query("select public.publish_rota($1::timestamptz, $2::timestamptz)", [start, end]);
  return id;
}

const iso = (d: Date) => d.toISOString();
const hoursAgo = (h: number) => new Date(Date.now() - h * 3_600_000);

describe("Conta da casa (Staff)", () => {
  it("lança nas duas casas sem assumir posto (Float troca de casa sem sair) e não acessa a gestão", async () => {
    await db.as(station);
    expect(await db.error("select public.add_handover_note($1, 'Quiet night', null, '[]'::jsonb, null, null)", [amiens])).toBeNull();
    expect(await db.error("select public.add_handover_note($1, 'Float visit', null, '[]'::jsonb, null, null)", [connolly])).toBeNull();
    expect(await db.error("select public.assume_post('office', $1)", [amiens])).toMatch(/role_cannot_take_office/);
    expect(await db.error("select public.save_rota_shift(null, $1, $2, 'office', now(), now() + interval '1 hour')", [pedro.staffId, amiens])).toMatch(/not_authorised/);
    expect(await db.error("select * from public.staff_hours(now() - interval '1 day', now())")).toMatch(/not_authorised/);
    expect((await db.one("select public.is_management() as m")).m).toBe(false);
  });
});

describe("Handover: quem está preenchendo", () => {
  it("sem escolha, vem a pessoa escalada no Roster (Office da casa); a escolha manual é gravada", async () => {
    await shift(pedro, "office", amiens, iso(hoursAgo(2)), iso(hoursAgo(-6)));
    await db.as(station);
    const auto = (await db.one<{ id: string }>("select public.add_handover_note($1, 'Bins out', null, '[]'::jsonb, null, null) as id", [amiens])).id;
    const manual = (await db.one<{ id: string }>("select public.add_handover_note($1, 'Covered the desk', null, '[]'::jsonb, null, $2) as id", [amiens, ana.staffId])).id;
    await db.asSuperuser();
    const rows = (await db.query<{ id: string; filled_by: string; author_id: string }>("select id, filled_by, author_id from public.handover_entries where id = any($1)", [[auto, manual]])).rows;
    expect(rows.find((r) => r.id === auto)).toMatchObject({ filled_by: pedro.staffId, author_id: station.staffId });
    expect(rows.find((r) => r.id === manual)!.filled_by).toBe(ana.staffId);
    await db.as(station);
    expect(await db.error("select filled_by from public.handover_entries where id = $1", [manual])).toBeNull();
  });

  it("sem Office escalado, vem o Float; quem preenche precisa ser uma pessoa da equipe (não a conta da casa nem Cleaner)", async () => {
    await shift(ana, "float", null, iso(hoursAgo(1)), iso(hoursAgo(-5)));
    await db.as(station);
    expect((await db.one("select public.on_duty_staff($1, now()) as s", [connolly])).s).toBe(ana.staffId);
    expect(await db.error("select public.add_handover_note($1, 'x', null, '[]'::jsonb, null, $2)", [amiens, station.staffId])).toMatch(/invalid_filled_by/);
    expect(await db.error("select public.add_handover_note($1, 'x', null, '[]'::jsonb, null, $2)", [amiens, cleaner.staffId])).toMatch(/invalid_filled_by/);
    expect(await db.error("select public.add_handover_note($1, 'x', null, '[]'::jsonb, null, gen_random_uuid())", [amiens])).toMatch(/invalid_filled_by/);
  });
});

describe("Roster: horas previstas × trabalhadas", () => {
  it("saída antecipada às 12h coberta por outra pessoa até as 19h: previsto e trabalhado de cada um", async () => {
    // Turno de 12 h que já terminou (há 2 dias).
    const start = new Date(Date.now() - 2 * 86_400_000);
    start.setUTCHours(7, 0, 0, 0);
    const end = new Date(start.getTime() + 12 * 3_600_000);
    const noon = new Date(start.getTime() + 5 * 3_600_000);
    const original = await shift(pedro, "office", amiens, iso(start), iso(end));
    await db.as(admin);
    const cover = (await db.one<{ id: string }>("select public.split_rota_shift($1, $2::timestamptz, $3) as id", [original, iso(noon), ana.staffId])).id;
    await db.asSuperuser();
    const rows = (await db.query("select id, staff_id, starts_at, ends_at, status, planned_starts_at, planned_ends_at from public.rota_shifts where id = any($1)", [[original, cover]])).rows;
    const o = rows.find((r) => r.id === original)!;
    const c = rows.find((r) => r.id === cover)!;
    expect(new Date(o.ends_at).getTime()).toBe(noon.getTime());
    expect(new Date(o.planned_ends_at).getTime()).toBe(end.getTime());
    expect(c).toMatchObject({ staff_id: ana.staffId, status: "published", planned_starts_at: null });
    expect(new Date(c.starts_at).getTime()).toBe(noon.getTime());
    expect(new Date(c.ends_at).getTime()).toBe(end.getTime());

    await db.as(admin);
    const hours = (await db.query<{ staff_id: string; planned_minutes: number; effective_minutes: number }>(
      "select staff_id, planned_minutes, effective_minutes from public.staff_hours($1::timestamptz, $2::timestamptz)", [iso(new Date(start.getTime() - 3_600_000)), iso(new Date(end.getTime() + 3_600_000))])).rows;
    expect(hours.find((h) => h.staff_id === pedro.staffId)).toMatchObject({ planned_minutes: 720, effective_minutes: 300 });
    expect(hours.find((h) => h.staff_id === ana.staffId)).toMatchObject({ planned_minutes: 0, effective_minutes: 420 });
  });

  it("turno publicado e cancelado (falta) conta no previsto e não no trabalhado; rascunho cancelado não conta", async () => {
    const start = new Date(Date.now() - 3 * 86_400_000);
    start.setUTCHours(19, 0, 0, 0);
    const end = new Date(start.getTime() + 12 * 3_600_000);
    const s = await shift(pedro, "office", connolly, iso(start), iso(end));
    await db.as(admin);
    await db.query("select public.cancel_rota_shift($1)", [s]);
    const draft = (await db.one<{ id: string }>("select public.save_rota_shift(null, $1, $2, 'office', $3::timestamptz, $4::timestamptz) as id", [ana.staffId, connolly, iso(start), iso(end)])).id;
    await db.query("select public.cancel_rota_shift($1)", [draft]);
    const hours = (await db.query<{ staff_id: string; planned_minutes: number; effective_minutes: number }>(
      "select staff_id, planned_minutes, effective_minutes from public.staff_hours($1::timestamptz, $2::timestamptz)", [iso(start), iso(end)])).rows;
    expect(hours.find((h) => h.staff_id === pedro.staffId)).toMatchObject({ planned_minutes: 720, effective_minutes: 0 });
    expect(hours.find((h) => h.staff_id === ana.staffId)).toMatchObject({ planned_minutes: 0, effective_minutes: 0 });
  });

  it("divisão fora do turno ou para quem não pode cobrir é recusada", async () => {
    const start = new Date(Date.now() - 4 * 86_400_000);
    start.setUTCHours(7, 0, 0, 0);
    const end = new Date(start.getTime() + 12 * 3_600_000);
    const s = await shift(pedro, "office", amiens, iso(start), iso(end));
    await db.as(admin);
    expect(await db.error("select public.split_rota_shift($1, $2::timestamptz, $3)", [s, iso(end), ana.staffId])).toMatch(/invalid_split_time/);
    expect(await db.error("select public.split_rota_shift($1, $2::timestamptz, $3)", [s, iso(new Date(start.getTime() + 3_600_000)), cleaner.staffId])).toMatch(/role_not_allowed/);
    await db.as(station);
    expect(await db.error("select public.split_rota_shift($1, $2::timestamptz, $3)", [s, iso(new Date(start.getTime() + 3_600_000)), ana.staffId])).toMatch(/not_authorised/);
  });
});
