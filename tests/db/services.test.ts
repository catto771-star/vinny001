// Fase 2 — Serviços: Fridge/Temperatura, Food Delivery, Dinner (Amiens), Laundry (Connolly)
// e notificações da gestão (spec s.8, s.14 itens 10 e 11, B46).
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Db, type Actor } from "./helpers";

let db: Db;
let manager: Actor;
let owner: Actor;
let officeA: Actor;
let officeC: Actor;
let amiens: string;
let connolly: string;

beforeEach(async () => {
  db = await Db.open();
  manager = await db.createStaff("manager", "Gestão");
  owner = await db.createStaff("owner", "Dono");
  officeA = await db.createStaff("porter", "Office Amiens");
  officeC = await db.createStaff("porter", "Office Connolly");
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

async function admit(lodge: "AMIENS" | "CONNOLLY", name: string) {
  const [bed] = await db.freeBeds(lodge);
  await db.as(manager);
  const stay = (
    await db.one<{ id: string }>(
      "select public.admit_resident(p_pass_id => 'T' || substr(md5(random()::text), 1, 10), p_lodge => $1, p_bed => $2, p_first_name => $3, p_admitted_at => now() - interval '10 days') as id",
      [lodge === "AMIENS" ? amiens : connolly, bed, name],
    )
  ).id;
  await db.asSuperuser();
  return { stay, resident: (await db.one<{ r: string }>("select resident_id as r from public.stays where id = $1", [stay])).r };
}

const notifications = async (kind: string) => {
  await db.asSuperuser();
  return (await db.one<{ n: number }>("select count(*)::int as n from public.notifications where kind = $1", [kind])).n;
};

describe("Fridge / Temperatura", () => {
  it("B46: geladeira fora de 0 a 5 °C → alerta ao Manager; dentro da faixa, não", async () => {
    await db.as(officeA);
    await db.query("select public.record_fridge_temperature($1, 4.0, null)", [amiens]);
    expect(await notifications("fridge_out_of_range")).toBe(0);
    await db.as(officeA);
    await db.query("select public.record_fridge_temperature($1, 7.5, 'porta aberta')", [amiens]);
    expect(await notifications("fridge_out_of_range")).toBe(1);
    await db.asSuperuser();
    const r = await db.one("select out_of_range, range_min, range_max, recorded_by from public.fridge_readings where temperature = 7.5");
    expect(r).toEqual({ out_of_range: true, range_min: "0.0", range_max: "5.0", recorded_by: officeA.staffId });
  });

  it("em branco não é 0 °C: sem temperatura não salva", async () => {
    await db.as(officeA);
    expect(await db.error("select public.record_fridge_temperature($1, null, null)", [amiens])).toMatch(/temperature_required/);
  });

  it("limites versionados: a faixa vigente no momento fica guardada na leitura", async () => {
    await db.as(manager);
    await db.query("insert into public.parameters (key, value) values ('fridge.range_celsius', '{\"min\": 1, \"max\": 4}')");
    await db.as(officeA);
    await db.query("select public.record_fridge_temperature($1, 4.5, null)", [amiens]);
    await db.asSuperuser();
    expect(await db.one("select out_of_range, range_min, range_max from public.fridge_readings")).toEqual({ out_of_range: true, range_min: "1.0", range_max: "4.0" });
  });

  it("salvar a temperatura conclui a tarefa 'Temperatura da geladeira' do turno (abrir a tela sem salvar não conclui)", async () => {
    await db.as(officeA);
    const day = (await db.one<{ d: string }>("select public.operational_day(now())::text as d")).d;
    const shift = (await db.one<{ s: string }>("select public.shift_of(now()) as s")).s;
    const before = await db.query("select * from public.shift_tasks($1, $2::date, $3) where title ->> 'en-IE' = 'Fridge temperature'", [amiens, day, shift]);
    expect(before.rows[0]?.signatures ?? []).toEqual([]);
    await db.query("select public.record_fridge_temperature($1, 3.0, null)", [amiens]);
    const after = await db.query("select * from public.shift_tasks($1, $2::date, $3) where title ->> 'en-IE' = 'Fridge temperature'", [amiens, day, shift]);
    expect(after.rows[0].signatures.map((s: { staff_id: string }) => s.staff_id)).toEqual([officeA.staffId]);
  });

  it("Office não registra no outro Lodge", async () => {
    await db.as(officeC);
    expect(await db.error("select public.record_fridge_temperature($1, 3.0, null)", [amiens])).toMatch(/not_authorised/);
  });
});

describe("Food Delivery (Amiens)", () => {
  const deliver = (temp: string | null = "8.0", product: string | null = "Frango") =>
    db.error(
      "select public.record_food_delivery($1, $2, (select id from public.suppliers where name = 'Ripley''s'), 'L-2211', (now() + interval '5 days')::date, $3::numeric, null)",
      [amiens, product, temp],
    );

  it("produto e fornecedor são obrigatórios; lote e validade dependem do fornecedor; temperatura é opcional (Beta: itens secos)", async () => {
    await db.as(officeA);
    expect(await deliver("8.0", null)).toMatch(/fields_required/);
    expect(await deliver(null)).toBeNull();
    expect(await deliver("8.0")).toBeNull();
  });

  it("temperatura da entrega só fica registrada, sem limite e sem alerta", async () => {
    await db.as(officeA);
    expect(await deliver("15.0")).toBeNull();
    expect(await notifications("fridge_out_of_range")).toBe(0);
  });

  it("recebimento do fornecedor não marca Dinner nem Seen", async () => {
    const a = await admit("AMIENS", "Ana");
    await db.as(officeA);
    await deliver("4.0");
    await db.as(manager);
    const s = await db.one("select seen_day, seen_night from public.seen_for_day($1, public.operational_day(now())) where resident_id = $2", [amiens, a.resident]);
    expect(s).toEqual({ seen_day: false, seen_night: false });
  });

  it("só no Lodge com cozinha (Amiens)", async () => {
    await db.as(officeC);
    expect(
      await db.error("select public.record_food_delivery($1, 'Pão', (select id from public.suppliers where name = 'Tesco'), 'L1', now()::date + 2, 5.0, null)", [connolly]),
    ).toMatch(/service_not_available/);
  });
});

describe("Dinner (Amiens)", () => {
  const pastDay = async () => (await db.one<{ d: string }>("select (public.operational_day(now()) - 1)::text as d")).d;

  it("Dinner 'sim' vale como Seen Night (mesmo servido às 18h); 'não' não conta", async () => {
    const a = await admit("AMIENS", "Ana");
    const b = await admit("AMIENS", "Bia");
    const day = await pastDay();
    await db.as(officeA);
    await db.query("select public.mark_dinner($1, $2::date, $3, true)", [amiens, day, a.stay]);
    await db.query("select public.mark_dinner($1, $2::date, $3, false)", [amiens, day, b.stay]);
    await db.as(manager);
    const rows = await db.query("select resident_id, seen_night, night_sources from public.seen_for_day($1, $2::date)", [amiens, day]);
    const by = Object.fromEntries(rows.rows.map((r) => [r.resident_id, r]));
    expect(by[a.resident]).toMatchObject({ seen_night: true, night_sources: ["dinner"] });
    expect(by[b.resident]).toMatchObject({ seen_night: false });
  });

  it("uma marca por residente por serviço (marcar de novo atualiza, não duplica)", async () => {
    const a = await admit("AMIENS", "Ana");
    const day = await pastDay();
    await db.as(officeA);
    await db.query("select public.mark_dinner($1, $2::date, $3, false)", [amiens, day, a.stay]);
    await db.query("select public.mark_dinner($1, $2::date, $3, true)", [amiens, day, a.stay]);
    await db.asSuperuser();
    expect((await db.one("select count(*)::int as n, bool_and(served) as served from public.dinner_marks")).n).toBe(1);
  });

  it("Dinner com 'sim' tira o residente da lista de No Show", async () => {
    const a = await admit("AMIENS", "Ana");
    const day = await pastDay();
    await db.as(officeA);
    await db.query("select public.mark_dinner($1, $2::date, $3, true)", [amiens, day, a.stay]);
    const c = (await db.one("select public.no_show_review($1, $2::date) as r", [amiens, day])).r.candidates;
    expect(c.map((x: { stay_id: string }) => x.stay_id)).not.toContain(a.stay);
  });

  it("fechar sobras: Office não; Manager fecha depois das 22h; embalagens não são pessoas atendidas", async () => {
    const a = await admit("AMIENS", "Ana");
    const day = await pastDay();
    await db.as(officeA);
    await db.query("select public.mark_dinner($1, $2::date, $3, true)", [amiens, day, a.stay]);
    expect(await db.error("select public.close_dinner($1, $2::date, 6, 4, null)", [amiens, day])).toMatch(/not_authorised/);
    await db.as(manager);
    await db.query("select public.close_dinner($1, $2::date, 6, 4, 'sobras no freezer')", [amiens, day]);
    await db.as(manager); // resumo é só para a equipe
    const s = await db.one("select leftovers, packaged, closed_by, served_count from public.dinner_summary($1, $2::date)", [amiens, day]);
    expect(s).toEqual({ leftovers: 6, packaged: 4, closed_by: manager.staffId, served_count: 1 });
  });

  it("não fecha antes das 22h do dia", async () => {
    await db.as(manager);
    const today = (await db.one<{ d: string }>("select public.operational_day(now())::text as d")).d;
    const before22 = (await db.one<{ b: boolean }>("select now() < public.slot_instant(public.operational_day(now()), '22:00') as b")).b;
    const err = await db.error("select public.close_dinner($1, $2::date, 1, 0, null)", [amiens, today]);
    if (before22) expect(err).toMatch(/dinner_not_finished/);
    else expect(err).toBeNull();
  });

  it("depois de fechado, só o Owner (ou Developer) edita as sobras", async () => {
    const day = await pastDay();
    await db.as(manager);
    await db.query("select public.close_dinner($1, $2::date, 6, 4, null)", [amiens, day]);
    expect(await db.error("select public.close_dinner($1, $2::date, 5, 4, null)", [amiens, day])).toMatch(/dinner_already_closed/);
    await db.as(owner);
    await db.query("select public.close_dinner($1, $2::date, 5, 3, 'recontado')", [amiens, day]);
    await db.asSuperuser();
    expect((await db.one("select leftovers from public.dinner_services where lodge_id = $1 and operational_day = $2", [amiens, day])).leftovers).toBe(5);
  });

  it("Dinner só em Amiens", async () => {
    const c = await admit("CONNOLLY", "Caio");
    await db.as(officeC);
    expect(await db.error("select public.mark_dinner($1, public.operational_day(now()) - 1, $2, true)", [connolly, c.stay])).toMatch(/service_not_available/);
  });
});

describe("Laundry (Connolly)", () => {
  async function machine(code: string) {
    await db.asSuperuser();
    return (await db.one<{ id: string }>("select id from public.laundry_machines where lodge_id = $1 and code = $2", [connolly, code])).id;
  }

  it("quatro máquinas (A e B, Wash e Dry) só em Connolly", async () => {
    await db.asSuperuser();
    const m = await db.query("select l.code as lodge, m.code from public.laundry_machines m join public.lodges l on l.id = m.lodge_id order by 2");
    expect(m.rows).toEqual([
      { lodge: "CONNOLLY", code: "A-DRY" },
      { lodge: "CONNOLLY", code: "A-WASH" },
      { lodge: "CONNOLLY", code: "B-DRY" },
      { lodge: "CONNOLLY", code: "B-WASH" },
    ]);
  });

  it("iniciar cria uso aberto + anotação no Handover; máquina ocupada não inicia de novo; finalizar libera e anota o fim (Beta)", async () => {
    const c = await admit("CONNOLLY", "Caio");
    const wash = await machine("A-WASH");
    await db.as(officeC);
    const use = (await db.one<{ id: string }>("select public.start_laundry($1, $2) as id", [wash, c.stay])).id;
    expect(await db.error("select public.start_laundry($1, null)", [wash])).toMatch(/machine_busy/);
    await db.asSuperuser();
    const entries = async () => (await db.one<{ n: number }>("select count(*)::int as n from public.handover_entries where kind = 'laundry'")).n;
    expect(await entries()).toBe(1);
    expect((await db.one("select count(*)::int as n from public.handover_mentions m join public.laundry_uses u on u.handover_entry_id = m.entry_id where u.id = $1 and m.resident_id = $2", [use, c.resident])).n).toBe(1);
    await db.as(officeC);
    await db.query("select public.finish_laundry($1)", [use]);
    await db.asSuperuser();
    expect(await entries()).toBe(2);
    expect((await db.one("select finished_by from public.laundry_uses where id = $1", [use])).finished_by).toBe(officeC.staffId);
    await db.as(officeC);
    expect(await db.error("select public.start_laundry($1, null)", [wash])).toBeNull();
  });

  it("Office de Amiens não usa a lavanderia de Connolly", async () => {
    const wash = await machine("B-WASH");
    await db.as(officeA);
    expect(await db.error("select public.start_laundry($1, null)", [wash])).toMatch(/not_authorised/);
  });
});

describe("Notificações da gestão", () => {
  it("gestão vê e marca como lida; Office não vê avisos da gestão; marcar como lido não resolve nada", async () => {
    await db.as(officeA);
    await db.query("select public.record_fridge_temperature($1, 9.0, null)", [amiens]);
    expect((await db.query("select * from public.notifications")).rowCount).toBe(0);
    await db.as(manager);
    const list = await db.query("select * from public.my_notifications(20)");
    expect(list.rows.map((n) => [n.kind, n.read])).toEqual([["fridge_out_of_range", false]]);
    await db.query("select public.mark_notification_read($1)", [list.rows[0].id]);
    expect((await db.one("select read from public.my_notifications(20)")).read).toBe(true);
    expect((await db.one("select public.unread_notifications_count() as n")).n).toBe(0);
  });
});
