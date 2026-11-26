// Gera os prints do manual (inglês, tema claro) contra o app servido em :4173 com a demonstração semeada.
// Uso: DEMO_PASSWORD=... NODE_USE_ENV_PROXY=1 OUTDIR=docs/manual/shots node tests/e2e/manual-shots.cjs
const { chromium } = require("playwright");
const PW = process.env.DEMO_PASSWORD;
if (!PW) throw new Error("Defina DEMO_PASSWORD");
const BASE = process.env.E2E_BASE_URL ?? "http://localhost:4173", OUT = process.env.OUTDIR ?? ".";
const proxy = process.env.HTTPS_PROXY ? { server: process.env.HTTPS_PROXY, bypass: "localhost,127.0.0.1" } : undefined;

async function session(browser, email, viewport) {
  const ctx = await browser.newContext({ viewport, proxy, deviceScaleFactor: 1.5, locale: "en-IE" });
  const p = await ctx.newPage();
  await p.addInitScript(() => { try { localStorage.setItem("ui.theme", "light"); } catch {} });
  p.addLocatorHandler(p.getByRole("dialog").filter({ hasText: /Tasks waiting for you/ }), async () => { await p.getByRole("button", { name: /^Later$/ }).click(); });
  p.addLocatorHandler(p.getByRole("dialog").filter({ hasText: /Deadline passed/ }), async (d) => { await d.getByRole("button", { name: /Remind me in 24 h/ }).click(); }, { noWaitAfter: true });
  await p.goto(BASE);
  await p.getByLabel("Email").fill(email);
  await p.getByLabel("Password").fill(PW);
  await p.getByRole("button", { name: "Sign in" }).click();
  await p.locator(".content").waitFor({ timeout: 30000 });
  await p.waitForTimeout(2500);
  return p;
}
const shot = async (p, name, path, o = {}) => {
  if (process.env.RESUME && require("fs").existsSync(`${OUT}/${name}.png`)) return;
  if (path) { await p.goto(BASE + path); }
  await p.waitForTimeout(o.wait ?? 3200);
  for (let i = 0; i < 4; i++) { const r = p.getByRole("button", { name: /Remind me in 24 h/ }); if (await r.count()) { await r.first().click().catch(() => {}); await p.waitForTimeout(500); } }
  if (!o.keepHouse) {
    await p.getByRole("button", { name: /^Amiens/ }).first().click().catch(() => {}); await p.waitForTimeout(1500);
  }
  if (o.act) await o.act();
  await p.screenshot({ path: `${OUT}/${name}.png`, fullPage: !!o.full });
  console.log("ok", name);
};
(async () => {
  const b = await chromium.launch();
  const V = { width: 1366, height: 980 };
  // ---- Admin (Manager)
  const a = await session(b, "siobhan.murphy@demo.ds-lodge.test", V);
  const dlgClose = async () => { await a.keyboard.press("Escape"); await a.waitForTimeout(500); };
  await shot(a, "01-home", "/");
  await shot(a, "02-daily-tasks", "/tasks");
  await shot(a, "03-residents", "/residents");
  await shot(a, "03b-admit", "/residents", { act: async () => { await a.getByRole("button", { name: "Admit resident" }).click(); await a.waitForTimeout(900); } });
  await dlgClose();
  await shot(a, "04-resident-profile", "/residents", { act: async () => { await a.locator("table a, .list a").first().click(); await a.waitForTimeout(3000); } });
  await shot(a, "05-room-check", "/sheet");
  await shot(a, "06-seen", "/seen");
  await shot(a, "07-absences", "/absences");
  await shot(a, "08-no-shows", "/no-shows");
  await shot(a, "09-warnings", "/warnings");
  await shot(a, "10-bed-map", "/beds");
  await shot(a, "11-handover", "/handover");
  await shot(a, "11b-handover-note", "/handover", { act: async () => { await a.getByRole("button", { name: /New note|Add note|New entry/ }).first().click().catch(() => {}); await a.waitForTimeout(900); } });
  await dlgClose();
  await shot(a, "12-maintenance", "/maintenance");
  await shot(a, "12b-maintenance-new", "/maintenance", { act: async () => { await a.getByRole("button", { name: "New request" }).click(); await a.waitForTimeout(900); } });
  await dlgClose();
  await shot(a, "13-fridge", "/fridge");
  await shot(a, "14-deliveries", "/deliveries");
  await shot(a, "15-dinner", "/dinner");
  await shot(a, "17-notifications", "/notifications");
  await shot(a, "18-roster", "/rota");
  await shot(a, "19-purchases", "/purchases");
  await shot(a, "20-hours", "/hours");
  await shot(a, "21-holidays", "/vacations");
  await shot(a, "22-reports", "/reports");
  await shot(a, "23-people", "/users");
  await shot(a, "24-audit", "/audit");
  await shot(a, "25-structure", "/structure");
  await shot(a, "26-settings", "/settings");
  for (const [n, label] of [["26b-settings-handover", /Handover/], ["26c-settings-system", /System/], ["26d-settings-notifications", /Notifications/]]) {
    await shot(a, n, "/settings", { act: async () => { await a.getByRole("tab", { name: label }).first().click().catch(async () => { await a.getByRole("button", { name: label }).first().click(); }); await a.waitForTimeout(1200); } });
  }
  await shot(a, "16-laundry", "/laundry", { keepHouse: true });
  await shot(a, "27-switch-house", "/", { keepHouse: true, act: async () => { await a.getByRole("button", { name: /Connolly/ }).first().click().catch(() => {}); await a.waitForTimeout(2500); } });
  await shot(a, "28-dark", "/", { keepHouse: true, act: async () => { await a.getByRole("button", { name: /theme|dark|Dark/i }).first().click().catch(() => {}); await a.waitForTimeout(1200); } });
  // ---- Staff (conta de casa) no celular
  const m = await session(b, "amiens.reception@demo.ds-lodge.test", { width: 390, height: 844 });
  await shot(m, "30-mobile-home", "/");
  await shot(m, "31-mobile-handover", "/handover");
  await shot(m, "32-mobile-room-check", "/sheet");
  // ---- Staff no computador
  const s = await session(b, "amiens.reception@demo.ds-lodge.test", V);
  await shot(s, "33-staff-home", "/");
  await b.close();
})().catch((e) => { console.error(e); process.exit(1); });
