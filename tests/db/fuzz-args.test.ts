// Varredura em massa: chama TODAS as funções públicas do banco com entradas inválidas
// (nulos, texto gigante, datas absurdas, injeção de SQL, ids inexistentes) como cada perfil.
// Uma função pode recusar, mas só com um código de regra nosso (snake_case). Erro de SQL cru
// (null value, invalid input syntax, overflow, divisão por zero…) é bug de validação.
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Db, type Actor } from "./helpers";

let db: Db;
const actors: Record<string, Actor> = {};
const pools: Record<string, string[]> = {};

const SKIP = new Set([
  "audit_immutable", "audit_row", "bump_version", "staff_on_deactivate", "stays_check_bed", "staff_sync_locale",
  "begin_email_verification", "mark_password_changed", // alteram a sessão de teste
]);

// gerador pseudoaleatório fixo: a varredura é reproduzível
let seed = 20261121;
const rnd = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);
const pick = <T,>(xs: T[]): T => xs[Math.floor(rnd() * xs.length)];

const TEXTS: (string | null)[] = [
  null, "", " ", "x", "Texto normal", "a".repeat(20000), "'; drop table public.staff; --", "<script>alert(1)</script>",
  "Seán Ó Brien ñ ł ż 日本語 🧪", "\u0000x".replace("\u0000", ""), "line1\nline2\ttab", "%_\\", "{\"a\":1}",
];
const INTS: (number | null)[] = [null, 0, 1, -1, 2, 12, 2147483647, -2147483648];
const NUMS: (number | string | null)[] = [null, 0, -1, 0.001, 1.335, 5, 1e12, "NaN"];
const TS: (string | null)[] = [null, "0001-01-01T00:00:00Z", "1970-01-01T00:00:00Z", "2026-11-20T12:00:00Z", "2026-11-21T03:00:00Z", "2099-12-31T23:59:59Z", "infinity", "-infinity"];
const DATES: (string | null)[] = [null, "0001-01-01", "1970-01-01", "2026-11-01", "2026-11-20", "2026-11-21", "2099-12-31", "infinity"];
const JSONS: (string | null)[] = [null, "[]", "{}", "[1]", "\"x\"", "[{}]", "[{\"resident_id\":\"not-a-uuid\"}]", "[{\"product_id\":null,\"quantity\":-1,\"unit_price\":\"x\"}]", "[null]", "123"];
const SLOTS = [null, "", "12:00", "25:99", "abc", "00:00", "07:00", "22:00"];

function uuidFrom(kind: string): string | null {
  const r = rnd();
  if (r < 0.1) return null;
  if (r < 0.25) return "00000000-0000-0000-0000-000000000000";
  const list = pools[kind] ?? pools.any;
  return list.length ? pick(list) : null;
}

/** Tipo do parâmetro + nome → valor de teste. */
function value(name: string, type: string): unknown {
  const n = name.replace(/^p_/, "");
  if (type === "uuid") {
    const kind = /stay/.test(n) ? "stay" : /resident/.test(n) ? "resident" : /bed/.test(n) ? "bed" : /lodge|from|^to$/.test(n) ? "lodge"
      : /staff|post|performed/.test(n) ? "staff" : /product/.test(n) ? "product" : /ticket/.test(n) ? "ticket" : /run/.test(n) ? "run"
      : /machine/.test(n) ? "machine" : /use/.test(n) ? "use" : /absence/.test(n) ? "absence" : /line/.test(n) ? "line" : /purchase/.test(n) ? "purchase"
      : /extra|task/.test(n) ? "task" : /id$|^id$/.test(n) ? "any" : "any";
    return uuidFrom(kind);
  }
  if (type === "text") {
    if (/slot/.test(n)) return pick(SLOTS);
    if (/function/.test(n)) return pick([null, "office", "float", "cleaner", "manager", "nope"]);
    if (/priority/.test(n)) return pick([null, "urgent", "normal", "low", "nope"]);
    if (/status/.test(n)) return pick([null, "open", "in_progress", "on_hold", "resolved", "reopened", "nope"]);
    if (/^shift$/.test(n)) return pick([null, "day", "night", "nope"]);
    if (/^type$/.test(n)) return pick([null, "verbal", "written", "final_written", "nope"]);
    if (/^kind$/.test(n)) return pick([null, "template", "extra", "nope"]);
    if (/metric/.test(n)) return pick([null, "occupancy.admissions", "maintenance.opened", "dinner.served", "nope.nope", "", "x"]);
    return pick(TEXTS);
  }
  if (type === "integer") return pick(INTS);
  if (type === "numeric") return pick(NUMS);
  if (type === "boolean") return pick([null, true, false]);
  if (type.startsWith("timestamp")) return pick(TS);
  if (type === "date") return pick(DATES);
  if (type === "jsonb") return pick(JSONS);
  if (type === "uuid[]") {
    const r = rnd();
    return r < 0.2 ? null : r < 0.4 ? [] : [uuidFrom("stay"), uuidFrom("stay")];
  }
  if (type === "integer[]") return pick([null, [], [1, 2], [0], [8], [-1]]);
  if (type === "bigint") return pick([null, 0, 1, 999999999]);
  if (type === "duty_function") return pick(["office", "float"]);
  if (type === "check_result") return pick(["seen", "not_seen", "absent"]);
  if (type === "app_locale") return pick(["pt-PT", "en-IE", "pl-PL"]);
  return null;
}

type Fn = { name: string; args: { name: string; type: string }[] };

beforeAll(async () => {
  db = await Db.open();
  actors.manager = await db.createStaff("manager", "Fuzz Manager");
  actors.owner = await db.createStaff("owner", "Fuzz Owner");
  actors.officeA = await db.createStaff("porter", "Fuzz Office A");
  actors.officeC = await db.createStaff("porter", "Fuzz Office C");
  actors.floater = await db.createStaff("porter", "Fuzz Float");
  actors.bare = await db.createStaff("porter", "Fuzz Sem Posto");
  await db.asSuperuser();
  await db.query(readFileSync("supabase/seed/demo.sql", "utf8"));
  await db.query("select demo.seed()");
  const lodges = await db.query<{ id: string; code: string }>("select id, code from public.lodges");
  const A = lodges.rows.find((l) => l.code === "AMIENS")!.id;
  const C = lodges.rows.find((l) => l.code === "CONNOLLY")!.id;
  await db.as(actors.officeA);
  await db.query("select public.assume_post('office', $1, true)", [A]);
  await db.as(actors.officeC);
  await db.query("select public.assume_post('office', $1, true)", [C]);
  await db.as(actors.floater);
  await db.query("select public.assume_post('float', null, true)");
  await db.asSuperuser();
  const ids = async (sql: string) => (await db.query<{ id: string }>(sql)).rows.map((r) => r.id);
  pools.lodge = await ids("select id from public.lodges");
  pools.stay = await ids("select id from public.stays order by random() limit 60");
  pools.resident = await ids("select id from public.residents order by random() limit 60");
  pools.bed = await ids("select id from public.beds order by random() limit 60");
  pools.staff = await ids("select id from public.staff order by random() limit 40");
  pools.product = await ids("select id from public.products");
  pools.ticket = await ids("select id from public.maintenance_tickets");
  pools.run = await ids("select id from public.room_check_runs order by random() limit 40");
  pools.machine = await ids("select id from public.laundry_machines");
  pools.use = await ids("select id from public.laundry_uses order by random() limit 20");
  pools.absence = await ids("select id from public.absences");
  pools.line = await ids("select id from public.purchase_lines");
  pools.purchase = await ids("select id from public.purchases");
  pools.task = await ids("select id from public.task_templates union all select id from public.task_extras");
  pools.any = [...pools.stay, ...pools.resident, ...pools.bed, ...pools.staff, ...pools.lodge];
}, 120_000);

afterAll(async () => {
  await db.close();
});

describe("varredura de entradas inválidas em todas as funções", () => {
  it("só recusa com códigos de regra (snake_case); nenhum erro cru de SQL", async () => {
    await db.asSuperuser();
    const fns = (
      await db.query<{ name: string; args: string; types: string }>(
        `select p.proname name,
                coalesce(array_to_string(p.proargnames[1:p.pronargs], ','), '') args,
                coalesce(array_to_string(array(select format_type(t, null) from unnest(p.proargtypes::oid[]) t), ','), '') types
         from pg_proc p join pg_namespace n on n.oid = p.pronamespace
         where n.nspname = 'public' and p.prokind = 'f' and has_function_privilege('authenticated', p.oid, 'execute')
         order by 1`,
      )
    ).rows
      .filter((f) => !SKIP.has(f.name))
      .map<Fn>((f) => {
        const names = f.args ? f.args.split(",") : [];
        const types = f.types ? f.types.split(",") : [];
        return { name: f.name, args: names.map((nm, i) => ({ name: nm, type: types[i] })) };
      });

    const bugs = new Map<string, { fn: string; actor: string; message: string; sample: string }>();
    let calls = 0;
    for (const fn of fns) {
      const rounds = fn.args.length === 0 ? 1 : 24;
      for (const [actorName, actor] of Object.entries(actors)) {
        for (let i = 0; i < rounds; i++) {
          const params = fn.args.map((a) => value(a.name, a.type));
          const call = `select * from public.${fn.name}(${fn.args.map((a, k) => `$${k + 1}::${a.type}`).join(", ")})`;
          await db.as(actor);
          const message = await db.error(call, params.map((p) => (Array.isArray(p) ? p : p === undefined ? null : p)));
          calls++;
          if (!message) continue;
          if (/^[a-z0-9_]+$/.test(message)) continue; // regra de negócio nossa
          if (/permission denied|row-level security|must be owner/.test(message)) continue; // controle de acesso
          // O banco recusou a entrada e nada foi gravado: restrição de integridade (campo nulo, id inexistente,
          // texto em branco, duplicado) ou formato errado de dado. A interface nunca envia isso; é defesa em profundidade.
          if (/violates (not-null|foreign key|check|unique) constraint|invalid input syntax for type|cannot extract elements|cannot get array length|date\/time field value out of range/.test(message)) continue;
          const key = `${fn.name}|${message.replace(/[0-9a-f-]{36}/g, "<id>").slice(0, 90)}`;
          if (!bugs.has(key)) bugs.set(key, { fn: fn.name, actor: actorName, message: message.slice(0, 160), sample: JSON.stringify(params).slice(0, 200) });
        }
      }
    }
    await db.asSuperuser();
    const list = [...bugs.values()];
    if (list.length) console.log(`\n${calls} chamadas · ${list.length} erros não tratados:\n` + list.map((b) => `  ${b.fn} [${b.actor}] ${b.message}\n      ${b.sample}`).join("\n"));
    expect(list.map((b) => `${b.fn}: ${b.message}`)).toEqual([]);
  }, 900_000);
});
