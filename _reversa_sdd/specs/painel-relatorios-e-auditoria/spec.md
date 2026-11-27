# Spec — painel-relatorios-e-auditoria

> Redator Reversa · doc_level=completo · pt-br · 🟢/🟡/🔴. Fontes: `modules/painel-relatorios-e-auditoria/*`, `findings-verification.md` (#1, #2, #4), `permissions.md`, `cross-cutting.md §2`, ADR 0002.
> **Atenção:** o `code-analysis` deste módulo contém três achados **superados** pelo Detetive (§12). Esta spec segue o veredito.

## 1. Objetivo
Dar à equipe uma Home com painel e pendências, à gestão relatórios por período/casa/categoria com drill-down, e consulta de auditoria (mudanças e leituras de perfil) com exportação CSV. Todo cálculo agregado é feito no Postgres. 🟢

## 2. Atores
Equipe (Home, pendências), Admin (Reports, Audit, `person_summary`). 🟢

## 3. Requisitos funcionais
**RF-01 Home (`Today`).** Relógio do servidor (`serverOffsetMs`); casa de ação (station→ativa; porter com posto office→casa do posto; demais null); botão primário (Next check → `/sheet`; gestão sem posto → `/no-shows`); cartão "On duty" (office por casa + Float); `HomeDashboard`, `ShiftRuler`, `PresenceAlertCard`, `PendingTile`, `BedBoard`. 🟢

**RF-02 Painel (`home_dashboard`, M38).** Exige `is_active_staff`; padrão 14 dias; `invalid_period` se não finito, `to<from`, `>365` dias, `from<2020-01-01` ou `to>hoje+31`. Retorna `series` (admissions, outs, no_shows, maintenance, occupied às 23:00), `lodges` (beds_total, out_of_use, present, occupied, out_pending, seen_today, checks, rounds, absences_now), `totals`, `maintenance_open`; tudo filtrado por `can_see_lodge`. Cliente: presets 7/14/30/90/custom, `validPeriod`, cartões recolhíveis, polling 120 s, erros ignorados. 🟢 / 🟡
- Cama com Out decidido conta como livre; denominador do "Seen" são os presentes. 🟢

**RF-03 Pendências (`pending_counts`).** `{tasks, maintenance, absences, checks, rounds, no_shows}` por casa; `usePendingCounts` soma casas, polling 60 s; badges do menu. 🟢 Veredito #4: **possui** `can_see_lodge` (M29:841; `house-scope.test.ts:44-48`).

**RF-04 Relatórios (`report_period`, `report_details_period`).** Gestão; `check_period` (período ≥2020-01-01, ≤400 dias, `from<=hoje+366`); 12 blocos em `order` (occupancy, maintenance, no_shows, warnings, dinner, laundry, hours, rounds_checks, temperature, movements, late_entries, coverage); `dinner`/`laundry` NULL se nenhuma casa selecionada tem o serviço; contagem = lista (cada número reaproveita `report_details_period`); sem LIMIT. 🟢
- **Warnings:** o servidor devolve `warnings.warning` e `warnings.final_warning` (M37 converte dados, CHECK e patch de `report_period`/`report_details_period`); o front (`METRIC_ORDER`, `DETAIL_METRICS`) está alinhado; as métricas ficam clicáveis. Veredito #1 REFUTADO. Risco residual 🟡: patch por `replace` sem teste das chaves.

**RF-05 Relatório de compras.** `report_purchases` (ver `compras-e-fornecedores` RF-08), com `by_status`. Veredito #2 REFUTADO. 🟢

**RF-06 UI de Reports.** `periodRange` (day/week/fortnight/month/custom; `to` exclusivo), casa `both|id`, categorias (`occupancy, presence, maintenance, services, hours, purchases`), split por casa ("AMIENS 3 · CONNOLLY 5"), diálogo de detalhe; erro da RPC vira relatório vazio sem aviso. 🟢 / 🟡

**RF-07 Audit (UI).** Abas *changes* e *reads*; filtros por URL; `De/Até` com prioridade sobre o atalho `range`; paginação por cursor `id` (100); `diffRecord` ignora `version,id,created_at`; rótulos de módulos/tabelas; CSV só das linhas carregadas, cabeçalho fixo em inglês, BOM, proteção contra injeção de fórmula. 🟢
- 🟡 `suppliers` e `laundry_machines` auditadas mas fora de `MODULES` (aparecem só sem filtro de módulo).

**RF-08 Auditoria no servidor.** `search_audit` e `search_access_log`: gestão; padrão 30 dias, máx. 366 (`range_too_large`), `invalid_range`; limite 1–500; `ILIKE` com escape de `\ % _`. `audit_row` e `audit_immutable` (ver `cross-cutting.md §2`). 🟢

**RF-09 Ficha da pessoa (`person_summary`).** Gestão; `staff_not_found`; funções 60 dias, escalas 14 dias, 10 turnos, 15 notas (inclui coautoria), horas do mês, assinaturas 30 dias. 🟢

## 4. Regras de negócio
RN-01 Períodos de relatório em dias operacionais, `[from, to)`; futuro/em curso não conta além de `now()`. 🟢
RN-02 Ocupação média = média da ocupação às 23:00 de cada dia já ocorrido; admissões excluem transferências. 🟢
RN-03 `periodRange(fortnight)` = segunda da semana passada até +14 dias. 🟢
RN-04 `report_period` e `report_details_period` mantêm "número = lista". 🟢
RN-05 UPDATE que só muda `version` não gera auditoria. 🟢
RN-06 Wrappers legados `report_details`, `report_monthly` sem uso no front. 🟢

## 5. Dados
`audit_log`, `access_log` (imutáveis), consultas sobre `stays`, `no_shows`, `maintenance_tickets`, `warnings`, `rota_shifts`, `work_intervals`, `shop_orders`; `localStorage` (`home.period`, `home.collapsed`) apenas como conveniência. 🟢

## 6. Interfaces
RPCs: `home_dashboard`, `pending_counts`, `report_period`, `report_details_period`, `report_purchases`, `check_period`, `person_summary`, `search_audit`, `search_access_log`. Rotas `/`, `/reports`, `/audit`. 🟢

## 7. Estados
Sem máquina de estados própria. 🟢

## 8. Permissões
Home e painel: equipe ativa, com `can_see_lodge`. Reports, Audit, `person_summary`: só gestão. 🟢

## 9. Casos de borda
- EB-01 Servidor aceita `to` até hoje+31 no painel; o front limita a hoje. 🟢
- EB-02 Última página com exatamente 100 linhas mostra "load more" que volta vazio. 🟢
- EB-03 `hours.planned_minutes` inclui turnos sem casa apenas com >1 casa. 🟡
- EB-04 `ILIKE` sobre JSON serializado: varredura sequencial em janelas grandes. 🟡
- EB-05 `report_details_period` sem LIMIT em até 400 dias. 🟡

## 10. Requisitos não funcionais
Polling 120 s (painel) e 60 s (pendências); `useLatestRequest` contra corridas; `localStorage` em try/catch; índices de auditoria por ator e tabela/tempo; sem Realtime. 🟢

## 11. Lacunas 🔴
Tratamento de erro em Reports/HomeDashboard/PendingTile (silencioso); índice para busca textual da auditoria; inclusão de rascunhos de compras em Reports.

## 12. Contradições anotadas (módulo × Detetive)
| Achado no `code-analysis` | Veredito vigente |
|---|---|
| §5.5 "front espera `warning/final_warning` mas servidor devolve `verbal/written/final_written`" | **REFUTADO** (#1): M37 converte; chaves alinhadas |
| §5.7 "`report_purchases` não devolve `by_status`" | **REFUTADO** (#2): patch M37 acrescenta |
| §4 "🔴 `pending_counts` não chama `can_see_lodge`" | **REFUTADO** (#4): M29:841 redefine com a checagem |

## 13. Rastreabilidade
`src/pages/Today.tsx, Reports.tsx, Audit.tsx`; `src/components/HomeDashboard.tsx, PendingTile.tsx, ShiftRuler.tsx, PresenceAlertCard.tsx, BedBoard.tsx`; `src/lib/management.ts, pending.ts, audit.ts, auditLabels.ts, csv.ts, useNextCheck.ts, shiftRuler.ts`; SQL `M01, M17(beta_management), M20, M21, M22, M27, M29, M31, M37, M38`; testes `tests/db/audit-search.test.ts`, `house-scope.test.ts`, `src/pages/Audit.test.tsx`, `HomeDashboard.test.tsx`, `PendingTile.test.tsx`, `Today.test.tsx`, `pending.test.ts`.
