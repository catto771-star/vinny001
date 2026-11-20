import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Db, type Actor } from "./helpers";

let db: Db;
let manager: Actor;
let owner: Actor;
let porterA: Actor;
let porterB: Actor;
let amiens: string;
let connolly: string;

beforeEach(async () => {
  db = await Db.open();
  manager = await db.createStaff("manager", "Test Manager");
  owner = await db.createStaff("owner", "Test Owner");
  porterA = await db.createStaff("porter", "Porter A");
  porterB = await db.createStaff("porter", "Porter B");
  amiens = await db.lodgeId("AMIENS");
  connolly = await db.lodgeId("CONNOLLY");
});

afterEach(async () => {
  await db.close();
});

async function assume(actor: Actor, fn: "office" | "float", lodge: string | null, confirm = false) {
  await db.as(actor);
  return (await db.one<{ r: Record<string, unknown> }>("select public.assume_post($1, $2, $3) as r", [fn, lodge, confirm])).r;
}

async function admit(actor: Actor, lodge: string, bed: string, firstName = "Demo") {
  await db.as(actor);
  return (
    await db.one<{ id: string }>(
      "select public.admit_resident(p_lodge => $1, p_bed => $2, p_first_name => $3, p_last_name => 'Resident') as id",
      [lodge, bed, firstName],
    )
  ).id;
}

describe("Login e usuários", () => {
  it("B01: Office tenta criar um usuário → bloqueado; Manager cria", async () => {
    await db.as(porterA);
    expect(await db.error("insert into public.staff (full_name, role) values ('X', 'porter')")).toMatch(/row-level security/);

    await db.as(manager);
    const created = await db.one("insert into public.staff (full_name, role) values ('New Porter', 'porter') returning id");
    expect(created.id).toBeTruthy();
  });

  it("v1.1 A01: usuário não cadastrado não entra (não vê nada)", async () => {
    await db.asSuperuser();
    const stranger = await db.one<{ id: string }>("insert into auth.users (email) values ('stranger@test.local') returning id");
    await db.as({ userId: stranger.id, staffId: "", role: "none" });
    expect((await db.query("select * from public.lodges")).rowCount).toBe(0);
    expect((await db.query("select * from public.residents")).rowCount).toBe(0);
    expect(await db.error("select public.assume_post('office', $1)", [amiens])).toMatch(/not_authorised/);
  });

  it("anon não lê nada", async () => {
    await db.asSuperuser();
    await db.query("set local role anon");
    expect(await db.error("select * from public.staff")).toMatch(/permission denied/);
  });

  it("B02: usuário desativado perde o acesso na hora; posto encerrado; histórico preservado", async () => {
    await assume(porterA, "office", amiens);
    await db.as(porterA);
    expect((await db.query("select * from public.lodges")).rowCount).toBe(2);

    await db.as(manager);
    await db.query("update public.staff set active = false, version = version where id = $1", [porterA.staffId]);

    await db.as(porterA);
    expect((await db.query("select * from public.lodges")).rowCount).toBe(0);
    expect(await db.error("select public.assume_post('office', $1)", [amiens])).toMatch(/not_authorised/);

    await db.asSuperuser();
    const post = await db.one("select ended_at, end_reason from public.duty_posts where staff_id = $1", [porterA.staffId]);
    expect(post.end_reason).toBe("deactivated");
    const staff = await db.one("select active, deactivated_by from public.staff where id = $1", [porterA.staffId]);
    expect(staff.active).toBe(false);
    expect(staff.deactivated_by).toBe(manager.staffId);
  });

  it("Ninguém cria outra conta Developer; só existe uma", async () => {
    await db.as(manager);
    expect(await db.error("insert into public.staff (full_name, role) values ('Dev2', 'developer')")).toMatch(/row-level security/);
    await db.createStaff("developer", "The Developer");
    await db.asSuperuser();
    expect(await db.error("insert into public.staff (full_name, role) values ('Dev2', 'developer')")).toMatch(/staff_single_developer/);
  });

  it("Manager sem a segunda etapa (aal1) não tem permissões de gestão", async () => {
    await db.as({ ...manager, aal: "aal1" });
    expect(await db.error("insert into public.staff (full_name, role) values ('X', 'porter')")).toMatch(/row-level security/);
  });

  it("Cleaner não tem login", async () => {
    await db.asSuperuser();
    const user = await db.one<{ id: string }>("insert into auth.users (email) values ('c@test.local') returning id");
    expect(await db.error("insert into public.staff (user_id, full_name, role) values ($1, 'C', 'cleaner')", [user.id])).toMatch(/check constraint/);
  });

  it("Usuário troca o próprio idioma e não o de outra pessoa", async () => {
    await db.as(porterA);
    await db.query("select public.set_my_locale('pl-PL')");
    expect(await db.error("update public.staff set locale = 'pt-PT' where id = $1", [porterB.staffId])).toBeNull();
    await db.asSuperuser();
    const rows = await db.query("select id, locale from public.staff where id in ($1, $2)", [porterA.staffId, porterB.staffId]);
    const byId = Object.fromEntries(rows.rows.map((r) => [r.id, r.locale]));
    expect(byId[porterA.staffId]).toBe("pl-PL");
    expect(byId[porterB.staffId]).toBe("en-IE"); // update silencioso de 0 linhas pela RLS
  });
});

describe("Assumir Posto", () => {
  it("B42: Porter assume On Duty → registro de quem está de serviço e desde quando (hora do servidor)", async () => {
    const result = await assume(porterA, "office", amiens);
    expect(result.status).toBe("assumed");
    await db.asSuperuser();
    const post = await db.one("select staff_id, function, lodge_id, started_at = now() as server_time from public.duty_posts where id = $1", [result.post_id]);
    expect(post).toMatchObject({ staff_id: porterA.staffId, function: "office", lodge_id: amiens, server_time: true });
  });

  it("B43: assumir posto ocupado mostra quem está; ao confirmar encerra o anterior", async () => {
    await assume(porterA, "office", amiens);
    const first = await assume(porterB, "office", amiens);
    expect(first.status).toBe("occupied");
    expect(first.occupant_name).toBe("Porter A");

    const second = await assume(porterB, "office", amiens, true);
    expect(second.status).toBe("assumed");
    await db.asSuperuser();
    const old = await db.one("select ended_at is not null as ended, end_reason, ended_by from public.duty_posts where staff_id = $1", [porterA.staffId]);
    expect(old).toMatchObject({ ended: true, end_reason: "taken_over", ended_by: porterB.staffId });
  });

  it("Um Office por Lodge, mas os dois Lodges podem ter Office ao mesmo tempo", async () => {
    expect((await assume(porterA, "office", amiens)).status).toBe("assumed");
    expect((await assume(porterB, "office", connolly)).status).toBe("assumed");
  });

  it("B12: segundo Float simultâneo é rejeitado (sem confirmação não entra; o banco impede dois)", async () => {
    expect((await assume(porterA, "float", null)).status).toBe("assumed");
    expect((await assume(porterB, "float", null)).status).toBe("occupied");
    await db.asSuperuser();
    expect(
      await db.error("insert into public.duty_posts (staff_id, function) values ($1, 'float')", [porterB.staffId]),
    ).toMatch(/duty_posts_one_float/);
  });

  it("Uma pessoa não fica Office e Float ao mesmo tempo", async () => {
    await assume(porterA, "office", amiens);
    await assume(porterA, "float", null);
    await db.asSuperuser();
    const open = await db.query("select function from public.duty_posts where staff_id = $1 and ended_at is null", [porterA.staffId]);
    expect(open.rows).toEqual([{ function: "float" }]);
  });

  it("B44: Manager exerce o Float e mantém permissões de Manager", async () => {
    expect((await assume(manager, "float", null)).status).toBe("assumed");
    await db.as(manager);
    expect(await db.error("insert into public.staff (full_name, role) values ('Y', 'porter')")).toBeNull();
    expect(await db.error("select public.assume_post('office', $1)", [amiens])).toMatch(/role_cannot_take_office/);
  });

  it("Owner não exerce Float; Cleaner não tem posto", async () => {
    await db.as(owner);
    expect(await db.error("select public.assume_post('float', null)")).toMatch(/role_cannot_take_float/);
  });

  it("Ninguém escreve diretamente na tabela de postos", async () => {
    await db.as(manager);
    expect(await db.error("insert into public.duty_posts (staff_id, function) values ($1, 'float')", [porterA.staffId])).toMatch(/permission denied/);
  });
});

describe("Residentes, estadias e permissões por Lodge", () => {
  it("B40: Office não cria registro no outro Lodge; consulta continua permitida", async () => {
    await assume(porterA, "office", amiens);
    const [connollyBed] = await db.freeBeds("CONNOLLY");
    await db.as(porterA);
    expect(
      await db.error("select public.admit_resident(p_lodge => $1, p_bed => $2, p_first_name => 'X')", [connolly, connollyBed]),
    ).toMatch(/not_authorised/);
    expect((await db.query("select * from public.bed_occupancy where lodge_id = $1", [connolly])).rowCount).toBe(44);
  });

  it("B41: Float cria registro em cada Lodge", async () => {
    await assume(porterA, "float", null);
    const [a] = await db.freeBeds("AMIENS");
    const [c] = await db.freeBeds("CONNOLLY");
    expect(await admit(porterA, amiens, a)).toBeTruthy();
    expect(await admit(porterA, connolly, c)).toBeTruthy();
  });

  it("Porter sem posto assumido não registra", async () => {
    const [bed] = await db.freeBeds("AMIENS");
    await db.as(porterA);
    expect(await db.error("select public.admit_resident(p_lodge => $1, p_bed => $2, p_first_name => 'X')", [amiens, bed])).toMatch(/not_authorised/);
  });

  it("Uma cama, um residente; um residente, uma estadia aberta", async () => {
    await assume(porterA, "office", amiens);
    const [bed, bed2] = await db.freeBeds("AMIENS", 2);
    const stay = await admit(porterA, amiens, bed);
    await db.as(porterA);
    expect(await db.error("select public.admit_resident(p_lodge => $1, p_bed => $2, p_first_name => 'Other')", [amiens, bed])).toMatch(/stays_one_open_per_bed/);
    const resident = (await db.one("select resident_id from public.stays where id = $1", [stay])).resident_id;
    expect(await db.error("select public.admit_resident(p_lodge => $1, p_bed => $2, p_resident_id => $3)", [amiens, bed2, resident])).toMatch(/stays_one_open_per_resident/);
  });

  it("Cama fora de uso não recebe residente", async () => {
    const [bed] = await db.freeBeds("AMIENS");
    await db.as(manager);
    await db.query("update public.beds set status = 'out_of_service' where id = $1", [bed]);
    expect(await db.error("select public.admit_resident(p_lodge => $1, p_bed => $2, p_first_name => 'X')", [amiens, bed])).toMatch(/bed_out_of_service/);
  });

  it("B11: Office decide Out → fica pendente até Manager/Owner efetivar; cama continua ocupada", async () => {
    await assume(porterA, "office", amiens);
    const [bed] = await db.freeBeds("AMIENS");
    const stay = await admit(porterA, amiens, bed);
    await db.as(porterA);
    await db.query("select public.decide_out($1, 'Saiu definitivamente')", [stay]);
    expect(await db.error("select public.effect_out($1)", [stay])).toMatch(/not_authorised/);

    await db.asSuperuser();
    expect((await db.one("select stay_status from public.bed_occupancy where bed_id = $1", [bed])).stay_status).toBe("out_pending");

    await db.as(manager);
    await db.query("select public.effect_out($1)", [stay]);
    await db.asSuperuser();
    const ended = await db.one("select status, end_reason, ended_by from public.stays where id = $1", [stay]);
    expect(ended).toMatchObject({ status: "ended", end_reason: "out", ended_by: manager.staffId });
    expect((await db.one("select stay_id from public.bed_occupancy where bed_id = $1", [bed])).stay_id).toBeNull();
    // Out não apaga a pessoa
    expect((await db.query("select 1 from public.residents r join public.stays s on s.resident_id = r.id where s.id = $1", [stay])).rowCount).toBe(1);
  });

  it("Transferência entre Lodges encerra a estadia de origem e abre outra ligada a ela", async () => {
    await assume(porterA, "float", null);
    const [a] = await db.freeBeds("AMIENS");
    const [c] = await db.freeBeds("CONNOLLY");
    const stay = await admit(porterA, amiens, a);
    await db.as(porterA);
    const next = (await db.one<{ id: string }>("select public.transfer_resident($1, $2) as id", [stay, c])).id;
    await db.asSuperuser();
    const rows = await db.query("select id, lodge_id, status, end_reason, transfer_from_stay_id from public.stays where id in ($1, $2)", [stay, next]);
    const byId = Object.fromEntries(rows.rows.map((r) => [r.id, r]));
    expect(byId[stay]).toMatchObject({ status: "ended", end_reason: "transfer", lodge_id: amiens });
    expect(byId[next]).toMatchObject({ status: "active", lodge_id: connolly, transfer_from_stay_id: stay });
  });

  it("B19: abrir o perfil de um residente fica registrado no log de leitura", async () => {
    await assume(porterA, "office", amiens);
    const [bed] = await db.freeBeds("AMIENS");
    const stay = await admit(porterA, amiens, bed);
    await db.asSuperuser();
    const resident = (await db.one("select resident_id from public.stays where id = $1", [stay])).resident_id;

    await db.as(porterB);
    const profile = await db.one("select public.open_resident_profile($1) as p", [resident]);
    expect(profile.p.stays).toHaveLength(1);

    await db.as(porterB);
    expect((await db.query("select * from public.access_log")).rowCount).toBe(0); // equipe não consulta o log
    await db.as(manager);
    const log = await db.one("select actor_staff_id, resident_id from public.access_log where resident_id = $1", [resident]);
    expect(log).toMatchObject({ actor_staff_id: porterB.staffId, resident_id: resident });
  });

  it("Edição simultânea: salvar com versão antiga é recusado", async () => {
    await assume(porterA, "office", amiens);
    const [bed] = await db.freeBeds("AMIENS");
    const stay = await admit(porterA, amiens, bed);
    await db.asSuperuser();
    const { resident_id: resident, version } = await db.one("select r.id as resident_id, r.version from public.residents r join public.stays s on s.resident_id = r.id where s.id = $1", [stay]);

    await db.as(porterA);
    await db.query("update public.residents set notes = 'first', version = $2 where id = $1", [resident, version]);
    expect(await db.error("update public.residents set notes = 'second', version = $2 where id = $1", [resident, version])).toMatch(/stale_version/);
  });
});

describe("Auditoria, tempo e parâmetros", () => {
  it("Auditoria guarda quem, o quê, valor anterior e novo; não pode ser alterada", async () => {
    await db.as(manager);
    await db.query("update public.staff set display_name = 'PA' where id = $1", [porterA.staffId]);
    const entry = await db.one(
      "select actor_staff_id, old_data->>'display_name' as old, new_data->>'display_name' as new from public.audit_log where table_name = 'staff' and record_id = $1 and action = 'UPDATE'",
      [porterA.staffId],
    );
    expect(entry).toMatchObject({ actor_staff_id: manager.staffId, old: null, new: "PA" });

    await db.as(porterA);
    expect((await db.query("select * from public.audit_log")).rowCount).toBe(0);

    await db.asSuperuser();
    expect(await db.error("delete from public.audit_log")).toMatch(/audit_log_is_immutable/);
  });

  it("B18: dia operacional tem 23h e 25h nas noites de mudança de horário", async () => {
    await db.asSuperuser();
    const r = await db.one(`
      select extract(epoch from operational_day_end('2026-03-28') - operational_day_start('2026-03-28')) / 3600 as spring,
             extract(epoch from operational_day_end('2026-10-24') - operational_day_start('2026-10-24')) / 3600 as autumn,
             operational_day('2026-07-15 05:59:00+00') as summer_before_7,  -- 06:59 IST
             operational_day('2026-07-15 06:00:00+00') as summer_at_7,      -- 07:00 IST
             operational_day('2026-12-15 06:59:00+00') as winter_before_7,  -- 06:59 GMT
             operational_day('2026-12-15 07:00:00+00') as winter_at_7`);
    expect(Number(r.spring)).toBe(23);
    expect(Number(r.autumn)).toBe(25);
    const iso = (d: Date) => d.toISOString().slice(0, 10);
    expect(iso(r.summer_before_7)).toBe("2026-07-14");
    expect(iso(r.summer_at_7)).toBe("2026-07-15");
    expect(iso(r.winter_before_7)).toBe("2026-12-14");
    expect(iso(r.winter_at_7)).toBe("2026-12-15");
  });

  it("B22: Manager troca o check das 12h para 13h → passado intacto, novo vale daí em diante", async () => {
    await db.as(manager);
    await db.query("insert into public.parameters (key, value) values ('presence.check_times', '[\"13:00\",\"18:00\",\"22:00\"]')");
    const r = await db.one(
      "select public.param_value('presence.check_times', null, '2026-06-01') as old, public.param_value('presence.check_times') as current",
    );
    expect(r.old).toEqual(["12:00", "18:00", "22:00"]);
    expect(r.current).toEqual(["13:00", "18:00", "22:00"]);

    await db.as(manager);
    expect(await db.error("insert into public.parameters (key, value, valid_from) values ('presence.check_times', '[]', '2026-01-01')")).toMatch(/row-level security/);
    await db.as(porterA);
    expect(await db.error("insert into public.parameters (key, value) values ('presence.check_times', '[]')")).toMatch(/row-level security/);
  });

  it("Parâmetro por Lodge tem prioridade sobre o geral", async () => {
    await db.as(manager);
    await db.query("insert into public.parameters (key, lodge_id, value) values ('presence.check_times', $1, '[\"11:00\"]')", [connolly]);
    const r = await db.one("select public.param_value('presence.check_times', $1) as c, public.param_value('presence.check_times', $2) as a", [connolly, amiens]);
    expect(r.c).toEqual(["11:00"]);
    expect(r.a).toEqual(["12:00", "18:00", "22:00"]);
  });
});

describe("Privilégios (defesa além da RLS)", () => {
  it("Usuário logado não apaga nem esvazia tabelas (TRUNCATE ignora RLS)", async () => {
    await db.as(manager);
    for (const table of ["audit_log", "access_log", "residents", "stays", "staff", "duty_posts", "parameters"]) {
      expect(await db.error(`truncate public.${table} cascade`), table).toMatch(/permission denied/);
      expect(await db.error(`delete from public.${table}`), table).toMatch(/permission denied/);
    }
  });

  it("anon só executa server_now", async () => {
    await db.asSuperuser();
    const r = await db.query(
      "select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and has_function_privilege('anon', p.oid, 'execute')",
    );
    expect(r.rows.map((x) => x.proname)).toEqual(["server_now"]);
  });
});
