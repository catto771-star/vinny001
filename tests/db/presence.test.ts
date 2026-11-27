// Fase 1 — Presença: Room Check, Seen, ausência comunicada e No Show (spec s.5).
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Db, type Actor } from "./helpers";

let db: Db;
let manager: Actor;
let officeA: Actor; // Office de Amiens
let officeA2: Actor; // outro Porter, também em Amiens (sem posto)
let officeC: Actor; // Office de Connolly
let float: Actor;
let amiens: string;
let connolly: string;

const DAY_MS = 86_400_000;
/** Dia operacional de N dias atrás (YYYY-MM-DD, calendário de Dublin aproximado pelo UTC — suficiente para dias passados). */
const daysAgo = (n: number) => new Date(Date.now() - n * DAY_MS).toISOString().slice(0, 10);

beforeEach(async () => {
  db = await Db.open();
  manager = await db.createStaff("manager", "Gestão");
  officeA = await db.createStaff("porter", "Office Amiens");
  officeA2 = await db.createStaff("porter", "Outro Porter");
  officeC = await db.createStaff("porter", "Office Connolly");
  float = await db.createStaff("porter", "Float");
  amiens = await db.lodgeId("AMIENS");
  connolly = await db.lodgeId("CONNOLLY");
  await db.as(officeA);
  await db.query("select public.assume_post('office', $1)", [amiens]);
  await db.as(officeC);
  await db.query("select public.assume_post('office', $1)", [connolly]);
  await db.as(float);
  await db.query("select public.assume_post('float', null)");
});

afterEach(async () => {
  await db.close();
});

/** Admite um residente N dias atrás (sem evidência no período testado). */
async function admit(lodge: "AMIENS" | "CONNOLLY", name: string, admittedDaysAgo = 10) {
  const [bed] = await db.freeBeds(lodge);
  await db.as(manager);
  const stay = (
    await db.one<{ id: string }>(
      "select public.admit_resident(p_pass_id => 'T' || substr(md5(random()::text), 1, 10), p_lodge => $1, p_bed => $2, p_first_name => $3, p_admitted_at => now() - make_interval(days => $4)) as id",
      [lodge === "AMIENS" ? amiens : connolly, bed, name, admittedDaysAgo],
    )
  ).id;
  await db.asSuperuser();
  const r = await db.one<{ resident_id: string }>("select resident_id from public.stays where id = $1", [stay]);
  return { stay, resident: r.resident_id, bed };
}

async function openCheck(actor: Actor, lodge: string, day: string, slot: string) {
  await db.as(actor);
  return (await db.one<{ id: string }>("select public.open_room_check($1, $2::date, $3) as id", [lodge, day, slot])).id;
}

async function mark(actor: Actor, run: string, stay: string, result: "seen" | "not_seen" | "absent") {
  await db.as(actor);
  return (await db.one("select public.mark_resident($1, $2, $3) as r", [run, stay, result])).r;
}

async function seen(lodge: string, day: string, resident: string) {
  await db.as(manager); // a consulta de Seen é só para a equipe
  const r = await db.query("select * from public.seen_for_day($1, $2::date) where resident_id = $3", [lodge, day, resident]);
  return r.rows[0];
}

/** Lança todos os checks do dia marcando todos como visto/não visto. */
async function launchAllChecks(actor: Actor, lodge: string, day: string, results: Record<string, "seen" | "not_seen"> = {}) {
  await db.asSuperuser();
  const slots = (await db.one<{ v: string[] }>("select public.check_slots($1, $2::date) as v", [lodge, day])).v;
  for (const slot of slots) {
    const run = await openCheck(actor, lodge, day, slot);
    await db.as(actor);
    const sheet = await db.query<{ stay_id: string | null }>("select stay_id from public.room_check_sheet($1)", [run]);
    for (const row of sheet.rows) {
      if (row.stay_id) await mark(actor, run, row.stay_id, results[row.stay_id] ?? "not_seen");
    }
    await db.as(actor);
    await db.query("select public.launch_room_check($1)", [run]);
  }
}

describe("Room Check e Seen", () => {
  it("A08/A09: visto nas 12h ou 18h → Seen Day; visto nas 22h → Seen Night, nos dois Lodges", async () => {
    const a = await admit("AMIENS", "Ana");
    const c = await admit("CONNOLLY", "Caio");
    const day = daysAgo(2);
    await mark(officeA, await openCheck(officeA, amiens, day, "12:00"), a.stay, "seen");
    await mark(officeC, await openCheck(officeC, connolly, day, "22:00"), c.stay, "seen");
    expect(await seen(amiens, day, a.resident)).toMatchObject({ seen_day: true, seen_night: false });
    expect(await seen(connolly, day, c.resident)).toMatchObject({ seen_day: false, seen_night: true });
  });

  it("B58/B57: Seen aparece na hora da marcação; tirar a marca desfaz; o check continua por lançar", async () => {
    const a = await admit("AMIENS", "Ana");
    const day = daysAgo(1);
    const run = await openCheck(officeA, amiens, day, "22:00");
    await mark(officeA, run, a.stay, "seen");
    expect((await seen(amiens, day, a.resident)).seen_night).toBe(true);
    await db.as(officeA);
    await db.query("select public.clear_mark($1, $2)", [run, a.stay]);
    expect((await seen(amiens, day, a.resident)).seen_night).toBe(false);
    await db.asSuperuser();
    expect((await db.one("select status from public.room_check_runs where id = $1", [run])).status).toBe("pending");
  });

  it("B03: check das 22h positivo deriva Seen Night uma vez, mesmo marcando de novo", async () => {
    const a = await admit("AMIENS", "Ana");
    const day = daysAgo(1);
    const run = await openCheck(officeA, amiens, day, "22:00");
    await mark(officeA, run, a.stay, "seen");
    await mark(officeA, run, a.stay, "seen");
    const s = await seen(amiens, day, a.resident);
    expect(s.night_sources).toEqual(["check"]);
    await db.asSuperuser();
    expect((await db.one("select count(*)::int as n from public.room_check_marks where run_id = $1", [run])).n).toBe(1);
  });

  it("B28: não lança check sem marcar todos os residentes", async () => {
    const a = await admit("AMIENS", "Ana");
    await admit("AMIENS", "Bia");
    const run = await openCheck(officeA, amiens, daysAgo(1), "12:00");
    await mark(officeA, run, a.stay, "seen");
    await db.as(officeA);
    expect(await db.error("select public.launch_room_check($1)", [run])).toMatch(/unmarked_residents/);
  });

  it("B25: lançar a mesma folha duas vezes avisa e não duplica", async () => {
    const a = await admit("AMIENS", "Ana");
    const day = daysAgo(1);
    const run = await openCheck(officeA, amiens, day, "12:00");
    await mark(officeA, run, a.stay, "seen");
    await db.as(officeA);
    expect((await db.one("select public.launch_room_check($1) as r", [run])).r.status).toBe("launched");
    expect((await db.one("select public.launch_room_check($1) as r", [run])).r.status).toBe("already_launched");
    expect(await openCheck(officeA, amiens, day, "12:00")).toBe(run);
    await db.asSuperuser();
    expect((await db.one("select count(*)::int as n from public.room_check_runs where lodge_id = $1 and operational_day = $2 and slot = '12:00'", [amiens, day])).n).toBe(1);
  });

  it("B29: lançar horas depois não pede motivo e preserva o horário real do check", async () => {
    const a = await admit("AMIENS", "Ana");
    const day = daysAgo(1);
    const run = await openCheck(officeA, amiens, day, "12:00");
    await mark(officeA, run, a.stay, "seen");
    await db.as(officeA);
    await db.query("select public.launch_room_check($1)", [run]);
    await db.asSuperuser();
    const r = await db.one("select checked_at, launched_at, status from public.room_check_runs where id = $1", [run]);
    expect(r.status).toBe("launched");
    expect(new Date(r.checked_at).getTime()).toBeLessThan(new Date(r.launched_at).getTime() - 3_600_000);
  });

  it("B26: Float faz a ronda e o Office digita; horário da digitação só para a gestão", async () => {
    const a = await admit("AMIENS", "Ana");
    const run = await openCheck(officeA, amiens, daysAgo(1), "12:00");
    await db.as(officeA);
    await db.query("select public.set_room_check_details($1, null, $2)", [run, float.staffId]);
    await mark(officeA, run, a.stay, "seen");
    await db.asSuperuser();
    const r = await db.one("select performed_by, entered_by, performed_reported_by_entrant from public.room_check_runs where id = $1", [run]);
    expect(r).toEqual({ performed_by: float.staffId, entered_by: officeA.staffId, performed_reported_by_entrant: true });

    await db.as(officeA);
    expect(await db.error("select entered_at from public.room_check_runs where id = $1", [run])).toMatch(/permission denied/);
    expect(await db.error("select marked_at from public.room_check_marks where run_id = $1", [run])).toMatch(/permission denied/);
    expect(await db.error("select * from public.room_check_typing_times($1)", [run])).toMatch(/not_authorised/);
    await db.as(manager);
    expect((await db.query("select * from public.room_check_typing_times($1)", [run])).rowCount).toBeGreaterThan(0);
  });

  it("B16: enquanto a ronda não foi lançada o autor corrige em até 72h; outro Office não; Manager sempre. Depois de lançada, ninguém remarca", async () => {
    const a = await admit("AMIENS", "Ana");
    const run = await openCheck(officeA, amiens, daysAgo(1), "12:00");
    await mark(officeA, run, a.stay, "not_seen");
    await mark(officeA, run, a.stay, "seen"); // autor, dentro de 72h

    // Outro Porter, agora no posto de Amiens, não corrige a marca do colega.
    await db.as(officeA2);
    await db.query("select public.assume_post('office', $1, true)", [amiens]);
    expect(await db.error("select public.mark_resident($1, $2, 'not_seen')", [run, a.stay])).toMatch(/not_author/);

    // Depois de 72h, nem o autor; o Manager sempre.
    await db.asSuperuser();
    await db.query("update public.room_check_marks set marked_at = now() - interval '73 hours' where run_id = $1", [run]);
    await db.as(officeA);
    await db.query("select public.assume_post('office', $1, true)", [amiens]);
    expect(await db.error("select public.mark_resident($1, $2, 'not_seen')", [run, a.stay])).toMatch(/correction_window_closed/);
    await mark(manager, run, a.stay, "not_seen");

    // Lançada, a ronda não aceita remarcação de ninguém (R18).
    await mark(manager, run, a.stay, "seen");
    await db.as(officeA);
    await db.query("select public.launch_room_check($1)", [run]);
    expect(await db.error("select public.mark_resident($1, $2, 'not_seen')", [run, a.stay])).toMatch(/run_launched/);
    await db.as(manager);
    expect(await db.error("select public.mark_resident($1, $2, 'not_seen')", [run, a.stay])).toMatch(/run_launched/);
  });

  it("B40: Office de Connolly não marca nem lança check de Amiens", async () => {
    const a = await admit("AMIENS", "Ana");
    const run = await openCheck(officeA, amiens, daysAgo(1), "12:00");
    await db.as(officeC);
    expect(await db.error("select public.mark_resident($1, $2, 'seen')", [run, a.stay])).toMatch(/not_authorised/);
    expect(await db.error("select public.open_room_check($1, $2::date, '18:00')", [amiens, daysAgo(1)])).toMatch(/not_authorised/);
  });

  it("Ninguém escreve diretamente nas tabelas de check", async () => {
    const a = await admit("AMIENS", "Ana");
    const run = await openCheck(officeA, amiens, daysAgo(1), "12:00");
    await db.as(manager);
    expect(await db.error("insert into public.room_check_marks (run_id, stay_id, resident_id, result, marked_by) values ($1, $2, $3, 'seen', $4)", [run, a.stay, a.resident, manager.staffId])).toMatch(/permission denied/);
  });

  it("B04: Seen manual sem check registra hora, local e autor", async () => {
    const a = await admit("AMIENS", "Ana");
    const day = daysAgo(1);
    await db.as(officeA);
    await db.query(
      "select public.record_sighting($1, $2, public.operational_day_start($3::date) + interval '3 hours', 'Cozinha')",
      [a.resident, amiens, day],
    );
    const s = await seen(amiens, day, a.resident);
    expect(s).toMatchObject({ seen_day: true });
    expect(s.day_sources).toEqual(["manual"]);
    await db.asSuperuser();
    expect(await db.one("select place, recorded_by from public.sightings where resident_id = $1", [a.resident])).toEqual({ place: "Cozinha", recorded_by: officeA.staffId });
  });

  it("B37/B21: transferência gera Seen de check-in no turno da entrada; checks anteriores ficam no Lodge de origem", async () => {
    const a = await admit("AMIENS", "Ana");
    const day = daysAgo(1);
    const run12 = await openCheck(float, amiens, day, "12:00");
    await mark(float, run12, a.stay, "seen");
    // Transferência às 15h (Day) desse dia para Connolly.
    const [cBed] = await db.freeBeds("CONNOLLY");
    await db.as(float);
    const newStay = (
      await db.one<{ id: string }>("select public.transfer_resident($1, $2, public.operational_day_start($3::date) + interval '8 hours') as id", [a.stay, cBed, day])
    ).id;
    const inConnolly = await seen(connolly, day, a.resident);
    expect(inConnolly.day_sources).toContain("check-in");
    // O check das 12h continua no Lodge de origem.
    await db.asSuperuser();
    expect((await db.one("select r.lodge_id from public.room_check_marks m join public.room_check_runs r on r.id = m.run_id where m.stay_id = $1", [a.stay])).lodge_id).toBe(amiens);
    // A folha das 22h de Amiens não tem mais a residente; a de Connolly tem.
    await db.as(float);
    const amiens22 = await db.query("select stay_id from public.room_check_sheet($1)", [await openCheck(float, amiens, day, "22:00")]);
    expect(amiens22.rows.map((r) => r.stay_id)).not.toContain(a.stay);
    await db.as(float);
    const connolly22 = await db.query("select stay_id from public.room_check_sheet($1)", [await openCheck(float, connolly, day, "22:00")]);
    expect(connolly22.rows.map((r) => r.stay_id)).toContain(newStay);
  });

  it("Os horários dos checks do dia vêm do parâmetro vigente no dia (B22)", async () => {
    await db.asSuperuser();
    const slots = (await db.one("select public.check_slots($1, $2::date) as v", [amiens, daysAgo(1)])).v;
    expect(slots).toEqual(["12:00", "18:00", "22:00"]);
    await db.as(officeA);
    expect(await db.error("select public.open_room_check($1, $2::date, '13:00')", [amiens, daysAgo(1)])).toMatch(/invalid_slot/);
  });

  it("Folha do dia: quartos e camas livres aparecem; residente com nome, quarto, cama e nascimento", async () => {
    const a = await admit("AMIENS", "Ana");
    const run = await openCheck(officeA, amiens, daysAgo(1), "12:00");
    await db.as(officeA);
    const sheet = await db.query("select * from public.room_check_sheet($1)", [run]);
    expect(sheet.rowCount).toBe(37);
    const row = sheet.rows.find((r) => r.stay_id === a.stay);
    expect(row).toMatchObject({ first_name: "Ana", room_code: expect.any(String), bed_number: expect.any(Number) });
    expect(sheet.rows.filter((r) => r.stay_id === null).length).toBe(36);
  });
});

describe("Ausência comunicada", () => {
  it("Exige início e retorno previsto; não libera a cama", async () => {
    const a = await admit("AMIENS", "Ana");
    await db.as(officeA);
    expect(await db.error("select public.register_absence($1, now(), now() - interval '1 day', null)", [a.stay])).toMatch(/invalid_absence_period/);
    await db.query("select public.register_absence($1, now(), now() + interval '3 days', 'Viagem')", [a.stay]);
    await db.asSuperuser();
    expect((await db.one("select stay_id from public.bed_occupancy where bed_id = $1", [a.bed])).stay_id).toBe(a.stay);
  });

  it("'Ausência comunicada' na folha só para quem tem ausência ativa", async () => {
    const a = await admit("AMIENS", "Ana");
    const run = await openCheck(officeA, amiens, daysAgo(1), "12:00");
    await db.as(officeA);
    expect(await db.error("select public.mark_resident($1, $2, 'absent')", [run, a.stay])).toMatch(/no_active_absence/);
  });

  it("B05: residente em ausência marcado como visto → pergunta; se sim, retorno antecipado com autor", async () => {
    const a = await admit("AMIENS", "Ana");
    await db.as(officeA);
    const absence = (await db.one<{ id: string }>("select public.register_absence($1, now() - interval '1 day', now() + interval '2 days', null) as id", [a.stay])).id;
    // Visto agora (Seen manual) durante a ausência.
    await db.as(officeA);
    const r = (await db.one("select public.record_sighting($1, $2, now(), 'Recepção') as r", [a.resident, amiens])).r;
    expect(r.absence_active).toBe(true);
    expect(r.absence_id).toBe(absence);
    await db.as(officeA);
    await db.query("select public.end_absence($1, null)", [absence]);
    await db.asSuperuser();
    const ab = await db.one("select ended_by, ended_at is not null as ended from public.absences where id = $1", [absence]);
    expect(ab).toEqual({ ended_by: officeA.staffId, ended: true });
  });

  it("Retorno previsto vencido vira pendência e não prorroga sozinho", async () => {
    const a = await admit("AMIENS", "Ana");
    await db.as(officeA);
    await db.query("select public.register_absence($1, now() - interval '3 days', now() - interval '1 hour', null)", [a.stay]);
    const overdue = await db.query("select * from public.overdue_absences($1)", [amiens]);
    expect(overdue.rows.map((r) => r.stay_id)).toEqual([a.stay]);
  });
});

describe("No Show", () => {
  it("B06: residente sem evidência aparece na lista; Office confirma; fica registrado", async () => {
    const a = await admit("AMIENS", "Ana");
    const b = await admit("AMIENS", "Bia");
    const day = daysAgo(2);
    await launchAllChecks(officeA, amiens, day, { [b.stay]: "seen" });
    await db.as(officeA);
    const review = (await db.one("select public.no_show_review($1, $2::date) as r", [amiens, day])).r;
    expect(review.complete).toBe(true);
    expect(review.candidates.map((c: { stay_id: string }) => c.stay_id)).toEqual([a.stay]);
    await db.query("select public.confirm_no_shows($1, $2::date, $3::uuid[])", [amiens, day, [a.stay]]);
    await db.asSuperuser();
    const ns = await db.one("select status, confirmed_by from public.no_shows where resident_id = $1 and operational_day = $2", [a.resident, day]);
    expect(ns).toEqual({ status: "confirmed", confirmed_by: officeA.staffId });
  });

  it("B27: com check por lançar a lista fica incompleta e a confirmação bloqueada", async () => {
    const a = await admit("AMIENS", "Ana");
    const day = daysAgo(2);
    const run = await openCheck(officeA, amiens, day, "12:00");
    await mark(officeA, run, a.stay, "not_seen"); // por lançar
    await db.as(officeA);
    const review = (await db.one("select public.no_show_review($1, $2::date) as r", [amiens, day])).r;
    expect(review.complete).toBe(false);
    expect(review.pending_slots).toEqual(["12:00", "18:00", "22:00"]);
    expect(await db.error("select public.confirm_no_shows($1, $2::date, $3::uuid[])", [amiens, day, [a.stay]])).toMatch(/checks_pending/);
  });

  it("B07: sem confirmação, nenhum No Show é criado sozinho", async () => {
    await admit("AMIENS", "Ana");
    const day = daysAgo(2);
    await launchAllChecks(officeA, amiens, day);
    await db.as(officeA);
    expect((await db.one("select public.no_show_review($1, $2::date) as r", [amiens, day])).r.candidates).toHaveLength(1);
    await db.asSuperuser();
    expect((await db.one("select count(*)::int as n from public.no_shows")).n).toBe(0);
  });

  it("B08: residente com ausência ativa não aparece na lista", async () => {
    const a = await admit("AMIENS", "Ana");
    const day = daysAgo(2);
    await db.as(officeA);
    await db.query("select public.register_absence($1, now() - interval '4 days', now() + interval '1 day', null)", [a.stay]);
    await launchAllChecks(officeA, amiens, day);
    await db.as(officeA);
    expect((await db.one("select public.no_show_review($1, $2::date) as r", [amiens, day])).r.candidates).toHaveLength(0);
  });

  it("Evidência em qualquer turno do dia (check, Seen manual, check-in) tira da lista", async () => {
    const a = await admit("AMIENS", "Ana");
    const day = daysAgo(2);
    await launchAllChecks(officeA, amiens, day);
    await db.as(officeA);
    await db.query("select public.record_sighting($1, $2, public.operational_day_start($3::date) + interval '20 hours', 'Porta')", [a.resident, amiens, day]);
    expect((await db.one("select public.no_show_review($1, $2::date) as r", [amiens, day])).r.candidates).toHaveLength(0);
  });

  it("Não confirma antes das 06h30 do fim do dia operacional (dia que ainda não acabou)", async () => {
    const a = await admit("AMIENS", "Ana");
    await db.as(officeA);
    // Dia que nunca terminou na hora do teste (antes o teste usava hoje e falhava entre 06h30 e 07h00).
    const today = (await db.one("select (public.operational_day(now()) + 1)::text as d")).d;
    expect(await db.error("select public.confirm_no_shows($1, $2::date, $3::uuid[])", [amiens, today, [a.stay]])).toMatch(/day_not_finished/);
  });

  it("B09: 3º No Show do mês avisa a gestão; 4º aceito; no mês seguinte o contador recomeça", async () => {
    const a = await admit("AMIENS", "Ana", 120);
    await db.asSuperuser();
    // Dias no mesmo mês do calendário (há ~60 dias) e um no mês seguinte.
    const base = await db.one<{ d: string; next: string }>(
      "select to_char(date_trunc('month', now() - interval '60 days'), 'YYYY-MM-DD') as d, to_char(date_trunc('month', now() - interval '60 days') + interval '1 month', 'YYYY-MM-DD') as next",
    );
    const days = [0, 1, 2, 3].map((i) => new Date(Date.parse(base.d) + i * DAY_MS).toISOString().slice(0, 10));
    const counts: number[] = [];
    for (const day of days) {
      await launchAllChecks(manager, amiens, day);
      await db.as(manager);
      const r = (await db.one("select public.confirm_no_shows($1, $2::date, $3::uuid[]) as r", [amiens, day, [a.stay]])).r;
      counts.push(r[0].month_count);
    }
    expect(counts).toEqual([1, 2, 3, 4]);
    await db.asSuperuser();
    const alerts = await db.query("select payload from public.notifications where kind = 'no_show_monthly_limit'");
    expect(alerts.rows.map((r) => r.payload.month_count)).toEqual([3, 4]);
    // Mês seguinte
    await launchAllChecks(manager, amiens, base.next);
    await db.as(manager);
    const r = (await db.one("select public.confirm_no_shows($1, $2::date, $3::uuid[]) as r", [amiens, base.next, [a.stay]])).r;
    expect(r[0].month_count).toBe(1);
  });

  it("B36: readmissão depois de um Out no mesmo mês zera o contador; o histórico continua consultável", async () => {
    const a = await admit("AMIENS", "Ana", 120);
    // Tudo dentro do mês passado (sempre inteiro no passado).
    await db.asSuperuser();
    const m = (await db.one<{ d: string }>("select to_char(date_trunc('month', now()) - interval '1 month', 'YYYY-MM-DD') as d")).d;
    const at = (offsetDays: number) => new Date(Date.parse(m) + offsetDays * DAY_MS).toISOString().slice(0, 10);
    const day1 = at(2);
    await launchAllChecks(manager, amiens, day1);
    await db.as(manager);
    await db.query("select public.confirm_no_shows($1, $2::date, $3::uuid[])", [amiens, day1, [a.stay]]);
    await db.query("select public.effect_out($1, public.operational_day_start($2::date))", [a.stay, at(4)]);
    const [bed] = await db.freeBeds("AMIENS");
    await db.as(manager);
    const stay2 = (
      await db.one<{ id: string }>(
        "select public.admit_resident(p_lodge => $1, p_bed => $2, p_resident_id => $3, p_admitted_at => public.operational_day_start($4::date)) as id",
        [amiens, bed, a.resident, at(6)],
      )
    ).id;
    const day2 = at(9);
    await launchAllChecks(manager, amiens, day2);
    await db.as(manager);
    const r = (await db.one("select public.confirm_no_shows($1, $2::date, $3::uuid[]) as r", [amiens, day2, [stay2]])).r;
    expect(r[0].month_count).toBe(1);
    await db.asSuperuser();
    expect((await db.one("select count(*)::int as n from public.no_shows where resident_id = $1", [a.resident])).n).toBe(2);
  });

  it("B10: Office não desfaz No Show nem cancela a cama; Manager desfaz com motivo; histórico preservado", async () => {
    const a = await admit("AMIENS", "Ana");
    const day = daysAgo(2);
    await launchAllChecks(officeA, amiens, day);
    await db.as(officeA);
    await db.query("select public.confirm_no_shows($1, $2::date, $3::uuid[])", [amiens, day, [a.stay]]);
    await db.asSuperuser();
    const ns = (await db.one<{ id: string }>("select id from public.no_shows where resident_id = $1", [a.resident])).id;
    await db.as(officeA);
    expect(await db.error("select public.undo_no_show($1, 'engano')", [ns])).toMatch(/not_authorised/);
    expect(await db.error("select public.effect_out($1)", [a.stay])).toMatch(/not_authorised/);
    await db.as(manager);
    expect(await db.error("select public.undo_no_show($1, '')", [ns])).toMatch(/reason_required/);
    await db.query("select public.undo_no_show($1, 'Estava no quarto')", [ns]);
    await db.asSuperuser();
    expect(await db.one("select status, undo_reason, undone_by from public.no_shows where id = $1", [ns])).toEqual({
      status: "undone",
      undo_reason: "Estava no quarto",
      undone_by: manager.staffId,
    });
    expect((await db.one("select count(*)::int as n from public.audit_log where table_name = 'no_shows' and record_id = $1", [ns])).n).toBe(2);
  });

  it("No máximo um No Show por residente por dia", async () => {
    const a = await admit("AMIENS", "Ana");
    const day = daysAgo(2);
    await launchAllChecks(officeA, amiens, day);
    await db.as(officeA);
    await db.query("select public.confirm_no_shows($1, $2::date, $3::uuid[])", [amiens, day, [a.stay]]);
    expect(await db.error("select public.confirm_no_shows($1, $2::date, $3::uuid[])", [amiens, day, [a.stay]])).toMatch(/not_a_candidate/);
  });

  it("Alerta das 18h30: lista quem ainda não tem evidência hoje, sem registrar nada", async () => {
    const a = await admit("AMIENS", "Ana");
    await db.as(officeA);
    const r = (await db.one("select public.presence_alert($1) as r", [amiens])).r;
    expect(r.without_evidence.map((x: { stay_id: string }) => x.stay_id)).toContain(a.stay);
    await db.asSuperuser();
    expect((await db.one("select count(*)::int as n from public.no_shows")).n).toBe(0);
  });
});
