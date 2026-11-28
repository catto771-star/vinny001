// Teste em massa das notificações (push) contra o banco real, SEM celular:
// confere cada elo do caminho "entrada no Handover com tag -> notificação -> quem recebe -> chamada da função de envio".
// Uso: DEMO_PASSWORD=... SUPABASE_URL=... SUPABASE_ANON_KEY=... NODE_USE_ENV_PROXY=1 node tests/e2e/push-notifications.e2e.cjs
// Cria notas "TESTE push ..." (identificáveis) e uma leitura de geladeira / um Warning de teste. Não altera preferências de ninguém
// (as variações de preferência rodam numa transação que sempre é desfeita).
const { execFileSync } = require("child_process");
const SB = process.env.SUPABASE_URL, ANON = process.env.SUPABASE_ANON_KEY, PW = process.env.DEMO_PASSWORD;
if (!PW || !SB || !ANON) throw new Error("Defina DEMO_PASSWORD, SUPABASE_URL e SUPABASE_ANON_KEY.");
const RUN = Date.now().toString(36).slice(-5);
const results = [];
const check = (name, ok, detail = "") => { results.push([ok ? "PASS" : "FAIL", name, detail]); console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? " — " + String(detail).slice(0, 200) : ""}`); };
const sql = (q) => { const r = JSON.parse(execFileSync("bash", ["-c", `python3 -c "import json,sys;print(json.dumps({'query':sys.stdin.read()}))" | curl -s -m 60 -X POST 'https://api.supabase.com/v1/projects/jbcrhkbhjdiqvwalheyp/database/query' -H 'Content-Type: application/json' --data @-`], { input: q }).toString()); if (r && r.message) throw new Error(r.message.slice(0, 4000)); return r; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const same = (a, b) => JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());

async function token(email) { const r = await (await fetch(`${SB}/auth/v1/token?grant_type=password`, { method: "POST", headers: { apikey: ANON, "Content-Type": "application/json" }, body: JSON.stringify({ email, password: PW }) })).json(); if (!r.access_token) throw new Error("login falhou: " + email); return r.access_token; }
async function rpc(jwt, fn, args) { const r = await fetch(`${SB}/rest/v1/rpc/${fn}`, { method: "POST", headers: { apikey: ANON, Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" }, body: JSON.stringify(args) }); const t = await r.text(); let j; try { j = JSON.parse(t); } catch { j = t; } return { ok: r.ok, status: r.status, body: j }; }
async function rest(jwt, path) { const r = await fetch(`${SB}/rest/v1/${path}`, { headers: { apikey: ANON, Authorization: `Bearer ${jwt}` } }); return r.ok ? r.json() : []; }

async function prefsBlock(admins, prefs, idOf) {
  const [a1, a2] = admins;
  const q = `do $$ declare r jsonb; begin
    insert into public.push_prefs (staff_id, key, enabled) values ('${a1}','tag:incident',false), ('${a1}','tag:general',true), ('${a2}','tag:emergency',false), ('${a2}','tag:general',true);
    select jsonb_build_object(
      'inc', public.push_recipients(${idOf("incident")}), 'gen', public.push_recipients(${idOf("general")}),
      'eme', public.push_recipients(${idOf("emergency")}), 'con', public.push_recipients(${idOf("conduct")})) into r;
    raise exception 'RESULT:%', r::text; end $$;`;
  let pr;
  try { sql(q); } catch (e) { const m = /RESULT:(\{.*\})/.exec(e.message); pr = m && JSON.parse(m[1]); }
  if (!pr) check("Preferências: consulta de simulação executou", false);
  else {
    const without = (id) => admins.filter((x) => x !== id);
    check("Preferências: Admin que desliga 'Incident' deixa de receber, os outros continuam", same(pr.inc, without(a1)), `${(pr.inc || []).length} destinatários`);
    check("Preferências: Admin que desliga 'Emergency' deixa de receber, os outros continuam", same(pr.eme, without(a2)), `${(pr.eme || []).length} destinatários`);
    check("Preferências: Admins que ligam a tag 'General' (sem alerta) passam a receber, os outros não", same(pr.gen, [a1, a2]), `${(pr.gen || []).length} destinatários`);
    check("Preferências: tag 'Resident conduct' continua sem receber ninguém", (pr.con || []).length === 0);
  }
  check("Nenhuma preferência foi gravada pelo teste (transação desfeita)", sql("select count(*)::int as n from public.push_prefs;")[0].n === prefs);
}

(async () => {
  const jwt = { am: await token("amiens.reception@demo.ds-lodge.test"), co: await token("connolly.reception@demo.ds-lodge.test"), mgr: await token("sean.murphy@demo.ds-lodge.test") };
  const lodges = Object.fromEntries(sql("select code, id from public.lodges;").map((l) => [l.code, l.id]));
  const tags = await rest(jwt.mgr, "handover_tags?select=id,code,notify_default&visible=eq.true&order=sort_order");
  const admins = sql("select id from public.staff where active and role in ('manager','owner','developer');").map((x) => x.id);
  const prefs = sql("select count(*)::int as n from public.push_prefs;")[0].n;
  console.log(`Base: ${tags.length} tags, ${admins.length} Admins ativos, ${prefs} preferências gravadas, aparelhos cadastrados: ${sql("select count(*)::int as n from public.push_subscriptions;")[0].n}`);
  check("Há 8 tags visíveis e Admins ativos para receber", tags.length === 8 && admins.length >= 2, `${tags.length} tags, ${admins.length} admins`);

  if (process.env.PREFS_ONLY) {
    const ex = sql("select n.id, n.payload from public.notifications n where n.kind='handover_tag' and n.payload->>'excerpt' like 'TESTE push %' and jsonb_array_length(n.payload->'tags')=1 order by n.id desc;");
    const idOf = (code) => ex.find((x) => x.payload.tags[0] === code).id;
    await prefsBlock(admins, prefs, idOf);
    const f = results.filter((r) => r[0] === "FAIL"); console.log(`\nRESUMO: ${results.length - f.length} PASS, ${f.length} FAIL`); process.exit(f.length ? 1 : 0);
  }
  const netBefore = sql("select count(*)::int as n from net._http_response;")[0].n;
  const notes = []; // { marker, tag codes, expect(boolean) }
  const sources = [["Amiens (conta da casa)", "am", "AMIENS"], ["Connolly (conta da casa)", "co", "CONNOLLY"], ["Admin em Amiens", "mgr", "AMIENS"], ["Admin em Connolly", "mgr", "CONNOLLY"]];

  // ---- 1) uma tag por vez, em cada origem
  for (const t of tags) for (const [label, who, lodge] of sources) {
    const marker = `TESTE push ${RUN} ${t.code} ${who}-${lodge}`;
    const r = await rpc(jwt[who], "add_handover_note", { p_lodge: lodges[lodge], p_body: marker, p_occurred_at: null, p_mentions: [], p_late_reason: null, p_filled_by: null, p_tags: [t.id] });
    if (!r.ok) { check(`Nota com tag ${t.code} gravada por ${label}`, false, JSON.stringify(r.body).slice(0, 160)); continue; }
    notes.push({ marker, codes: [t.code], lodge, label, expectPush: t.notify_default });
  }
  // ---- 2) combinações de tags
  const byCode = Object.fromEntries(tags.map((t) => [t.code, t]));
  for (const combo of [["incident", "general"], ["general", "delivery"], ["conduct", "visitor"], ["health", "damage", "general"], ["emergency", "incident", "health", "damage"]]) {
    for (const [label, who, lodge] of [sources[0], sources[1], sources[2]]) {
      const marker = `TESTE push ${RUN} ${combo.join("+")} ${who}-${lodge}`;
      const r = await rpc(jwt[who], "add_handover_note", { p_lodge: lodges[lodge], p_body: marker, p_occurred_at: null, p_mentions: [], p_late_reason: null, p_filled_by: null, p_tags: combo.map((c) => byCode[c].id) });
      if (!r.ok) { check(`Nota com tags ${combo.join("+")} por ${label}`, false, JSON.stringify(r.body).slice(0, 160)); continue; }
      notes.push({ marker, codes: combo, lodge, label, expectPush: combo.some((c) => byCode[c].notify_default) });
    }
  }
  // ---- 3) sem tag: não notifica
  const noTagMarker = `TESTE push ${RUN} sem-tag`;
  const nt = await rpc(jwt.am, "add_handover_note", { p_lodge: lodges.AMIENS, p_body: noTagMarker, p_occurred_at: null, p_mentions: [], p_late_reason: null, p_filled_by: null, p_tags: [] });
  check("Nota sem tag é gravada", nt.ok, JSON.stringify(nt.body).slice(0, 120));

  await sleep(6000);
  const rows = sql(`select n.id, n.kind, n.audience, n.lodge_id, n.payload, coalesce(public.push_recipients(n.id),'{}') as rec from public.notifications n where n.kind='handover_tag' and n.payload->>'excerpt' like 'TESTE push ${RUN}%';`);
  const byMarker = Object.fromEntries(rows.map((r) => [r.payload.excerpt, r]));

  // ---- 4) conferência de cada nota
  let okCount = 0, bad = [];
  for (const n of notes) {
    const r = byMarker[n.marker];
    const probs = [];
    if (!r) probs.push("notificação NÃO foi criada");
    else {
      if (r.audience !== "management") probs.push("audiência " + r.audience);
      if (r.lodge_id !== lodges[n.lodge]) probs.push("casa errada");
      if (!same(r.payload.tags, n.codes)) probs.push("tags " + JSON.stringify(r.payload.tags));
      const rec = r.rec || [];
      if (n.expectPush && !same(rec, admins)) probs.push(`destinatários ${rec.length}/${admins.length}`);
      if (!n.expectPush && rec.length !== 0) probs.push(`não deveria notificar, mas ${rec.length} destinatário(s)`);
    }
    if (probs.length) bad.push(`${n.label} ${n.codes.join("+")}: ${probs.join(", ")}`); else okCount++;
  }
  check(`Tag única: ${tags.length * sources.length} notas (8 tags x 4 origens) criam a notificação certa, na casa certa, com os destinatários certos`, bad.filter((b) => !/\+/.test(b.split(": ")[0])).length === 0, bad.filter((b) => !/\+/.test(b.split(": ")[0])).slice(0, 4).join(" | "));
  check(`Combinações de tags: ${5 * 3} notas criam a notificação com todas as tags e destinatários corretos`, bad.filter((b) => /\+/.test(b.split(": ")[0])).length === 0, bad.filter((b) => /\+/.test(b.split(": ")[0])).slice(0, 4).join(" | "));
  check(`Resumo: ${okCount} de ${notes.length} notas conferem`, okCount === notes.length);
  check("Nota sem tag NÃO gera notificação", sql(`select count(*)::int as n from public.notifications where kind='handover_tag' and payload->>'excerpt'='${noTagMarker}';`)[0].n === 0);

  // ---- 5) por tag: padrão (notifica) x sem alerta
  for (const t of tags) {
    const mine = notes.filter((n) => n.codes.length === 1 && n.codes[0] === t.code).map((n) => byMarker[n.marker]).filter(Boolean);
    const all = mine.length === 4 && mine.every((r) => (r.rec || []).length === (t.notify_default ? admins.length : 0));
    check(`Tag '${t.code}' (${t.notify_default ? "com alerta" : "sem alerta"}): ${t.notify_default ? "todos os Admins ativos recebem" : "ninguém recebe push"} nas 4 origens`, all);
  }

  // ---- 6) a função de envio foi chamada para cada nota (notificação com tag sempre chama)
  const net = sql(`select count(*)::int as n, count(*) filter (where status_code=200)::int as ok200, count(*) filter (where status_code is null)::int as sem_resposta from net._http_response where id > (select coalesce(max(id),0) - ${notes.length + 20} from net._http_response);`);
  const netAfter = sql("select count(*)::int as n from net._http_response;")[0].n;
  check(`A função de envio (send-push) foi chamada para as ${notes.length} notas (respostas novas: ${netAfter - netBefore})`, netAfter - netBefore >= notes.length - 2, `${netAfter - netBefore} novas respostas`);
  const resp = sql("select status_code, left(content,40) as c, count(*)::int as n from net._http_response where created > now() - interval '15 minutes' group by 1,2 order by 3 desc;");
  console.log("  respostas recentes da função:", JSON.stringify(resp));
  check("send-push responde 200 (sem erro 4xx/5xx) nas chamadas deste teste", resp.filter((x) => x.status_code && x.status_code !== 200).length === 0, JSON.stringify(resp.filter((x) => x.status_code && x.status_code !== 200)));

  // ---- 7) editar e anular uma nota NÃO gera notificação nova
  const any = notes.find((n) => n.expectPush);
  const entry = byMarker[any.marker].payload.entry_id;
  const before = sql(`select count(*)::int as n from public.notifications where payload->>'entry_id'='${entry}';`)[0].n;
  const c1 = await rpc(jwt.am, "correct_handover_note", { p_id: entry, p_body: any.marker + " (editada)", p_mentions: [] });
  const c2 = await rpc(jwt.mgr, "void_handover_note", { p_id: entry, p_reason: "TESTE push: anulada" });
  await sleep(2500);
  const after = sql(`select count(*)::int as n from public.notifications where payload->>'entry_id'='${entry}';`)[0].n;
  check("Editar e anular uma nota não dispara outra notificação", after === before, `antes ${before}, depois ${after} (editar: ${c1.ok ? "ok" : JSON.stringify(c1.body).slice(0, 60)}; anular: ${c2.ok ? "ok" : JSON.stringify(c2.body).slice(0, 60)})`);

  await prefsBlock(admins, prefs, (code) => byMarker[notes.find((n) => n.codes.length === 1 && n.codes[0] === code && n.label.startsWith("Amiens")).marker].id);

  // ---- 9) outros tipos de notificação
  const fr = sql("select f.id from public.fridges f where f.active and f.lodge_id='" + lodges.AMIENS + "' limit 1;")[0];
  if (fr) {
    const outRead = await rpc(jwt.am, "record_fridge_reading", { p_fridge: fr.id, p_temperature: 14.5, p_note: `TESTE push ${RUN} fora da faixa` });
    const inRead = await rpc(jwt.am, "record_fridge_reading", { p_fridge: fr.id, p_temperature: 3.5, p_note: `TESTE push ${RUN} dentro da faixa` });
    await sleep(3000);
    const nf = sql(`select n.id, coalesce(public.push_recipients(n.id),'{}') as rec from public.notifications n where n.kind='fridge_out_of_range' and n.created_at > now() - interval '2 minutes' and n.payload->>'fridge_name' is not null and (n.payload->>'temperature')::numeric between 14.4 and 14.6;`);
    check("Geladeira fora da faixa (14,5 °C) gera notificação para todos os Admins", outRead.ok && nf.length === 1 && same(nf[0].rec, admins), `leitura: ${outRead.ok}, notificações: ${nf.length}`);
    const nin = sql(`select count(*)::int as n from public.notifications where kind='fridge_out_of_range' and created_at > now() - interval '2 minutes' and (payload->>'temperature')::numeric between 3.4 and 3.6;`)[0].n;
    check("Geladeira dentro da faixa (3,5 °C) NÃO gera notificação", inRead.ok && nin === 0, `leitura: ${inRead.ok}`);
  }
  const st = sql("select b.stay_id from public.bed_occupancy b where b.lodge_id='" + lodges.AMIENS + "' and b.stay_id is not null limit 1;")[0];
  if (st) {
    const w = await rpc(jwt.am, "record_warning", { p_stay: st.stay_id, p_type: "warning", p_note: `TESTE push ${RUN} warning` });
    await sleep(3000);
    const nw = sql(`select n.id, coalesce(public.push_recipients(n.id),'{}') as rec from public.notifications n where n.kind='warning_recorded' and n.created_at > now() - interval '2 minutes';`);
    check("Warning registrado pela casa gera notificação para todos os Admins", w.ok && nw.length >= 1 && same(nw[nw.length - 1].rec, admins), `warning: ${w.ok}${w.ok ? "" : " " + JSON.stringify(w.body).slice(0, 100)}, notificações: ${nw.length}`);
  }
  // mapeamento de todos os tipos para a função de envio
  const kinds = ["handover_tag", "maintenance_opened", "warning_recorded", "shift_hours_review", "fridge_out_of_range", "delivery_received", "delivery_expiring", "no_show_monthly_limit", "coverage_below_minimum", "vacation_conflict"];
  const keyed = sql(`select k, cardinality(public.push_keys(k, '{"tags":["incident"],"priority":"urgent"}'::jsonb)) as n from unnest(array[${kinds.map((k) => `'${k}'`).join(",")}]) k;`);
  check("Todos os 10 tipos de notificação têm chave de preferência (nenhum fica sem push)", keyed.every((x) => x.n >= 1), JSON.stringify(keyed.filter((x) => x.n < 1)));

  const fail = results.filter((r) => r[0] === "FAIL");
  console.log(`\nRESUMO: ${results.length - fail.length} PASS, ${fail.length} FAIL`);
  fail.forEach((f) => console.log("FAIL:", f[1], "—", f[2]));
  process.exit(fail.length ? 1 : 0);
})().catch((e) => { console.error("ERRO NO TESTE:", e.message); process.exit(2); });
