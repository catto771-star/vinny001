// Revisão 16 de ponta a ponta: login renomeado, Home (período, recolher, pendências), folha de continuidade sem internet.
// Uso: DEMO_PASSWORD=... NODE_USE_ENV_PROXY=1 node tests/e2e/scenarios-r16.e2e.cjs  (app em :4173, produção semeada)
const { chromium } = require("playwright");
const PW = process.env.DEMO_PASSWORD; if (!PW) throw new Error("Defina DEMO_PASSWORD");
const BASE = process.env.E2E_BASE_URL ?? "http://localhost:4173";
const proxy = process.env.HTTPS_PROXY ? { server: process.env.HTTPS_PROXY, bypass: "localhost,127.0.0.1" } : undefined;
const results = [];
const step = async (name, fn) => { try { results.push(["PASS", name, (await fn()) ?? ""]); } catch (e) { results.push(["FAIL", name, String(e.message).split("\n")[0].slice(0, 170)]); } };
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1366, height: 1000 }, proxy });
  const p = await ctx.newPage();
  await p.addInitScript(() => localStorage.setItem("ui.theme", "light"));
  p.addLocatorHandler(p.getByRole("dialog").filter({ hasText: /Tasks waiting for you/ }), async () => { await p.getByRole("button", { name: /^Later$/ }).click(); });
  p.addLocatorHandler(p.getByRole("dialog").filter({ hasText: /Deadline passed/ }), async (d) => { await d.getByRole("button", { name: /Remind me in 24 h/ }).click(); }, { noWaitAfter: true });
  await step("Login com o e-mail renomeado (Seán Murphy)", async () => {
    await p.goto(BASE);
    await p.getByLabel("Email").fill("sean.murphy@demo.ds-lodge.test"); await p.getByLabel("Password").fill(PW);
    await p.getByRole("button", { name: "Sign in" }).click();
    await p.locator(".content").waitFor({ timeout: 30000 });
    await p.waitForTimeout(3500);
    return (await p.locator(".today-meta").innerText()).slice(0, 60);
  });
  await step("Nenhum nome feminino nas listas (residentes e equipe, exceto Cleaners)", async () => {
    await p.goto(BASE + "/residents"); await p.waitForTimeout(3000);
    const txt = await p.locator(".content").innerText();
    const bad = txt.match(/\b(Aoife|Chiamaka|Oksana|Fatima|Larisa|Bruna|Siobhra|Agnieszka|Amina|Gabriela|Ioana|Rafaela|Róisín|Leticia|Ciara|Natalia|Juliana|Nkechi|Mariana|Orla|Beatriz|Iryna|Kateryna)\b/g);
    if (bad) throw new Error("nomes femininos: " + [...new Set(bad)].join(", "));
    await p.goto(BASE + "/users"); await p.waitForTimeout(3000);
    const staff = await p.locator(".content").innerText();
    const bad2 = staff.match(/\b(Niamh|Marta|Siobhán|Aoife)\b/g);
    if (bad2) throw new Error("equipe: " + bad2.join(", "));
    return "ok";
  });
  await step("Home: filtro 30d muda o título e é lembrado; 7d idem", async () => {
    await p.goto(BASE); await p.waitForTimeout(3500);
    await p.getByRole("button", { name: "30d" }).click(); await p.waitForTimeout(2500);
    await p.getByRole("img", { name: "Occupancy · last 30 days" }).waitFor({ timeout: 8000 });
    await p.reload(); await p.waitForTimeout(3500);
    await p.getByRole("img", { name: "Occupancy · last 30 days" }).waitFor({ timeout: 8000 });
    await p.getByRole("button", { name: "7d" }).click(); await p.waitForTimeout(2500);
    return (await p.getByRole("img", { name: /Occupancy · last 7 days/ }).count()) === 1 ? "ok" : (() => { throw new Error("7d não aplicou"); })();
  });
  await step("Home: período personalizado abre o seletor e aplica", async () => {
    await p.getByRole("button", { name: "Custom period" }).click();
    const to = new Date().toISOString().slice(0, 10), from = new Date(Date.now() - 20 * 864e5).toISOString().slice(0, 10);
    const pop = p.locator(".period-pop");
    await pop.getByLabel("From").fill(from); await pop.getByLabel("To").fill(to);
    await pop.getByRole("button", { name: "Apply" }).click(); await p.waitForTimeout(2500);
    return (await p.locator(".dash").innerText()).match(/Occupancy · \d\d\/\d\d–\d\d\/\d\d/)?.[0] ?? (() => { throw new Error("título do período não mudou"); })();
  });
  await step("Home: cartões recolhem (dados em uma linha) e o estado fica após recarregar", async () => {
    await p.getByRole("button", { name: /^Collapse all$/ }).click(); await p.waitForTimeout(800);
    const txt = await p.locator(".dash").innerText();
    if (!/beds · \d+% seen/.test(txt)) throw new Error("sem resumo: " + txt.slice(0, 120).replace(/\n/g, " "));
    await p.reload(); await p.waitForTimeout(3500);
    if (!(await p.getByRole("button", { name: "Expand all" }).count())) throw new Error("não lembrou o recolhimento");
    await p.getByRole("button", { name: "Expand all" }).click(); await p.waitForTimeout(600);
    return "ok";
  });
  await step("Pendências: botão moderno com contador e seta redonda", async () => {
    await p.goto(BASE); await p.waitForTimeout(3500);
    const n = await p.locator(".pending-list a .pending-go").count();
    return n > 0 ? `${n} linhas` : (() => { throw new Error("sem linhas de pendência"); })();
  });
  await step("Continuidade: página abre e lista os residentes com a chamada de incêndio", async () => {
    await p.goto(BASE + "/continuity"); await p.waitForTimeout(3500);
    const boxes = await p.locator(".rollbox").count();
    if (boxes < 20) throw new Error("poucos quadradinhos: " + boxes);
    return boxes + " quadradinhos";
  });
  await step("Continuidade: sem internet abre a cópia guardada", async () => {
    await p.reload(); await p.waitForTimeout(3000);  // 2ª visita: o service worker guarda os arquivos
    await ctx.setOffline(true);
    await p.goto(BASE + "/continuity", { waitUntil: "domcontentloaded" }).catch(() => {});
    await p.waitForTimeout(2500);
    const txt = await p.locator("body").innerText();
    await ctx.setOffline(false);
    if (!/No internet\. Showing the last copy/.test(txt)) throw new Error("não mostrou a cópia: " + txt.slice(0, 120).replace(/\n/g, " "));
    if (!/Saved copy from/.test(txt)) throw new Error("sem data da cópia");
    return "ok";
  });
  await b.close();
  for (const r of results) console.log(`${r[0]} | ${r[1]} | ${r[2]}`);
  process.exitCode = results.some((r) => r[0] === "FAIL") ? 1 : 0;
})();
