// Revisão 16 — cama cancelada fica livre para outro residente; painel da Home por período.
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

let n = 0;
async function admit(bed: string, name = "Pat") {
  await db.as(admin);
  return (await db.one<{ id: string }>("select public.admit_resident(p_lodge => $1, p_bed => $2, p_first_name => $3, p_pass_id => $4, p_admitted_at => now() - interval '5 days') as id", [amiens, bed, name, `R16-${++n}-${Math.random().toString(36).slice(2, 7)}`])).id;
}
const dash = async (args = "") => (await db.one<{ d: any }>(`select public.home_dashboard(${args}) as d`)).d;
const lodgeStats = (d: any) => d.lodges.find((l: any) => l.lodge_id === amiens);

describe("cama cancelada fica livre", () => {
  it("quem tem o cancelamento decidido deixa a cama disponível: outro residente pode ser admitido e o cancelamento é efetivado", async () => {
    const [bed] = await db.freeBeds("AMIENS");
    const stay = await admit(bed, "Leaving");
    await db.as(station);
    await db.query("select public.decide_out($1, 'Moving out')", [stay]);
    const [other] = await db.freeBeds("AMIENS", 2).then((x) => x.filter((b) => b !== bed));
    expect(other).toBeTruthy();
    await db.as(station);
    expect(await db.error("select public.admit_resident(p_lodge => $1, p_bed => $2, p_first_name => 'Newcomer', p_pass_id => 'R16-NEW1')", [amiens, bed])).toBeNull();
    await db.asSuperuser();
    const old = await db.one<{ status: string; end_reason: string; ended_by: string }>("select status::text, end_reason::text, ended_by from public.stays where id = $1", [stay]);
    expect(old).toMatchObject({ status: "ended", end_reason: "out", ended_by: station.staffId });
    expect((await db.one<{ n: number }>("select count(*)::int n from public.stays where bed_id = $1 and status <> 'ended'", [bed])).n).toBe(1);
  });
  it("transferir para uma cama cancelada também funciona", async () => {
    const [b1, b2, b3] = await db.freeBeds("AMIENS", 3);
    const a = await admit(b1, "Leaving");
    const m = await admit(b2, "Mover");
    await db.as(station);
    await db.query("select public.decide_out($1, 'Moving out')", [a]);
    expect(await db.error("select public.transfer_resident($1, $2)", [m, b1])).toBeNull();
    await db.asSuperuser();
    expect((await db.one<{ status: string }>("select status::text from public.stays where id = $1", [a])).status).toBe("ended");
    expect(b3).toBeTruthy();
  });
  it("cama com residente ativo continua ocupada (não é liberada por engano)", async () => {
    const [bed] = await db.freeBeds("AMIENS");
    await admit(bed, "Stays");
    await db.as(station);
    expect(await db.error("select public.admit_resident(p_lodge => $1, p_bed => $2, p_first_name => 'X', p_pass_id => 'R16-NEW2')", [amiens, bed])).toMatch(/stays_one_open_per_bed/);
  });
  it("no painel: a cama cancelada conta como livre e o residente aparece em out_pending; o ocupado não a inclui", async () => {
    const [bed] = await db.freeBeds("AMIENS");
    const stay = await admit(bed, "Leaving");
    await db.as(admin);
    const before = lodgeStats(await dash());
    await db.query("select public.decide_out($1, 'Moving out')", [stay]);
    const after = lodgeStats(await dash());
    expect(after.out_pending).toBe(before.out_pending + 1);
    expect(after.occupied).toBe(before.occupied - 1);
    expect(after.present).toBe(before.occupied);
    expect(after.beds_total - after.occupied - after.out_of_use).toBe(before.beds_total - before.occupied - before.out_of_use + 1);
  });
});

describe("home_dashboard por período", () => {
  it("padrão: 14 dias; com datas: do primeiro ao último dia, e traz os totais do período", async () => {
    await db.as(admin);
    expect((await dash()).series).toHaveLength(14);
    const d = await dash("current_date - 6, current_date");
    expect(d.series).toHaveLength(7);
    expect(d.period).toMatchObject({ from: expect.any(String), to: expect.any(String) });
    expect(Object.keys(d.totals).sort()).toEqual(["admissions", "avg_occupancy", "maintenance", "no_shows", "outs"]);
  });
  it("recusa período invertido, no futuro distante ou acima de 366 dias", async () => {
    await db.as(admin);
    expect(await db.error("select public.home_dashboard(current_date, current_date - 3)")).toMatch(/invalid_period/);
    expect(await db.error("select public.home_dashboard(current_date - 400, current_date)")).toMatch(/invalid_period/);
    expect(await db.error("select public.home_dashboard(current_date, current_date + 40)")).toMatch(/invalid_period/);
    expect(await db.error("select public.home_dashboard(date '2026-11-01', 'infinity')")).toMatch(/invalid_period/);
    expect(await db.error("select public.home_dashboard('-infinity', current_date)")).toMatch(/invalid_period/);
  });
  it("a conta de casa vê só a própria casa e só números dela", async () => {
    await db.as(station);
    const d = await dash("current_date - 6, current_date");
    expect(d.lodges).toHaveLength(1);
  });
  it("totais do período contam admissões e cancelamentos efetivados do intervalo", async () => {
    const [bed] = await db.freeBeds("AMIENS");
    const stay = await admit(bed, "Leaving");
    await db.as(admin);
    await db.query("select public.decide_out($1, 'x')", [stay]);
    await db.query("select public.effect_out($1, now())", [stay]);
    const d = await dash("current_date - 6, current_date");
    expect(d.totals.outs).toBeGreaterThanOrEqual(1);
    const total = d.series.reduce((s: number, p: any) => s + p.outs, 0);
    expect(d.totals.outs).toBe(total);
  });
});
