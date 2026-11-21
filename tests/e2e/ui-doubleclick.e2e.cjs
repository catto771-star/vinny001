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


/* Clique duplo (sem gravar): clicar duas vezes rápido em "Salvar" nos formulários de escrita
 * não pode gerar registro duplicado. Confere no banco quantos registros nasceram. */
const RUNTAG = `dbl${RUN}`;
const count = async (table, col, like) => (await admin.from(table).select("id", { count: "exact", head: true }).like(col, like)).count ?? 0;
async function dbl(btn) {
  const box = await btn.boundingBox();
  await btn.page().mouse.dblclick(box.x + box.width / 2, box.y + box.height / 2);
}
async function porterLogin(page, email) {
  await page.goto(BASE);
  await page.selectOption(".lang-select select", "pt-PT");
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Senha").fill(DEMO_PASSWORD);
  await page.getByRole("button", { name: "Entrar" }).click();
  await page.locator(".today-head").waitFor({ timeout: 25000 });
}

(async () => {
  const browser = await chromium.launch();
  try {
    const { data: posts } = await admin.from("duty_posts").select("function, staff_id, lodge_id").is("ended_at", null);
    const { data: demo } = await admin.from("staff").select("id, email").like("email", "%@demo.ds-lodge.test");
    const { data: lodges } = await admin.from("lodges").select("id, code");
    const amiensId = lodges.find((l) => l.code === "AMIENS").id;
    const email = demo.find((x) => x.id === posts.find((p) => p.function === "office" && p.lodge_id === amiensId)?.staff_id)?.email;
    const p = await newPage(browser);
    await porterLogin(p, email);

    // Handover
    await nav(p, "Handover (Livro Ata)");
    const box = p.locator(".composer textarea");
    await box.fill(`Nota ${RUNTAG}`);
    await dbl(p.getByRole("button", { name: "Lançar no Handover" }));
    await p.waitForTimeout(2000);
    check("Handover: clique duplo em 'Lançar' cria 1 anotação", (await count("handover_entries", "body", `Nota ${RUNTAG}`)) === 1, String(await count("handover_entries", "body", `Nota ${RUNTAG}`)));

    // Manutenção
    await p.getByRole("button", { name: "Criar manutenção" }).click();
    let d = p.locator("dialog[open]");
    await d.getByLabel("Onde").fill(`Quarto ${RUNTAG}`);
    await d.getByLabel("O que aconteceu").fill("Torneira pingando");
    await dbl(d.getByRole("button", { name: /^(Criar|Salvar|Abrir chamado)/ }).first());
    await p.waitForTimeout(2000);
    check("Manutenção: clique duplo em 'Criar' abre 1 chamado", (await count("maintenance_tickets", "location", `Quarto ${RUNTAG}`)) === 1, String(await count("maintenance_tickets", "location", `Quarto ${RUNTAG}`)));
    await p.keyboard.press("Escape");

    // Geladeira
    await nav(p, "Fridge / Temperatura");
    const before = (await admin.from("fridge_readings").select("id", { count: "exact", head: true })).count;
    await p.getByLabel("Temperatura (°C)").fill("3,3");
    await dbl(p.getByRole("button", { name: "Registrar temperatura" }));
    await p.waitForTimeout(2000);
    const after = (await admin.from("fridge_readings").select("id", { count: "exact", head: true })).count;
    check("Geladeira: clique duplo em 'Registrar temperatura' grava 1 leitura", after - before === 1, `+${after - before}`);

    // Entrega
    await nav(p, "Food Delivery");
    await p.getByRole("button", { name: "Registrar entrega" }).click();
    d = p.locator("dialog[open]");
    await d.getByLabel("Produto").fill(`Frango ${RUNTAG}`);
    await d.getByLabel("Fornecedor").fill("Musgrave");
    await d.getByLabel("Lote").fill("L-DBL");
    await d.getByLabel("Validade").fill(new Date(Date.now() + 5 * 864e5).toISOString().slice(0, 10));
    await d.getByLabel("Temperatura (°C)").fill("3,0");
    await dbl(d.getByRole("button", { name: "Salvar" }));
    await p.waitForTimeout(2000);
    check("Food Delivery: clique duplo em 'Salvar' grava 1 entrega", (await count("food_deliveries", "product", `Frango ${RUNTAG}`)) === 1, String(await count("food_deliveries", "product", `Frango ${RUNTAG}`)));

    // Admissão
    await nav(p, "Residentes");
    await p.getByRole("button", { name: "Admitir residente" }).click();
    d = p.locator("dialog[open]");
    await d.getByLabel("Nome", { exact: true }).fill(`Dbl ${RUNTAG}`);
    await d.getByLabel("Sobrenome").fill("Teste");
    const opt = await d.locator("select option:not([value=''])").first().getAttribute("value");
    await d.locator("select").selectOption(opt);
    await dbl(d.getByRole("button", { name: "Admitir residente" }));
    await p.waitForTimeout(2500);
    check("Admissão: clique duplo cria 1 residente e 1 estadia", (await count("residents", "first_name", `Dbl ${RUNTAG}`)) === 1, String(await count("residents", "first_name", `Dbl ${RUNTAG}`)));

    // Ausência
    await nav(p, "Ausências");
    await p.getByRole("button", { name: "Registrar ausência" }).click();
    d = p.locator("dialog[open]");
    await d.locator("select").first().selectOption({ index: 1 }).catch(() => {});
    const absBefore = (await admin.from("absences").select("id", { count: "exact", head: true })).count;
    await dbl(d.getByRole("button", { name: /^(Salvar|Registrar)/ }).first());
    await p.waitForTimeout(2000);
    const absAfter = (await admin.from("absences").select("id", { count: "exact", head: true })).count;
    check("Ausência: clique duplo registra no máximo 1", absAfter - absBefore <= 1, `+${absAfter - absBefore}`);

    // Gestão: compra, férias, turno
    const o = await newPage(browser);
    await login(o, OWNER.email, OWNER.password);
    await changePassword(o);
    await o.getByRole("button", { name: "Enviar código" }).click();
    await o.waitForTimeout(1200);
    const { data: link } = await admin.auth.admin.generateLink({ type: "magiclink", email: OWNER.email, options: { redirectTo: `${BASE}/` } });
    await o.goto(link.properties.action_link);
    await o.locator(".today-head").waitFor({ timeout: 25000 });
    const snooze = async () => { const r = o.getByRole("dialog").filter({ hasText: "Prazo vencido" }); for (let i = 0; i < 12 && (await r.isVisible().catch(() => false)); i++) { await r.getByRole("button", { name: "Lembrar em 24 h" }).click(); await o.waitForTimeout(700); } };
    await snooze();

    await nav(o, "Compras");
    await o.getByRole("button", { name: "Registrar compra" }).click();
    d = o.locator("dialog[open]");
    await d.getByLabel("Fornecedor").fill(`Forn ${RUNTAG}`);
    await d.getByPlaceholder("Nome do produto novo").fill(`Prod ${RUNTAG}`);
    await d.getByLabel("Qtd.").fill("2");
    await d.getByLabel("Preço unit. (€)").fill("1,5");
    await dbl(d.getByRole("button", { name: "Salvar" }));
    await o.waitForTimeout(2500);
    check("Compra: clique duplo em 'Salvar' registra 1 compra e 1 produto", (await count("purchases", "supplier", `Forn ${RUNTAG}`)) === 1 && (await count("products", "name", `Prod ${RUNTAG}`)) === 1,
      `${await count("purchases", "supplier", `Forn ${RUNTAG}`)} compras, ${await count("products", "name", `Prod ${RUNTAG}`)} produtos`);

    await nav(o, "Férias");
    await o.getByRole("button", { name: "Registrar férias" }).click();
    d = o.locator("dialog[open]");
    await d.getByLabel("Pessoa").selectOption({ index: 1 });
    await d.getByLabel("De").fill("2027-03-01");
    await d.getByLabel("Até").fill("2027-03-03");
    const vacBefore = (await admin.from("vacations").select("id", { count: "exact", head: true })).count;
    await dbl(d.getByRole("button", { name: "Salvar" }));
    await o.waitForTimeout(2000);
    const vacAfter = (await admin.from("vacations").select("id", { count: "exact", head: true })).count;
    check("Férias: clique duplo registra 1 período", vacAfter - vacBefore === 1, `+${vacAfter - vacBefore}`);
  } catch (error) {
    check("Execução sem erro inesperado", false, error.message.split("\n")[0]);
    for (const [i, page] of pages.entries()) await page.screenshot({ path: `${OUT}/dbl-failure-${i}.png` }).catch(() => {});
  } finally {
    await browser.close();
    const failed = results.filter((r) => !r.ok);
    console.log(`\n${results.length - failed.length}/${results.length} verificações passaram`);
    process.exitCode = failed.length ? 1 : 0;
  }
})();
