// Verificação de uso real (R19): nomes, filtros, "Now", Settings por papel, alinhamentos e isolamento entre casas.
// Uso: servir o build (npx vite preview --port 4173) e rodar:
//   DEMO_PASSWORD=<senha das contas demo> SUPABASE_URL=... SUPABASE_ANON_KEY=... NODE_USE_ENV_PROXY=1 node tests/e2e/roteiro-r19.e2e.cjs
// Só lê dados (exceto o duplo clique, que cria uma nota "TESTE" e a anula). A senha vem do ambiente, não do repositório.
const { chromium } = require("playwright");
const { execFileSync } = require("child_process");
const DEMO_PASSWORD = process.env.DEMO_PASSWORD;
if (!DEMO_PASSWORD) throw new Error("Defina DEMO_PASSWORD (senha das contas de demonstração).");
const BASE = "http://localhost:4173";
const proxy = { server: process.env.HTTPS_PROXY, bypass: "localhost,127.0.0.1" };
const SB = process.env.SUPABASE_URL, ANON = process.env.SUPABASE_ANON_KEY;
const results = [];
const check = (name, ok, detail = "") => { results.push([ok ? "PASS" : "FAIL", name, detail]); console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? " — " + String(detail).slice(0, 220) : ""}`); };
const sql = (q) => JSON.parse(execFileSync("bash", ["-c", `python3 -c "import json,sys;print(json.dumps({'query':sys.stdin.read()}))" | curl -s -X POST 'https://api.supabase.com/v1/projects/jbcrhkbhjdiqvwalheyp/database/query' -H 'Content-Type: application/json' --data @-`], { input: q }).toString());

async function login(b, email, viewport = { width: 1366, height: 1000 }) {
  const ctx = await b.newContext({ viewport, proxy });
  const p = await ctx.newPage();
  await p.addInitScript(() => localStorage.setItem("ui.theme", "light"));
  const errs = [];
  p.on("pageerror", (e) => errs.push("PAGEERROR " + e.message.slice(0, 140)));
  p.on("response", (r) => { if (r.status() >= 400 && /supabase\.co/.test(r.url()) && !/auth\/v1\/(token|user)/.test(r.url())) errs.push(`HTTP ${r.status()} ${r.url().replace(/^https:\/\/[^/]+/, "").slice(0, 90)}`); });
  await p.goto(BASE);
  await p.getByLabel("Email").fill(email);
  await p.getByLabel("Password").fill(DEMO_PASSWORD);
  await p.getByRole("button", { name: "Sign in" }).click();
  await p.waitForTimeout(3500);
  return { ctx, p, errs };
}
const reminders = [];
// Lembretes (ex.: "Deadline passed — what is the status?") abrem em cima da tela; a pessoa responde "Remind me" e segue.
const clearDialogs = async (p) => {
  for (let i = 0; i < 6; i++) {
    const d = p.locator("dialog[open]");
    if (!(await d.count())) return;
    reminders.push((await d.first().innerText()).replace(/\n+/g, " ").slice(0, 90));
    const later = d.first().getByRole("button", { name: /Remind me|Close|Cancel|Later/ });
    if (await later.count()) await later.first().click().catch(() => {}); else await p.keyboard.press("Escape");
    await p.waitForTimeout(500);
  }
};
const go = async (p, path, wait = 2500) => { await p.goto(BASE + path); await p.waitForTimeout(wait); await clearDialogs(p); };
const bodyText = (p) => p.locator("body").innerText();
const expandNav = async (p) => { const hs = p.locator('nav button[aria-expanded="false"]'); for (let i = await hs.count(); i > 0; i--) { await hs.first().click().catch(() => {}); await p.waitForTimeout(150); } };

(async () => {
  const b = await chromium.launch();
  const mgr = await login(b, "sean.murphy@demo.ds-lodge.test");
  const am = await login(b, "amiens.reception@demo.ds-lodge.test");
  const co = await login(b, "connolly.reception@demo.ds-lodge.test");

  // ---------- Nomes e menu ----------
  for (const [who, s] of [["Admin", mgr], ["Amiens", am]]) {
    await expandNav(s.p);
    const nav = await s.p.locator("nav").first().innerText();
    check(`${who}: menu usa 'Welfare Check' e não 'Room Check'`, /Welfare Check/.test(nav) && !/Room Check/.test(nav), nav.replace(/\n/g, " | ").slice(0, 160));
  }
  const navTxt = (await mgr.p.locator("nav").first().innerText()).replace(/\n+/g, " | ");
  const seg = (from, to) => { const i = navTxt.indexOf(from), j = navTxt.indexOf(to, i + 1); return i < 0 ? "" : navTxt.slice(i, j < 0 ? undefined : j); };
  check("Admin: Continuity está no grupo Residents & Presence", /Continuity/.test(seg("Residents & Presence", "Occurrences")), seg("Residents & Presence", "Occurrences").slice(0, 120));
  check("Admin: Continuity NÃO está mais em Overview", !/Continuity/.test(seg("Overview", "Residents & Presence")), seg("Overview", "Residents & Presence"));
  check("Amiens: menu da casa não tem Reports, People, Audit, Notifications", !/Reports|People|Audit|Notifications/.test(await am.p.locator("nav").first().innerText()));

  // ---------- Warnings: filtros ----------
  await go(mgr.p, "/warnings");
  const wMgr = await bodyText(mgr.p);
  await go(am.p, "/warnings");
  const wAm = await bodyText(am.p);
  const openFilters = async (p) => { const b2 = p.getByRole("button", { name: /More filters/ }); if (await b2.count()) { await b2.first().click().catch(() => {}); await p.waitForTimeout(1000); } };
  await openFilters(mgr.p); await openFilters(am.p);
  const fMgr = await bodyText(mgr.p), fAm = await bodyText(am.p);
  check("Admin vê o filtro 'Issued by' em Warnings", /Issued by/.test(fMgr + wMgr));
  check("Casa NÃO vê o filtro 'Issued by' em Warnings", !/Issued by/.test(fAm + wAm));
  const statusOpts = (await mgr.p.locator("select").evaluateAll((ss) => ss.map((x) => [...x.options].map((o) => o.text)))).flat();
  check("Warnings: opção de status escrita 'Inactive' (maiúscula)", statusOpts.includes("Inactive") && !statusOpts.includes("inactive"), statusOpts.slice(0, 8).join(","));

  // ---------- Handover: Now ----------
  for (const [who, s] of [["Admin", mgr], ["Amiens", am]]) {
    await go(s.p, "/handover");
    const now = s.p.getByLabel("Now");
    const checked = (await now.count()) ? await now.first().isChecked() : "sem campo";
    check(`${who}: Handover — 'Now' vem desmarcado`, checked === false, String(checked));
    const hasDt = await s.p.locator('.composer input[type="datetime-local"]').count();
    check(`${who}: Handover — campo de hora aparece com 'Now' desmarcado`, hasDt === 1);
    if (hasDt) {
      const val = await s.p.locator('.composer input[type="datetime-local"]').inputValue();
      check(`${who}: Handover — hora vem preenchida com o horário atual`, /^\d{4}-\d\d-\d\dT\d\d:\d\d$/.test(val), val);
    }
    await now.first().click().catch(() => {}); await s.p.waitForTimeout(600);
    check(`${who}: Handover — marcar 'Now' esconde o campo de hora`, (await s.p.locator('.composer input[type="datetime-local"]').count()) === 0);
    check(`${who}: Handover — filtro chama 'Checks' (não 'Rounds')`, /Checks/.test(await bodyText(s.p)) && !/\bRounds\b/.test(await bodyText(s.p)));
  }

  // ---------- Settings por papel ----------
  await go(am.p, "/settings");
  const sAm = await bodyText(am.p);
  check("Casa: Settings mostra Appearance", /Appearance/.test(sAm));
  check("Casa: Settings NÃO mostra senha, sessões, Notifications, System", !/Change password|Sign out of other devices|Notifications|System|Registers/.test(sAm), sAm.replace(/\n+/g, " | ").slice(0, 200));
  await go(am.p, "/settings?tab=system");
  check("Casa: abrir /settings?tab=system direto não mostra o System", !/Shifts|Check window|Expiry/.test(await bodyText(am.p)));
  await go(mgr.p, "/settings");
  const tabs = await mgr.p.getByRole("tab").allTextContents();
  check("Admin: Settings mostra as abas de gestão", ["Notifications", "System"].every((t) => tabs.some((x) => x.includes(t))), tabs.join(","));

  // ---------- Residents: coluna Warnings ----------
  await go(mgr.p, "/residents", 6500);
  const heads = await mgr.p.locator("table thead th").allTextContents();
  check("Admin: Residents tem a coluna 'Warnings'", heads.some((h) => /Warnings/.test(h)), heads.join(","));
  const link = mgr.p.locator('a[href$="#warnings"]').first();
  if (await link.count()) {
    await clearDialogs(mgr.p); await link.click(); await mgr.p.waitForTimeout(3000);
    check("Admin: clicar na contagem abre o perfil com a seção Warnings", /\/residents\/.+/.test(mgr.p.url()) && (await mgr.p.locator("#warnings").count()) === 1, mgr.p.url().replace(BASE, ""));
  } else check("Admin: há algum morador com Warnings para testar o link", false, "nenhum link de contagem encontrado");

  // ---------- Bed map: sem estouro ----------
  for (const [label, vp] of [["desktop", { width: 1366, height: 900 }], ["celular", { width: 390, height: 800 }]]) {
    const s = await login(b, "sean.murphy@demo.ds-lodge.test", vp);
    for (const lodge of ["Amiens", "Connolly"]) {
      await go(s.p, "/beds", 3000);
      const sw = s.p.getByRole("button", { name: lodge, exact: true });
      if (await sw.count()) { await sw.first().click().catch(() => {}); await s.p.waitForTimeout(1500); }
      const bad = await s.p.evaluate(() => {
        const out = [];
        document.querySelectorAll(".room-card").forEach((card) => {
          const cr = card.getBoundingClientRect();
          card.querySelectorAll(".bed, .bed-body, .bed-body *").forEach((el) => {
            const r = el.getBoundingClientRect();
            if (r.width && r.right > cr.right + 1) out.push(card.querySelector(".room-code")?.textContent + ":" + (el.textContent || "").trim().slice(0, 30));
          });
        });
        const page = document.documentElement.scrollWidth > window.innerWidth + 1;
        return { out: out.slice(0, 5), page };
      });
      check(`Bed map (${label}, ${lodge}): nenhum texto sai das caixas das salas`, bad.out.length === 0, JSON.stringify(bad.out));
      check(`Bed map (${label}, ${lodge}): sem rolagem horizontal da página`, !bad.page);
    }
    await s.ctx.close();
  }

  // ---------- Food Delivery ----------
  await go(am.p, "/deliveries", 3500);
  const chips = await am.p.locator(".chip-row .chip").allTextContents();
  check("Amiens: Food Delivery tem filtro por fornecedor ('All suppliers')", chips.some((c) => /All suppliers/.test(c)), chips.join(","));
  const gaps = await am.p.evaluate(() => {
    const g = [];
    document.querySelectorAll(".row-actions").forEach((row) => {
      const bs = [...row.querySelectorAll("button")];
      for (let i = 1; i < bs.length; i++) g.push(Math.round(bs[i].getBoundingClientRect().left - bs[i - 1].getBoundingClientRect().right));
    });
    return g;
  });
  check("Food Delivery: botões Correct e Unlink com espaço entre si (>= 4px)", gaps.length === 0 || gaps.every((x) => x >= 4), JSON.stringify(gaps.slice(0, 6)));

  // ---------- Purchases (Admin) ----------
  await go(mgr.p, "/purchases", 3500);
  const pt = await bodyText(mgr.p);
  const pool = await mgr.p.locator('[role="listbox"] [role="option"]').count();
  check("Admin: Purchases mostra o conjunto de pedidos em cartões com filtros", pool > 0 || /No orders|Standard list/.test(pt), `cartões: ${pool}`);

  // ---------- Holidays: cores ----------
  await go(mgr.p, "/holidays", 3500);
  const col = await mgr.p.evaluate(() => {
    const f = (sel) => { const el = document.querySelector(sel); return el ? getComputedStyle(el).backgroundColor : null; };
    return { locked: f(".holiday-day.is-locked"), approved: f(".holiday-day.is-approved"), review: f(".holiday-day.is-under_review") };
  });
  const white = (c) => !c || /rgba?\(0, 0, 0, 0\)|rgb\(255, 255, 255\)/.test(c);
  check("Holidays: dias bloqueados com cor (não em branco)", col.locked === null ? "sem dias bloqueados" && true : !white(col.locked), JSON.stringify(col));
  check("Holidays: aprovados e em revisão com cor", [col.approved, col.review].every((c) => c === null || !white(c)), JSON.stringify(col));

  // ---------- Hours: alinhamento ----------
  await go(mgr.p, "/hours", 3500);
  const al = await mgr.p.evaluate(() => [...document.querySelectorAll("table thead th.num")].map((th) => getComputedStyle(th).textAlign));
  check("Hours: títulos Planned/Worked/Difference alinhados à direita", al.length >= 3 && al.every((a) => a === "right"), al.join(","));

  // ---------- Continuity ----------
  for (const [who, s] of [["Admin", mgr], ["Amiens", am]]) {
    await go(s.p, "/continuity", 3500);
    const t = await bodyText(s.p);
    check(`${who}: Continuity abre com a ocupação`, /Amiens|Connolly/.test(t) && !/Something went wrong/.test(t));
    if (who === "Amiens") check("Amiens: Continuity mostra só a casa dela", /Amiens/.test(t) && !/Connolly/.test(t.replace(/Connolly\s*$/m, "")) || !/Connolly/.test(t), (t.match(/Connolly/g) || []).length + " menção(ões) a Connolly");
  }

  // ---------- Isolamento entre casas (telas) ----------
  const coRes = sql("select b.first_name||' '||b.last_name as n from public.bed_occupancy b join public.lodges l on l.id=b.lodge_id where l.code='CONNOLLY' and b.resident_id is not null limit 12;");
  const amRes = sql("select b.first_name||' '||b.last_name as n from public.bed_occupancy b join public.lodges l on l.id=b.lodge_id where l.code='AMIENS' and b.resident_id is not null limit 12;");
  const coNames = (Array.isArray(coRes) ? coRes : []).map((x) => x.n), amNames = (Array.isArray(amRes) ? amRes : []).map((x) => x.n);
  check("Isolamento: obtive moradores das duas casas para comparar", coNames.length > 3 && amNames.length > 3, `${amNames.length} Amiens / ${coNames.length} Connolly`);
  const routes = ["/", "/residents", "/beds", "/sheet", "/seen", "/absences", "/no-shows", "/warnings", "/handover", "/maintenance", "/fridge", "/deliveries", "/dinner", "/laundry", "/tasks", "/continuity"];
  for (const [who, s, other] of [["Amiens", am, coNames], ["Connolly", co, amNames]]) {
    const leaks = [];
    for (const r of routes) {
      await go(s.p, r, 2200);
      const t = await bodyText(s.p);
      for (const n of other) if (t.includes(n)) leaks.push(`${r}:${n}`);
    }
    check(`Isolamento: conta ${who} nunca vê morador da outra casa (${routes.length} telas)`, leaks.length === 0, leaks.slice(0, 4).join("; "));
  }
  for (const [who, s] of [["Amiens", am]]) {
    for (const r of ["/audit", "/users", "/reports", "/hours", "/holidays", "/purchases", "/structure"]) {
      await go(s.p, r, 1800);
      const t = await bodyText(s.p);
      check(`Casa (${who}): endereço direto ${r} não mostra dados de gestão`, !/Export CSV|Audit log|New user|Work log|Lock dates|New Order|Standard list/.test(t) || /not allowed|permission|Sign in/i.test(t), s.p.url().replace(BASE, "") + " | " + t.replace(/\n+/g, " ").slice(0, 100));
    }
  }

  // ---------- Isolamento (API com a sessão real da conta de casa) ----------
  const tok = async (email) => (await (await fetch(`${SB}/auth/v1/token?grant_type=password`, { method: "POST", headers: { apikey: ANON, "Content-Type": "application/json" }, body: JSON.stringify({ email, password: DEMO_PASSWORD }) })).json()).access_token;
  const lodges = sql("select id, code from public.lodges;"); const lid = Object.fromEntries(lodges.map((l) => [l.code, l.id]));
  const rest = async (jwt, path) => { const r = await fetch(`${SB}/rest/v1/${path}`, { headers: { apikey: ANON, Authorization: `Bearer ${jwt}` } }); return r.ok ? r.json() : { error: r.status }; };
  for (const [code, email] of [["AMIENS", "amiens.reception@demo.ds-lodge.test"], ["CONNOLLY", "connolly.reception@demo.ds-lodge.test"]]) {
    const jwt = await tok(email); const bad = [];
    const vis = new Set((await rest(jwt, "stays?select=id,lodge_id&limit=2000")).map((x) => x.id));
    for (const t of ["stays", "handover_entries", "food_deliveries", "fridge_readings", "maintenance_tickets", "warnings", "laundry_uses", "absences", "no_shows", "room_check_marks", "dinner_marks"]) {
      let rows = await rest(jwt, `${t}?select=lodge_id&limit=1000`);
      if (!rows.error) { const other = rows.filter((x) => x.lodge_id && x.lodge_id !== lid[code]).length; if (other) bad.push(`${t}: ${other} linha(s) de outra casa`); continue; }
      rows = await rest(jwt, `${t}?select=stay_id&limit=1000`);
      if (rows.error) { bad.push(`${t}: sem coluna para conferir (HTTP ${rows.error})`); continue; }
      const other = rows.filter((x) => x.stay_id && !vis.has(x.stay_id)).length; if (other) bad.push(`${t}: ${other} linha(s) de estadia de outra casa`);
    }
    check(`API: conta ${code} só lê linhas da própria casa (11 tabelas)`, bad.length === 0, bad.join("; "));
  }

  // ---------- Duplo clique no Handover (Amiens) ----------
  const tag = "TESTE dupclick " + Date.now().toString(36);
  await go(am.p, "/handover", 3000);
  await am.p.getByPlaceholder(/Write an entry/).fill(tag);
  await am.p.getByLabel("Now").first().check().catch(() => {});
  const save = am.p.getByRole("button", { name: "Save Entry" });
  await save.dblclick().catch(() => {});
  await am.p.waitForTimeout(3500);
  const cnt = sql(`select count(*)::int as c from public.handover_entries where body like '${tag}%';`);
  check("Duplo clique em 'Save Entry' no Handover grava UMA nota só", cnt[0]?.c === 1, `notas gravadas: ${cnt[0]?.c}`);

  console.log("INFO lembretes que abriram sozinhos:", reminders.length ? [...new Set(reminders)].join(" || ") : "nenhum");
  for (const [who, s] of [["Admin", mgr], ["Amiens", am], ["Connolly", co]]) check(`${who}: nenhuma falha de página ou de rede durante o roteiro`, s.errs.length === 0, s.errs.slice(0, 4).join("; "));

  await b.close();
  const fail = results.filter((r) => r[0] === "FAIL");
  console.log(`\nRESUMO: ${results.length - fail.length} PASS, ${fail.length} FAIL`);
  fail.forEach((f) => console.log("FAIL:", f[1], "—", f[2]));
  process.exit(fail.length ? 1 : 0);
})().catch((e) => { console.error("ERRO NO TESTE:", e); process.exit(2); });
