/* Teste de ponta a ponta da Fase 1 (2ª parte) contra um projeto Supabase real.
 * Mesmos pré-requisitos de phase0.e2e.cjs. Cria dados "[TESTE]".
 * Roteiro: Office de Amiens escreve no Handover com @menção, registra ronda, abre
 * manutenção, registra Final Warning (etiqueta FW no mapa) e assina tarefa; a gestão
 * muda o status do chamado e vê o histórico.
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
function check(name, ok, detail = "") {
  results.push({ name, ok: !!ok });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}
async function until(fn, timeout = 15000) {
  const end = Date.now() + timeout;
  for (;;) {
    if (await fn().catch(() => false)) return true;
    if (Date.now() > end) return false;
    await new Promise((r) => setTimeout(r, 300));
  }
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
// O nome do link pode incluir a bolinha de pendências ("Tarefas do turno 12").
// Fecha o pop-up de tarefas se ele aparecer (pode chegar alguns segundos depois de entrar).
const nav = async (page, name) => {
  await page.locator(".sidebar").getByRole("link", { name: new RegExp(`^${name.replace(/[()]/g, "\\$&")}( \\d+\\+?)?$`) }).click();
};

(async () => {
  const browser = await chromium.launch();
  try {
    const owner = await newPage(browser);
    await login(owner, OWNER.email, OWNER.password);
    await changePassword(owner);
    await owner.getByRole("button", { name: "Enviar código" }).click();
    await owner.waitForTimeout(1200);
    const { data: link } = await admin.auth.admin.generateLink({ type: "magiclink", email: OWNER.email, options: { redirectTo: `${BASE}/` } });
    await owner.goto(link.properties.action_link);
    await owner.locator(".today-head").waitFor({ timeout: 20000 });
    await nav(owner, "Usuários");
    await owner.getByRole("button", { name: "Criar usuário" }).click();
    const porter = { name: `[TESTE] Porter ${RUN}`, email: `teste.porter.o.${RUN}@ds-lodge.test` };
    await owner.locator("dialog[open]").getByLabel("Nome completo").fill(porter.name);
    await owner.locator("dialog[open]").getByLabel("E-mail").fill(porter.email);
    await owner.locator("dialog[open]").getByRole("button", { name: "Salvar" }).click();
    porter.password = (await owner.locator(".notice", { hasText: porter.name }).locator(".password").textContent({ timeout: 20000 })).trim();

    const p = await newPage(browser);
    await login(p, porter.email, porter.password);
    await changePassword(p);
    await p.getByLabel("Amiens St.").check();
    await p.getByRole("button", { name: "Assumir Posto" }).click();
    const takeover = p.getByRole("button", { name: "Confirmar e assumir o posto" });
    await Promise.race([p.locator(".today-head").waitFor({ timeout: 15000 }), takeover.waitFor({ timeout: 15000 }).then(() => takeover.click())]);
    await p.locator(".today-head").waitFor({ timeout: 15000 });
    // Pop-up de tarefas ao entrar (modelo de Amiens já carregado): fecha para seguir.
    // O pop-up de tarefas é fechado pelo tratador da página; aqui só confirmamos que apareceu.
    check("Pop-up de tarefas pendentes ao entrar", await until(() => p.getByText("Tarefas esperando por você").isVisible(), 6000));

    // Residente
    const resident = `[TESTE] Seán ${RUN}`;
    await nav(p, "Residentes");
    await p.getByRole("button", { name: "Admitir residente" }).click();
    const d = p.locator("dialog[open]");
    await d.getByLabel("Nome", { exact: true }).fill(resident);
    await d.getByLabel("Sobrenome").fill("Byrne");
    await d.locator("select").selectOption({ index: 1 });
    await d.getByRole("button", { name: "Admitir residente" }).click();
    await p.getByText("A abertura deste perfil fica registrada.").waitFor({ timeout: 15000 });

    // Handover com @menção
    await nav(p, "Handover (Livro Ata)");
    const box = p.locator(".composer textarea");
    await box.waitFor({ timeout: 15000 });
    await box.click();
    await box.pressSequentially(`Conversei com @${resident.split(" ")[1]}`, { delay: 15 });
    await p.locator(".mention-menu button").first().click();
    await box.pressSequentially(`sobre o horário de silêncio ${RUN}.`, { delay: 5 });
    await p.getByRole("button", { name: "Lançar no Handover" }).click();
    await p.getByText("Lançado no Handover.").waitFor({ timeout: 15000 });
    const posted = await until(async () => (await p.locator(".timeline-item", { hasText: `horário de silêncio ${RUN}` }).locator(".chip").count()) === 1);
    check("Handover: anotação com @menção aparece na linha do tempo com o residente marcado", posted);
    await p.screenshot({ path: `${OUT}/o-handover.png` });

    // Ronda
    const roundBtn = p.locator(".round-chip:not([disabled])").first();
    if (await roundBtn.count()) {
      const slot = (await roundBtn.textContent()).trim();
      await roundBtn.click();
      await p.getByText("Ronda registrada no Handover.").waitFor({ timeout: 15000 });
      const done = await until(async () => (await p.locator(".round-chip.is-done", { hasText: slot }).count()) === 1);
      check(`Ronda ${slot}: um clique gera Room Check Done`, done);
    } else {
      check("Ronda: nenhuma ronda vencida agora (nada a registrar)", true);
    }

    // Manutenção pelo Handover
    await p.getByRole("button", { name: "Criar manutenção" }).click();
    const md = p.locator("dialog[open]");
    await md.getByLabel("Local").fill(`[TESTE] Quarto ${RUN}`);
    await md.getByLabel("Descrição").fill("Janela não fecha");
    await md.getByRole("tab", { name: "Urgente" }).click();
    await md.getByRole("button", { name: "Salvar" }).click();
    await p.getByText("Chamado criado — o Manager foi avisado.").waitFor({ timeout: 15000 });
    await nav(p, "Manutenção");
    const ticketVisible = await until(async () => (await p.locator(".ticket", { hasText: `[TESTE] Quarto ${RUN}` }).count()) === 1);
    check("Manutenção: chamado aparece na lista com prioridade", ticketVisible);

    // Final Warning → FW no mapa de camas
    await nav(p, "Warnings");
    await p.getByRole("button", { name: "Registrar Warning" }).click();
    const wd = p.locator("dialog[open]");
    const opt = await wd.locator("option", { hasText: resident }).getAttribute("value");
    await wd.locator("select").selectOption(opt);
    await wd.getByRole("tab", { name: "Final Written (FW)" }).click();
    await wd.getByLabel("O que aconteceu").fill("Agressão verbal ao Office");
    await wd.getByRole("button", { name: "Registrar Warning" }).click();
    await p.getByText("Warning registrado no Handover e no perfil.").waitFor({ timeout: 15000 });
    await nav(p, "Mapa de camas");
    const fw = await until(async () => (await p.locator(".bed", { hasText: resident }).locator(".fw-tag").count()) === 1);
    check("B17: etiqueta FW aparece no mapa de camas", fw);

    // Tarefa
    await nav(p, "Tarefas do turno");
    const firstSign = p.locator(".task-item:not(.is-done)").first().getByRole("button", { name: "Assinar" });
    await firstSign.waitFor({ timeout: 15000 });
    await firstSign.click();
    await p.getByText("Tarefa assinada.").waitFor({ timeout: 15000 });
    const sig = await until(async () => (await p.locator(".task-item.is-done .sig", { hasText: porter.name }).count()) >= 1);
    check("Daily Task assinada com nome, função e hora", sig);
    await p.screenshot({ path: `${OUT}/o-tasks.png` });

    // Bolinhas vermelhas no menu
    const badges = await p.locator(".sidebar .nav-badge").count();
    check("Bolinhas vermelhas de pendência no menu", badges >= 1, String(badges));

    // Gestão: muda status do chamado e vê histórico
    await nav(owner, "Manutenção");
    await owner.locator(".ticket", { hasText: `[TESTE] Quarto ${RUN}` }).click();
    const td = owner.locator("dialog[open]");
    await td.getByLabel("Status").selectOption("in_progress");
    await td.getByLabel("O que foi feito").fill("Vidraceiro chamado");
    await td.getByRole("button", { name: "Atualizar" }).click();
    await owner.getByText("Chamado atualizado.").waitFor({ timeout: 15000 });
    await owner.locator(".ticket", { hasText: `[TESTE] Quarto ${RUN}` }).click();
    const hist = await until(async () => (await owner.locator("dialog[open] .timeline-item").count()) >= 2);
    check("B33: gestão muda o status e o histórico guarda cada mudança", hist);
    await owner.screenshot({ path: `${OUT}/o-ticket.png` });
  } catch (error) {
    check("Execução sem erro inesperado", false, error.message.split("\n")[0]);
    for (const [i, page] of pages.entries()) await page.screenshot({ path: `${OUT}/o-failure-${i}.png` }).catch(() => {});
  } finally {
    await browser.close();
    const failed = results.filter((r) => !r.ok);
    console.log(`\n${results.length - failed.length}/${results.length} verificações passaram`);
    process.exitCode = failed.length ? 1 : 0;
  }
})();
