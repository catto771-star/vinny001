// Revisão 14 — o Admin cria, renomeia, colore, ordena e define o aviso padrão das tags do Handover.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Db, type Actor } from "./helpers";

let db: Db;
let admin: Actor, station: Actor;
let amiens: string;

beforeEach(async () => {
  db = await Db.open();
  admin = await db.createStaff("manager", "Gestão");
  station = await db.createStaff("station", "Amiens Reception");
  amiens = await db.lodgeId("AMIENS");
});
afterEach(async () => { await db.close(); });

const add = (label: string, color = "grey", notify = false) => db.query<{ id: string }>("select public.add_handover_tag($1, $2, $3) as id", [label, color, notify]).then((r) => r.rows[0].id);
const tag = async (id: string) => db.one<{ code: string; label: string; color: string; sort_order: number; visible: boolean; notify_default: boolean }>("select code, label, color, sort_order, visible, notify_default from public.handover_tags where id = $1", [id]);

describe("add_handover_tag", () => {
  it("cria no fim da lista, visível, com código só de letras (compatível com as preferências de aviso)", async () => {
    await db.as(admin);
    const max = (await db.one<{ m: number }>("select max(sort_order) m from public.handover_tags")).m;
    const id = await add("Fire drill", "red", true);
    expect(await tag(id)).toEqual({ code: "fire_drill", label: "Fire drill", color: "red", sort_order: max + 1, visible: true, notify_default: true });
    expect(await db.error("select public.set_push_pref('tag:fire_drill', false)")).toBeNull();
  });
  it("rótulo sem letras ganha código genérico; códigos nunca se repetem", async () => {
    await db.as(admin);
    const a = await tag(await add("123"));
    const b = await tag(await add("456"));
    expect(a.code).toMatch(/^[a-z_]+$/);
    expect(new Set([a.code, b.code]).size).toBe(2);
    const x = await tag(await add("Fire-drill!"));
    const y = await tag(await add("Fire drill?"));
    expect(x.code).not.toBe(y.code);
    expect(y.code).toMatch(/^[a-z_]+$/);
  });
  it("recusa nome vazio, longo ou repetido (sem diferenciar caixa), cor inválida e passar de 20 tags", async () => {
    await db.as(admin);
    expect(await db.error("select public.add_handover_tag('  ', 'grey', false)")).toMatch(/name_required/);
    expect(await db.error("select public.add_handover_tag($1, 'grey', false)", ["x".repeat(31)])).toMatch(/invalid_name/);
    expect(await db.error("select public.add_handover_tag('delivery', 'grey', false)")).toMatch(/tag_exists/);
    expect(await db.error("select public.add_handover_tag('Pink', 'pink', false)")).toMatch(/invalid_color/);
    for (let i = 0; i < 12; i++) await add(`Extra ${String.fromCharCode(97 + i)}`);
    expect(await db.error("select public.add_handover_tag('One too many', 'grey', false)")).toMatch(/too_many_tags/);
  });
  it("conta de casa não cria tags", async () => {
    await db.as(station);
    expect(await db.error("select public.add_handover_tag('X', 'grey', false)")).toMatch(/not_authorised/);
  });
});

describe("update_handover_tag e move_handover_tag", () => {
  it("renomeia, muda a cor e o aviso padrão; nome repetido é recusado; o código não muda", async () => {
    await db.as(admin);
    const id = await add("Fire drill", "red");
    const code = (await tag(id)).code;
    expect(await db.error("select public.update_handover_tag($1, 'Evacuation drill', 'amber', true)", [id])).toBeNull();
    expect(await tag(id)).toMatchObject({ code, label: "Evacuation drill", color: "amber", notify_default: true });
    expect(await db.error("select public.update_handover_tag($1, 'Delivery', 'grey', false)", [id])).toMatch(/tag_exists/);
    expect(await db.error("select public.update_handover_tag($1, 'Evacuation drill', 'grey', false)", [id])).toBeNull();
  });
  it("sobe e desce trocando de lugar com a vizinha; no topo ou no fim não faz nada", async () => {
    await db.as(admin);
    const order = async () => (await db.query<{ code: string }>("select code from public.handover_tags order by sort_order")).rows.map((r) => r.code);
    const before = await order();
    const general = (await db.one<{ id: string }>("select id from public.handover_tags where code = 'general'")).id;
    await db.query("select public.move_handover_tag($1, -1)", [general]);
    const after = await order();
    expect(after[after.length - 2]).toBe("general");
    expect(after[after.length - 1]).toBe(before[before.length - 2]);
    await db.query("select public.move_handover_tag($1, 1)", [general]);
    expect(await order()).toEqual(before);
    await db.query("select public.move_handover_tag($1, 1)", [general]);
    expect(await order()).toEqual(before);
    const first = (await db.one<{ id: string }>("select id from public.handover_tags order by sort_order limit 1")).id;
    await db.query("select public.move_handover_tag($1, -1)", [first]);
    expect(await order()).toEqual(before);
  });
});

describe("tag nova no dia a dia", () => {
  it("anotação com uma tag que avisa por padrão gera a notificação com o código da tag", async () => {
    await db.as(admin);
    const id = await add("Fire drill", "red", true);
    await db.query("select public.add_handover_note($1, 'Drill done', now(), '[]'::jsonb, null, null, $2::uuid[])", [amiens, [id]]);
    await db.asSuperuser();
    const n = await db.one<{ tags: string[]; push: boolean }>(
      "select array(select jsonb_array_elements_text(payload -> 'tags')) tags, public.push_default('tag:fire_drill') push from public.notifications where kind = 'handover_tag' order by id desc limit 1");
    expect(n.tags).toContain("fire_drill");
    expect(n.push).toBe(true);
  });
  it("tag escondida some da escolha mas as anotações antigas continuam com ela (auditoria)", async () => {
    await db.as(admin);
    const id = await add("Fire drill");
    await db.query("select public.add_handover_note($1, 'Old', now(), '[]'::jsonb, null, null, $2::uuid[])", [amiens, [id]]);
    await db.query("select public.set_handover_tag($1, false)", [id]);
    expect(await db.error("select public.add_handover_note($1, 'New', now(), '[]'::jsonb, null, null, $2::uuid[])", [amiens, [id]])).toMatch(/invalid_tag/);
    expect((await db.one<{ n: string }>("select count(*) n from public.handover_entry_tags where tag_id = $1", [id])).n).toBe("1");
  });
});
