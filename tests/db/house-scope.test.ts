// Revisão 8 — isolamento das casas: conta de casa (station) só vê e grava na própria casa; Admin vê as duas.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Db, type Actor } from "./helpers";

let db: Db;
let manager: Actor, stationA: Actor, stationNoHome: Actor;
let amiens: string, connolly: string;

beforeEach(async () => {
  db = await Db.open();
  manager = await db.createStaff("manager", "Gestão");
  stationA = await db.createStaff("station", "Amiens Reception");
  stationNoHome = await db.createStaff("station", "Sem Casa", { home: null });
  amiens = await db.lodgeId("AMIENS");
  connolly = await db.lodgeId("CONNOLLY");
  await db.asSuperuser();
  await db.query("update public.staff set home_lodge_id = $1 where id = $2", [amiens, stationA.staffId]);
  // dados nas duas casas
  await db.as(manager);
  await db.query("select public.add_handover_note($1, 'Note Amiens', now(), '[]'::jsonb, null)", [amiens]);
  await db.query("select public.add_handover_note($1, 'Note Connolly', now(), '[]'::jsonb, null)", [connolly]);
});
afterEach(async () => { await db.close(); });

const count = async (sql: string, params: unknown[] = []) => Number((await db.one<{ n: string }>(`select count(*)::int as n from ${sql}`, params)).n);

describe("conta de casa só vê a própria casa", () => {
  it("tabelas com lodge_id: só as linhas da casa dela", async () => {
    await db.as(stationA);
    expect(await count("public.handover_entries where lodge_id = $1", [amiens])).toBe(1);
    expect(await count("public.handover_entries where lodge_id = $1", [connolly])).toBe(0);
    expect(await count("public.lodges")).toBe(1);
    expect(await count("public.rooms where lodge_id = $1", [connolly])).toBe(0);
    expect(await count("public.stays where lodge_id = $1", [connolly])).toBe(0);
  });
  it("tabelas ligadas por pai (camas, residentes, menções) e a visão de camas também", async () => {
    await db.as(stationA);
    expect(await count("public.bed_occupancy where lodge_id = $1", [connolly])).toBe(0);
    expect(await count("public.bed_occupancy where lodge_id = $1", [amiens])).toBeGreaterThan(0);
    expect(await count("public.beds b join public.rooms r on r.id = b.room_id where r.lodge_id = $1", [connolly])).toBe(0);
  });
  it("funções de leitura recusam a outra casa", async () => {
    await db.as(stationA);
    for (const sql of [
      "select * from public.pending_counts($1)", "select * from public.maintenance_list($1)", "select * from public.laundry_status($1)",
      "select * from public.check_slots($1, current_date)", "select * from public.search_handover($1, current_date, current_date)",
    ]) expect(await db.error(sql, [connolly]), sql).toMatch(/not_authorised/);
    expect(await db.error("select * from public.pending_counts($1)", [amiens])).toBeNull();
  });
  it("gravar na outra casa é recusado; na própria casa funciona", async () => {
    await db.as(stationA);
    expect(await db.error("select public.add_handover_note($1, 'x', now(), '[]'::jsonb, null)", [connolly])).toMatch(/not_authorised/);
    expect(await db.error("select public.add_handover_note($1, 'ok', now(), '[]'::jsonb, null)", [amiens])).toBeNull();
  });
  it("painel da Home só traz a casa dela", async () => {
    await db.as(stationA);
    const d = (await db.one("select public.home_dashboard() as d")).d;
    expect(d.lodges).toHaveLength(1);
    expect(d.lodges[0].lodge_id).toBe(amiens);
  });
  it("conta de casa sem casa definida não vê nada (falha fechada)", async () => {
    await db.as(stationNoHome);
    expect(await count("public.handover_entries")).toBe(0);
    expect(await count("public.lodges")).toBe(0);
  });
  it("Admin continua vendo e gravando nas duas casas", async () => {
    await db.as(manager);
    expect(await count("public.lodges")).toBe(2);
    expect(await count("public.handover_entries")).toBeGreaterThanOrEqual(2);
    expect(await db.error("select * from public.pending_counts($1)", [connolly])).toBeNull();
    expect(await db.error("select public.add_handover_note($1, 'adm', now(), '[]'::jsonb, null)", [connolly])).toBeNull();
  });
  it("o turno de Float aberto continua visível nas duas casas", async () => {
    await db.as(manager);
    const float = await db.createStaff("porter", "Float Person");
    await db.as(manager);
    await db.query("select public.open_handover_shift($1, $2, 'float')", [connolly, float.staffId]);
    await db.as(stationA);
    expect(await count("public.handover_shifts where function = 'float' and closed_at is null")).toBe(1);
  });
  it("toda tabela com lodge_id tem política restritiva de casa (tabelas novas não podem esquecer)", async () => {
    await db.asSuperuser();
    const rows = (await db.query<{ t: string }>(
      `select c.table_name as t from information_schema.columns c
       join information_schema.tables x on x.table_name = c.table_name and x.table_schema = 'public' and x.table_type = 'BASE TABLE'
       where c.table_schema = 'public' and c.column_name = 'lodge_id'
         and not exists (select 1 from pg_policies p where p.schemaname = 'public' and p.tablename = c.table_name and p.permissive = 'RESTRICTIVE')`)).rows;
    expect(rows.map((r) => r.t)).toEqual([]);
  });
});
