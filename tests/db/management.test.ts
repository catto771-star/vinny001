// Fase 3 — Gestão: Compras, Distribuição/Transferências, Rota, Horas, Férias e Relatório
// mensal por Lodge (spec s.8, s.4, B13, B31, B45, B49).
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Db, type Actor } from "./helpers";

let db: Db;
let manager: Actor;
let officeA: Actor;
let officeC: Actor;
let porter2: Actor;
let amiens: string;
let connolly: string;

beforeEach(async () => {
  db = await Db.open();
  manager = await db.createStaff("manager", "Gestão");
  officeA = await db.createStaff("porter", "Office Amiens");
  officeC = await db.createStaff("porter", "Office Connolly");
  porter2 = await db.createStaff("porter", "Porter Dois");
  amiens = await db.lodgeId("AMIENS");
  connolly = await db.lodgeId("CONNOLLY");
  await db.as(officeA);
  await db.query("select public.assume_post('office', $1)", [amiens]);
  await db.as(officeC);
  await db.query("select public.assume_post('office', $1)", [connolly]);
});

afterEach(async () => {
  await db.close();
});

async function product(name = "Leite 1L") {
  await db.as(manager);
  return (await db.one<{ id: string }>("select public.upsert_product(null, $1, 'un', 'Cozinha') as id", [name])).id;
}

describe("Compras", () => {
  it("só a gestão registra compras e vê preços; a equipe vê produtos e quantidades sem preço", async () => {
    const p = await product();
    await db.as(officeA);
    expect(await db.error("select public.create_purchase('Musgrave', now()::date, 'NF-1', $1::jsonb)", [JSON.stringify([{ product_id: p, quantity: 3, unit_price: 0.333 }])])).toMatch(/not_authorised/);
    await db.as(manager);
    const id = (await db.one<{ id: string }>("select public.create_purchase('Musgrave', now()::date, 'NF-1', $1::jsonb) as id", [JSON.stringify([{ product_id: p, quantity: 3, unit_price: 0.333 }])])).id;
    await db.as(officeA);
    expect((await db.one("select quantity::text as q from public.purchase_lines where purchase_id = $1", [id])).q).toBe("3.000");
    expect(await db.error("select unit_price from public.purchase_lines where purchase_id = $1", [id])).toMatch(/permission denied/);
    expect(await db.error("select * from public.purchase_prices($1)", [id])).toMatch(/not_authorised/);
  });

  it("B49: 3 × € 0,333 → total da linha arredondado ao centavo (€ 1,00), não por unidade", async () => {
    const p = await product();
    await db.as(manager);
    const id = (await db.one<{ id: string }>("select public.create_purchase('Musgrave', now()::date, null, $1::jsonb) as id", [JSON.stringify([{ product_id: p, quantity: 3, unit_price: 0.333 }])])).id;
    const r = await db.one("select line_total::text as t, purchase_total::text as pt from public.purchase_prices($1)", [id]);
    expect(r).toEqual({ t: "1.00", pt: "1.00" });
  });

  it("meio centavo arredonda para cima (0,005 → 0,01)", async () => {
    const p = await product();
    await db.as(manager);
    const id = (await db.one<{ id: string }>("select public.create_purchase('X', now()::date, null, $1::jsonb) as id", [JSON.stringify([{ product_id: p, quantity: 1, unit_price: 0.005 }])])).id;
    expect((await db.one("select line_total::text as t from public.purchase_prices($1)", [id])).t).toBe("0.01");
  });
});

describe("Distribuição e transferências", () => {
  it("alocação por Lodge (até a quantidade comprada); transferência não é nova despesa", async () => {
    const p = await product();
    await db.as(manager);
    const purchase = (await db.one<{ id: string }>("select public.create_purchase('Musgrave', now()::date, null, $1::jsonb) as id", [JSON.stringify([{ product_id: p, quantity: 10, unit_price: 1.2 }])])).id;
    const line = (await db.one<{ id: string }>("select id from public.purchase_lines where purchase_id = $1", [purchase])).id;
    await db.as(officeA);
    await db.query("select public.allocate_purchase_line($1, $2, 6)", [line, amiens]);
    expect(await db.error("select public.allocate_purchase_line($1, $2, 5)", [line, amiens])).toMatch(/exceeds_purchased_quantity/);
    await db.query("select public.transfer_product($1, $2, $3, 2, 'faltou em Connolly')", [p, amiens, connolly]);
    await db.as(manager);
    const before = (await db.one("select count(*)::int as n from public.purchases")).n;
    expect(before).toBe(1); // a transferência não criou compra
    const moves = await db.query("select kind, from_lodge_id, to_lodge_id, quantity::text as q from public.product_movements order by created_at");
    expect(moves.rows.map((m) => [m.kind, m.q])).toEqual([["allocation", "6.000"], ["transfer", "2.000"]]);
  });

  it("Office só transfere envolvendo o próprio Lodge", async () => {
    const p = await product();
    await db.as(officeC);
    expect(await db.error("select public.transfer_product($1, $2, $3, 1, null)", [p, amiens, amiens])).toMatch(/not_authorised|same_lodge/);
    await db.as(officeA);
    expect(await db.error("select public.transfer_product($1, $2, $2, 1, null)", [p, amiens])).toMatch(/same_lodge/);
  });
});

describe("Rota", () => {
  const at = (days: number, hm: string) => `public.slot_instant(public.operational_day(now()) + ${days}, '${hm}')`;

  it("só a gestão edita; a equipe vê só a escala publicada", async () => {
    await db.as(officeA);
    expect(await db.error(`select public.save_rota_shift(null, $1, $2, 'office', ${at(1, "07:00")}, ${at(1, "19:00")})`, [officeA.staffId, amiens])).toMatch(/not_authorised/);
    await db.as(manager);
    await db.query(`select public.save_rota_shift(null, $1, $2, 'office', ${at(1, "07:00")}, ${at(1, "19:00")})`, [officeA.staffId, amiens]);
    await db.as(officeA);
    expect((await db.query("select * from public.rota_shifts")).rowCount).toBe(0);
    await db.as(manager);
    await db.query(`select public.publish_rota(${at(0, "07:00")}, ${at(7, "07:00")})`);
    await db.as(officeA);
    expect((await db.query("select * from public.rota_shifts")).rowCount).toBe(1);
  });

  it("Float é uma função do turno que qualquer Porter exerce, um por vez", async () => {
    await db.as(manager);
    await db.query(`select public.save_rota_shift(null, $1, null, 'float', ${at(1, "12:00")}, ${at(2, "00:00")})`, [officeA.staffId]);
    expect(await db.error(`select public.save_rota_shift(null, $1, null, 'float', ${at(1, "18:00")}, ${at(1, "22:00")})`, [porter2.staffId])).toMatch(/float_overlap/);
  });

  it("uma pessoa não tem dois turnos sobrepostos", async () => {
    await db.as(manager);
    await db.query(`select public.save_rota_shift(null, $1, $2, 'office', ${at(1, "07:00")}, ${at(1, "19:00")})`, [officeA.staffId, amiens]);
    expect(await db.error(`select public.save_rota_shift(null, $1, $2, 'office', ${at(1, "18:00")}, ${at(2, "07:00")})`, [officeA.staffId, connolly])).toMatch(/staff_overlap/);
  });

  it("B45: turno sem o mínimo de cobertura (1 Office por turno e Lodge; 1 Float 12h–24h) → alerta ao Manager", async () => {
    await db.as(manager);
    // Dia +1 em Amiens: só o Day coberto; Connolly e Float sem ninguém.
    await db.query(`select public.save_rota_shift(null, $1, $2, 'office', ${at(1, "07:00")}, ${at(1, "19:00")})`, [officeA.staffId, amiens]);
    const gaps = await db.query(`select lodge_code, kind from public.coverage_gaps(${at(1, "07:00")}, ${at(2, "07:00")}) order by 1 nulls last, 2`);
    expect(gaps.rows).toEqual([
      { lodge_code: "AMIENS", kind: "night" },
      { lodge_code: "CONNOLLY", kind: "day" },
      { lodge_code: "CONNOLLY", kind: "night" },
      { lodge_code: null, kind: "float" },
    ]);
    await db.query(`select public.publish_rota(${at(1, "07:00")}, ${at(2, "07:00")})`);
    await db.asSuperuser();
    expect((await db.one("select (payload ->> 'gaps')::int as g from public.notifications where kind = 'coverage_below_minimum'")).g).toBe(4);
  });

  it("Float de um dia vai das 12h à meia-noite: dia sem Float aparece como buraco mesmo com Float no dia anterior e no seguinte", async () => {
    await db.as(manager);
    // at(n, "00:00") é a meia-noite que encerra o dia operacional n (horários antes das 07h são do dia seguinte).
    await db.query(`select public.save_rota_shift(null, $1, null, 'float', ${at(1, "12:00")}, ${at(1, "00:00")})`, [officeA.staffId]);
    await db.query(`select public.save_rota_shift(null, $1, null, 'float', ${at(3, "12:00")}, ${at(3, "00:00")})`, [porter2.staffId]);
    const floats = await db.query(`select starts_at = ${at(2, "12:00")} as day2 from public.coverage_gaps(${at(1, "07:00")}, ${at(4, "07:00")}) where kind = 'float'`);
    expect(floats.rows).toEqual([{ day2: true }]);
  });

  it("intervalo absurdo é recusado (não gera milhares de dias e trava o banco)", async () => {
    await db.as(manager);
    expect(await db.error("select * from public.coverage_gaps('0001-01-01T00:00:00Z', '2099-12-31T00:00:00Z')")).toMatch(/range_too_large/);
    expect(await db.error("select * from public.coverage_gaps('2026-11-02T00:00:00Z', '2026-11-01T00:00:00Z')")).toMatch(/invalid_range/);
    expect(await db.error("select * from public.coverage_gaps(null, null)")).toMatch(/invalid_range/);
    expect(await db.error("select * from public.coverage_gaps('2026-11-02T00:00:00Z', 'infinity')")).toMatch(/range_too_large|invalid_range/);
    expect(await db.error("select public.publish_rota('0001-01-01T00:00:00Z', '2099-12-31T00:00:00Z')")).toMatch(/range_too_large/);
    // uma semana (e até 62 dias) continua funcionando
    expect(await db.error("select * from public.coverage_gaps(now(), now() + interval '62 days')")).toBeNull();
  });

  it("relatório mensal recusa mês inválido (infinity trava em loop; 2099 e ano 1 não fazem sentido)", async () => {
    await db.as(manager);
    for (const bad of ["infinity", "-infinity", "0001-01-01", "2099-12-31"]) {
      expect(await db.error("select public.report_monthly($1, $2::date)", [amiens, bad]), bad).toMatch(/invalid_month/);
      expect(await db.error("select * from public.report_details($1, $2::date, 'occupancy.admissions')", [amiens, bad]), bad).toMatch(/invalid_month/);
    }
    expect(await db.error("select public.report_monthly($1, null)", [amiens])).toMatch(/invalid_month/);
    expect(await db.error("select public.report_monthly($1, current_date)", [amiens])).toBeNull();
  });

  it("entradas absurdas viram recusas claras (varredura em massa): horas, intervalos, quantidades e compras", async () => {
    const p = await product("Leite fuzz");
    await db.as(manager);
    // horas planejadas × efetivas e atuação: intervalo finito e de até 62 dias
    expect(await db.error("select * from public.staff_hours('2026-11-01T00:00:00Z', 'infinity')")).toMatch(/invalid_range/);
    expect(await db.error("select * from public.staff_hours('0001-01-01T00:00:00Z', '2099-01-01T00:00:00Z')")).toMatch(/range_too_large/);
    expect(await db.error("select * from public.staff_work_log($1, '-infinity', now())", [officeA.staffId])).toMatch(/invalid_range/);
    // horas lançadas pela gestão: no máximo 24 h, e não no futuro
    const add = (start: string, end: string) => db.error("select public.add_work_interval($1, $2, $3::timestamptz, $4::timestamptz, 'x')", [officeA.staffId, amiens, start, end]);
    expect(await add("1970-01-01T00:00:00Z", "2099-12-31T00:00:00Z")).toMatch(/interval_too_long/);
    expect(await add("2099-01-01T08:00:00Z", "2099-01-01T12:00:00Z")).toMatch(/in_future/);
    expect(await add("2026-11-01T08:00:00Z", "2026-11-01T12:00:00Z")).toBeNull();
    // quantidades e preços dentro do que a coluna comporta
    expect(await db.error("select public.transfer_product($1, $2, $3, 1000000000000, null)", [p, amiens, connolly])).toMatch(/invalid_quantity/);
    const buy = (lines: string, supplier = "Musgrave") => db.error("select public.create_purchase($1, current_date, null, $2::jsonb)", [supplier, lines]);
    expect(await buy(`[{"product_id":"${p}","quantity":1000000000000,"unit_price":1}]`)).toMatch(/invalid_line/);
    expect(await buy(`[{"product_id":"${p}","quantity":2,"unit_price":"x"}]`)).toMatch(/invalid_line/);
    expect(await buy(`[{"product_id":null,"quantity":2,"unit_price":1}]`)).toMatch(/invalid_line/);
    expect(await buy("{\"a\":1}")).toMatch(/lines_required/);
    expect(await buy("[1]")).toMatch(/invalid_line/);
    expect(await buy(`[{"product_id":"${p}","quantity":2,"unit_price":1}]`, "   ")).toMatch(/supplier_required/);
    // nada ficou gravado pelas compras recusadas
    await db.asSuperuser();
    expect((await db.one<{ n: string }>("select count(*) n from public.purchases where supplier in ('Musgrave', '   ')")).n).toBe("0");
  });

  it("horários editáveis inclusive depois do fato (com histórico)", async () => {
    await db.as(manager);
    const id = (await db.one<{ id: string }>(`select public.save_rota_shift(null, $1, $2, 'office', ${at(-2, "07:00")}, ${at(-2, "19:00")}) as id`, [officeA.staffId, amiens])).id;
    await db.query(`select public.save_rota_shift($1, $2, $3, 'office', ${at(-2, "07:00")}, ${at(-2, "21:00")})`, [id, officeA.staffId, amiens]);
    await db.asSuperuser();
    expect((await db.one("select count(*)::int as n from public.audit_log where table_name = 'rota_shifts' and record_id = $1", [id])).n).toBe(2);
  });
});

describe("Horas", () => {
  it("Beta: trabalhadas vêm do Roster; B13: Manager prolonga o fim em 2h → horas atualizadas, previsto mantido, com histórico", async () => {
    await db.as(manager);
    const id = (await db.one<{ id: string }>(
      "select public.save_rota_shift(null, $1, $2, 'office', now() - interval '30 hours', now() - interval '20 hours') as id", [porter2.staffId, amiens])).id;
    await db.query("select public.publish_rota(now() - interval '31 hours', now() - interval '19 hours')");
    const range = "now() - interval '2 days', now() + interval '1 day'";
    const before = await db.one(`select planned_minutes, effective_minutes from public.staff_hours(${range}) where staff_id = $1`, [porter2.staffId]);
    expect(before).toEqual({ planned_minutes: 600, effective_minutes: 600 });
    await db.query("select public.save_rota_shift($1, $2, $3, 'office', now() - interval '30 hours', now() - interval '18 hours')", [id, porter2.staffId, amiens]);
    const after = await db.one(`select planned_minutes, effective_minutes from public.staff_hours(${range}) where staff_id = $1`, [porter2.staffId]);
    expect(after).toEqual({ planned_minutes: 600, effective_minutes: 720 });
    await db.asSuperuser();
    const audit = await db.query("select 1 from public.audit_log where table_name = 'rota_shifts' and record_id = $1 and action = 'UPDATE'", [id]);
    expect(audit.rowCount).toBeGreaterThan(0);
  });

  it("previstas vêm do Roster publicado; horas fora da escala são lançadas à parte pelo Manager", async () => {
    const cleaner = await db.createStaff("cleaner", "Cleaner Um", { login: false });
    await db.as(manager);
    await db.query("select public.save_rota_shift(null, $1, $2, 'cleaner', now() - interval '10 hours', now() - interval '6 hours')", [cleaner.staffId, amiens]);
    await db.query("select public.publish_rota(now() - interval '11 hours', now() - interval '5 hours')");
    await db.query("select public.add_work_interval($1, $2, now() - interval '4 hours', now() - interval '3 hours', 'Ficou 1h a mais')", [cleaner.staffId, amiens]);
    const h = await db.one("select planned_minutes, effective_minutes from public.staff_hours(now() - interval '1 day', now()) where staff_id = $1", [cleaner.staffId]);
    expect(h).toEqual({ planned_minutes: 240, effective_minutes: 300 });
  });

  it("Office não vê nem edita horas", async () => {
    await db.as(officeA);
    expect(await db.error("select * from public.staff_hours(now() - interval '1 day', now())")).toMatch(/not_authorised/);
  });
});

describe("Férias", () => {
  it("Manager registra; conflito com a Rota gera alerta", async () => {
    await db.as(manager);
    await db.query("select public.save_rota_shift(null, $1, $2, 'office', public.slot_instant(public.operational_day(now()) + 5, '07:00'), public.slot_instant(public.operational_day(now()) + 5, '19:00'))", [officeA.staffId, amiens]);
    const r = (await db.one("select public.register_vacation($1, public.operational_day(now()) + 4, public.operational_day(now()) + 6, 'Brasil') as r", [officeA.staffId])).r;
    expect(r.conflicts).toBe(1);
    await db.as(officeA);
    expect(await db.error("select public.register_vacation($1, current_date, current_date + 1, null)", [officeA.staffId])).toMatch(/not_authorised/);
  });
});

describe("Relatório mensal por Lodge", () => {
  it("B31: cada número bate com os registros de origem", async () => {
    // Uma admissão, um Out e um chamado no mês.
    const [bed] = await db.freeBeds("AMIENS");
    await db.as(manager);
    const stay = (await db.one<{ id: string }>("select public.admit_resident(p_pass_id => 'T' || substr(md5(random()::text), 1, 10), p_lodge => $1, p_bed => $2, p_first_name => 'Ana', p_admitted_at => now() - interval '1 hour') as id", [amiens, bed])).id;
    await db.query("select public.effect_out($1)", [stay]);
    await db.query("select public.create_maintenance($1, 'Cozinha', 'Torneira', 'normal', gen_random_uuid())", [amiens]);
    const month = (await db.one<{ m: string }>("select to_char(date_trunc('month', public.operational_day(now())), 'YYYY-MM-DD') as m")).m;
    const rep = (await db.one("select public.report_monthly($1, $2::date) as r", [amiens, month])).r;
    expect(rep.occupancy.admissions).toBe(1);
    expect(rep.occupancy.outs).toBe(1);
    expect(rep.maintenance.opened).toBe(1);
    for (const metric of ["occupancy.admissions", "occupancy.outs", "maintenance.opened"]) {
      const [block, key] = metric.split(".");
      const details = await db.query("select * from public.report_details($1, $2::date, $3)", [amiens, month, metric]);
      expect(details.rowCount, metric).toBe(rep[block][key]);
    }
    expect(rep.order.slice(0, 3)).toEqual(["occupancy", "maintenance", "no_shows"]);
  });

  it("só a gestão vê relatórios", async () => {
    await db.as(officeA);
    expect(await db.error("select public.report_monthly($1, date_trunc('month', now())::date)", [amiens])).toMatch(/not_authorised/);
  });
});
