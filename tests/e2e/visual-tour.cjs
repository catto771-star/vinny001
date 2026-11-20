/* Capturas de tela para revisão visual (não é teste de regra).
 * Mesmos pré-requisitos do phase0.e2e.cjs. Gera PNGs em E2E_OUT. */
const { chromium, devices } = require("playwright");
const crypto = require("node:crypto");
const { createClient } = require("@supabase/supabase-js");

const BASE = process.env.E2E_BASE_URL ?? "http://localhost:5173";
const OUT = process.env.E2E_OUT ?? ".";
const OWNER = { email: process.env.E2E_OWNER_EMAIL, password: process.env.E2E_OWNER_PASSWORD };
const admin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const proxy = process.env.HTTPS_PROXY ? { server: process.env.HTTPS_PROXY, bypass: "localhost,127.0.0.1" } : undefined;

async function signIn(page) {
  await page.goto(BASE);
  await page.selectOption(".lang-select select", "pt-PT");
  await page.getByLabel("E-mail").fill(OWNER.email);
  await page.getByLabel("Senha").fill(OWNER.password);
  await page.getByRole("button", { name: "Entrar" }).click();
  await page.getByText("Escolha uma nova senha").waitFor({ timeout: 15000 });
  const pw = `Visual${crypto.randomInt(1e6)}Tour`;
  await page.getByLabel("Nova senha", { exact: true }).fill(pw);
  await page.getByLabel("Repita a nova senha").fill(pw);
  await page.getByRole("button", { name: "Salvar" }).click();
  await page.getByRole("button", { name: "Enviar código" }).click();
  await page.waitForTimeout(1200);
  const { data: link } = await admin.auth.admin.generateLink({ type: "magiclink", email: OWNER.email, options: { redirectTo: `${BASE}/` } });
  await page.goto(link.properties.action_link);
  await page.getByRole("heading", { level: 1 }).first().waitFor({ timeout: 20000 });
}

(async () => {
  const browser = await chromium.launch();
  const desktop = await browser.newContext({ viewport: { width: 1440, height: 920 }, deviceScaleFactor: 1, proxy, locale: "pt-PT" });
  const page = await desktop.newPage();
  await signIn(page);
  // Alguns residentes de teste para a revisão.
  const names = [["Aoife", "Byrne"], ["Tomasz", "Kowalczyk"], ["Mariana", "Souza"], ["Declan", "Murphy"], ["Oksana", "Shevchenko"]];
  for (const [first, last] of names) {
    await page.goto(`${BASE}/residents`);
    await page.getByRole("button", { name: "Admitir residente" }).click();
    const d = page.locator("dialog[open]");
    await d.getByLabel("Nome", { exact: true }).fill(`[TESTE] ${first}`);
    await d.getByLabel("Sobrenome").fill(last);
    await d.getByLabel("Data de nascimento").fill(`19${70 + crypto.randomInt(25)}-0${1 + crypto.randomInt(8)}-1${crypto.randomInt(9)}`);
    await d.locator("select").selectOption({ index: 1 + crypto.randomInt(6) });
    await d.getByRole("button", { name: "Admitir residente" }).click();
    await page.getByText("A abertura deste perfil fica registrada.").waitFor({ timeout: 15000 });
  }
  const shots = [["/", "today"], ["/residents", "residents"], ["/sheet", "sheet"], ["/beds", "beds"], ["/no-shows", "noshows"], ["/users", "users"]];
  for (const [path, name] of shots) {
    await page.goto(`${BASE}${path}`);
    await page.waitForTimeout(3500);
    await page.screenshot({ path: `${OUT}/v-desktop-${name}.png` });
  }
  // Celular
  const mobile = await browser.newContext({ ...devices["iPhone 13"], proxy, locale: "pt-PT", storageState: await desktop.storageState() });
  const m = await mobile.newPage();
  for (const [path, name] of [["/", "today"], ["/residents", "residents"], ["/beds", "beds"]]) {
    await m.goto(`${BASE}${path}`);
    await m.waitForTimeout(2200);
    await m.screenshot({ path: `${OUT}/v-mobile-${name}.png` });
  }
  await m.goto(`${BASE}/residents`);
  await m.waitForTimeout(1500);
  await m.getByRole("button", { name: "Admitir residente" }).click();
  await m.waitForTimeout(600);
  await m.screenshot({ path: `${OUT}/v-mobile-dialog.png` });
  await browser.close();
  console.log("ok");
})().catch((e) => {
  console.error("FAIL", e.message.split("\n")[0]);
  process.exit(1);
});
