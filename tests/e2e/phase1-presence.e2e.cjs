/* Teste de ponta a ponta da presença (Fase 1) contra um projeto Supabase real.
 * Mesmos pré-requisitos de phase0.e2e.cjs. Cria dados "[TESTE]".
 *
 * Roteiro (com datas relativas, para não depender da hora em que roda):
 *   D = dia passado sorteado (já terminado). Residentes admitidos em D-1.
 *   Office lança os 3 checks de D pelo teclado: Ana vista às 12h; Bia nunca vista.
 *   Seen de D: Ana com Seen Day. No Shows de D: só Bia; confirma → 1/3.
 *   Ausência para Ana; impressão mostra a folha.
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

// Dia operacional de Dublin (07h–07h).
function dublinParts(d) {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Dublin", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23" }).formatToParts(d).filter((x) => x.type !== "literal").map((x) => [x.type, Number(x.value)]));
  return p;
}
function opDay(d) {
  const p = dublinParts(d);
  const base = new Date(Date.UTC(p.year, p.month - 1, p.day - (p.hour < 7 ? 1 : 0)));
  return base.toISOString().slice(0, 10);
}
const addDays = (day, n) => new Date(Date.parse(day) + n * 86_400_000).toISOString().slice(0, 10);

const results = [];
function check(name, ok, detail = "") {
  results.push({ name, ok: !!ok });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

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
  await page.getByLabel(/^(Senha|Password|Hasło)$/).fill(password);
  await page.getByRole("button", { name: /^(Entrar|Sign in|Zaloguj)$/ }).click();
}

async function changePassword(page) {
  await page.getByText("Escolha uma nova senha").waitFor({ timeout: 15000 });
  await page.getByLabel("Nova senha", { exact: true }).fill(NEW_PASSWORD);
  await page.getByLabel("Repita a nova senha").fill(NEW_PASSWORD);
  await page.getByRole("button", { name: "Salvar" }).click();
}

/** Espera uma condição na página (dados chegam de forma assíncrona). */
async function until(fn, timeout = 15000) {
  const end = Date.now() + timeout;
  for (;;) {
    if (await fn().catch(() => false)) return true;
    if (Date.now() > end) return false;
    await new Promise((r) => setTimeout(r, 300));
  }
}

// O nome do link pode incluir a bolinha de pendências ("No Shows 3").
// Fecha o pop-up de tarefas se ele aparecer (pode chegar alguns segundos depois de entrar).
const nav = async (page, name) => {
  await page.locator(".sidebar").getByRole("link", { name: new RegExp(`^${name.replace(/[()]/g, "\\$&")}( \\d+\\+?)?$`) }).click();
};

(async () => {
  const browser = await chromium.launch();
  // Dia sorteado no passado (fev–out/2026): execuções diferentes não usam a mesma folha.
  const D = addDays("2026-02-01", crypto.randomInt(0, 270));
  const admitDay = addDays(D, -1);
  try {
    // Owner: primeiro acesso + segunda etapa pelo link do e-mail; cria um Porter.
    const owner = await newPage(browser);
    await login(owner, OWNER.email, OWNER.password);
    await changePassword(owner);
    await owner.getByRole("button", { name: "Enviar código" }).click();
    await owner.waitForTimeout(1500);
    const { data: link } = await admin.auth.admin.generateLink({ type: "magiclink", email: OWNER.email, options: { redirectTo: `${BASE}/` } });
    await owner.goto(link.properties.action_link);
    await owner.locator(".bento-hero").waitFor({ timeout: 20000 });
    await nav(owner, "Usuários");
    await owner.getByRole("button", { name: "Criar usuário" }).click();
    const porter = { name: `[TESTE] Porter ${RUN}`, email: `teste.porter.p.${RUN}@ds-lodge.test` };
    await owner.locator("dialog[open]").getByLabel("Nome completo").fill(porter.name);
    await owner.locator("dialog[open]").getByLabel("E-mail").fill(porter.email);
    await owner.locator("dialog[open]").getByRole("button", { name: "Salvar" }).click();
    porter.password = (await owner.locator(".notice", { hasText: porter.name }).locator(".password").textContent({ timeout: 20000 })).trim();

    // Porter: Office de Amiens; admite Ana e Bia em D-1 às 08h.
    const p = await newPage(browser);
    await login(p, porter.email, porter.password);
    await changePassword(p);
    await p.getByLabel("Amiens St.").check();
    await p.getByRole("button", { name: "Assumir Posto" }).click();
    const takeover = p.getByRole("button", { name: "Confirmar e assumir o posto" });
    await Promise.race([p.locator(".bento-hero").waitFor({ timeout: 15000 }), takeover.waitFor({ timeout: 15000 }).then(() => takeover.click())]);
    await p.locator(".bento-hero").waitFor({ timeout: 15000 });

    const names = [`[TESTE] Ana ${RUN}`, `[TESTE] Bia ${RUN}`];
    for (const name of names) {
      await nav(p, "Residentes");
      await p.getByRole("button", { name: "Admitir residente" }).click();
      const d = p.locator("dialog[open]");
      await d.getByLabel("Nome", { exact: true }).fill(name);
      await d.locator("select").selectOption({ index: 1 });
      await d.getByLabel("Agora").uncheck();
      await d.locator('input[type="datetime-local"]').fill(`${admitDay}T08:00`);
      await d.getByRole("button", { name: "Admitir residente" }).click();
      await p.getByText("A abertura deste perfil fica registrada.").waitFor({ timeout: 15000 });
    }
    check("Office admite 2 residentes com data e hora de entrada no passado", true);

    // Folha do dia de D: 3 checks pelo teclado.
    await nav(p, "Folha do dia");
    await p.locator('input[type="date"]').fill(D);
    const rowOf = (name) => p.locator(".sheet-table tr", { hasText: name });
    for (const slot of ["12:00", "18:00", "22:00"]) {
      await p.getByRole("tab", { name: new RegExp(`Check ${slot}`) }).click();
      await p.getByRole("button", { name: "Começar a lançar" }).click();
      await rowOf(names[0]).waitFor({ timeout: 15000 });
      // Ana: visto às 12h, não visto depois; Bia: sempre não visto.
      await rowOf(names[0]).click();
      await p.locator(".sheet-table-wrap").press(slot === "12:00" ? "v" : "n");
      await rowOf(names[1]).click();
      await p.locator(".sheet-table-wrap").press("n");
      await p.waitForTimeout(800);
      const progress = await p.locator(".sticky-actions").textContent();
      if (slot === "12:00") await p.screenshot({ path: `${OUT}/p1-sheet.png` });
      const launch = p.getByRole("button", { name: "Lançar check" });
      if (await launch.isDisabled()) {
        // Outros residentes reais/teste no Lodge também precisam ser marcados.
        const pending = p.locator(".sheet-table tr:has(.result-buttons):not(:has(button[aria-pressed='true']))");
        const n = await pending.count();
        for (let i = 0; i < n; i++) await pending.first().getByRole("button", { name: "Não visto" }).click().then(() => p.waitForTimeout(300));
      }
      await launch.click();
      await p.getByText("Check lançado.").waitFor({ timeout: 15000 });
      check(`Check ${slot} lançado pelo teclado`, true, progress.trim().slice(0, 40));
    }
    const allLaunched = await until(async () => (await p.locator('[role="tab"]', { hasText: "lançado" }).count()) >= 3);
    check("Os 3 checks do dia aparecem como lançados", allLaunched);

    // Lançar de novo não duplica.
    await p.getByRole("tab", { name: /Check 12:00/ }).click();
    check("Check lançado não mostra botão de lançar de novo", (await p.getByRole("button", { name: "Lançar check" }).count()) === 0);

    // Seen de D.
    await nav(p, "Seen");
    await p.locator('input[type="date"]').fill(D);
    const anaSeen = p.locator("table tr", { hasText: names[0] });
    await until(async () => (await anaSeen.textContent()).includes("✓"));
    const anaText = await anaSeen.textContent();
    check("Ana tem Seen Day (check) e não tem Seen Night", /✓ check/.test(anaText) && anaText.trim().endsWith("—"), anaText.replace(/\s+/g, " ").slice(-40));
    const biaText = await p.locator("table tr", { hasText: names[1] }).textContent();
    check("Bia sem Seen", !biaText.includes("✓"));

    // No Shows de D.
    await nav(p, "No Shows");
    await p.locator('input[type="date"]').fill(D);
    await p.getByText("Possíveis No Shows").waitFor({ timeout: 15000 });
    await p.waitForTimeout(1000);
    const candText = await p.locator("main").textContent();
    check("Lista final: Bia é possível No Show; Ana não", candText.includes(names[1]) && !candText.split("Possíveis No Shows")[1].split("Confirmados")[0].includes(names[0]));
    // Confirma só a Bia (desmarca outros eventuais residentes de teste).
    for (const box of await p.locator('table input[type="checkbox"]').all()) {
      const label = await box.getAttribute("aria-label");
      if (label !== `${names[1]}`) await box.uncheck();
    }
    await p.getByRole("button", { name: "Confirmar selecionados" }).click();
    await p.getByText("No Shows confirmados.").waitFor({ timeout: 15000 });
    await until(async () => (await p.locator("table tr", { hasText: names[1] }).last().textContent()).includes("1/3"));
    const confirmedRow = await p.locator("table tr", { hasText: names[1] }).last().textContent();
    check("B06: No Show confirmado com contador 1/3", confirmedRow.includes("1/3"), confirmedRow.replace(/\s+/g, " "));
    await p.screenshot({ path: `${OUT}/p1-noshows.png` });

    // Ausência para Ana.
    await nav(p, "Ausências");
    await p.getByRole("button", { name: "Registrar ausência" }).click();
    const ad = p.locator("dialog[open]");
    await ad.locator("select").selectOption({ label: new RegExp(names[0]) }).catch(async () => {
      const opt = await ad.locator("option", { hasText: names[0] }).getAttribute("value");
      await ad.locator("select").selectOption(opt);
    });
    const ret = new Date(Date.now() + 2 * 86_400_000);
    const pad = (n) => String(n).padStart(2, "0");
    const rp = dublinParts(ret);
    await ad.locator('input[type="datetime-local"]').nth(1).fill(`${rp.year}-${pad(rp.month)}-${pad(rp.day)}T12:00`);
    await ad.getByRole("button", { name: "Salvar" }).click();
    await p.getByText("Ausência registrada.").waitFor({ timeout: 15000 });
    check("Ausência comunicada registrada e listada", await until(async () => (await p.locator("table tr", { hasText: names[0] }).count()) > 0));

    // Impressão.
    await nav(p, "Folha do dia");
    const href = await p.locator('a[href*="/sheet/print"]').getAttribute("href");
    await p.addInitScript(() => { window.print = () => {}; });
    await p.goto(`${BASE}${href}`);
    await p.locator(".print-sheet").waitFor({ timeout: 15000 });
    await until(async () => (await p.locator(".print-room").count()) > 0 && (await p.locator(".print-sheet").textContent()).includes(names[0]));
    const printText = await p.locator(".print-sheet").textContent();
    check("Impressão: número da folha, quarto em destaque, residentes atuais e ausência marcada",
      /Folha nº AM-\d{8}/.test(printText) && printText.includes(names[0]) && printText.includes("ausência comunicada") && (await p.locator(".print-room").count()) === 9);
    await p.screenshot({ path: `${OUT}/p1-print.png`, fullPage: true });
  } catch (error) {
    check("Execução sem erro inesperado", false, error.message.split("\n")[0]);
    if (process.env.E2E_VERBOSE) console.log(error.message.slice(0, 1500));
    for (const [i, page] of pages.entries()) await page.screenshot({ path: `${OUT}/p1-failure-${i}.png` }).catch(() => {});
  } finally {
    await browser.close();
    const failed = results.filter((r) => !r.ok);
    console.log(`\n${results.length - failed.length}/${results.length} verificações passaram`);
    process.exitCode = failed.length ? 1 : 0;
  }
})();
