// Cenários de uso de ponta a ponta (Playwright) — base das imagens e dos passos do manual.
// Uso: servir o build (npx vite preview --port 4173) e rodar com a produção/demonstração semeada (node scripts/demo.mjs seed):
//   DEMO_PASSWORD=<senha das contas demo> NODE_USE_ENV_PROXY=1 OUTDIR=./cenarios node tests/e2e/scenarios-admin-people-structure.e2e.cjs
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
  const step = async (name, fn) => {
    cur = name;
    try { const v = await fn(); results.push(["PASS", name, v ?? ""]); }
    catch (e) { results.push(["FAIL", name, String(e.message).split("\n")[0].slice(0, 170)]); await p.screenshot({ path: `${OUT}/FAIL-${results.length}.png` }).catch(() => {}); await p.evaluate(() => document.querySelectorAll("dialog[open]").forEach((d) => d.close())).catch(() => {}); }
  };
  const go = async (path, wait = 3500) => { await p.goto(BASE + path); await p.waitForTimeout(wait); await p.evaluate(() => document.querySelectorAll("dialog[open]").forEach((d) => d.close())); };
  const expectDb = async (q, check) => { const r = await sql(q); if (!check(r)) throw new Error("DB: " + JSON.stringify(r).slice(0, 140)); return JSON.stringify(r[0] ?? r).slice(0, 100); };

  await p.goto(BASE);
  await p.getByLabel("Email").fill("siobhan.murphy@demo.ds-lodge.test");
  await p.getByLabel("Password").fill(DEMO_PASSWORD);
  await p.getByRole("button", { name: "Sign in" }).click();
  await p.locator(".content").waitFor({ timeout: 30000 });
  await p.waitForTimeout(2500);

  // ---------- PESSOAS ----------
  await step("People: criar Staff (Porter/Float) sem casa e sem login", async () => {
    await go("/users");
    await p.getByRole("button", { name: "New User" }).click();
    await dlg().getByLabel("Full name").fill("Scenario Porter");
    await dlg().getByRole("button", { name: "Save" }).click();
    await p.waitForTimeout(3500);
    return expectDb("select role, home_lodge_id is null as no_home, user_id is null as no_login from public.staff where full_name='Scenario Porter'", (r) => r[0]?.role === "porter" && r[0].no_home && r[0].no_login);
  });
  await step("People: criar Cleaner", async () => {
    await p.getByRole("button", { name: "New User" }).click();
    await dlg().getByLabel("Full name").fill("Scenario Cleaner");
    await dlg().locator("select").first().selectOption({ label: "Cleaner" });
    await dlg().getByRole("button", { name: "Save" }).click();
    await p.waitForTimeout(3500);
    return expectDb("select role from public.staff where full_name='Scenario Cleaner'", (r) => r[0]?.role === "cleaner");
  });
  await step("People: criar Manager (conta Admin) mostra a primeira senha", async () => {
    await p.getByRole("button", { name: "New User" }).click();
    await dlg().getByLabel("Full name").fill("Scenario Manager");
    await dlg().locator("select").first().selectOption({ label: "Manager (Admin)" });
    await dlg().getByLabel("Email").fill("scenario.manager@demo.ds-lodge.test");
    await dlg().getByRole("button", { name: "Save" }).click();
    await p.waitForTimeout(4000);
    const txt = await p.locator(".content").innerText();
    if (!/First password/.test(txt)) throw new Error("sem senha provisória na tela: " + txt.slice(0, 80));
    return expectDb("select role, user_id is not null as login from public.staff where full_name='Scenario Manager'", (r) => r[0]?.role === "manager" && r[0].login);
  });
  await step("People: editar nome curto e desativar/reativar", async () => {
    await go("/users");
    const row = p.locator("tr", { hasText: "Scenario Porter" });
    await row.getByRole("button", { name: "Edit" }).click();
    await dlg().getByLabel(/Short name/).fill("Scenny");
    await dlg().getByRole("button", { name: "Save" }).click();
    await p.waitForTimeout(3000);
    await expectDb("select display_name from public.staff where full_name='Scenario Porter'", (r) => r[0]?.display_name === "Scenny");
    await p.locator("tr", { hasText: "Scenario Porter" }).getByRole("button", { name: "Deactivate" }).click();
    await p.waitForTimeout(800);
    const confirm = p.getByRole("button", { name: /Deactivate|Confirm|Yes/ }).last();
    await confirm.click(); await p.waitForTimeout(3000);
    return expectDb("select active from public.staff where full_name='Scenario Porter'", (r) => r[0]?.active === false);
  });

  // ---------- ESTRUTURA ----------
  await step("Structure: criar quarto S1 com 2 camas", async () => {
    await go("/settings?tab=registers");
    await p.getByRole("button", { name: "New Room" }).click();
    await dlg().getByLabel("Room", { exact: true }).fill("S1");
    await dlg().getByLabel("Beds").fill("2");
    await dlg().getByRole("button", { name: "New Room" }).click();
    await p.waitForTimeout(3500);
    return expectDb("select count(*)::int n from public.beds b join public.rooms r on r.id=b.room_id where r.code='S1'", (r) => r[0]?.n === 2);
  });
  await step("Structure: + Bed, remover cama livre", async () => {
    const card = p.locator("article", { hasText: "Room S1" });
    await card.getByRole("button", { name: "Add bed" }).click(); await p.waitForTimeout(2500);
    await card.getByRole("button", { name: "Remove bed 3" }).click(); await p.waitForTimeout(2500);
    return expectDb("select count(*) filter (where b.active)::int a, count(*)::int t from public.beds b join public.rooms r on r.id=b.room_id where r.code='S1'", (r) => r[0]?.a === 2 && r[0].t === 3);
  });
  await step("Structure: geladeira nova, renomear, remover e restaurar", async () => {
    await go("/settings?tab=registers&reg=fridges");
    await p.getByRole("button", { name: "Add fridge" }).click();
    await dlg().getByLabel("Name").fill("Scenario fridge");
    await dlg().getByRole("button", { name: "Add fridge" }).click(); await p.waitForTimeout(3000);
    await p.locator("li", { hasText: "Scenario fridge" }).getByRole("button", { name: "Rename" }).click();
    await dlg().getByLabel("Name").fill("Scenario cold room");
    await dlg().getByRole("button", { name: "Save" }).click(); await p.waitForTimeout(3000);
    await p.getByRole("button", { name: "Remove Scenario cold room" }).click(); await p.waitForTimeout(2500);
    await expectDb("select active from public.fridges where name='Scenario cold room'", (r) => r[0]?.active === false);
    await p.getByRole("button", { name: /Removed \(/ }).click();
    await p.getByRole("button", { name: "Restore Scenario cold room" }).click(); await p.waitForTimeout(2500);
    return expectDb("select active from public.fridges where name='Scenario cold room'", (r) => r[0]?.active === true);
  });
  await step("Structure: máquina de lavar nova e removida", async () => {
    await go("/settings?tab=registers&reg=laundry");
    await p.getByRole("button", { name: "Add machine" }).click();
    await dlg().getByLabel("Name").fill("Scenario washer");
    await dlg().getByRole("button", { name: "Add machine" }).click(); await p.waitForTimeout(3000);
    await p.getByRole("button", { name: "Remove Scenario washer" }).click(); await p.waitForTimeout(2500);
    return expectDb("select active from public.laundry_machines where label='Scenario washer'", (r) => r[0]?.active === false);
  });
  await step("Structure: remover quarto ocupado mostra erro claro", async () => {
    await go("/settings?tab=registers");
    await p.locator("article", { hasText: "Room 1" }).first().getByRole("button", { name: "Remove room" }).click(); await p.waitForTimeout(2500);
    const t = await p.locator(".notice-error").allTextContents();
    if (!t.join(" ").includes("A resident is in this room")) throw new Error("mensagem: " + t.join("|"));
    return t[0];
  });
  await step("Structure: renomear a casa e voltar", async () => {
    await go("/settings?tab=registers&reg=houses");
    const name = p.getByLabel("Name").first();
    await name.fill("Amiens Street House");
    await p.getByRole("button", { name: "Save" }).first().click(); await p.waitForTimeout(3000);
    await expectDb("select name from public.lodges where code='AMIENS'", (r) => r[0]?.name === "Amiens Street House");
    await p.getByLabel("Name").first().fill("Amiens St.");
    await p.getByRole("button", { name: "Save" }).first().click(); await p.waitForTimeout(3000);
    return expectDb("select name from public.lodges where code='AMIENS'", (r) => r[0]?.name === "Amiens St.");
  });

  // ---------- RESIDENTES ----------
  await step("Residents: admitir residente na cama nova do quarto S1", async () => {
    await go("/residents");
    await p.getByRole("button", { name: "Admit Resident" }).click();
    await dlg().getByLabel("PASS ID").fill("SCN" + Date.now().toString(36));
    await dlg().getByLabel("First name").fill("Scenario");
    await dlg().getByLabel("Surname").fill("Resident");
    await dlg().getByLabel("Date of birth").fill("1985-06-15");
    await dlg().getByLabel("Bed").selectOption({ index: 1 });
    await dlg().getByRole("button", { name: "Admit Resident" }).click(); await p.waitForTimeout(4000);
    return expectDb("select s.status from public.stays s join public.residents r on r.id=s.resident_id where r.first_name='Scenario' and r.last_name='Resident'", (r) => r[0]?.status === "active");
  });
  await step("Residents: Warning e Final Warning; desativar o Final Warning com motivo", async () => {
    await go("/warnings");
    await p.getByRole("button", { name: "New Warning" }).click();
    await dlg().locator("input").first().fill("Scenario"); await p.waitForTimeout(800);
    await dlg().getByRole("option").first().click().catch(async () => { await dlg().locator("[role=option], li button").first().click(); });
    await dlg().locator("select").first().selectOption({ label: "Final Warning" }).catch(() => {});
    await dlg().locator("textarea").first().fill("Scenario final warning");
    await dlg().getByRole("button", { name: /Save|Record/ }).last().click(); await p.waitForTimeout(3500);
    await expectDb("select type, active from public.warnings where note='Scenario final warning'", (r) => r[0]?.type === "final_warning" && r[0].active);
    await p.getByRole("button", { name: "Deactivate Final Warning" }).first().click();
    await dlg().locator("textarea, input").last().fill("Scenario reason");
    await dlg().getByRole("button", { name: "Deactivate Final Warning" }).click(); await p.waitForTimeout(3000);
    return expectDb("select active from public.warnings where note='Scenario final warning'", (r) => r[0]?.active === false);
  });

  // ---------- OCORRÊNCIAS / SERVIÇOS ----------
  await step("Maintenance: abrir pedido urgente e marcar como resolvido", async () => {
    await go("/maintenance");
    await p.getByRole("button", { name: "New Maintenance Request" }).click();
    await dlg().getByLabel("Where").fill("Scenario boiler");
    await dlg().getByLabel("What happened").fill("No hot water");
    await dlg().getByRole("button", { name: "Urgent" }).click();
    await dlg().getByRole("button", { name: "Save" }).click(); await p.waitForTimeout(3500);
    await expectDb("select priority, status from public.maintenance_tickets where location='Scenario boiler'", (r) => r[0]?.priority === "urgent" && r[0].status === "open");
    await p.getByText("Scenario boiler").first().click(); await p.waitForTimeout(1200);
    await dlg().getByRole("button", { name: /Mark resolved/ }).click().catch(async () => { await dlg().locator("select").first().selectOption({ label: "Resolved" }); });
    await dlg().getByRole("button", { name: "Update" }).click().catch(() => {}); await p.waitForTimeout(3000);
    return expectDb("select status from public.maintenance_tickets where location='Scenario boiler'", (r) => r[0]?.status === "resolved");
  });
  await step("Fridge: leitura fora da faixa avisa o Manager e gera notificação", async () => {
    await go("/fridge");
    await p.getByLabel("Temperature (°C)").fill("11");
    await p.getByRole("button", { name: "New Reading" }).click(); await p.waitForTimeout(3500);
    const t = await toast();
    await expectDb("select count(*)::int n from public.notifications where kind='fridge_out_of_range' and created_at > now() - interval '3 minutes'", (r) => r[0]?.n >= 1);
    return t;
  });
  await step("Handover: anotação com tag e colega", async () => {
    await go("/handover", 5000);
    await p.getByPlaceholder(/Write an entry/).fill("Scenario: fire alarm test completed");
    await p.locator(".composer").getByRole("button", { name: "Incident / Safety" }).click();
    await p.getByRole("button", { name: /Add colleague/ }).click();
    await p.getByRole("option").first().click();
    await p.getByRole("button", { name: "Save Entry" }).click(); await p.waitForTimeout(4000);
    return expectDb("select (select count(*)::int from public.handover_entry_tags t where t.entry_id=e.id) tags, (select count(*)::int from public.handover_entry_staff c where c.entry_id=e.id) co from public.handover_entries e where body like 'Scenario: fire alarm%'", (r) => r[0]?.tags === 1 && r[0].co === 1);
  });
  await step("Handover: busca em vários dias encontra a anotação", async () => {
    await go("/handover?q=fire%20alarm", 6000);
    const txt = await p.locator(".content").innerText();
    if (!txt.includes("Scenario: fire alarm")) throw new Error("não achou");
    return (await p.getByText(/result\(s\)/).first().textContent()) ?? "";
  });
  await step("Settings: mudar a janela do Room Check para 45 e voltar a 60", async () => {
    await go("/settings?tab=system", 4500);
    await p.getByLabel("Check window (minutes)").fill("45");
    await p.locator("section.system-section", { has: p.getByLabel("Check window (minutes)") }).getByRole("button", { name: "Save" }).click(); await p.waitForTimeout(3500);
    await expectDb("select value from public.parameters where key='presence.check_window_minutes' order by id desc limit 1", (r) => String(r[0]?.value) === "45");
    await p.getByLabel("Check window (minutes)").fill("60");
    await p.locator("section.system-section", { has: p.getByLabel("Check window (minutes)") }).getByRole("button", { name: "Save" }).click(); await p.waitForTimeout(3500);
    return expectDb("select value from public.parameters where key='presence.check_window_minutes' order by id desc limit 1", (r) => String(r[0]?.value) === "60");
  });
  await step("Audit: filtro por módulo Settings mostra a mudança de configuração", async () => {
    await go("/audit?module=settings", 5000);
    const txt = await p.locator(".content").innerText();
    if (!/Setting/.test(txt)) throw new Error("sem evento de Setting");
    return (await p.getByText(/loaded/).first().textContent()) ?? "";
  });
  await step("Notifications: aparece o alerta de geladeira", async () => {
    await go("/notifications", 4500);
    const txt = await p.locator(".content").innerText();
    if (!/°C/.test(txt)) throw new Error("sem alerta");
    return "ok";
  });

  console.log(results.map((r) => `${r[0]} | ${r[1]} | ${r[2]}`).join("\n"));
  console.log("PROBLEMS:", probs.length ? "\n" + [...new Set(probs)].join("\n") : "none");
  await b.close();
})();
