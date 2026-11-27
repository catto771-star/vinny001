# Contratos de CSS guardados por teste — DS Lodge (Design System)

> Fontes: `src/lib/textContainment.test.ts`, `src/lib/designSystem.test.ts`, `src/lib/themeContrast.test.ts`, mais `theme.test.ts`, `fonts.test.ts`, `transition.test.ts`, `src/components/ui.test.tsx`, `HouseSwitch.test.tsx`, `Layout.nav.test.tsx`, `BottomNav.test.ts`, `src/i18n/copy.test.ts` e `tests/e2e/text-overflow.e2e.cjs` (não executados nesta análise; leitura estática). 🟢 confirmado · 🟡 inferido · 🔴 lacuna.
> Natureza dos testes: **leem o CSS como texto** (`readFileSync`) e aplicam regex a "regra → declarações". Não renderizam estilo computado (isso fica no E2E com Playwright). O parser tira comentários, **ignora `@media` removendo só a abertura** (então regras dentro de `@media` entram como se fossem globais) e não entende aninhamento: bom para o CSS atual (achatado), frágil se surgir CSS nesting.

## 1. `textContainment.test.ts` — "texto dentro da caixa" (revisões 7, 10, 15)

Insumo: `theme.css` + `styles.css` (1ª e 2ª suítes); `elevate.css` (3ª em diante).

| # | Contrato | Como é verificado | Por quê |
|---|---|---|---|
| T1 | Nenhum elemento de várias linhas (`button`, `textarea`, `.bed`, `.rota-shift`, `.button-link`) recebe `border-radius` de 999/9999 px | regras com `border-radius:(999|9999)px` cujo seletor é exatamente um dos 5 | canto de pílula corta texto de 2+ linhas (turnos do Roster no celular) |
| T2 | `button` quebra palavras longas e não passa da largura | regra `button` com `overflow-wrap:anywhere` e `max-width:100%` | |
| T3 | Abas soltas têm folga: `.page > .tabs { margin-bottom: 1rem }` | regra exata | revisão 10 (em `theme.css`/`styles.css`) |
| T4 | Nome do residente no Bed map: `.bed-body strong` com `-webkit-line-clamp:2` e `overflow:hidden` | regex em `elevate.css` | 2 linhas e reticências |
| T5 | `.room-card .bed-list li { padding:0 }` | | padding somado ao botão empurrava o nome |
| T6 | `.avatar` 28 px com `font-size:.625rem` | | iniciais cabem no círculo |
| T7 | Botão principal: sombra colorida a 55% (`color-mix(in srgb, var(--hc-vivid) 55%, transparent)`) | | brilho reduzido (rev. 15) |
| T8 | `.task-check:empty::after` centralizado (`left:50%; top:50%`) | | check do Dinner/tarefas desenhado em CSS |
| T9 | Dialog centralizado no computador: `@media (min-width: 720px){ .dialog { position:fixed; inset:0; margin:auto } }` | regex multilinha | |
| T10 | `.registers > .tabs { margin-bottom:1rem }` | | sub-abas de Registers |
| T11 | Home do Admin: `.period-filter`, `.dash-card.is-collapsed` existem; `.pending-go` com raio 999px; `.pending-label` com `text-overflow:ellipsis`; `.bed-cell.cancelled::after` existe | | rev. 16 |

Lacunas 🟡: T1 só compara seletores **exatos** (`button`, não `button.primary`); e **não lê `elevate.css`** (onde há `border-radius:999px` em `.topbar-right button.link-button` e `.pending-go`, de uma linha). A verificação real de estouro é o E2E (§7).

## 2. `designSystem.test.ts` — relevo, movimento e ritmo (revisões 11 a 16; lê só `elevate.css`)

| # | Contrato | Verificação |
|---|---|---|
| D1 | Tokens de relevo por tema: `:root[data-theme="light"]` e `"dark"` (sem descendente) definem `--sh-1`, `--sh-2`, `--sh-3`, `--hi`, `--sheen` | procura as 5 declarações no bloco de cada tema |
| D2 | Botão comum (`button:not([class])`): `box-shadow` com `var(--hi)`, usa `var(--sh-1)` e `linear-gradient` | regex |
| D3 | Botão principal (`button.primary`): usa `var(--hero)` e `var(--hc-vivid)` | |
| D4 | Hover sobe 1 px (`translateY(-1px)`); `:active` afunda (`translateY(1px)`) | seletores `button:not([class]):hover:not(:disabled)` e `:active:not(:disabled)` |
| D5 | Transições usam `var(--ios-ease)`, cada duração ≤ **240 ms**, e existe `prefers-reduced-motion: reduce` | extrai `(\d+)ms` da regra do botão |
| D6 | `.page` é flex em coluna com `gap:1.25rem`; `.page > .tabs` com `align-self:flex-start` | |
| D7 | Coluna de conteúdo encolhe: `.shell` com `grid-template-columns: 15.5rem minmax(0, 1fr)`; `.content` com `min-width:0` | nada empurra o topo para fora |
| D8 | Painel: `.dash-occ > div:first-child { min-width:0 }`, `.dash-card` com `minmax(0,1fr)`, `.dash-kpis` com `repeat(auto-fit` | |
| D9 | Topo cede espaço em ordem: `@media (max-width:1400px)` oculta `.topbar .user-name`; `(max-width:1180px)` oculta `post-chip`; `(max-width:719px)` deixa `.topbar` em `flex-wrap:nowrap` | |
| D10 | Logo do login no escuro ganha `background:#fff` | |
| D11 | Seta do menu em cascata tem folga: `:root[data-theme] .nav-group-toggle { padding:0 .75rem ... }` | |
| D12 | `select:not([multiple])`: `appearance:none`, seta por `linear-gradient` com `var(--ink-2)`, `background-position: calc(100% - NNpx)` com NN ≥ 18, `padding-right` ≥ 2,5 rem | |
| D13 | Ícone nativo de data/hora tem `margin-right`; `input[type=date]` tem `padding-right` | |
| D14 | Tabela do Audit: `.table-scroll{overflow-x:auto}` e `@media (max-width:719px){.audit-table thead{display:none}}` | |
| D15 | Descrição do pedido de manutenção (`.ticket-main .muted`) com `white-space:normal` e `overflow-wrap:anywhere` | |
| D16 | Cada cor de tag (`red, amber, blue, green, violet`) tem `.tag.tag-c-<cor>` e `.chip.tag-c-<cor>.is-on` | `grey` é o padrão, sem estilo próprio |

## 3. `themeContrast.test.ts` — paleta por casa e modo (revisão 8; lê só `theme.css`)

Gera `describe.each` para as **4 combinações** (`light|dark` x `amiens|connolly`) e extrai o bloco `:root[data-theme="T"][data-house="H"] { ... }`.

| # | Contrato (por combinação) |
|---|---|
| C1 | Define os 12 tokens: `--bg, --surface, --surface-2, --ink, --ink-2, --ink-3, --hc, --hc2, --on-hc, --hero, --on-hero, --hero-btn-ink` |
| C2 | WCAG AA (≥ 4,5:1) de `--ink`, `--ink-2`, `--ink-3` **e** `--hc` sobre `--bg`, `--surface` e `--surface-2` (12 pares) |
| C3 | `--on-hc` sobre `--hc` ≥ 4,5; `--on-hero` sobre **cada** `#rrggbb` do gradiente `--hero` ≥ 4,5 |
| C4 | `--hero-btn-ink` sobre `#ffffff` ≥ 4,5 (botão branco "No Shows" no cabeçalho) |
| C5 | As casas se distinguem: `--bg` e `--surface-2` diferem por modo; no claro, Amiens tem `R−B > 0` e Connolly `B−R > 0` em `--surface-2` |
| C6 | `--hero` definido **uma única vez** por casa e modo (evita sobrescrita acidental) |

Limitações 🟡: só `#rrggbb` (ignora `rgb()`/`color-mix`); não testa semânticas (`--ok/--warn/--danger`), `--hc-vivid`, texto sobre `--hc-soft`, etiquetas coloridas, estados `:hover`/`:disabled`, nem o tema legado de `styles.css`.

## 4. `theme.test.ts` (jsdom) — lógica do modo
- `defaultTheme(390,false)`=dark, `(1440,true)`=dark, `(1440,false)`=light.
- `applyTheme("dark", true)` grava `data-theme` e `localStorage`; `initialTheme()` devolve a escolha guardada.

## 5. `fonts.test.ts` — pilha tipográfica (revisão 9; lê `theme.css`)
- `--font-ui`: 1º item `-apple-system`; contém `BlinkMacSystemFont` e `SF Pro Text`; `Inter` vem **depois** de `SF Pro Text`; último item `sans-serif`.
- `theme.css` não pode mencionar "jakarta" (Plus Jakarta removida).
- Existe `font-variant-numeric: tabular-nums`.
- Lacuna 🔴: o teste **não** proíbe os imports de IBM Plex em `styles.css` (código morto carregado).

## 6. Outros contratos de comportamento visual
| Arquivo | Contrato |
|---|---|
| `transition.test.ts` | `transitionKind`: detalhe mais fundo = `push`; subir/voltar (`POP`) = `pop`; trocar de seção = `fade`; primeira tela/mesma rota = `none` |
| `ui.test.tsx` | Tabs: `aria-selected`, indicador `.tabs-indicator`, setas ←/→; ponto de status com texto `.sr-only` e `title`; Tabs não chama `scrollIntoView`. Skeleton: `role=status`, `aria-busy`, N linhas. Toast: aparece e some. Dialog: classe `is-closing` antes de `onClose` (300 ms) |
| `HouseSwitch.test.tsx` | Admin vê `radiogroup` e a troca muda o tema (`data-house`); conta de casa não vê o interruptor mesmo com outra casa no navegador; setas alternam |
| `Layout.nav.test.tsx` | Módulo da rota ativa abre sozinho; cabeçalho soma submódulos (10 + 13 = 23); estado guardado (`nav.open`); station não soma Notifications; topo mostra perfil abreviado |
| `BottomNav.test.ts` | Atalhos da barra inferior com rótulo curto de uma palavra |
| `copy.test.ts` | Texto de UI: sem "Please", sem "!", sem grafia americana, sem espaço duplo, sem "the system", "house" (não "Lodge") exceto `app.name`, sem "...", rótulos curtos sem ponto final, frase ≤ 110 caracteres |
| `src/i18n/i18n.test.ts` | catálogo (fora do escopo de design) |

## 7. E2E de estouro de texto (`tests/e2e/text-overflow.e2e.cjs`)
Percorre **todas as rotas**, nos temas claro e escuro, nas duas casas e em celular/tablet/computador (Playwright; senha demo por `DEMO_PASSWORD`; `E2E_BASE_URL` padrão `:4173`). Para cada nó de texto acha a caixa (elemento com fundo, borda, gradiente ou `overflow ≠ visible`) e falha (saída 1) se o retângulo do texto sair horizontal/verticalmente ou for cortado por canto arredondado (raio efetivo > 4 px). Ignora `svg`, `.sr-only`, `[aria-hidden]`, `.sidebar`, `.ruler-now` e contêineres rolantes. Regra permanente do DESIGN.md (rev. 15). Não executado aqui 🟡.

## 8. Mapa regra → contrato (resumo)
| Regra de design | Teste |
|---|---|
| Texto dentro da caixa | T1-T11, E2E |
| Relevo/hover/pressionar, ≤ 240 ms, reduzir movimento | D1-D5 |
| Ritmo de espaçamento, conteúdo encolhe | D6-D9 |
| Contraste AA por casa e modo | C1-C4 |
| Casas distintas, `--hero` único | C5-C6 |
| Fonte SF/Inter, números tabulares | fonts |
| Modo padrão e persistência | theme.test |
| Textos curtos e consistentes | copy.test |
| Acessibilidade de componentes base | ui.test, HouseSwitch |
| **Sem teste**: semânticas de cor, tamanho mínimo de toque (44 px), foco visível, ordem do z-index, breakpoints, `color-scheme`, motivos do PWA (`theme-color`) | — |
