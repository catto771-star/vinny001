// Beta — ajustes da operação (escopo final, seção 3).
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Db, type Actor } from "./helpers";

let db: Db;
let manager: Actor;
let officeA: Actor;
let amiens: string;
let connolly: string;

beforeEach(async () => {
  db = await Db.open();
  manager = await db.createStaff("manager", "Gestão");
  officeA = await db.createStaff("porter", "Office Amiens");
  amiens = await db.lodgeId("AMIENS");
  connolly = await db.lodgeId("CONNOLLY");
  await db.as(officeA);
  await db.query("select public.assume_post('office', $1)", [amiens]);
});

afterEach(async () => {
  await db.close();
});

/** Cria um horário (HH:MM, Dublin) a N minutos de agora e o põe na lista do parâmetro dado. */
async function slotIn(minutes: number, key: "rounds.hours" | "presence.check_times") {
  await db.asSuperuser();
  const r = await db.one<{ slot: string; day: string }>(
    `select to_char((now() + make_interval(mins => $1)) at time zone 'Europe/Dublin', 'HH24:MI') as slot,
            public.operational_day(now() + make_interval(mins => $1))::text as day`,
    [minutes],
  );
  await db.query("insert into public.parameters (key, value, valid_from) values ($1, $2::jsonb, now() - interval '3 days')", [key, JSON.stringify([r.slot])]);
  return r;
}

describe("Room Check fora do horário exato (escopo 3, Room Check)", () => {
  it("ronda feita 20 minutos antes é aceita e grava a hora real; previsto e realizado ficam no registro", async () => {
    const { slot, day } = await slotIn(20, "rounds.hours");
    await db.as(officeA);
    const r = (await db.one("select public.room_check_done($1, $2::date, $3) as r", [amiens, day, slot])).r;
    expect(r.status).toBe("recorded");
    await db.asSuperuser();
    const e = await db.one("select round_slot, occurred_at = now() as real_time from public.handover_entries where id = $1", [r.entry_id]);
    expect(e).toEqual({ round_slot: slot, real_time: true });
  });

  it("ronda feita 20 minutos depois também é aceita", async () => {
    const { slot, day } = await slotIn(-20, "rounds.hours");
    await db.as(officeA);
    expect((await db.one("select public.room_check_done($1, $2::date, $3) as r", [amiens, day, slot])).r.status).toBe("recorded");
  });

  it("ronda adiantada demais (mais de 60 minutos) continua recusada", async () => {
    const { slot, day } = await slotIn(75, "rounds.hours");
    await db.as(officeA);
    expect(await db.error("select public.room_check_done($1, $2::date, $3)", [amiens, day, slot])).toMatch(/round_in_future/);
  });

  it("check da folha aberto 20 minutos antes ou depois grava a hora real como hora do check", async () => {
    for (const minutes of [20, -20]) {
      const { slot, day } = await slotIn(minutes, "presence.check_times");
      await db.as(officeA);
      const run = (await db.one<{ id: string }>("select public.open_room_check($1, $2::date, $3) as id", [amiens, day, slot])).id;
      await db.asSuperuser();
      const row = await db.one("select slot, checked_at = now() as real_time, public.slot_instant(operational_day, slot) <> checked_at as differs from public.room_check_runs where id = $1", [run]);
      expect(row).toEqual({ slot, real_time: true, differs: true });
      await db.query("delete from public.room_check_runs where id = $1", [run]);
    }
  });

  it("check da folha aberto muito depois (digitação da folha de papel) usa a hora prevista, que pode ser ajustada", async () => {
    const { slot, day } = await slotIn(-180, "presence.check_times");
    await db.as(officeA);
    const run = (await db.one<{ id: string }>("select public.open_room_check($1, $2::date, $3) as id", [amiens, day, slot])).id;
    await db.asSuperuser();
    const row = await db.one("select public.slot_instant(operational_day, slot) = checked_at as planned from public.room_check_runs where id = $1", [run]);
    expect(row.planned).toBe(true);
  });
});

async function admitIn(lodge: string, code: "AMIENS" | "CONNOLLY", name: string) {
  const [bed] = await db.freeBeds(code);
  await db.as(manager);
  const stay = (
    await db.one<{ id: string }>(
      "select public.admit_resident(p_lodge => $1, p_bed => $2, p_first_name => $3, p_last_name => 'Test', p_admitted_at => now() - interval '3 days') as id",
      [lodge, bed, name],
    )
  ).id;
  return { stay, bed };
}

describe("Laundry (escopo 3)", () => {
  it("Handover registra exatamente o que começou e o que terminou, com o residente", async () => {
    const { stay } = await admitIn(connolly, "CONNOLLY", "Marta");
    await db.as(manager);
    const machines = (await db.query<{ machine_id: string; kind: string; label: string }>("select * from public.laundry_status($1)", [connolly])).rows;
    const wash = machines.find((m) => m.kind === "wash")!;
    const dry = machines.find((m) => m.kind === "dry")!;
    const w = (await db.one<{ id: string }>("select public.start_laundry($1, $2) as id", [wash.machine_id, stay])).id;
    const d = (await db.one<{ id: string }>("select public.start_laundry($1, $2) as id", [dry.machine_id, stay])).id;
    await db.query("select public.finish_laundry($1)", [w]);
    await db.query("select public.finish_laundry($1)", [d]);
    await db.asSuperuser();
    const rows = (await db.query<{ body: string; mentions: number }>(
      `select e.body, (select count(*)::int from public.handover_mentions m where m.entry_id = e.id and m.resident_id is not null) as mentions
       from public.handover_entries e where e.lodge_id = $1 and e.kind = 'laundry' order by e.created_at, e.body`, [connolly])).rows;
    expect(rows.map((r) => r.body).sort()).toEqual([
      `Dry finished — ${dry.label}`, `Dry started — ${dry.label}`, `Wash finished — ${wash.label}`, `Wash started — ${wash.label}`,
    ].sort());
    expect(rows.every((r) => r.mentions === 1)).toBe(true);
  });
});

describe("Dinner a qualquer hora (escopo 3)", () => {
  it("marca a qualquer hora do dia operacional; um dia que ainda não começou é recusado", async () => {
    const { stay } = await admitIn(amiens, "AMIENS", "Joana");
    await db.as(officeA);
    expect(await db.error("select public.mark_dinner($1, public.operational_day(now()), $2, true)", [amiens, stay])).toBeNull();
    expect(await db.error("select public.mark_dinner($1, public.operational_day(now()) + 1, $2, true)", [amiens, stay])).toMatch(/dinner_not_started/);
  });

  it("a regra de horário não existe mais no banco (antes: só 30 min antes das 18h)", async () => {
    await db.asSuperuser();
    const src = (await db.one<{ src: string }>("select prosrc as src from pg_proc where proname = 'mark_dinner'")).src;
    expect(src).not.toMatch(/'18:00'/);
  });
});

describe("Food Delivery sem temperatura (escopo 3)", () => {
  it("entrega de mercado/itens secos grava com a temperatura em branco; com temperatura continua igual", async () => {
    await db.as(officeA);
    const id = (await db.one<{ id: string }>(
      "select public.record_food_delivery($1, 'Weekly shopping', 'Tesco', 'n/a', (now() + interval '30 days')::date, null, null) as id", [amiens])).id;
    expect((await db.one("select temperature from public.food_deliveries where id = $1", [id])).temperature).toBeNull();
    expect(await db.error("select public.record_food_delivery($1, 'Chicken', 'Musgrave', 'L1', (now() + interval '3 days')::date, 3.5, null)", [amiens])).toBeNull();
    expect(await db.error("select public.record_food_delivery($1, '', 'Tesco', 'n/a', (now() + interval '3 days')::date, null, null)", [amiens])).toMatch(/fields_required/);
    expect(await db.error("select public.record_food_delivery($1, 'Ice', 'Tesco', 'n/a', (now() + interval '3 days')::date, 123456, null)", [amiens])).toMatch(/invalid_temperature/);
  });
});

describe("Geladeiras (escopo 3): 4 em Connolly, 1 em Amiens", () => {
  it("cada casa tem as suas geladeiras e cada uma tem a própria leitura e alerta", async () => {
    await db.as(officeA);
    const fridges = (await db.query<{ id: string; lodge_id: string; name: string }>("select id, lodge_id, name from public.fridges where active order by lodge_id, sort_order")).rows;
    expect(fridges.filter((f) => f.lodge_id === amiens)).toHaveLength(1);
    expect(fridges.filter((f) => f.lodge_id === connolly)).toHaveLength(4);
    const f3 = fridges.filter((f) => f.lodge_id === connolly)[2];
    await db.as(manager);
    await db.query("select public.record_fridge_reading($1, 3.0, null)", [f3.id]);
    await db.query("select public.record_fridge_reading($1, 7.5, 'door open')", [f3.id]);
    await db.asSuperuser();
    const r = await db.one("select count(*)::int as n, bool_or(out_of_range) as out, min(lodge_id::text) = $2 as lodge from public.fridge_readings where fridge_id = $1", [f3.id, connolly]);
    expect(r).toEqual({ n: 2, out: true, lodge: true });
    const n = await db.one("select payload ->> 'fridge_name' as name from public.notifications where kind = 'fridge_out_of_range' order by created_at desc limit 1");
    expect(n.name).toBe(f3.name);
  });

  it("Office só lê/registra na casa em que pode lançar; valor em branco ou absurdo é recusado", async () => {
    await db.as(officeA);
    const c1 = (await db.one<{ id: string }>("select id from public.fridges where lodge_id = $1 order by sort_order limit 1", [connolly])).id;
    const a1 = (await db.one<{ id: string }>("select id from public.fridges where lodge_id = $1 order by sort_order limit 1", [amiens])).id;
    expect(await db.error("select public.record_fridge_reading($1, 3.0, null)", [c1])).toMatch(/not_authorised/);
    expect(await db.error("select public.record_fridge_reading($1, null, null)", [a1])).toMatch(/temperature_required/);
    expect(await db.error("select public.record_fridge_reading($1, 99, null)", [a1])).toMatch(/invalid_temperature/);
    expect(await db.error("select public.record_fridge_reading(gen_random_uuid(), 3, null)")).toMatch(/fridge_not_found/);
  });

  it("a chamada antiga (por casa) continua valendo e grava na primeira geladeira da casa", async () => {
    await db.as(officeA);
    const id = (await db.one<{ id: string }>("select public.record_fridge_temperature($1, 4.0, null) as id", [amiens])).id;
    await db.asSuperuser();
    expect((await db.one("select fridge_id is not null as ok from public.fridge_readings where id = $1", [id])).ok).toBe(true);
  });
});

describe("Baixa automática da cama (escopo 3)", () => {
  it("ao tirar o residente da lista de ativos (Out efetivado), a cama fica livre na hora e aceita outra admissão", async () => {
    const { stay, bed } = await admitIn(amiens, "AMIENS", "Rui");
    await db.as(officeA);
    await db.query("select public.decide_out($1, 'Left')", [stay]);
    await db.as(manager);
    await db.query("select public.effect_out($1)", [stay]);
    await db.asSuperuser();
    expect((await db.one("select stay_id from public.bed_occupancy where bed_id = $1", [bed])).stay_id).toBeNull();
    await db.as(manager);
    expect(await db.error("select public.admit_resident(p_lodge => $1, p_bed => $2, p_first_name => 'Next')", [amiens, bed])).toBeNull();
  });
});
