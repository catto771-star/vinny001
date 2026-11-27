// Bateria de estresse com dados fictícios, em um banco local ISOLADO (dslodge_load). Nunca toca a produção.
// Uso: npm run load   (precisa do Postgres local na porta 54322; veja scripts/db-reset.mjs)
// Escreve o relatório em docs/STRESS-REPORT.md e sai com código 1 se algum critério falhar.
import { spawnSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import pg from "pg";

const base = process.env.LOCAL_PG_URL ?? "postgresql://postgres@localhost:54322";
const DB = "dslodge_load";
const VOL = { residents: Number(process.env.LOAD_RESIDENTS ?? 5000), handover: Number(process.env.LOAD_HANDOVER ?? 60000), fridge: 30000, deliveries: 8000, tickets: 3000 };
const results = [], timings = [];
const check = (name, ok, detail = "") => { results.push({ name, ok, detail }); console.log(`${ok ? "PASS" : "FAIL"}  ${name}  ${detail}`); };

// ---------- banco isolado ----------
const r = spawnSync("node", ["scripts/db-reset.mjs"], { env: { ...process.env, LOCAL_PG_DB: DB }, encoding: "utf8" });
if (r.status !== 0) { console.error(r.stdout, r.stderr); process.exit(2); }
const pool = new pg.Pool({ connectionString: `${base}/${DB}`, max: 40 });
const su = (sql, p) => pool.query(sql, p);

/** Executa uma chamada como um usuário do app (RLS ligada), em transação própria e confirmada. */
async function as(actor, sql, params = []) {
  const c = await pool.connect();
  try {
    await c.query("begin");
    await c.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: actor.userId, role: "authenticated", amr: [{ method: "otp", timestamp: Math.floor(Date.now() / 1000) }] })]);
    await c.query("set local role authenticated");
    const res = await c.query(sql, params);
    await c.query("commit");
    return res;
  } catch (e) { await c.query("rollback").catch(() => {}); throw e; } finally { c.release(); }
}
const tryAs = async (actor, sql, params) => { try { await as(actor, sql, params); return null; } catch (e) { return e.message; } };

async function mkStaff(role, name, home) {
  const u = (await su("insert into auth.users (email) values ($1) returning id", [`${name.toLowerCase().replace(/\W+/g, ".")}@load.test`])).rows[0].id;
  const s = (await su("insert into public.staff (user_id, full_name, role, home_lodge_id) values ($1,$2,$3,(select id from public.lodges where code=$4)) returning id", [u, name, role, home])).rows[0].id;
  if (["manager", "owner"].includes(role)) await su("insert into public.mfa_email_challenges (user_id) values ($1)", [u]);
  return { userId: u, staffId: s, role };
}
const pct = (a, p) => { const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };
async function time(label, actor, sql, params = [], budgetMs = 1500, n = 7) {
  const ts = [];
  for (let i = 0; i < n; i++) { const t = performance.now(); await as(actor, sql, params); ts.push(performance.now() - t); }
  const row = { label, p50: pct(ts, 0.5), p95: pct(ts, 0.95), max: Math.max(...ts), budget: budgetMs };
  timings.push(row); check(`Tempo: ${label}`, row.p95 <= budgetMs, `p50 ${row.p50.toFixed(0)} ms · p95 ${row.p95.toFixed(0)} ms (limite ${budgetMs} ms)`);
}

const t0 = Date.now();
const admin = await mkStaff("manager", "Load Admin", null);
const stA = await mkStaff("station", "Load Amiens Reception", "AMIENS");
const stC = await mkStaff("station", "Load Connolly Reception", "CONNOLLY");
const amiens = (await su("select id from public.lodges where code='AMIENS'")).rows[0].id;
const connolly = (await su("select id from public.lodges where code='CONNOLLY'")).rows[0].id;

// ---------- 1. volume histórico (sem gatilhos, só para encher as tabelas) ----------
console.log("Semeando volume histórico...");
const c = await pool.connect();
await c.query("set session_replication_role = replica");
const endType = (await c.query("select udt_name from information_schema.columns where table_name='stays' and column_name='end_reason'")).rows[0].udt_name;
await c.query(`insert into public.residents (first_name, last_name, pass_id, date_of_birth, created_by)
  select 'Hist' || g, 'Lad' || (g % 997), 'H' || lpad(g::text, 7, '0'), date '1960-01-01' + (g % 14000), $1 from generate_series(1, $2) g`, [admin.staffId, VOL.residents]);
await c.query(`with b as (select array_agg(b.id) ids, array_agg(r.lodge_id) lodges from public.beds b join public.rooms r on r.id = b.room_id), rs as (select id, row_number() over () n from public.residents where pass_id like 'H%')
  insert into public.stays (resident_id, lodge_id, bed_id, admitted_at, status, ended_at, end_reason, created_by)
  select rs.id, b.lodges[1 + (rs.n % cardinality(b.ids))], b.ids[1 + (rs.n % cardinality(b.ids))], now() - make_interval(days => (60 + (rs.n % 700)::int)), 'ended', now() - make_interval(days => (5 + (rs.n % 55)::int)), (enum_range(null::public.${endType}))[1], $1
  from rs, b`, [admin.staffId]);
await c.query(`insert into public.handover_entries (lodge_id, kind, body, occurred_at, operational_day, author_id, status)
  select case when g % 2 = 0 then $1::uuid else $2::uuid end, 'note', 'Fictional note ' || g || case when g % 50 = 0 then ' leak in the kitchen' else ' all quiet' end,
         now() - make_interval(mins => (g)::int), (now() - make_interval(mins => (g)::int))::date, $3, 'active' from generate_series(1, $4) g`, [amiens, connolly, admin.staffId, VOL.handover]);
await c.query(`insert into public.fridge_readings (lodge_id, fridge_id, temperature, range_min, range_max, out_of_range, recorded_by, recorded_at)
  select f.lodge_id, f.id, 2 + (g % 7), 0, 5, (2 + (g % 7)) > 5, $1, now() - make_interval(mins => (g * 7)::int) from generate_series(1, $2) g cross join lateral (select id, lodge_id from public.fridges order by id limit 1) f`, [admin.staffId, VOL.fridge]);
const sup = (await c.query("select id from public.suppliers order by sort_order limit 1")).rows[0].id;
await c.query(`insert into public.food_deliveries (lodge_id, product, supplier, supplier_id, received_by, received_at)
  select $1, 'Product ' || g, 'Tesco', $2, $3, now() - make_interval(hours => (g)::int) from generate_series(1, $4) g`, [amiens, sup, admin.staffId, VOL.deliveries]);
await c.query(`insert into public.maintenance_tickets (lodge_id, location, description, priority, status, deadline_at, request_key, created_by, created_at)
  select $1, 'Room ' || (g % 30), 'Fictional repair ' || g, 'normal', 'resolved', now() - make_interval(days => (g % 300)::int), gen_random_uuid(), $2, now() - make_interval(days => (g % 300 + 1)::int) from generate_series(1, $3) g`, [amiens, admin.staffId, VOL.tickets]);
await c.query("set session_replication_role = origin"); c.release();
await su("analyze");
const counts = (await su(`select (select count(*) from public.residents) residents, (select count(*) from public.stays) stays, (select count(*) from public.handover_entries) handover, (select count(*) from public.fridge_readings) fridge, (select count(*) from public.food_deliveries) deliveries, (select count(*) from public.maintenance_tickets) tickets`)).rows[0];
console.log("Volume:", counts);

// ---------- 2. casas cheias pelo fluxo real ----------
console.log("Enchendo as casas pelo fluxo real...");
const beds = (await su("select bed_id, lodge_id from public.bed_occupancy where stay_id is null and bed_status = 'in_use'")).rows;
let admitted = 0, admitErr = [];
for (const b of beds) {
  const st = b.lodge_id === amiens ? stA : stC;
  const e = await tryAs(st, "select public.admit_resident(p_lodge => $1, p_bed => $2, p_first_name => 'Live', p_last_name => $3, p_pass_id => $4, p_admitted_at => now() - interval '3 days')", [b.lodge_id, b.bed_id, "Lad" + admitted, "LIVE" + admitted]);
  if (e) admitErr.push(e); else admitted++;
}
check("Admitir moradores em todas as camas livres pelo fluxo real", admitErr.length === 0 && admitted === beds.length, `${admitted}/${beds.length}${admitErr[0] ? " · " + admitErr[0] : ""}`);

// ---------- 3. desempenho de leitura com o volume ----------
const day = (await su("select current_date d")).rows[0].d.toISOString().slice(0, 10);
const yearAgo = new Date(Date.now() - 365 * 864e5).toISOString().slice(0, 10), tomorrow = new Date(Date.now() + 864e5).toISOString().slice(0, 10);
await time("Home do Admin (home_dashboard, 30 dias)", admin, "select public.home_dashboard(current_date - 30, current_date + 1)");
const q90 = new Date(Date.now() - 90 * 864e5).toISOString().slice(0, 10);
await time("Reports: 90 dias, as duas casas", admin, "select public.report_period(array[$1::uuid,$2::uuid], $3::date, $4::date)", [amiens, connolly, q90, tomorrow], 3000);
check("Reports: período de 1 ano é recusado com mensagem clara (limite de projeto)", /range_too_large/.test(await tryAs(admin, "select public.report_period(array[$1::uuid,$2::uuid], $3::date, $4::date)", [amiens, connolly, yearAgo, tomorrow]) ?? ""));
await time("Reports: compras (1 ano)", admin, "select public.report_purchases($1::date, $2::date)", [yearAgo, tomorrow]);
await time("Handover: busca por texto em 60 mil notas", admin, "select count(*) from public.search_handover($1::uuid, $2::date, $3::date, 'leak', null, null, null, null, null, false, 50)", [amiens, yearAgo, tomorrow], 2500);
await time("Handover: um dia", admin, "select count(*) from public.search_handover($1::uuid, current_date, current_date, null, null, null, null, null, null, false, 200)", [amiens]);
await time("Audit: busca recente (limite 100)", admin, "select count(*) from public.search_audit(null, null, null, null, null, null, null, 100, null)");
await time("Mapa de camas (bed_occupancy)", stA, "select count(*) from public.bed_occupancy");
await time("Folha do dia (seen_for_day)", stA, "select count(*) from public.seen_for_day($1::uuid, current_date)", [amiens]);
await time("Ex-moradores por PASS ID (5 mil históricos)", stA, "select * from public.find_former_resident('H0004321')");
await time("Lista de residentes (join com estadias)", admin, "select count(*) from public.residents r join public.stays s on s.resident_id = r.id where s.status = 'ended'", [], 2500);
await time("Contadores de pendências (pending_counts)", admin, "select public.pending_counts($1::uuid)", [amiens]);
await time("Notificações (my_notifications)", admin, "select count(*) from public.my_notifications(50)");

// ---------- 4. concorrência real (várias conexões ao mesmo tempo) ----------
console.log("Concorrência...");
const freeBeds = async (lodge, n) => (await su("select bed_id from public.bed_occupancy where lodge_id = $1 and stay_id is null and bed_status = 'in_use' limit $2", [lodge, n])).rows.map((x) => x.bed_id);
// libera algumas camas para os testes: encerra 30 estadias de Amiens
const toEnd = (await su("select id from public.stays where lodge_id = $1 and status = 'active' and resident_id in (select id from public.residents where pass_id like 'LIVE%') limit 30", [amiens])).rows;
for (const s of toEnd) { await as(admin, "select public.decide_out($1, 'stress')", [s.id]); await as(admin, "select public.effect_out($1)", [s.id]); }
const free = await freeBeds(amiens, 30);

// C1: 25 admissões simultâneas na MESMA cama: só uma pode vencer
let res = await Promise.all(Array.from({ length: 25 }, (_, i) => tryAs(stA, "select public.admit_resident(p_lodge => $1, p_bed => $2, p_first_name => 'Race', p_pass_id => $3, p_admitted_at => now())", [amiens, free[0], "RACE-BED-" + i])));
check("Concorrência: 25 admissões na mesma cama → exatamente 1 vence", res.filter((e) => !e).length === 1, `${res.filter((e) => !e).length} sucesso(s)`);
// C2: mesmo PASS ID em 20 camas diferentes ao mesmo tempo → só um morador
res = await Promise.all(free.slice(1, 21).map((b) => tryAs(stA, "select public.admit_resident(p_lodge => $1, p_bed => $2, p_first_name => 'Dup', p_pass_id => 'RACE-PASS', p_admitted_at => now())", [amiens, b])));
check("Concorrência: mesmo PASS ID em 20 camas → exatamente 1 vence", res.filter((e) => !e).length === 1, `${res.filter((e) => !e).length} sucesso(s)`);
// C3: 300 notas de Handover simultâneas
const before = (await su("select count(*)::int n from public.handover_entries")).rows[0].n;
res = await Promise.all(Array.from({ length: 300 }, (_, i) => tryAs([stA, stC, admin][i % 3], "select public.add_handover_note($1::uuid, $2, now(), '[]'::jsonb, null)", [i % 2 ? amiens : connolly, `Concurrent note ${i}`])));
const after = (await su("select count(*)::int n from public.handover_entries")).rows[0].n;
check("Concorrência: 300 notas de Handover ao mesmo tempo, sem perda", res.every((e) => !e) && after - before >= 300, `${res.filter((e) => !e).length}/300 ok · +${after - before} linhas${res.find((e) => e) ? " · " + res.find((e) => e) : ""}`);
// C4: duplo clique no Room Check: 40 marcações simultâneas da mesma pessoa → uma só marca
const run = (await as(admin, "select public.open_room_check($1::uuid, current_date - 1, '12:00') as id", [amiens])).rows[0].id;
const stay = (await su("select id from public.stays where lodge_id = $1 and status = 'active' limit 1", [amiens])).rows[0].id;
res = await Promise.all(Array.from({ length: 40 }, () => tryAs(admin, "select public.mark_resident($1, $2, 'seen')", [run, stay])));
const marks = (await su("select count(*)::int n from public.room_check_marks where run_id = $1 and stay_id = $2", [run, stay])).rows[0].n;
check("Concorrência: 40 cliques na mesma marcação do Room Check → 1 só registro", marks === 1, `${marks} registro(s), ${res.filter((e) => e).length} recusa(s)`);
// C5: 100 leituras de geladeira + 100 entregas ao mesmo tempo
const fr = (await su("select id from public.fridges where lodge_id = $1 and active limit 1", [amiens])).rows[0].id;
res = await Promise.all([...Array.from({ length: 100 }, (_, i) => tryAs(stA, "select public.record_fridge_reading($1, $2, null)", [fr, 2 + (i % 5)])), ...Array.from({ length: 100 }, (_, i) => tryAs(stA, "select public.record_food_delivery($1::uuid, $2, $3::uuid, null, null, null, null)", [amiens, "Conc " + i, sup]))]);
check("Concorrência: 100 temperaturas + 100 entregas ao mesmo tempo", res.every((e) => !e), `${res.filter((e) => !e).length}/200 ok${res.find((e) => e) ? " · " + res.find((e) => e) : ""}`);
// C6: 2 pessoas vinculam a mesma entrega a pedidos diferentes → só um vínculo
const del = (await as(stA, "select public.record_food_delivery($1::uuid, 'Weekly order', $2::uuid, null, null, null, null) as id", [amiens, (await su("select id from public.suppliers where links_order limit 1")).rows[0].id])).rows[0].id;
const orders = [];
for (let i = 0; i < 2; i++) orders.push((await su("insert into public.shop_orders (delivery_date, status, created_by) values (current_date, 'placed', $1) returning id", [admin.staffId])).rows[0].id);
res = await Promise.all(orders.map((o) => tryAs(admin, "select public.link_delivery_to_order($1, $2)", [del, o])));
check("Concorrência: mesma entrega ligada a 2 pedidos ao mesmo tempo → 1 vínculo", res.filter((e) => !e).length === 1, `${res.filter((e) => !e).length} sucesso(s)`);
// C7: 60 leituras pesadas em paralelo
const tp = performance.now();
res = await Promise.all(Array.from({ length: 60 }, (_, i) => tryAs(admin, i % 2 ? "select public.home_dashboard(current_date - 30, current_date + 1)" : "select count(*) from public.search_handover($1::uuid, current_date - 30, current_date + 1, 'quiet', null, null, null, null, null, false, 50)", i % 2 ? [] : [amiens])));
const dt = performance.now() - tp;
check("Carga: 60 leituras pesadas simultâneas (Home + busca)", res.every((e) => !e) && dt < 15000, `${(dt / 1000).toFixed(1)} s no total`);

// ---------- 5. integridade depois do estresse ----------
const integ = (await su(`select
  (select count(*)::int from (select bed_id from public.stays where status <> 'ended' group by bed_id having count(*) > 1) x) dup_beds,
  (select count(*)::int from (select resident_id from public.stays where status <> 'ended' group by resident_id having count(*) > 1) x) dup_res,
  (select count(*)::int from (select lower(pass_id) from public.residents where pass_id is not null group by 1 having count(*) > 1) x) dup_pass,
  (select count(*)::int from (select run_id, stay_id from public.room_check_marks group by 1,2 having count(*) > 1) x) dup_marks`)).rows[0];
check("Integridade: nenhuma cama com 2 residentes", integ.dup_beds === 0, `${integ.dup_beds}`);
check("Integridade: nenhum morador em 2 camas", integ.dup_res === 0, `${integ.dup_res}`);
check("Integridade: nenhum PASS ID duplicado", integ.dup_pass === 0, `${integ.dup_pass}`);
check("Integridade: nenhuma marcação duplicada", integ.dup_marks === 0, `${integ.dup_marks}`);
const audit = (await su("select count(*)::int n from public.audit_log")).rows[0].n;
check("Auditoria registrou as operações do estresse", audit > 700, `${audit} linhas no audit_log`);

// ---------- relatório ----------
const ok = results.every((x) => x.ok);
const md = `# Relatório de estresse

> Gerado por \`npm run load\` em ${new Date().toISOString().slice(0, 16).replace("T", " ")} UTC · banco local isolado \`${DB}\` (nunca a produção) · duração ${((Date.now() - t0) / 1000).toFixed(0)} s

**Resultado: ${ok ? "TODOS OS CRITÉRIOS PASSARAM" : "HÁ FALHAS"}** (${results.filter((x) => x.ok).length}/${results.length})

## Volume de dados fictícios
| Tabela | Linhas |
|---|---|
| Moradores | ${counts.residents} (+${admitted} ativos agora) |
| Estadias | ${counts.stays} |
| Notas de Handover | ${counts.handover} |
| Leituras de geladeira | ${counts.fridge} |
| Entregas | ${counts.deliveries} |
| Chamados de manutenção | ${counts.tickets} |

## Tempos de resposta
| Operação | p50 | p95 | Limite | |
|---|---|---|---|---|
${timings.map((t) => `| ${t.label} | ${t.p50.toFixed(0)} ms | ${t.p95.toFixed(0)} ms | ${t.budget} ms | ${t.p95 <= t.budget ? "✅" : "❌"} |`).join("\n")}

## Todos os critérios
${results.map((x) => `- ${x.ok ? "✅" : "❌"} ${x.name}: ${x.detail}`).join("\n")}
`;
writeFileSync("docs/STRESS-REPORT.md", md);
await pool.end();
console.log(ok ? "\nTODOS OS CRITÉRIOS PASSARAM" : "\nHÁ FALHAS");
process.exit(ok ? 0 : 1);
