// Revisão 3 (25/11): tags no Handover e notificações escolhidas por cada Admin (base do app PWA).
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Db, type Actor } from "./helpers";

let db: Db;
let admin: Actor;
let admin2: Actor;
let station: Actor;
let amiens: string;
beforeEach(async () => {
  db = await Db.open();
  admin = await db.createStaff("manager", "Admin Um");
  admin2 = await db.createStaff("owner", "Admin Dois");
  station = await db.createStaff("station", "Amiens Reception");
  amiens = await db.lodgeId("AMIENS");
});
afterEach(async () => {
  await db.close();
});

const tagId = async (code: string) => (await db.one<{ id: string }>("select id from public.handover_tags where code = $1", [code])).id;

describe("Tags do Handover", () => {
  it("8 tags iniciais; a anotação guarda as tags; Admin esconde uma tag e ela some do Handover", async () => {
    await db.as(station);
    const tags = (await db.query<{ code: string; visible: boolean }>("select code, visible from public.handover_tags order by sort_order")).rows;
    expect(tags.map((t) => t.code)).toEqual(["incident", "emergency", "health", "damage", "conduct", "visitor", "delivery", "general"]);
    const note = (await db.one<{ id: string }>("select public.add_handover_note($1, 'Fight in room 4', null, '[]'::jsonb, null, null, $2::uuid[]) as id", [amiens, [await tagId("incident"), await tagId("emergency")]])).id;
    expect((await db.one("select count(*)::int n from public.handover_entry_tags where entry_id = $1", [note])).n).toBe(2);
    expect(await db.error("select public.set_handover_tag($1, false)", [await tagId("delivery")])).toMatch(/not_authorised/);
    await db.as(admin);
    await db.query("select public.set_handover_tag($1, false)", [await tagId("delivery")]);
    await db.as(station);
    expect(await db.error("select public.add_handover_note($1, 'Tesco', null, '[]'::jsonb, null, null, $2::uuid[])", [amiens, [await tagId("delivery")]])).toMatch(/invalid_tag/);
  });
});

describe("Quem recebe cada notificação (preferência de cada Admin)", () => {
  it("padrão: tags de alerta, Warnings e manutenção urgente; cada Admin muda as suas", async () => {
    await db.as(station);
    await db.query("select public.add_handover_note($1, 'Ambulance called', null, '[]'::jsonb, null, null, $2::uuid[])", [amiens, [await tagId("health")]]);
    await db.query("select public.add_handover_note($1, 'Tesco', null, '[]'::jsonb, null, null, $2::uuid[])", [amiens, [await tagId("general")]]);
    await db.as(admin);
    await db.query("select public.create_maintenance($1, 'Kitchen', 'Gas smell', 'urgent', gen_random_uuid())", [amiens]);
    await db.query("select public.create_maintenance($1, 'Room 2', 'Bulb', 'low', gen_random_uuid())", [amiens]);
    await db.asSuperuser();
    const n = (await db.query<{ kind: string; recipients: string[] }>(
      "select n.kind, public.push_recipients(n.id) as recipients from public.notifications n where n.kind in ('handover_tag', 'maintenance_opened') order by n.id")).rows;
    const tagged = n.filter((x) => x.kind === "handover_tag" && x.recipients.length > 0); // "General" não vai para ninguém por padrão
    expect(n.filter((x) => x.kind === "handover_tag")).toHaveLength(2);
    expect(tagged).toHaveLength(1);
    expect(tagged[0].recipients.sort()).toEqual([admin.staffId, admin2.staffId].sort());
    const maint = n.filter((x) => x.kind === "maintenance_opened");
    expect(maint[0].recipients).toHaveLength(2); // urgent
    expect(maint[1].recipients).toHaveLength(0); // low: fora do padrão

    await db.as(admin2);
    const prefs = (await db.one("select public.my_push_prefs() as p")).p;
    expect(prefs.find((p: { key: string }) => p.key === "maintenance:low").enabled).toBe(false);
    await db.query("select public.set_push_pref('maintenance:low', true)");
    await db.query("select public.set_push_pref('tag:health', false)");
    await db.asSuperuser();
    const again = (await db.query<{ kind: string; recipients: string[] }>(
      "select n.kind, public.push_recipients(n.id) as recipients from public.notifications n where n.kind in ('handover_tag', 'maintenance_opened') order by n.id")).rows;
    expect(again.filter((x) => x.kind === "handover_tag")[0].recipients).toEqual([admin.staffId]);
    expect(again.filter((x) => x.kind === "maintenance_opened")[1].recipients).toEqual([admin2.staffId]);
    await db.as(station);
    expect(await db.error("select public.set_push_pref('warning', false)")).toMatch(/not_authorised/);
  });

  it("Warning gera notificação para os Admins", async () => {
    const [bed] = await db.freeBeds("AMIENS");
    await db.as(admin);
    const stay = (await db.one<{ id: string }>("select public.admit_resident(p_lodge => $1, p_bed => $2, p_first_name => 'Rui') as id", [amiens, bed])).id;
    await db.as(station);
    await db.query("select public.record_warning($1, 'written', 'Smoking indoors')", [stay]);
    await db.asSuperuser();
    const w = await db.one<{ recipients: string[] }>("select public.push_recipients(id) as recipients from public.notifications where kind = 'warning_recorded'");
    expect(w.recipients).toHaveLength(2);
  });

  it("assinatura de push: cada Admin registra o seu aparelho; a conta da casa não", async () => {
    await db.as(admin);
    await db.query("select public.save_push_subscription('https://web.push.apple.com/abc', 'p256', 'auth', 'iPhone')");
    await db.query("select public.save_push_subscription('https://web.push.apple.com/abc', 'p256b', 'auth2', 'iPhone')");
    await db.asSuperuser();
    expect((await db.one("select count(*)::int n, min(p256dh) k from public.push_subscriptions where staff_id = $1", [admin.staffId]))).toEqual({ n: 1, k: "p256b" });
    await db.as(station);
    expect(await db.error("select public.save_push_subscription('https://x', 'a', 'b', null)")).toMatch(/not_authorised/);
  });
});

describe("Turno de Float (revisão 4)", () => {
  it("abre com quem assume o Float e fecha passando para quem assume; convive com o turno de Office da casa", async () => {
    const pedro = await db.createStaff("porter", "Pedro", { login: false });
    const ana = await db.createStaff("porter", "Ana", { login: false });
    const rui = await db.createStaff("porter", "Rui", { login: false });
    const connolly = await db.lodgeId("CONNOLLY");
    await db.as(station);
    const office = (await db.one<{ id: string }>("select public.open_handover_shift($1, $2) as id", [amiens, pedro.staffId])).id;
    const float = (await db.one<{ id: string }>("select public.open_handover_shift($1, $2, 'float') as id", [amiens, ana.staffId])).id;
    expect(await db.error("select public.open_handover_shift($1, $2, 'float')", [connolly, rui.staffId])).toMatch(/shift_already_open/);
    const next = (await db.one<{ id: string }>("select public.close_handover_shift($1, $2, 'Float handed over') as id", [float, rui.staffId])).id;
    await db.asSuperuser();
    const rows = (await db.query("select id, function, staff_id, closed_at is not null as closed, handed_to from public.handover_shifts where id = any($1)", [[office, float, next]])).rows;
    expect(rows.find((r) => r.id === float)).toMatchObject({ function: "float", closed: true, handed_to: rui.staffId });
    expect(rows.find((r) => r.id === next)).toMatchObject({ function: "float", staff_id: rui.staffId, closed: false });
    expect(rows.find((r) => r.id === office)).toMatchObject({ function: "office", closed: false });
    const bodies = (await db.query("select body from public.handover_entries where kind = 'shift' order by created_at, body")).rows.map((r) => r.body).join(" | ");
    expect(bodies).toMatch(/Float shift opened — Ana/);
    expect(bodies).toMatch(/Float shift closed — Ana handed over to Rui/);
    // anotação da casa continua no turno de Office
    await db.as(station);
    const note = (await db.one<{ id: string }>("select public.add_handover_note($1, 'Quiet', null, '[]'::jsonb, null, null) as id", [amiens])).id;
    await db.asSuperuser();
    expect((await db.one("select shift_id from public.handover_entries where id = $1", [note])).shift_id).toBe(office);
  });

  it("o turno de Float é cruzado com o Float do Roster nas horas", async () => {
    const ana = await db.createStaff("porter", "Ana", { login: false });
    await db.as(admin);
    const rota = (await db.one<{ id: string }>("select public.save_rota_shift(null, $1, null, 'float', now() - interval '1 hour', now() + interval '8 hours') as id", [ana.staffId])).id;
    await db.query("select public.publish_rota(now() - interval '2 hours', now() + interval '9 hours')");
    await db.as(station);
    const s = (await db.one<{ id: string }>("select public.open_handover_shift($1, $2, 'float') as id", [amiens, ana.staffId])).id;
    await db.asSuperuser();
    expect((await db.one("select rota_shift_id from public.handover_shifts where id = $1", [s])).rota_shift_id).toBe(rota);
  });
});

describe("Horário informado na abertura, passagem e encerramento (revisão 5)", () => {
  it("abre às 07:05 informado, fecha/passa às 19:10 informado; o turno seguinte começa nesse horário; vale para o Float", async () => {
    const pedro = await db.createStaff("porter", "Pedro", { login: false });
    const ana = await db.createStaff("porter", "Ana", { login: false });
    await db.as(station);
    const s1 = (await db.one<{ id: string }>("select public.open_handover_shift($1, $2, 'office', now() - interval '11 hours') as id", [amiens, pedro.staffId])).id;
    const s2 = (await db.one<{ id: string }>("select public.close_handover_shift($1, $2, null, now() - interval '20 minutes') as id", [s1, ana.staffId])).id;
    const f = (await db.one<{ id: string }>("select public.open_handover_shift($1, $2, 'float', now() - interval '2 hours') as id", [amiens, pedro.staffId])).id;
    await db.query("select public.close_handover_shift($1, null, null, now() - interval '30 minutes')", [f]);
    await db.asSuperuser();
    const r = (await db.query(`select id, opened_at = now() - interval '11 hours' as o11, closed_at = now() - interval '20 minutes' as c20,
                                      opened_at = now() - interval '20 minutes' as o20, opened_at = now() - interval '2 hours' as o2,
                                      closed_at = now() - interval '30 minutes' as c30 from public.handover_shifts where id = any($1)`, [[s1, s2, f]])).rows;
    expect(r.find((x) => x.id === s1)).toMatchObject({ o11: true, c20: true });
    expect(r.find((x) => x.id === s2)!.o20).toBe(true);
    expect(r.find((x) => x.id === f)).toMatchObject({ o2: true, c30: true });
    const e = (await db.query("select body, occurred_at = now() - interval '20 minutes' as at20 from public.handover_entries where kind = 'shift' and body like 'Shift closed%'")).rows;
    expect(e[0].at20).toBe(true);
  });

  it("horário no futuro, antes da abertura ou de mais de 24 h atrás é recusado", async () => {
    const pedro = await db.createStaff("porter", "Pedro", { login: false });
    await db.as(station);
    expect(await db.error("select public.open_handover_shift($1, $2, 'office', now() + interval '1 hour')", [amiens, pedro.staffId])).toMatch(/invalid_time/);
    expect(await db.error("select public.open_handover_shift($1, $2, 'office', now() - interval '30 hours')", [amiens, pedro.staffId])).toMatch(/invalid_time/);
    const s = (await db.one<{ id: string }>("select public.open_handover_shift($1, $2, 'office', now() - interval '2 hours') as id", [amiens, pedro.staffId])).id;
    expect(await db.error("select public.close_handover_shift($1, null, null, now() - interval '3 hours')", [s])).toMatch(/invalid_time/);
  });
});
