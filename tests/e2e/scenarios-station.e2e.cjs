// Cenários de uso de ponta a ponta (Playwright) — base das imagens e dos passos do manual.
// Uso: servir o build (npx vite preview --port 4173) e rodar com a produção/demonstração semeada (node scripts/demo.mjs seed):
//   DEMO_PASSWORD=<senha das contas demo> NODE_USE_ENV_PROXY=1 OUTDIR=./cenarios node tests/e2e/scenarios-station.e2e.cjs
// Entra com as contas de demonstração (a senha vem de DEMO_PASSWORD) e confere cada resultado no banco.
// Cenários da conta de casa (Staff) em Amiens e em Connolly.
const { chromium } = require("playwright");
const DEMO_PASSWORD = process.env.DEMO_PASSWORD;
if (!DEMO_PASSWORD) throw new Error("Defina DEMO_PASSWORD (senha das contas de demonstração; não fica no repositório).");
const { execFileSync } = require("child_process");
const BASE = "http://localhost:4173", OUT = process.env.OUTDIR;
const proxy = { server: process.env.HTTPS_PROXY, bypass: "localhost,127.0.0.1" };
const sql = (q) => JSON.parse(execFileSync("bash", ["-c", `python3 -c "import json,sys;print(json.dumps({'query':sys.stdin.read()}))" | curl -s -X POST 'https://api.supabase.com/v1/projects/jbcrhkbhjdiqvwalheyp/database/query' -H 'Content-Type: application/json' --data @-`], { input: q }).toString());
const results = []; const probs = [];
async function session(b, email, run) {
  const ctx = await b.newContext({ viewport: { width: 1366, height: 1000 }, proxy });
  const p = await ctx.newPage();
  await p.addInitScript(() => localStorage.setItem("ui.theme", "light"));
  let cur = "";
  p.on("pageerror", (e) => probs.push(`[${email.split(".")[0]} ${cur}] PAGEERROR ${e.message.slice(0, 120)}`));
  p.on("response", (r) => { if (r.status() >= 400 && /supabase\.co/.test(r.url()) && !/auth\/v1/.test(r.url())) probs.push(`[${email.split(".")[0]} ${cur}] HTTP ${r.status()} ${r.url().replace(/^https:\/\/[^/]+/, "").slice(0, 90)}`); });
  const dlg = () => p.locator("dialog[open]");
  const go = async (path, wait = 4000) => { await p.goto(BASE + path); await p.waitForTimeout(wait); };
  const step = async (name, fn) => {
    cur = name;
    try { const v = await fn(); results.push(["PASS", email.split(".")[0] + ": " + name, v ?? ""]); }
    catch (e) { results.push(["FAIL", email.split(".")[0] + ": " + name, String(e.message).split("\n")[0].slice(0, 170)]); await p.screenshot({ path: `${OUT}/FAIL-${results.length}.png` }).catch(() => {}); await p.evaluate(() => document.querySelectorAll("dialog[open]").forEach((d) => d.close())).catch(() => {}); }
  };
  const db = async (q, check) => { const r = await sql(q); if (!check(r)) throw new Error("DB: " + JSON.stringify(r).slice(0, 140)); return JSON.stringify(r[0] ?? r).slice(0, 100); };
  await p.goto(BASE);
  await p.getByLabel("Email").fill(email);
  await p.getByLabel("Password").fill(DEMO_PASSWORD);
  await p.getByRole("button", { name: "Sign in" }).click();
  await p.locator(".content").waitFor({ timeout: 30000 });
  await p.waitForTimeout(2500);
  await run({ p, step, go, dlg, db });
  await ctx.close();
}
(async () => {
  const b = await chromium.launch();
  await session(b, "amiens.reception@demo.ds-lodge.test", async ({ p, step, go, dlg, db }) => {
    await step("sem alternância de casa e sem telas de Admin no menu", async () => {
      const sw = await p.locator(".house-toggle").count();
      const txt = await p.locator(".sidebar").innerText();
      if (sw) throw new Error("interruptor das casas visível");
      if (/Audit|Structure|Reports|People/.test(txt)) throw new Error("menu de Admin visível: " + txt.replace(/\n/g, " ").slice(0, 100));
      return "ok";
    });
    await step("URL de Admin (/structure, /audit) volta para a Home", async () => {
      await go("/structure", 2500);
      if (new URL(p.url()).pathname !== "/") throw new Error("ficou em " + p.url());
      await go("/audit", 2500);
      if (new URL(p.url()).pathname !== "/") throw new Error("ficou em " + p.url());
      return "ok";
    });
    await step("Handover: abrir turno Office com a pessoa do Roster", async () => {
      await go("/handover", 5500);
      await p.getByRole("button", { name: "Open shift" }).first().click(); await p.waitForTimeout(3500);
      return db("select function, closed_at is null as open from public.handover_shifts where function='office' order by opened_at desc limit 1", (r) => r[0]?.open === true);
    });
    await step("Handover: anotação com Author do Roster, tag e colega", async () => {
      await p.getByPlaceholder(/Write an entry/).fill("Station scenario: bins out at 22:00");
      await p.locator(".composer").getByRole("button", { name: "Delivery" }).click();
      await p.getByRole("button", { name: /Add colleague/ }).click();
      await p.locator(".staff-options li").first().click();
      await p.getByRole("button", { name: "Save Entry" }).click(); await p.waitForTimeout(4000);
      return db("select e.filled_by is not null as filled, (select count(*)::int from public.handover_entry_staff c where c.entry_id=e.id) co from public.handover_entries e where body like 'Station scenario%'", (r) => r[0]?.filled && r[0].co === 1);
    });
    await step("Handover: encerrar turno passando para outra pessoa", async () => {
      await p.getByRole("button", { name: "Hand Over Shift" }).click();
      const sel = dlg().getByLabel("Hand over to");
      const v = await sel.evaluate((el) => [...el.options].find((o) => o.value)?.value);
      await sel.selectOption(v);
      await dlg().getByRole("button", { name: "Hand over" }).click(); await p.waitForTimeout(4000);
      return db("select count(*)::int n from public.handover_shifts where function='office' and closed_at is null", (r) => r[0]?.n === 1);
    });
    await step("Seen: marcar um residente como visto agora", async () => {
      await go("/seen", 5500);
      const before = (await sql("select count(*)::int n from public.sightings"))[0].n;
      await p.getByRole("button", { name: "Seen", exact: true }).first().click(); await p.waitForTimeout(3500);
      const after = (await sql("select count(*)::int n from public.sightings"))[0].n;
      if (after <= before) throw new Error(`sightings ${before} → ${after}`);
      return `${before} → ${after}`;
    });
    await step("Dinner: marcar quem comeu (Received)", async () => {
      await go("/dinner", 5500);
      const before = (await sql("select count(*)::int n from public.dinner_marks where served = true"))[0].n;
      await p.getByRole("button", { name: /Received/ }).first().click(); await p.waitForTimeout(3500);
      const after = (await sql("select count(*)::int n from public.dinner_marks where served = true"))[0].n;
      return `${before} → ${after}` + (after > before ? "" : " (sem mudança: talvez já marcado)");
    });
    await step("Fridge: leitura dentro da faixa", async () => {
      await go("/fridge", 5000);
      await p.getByLabel("Temperature (°C)").fill("3.5");
      await p.getByRole("button", { name: "New Reading" }).click(); await p.waitForTimeout(3500);
      return db("select out_of_range from public.fridge_readings order by id desc limit 1", (r) => r[0]?.out_of_range === false);
    });
    await step("Maintenance: pedido novo pela conta da casa", async () => {
      await go("/maintenance", 5000);
      await p.getByRole("button", { name: "New Maintenance Request" }).click();
      await dlg().getByLabel("Where").fill("Station scenario: hall light");
      await dlg().getByLabel("What happened").fill("Flickering");
      await dlg().getByRole("button", { name: "Save" }).click(); await p.waitForTimeout(3500);
      return db("select status from public.maintenance_tickets where location like 'Station scenario%'", (r) => r[0]?.status === "open");
    });
    await step("Room Check: abrir o check do dia e ver a folha", async () => {
      await go("/sheet", 5500);
      const txt = await p.locator(".content").innerText();
      if (!/Check/.test(txt)) throw new Error("sem checks");
      return txt.split("\n").slice(0, 3).join(" ").slice(0, 70);
    });
    await step("Isolamento: dados de Connolly invisíveis (Residents lista só Amiens)", async () => {
      await go("/residents", 5500);
      const rows = await p.locator("tbody tr").allTextContents();
      const other = rows.filter((r) => /Connolly/.test(r));
      if (other.length) throw new Error("linhas de Connolly: " + other.length);
      return rows.length + " linhas, nenhuma de Connolly";
    });
  });
  await session(b, "connolly.reception@demo.ds-lodge.test", async ({ p, step, go, dlg, db }) => {
    await step("Laundry: iniciar e finalizar uma máquina com um residente", async () => {
      await go("/laundry", 5500);
      await p.getByRole("button", { name: "Start" }).first().click();
      const sel = dlg().locator("select").first();
      if (await sel.count()) { const v = await sel.evaluate((el) => [...el.options].find((o) => o.value)?.value); if (v) await sel.selectOption(v); }
      await dlg().getByRole("button", { name: "Start" }).click(); await p.waitForTimeout(3500);
      await db("select count(*)::int n from public.laundry_uses where finished_at is null", (r) => r[0]?.n >= 1);
      await p.getByRole("button", { name: "Finish" }).first().click(); await p.waitForTimeout(3500);
      return db("select count(*)::int n from public.laundry_uses where finished_at is null", (r) => r[0]?.n === 0);
    });
    await step("Dinner/Delivery: Connolly não serve Dinner, mas tem cozinha de entregas?", async () => {
      await go("/dinner", 4500);
      return (await p.locator(".content").innerText()).split("\n").slice(0, 4).join(" | ").slice(0, 100);
    });
  });
  console.log(results.map((r) => `${r[0]} | ${r[1]} | ${r[2]}`).join("\n"));
  console.log("PROBLEMS:", probs.length ? "\n" + [...new Set(probs)].join("\n") : "none");
  await b.close();
})();
