const { chromium } = require("playwright");
const crypto = require("node:crypto");
const { createClient } = require("@supabase/supabase-js");

const BASE = process.env.E2E_BASE_URL ?? "http://localhost:5173";
const OUT = process.env.E2E_OUT ?? ".";
const OWNER = { email: process.env.E2E_OWNER_EMAIL, password: process.env.E2E_OWNER_PASSWORD };
const DEMO_PASSWORD = process.env.DEMO_PASSWORD;
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
  // Chamados vencidos: a gestão é perguntada sobre o status; os testes adiam (vários seguidos).
  void page.addLocatorHandler(page.getByRole("dialog").filter({ hasText: /Prazo vencido|Deadline passed/ }), async (d) => {
    await d.getByRole("button", { name: /^(Lembrar em 24 h|Remind me in 24 h)$/ }).click();
  }, { noWaitAfter: true });
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


/* Capturas de tela para o manual (docs/manual/img): uma imagem por tela, 1366×768, com os dados da demonstração.
 * Variáveis: SHOTS_OUT (pasta), DEMO_PASSWORD, E2E_OWNER_*. Rodar com a demonstração semeada. */
const fs = require("node:fs");
const path = require("node:path");
const SHOTS = process.env.SHOTS_OUT ?? "docs/manual/img";
const proxyCfg = process.env.HTTPS_PROXY ? { server: process.env.HTTPS_PROXY, bypass: "localhost,127.0.0.1" } : undefined;

const PORTER = [
  ["01-hoje", "/"], ["02-tarefas", "/tasks"], ["03-residentes", "/residents"], ["05-folha-do-dia", "/sheet"], ["06-seen", "/seen"],
  ["07-ausencias", "/absences"], ["08-no-shows", "/no-shows"], ["09-warnings", "/warnings"], ["10-mapa-de-camas", "/beds"],
  ["11-handover", "/handover"], ["12-manutencao", "/maintenance"], ["13-fridge", "/fridge"], ["14-food-delivery", "/deliveries"],
  ["15-dinner", "/dinner"], ["16-laundry", "/laundry"], ["17-rota-equipe", "/rota"], ["18-distribuicao", "/distribution"],
];
const MGMT = [
  ["19-notificacoes", "/notifications"], ["20-rota-gestao", "/rota"], ["21-compras", "/purchases"], ["22-horas", "/hours"],
  ["23-ferias", "/vacations"], ["24-relatorios", "/reports"], ["25-usuarios", "/users"], ["26-auditoria", "/audit"], ["27-no-shows-gestao", "/no-shows"],
];

async function settle(page) {
  await page.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});
  await page.waitForTimeout(1400);
  for (let i = 0; i < 12; i++) {
    const d = page.getByRole("dialog").filter({ hasText: /Tarefas esperando por você|Prazo vencido/ });
    if (!(await d.count())) break;
    await d.getByRole("button", { name: /^(Depois|Lembrar em 24 h)$/ }).click({ timeout: 3000 }).catch(() => {});
    await page.waitForTimeout(500);
  }
  await page.waitForTimeout(600);
}

(async () => {
  fs.mkdirSync(SHOTS, { recursive: true });
  const browser = await chromium.launch();
  try {
    // ---- Porter
    let ctx = await browser.newContext({ viewport: { width: 1366, height: 768 }, proxy: proxyCfg, locale: "pt-PT" });
    let page = await ctx.newPage();
    await login(page, "niamh.doyle@demo.ds-lodge.test", DEMO_PASSWORD);
    await page.locator(".content").first().waitFor({ timeout: 30000 });
    for (const [name, route] of PORTER) {
      await page.goto(`${BASE}${route}`);
      await settle(page);
      await page.screenshot({ path: path.join(SHOTS, `${name}.png`) });
      check(`captura ${name}`, true);
    }
    // perfil do residente
    await page.goto(`${BASE}/residents`); await settle(page);
    await page.locator("table tbody tr a").first().click(); await settle(page);
    await page.screenshot({ path: path.join(SHOTS, "04-perfil-residente.png") });
    // diálogo de admissão
    await page.goto(`${BASE}/residents`); await settle(page);
    await page.getByRole("button", { name: "Admitir residente" }).click(); await page.waitForTimeout(900);
    await page.screenshot({ path: path.join(SHOTS, "03b-admitir-residente.png") });
    await page.keyboard.press("Escape");
    // celular
    await ctx.close();
    ctx = await browser.newContext({ viewport: { width: 390, height: 780 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, proxy: proxyCfg, locale: "pt-PT" });
    page = await ctx.newPage();
    await login(page, "niamh.doyle@demo.ds-lodge.test", DEMO_PASSWORD);
    await page.locator(".content").first().waitFor({ timeout: 30000 });
    await settle(page);
    await page.screenshot({ path: path.join(SHOTS, "28-celular-hoje.png") });
    await page.goto(`${BASE}/handover`); await settle(page);
    await page.screenshot({ path: path.join(SHOTS, "28b-celular-handover.png") });
    await ctx.close();

    // ---- Gestão
    ctx = await browser.newContext({ viewport: { width: 1366, height: 768 }, proxy: proxyCfg, locale: "pt-PT" });
    page = await ctx.newPage();
    await login(page, OWNER.email, OWNER.password);
    await changePassword(page);
    await page.getByRole("button", { name: "Enviar código" }).click();
    await page.waitForTimeout(1200);
    const { data: link } = await admin.auth.admin.generateLink({ type: "magiclink", email: OWNER.email, options: { redirectTo: `${BASE}/` } });
    await page.goto(link.properties.action_link);
    await page.locator(".content").first().waitFor({ timeout: 30000 });
    await settle(page);
    for (const [name, route] of MGMT) {
      await page.goto(`${BASE}${route}`);
      await settle(page);
      if (route === "/reports") await page.locator(".report-block").first().waitFor({ timeout: 20000 }).catch(() => {});
      await page.screenshot({ path: path.join(SHOTS, `${name}.png`) });
      check(`captura ${name}`, true);
    }
    await page.goto(`${BASE}/reports`); await settle(page);
    await page.screenshot({ path: path.join(SHOTS, "24b-relatorios-completo.png"), fullPage: true });
  } catch (error) {
    check("capturas sem erro inesperado", false, error.message.split("\n")[0]);
  } finally {
    await browser.close();
    const failed = results.filter((r) => !r.ok);
    console.log(`\n${results.length - failed.length}/${results.length} capturas`);
    process.exitCode = failed.length ? 1 : 0;
  }
})();
