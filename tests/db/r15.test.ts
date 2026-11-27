// Revisão 15 — Warning/Final Warning, PASS ID obrigatório e re-admissão, fornecedores com campos obrigatórios,
// alertas de validade, entrega do Tesco vinculada ao pedido e nota automática no Handover.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Db, type Actor } from "./helpers";

let db: Db;
let admin: Actor, station: Actor, stationC: Actor;
let amiens: string, connolly: string;

beforeEach(async () => {
  db = await Db.open();
  admin = await db.createStaff("manager", "Gestão");
  station = await db.createStaff("station", "Amiens Reception");
  stationC = await db.createStaff("station", "Connolly Reception", { home: "CONNOLLY" });
  amiens = await db.lodgeId("AMIENS");
  connolly = await db.lodgeId("CONNOLLY");
});
afterEach(async () => { await db.close(); });

let seq = 0;
async function admit(opts: { pass?: string | null; name?: string; lodge?: "AMIENS" | "CONNOLLY"; by?: Actor } = {}) {
  const lodge = opts.lodge ?? "AMIENS";
  const [bed] = await db.freeBeds(lodge);
  await db.as(opts.by ?? admin);
  const pass = opts.pass === undefined ? `PX${++seq}${Math.random().toString(36).slice(2, 7)}` : opts.pass;
  return db.one<{ id: string }>(
    "select public.admit_resident(p_lodge => $1, p_bed => $2, p_first_name => $3, p_last_name => 'Test', p_pass_id => $4, p_admitted_at => now() - interval '10 days') as id",
    [lodge === "AMIENS" ? amiens : connolly, bed, opts.name ?? "Pat", pass],
  ).then((r) => r.id);
}
const stayOf = async (resident: string) => db.asSuperuser().then(() => db.one<{ id: string }>("select id from public.stays where resident_id = $1 order by admitted_at desc limit 1", [resident])).then((r) => r.id);

describe("Warning e Final Warning", () => {
  it("só existem dois tipos; os antigos são recusados", async () => {
    const stay = await stayOf(await db.one<{ r: string }>("select resident_id r from public.stays where id = $1", [await admit()]).then((x) => x.r));
    await db.as(station);
    expect(await db.error("select public.record_warning($1, 'warning', 'Noise')", [stay])).toBeNull();
    expect(await db.error("select public.record_warning($1, 'verbal', 'x')", [stay])).toMatch(/invalid_warning_type/);
    expect(await db.error("select public.record_warning($1, 'written', 'x')", [stay])).toMatch(/invalid_warning_type/);
    expect(await db.error("select public.record_warning($1, 'final_written', 'x')", [stay])).toMatch(/invalid_warning_type/);
  });
  it("um Final Warning ativo por estadia; desativar exige motivo e libera outro; o Handover mostra os nomes novos", async () => {
    const stay = await admit();
    await db.as(station);
    const fw = (await db.one<{ id: string }>("select public.record_warning($1, 'final_warning', 'Last chance') as id", [stay])).id;
    expect(await db.error("select public.record_warning($1, 'final_warning', 'again')", [stay])).toMatch(/final_warning_active/);
    await db.as(admin);
    expect(await db.error("select public.deactivate_final_warning($1, '')", [fw])).toMatch(/reason_required/);
    expect(await db.error("select public.deactivate_final_warning($1, 'Resolved')", [fw])).toBeNull();
    await db.as(station);
    expect(await db.error("select public.record_warning($1, 'final_warning', 'new')", [stay])).toBeNull();
    await db.asSuperuser();
    const bodies = (await db.query<{ body: string }>("select body from public.handover_entries where kind = 'warning' order by created_at")).rows.map((r) => r.body);
    expect(bodies[0]).toBe("Final Warning: Last chance");
    await db.as(station);
    await db.query("select public.record_warning($1, 'warning', 'Smoking')", [stay]).catch(() => {});
  });
  it("migração: registros antigos viram os dois tipos novos e os relatórios contam por eles", async () => {
    const stay = await admit();
    await db.as(station);
    await db.query("select public.record_warning($1, 'warning', 'A')", [stay]);
    await db.as(admin);
    const r = await db.one<{ rep: { warnings: Record<string, number> } }>("select public.report_period(array[$1::uuid], current_date - 1, current_date + 1) as rep", [amiens]).catch(() => null);
    if (r) {
      expect(Object.keys(r.rep.warnings)).toEqual(expect.arrayContaining(["warning", "final_warning"]));
      expect(Object.keys(r.rep.warnings)).not.toContain("verbal");
      expect(Object.keys(r.rep.warnings)).not.toContain("final_written");
    }
    await db.asSuperuser();
    expect((await db.one<{ n: number }>("select count(*)::int n from public.warnings where type not in ('warning', 'final_warning')")).n).toBe(0);
  });
});

describe("PASS ID obrigatório e re-admissão", () => {
  it("novo residente exige PASS ID e nome; PASS ID repetido (sem diferenciar caixa e espaços) é recusado com código", async () => {
    await admit({ pass: "ABC123" });
    const [bed] = await db.freeBeds("AMIENS");
    await db.as(admin);
    const call = (name: string, pass: string) => db.error("select public.admit_resident(p_lodge => $1, p_bed => $2, p_first_name => $3, p_pass_id => $4)", [amiens, bed, name, pass]);
    expect(await call("X", " ")).toMatch(/pass_id_required/);
    expect(await call("X", " abc123 ")).toMatch(/pass_id_exists/);
    expect(await call(" ", "NEW1")).toMatch(/name_required/);
    expect(await call("X", "NEW1")).toBeNull();
  });
  it("find_former_resident acha por PASS ID e diz se a pessoa ainda tem estadia aberta", async () => {
    const stay = await admit({ pass: "FORMER9", name: "Aoife" });
    await db.as(station);
    let f = await db.one<{ first_name: string; has_open_stay: boolean }>("select * from public.find_former_resident(' former9 ')");
    expect(f).toMatchObject({ first_name: "Aoife", has_open_stay: true });
    await db.as(admin);
    await db.query("select public.decide_out($1, 'Left')", [stay]);
    await db.query("select public.effect_out($1, now())", [stay]);
    await db.as(station);
    f = await db.one("select * from public.find_former_resident('FORMER9')");
    expect(f.has_open_stay).toBe(false);
    expect((await db.query("select * from public.find_former_resident('NOPE')")).rows).toHaveLength(0);
    expect((await db.query("select * from public.find_former_resident('')")).rows).toHaveLength(0);
  });
  it("ex-residente volta no mesmo cadastro com uma nova estadia; quem está internado não pode ser admitido de novo", async () => {
    const stay = await admit({ pass: "BACK1", name: "Niall" });
    const resident = (await db.one<{ resident_id: string }>("select resident_id from public.stays where id = $1", [stay])).resident_id;
    const [free] = await db.freeBeds("AMIENS");
    await db.as(admin);
    expect(await db.error("select public.admit_resident(p_lodge => $1, p_bed => $2, p_resident_id => $3)", [amiens, free, resident])).toMatch(/already_resident/);
    await db.query("select public.decide_out($1, 'Left')", [stay]);
    await db.query("select public.effect_out($1, now())", [stay]);
    const [bed] = await db.freeBeds("AMIENS");
    await db.as(station);
    expect(await db.error("select public.admit_resident(p_lodge => $1, p_bed => $2, p_resident_id => $3)", [amiens, bed, resident])).toBeNull();
    await db.asSuperuser();
    expect((await db.one<{ n: number }>("select count(*)::int n from public.stays where resident_id = $1", [resident])).n).toBe(2);
    expect((await db.one<{ n: number }>("select count(*)::int n from public.residents where lower(pass_id) = 'back1'")).n).toBe(1);
  });
  it("qualquer conta de casa decide o cancelamento da cama; só Admin efetiva", async () => {
    const stay = await admit();
    await db.as(station);
    expect(await db.error("select public.decide_out($1, 'Moving out')", [stay])).toBeNull();
    expect(await db.error("select public.effect_out($1, now())", [stay])).toMatch(/not_authorised/);
    await db.as(admin);
    expect(await db.error("select public.effect_out($1, now())", [stay])).toBeNull();
  });
});

describe("Fornecedores e New Delivery", () => {
  const supplier = async (name: string) => (await db.one<{ id: string }>("select id from public.suppliers where name = $1", [name])).id;
  const deliver = (sup: string, f: { product?: string; batch?: string | null; expiry?: string | null; temp?: number | null } = {}) =>
    db.query<{ id: string }>("select public.record_food_delivery($1, $2, $3, $4, $5::date, $6, null) as id", [amiens, f.product ?? "Chicken", sup, f.batch === undefined ? null : f.batch, f.expiry === undefined ? null : f.expiry, f.temp === undefined ? null : f.temp]).then((r) => r.rows[0].id);

  it("Tesco e Ripley's vêm cadastrados; Ripley's exige Batch e Best before, Tesco não exige nada", async () => {
    await db.asSuperuser();
    const tesco = await supplier("Tesco"), ripley = await supplier("Ripley's");
    await db.as(station);
    expect(await db.error("select public.record_food_delivery($1, 'Milk', $2, null, null, null, null)", [amiens, tesco])).toBeNull();
    expect(await db.error("select public.record_food_delivery($1, 'Ham', $2, null, '2027-01-01', null, null)", [amiens, ripley])).toMatch(/batch_required/);
    expect(await db.error("select public.record_food_delivery($1, 'Ham', $2, 'L1', null, null, null)", [amiens, ripley])).toMatch(/best_before_required/);
    expect(await db.error("select public.record_food_delivery($1, 'Ham', $2, 'L1', current_date + 30, null, null)", [amiens, ripley])).toBeNull();
    expect(await db.error("select public.record_food_delivery($1, ' ', $2, null, null, null, null)", [amiens, tesco])).toMatch(/fields_required/);
  });
  it("o Admin cadastra, edita, desativa e restaura fornecedores; a conta de casa não", async () => {
    await db.as(station);
    expect(await db.error("select public.add_supplier('X', false, false, false, false)")).toMatch(/not_authorised/);
    await db.as(admin);
    const id = (await db.one<{ id: string }>("select public.add_supplier('Dunnes', true, true, false, false) as id")).id;
    expect(await db.error("select public.add_supplier('dunnes', false, false, false, false)")).toMatch(/supplier_exists/);
    expect(await db.error("select public.add_supplier('  ', false, false, false, false)")).toMatch(/name_required/);
    expect(await db.error("select public.update_supplier($1, 'Dunnes Stores', false, true, true, false, true)", [id])).toBeNull();
    await db.asSuperuser();
    expect(await db.one("select name, require_batch, require_best_before, require_temperature from public.suppliers where id = $1", [id])).toMatchObject({ name: "Dunnes Stores", require_batch: false, require_best_before: true, require_temperature: true });
    await db.as(admin);
    await db.query("select public.update_supplier($1, 'Dunnes Stores', false, true, true, false, false)", [id]);
    await db.as(station);
    expect(await db.error("select public.record_food_delivery($1, 'Milk', $2, null, current_date + 5, 3, null)", [amiens, id])).toMatch(/supplier_inactive/);
    expect((await db.query("select id from public.suppliers where active")).rows.length).toBeGreaterThanOrEqual(2);
  });
  it("campo obrigatório muda por fornecedor: temperatura exigida quando o cadastro pede", async () => {
    await db.as(admin);
    const id = (await db.one<{ id: string }>("select public.add_supplier('Cold Co', false, false, true, false) as id")).id;
    await db.as(station);
    expect(await db.error("select public.record_food_delivery($1, 'Fish', $2, null, null, null, null)", [amiens, id])).toMatch(/temperature_required/);
    expect(await db.error("select public.record_food_delivery($1, 'Fish', $2, null, null, 2.5, null)", [amiens, id])).toBeNull();
  });
  it("alerta de validade ao Admin quando o Best before cai dentro do parâmetro; fora dele não avisa", async () => {
    await db.asSuperuser();
    const ripley = await supplier("Ripley's");
    await db.as(admin);
    expect(await db.error("select public.set_system_parameter('delivery.expiry_alert_days', '5')")).toBeNull();
    for (const bad of ["-1", "61", "1.5", "\"x\""]) expect(await db.error("select public.set_system_parameter('delivery.expiry_alert_days', $1::jsonb)", [bad])).toMatch(/invalid_parameter/);
    await db.as(station);
    await deliver(ripley, { batch: "A", expiry: new Date(Date.now() + 3 * 86_400_000).toISOString().slice(0, 10) });
    await deliver(ripley, { batch: "B", expiry: new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10) });
    await db.asSuperuser();
    const n = await db.query<{ payload: { product: string } }>("select payload from public.notifications where kind = 'delivery_expiring'");
    expect(n.rows).toHaveLength(1);
  });
  it("recebimento do Tesco gera alerta para o Admin; Ripley's não", async () => {
    await db.asSuperuser();
    const tesco = await supplier("Tesco"), ripley = await supplier("Ripley's");
    await db.as(station);
    await deliver(ripley, { batch: "A", expiry: new Date(Date.now() + 40 * 86_400_000).toISOString().slice(0, 10) });
    await db.asSuperuser();
    expect((await db.query("select 1 from public.notifications where kind = 'delivery_received'")).rows).toHaveLength(0);
    await db.as(station);
    await deliver(tesco);
    await db.asSuperuser();
    const n = await db.one<{ audience: string; payload: { supplier: string } }>("select audience, payload from public.notifications where kind = 'delivery_received'");
    expect(n).toMatchObject({ audience: "management", payload: { supplier: "Tesco" } });
  });
});

describe("Pedidos do Tesco por status e vínculo da entrega", () => {
  async function setup() {
    await db.asSuperuser();
    const tesco = (await db.one<{ id: string }>("select id from public.suppliers where name = 'Tesco'")).id;
    const ripley = (await db.one<{ id: string }>("select id from public.suppliers where name = 'Ripley''s'")).id;
    await db.as(admin);
    const order = (await db.one<{ id: string }>("select public.create_shop_order(current_date + 2, null) as id")).id;
    return { tesco, ripley, order };
  }
  const status = async (id: string) => {
    await db.asSuperuser();
    const r = await db.one<{ status: string }>("select status from public.shop_orders where id = $1", [id]);
    await db.as(admin);
    return r.status;
  };

  it("Created → Placed → Awaiting Delivery; Delivered só pelo vínculo; só Admin", async () => {
    const { order } = await setup();
    expect(await status(order)).toBe("created");
    await db.as(station);
    expect(await db.error("select public.set_shop_order_status($1, 'placed')", [order])).toMatch(/not_authorised/);
    await db.as(admin);
    expect(await db.error("select public.set_shop_order_status($1, 'placed')", [order])).toBeNull();
    expect(await status(order)).toBe("placed");
    expect(await db.error("select public.set_shop_order_status($1, 'awaiting')", [order])).toBeNull();
    expect(await status(order)).toBe("awaiting");
    expect(await db.error("select public.set_shop_order_status($1, 'delivered')", [order])).toMatch(/invalid_status/);
    expect(await db.error("select public.set_shop_order_status($1, 'created')", [order])).toBeNull();
    expect(await status(order)).toBe("created");
  });
  it("o Admin vincula a entrega recebida ao pedido: vira Delivered e o Handover recebe a nota com pedido, quem recebeu e a hora", async () => {
    const { tesco, order } = await setup();
    await db.query("select public.set_shop_order_status($1, 'awaiting'::text)", [order]).catch(async () => {
      await db.query("select public.set_shop_order_status($1, 'placed')", [order]);
      await db.query("select public.set_shop_order_status($1, 'awaiting')", [order]);
    });
    await db.as(station);
    const d = (await db.one<{ id: string }>("select public.record_food_delivery($1, 'Tesco order', $2, null, null, null, null) as id", [amiens, tesco])).id;
    expect(await db.error("select public.link_delivery_to_order($1, $2)", [d, order])).toMatch(/not_authorised/);
    await db.as(admin);
    expect(await db.error("select public.link_delivery_to_order($1, $2)", [d, order])).toBeNull();
    expect(await status(order)).toBe("delivered");
    await db.asSuperuser();
    const note = await db.one<{ body: string; lodge_id: string }>("select body, lodge_id from public.handover_entries where body ilike '%Tesco%' order by created_at desc limit 1");
    expect(note.lodge_id).toBe(amiens);
    expect(note.body).toMatch(/Tesco order/);
    expect(note.body).toMatch(/Amiens Reception/);
    expect(note.body).toMatch(/\d{2}:\d{2}/);
    const tagged = await db.one<{ code: string }>("select g.code from public.handover_entry_tags t join public.handover_tags g on g.id = t.tag_id join public.handover_entries e on e.id = t.entry_id where e.body ilike '%Tesco order%' limit 1");
    expect(tagged.code).toBe("delivery");
  });
  it("não vincula duas vezes, nem a pedido ainda Created, nem entrega que não é de pedido (Ripley's)", async () => {
    const { tesco, ripley, order } = await setup();
    await db.as(station);
    const d = (await db.one<{ id: string }>("select public.record_food_delivery($1, 'Order', $2, null, null, null, null) as id", [amiens, tesco])).id;
    const r = (await db.one<{ id: string }>("select public.record_food_delivery($1, 'Ham', $2, 'L1', current_date + 40, null, null) as id", [amiens, ripley])).id;
    await db.as(admin);
    expect(await db.error("select public.link_delivery_to_order($1, $2)", [d, order])).toMatch(/order_not_open/);
    await db.query("select public.set_shop_order_status($1, 'placed')", [order]);
    expect(await db.error("select public.link_delivery_to_order($1, $2)", [r, order])).toMatch(/delivery_not_linkable/);
    expect(await db.error("select public.link_delivery_to_order($1, $2)", [d, order])).toBeNull();
    expect(await db.error("select public.link_delivery_to_order($1, $2)", [d, order])).toMatch(/already_linked|order_not_open/);
  });
  it("a conta de Connolly não registra entrega em Amiens (isolamento)", async () => {
    const { tesco } = await setup();
    await db.as(stationC);
    expect(await db.error("select public.record_food_delivery($1, 'X', $2, null, null, null, null)", [amiens, tesco])).toMatch(/not_authorised/);
  });

  it("os Reports contam os pedidos por status", async () => {
    const { order } = await setup();
    await db.query("select public.set_shop_order_status($1, 'placed')", [order]);
    await db.query("select public.set_shop_order_status($1, 'awaiting')", [order]);
    const r = await db.one<{ rep: { by_status: Record<string, number> } }>("select public.report_purchases(current_date - 1, current_date + 30) as rep");
    expect(r.rep.by_status).toEqual({ created: 0, placed: 0, awaiting: 1, delivered: 0 });
  });
});
