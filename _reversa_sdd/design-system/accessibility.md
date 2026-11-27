# Acessibilidade — DS Lodge (Design System)

> Fonte: CSS (`styles.css`, `theme.css`, `elevate.css`), componentes (`src/components/*.tsx`), páginas (grep de atributos ARIA), testes e `docs/DESIGN.md`. Análise estática: nenhum leitor de tela, Lighthouse ou axe foi executado. Contrastes calculados nesta análise (WCAG 2.x). 🟢 confirmado · 🟡 inferido/parcial · 🔴 lacuna. Meta declarada no DESIGN.md: **contraste AA no mínimo, foco visível, áreas de toque ≥ 44 px, `prefers-reduced-motion` desliga animações**.

## 1. O que está garantido 🟢

### 1.1 Contraste de texto (testado)
`themeContrast.test.ts` exige ≥ 4,5:1 em cada uma das 4 paletas (claro/escuro x Amiens/Connolly) para `--ink`, `--ink-2`, `--ink-3`, `--hc` sobre `--bg`, `--surface`, `--surface-2`; `--on-hc` sobre `--hc`; `--on-hero` sobre os 3 stops do gradiente; `--hero-btn-ink` sobre branco. Valores medidos em `tokens.md` §2.1 (mínimos: `--ink-3` 4,62 em Connolly claro/`--surface-2`; `--hc` 4,93; gradiente 5,02 no stop mais claro).

### 1.2 Foco e teclado
- Foco visível global: `:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px }` (`--accent` = `--hc` da casa: 4,9 a 8,9:1 sobre os fundos).
- Campos: o outline é removido (`outline:none`) e **substituído** por borda interna `--hc` + halo 4 px `--hc-soft` (`elevate.css`), e `.sheet-table-wrap:focus` por anel de 2 px (`styles.css`). `.house-toggle-opt`, `.nav-group-toggle`, `.person-chip`, `.staff-options li` têm `:focus-visible` próprio de 2 px `--hc`.
- Teclado: `Tabs` (roving tabindex, ←/→ circular, foco acompanha), `HouseSwitch` (radiogroup, setas ←→↑↓), `Dialog` (`<dialog>.showModal()`: foco preso, Esc fecha com animação), `ResidentPicker` (combobox/listbox), menu em módulos (`aria-expanded`, `aria-controls`). Testes: `ui.test.tsx`, `HouseSwitch.test.tsx`, `Layout.nav.test.tsx`.

### 1.3 Semântica e nomes acessíveis (contagem de atributos em `src/**/*.tsx`)
`aria-label` 78x, `aria-hidden` 61x (ícones decorativos), `aria-expanded` 15x, `aria-selected` 12x, `role="switch"` 9x, `aria-pressed` 9x, `role="group"` 7x, `role="status"` 5x, `aria-controls` 5x, `role="radio"` 3x, `role="listbox"` 3x, `role="img"` 3x (anel, linha e barras do painel, com `aria-label` descritivo), `aria-live` 3x (Toast polite, Clock off, contagem de filtro), `aria-busy` (Skeleton), `role="tablist/tab"`, `role="combobox"`, `role="search"`, `role="region"`.
- `html lang`: `index.html` `en-IE`; `i18n` atualiza `document.documentElement.lang` ao trocar idioma.
- Mensagens: `Notice` `role=alert` (erro) / `status`; `Toast` `role=alert` em erro; `aria-live=polite` no contêiner.
- Texto só para leitor de tela: `.sr-only` (estado do `Tabs` "Not started/Completed", ponto de status).
- Imagens: logos decorativos `alt=""`; logo do login com `alt` = nome do app; fotos de produto `alt=""` (decorativas).
- Ícones nunca são o único conteúdo de botão sem `aria-label` (convenção; ex.: `ThemeToggle`, `Dialog` fechar `aria-label="×"` 🟡 rótulo é o símbolo, não texto).
- `autoComplete` em login (`username`, `current-password`).

### 1.4 Movimento
`@media (prefers-reduced-motion: reduce)` em 3 arquivos: desliga `.content[data-transition]`, `.dialog`, `.tabs-indicator`, `.house-toggle-thumb`, `.nav-sub/.nav-chevron`, zera `transform` de hover/ativo e `* { transition-duration:.01ms }`. Sem efeitos decorativos contínuos (sem shimmer, sem brilho pulsante). Skeleton é estático.

### 1.5 Alvos de toque e leitura
- Campos 44 px; `.icon-btn` 44x44; chips 44 px em `pointer:coarse` (36 px com mouse); itens de lista de pendência, gaveta, switch-row ≥ 44 px; barra inferior sólida presa à borda.
- Escala fluida `16 → 19 px` na raiz, tudo em `rem` (respeita aumento de fonte do navegador); texto base 16 px.
- Números tabulares (`tabular-nums`) em horários e contagens.
- Estados nunca só por cor: cama fora de uso hachurada, FW com barra inferior, cancelada com ponto, aba de status com ponto + texto para leitor de tela + `title`, chip selecionado com ✓, `ins`/`del` do diff com sublinhado/tachado.
- "Texto dentro da caixa": contrato permanente (`textContainment.test.ts` + E2E de todas as rotas, claro/escuro, 2 casas, 3 larguras): evita cortes por raio/overflow e rolagem horizontal da página.

## 2. Responsivo e preferências do sistema 🟢
Mobile-first (`min-width:720px`/`1024px`); tabelas viram listas/cartões no celular; diálogo vira folha de baixo; `viewport-fit=cover` e `env(safe-area-inset-bottom)` na barra inferior/toasts; modo escuro por padrão em celular/app instalado; impressão sempre clara; `@media print` oculta navegação. `hover:none` e `pointer:coarse` tratados.

## 3. Lacunas e riscos 🟡/🔴

| # | Achado | Gravidade | Evidência |
|---|---|---|---|
| A1 | **Etiqueta/chip selecionado âmbar no claro**: texto `#1f1300` sobre `--warn #9a5800` = **3,27:1** (< 4,5) | média | `elevate.css` l.216 (`.tag-chips .chip.tag-c-amber.is-on`) e `theme.css` l.198 (`tag-health/damage`) |
| A2 | **Chip selecionado vermelho no escuro**: `#fff` sobre `--danger #ff5c6a` = **3,00:1** | média | `elevate.css` l.215; `theme.css` l.197 (`tag-incident/emergency`) |
| A3 | Etiquetas/semânticas e `--hc-soft`/`--warn-soft` como fundo de texto **não são testadas** (só tokens da paleta) | média | `themeContrast.test.ts` só lê `#rrggbb` |
| A4 | `--ink-3` e `--hc` sobre `--surface-2` no claro ficam a 0,1-0,5 do limite AA (4,62-4,98) | baixa | `tokens.md` §2.1 |
| A5 | **Sem link "pular para o conteúdo"** (skip link); menu lateral + topo precedem o conteúdo | média (teclado/leitor de tela) | nenhum `skip` em `Layout.tsx` |
| A6 | **Sem `prefers-contrast` nem `forced-colors`**: gradientes (`--hero`), sombras como bordas (`box-shadow` anel) e `background-image` somem em Alto Contraste do Windows; bordas dependem de `box-shadow` (invisível em forced-colors) | média | grep sem resultado |
| A7 | `color-scheme: light` fixo: no escuro, scrollbars/`<select>` nativos podem aparecer claros | baixa | `styles.css` :root |
| A8 | Avatar com iniciais a 10-11 px (`.625rem`/`.6875rem`) contra a regra "nada abaixo de 12 px" | baixa | `elevate.css`/`theme.css` |
| A9 | Alvo de toque 32-36 px em `button.small`, `.theme-toggle` (32), `.house-toggle-opt` (30), abas `--ctl-h` 40 px, `.chip` 36 px (com mouse) contra "≥ 44 px" do DESIGN.md; só chips têm `pointer:coarse` | média | `theme.css` |
| A10 | `Dialog` fecha com `aria-label="×"` (símbolo, não "Close" localizado) | baixa | `Dialog.tsx` |
| A11 | Gráficos do painel têm `aria-label` mas sem tabela/descrição de dados | baixa | `HomeDashboard.tsx` |
| A12 | `ShiftRuler`/`BedBoard`: informação em células coloridas; o rótulo agregado ("n ocupadas") existe, mas cada marca da régua não tem nome acessível por item 🟡 | média | `ShiftRuler.tsx` |
| A13 | `Clock` usa `aria-live="off"` (correto), mas a hora do servidor só se vê, sem equivalente textual além do texto | baixa | `Clock.tsx` |
| A14 | PWA: `theme-color`/`background_color` `#1c1f24` divergem do tema aplicado; barra do navegador pode ter contraste ruim | baixa | `index.html`, `manifest.webmanifest` |
| A15 | O catálogo de i18n é só `en-IE` (leitores de tela leem em inglês irlandês; `lang` fixo) | informativa | `LOCALES = ["en-IE"]` |
| A16 | Sem teste automatizado de acessibilidade (axe, `jest-axe`) nem E2E de teclado; `ui-doubleclick.e2e.cjs` e `ui-crawl.e2e.cjs` não verificam ARIA 🟡 | média | `tests/e2e/` |

## 4. Recomendações priorizadas (para o time decidir; nenhuma aplicada aqui)
1. Corrigir A1/A2: texto escuro sobre vermelho do escuro (ex.: `#1f0004`, ≥ 4,5:1 sobre `#ff5c6a`) e fundo mais escuro ou texto branco com `--danger` mais escuro no claro/ambar mais claro no chip selecionado; **estender `themeContrast.test.ts`** aos pares semânticos e de etiqueta.
2. Skip link no `Layout` (A5); o landmark `<main className="content">` já existe.
3. `@media (forced-colors: active)` com bordas reais nos botões, cartões e campos; `color-scheme` por tema (A6, A7).
4. Alvo mínimo de 44 px em `pointer:coarse` para `button.small`, `.theme-toggle`, `.house-toggle-opt`, abas (A9).
5. Rótulo localizado do botão fechar e descrição de dados dos gráficos/régua (A10-A12).
6. Rodar axe/Lighthouse nas rotas principais em CI e incluir navegação por teclado nos E2E (A16).
