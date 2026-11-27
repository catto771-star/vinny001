# Análise de código — painel-relatorios-e-auditoria

> Agente: Arqueólogo (Reversa) · doc_level: completo · Escala: 🟢 confirmado · 🟡 inferido · 🔴 lacuna
> Escopo: tela inicial (Today, HomeDashboard, PendingTile), Reports, Audit e as RPCs/tabelas que os alimentam.
> Convenção de caminhos: `arquivo:linha` relativo à raiz do projeto. Migrations em `supabase/migrations/`.

## 1. Visão geral

| Camada | Artefato | Função |
|---|---|---|
| UI | `src/pages/Today.tsx` | Home: cabeçalho de turno, quem está de serviço, painel, régua, pendências, quadro de camas |
| UI | `src/components/HomeDashboard.tsx` | Painel com período (7/14/30/90/custom), cartões recolhíveis, gráficos SVG/CSS |
| UI | `src/components/PendingTile.tsx` + `src/lib/pending.ts` | Contadores de pendência por seção; badges do menu |
| UI | `src/pages/Reports.tsx` + `src/lib/management.ts` | Relatórios por período/casa/categoria com drill-down |
| UI | `src/pages/Audit.tsx` + `src/lib/audit.ts` + `src/lib/auditLabels.ts` + `src/lib/csv.ts` | Auditoria de mudanças e de leituras de perfil, export CSV |
| DB | RPCs `home_dashboard`, `pending_counts`, `report_period`, `report_details_period`, `report_purchases`, `check_period`, `person_summary`, `search_audit`, `search_access_log` | Cálculo no servidor (SECURITY DEFINER) |
| DB | Tabelas `audit_log`, `access_log`; função/trigger `audit_row`, `audit_immutable` | Trilha imutável |

Todo cálculo agregado é feito no Postgres; o front só formata e exibe. 🟢

## 2. Home — `Today.tsx`

- `Today()` `src/pages/Today.tsx:16`. Lê `useAuth()` (`lodges, post, staff, isManagement, isStation, serverOffsetMs`) `:18`.
- **Relógio do servidor**: `now = new Date(Date.now() + serverOffsetMs)` `:22`; `opDay = operationalDay(now)` `:23`. 🟢 Evita depender do relógio do aparelho.
- **Casa de ação** `actionLodge` `:27`: conta de casa (`isStation`) → casa ativa (`useActiveLodge`); porteiro com posto `office` → `post.lodge_id`; demais → `null` (Float/gestão veem as duas). 🟢
- `useNextCheck(actionLodge, serverOffsetMs)` `:28` fornece `next.slot`, `pendingCount`, `loading`.
- **Botão primário** `:57-63`: (a) casa com próximo check → "Next check" → `/sheet`; (b) gestão sem posto → `/no-shows`; (c) senão → `/sheet`. 🟢
- **Texto do cabeçalho** `:46-55`: station → "on duty (roster)" via `onDutyFor(posts, actionLodge)` `:30`; com posto Float → `post.youAreFloat`; Office → `post.youAre`; sem posto → nome + papel. 🟢
- **Cartão "On duty"** `:72-109`: uma linha por casa (posto `office`) + Float; `dutyLoading` mostra "loading", ausência de office vira `warn-text` "nobody" `:87`, ausência de Float vira `muted` `:103` (assimetria deliberada). 🟢
- Composição `:112-127`: `<HomeDashboard/>`, `<ShiftRuler lodgeIds={rulerLodges}/>` (`rulerLodges` `:34` = casa de ação ou todas), `<PresenceAlertCard/>`, `<PendingTile/>`, `BedBoard` por casa (`beds.filter(b=>b.lodge_id===l.id)` `:125`). 🟢
- Isolamento por casa é do banco (RLS restritiva, ver módulo `configuracoes-e-cadastros`); `lodges` já chega filtrado para conta de casa. 🟡 (inferido de `can_see_lodge` em `home_dashboard`, `r16.sql:124`).

## 3. HomeDashboard — `src/components/HomeDashboard.tsx`

### 3.1 Tipos
`LodgeStats`, `DayPoint`, `Totals`, `Dashboard` `:10-16` espelham o JSON de `home_dashboard` (ver §8.1). `present?` e `totals?`/`period?` são opcionais para compatibilidade com versão antiga da RPC `:11,16`. 🟢

### 3.2 Funções puras (testáveis)
| Função | Linha | Regra |
|---|---|---|
| `pct(part,total)` | `:19` | `total>0 ? round(part/total*100) : 0` (sem divisão por zero) |
| `linePath(values,w,h,min,max)` | `:24` | Gera `M/L` SVG; eixo Y invertido; `span = max-min \|\| 1`; `step = w/(n-1)` (0 se n=1); `[]` → `""` |
| `presetRange(kind,today)` | `:50` | `{from: today-(kind-1), to: today}` (7 dias = hoje e 6 anteriores) |
| `validPeriod(from,to)` | `:54` | Regex `YYYY-MM-DD` em ambos, `to>=from`, diferença ≤ 365 dias (espelha `v_to - v_from > 365` no servidor, `r16.sql:96`) |
| `readJson/writeJson` | `:58,61` | `localStorage` em try/catch; falha silenciosa |

### 3.3 Estado e preferências locais
- Chaves `home.period` e `home.collapsed` `:46`. Período inicial `:113-118`: se salvo é `custom` e válido, usa; senão usa preset salvo (se está em `PRESETS`) ou **14**; presets são **sempre reancorados em hoje** `:125` (não reaproveita `from/to` antigos). 🟢
- Cartões recolhíveis: IDs `house:<lodge_id>`, `maint`, `occ`, `move` `:140`. `setAll` `:142` recolhe/expande tudo. 🟢

### 3.4 Carga de dados
`useEffect` `:126-131`: `supabase.rpc("home_dashboard", {p_from, p_to})`, **polling a cada 120 s** `:129`; **erros da RPC são ignorados** (`d && setData`) — sem estado de erro nem mensagem. 🟡 (ver questions).
Enquanto `data` é nulo mostra `Skeleton` `:133`.

### 3.5 Cálculos de exibição
- `free = max(0, beds_total - occupied - out_of_use)` `:155`.
- `present = l.present ?? l.occupied` `:156`; `seenPct = pct(seen_today, present)` `:157` (o denominador do "Seen" são os **presentes**, não os ocupados). 🟢
- Legenda `:168`: se `out_pending>0` usa `home.occLegendCancelled` (cama com cancelamento decidido conta como livre; ver `r16.sql:114`). 🟢
- Fallback de totais `:139` quando `data.totals` ausente: soma admissões/saídas/no-shows da série; `maintenance:0`, `avg_occupancy:0`.
- Gráfico de ocupação `:193-208`: usa `Math.min/max(...occ)`; com `series` vazia `series[0]` lançaria exceção — a RPC sempre devolve ≥1 ponto (limite `v_to>=v_from`), então não ocorre. 🟡
- Barras `:213-220`: altura relativa a `maxBar = max(1, max(admissions,outs))` `:137`.
- Rótulo do período `:138`: custom → `dd/mm–dd/mm`; preset → `home.lastDays`.

### 3.6 `PeriodFilter` `:65-90`
Input `date` com `max={today}` no "Até" `:83` e `to>=from` (`validPeriod`); submit só se `ok`. O servidor permite até `today+31` (`r16.sql:96`) — o front é mais restritivo. 🟢

## 4. PendingTile e pendências

- `PendingTile` `src/components/PendingTile.tsx:17`. `lodgeIds` `:20`: porteiro com posto office **e não gestão** → só a casa do posto; senão todas. Seis linhas fixas `ROWS` `:7-14` (checks→/sheet, rounds→/handover, tasks→/tasks, no_shows→/no-shows, absences→/absences, maintenance→/maintenance); só aparecem com contagem > 0 `:22`. Vazio → `pending.none`. 🟢
- `usePendingCounts(lodgeIds, refreshKey)` `src/lib/pending.ts:39`: uma chamada `rpc("pending_counts",{p_lodge})` por casa em `Promise.all` `:46`, soma com `sumCounts` `:8` (ignora nulos, `Number(c[k] ?? 0)`), **polling 60 s** `:50`; flag `cancelled` evita setState após desmontar `:41,47`. Erros ignorados (cai em `data=null` → soma zero). 🟡
- `BADGE_FOR_PATH` `:18`, `badgeFor` `:28` (notificações usam o contador de não lidas), `groupBadgeTotal` `:35` (soma por módulo do menu).
- **Servidor** `pending_counts(p_lodge)` `20261120000007_occurrences.sql:812-827`: `SECURITY DEFINER`, retorna `NULL` se `not is_active_staff()`; chaves `tasks` (`pending_tasks`), `maintenance` (tickets ≠ `resolved`), `absences` (`overdue_absences`), `checks` (`cardinality(pending_slots(...))` do dia operacional), `rounds` (`pending_rounds`), `no_shows` (`residents_without_evidence` do **dia operacional anterior**, `operational_day-1` até `operational_day_end(op_day-1)`). 🟢
- 🔴 `pending_counts` **não** chama `can_see_lodge`; a conta de casa poderia pedir contagem da outra casa (só números agregados). Ver questions.

## 5. Reports — `src/pages/Reports.tsx` + `src/lib/management.ts`

### 5.1 Estado
`kind` (`day|week|fortnight|month|custom`), `anchor`, `custom`, `house` (`both` ou id), `category`, `report`, `perHouse`, `purchases`, `detail` `:69-78`. `range = periodRange(kind, anchor, custom)` `:79`; `selected = both ? todas : [house]` `:80`.

### 5.2 `periodRange` — `management.ts:116`
Devolve `[from, to)` em dias operacionais (to **exclusivo**):
- `day`: `[anchor, anchor+1)`; `week`: segunda-feira (`weekStart` `:25`) até +7; `fortnight`: **semana anterior + semana atual**? Não: `s = weekStart(anchor) - 7`, `to = s+14` `:124-127` — ou seja, a segunda da semana passada até 14 dias (cobre a semana anterior completa e a atual). 🟢
- `month`: dia 1 do mês de `anchor` até dia 1 do seguinte (trata dezembro) `:128-133`.
- `custom`: `to = custom.to >= from ? custom.to : from`; devolve `to+1` (intervalo inclusivo na UI, exclusivo na RPC) `:134-138`. O rótulo mostra `addDays(range.to,-1)` `Reports.tsx:159`.

### 5.3 Carga `load` `Reports.tsx:83-96`
- `useLatestRequest()` descarta respostas antigas `:68,85,91` (corrida entre trocas de período). 🟢
- 1 chamada agregada `report_period({p_lodges: ids, ...})` + (se >1 casa) **N chamadas por casa** para o "split" `:88-89`; todas em `Promise.all`. `report ?? {}` — erro da RPC vira relatório vazio sem aviso. 🟡
- Categoria `purchases` chama `report_purchases({p_from,p_to})` separado `:102-106`; as duas casas juntas (sem filtro de casa). 🟢
- `openDetail(metric,title)` `:108-112` chama `report_details_period` com a métrica; mostra diálogo com `label/lodge/at/extra`.

### 5.4 Montagem dos blocos
- `reportBlocks(report)` `management.ts:60`: usa `report.order` (a ordem vem do servidor porque `jsonb` não preserva ordem de chaves) e descarta blocos nulos (ex.: `dinner` sem casa com jantar).
- `blocksOf(category, blocks)` `:165`: filtra pelos blocos da categoria `REPORT_CATEGORIES` `:157-164` (occupancy→[occupancy,movements]; presence→[no_shows,warnings,rounds_checks,late_entries]; maintenance; services→[dinner,laundry,temperature]; hours→[hours,coverage]; purchases→[]).
- `orderedMetrics(block,data)` `:79`: só valores `number|string`, ordenados por `METRIC_ORDER` `:66`; chaves desconhecidas vão ao fim. Objetos/arrays (`by_priority`, `by_location`, `by_reason`) viram barras `Reports.tsx:190-208`; `by_location` é array `{location,count}`.
- `formatMetric` `:88`: chaves terminadas em `_minutes` → `minutesLabel` ("h mm"); resto `Intl.NumberFormat` com 1 casa. 🟢
- `detailMetric(block,metric)` `:52`: `movements.admissions/outs` → `occupancy.*`; só gera link se a chave estiver em `DETAIL_METRICS` `:45-50`.
- `breakdownLabelKey` `:98` traduz motivos (`by_reason`) e prioridades (`by_priority`).
- `split(block,k)` `Reports.tsx:115-123`: para 2+ casas exibe "AMIENS 3 · CONNOLLY 5" ao lado do total (só valores numéricos/texto).

### 5.5 Inconsistência de nomes de métrica de Warnings 🔴
O servidor retorna `warnings.{verbal,written,final_written}` (`beta_management.sql:191-195`; enum `warnings.type` `occurrences.sql:688`) e `report_details_period` aceita `'warnings.'||w.type` (`:94-96`). O front tem `METRIC_ORDER.warnings = ["warning","final_warning"]` (`management.ts:70`) e `DETAIL_METRICS` com `warnings.warning`/`warnings.final_warning` (`:48`). Consequência provável: os três números aparecem (ordem fora do definido, ao fim) e **não ficam clicáveis** (`detailMetric` retorna `null`). 🟡 inferido; verificar tradução `reports.m_verbal`. Registrado em questions.md.

### 5.6 Servidor — `report_period` (`20261124000017_beta_management.sql:119-237`)
- Autoriza `is_management()` `:138`; `check_period` `:139`: `p_lodges` não vazio, datas finitas, `p_from>=2020-01-01`, `p_to>p_from`, `p_to-p_from<=400`, `p_from<=current_date+366` (`:7-18`) → `invalid_period` (22023). 🟢
- Janela: `v_from=operational_day_start(p_from)`, `v_to=operational_day_start(p_to)`, `v_until=least(v_to, now())` `:140-142` — períodos futuros/em curso não contam o futuro.
- Blocos (cada contagem reaproveita `report_details_period` para garantir "número = lista"): `occupancy` (`beds_total` = camas ativas em quartos ativos `:143`; `occupied` e `protected_by_absence` no instante `v_until-1s` `:153-155`; `average_occupancy` = média da ocupação às **23:00** de cada dia já ocorrido `:156-159`; admissions exclui transferências `transfer_from_stay_id is null`), `maintenance` (`opened/resolved/overdue/on_hold/in_progress/reopened/average_hours_to_resolve/by_priority/by_location top 5`), `no_shows` (`total`, `residents_1/2/3_plus` por número de no-shows confirmados, `beds_cancelled`, `undone`), `warnings`, `dinner`/`laundry` (**NULL** se nenhuma casa selecionada tem o serviço, `bool_or`), `hours` (`planned_minutes` do Roster publicado; `effective_minutes` = Roster publicado até agora + `work_intervals`), `rounds_checks` (`checks_launched`, `checks_pending` somando `pending_slots` por dia×casa já iniciado, `rounds_recorded`), `temperature.alerts`, `movements` (admissions, outs, transfers = in+out), `late_entries` (+ `by_reason`), `coverage.shifts_below_minimum` (`coverage_gaps`). `'order'` fixa 12 blocos `:149-150`. 🟢
- Nota de risco: `hours.planned_minutes` para uma casa inclui turnos com `lodge_id is null` apenas quando `cardinality(p_lodges)>1` `:206,208`; `work_intervals` filtra `w.lodge_id = any(p_lodges)` sem o ramo nulo. 🟡
- `report_details_period` `:33-117`: `UNION ALL` de ~17 métricas filtradas por `p_metric`; ordena por `at nulls last`; **sem LIMIT** (listas grandes em períodos de 400 dias). 🟡
- Wrappers legados `report_details` e `report_monthly` `:240-265` (mensal = caso particular); **não usados pelo front atual** (grep em `src/`). 🟢

### 5.7 `report_purchases` — `20261125000020_report_purchases.sql:2-26`
`is_management`; `check_period(array[gen_random_uuid()],...)` (truque para reutilizar a validação de período sem casas) `:10`. CTE `o` = `shop_orders` com `delivery_date` em `[from,to)`; `l` = linhas com `final_qty>0`. Retorna `orders`, `placed`, `items`, `total = Σ final_qty*unit_price`, `lines_without_price`, `by_category` (ordenado por total), `top_items` (limite 8). O front mostra aviso quando `lines_without_price>0` `Reports.tsx:37`. 🟢 (não retorna `by_status`, mas o front lê `data.by_status?.[s] ?? 0` `:34` → mostra 0; 🟡 — ver questions).

### 5.8 `person_summary` — `20261125000027_handover_coauthors.sql:81-111` (versão vigente)
Usada pela ficha de pessoa em `src/pages/Users.tsx:208` (módulo equipe). `is_management`; `staff_not_found` (P0002); retorna `functions` (contagem por função nos últimos 60 dias, Roster publicado), `roster_upcoming` (14 dias), `shifts_recent` (10), `notes_recent` (15; **inclui anotações em que a pessoa foi coautora** via `handover_entry_staff`, `:104`), `hours_month` (`staff_hours`), `tasks_signed_30d`. Substitui a versão de `person_summary.sql:2-31`. 🟢

## 6. Audit — `src/pages/Audit.tsx`

### 6.1 Abas e filtros
- `tab: "changes" | "reads"` `:19,53`. Filtros por URL via `useUrlFilters` `:83`. Aba *changes*: `q`, `range`, `module` (multi), `action` (multi), `actor`, `record`, `from`, `to` `:73-81`. Aba *reads*: `q` (nome do residente), `range`, `actor`, `from`, `to` `:72`. Trocar de aba chama `clear()` `:162`.
- **`periodParams(fv, now)`** `:32-47` (exportada, testada): `De/Até` (`from/to`) **têm prioridade** sobre o atalho `range`; `range` mapeia `RANGE_DAYS = {today:0,"7d":7,"30d":30,"90d":90,"365d":365}` `:28`, usando meia-noite **local** do navegador; `Até` é inclusivo (soma 1 dia) `:42-45`. Sem nada → `null` e o servidor assume 30 dias. 🟢
- `fetchPage(before)` `:86-97`: parâmetros comuns `p_from,p_to,p_actor,p_q,p_limit=PAGE(100),p_before`; *reads* → `search_access_log`; *changes* → `search_audit` + `p_tables = moduleTables(csv(module))`, `p_actions = csv(action)`, `p_record`. `useCallback` depende de `[tab, fvKey]` (eslint-disable `:96`).
- Carga inicial `:99-111` com `useLatestRequest`; erro → `errorKey(e)`; `hasMore = data.length === PAGE` `:108` (paginação por **cursor `id`**: `loadMore` usa `last.id` como `p_before` `:113-120`). Se a última página tiver exatamente 100 linhas, aparece "load more" que retorna vazio — comportamento aceito. 🟢
- Cache local de `staff` (`select *` `:64`) alimenta filtro "pessoa" e o mapa `uuid→nome` do formatador `:122`.

### 6.2 Apresentação do diff
- `diffRecord(old,new)` `src/lib/audit.ts:6-15`: une as chaves; **ignora `version`, `id`, `created_at`** (`:3`); compara por `JSON.stringify` (null e ausente equivalem). INSERT mostra só "depois"; UPDATE/DELETE mostram antes→depois `Audit.tsx:128`.
- Linha da tabela mostra até 2 mudanças; "+N more"; expandir mostra todas `:195-196,207`.
- `formatAuditValue(value, ctx)` `auditLabels.ts:37-46`: null/""→"—"; boolean→Yes/No; number→string; objeto→`JSON.stringify` (sem truncar); string UUID→nome (mapa de staff) ou 8 primeiros caracteres+"…"; ISO→`formatDateTime`; texto >80 caracteres é truncado. 🟢
- Rótulos: `TABLES` `auditLabels.ts:2-12` (nome de negócio), `MODULES` `:14-25` (10 módulos → tabelas), `tableLabel` `:28` (fallback: nome com `_`→espaço), `fieldLabel` `:30` (remove sufixos `_id`/`_at`), `moduleTables` `:29`.
- Lacuna de mapeamento 🟡: tabelas auditadas `suppliers`, `laundry_machines`, `handover_entry_tags`(sem trigger) e `quick_phrases` não estão em `MODULES`; `suppliers` e `laundry_machines` têm trigger de auditoria (`r15.sql:118`, `structure.sql:172`) mas só aparecem quando **nenhum filtro de módulo** está ativo. Rótulos caem no fallback ("Suppliers"…).

### 6.3 Exportação CSV
`exportCsv` `:133-151`: exporta **apenas as linhas carregadas** (páginas já buscadas), cabeçalho fixo `When, Who, Action, Module, Record, Field, Before, After` em inglês (não localizado), uma linha por campo alterado (linha vazia de campo se não houver mudanças), BOM UTF-8, nome `audit-YYYY-MM-DD.csv` (data UTC via `toISOString`). Download por `Blob` + `<a download>`.
`toCsv` `src/lib/csv.ts:2-11`: escapa `" , \r \n` com aspas; **proteção contra injeção de fórmula**: célula iniciada por `= + - @` ganha apóstrofo, exceto número/duração simples (`/^[-+]?\d+([.,:]\d+)*$/`) `:6`; separador de linha `\r\n`. 🟢

### 6.4 Servidor — `search_audit` / `search_access_log` (`20261125000031_audit_search.sql`)
- `is_management()` obrigatório (`not_authorised` 42501) `:21,58`. Datas não finitas → `invalid_range`; default `from = now()-30d`, `to = now()+1min`; `to<from` → `invalid_range`; janela >366 dias → `range_too_large` `:22-26`. 🟢
- Filtros opcionais (`p_tables`, `p_actions` vazios = sem filtro); `p_before` = cursor `id < p_before`; ordem `id desc`; `limit least(greatest(coalesce(p_limit,100),1),500)` `:38-39`. Busca `p_q` em `old_data::text || new_data::text` com `ilike` e **escape de `\ % _`** `:37` (testado: "trata % e _ como letras"). `search_access_log` busca no nome `first_name || ' ' || last_name` `:72`.
- `actor_name = coalesce(display_name, full_name)` `:28` — `NULL` ⇒ UI mostra "System" (`audit.system`) `Audit.tsx:123`.
- Índices: `audit_log_actor_idx`, `audit_log_table_time_idx`, `access_log_actor_idx` `:2-4`; base: `audit_log_record_idx`, `audit_log_time_idx` (`foundation.sql:719-720`).
- Privilégios: `revoke ... from public, anon`; `grant execute ... to authenticated` `:77-80`.
- 🟡 Filtro por texto faz `ilike` sobre JSON serializado — varredura sequencial em janelas grandes; sem índice trigram.

### 6.5 Geração da trilha — `audit_row()` `foundation.sql:722-747`
- Trigger genérico `AFTER INSERT/UPDATE/DELETE ... FOR EACH ROW`; grava `actor_user_id=auth.uid()`, `actor_staff_id=current_staff_id()`, `action=tg_op`, `table_name`, `record_id=(new|old)->>'id'`, `old_data`, `new_data`. **UPDATE que só muda `version` é descartado** `:732-734` (anti-ruído do `bump_version`). 🟢
- Imutabilidade: `audit_log_immutable`/`access_log_immutable` (BEFORE UPDATE OR DELETE → `audit_log_is_immutable`, 42501) `:749-760,783-785`. 🟢
- `access_log` é preenchido por `open_resident_profile(p_resident)` (`foundation.sql:788-830`; insere `context default 'profile'`), exibido na aba *reads* como "opened profile of X". 🟢
- Tabelas auditadas na fundação: lodges, rooms, beds, staff, parameters, duty_posts, residents, stays `:762-769`; as demais recebem trigger em suas migrations.
- RLS: `audit_read`/`access_log_read` somente `is_management()` `foundation.sql:910-911`; `grant select` apenas (sem insert/update/delete direto) `:852-853`. 🟢

## 7. Tratamento de erros (resumo)

| Ponto | Comportamento |
|---|---|
| Audit | `Notice kind="error"` com `t(errorKey(e))` `Audit.tsx:106,117,171` |
| Reports | sem tratamento: erro → `{}` (relatório vazio) `:92,94,111` |
| HomeDashboard | sem tratamento (mantém skeleton/dado anterior) `:127` |
| PendingTile | sem tratamento (zera contadores) |
| Clipboard | `try/catch` silencioso `Audit.tsx:153-155` |
| localStorage | `try/catch` com fallback `HomeDashboard.tsx:58-63` |
| Servidor | `not_authorised` 42501, `invalid_period`/`invalid_range`/`range_too_large` 22023, `staff_not_found` P0002 |

## 8. Referência rápida das RPCs

### 8.1 `home_dashboard(p_from date default null, p_to date default null)` — `20261126000038_r16.sql:87-137` (vigente; substitui `home_dashboard.sql:2-40`)
- `is_active_staff()` obrigatório `:95`; `v_to=coalesce(p_to,hoje)`, `v_from=coalesce(p_from, coalesce(p_to,hoje)-13)` (padrão 14 dias) `:90-92`. Inválido (`not isfinite`, `to<from`, `to-from>365`, `from<2020-01-01`, `to>hoje+31`) → `invalid_period` `:96-98`.
- `series`: por dia (`generate_series`) → `admissions` (stays sem `transfer_from_stay_id` com `admitted_at` na janela do dia operacional), `outs` (`end_reason='out'`), `no_shows` (`status='confirmed'`), `maintenance` (criados), `occupied` (stays presentes às 23:00 ou "agora" se menor); todos filtrados por `can_see_lodge(lodge_id)` `:99-106`. 🟢
- `lodges`: casas ativas visíveis: `beds_total`, `out_of_use` (cama ativa em quarto ativo com `status<>'in_use'`), `present` (`stays_present_at`), `occupied` (presentes com `status<>'out_pending'`), `out_pending`, `seen_today` (presentes com `resident_evidence` hoje), `checks_done/total`, `rounds_done`, `absences_now` `:110-124`.
- `totals` (somas e `avg_occupancy` arredondada a 1 casa), `maintenance_open` (urgent/normal/low/overdue de tickets ≠ resolved e visíveis) `:126-135`.
- Grants `:139-143`.

### 8.2 Testes de referência
`tests/db/audit-search.test.ts:29-82`, `tests/db/management.test.ts`, `tests/db/house-scope.test.ts:55` (painel por casa), `src/pages/Audit.test.tsx`, `src/lib/audit.test.ts`, `src/lib/auditLabels.test.ts`, `src/components/HomeDashboard.test.tsx`, `src/components/PendingTile.test.tsx`, `src/pages/Today.test.tsx`, `src/lib/management.test.ts`, `src/lib/pending.test.ts`. 🟢 (nomes confirmados; conteúdo dos testes não relido integralmente).
