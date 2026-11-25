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
