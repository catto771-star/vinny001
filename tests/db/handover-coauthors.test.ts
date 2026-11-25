// Revisão 8 — Handover: autor + até 3 colegas por anotação.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Db, type Actor } from "./helpers";

let db: Db;
let manager: Actor;
let author: Actor;
let c1: Actor, c2: Actor, c3: Actor, c4: Actor;
let amiens: string;

beforeEach(async () => {
  db = await Db.open();
  manager = await db.createStaff("manager", "Gestão");
  author = await db.createStaff("porter", "Autora");
  c1 = await db.createStaff("porter", "Colega 1");
  c2 = await db.createStaff("porter", "Colega 2");
  c3 = await db.createStaff("manager", "Colega 3");
  c4 = await db.createStaff("porter", "Colega 4");
  amiens = await db.lodgeId("AMIENS");
});
afterEach(async () => { await db.close(); });

const note = (co: string[] | null, filledBy: string | null = null) =>
  db.query("select public.add_handover_note($1, 'Fire alarm test done', now(), '[]'::jsonb, null, $2, null, $3::uuid[]) as id", [amiens, filledBy, co]);

describe("coautores no Handover", () => {
  it("grava até 3 colegas, em ordem, junto do autor", async () => {
    await db.as(manager);
    const id = (await note([c1.staffId, c2.staffId, c3.staffId], author.staffId)).rows[0].id;
    await db.asSuperuser();
    const rows = (await db.query<{ staff_id: string; position: number }>("select staff_id, position from public.handover_entry_staff where entry_id = $1 order by position", [id])).rows;
    expect(rows.map((r) => r.staff_id)).toEqual([c1.staffId, c2.staffId, c3.staffId]);
    expect(rows.map((r) => r.position)).toEqual([1, 2, 3]);
    expect((await db.one("select filled_by from public.handover_entries where id = $1", [id])).filled_by).toBe(author.staffId);
  });

  it("um quarto colega é recusado (máximo de 4 pessoas)", async () => {
    await db.as(manager);
    expect(await db.error("select public.add_handover_note($1, 'x', now(), '[]'::jsonb, null, $2, null, $3::uuid[])", [amiens, author.staffId, [c1.staffId, c2.staffId, c3.staffId, c4.staffId]])).toMatch(/too_many_authors/);
  });

  it("o autor repetido na lista é ignorado e a lista é desduplicada", async () => {
    await db.as(manager);
    const id = (await note([author.staffId, c1.staffId, c1.staffId], author.staffId)).rows[0].id;
    await db.asSuperuser();
    expect((await db.one("select count(*)::int as n from public.handover_entry_staff where entry_id = $1", [id])).n).toBe(1);
  });

  it("colega inativo, de outro perfil (limpeza) ou inexistente é recusado", async () => {
    const cleaner = await db.createStaff("cleaner", "Limpeza");
    await db.asSuperuser();
    await db.query("update public.staff set active = false where id = $1", [c4.staffId]);
    await db.as(manager);
    for (const bad of [c4.staffId, cleaner.staffId, "00000000-0000-0000-0000-000000000000"]) {
      expect(await db.error("select public.add_handover_note($1, 'x', now(), '[]'::jsonb, null, $2, null, $3::uuid[])", [amiens, author.staffId, [bad]])).toMatch(/invalid_co_author/);
    }
  });

  it("sem autor definido não há colegas", async () => {
    await db.as(manager);
    expect(await db.error("select public.add_handover_note($1, 'x', now(), '[]'::jsonb, null, null, null, $2::uuid[])", [amiens, [c1.staffId]])).toBeNull();
  });

  it("a chamada antiga (sem colegas) continua valendo", async () => {
    await db.as(manager);
    expect(await db.error("select public.add_handover_note($1, 'old call', now(), '[]'::jsonb, null)", [amiens])).toBeNull();
  });

  it("escrita direta na tabela é negada; a auditoria registra a inclusão", async () => {
    await db.as(manager);
    const id = (await note([c1.staffId], author.staffId)).rows[0].id;
    expect(await db.error("insert into public.handover_entry_staff (entry_id, staff_id, position) values ($1, $2, 2)", [id, c2.staffId])).toMatch(/permission denied|row-level/);
    await db.asSuperuser();
    expect((await db.one("select count(*)::int as n from public.audit_log where table_name = 'handover_entry_staff'")).n).toBeGreaterThan(0);
  });

  it("a ficha da pessoa (person_summary) inclui anotações em que ela foi colega", async () => {
    await db.as(manager);
    await note([c1.staffId], author.staffId);
    const sum = (await db.one("select public.person_summary($1) as s", [c1.staffId])).s;
    expect(sum.notes_recent).toHaveLength(1);
  });
});
