# Componentes e padrões de interface — DS Lodge (Design System)

> Fonte: `src/components/*.tsx`, classes de `src/styles.css`, `src/theme.css`, `src/elevate.css`, `docs/DESIGN.md`. Biblioteca própria (sem Storybook, sem UI lib externa; ícones `lucide-react`). 🟢 confirmado no código · 🟡 inferido · 🔴 lacuna. Tokens citados estão em `tokens.md`; tema em `themes.md`; testes em `css-contracts.md`.
> Convenção: componentes React expõem **só semântica**; a aparência vem de classes CSS globais (sem CSS Modules). Textos vêm do catálogo `i18n` (`useI18n().t`), nunca fixos (exceção: `aria-label="×"` do Dialog 🟡).

## 1. Componentes React compartilhados (`src/components/`)

| Componente | Props principais | Variantes / estados | Classes CSS | Notas de acessibilidade |
|---|---|---|---|---|
| `Tabs` | `items: {value,label,hint?,status?,statusLabel?}[]`, `value`, `onChange`, `label`, `size: "md"|"sm"` | `status`: `idle` (anel), `progress` (warn), `done` (ok), `danger`; `hint` em `.tab-hint` | `.tabs .tabs-md|sm`, `.tabs-indicator` (polegar deslizante com `--hero`), `.tab`, `.status-dot.is-*` | `role=tablist/tab`, `aria-selected`, `tabIndex` roving, setas ←/→ (circular), `statusLabel` em `.sr-only` e `title`; não chama `scrollIntoView` (só rola a faixa) |
| `Dialog` / `DialogCancel` | `title`, `onClose`, `children`, `footer?`, `wide?` | `.dialog-wide` (780 px); saída animada (`is-closing`, 200 ms); celular: folha de baixo; computador: centralizado (`inset:0; margin:auto`) | `.dialog`, `.dialog-header` (faixa `--house` 4 px), `.dialog-body`, `.dialog-footer` | `<dialog>` + `showModal()` (foco preso, Esc via `onCancel`), fecha ao clicar no fundo, botão fechar `aria-label="×"` |
| `Toast` (`ToastProvider`, `useToast`) | `success(m)`, `error(m)`, `info(m)` | `toast-success/error/info`; máx. 4 empilhados; some em 3,2 s | `.toasts` (fixo, `z-index:60`), `.toast`, `.toast-icon` | `aria-live="polite"`; `role="alert"` em erro, `status` nos demais; fora do provedor vira no-op |
| `Notice` | `kind: info|error|success|warning`, `children` | cores `--*-soft` | `.notice .notice-*` | `role="alert"` (erro) ou `status`; não renderiza se vazio |
| `Skeleton` | `rows=5`, `label` | linhas cinza estáticas (sem shimmer), larguras variam | `.skeleton`, `.skeleton-line` | `role=status`, `aria-busy`, `aria-label` |
| `ThemeToggle` | `withLabel?` | sol/lua; `withLabel` vira link com texto | `.theme-toggle` / `.link-button` | `aria-label` + `title` (a ação, "mudar para escuro/claro") |
| `Clock` | `offsetMs` | hora do servidor em Dublin | `.clock-time`, `.clock-date`, `.clock-weekday` | usa `<time>` 🟡 |
| `Layout` (+ `HouseSwitch`) | — | topo, menu lateral em módulos, barra inferior, gaveta | `.shell .topbar .sidebar .content .bottom-nav .drawer-list .nav-item .nav-group-* .nav-badge .house-toggle` | `HouseSwitch`: `role=radiogroup`/`radio`, `aria-checked`, setas alternam; menu: `aria-expanded`/`aria-controls`; só Admin vê o interruptor |
| `LodgeTabs` / `useDefaultLodge` | `value`, `onChange`, `only?` | com 1 casa mostra `.chip` em vez de abas | usa `Tabs` | |
| `PendingTile` | — | lista de pendências por seção | `.bento-tile .tile-pending .pending-list .pending-go .pending-label` | cada linha é `<a>` ≥ 44 px |
| `PresenceAlertCard` | — | cartão de alerta de presença (No Show / checks) | `.card .card-alert` | |
| `BedBoard` | `lodge`, `beds: BedOccupancy[]` | célula: `occ`, `free`, `free cancelled` (cama liberada por cancelamento), `oos`, `+fw` (Final Warning) | `.board-card .board-room .board-code .bed-cell(.occ|.free|.cancelled|.oos|.fw)`, `.board-legend` | `aria-label` do link; cores não são o único sinal (`oos` hachurado, `fw` barra inferior, `cancelled` ponto) 🟡 |
| `ShiftRuler` | `lodgeIds` | marcas `done`, `late`, `due`, `upcoming`; tipo `check` (barra) ou `round` (quadrado); "agora" em `--accent` | `.ruler-card .ruler-track .ruler-tick.kind-check|round .is-done|late|due .ruler-now` | assinatura visual (só na tela Hoje); legenda textual 🟡 |
| `HomeDashboard` | — (usa `home_dashboard`) | período 7/14/30/90/custom, cartões recolhíveis, anel/linha/barras | `.dash-card .dash-kpis .dash-occ .period-filter .ring-* .barchart-*` | gráficos desenhados em SVG/CSS; pesquisa `linePath`, `pct` testados |
| `FilterBar` (+ `useUrlFilters`, `lib/filters.ts`) | `defs` (`search|select|multi|date|text`, `primary?`), `values`, `onChange`, `onClear`, `count?` | "More filters", chips ativos, "Clear all" | `.filter-bar .filter-row .filter-search .filter-field .filter-panel .filter-chip` | `<fieldset>/<legend>` em multi; filtros vão na URL |
| `StaffPicker` | `people`, `author`, `defaultId`, `hintKey`, `coAuthors`, `onAuthor`, `onCoAuthors`, `required?` | chip do autor (`is-author`), `+ Add colleague n/4` (`is-add`), remover (`.chip-x`) | `.staff-picker .person-chip .avatar .staff-pop .staff-options` | popover com busca; limite 3 colegas (`addColleague`) |
| `ResidentPicker` | `options`, `value`, `onChange`, `emptyLabel`, `autoFocus`, `label` | busca com lista (limite 50) | `.resident-picker-list` | `role=combobox/listbox/option`, `aria-autocomplete` |
| `DateTimeField` / `DateTimeInput` | `label`, `value: Date|null`, `onChange` | "agora" (vazio) ou `datetime-local` em Dublin | `.field .inline .inline-check` | rótulos ligados |
| `AdmitDialog`, `AnticipateDialog`, `MaintenanceDialog`, `WarningDialog` | específicos de formulário | usam `Dialog` | `.form .form-grid .button-row` | |

## 2. Primitivos em CSS (classes, sem componente)

| Primitivo | Classes / seletores | Variantes e estados |
|---|---|---|
| **Botão** | `button`, `.button-link`; `.primary`, `.danger`, `.danger-outline`, `.ghost`, `.small`, `.icon-btn` (44x44), `.icon-button` (36), `.link-button` (texto sublinhado), `.theme-toggle` (32), `.chip`, `.filter-more` | Padrão = relevo (gradiente `--btn-top→--btn-bottom`, `--hi`, `--sh-1`); `primary` = `--hero` com brilho; `danger` = gradiente do `--danger`; hover sobe 1 px, `:active` afunda; `:disabled` sem sombra, opacidade .5; botões dedicados `.seen-btn`, `.took-btn` |
| **Campo** | `input`, `select`, `textarea`, `.field`, `.form label` | "afundado" (sombra interna); foco: contorno interno `--hc` + halo 4 px `--hc-soft`; `select` com seta própria (`appearance:none`); datas com ícone nativo; checkbox/radio 20 px; **switch** = `input[role="switch"]` em `.switch-row` |
| **Chip de escolha** | `button.chip`, `.chip-row`, `.tag-chips` | contorno; `.is-on`/`aria-pressed="true"` = gradiente da casa + ✓; cores das tags `.tag-c-*` |
| **Etiqueta** | `.tag`, `.tag-ok`, `.tag-danger`, `.tag-kind`, `.tag-c-red|amber|green|blue|violet` | pílula 22 px, sem borda |
| **Cartão** | `.card`, `.card-alert`, `.dash-card`, `.bento-tile`, `.composer`, `.duty-card`, `.shift-bar`, `.timeline`, `.table` | raio 22; sem borda (anel `--line` + sombra); `.card-alert` fundo `--warn-soft` |
| **Cabeçalho de Hoje** | `.today-head` | gradiente `--hero`, texto `--on-hero`, botão branco com tinta `--hero-btn-ink` |
| **Lista/Timeline** | `.timeline-item(.kind-shift)`, `.ticket(.prio-urgent,.is-overdue)`, `.pending-list` | `kind-shift` com fundo tingido; atraso com faixa lateral `--danger` |
| **Tabela** | `.table`, `.table-scroll`, `.audit-table`, `.sheet-table-wrap` | rola no quadro; ≤719 px vira cartões (Audit) |
| **Menu** | `.sidebar`, `.nav-item(.active)`, `.nav-group(.is-open)`, `.nav-group-toggle`, `.nav-chevron`, `.nav-badge`, `.bottom-nav`, `.drawer-list` | módulos retráteis; estado em `localStorage nav.open`; barra inferior com rótulos de uma palavra |
| **Quarto/cama (Bed map)** | `.bed`, `.bed-free|occupied|out-pending|oos`, `.room-card .bed-list`, `.bed-body strong` (2 linhas + reticências) | cama livre tracejada; fora de uso hachurada |
| **Diff/Audit** | `.diff del/ins`, `.audit-*` | del = danger, ins = ok |
| **Avatar** | `.avatar` (28 px, iniciais, `--hero`) | |
| **Interruptor das casas** | `.house-toggle`, `.house-toggle-thumb`, `.house-toggle-opt` | polegar desliza 320 ms |
| **Tarefa/check** | `.task-check` (check desenhado em CSS) | |
| **Status** | `.status-dot.is-idle|progress|done|danger` | 8 px |

## 3. Padrões de uso
- **Ação principal**: um `button.primary` por região; no topo de Hoje, "lançar o check" em botão branco sobre o gradiente.
- **Rótulos de botão** padronizados em inglês (revisão 15): New Warning, New Maintenance Request, New Delivery, New Absence, Confirm Return, Hand Over Shift, Save Entry, Cancel Bed, Confirm Cancellation, Received no Dinner. Sem ponto final, sem exclamação, sem "Please"; "house" no lugar de "Lodge" na UI (guardado por `src/i18n/copy.test.ts`).
- **Estados vazios/carga**: `Skeleton` (carga), texto `.muted` (vazio), `Notice` (erro/aviso).
- **Confirmação**: `Toast` (sucesso) + `Dialog` para ações com campos.
- **Filtros**: `FilterBar` + URL; ordem do topo cede espaço (nome do usuário ≤1400 px, chip do plantão ≤1180 px).
- **Impressão**: `@media print` esconde topo, menu, barra inferior, toasts, abas, filtros; modo escuro imprime em claro (`PrintSheet`).

## 4. Lacunas 🟡/🔴
- 🔴 Sem Storybook nem catálogo visual dos componentes; só `ui.test.tsx` (Tabs, Skeleton, Toast, Dialog) e testes pontuais.
- 🟡 Não há componente de `Button`/`Field` React: variantes dependem de classes (`primary`, `small`...) e de seletores `:not([class])` em `elevate.css` (um botão com **qualquer** classe deixa de receber o estilo padrão de relevo e precisa estar listado, ex.: `.small`, `.icon-btn`, `.ghost`).
- 🟡 Há CSS de componentes antigos ainda carregado (`.bed-*`, `.ruler-*` com tokens base, `.metric-link`), sobrescrito por revisões posteriores com `!important`.
