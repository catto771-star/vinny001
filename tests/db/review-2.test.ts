// Revisão 2 (25/11): ajustes pedidos depois do Beta.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Db } from "./helpers";

let db: Db;
beforeEach(async () => {
  db = await Db.open();
});
afterEach(async () => {
  await db.close();
});

describe("Segunda etapa da gestão (item 3)", () => {
  it("com a chave desligada, o Admin entra só com e-mail e senha; ligada, precisa do código", async () => {
    const owner = await db.createStaff("owner", "Owner Sem Codigo");
    await db.asSuperuser();
    await db.query("delete from public.mfa_email_challenges where user_id = $1", [owner.userId]);
    await db.as(owner);
    expect((await db.one("select public.is_management() as m")).m).toBe(false);
    await db.asSuperuser();
    await db.query("insert into public.parameters (key, value, valid_from) values ('security.require_mfa_management', 'false', now() - interval '1 minute')");
    await db.as(owner);
    expect((await db.one("select public.is_management() as m")).m).toBe(true);
  });
});

describe("Handover por turno: abertura, encerramento e horas (item 5)", () => {
  async function setup() {
    const admin = await db.createStaff("manager", "Admin");
    const station = await db.createStaff("station", "Amiens Reception");
    const pedro = await db.createStaff("porter", "Pedro", { login: false });
    const ana = await db.createStaff("porter", "Ana", { login: false });
    const amiens = await db.lodgeId("AMIENS");
    return { admin, station, pedro, ana, amiens };
  }

  it("abre o turno com o Porter; anotações pertencem ao turno; encerrar passa o serviço e abre o turno de quem assume", async () => {
    const { station, pedro, ana, amiens } = await setup();
    await db.as(station);
    const s1 = (await db.one<{ id: string }>("select public.open_handover_shift($1, $2) as id", [amiens, pedro.staffId])).id;
    expect(await db.error("select public.open_handover_shift($1, $2)", [amiens, ana.staffId])).toMatch(/shift_already_open/);
    const note = (await db.one<{ id: string }>("select public.add_handover_note($1, 'Bins out', null, '[]'::jsonb, null, null) as id", [amiens])).id;
    const s2 = (await db.one<{ id: string }>("select public.close_handover_shift($1, $2, 'All quiet') as id", [s1, ana.staffId])).id;
    await db.asSuperuser();
    const n = await db.one("select shift_id, filled_by from public.handover_entries where id = $1", [note]);
    expect(n).toEqual({ shift_id: s1, filled_by: pedro.staffId });
    const rows = (await db.query("select id, staff_id, handed_to, closed_at is not null as closed from public.handover_shifts where id = any($1)", [[s1, s2]])).rows;
    expect(rows.find((r) => r.id === s1)).toMatchObject({ handed_to: ana.staffId, closed: true });
    expect(rows.find((r) => r.id === s2)).toMatchObject({ staff_id: ana.staffId, closed: false });
    const kinds = (await db.query("select body from public.handover_entries where kind = 'shift' and lodge_id = $1 order by created_at, body", [amiens])).rows.map((r) => r.body);
    expect(kinds.join(" | ")).toMatch(/Shift opened — Pedro/);
    expect(kinds.join(" | ")).toMatch(/Shift closed — Pedro handed over to Ana/);
  });

  it("horas: o turno fechado é cruzado com o Roster; o Manager confirma e as horas trabalhadas passam a valer", async () => {
    const { admin, station, pedro, amiens } = await setup();
    await db.as(admin);
    const rota = (await db.one<{ id: string }>("select public.save_rota_shift(null, $1, $2, 'office', now() - interval '10 hours', now() + interval '2 hours') as id", [pedro.staffId, amiens])).id;
    await db.query("select public.publish_rota(now() - interval '11 hours', now() + interval '3 hours')");
    await db.asSuperuser();
    await db.as(station);
    const s = (await db.one<{ id: string }>("select public.open_handover_shift($1, $2) as id", [amiens, pedro.staffId])).id;
    await db.asSuperuser();
    // abriu 10 h atrás (no horário), fechou agora (2 h antes do previsto)
    await db.query("update public.handover_shifts set opened_at = now() - interval '10 hours' where id = $1", [s]);
    await db.as(station);
    await db.query("select public.close_handover_shift($1, null, null)", [s]);
    await db.as(admin);
    const r = await db.one("select rota_shift_id, mismatch, hours_status from public.shift_hours_review() where shift_id = $1", [s]);
    expect(r).toEqual({ rota_shift_id: rota, mismatch: true, hours_status: "pending" });
    expect((await db.one("select count(*)::int n from public.notifications where kind = 'shift_hours_review'")).n).toBe(1);
    await db.query("select public.confirm_shift_hours($1, now() - interval '10 hours', now())", [s]);
    const h = await db.one("select planned_minutes, effective_minutes from public.staff_hours(now() - interval '1 day', now() + interval '1 day') where staff_id = $1", [pedro.staffId]);
    expect(h).toEqual({ planned_minutes: 720, effective_minutes: 600 });
    expect((await db.one("select hours_status from public.shift_hours_review() where shift_id = $1", [s])).hours_status).toBe("confirmed");
    await db.as(station);
    expect(await db.error("select public.confirm_shift_hours($1, now() - interval '1 hour', now())", [s])).toMatch(/not_authorised/);
  });

  it("turno sem escala no Roster vira cobertura ao ser confirmado; quem não é Porter/Admin não abre turno", async () => {
    const { admin, station, ana, amiens } = await setup();
    const cleaner = await db.createStaff("cleaner", "Clara");
    await db.as(station);
    expect(await db.error("select public.open_handover_shift($1, $2)", [amiens, cleaner.staffId])).toMatch(/invalid_filled_by/);
    const s = (await db.one<{ id: string }>("select public.open_handover_shift($1, $2) as id", [amiens, ana.staffId])).id;
    await db.asSuperuser();
    await db.query("update public.handover_shifts set opened_at = now() - interval '8 hours' where id = $1", [s]);
    await db.as(station);
    await db.query("select public.close_handover_shift($1, null, null)", [s]);
    await db.as(admin);
    expect((await db.one("select rota_shift_id, mismatch from public.shift_hours_review() where shift_id = $1", [s]))).toEqual({ rota_shift_id: null, mismatch: true });
    await db.query("select public.confirm_shift_hours($1, null, null)", [s]);
    await db.asSuperuser();
    expect((await db.one("select count(*)::int n from public.rota_shifts where staff_id = $1 and status = 'published' and planned_starts_at is null", [ana.staffId])).n).toBe(1);
  });
});

describe("Correção: Final Written Warning duplicada (achada pela simulação em massa)", () => {
  it("a estadia só pode ter uma FW ativa; depois de desativada, outra pode ser dada", async () => {
    const admin = await db.createStaff("manager", "Admin");
    const amiens = await db.lodgeId("AMIENS");
    const [bed] = await db.freeBeds("AMIENS");
    await db.as(admin);
    const stay = (await db.one<{ id: string }>("select public.admit_resident(p_lodge => $1, p_bed => $2, p_first_name => 'Rui') as id", [amiens, bed])).id;
    const fw = (await db.one<{ id: string }>("select public.record_warning($1, 'final_written', 'Fight') as id", [stay])).id;
    expect(await db.error("select public.record_warning($1, 'final_written', 'Again')", [stay])).toMatch(/final_warning_active/);
    await db.query("select public.deactivate_final_warning($1, 'Reviewed')", [fw]);
    expect(await db.error("select public.record_warning($1, 'final_written', 'New one')", [stay])).toBeNull();
  });
});

describe("Daily Tasks de volta (item 10)", () => {
  it("Admin cria tarefa recorrente (turno) e pontual (para uma pessoa); a conta da casa assina em nome de quem está no turno", async () => {
    const admin = await db.createStaff("manager", "Admin");
    const station = await db.createStaff("station", "Amiens Reception");
    const pedro = await db.createStaff("porter", "Pedro", { login: false });
    const ana = await db.createStaff("porter", "Ana", { login: false });
    const amiens = await db.lodgeId("AMIENS");
    await db.as(admin);
    const day = (await db.one<{ d: string; s: string }>("select public.operational_day(now())::text d, public.shift_of(now()) s"));
    const tpl = (await db.one<{ id: string }>("select public.create_task_template($1, $2, null, '{\"en-IE\":\"Check fire exits\"}'::jsonb, 1, '10:00') as id", [amiens, day.s])).id;
    await db.asSuperuser();
    await db.query("update public.task_templates set created_at = now() - interval '2 days' where id = $1", [tpl]);
    await db.as(admin);
    const extra = (await db.one<{ id: string }>("select public.create_extra_task($1, $2::date, $3, $4, 'Call the plumber', null) as id", [amiens, day.d, day.s, ana.staffId])).id;
    await db.as(station);
    await db.query("select public.open_handover_shift($1, $2)", [amiens, pedro.staffId]);
    await db.query("select public.sign_task('template', $1, $2, $3::date, $4)", [tpl, amiens, day.d, day.s]);
    await db.query("select public.sign_task('extra', $1, $2, $3::date, $4, $5)", [extra, amiens, day.d, day.s, ana.staffId]);
    await db.asSuperuser();
    const sig = (await db.query<{ template_id: string | null; staff_id: string }>("select template_id, staff_id from public.task_signatures where lodge_id = $1", [amiens])).rows;
    expect(sig.find((x) => x.template_id === tpl)!.staff_id).toBe(pedro.staffId);
    expect(sig.find((x) => x.template_id === null)!.staff_id).toBe(ana.staffId);
  });

  it("sem turno aberto e sem escolher quem assina, a conta da casa não assina", async () => {
    const admin = await db.createStaff("manager", "Admin");
    const station = await db.createStaff("station", "Amiens Reception");
    const amiens = await db.lodgeId("AMIENS");
    await db.as(admin);
    const day = (await db.one<{ d: string; s: string }>("select public.operational_day(now())::text d, public.shift_of(now()) s"));
    const extra = (await db.one<{ id: string }>("select public.create_extra_task($1, $2::date, $3, null, 'Restock', null) as id", [amiens, day.d, day.s])).id;
    await db.as(station);
    expect(await db.error("select public.sign_task('extra', $1, $2, $3::date, $4)", [extra, amiens, day.d, day.s])).toMatch(/invalid_filled_by/);
  });
});
