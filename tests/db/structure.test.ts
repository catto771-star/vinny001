// Revisão 13 — estrutura gerida pelo Admin: quartos, camas, geladeiras, máquinas e dados da casa.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Db, type Actor } from "./helpers";

let db: Db;
let admin: Actor, station: Actor;
let amiens: string, connolly: string;

beforeEach(async () => {
  db = await Db.open();
  admin = await db.createStaff("manager", "Gestão");
  station = await db.createStaff("station", "Amiens Reception");
  amiens = await db.lodgeId("AMIENS");
  connolly = await db.lodgeId("CONNOLLY");
});
afterEach(async () => { await db.close(); });

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const one = async <T = any>(sql: string, p: unknown[] = []): Promise<T> => (await db.one(sql, p)) as T;
const free = async (lodge: string) => Number((await db.one<{ n: string }>("select count(*) n from public.bed_occupancy where lodge_id = $1", [lodge])).n);

describe("quartos e camas", () => {
  it("cria um quarto com N camas numeradas; código repetido, vazio ou camas demais são recusados", async () => {
    await db.as(admin);
    const before = await free(amiens);
    const room = (await one<{ id: string }>("select public.add_room($1, 'Z9', 'room', 3) as id", [amiens])).id;
    expect(await free(amiens)).toBe(before + 3);
    const nums = (await db.query<{ number: number }>("select number from public.beds where room_id = $1 order by number", [room])).rows.map((r) => r.number);
    expect(nums).toEqual([1, 2, 3]);
    expect(await db.error("select public.add_room($1, 'Z9', 'room', 1)", [amiens])).toMatch(/room_exists/);
    expect(await db.error("select public.add_room($1, '  ', 'room', 1)", [amiens])).toMatch(/name_required/);
    expect(await db.error("select public.add_room($1, 'Z10', 'room', 13)", [amiens])).toMatch(/too_many_beds/);
    expect(await db.error("select public.add_room($1, 'Z11', 'castle', 1)", [amiens])).toMatch(/invalid_kind/);
  });
  it("add_bed pega o próximo número e respeita o máximo de 12", async () => {
    await db.as(admin);
    const room = (await one<{ id: string }>("select public.add_room($1, 'Z8', 'room', 11) as id", [amiens])).id;
    const bed = (await one<{ id: string }>("select public.add_bed($1) as id", [room])).id;
    expect((await one<{ number: number }>("select number from public.beds where id = $1", [bed])).number).toBe(12);
    expect(await db.error("select public.add_bed($1)", [room])).toMatch(/too_many_beds/);
  });
  it("renomeia o quarto; código repetido é recusado", async () => {
    await db.as(admin);
    const a = (await one<{ id: string }>("select public.add_room($1, 'Y1', 'room', 1) as id", [amiens])).id;
    await db.query("select public.add_room($1, 'Y2', 'room', 1)", [amiens]);
    expect(await db.error("select public.rename_room($1, 'Y2')", [a])).toMatch(/room_exists/);
    expect(await db.error("select public.rename_room($1, 'Y3')", [a])).toBeNull();
  });
  it("cama livre pode ser removida (some do mapa) e restaurada; cama ocupada não", async () => {
    await db.asSuperuser();
    const [bed] = await db.freeBeds("AMIENS");
    await db.as(admin);
    const stay = (await one<{ id: string }>("select public.admit_resident(p_pass_id => 'T' || substr(md5(random()::text), 1, 10), p_lodge => $1, p_bed => $2, p_first_name => 'Joana', p_last_name => 'Silva') as id", [amiens, bed])).id;
    expect(await db.error("select public.set_bed_active($1, false)", [bed])).toMatch(/bed_occupied/);
    await db.query("select public.decide_out($1, 'Left')", [stay]);
    await db.query("select public.effect_out($1)", [stay]);
    const before = await free(amiens);
    expect(await db.error("select public.set_bed_active($1, false)", [bed])).toBeNull();
    expect(await free(amiens)).toBe(before - 1);
    expect(await db.error("select public.set_bed_active($1, true)", [bed])).toBeNull();
    expect(await free(amiens)).toBe(before);
  });
  it("quarto com residente não é removido; vazio, sim", async () => {
    await db.asSuperuser();
    const [bed] = await db.freeBeds("AMIENS");
    const room = (await one<{ room_id: string }>("select room_id from public.beds where id = $1", [bed])).room_id;
    await db.as(admin);
    await db.query("select public.admit_resident(p_pass_id => 'T' || substr(md5(random()::text), 1, 10), p_lodge => $1, p_bed => $2, p_first_name => 'Rui', p_last_name => 'Costa')", [amiens, bed]);
    expect(await db.error("select public.set_room_active($1, false)", [room])).toMatch(/room_occupied/);
    const empty = (await one<{ id: string }>("select public.add_room($1, 'Q1', 'room', 2) as id", [amiens])).id;
    expect(await db.error("select public.set_room_active($1, false)", [empty])).toBeNull();
    expect((await one<{ n: string }>("select count(*) n from public.bed_occupancy where room_code = 'Q1'")).n).toBe("0");
  });
});

describe("geladeiras", () => {
  it("cria, renomeia, remove e restaura; leituras antigas ficam; geladeira removida não recebe leitura", async () => {
    await db.as(admin);
    const f = (await one<{ id: string }>("select public.add_fridge($1, 'Back-up fridge') as id", [amiens])).id;
    expect(await db.error("select public.record_fridge_reading($1, 3.5, null)", [f])).toBeNull();
    expect(await db.error("select public.rename_fridge($1, 'Cold room')", [f])).toBeNull();
    expect((await one<{ name: string }>("select name from public.fridges where id = $1", [f])).name).toBe("Cold room");
    expect(await db.error("select public.set_fridge_active($1, false)", [f])).toBeNull();
    expect(await db.error("select public.record_fridge_reading($1, 3.5, null)", [f])).toMatch(/fridge_not_found/);
    expect((await one<{ n: string }>("select count(*) n from public.fridge_readings where fridge_id = $1", [f])).n).toBe("1");
    expect(await db.error("select public.set_fridge_active($1, true)", [f])).toBeNull();
    expect(await db.error("select public.add_fridge($1, '')", [amiens])).toMatch(/name_required/);
  });
  it("cada geladeira nova ganha um código próprio, sem repetir", async () => {
    await db.as(admin);
    for (let i = 0; i < 3; i++) await db.query("select public.add_fridge($1, $2)", [connolly, `Extra ${i}`]);
    const codes = (await db.query<{ code: string }>("select code from public.fridges where lodge_id = $1", [connolly])).rows.map((r) => r.code);
    expect(new Set(codes).size).toBe(codes.length);
  });
});

describe("máquinas de lavar", () => {
  it("cria lavadora/secadora, renomeia e remove quando livre", async () => {
    await db.as(admin);
    const m = (await one<{ id: string }>("select public.add_laundry_machine($1, 'wash', 'C · Wash') as id", [connolly])).id;
    expect(await db.error("select public.add_laundry_machine($1, 'iron', 'X')", [connolly])).toMatch(/invalid_kind/);
    expect(await db.error("select public.rename_laundry_machine($1, 'C2 · Wash')", [m])).toBeNull();
    expect(await db.error("select public.set_laundry_machine_active($1, false)", [m])).toBeNull();
    expect((await one<{ n: string }>("select count(*) n from public.laundry_status($1) where machine_id = $2", [connolly, m])).n).toBe("0");
  });
  it("máquina em uso: remoção recusada (machine_busy)", async () => {
    await db.asSuperuser();
    const [bed] = await db.freeBeds("CONNOLLY");
    await db.as(admin);
    const stay = (await one<{ id: string }>("select public.admit_resident(p_pass_id => 'T' || substr(md5(random()::text), 1, 10), p_lodge => $1, p_bed => $2, p_first_name => 'Ana', p_last_name => 'Lima') as id", [connolly, bed])).id;
    const m = (await one<{ id: string }>("select public.add_laundry_machine($1, 'wash', 'D · Wash') as id", [connolly])).id;
    await db.query("select public.start_laundry($1, $2)", [m, stay]);
    expect(await db.error("select public.set_laundry_machine_active($1, false)", [m])).toMatch(/machine_busy/);
  });
});

describe("dados da casa", () => {
  it("Admin renomeia a casa e liga/desliga Dinner e Laundry; nome vazio ou longo é recusado", async () => {
    await db.as(admin);
    expect(await db.error("select public.update_lodge($1, 'Amiens Street', 'Amiens', true, true)", [amiens])).toBeNull();
    const l = await one<{ name: string; has_laundry: boolean }>("select name, has_laundry from public.lodges where id = $1", [amiens]);
    expect(l).toEqual({ name: "Amiens Street", has_laundry: true });
    expect(await db.error("select public.update_lodge($1, '', 'A', true, true)", [amiens])).toMatch(/name_required/);
    expect(await db.error("select public.update_lodge($1, $2, 'A', true, true)", [amiens, "x".repeat(61)])).toMatch(/invalid_name/);
  });
});

describe("segurança e auditoria", () => {
  it("conta de casa não altera a estrutura", async () => {
    await db.as(station);
    for (const sql of ["select public.add_room($1, 'S1', 'room', 1)", "select public.add_fridge($1, 'X')", "select public.add_laundry_machine($1, 'wash', 'X')", "select public.update_lodge($1, 'X', 'X', true, true)"]) {
      expect(await db.error(sql, [amiens]), sql).toMatch(/not_authorised/);
    }
  });
  it("cada mudança de estrutura fica no Audit", async () => {
    await db.as(admin);
    await db.query("select public.add_fridge($1, 'Audit fridge')", [amiens]);
    await db.asSuperuser();
    expect((await one<{ n: string }>("select count(*) n from public.audit_log where table_name = 'fridges' and new_data ->> 'name' = 'Audit fridge'")).n).toBe("1");
  });
});
