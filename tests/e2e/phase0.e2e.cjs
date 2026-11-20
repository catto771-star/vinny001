/* Teste de ponta a ponta da Fase 0 contra um projeto Supabase real.
 *
 * Pré-requisitos:
 *  - app rodando em E2E_BASE_URL (ex.: npm run dev, com .env.local apontando para o projeto);
 *  - uma conta Owner de teste criada com scripts/bootstrap-account.mjs;
 *  - variáveis: E2E_BASE_URL, E2E_OWNER_EMAIL, E2E_OWNER_PASSWORD, E2E_OUT (pasta das capturas).
 *
 * Cria dados de teste identificados com "[TESTE]". Uso: node tests/e2e/phase0.e2e.cjs
 */
const { chromium } = require("playwright");
const crypto = require("node:crypto");

const BASE = process.env.E2E_BASE_URL ?? "http://localhost:5173";
const OUT = process.env.E2E_OUT ?? ".";
const OWNER = { email: process.env.E2E_OWNER_EMAIL, password: process.env.E2E_OWNER_PASSWORD };
const NEW_PASSWORD = `Teste${crypto.randomInt(1e6)}Lodge`;
const RUN = Date.now().toString(36).slice(-5);

function totp(secret) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = "";
  for (const c of secret.replace(/=+$/, "").toUpperCase()) bits += alphabet.indexOf(c).toString(2).padStart(5, "0");
  const key = Buffer.from(bits.match(/.{8}/g).map((b) => parseInt(b, 2)));
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 1000 / 30)));
  const h = crypto.createHmac("sha1", key).update(counter).digest();
  const o = h[h.length - 1] & 0xf;
  return String((h.readUInt32BE(o) & 0x7fffffff) % 1e6).padStart(6, "0");
}

const results = [];
function check(name, ok, detail = "") {
  results.push({ name, ok: !!ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

const openPages = [];
async function newContext(browser) {
  const proxy = process.env.HTTPS_PROXY ? { server: process.env.HTTPS_PROXY, bypass: "localhost,127.0.0.1" } : undefined;
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 860 }, proxy, locale: "pt-PT" });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => console.log("  [pageerror]", e.message));
  page.on("console", (m) => m.type() === "error" && console.log("  [console]", m.text().slice(0, 300)));
  page.on("response", (r) => {
    if (r.url().includes("/rest/v1/") && r.status() >= 400) console.log("  [rest]", r.status(), r.url().split("/rest/v1/")[1]?.slice(0, 80));
  });
  page.on("requestfailed", (r) => console.log("  [requestfailed]", r.url().slice(0, 80), r.failure()?.errorText));
  openPages.push(page);
  return { ctx, page };
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

(async () => {
  const browser = await chromium.launch();
  try {
    // ---------------- Owner: primeiro acesso, troca de senha, duas etapas ----------------
    const owner = await newContext(browser);
    let p = owner.page;
    await login(p, OWNER.email, OWNER.password);
    await changePassword(p);
    await p.getByText("Verificação em duas etapas").waitFor({ timeout: 15000 });
    const secret = (await p.locator(".mfa-secret").textContent({ timeout: 15000 })).trim();
    check("Owner troca a primeira senha e é levado à verificação em duas etapas", !!secret);
    await p.screenshot({ path: `${OUT}/01-mfa.png` });
    await p.getByLabel("Código de 6 dígitos").fill(totp(secret));
    await p.getByRole("button", { name: "Verificar" }).click();
    await p.getByRole("heading", { name: "Hoje" }).waitFor({ timeout: 15000 });
    check("Owner entra com segunda etapa e vê Hoje", true);
    check("Relógio de Dublin visível no topo", await p.locator(".clock-time").isVisible());
    await p.screenshot({ path: `${OUT}/02-today-owner.png` });

    // ---------------- Owner cria dois Porters (função de servidor) ----------------
    async function createPorter(name, email) {
      await p.locator(".sidebar").getByRole("link", { name: "Usuários" }).click();
      await p.getByRole("button", { name: "Criar usuário" }).click();
      const dialog = p.locator("dialog[open]");
      await dialog.getByLabel("Nome completo").fill(name);
      await dialog.getByLabel("E-mail").fill(email);
      await dialog.getByRole("button", { name: "Salvar" }).click();
      // Espera o aviso deste usuário (o aviso anterior pode ainda estar na tela).
      const notice = p.locator(".notice", { hasText: name }).locator(".password");
      const pw = (await notice.textContent({ timeout: 20000 })).trim();
      return pw;
    }
    const porterA = { email: `teste.porter.a.${RUN}@ds-lodge.test`, name: `[TESTE] Porter A ${RUN}` };
    const porterB = { email: `teste.porter.b.${RUN}@ds-lodge.test`, name: `[TESTE] Porter B ${RUN}` };
    porterA.password = await createPorter(porterA.name, porterA.email);
    porterB.password = await createPorter(porterB.name, porterB.email);
    check("Owner cria usuários pela tela (função de servidor), com primeira senha", porterA.password.length >= 10 && porterB.password.length >= 10);
    await p.screenshot({ path: `${OUT}/03-users.png` });

    // ---------------- Porter A: primeiro acesso → Assumir Posto (Office Amiens) ----------------
    const a = await newContext(browser);
    await login(a.page, porterA.email, porterA.password);
    await changePassword(a.page);
    await a.page.getByRole("heading", { name: "Assumir Posto" }).waitFor({ timeout: 15000 });
    check("Porter sem posto vai direto para Assumir Posto", true);
    await a.page.getByLabel("Amiens St.").check();
    await a.page.screenshot({ path: `${OUT}/04-take-post.png` });
    await a.page.getByRole("button", { name: "Assumir Posto" }).click();
    // Se sobrou alguém de uma execução anterior no posto, o sistema avisa; confirmamos.
    const takeover = a.page.getByRole("button", { name: "Confirmar e assumir o posto" });
    await Promise.race([
      a.page.getByRole("heading", { name: "Hoje" }).waitFor({ timeout: 15000 }),
      takeover.waitFor({ timeout: 15000 }).then(() => takeover.click()),
    ]);
    await a.page.getByRole("heading", { name: "Hoje" }).waitFor({ timeout: 15000 });
    const chip = await a.page.locator(".post-chip").textContent();
    check("B42: Porter assume Office On Duty em Amiens", /Office On Duty — Amiens/.test(chip), chip);

    // ---------------- Porter A admite um residente pelo mapa de camas ----------------
    await a.page.locator(".sidebar").getByRole("link", { name: "Mapa de camas" }).click();
    await a.page.getByRole("tab", { name: "Amiens St." }).click();
    await a.page.locator(".bed-free").first().click();
    const admit = a.page.locator("dialog[open]");
    await admit.getByLabel("Nome", { exact: true }).fill(`[TESTE] Maria ${RUN}`);
    await admit.getByLabel("Sobrenome").fill("Demo");
    await admit.getByLabel("Data de nascimento").fill("1986-04-05");
    await admit.getByRole("button", { name: "Admitir residente" }).click();
    await a.page.getByText("A abertura deste perfil fica registrada.").waitFor({ timeout: 15000 });
    const highlight = await a.page.locator(".room-highlight").textContent();
    check("Admissão abre o perfil com o quarto em destaque", /Quarto \d/.test(highlight), highlight);
    await a.page.screenshot({ path: `${OUT}/05-profile.png` });
    const residentUrl = a.page.url();

    // ---------------- Porter A não registra em Connolly ----------------
    await a.page.locator(".sidebar").getByRole("link", { name: "Residentes", exact: true }).click();
    await a.page.getByRole("button", { name: "Admitir residente" }).click();
    const groups = await a.page.locator("dialog[open] select optgroup").evaluateAll((els) => els.map((e) => e.label));
    check("B40: Office de Amiens só vê camas de Amiens para registrar", groups.length === 1 && groups[0] === "Amiens St.", groups.join(","));
    await a.page.keyboard.press("Escape");

    // ---------------- Porter B assume o mesmo posto → aviso → confirma ----------------
    const b = await newContext(browser);
    await login(b.page, porterB.email, porterB.password);
    await changePassword(b.page);
    await b.page.getByRole("heading", { name: "Assumir Posto" }).waitFor({ timeout: 15000 });
    await b.page.getByLabel("Amiens St.").check();
    await b.page.getByRole("button", { name: "Assumir Posto" }).click();
    const occupiedText = await b.page.locator("dialog[open]").textContent({ timeout: 15000 });
    check("B43: posto ocupado mostra quem está de serviço", occupiedText.includes(porterA.name), occupiedText.slice(0, 120));
    await b.page.screenshot({ path: `${OUT}/06-occupied.png` });
    await b.page.getByRole("button", { name: "Confirmar e assumir o posto" }).click();
    await b.page.getByRole("heading", { name: "Hoje" }).waitFor({ timeout: 15000 });
    const onDuty = await b.page.locator(".card").first().textContent();
    check("B43: ao confirmar, o posto anterior é encerrado e B assume", onDuty.includes(porterB.name) && !onDuty.includes(porterA.name), onDuty.slice(0, 160));

    // Porter A (sem posto agora) tenta registrar → o servidor recusa
    await a.page.goto(residentUrl);
    await a.page.reload();
    const aCanDecide = await a.page.getByRole("button", { name: "Decidir Out" }).count();
    check("Porter que perdeu o posto não vê ações de registro", aCanDecide === 0);

    // ---------------- Porter B decide Out → Owner efetiva ----------------
    await b.page.goto(residentUrl);
    await b.page.getByRole("button", { name: "Decidir Out" }).click();
    await b.page.locator("dialog[open] textarea").fill("Teste automatizado");
    await b.page.locator("dialog[open]").getByRole("button", { name: "Decidir Out" }).click();
    await b.page.getByText(/Out decidido por/).waitFor({ timeout: 15000 });
    check("B11: Office decide Out e fica pendente", true);
    const bCanEffect = await b.page.getByRole("button", { name: "Efetivar Out" }).count();
    check("B11: Office não tem a ação de efetivar Out", bCanEffect === 0);

    await p.goto(residentUrl);
    await p.getByRole("button", { name: "Efetivar Out" }).click();
    await p.locator("dialog[open]").getByRole("button", { name: "Efetivar Out" }).click();
    await p.locator("table").getByText(/Out — Teste automatizado/).waitFor({ timeout: 15000 });
    check("B11: Owner efetiva o Out; estadia encerrada, cadastro mantido", true);
    await p.screenshot({ path: `${OUT}/07-out-effective.png` });

    // ---------------- Auditoria e log de leitura ----------------
    await p.locator(".sidebar").getByRole("link", { name: "Auditoria" }).click();
    await p.locator("table tbody tr").first().waitFor({ timeout: 15000 });
    const auditText = await p.locator("table").textContent();
    check("Auditoria mostra autor e alterações", auditText.includes(porterB.name) && auditText.includes("out_pending"));
    await p.screenshot({ path: `${OUT}/08-audit.png` });
    await p.getByRole("tab", { name: "Perfis abertos" }).click();
    await p.waitForTimeout(1500);
    const readsText = await p.locator("table").textContent();
    check("B19: abrir perfil fica registrado no log de leitura", readsText.includes(porterA.name) && readsText.includes(`[TESTE] Maria ${RUN}`));

    // ---------------- Idioma guardado no cadastro ----------------
    await b.page.selectOption(".lang-select select", "pl-PL");
    await b.page.waitForTimeout(800);
    await b.page.goto(BASE);
    await b.page.getByRole("heading", { name: "Dziś" }).waitFor({ timeout: 15000 });
    check("B51: idioma muda a tela e fica guardado no cadastro", true);
    await b.page.screenshot({ path: `${OUT}/09-polish.png` });

    // ---------------- Desativar usuário corta o acesso ----------------
    await p.locator(".sidebar").getByRole("link", { name: "Usuários" }).click();
    await p.locator("tr", { hasText: porterA.name }).getByRole("button", { name: "Desativar" }).click();
    await p.locator("dialog[open]").getByRole("button", { name: "Desativar" }).click();
    await p.locator("tr", { hasText: porterA.name }).getByText("Desativado").waitFor({ timeout: 15000 });
    await login(a.page, porterA.email, NEW_PASSWORD).catch(() => {});
    await a.page.goto(BASE);
    await a.page.waitForTimeout(2000);
    const aBody = await a.page.locator("body").textContent();
    check("B02: usuário desativado não acessa mais", !aBody.includes("Hoje") || aBody.includes("desativada") || aBody.includes("não está cadastrada"), aBody.slice(0, 120));

    // Deixa B sem posto ao final.
    await b.page.goto(`${BASE}/post`);
    await b.page.getByRole("button", { name: /Zakończ moje stanowisko/ }).click();
    await b.page.locator("dialog[open]").getByRole("button", { name: /Potwierdź/ }).click();
  } catch (error) {
    check("Execução sem erro inesperado", false, error.message.split("\n")[0]);
    for (const [i, page] of openPages.entries()) {
      await page.screenshot({ path: `${OUT}/failure-${i}.png` }).catch(() => {});
      console.log(`  page ${i}:`, (await page.locator("body").textContent().catch(() => "")).slice(0, 200));
    }
  } finally {
    await browser.close();
    const failed = results.filter((r) => !r.ok);
    console.log(`\n${results.length - failed.length}/${results.length} verificações passaram`);
    process.exitCode = failed.length ? 1 : 0;
  }
})();
