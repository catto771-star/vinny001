// Regra permanente: nenhum texto sai da sua caixa (nem a página rola de lado) em nenhuma tela.
// Percorre todas as rotas, nos temas claro e escuro, nas duas casas e em celular, tablet e computador.
// Uso: DEMO_PASSWORD=... NODE_USE_ENV_PROXY=1 node tests/e2e/text-overflow.e2e.cjs   (app em E2E_BASE_URL, padrão :4173)
// Sai com código 1 se achar qualquer estouro.
const { chromium } = require("playwright");
const BASE = process.env.E2E_BASE_URL ?? "http://localhost:4173";
const DEMO_PASSWORD = process.env.DEMO_PASSWORD;
if (!DEMO_PASSWORD) throw new Error("Defina DEMO_PASSWORD");
let FOUND = 0;
const proxy = { server: process.env.HTTPS_PROXY, bypass: "localhost,127.0.0.1" };
const ROUTES = ["/", "/tasks", "/notifications", "/residents", "PROFILE", "/sheet", "/seen", "/absences", "/no-shows", "/warnings", "/beds",
  "/handover", "/maintenance", "/fridge", "/deliveries", "/dinner", "/laundry", "/rota", "/purchases", "/hours", "/vacations", "/reports", "/users", "/audit", "/settings", "/settings?tab=registers", "/settings?tab=registers&reg=suppliers"];
function audit() {
  const out = [];
  const isBox = (cs) => {
    const bg = cs.backgroundColor, hasBg = bg && bg !== "transparent" && !/rgba\(.*,\s*0\)$/.test(bg);
    return hasBg || parseFloat(cs.borderTopWidth) > 0 || cs.backgroundImage !== "none" || cs.overflow !== "visible";
  };
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  let n;
  while ((n = walker.nextNode())) {
    if (!n.textContent.trim()) continue;
    const el = n.parentElement; if (!el || el.closest("svg,dialog:not([open]),.sr-only,[aria-hidden=true]")) continue;
    const cs0 = getComputedStyle(el); if (cs0.visibility === "hidden" || cs0.display === "none") continue;
    let box = el; while (box && box !== document.body && !isBox(getComputedStyle(box))) box = box.parentElement;
    if (!box || box === document.body || box.matches(".sidebar,.ruler-now")) continue;
    { const o = getComputedStyle(box); if (/(auto|scroll)/.test(o.overflowX)) continue; }
    const b = box.getBoundingClientRect(), cs = getComputedStyle(box);
    if (b.width === 0 || b.height === 0) continue;
    const range = document.createRange(); range.selectNodeContents(n);
    for (const r0 of range.getClientRects()) {
      if (r0.width < 1) continue;
      const pad = r0.height * 0.22; const r = { l: r0.left, rt: r0.right, t: r0.top + pad, bt: r0.bottom - pad };
      let why = null;
      if (r.l < b.left - 1 || r.rt > b.right + 1) why = "horizontal";
      else if (r.t < b.top - 1 || r.bt > b.bottom + 1) why = "vertical";
      else {
        const rad = Math.min(parseFloat(cs.borderTopLeftRadius) || 0, b.height / 2, b.width / 2);
        if (rad > 4) for (const [x, y] of [[r.l, r.t], [r.rt, r.t], [r.l, r.bt], [r.rt, r.bt]]) {
          const cx = x < b.left + rad ? b.left + rad : x > b.right - rad ? b.right - rad : null;
          const cy = y < b.top + rad ? b.top + rad : y > b.bottom - rad ? b.bottom - rad : null;
          if (cx !== null && cy !== null && Math.hypot(x - cx, y - cy) > rad + 0.5) { why = "corner"; break; }
        }
      }
      if (why) { out.push(`${why}: "${n.textContent.trim().slice(0, 40)}" in <${box.tagName.toLowerCase()} class="${box.className}">`); break; }
    }
  }
  if (document.documentElement.scrollWidth > innerWidth + 1) out.push(`page scrolls sideways: ${document.documentElement.scrollWidth} > ${innerWidth}`);
  return [...new Set(out)];
}
(async () => {
  const b = await chromium.launch();
  let total = 0;
  const VIEWS = [["mobile", { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 }], ["tablet", { viewport: { width: 820, height: 1100 } }], ["desktop", { viewport: { width: 1440, height: 900 } }]];
  for (const [kind, opts] of VIEWS) {
    for (const theme of ["dark", "light"]) {
      for (const house of ["amiens", "connolly"]) {
        const ctx = await b.newContext({ ...opts, proxy });
        const p = await ctx.newPage();
        await p.addInitScript(([t, h]) => { localStorage.setItem("ui.theme", t); }, [theme, house]);
        p.addLocatorHandler(p.getByRole("dialog").filter({ hasText: /Tasks waiting for you/ }), async () => { await p.getByRole("button", { name: /^Later$/ }).click(); });
        p.addLocatorHandler(p.getByRole("dialog").filter({ hasText: /Deadline passed/ }), async (d) => { await d.getByRole("button", { name: /Remind me in 24 h/ }).click(); }, { noWaitAfter: true });
        await p.goto(BASE);
        await p.getByLabel("Email").fill("sean.murphy@demo.ds-lodge.test");
        await p.getByLabel("Password").fill(DEMO_PASSWORD);
        await p.getByRole("button", { name: "Sign in" }).click();
        total++;
        await p.locator(".content").waitFor({ timeout: 30000 });
        await p.addStyleTag({ content: "dialog[open]{display:none!important}" });
        await p.locator(".topbar").getByRole("button", { name: new RegExp(`^${house}`, "i") }).first().click().catch(() => {});
        await p.waitForTimeout(800);
        for (const route of ROUTES) {
          let url = route;
          if (route === "PROFILE") { await p.goto(BASE + "/residents"); await p.waitForTimeout(2500); url = (await p.locator('a[href^="/residents/"]').first().getAttribute("href").catch(() => null)) ?? "/residents"; }
          await p.goto(BASE + url); await p.waitForTimeout(2500);
          await p.addStyleTag({ content: "dialog[open]{display:none!important}" });
          const issues = await p.evaluate(audit);
          for (const i of issues) { FOUND++; console.log(`${kind}/${theme}/${house} ${route} ${i}`); }
        }
        await ctx.close();
      }
    }
  }
  console.log(FOUND ? `FAIL: ${FOUND} estouro(s)` : "PASS: nenhum texto fora da caixa");
  process.exitCode = FOUND ? 1 : 0;
  await b.close();
})();
