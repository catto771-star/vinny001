# Análise de código — interface-e-i18n

> Escala: 🟢 confirmado | 🟡 inferido | 🔴 lacuna.

## Propósito
Casca da aplicação (menu, barras, diálogos, tema claro/escuro por casa), catálogo de textos (só en-IE no Beta), mapeamento de erros do banco para mensagens, regras de tempo/fuso de Dublin e filtros em URL. Guardas de CSS por testes. 🟢

## 1. Layout e navegação (`src/components/Layout.tsx`)
- `Layout` = `ActiveLodgeProvider` + `ContinuityKeeper` + `Shell` (`:112-119`) 🟢.
- `GROUPS` (`:27-78`): 5 grupos (Overview, Residents & Presence, Occurrences, Services, Team & Management). Itens `managementOnly` filtrados por `isManagement` (`:218`) 🟢. `phase` gera linha "Available in phase N" (nenhum grupo usa hoje) (`:257`).
- `BOTTOM_ADMIN` (gestão: Home, Alerts, Presence [abre drawer só com grupo Residents], Log + "More") vs `BOTTOM` (casa/station: Home, Room Check, Handover, Residents + "Menu") (`:89-102, 294-313`) 🟢. `BOTTOM_LABELS` encurta rótulos (`:81-86`).
- Badges: `usePendingCounts` + `unread` (poll 60 s) → `badgeFor`/`groupBadgeTotal`; ">99" vira "99+" (`:203-216, 244`) 🟢. Casa (não gestão) com posto office conta só sua casa (`:203`) 🟡.
- Menu retrátil: grupo da rota ativa abre sozinho (`groupIndexOfPath`), escolha persistida em `localStorage["nav.open"]` (`src/lib/navGroups.ts:1-28`; `Layout.tsx:221-227`) 🟢. Raiz `/` só casa exato.
- `HouseSwitch` (radiogroup, setas navegam, só gestão com ≥2 casas) (`:132-159`) 🟢; `OnDutyChip` mostra quem está no Roster na casa ativa (`:162-174`) 🟢.
- Transição de tela: `transitionKind` (`src/lib/transition.ts:488-495`): sem anterior/igual ⇒ none; POP ⇒ pop; mesma seção e mais fundo ⇒ push, mais raso ⇒ pop; senão fade. Calculado uma vez por pathname (`Layout.tsx:183-188`) 🟢.
- Scroll >8 px marca `.topbar.is-scrolled` (`:193-198`) 🟢. Menu fecha ao mudar rota (`:200`).
- `MaintenanceReminder` renderizado na casca (`:315`) — pertence a outro módulo.

## 2. Dialog (`src/components/Dialog.tsx`) 🟢
`<dialog>` nativo com `showModal()` no mount; fechar anima por 200 ms (`CLOSE_MS`) antes de chamar `onClose`; ESC (`onCancel`) e clique no backdrop também passam por `requestClose`; `DialogCancel` usa contexto. Botão fechar com `aria-label="×"` (não traduzido) 🟡.

## 3. Tema (`src/lib/theme.ts`, `ThemeToggle.tsx`) 🟢
- `defaultTheme(width, standalone)`: escuro se standalone ou largura < 720, senão claro (`theme.ts:98-100`). Escolha guardada em `localStorage["ui.theme"]` (`:96, 113-123`).
- `applyTheme` define `data-theme` e `meta[name=theme-color]` (#000000 escuro / #ffffff claro) (`:113-115`). `ensureHouse` define `data-house="amiens"` por omissão (`:129-133`). Chamados antes do render em `main.tsx:9-10`.
- A casa ativa sobrescreve `data-house` (ver módulo de casa/`activeLodge.tsx`; chaves `lodge.active`, `lodge.start`) 🟡.
- CSS: `theme.css` (paleta por casa/tema, "app de banco"), `elevate.css` (relevo, tokens de sombra, responsivo, impressão), `styles.css` (base, 962 linhas). Ordem de import: styles → theme → elevate (`main.tsx:4-6`) 🟢. Uso intenso de `!important` em theme.css para sobrepor styles.css 🟢.
- Tokens por casa+tema (`--bg --surface --surface-2 --ink --ink-2 --ink-3 --hc --hc2 --on-hc --hero --on-hero --hero-btn-ink`) definidos em blocos `:root[data-theme][data-house]` (exigidos por `themeContrast.test.ts:27`); o trecho de definição está em theme.css além da linha 92 (não detalhado) 🔴 parcial.

## 4. Catálogo i18n (`src/i18n/index.tsx`, `en-IE.ts`) 🟢
- `LOCALES = ["en-IE"]`; `FALLBACK_LOCALE = en-IE` (`index.tsx:5-7`). `MessageKey` derivado dos caminhos do objeto (`:11-15`). `translate`: busca no locale, depois no fallback, depois devolve a própria chave (`:37-40`). `interpolate` substitui `{nome}` por vars; placeholder sem valor permanece (`:31-34`).
- `initialLocale()` apaga `dslodge.locale` do localStorage e devolve fallback (`:52-59`); `setLocale` ainda grava a chave (`:64-72`) — código legado, nenhum idioma alternativo existe 🟡.
- Catálogo `en-IE.ts` (1302 linhas, ~40 seções: app, errors, auth, post, continuity, nav, today, residents, sheet, … settings, home, residentPicker). Convenções: inglês da Irlanda, termos de trabalho em inglês (Seen Day/Night, Dinner, No Show, Float, Handover, FW, PASS) (`en-IE.ts:1-6`).
- Guia de estilo executável (`src/i18n/copy.test.ts`): sem "Please", sem "!", sem grafia americana, sem espaço duplo, sem "the system", "Lodge" só em `app.name`, sem "...", rótulos curtos sem ponto final, frases ≤110 caracteres. `i18n.test.ts` exige mesmas chaves e variáveis `{x}` entre locales e nenhuma chave vazia 🟢.

## 5. Mapeamento de erros (`src/lib/errors.ts`) 🟢
- `RULES`: lista ordenada de pares `[RegExp, MessageKey]` (97 regras, `:3-102`); `errorKey(error)` extrai `message` (string ou objeto) e devolve a primeira regra que casa, senão `errors.generic` (`:104-112`). **A ordem importa** (ex.: `invalid_.*time` vem depois de regras específicas `invalid_*`; `invalid_seen_time` → `errors.inFuture`).
- Famílias: concorrência (`stale_version`), autoria/janela de correção, check de presença (`unmarked_residents`, `checks_pending`…), ausências, campos obrigatórios (`_name_check|…`), intervalos, quantidades, jantar, geladeira, tags/estrutura (rooms/beds), warnings, compras/entregas, turnos/roster (`staff_overlap`, `float_overlap`), autorização (`not_authorised|row-level security|permission denied|42501` → `errors.notAuthorised`), sessão (`JWT expired|refresh_token`), rede (`Failed to fetch|NetworkError|network`) 🟢.
- Teste de cobertura `errors.coverage.test.ts:12-35`: varre `raise exception '<codigo>'` em todas as migrations; todo código fora da lista `INTERNAL` (9 códigos) deve mapear a algo ≠ generic; e `INTERNAL` não pode conter código já mapeado 🟢. Garante sincronia migrations↔UI.

## 6. Tempo e fuso (`src/lib/time.ts`) 🟢
- Banco em UTC; tela em `Europe/Dublin` (`:253`). Dia operacional 07:00–07:00 (`OPERATIONAL_DAY_START_HOUR=7`, `:254`), `operationalDay` subtrai 1 dia se hora<7 (`:318-322`), idêntico a `public.operational_day()` no banco (comentário `:317`).
- `dublinParts` via `Intl.DateTimeFormat('en-GB', hourCycle h23)`; `dublinOffsetMs` calcula diferença parede×UTC (`:285-289`); `dublinWallTimeToDate` converte parede→instante com segunda passada para horários inexistentes (salto de primavera avança ao primeiro existente) (`:295-305`).
- `shiftOf`: Day 07–19, Night 19–07 (padrões de parâmetro) (`:334-337`). Formatadores: `formatDate` (dd/mm/aaaa), `formatTime` (24h), `formatDateTime`, `formatClock` (weekday capitalizado), `formatCivilDate` (UTC, sem fuso, p/ datas de nascimento), `toDublinInputValue`/`fromDublinInputValue` (datetime-local ↔ Dublin; regex `^YYYY-MM-DDTHH:MM`) (`:340-391`).
- Ambiguidade de hora repetida (fim do horário de verão, 01:00–02:00) resolvida pela primeira passada de offset; comportamento exato 🟡 (testes `time.test.ts:23` cobrem 23h/25h).

## 7. Filtros em URL (`src/lib/filters.ts`, `useUrlFilters.ts`, `FilterBar.tsx`) 🟢
- `parseFilters`: lê só chaves conhecidas; `select` desconhecido descartado; `multi` filtra valores inválidos; demais tipos aceitos como vêm (`filters.ts:407-420`).
- `serializeFilters`: remove vazios, preserva parâmetros alheios (ex.: casa), `multi` ordenado alfabeticamente (`:423-432`).
- `activeFilters` → chips (busca excluída); `remove` devolve novo valor da chave (`:437-451`). `matchesText`: normaliza NFD sem acento/caixa; todas as palavras precisam aparecer (AND) (`:453-460`).
- `useUrlFilters`: `useSearchParams` com `replace:true` (não polui histórico); `set(patch)` mescla com valores atuais; `clear` limpa só chaves de `defs` (`useUrlFilters.ts:7-14`). Usado em Audit, Maintenance, Handover, Warnings, HomeDashboard 🟢.

## 8. Regras CSS guardadas por testes 🟢
| Teste | Regra protegida |
|---|---|
| `textContainment.test.ts:17-30` | Nenhum `button/textarea/.bed/.rota-shift/.button-link` com raio 999/9999px; `button` com `overflow-wrap:anywhere` e `max-width:100%` (theme.css:15-16) |
| `textContainment.test.ts:33-37` | `.page > .tabs` margin-bottom 1rem |
| `textContainment.test.ts:43-58` | Bed map: nome em 2 linhas (`line-clamp:2`); `.avatar` 28px/.625rem; botão primário brilho a 55%; check CSS centralizado |
| `textContainment.test.ts:62-65` | Dialog centralizado ≥720px (`position:fixed; inset:0; margin:auto`) |
| `textContainment.test.ts:73-85` | `.period-filter`, `.dash-card.is-collapsed`, `.pending-go`, `.bed-cell.cancelled::after` |
| `designSystem.test.ts:11-18` | Tokens `--sh-1/2/3 --hi --sheen` nos dois temas |
| `designSystem.test.ts:20-45` | Botões em relevo (realce, sombra em camadas, gradiente), hover −1px, active +1px, transições ≤240 ms com `--ios-ease`, `prefers-reduced-motion` |
| `designSystem.test.ts:47-75` | `.page` flex coluna gap 1.25rem; `.shell` `15.5rem minmax(0,1fr)`; topbar cede espaço (≤1400px esconde nome, ≤1180px esconde chip, ≤719px nowrap); logo de login com fundo branco no escuro; seta do menu padding ≥.75rem |
| `designSystem.test.ts:77-116` | `select` com seta própria e padding-right ≥2.5rem; indicador de data com folga; tabela de Audit rola/vira cartões ≤719px; `.ticket-main .muted` quebra; cores de tag (red, amber, blue, green, violet) |
| `themeContrast.test.ts:24-61` | Para 4 combinações tema×casa: tokens obrigatórios; `--ink/--ink-2/--ink-3/--hc` sobre `--bg/--surface/--surface-2` com contraste WCAG AA ≥4,5; `--on-hc` sobre `--hc`; `--on-hero` sobre cada cor do `--hero`; `--hero-btn-ink` sobre branco; casas distintas (Amiens: mais vermelho que azul em surface-2; Connolly: o inverso); `--hero` definido uma vez por casa/tema |

Observação: `textContainment.test.ts:6` lê só `theme.css` e `styles.css`; os testes de `designSystem` leem só `elevate.css` 🟢. Os breakpoints desktop/mobile usados: 720px (principal), 1024px (grid), 1180/1400px (topbar) 🟢.

## 9. Impressão 🟢
Três blocos `@media print`: `styles.css:454-459` (esconde topbar/sidebar/bottom-nav/toasts, A4 landscape 8mm), `styles.css:664-668` (`.no-print`, `.tabs`), `elevate.css:293-300` (continuidade em preto/branco, `break-inside: avoid`), `theme.css:98` (corpo branco no escuro).

## Lacunas
Ver `_reversa_sdd/questions.md` (itens `[interface-e-i18n]`).
