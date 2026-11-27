// Revisão 8 — busca no Handover por vários dias e filtros.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Db, type Actor } from "./helpers";

let db: Db;
let manager: Actor, ana: Actor, bruno: Actor;
let amiens: string, connolly: string;
let incident: string, delivery: string;

const search = (args: Record<string, unknown> = {}) => {
  const a = { lodge: amiens, from: "2000-01-01", to: "2000-01-02", q: null, kinds: null, tags: null, staff: null, resident: null, fn: null, voided: false, limit: 100, ...args };
  return db.query<{ id: string; body: string }>(
    "select id, body from public.search_handover($1, $2::date, $3::date, $4, $5::text[], $6::uuid[], $7, $8, $9, $10, $11)",
    [a.lodge, a.from, a.to, a.q, a.kinds, a.tags, a.staff, a.resident, a.fn, a.voided, a.limit],
  ).then((r) => r.rows);
};
const today = async () => (await db.one<{ d: string }>("select public.operational_day(now())::text as d")).d;

beforeEach(async () => {
  db = await Db.open();
  manager = await db.createStaff("manager", "Gestão");
  ana = await db.createStaff("porter", "Ana");
  bruno = await db.createStaff("porter", "Bruno");
  amiens = await db.lodgeId("AMIENS");
  connolly = await db.lodgeId("CONNOLLY");
  await db.asSuperuser();
  incident = (await db.one<{ id: string }>("select id from public.handover_tags where code = 'incident'")).id;
  delivery = (await db.one<{ id: string }>("select id from public.handover_tags where code = 'delivery'")).id;
  await db.as(manager);
  await db.query("select public.add_handover_note($1, 'Fire alarm test 100% done', now(), '[]'::jsonb, null, $2, $3::uuid[], $4::uuid[])", [amiens, ana.staffId, [incident], [bruno.staffId]]);
  await db.query("select public.add_handover_note($1, 'Tesco delivery arrived', now(), '[]'::jsonb, null, $2, $3::uuid[])", [amiens, bruno.staffId, [delivery]]);
  await db.query("select public.add_handover_note($1, 'Quiet night in Connolly', now(), '[]'::jsonb, null)", [connolly]);
});
afterEach(async () => { await db.close(); });

describe("search_handover", () => {
  it("sem filtros devolve tudo da casa no período; outra casa não aparece", async () => {
    const d = await today();
    const rows = await search({ from: d, to: d });
    expect(rows.map((r) => r.body).sort()).toEqual(["Fire alarm test 100% done", "Tesco delivery arrived"]);
  });
  it("texto: sem acento e sem diferenciar caixa; % e _ valem como letras", async () => {
    const d = await today();
    expect((await search({ from: d, to: d, q: "TESCO" })).map((r) => r.body)).toEqual(["Tesco delivery arrived"]);
    expect((await search({ from: d, to: d, q: "100%" })).map((r) => r.body)).toEqual(["Fire alarm test 100% done"]);
    expect(await search({ from: d, to: d, q: "%" })).toHaveLength(1);
    expect(await search({ from: d, to: d, q: "_" })).toHaveLength(0);
  });
  it("filtra por tag (qualquer uma), tipo e pessoa (autor ou colega)", async () => {
    const d = await today();
    expect((await search({ from: d, to: d, tags: [incident] })).map((r) => r.body)).toEqual(["Fire alarm test 100% done"]);
    expect(await search({ from: d, to: d, tags: [incident, delivery] })).toHaveLength(2);
    expect(await search({ from: d, to: d, kinds: ["round"] })).toHaveLength(0);
    expect(await search({ from: d, to: d, kinds: ["note"] })).toHaveLength(2);
    expect((await search({ from: d, to: d, staff: ana.staffId })).map((r) => r.body)).toEqual(["Fire alarm test 100% done"]);
    expect(await search({ from: d, to: d, staff: bruno.staffId })).toHaveLength(2); // autor de uma, colega da outra
  });
  it("período acima de 92 dias é recusado; limite é aparado em 100", async () => {
    await db.as(manager);
    expect(await db.error("select * from public.search_handover($1, '2026-01-01', '2026-06-01', null, null, null, null, null, null, false, 50)", [amiens])).toMatch(/range_too_large/);
    const d = await today();
    expect(await search({ from: d, to: d, limit: 100000 })).toHaveLength(2);
  });
  it("datas infinitas ou invertidas dão invalid_range (nunca erro cru de SQL)", async () => {
    await db.as(manager);
    for (const [f, t] of [["2026-11-20", "infinity"], ["-infinity", "2026-11-20"], ["2026-11-20", "2026-11-01"]]) {
      expect(await db.error("select * from public.search_handover($1, $2::date, $3::date)", [amiens, f, t])).toMatch(/invalid_range/);
    }
  });
  it("anotação anulada só aparece quando pedido", async () => {
    const d = await today();
    await db.asSuperuser();
    await db.query("update public.handover_entries set status = 'voided', void_reason = 'x' where body like 'Tesco%'");
    await db.as(manager);
    expect(await search({ from: d, to: d })).toHaveLength(1);
    expect(await search({ from: d, to: d, voided: true })).toHaveLength(2);
  });
});
