// Gera os manuais curtos de apresentação (Admin e Casas; EN e PT) em docs/presentation/*.pdf
// a partir de docs/presentation/content.mjs e dos prints em docs/presentation/shots.
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";
import { GUIDES } from "../docs/presentation/content.mjs";
const require = createRequire(import.meta.url);
const { chromium } = require("playwright");

const root = path.resolve(import.meta.dirname, "..");
const shots = path.join(root, "docs/presentation/shots"), web = path.join(root, "docs/presentation/web"), out = path.join(root, "docs/presentation");
mkdirSync(web, { recursive: true });
execFileSync("python3", ["-c", `
import glob, os
from PIL import Image
for f in glob.glob("${shots}/*.png"):
    o = "${web}/" + os.path.basename(f)[:-4] + ".jpg"
    if os.path.exists(o): continue
    im = Image.open(f).convert("RGB")
    w = 1400 if im.width > 1000 else im.width
    im.resize((w, int(im.height * w / im.width)), Image.LANCZOS).save(o, "JPEG", quality=82, optimize=True)
`]);
const logo = "data:image/png;base64," + readFileSync(path.join(root, "public/logo.png")).toString("base64");
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const L = { en: { sees: "What you see", how: "Where to click", result: "What happens next", closing: "Remember", page: "Page" }, pt: { sees: "O que você vê", how: "Onde clicar", result: "O que acontece depois", closing: "Lembre-se", page: "Página" } };

const CSS = `
@page { size: A4; margin: 14mm 14mm 16mm; }
* { box-sizing: border-box; }
body { font-family: Inter, "DejaVu Sans", sans-serif; color: #1c1f24; font-size: 10.5pt; line-height: 1.45; margin: 0; }
.cover { height: 255mm; display: flex; flex-direction: column; justify-content: center; page-break-after: always; }
.cover img.logo { width: 34mm; margin-bottom: 12mm; }
.cover h1 { font-size: 36pt; font-weight: 600; color: #2a4fd6; margin: 0; }
.cover h2 { font-size: 16pt; font-weight: 500; margin: 4mm 0 0; }
.cover p { font-size: 12pt; color: #5b6070; margin-top: 10mm; max-width: 120mm; }
.cover .bar { width: 60mm; height: 3mm; background: linear-gradient(90deg,#2a4fd6,#8fa8ff); border-radius: 2mm; margin-top: 8mm; }
.sec { page-break-before: always; }
.num { font-size: 9pt; color: #2a4fd6; font-weight: 600; letter-spacing: .06em; }
.sec h3 { font-size: 18pt; margin: 1mm 0 3mm; }
.shot { display: block; width: 100%; border: 1px solid #d6d9e0; border-radius: 3mm; margin: 2mm 0 4mm; max-height: 118mm; object-fit: cover; object-position: top; }
.lbl { font-size: 9pt; text-transform: uppercase; letter-spacing: .06em; color: #2a4fd6; font-weight: 600; margin: 3mm 0 1mm; }
ol { margin: 0; padding-left: 6mm; } ol li { margin: 1.2mm 0; }
.result { background: #eef2ff; border-left: 3px solid #2a4fd6; padding: 2.5mm 4mm; border-radius: 0 2mm 2mm 0; margin-top: 4mm; }
.end { page-break-before: always; } .end h3 { font-size: 18pt; margin-bottom: 4mm; } .end li { margin: 3mm 0; font-size: 12pt; }
`;
const html = (g, lang) => {
  const c = g[lang], l = L[lang];
  const img = (n) => (existsSync(`${web}/${n}.jpg`) ? `<img class="shot" src="file://${web}/${n}.jpg">` : "");
  return `<!doctype html><html><head><meta charset="utf-8"><style>${CSS}</style></head><body>
<section class="cover"><img class="logo" src="${logo}"><h1>${esc(c.title)}</h1><h2>${esc(c.subtitle)}</h2><div class="bar"></div><p>${esc(c.lead)}</p></section>
${c.sections.map((s, i) => `<section class="sec"><div class="num">${i + 1} / ${c.sections.length}</div><h3>${esc(s.title)}</h3>${img(s.img)}
<div class="lbl">${l.sees}</div><p>${esc(s.sees)}</p><div class="lbl">${l.how}</div><ol>${s.steps.map((x) => `<li>${esc(x)}</li>`).join("")}</ol><div class="result"><b>${l.result}:</b> ${esc(s.result)}</div></section>`).join("")}
<section class="end"><h3>${l.closing}</h3><ul>${c.closing.map((x) => `<li>${esc(x)}</li>`).join("")}</ul></section></body></html>`;
};
const b = await chromium.launch();
for (const [key, g] of Object.entries(GUIDES)) for (const lang of ["en", "pt"]) {
  const p = await b.newPage();
  const htmlFile = path.join(web, `${g[lang].file}.html`);
  writeFileSync(htmlFile, html(g, lang));
  await p.goto("file://" + htmlFile, { waitUntil: "load" });
  const file = path.join(out, `${g[lang].file}.pdf`);
  await p.pdf({ path: file, format: "A4", printBackground: true, displayHeaderFooter: true, headerTemplate: "<span></span>", footerTemplate: `<div style="font-size:8px;width:100%;text-align:center;color:#888"><span class="pageNumber"></span> / <span class="totalPages"></span></div>`, margin: { top: "14mm", bottom: "16mm", left: "14mm", right: "14mm" } });
  console.log("ok", file);
  await p.close();
}
await b.close();
