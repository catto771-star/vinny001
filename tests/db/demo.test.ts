// Dados de demonstração (supabase/seed/demo.sql): o histórico fictício tem de obedecer às mesmas
// regras que as RPCs garantem, para que as telas e o relatório mostrem um cenário coerente, e
// demo.clear() tem de devolver o banco ao estado anterior.
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Db, type Actor } from "./helpers";

let db: Db;
let manager: Actor;
let amiens: string;
let connolly: string;
let first: string;
let today: string;
let before: Record<string, number>;
let seeded: Record<string, number | string>;

const COUNTED = [
  "residents", "stays", "staff", "duty_posts", "absences", "no_shows", "sightings", "room_check_runs", "room_check_marks",
  "handover_entries", "handover_mentions", "task_signatures", "task_extras", "maintenance_tickets", "maintenance_events",
  "warnings", "fridge_readings", "food_deliveries", "dinner_services", "dinner_marks", "laundry_uses", "notifications",
  "products", "purchases", "purchase_lines", "product_movements", "rota_shifts", "work_intervals", "vacations",
];

async function counts() {
  const out: Record<string, number> = {};
  for (const t of COUNTED) out[t] = Number((await db.one<{ n: string }>(`select count(*) n from public.${t}`)).n);
  return out;
}

beforeAll(async () => {
  db = await Db.open();
  manager = await db.createStaff("manager", "Gestão (teste)");
  amiens = await db.lodgeId("AMIENS");
  connolly = await db.lodgeId("CONNOLLY");
  await db.asSuperuser();
  before = await counts();
  await db.query(readFileSync("supabase/seed/demo.sql", "utf8"));
  seeded = (await db.one<{ r: Record<string, number | string> }>("select demo.seed() r")).r;
  first = String(seeded.first_day);
  today = String(seeded.last_day);
}, 60_000);

afterAll(async () => {
  await db.close();
});

describe("demo.seed", () => {
  it("cria 30 dias de operação nos dois Lodges, com residentes e equipe identificáveis", () => {
    expect(seeded.staff).toBe(12);
    expect(Number(seeded.residents)).toBeGreaterThan(70);
    expect(Number(seeded.open_stays)).toBeGreaterThan(65);
    expect(Number(seeded.checks)).toBeGreaterThan(170);
    expect(Number(seeded.task_signatures)).toBeGreaterThan(900);
    expect(Number(seeded.maintenance)).toBe(13);
    expect(Number(seeded.purchases)).toBe(8);
  });

  it("não semeia duas vezes", async () => {
    await db.query("savepoint again");
    await expect(db.query("select demo.seed()")).rejects.toThrow(/demo_already_seeded/);
    await db.query("rollback to savepoint again");
  });

  it("todos os checks dos dias passados estão lançados e ninguém fica sem evidência fora dos No Shows confirmados", async () => {
    const r = await db.one<{ pending: string; candidates: string }>(
      `select
         (select count(*) from generate_series($1::date, $2::date - 1, interval '1 day') d, unnest(array[$3::uuid, $4::uuid]) l
           where cardinality(public.pending_slots(l, d::date)) > 0) pending,
         (select count(*) from generate_series($1::date, $2::date - 1, interval '1 day') d, unnest(array[$3::uuid, $4::uuid]) l,
           public.residents_without_evidence(l, d::date, public.operational_day_end(d::date))) candidates`,
      [first, today, amiens, connolly],
    );
    expect(Number(r.pending)).toBe(0);
    expect(Number(r.candidates)).toBe(0);
  });

  it("No Shows confirmados não têm nenhuma evidência no dia; o desfeito tem", async () => {
    const r = await db.one<{ confirmed_with_evidence: string; undone_without: string; confirmed: string }>(
      `select
         count(*) filter (where n.status = 'confirmed') confirmed,
         count(*) filter (where n.status = 'confirmed' and exists (select 1 from public.resident_evidence(n.resident_id, n.operational_day))) confirmed_with_evidence,
         count(*) filter (where n.status = 'undone' and not exists (select 1 from public.resident_evidence(n.resident_id, n.operational_day))) undone_without
       from public.no_shows n join public.residents r on r.id = n.resident_id where r.is_demo`,
    );
    expect(Number(r.confirmed)).toBe(5);
    expect(Number(r.confirmed_with_evidence)).toBe(0);
    expect(Number(r.undone_without)).toBe(0);
  });

  it("3º No Show do mês gera o aviso e a cama é cancelada (Out)", async () => {
    const r = await db.one<{ n: string; outs: string; notified: string }>(
      `with x as (select resident_id, date_trunc('month', operational_day) m, count(*) c from public.no_shows
                  where status = 'confirmed' group by 1, 2 having count(*) >= 3)
       select count(*) n,
              (select count(*) from public.stays s join x on x.resident_id = s.resident_id where s.end_reason = 'out') outs,
              (select count(*) from public.notifications nt join x on x.resident_id = nt.resident_id where nt.kind = 'no_show_monthly_limit') notified
       from x`,
    );
    expect(Number(r.n)).toBe(1);
    expect(Number(r.outs)).toBe(1);
    expect(Number(r.notified)).toBe(1);
  });

  it("nenhuma cama tem duas estadias ao mesmo tempo e ninguém está em duas camas", async () => {
    const r = await db.one<{ beds: string; people: string }>(
      `select
         (select count(*) from public.stays a join public.stays b on a.bed_id = b.bed_id and a.id < b.id
           where tstzrange(a.admitted_at, coalesce(a.ended_at, 'infinity')) && tstzrange(b.admitted_at, coalesce(b.ended_at, 'infinity'))) beds,
         (select count(*) from public.stays a join public.stays b on a.resident_id = b.resident_id and a.id < b.id
           where tstzrange(a.admitted_at, coalesce(a.ended_at, 'infinity')) && tstzrange(b.admitted_at, coalesce(b.ended_at, 'infinity'))) people`,
    );
    expect(Number(r.beds)).toBe(0);
    expect(Number(r.people)).toBe(0);
  });

  it("postos e Rota sem sobreposição (mesma pessoa; um Office por Lodge; um Float)", async () => {
    const r = await db.one<{ posts_person: string; posts_office: string; posts_float: string; rota_person: string; open_posts: string }>(
      `select
         (select count(*) from public.duty_posts a join public.duty_posts b on a.staff_id = b.staff_id and a.id < b.id
           where tstzrange(a.started_at, coalesce(a.ended_at, 'infinity')) && tstzrange(b.started_at, coalesce(b.ended_at, 'infinity'))) posts_person,
         (select count(*) from public.duty_posts a join public.duty_posts b on a.lodge_id = b.lodge_id and a.id < b.id
           where a.function = 'office' and b.function = 'office'
             and tstzrange(a.started_at, coalesce(a.ended_at, 'infinity')) && tstzrange(b.started_at, coalesce(b.ended_at, 'infinity'))) posts_office,
         (select count(*) from public.duty_posts a join public.duty_posts b on a.function = 'float' and b.function = 'float' and a.id < b.id
           where tstzrange(a.started_at, coalesce(a.ended_at, 'infinity')) && tstzrange(b.started_at, coalesce(b.ended_at, 'infinity'))) posts_float,
         (select count(*) from public.rota_shifts a join public.rota_shifts b on a.staff_id = b.staff_id and a.id < b.id
           where a.status <> 'cancelled' and b.status <> 'cancelled' and tstzrange(a.starts_at, a.ends_at) && tstzrange(b.starts_at, b.ends_at)) rota_person,
         (select count(*) from public.duty_posts where ended_at is null) open_posts`,
    );
    // Os bancos de dados de dias seguidos podem encostar (fim às 07:00, início às 07:00), mas não sobrepor.
    expect(Number(r.posts_person)).toBe(0);
    expect(Number(r.posts_office)).toBe(0);
    expect(Number(r.posts_float)).toBe(0);
    expect(Number(r.rota_person)).toBe(0);
    expect(Number(r.open_posts)).toBeGreaterThanOrEqual(2);
  });

  it("relatório mensal da gestão tem números em todos os blocos certos, e cada número bate com a lista de origem", async () => {
    await db.as(manager);
    const month = `${today.slice(0, 7)}-01`;
    const a = (await db.one<{ r: Record<string, Record<string, number> | null> }>("select public.report_monthly($1, $2) r", [amiens, month])).r;
    const c = (await db.one<{ r: Record<string, Record<string, number> | null> }>("select public.report_monthly($1, $2) r", [connolly, month])).r;
    expect(a.dinner!.served).toBeGreaterThan(0);
    expect(c.dinner).toBeNull();
    expect(c.laundry!.uses).toBeGreaterThan(0);
    expect(a.laundry).toBeNull();
    expect(a.hours!.planned_minutes).toBeGreaterThan(0);
    expect(a.hours!.effective_minutes).toBeGreaterThan(0);
    expect(a.tasks!.done).toBeGreaterThan(a.tasks!.not_done * 5);
    expect(a.rounds_checks!.checks_pending).toBeLessThanOrEqual(2);
    for (const [lodge, r] of [[amiens, a], [connolly, c]] as const) {
      for (const [block, metric] of [["occupancy", "admissions"], ["occupancy", "outs"], ["maintenance", "opened"], ["warnings", "verbal"], ["no_shows", "total"]]) {
        const n = Number((await db.one<{ n: string }>("select count(*) n from public.report_details($1, $2, $3)", [lodge, month, `${block}.${metric}`])).n);
        expect(n, `${block}.${metric}`).toBe(r[block]![metric]);
      }
    }
    await db.asSuperuser();
  });

  it("Rota futura tem buracos de cobertura de propósito (Float aos domingos) e férias em conflito", async () => {
    await db.as(manager);
    const gaps = await db.query<{ kind: string }>(
      "select kind from public.coverage_gaps(public.operational_day_start($1::date + 1), public.operational_day_start($1::date + 14))",
      [today],
    );
    expect(gaps.rows.some((g) => g.kind === "float")).toBe(true);
    expect(gaps.rows.some((g) => g.kind === "night")).toBe(true);
    await db.asSuperuser(); // vacation_conflicts é interna (usada por register_vacation)
    const v = await db.one<{ n: string }>(
      "select public.vacation_conflicts(v.staff_id, v.starts_on, v.ends_on) n from public.vacations v where v.note = 'Trip to Brazil'",
    );
    expect(Number(v.n)).toBeGreaterThan(0);
    await db.asSuperuser();
  });

  it("a equipe demo enxerga a operação pelas mesmas funções das telas (Seen do dia anterior)", async () => {
    await db.as(manager);
    const seen = await db.query<{ seen_day: boolean; seen_night: boolean }>("select * from public.seen_for_day($1, $2::date - 1)", [amiens, today]);
    expect(seen.rows.length).toBeGreaterThan(25);
    expect(seen.rows.filter((r) => r.seen_day || r.seen_night).length).toBeGreaterThan(seen.rows.length * 0.8);
    await db.asSuperuser();
  });
});

describe("demo.clear", () => {
  it("remove tudo o que o seed criou e devolve as contagens ao estado anterior", async () => {
    await db.asSuperuser();
    const r = (await db.one<{ r: { residents: number; staff: number } }>("select demo.clear() r")).r;
    expect(r.residents).toBe(Number(seeded.residents));
    expect(r.staff).toBe(12);
    expect(await counts()).toEqual(before);
    const left = await db.one<{ audit: string; beds: string; templates: string }>(
      `select (select count(*) from public.audit_log where table_name = 'residents' and new_data ->> 'is_demo' = 'true') audit,
              (select count(*) from public.beds where status_note like '%(demo)') beds,
              (select count(*) from public.task_templates where created_at < now() - interval '1 day') templates`,
    );
    expect(Number(left.audit)).toBe(0);
    expect(Number(left.beds)).toBe(0);
    expect(Number(left.templates)).toBe(0);
    // Depois de limpar, dá para semear de novo.
    await db.query("savepoint again");
    await db.query("select demo.seed()");
    await db.query("rollback to savepoint again");
  }, 60_000);
});
