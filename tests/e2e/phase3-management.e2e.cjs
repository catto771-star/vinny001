/* Teste de ponta a ponta da Fase 3 (Gestão) contra um projeto Supabase real.
 * Mesmos pré-requisitos de phase0.e2e.cjs. Cria dados "[TESTE]".
 * Owner registra compra (arredondamento ao centavo); Float aloca sem ver preços e
 * não passa da quantidade comprada; Rota: rascunho invisível à equipe até publicar;
 * Férias em conflito com a Rota avisam; Horas lançadas pela gestão; Relatório
 * mensal: número abre os registros e Connolly não tem bloco Dinner.
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
  const today = opDay(new Date());
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

    // Compras: 3 × 1,335 € = 4,005 → 4,01 €
    const product = `[TESTE] Leite ${RUN}`;
    await nav(owner, "Compras");
    await owner.getByRole("button", { name: "Registrar compra" }).click();
    const pd = owner.locator("dialog[open]");
    await pd.getByLabel("Fornecedor").fill(`[TESTE] Musgrave ${RUN}`);
    await pd.getByPlaceholder("Nome do produto novo").fill(product);
    await pd.getByLabel("Qtd.").fill("3");
    await pd.getByLabel("Preço unit. (€)").fill("1,335");
    await pd.getByRole("button", { name: "Salvar" }).click();
    await owner.getByText("Compra registrada.").waitFor({ timeout: 15000 });
    await owner.getByRole("button", { name: new RegExp(`Musgrave ${RUN}`) }).click();
    const priced = await until(async () => (await owner.locator(".ticket-list").textContent()).includes("4,01"));
    check("Compra: total da linha arredondado ao centavo (4,005 → 4,01 €)", priced);
    await owner.screenshot({ path: `${OUT}/m-purchases.png` });

    // Float: vê Distribuição sem preços; não vê Compras; não passa do comprado.
    const p = await newPage(browser);
    await login(p, porter.email, porter.password);
    await changePassword(p);
    await p.getByLabel("Float").check();
    await p.getByRole("button", { name: "Assumir Posto" }).click();
    const takeover = p.getByRole("button", { name: "Confirmar e assumir o posto" });
    await Promise.race([p.locator(".bento-hero").waitFor({ timeout: 15000 }), takeover.waitFor({ timeout: 15000 }).then(() => takeover.click())]);
    await p.locator(".bento-hero").waitFor({ timeout: 15000 });
    check("Equipe não vê Compras, Horas, Férias nem Relatórios no menu",
      (await p.locator(".sidebar").getByRole("link", { name: /^(Compras|Horas|Férias|Relatórios)/ }).count()) === 0);
    await nav(p, "Distribuição");
    const item = p.locator(".task-item", { hasText: product });
    await item.waitFor({ timeout: 15000 });
    check("Distribuição mostra a compra sem preço", !(await p.locator(".page").textContent()).includes("€"));
    await item.locator("select").selectOption({ label: "Amiens" });
    await item.locator("input").fill("5");
    await item.getByRole("button", { name: "Alocar" }).click();
    await p.getByText("Mais do que a quantidade comprada.").waitFor({ timeout: 15000 });
    check("Alocação acima do comprado é recusada", true);
    await item.locator("input").fill("2");
    await item.getByRole("button", { name: "Alocar" }).click();
    const remaining = await until(async () => (await item.textContent()).includes("1 a alocar"));
    check("Alocação de 2 deixa 1 para alocar", remaining, (await item.textContent().catch(() => "")).slice(0, 120));

    // Rota: turno Night na próxima semana, rascunho → equipe não vê; publicado → vê.
    await nav(owner, "Rota");
    await owner.getByRole("button", { name: "Próxima semana" }).click();
    await owner.locator(".rota-day").first().waitFor({ timeout: 15000 });
    await owner.locator(".rota-day").first().getByRole("button", { name: /Adicionar turno/ }).click();
    const rd = owner.locator("dialog[open]");
    await rd.getByRole("button", { name: /Night 19–07/ }).click();
    await rd.getByLabel("Pessoa").selectOption({ label: porter.name });
    const shiftDay = await rd.locator('input[type="date"]').inputValue();
    await rd.getByRole("button", { name: "Salvar" }).click();
    await owner.getByText("Turno salvo.").waitFor({ timeout: 15000 });
    const draft = owner.locator(".rota-shift.is-draft", { hasText: porter.name });
    check("Turno novo fica como rascunho", await until(async () => (await draft.count()) === 1));
    await owner.screenshot({ path: `${OUT}/m-rota.png` });
    await nav(p, "Rota");
    await p.getByRole("button", { name: "Próxima semana" }).click();
    await p.locator(".rota-day").first().waitFor({ timeout: 15000 });
    await p.waitForTimeout(1500);
    check("Equipe não vê o rascunho", (await p.locator(".rota-shift", { hasText: porter.name }).count()) === 0);
    await owner.getByRole("button", { name: /Publicar semana/ }).click();
    await owner.getByText(/Publicado: \d+ turno/).waitFor({ timeout: 15000 });
    await p.getByRole("button", { name: "Semana anterior" }).click();
    await p.getByRole("button", { name: "Próxima semana" }).click();
    check("Depois de publicar, a equipe vê o turno", await until(async () => (await p.locator(".rota-shift", { hasText: porter.name }).count()) === 1));

    // Férias no dia do turno → conflito.
    await nav(owner, "Férias");
    await owner.getByRole("button", { name: "Registrar férias" }).click();
    const vd = owner.locator("dialog[open]");
    await vd.getByLabel("Pessoa").selectOption({ label: porter.name });
    await vd.getByLabel("De").fill(shiftDay);
    await vd.getByLabel("Até").fill(shiftDay);
    await vd.getByRole("button", { name: "Salvar" }).click();
    const conflict = await until(async () => (await owner.locator(".notice").textContent()).includes("Conflito: 1 turno(s)"));
    check("Férias sobre um turno da Rota avisam o conflito", conflict);

    // Horas: gestão lança 12 h de ontem para o Float.
    await nav(owner, "Horas");
    const row = owner.locator("tr", { hasText: porter.name }).first();
    await row.waitFor({ timeout: 15000 });
    await row.getByRole("button", { name: /Lançar horas/ }).click();
    const hd = owner.locator("dialog[open]");
    await hd.locator('input[type="datetime-local"]').nth(0).fill(`${addDays(today, -1)}T07:00`);
    await hd.locator('input[type="datetime-local"]').nth(1).fill(`${addDays(today, -1)}T19:00`);
    await hd.getByRole("button", { name: "Salvar" }).click();
    await owner.getByText("Horas atualizadas (com histórico).").waitFor({ timeout: 15000 });
    const sameMonth = addDays(today, -1).slice(0, 7) === today.slice(0, 7);
    const hours = !sameMonth || (await until(async () => /12 h 0\d/.test(await owner.locator("tr", { hasText: porter.name }).first().textContent())));
    check("Horas efetivas incluem o lançamento da gestão (12 h)", hours);
    await owner.screenshot({ path: `${OUT}/m-hours.png` });

    // Relatório mensal: admissão do mês aparece nos registros; Connolly sem Dinner.
    const res = `[TESTE] Relatório ${RUN}`;
    await admit(p, "Amiens St.", res, `${today}T07:30`);
    await nav(owner, "Relatórios");
    await owner.getByRole("tab", { name: "Amiens" }).click();
    const adm = owner.locator(".block-occupancy .report-metric", { hasText: "admissões" }).getByRole("button");
    await adm.waitFor({ timeout: 20000 });
    await adm.click();
    const listed = await until(async () => (await owner.locator("dialog[open]").textContent()).includes(res));
    check("Relatório: o número de admissões abre a lista com o residente admitido", listed);
    await owner.screenshot({ path: `${OUT}/m-report-detail.png` });
    await owner.keyboard.press("Escape");
    await owner.getByRole("tab", { name: "Connolly" }).click();
    await owner.locator(".block-laundry").waitFor({ timeout: 20000 });
    check("Relatório de Connolly tem Laundry e não tem Dinner", (await owner.locator(".block-dinner").count()) === 0);
    await owner.screenshot({ path: `${OUT}/m-report.png`, fullPage: true });
  } catch (error) {
    check("Execução sem erro inesperado", false, error.message.split("\n")[0]);
    for (const [i, page] of pages.entries()) await page.screenshot({ path: `${OUT}/m-failure-${i}.png` }).catch(() => {});
  } finally {
    await browser.close();
    const failed = results.filter((r) => !r.ok);
    console.log(`\n${results.length - failed.length}/${results.length} verificações passaram`);
    process.exitCode = failed.length ? 1 : 0;
  }
})();
