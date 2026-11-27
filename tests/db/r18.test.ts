// Revisão 18 — lote A (moradores e ocorrências) e lote B (serviços, compras e push).
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Db, type Actor } from "./helpers";

let db: Db;
let admin: Actor, station: Actor;
let amiens: string;
beforeEach(async () => {
  db = await Db.open();
  admin = await db.createStaff("manager", "Gestão");
  station = await db.createStaff("station", "Amiens Reception", { home: "AMIENS" });
  amiens = await db.lodgeId("AMIENS");
});
afterEach(async () => { await db.close(); });

let n = 0;
async function admit(name = "Pat") {
  const [bed] = await db.freeBeds("AMIENS");
  await db.as(admin);
  const s = await db.one<{ id: string }>("select public.admit_resident(p_lodge => $1, p_bed => $2, p_first_name => $3, p_pass_id => $4, p_admitted_at => now() - interval '10 days') as id", [amiens, bed, name, `R18-${++n}-${Math.random().toString(36).slice(2, 7)}`]);
  await db.asSuperuser();
  return db.one<{ id: string; resident_id: string }>("select id, resident_id from public.stays where id = $1", [s.id]);
}
const daysAgo = (d: number) => new Date(Date.now() - d * 86_400_000).toISOString().slice(0, 10);

describe("lote A — moradores e ocorrências", () => {
  it("check já lançado não pode ser remarcado (avisa e bloqueia), nem pela gestão", async () => {
    const a = await admit("Ana");
    await db.as(admin);
    const run = (await db.one<{ id: string }>("select public.open_room_check($1, $2::date, '12:00') as id", [amiens, daysAgo(1)])).id;
    await db.query("select public.mark_resident($1, $2, 'seen')", [run, a.id]);
    await db.query("select public.launch_room_check($1)", [run]);
    expect(await db.error("select public.mark_resident($1, $2, 'not_seen')", [run, a.id])).toMatch(/run_launched/);
  });
  it("editar a nota mantém só as menções cujo nome continua no texto", async () => {
    const a = await admit("Ana");
    await db.as(admin);
    const id = (await db.one<{ id: string }>("select public.add_handover_note($1, 'Talked to @Ana and @Gestão', now(), $2::jsonb, null) as id", [amiens, JSON.stringify([{ resident_id: a.resident_id }, { staff_id: admin.staffId }])])).id;
    await db.query("select public.correct_handover_note($1, 'Talked to @Gestão only', $2::jsonb)", [id, JSON.stringify([{ staff_id: admin.staffId }])]);
    await db.asSuperuser();
    const m = await db.query("select resident_id, staff_id from public.handover_mentions where entry_id = $1", [id]);
    expect(m.rows).toEqual([{ resident_id: null, staff_id: admin.staffId }]);
  });
  it("corrigir sem informar menções não mexe nelas (compatível com o app antigo)", async () => {
    const a = await admit("Ana");
    await db.as(admin);
    const id = (await db.one<{ id: string }>("select public.add_handover_note($1, 'Hi @Ana', now(), $2::jsonb, null) as id", [amiens, JSON.stringify([{ resident_id: a.resident_id }])])).id;
    await db.query("select public.correct_handover_note($1, 'Hello @Ana')", [id]);
    await db.asSuperuser();
    expect((await db.query("select 1 from public.handover_mentions where entry_id = $1", [id])).rows.length).toBe(1);
  });
  it("quick_phrases foi removida (sem uso na interface)", async () => {
    await db.asSuperuser();
    expect((await db.one<{ t: string | null }>("select to_regclass('public.quick_phrases')::text t")).t).toBeNull();
  });
});

describe("lote B — serviços, compras e push", () => {
  const price = async () => {
    await db.as(admin);
  };
  async function order(status: "created" | "placed" | "awaiting" = "placed") {
    await db.asSuperuser();
    const o = await db.one<{ id: string }>("insert into public.shop_orders (delivery_date, status, created_by) values (current_date, $1, $2) returning id", [status, admin.staffId]);
    await db.query("insert into public.shop_order_lines (order_id, item_id, action, standard_qty, unit_price) select $1, id, 'standard', 2, 3 from public.shop_items limit 1", [o.id]);
    return o.id;
  }
  it("relatório de compras não conta pedido em rascunho (created), mas informa quantos há", async () => {
    await order("created");
    const placed = await order("placed");
    await price();
    const r = (await db.one<{ r: any }>("select public.report_purchases(current_date, current_date + 1) r")).r;
    expect(r.orders).toBe(1);
    expect(r.by_status.created).toBe(1);
    expect(placed).toBeTruthy();
  });
  it("pedido já entregue não aceita mais mudanças nas linhas", async () => {
    const o = await order("placed");
    await db.asSuperuser();
    await db.query("update public.shop_orders set status = 'delivered' where id = $1", [o]);
    const line = (await db.one<{ id: string }>("select id from public.shop_order_lines where order_id = $1 limit 1", [o])).id;
    await db.as(admin);
    expect(await db.error("select public.set_shop_line($1, 'more', 1, 2)", [line])).toMatch(/order_delivered/);
  });
  it("corrige temperatura de geladeira com motivo; fica registrado (quem, quando, por quê)", async () => {
    await db.as(admin);
    const fr = (await db.one<{ id: string }>("select id from public.fridges where lodge_id = $1 and active limit 1", [amiens])).id;
    const id = (await db.one<{ id: string }>("select public.record_fridge_reading($1, 9.5, null) as id", [fr])).id;
    expect(await db.error("select public.correct_fridge_reading($1, 3.2, '')", [id])).toMatch(/reason_required/);
    expect(await db.error("select public.correct_fridge_reading($1, 3.2, 'Typed wrong')", [id])).toBeNull();
    await db.asSuperuser();
    const r = await db.one("select temperature::float t, out_of_range, correction_reason, corrected_at is not null c from public.fridge_readings where id = $1", [id]);
    expect(r).toMatchObject({ t: 3.2, out_of_range: false, correction_reason: "Typed wrong", c: true });
  });
  it("corrige entrega e desvincula do pedido (só gestão); o pedido volta a aguardar entrega", async () => {
    await db.asSuperuser();
    const sup = (await db.one<{ id: string }>("select id from public.suppliers where links_order limit 1")).id;
    await db.as(station);
    const d = (await db.one<{ id: string }>("select public.record_food_delivery($1, 'Order', $2, null, null, null, null) as id", [amiens, sup])).id;
    const o = await order("placed");
    await db.as(admin);
    await db.query("select public.link_delivery_to_order($1, $2)", [d, o]);
    expect(await db.error("select public.unlink_delivery_from_order($1)", [d])).toBeNull();
    await db.asSuperuser();
    expect((await db.one("select status from public.shop_orders where id = $1", [o])).status).toBe("awaiting");
    expect((await db.one("select order_id from public.food_deliveries where id = $1", [d])).order_id).toBeNull();
    await db.as(station);
    expect(await db.error("select public.unlink_delivery_from_order($1)", [d])).toMatch(/not_authorised/);
    await db.as(admin);
    expect(await db.error("select public.correct_food_delivery($1, 'B1', null, null, 'Typo')", [d])).toBeNull();
    await db.asSuperuser();
    expect((await db.one("select batch from public.food_deliveries where id = $1", [d])).batch).toBe("B1");
  });
  it("todas as notificações da gestão geram push (entregas, limite de No Show, cobertura, férias)", async () => {
    await db.asSuperuser();
    for (const k of ["delivery_received", "delivery_expiring", "no_show_monthly_limit", "coverage_below_minimum", "vacation_conflict"]) {
      expect((await db.one<{ n: number }>("select cardinality(public.push_keys($1, '{}'::jsonb)) n", [k])).n).toBe(1);
      expect((await db.one<{ d: boolean }>("select public.push_default($1) d", [k])).d).toBe(true);
    }
  });
});
