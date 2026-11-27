# Tokens de design — DS Lodge (Design System)

> Agente: Design System · doc_level=completo · pt-br. Fontes lidas: `src/styles.css` (71 KB, base), `src/theme.css` (30 KB, claro/escuro + paleta por casa), `src/elevate.css` (27 KB, relevo, revisão 11 a 16), `docs/DESIGN.md`, `src/lib/theme.ts`. Nenhum arquivo foi alterado; `tailwind.config` e Style Dictionary **não existem** (CSS puro com variáveis).
> Escala: 🟢 definido em CSS · 🟡 inferido de uso · 🔴 referenciado mas não definido / divergente.
> **Ordem de carga e cascata** 🟢: `styles.css` (tokens base, grafite) → `theme.css` (modos e casas, usa `:root[data-theme][data-house]` e muito `!important`) → `elevate.css` (relevo; vence sobre theme). O que vale em tela é o **resultado da cascata**; `docs/DESIGN.md` (tabela "Tokens") descreve só a camada base de `styles.css` e **está parcialmente defasado** (ver §10).

## 1. Camadas de tokens 🟢

| Camada | Arquivo | Escopo | O que define |
|---|---|---|---|
| Base | `styles.css` `:root` (l.14) | sempre | rampa grafite, semânticas, raios, tempos, `--font-*`, `font-size` raiz |
| Casa legada | `styles.css` l.215-216, 780-782 | `[data-house]` | `--house`, `--house-ink`, `--house-soft`, `--house-line`, `--chrome*`, `--paper` (ocre/azul antigos) |
| Modo | `theme.css` | `[data-theme="dark|light"]` | `--paper/--surface/--surface-2/--ink*/--line*/--accent*/--ok/--warn/--danger` por modo |
| **Paleta canônica por casa x modo** | fim de `theme.css` (revisão 8) | `[data-theme][data-house]` | `--bg, --surface, --surface-2, --ink*, --hc, --hc2, --hc-vivid, --hc-soft, --on-hc, --accent, --hero, --on-hero, --hero-btn-ink, --line*, --chrome*` |
| Relevo | `elevate.css` (revisão 11) | `[data-theme]` | `--shadow-rgb, --hi, --sheen, --sh-1..3, --btn-top, --btn-bottom, --press` |
| Movimento | `theme.css` | `:root` | `--ios-ease`, `--ctl-h`, `--ctl-h-sm`, `--ctl-r`, `--ctl-thumb-r`, `--ctl-pad` |

Atributos do `<html>`: `data-theme` (`light`|`dark`, `lib/theme.ts: applyTheme`) e `data-house` (`amiens`|`connolly`, `lib/activeLodge.tsx`, padrão `amiens` via `ensureHouse()`). Veja `themes.md`.

## 2. Cor

### 2.1 Paleta por casa e modo (valores finais) 🟢

Fonte: fim de `src/theme.css`. Contrastes calculados nesta análise (WCAG 2.x, ratio = (L1+0,05)/(L2+0,05)).

| Token | Light · Amiens | Light · Connolly | Dark · Amiens | Dark · Connolly |
|---|---|---|---|---|
| `--bg` / `--paper` | `#fbf6ee` | `#f3f7fd` | `#0b0906` | `#06080c` |
| `--surface` | `#fffdf9` | `#ffffff` | `#1b1610` | `#10151d` |
| `--surface-2` | `#f3e9d9` | `#e6eefa` | `#272018` | `#1a212c` |
| `--ink` | `#1f1a14` | `#101828` | `#f7f1e8` | `#eef3fb` |
| `--ink-2` | `#5b5246` | `#475467` | `#c9bfb1` | `#bcc6d6` |
| `--ink-3` | `#6f6454` | `#5d6b82` | `#a39887` | `#97a2b5` |
| `--hc` (cor da casa, texto/acento) | `#a34a08` | `#1d5fd1` | `#f5b560` | `#6cb0ff` |
| `--hc2` | `#7a3306` | `#0f3d99` | `#e08a2c` | `#3f8cff` |
| `--hc-vivid` (decoração, nunca texto) | `#f0a03c` | `#3f8cff` | `#f0a03c` | `#3f8cff` |
| `--hc-soft` | `rgb(163 74 8 / 12%)` | `rgb(29 95 209 / 12%)` | `rgb(245 181 96 / 16%)` | `rgb(108 176 255 / 16%)` |
| `--on-hc` | `#ffffff` | `#ffffff` | `#2a1500` | `#04142e` |
| `--accent` / `--house` / `--house-strong` | = `--hc` | = `--hc` | = `--hc` | = `--hc` |
| `--hero` (gradiente 135°) | `#b45309 → #a34a08 → #7a3306` | `#2563eb → #1d5fd1 → #0f3d99` | igual ao claro Amiens | igual ao claro Connolly |
| `--on-hero` | `#ffffff` | `#ffffff` | `#ffffff` | `#ffffff` |
| `--hero-btn-ink` | `#7a3306` | `#0f3d99` | `#2a1500` | `#04142e` |
| `--line` | `rgb(120 72 16 / 10%)` | `rgb(16 60 130 / 10%)` | `rgb(255 214 160 / 8%)` | `rgb(160 200 255 / 8%)` |
| `--line-strong` | `rgb(120 72 16 / 20%)` | `rgb(16 60 130 / 20%)` | `rgb(255 214 160 / 16%)` | `rgb(160 200 255 / 16%)` |
| `--chrome` / `--house-soft` | `#fffdf9` / `#f3e9d9` | `#ffffff` / `#e6eefa` | `#0b0906` / `#0b0906` | `#06080c` / `#06080c` |

Contrastes medidos (mínimo exigido pelo teste: 4,5:1):

| Par | L·Amiens | L·Connolly | D·Amiens | D·Connolly |
|---|---|---|---|---|
| `--ink` sobre bg/surface/surface-2 | 16,05 / 17,00 / 14,36 | 16,51 / 17,75 / 15,19 | 17,71 / 16,00 / 14,32 | 17,99 / 16,43 / 14,52 |
| `--ink-2` (menor) | 6,37 | 6,58 | 8,86 | 9,39 |
| `--ink-3` (menor) | **4,82** | **4,62** | 5,66 | 6,28 |
| `--hc` (menor) | **4,93** | **4,98** | 8,93 | 7,16 |
| `--on-hc` sobre `--hc` | 5,93 | 5,82 | 9,67 | 8,12 |
| `--on-hero` sobre os 3 stops do gradiente | 5,02 / 5,93 / 9,12 | 5,17 / 5,82 / 9,78 | idem | idem |
| `--hero-btn-ink` sobre `#fff` | 9,12 | 9,78 | 17,42 | 18,35 |

Margens baixas 🟡: `--ink-3` sobre `--surface-2` no claro (4,82 e 4,62) e `--hc` sobre `--surface-2` (4,93 e 4,98) estão a 0,1-0,5 do limite AA; qualquer ajuste de matiz exige reexecutar `themeContrast.test.ts`.

### 2.2 Cores base e semânticas 🟢

| Token | Claro (`styles.css`/`theme.css` light) | Escuro (`theme.css` dark) | Uso |
|---|---|---|---|
| `--ok` / `--ok-soft` | `#16723a` / `#eaf4ee` | `#35d07f` / `rgb(53 208 127 / 14%)` | feito, concluído, `ins` do diff |
| `--warn` / `--warn-soft` | `#9a5800` / `#fbf1e1` | `#ffb340` / `rgb(255 179 64 / 14%)` | atenção, em andamento, cama cancelada |
| `--danger` / `--danger-soft` | `#c0261c` / `#fbeceb` | `#ff5c6a` / `rgb(255 92 106 / 15%)` | atraso, erro, FW, exclusão |
| `--accent` / `--accent-soft` | `#2449a8`/`#edf1fa` (base); `#3d5afe`/`#eceffe` (modo claro); `#4f7dff` (escuro) | — | **sobrescritos por `--hc` quando há `data-house`** |
| `--paper` | `#f7f7f6` base · `#f2f3f7` modo claro · `#000` modo escuro | | sobrescritos pela paleta da casa |
| `--ink`/`--ink-2`/`--ink-3` base | `#171717`/`#525252`/`#707070` | `#fff`/`#c7c9cf`/`#8b8e97` | sobrescritos pela casa |

Contraste das semânticas sobre `--surface` branco (claro) e `#1c1d21` (escuro) 🟢 medido: claro ok 6,00, warn 5,57, danger 5,94; escuro ok 8,40, warn 9,44, danger 5,61. As semânticas **não** variam por casa.

### 2.3 Cores de etiquetas (`handover_tags.color`) 🟢

`elevate.css` l.208-219: `tag-c-red` (danger-soft/danger), `amber` (warn-soft/warn), `green` (ok-soft/ok), `blue` (`rgb(63 140 255 / 16%)`, texto `#2563eb`, escuro `#7fb3ff`), `violet` (`rgb(139 92 255 / 16%)`, `#7c3aed`, escuro `#b9a1ff`), `grey` (padrão `.tag`). Selecionado (`.chip.tag-c-*.is-on`): fundo cheio (`--danger`, `--warn`, `--ok`, `#2563eb`, `#7c3aed`) com texto `#fff` (amber: `#1f1300`). Legados por código: `.tag-chips .chip.tag-incident|emergency` (danger), `tag-health|damage` (warn) em `theme.css`.

### 2.4 Cores fixas fora dos tokens 🟡
Gradientes de dados `#8b5cff` (`.stack-occ`, `.barchart-col .bar-in`, substituídos por `--hc`/`--hc-vivid` nas regras posteriores), `#d5d8e0` (`.bar-out` claro), `#3a3c43` (escuro), `#26272c` (trilhos escuros), `#16172a`/`#eef0ff` (entrada de turno), `#fde4e2`/`#b42318` (badge do menu claro), `--hol-review #f6df7a`, `--hol-approved #f0a24a`, `--hol-locked #d9534f` (calendário de férias, `styles.css` l.759, sem versão escura). Em TS há só `#000000`/`#ffffff` em `meta[name="theme-color"]` (`theme.ts`).

## 3. Tipografia 🟢

| Item | Valor | Fonte |
|---|---|---|
| `--font-ui` | `-apple-system, BlinkMacSystemFont, "SF Pro Text", "SF Pro Display", Inter, system-ui, "Segoe UI", Roboto, sans-serif` | `theme.css` l.8 (vence a pilha IBM Plex de `styles.css`) |
| `--font-mono` | `var(--font-ui)` (não há mais monoespaçada) | `theme.css` l.8 |
| `--font-display` | `var(--font-ui)` | `styles.css` |
| Fonte carregada | `@fontsource/inter` latin 400/500/600/700 (`theme.css`); **também** `@fontsource/ibm-plex-sans` (400/500/600, latin e latin-ext) e `ibm-plex-mono` (400/500) em `styles.css` 🔴 imports mortos (carregados mas sem uso após a revisão 9) | |
| Tamanho raiz | `clamp(16px, 0.55vw + 8.5px, 19px)` (16 px notebook, ~19 px Full HD); `body` 1rem; tudo em `rem` | `styles.css` |
| Linha | `line-height: 1.5`; `-webkit-font-smoothing: antialiased`; `text-rendering: optimizeLegibility` | |
| Numerais | `font-variant-numeric: tabular-nums` em `body` e em `.mono, .big-number, time, .clock-*, .dash-kpis dd, .eyebrow, .nav-group-label, .ring-text` (com `!important`, `letter-spacing:0`) | |
| Pesos usados | 400, 500, 600, 700 (theme.css: 600 em 17 regras, 700 em 4, 500 em 1) | |

Escala observada (contagem de `font-size` em `styles.css`/`theme.css`/`elevate.css`): `0.8125rem` (13px, 40x), `0.875rem` (14px, 26x), `0.75rem` (12px, 23x), `1rem` (9x), `0.9375rem` (7x), `2rem` (5x), `1.5rem`, `1.25rem`, `2.25rem` (h1 do tema), `2.4rem` (`.big-number`), `.625rem`/`.6875rem` (iniciais do avatar: 10/11 px, abaixo do mínimo de 12 px do DESIGN.md 🟡).

| Papel | Tamanho / peso / ajuste |
|---|---|
| `h1` | `2.25rem` / 700 / `letter-spacing:-0.02em` (theme) — DESIGN.md ainda diz 32 px / 500 🔴 |
| `h2` | `1rem` / 500 (base); `.dialog-header h2` `1.25rem` / 500 |
| `h3` | herdado 500 |
| Número de destaque `.big-number` | `2.4rem` / 700 / `-0.03em` |
| Rótulo `.eyebrow`, `.nav-group-label` | `.8125rem` / 600, caixa normal (sem uppercase) |
| Texto de apoio `.hint`, `.small-text` | `.875rem` |
| Rótulo de campo `.form label` | `.875rem` / 500, `--ink-2` |
| Código `code`, `.mono` | `.875em` (mesma família) |

## 4. Espaçamento e layout 🟢/🟡

- Grade de 4 px (`0.25rem`); passos de `gap` mais usados: `.5rem` (52x), `1rem` (26x), `.75rem` (36x), `.25rem` (13x), `.375rem`, `.125rem`; lacunas absolutas `2px`, `6px`, `12px`.
- **Ritmo da página** (`elevate.css`): `.page{display:flex;flex-direction:column;gap:1.25rem}`; filhos sem margem; `.page > .tabs/.segmented/button` com `align-self:flex-start`.
- **Shell**: `.shell` `min-height:100vh`; a partir de 1024 px grade `15.5rem minmax(0,1fr)` (menu lateral + conteúdo, `min-width:0`); teto do conteúdo `104rem` centrado (DESIGN.md) 🟡.
- **Áreas de toque**: campos `min-height:44px`; chips 36 px (44 px em `pointer:coarse`); `.icon-btn` 44x44; abas 40 px (`--ctl-h`), 32 px (`.tabs-sm`); botão padrão `2.5rem`; `button.small` 32 px 🟡.
- **Grades**: `.card-grid` `repeat(auto-fit, minmax(280px,1fr))` gap 1rem; `.form-grid` `minmax(13rem,1fr)`; `.dash-kpis` `minmax(5.25rem,1fr)`; `.board-rooms` `minmax(5rem,1fr)`; `.structure-grid` `minmax(17rem,1fr)`; `.system-fields` `minmax(11rem,1fr)`.

### Breakpoints 🟢 (CSS, `min`/`max-width`)
| Valor | Papel |
|---|---|
| **719 / 720 px** | celular x computador: bottom-nav vs sidebar, tabelas viram cartões, diálogo vira folha (`@media (max-width:719px)` 11x; `min-width:720px` 9x) |
| **900 px** | `.board-grid` em 2 colunas |
| **1024 px** | menu lateral fixo + `.toasts` sobem (`bottom:28px`) |
| 1099/1100, 1200 px | ajustes pontuais de grade `styles.css` 🟡 |
| 1180 px | some o chip do plantão no topo |
| 1279/1400 px | some o nome do usuário no topo (theme: 1279; elevate: 1400, prevalece o último carregado) 🟡 |
| `pointer:coarse`, `hover:none`, `display-mode:standalone`, `print`, `prefers-reduced-motion` | consultas de capacidade |

Os breakpoints não são variáveis (CSS não aceita em `@media`); ficam duplicados nos arquivos.

## 5. Raio 🟢

| Token / regra | Valor | Origem |
|---|---|---|
| `--radius-sm` / `--radius` / `--radius-lg` | 6 / 8 / 12 px (base) → **10 / 14 / 22 px** (`* { --radius:14px; --radius-lg:22px; --radius-sm:10px }` em `theme.css`, seletor universal) | `styles.css`, `theme.css` |
| Botões, `.chip`, `input`, `select`, `.tag`, `.house-option`, `.post-chip`, `.button-link` | **22 px fixo** (`!important`); pílula só até 44 px de altura | revisão 7 |
| `textarea` | 16 px | |
| Cartões (`.card, .dash-card, .shift-bar, .composer, .duty-card, .bento-tile, .timeline, .table`) | 22 px (`!important`); `.timeline-item` 16 px; `.dash-kpis div`, `.nav-item` 12-14 px | |
| Diálogo | 16 px (`styles.css`) | |
| Toast | 10 px | |
| `--ctl-r` / `--ctl-thumb-r` | 22 / 18 px (trilho e polegar das abas/segmentado/interruptor) | |
| Avatar, `.status-dot`, setas, `.pending-go` | 999 px (círculo) | |
| `.link-button` | 6 px; `.tag` base 4 px (sobrescrito para 22 px) | |

## 6. Sombras e relevo 🟢

`elevate.css` (revisão 11): `--sh-1/2/3` (camadas), `--hi` (realce superior), `--sheen` (brilho do cartão), `--shadow-rgb`, `--btn-top/--btn-bottom` (gradiente do botão), `--press`.

| Token | Claro | Escuro |
|---|---|---|
| `--shadow-rgb` | `16 24 40` (Amiens `110 60 10`, Connolly `14 50 120`) | `0 0 0` |
| `--hi` | `rgb(255 255 255 / .9)` | `rgb(255 255 255 / .10)` |
| `--sheen` | `rgb(255 255 255 / .7)` | `rgb(255 255 255 / .035)` |
| `--sh-1` | `0 1px 1px /.07, 0 2px 5px -1px /.10` | `0 1px 1px /.40, 0 3px 8px -2px /.50` |
| `--sh-2` | `0 2px 3px /.07, 0 8px 18px -6px /.18` | `0 2px 3px /.40, 0 10px 22px -8px /.65` |
| `--sh-3` | `0 4px 6px /.08, 0 22px 40px -14px /.30` | `0 4px 8px /.45, 0 26px 46px -14px /.75` |
| `--btn-top` / `--btn-bottom` | `--surface` / `--surface-2` | `color-mix(--surface-2, #fff 8%)` / `--surface-2` |

Usos: botão padrão = `inset 0 1px 0 var(--hi), inset 0 -1px 0 var(--line), 0 0 0 1px var(--line-strong), var(--sh-1)`; cartão adiciona `--sheen` em gradiente; campos "afundados" `inset 0 1px 3px rgb(var(--shadow-rgb)/.12)`; foco do campo `0 0 0 4px var(--hc-soft)`; botão principal com sombra colorida `color-mix(in srgb, var(--hc-vivid) 55%, transparent)`; diálogo `--sh-3`; toast `0 8px 24px rgb(0 0 0 /14%)`. Barra superior: `inset 0 -3px 0 var(--hc-vivid)` (faixa da casa).

## 7. Movimento 🟢

| Token | Valor | Uso |
|---|---|---|
| `--ease-out` (= `--ease-spring`) | `cubic-bezier(0.22, 1, 0.36, 1)` | base (`styles.css`) |
| `--ios-ease` / `--press` | `cubic-bezier(.32,.72,0,1)` | tudo posterior (theme/elevate) |
| `--fast` / `--base` / `--slow` | 140 / 180 / 320 ms | base |
| Hover/pressionar | 160 ms transform, 200 ms sombra; sobe `translateY(-1px)`; afunda `translateY(1px) scale(.985)` | teste: máx. 240 ms |
| Troca de tela | `screen-push` 340 ms, `screen-pop` 340 ms, `screen-fade` 220 ms; celular 240-ou-340 ms com deslocamentos 32%/-24%/10 px | `theme.css`; `lib/transition.ts` |
| Diálogo | `dialog-pop` 260 ms (escala .94→1); celular folha `ios-sheet-in` 380 ms; fecha 180-200 ms | |
| Abas / interruptor | indicador/polegar 320 ms (`transform`, `width`) | |
| Menu em módulos | `grid-template-rows` 0fr→1fr 320 ms, seta gira 180° | |
| Toast | visível 3 200 ms + saída 220 ms; entrada `toast-in` 320 ms (sobe 8 px) | `Toast.tsx` |
| Reduzir movimento | `prefers-reduced-motion: reduce` desliga animações de tela/diálogo, transforms de hover e zera transições (`* { transition-duration:.01ms }`) | |

## 8. Camadas (z-index) 🟢
`.tab` 1 · `.house-toggle-opt` 1 · cabeçalho da folha de marcação 5 · `.period-pop` e menu do seletor 20 · `.topbar` 30 · `.bottom-nav` 40 · `.resident-picker-list` 40 · `.toasts` 60. Não há escala nomeada; valores soltos 🟡. `<dialog>` usa camada superior nativa (`showModal`).

## 9. Ícones e imagem 🟢
`lucide-react`: 16 px no menu/botões pequenos, 18 px nos demais, traço padrão, cor do texto apagado, ativo no acento; nunca emoji (DESIGN.md). Ícones do menu em círculo 30 px (`.nav-item svg`, fundo `rgb(255 255 255 / 6%)`/`--surface-2`). Logo: símbolo das casas (`brand-logo`, `auth-logo`; no escuro ganha cartão branco 9 rem). PWA: `manifest.webmanifest` `theme_color`/`background_color` `#1c1f24` e `index.html` `theme-color #1c1f24` (legado do cromo escuro) 🔴 divergem de `applyTheme` (`#000000`/`#ffffff`).

## 10. Divergências entre documento e código 🔴

1. `docs/DESIGN.md` "Tokens" e "Tipografia" descrevem grafite neutro + IBM Plex/Plus Jakarta; o código final usa paleta por casa/modo e SF/Inter (revisões 6, 8, 9) — as revisões 6-16 do próprio documento contradizem as "Regras" iniciais (sem gradiente/brilho/sombras vs relevo, gradiente e brilho do botão principal).
2. DESIGN.md: raio de botão 8 px e cartões 12 px; código: 22 px.
3. DESIGN.md: "nada abaixo de 12 px"; código tem 10-11 px (avatar).
4. DESIGN.md: títulos 32 px/500; código `h1` 36 px/700.
5. Tokens `--ease-out`, `--fast/--base/--slow` seguem em uso em partes de `styles.css`, enquanto theme/elevate usam `--ios-ease`: duas curvas coexistem.
