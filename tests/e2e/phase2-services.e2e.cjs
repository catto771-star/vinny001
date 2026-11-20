/* Teste de ponta a ponta da Fase 2 (Serviços) contra um projeto Supabase real.
 * Mesmos pré-requisitos de phase0.e2e.cjs. Cria dados "[TESTE]".
 * Float (atua nos dois Lodges): geladeira fora da faixa → notificação para a gestão;
 * dentro da faixa → tarefa do turno assinada; entrega de comida; Dinner de ontem → Seen
 * Night; lavanderia de Connolly → anotação no Handover.
 */
const { chromium } = require("playwright");
const crypto = require("node:crypto");
const { createClient } = require("@supabase/supabase-js");

const BASE = process.env.E2E_BASE_URL ?? "http://localhost:5173";
const OUT = process.env.E2E_OUT ?? ".";
const OWNER = { email: process.env.E2E_OWNER_EMAIL, password: process.env.E2E_OWNER_PASSWORD };
const NEW_PASSWORD = `Teste${crypto.randomInt(1e6)}Lodge`;
const RUN = Date.now().toString(36).slice(-5);
const admin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const results = [];
const check = (name, ok, detail = "") => {
  results.push({ name, ok: !!ok });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
};
async function until(fn, timeout = 15000) {
  const end = Date.now() + timeout;
  for (;;) {
    if (await fn().catch(() => false)) return true;
    if (Date.now() > end) return false;
    await new Promise((r) => setTimeout(r, 300));
  }
}
function opDay(d) {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Dublin", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23" }).formatToParts(d).filter((x) => x.type !== "literal").map((x) => [x.type, Number(x.value)]));
  return new Date(Date.UTC(p.year, p.month - 1, p.day - (p.hour < 7 ? 1 : 0))).toISOString().slice(0, 10);
}
const addDays = (day, n) => new Date(Date.parse(day) + n * 86_400_000).toISOString().slice(0, 10);
const pages = [];
async function newPage(browser) {
  const proxy = process.env.HTTPS_PROXY ? { server: process.env.HTTPS_PROXY, bypass: "localhost,127.0.0.1" } : undefined;
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 }, proxy, locale: "pt-PT" });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => console.log("  [pageerror]", e.message));
  // O pop-up de tarefas (s.7) pode abrir a qualquer momento depois de entrar; fecha antes de cada ação.
  void page.addLocatorHandler(page.getByRole("dialog").filter({ hasText: /Tarefas esperando por você|Tasks waiting for you/ }), async () => {
    await page.getByRole("button", { name: /^(Depois|Later)$/ }).click();
  });
  page.on("response", (r) => {
    if (r.url().includes("/rest/v1/") && r.status() >= 400) console.log("  [rest]", r.status(), r.url().split("/rest/v1/")[1]?.slice(0, 80));
  });
  pages.push(page);
  return page;
}
async function login(page, email, password) {
  await page.goto(BASE);
  await page.selectOption(".lang-select select", "pt-PT");
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Senha").fill(password);
  await page.getByRole("button", { name: "Entrar" }).click();
}
async function changePassword(page) {
  await page.getByText("Escolha uma nova senha").waitFor({ timeout: 15000 });
  await page.getByLabel("Nova senha", { exact: true }).fill(NEW_PASSWORD);
  await page.getByLabel("Repita a nova senha").fill(NEW_PASSWORD);
  await page.getByRole("button", { name: "Salvar" }).click();
}
// Fecha o pop-up de tarefas se ele aparecer (pode chegar alguns segundos depois de entrar).
const nav = async (page, name) => {
  await page.locator(".sidebar").getByRole("link", { name: new RegExp(`^${name.replace(/[()/]/g, "\\$&")}( \\d+\\+?)?$`) }).click();
};

async function admit(page, lodgeName, name, at) {
  await nav(page, "Residentes");
  await page.getByRole("button", { name: "Admitir residente" }).click();
  const d = page.locator("dialog[open]");
  await d.getByLabel("Nome", { exact: true }).fill(name);
  const opt = await d.locator(`optgroup[label="${lodgeName}"] option`).first().getAttribute("value");
  await d.locator("select").selectOption(opt);
  await d.getByLabel("Agora").uncheck();
  await d.locator('input[type="datetime-local"]').fill(at);
  await d.getByRole("button", { name: "Admitir residente" }).click();
  await page.getByText("A abertura deste perfil fica registrada.").waitFor({ timeout: 15000 });
}

(async () => {
  const browser = await chromium.launch();
  const yesterday = addDays(opDay(new Date()), -1);
  try {
    const owner = await newPage(browser);
    await login(owner, OWNER.email, OWNER.password);
    await changePassword(owner);
    await owner.getByRole("button", { name: "Enviar código" }).click();
    await owner.waitForTimeout(1200);
    const { data: link } = await admin.auth.admin.generateLink({ type: "magiclink", email: OWNER.email, options: { redirectTo: `${BASE}/` } });
    await owner.goto(link.properties.action_link);
    await owner.locator(".bento-hero").waitFor({ timeout: 20000 });
    await nav(owner, "Usuários");
    await owner.getByRole("button", { name: "Criar usuário" }).click();
    const porter = { name: `[TESTE] Float ${RUN}`, email: `teste.float.${RUN}@ds-lodge.test` };
    await owner.locator("dialog[open]").getByLabel("Nome completo").fill(porter.name);
    await owner.locator("dialog[open]").getByLabel("E-mail").fill(porter.email);
    await owner.locator("dialog[open]").getByRole("button", { name: "Salvar" }).click();
    porter.password = (await owner.locator(".notice", { hasText: porter.name }).locator(".password").textContent({ timeout: 20000 })).trim();

    const p = await newPage(browser);
    await login(p, porter.email, porter.password);
    await changePassword(p);
    await p.getByLabel("Float").check();
    await p.getByRole("button", { name: "Assumir Posto" }).click();
    const takeover = p.getByRole("button", { name: "Confirmar e assumir o posto" });
    await Promise.race([p.locator(".bento-hero").waitFor({ timeout: 15000 }), takeover.waitFor({ timeout: 15000 }).then(() => takeover.click())]);
    await p.locator(".bento-hero").waitFor({ timeout: 15000 });

    // Geladeira: fora da faixa → aviso; dentro → tarefa assinada.
    await nav(p, "Fridge / Temperatura");
    const temp = p.getByLabel("Temperatura (°C)");
    await temp.fill("7,5");
    await p.getByRole("button", { name: "Registrar temperatura" }).click();
    await p.getByText("Fora da faixa — o Manager foi avisado.").waitFor({ timeout: 15000 });
    check("B46: temperatura fora de 0–5 °C avisa na hora", true);
    await temp.fill("3,5");
    await p.getByRole("button", { name: "Registrar temperatura" }).click();
    await p.getByText("Temperatura registrada — tarefa da geladeira assinada.").waitFor({ timeout: 15000 });
    await p.screenshot({ path: `${OUT}/s-fridge.png` });
    await nav(p, "Tarefas do turno");
    const fridgeTask = p.locator(".task-item", { hasText: "Temperatura da geladeira" }).first();
    const signed = await until(async () => (await fridgeTask.getAttribute("class")).includes("is-done"));
    check("Salvar a temperatura assinou a tarefa 'Temperatura da geladeira' do turno", signed);

    // Gestão vê a notificação.
    await owner.reload();
    await owner.locator(".sidebar").waitFor({ timeout: 15000 });
    await nav(owner, "Notificações");
    const notif = await until(async () => (await owner.locator(".notification", { hasText: "Geladeira de Amiens a 7.5 °C" }).count()) >= 1);
    check("Gestão recebe a notificação da geladeira", notif);
    await owner.screenshot({ path: `${OUT}/s-notifications.png` });

    // Food Delivery
    await nav(p, "Food Delivery");
    await p.getByRole("button", { name: "Registrar entrega" }).click();
    const dd = p.locator("dialog[open]");
    await dd.getByLabel("Produto").fill(`[TESTE] Frango ${RUN}`);
    await dd.getByLabel("Fornecedor").fill("Musgrave");
    await dd.getByLabel("Lote").fill("L-2211");
    await dd.getByLabel("Validade").fill(addDays(opDay(new Date()), 1));
    await dd.getByLabel("Temperatura (°C)").fill("6,0");
    await dd.getByRole("button", { name: "Salvar" }).click();
    await p.getByText("Entrega registrada.").waitFor({ timeout: 15000 });
    const listed = await until(async () => (await p.locator("tr", { hasText: `[TESTE] Frango ${RUN}` }).locator(".tag").count()) === 1);
    check("Entrega registrada e validade próxima destacada", listed);

    // Dinner de ontem → Seen Night
    const ana = `[TESTE] Aoife ${RUN}`;
    await admit(p, "Amiens St.", ana, `${addDays(yesterday, -1)}T09:00`);
    await nav(p, "Dinner");
    await p.locator('input[type="date"]').fill(yesterday);
    const group = p.getByRole("group", { name: new RegExp(ana.replace(/[[\]]/g, "\\$&")) });
    await group.waitFor({ timeout: 15000 });
    await group.getByRole("button", { name: "Sim" }).click();
    await p.waitForTimeout(1200);
    await nav(p, "Seen");
    await p.locator('input[type="date"]').fill(yesterday);
    const row = p.locator("table tr", { hasText: ana });
    const seenNight = await until(async () => (await row.textContent()).includes("✓ Dinner"));
    check("Dinner 'Sim' vira Seen Night (origem Dinner)", seenNight, seenNight ? "" : (await row.textContent().catch(() => "")).slice(0, 80));

    // Laundry de Connolly
    const caio = `[TESTE] Caio ${RUN}`;
    await admit(p, "Connolly", caio, `${addDays(yesterday, -1)}T09:00`);
    await nav(p, "Laundry");
    const machine = p.locator(".machine", { hasText: "A · Wash" });
    await machine.waitFor({ timeout: 15000 });
    if (await machine.getByRole("button", { name: "Finalizar" }).count()) {
      await machine.getByRole("button", { name: "Finalizar" }).click();
      await p.getByText("Máquina liberada.").waitFor({ timeout: 15000 });
    }
    await machine.getByRole("button", { name: "Iniciar" }).click();
    const ld = p.locator("dialog[open]");
    const caioOpt = await ld.locator("option", { hasText: caio }).getAttribute("value");
    await ld.locator("select").selectOption(caioOpt);
    await ld.getByRole("button", { name: "Iniciar" }).click();
    await p.getByText("Máquina iniciada — anotada no Handover.").waitFor({ timeout: 15000 });
    const busy = await until(async () => (await machine.textContent()).includes(caio));
    check("Laundry: máquina em uso com o residente", busy);
    await p.screenshot({ path: `${OUT}/s-laundry.png` });
    await machine.getByRole("button", { name: "Finalizar" }).click();
    await p.getByText("Máquina liberada.").waitFor({ timeout: 15000 });
    await nav(p, "Handover (Livro Ata)");
    await p.getByRole("tab", { name: "Connolly" }).click();
    const laundryEntry = await until(async () => (await p.locator(".timeline-item", { hasText: "Laundry — A · Wash" }).filter({ hasText: caio }).count()) === 1);
    check("Iniciar a máquina gerou uma anotação no Handover (finalizar não gera outra)", laundryEntry);
  } catch (error) {
    check("Execução sem erro inesperado", false, error.message.split("\n")[0]);
    for (const [i, page] of pages.entries()) await page.screenshot({ path: `${OUT}/s-failure-${i}.png` }).catch(() => {});
  } finally {
    await browser.close();
    const failed = results.filter((r) => !r.ok);
    console.log(`\n${results.length - failed.length}/${results.length} verificações passaram`);
    process.exitCode = failed.length ? 1 : 0;
  }
})();
