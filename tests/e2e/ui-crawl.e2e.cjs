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


/* Varredura da interface (sem gravar): todas as telas × 3 idiomas × desktop/celular × perfis.
 * Procura erro de console, requisições 4xx/5xx, texto quebrado ("undefined", "NaN", "[object"),
 * rolagem horizontal no celular, telas lentas. Pré-requisito: demo no banco (npm run demo:seed). */
const ROUTES = ["/", "/tasks", "/notifications", "/residents", "/sheet", "/seen", "/absences", "/no-shows", "/warnings", "/beds", "/handover",
  "/maintenance", "/fridge", "/deliveries", "/dinner", "/laundry", "/rota", "/distribution", "/purchases", "/hours", "/vacations", "/reports", "/users", "/audit", "/sheet/print",
  "/residents/not-a-uuid", "/residents/00000000-0000-0000-0000-000000000000", "/nao-existe", "/sheet/print?day=abc&lodge=zzz"];
const PORTER_ROUTES = ROUTES.filter((r) => !["/notifications", "/purchases", "/hours", "/vacations", "/reports", "/users", "/audit"].includes(r));
const findings = new Map();
const note = (kind, where, detail) => {
  const key = `${kind}|${detail}`.slice(0, 220);
  if (!findings.has(key)) findings.set(key, { kind, where: new Set(), detail });
  findings.get(key).where.add(where);
};
let loads = 0;
let ownerChanged = false; // a senha provisória só vale no primeiro acesso

/** No desktop o idioma fica no topo; no celular, no menu "Mais" da barra inferior. */
async function setLocale(page, locale, mobile) {
  if (!mobile) {
    await page.locator(".lang-select select").waitFor({ timeout: 20000 });
    await page.selectOption(".lang-select select", locale);
  } else {
    await page.locator(".bottom-nav").waitFor({ timeout: 20000 });
    await page.locator(".bottom-nav button").last().click();
    const d = page.locator("dialog[open] select").first();
    await d.waitFor({ timeout: 8000 });
    await d.selectOption(locale);
    await page.keyboard.press("Escape");
  }
  await page.waitForTimeout(600);
}

async function crawl(browser, label, email, password, routes, locales, viewports) {
  for (const vp of viewports) {
    const ctx = await browser.newContext({
      viewport: vp.size, deviceScaleFactor: 1, isMobile: vp.mobile, hasTouch: vp.mobile,
      proxy: process.env.HTTPS_PROXY ? { server: process.env.HTTPS_PROXY, bypass: "localhost,127.0.0.1" } : undefined, locale: "pt-PT",
    });
    const page = await ctx.newPage();
    let where = "login";
    page.on("pageerror", (e) => note("pageerror", where, e.message.slice(0, 160)));
    page.on("console", (m) => {
      if (m.type() !== "error") return;
      const t = m.text();
      if (/Failed to load resource/.test(t)) return; // já coberto pelas respostas
      note("console", where, t.slice(0, 160));
    });
    page.on("response", (r) => {
      const u = r.url();
      if ((u.includes("/rest/v1/") || u.includes("/functions/v1/") || u.includes("/auth/v1/")) && r.status() >= 400) {
        note("http" + r.status(), where, u.split("/v1/")[1]?.split("?")[0].slice(0, 80));
      }
    });
    void page.addLocatorHandler(page.getByRole("dialog").filter({ hasText: /Tarefas esperando por você|Tasks waiting for you|Zadania czekają/ }), async () => {
      await page.getByRole("button", { name: /^(Depois|Later|Później)$/ }).click();
    });
    void page.addLocatorHandler(page.getByRole("dialog").filter({ hasText: /Prazo vencido|Deadline passed|Termin minął/ }), async (d) => {
      await d.getByRole("button", { name: /^(Lembrar em 24 h|Remind me in 24 h|Przypomnij za 24 h)$/ }).click();
    }, { noWaitAfter: true });
    await page.goto(BASE);
    await page.selectOption(".lang-select select", "pt-PT");
    await page.getByLabel("E-mail").fill(email);
    await page.getByLabel("Senha").fill(label === "gestão" && ownerChanged ? NEW_PASSWORD : password);
    await page.getByRole("button", { name: "Entrar" }).click();
    if (label === "gestão") {
      if (!ownerChanged) {
        await page.getByText("Escolha uma nova senha").waitFor({ timeout: 15000 });
        await page.getByLabel("Nova senha", { exact: true }).fill(NEW_PASSWORD);
        await page.getByLabel("Repita a nova senha").fill(NEW_PASSWORD);
        await page.getByRole("button", { name: "Salvar" }).click();
        ownerChanged = true;
      }
      await page.getByRole("button", { name: "Enviar código" }).click();
      await page.waitForTimeout(1200);
      const { data: link } = await admin.auth.admin.generateLink({ type: "magiclink", email, options: { redirectTo: `${BASE}/` } });
      await page.goto(link.properties.action_link);
    }
    await page.locator(".today-head").waitFor({ timeout: 25000 });
    where = `${label} ${vp.name}`;
    for (const locale of locales) {
      await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
      await setLocale(page, locale, vp.mobile);
      for (const route of routes) {
        where = `${label} ${vp.name} ${locale} ${route}`;
        const t0 = Date.now();
        await page.goto(`${BASE}${route}`, { waitUntil: "domcontentloaded" });
        await page.locator(route.startsWith("/sheet/print") ? ".print-sheet" : ".content, .page").first().waitFor({ timeout: 20000 }).catch(() => note("sem-conteudo", where, "a tela não apareceu em 20 s"));
        await page.waitForLoadState("networkidle", { timeout: 8000 }).catch(() => {});
        await page.waitForTimeout(700);
        loads++;
        const ms = Date.now() - t0;
        if (ms > 9000) note("lenta", where, `${ms} ms`);
        const text = await page.locator("body").innerText().catch(() => "");
        for (const re of [/\bundefined\b/, /\bNaN\b/, /\[object Object\]/, /\bInvalid Date\b/, /\bnull\b/]) {
          const m = text.match(re);
          if (m) note("texto-quebrado", where, `"${m[0]}" aparece na tela`);
        }
        if (!(await page.locator("body").innerText()).trim()) note("tela-vazia", where, "sem texto");
        if (!route.startsWith("/sheet/print") && !text.includes("DS Lodge") && !(await page.locator(".content").count())) note("sem-layout", where, "sem menu/conteúdo");
        {
          const overflow = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: window.innerWidth }));
          if (overflow.sw > overflow.iw + 1) {
            const wide = await page.evaluate(() => [...document.querySelectorAll("body *")].filter((e) => e.getBoundingClientRect().right > window.innerWidth + 1).slice(0, 3).map((e) => `${e.tagName.toLowerCase()}.${String(e.className).split(" ")[0]}`).join(", "));
            note("rolagem-horizontal", where, `${overflow.sw}px > ${overflow.iw}px (${wide})`);
          }
          if (vp.mobile) {
          const small = await page.evaluate(() => [...document.querySelectorAll("button, a.nav-item, .tab, select, input:not([type=checkbox]):not([type=radio])")].filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && r.height < 32 && getComputedStyle(e).visibility !== "hidden"; }).length);
          if (small > 0) note("alvo-pequeno", where, `${small} controles com menos de 32 px de altura`);
          }
        }
      }
      // volta ao padrão para não deixar o idioma da conta mudado
    }
    await page.goto(`${BASE}/`).catch(() => {});
    await setLocale(page, "pt-PT", vp.mobile).catch(() => {});
    await page.waitForTimeout(500);
    await ctx.close();
  }
}

(async () => {
  const browser = await chromium.launch();
  const DESK = { name: "desktop", size: { width: 1366, height: 768 }, mobile: false };
  const FHD = { name: "fullhd", size: { width: 1920, height: 1080 }, mobile: false };
  const PHONE = { name: "celular", size: { width: 390, height: 844 }, mobile: true };
  try {
    const { data: posts } = await admin.from("duty_posts").select("function, staff_id, lodge_id").is("ended_at", null);
    const { data: demo } = await admin.from("staff").select("id, email").like("email", "%@demo.ds-lodge.test");
    const { data: lodges } = await admin.from("lodges").select("id, code");
    const emailOf = (p) => demo.find((x) => x.id === p?.staff_id)?.email;
    const office = emailOf(posts.find((p) => p.function === "office" && p.lodge_id === lodges.find((l) => l.code === "AMIENS")?.id)) ?? "pedro.almeida@demo.ds-lodge.test";
    const float = emailOf(posts.find((p) => p.function === "float")) ?? "tomasz.nowak@demo.ds-lodge.test";
    const parts = (process.env.CRAWL_PARTS ?? "office,float,gestao").split(",");
    const locs = (process.env.CRAWL_LOCALES ?? "pt-PT,en-IE,pl-PL").split(",");
    if (parts.includes("office")) await crawl(browser, "Office", office, DEMO_PASSWORD, PORTER_ROUTES, locs, [DESK, FHD, PHONE]);
    if (parts.includes("float")) await crawl(browser, "Float", float, DEMO_PASSWORD, PORTER_ROUTES, ["pt-PT"], [PHONE]);
    if (parts.includes("gestao")) await crawl(browser, "gestão", OWNER.email, OWNER.password, ROUTES, locs, [DESK, FHD, PHONE]);
  } catch (error) {
    note("execução", "crawl", error.message.split("\n")[0]);
  } finally {
    await browser.close();
    console.log(`\n${loads} telas carregadas · ${findings.size} achados distintos`);
    for (const f of findings.values()) console.log(`  [${f.kind}] ${f.detail}\n      em ${[...f.where].slice(0, 3).join(" | ")}${f.where.size > 3 ? ` (+${f.where.size - 3})` : ""}`);
    process.exitCode = findings.size ? 1 : 0;
  }
})();
