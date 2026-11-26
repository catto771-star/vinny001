// Inventário de botões, abas e links de cada tela (para a auditoria de nomes). Não altera dados.
// Uso: DEMO_PASSWORD=... NODE_USE_ENV_PROXY=1 node tests/e2e/label-audit.e2e.cjs > docs/AUDITORIA-NOMES-inventario.txt
const { chromium } = require("playwright");
const BASE = process.env.E2E_BASE_URL ?? "http://localhost:4173";
const PW = process.env.DEMO_PASSWORD; if (!PW) throw new Error("Defina DEMO_PASSWORD");
const proxy = process.env.HTTPS_PROXY ? { server: process.env.HTTPS_PROXY, bypass: "localhost,127.0.0.1" } : undefined;
const ROUTES = ["/", "/tasks", "/notifications", "/residents", "/sheet", "/seen", "/absences", "/no-shows", "/warnings", "/beds", "/handover", "/maintenance", "/fridge", "/deliveries", "/dinner", "/laundry", "/rota", "/purchases", "/hours", "/vacations", "/reports", "/users", "/audit", "/settings", "/settings?tab=notifications", "/settings?tab=handover", "/settings?tab=system", "/settings?tab=registers", "/settings?tab=registers&reg=suppliers"];
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, proxy });
  const p = await ctx.newPage();
  await p.addInitScript(() => localStorage.setItem("ui.theme", "light"));
  p.addLocatorHandler(p.getByRole("dialog").filter({ hasText: /Tasks waiting for you/ }), async () => { await p.getByRole("button", { name: /^Later$/ }).click(); });
  p.addLocatorHandler(p.getByRole("dialog").filter({ hasText: /Deadline passed/ }), async (d) => { await d.getByRole("button", { name: /Remind me in 24 h/ }).click(); }, { noWaitAfter: true });
  await p.goto(BASE);
  await p.getByLabel("Email").fill("siobhan.murphy@demo.ds-lodge.test");
  await p.getByLabel("Password").fill(PW);
  await p.getByRole("button", { name: "Sign in" }).click();
  await p.locator(".content").waitFor({ timeout: 30000 });
  for (const r of ROUTES) {
    await p.goto(BASE + r); await p.waitForTimeout(2500);
    const labels = await p.evaluate(() => [...new Set([...document.querySelectorAll(".content button, .content a.button-link, .content [role=tab], .content h1")].map((e) => (e.getAttribute("aria-label") || e.textContent || "").trim().replace(/\s+/g, " ")).filter((s) => s && s.length < 60))]);
    console.log(`## ${r}\n${labels.map((l) => "  - " + l).join("\n")}`);
  }
  await b.close();
})();
