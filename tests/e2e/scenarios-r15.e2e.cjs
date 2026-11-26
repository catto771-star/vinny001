// Revisão 15 de ponta a ponta (Playwright): fornecedores, New Delivery por fornecedor, entrega do Tesco vinculada ao pedido,
// PASS ID com re-admissão, Cancel Bed / Confirm Cancellation e Bed map com a casa certa. Nomes únicos por execução.
// Uso: DEMO_PASSWORD=... NODE_USE_ENV_PROXY=1 OUTDIR=... node tests/e2e/scenarios-r15.e2e.cjs  (app em :4173, produção semeada)
const { chromium } = require("playwright");
const { execFileSync } = require("child_process");
const PW = process.env.DEMO_PASSWORD; if (!PW) throw new Error("Defina DEMO_PASSWORD");
const BASE = process.env.E2E_BASE_URL ?? "http://localhost:4173", OUT = process.env.OUTDIR ?? ".";
const RUN = Date.now().toString(36).slice(-5);
const proxy = process.env.HTTPS_PROXY ? { server: process.env.HTTPS_PROXY, bypass: "localhost,127.0.0.1" } : undefined;
const sql = (q) => JSON.parse(execFileSync("bash", ["-c", `python3 -c "import json,sys;print(json.dumps({'query':sys.stdin.read()}))" | curl -s -X POST 'https://api.supabase.com/v1/projects/jbcrhkbhjdiqvwalheyp/database/query' -H 'Content-Type: application/json' --data @-`], { input: q, encoding: "utf8" }));
const results = [];
async function session(b, email, run) {
  const ctx = await b.newContext({ viewport: { width: 1366, height: 1000 }, proxy });
  const p = await ctx.newPage();
  await p.addInitScript(() => localStorage.setItem("ui.theme", "light"));
  p.addLocatorHandler(p.getByRole("dialog").filter({ hasText: /Tasks waiting for you/ }), async () => { await p.getByRole("button", { name: /^Later$/ }).click(); });
  p.addLocatorHandler(p.getByRole("dialog").filter({ hasText: /Deadline passed/ }), async (d) => { await d.getByRole("button", { name: /Remind me in 24 h/ }).click(); }, { noWaitAfter: true });
  const dlg = () => p.locator("dialog[open]");
  const go = async (path, wait = 3500) => { await p.goto(BASE + path); await p.waitForTimeout(wait); };
  const step = async (name, fn) => {
    try { const v = await fn(); results.push(["PASS", name, v ?? ""]); }
    catch (e) { results.push(["FAIL", name, String(e.message).split("\n")[0].slice(0, 170)]); await p.screenshot({ path: `${OUT}/R15-FAIL-${results.length}.png` }).catch(() => {}); await p.evaluate(() => document.querySelectorAll("dialog[open]").forEach((d) => d.close())).catch(() => {}); }
  };
  const db = async (q, check) => { const r = await sql(q); if (!check(r)) throw new Error("DB: " + JSON.stringify(r).slice(0, 160)); return JSON.stringify(r[0] ?? r).slice(0, 100); };
  await p.goto(BASE);
  await p.getByLabel("Email").fill(email); await p.getByLabel("Password").fill(PW);
  await p.getByRole("button", { name: "Sign in" }).click();
  await p.locator(".content").waitFor({ timeout: 30000 });
  await p.waitForTimeout(2500);
  await run({ p, step, go, dlg, db });
  await ctx.close();
}
const SUP = `E2E Supplier ${RUN}`, PASS = `E2E${RUN}`;
(async () => {
  const b = await chromium.launch();
  // ---- Admin
  await session(b, "siobhan.murphy@demo.ds-lodge.test", async ({ p, step, go, dlg, db }) => {
    await step("Registers: Settings tem a aba Registers e a tela Structure foi embora do menu", async () => {
      await go("/settings?tab=registers");
      if (!(await p.getByRole("tab", { name: "Registers" }).count())) throw new Error("sem aba Registers");
      const nav = await p.locator(".sidebar").innerText();
      if (/\bStructure\b/.test(nav)) throw new Error("Structure ainda no menu");
      await go("/structure", 2500);
      if (!/tab=registers/.test(p.url())) throw new Error("rota /structure não redireciona: " + p.url());
      return "ok";
    });
    await step("Registers > Suppliers: Tesco e Ripley's cadastrados; criar fornecedor com Batch code obrigatório", async () => {
      await go("/settings?tab=registers&reg=suppliers");
      const txt = await p.locator(".content").innerText();
      if (!/Tesco/.test(txt) || !/Ripley's/.test(txt)) throw new Error("faltam Tesco/Ripley's");
      await p.getByRole("button", { name: "New Supplier" }).click();
      await dlg().getByLabel("Name").fill(SUP);
      await dlg().getByRole("switch", { name: "Batch code" }).click();
      await dlg().getByRole("button", { name: "New Supplier" }).click(); await p.waitForTimeout(2500);
      return db(`select require_batch, require_best_before from public.suppliers where name='${SUP}'`, (r) => r[0]?.require_batch === true && r[0].require_best_before === false);
    });
    await step("Registers > Suppliers: desativar e restaurar", async () => {
      await p.getByRole("button", { name: `Remove ${SUP}` }).click(); await p.waitForTimeout(2500);
      await db(`select active from public.suppliers where name='${SUP}'`, (r) => r[0]?.active === false);
      await p.getByRole("button", { name: /^\d+ removed|removed/i }).first().click().catch(() => {});
      await p.getByRole("button", { name: `Restore ${SUP}` }).click(); await p.waitForTimeout(2500);
      return db(`select active from public.suppliers where name='${SUP}'`, (r) => r[0]?.active === true);
    });
    await step("Settings > System: alerta de Best before (dias) salva", async () => {
      await go("/settings?tab=system");
      const sec = p.locator("section.system-section", { has: p.getByLabel("Best before alert (days ahead)") });
      await sec.getByLabel("Best before alert (days ahead)").fill("4");
      await sec.getByRole("button", { name: "Save" }).click(); await p.waitForTimeout(3000);
      await db("select value from public.parameters where key='delivery.expiry_alert_days' order by valid_from desc limit 1", (r) => String(r[0]?.value) === "4");
      await sec.getByLabel("Best before alert (days ahead)").fill("3");
      await sec.getByRole("button", { name: "Save" }).click(); await p.waitForTimeout(3000);
      return db("select value from public.parameters where key='delivery.expiry_alert_days' order by valid_from desc limit 1", (r) => String(r[0]?.value) === "3");
    });
    await step("Bed map: o seletor da página acompanha a casa do topo", async () => {
      await go("/beds");
      await p.locator(".house-toggle").getByText("Connolly", { exact: true }).click(); await p.waitForTimeout(1500);
      const active = await p.locator(".page-header .tabs [aria-selected=true], .page-header [role=tab][aria-selected=true]").first().innerText();
      await p.locator(".house-toggle").getByText("Amiens", { exact: true }).click(); await p.waitForTimeout(800);
      if (!/Connolly/.test(active)) throw new Error("seletor da página mostra " + active);
      return active;
    });
    await step("Admit Resident (Admin): PASS ID obrigatório", async () => {
      await go("/residents");
      await p.getByRole("button", { name: "Admit Resident" }).click();
      const d = dlg();
      if (!(await d.locator('button[type="submit"]').isDisabled())) throw new Error("admitiu sem PASS ID");
      await d.getByLabel("PASS ID").fill(PASS);
      await d.getByLabel("First name").fill(`E2E${RUN}`);
      await d.getByLabel("Surname").fill("Tester");
      const opt = await d.locator("select option[value]:not([value=''])").first().getAttribute("value");
      await d.locator("select").selectOption(opt);
      await d.locator('button[type="submit"]').click(); await p.waitForTimeout(4500);
      return db(`select count(*)::int n from public.residents where pass_id='${PASS}'`, (r) => r[0]?.n === 1);
    });
  });
  // ---- Conta de casa (Amiens)
  await session(b, "amiens.reception@demo.ds-lodge.test", async ({ p, step, go, dlg, db }) => {
    await step("New Delivery: Ripley's exige Batch code e Best before; Tesco só produto e fornecedor", async () => {
      await go("/deliveries");
      await p.getByRole("button", { name: "New Delivery" }).click();
      const d = dlg();
      const save = d.locator('button[type="submit"]');
      await d.getByLabel("Supplier").selectOption({ label: "Ripley's" });
      await d.getByLabel("Product").fill(`E2E Ham ${RUN}`);
      if (!(await save.isDisabled())) throw new Error("Ripley's deixou salvar sem Batch/Best before");
      await d.getByLabel(/^Batch code/).fill(`B${RUN}`);
      await d.getByLabel(/^Best before/).fill(new Date(Date.now() + 40 * 864e5).toISOString().slice(0, 10));
      if (await save.isDisabled()) throw new Error("não habilitou com tudo preenchido");
      await save.click(); await p.waitForTimeout(3000);
      await db(`select supplier from public.food_deliveries where product='E2E Ham ${RUN}'`, (r) => r[0]?.supplier === "Ripley's");
      await p.getByRole("button", { name: "New Delivery" }).click();
      await dlg().getByLabel("Supplier").selectOption({ label: "Tesco" });
      await dlg().getByLabel("Product").fill(`E2E Tesco ${RUN}`);
      if (await dlg().locator('button[type="submit"]').isDisabled()) throw new Error("Tesco exigiu campos extras");
      await dlg().locator('button[type="submit"]').click(); await p.waitForTimeout(3000);
      return db(`select (select count(*) from public.notifications where kind='delivery_received' and payload->>'product'='E2E Tesco ${RUN}')::int n`, (r) => r[0]?.n === 1);
    });
    await step("Cancel Bed: a conta de casa decide o cancelamento pelo perfil", async () => {
      const r = await sql(`select r.id from public.residents r where r.pass_id='${PASS}'`);
      await go(`/residents/${r[0].id}`);
      await p.getByRole("button", { name: "Cancel Bed" }).click();
      await dlg().locator("textarea, input").last().fill("E2E moving out");
      await dlg().getByRole("button", { name: "Cancel Bed" }).click(); await p.waitForTimeout(3000);
      return db(`select s.status from public.stays s join public.residents r on r.id=s.resident_id where r.pass_id='${PASS}'`, (x) => x[0]?.status === "out_pending");
    });
  });
  // ---- Admin: confirma o cancelamento e re-admite pelo PASS ID; vincula a entrega do Tesco
  await session(b, "siobhan.murphy@demo.ds-lodge.test", async ({ p, step, go, dlg, db }) => {
    await step("Confirm Cancellation: só o Admin efetiva; a cama é liberada", async () => {
      const r = await sql(`select r.id from public.residents r where r.pass_id='${PASS}'`);
      await go(`/residents/${r[0].id}`);
      await p.getByRole("button", { name: "Confirm Cancellation" }).click();
      await dlg().getByRole("button", { name: "Confirm Cancellation" }).click(); await p.waitForTimeout(3500);
      return db(`select s.status from public.stays s join public.residents r on r.id=s.resident_id where r.pass_id='${PASS}'`, (x) => x[0]?.status === "ended");
    });
    await step("Admit Resident com PASS ID de ex-residente: avisa e puxa o cadastro (mesmo residente, nova estadia)", async () => {
      await go("/residents");
      await p.getByRole("button", { name: "Admit Resident" }).click();
      await dlg().getByLabel("PASS ID").fill(PASS);
      await dlg().getByText("A former resident has this PASS ID.").waitFor({ timeout: 8000 });
      await dlg().getByRole("button", { name: "Use former record" }).click();
      const name = await dlg().getByLabel("First name").inputValue();
      if (name !== `E2E${RUN}`) throw new Error("não puxou o cadastro: " + name);
      const opt = await dlg().locator("select option[value]:not([value=''])").first().getAttribute("value");
      await dlg().locator("select").selectOption(opt);
      await dlg().locator('button[type="submit"]').click(); await p.waitForTimeout(4500);
      return db(`select (select count(*) from public.residents where pass_id='${PASS}')::int r, (select count(*) from public.stays s join public.residents x on x.id=s.resident_id where x.pass_id='${PASS}')::int s`, (x) => x[0]?.r === 1 && x[0].s === 2);
    });
    await step("Purchases: pedido Created → Placed → Awaiting; Admin vincula a entrega do Tesco → Delivered + nota no Handover", async () => {
      await go("/purchases", 4500);
      await p.getByRole("button", { name: "New Order" }).click(); await p.waitForTimeout(1500);
      await dlg().getByRole("button", { name: /New Order|Create|Save/ }).last().click(); await p.waitForTimeout(3500);
      await p.getByRole("button", { name: "Mark as placed" }).click(); await p.waitForTimeout(2500);
      await p.getByRole("button", { name: "Mark as Awaiting Delivery" }).click(); await p.waitForTimeout(2500);
      const box = p.getByRole("region", { name: "Tesco deliveries to link" });
      await box.waitFor({ timeout: 8000 });
      await box.locator("li", { hasText: `E2E Tesco ${RUN}` }).getByRole("button", { name: "Link" }).click(); await p.waitForTimeout(3500);
      await db(`select status from public.shop_orders where delivery_id is not null order by delivered_at desc limit 1`, (r) => r[0]?.status === "delivered");
      return db(`select count(*)::int n from public.handover_entries where body like 'Tesco order for % delivered: received by %' and created_at > now() - interval '10 minutes'`, (r) => r[0]?.n >= 1);
    });
  });
  await b.close();
  for (const r of results) console.log(`${r[0]} | ${r[1]} | ${r[2]}`);
  process.exitCode = results.some((r) => r[0] === "FAIL") ? 1 : 0;
})();
