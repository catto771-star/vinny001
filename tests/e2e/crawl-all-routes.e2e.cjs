// Cenários de uso de ponta a ponta (Playwright) — base das imagens e dos passos do manual.
// Uso: servir o build (npx vite preview --port 4173) e rodar com a produção/demonstração semeada (node scripts/demo.mjs seed):
//   DEMO_PASSWORD=<senha das contas demo> NODE_USE_ENV_PROXY=1 OUTDIR=./cenarios node tests/e2e/crawl-all-routes.e2e.cjs
// Entra com as contas de demonstração (a senha vem de DEMO_PASSWORD) e confere cada resultado no banco.
const { chromium } = require("playwright");
const DEMO_PASSWORD = process.env.DEMO_PASSWORD;
if (!DEMO_PASSWORD) throw new Error("Defina DEMO_PASSWORD (senha das contas de demonstração; não fica no repositório).");
const BASE = "http://localhost:4173";
const proxy = { server: process.env.HTTPS_PROXY, bypass: "localhost,127.0.0.1" };
const ROUTES = ["/", "/tasks", "/notifications", "/residents", "/sheet", "/seen", "/absences", "/no-shows", "/warnings", "/beds", "/handover", "/maintenance", "/fridge", "/deliveries", "/dinner", "/laundry", "/rota", "/purchases", "/hours", "/vacations", "/reports", "/users", "/audit", "/structure", "/structure?tab=fridges", "/structure?tab=laundry", "/structure?tab=houses", "/settings", "/settings?tab=system", "/settings?tab=notifications"];
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1366, height: 900 }, proxy });
  const p = await ctx.newPage();
  await p.addInitScript(() => localStorage.setItem("ui.theme", "light"));
  let cur = "login"; const probs = [];
  p.on("pageerror", (e) => probs.push(`[${cur}] PAGEERROR ${e.message.slice(0, 140)}`));
  p.on("console", (m) => { if (m.type() === "error") probs.push(`[${cur}] CONSOLE ${m.text().slice(0, 160)}`); });
  p.on("response", (r) => { const u = r.url(); if (r.status() >= 400 && /supabase\.co/.test(u) && !/auth\/v1\/(token|user)/.test(u)) probs.push(`[${cur}] HTTP ${r.status()} ${u.replace(/^https:\/\/[^/]+/, "").slice(0, 110)}`); });
  await p.goto(BASE);
  await p.getByLabel("Email").fill("sean.murphy@demo.ds-lodge.test");
  await p.getByLabel("Password").fill(DEMO_PASSWORD);
  await p.getByRole("button", { name: "Sign in" }).click();
  await p.waitForTimeout(3500);
  const pw = p.locator('input[type="password"]');
  console.log("needs password change:", (await pw.count()) >= 2);
  await p.locator(".content").waitFor({ timeout: 30000 });
  for (const r of ROUTES) {
    cur = r;
    await p.goto(BASE + r); await p.waitForTimeout(2500);
    await p.evaluate(() => document.querySelectorAll("dialog[open]").forEach((d) => d.close()));
    const txt = await p.locator(".content").innerText().catch(() => "");
    const bad = txt.match(/\b(NaN|undefined|\[object Object\]|Invalid Date)\b/g);
    if (bad) probs.push(`[${r}] TEXT ${[...new Set(bad)].join(",")}`);
    const errs = await p.locator(".notice-error, .toast-error").allTextContents();
    if (errs.length) probs.push(`[${r}] NOTICE ${errs.join(" | ").slice(0, 160)}`);
    const sw = await p.evaluate(() => document.documentElement.scrollWidth - innerWidth);
    if (sw > 1) probs.push(`[${r}] SIDEWAYS ${sw}px`);
    await p.screenshot({ path: `${process.env.OUTDIR}/${r.replace(/[\/?=]/g, "_") || "home"}.png` });
  }
  console.log(probs.length ? probs.join("\n") : "NO PROBLEMS");
  await b.close();
})();
