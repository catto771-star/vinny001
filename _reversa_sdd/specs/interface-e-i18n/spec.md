# Spec — interface-e-i18n

> Redator Reversa · doc_level=completo · pt-br · 🟢/🟡/🔴. Fontes: `modules/interface-e-i18n/*`, `cross-cutting.md §3–§5`, `findings-verification.md` (#3), ADR 0004, 0011.

## 1. Objetivo
Casca da aplicação (menu, barras, diálogos, tema por casa), catálogo de textos (só `en-IE` no Beta), mapeamento de erros do banco para mensagens, regras de tempo/fuso de Dublin, filtros em URL e guardas de CSS por testes. 🟢

## 2. Atores
Todo usuário da UI; desenvolvedores (testes-guardiões). 🟢

## 3. Requisitos funcionais
**RF-01 Layout e navegação.** `Layout` = `ActiveLodgeProvider` + `ContinuityKeeper` + `Shell`. 5 grupos (Overview, Residents & Presence, Occurrences, Services, Team & Management); itens `managementOnly` filtrados por `isManagement`; barra inferior `BOTTOM_ADMIN` (Home, Alerts, Presence, Log + More) × `BOTTOM` (Home, Room Check, Handover, Residents + Menu); badges (poll 60 s; ">99"→"99+"); menu retrátil persistido em `localStorage["nav.open"]`; `HouseSwitch` (radiogroup, gestão com ≥2 casas); `OnDutyChip`. 🟢

**RF-02 Transições.** `transitionKind`: sem anterior/igual ⇒ none; POP ⇒ pop; mesma seção e mais fundo ⇒ push, mais raso ⇒ pop; senão fade. 🟢

**RF-03 Dialog.** `<dialog>` nativo com `showModal()`; fechar anima 200 ms; ESC e backdrop passam por `requestClose`. 🟢 (🟡 `aria-label="×"` não traduzido)

**RF-04 Tema.** `defaultTheme`: escuro se standalone ou largura <720, senão claro; escolha em `localStorage["ui.theme"]`; `applyTheme` define `data-theme` e `meta[name=theme-color]`; `data-house` por casa (Amiens por omissão); tokens por casa+tema. 🟢

**RF-05 Catálogo i18n.** `LOCALES=["en-IE"]`, fallback `en-IE`; `translate` (locale → fallback → chave); `interpolate` `{nome}`; `en-IE.ts` (~1302 linhas, ~40 seções); guia de estilo executável (`copy.test.ts`): sem "Please", sem "!", grafia irlandesa, "Lodge" só em `app.name`, frases ≤110 caracteres; `i18n.test.ts` exige mesmas chaves e variáveis. `setLocale` ainda grava `dslodge.locale` (legado). 🟢 / 🟡

**RF-06 Mapa de erros (`errors.ts`).** Lista ordenada de ~110 regras `[RegExp, chave]`; `errorKey(error)` devolve a primeira que casa, senão `errors.generic`; rede, sessão (`JWT expired|refresh_token`) e permissão (`row-level security|permission denied|42501`). Teste `errors.coverage.test.ts` varre `raise exception '<codigo>'` de todas as migrations; códigos fora de `INTERNAL` (9) devem mapear a algo ≠ generic. 🟢
- **Bug confirmado (veredito #3):** `/not_author/` (linha 5) precede `/not_authorised|…/` (linha 90) e casa por substring; toda recusa `not_authorised` mostra `errors.notAuthor` ("Author only. Manager or Owner can always amend."). Correção: ancorar `/\bnot_author\b/` ou reordenar; cobrir com teste (`errors.test.ts:11` só cobre `"not_author"`). 🟢
- Códigos sem regra dedicada hoje caem em `generic`: `late_reason_required`, `invalid_priority`, `invalid_slot`, `invalid_performer` (🟡; o teste de cobertura admite o que está em `INTERNAL`).

**RF-07 Tempo e fuso (`time.ts`).** Banco em UTC; tela em `Europe/Dublin`; dia operacional 07:00–07:00 (`operationalDay` idêntico a `public.operational_day()`); `dublinWallTimeToDate` com segunda passada para horários inexistentes; `shiftOf` Day 07–19/Night 19–07; formatadores (`formatDate dd/mm/aaaa`, `formatTime 24 h`, `formatClock`, `formatCivilDate` UTC para datas de nascimento, `toDublinInputValue`/`fromDublinInputValue`). 🟢 / 🟡 (hora repetida no fim do horário de verão)

**RF-08 Filtros em URL.** `parseFilters` (descarta valores inválidos), `serializeFilters` (remove vazios, preserva parâmetros alheios, `multi` ordenado), `activeFilters`, `matchesText` (NFD sem acento/caixa; AND por palavras); `useUrlFilters` com `replace:true`. Usado em Audit, Maintenance, Handover, Warnings, HomeDashboard. 🟢

**RF-09 Regras de CSS por teste.** `textContainment.test.ts`, `designSystem.test.ts`, `themeContrast.test.ts` (contraste WCAG AA ≥4,5 em 4 combinações tema×casa; casas distintas por tonalidade). 🟢

**RF-10 Impressão.** Blocos `@media print` em `styles.css`, `elevate.css`, `theme.css` (A4 landscape 8 mm, esconde navegação, preto e branco). 🟢

## 4. Regras de negócio
RN-01 Interface somente em inglês (ADR-0011), embora o banco declare `app_locale` com `pt-PT, en-IE, pl-PL`. 🟢
RN-02 Toda exceção SQL nova precisa de regra em `errors.ts` e texto em `en-IE.ts` (garantido pelo teste de cobertura). 🟢
RN-03 Ordem das regras importa: específicas antes de genéricas. 🟢
RN-04 Relógio exibido deve vir do servidor (`serverOffsetMs`). 🟢

## 5. Dados
`localStorage`: `ui.theme`, `nav.open`, `lodge.active`, `lodge.start`, `dslodge.locale` (legado), `home.period`, `home.collapsed`, `continuity.snapshot`; `sessionStorage`: `maint.reminder.until`. Tipos TS: `MessageKey`, `StaffRole`. 🟢

## 6. Interfaces
Sem RPC próprio. Componentes: `Layout`, `Dialog`, `Tabs`, `Toast`, `Notice`, `Skeleton`, `FilterBar`, `LodgeTabs`, `ThemeToggle`, `DateTimeField`. 🟢

## 7. Estados
Menu aberto/fechado por grupo; tema claro/escuro; casa ativa. 🟡

## 8. Permissões
Menu e rotas escondem itens por `isManagement` (UX; segurança real no banco). 🟢

## 9. Casos de borda
- EB-01 `setLocale` grava chave que `initialLocale` apaga na próxima carga (código legado). 🟡
- EB-02 Push (Edge) e e-mail do código têm textos fora do catálogo. 🟡
- EB-03 Hora repetida no fim do horário de verão (01:00–02:00) resolvida pela primeira passada. 🟡
- EB-04 `theme.css` usa `!important` extensivamente; definição de tokens além da linha 92 não detalhada. 🔴 parcial

## 10. Requisitos não funcionais
Acessibilidade (contraste AA, `prefers-reduced-motion`, transições ≤240 ms); responsividade (breakpoints 720, 1024, 1180, 1400 px); sem CSP no host (🟡, ver `cross-cutting.md`). 🟢

## 11. Contradições anotadas
Nenhuma entre módulo e Detetive. O item #3 confirma o que o módulo `acesso-e-autenticacao` já registrava.

## 12. Lacunas 🔴
Os idiomas `pt-PT` e `pl-PL` voltarão? (`questions.md`); tokens de tema integrais; ativos de fonte.

## 13. Rastreabilidade
`src/components/Layout.tsx, Dialog.tsx, Tabs.tsx, Toast.tsx, Notice.tsx, FilterBar.tsx, LodgeTabs.tsx, ThemeToggle.tsx, DateTimeField.tsx`; `src/i18n/index.tsx, en-IE.ts`; `src/lib/errors.ts, time.ts, theme.ts, filters.ts, useUrlFilters.ts, navGroups.ts, transition.ts, useLatestRequest.ts`; `src/main.tsx`, `src/*.css`; testes `copy.test.ts, i18n.test.ts, errors.test.ts, errors.coverage.test.ts, time.test.ts, filters.test.ts, textContainment.test.ts, designSystem.test.ts, themeContrast.test.ts, theme.test.ts, navGroups.test.ts, transition.test.ts`.
