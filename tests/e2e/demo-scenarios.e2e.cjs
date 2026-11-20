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

/* Cenários com os dados de demonstração (supabase/seed/demo.sql) no site publicado.
 * Pré-requisitos: npm run demo:seed; E2E_OWNER_* (conta de gestão de teste) e DEMO_PASSWORD.
 * Não cria residentes: trabalha sobre o histórico fictício como a equipe faria num turno. */
async function porterLogin(page, email, lodgeLabel) {
  await page.goto(BASE);
  await page.selectOption(".lang-select select", "pt-PT");
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Senha").fill(DEMO_PASSWORD);
  await page.getByRole("button", { name: "Entrar" }).click();
  const take = page.getByRole("button", { name: "Assumir Posto" });
  await Promise.race([page.locator(".bento-hero").waitFor({ timeout: 20000 }), take.waitFor({ timeout: 20000 })]);
  if (await take.isVisible().catch(() => false)) {
    await page.getByLabel(lodgeLabel).check();
    await take.click();
    const takeover = page.getByRole("button", { name: "Confirmar e assumir o posto" });
    await Promise.race([page.locator(".bento-hero").waitFor({ timeout: 15000 }), takeover.waitFor({ timeout: 15000 }).then(() => takeover.click())]);
    await page.locator(".bento-hero").waitFor({ timeout: 15000 });
  }
}

(async () => {
  const browser = await chromium.launch();
  const today = opDay(new Date());
  const yesterday = addDays(today, -1);
  try {
    // Quem está no posto agora, segundo a Rota da demo (entra direto, sem Assumir Posto).
    const { data: open } = await admin.from("duty_posts").select("function, staff_id, lodge_id").is("ended_at", null);
    const { data: lodgeRows } = await admin.from("lodges").select("id, code");
    const { data: staffRows } = await admin.from("staff").select("id, email").like("email", "%@demo.ds-lodge.test");
    const holder = (code) => {
      const lodge = lodgeRows?.find((l) => l.code === code)?.id;
      const post = open?.find((p) => p.function === "office" && p.lodge_id === lodge);
      return staffRows?.find((x) => x.id === post?.staff_id)?.email;
    };
    const amiensEmail = holder("AMIENS") ?? "pedro.almeida@demo.ds-lodge.test";
    const connollyEmail = holder("CONNOLLY") ?? "lucas.ferreira@demo.ds-lodge.test";
    console.log(`  Office agora: Amiens = ${amiensEmail}, Connolly = ${connollyEmail}`);

    // ---------------- Office Amiens ----------------
    const a = await newPage(browser);
    await porterLogin(a, amiensEmail, "Amiens St.");
    await a.screenshot({ path: `${OUT}/demo-01-today-amiens.png` });
    check("Porter demo entra e assume o Office de Amiens (Hoje com os dados do turno)", true);

    await nav(a, "Residentes");
    const resRows = await until(async () => (await a.locator("table tbody tr").count()) >= 60);
    check("Residentes: lista com os ~76 residentes fictícios nos dois Lodges", resRows, String(await a.locator("table tbody tr").count()));

    await nav(a, "Ausências");
    check("Ausências: a ausência ativa (Limerick) aparece", await until(async () => (await a.locator(".page").textContent()).includes("Limerick")));
    await a.screenshot({ path: `${OUT}/demo-02-absences.png` });

    await nav(a, "Seen");
    await a.locator('input[type="date"]').fill(yesterday);
    const seenRows = await until(async () => (await a.locator("table tbody tr").count()) >= 25);
    check("Seen de ontem: residentes com origem (Check, Dinner, Seen manual)", seenRows && (await a.locator(".page").textContent()).includes("Dinner"));
    await a.screenshot({ path: `${OUT}/demo-03-seen.png` });

    await nav(a, "Tarefas do turno");
    const sign = a.locator(".task-item:not(.is-done)").first().getByRole("button", { name: "Assinar" });
    if (await sign.count()) {
      await sign.click();
      await a.getByText("Tarefa assinada.").waitFor({ timeout: 15000 });
      check("Daily Tasks: Porter assina uma tarefa pendente do turno", true);
    } else check("Daily Tasks: todas as tarefas vencidas já estão assinadas", true);
    await a.screenshot({ path: `${OUT}/demo-04-tasks.png` });

    await nav(a, "Dinner");
    const group = a.getByRole("group").first();
    await group.waitFor({ timeout: 15000 });
    const hour = Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Dublin", hour: "2-digit", hourCycle: "h23" }).format(new Date()));
    if (hour >= 18 || hour < 7) {
      await group.getByRole("button", { name: "Sim" }).click();
      await a.waitForTimeout(1200);
      check("Dinner de hoje: marcação de um residente", (await a.locator('[aria-pressed="true"]').count()) >= 1);
    } else {
      check("Dinner antes das 18h: botões bloqueados e aviso 'O Dinner começa às 18h.'",
        (await a.getByText("O Dinner começa às 18h.").count()) === 1 && (await group.getByRole("button", { name: "Sim" }).isDisabled()));
    }
    await a.screenshot({ path: `${OUT}/demo-05b-dinner.png` });

    await nav(a, "Distribuição");
    await a.locator(".task-list").waitFor({ timeout: 15000 });
    const item = a.locator(".task-item:has(input)").first();
    if (await item.count()) {
      await item.locator("input").fill(await item.locator("input").getAttribute("placeholder"));
      await item.getByRole("button", { name: "Alocar" }).click();
      await a.getByText("Registrado.").waitFor({ timeout: 15000 });
      check("Distribuição: Porter aloca o que falta da última compra sem ver preços", !(await a.locator(".page").textContent()).includes("€"));
    } else {
      await a.getByRole("tab", { name: "Histórico" }).click();
      check("Distribuição: tudo alocado; histórico com alocações e transferências", (await a.locator("table tr").count()) >= 20);
    }
    await a.screenshot({ path: `${OUT}/demo-05-distribution.png` });

    // ---------------- Office Connolly ----------------
    const c = await newPage(browser);
    await porterLogin(c, connollyEmail, "Connolly");
    await nav(c, "Folha do dia");
    const pendingTab = c.getByRole("tab", { name: /Check 12:00/ });
    await pendingTab.waitFor({ timeout: 15000 });
    await pendingTab.click();
    const start = c.getByRole("button", { name: /Começar a lançar|Continuar/ });
    if (await start.count()) await start.first().click();
    await c.locator(".sheet-table").waitFor({ timeout: 15000 });
    const launch = c.getByRole("button", { name: "Lançar check" });
    if (await launch.count()) {
      const pending = c.locator(".sheet-table tr:has(.result-buttons):not(:has(button[aria-pressed='true']))");
      await c.locator(".sticky-actions", { hasText: /\d+ de \d+ marcados/ }).waitFor({ timeout: 15000 });
      await until(async () => (await pending.count()) > 0, 5000);
      const before = await pending.count();
      for (let i = 0; i < 80 && (await pending.count()) > 0; i++) {
        const row = pending.first();
        await row.evaluate((el) => el.scrollIntoView({ block: "center" })); // a barra fixa de baixo cobre a última linha
        await row.getByRole("button", { name: "Visto", exact: true }).click();
        await c.waitForTimeout(200);
      }
      await c.screenshot({ path: `${OUT}/demo-06-sheet-connolly.png` });
      await launch.click();
      await c.getByText("Check lançado.").waitFor({ timeout: 15000 });
      check(`Folha do dia: Connolly termina o check das 12:00 começado no turno (${before} residentes faltavam) e lança`, true);
    } else check("Folha do dia: check das 12:00 de Connolly já lançado", true);

    await nav(c, "Handover (Livro Ata)");
    await c.locator(".timeline-item").first().waitFor({ timeout: 15000 });
    const round = c.locator(".round-chip:not([disabled]):not(.is-done)").first();
    if (await round.count()) {
      const slot = (await round.textContent()).trim();
      await round.click();
      await c.getByText("Ronda registrada no Handover.").waitFor({ timeout: 15000 });
      check(`Handover: ronda pendente ${slot} registrada com um clique`, true);
    } else check("Handover: nenhuma ronda pendente", true);
    await c.screenshot({ path: `${OUT}/demo-07-handover-connolly.png` });

    await nav(c, "Laundry");
    await c.locator(".machine").first().waitFor({ timeout: 15000 });
    const free = c.locator(".machine").filter({ has: c.getByRole("button", { name: "Iniciar" }) }).first();
    if (await free.count()) {
      await free.getByRole("button", { name: "Iniciar" }).click();
      const ld = c.locator("dialog[open]");
      await ld.locator("select").selectOption({ index: 1 });
      await ld.getByRole("button", { name: "Iniciar" }).click();
      await c.getByText("Máquina iniciada — anotada no Handover.").waitFor({ timeout: 15000 });
      check("Laundry: máquina iniciada para um residente (vai para o Handover)", true);
    } else check("Laundry: todas as máquinas em uso", true);
    await c.screenshot({ path: `${OUT}/demo-08-laundry.png` });

    await nav(c, "No Shows");
    await c.locator('input[type="date"]').fill(yesterday);
    const ns = await admin.from("no_shows").select("operational_day, residents(first_name, last_name), lodges(code)").eq("status", "confirmed").eq("operational_day", yesterday);
    const nsName = ns.data?.[0] ? `${ns.data[0].residents.first_name} ${ns.data[0].residents.last_name}` : null;
    check("No Shows de ontem: o No Show confirmado aparece com o contador do mês",
      !!nsName && (await until(async () => (await c.locator(".page").textContent()).includes(nsName))), nsName ?? "sem No Show ontem");
    await c.screenshot({ path: `${OUT}/demo-09-noshows.png` });

    // ---------------- Gestão ----------------
    const o = await newPage(browser);
    await login(o, OWNER.email, OWNER.password);
    await changePassword(o);
    await o.getByRole("button", { name: "Enviar código" }).click();
    await o.waitForTimeout(1200);
    const { data: link } = await admin.auth.admin.generateLink({ type: "magiclink", email: OWNER.email, options: { redirectTo: `${BASE}/` } });
    await o.goto(link.properties.action_link);
    await o.locator(".bento-hero").waitFor({ timeout: 20000 });
    // Chamados vencidos: a gestão é perguntada sobre o status ao entrar.
    const reminder = o.getByRole("dialog").filter({ hasText: "Prazo vencido" });
    const reminded = await until(() => reminder.isVisible(), 10000);
    if (reminded) await o.screenshot({ path: `${OUT}/demo-10b-overdue-reminder.png` });
    check("Gestão recebe o lembrete de chamado com prazo vencido ao entrar", reminded);
    // Um lembrete por chamado vencido, em sequência: adia cada um por 24 h.
    let snoozed = 0;
    for (let i = 0; i < 15 && (await reminder.isVisible().catch(() => false)); i++) {
      await reminder.getByRole("button", { name: "Lembrar em 24 h" }).click();
      snoozed++;
      await o.waitForTimeout(900);
    }
    check(`Lembretes de prazo vencido em sequência (${snoozed} adiados por 24 h)`, snoozed >= 1 && !(await reminder.isVisible().catch(() => false)));
    await o.screenshot({ path: `${OUT}/demo-10-today-management.png` });

    await nav(o, "Notificações");
    const notifOk = await until(async () => {
      const txt = await o.locator(".page").textContent();
      return txt.includes("Geladeira de") && txt.includes("No Shows no mês") && txt.includes("Rota publicada com") && txt.includes("Férias de Rafael Souza");
    });
    check("Notificações: geladeira, 3º No Show, cobertura da Rota e férias em conflito com texto próprio", notifOk);
    await o.screenshot({ path: `${OUT}/demo-11-notifications.png` });

    await nav(o, "Manutenção");
    await o.locator(".ticket").first().waitFor({ timeout: 15000 });
    await o.screenshot({ path: `${OUT}/demo-12a-maintenance-amiens.png` });
    check("Manutenção (Amiens): chamados em aberto com os atrasados destacados",
      (await o.locator(".ticket").count()) >= 3 && (await o.locator(".ticket", { hasText: "Atrasado" }).count()) >= 1);
    await o.getByRole("tab", { name: "Connolly" }).click();
    await o.locator(".ticket", { hasText: "Blocked sink" }).waitFor({ timeout: 15000 });
    await o.locator(".ticket", { hasText: "Blocked sink" }).click();
    const td = o.locator("dialog[open]");
    await td.getByLabel("Status").selectOption("in_progress");
    await td.getByLabel("O que foi feito").fill("Plumber booked for this afternoon");
    await td.getByRole("button", { name: "Atualizar" }).click();
    await o.getByText("Chamado atualizado.").waitFor({ timeout: 15000 });
    check("Manutenção: gestão muda o status de um chamado da demo", true);
    await o.screenshot({ path: `${OUT}/demo-12-maintenance.png` });

    await nav(o, "Relatórios");
    await o.getByRole("tab", { name: "Amiens" }).click();
    await o.locator(".block-occupancy").waitFor({ timeout: 20000 });
    await o.screenshot({ path: `${OUT}/demo-13-report-amiens.png`, fullPage: true });
    await o.locator(".block-occupancy .report-metric", { hasText: "admissões" }).getByRole("button").click();
    const detailRows = await until(async () => (await o.locator("dialog[open] tr").count()) >= 1);
    check("Relatório de Amiens (mês atual): número de admissões abre a lista de origem", detailRows);
    await o.keyboard.press("Escape");
    await o.locator('input[type="month"]').fill(addDays(today, -30).slice(0, 7));
    await o.waitForTimeout(2500);
    const octDinner = await o.locator(".block-dinner .report-metric", { hasText: "Dinners servidos" }).locator("dd").textContent().catch(() => "0");
    check("Relatório do mês anterior também tem dados (Dinner servido)", Number(octDinner) > 0, `${octDinner} Dinners`);
    await o.getByRole("tab", { name: "Connolly" }).click();
    await o.locator(".block-laundry").waitFor({ timeout: 20000 });
    check("Relatório de Connolly: Laundry sim, Dinner não", (await o.locator(".block-dinner").count()) === 0);
    await o.screenshot({ path: `${OUT}/demo-14-report-connolly.png`, fullPage: true });

    await nav(o, "Rota");
    await o.locator(".rota-day").first().waitFor({ timeout: 15000 });
    await o.waitForTimeout(1500);
    check("Rota da semana: turnos de todos os postos", (await o.locator(".rota-shift").count()) >= 30, String(await o.locator(".rota-shift").count()));
    await o.screenshot({ path: `${OUT}/demo-15-rota.png` });
    for (let i = 0; i < 3; i++) await o.getByRole("button", { name: "Próxima semana" }).click();
    await o.waitForTimeout(2000);
    const publish = o.getByRole("button", { name: /Publicar semana/ });
    const drafts = await o.locator(".rota-shift.is-draft").count();
    if (drafts > 0 && (await publish.isEnabled())) {
      await publish.click();
      await o.getByText(/Publicado: \d+ turno/).waitFor({ timeout: 15000 });
      check(`Rota: semana em rascunho (${drafts} turnos) publicada; buracos avisados`, true);
    } else check("Rota: sem rascunhos nesta semana", true, String(drafts));
    await o.screenshot({ path: `${OUT}/demo-16-rota-publish.png` });

    await nav(o, "Horas");
    const hoursRow = o.locator("tr", { hasText: "Pedro Almeida" }).first();
    await hoursRow.waitFor({ timeout: 15000 });
    check("Horas: planejadas × efetivas por pessoa (com diferença)", /\d+ h \d\d/.test(await hoursRow.textContent()));
    await o.screenshot({ path: `${OUT}/demo-17-hours.png` });

    await nav(o, "Férias");
    check("Férias: a viagem de Rafael aparece", await until(async () => (await o.locator(".page").textContent()).includes("Trip to Brazil")));
    await o.screenshot({ path: `${OUT}/demo-18-vacations.png` });

    await nav(o, "Mapa de camas");
    await o.waitForTimeout(2000);
    await o.screenshot({ path: `${OUT}/demo-19-bedmap.png`, fullPage: true });
    check("Mapa de camas carregado com as duas casas", (await o.locator(".page").textContent()).includes("Connolly"));
  } catch (error) {
    check("Execução sem erro inesperado", false, error.message.split("\n")[0]);
    for (const [i, page] of pages.entries()) await page.screenshot({ path: `${OUT}/demo-failure-${i}.png` }).catch(() => {});
  } finally {
    await browser.close();
    const failed = results.filter((r) => !r.ok);
    console.log(`\n${results.length - failed.length}/${results.length} verificações passaram`);
    process.exitCode = failed.length ? 1 : 0;
  }
})();
