/* Gravação de vídeos de demonstração da plataforma (Playwright recordVideo).
 *
 * Um vídeo por área, com 2–3 movimentações de cada fluxo, cursor visível e legendas na tela.
 * Roda sobre os dados de demonstração (npm run demo:seed) e uma conta de gestão de teste.
 * Variáveis: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, DEMO_PASSWORD, E2E_OWNER_EMAIL/PASSWORD,
 * E2E_BASE_URL, REC_OUT (pasta dos vídeos), SCENES=01,02 (filtra), DRY=1 (não grava, só testa o roteiro).
 * Preparos de dados (cenários que dependem do horário) usam a Management API do Supabase.
 */
const { chromium } = require("playwright");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { createClient } = require("@supabase/supabase-js");

const BASE = process.env.E2E_BASE_URL ?? "http://localhost:4173";
const OUT = process.env.REC_OUT ?? "./demo-videos";
const DRY = process.env.DRY === "1";
const ONLY = (process.env.SCENES ?? "").split(",").filter(Boolean);
const OWNER = { email: process.env.E2E_OWNER_EMAIL, password: process.env.E2E_OWNER_PASSWORD };
const DEMO_PASSWORD = process.env.DEMO_PASSWORD;
const NEW_PASSWORD = `Demo${crypto.randomInt(1e6)}Gestao`;
const RUN = process.env.RUN_TAG ?? Date.now().toString(36).slice(-4); // RUN_TAG repete uma rodada (ex.: regravar só uma cena)
console.log(`RUN_TAG=${RUN}`);
const REF = process.env.SUPABASE_PROJECT_REF ?? "jbcrhkbhjdiqvwalheyp";
const admin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const proxy = process.env.HTTPS_PROXY ? { server: process.env.HTTPS_PROXY, bypass: "localhost,127.0.0.1" } : undefined;
const SIZE = { width: 1280, height: 720 };

const results = [];
const check = (name, ok, detail = "") => {
  results.push({ name, ok: !!ok });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
};

async function sql(query) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(process.env.SUPABASE_ACCESS_TOKEN ? { Authorization: `Bearer ${process.env.SUPABASE_ACCESS_TOKEN}` } : {}) },
    body: JSON.stringify({ query }),
  });
  const body = await res.text();
  if (!res.ok) throw new Error(`SQL: ${body.slice(0, 300)}`);
  return JSON.parse(body);
}

const addDays = (day, n) => new Date(Date.parse(day) + n * 86_400_000).toISOString().slice(0, 10);
function opDay(d) {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Dublin", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23" }).formatToParts(d).filter((x) => x.type !== "literal").map((x) => [x.type, Number(x.value)]));
  return new Date(Date.UTC(p.year, p.month - 1, p.day - (p.hour < 7 ? 1 : 0))).toISOString().slice(0, 10);
}
const TODAY = opDay(new Date());
const YESTERDAY = addDays(TODAY, -1);

/* ---------- cursor + legenda dentro da página ---------- */
const OVERLAY = `(() => {
  const make = () => {
    if (document.getElementById("__cur") || !document.documentElement) return;
    const cur = document.createElement("div");
    cur.id = "__cur";
    cur.style.cssText = "position:fixed;z-index:2147483647;left:0;top:0;width:24px;height:24px;pointer-events:none;transform:translate(-60px,-60px);transition:transform 160ms cubic-bezier(.22,1,.36,1)";
    cur.innerHTML = '<svg viewBox="0 0 24 24" width="24" height="24"><path d="M4 2.5l.1 17 4.6-4.1 3.1 6.9 3-1.4-3.1-6.8 6.2-.4z" fill="#171717" stroke="#fff" stroke-width="1.6" stroke-linejoin="round"/></svg>';
    const ring = document.createElement("div");
    ring.id = "__ring";
    ring.style.cssText = "position:fixed;z-index:2147483646;left:0;top:0;width:36px;height:36px;margin:-18px 0 0 -18px;border-radius:50%;border:2px solid #2449a8;pointer-events:none;opacity:0;transform:translate(-60px,-60px) scale(.4)";
    const cap = document.createElement("div");
    cap.id = "__cap";
    cap.style.cssText = "position:fixed;z-index:2147483647;left:50%;top:12px;transform:translate(-50%,-8px);max-width:86vw;padding:10px 18px;border-radius:10px;background:rgba(23,23,23,.94);color:#fff;font:500 16px/1.35 'IBM Plex Sans',system-ui,sans-serif;pointer-events:none;opacity:0;transition:opacity 180ms,transform 180ms;text-align:center";
    document.documentElement.append(ring, cur, cap);
    addEventListener("mousemove", (e) => { cur.style.transform = "translate(" + e.clientX + "px," + e.clientY + "px)"; }, true);
    addEventListener("mousedown", (e) => {
      ring.style.transition = "none"; ring.style.opacity = ".9"; ring.style.transform = "translate(" + e.clientX + "px," + e.clientY + "px) scale(.4)";
      requestAnimationFrame(() => requestAnimationFrame(() => { ring.style.transition = "transform 420ms cubic-bezier(.22,1,.36,1), opacity 420ms"; ring.style.opacity = "0"; ring.style.transform = "translate(" + e.clientX + "px," + e.clientY + "px) scale(1.4)"; }));
    }, true);
    window.__say = (t) => { cap.textContent = t || ""; cap.style.opacity = t ? "1" : "0"; cap.style.transform = t ? "translate(-50%,0)" : "translate(-50%,-8px)"; };
  };
  make();
  document.addEventListener("DOMContentLoaded", make);
})();`;

async function newScene(browser, { name, state, mobile = false, locale = "pt-PT" }) {
  const dir = path.join(OUT, ".raw");
  fs.mkdirSync(dir, { recursive: true });
  const ctx = await browser.newContext({
    viewport: mobile ? { width: 390, height: 780 } : SIZE,
    deviceScaleFactor: 1, isMobile: mobile, hasTouch: mobile, proxy, locale,
    storageState: state, ...(DRY ? {} : { recordVideo: { dir, size: mobile ? { width: 390, height: 780 } : SIZE } }),
  });
  await ctx.addInitScript(OVERLAY);
  const page = await ctx.newPage();
  page.on("pageerror", (e) => console.log("  [pageerror]", e.message.slice(0, 160)));
  page.on("response", (r) => {
    if (/\/rest\/v1\/|\/functions\/v1\//.test(r.url()) && r.status() >= 400) console.log("  [http]", r.status(), r.url().split("/v1/")[1]?.slice(0, 70));
  });
  // Pop-ups que a plataforma abre sozinha: aparecem na gravação e são dispensados depois de um instante.
  void (async () => {
    const rules = [[/Tarefas esperando por você/, "Depois", 1800], [/Prazo vencido/, "Lembrar em 24 h", 1500]];
    while (!page.isClosed()) {
      for (const [re, btn, delay] of rules) {
        try {
          const d = page.getByRole("dialog").filter({ hasText: re });
          if ((await d.count()) && (await d.first().isVisible())) {
            await page.waitForTimeout(delay);
            await d.first().getByRole("button", { name: btn }).click({ timeout: 3000 });
          }
        } catch { /* fechou sozinho ou a página terminou */ }
      }
      await page.waitForTimeout(400).catch(() => {});
    }
  })();
  return { ctx, page, name };
}

/* ---------- ações com ritmo humano ---------- */
function ui(page) {
  const api = {
    say: async (text, ms = 1500) => {
      if (process.env.TRACE) console.log(`  ${new Date().toISOString().slice(11, 19)} ${text.slice(0, 70)}`); await page.evaluate((t) => window.__say && window.__say(t), text); if (ms) await page.waitForTimeout(ms); },
    quiet: () => page.evaluate(() => window.__say && window.__say("")),
    wait: (ms) => page.waitForTimeout(ms),
    glide: async (loc) => {
      await loc.scrollIntoViewIfNeeded();
      const b = await loc.boundingBox();
      if (b) { await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 16 }); await page.waitForTimeout(240); }
    },
    click: async (loc, ms = 800) => { await api.glide(loc); await loc.click(); await page.waitForTimeout(ms); },
    type: async (loc, text, ms = 400) => { await api.glide(loc); await loc.click(); await loc.fill(""); await loc.pressSequentially(text, { delay: 38 }); await page.waitForTimeout(ms); },
    nav: async (name) => {
      const link = page.locator(".sidebar").getByRole("link", { name: new RegExp(`^${name.replace(/[()/]/g, "\\$&")}( \\d+\\+?)?$`) });
      await api.click(link, 1200);
      await page.locator(".content").first().waitFor({ timeout: 15000 });
      await page.waitForLoadState("networkidle", { timeout: 6000 }).catch(() => {});
    },
    dialog: () => page.locator("dialog[open]"),
    toast: async (text) => { await page.getByText(text).first().waitFor({ timeout: 15000 }); await page.waitForTimeout(900); },
    until: async (fn, ms = 15000) => { const end = Date.now() + ms; for (;;) { if (await fn().catch(() => false)) return true; if (Date.now() > end) return false; await page.waitForTimeout(250); } },
  };
  return api;
}

/* ---------- sessões ---------- */
async function login(page, email, password, lang = "Português") {
  await page.goto(BASE);
  await page.selectOption(".lang-select select", "pt-PT");
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Senha").fill(password);
  await page.getByRole("button", { name: "Entrar" }).click();
}
async function saveState(browser, email, password, file, { management = false } = {}) {
  const ctx = await browser.newContext({ viewport: SIZE, proxy, locale: "pt-PT" });
  const page = await ctx.newPage();
  await login(page, email, password);
  if (management) await managementSecondStep(page, email);
  await page.locator(".content").first().waitFor({ timeout: 30000 }); // só a plataforma logada tem .content (o h1 também existe no login)
  await page.waitForTimeout(800);
  await ctx.storageState({ path: file });
  await ctx.close();
}
async function managementSecondStep(page, email) {
  await page.getByRole("button", { name: "Enviar código" }).click();
  await page.waitForTimeout(1200);
  const { data: link } = await admin.auth.admin.generateLink({ type: "magiclink", email, options: { redirectTo: `${BASE}/` } });
  await page.goto(link.properties.action_link);
}

/* ======================================================================== */
const SCENES = [];
const scene = (id, slug, title, role, fn, opts = {}) => SCENES.push({ id, slug, title, role, fn, opts });
const pickFirst = async (select, from = 1) => select.selectOption({ index: from });
const exact = (t) => new RegExp(`^${t.replace(/[()/.]/g, "\\$&")}$`);

/* ---------- 01 · Acesso da gestão ---------- */
scene("01", "acesso-gestao", "Acesso da gestão: senha provisória, troca obrigatória e código por e-mail", "none", async ({ page, u }) => {
  await page.goto(BASE);
  await u.say("A tela de entrada tem seletor de idioma", 1200);
  await u.glide(page.locator(".lang-select select"));
  await page.selectOption(".lang-select select", "pt-PT"); await u.wait(900);
  await u.say("Primeiro acesso da gestão: entra com a senha provisória", 1500);
  await u.type(page.getByLabel("E-mail"), OWNER.email);
  await u.type(page.getByLabel("Senha"), OWNER.password);
  await u.click(page.getByRole("button", { name: "Entrar" }), 1000);
  await page.getByText("Escolha uma nova senha").waitFor({ timeout: 15000 });
  await u.say("A senha provisória precisa ser trocada na hora (10+ caracteres, letras e números)", 2400);
  await u.type(page.getByLabel("Nova senha", { exact: true }), NEW_PASSWORD);
  await u.type(page.getByLabel("Repita a nova senha"), NEW_PASSWORD);
  await u.click(page.getByRole("button", { name: "Salvar" }), 1200);
  await u.say("Gestão tem segunda etapa: um código enviado por e-mail (sem aplicativo autenticador)", 2600);
  await u.click(page.getByRole("button", { name: "Enviar código" }), 1500);
  await u.say("O e-mail traz o código e o link de confirmação (aqui o link é aberto automaticamente)", 2400);
  const { data: link } = await admin.auth.admin.generateLink({ type: "magiclink", email: OWNER.email, options: { redirectTo: `${BASE}/` } });
  await page.goto(link.properties.action_link);
  await page.locator(".today-head").waitFor({ timeout: 25000 });
  check("Acesso: gestão entra com troca de senha e segunda etapa por e-mail", true);
  await u.say("Dentro: a gestão vê o turno de todos os Lodges", 1800);
  await u.say("Chamados com prazo vencido pedem uma decisão assim que a gestão entra", 2200);
  await u.until(async () => !(await page.getByRole("dialog").filter({ hasText: "Prazo vencido" }).isVisible()), 25000);
  await u.say("Idiomas: a interface troca na hora (pt-PT, en-IE, pl-PL)", 1500);
  await u.glide(page.locator(".lang-select select"));
  await page.selectOption(".lang-select select", "en-IE"); await u.wait(1600);
  await page.selectOption(".lang-select select", "pl-PL"); await u.wait(1600);
  await page.selectOption(".lang-select select", "pt-PT"); await u.wait(1400);
  await u.quiet();
}, { stateOut: "owner" });

/* ---------- 02 · Assumir o posto ---------- */
scene("02", "assumir-posto", "Porter assume o posto (Office), troca com quem estava e escolhe o idioma", "none", async ({ page, u, ctxState }) => {
  const niamh = "niall.doyle@demo.ds-lodge.test";
  await page.goto(BASE);
  await page.selectOption(".lang-select select", "pt-PT"); await u.wait(500);
  await u.say("O Porter entra com e-mail e senha (sem segunda etapa)", 1500);
  await u.type(page.getByLabel("E-mail"), niamh);
  await u.type(page.getByLabel("Senha"), DEMO_PASSWORD);
  await u.click(page.getByRole("button", { name: "Entrar" }), 1200);
  await page.getByRole("heading", { name: "Assumir Posto" }).waitFor({ timeout: 25000 });
  await u.say("Antes de registrar qualquer coisa, o Porter assume o posto do turno", 2000);
  await u.click(page.getByLabel("Amiens St."), 900);
  await u.click(page.getByRole("button", { name: "Assumir Posto" }), 1200);
  const takeover = page.getByRole("button", { name: "Confirmar e assumir o posto" });
  if (await takeover.isVisible().catch(() => false) || (await u.until(() => takeover.isVisible(), 4000))) {
    await u.say("O posto já tinha dono: a plataforma mostra quem é e só troca com a sua confirmação", 2600);
    await u.click(takeover, 1500);
  }
  await page.locator(".today-head").waitFor({ timeout: 25000 });
  check("Posto: Porter assume o Office de Amiens (com troca confirmada)", true);
  await u.say("Pronto: o topo mostra o posto assumido e a hora", 1800);
  await u.say("A tela Hoje mostra a régua do dia operacional (07:00 → 07:00), as pendências e o quadro de camas", 2800);
  await page.mouse.wheel(0, 500); await u.wait(1500);
  await page.mouse.wheel(0, -500); await u.wait(900);
  await u.say("Trocar o idioma muda tudo, sem recarregar", 1500);
  await page.selectOption(".lang-select select", "pl-PL"); await u.wait(1700);
  await page.selectOption(".lang-select select", "pt-PT"); await u.wait(1400);
  await u.quiet();
  Object.assign(ctxState, { file: "niamh" });
}, { stateOut: "niamh" });

/* ---------- 03 · Residentes ---------- */
scene("03", "residentes", "Residentes: busca, três admissões, perfil e decisão de Out", "niamh", async ({ page, u }) => {
  await u.nav("Residentes");
  await u.say("Lista de residentes: busca por nome, quarto ou PASS ID", 1600);
  await u.type(page.getByPlaceholder("Nome, quarto ou PASS ID"), "Silva", 1200);
  await u.say("O filtro responde enquanto se digita", 1200);
  await page.getByPlaceholder("Nome, quarto ou PASS ID").fill(""); await u.wait(700);
  const names = [["Nuno", "Carvalho", "1988-03-14", `PASS-${RUN}1`], ["Ewa", "Zielińska", "1992-11-02", `PASS-${RUN}2`], ["Declan", "Murphy", "1975-07-29", ""]];
  for (const [i, [first, last, dob, pass]] of names.entries()) {
    await u.say(`Admissão ${i + 1} de 3: ${first} ${last}`, 1300);
    await u.click(page.getByRole("button", { name: "Admitir residente" }), 900);
    const d = u.dialog();
    await u.type(d.getByLabel("Nome", { exact: true }), `${first} ${RUN}`);
    await u.type(d.getByLabel("Sobrenome"), last);
    await d.locator('input[type="date"]').fill(dob);
    if (pass) await u.type(d.getByLabel("PASS ID"), pass);
    await u.glide(d.locator("select").first());
    await pickFirst(d.locator("select").first(), 1);
    await u.wait(700);
    await u.click(d.getByRole("button", { name: "Admitir residente" }), 700);
    await page.getByText("A abertura deste perfil fica registrada.").waitFor({ timeout: 15000 });
    if (i === 0) await u.say("Ao abrir um perfil, a plataforma registra quem abriu (auditoria)", 2200);
    if (i === 1) {
      await u.say("No perfil: dados, estadias, Warnings e as ações do residente", 2000);
      await u.click(page.getByRole("button", { name: "Decidir Out" }), 900);
      const o = u.dialog();
      await u.type(o.getByLabel("Motivo"), "Mudou-se para a casa da família");
      await u.click(o.getByRole("button", { name: /Decidir Out|Salvar/ }).last(), 1000);
      await u.say("Office/Float decidem o Out; só o Manager ou o Owner efetivam. A cama segue ocupada até lá", 2800);
      await u.click(page.getByRole("button", { name: "Retirar Out" }), 1200);
      await u.say("Dá para retirar o Out antes de efetivar", 1500);
    }
    if (i === 2) {
      await u.click(page.getByRole("button", { name: "Decidir Out" }), 900);
      const o = u.dialog();
      await u.type(o.getByLabel("Motivo"), "Vai morar com a namorada em Cork");
      await u.click(o.getByRole("button", { name: /Decidir Out|Salvar/ }).last(), 1000);
      await u.say("Este Out fica pendente para a gestão efetivar", 1800);
    }
    await u.nav("Residentes");
  }
  check("Residentes: 3 admissões, perfil, Out decidido e retirado", (await admin.from("residents").select("id", { count: "exact", head: true }).like("first_name", `% ${RUN}`)).count === 3);
  await u.quiet();
}, { prep: "beds" });

/* ---------- 04 · Folha do dia ---------- */
scene("04", "folha-do-dia", "Folha do dia (Room Check): lançar o check pelo teclado e imprimir", "niamh", async ({ page, u }) => {
  await u.nav("Folha do dia");
  await u.say("A Folha do dia lista cada cama do Lodge. O check é lançado marcando cada residente", 2400);
  const tabs = await page.getByRole("tab", { name: /Check \d\d:\d\d/ }).allTextContents();
  const due = [];
  for (const t of tabs) if (/por lançar|pendente/i.test(t)) due.push(t.match(/\d\d:\d\d/)[0]);
  let slots = due.length ? due.slice(0, 2) : ["12:00"];
  if (!due.length) {
    await u.say("Ainda não há check vencido hoje: vamos lançar o de anteontem, que ficou pendente", 2200);
    await u.glide(page.locator('input[type="date"]'));
    await page.locator('input[type="date"]').fill(addDays(TODAY, -2));
    await u.wait(1500);
    slots = ["12:00"];
  }
  for (const slot of slots) {
    await u.say(`Check ${slot}`, 1000);
    await u.click(page.getByRole("tab", { name: new RegExp(`Check ${slot}`) }), 900);
    const start = page.getByRole("button", { name: /Começar a lançar|Continuar/ });
    if (await start.count()) await u.click(start.first(), 1200);
    await page.locator(".sheet-table").waitFor({ timeout: 15000 });
    await u.say("V = visto · N = não visto · A = ausência · setas movem a linha. Tudo pelo teclado", 2600);
    await page.locator(".sheet-table tbody tr:has(.result-buttons)").first().click();
    const rows = await page.locator(".sheet-table tbody tr:has(.result-buttons)").count();
    let explained = false;
    for (let i = 0; i < Math.min(rows, 60); i++) {
      const pending = await page.locator(".sheet-table tr:has(.result-buttons):not(:has(button[aria-pressed='true']))").count();
      if (!pending) break;
      await page.keyboard.press(i === 3 ? "n" : "v");
      await page.waitForTimeout(i < 8 ? 380 : 130);
      const ask = page.getByRole("dialog").filter({ hasText: "ausência comunicada" });
      if (await ask.isVisible().catch(() => false)) {
        if (!explained) { await u.say("Quem tem ausência comunicada: a plataforma pergunta antes de tratar como presente", 2600); explained = true; }
        await u.click(ask.getByRole("button", { name: "Não, manter a ausência" }), 600);
      }
    }
    const leftovers = page.locator(".sheet-table tr:has(.result-buttons):not(:has(button[aria-pressed='true']))");
    for (let k = 0, n = await leftovers.count(); k < n; k++) {
      const row = leftovers.first();
      await row.evaluate((el) => el.scrollIntoView({ block: "center" })); // a barra fixa de baixo cobre as últimas linhas
      const absent = row.getByRole("button", { name: "Ausência" });
      if (await absent.isEnabled().catch(() => false)) await absent.click({ timeout: 4000 }).catch(() => {});
      else await row.getByRole("button", { name: "Visto", exact: true }).click({ timeout: 4000 }).catch(() => {});
      await page.waitForTimeout(150);
    }
    await u.say("A barra de baixo mostra o progresso; só lança quando todos estão marcados", 2200);
    await u.click(page.getByRole("button", { name: "Lançar check" }), 700);
    await page.getByText("Check lançado.").waitFor({ timeout: 15000 });
    await u.wait(1200);
  }
  check("Folha do dia: check(s) lançado(s) pelo teclado", true, slots.join(", "));
  await u.say("A folha também sai impressa, para quando o sistema não está acessível", 2200);
  const href = await page.locator('a[href*="/sheet/print"]').first().getAttribute("href");
  await page.goto(`${BASE}${href}`);
  await page.locator(".print-sheet").waitFor({ timeout: 15000 });
  await u.say("Folha impressa: número, quartos, residentes atuais e linhas em branco para admissões", 2800);
  await page.mouse.wheel(0, 700); await u.wait(1400);
  await u.quiet();
}, { prep: "check" });

/* ---------- 05 · Seen e ausências ---------- */
scene("05", "seen-e-ausencias", "Seen manual e ausências comunicadas", "niamh", async ({ page, u }) => {
  await u.nav("Seen");
  await u.say("Seen: de cada residente, se foi visto no turno Day e no turno Night, e por qual origem", 2400);
  for (const [i, place] of ["Recepção", "Cozinha", "Jardim"].entries()) {
    await u.click(page.getByRole("button", { name: "Registrar visto" }), 900);
    const d = u.dialog();
    await u.glide(d.locator("select").first());
    await pickFirst(d.locator("select").first(), 3 + i);
    await u.type(d.getByLabel("Onde"), place);
    await u.click(d.getByRole("button", { name: "Salvar" }), 800);
    await u.toast("Visto registrado.");
    if (i === 0) await u.say("Um visto manual vale como evidência de presença no turno", 2000);
  }
  await u.nav("Ausências");
  await u.say("Ausência comunicada: a cama continua do residente e não haverá No Show no período", 2600);
  for (const [i, note] of ["Consulta no hospital", "Visita à família em Galway"].entries()) {
    await u.click(page.getByRole("button", { name: "Registrar ausência" }), 900);
    const d = u.dialog();
    await u.glide(d.locator("select").first());
    await pickFirst(d.locator("select").first(), 6 + i);
    const dt = d.locator('input[type="datetime-local"]');
    if (await dt.count() >= 2) {
      const iso = (days) => new Date(Date.now() + days * 864e5).toISOString().slice(0, 16);
      await dt.nth(1).fill(iso(2 + i));
    }
    await u.type(d.getByLabel("Observações"), note);
    await u.click(d.getByRole("button", { name: /Salvar|Registrar/ }).last(), 900);
    await u.toast("Ausência registrada.");
  }
  await u.say("Quando o residente volta, registra-se o retorno", 1600);
  await u.click(page.getByRole("button", { name: "Registrar retorno" }).first(), 900);
  await u.click(u.dialog().getByRole("button", { name: "Salvar" }), 900);
  await u.wait(1200);
  check("Seen e ausências: 3 vistos, 2 ausências e 1 retorno", true);
  await u.quiet();
});

/* ---------- 06 · Warnings ---------- */
scene("06", "warnings", "Warnings: verbal, written e Final Written", "niamh", async ({ page, u }) => {
  await u.nav("Warnings");
  await u.say("Warnings não expiram sozinhos e não geram bloqueio automático; cada um vai ao Handover e ao perfil", 2800);
  for (const [i, [type, note]] of [["Verbal", "Fumou dentro do quarto"], ["Written", "Barulho depois das 23h, segunda vez"], ["Final Written (FW)", "Ameaçou outro residente"]].entries()) {
    await u.click(page.getByRole("button", { name: "Registrar Warning" }), 900);
    const d = u.dialog();
    await u.glide(d.locator("select").first());
    await pickFirst(d.locator("select").first(), 10 + i);
    await u.click(d.getByText(type, { exact: false }).first(), 600).catch(() => {});
    await u.type(d.locator("textarea, input[type='text']").last(), note);
    await u.click(d.getByRole("button", { name: /Registrar|Salvar/ }).last(), 900);
    await u.toast("Warning registrado no Handover e no perfil.");
    if (i === 2) await u.say("O Final Warning aparece com marca vermelha (FW) na folha e no mapa de camas", 2600);
  }
  check("Warnings: verbal, written e FW registrados", true);
  await u.quiet();
});

/* ---------- 07 · Handover ---------- */
scene("07", "handover", "Handover: anotações com @menção, frases rápidas, rondas, correção e anulação", "niamh", async ({ page, u }) => {
  await u.nav("Handover (Livro Ata)");
  await u.say("O Handover é o diário oficial do Lodge: tudo o que acontece no turno fica aqui", 2400);
  const box = page.locator(".composer textarea");
  await u.click(box, 300);
  await box.pressSequentially("Conversei com @", { delay: 60 });
  await u.wait(500);
  await u.say("@ marca um residente ou colega", 1400);
  await page.locator(".mention-menu button").first().waitFor({ timeout: 8000 });
  await u.click(page.locator(".mention-menu button").first(), 400);
  await box.pressSequentially(" sobre o horário de silêncio. Combinado reforçar a regra.", { delay: 35 });
  await u.wait(500);
  await u.click(page.getByRole("button", { name: "Lançar no Handover" }), 900);
  await u.toast("Lançado no Handover.");
  await u.say("Frases rápidas poupam digitação", 1500);
  const chip = page.locator(".phrase-chips .chip").first();
  if (await chip.count()) { await u.click(chip, 500); await u.click(page.getByRole("button", { name: "Lançar no Handover" }), 800); await u.toast("Lançado no Handover."); }
  await u.say("Rondas de 2 em 2 horas: um clique registra “Room Check Done”", 2200);
  for (let i = 0; i < 2; i++) {
    const round = page.locator(".round-chip:not([disabled]):not(.is-done)").first();
    if (await round.count()) { await u.click(round, 800); await page.getByText("Ronda registrada no Handover.").first().waitFor({ timeout: 10000 }).catch(() => {}); await u.wait(700); }
  }
  await u.say("Filtros por tipo: anotações, rondas, manutenção, warnings, laundry", 1800);
  for (const tab of ["Anotações", "Rondas", "Tudo"]) { await u.click(page.getByRole("tab", { name: tab }), 900).catch(() => {}); }
  await u.say("Corrigir e anular ficam no histórico, nunca apagam", 1800);
  const mine = page.locator(".timeline-item", { hasText: "horário de silêncio" }).first();
  await mine.hover(); await u.wait(500);
  await u.click(mine.getByRole("button", { name: "Corrigir" }), 800);
  const d = u.dialog();
  await u.type(d.locator("textarea").first(), "Conversei com o residente sobre o horário de silêncio. Combinado reforçar a regra (texto corrigido).");
  await u.click(d.getByRole("button", { name: "Salvar" }), 900);
  await u.wait(1000);
  const mine2 = page.locator(".timeline-item").filter({ hasNotText: "Room Check Done" }).first();
  await mine2.hover(); await u.wait(400);
  await u.click(mine2.getByRole("button", { name: "Anular" }), 800);
  const v = u.dialog();
  await u.type(v.getByLabel("Motivo da anulação"), "Lançada por engano");
  await u.click(v.getByRole("button", { name: "Anular" }).last(), 900);
  await u.wait(1200);
  check("Handover: anotações, rondas, correção e anulação", true);
  await u.quiet();
}, { prep: "rounds" });

/* ---------- 08 · Tarefas e manutenção (Office) ---------- */
scene("08", "tarefas-e-manutencao", "Tarefas do turno e chamados de manutenção", "niamh", async ({ page, u }) => {
  await u.nav("Tarefas do turno");
  await u.say("Tarefas do turno: o modelo de cada Lodge, nos 3 idiomas. Quem assina fica registrado com função e hora", 2800);
  for (let i = 0; i < 3; i++) {
    const sign = page.locator(".task-item:not(.is-done)").first().getByRole("button", { name: "Assinar" });
    if (!(await sign.count())) break;
    await u.click(sign, 700);
    await u.toast("Tarefa assinada.");
  }
  await u.say("Tarefas que ficam sem assinatura não somem: seguem como pendentes e atrasadas", 2400);
  await page.mouse.wheel(0, 600); await u.wait(1400); await page.mouse.wheel(0, -600);
  await u.nav("Manutenção");
  await u.say("Manutenção: qualquer Porter abre um chamado; o Manager é avisado", 2200);
  for (const [i, [place, what, prio]] of [["Quarto 6 — janela", "A janela não fecha direito", "Normal"], ["Cozinha", "Fogão com chama fraca, risco de gás", "Urgente"]].entries()) {
    await u.click(page.getByRole("button", { name: "Novo chamado" }), 900);
    const d = u.dialog();
    await u.type(d.getByLabel("Local"), place);
    await u.type(d.getByLabel("Descrição"), what);
    await u.click(d.getByText(prio, { exact: true }).first(), 600).catch(async () => { await d.getByLabel("Prioridade").selectOption({ label: prio }).catch(() => {}); });
    await u.say(i === 0 ? "O prazo sugerido muda com a prioridade (urgente 24 h, normal 7 dias, baixa 30 dias)" : "Urgente: prazo de 24 horas", 1800);
    await u.click(d.getByRole("button", { name: /Criar|Salvar|Abrir/ }).last(), 900);
    await u.toast("Chamado criado — o Manager foi avisado.");
  }
  check("Tarefas e manutenção: 3 assinaturas e 2 chamados", true);
  await u.quiet();
});

/* ---------- 09 · Cozinha: geladeira, entregas e Dinner ---------- */
scene("09", "cozinha-geladeira-dinner", "Geladeira, Food Delivery e Dinner (Lodge com cozinha)", "niamh", async ({ page, u }) => {
  await u.nav("Fridge / Temperatura");
  await u.say("Só a geladeira é medida: faixa aceitável de 0 a 5 °C. Campo em branco não vale como 0", 2600);
  await u.type(page.getByLabel("Temperatura (°C)"), "3,4");
  await u.click(page.getByRole("button", { name: "Registrar temperatura" }), 800);
  await u.toast("Temperatura registrada — tarefa da geladeira assinada.");
  await u.say("Dentro da faixa: a tarefa “Temperatura da geladeira” do turno é assinada sozinha", 2200);
  await u.type(page.getByLabel("Temperatura (°C)"), "7,2");
  await u.say("Fora da faixa: aviso imediato na tela e notificação para a gestão", 2200);
  await u.type(page.getByLabel("Observação"), "Porta ficou aberta durante a entrega");
  await u.click(page.getByRole("button", { name: "Registrar temperatura" }), 800);
  await u.toast("Fora da faixa — o Manager foi avisado.");
  await u.nav("Food Delivery");
  await u.say("Entregas de fornecedores: produto, lote, validade e temperatura", 2000);
  for (const [i, [prod, forn, lote, dias, temp]] of [["Peito de frango", "Musgrave", "L-2311", 6, "2,5"], ["Iogurte natural", "Pallas Foods", "L-8812", 2, "4,0"]].entries()) {
    await u.click(page.getByRole("button", { name: "Registrar entrega" }), 900);
    const d = u.dialog();
    await u.type(d.getByLabel("Produto"), `${prod} ${RUN}`);
    await u.type(d.getByLabel("Fornecedor"), forn);
    await u.type(d.getByLabel("Lote"), lote);
    await d.getByLabel("Validade").fill(addDays(TODAY, dias));
    await u.type(d.getByLabel("Temperatura (°C)"), temp);
    await u.click(d.getByRole("button", { name: "Salvar" }), 800);
    await u.toast("Entrega registrada.");
    if (i === 1) await u.say("Validade próxima fica destacada (“vence logo”)", 2000);
  }
  await u.nav("Dinner");
  await u.say("Dinner (18h–22h): “Sim” vale como Seen Night. Aqui, o jantar de ontem", 2400);
  await page.locator('input[type="date"]').fill(YESTERDAY); await u.wait(1500);
  const groups = page.getByRole("group");
  for (let i = 0; i < 3; i++) {
    const g = groups.nth(i + 2);
    await u.click(g.getByRole("button", { name: i === 2 ? "Não" : "Sim" }), 600);
  }
  check("Cozinha: geladeira (normal e fora da faixa), 2 entregas e marcas do Dinner", true);
  await u.quiet();
}, { prep: "none" });

/* ---------- 10 · Laundry (Connolly) ---------- */
scene("10", "laundry", "Laundry: iniciar e finalizar máquinas (Lodge com lavanderia)", "connolly", async ({ page, u }) => {
  await u.nav("Laundry");
  await u.say("Quatro máquinas, sem reservas. Iniciar anota no Handover; finalizar libera a máquina", 2600);
  for (let i = 0; i < 2; i++) {
    const free = page.locator(".machine").filter({ has: page.getByRole("button", { name: "Iniciar" }) }).first();
    if (!(await free.count())) break;
    await u.click(free.getByRole("button", { name: "Iniciar" }), 900);
    const d = u.dialog();
    await u.glide(d.locator("select"));
    await pickFirst(d.locator("select"), 2 + i);
    await u.click(d.getByRole("button", { name: "Iniciar" }), 800);
    await u.toast("Máquina iniciada — anotada no Handover.");
  }
  await u.say("Uma máquina em uso mostra o residente e a hora de início", 2000);
  for (let i = 0; i < 2; i++) {
    const busy = page.locator(".machine").filter({ has: page.getByRole("button", { name: "Finalizar" }) }).first();
    if (!(await busy.count())) break;
    await u.click(busy.getByRole("button", { name: "Finalizar" }), 800);
    await u.toast("Máquina liberada.");
  }
  await u.nav("Handover (Livro Ata)");
  await u.say("O uso das máquinas aparece no Handover (finalizar não gera outra linha)", 2400);
  await page.getByRole("tab", { name: "Laundry" }).click().catch(() => {}); await u.wait(1500);
  check("Laundry: 2 máquinas iniciadas e liberadas", true);
  await u.quiet();
}, { prep: "laundry" });

/* ---------- 11 · Gestão: presença ---------- */
scene("11", "gestao-presenca", "Gestão: No Shows, desativar FW, transferência e efetivar Out", "owner", async ({ page, u }) => {
  await u.nav("No Shows");
  await u.say("Lista final do dia que terminou: quem não tem nenhuma evidência de presença", 2600);
  await u.say("Só confirma quando todos os checks do dia estão lançados", 2000);
  const boxes = page.locator('table input[type="checkbox"]');
  const n = await boxes.count();
  for (let i = 0; i < Math.min(2, n); i++) await u.click(boxes.nth(i), 500);
  await u.say("O contador mostra quantos No Shows o residente já tem no mês (3 = aviso e Out)", 2400);
  if (n) {
    await u.click(page.getByRole("button", { name: "Confirmar selecionados" }), 900);
    await u.toast("No Shows confirmados.");
    await u.say("Desfazer exige motivo e fica no histórico", 1800);
    const undo = page.getByRole("button", { name: "Desfazer" }).first();
    if (await undo.count()) {
      await u.click(undo, 800);
      const d = u.dialog();
      await u.type(d.getByLabel("Motivo"), "Estava internado, apresentou o comprovante na recepção");
      await u.click(d.getByRole("button", { name: /Desfazer|Salvar/ }).last(), 900);
      await u.wait(1200);
    }
  } else await u.say("Hoje ninguém ficou sem evidência", 1800);
  await u.nav("Warnings");
  await u.say("Só a gestão desativa um Final Warning, sempre com motivo", 2400);
  const off = page.getByRole("button", { name: "Desativar FW" }).first();
  if (await off.count()) {
    await u.click(off, 900);
    const d = u.dialog();
    await u.type(d.getByLabel("Motivo"), "Comportamento melhorou, combinado na reunião");
    await u.click(d.getByRole("button", { name: "Desativar FW" }).last(), 900);
    await u.toast("FW desativado.");
  }
  await u.nav("Residentes");
  await u.say("Perfil do residente: transferir de cama ou efetivar o Out decidido pelo Office", 2400);
  await u.type(page.getByPlaceholder("Nome, quarto ou PASS ID"), RUN, 1000);
  const rows = page.locator("table tbody tr a");
  await u.click(rows.first(), 1200);
  const tr = page.getByRole("button", { name: "Transferir" });
  if (await tr.count()) {
    await u.click(tr, 900);
    const d = u.dialog();
    await u.glide(d.locator("select").first());
    await pickFirst(d.locator("select").first(), 1);
    await u.click(d.getByRole("button", { name: /Transferir|Salvar/ }).last(), 900);
    await u.wait(1500);
    await u.say("Transferência encerra a estadia antiga e abre a nova, sem perder o histórico", 2200);
  }
  await u.nav("Residentes");
  await u.type(page.getByPlaceholder("Nome, quarto ou PASS ID"), `Declan ${RUN}`, 1000);
  await u.click(page.locator("table tbody tr a").first(), 1200);
  const eff = page.getByRole("button", { name: "Efetivar Out" });
  if (await eff.count()) {
    await u.click(eff, 900);
    await u.click(u.dialog().getByRole("button", { name: /Efetivar|Salvar/ }).last(), 900);
    await u.say("Out efetivado: a estadia é encerrada e a cama fica livre; o cadastro é mantido", 2400);
  }
  await u.nav("Mapa de camas");
  await u.say("Mapa de camas: marcar uma cama fora de uso (e voltar ao uso)", 2000);
  const free = page.locator(".bed-free").first();
  await u.click(free, 900);
  const d = u.dialog();
  await u.type(d.getByLabel("Observação"), "Cabeceira quebrada — aguardando troca");
  await u.click(d.getByRole("button", { name: "Marcar fora de uso" }), 900);
  await u.wait(1000);
  await u.click(page.locator(".bed-oos").first(), 900);
  await u.click(u.dialog().getByRole("button", { name: "Voltar ao uso" }), 900);
  await u.wait(900);
  check("Gestão da presença: No Shows, FW, transferência, Out e cama fora de uso", true);
  await u.quiet();
}, { prep: "noshow" });

/* ---------- 12 · Gestão: tarefas, manutenção, notificações ---------- */
scene("12", "gestao-manutencao", "Gestão: tarefas extras, status dos chamados e notificações", "owner", async ({ page, u }) => {
  await u.nav("Tarefas do turno");
  await u.say("A gestão cria tarefas extras para um turno (para uma pessoa ou para o turno todo)", 2400);
  for (const [i, title] of ["Conferir extintores do corredor", "Contar o estoque de roupa de cama"].entries()) {
    await u.click(page.getByRole("button", { name: "Tarefa extra" }), 900);
    const d = u.dialog();
    await u.type(d.getByLabel("Tarefa"), title);
    await u.click(d.getByRole("button", { name: /Criar|Salvar/ }).last(), 900);
    await u.toast("Tarefa criada.");
  }
  await u.nav("Manutenção");
  await u.say("A gestão muda o status; cada mudança fica no histórico do chamado", 2400);
  for (const [i, [status, done]] of [["Em andamento", "Técnico chamado para amanhã às 9h"], ["Resolvido", "Troca feita e testada"]].entries()) {
    await u.click(page.locator(".ticket").nth(i), 1000);
    const d = u.dialog();
    await d.getByLabel("Status").selectOption({ label: status }).catch(() => {});
    await u.type(d.getByLabel("O que foi feito"), done);
    await u.click(d.getByRole("button", { name: "Atualizar" }), 900);
    await u.toast("Chamado atualizado.");
  }
  await u.say("Abas: em aberto e resolvidos", 1400);
  await u.click(page.getByRole("tab", { name: "Resolvidos" }), 1400);
  await u.click(page.getByRole("tab", { name: "Em aberto" }), 900);
  await u.nav("Notificações");
  await u.say("Notificações da gestão: geladeira fora da faixa, chamados novos, 3º No Show, Rota e férias", 2800);
  for (let i = 0; i < 2; i++) {
    const read = page.getByRole("button", { name: "Marcar como lida" }).first();
    if (await read.count()) await u.click(read, 800);
  }
  await u.say("Marcar como lida não resolve o item", 1800);
  check("Gestão: 2 tarefas extras, 2 chamados atualizados, notificações lidas", true);
  await u.quiet();
});

/* ---------- 13 · Gestão: Rota, férias e horas ---------- */
scene("13", "gestao-rota-ferias-horas", "Gestão: Rota semanal, férias com conflito e horas", "owner", async ({ page, u }) => {
  await u.nav("Rota");
  await u.say("Rota: a semana em colunas. Buracos de cobertura aparecem em vermelho", 2600);
  await u.click(page.getByRole("button", { name: "Próxima semana" }), 1200);
  // Preenche os buracos de cobertura (em vermelho): a função e o Lodge vêm do próprio buraco.
  for (let i = 0; i < 2; i++) {
    const gap = page.locator(".rota-gap").first();
    if (!(await gap.count())) break;
    const text = (await gap.textContent()) ?? "";
    await u.say(`Buraco: ${text.replace(/\s+/g, " ").trim()}`, 1800);
    await u.click(page.locator(".rota-day:has(.rota-gap)").first().getByRole("button", { name: /Adicionar turno/ }), 900);
    const d = u.dialog();
    if (/Float/.test(text)) await u.click(d.getByRole("button", { name: "Float", exact: true }), 600);
    else {
      await u.click(d.getByRole("button", { name: /Night 19–07|Day 07–19/ }).filter({ hasText: /Night/.test(text) ? "Night" : "Day" }), 600);
      await d.getByLabel("Lodge").selectOption({ label: /Connolly/.test(text) ? "Connolly" : "Amiens St." });
    }
    const n = await d.getByLabel("Pessoa").locator("option").count();
    let saved = false;
    for (let k = 1; k < n && !saved; k++) {
      await u.glide(d.getByLabel("Pessoa"));
      await d.getByLabel("Pessoa").selectOption({ index: k });
      await u.wait(400);
      await u.click(d.getByRole("button", { name: "Salvar" }), 600);
      saved = await page.getByText("Turno salvo.").first().isVisible().catch(() => false) || (await u.until(() => page.getByText("Turno salvo.").first().isVisible(), 2500));
      if (!saved) await u.say("Quem já tem turno nesse horário é recusado, com a razão", 1800);
    }
    if (!saved) throw new Error("nenhuma pessoa livre para o buraco da Rota");
    await u.wait(900);
  }
  await u.say("Turno novo é rascunho: a equipe só vê o que a gestão publicar", 2400);
  const pub = page.getByRole("button", { name: /Publicar semana/ });
  if (await pub.isEnabled()) { await u.click(pub, 900); await page.getByText(/Publicado: \d+ turno/).waitFor({ timeout: 15000 }).catch(() => {}); await u.wait(1200); }
  await u.nav("Férias");
  await u.say("Férias: se coincidem com turnos da Rota, a plataforma avisa o conflito", 2400);
  for (const [i, [from, to]] of [[addDays(TODAY, 3), addDays(TODAY, 5)], [addDays(TODAY, 9), addDays(TODAY, 12)]].entries()) {
    await u.click(page.getByRole("button", { name: "Registrar férias" }), 900);
    const d = u.dialog();
    await u.glide(d.getByLabel("Pessoa"));
    await d.getByLabel("Pessoa").selectOption({ index: 3 + i });
    await d.locator("input[type=date]").nth(0).fill(from); await d.locator("input[type=date]").nth(1).fill(to);
    await u.type(d.getByLabel("Observação").or(d.getByLabel("Note")).first(), "Férias anuais").catch(() => {});
    await u.click(d.getByRole("button", { name: "Salvar" }), 900);
    await u.wait(1400);
  }
  await u.nav("Horas");
  await u.say("Horas: planejadas (Rota) × efetivas (posto assumido). Sem folha de pagamento", 2600);
  const row = page.locator("tbody tr").first();
  await u.click(row.getByRole("button", { name: "Atuação" }), 1200);
  const adj = page.getByRole("button", { name: "Ajustar" }).first();
  if (await adj.count()) {
    await u.say("Ajuste de início/fim exige motivo e guarda o histórico", 2000);
    await u.click(adj, 900);
    const d = u.dialog();
    await u.type(d.getByLabel(/Motivo/), "Esqueceu de assumir o posto; início confirmado pela gestão");
    await u.click(d.getByRole("button", { name: "Salvar" }), 900);
    await u.toast("Horas atualizadas (com histórico).");
  }
  await u.click(page.getByRole("button", { name: /Lançar horas/ }).first(), 900);
  const d = u.dialog();
  await u.type(d.getByLabel(/Motivo|Observação/).first(), "Turno de limpeza extra");
  await u.click(d.getByRole("button", { name: "Salvar" }), 900);
  await u.toast("Horas atualizadas (com histórico).");
  check("Gestão: turnos na Rota, publicação, férias e horas", true);
  await u.quiet();
});

/* ---------- 14 · Gestão: compras, distribuição e relatórios ---------- */
scene("14", "gestao-compras-relatorios", "Gestão: compras, distribuição entre Lodges e relatório mensal", "owner", async ({ page, u }) => {
  await u.nav("Compras");
  await u.say("Compras: preços e notas só a gestão vê. O total de cada linha arredonda ao centavo", 2800);
  for (const [i, [forn, prod, qtd, preco]] of [["Musgrave", `Leite 2L ${RUN}`, "24", "1,335"], ["Lyreco", `Papel higiênico ${RUN}`, "12", "6,99"]].entries()) {
    await u.click(page.getByRole("button", { name: "Registrar compra" }), 900);
    const d = u.dialog();
    await u.type(d.getByLabel("Fornecedor"), forn);
    await u.type(d.getByPlaceholder("Nome do produto novo"), prod);
    await u.type(d.getByLabel("Qtd."), qtd);
    await u.type(d.getByLabel("Preço unit. (€)"), preco);
    if (i === 0) await u.say("24 × 1,335 € = 32,04 € (a conta é feita linha a linha)", 2200);
    await u.click(d.getByRole("button", { name: "Salvar" }), 900);
    await u.toast("Compra registrada.");
  }
  await u.nav("Distribuição");
  await u.say("Distribuição: cada compra é repartida entre os Lodges. Aqui ninguém vê preços", 2600);
  for (let i = 0; i < 2; i++) {
    const item = page.locator(".task-item:has(input)").first();
    if (!(await item.count())) break;
    await u.glide(item.locator("select"));
    await item.locator("select").selectOption({ index: i % 2 });
    await u.type(item.locator("input"), (await item.locator("input").getAttribute("placeholder")) ?? "1");
    await u.click(item.getByRole("button", { name: "Alocar" }), 800);
    await u.toast("Registrado.");
  }
  await u.say("Não dá para alocar mais do que foi comprado", 1800);
  await u.click(page.getByRole("tab", { name: "Transferir entre Lodges" }), 1000);
  await u.glide(page.getByLabel("Produto"));
  await pickFirst(page.getByLabel("Produto"), 1);
  await u.type(page.getByLabel("Qtd."), "4");
  await u.click(page.getByRole("button", { name: "Transferir" }).last(), 900);
  await u.toast("Registrado.");
  await u.say("Transferência entre Lodges não é nova despesa", 1800);
  await u.click(page.getByRole("tab", { name: "Histórico" }), 1600);
  await u.nav("Relatórios");
  await u.say("Resumo mensal por Lodge. Cada número abre os registros que o formam", 2600);
  await page.locator(".report-grid .report-block").first().waitFor({ timeout: 20000 });
  for (const [i, lodge] of ["Amiens St.", "Connolly"].entries()) {
    await u.click(page.getByRole("tab", { name: lodge }), 1400);
    const link = page.locator(".metric-link").nth(i * 2);
    if (await link.count()) { await u.click(link, 1200); await u.wait(1500); await page.keyboard.press("Escape"); await u.wait(600); }
  }
  await u.say("Mês anterior, impressão e todos os blocos (ocupação, manutenção, No Shows, horas…)", 2400);
  await page.locator('input[type="month"]').fill(addDays(TODAY, -30).slice(0, 7)); await u.wait(2200);
  await page.mouse.wheel(0, 800); await u.wait(1500);
  check("Gestão: 2 compras, alocações, transferência e relatório", true);
  await u.quiet();
});

/* ---------- 15 · Gestão: usuários e auditoria ---------- */
scene("15", "gestao-usuarios-auditoria", "Gestão: criar usuários, redefinir senha, desativar e auditoria", "owner", async ({ page, u }) => {
  await u.nav("Usuários");
  await u.say("Só a gestão cria usuários. A senha provisória é entregue pessoalmente", 2400);
  for (const [i, [nome, mail, perfil]] of [[`Porter Demo ${RUN}`, `demo.porter.${RUN}@ds-lodge.test`, "Porter"], [`Gestor Demo ${RUN}`, `demo.gestor.${RUN}@ds-lodge.test`, "Manager"]].entries()) {
    await u.click(page.getByRole("button", { name: "Criar usuário" }), 900);
    const d = u.dialog();
    await u.type(d.getByLabel("Nome completo"), nome);
    await d.getByLabel("Perfil").selectOption({ label: perfil });
    await u.type(d.getByLabel("E-mail"), mail);
    await u.click(d.getByRole("button", { name: "Salvar" }), 1000);
    await page.locator(".password").first().waitFor({ timeout: 20000 });
    await u.say(i === 0 ? "A primeira senha aparece uma vez; a pessoa troca no primeiro acesso" : "Manager e Owner também usam o código por e-mail", 2200);
  }
  await u.say("Redefinir a senha gera uma nova senha provisória", 1800);
  const row = page.locator("tr", { hasText: `Porter Demo ${RUN}` });
  await u.click(row.getByRole("button", { name: "Redefinir senha" }), 1200);
  await u.say("Desativar encerra o acesso na hora, mas o histórico é mantido", 2200);
  await u.click(row.getByRole("button", { name: "Desativar" }), 900);
  await u.click(u.dialog().getByRole("button", { name: "Desativar" }), 1200);
  await u.click(page.getByRole("tab", { name: "Desativados" }), 1400);
  await u.click(page.getByRole("tab", { name: "Ativos" }), 800);
  await u.nav("Auditoria");
  await u.say("Auditoria: toda alteração (quem, quando, antes e depois) e quem abriu cada perfil de residente", 3000);
  await u.click(page.locator("table tbody tr").first(), 1500).catch(() => {});
  await page.getByRole("tab", { name: "Perfis abertos" }).click().catch(() => {}); await u.wait(2000);
  check("Gestão: usuários criados, senha redefinida, desativação e auditoria", true);
  await u.quiet();
});

/* ---------- 16 · Celular ---------- */
scene("16", "celular", "No celular: Hoje, Folha do dia, Handover e tarefas com a barra inferior", "niamh", async ({ page, u }) => {
  await page.goto(`${BASE}/`);
  await page.locator(".today-head").waitFor({ timeout: 20000 });
  await u.say("No celular, a mesma plataforma: barra inferior sólida e telas em coluna", 2200);
  await page.mouse.wheel(0, 700); await u.wait(1400); await page.mouse.wheel(0, 700); await u.wait(1400); await page.mouse.wheel(0, -1400); await u.wait(700);
  await u.click(page.locator(".bottom-nav").getByRole("link", { name: /Folha/ }), 1500);
  await u.say("Cada residente vira um cartão com botões grandes (≥ 44 px)", 2200);
  await page.mouse.wheel(0, 500); await u.wait(1200);
  await u.click(page.locator(".bottom-nav").getByRole("link", { name: /Handover/ }), 1500);
  const box = page.locator(".composer textarea");
  await u.type(box, "Ronda das 16h feita, tudo calmo no corredor do 1º andar", 500);
  await u.click(page.getByRole("button", { name: "Lançar no Handover" }), 900);
  await u.toast("Lançado no Handover.");
  await u.click(page.locator(".bottom-nav").getByRole("link", { name: /Tarefas/ }), 1500);
  const sign = page.locator(".task-item:not(.is-done)").first().getByRole("button", { name: "Assinar" });
  if (await sign.count()) { await u.click(sign, 800); await u.toast("Tarefa assinada."); }
  await u.say("Menu “Mais” abre o restante das telas", 1800);
  await u.click(page.locator(".bottom-nav button").last(), 1500);
  await u.wait(1200);
  check("Celular: navegação, Handover e tarefa", true);
  await u.quiet();
}, { mobile: true });

/* ======================================================================== */
const PREP = {
  check: async () => sql(`
    with l as (select id from public.lodges where code = 'AMIENS'),
         r as (select id from public.room_check_runs where operational_day = public.operational_day(now()) - 2 and slot = '12:00' and lodge_id = (select id from l))
    , d1 as (delete from public.room_check_marks where run_id in (select id from r))
    , d2 as (delete from public.handover_entries where kind = 'round' and round_slot = '12:00' and operational_day = public.operational_day(now()) - 2 and lodge_id = (select id from l))
    delete from public.room_check_runs where id in (select id from r)`)
    .then(() => sql(`
    with l as (select id from public.lodges where code = 'AMIENS'),
         r as (select id from public.room_check_runs where operational_day = public.operational_day(now()) and slot = '12:00' and lodge_id = (select id from l))
    , d1 as (delete from public.room_check_marks where run_id in (select id from r))
    , d2 as (delete from public.handover_entries where kind = 'round' and round_slot = '12:00' and operational_day = public.operational_day(now()) and lodge_id = (select id from l))
    delete from public.room_check_runs where id in (select id from r)`)),
  rounds: async () => sql(`
    delete from public.handover_entries where kind = 'round' and operational_day = public.operational_day(now())
      and round_slot in ('14:00', '16:00') and lodge_id = (select id from public.lodges where code = 'AMIENS')`),
  laundry: async () => sql(`update public.laundry_uses set finished_at = now() where finished_at is null`),
  noshow: async () => sql(`
    with a as (select id from public.lodges where code = 'AMIENS'),
    pick as (
      select s.resident_id from public.stays s join public.residents r on r.id = s.resident_id
      where r.is_demo and s.lodge_id = (select id from a) and s.status = 'active' and s.admitted_at < public.operational_day_start(public.operational_day(now()) - 1)
        and not exists (select 1 from public.no_shows n where n.resident_id = s.resident_id)
        and not exists (select 1 from public.absences x where x.resident_id = s.resident_id and x.ended_at is null)
      order by s.resident_id limit 3),
    u1 as (update public.room_check_marks m set result = 'not_seen' where m.resident_id in (select resident_id from pick)
             and m.run_id in (select id from public.room_check_runs where operational_day = public.operational_day(now()) - 1)),
    d1 as (delete from public.sightings where resident_id in (select resident_id from pick) and public.operational_day(seen_at) = public.operational_day(now()) - 1)
    delete from public.dinner_marks where resident_id in (select resident_id from pick)
      and service_id in (select id from public.dinner_services where operational_day = public.operational_day(now()) - 1)`),
  // Amiens quase lotado: libera 6 camas (saídas de residentes demo) para as admissões do vídeo.
  beds: async () => sql(`
    update public.stays s set status = 'ended', ended_at = now(), end_reason = 'out', out_decided_at = now(), out_reason = 'Saída (preparo da demonstração)'
    where s.id in (
      select s2.id from public.stays s2 join public.residents r on r.id = s2.resident_id
      where r.is_demo and s2.status = 'active' and s2.lodge_id = (select id from public.lodges where code = 'AMIENS')
        and not exists (select 1 from public.absences a where a.stay_id = s2.id and a.ended_at is null)
        and not exists (select 1 from public.laundry_uses u where u.stay_id = s2.id and u.finished_at is null)
        and s2.resident_id not in (select resident_id from public.warnings where active and type = 'final_written')
      order by s2.admitted_at limit 6)`),
  none: async () => {},
};

/* ---------- executor ---------- */
(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const stateDir = path.join(OUT, ".state");
  fs.mkdirSync(stateDir, { recursive: true });
  const browser = await chromium.launch();
  const states = {};
  const holders = async () => {
    const { data: posts } = await admin.from("duty_posts").select("function, staff_id, lodge_id").is("ended_at", null);
    const { data: demo } = await admin.from("staff").select("id, email").like("email", "%@demo.ds-lodge.test");
    const { data: lodges } = await admin.from("lodges").select("id, code");
    const em = (p) => demo.find((x) => x.id === p?.staff_id)?.email;
    const lid = (c) => lodges.find((l) => l.code === c)?.id;
    return { connolly: em(posts.find((p) => p.function === "office" && p.lodge_id === lid("CONNOLLY"))), float: em(posts.find((p) => p.function === "float")) };
  };
  // Sessão nova a cada cena: a plataforma encerra sessões paradas há 15 minutos (como deve ser).
  const stateFile = async (role) => {
    const file = path.join(stateDir, `${role}-${Date.now()}.json`);
    if (role === "owner") await saveState(browser, OWNER.email, NEW_PASSWORD, file, { management: true });
    else if (role === "niamh") await saveState(browser, "niall.doyle@demo.ds-lodge.test", DEMO_PASSWORD, file);
    else if (role === "connolly") {
      const h = await holders();
      await saveState(browser, h.connolly ?? "lucas.ferreira@demo.ds-lodge.test", DEMO_PASSWORD, file);
    }
    return file;
  };
  // A conta demo usada nos vídeos fala português.
  await admin.from("staff").update({ locale: "pt-PT" }).eq("email", "niall.doyle@demo.ds-lodge.test");
  try {
    for (const sc of SCENES) {
      if (ONLY.length && !ONLY.includes(sc.id)) continue;
      console.log(`\n=== ${sc.id} · ${sc.title}`);
      if (sc.opts.prep) await PREP[sc.opts.prep]();
      const state = sc.role === "none" ? undefined : await stateFile(sc.role);
      const { ctx, page } = await newScene(browser, { name: sc.slug, state, mobile: !!sc.opts.mobile });
      const u = ui(page);
      let failed = false;
      try {
        if (state) {
          await page.goto(BASE);
          await page.locator(".content, .today-head").first().waitFor({ timeout: 25000 });
          await page.waitForLoadState("networkidle", { timeout: 6000 }).catch(() => {});
        }
        await sc.fn({ page, u, ctx, ctxState: {} });
      } catch (error) {
        failed = true;
        check(`${sc.id} ${sc.title}`, false, error.message.split("\n").slice(0, 4).join(" | ").slice(0, 400));
        await page.screenshot({ path: path.join(OUT, `falha-${sc.id}.png`) }).catch(() => {});
      }
      if (sc.opts.stateOut && !failed) await ctx.storageState({ path: path.join(stateDir, `${sc.opts.stateOut}.json`) }).catch(() => {});
      const video = page.video();
      await ctx.close();
      if (video && !DRY) {
        const dest = path.join(OUT, `${sc.id}-${sc.slug}.webm`);
        await video.saveAs(dest).catch(() => {});
        console.log(`  vídeo: ${dest}`);
      }
    }
  } finally {
    await browser.close();
    const bad = results.filter((r) => !r.ok);
    console.log(`\n${results.length - bad.length}/${results.length} verificações passaram`);
    process.exitCode = bad.length ? 1 : 0;
  }
})();
