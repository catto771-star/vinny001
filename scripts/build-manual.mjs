// Gera os manuais em PDF (pt, en, pl) a partir de docs/manual/content.mjs e dos prints em docs/manual/shots.
// Uso: node scripts/build-manual.mjs   (precisa de Playwright/Chromium e de python3 com PIL para reduzir as imagens)
import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";
import { UI, SECTIONS } from "../docs/manual/content.mjs";
const require = createRequire(import.meta.url);
const { chromium } = require("playwright");

const root = path.resolve(import.meta.dirname, "..");
const shots = path.join(root, "docs/manual/shots"), web = path.join(root, "docs/manual/web");
mkdirSync(web, { recursive: true });
// imagens menores (JPEG) para o PDF não ficar enorme
execFileSync("python3", ["-c", `
import glob, os
from PIL import Image
for f in glob.glob("${shots}/*.png"):
    out = "${web}/" + os.path.basename(f)[:-4] + ".jpg"
    if os.path.exists(out): continue
    im = Image.open(f).convert("RGB")
    w = 1500 if im.width > 1000 else im.width
    im = im.resize((w, int(im.height * w / im.width)), Image.LANCZOS)
    im.save(out, "JPEG", quality=82, optimize=True)
`]);
const logo = "data:image/png;base64," + readFileSync(path.join(root, "public/logo.png")).toString("base64");
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const img = (n, cls = "") => (existsSync(`${web}/${n}.jpg`) ? `<img class="shot ${cls}" src="file://${web}/${n}.jpg">` : "");

const CSS = `
@page { size: A4; margin: 16mm 14mm 18mm; }
* { box-sizing: border-box; }
body { font-family: Inter, "DejaVu Sans", sans-serif; color: #231a12; font-size: 10.5pt; line-height: 1.5; margin: 0; }
h1,h2,h3 { margin: 0; line-height: 1.2; }
.cover { height: 255mm; display: flex; flex-direction: column; justify-content: center; align-items: flex-start; page-break-after: always; }
.cover img.logo { width: 38mm; margin-bottom: 14mm; }
.cover h1 { font-size: 34pt; font-weight: 600; color: #a64b0a; }
.cover h2 { font-size: 16pt; font-weight: 500; margin-top: 4mm; }
.cover p { font-size: 12pt; color: #6b5a4b; margin-top: 10mm; }
.cover .bar { width: 60mm; height: 3mm; background: linear-gradient(90deg,#c2570c,#e8a054); border-radius: 2mm; margin-top: 8mm; }
h2.part { font-size: 21pt; color: #a64b0a; margin: 0 0 6mm; padding-bottom: 3mm; border-bottom: 2px solid #e8a054; }
.page-break { page-break-before: always; }
.toc { columns: 1; }
.toc .grp { font-weight: 600; margin: 5mm 0 1.5mm; color: #a64b0a; }
.toc div.i { display: flex; justify-content: space-between; border-bottom: 1px dotted #c9b9a8; padding: 0.7mm 0; }
.intro h3 { font-size: 12.5pt; color: #a64b0a; margin: 5mm 0 1mm; }
.intro p { margin: 0; }
.sec { page-break-before: always; break-inside: avoid; }
.sec h3 { font-size: 17pt; color: #231a12; }
.badge { display: inline-block; font-size: 8pt; background: #f6e5d0; color: #8a3f08; border-radius: 10px; padding: 0.5mm 3mm; margin: 1.5mm 0 3mm; }
.shot { display: block; width: 100%; border: 1px solid #d8c9b8; border-radius: 3mm; margin: 2mm 0 4mm; max-height: 150mm; object-fit: cover; object-position: top; }
.phones { display: flex; gap: 4mm; justify-content: center; } .shot.phone { width: 62mm; max-height: 120mm; object-fit: cover; object-position: top; }
.lbl { font-size: 9pt; text-transform: uppercase; letter-spacing: .06em; color: #8a3f08; font-weight: 600; margin: 3mm 0 1mm; }
.sec p { margin: 0; }
ol { margin: 0; padding-left: 5.5mm; }
ol li { margin: 1mm 0; padding-left: 1mm; }
.tip { background: #fdf3e4; border-left: 3px solid #e8a054; padding: 2.5mm 4mm; border-radius: 0 2mm 2mm 0; margin-top: 4mm; }
.tip b { color: #8a3f08; }
.two { columns: 2; column-gap: 8mm; }
.two div { break-inside: avoid; margin-bottom: 2.5mm; }
.two b { color: #a64b0a; }
table.g { width: 100%; border-collapse: collapse; }
table.g td { padding: 1.6mm 2mm; border-bottom: 1px solid #e6dacb; vertical-align: top; }
table.g td:first-child { font-weight: 600; width: 28mm; color: #a64b0a; }
`;

function build(lang) {
  const u = UI[lang];
  const parts = u.parts.map((name, pi) => {
    const secs = SECTIONS.filter((s) => s.part === pi);
    return { name, pi, secs };
  });
  const toc = parts.map((p) => `<div class="grp">${esc(p.name)}</div>` + p.secs.map((s) => `<div class="i"><span>${esc(s[lang].title)}</span><span>${esc(s.who && u.who[s.who])}</span></div>`).join("")).join("");
  const body = parts.map((p) => {
    let first = true;
    return p.secs.map((s) => {
      const c = s[lang];
      const head = first ? `<h2 class="part">${esc(p.name)}</h2>` : "";
      first = false;
      const imgs = s.img2 ? `<div class="phones">${img(s.img, "phone")}${img(s.img2, "phone")}</div>` : img(s.img);
      return `<section class="sec">${head}<h3>${esc(c.title)}</h3><span class="badge">${esc(u.whoLabel)}: ${esc(u.who[s.who])}</span>${imgs}
        <div class="lbl">${esc(u.what)}</div><p>${esc(c.what)}</p>
        <div class="lbl">${esc(u.how)}</div><ol>${c.steps.map((t) => `<li>${esc(t)}</li>`).join("")}</ol>
        <div class="tip"><b>${esc(u.tip)}:</b> ${esc(c.tip)}</div></section>`;
    }).join("");
  }).join("");
  return `<!doctype html><html lang="${lang}"><meta charset="utf-8"><title>${esc(u.title)} — ${esc(u.subtitle)}</title><style>${CSS}</style><body>
  <div class="cover"><img class="logo" src="${logo}"><h1>${esc(u.title)}</h1><h2>${esc(u.subtitle)}</h2><div class="bar"></div><p>${esc(u.tagline)}<br>${esc(u.address)}: https://ds-lodge.vercel.app<br>${esc(u.cover)}</p></div>
  <h2 class="part">${esc(u.parts[0].replace(/^\d+\.\s*/, ""))}</h2>
  <div class="intro">${u.intro.map(([h, t]) => `<h3>${esc(h)}</h3><p>${esc(t)}</p>`).join("")}</div>
  <div class="page-break"></div><h2 class="part">${esc(u.toc)}</h2><div class="toc">${toc}</div>
  ${body}
  <section class="sec"><h2 class="part">${esc(u.routine)}</h2><ol>${u.routineList.map((t) => `<li>${esc(t)}</li>`).join("")}</ol>
  <h2 class="part" style="margin-top:10mm">${esc(u.faq)}</h2><div>${u.faqList.map(([q, a]) => `<p style="margin-top:2.5mm"><b>${esc(q)}</b><br>${esc(a)}</p>`).join("")}</div></section>
  <section class="sec"><h2 class="part">${esc(u.glossary)}</h2><table class="g">${u.glossaryList.map(([k, v]) => `<tr><td>${esc(k)}</td><td>${esc(v)}</td></tr>`).join("")}</table></section>
  </body></html>`;
}

const browser = await chromium.launch();
const names = { pt: "Manual-DS-Lodge-PT", en: "Manual-DS-Lodge-EN", pl: "Manual-DS-Lodge-PL" };
for (const lang of ["pt", "en", "pl"]) {
  const html = path.join(root, `docs/manual/${names[lang]}.html`);
  writeFileSync(html, build(lang));
  const page = await browser.newPage();
  await page.goto("file://" + html);
  await page.waitForTimeout(500);
  await page.pdf({
    path: path.join(root, `docs/manual/${names[lang]}.pdf`), format: "A4", printBackground: true,
    displayHeaderFooter: true, headerTemplate: "<span></span>",
    footerTemplate: `<div style="font-size:8px;color:#8a7a6a;width:100%;text-align:center;font-family:Inter,sans-serif">${UI[lang].subtitle} · ${UI[lang].page} <span class="pageNumber"></span>/<span class="totalPages"></span></div>`,
    margin: { top: "16mm", bottom: "18mm", left: "14mm", right: "14mm" },
  });
  await page.close();
  console.log("ok", names[lang]);
}
await browser.close();
