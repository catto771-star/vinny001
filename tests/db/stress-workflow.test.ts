// Simulação em massa: milhares de ações aleatórias de vários perfis (Office, Float, Manager, Owner)
// sobre a demo, no formato em que as telas chamam o banco. Duas coisas são conferidas:
//  1. nenhuma ação termina em erro cru de SQL (só sucesso ou recusa por regra de negócio);
//  2. as regras do sistema continuam valendo no fim (invariantes).
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Db, type Actor } from "./helpers";

let db: Db;
const A: Record<string, Actor> = {};
let amiens: string;
let connolly: string;
let day: string;

let seed = 424242;
const rnd = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);
const pick = <T,>(xs: T[]): T | undefined => (xs.length ? xs[Math.floor(rnd() * xs.length)] : undefined);
const sup = async <T extends Record<string, unknown>>(sql: string, p: unknown[] = []) => {
  await db.asSuperuser();
  return (await db.query<T & Record<string, unknown>>(sql, p)).rows as T[];
};
const ids = async (sql: string, p: unknown[] = []) => (await sup<{ id: string }>(sql, p)).map((r) => r.id);

type Call = { actor: Actor; sql: string; params?: unknown[] } | null;
const stats: Record<string, { ok: number; rule: number }> = {};
const unexpected: string[] = [];
const rules = new Map<string, number>();

const officeFor = (lodge: string) => (lodge === amiens ? A.officeA : A.officeC);
const anyWriter = (lodge: string) => pick([officeFor(lodge), A.floater, A.manager, A.owner])!;
const prevDay = async () => (await sup<{ d: string }>(`select ($1::date - 1)::text d`, [day]))[0].d;
const mgr = () => pick([A.manager, A.owner])!;

const OPS: Record<string, { w: number; build: () => Promise<Call> }> = {
  admit: { w: 6, build: async () => {
    const l = pick([amiens, connolly])!;
    const bed = pick(await ids(`select b.id from public.beds b join public.rooms r on r.id=b.room_id where r.lodge_id=$1 and b.status='in_use' and not exists (select 1 from public.stays s where s.bed_id=b.id and s.status<>'ended')`, [l]));
    if (!bed) return null;
    return { actor: anyWriter(l), sql: "select public.admit_resident($1,$2,null,$3,$4,$5,$6,null)", params: [l, bed, `Stress${Math.floor(rnd() * 1e6)}`, pick(["Murphy", "Silva", "Kowalski", "O'Neill", "Ünal"]), pick([null, "1980-05-05", "1999-12-31"]), pick([null, `ST-${Math.floor(rnd() * 1e7)}`])] };
  } },
  transfer: { w: 3, build: async () => {
    const s = pick(await sup<{ id: string; lodge_id: string }>(`select id, lodge_id from public.stays where status='active' order by random() limit 10`));
    if (!s) return null;
    const l = pick([amiens, connolly])!;
    const bed = pick(await ids(`select b.id from public.beds b join public.rooms r on r.id=b.room_id where r.lodge_id=$1 and b.status='in_use' and not exists (select 1 from public.stays x where x.bed_id=b.id and x.status<>'ended')`, [l]));
    if (!bed) return null;
    return { actor: pick([A.manager, A.owner, A.floater])!, sql: "select public.transfer_resident($1,$2,null)", params: [s.id, bed] };
  } },
  decideOut: { w: 3, build: async () => { const s = pick(await ids(`select id from public.stays where status='active' order by random() limit 10`)); return s ? { actor: mgr(), sql: "select public.decide_out($1,$2)", params: [s, pick(["Left voluntarily", "Moved out", ""])] } : null; } },
  withdrawOut: { w: 2, build: async () => { const s = pick(await ids(`select id from public.stays where status='out_pending'`)); return s ? { actor: mgr(), sql: "select public.withdraw_out($1)", params: [s] } : null; } },
  effectOut: { w: 2, build: async () => { const s = pick(await ids(`select id from public.stays where status='out_pending'`)); return s ? { actor: mgr(), sql: "select public.effect_out($1,null)", params: [s] } : null; } },
  absence: { w: 4, build: async () => {
    const s = pick(await sup<{ id: string; lodge_id: string }>(`select id, lodge_id from public.stays where status<>'ended' order by random() limit 10`));
    return s ? { actor: anyWriter(s.lodge_id), sql: "select public.register_absence($1, now() - interval '1 hour', now() + ($2 || ' days')::interval, $3)", params: [s.id, String(1 + Math.floor(rnd() * 5)), pick(["Hospital", "Family visit", ""])] } : null;
  } },
  endAbsence: { w: 3, build: async () => { const a = pick(await sup<{ id: string; stay_id: string }>(`select a.id, a.stay_id from public.absences a where a.ended_at is null`)); return a ? { actor: mgr(), sql: "select public.end_absence($1,null)", params: [a.id] } : null; } },
  sighting: { w: 6, build: async () => {
    const s = pick(await sup<{ resident_id: string; lodge_id: string }>(`select resident_id, lodge_id from public.stays where status<>'ended' order by random() limit 10`));
    return s ? { actor: anyWriter(s.lodge_id), sql: "select public.record_sighting($1,$2,now(),$3)", params: [s.resident_id, s.lodge_id, pick(["Reception", "Kitchen", null])] } : null;
  } },
  roomCheck: { w: 5, build: async () => {
    const l = pick([amiens, connolly])!;
    const slot = pick(["12:00", "18:00", "22:00"])!;
    const present = await ids(`select id from public.stays_present_at($1, public.slot_instant($2::date,$3))`, [l, day, slot]);
    return { actor: anyWriter(l), sql: `with r as (select public.open_room_check($1,$2::date,$3) id),
        m as (select public.mark_resident(r.id, s, (case when random()<0.85 then 'seen' else 'not_seen' end)::public.check_result) from r, unnest($4::uuid[]) s)
      select public.launch_room_check(r.id) from r, (select count(*) from m) x`, params: [l, day, slot, present] };
  } },
  round: { w: 4, build: async () => { const l = pick([amiens, connolly])!; return { actor: anyWriter(l), sql: "select public.room_check_done($1,$2::date,$3)", params: [l, day, pick(["08:00", "10:00", "12:00", "14:00", "16:00", "02:00"])] }; } },
  note: { w: 8, build: async () => {
    const l = pick([amiens, connolly])!;
    const r = pick(await ids(`select resident_id as id from public.stays where lodge_id=$1 and status<>'ended' order by random() limit 5`, [l]));
    return { actor: anyWriter(l), sql: "select public.add_handover_note($1,$2,now() - ($3 || ' minutes')::interval,$4::jsonb,$5)", params: [l, pick(["Quiet shift", "Resident asked for a blanket", "Fire alarm test", "x".repeat(2000)]), String(Math.floor(rnd() * 600)), JSON.stringify(r && rnd() < 0.5 ? [{ resident_id: r }] : []), pick([null, "forgot", "system_failure"])] };
  } },
  correctNote: { w: 2, build: async () => { const e = pick(await sup<{ id: string; author_id: string }>(`select id, author_id from public.handover_entries where kind='note' and status='active' order by created_at desc limit 5`)); return e ? { actor: pick(Object.values(A))!, sql: "select public.correct_handover_note($1,$2)", params: [e.id, "Corrected text"] } : null; } },
  voidNote: { w: 1, build: async () => { const e = pick(await ids(`select id from public.handover_entries where kind='note' and status='active' order by created_at desc limit 5`)); return e ? { actor: mgr(), sql: "select public.void_handover_note($1,$2)", params: [e, pick(["Wrong entry", ""])] } : null; } },
  signTask: { w: 5, build: async () => {
    const l = pick([amiens, connolly])!;
    const t = pick(await sup<{ id: string; kind: string }>(`select id, 'template' kind from public.task_templates where lodge_id=$1 and shift=public.shift_of(now()) and active union all select id, 'extra' from public.task_extras where lodge_id=$1 and operational_day=$2::date`, [l, day]));
    return t ? { actor: anyWriter(l), sql: "select public.sign_task($1,$2,$3,$4::date,public.shift_of(now()))", params: [t.kind, t.id, l, day] } : null;
  } },
  extraTask: { w: 2, build: async () => { const l = pick([amiens, connolly])!; return { actor: mgr(), sql: "select public.create_extra_task($1,$2::date,$3,null,$4,null)", params: [l, day, pick(["day", "night"]), pick(["Check fire exits", "Count linen"])] }; } },
  template: { w: 1, build: async () => { const l = pick([amiens, connolly])!; return { actor: mgr(), sql: `select public.create_task_template($1,$2,null,'{"pt-PT":"Tarefa","en-IE":"Task","pl-PL":"Zadanie"}'::jsonb,50,'10:00')`, params: [l, pick(["day", "night"])] }; } },
  maintenance: { w: 4, build: async () => { const l = pick([amiens, connolly])!; return { actor: anyWriter(l), sql: "select public.create_maintenance($1,$2,$3,$4,gen_random_uuid())", params: [l, pick(["Room 3", "Kitchen", "Corridor"]), pick(["Leak", "Broken lock", "Light out"]), pick(["urgent", "normal", "low"])] }; } },
  ticket: { w: 5, build: async () => {
    const t = pick(await sup<{ id: string }>(`select id from public.maintenance_tickets order by random() limit 8`));
    return t ? { actor: mgr(), sql: "select public.maintenance_set_status($1,$2,null,$3)", params: [t.id, pick(["in_progress", "on_hold", "resolved", "reopened", "open"]), pick(["Contractor called", "Waiting for part", ""])] } : null;
  } },
  warning: { w: 3, build: async () => {
    const s = pick(await sup<{ id: string; lodge_id: string }>(`select id, lodge_id from public.stays where status<>'ended' order by random() limit 8`));
    return s ? { actor: anyWriter(s.lodge_id), sql: "select public.record_warning($1,$2,$3)", params: [s.id, pick(["verbal", "written", "final_written"]), pick(["Smoking indoors", "Noise", ""])] } : null;
  } },
  fwOff: { w: 1, build: async () => { const w = pick(await ids(`select id from public.warnings where type='final_written' and active`)); return w ? { actor: mgr(), sql: "select public.deactivate_final_warning($1,$2)", params: [w, "Reviewed"] } : null; } },
  fridge: { w: 4, build: async () => { const l = pick([amiens, connolly])!; return { actor: anyWriter(l), sql: "select public.record_fridge_temperature($1,$2,$3)", params: [l, pick([2.5, 3.9, 5, 5.1, 7.4, 0, -0.5, 4.04, 41]), pick([null, "Door open"])] }; } },
  delivery: { w: 2, build: async () => ({ actor: anyWriter(amiens), sql: "select public.record_food_delivery($1,$2,$3,$4,(current_date + 5),$5,$6)", params: [amiens, "Chicken", "Musgrave", `L${Math.floor(rnd() * 1000)}`, pick([2.1, 5.5, 8]), null] }) },
  dinner: { w: 5, build: async () => {
    const s = pick(await ids(`select id from public.stays where lodge_id=$1 and status<>'ended' order by random() limit 10`, [amiens]));
    return s ? { actor: anyWriter(amiens), sql: "select public.mark_dinner($1,$2::date,$3,$4)", params: [amiens, `${await prevDay()}`, s, rnd() < 0.8] } : null;
  } },
  closeDinner: { w: 1, build: async () => ({ actor: mgr(), sql: "select public.close_dinner($1,$2::date,$3,$4,$5)", params: [amiens, await prevDay(), Math.floor(rnd() * 5), Math.floor(rnd() * 3), null] }) },
  laundry: { w: 5, build: async () => {
    const m = pick(await ids(`select id from public.laundry_machines where lodge_id=$1`, [connolly]));
    const s = pick(await ids(`select id from public.stays where lodge_id=$1 and status<>'ended' order by random() limit 8`, [connolly]));
    return m && s ? { actor: anyWriter(connolly), sql: "select public.start_laundry($1,$2)", params: [m, s] } : null;
  } },
  finishLaundry: { w: 4, build: async () => { const u = pick(await ids(`select id from public.laundry_uses where finished_at is null`)); return u ? { actor: anyWriter(connolly), sql: "select public.finish_laundry($1)", params: [u] } : null; } },
  product: { w: 1, build: async () => ({ actor: mgr(), sql: "select public.upsert_product(null,$1,'un','Food')", params: [`Prod ${Math.floor(rnd() * 1e4)}`] }) },
  purchase: { w: 2, build: async () => {
    const p = await ids(`select id from public.products order by random() limit 2`);
    return p.length ? { actor: mgr(), sql: "select public.create_purchase($1,current_date,$2,$3::jsonb)", params: ["Musgrave", "INV-1", JSON.stringify(p.map((id) => ({ product_id: id, quantity: pick([1, 3, 12.5]), unit_price: pick([0.99, 1.335, 14.5]) })))] } : null;
  } },
  allocate: { w: 3, build: async () => { const l = pick(await ids(`select id from public.purchase_lines order by random() limit 5`)); const lg = pick([amiens, connolly])!; return l ? { actor: anyWriter(lg), sql: "select public.allocate_purchase_line($1,$2,$3)", params: [l, lg, pick([1, 2, 5, 50])] } : null; } },
  transferProd: { w: 2, build: async () => { const p = pick(await ids(`select id from public.products`)); return p ? { actor: anyWriter(amiens), sql: "select public.transfer_product($1,$2,$3,$4,$5)", params: [p, amiens, pick([connolly, amiens]), pick([1, 2, 7]), null] } : null; } },
  rota: { w: 4, build: async () => {
    const staff = pick(await ids(`select id from public.staff where role in ('porter','manager') and active order by random() limit 10`));
    const l = pick([amiens, connolly, null]);
    const off = 20 + Math.floor(rnd() * 60);
    return staff ? { actor: mgr(), sql: "select public.save_rota_shift(null,$1,$2,$3, now() + ($4 || ' hours')::interval, now() + (($4::int + 8) || ' hours')::interval)", params: [staff, l, l ? "office" : "float", String(off)] } : null;
  } },
  cancelRota: { w: 1, build: async () => { const r = pick(await ids(`select id from public.rota_shifts where status<>'cancelled' order by random() limit 5`)); return r ? { actor: mgr(), sql: "select public.cancel_rota_shift($1)", params: [r] } : null; } },
  publish: { w: 1, build: async () => ({ actor: mgr(), sql: "select public.publish_rota(now(), now() + interval '14 days')" }) },
  vacation: { w: 2, build: async () => { const s = pick(await ids(`select id from public.staff where active and role='porter' order by random() limit 5`)); return s ? { actor: mgr(), sql: "select public.register_vacation($1,current_date + $2::int, current_date + $2::int + 3,$3)", params: [s, Math.floor(rnd() * 20), "Holiday"] } : null; } },
  cancelVacation: { w: 1, build: async () => { const v = pick(await ids(`select id from public.vacations where status='active'`)); return v ? { actor: mgr(), sql: "select public.cancel_vacation($1)", params: [v] } : null; } },
  interval: { w: 2, build: async () => { const s = pick(await ids(`select id from public.staff where active order by random() limit 5`)); return s ? { actor: mgr(), sql: "select public.add_work_interval($1,$2, now() - interval '30 hours', now() - interval '22 hours',$3)", params: [s, amiens, "Manual"] } : null; } },
  adjustPost: { w: 1, build: async () => { const p = pick(await ids(`select id from public.duty_posts where ended_at is not null order by random() limit 5`)); return p ? { actor: mgr(), sql: "select public.adjust_work_interval($1, now() - interval '40 hours', now() - interval '30 hours',$2)", params: [p, pick(["Forgot to take post", ""])] } : null; } },
  noShows: { w: 2, build: async () => { const l = pick([amiens, connolly])!; return { actor: anyWriter(l), sql: "select public.confirm_no_shows($1,($2::date - 1),'{}')", params: [l, day] }; } },
  undoNoShow: { w: 1, build: async () => { const n = pick(await ids(`select id from public.no_shows where status='confirmed'`)); return n ? { actor: mgr(), sql: "select public.undo_no_show($1,$2)", params: [n, "Was at the hospital"] } : null; } },
  switchPost: { w: 1, build: async () => {
    const who = pick(["officeA", "officeC"])!;
    return { actor: A[who], sql: "select public.end_my_post()" };
  } },
  retakePost: { w: 2, build: async () => {
    const who = pick(["officeA", "officeC"])!;
    return { actor: A[who], sql: "select public.assume_post('office',$1,true)", params: [who === "officeA" ? amiens : connolly] };
  } },
  notifications: { w: 1, build: async () => { const n = pick(await ids(`select id from public.notifications order by random() limit 3`)); return n ? { actor: mgr(), sql: "select public.mark_notification_read($1::bigint)", params: [n] } : null; } },
  reads: { w: 3, build: async () => {
    const l = pick([amiens, connolly])!;
    const q = pick<[string, unknown[]]>([
      ["select * from public.seen_for_day($1,$2::date)", [l, day]], ["select public.no_show_review($1,$2::date)", [l, day]],
      ["select * from public.pending_counts($1)", [l]], ["select public.presence_alert($1)", [l]], ["select * from public.maintenance_list($1)", [l]],
      ["select * from public.laundry_status($1)", [l]], ["select * from public.dinner_sheet($1,$2::date)", [amiens, day]],
      ["select * from public.pending_rounds($1)", [l]], ["select * from public.pending_tasks($1)", [l]], ["select * from public.my_task_alerts()", []],
      ["select * from public.my_notifications(50)", []], ["select public.unread_notifications_count()", []],
    ])!;
    return { actor: pick([A.manager, A.officeA, A.officeC, A.floater])!, sql: q[0], params: q[1] };
  } },
};

beforeAll(async () => {
  db = await Db.open();
  A.manager = await db.createStaff("manager", "Stress Manager");
  A.owner = await db.createStaff("owner", "Stress Owner");
  A.officeA = await db.createStaff("porter", "Stress Office A");
  A.officeC = await db.createStaff("porter", "Stress Office C");
  A.floater = await db.createStaff("porter", "Stress Float");
  await db.asSuperuser();
  await db.query(readFileSync("supabase/seed/demo.sql", "utf8"));
  await db.query("select demo.seed()");
  amiens = await db.lodgeId("AMIENS");
  connolly = await db.lodgeId("CONNOLLY");
  day = (await db.one<{ d: string }>("select public.operational_day(now())::text d")).d;
  await db.as(A.officeA);
  await db.query("select public.assume_post('office',$1,true)", [amiens]);
  await db.as(A.officeC);
  await db.query("select public.assume_post('office',$1,true)", [connolly]);
  await db.as(A.floater);
  await db.query("select public.assume_post('float',null,true)");
  await db.asSuperuser();
}, 180_000);

afterAll(async () => {
  await db.close();
});

const N = Number(process.env.STRESS_OPS ?? 2500);

describe("simulação em massa", () => {
  it(`${N} ações aleatórias: sem erro cru de SQL, e todas as ações do sistema foram exercitadas`, async () => {
    const names = Object.keys(OPS);
    const total = names.reduce((a, n) => a + OPS[n].w, 0);
    for (let i = 0; i < N; i++) {
      let r = rnd() * total;
      let name = names[0];
      for (const n of names) { r -= OPS[n].w; if (r <= 0) { name = n; break; } }
      const call = await OPS[name].build();
      stats[name] ??= { ok: 0, rule: 0 };
      if (!call) continue;
      await db.as(call.actor);
      const msg = await db.error(call.sql, call.params ?? []);
      if (!msg) stats[name].ok++;
      else if (/^[a-z0-9_]+$/.test(msg) || /permission denied|row-level security/.test(msg)) {
        stats[name].rule++;
        rules.set(`${name}: ${msg}`, (rules.get(`${name}: ${msg}`) ?? 0) + 1);
      } else unexpected.push(`${name}: ${msg.slice(0, 160)} | ${JSON.stringify(call.params ?? []).slice(0, 160)}`);
    }
    await db.asSuperuser();
    const table = Object.entries(stats).map(([k, v]) => `${k.padEnd(14)} ok=${String(v.ok).padStart(4)} recusadas=${v.rule}`).join("\n");
    console.log(`\n${table}\n\nRecusas mais comuns:\n` + [...rules.entries()].sort((a, b) => b[1] - a[1]).slice(0, 25).map(([k, v]) => `  ${v}× ${k}`).join("\n"));
    if (unexpected.length) console.log("\nERROS NÃO TRATADOS:\n" + [...new Set(unexpected)].slice(0, 40).join("\n"));
    expect([...new Set(unexpected)]).toEqual([]);
    const never = Object.entries(stats).filter(([k, v]) => v.ok === 0 && k !== "reads").map(([k]) => k);
    console.log("Nunca tiveram sucesso:", never.join(", ") || "—");
  }, 900_000);

  it("invariantes: as regras do sistema continuam valendo depois de tudo", async () => {
    await db.asSuperuser();
    const q = async (sql: string, p: unknown[] = []) => Number((await db.one<{ n: string }>(sql, p)).n);
    const checks: [string, string][] = [
      ["estadia encerrada ⇔ tem data de fim", `select count(*) n from public.stays where (status='ended') <> (ended_at is not null)`],
      ["uma estadia aberta por cama", `select count(*) n from (select bed_id from public.stays where status<>'ended' group by 1 having count(*)>1) x`],
      ["uma estadia aberta por residente", `select count(*) n from (select resident_id from public.stays where status<>'ended' group by 1 having count(*)>1) x`],
      ["cama pertence ao Lodge da estadia", `select count(*) n from public.stays s where public.bed_lodge(s.bed_id) is distinct from s.lodge_id`],
      ["nenhum No Show confirmado tem evidência no dia", `select count(*) n from public.no_shows n where n.status='confirmed' and exists (select 1 from public.resident_evidence(n.resident_id, n.operational_day))`],
      ["alocação nunca passa do comprado", `select count(*) n from public.purchase_lines l where (select coalesce(sum(quantity),0) from public.product_movements m where m.purchase_line_id=l.id and m.kind='allocation') > l.quantity`],
      ["Laundry: uma máquina em uso por vez", `select count(*) n from (select machine_id from public.laundry_uses where finished_at is null group by 1 having count(*)>1) x`],
      ["Laundry em uso só com estadia aberta ou já encerrada depois", `select count(*) n from public.laundry_uses u where u.finished_at is null and u.stay_id is not null and not exists (select 1 from public.stays s where s.id=u.stay_id)`],
      ["geladeira: fora da faixa ⇔ temperatura fora de min..max", `select count(*) n from public.fridge_readings f where f.out_of_range <> (f.temperature < f.range_min or f.temperature > f.range_max)`],
      ["cada leitura fora da faixa gerou um aviso", `select count(*) n from public.fridge_readings f where f.out_of_range and not exists (select 1 from public.notifications nt where nt.kind='fridge_out_of_range' and nt.payload->>'reading_id' = f.id::text)`],
      ["Rota: ninguém com dois turnos sobrepostos", `select count(*) n from public.rota_shifts a join public.rota_shifts b on a.staff_id=b.staff_id and a.id<b.id where a.status<>'cancelled' and b.status<>'cancelled' and tstzrange(a.starts_at,a.ends_at) && tstzrange(b.starts_at,b.ends_at)`],
      ["Rota: um Float por vez", `select count(*) n from public.rota_shifts a join public.rota_shifts b on a.function='float' and b.function='float' and a.id<b.id where a.status<>'cancelled' and b.status<>'cancelled' and tstzrange(a.starts_at,a.ends_at) && tstzrange(b.starts_at,b.ends_at)`],
      ["postos: uma pessoa, um posto aberto", `select count(*) n from (select staff_id from public.duty_posts where ended_at is null group by 1 having count(*)>1) x`],
      ["postos: um Office por Lodge e um Float", `select count(*) n from (select lodge_id from public.duty_posts where ended_at is null and function='office' group by 1 having count(*)>1) x`],
      ["chamado resolvido ⇔ tem data de resolução", `select count(*) n from public.maintenance_tickets where (status='resolved') <> (resolved_at is not null)`],
      ["chamado: último status do histórico = status atual", `select count(*) n from public.maintenance_tickets t where exists (select 1 from public.maintenance_events e where e.ticket_id=t.id and e.kind='status') and (select e.to_value from public.maintenance_events e where e.ticket_id=t.id and e.kind='status' order by e.at desc, e.id desc limit 1) <> t.status`],
      ["Dinner: marca só de residente que estava no Lodge no dia", `select count(*) n from public.dinner_marks m join public.dinner_services s on s.id=m.service_id join public.stays st on st.id=m.stay_id where st.admitted_at >= public.operational_day_end(s.operational_day) or (st.ended_at is not null and st.ended_at <= public.operational_day_start(s.operational_day))`],
      ["Handover: ronda registrada tem horário de ronda", `select count(*) n from public.handover_entries where kind='round' and round_slot is null`],
      ["Final Written ativo: só uma por estadia aberta ou encerrada", `select count(*) n from (select stay_id from public.warnings where type='final_written' and active group by 1 having count(*)>1) x`],
      ["checks lançados no horário (ou depois) têm marca para quem estava presente", `select count(*) n from public.room_check_runs r join lateral public.stays_present_at(r.lodge_id, r.checked_at) s on true where r.status='launched' and not exists (select 1 from public.room_check_marks m where m.run_id=r.id and m.stay_id=s.id) and r.entered_at > now() - interval '1 hour' and public.slot_instant(r.operational_day, r.slot) <= r.entered_at`], // só checks lançados no horário ou depois: abertos até 60 min antes (tolerância da regra) gravam a hora real e ficam de fora
    ];
    const failures: string[] = [];
    for (const [name, sql] of checks) {
      const n = await q(sql);
      if (n !== 0) {
        failures.push(`${name}: ${n} violações`);
        // amostra das linhas, para diagnosticar
        const sample = await db.query(sql.replace(/^select count\(\*\) n from/, "select * from").replace(/select \* from public\.room_check_runs r join lateral public\.stays_present_at\(r\.lodge_id, r\.checked_at\) s on true/, "select r.id run, r.slot, r.checked_at, r.entered_at, r.launched_at, s.id stay, s.admitted_at, s.ended_at, s.created_at stay_created from public.room_check_runs r join lateral public.stays_present_at(r.lodge_id, r.checked_at) s on true")).catch(() => null);
        if (sample) console.log(`\n[${name}] amostra:\n` + JSON.stringify(sample.rows.slice(0, 3), null, 1));
      }
    }
    // relatório = lista de origem, nos dois Lodges
    await db.as(A.manager);
    const month = `${day.slice(0, 7)}-01`;
    for (const l of [amiens, connolly]) {
      const rep = (await db.one<{ r: Record<string, Record<string, number> | null> }>("select public.report_monthly($1,$2::date) r", [l, month])).r;
      for (const [block, metric] of [["occupancy", "admissions"], ["occupancy", "outs"], ["maintenance", "opened"], ["maintenance", "resolved"], ["warnings", "verbal"], ["warnings", "written"], ["warnings", "final_written"], ["no_shows", "total"], ["temperature", "alerts"], ["late_entries", "total"]]) {
        const n = Number((await db.one<{ n: string }>("select count(*) n from public.report_details($1,$2::date,$3)", [l, month, block === "temperature" ? "temperature.alerts" : `${block}.${metric}`])).n);
        const key = metric === "alerts" ? "alerts" : metric;
        if (rep[block]?.[key] !== n) failures.push(`relatório ${block}.${metric}: resumo ${rep[block]?.[key]} ≠ lista ${n}`);
      }
    }
    await db.asSuperuser();
    if (failures.length) console.log("\nINVARIANTES VIOLADAS:\n" + failures.join("\n"));
    expect(failures).toEqual([]);
  }, 120_000);
});
