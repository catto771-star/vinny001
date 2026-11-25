// Revisão 12 — Audit: busca com filtros, paginação e proteção (só Admin).
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Db, type Actor } from "./helpers";

let db: Db;
let manager: Actor, other: Actor, station: Actor;
let amiens: string;

type Row = { id: number; action: string; table_name: string; record_id: string; actor_name: string | null; occurred_at: string };
const search = (a: Record<string, unknown> = {}) => {
  const v = { from: null, to: null, tables: null, actions: null, actor: null, record: null, q: null, limit: 100, before: null, ...a };
  return db.query<Row>("select * from public.search_audit($1, $2, $3::text[], $4::text[], $5, $6, $7, $8, $9)", [v.from, v.to, v.tables, v.actions, v.actor, v.record, v.q, v.limit, v.before]).then((r) => r.rows);
};

beforeEach(async () => {
  db = await Db.open();
  manager = await db.createStaff("manager", "Gestão");
  other = await db.createStaff("owner", "Dona");
  station = await db.createStaff("station", "Amiens Reception");
  amiens = await db.lodgeId("AMIENS");
  await db.as(manager);
  await db.query("select public.set_system_parameter('security.session_idle_minutes', '30'::jsonb)");
  await db.query("select public.add_handover_note($1, 'Fire alarm test', now(), '[]'::jsonb, null)", [amiens]);
  await db.as(other);
  await db.query("select public.set_system_parameter('maintenance.reminder_hours', '12'::jsonb)");
});
afterEach(async () => { await db.close(); });

describe("search_audit", () => {
  it("sem filtros devolve as mudanças recentes, da mais nova para a mais antiga, com o nome de quem fez", async () => {
    await db.as(manager);
    const rows = await search();
    expect(rows.length).toBeGreaterThanOrEqual(3);
    expect(rows.map((r) => r.id)).toEqual([...rows.map((r) => r.id)].sort((a, b) => b - a));
    expect(rows.find((r) => r.table_name === "parameters")?.actor_name).toBeTruthy();
  });
  it("filtra por módulo (tabela), ação e pessoa", async () => {
    await db.as(manager);
    expect((await search({ tables: ["handover_entries"] })).every((r) => r.table_name === "handover_entries")).toBe(true);
    expect((await search({ tables: ["parameters"], actor: other.staffId })).length).toBe(1);
    expect((await search({ actions: ["DELETE"] })).length).toBe(0);
    expect((await search({ actions: ["INSERT"], tables: ["parameters"], actor: manager.staffId })).length).toBe(1);
  });
  it("texto: procura nos valores (sem diferenciar caixa) e trata % e _ como letras", async () => {
    await db.as(manager);
    expect((await search({ q: "FIRE ALARM" })).length).toBeGreaterThanOrEqual(1);
    expect((await search({ q: "reminder_hours", actor: other.staffId })).length).toBe(1);
    expect((await search({ q: "100%" })).length).toBe(0);
    expect((await search({ q: "%" })).length).toBe(0);
  });
  it("histórico de um registro pelo record_id", async () => {
    await db.as(manager);
    const entry = (await db.one<{ record_id: string }>("select record_id from public.search_audit() where table_name = 'handover_entries' limit 1")).record_id;
    expect((await search({ record: entry })).every((r) => r.record_id === entry)).toBe(true);
    expect((await search({ record: "nao-existe" })).length).toBe(0);
  });
  it("paginação por before: sem repetir linhas", async () => {
    await db.as(manager);
    const first = await search({ limit: 2 });
    const next = await search({ limit: 2, before: first[first.length - 1].id });
    expect(next.every((r) => r.id < first[first.length - 1].id)).toBe(true);
    expect(new Set([...first, ...next].map((r) => r.id)).size).toBe(first.length + next.length);
  });
  it("período: invertido ou acima de 366 dias é recusado; limite é aparado em 500", async () => {
    await db.as(manager);
    expect(await db.error("select * from public.search_audit('2026-11-02', '2026-11-01')")).toMatch(/invalid_range/);
    expect(await db.error("select * from public.search_audit('2025-01-01', '2026-11-01')")).toMatch(/range_too_large/);
    expect(await db.error("select * from public.search_audit(null, null, null, null, null, null, null, 100000)")).toBeNull();
  });
  it("só Admin consulta (conta de casa recebe not_authorised)", async () => {
    await db.as(station);
    expect(await db.error("select * from public.search_audit()")).toMatch(/not_authorised/);
    expect(await db.error("select * from public.search_access_log()")).toMatch(/not_authorised/);
  });
  it("datas infinitas dão invalid_range", async () => {
    await db.as(manager);
    expect(await db.error("select * from public.search_audit('-infinity', null)")).toMatch(/invalid_range/);
  });
});

describe("search_access_log", () => {
  it("lista quem abriu o perfil de quem, com filtro por pessoa e por nome do residente", async () => {
    await db.asSuperuser();
    const [bed] = await db.freeBeds("AMIENS");
    await db.as(manager);
    const stay = (await db.one<{ id: string }>("select public.admit_resident(p_lodge => $1, p_bed => $2, p_first_name => 'Joana', p_last_name => 'Silva') as id", [amiens, bed])).id;
    await db.asSuperuser();
    const resident = (await db.one<{ resident_id: string }>("select resident_id from public.stays where id = $1", [stay])).resident_id;
    await db.query("insert into public.access_log (actor_staff_id, resident_id, context) values ($1, $2, 'profile')", [manager.staffId, resident]);
    await db.as(manager);
    const all = (await db.query("select * from public.search_access_log()")).rows;
    expect(all).toHaveLength(1);
    expect((await db.query("select * from public.search_access_log(null, null, $1)", [other.staffId])).rows).toHaveLength(0);
    expect((await db.query("select * from public.search_access_log(null, null, null, 'joana')")).rows).toHaveLength(1);
    expect((await db.query("select * from public.search_access_log(null, null, null, 'zzz')")).rows).toHaveLength(0);
    expect((all[0] as { resident_name: string }).resident_name).toBe("Joana Silva");
  });
});
