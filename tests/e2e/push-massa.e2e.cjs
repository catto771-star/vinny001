// Operação simulada em massa: preenche o Handover e gera todos os tipos de evento que viram notificação (push),
// cada cenário N vezes (padrão 25), intercalados e com pausa entre eles, como numa operação real.
// Uso: DEMO_PASSWORD=... SUPABASE_URL=... SUPABASE_ANON_KEY=... NODE_USE_ENV_PROXY=1 [ROUNDS=25] [DELAY_MS=3000] [WAIT_DEVICE=1] node tests/e2e/push-massa.e2e.cjs
// Parar com segurança: criar o arquivo apontado por STOP_FILE (padrão /tmp/push-massa.STOP).
// Eventos REAIS: pelas RPCs reais com a sessão das contas de casa. Eventos SINTÉTICOS (marcados): os que dependem de mexer na escala/ausências
// de verdade (shift_hours_review, no_show_monthly_limit, coverage_below_minimum, vacation_conflict) entram como linha em notifications com "teste_run".
const { execFileSync } = require("child_process");
const fs = require("fs");
const crypto = require("crypto");
const SB = process.env.SUPABASE_URL, ANON = process.env.SUPABASE_ANON_KEY, PW = process.env.DEMO_PASSWORD;
if (!PW || !SB || !ANON) throw new Error("Defina DEMO_PASSWORD, SUPABASE_URL e SUPABASE_ANON_KEY.");
const ROUNDS = Number(process.env.ROUNDS ?? 25), DELAY = Number(process.env.DELAY_MS ?? 3000);
const STOP = process.env.STOP_FILE ?? "/tmp/push-massa.STOP";
const LOG = process.env.LOG_FILE ?? "/tmp/push-massa.log";
const RUN = Date.now().toString(36).slice(-5);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const say = (m) => { const l = `${new Date().toISOString().slice(11, 19)} ${m}`; console.log(l); fs.appendFileSync(LOG, l + "\n"); };
const sql = (q) => { const r = JSON.parse(execFileSync("bash", ["-c", `python3 -c "import json,sys;print(json.dumps({'query':sys.stdin.read()}))" | curl -s -m 60 -X POST 'https://api.supabase.com/v1/projects/jbcrhkbhjdiqvwalheyp/database/query' -H 'Content-Type: application/json' --data @-`], { input: q }).toString()); if (r && r.message) throw new Error(r.message.slice(0, 600)); return r; };
async function token(email) { const r = await (await fetch(`${SB}/auth/v1/token?grant_type=password`, { method: "POST", headers: { apikey: ANON, "Content-Type": "application/json" }, body: JSON.stringify({ email, password: PW }) })).json(); if (!r.access_token) throw new Error("login falhou: " + email); return r.access_token; }
async function rpc(jwt, fn, args) { const r = await fetch(`${SB}/rest/v1/rpc/${fn}`, { method: "POST", headers: { apikey: ANON, Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" }, body: JSON.stringify(args) }); const t = await r.text(); let j; try { j = JSON.parse(t); } catch { j = t; } return { ok: r.ok, body: j }; }
async function rest(jwt, path) { const r = await fetch(`${SB}/rest/v1/${path}`, { headers: { apikey: ANON, Authorization: `Bearer ${jwt}` } }); return r.ok ? r.json() : []; }
const pick = (arr, i) => arr[i % arr.length];
const uuid = () => crypto.randomUUID();

const TEXT = {
  incident: ["Resident slipped on the wet stairs, no injury, first aid given.", "Argument in the corridor between two residents, separated and calmed.", "Fire alarm triggered by toast in the kitchen, all residents out in 3 minutes.", "Door to the back yard found unlocked at 02:10, secured.", "Resident found asleep in the TV room, escorted to bed.", "Smoke smell in Room 4, source was a heater, unplugged."],
  emergency: ["Ambulance called for resident with chest pain, taken to Mater.", "Gardaí attended after a disturbance at the front door.", "Resident collapsed in the bathroom, ambulance on the way.", "Gardaí called: unknown person trying the side gate."],
  health: ["Resident reports high temperature, GP appointment booked for tomorrow.", "Medication reminder: resident refused evening tablets.", "Resident with a bad cough, asked to rest and drink fluids.", "Resident returned from hospital, discharge letter on file.", "Nosebleed after a fall, bleeding stopped, ice applied."],
  damage: ["Broken window in Room 6, board fitted, glazier needed.", "Water leak under the kitchen sink, bucket placed.", "Chair broken in the dining room, removed.", "Wall damaged near the stairs after moving a wardrobe."],
  conduct: ["Resident was loud after 23:00, reminded about quiet hours.", "Resident refused to follow the room cleaning rota.", "Smoking in the room reported by a neighbour, spoken to.", "Verbal disagreement about the laundry machine, resolved."],
  visitor: ["Plumber visited at 10:15 for the boiler check, signed in.", "Social worker visited resident in Room 3, 45 minutes.", "Delivery driver left a parcel for a resident at reception.", "Fire safety inspector on site until 11:30."],
  delivery: ["Tesco order arrived with 2 items missing, noted for the invoice.", "Milk delivery left at the side door at 06:40.", "Parcel for a resident handed over at reception."],
  general: ["Quiet shift, all residents in by 23:00.", "Bins taken out and corridor mopped.", "Residents meeting held at 18:30, minutes on file.", "Spare keys counted and returned to the safe.", "Handed over the shift, nothing outstanding."],
};
const FRIDGE_TEMPS = [6.4, 7.2, 8.1, 9.5, 11.0, 12.5, 14.0, 6.9, 7.8, 10.2];

(async () => {
  fs.writeFileSync(LOG, "");
  const jwt = { am: await token("amiens.reception@demo.ds-lodge.test"), co: await token("connolly.reception@demo.ds-lodge.test") };
  const lodges = Object.fromEntries(sql("select code, id from public.lodges;").map((l) => [l.code, l.id]));
  const house = [["am", "AMIENS"], ["co", "CONNOLLY"]];
  const tags = Object.fromEntries((await rest(jwt.am, "handover_tags?select=id,code&visible=eq.true")).map((t) => [t.code, t.id]));
  const fridges = Object.fromEntries(house.map(([, c]) => [c, sql(`select id from public.fridges where active and lodge_id='${lodges[c]}';`).map((x) => x.id)]));
  const stays = Object.fromEntries(house.map(([, c]) => [c, sql(`select distinct stay_id as id from public.bed_occupancy where lodge_id='${lodges[c]}' and stay_id is not null limit 60;`).map((x) => x.id)]));
  const sup = Object.fromEntries(sql("select id, name from public.suppliers where active;").map((s) => [s.name, s.id]));
  const dev = () => sql(`select s.full_name, count(p.id)::int as n from public.staff s left join public.push_subscriptions p on p.staff_id=s.id where s.role in ('manager','owner','developer') and s.active ${process.env.ONLY_ROLE ? `and s.role = '${process.env.ONLY_ROLE}'` : ''} group by 1;`);
  if (process.env.WAIT_DEVICE) { say("Aguardando um aparelho cadastrado (Settings → Notifications → Turn on)…"); while (dev().every((d) => d.n === 0)) { if (fs.existsSync(STOP)) return say("Parado antes de começar."); await sleep(5000); } }
  say(`Aparelhos cadastrados: ${JSON.stringify(dev().filter((d) => d.n > 0))}`);
  const startNotif = sql("select coalesce(max(id),0)::bigint as m from public.notifications;")[0].m;
  const startNet = sql("select coalesce(max(id),0)::bigint as m from net._http_response;")[0].m;

  const note = (codes) => async (i) => {
    const [who, code] = pick(house, i + codes.length);
    const body = `${pick(TEXT[codes[0]], i)} [TESTE ${RUN}-${codes.join("+")}-${i + 1}]`;
    return rpc(jwt[who], "add_handover_note", { p_lodge: lodges[code], p_body: body, p_occurred_at: null, p_mentions: [], p_late_reason: null, p_filled_by: null, p_tags: codes.map((c) => tags[c]) });
  };
  const synth = (kind, payloadFn) => async (i) => { const code = pick(["AMIENS", "CONNOLLY"], i); sql(`insert into public.notifications (kind, audience, lodge_id, payload) values ('${kind}', 'management', '${lodges[code]}', '${JSON.stringify(payloadFn(i, code)).replace(/'/g, "''")}'::jsonb);`); return { ok: true }; };
  const scenarios = [
    ...["incident", "emergency", "health", "damage", "conduct", "visitor", "delivery", "general"].map((c) => ({ key: `tag:${c}`, kind: "handover_tag", run: note([c]) })),
    ...[["incident", "general"], ["general", "delivery"], ["conduct", "visitor"], ["health", "damage", "general"], ["emergency", "incident", "health", "damage"]].map((cs) => ({ key: `tags:${cs.join("+")}`, kind: "handover_tag", run: note(cs) })),
    { key: "nota sem tag (Handover comum)", kind: null, run: async (i) => { const [who, code] = pick(house, i); return rpc(jwt[who], "add_handover_note", { p_lodge: lodges[code], p_body: `${pick(TEXT.general, i + 2)} [TESTE ${RUN}-sem-tag-${i + 1}]`, p_occurred_at: null, p_mentions: [], p_late_reason: null, p_filled_by: null, p_tags: [] }); } },
    { key: "geladeira fora da faixa", kind: "fridge_out_of_range", run: async (i) => { const [who, code] = pick(house, i); return rpc(jwt[who], "record_fridge_reading", { p_fridge: pick(fridges[code], i), p_temperature: pick(FRIDGE_TEMPS, i), p_note: `TESTE ${RUN} fora da faixa ${i + 1}` }); } },
    { key: "warning registrado", kind: "warning_recorded", run: async (i) => { const [who, code] = pick(house, i); return rpc(jwt[who], "record_warning", { p_stay: pick(stays[code], i), p_type: "warning", p_note: `TESTE ${RUN} warning ${i + 1}: noise after quiet hours` }); } },
    ...["urgent", "normal", "low"].map((pr) => ({ key: `manutenção ${pr}`, kind: "maintenance_opened", run: async (i) => { const [who, code] = pick(house, i + (pr === "low" ? 1 : 0)); return rpc(jwt[who], "create_maintenance", { p_lodge: lodges[code], p_location: pick(["Room 4", "Kitchen", "Bathroom 2", "Hallway", "Back yard", "Laundry"], i), p_description: `TESTE ${RUN} ${pr} ${i + 1}: ${pick(["light not working", "tap dripping", "door handle loose", "heater noisy", "window will not close"], i)}`, p_priority: pr, p_request_key: uuid() }); } })),
    { key: "entrega recebida (Tesco)", kind: "delivery_received", run: async (i) => rpc(jwt.am, "record_food_delivery", { p_lodge: lodges.AMIENS, p_product: `TESTE ${RUN} Weekly order ${i + 1}`, p_supplier: sup["Tesco"], p_batch: `T${RUN}${i}`, p_expiry: new Date(Date.now() + 40 * 864e5).toISOString().slice(0, 10), p_temperature: 3.2, p_note: "TESTE" }) },
    { key: "entrega perto de vencer", kind: "delivery_expiring", run: async (i) => rpc(jwt.am, "record_food_delivery", { p_lodge: lodges.AMIENS, p_product: `TESTE ${RUN} Cooked ham ${i + 1}`, p_supplier: sup["Ripley's"], p_batch: `R${RUN}${i}`, p_expiry: new Date(Date.now() + 864e5).toISOString().slice(0, 10), p_temperature: 3.0, p_note: "TESTE" }) },
    { key: "[sintético] horas do turno a confirmar", kind: "shift_hours_review", run: synth("shift_hours_review", (i) => ({ name: pick(["Aidan Kelly", "Niall Doyle", "Ciarán Byrne", "Pedro Almeida"], i), function: "office", shift_id: uuid(), teste_run: RUN })) },
    { key: "[sintético] limite mensal de No Show", kind: "no_show_monthly_limit", run: synth("no_show_monthly_limit", (i) => ({ first_name: "Teste", last_name: `${RUN}-${i + 1}`, month_count: 3 + (i % 3), no_show_id: uuid(), operational_day: new Date().toISOString().slice(0, 10), teste_run: RUN })) },
    { key: "[sintético] escala com cobertura abaixo do mínimo", kind: "coverage_below_minimum", run: synth("coverage_below_minimum", (i) => ({ gaps: 1 + (i % 4), from: "2026-11-30T00:00:00+00:00", to: "2026-12-06T00:00:00+00:00", teste_run: RUN })) },
    { key: "[sintético] conflito de férias", kind: "vacation_conflict", run: synth("vacation_conflict", (i) => ({ name: `TESTE ${pick(["Rafael Souza", "Marek Wiśniewski", "Tomasz Nowak"], i)}`, conflicts: 1 + (i % 5), vacation_id: uuid(), teste_run: RUN })) },
  ];
  const stat = Object.fromEntries(scenarios.map((s) => [s.key, { ok: 0, fail: 0, err: "" }]));
  say(`Início: ${scenarios.length} cenários x ${ROUNDS} rodadas = ${scenarios.length * ROUNDS} eventos, pausa de ${DELAY} ms (marca TESTE ${RUN})`);
  let n = 0, stopped = false;
  outer: for (let i = 0; i < ROUNDS; i++) {
    const order = scenarios.map((s, k) => [s, (k * 7 + i * 3) % scenarios.length]).sort((a, b) => a[1] - b[1]).map((x) => x[0]);
    for (const s of order) {
      if (fs.existsSync(STOP)) { stopped = true; say("STOP recebido. Encerrando."); break outer; }
      let r; try { r = await s.run(i); } catch (e) { r = { ok: false, body: e.message }; }
      if (r.ok) stat[s.key].ok++; else { stat[s.key].fail++; stat[s.key].err = JSON.stringify(r.body).slice(0, 140); }
      n++; if (n % 25 === 0) say(`${n}/${scenarios.length * ROUNDS} eventos (rodada ${i + 1}/${ROUNDS})`);
      await sleep(DELAY);
    }
  }
  await sleep(8000);
  const byKind = sql(`select kind, count(*)::int as n from public.notifications where id > ${startNotif} group by 1 order by 2 desc;`);
  const net = sql(`select status_code, left(content,18) as c, count(*)::int as n from net._http_response where id > ${startNet} group by 1,2 order by 3 desc;`);
  const sent = net.reduce((a, x) => { const m = /"sent":(\d+)/.exec(x.c || ""); return a + (m ? Number(m[1]) * x.n : 0); }, 0);
  say("\n===== RESULTADO =====");
  for (const s of scenarios) say(`${stat[s.key].fail ? "FALHA" : "ok   "}  ${s.key.padEnd(52)} eventos ok: ${String(stat[s.key].ok).padStart(2)}  falhas: ${stat[s.key].fail}${stat[s.key].err ? "  [" + stat[s.key].err + "]" : ""}`);
  say(`Notificações criadas por tipo: ${JSON.stringify(byKind)}`);
  say(`Chamadas à função de envio: ${JSON.stringify(net)}`);
  say(`Pushes entregues ao serviço de push (soma de "sent"): ${sent}`);
  const failed = Object.values(stat).reduce((a, s) => a + s.fail, 0);
  say(`${stopped ? "INTERROMPIDO. " : ""}Eventos: ${n}, falhas: ${failed}`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error("ERRO NO GERADOR:", e.message); process.exit(2); });
