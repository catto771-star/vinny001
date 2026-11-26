// Revisão 13 — cenários que cruzam a estrutura gerida pelo Admin com o uso no dia a dia.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Db, type Actor } from "./helpers";

let db: Db;
let admin: Actor, station: Actor, porter: Actor;
let amiens: string, connolly: string;

beforeEach(async () => {
  db = await Db.open();
  admin = await db.createStaff("manager", "Gestão");
  station = await db.createStaff("station", "Amiens Reception");
  porter = await db.createStaff("porter", "Pedro", { login: false });
  amiens = await db.lodgeId("AMIENS");
  connolly = await db.lodgeId("CONNOLLY");
});
afterEach(async () => { await db.close(); });

const val = async (sql: string, p: unknown[] = []) => (await db.one<{ v: string }>(sql, p)).v;

describe("estrutura removida não recebe uso novo", () => {
  it("não admite residente numa cama removida (nem de um quarto removido)", async () => {
    await db.as(admin);
    const room = (await db.one<{ id: string }>("select public.add_room($1, 'R1', 'room', 2) as id", [amiens])).id;
    const beds = (await db.query<{ id: string }>("select id from public.beds where room_id = $1 order by number", [room])).rows.map((r) => r.id);
    await db.query("select public.set_bed_active($1, false)", [beds[0]]);
    expect(await db.error("select public.admit_resident(p_lodge => $1, p_bed => $2, p_first_name => 'A', p_last_name => 'B')", [amiens, beds[0]])).toMatch(/bed_out_of_service/);
    await db.query("select public.set_room_active($1, false)", [room]);
    expect(await db.error("select public.admit_resident(p_lodge => $1, p_bed => $2, p_first_name => 'A', p_last_name => 'B')", [amiens, beds[1]])).toMatch(/bed_out_of_service/);
  });
  it("não transfere residente para cama removida", async () => {
    await db.asSuperuser();
    const [bed] = await db.freeBeds("AMIENS");
    await db.as(admin);
    const room = (await db.one<{ id: string }>("select public.add_room($1, 'R2', 'room', 1) as id", [amiens])).id;
    const target = (await db.one<{ id: string }>("select id from public.beds where room_id = $1", [room])).id;
    const stay = (await db.one<{ id: string }>("select public.admit_resident(p_lodge => $1, p_bed => $2, p_first_name => 'Rui', p_last_name => 'Costa') as id", [amiens, bed])).id;
    await db.query("select public.set_bed_active($1, false)", [target]);
    expect(await db.error("select public.transfer_resident($1, $2, null)", [stay, target])).toMatch(/bed_out_of_service/);
  });
  it("máquina removida não inicia lavagem", async () => {
    await db.as(admin);
    const m = (await db.one<{ id: string }>("select public.add_laundry_machine($1, 'wash', 'Z · Wash') as id", [connolly])).id;
    await db.query("select public.set_laundry_machine_active($1, false)", [m]);
    expect(await db.error("select public.start_laundry($1, null)", [m])).not.toBeNull();
  });
  it("cama removida some da folha do Room Check, do Seen e da contagem da Home", async () => {
    await db.as(admin);
    const total0 = Number(await val("select (public.home_dashboard() -> 'lodges' -> 0 ->> 'beds_total') as v"));
    const room = (await db.one<{ id: string }>("select public.add_room($1, 'R3', 'room', 2) as id", [amiens])).id;
    const total1 = Number(await val("select (select (l ->> 'beds_total') from jsonb_array_elements(public.home_dashboard() -> 'lodges') l where l ->> 'lodge_id' = $1) as v", [amiens]));
    expect(total1).toBeGreaterThanOrEqual(2);
    await db.query("select public.set_room_active($1, false)", [room]);
    const total2 = Number(await val("select (select (l ->> 'beds_total') from jsonb_array_elements(public.home_dashboard() -> 'lodges') l where l ->> 'lodge_id' = $1) as v", [amiens]));
    expect(total2).toBe(total1 - 2);
    void total0;
  });
});

describe("pessoas desativadas", () => {
  it("quem foi desativado não aparece como Author nem pode ser colega, mas as anotações antigas ficam", async () => {
    await db.as(admin);
    await db.query("select public.add_handover_note($1, 'Old note', now(), '[]'::jsonb, null, $2)", [amiens, porter.staffId]);
    await db.asSuperuser();
    await db.query("update public.staff set active = false where id = $1", [porter.staffId]);
    await db.as(admin);
    expect(await db.error("select public.add_handover_note($1, 'New', now(), '[]'::jsonb, null, $2)", [amiens, porter.staffId])).toMatch(/invalid_filled_by/);
    expect(await db.error("select public.add_handover_note($1, 'New', now(), '[]'::jsonb, null, $2, null, $3::uuid[])", [amiens, admin.staffId, [porter.staffId]])).toMatch(/invalid_co_author/);
    expect(Number(await val("select count(*)::text as v from public.handover_entries where body = 'Old note'"))).toBe(1);
  });
  it("Staff e Cleaner trabalham nas duas casas: turnos do Roster aceitam as duas, sem casa na pessoa", async () => {
    await db.as(admin);
    const day = (await db.one<{ d: string }>("select (public.operational_day(now()) + 3)::text as d")).d;
    for (const lodge of [amiens, connolly]) {
      expect(await db.error("select public.save_rota_shift(null, $1, $2, 'office', public.slot_instant($3::date, '07:00'), public.slot_instant($3::date, '19:00') - interval '0 minutes')", [porter.staffId, lodge, day]).then((e) => (e && /staff_overlap/.test(e) ? null : e))).toBeNull();
    }
  });
});

describe("conta de casa e estrutura", () => {
  it("a conta de casa enxerga as geladeiras novas da sua casa e não as da outra", async () => {
    await db.as(admin);
    await db.query("select public.add_fridge($1, 'Amiens spare')", [amiens]);
    await db.query("select public.add_fridge($1, 'Connolly spare')", [connolly]);
    await db.as(station);
    const names = (await db.query<{ name: string }>("select name from public.fridges where active")).rows.map((r) => r.name);
    expect(names).toContain("Amiens spare");
    expect(names).not.toContain("Connolly spare");
  });
});
