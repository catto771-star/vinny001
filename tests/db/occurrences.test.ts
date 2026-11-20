// Fase 1 — Ocorrências e rotina: Handover (Livro Ata) e rondas, Daily Tasks, Manutenção,
// Warnings/FW e pendências (spec s.6, s.7, s.11).
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Db, type Actor } from "./helpers";

let db: Db;
let manager: Actor;
let officeA: Actor;
let officeC: Actor;
let float: Actor;
let amiens: string;
let connolly: string;

beforeEach(async () => {
  db = await Db.open();
  manager = await db.createStaff("manager", "Gestão");
  officeA = await db.createStaff("porter", "Office Amiens");
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

async function admit(lodge: "AMIENS" | "CONNOLLY", name: string) {
  const [bed] = await db.freeBeds(lodge);
  await db.as(manager);
  const stay = (
    await db.one<{ id: string }>(
      "select public.admit_resident(p_lodge => $1, p_bed => $2, p_first_name => $3, p_admitted_at => now() - interval '10 days') as id",
      [lodge === "AMIENS" ? amiens : connolly, bed, name],
    )
  ).id;
  await db.asSuperuser();
  return { stay, resident: (await db.one<{ r: string }>("select resident_id as r from public.stays where id = $1", [stay])).r };
}

const note = (actor: Actor, lodge: string, body: string, occurredAt = "now()", mentions = "[]", reason: string | null = null) =>
  db.as(actor).then(() =>
    db.one<{ id: string }>(
      `select public.add_handover_note($1, $2, ${occurredAt}, $3::jsonb, $4) as id`,
      [lodge, body, mentions, reason],
    ),
  );

describe("Handover (Livro Ata)", () => {
  it("anotação: autor e hora automáticos; hora do fato informada; horário da digitação só para a gestão", async () => {
    // Fato informado 20 min antes, mas dentro do turno atual (não depende da hora em que o teste roda).
    const { id } = await note(officeA, amiens, "Entrega de roupa de cama", "greatest(now() - interval '20 minutes', public.shift_end(now()) - interval '12 hours' + interval '1 minute')");
    await db.as(officeA);
    const row = await db.one("select author_id, kind, body, status, occurred_at <= now() as past from public.handover_entries where id = $1", [id]);
    expect(row).toEqual({ author_id: officeA.staffId, kind: "note", body: "Entrega de roupa de cama", status: "active", past: true });
    expect(await db.error("select created_at from public.handover_entries where id = $1", [id])).toMatch(/permission denied/);
    await db.as(manager);
    expect((await db.query("select * from public.handover_typing_times($1::uuid[])", [[id]])).rowCount).toBe(1);
  });

  it("os dois Lodges veem o Handover dos dois; Office só escreve no próprio (B40)", async () => {
    await note(officeA, amiens, "Nota de Amiens");
    await db.as(officeC);
    expect((await db.query("select 1 from public.handover_entries where lodge_id = $1", [amiens])).rowCount).toBe(1);
    expect(await db.error("select public.add_handover_note($1, 'x', now(), '[]'::jsonb, null)", [amiens])).toMatch(/not_authorised/);
  });

  it("@ marca residentes: a anotação aparece no perfil de todos, mas existe uma só vez", async () => {
    const a = await admit("AMIENS", "Ana");
    const b = await admit("AMIENS", "Bia");
    const { id } = await note(officeA, amiens, "@Ana e @Bia discutiram na cozinha", "now()", JSON.stringify([{ resident_id: a.resident }, { resident_id: b.resident }]));
    await db.as(manager);
    expect((await db.one("select count(*)::int as n from public.handover_entries where body like '%discutiram%'")).n).toBe(1);
    const m = await db.query("select resident_id from public.handover_mentions where entry_id = $1 order by resident_id", [id]);
    expect(m.rows.map((r) => r.resident_id).sort()).toEqual([a.resident, b.resident].sort());
  });

  it("B38: Office lança anotação depois do fim do turno → pede motivo da lista; sem motivo não salva", async () => {
    const late = "now() - interval '14 hours'"; // fato de um turno que já terminou
    await db.as(officeA);
    expect(await db.error(`select public.add_handover_note($1, 'Atrasada', ${late}, '[]'::jsonb, null)`, [amiens])).toMatch(/late_reason_required/);
    expect(await db.error(`select public.add_handover_note($1, 'Atrasada', ${late}, '[]'::jsonb, 'inventado')`, [amiens])).toMatch(/late_reason_required/);
    const { id } = await note(officeA, amiens, "Atrasada", late, "[]", "forgot");
    await db.as(manager);
    expect((await db.one("select late_reason from public.handover_entries where id = $1", [id])).late_reason).toBe("forgot");
  });

  it("B39: Manager lança depois do fim do turno sem motivo; horário da digitação fica registrado", async () => {
    const { id } = await note(manager, amiens, "Nota da gestão", "now() - interval '14 hours'");
    await db.as(manager);
    const t = await db.one("select at from public.handover_typing_times($1::uuid[])", [[id]]);
    expect(t.at).toBeTruthy();
  });

  it("corrigir/anular preserva o histórico: autor até 72h; outro Office não; Manager sempre", async () => {
    const { id } = await note(officeA, amiens, "Texto errado");
    await db.as(officeA);
    await db.query("select public.correct_handover_note($1, 'Texto certo')", [id]);
    await db.as(float);
    expect(await db.error("select public.correct_handover_note($1, 'x')", [id])).toMatch(/not_author/);
    await db.as(manager);
    await db.query("select public.void_handover_note($1, 'Duplicada')", [id]);
    await db.asSuperuser();
    expect(await db.one("select body, status, void_reason from public.handover_entries where id = $1", [id])).toEqual({ body: "Texto certo", status: "voided", void_reason: "Duplicada" });
    expect((await db.one("select count(*)::int as n from public.audit_log where table_name = 'handover_entries' and record_id = $1", [id])).n).toBe(3);
  });
});

describe("Rondas de 2 em 2 horas", () => {
  it("B14: 'Room Check Done' gera uma só linha no Handover, mesmo com clique duplo", async () => {
    await db.as(officeA);
    const day = (await db.one<{ d: string }>("select public.operational_day(now() - interval '3 hours')::text as d")).d;
    const slot = (await db.one<{ s: string }>("select to_char(date_trunc('hour', (now() - interval '3 hours') at time zone 'Europe/Dublin') - make_interval(hours => (extract(hour from (now() - interval '3 hours') at time zone 'Europe/Dublin')::int % 2)), 'HH24:MI') as s")).s;
    const r1 = (await db.one("select public.room_check_done($1, $2::date, $3) as r", [amiens, day, slot])).r;
    const r2 = (await db.one("select public.room_check_done($1, $2::date, $3) as r", [amiens, day, slot])).r;
    expect(r1.status).toBe("recorded");
    expect(r2.status).toBe("already_recorded");
    await db.asSuperuser();
    expect((await db.one("select count(*)::int as n from public.handover_entries where kind = 'round' and lodge_id = $1 and round_slot = $2", [amiens, slot])).n).toBe(1);
  });

  it("ronda só nos horários previstos (00h, 02h … 22h)", async () => {
    await db.as(officeA);
    expect(await db.error("select public.room_check_done($1, public.operational_day(now() - interval '1 day'), '13:00')", [amiens])).toMatch(/invalid_round_slot/);
  });

  it("as rondas das 12h/18h/22h são concluídas junto com o Room Check e geram a mesma linha", async () => {
    const a = await admit("AMIENS", "Ana");
    await db.as(officeA);
    const day = (await db.one<{ d: string }>("select (public.operational_day(now()) - 2)::text as d")).d;
    const run = (await db.one<{ id: string }>("select public.open_room_check($1, $2::date, '18:00') as id", [amiens, day])).id;
    await db.query("select public.mark_resident($1, $2, 'seen')", [run, a.stay]);
    await db.query("select public.launch_room_check($1)", [run]);
    expect((await db.one("select public.room_check_done($1, $2::date, '18:00') as r", [amiens, day])).r.status).toBe("already_recorded");
  });

  it("ronda não feita aparece como pendente; o sistema não a considera feita sozinho", async () => {
    await db.as(officeA);
    const pending = (await db.one<{ p: string[] }>("select public.pending_rounds($1) as p", [amiens])).p;
    const hoursSinceDayStart = (await db.one<{ h: number }>("select extract(epoch from now() - public.operational_day_start(public.operational_day(now()))) / 3600 as h")).h;
    // Rondas vencidas do dia (com folga de 30 min), todas pendentes porque nada foi lançado.
    expect(pending.length).toBe(Math.max(0, Math.floor((Number(hoursSinceDayStart) - 0.5 + 1) / 2)));
  });
});

describe("Daily Tasks", () => {
  async function template(shift: "day" | "night", title: string) {
    await db.as(manager);
    const id = (await db.one<{ id: string }>(
      "select public.create_task_template($1, $2, null, $3::jsonb, 1, '10:00') as id",
      [amiens, shift, JSON.stringify({ "pt-PT": title, "en-IE": title, "pl-PL": title })],
    )).id;
    // Modelo já existente há dias (um modelo novo não torna atrasados turnos anteriores à criação).
    await db.asSuperuser();
    await db.query("update public.task_templates set created_at = now() - interval '3 days' where id = $1", [id]);
    return id;
  }

  it("modelo criado agora não deixa turnos anteriores atrasados", async () => {
    await db.as(manager);
    const id = (await db.one<{ id: string }>("select public.create_task_template($1, 'day', null, '{\"pt-PT\":\"Nova\"}'::jsonb, 1, null) as id", [amiens])).id;
    const old = await db.query("select * from public.pending_tasks($1) where task_id = $2 and operational_day < public.operational_day(now())", [amiens, id]);
    expect(old.rowCount).toBe(0);
  });

  it("só a gestão cria modelos e tarefas extras", async () => {
    await db.as(officeA);
    expect(await db.error("select public.create_task_template($1, 'day', null, '{}'::jsonb, 1, null)", [amiens])).toMatch(/not_authorised/);
  });

  it("B50: Daily Task assinada por duas pessoas — as duas ficam registradas, com hora real", async () => {
    const id = await template("day", "Temperatura da geladeira");
    await db.as(officeA);
    const day = (await db.one<{ d: string }>("select (public.operational_day(now()) - 1)::text as d")).d;
    await db.query("select public.sign_task('template', $1, $2, $3::date, 'day')", [id, amiens, day]);
    await db.as(float);
    await db.query("select public.sign_task('template', $1, $2, $3::date, 'day')", [id, amiens, day]);
    await db.as(manager);
    const tasks = await db.query("select * from public.shift_tasks($1, $2::date, 'day') where task_id = $3", [amiens, day, id]);
    expect(tasks.rows[0].signatures.map((s: { staff_id: string; duty_function: string }) => [s.staff_id, s.duty_function]).sort()).toEqual(
      [[officeA.staffId, "office"], [float.staffId, "float"]].sort(),
    );
  });

  it("tarefa não feita não desaparece: fica pendente e atrasada", async () => {
    const id = await template("day", "Limpeza da frente da casa");
    await db.as(officeA);
    const pending = await db.query("select * from public.pending_tasks($1) where task_id = $2 and overdue", [amiens, id]);
    expect(pending.rowCount).toBeGreaterThan(0);
  });

  it("B15: tarefa extra para uma pessoa → aparece para ela; Manager reatribui ao turno", async () => {
    await db.as(manager);
    const day = (await db.one<{ d: string }>("select public.operational_day(now())::text as d")).d;
    const shift = (await db.one<{ s: string }>("select public.shift_of(now()) as s")).s;
    const extra = (await db.one<{ id: string }>(
      "select public.create_extra_task($1, $2::date, $3, $4, 'Ligar para o fornecedor', now() - interval '1 hour') as id",
      [amiens, day, shift, officeA.staffId],
    )).id;
    await db.as(officeA);
    const mine = await db.query("select * from public.my_task_alerts()");
    expect(mine.rows.map((r) => r.task_id)).toContain(extra);
    expect(mine.rows.find((r) => r.task_id === extra).overdue).toBe(true);
    await db.as(manager);
    await db.query("select public.reassign_extra_task($1)", [extra]);
    await db.asSuperuser();
    expect((await db.one("select staff_id from public.task_extras where id = $1", [extra])).staff_id).toBeNull();
  });

  it("Office não assina tarefa do outro Lodge", async () => {
    const id = await template("day", "Tarefa");
    await db.as(officeC);
    expect(await db.error("select public.sign_task('template', $1, $2, public.operational_day(now()) - 1, 'day')", [id, amiens])).toMatch(/not_authorised/);
  });
});

describe("Manutenção", () => {
  const create = (actor: Actor, lodge: string, priority = "normal", key = "11111111-1111-1111-1111-111111111111") =>
    db.as(actor).then(() =>
      db.one("select public.create_maintenance($1, 'Quarto 4', 'Janela quebrada', $2, $3::uuid) as r", [lodge, priority, key]).then((x) => x.r),
    );

  it("B32: abrir só com local, descrição e prioridade; prazo padrão sugerido; anotação + aviso ao Manager", async () => {
    const r = await create(officeA, amiens, "urgent");
    await db.asSuperuser();
    const t = await db.one(
      "select status, round(extract(epoch from deadline_at - created_at) / 3600) as hours, handover_entry_id is not null as has_entry from public.maintenance_tickets where id = $1",
      [r.ticket_id],
    );
    expect(t).toEqual({ status: "open", hours: "24", has_entry: true });
    expect((await db.one("select count(*)::int as n from public.notifications where kind = 'maintenance_opened'")).n).toBe(1);
  });

  it("repetir o clique não duplica o chamado", async () => {
    const r1 = await create(officeA, amiens);
    const r2 = await create(officeA, amiens);
    expect(r2.ticket_id).toBe(r1.ticket_id);
    expect(r2.duplicate).toBe(true);
    await db.asSuperuser();
    expect((await db.one("select count(*)::int as n from public.maintenance_tickets")).n).toBe(1);
  });

  it("resolver: Office do próprio Lodge sim; Float sozinho não; Office de outro Lodge não", async () => {
    const r = await create(officeA, amiens);
    await db.as(float);
    expect(await db.error("select public.maintenance_set_status($1, 'resolved', null, null)", [r.ticket_id])).toMatch(/not_authorised/);
    await db.as(officeC);
    expect(await db.error("select public.maintenance_set_status($1, 'resolved', null, null)", [r.ticket_id])).toMatch(/not_authorised/);
    await db.as(officeA);
    await db.query("select public.maintenance_set_status($1, 'resolved', null, 'Vidro trocado')", [r.ticket_id]);
    await db.asSuperuser();
    expect((await db.one("select status from public.maintenance_tickets where id = $1", [r.ticket_id])).status).toBe("resolved");
  });

  it("B33: Manager muda o prazo e registra o que foi feito; histórico guardado; 'atrasado' pelo novo prazo", async () => {
    const r = await create(officeA, amiens);
    await db.as(manager);
    await db.query("select public.maintenance_set_status($1, 'in_progress', now() - interval '1 hour', 'Vidraceiro chamado')", [r.ticket_id]);
    await db.asSuperuser();
    const ev = await db.query("select kind, note from public.maintenance_events where ticket_id = $1 order by id", [r.ticket_id]);
    expect(ev.rows.map((e) => e.kind)).toEqual(["created", "status", "deadline"]);
    await db.as(manager);
    expect((await db.one("select overdue from public.maintenance_list($1) where id = $2", [amiens, r.ticket_id])).overdue).toBe(true);
  });

  it("B34/B35: prazo vencido → lembrete ao Manager; adiar/ler não resolve e o lembrete volta em 24h", async () => {
    const r = await create(officeA, amiens);
    await db.asSuperuser();
    await db.query("update public.maintenance_tickets set deadline_at = now() - interval '2 hours', created_at = now() - interval '3 days' where id = $1", [r.ticket_id]);
    await db.query("update public.maintenance_events set at = now() - interval '3 days' where ticket_id = $1", [r.ticket_id]);
    await db.as(manager);
    expect((await db.query("select * from public.maintenance_reminders()")).rows.map((x) => x.id)).toEqual([r.ticket_id]);
    await db.query("select public.snooze_maintenance_reminder($1)", [r.ticket_id]);
    expect((await db.query("select * from public.maintenance_reminders()")).rowCount).toBe(0);
    await db.asSuperuser();
    expect((await db.one("select status from public.maintenance_tickets where id = $1", [r.ticket_id])).status).toBe("open");
    await db.query("update public.maintenance_reminder_snoozes set snoozed_at = now() - interval '25 hours'");
    await db.as(manager);
    expect((await db.query("select * from public.maintenance_reminders()")).rowCount).toBe(1);
  });

  it("Office não muda prazo nem coloca em espera", async () => {
    const r = await create(officeA, amiens);
    await db.as(officeA);
    expect(await db.error("select public.maintenance_set_status($1, 'on_hold', null, 'x')", [r.ticket_id])).toMatch(/not_authorised/);
  });
});

describe("Warnings e FW", () => {
  it("qualquer usuário registra; ligado ao Handover e ao perfil; não expira sozinho", async () => {
    const a = await admit("AMIENS", "Ana");
    await db.as(officeA);
    const w = (await db.one<{ id: string }>("select public.record_warning($1, 'verbal', 'Barulho após 23h') as id", [a.stay])).id;
    await db.asSuperuser();
    const row = await db.one("select type, active, handover_entry_id is not null as linked from public.warnings where id = $1", [w]);
    expect(row).toEqual({ type: "verbal", active: true, linked: true });
    expect((await db.one("select count(*)::int as n from public.handover_mentions m join public.warnings w on w.handover_entry_id = m.entry_id where w.id = $1 and m.resident_id = $2", [w, a.resident])).n).toBe(1);
  });

  it("B17: Final Warning ativo → etiqueta FW na folha, no mapa/listas; só Manager/Owner desativam", async () => {
    const a = await admit("AMIENS", "Ana");
    await db.as(officeA);
    const w = (await db.one<{ id: string }>("select public.record_warning($1, 'final_written', 'Agressão verbal') as id", [a.stay])).id;
    const day = (await db.one<{ d: string }>("select (public.operational_day(now()) - 1)::text as d")).d;
    const run = (await db.one<{ id: string }>("select public.open_room_check($1, $2::date, '12:00') as id", [amiens, day])).id;
    expect((await db.one("select final_warning from public.room_check_sheet($1) where stay_id = $2", [run, a.stay])).final_warning).toBe(true);
    expect((await db.one("select final_warning from public.bed_occupancy where stay_id = $1", [a.stay])).final_warning).toBe(true);
    expect(await db.error("select public.deactivate_final_warning($1, 'cumpriu')", [w])).toMatch(/not_authorised/);
    await db.as(manager);
    await db.query("select public.deactivate_final_warning($1, 'Cumpriu o acordo')", [w]);
    expect((await db.one("select final_warning from public.bed_occupancy where stay_id = $1", [a.stay])).final_warning).toBe(false);
  });
});

describe("Pendências (bolinhas vermelhas)", () => {
  it("conta por seção e some só quando o item é resolvido", async () => {
    const a = await admit("AMIENS", "Ana");
    await db.as(officeA);
    await db.query("select public.register_absence($1, now() - interval '3 days', now() - interval '1 hour', null)", [a.stay]);
    const r = await db.one("select public.create_maintenance($1, 'Cozinha', 'Torneira pingando', 'low', gen_random_uuid()) as r", [amiens]);
    let c = (await db.one("select public.pending_counts($1) as c", [amiens])).c;
    expect(c.absences).toBe(1);
    expect(c.maintenance).toBe(1);
    expect(typeof c.tasks).toBe("number");
    expect(typeof c.checks).toBe("number");
    expect(typeof c.no_shows).toBe("number");
    await db.query("select public.maintenance_set_status($1, 'resolved', null, null)", [r.r.ticket_id]);
    c = (await db.one("select public.pending_counts($1) as c", [amiens])).c;
    expect(c.maintenance).toBe(0);
  });
});
