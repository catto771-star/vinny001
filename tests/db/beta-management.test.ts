// Beta — gestão (escopo 4): Purchases (lista Tesco), Holidays (calendário anual) e Reports por período e casa.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Db, type Actor } from "./helpers";

let db: Db;
let admin: Actor;
let station: Actor;
let pedro: Actor;
let amiens: string;
let connolly: string;

beforeEach(async () => {
  db = await Db.open();
  admin = await db.createStaff("manager", "Admin");
  station = await db.createStaff("station", "Amiens Reception");
  pedro = await db.createStaff("porter", "Pedro", { login: false });
  amiens = await db.lodgeId("AMIENS");
  connolly = await db.lodgeId("CONNOLLY");
});

afterEach(async () => {
  await db.close();
});

describe("Purchases — lista fixa do Tesco (4.1)", () => {
  it("27 produtos recorrentes, com quantidade padrão, link do Tesco e foto", async () => {
    await db.as(admin);
    const items = (await db.query<{ name: string; default_qty: number; default_action: string; tesco_url: string; image_path: string }>(
      "select name, default_qty, default_action, tesco_url, image_path from public.shop_items where active order by sort_order")).rows;
    expect(items).toHaveLength(27);
    expect(items.find((i) => i.name === "Milk")).toMatchObject({ default_qty: 18, default_action: "buy" });
    expect(items.find((i) => i.name === "Frozen Meals")!.default_qty).toBe(22);
    expect(items.find((i) => i.name === "Salt")!.default_action).toBe("dont_buy");
    expect(items.every((i) => i.tesco_url.startsWith("https://www.tesco.ie/") && i.image_path.startsWith("/products/"))).toBe(true);
  });

  it("pedido do dia: padrão, a mais (+X), a menos (−X) e não comprar calculam a quantidade final; preço começa em branco e soma o total", async () => {
    await db.as(admin);
    const order = (await db.one<{ id: string }>("select public.create_shop_order(current_date + 3, 'Busy week') as id")).id;
    const line = async (name: string) =>
      (await db.one<{ id: string; final_qty: number; unit_price: string | null; action: string }>(
        "select l.id, l.final_qty, l.unit_price, l.action from public.shop_order_lines l join public.shop_items i on i.id = l.item_id where l.order_id = $1 and i.name = $2", [order, name]));
    expect(await line("Milk")).toMatchObject({ final_qty: 18, unit_price: null, action: "standard" });
    expect((await line("Salt")).final_qty).toBe(0);
    await db.query("select public.set_shop_line($1, 'more', 5, 1.15)", [(await line("Bread")).id]);
    await db.query("select public.set_shop_line($1, 'less', 4, 1.29)", [(await line("Milk")).id]);
    await db.query("select public.set_shop_line($1, 'dont', 0, null)", [(await line("Cheese")).id]);
    await db.query("select public.set_shop_line($1, 'less', 99, null)", [(await line("Ham")).id]);
    expect((await line("Bread")).final_qty).toBe(6);
    expect((await line("Milk")).final_qty).toBe(14);
    expect((await line("Cheese")).final_qty).toBe(0);
    expect((await line("Ham")).final_qty).toBe(0);
    const total = (await db.one("select public.shop_order_total($1) as t", [order])).t;
    expect(Number(total.total)).toBeCloseTo(6 * 1.15 + 14 * 1.29, 2);
    expect(total.lines_without_price).toBeGreaterThan(0);
    expect((await db.one("select notes from public.shop_orders where id = $1", [order])).notes).toBe("Busy week");
  });

  it("padrão do item é editável (quantidade, ação, link) e vale para os próximos pedidos", async () => {
    await db.as(admin);
    const milk = (await db.one<{ id: string }>("select id from public.shop_items where name = 'Milk'")).id;
    await db.query("select public.update_shop_item($1, 'Milk', 'Dairy & Chilled', 20, 'buy', 'https://www.tesco.ie/shop/en-IE/products/1')", [milk]);
    const order = (await db.one<{ id: string }>("select public.create_shop_order(current_date + 1, null) as id")).id;
    expect((await db.one("select final_qty from public.shop_order_lines where order_id = $1 and item_id = $2", [order, milk])).final_qty).toBe(20);
    expect(await db.error("select public.update_shop_item($1, 'Milk', 'Dairy & Chilled', -1, 'buy', null)", [milk])).toMatch(/invalid_quantity/);
    expect(await db.error("select public.update_shop_item($1, 'Milk', 'Dairy & Chilled', 1, 'buy', 'javascript:alert(1)')", [milk])).toMatch(/invalid_url/);
  });

  it("só o Admin vê e mexe nas compras e nos preços", async () => {
    await db.as(station);
    expect((await db.query("select * from public.shop_items")).rowCount).toBe(0);
    expect(await db.error("select public.create_shop_order(current_date, null)")).toMatch(/not_authorised/);
  });
});

describe("Holidays — calendário anual (4.2)", () => {
  it("Under Review, Approved e Locked; Admin vê os nomes, Staff vê só o status", async () => {
    await db.as(admin);
    const y = (await db.one<{ y: number }>("select extract(year from current_date)::int + 1 as y")).y;
    await db.query("select public.register_vacation($1, make_date($2, 3, 2), make_date($2, 3, 4), null, 'under_review')", [pedro.staffId, y]);
    const ok = (await db.one<{ r: { id: string } }>("select public.register_vacation($1, make_date($2, 4, 10), make_date($2, 4, 10), null, 'approved') as r", [pedro.staffId, y])).r;
    await db.query("select public.lock_holiday_dates(make_date($1, 12, 20), make_date($1, 12, 26), 'Christmas')", [y]);
    const adminView = (await db.query<{ day: string; status: string; people: unknown }>("select day::text, status, people from public.holiday_calendar($1)", [y])).rows;
    const at = (rows: typeof adminView, d: string) => rows.find((r) => r.day === `${y}-${d}`);
    expect(at(adminView, "03-03")).toMatchObject({ status: "under_review" });
    expect(JSON.stringify(at(adminView, "03-03")!.people)).toContain("Pedro");
    expect(at(adminView, "04-10")!.status).toBe("approved");
    expect(at(adminView, "12-24")!.status).toBe("locked");
    expect(at(adminView, "05-01")).toBeUndefined();

    await db.as(station);
    const staffView = (await db.query<{ day: string; status: string; people: unknown }>("select day::text, status, people from public.holiday_calendar($1)", [y])).rows;
    expect(at(staffView, "03-03")).toMatchObject({ status: "under_review", people: null });
    expect(at(staffView, "04-10")).toMatchObject({ status: "approved", people: null });
    expect(await db.error("select public.lock_holiday_dates(current_date, current_date, null)")).toMatch(/not_authorised/);

    await db.as(admin);
    await db.query("select public.set_vacation_status($1, 'under_review')", [ok.id]);
    expect((await db.one("select status from public.vacations where id = $1", [ok.id])).status).toBe("under_review");
    expect(await db.error("select public.register_vacation($1, make_date($2, 12, 22), make_date($2, 12, 23), null, 'approved')", [pedro.staffId, y])).toMatch(/dates_locked/);
  });
});

describe("Reports por período e casa (4.4)", () => {
  async function admit(code: "AMIENS" | "CONNOLLY", lodge: string, daysAgo: number) {
    const [bed] = await db.freeBeds(code);
    await db.as(admin);
    await db.query("select public.admit_resident(p_lodge => $1, p_bed => $2, p_first_name => 'R', p_admitted_at => now() - make_interval(days => $3))", [lodge, bed, daysAgo]);
  }

  it("semana, intervalo livre e consolidado: o total das duas casas é a soma de cada uma, e o detalhe diz a casa", async () => {
    await admit("AMIENS", amiens, 2);
    await admit("CONNOLLY", connolly, 3);
    await admit("AMIENS", amiens, 20);
    await db.as(admin);
    const week = "public.operational_day(now()) - 6, public.operational_day(now()) + 1";
    const a = (await db.one(`select public.report_period(array[$1]::uuid[], ${week}) as r`, [amiens])).r;
    const c = (await db.one(`select public.report_period(array[$1]::uuid[], ${week}) as r`, [connolly])).r;
    const both = (await db.one(`select public.report_period(array[$1, $2]::uuid[], ${week}) as r`, [amiens, connolly])).r;
    expect(a.occupancy.admissions).toBe(1);
    expect(c.occupancy.admissions).toBe(1);
    expect(both.occupancy.admissions).toBe(2);
    expect(both.occupancy.beds_total).toBe(a.occupancy.beds_total + c.occupancy.beds_total);
    const details = (await db.query<{ lodge_id: string }>(`select lodge_id from public.report_details_period(array[$1, $2]::uuid[], ${week}, 'occupancy.admissions')`, [amiens, connolly])).rows;
    expect(details.map((d) => d.lodge_id).sort()).toEqual([amiens, connolly].sort());
    const month = (await db.one("select public.report_period(array[$1]::uuid[], public.operational_day(now()) - 29, public.operational_day(now()) + 1) as r", [amiens])).r;
    expect(month.occupancy.admissions).toBe(2);
  });

  it("um dia só funciona; período inválido ou longo demais é recusado; Staff não vê relatórios", async () => {
    await db.as(admin);
    expect(await db.error("select public.report_period(array[$1]::uuid[], public.operational_day(now()), public.operational_day(now()) + 1)", [amiens])).toBeNull();
    expect(await db.error("select public.report_period(array[$1]::uuid[], current_date, current_date)", [amiens])).toMatch(/invalid_period/);
    expect(await db.error("select public.report_period(array[$1]::uuid[], current_date - 800, current_date)", [amiens])).toMatch(/invalid_period/);
    expect(await db.error("select public.report_period(array[]::uuid[], current_date - 1, current_date)")).toMatch(/invalid_period/);
    await db.as(station);
    expect(await db.error("select public.report_period(array[$1]::uuid[], current_date - 1, current_date)", [amiens])).toMatch(/not_authorised/);
  });

  it("horas do relatório vêm do Roster", async () => {
    await db.as(admin);
    await db.query("select public.save_rota_shift(null, $1, $2, 'office', now() - interval '30 hours', now() - interval '20 hours')", [pedro.staffId, amiens]);
    await db.query("select public.publish_rota(now() - interval '31 hours', now() - interval '19 hours')");
    const r = (await db.one("select public.report_period(array[$1]::uuid[], public.operational_day(now()) - 3, public.operational_day(now()) + 1) as r", [amiens])).r;
    expect(r.hours).toEqual({ planned_minutes: 600, effective_minutes: 600 });
  });
});
