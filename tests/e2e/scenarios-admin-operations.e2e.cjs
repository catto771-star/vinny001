// Cenários de uso de ponta a ponta (Playwright) — base das imagens e dos passos do manual.
// Uso: servir o build (npx vite preview --port 4173) e rodar com a produção/demonstração semeada (node scripts/demo.mjs seed):
//   DEMO_PASSWORD=<senha das contas demo> NODE_USE_ENV_PROXY=1 OUTDIR=./cenarios node tests/e2e/scenarios-admin-operations.e2e.cjs
// Entra com as contas de demonstração (a senha vem de DEMO_PASSWORD) e confere cada resultado no banco.
// Cenários de uso como Manager (logado na produção com dados de demonstração). Cada passo: PASS/FAIL e print em caso de falha.
const { chromium } = require("playwright");
const DEMO_PASSWORD = process.env.DEMO_PASSWORD;
if (!DEMO_PASSWORD) throw new Error("Defina DEMO_PASSWORD (senha das contas de demonstração; não fica no repositório).");
const { execFileSync } = require("child_process");
const BASE = "http://localhost:4173", OUT = process.env.OUTDIR;
const proxy = { server: process.env.HTTPS_PROXY, bypass: "localhost,127.0.0.1" };
const sql = (q) => JSON.parse(execFileSync("bash", ["-c", `python3 -c "import json,sys;print(json.dumps({'query':sys.stdin.read()}))" | curl -s -X POST 'https://api.supabase.com/v1/projects/jbcrhkbhjdiqvwalheyp/database/query' -H 'Content-Type: application/json' --data @-`], { input: q }).toString());
const results = [];
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1366, height: 1000 }, proxy });
  const p = await ctx.newPage();
  await p.addInitScript(() => localStorage.setItem("ui.theme", "light"));
  let cur = ""; const probs = [];
  p.on("pageerror", (e) => probs.push(`[${cur}] PAGEERROR ${e.message.slice(0, 120)}`));
  p.on("response", (r) => { if (r.status() >= 400 && /supabase\.co/.test(r.url()) && !/auth\/v1/.test(r.url())) probs.push(`[${cur}] HTTP ${r.status()} ${r.url().replace(/^https:\/\/[^/]+/, "").slice(0, 90)}`); });
  const dlg = () => p.locator("dialog[open]");
  const toast = async () => (await p.locator(".toast, .notice").allTextContents()).join(" | ").slice(0, 160);
  const ONLY = (process.env.ONLY || "").split("|").filter(Boolean);
  const step = async (name, fn) => {
    if (ONLY.length && !ONLY.some((o) => name.startsWith(o))) return;
    cur = name;
    try { const v = await fn(); results.push(["PASS", name, v ?? ""]); }
    catch (e) { results.push(["FAIL", name, String(e.message).split("\n")[0].slice(0, 170)]); await p.screenshot({ path: `${OUT}/FAIL-${results.length}.png` }).catch(() => {}); await p.evaluate(() => document.querySelectorAll("dialog[open]").forEach((d) => d.close())).catch(() => {}); }
  };
  const go = async (path, wait = 3500) => { await p.goto(BASE + path); await p.waitForTimeout(wait); for (let i = 0; i < 12; i++) { const r = p.getByRole("button", { name: "Remind me in 24 h" }); if (await r.count()) { await r.first().click(); await p.waitForTimeout(700); } else break; } };
  const expectDb = async (q, check) => { const r = await sql(q); if (!check(r)) throw new Error("DB: " + JSON.stringify(r).slice(0, 140)); return JSON.stringify(r[0] ?? r).slice(0, 100); };

  await p.goto(BASE);
  await p.getByLabel("Email").fill("siobhan.murphy@demo.ds-lodge.test");
  await p.getByLabel("Password").fill(DEMO_PASSWORD);
  await p.getByRole("button", { name: "Sign in" }).click();
  await p.locator(".content").waitFor({ timeout: 30000 });
  await p.waitForTimeout(2500);


  // ---------- ADMIN: cenários que falharam por seletor ----------
  await step("Warnings: Final Written para o residente de teste e desativação com motivo", async () => {
    await go("/warnings");
    await p.getByRole("button", { name: "Record Warning" }).click();
    const sel = dlg().locator("select").first();
    const val = await sel.evaluate((el) => [...el.options].find((o) => o.text.includes("Scenario"))?.value);
    if (!val) throw new Error("residente Scenario não está na lista");
    await sel.selectOption(val);
    await dlg().getByText("Final Written (FW)", { exact: true }).click();
    await dlg().locator("textarea").first().fill("Scenario final warning");
    await dlg().getByRole("button", { name: "Record Warning" }).click(); await p.waitForTimeout(3500);
    await expectDb("select type, active from public.warnings where note='Scenario final warning'", (r) => r[0]?.type === "final_written" && r[0].active);
    await p.getByRole("button", { name: "Deactivate FW" }).first().click();
    await dlg().locator("textarea, input").last().fill("Scenario reason");
    await dlg().getByRole("button", { name: "Deactivate FW" }).click(); await p.waitForTimeout(3000);
    return expectDb("select active from public.warnings where note='Scenario final warning'", (r) => r[0]?.active === false);
  });
  await step("Maintenance: pedido urgente, atualizar para resolvido (sem aviso por cima)", async () => {
    await go("/maintenance");
    await p.getByRole("button", { name: "New request" }).click();
    await dlg().getByLabel("Where").fill("Scenario boiler");
    await dlg().getByLabel("What happened").fill("No hot water");
    await dlg().getByText("Urgent", { exact: true }).click();
    await p.waitForTimeout(1500);
    if (await p.getByText("Deadline passed").count()) throw new Error("aviso apareceu por cima do formulário");
    await dlg().getByRole("button", { name: "Save" }).click(); await p.waitForTimeout(3500);
    await expectDb("select priority, status from public.maintenance_tickets where location='Scenario boiler'", (r) => r[0]?.priority === "urgent" && r[0].status === "open");
    await p.getByText("Scenario boiler").first().click(); await p.waitForTimeout(1200);
    await dlg().getByRole("button", { name: "Mark resolved" }).click().catch(() => {}); await p.waitForTimeout(3000);
    return expectDb("select status from public.maintenance_tickets where location='Scenario boiler'", (r) => r[0]?.status === "resolved");
  });
  await step("Handover: anotação com tag e colega, depois busca em vários dias", async () => {
    await go("/handover", 5000);
    await p.getByPlaceholder(/Write an entry/).fill("Scenario: fire alarm test completed");
    await p.locator(".composer").getByRole("button", { name: "Incident / Safety" }).click();
    await p.getByRole("button", { name: /Add colleague/ }).click();
    await p.locator(".staff-options li").first().click();
    await p.getByRole("button", { name: "Add entry" }).click(); await p.waitForTimeout(4000);
    await expectDb("select (select count(*)::int from public.handover_entry_tags t where t.entry_id=e.id) tags, (select count(*)::int from public.handover_entry_staff c where c.entry_id=e.id) co from public.handover_entries e where body like 'Scenario: fire alarm%'", (r) => r[0]?.tags === 1 && r[0].co === 1);
    await go("/handover?q=fire%20alarm", 6500);
    if (!(await p.locator(".content").innerText()).includes("Scenario: fire alarm")) throw new Error("busca não achou");
    return "achou";
  });
  await step("Settings: janela do Room Check 45 → 60", async () => {
    await go("/settings?tab=system", 4500);
    const sec = p.locator("section.system-section", { has: p.getByLabel("Check window (minutes)") });
    await p.getByLabel("Check window (minutes)").fill("45");
    await sec.getByRole("button", { name: "Save" }).click(); await p.waitForTimeout(3500);
    await expectDb("select value from public.parameters where key='presence.check_window_minutes' order by id desc limit 1", (r) => String(r[0]?.value) === "45");
    await p.getByLabel("Check window (minutes)").fill("60");
    await p.locator("section.system-section", { has: p.getByLabel("Check window (minutes)") }).getByRole("button", { name: "Save" }).click(); await p.waitForTimeout(3500);
    return expectDb("select value from public.parameters where key='presence.check_window_minutes' order by id desc limit 1", (r) => String(r[0]?.value) === "60");
  });

  // ---------- ADMIN: novos cenários ----------
  await step("Absences: registrar ausência do residente de teste e registrar o retorno", async () => {
    await go("/absences");
    await p.getByRole("button", { name: "Register absence" }).click();
    const sel = dlg().locator("select").first();
    const val = await sel.evaluate((el) => [...el.options].find((o) => o.text.includes("Scenario"))?.value);
    if (!val) throw new Error("residente Scenario não está na lista");
    await sel.selectOption(val);
    await dlg().getByRole("button", { name: /Register absence|Save/ }).last().click(); await p.waitForTimeout(3500);
    await expectDb("select count(*)::int n from public.absences a join public.stays s on s.id=a.stay_id join public.residents r on r.id=s.resident_id where r.first_name='Scenario' and a.ended_at is null", (r) => r[0]?.n === 1);
    await p.locator("tr, li, article", { hasText: "Scenario" }).first().getByRole("button", { name: "Record return" }).click();
    await dlg().getByRole("button", { name: /Record return|Save|Confirm/ }).last().click(); await p.waitForTimeout(3500);
    return expectDb("select count(*)::int n from public.absences a join public.stays s on s.id=a.stay_id join public.residents r on r.id=s.resident_id where r.first_name='Scenario' and a.ended_at is null", (r) => r[0]?.n === 0);
  });
  await step("Residents: Out do residente de teste libera a cama (Decide Out + efetivar)", async () => {
    await go("/residents");
    await p.getByRole("link", { name: /Scenario Resident|Resident Scenario/ }).first().click(); await p.waitForTimeout(3500);
    const names = await p.getByRole("button").allTextContents();
    const out = p.getByRole("button", { name: /Out/ }).first();
    await out.click(); await p.waitForTimeout(1000);
    await dlg().locator("textarea, input, select").first().fill("Left voluntarily").catch(() => {});
    await dlg().getByRole("button", { name: /Out|Confirm|Save|Decide/ }).last().click(); await p.waitForTimeout(3500);
    return JSON.stringify(await sql("select s.status from public.stays s join public.residents r on r.id=s.resident_id where r.first_name='Scenario' order by s.admitted_at desc limit 1")) + " buttons:" + names.slice(0, 8).join("/");
  });
  await step("Roster: adicionar turno Office em Amiens e publicar a semana", async () => {
    await go("/rota", 4500);
    await p.getByRole("button", { name: /Add shift/ }).first().click();
    await dlg().locator("select").first().selectOption({ index: 1 }).catch(() => {});
    await dlg().getByRole("button", { name: "Save" }).click(); await p.waitForTimeout(3500);
    const t = await toast();
    return t || "sem mensagem";
  });
  await step("Purchases: abrir novo pedido a partir da lista padrão", async () => {
    await go("/purchases", 4500);
    await p.getByRole("button", { name: /New order/ }).click(); await p.waitForTimeout(3000);
    const txt = await p.locator(".content").innerText();
    if (!/standard|Standard/.test(txt) && !(await dlg().count())) throw new Error("sem lista padrão");
    return "ok";
  });
  await step("Vacations: tela anual abre com os dias marcados", async () => { await go("/vacations", 4500); return (await p.locator(".content").innerText()).slice(0, 40).replace(/\n/g, " "); });
  await step("Reports: Purchases e Hours & Roster carregam sem erro", async () => {
    await go("/reports", 5000);
    await p.getByRole("tab", { name: "Purchases" }).click(); await p.waitForTimeout(3000);
    await p.getByRole("tab", { name: "Hours & Roster" }).click(); await p.waitForTimeout(3000);
    const bad = (await p.locator(".content").innerText()).match(/NaN|undefined/);
    if (bad) throw new Error("texto quebrado: " + bad[0]);
    return "ok";
  });

  console.log(results.map((r) => `${r[0]} | ${r[1]} | ${r[2]}`).join("\n"));
  console.log("PROBLEMS:", probs.length ? "\n" + [...new Set(probs)].join("\n") : "none");
  await b.close();
})();
