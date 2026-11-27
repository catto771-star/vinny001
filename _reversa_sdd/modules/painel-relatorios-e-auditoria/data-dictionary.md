# Dicionário de dados — painel-relatorios-e-auditoria

> Escala: 🟢 confirmado · 🟡 inferido · 🔴 lacuna. Caminhos relativos à raiz; SQL em `supabase/migrations/`.

## 1. Tabelas persistentes

### 1.1 `audit_log` — `20261120000001_foundation.sql:707-717`
| Coluna | Tipo | Nulo | Default | Notas |
|---|---|---|---|---|
| `id` | bigint identity PK | não | `generated always` | cursor de paginação (`p_before`) |
| `occurred_at` | timestamptz | não | `now()` | |
| `actor_user_id` | uuid | sim | — | `auth.uid()`; sem FK |
| `actor_staff_id` | uuid | sim | — | `current_staff_id()`; sem FK; nulo = "System" na UI |
| `action` | text | não | — | `INSERT`/`UPDATE`/`DELETE` (sem CHECK; vem de `tg_op`) 🟡 |
| `table_name` | text | não | — | `tg_table_name` |
| `record_id` | text | sim | — | `(new\|old)->>'id'` |
| `old_data` / `new_data` | jsonb | sim | — | linha completa (`to_jsonb`) |

Índices: `audit_log_record_idx(table_name, record_id, occurred_at desc)` `:719`; `audit_log_time_idx(occurred_at desc)` `:720`; `audit_log_actor_idx(actor_staff_id, occurred_at desc)` e `audit_log_table_time_idx(table_name, occurred_at desc)` (`audit_search.sql:2-3`).
Constraints/gatilhos: `audit_log_immutable` BEFORE UPDATE/DELETE → `audit_log_is_immutable` (42501) `:758-760`. 🟢
RLS: ligada `:846`; `audit_read` SELECT `is_management()` `:910`; `grant select` apenas `:852-853`. Escrita só via `audit_row()` (SECURITY DEFINER). Não há RLS de casa (`audit_log` não tem `lodge_id`).
Atenção 🟡: o log guarda a linha inteira — inclui dados pessoais de residentes/equipe (a migration `audit_search.sql:1` admite "valores sensíveis já estão no log; o acesso é só gestão").

### 1.2 `access_log` — `foundation.sql:772-779`
| Coluna | Tipo | Nulo | Default |
|---|---|---|---|
| `id` | bigint identity PK | não | |
| `occurred_at` | timestamptz | não | `now()` |
| `actor_user_id`, `actor_staff_id` | uuid | sim | |
| `resident_id` | uuid FK `residents(id)` | **não** | |
| `context` | text | não | `'profile'` |

Índices `access_log_resident_idx(resident_id, occurred_at desc)` `:781`; `access_log_actor_idx` (`audit_search.sql:4`). Imutável `:783-785`. RLS `access_log_read` = `is_management()` `:911`. Alimentada por `open_resident_profile` `:828-829`. 🟢

### 1.3 `shop_orders` / `shop_order_lines` / `shop_items` (fontes de `report_purchases`)
Detalhe pertence ao módulo `compras-e-fornecedores`. Colunas lidas: `shop_orders.delivery_date`, `status`; `shop_order_lines.final_qty`, `unit_price`, `order_id`, `item_id`; `shop_items.name`, `category` (`report_purchases.sql:12-23`). `shop_items`: `default_qty 0..999`, `default_action in ('buy','dont_buy')`, `category/name` não vazios, `active` (`beta_management.sql:274-285`). 🟢

### 1.4 Tabelas lidas pelo painel/relatórios (sem alteração)
`stays` (`admitted_at`, `ended_at`, `end_reason`, `transfer_from_stay_id`, `status`, `lodge_id`), `no_shows` (`status` ∈ confirmed/undone, `operational_day`, `confirmed_at`, `undone_at`, `undo_reason`), `maintenance_tickets` (`priority` urgent/normal/low, `status`, `created_at`, `resolved_at`, `deadline_at`, `location`), `maintenance_events`, `warnings` (`type` ∈ verbal/written/final_written, `issued_at`, `active`), `fridge_readings` (`out_of_range`, `recorded_at`), `dinner_services/marks`, `laundry_uses`, `handover_entries` (`kind`, `late_reason`, `operational_day`), `room_check_runs` (`status='launched'`), `rota_shifts`, `work_intervals`, `handover_shifts`, `task_signatures`, `absences`. 🟢 (definições nos respectivos módulos).

## 2. Contratos JSON das RPCs (payloads)

### 2.1 `home_dashboard` → `Dashboard` (`HomeDashboard.tsx:10-16`; `r16.sql:108-136`)
| Campo | Tipo | Observação |
|---|---|---|
| `period.from/to` | date | efetivamente usados |
| `lodges[]` | objeto | ordenado por `lodges.code` |
| `lodges[].lodge_id` | uuid | |
| `.beds_total` | int | camas ativas em quartos ativos |
| `.out_of_use` | int | camas ativas com `status<>'in_use'` |
| `.present` | int | stays presentes agora (opcional no tipo TS) |
| `.occupied` | int | presentes exceto `out_pending` |
| `.out_pending` | int | saídas decididas e ainda não efetivadas |
| `.seen_today` | int | presentes com evidência no dia |
| `.checks_done` / `.checks_total` | int | Room Checks lançados / slots do dia (`check_slots`) |
| `.rounds_done` | int | rondas registradas no dia |
| `.absences_now` | int | ausências em curso |
| `series[]` | `{day, admissions, outs, no_shows, maintenance, occupied}` | 1 por dia do período |
| `totals` | `{admissions, outs, no_shows, maintenance, avg_occupancy}` | `avg_occupancy` com 1 casa decimal |
| `maintenance_open` | `{urgent, normal, low, overdue}` | tickets abertos |

### 2.2 `pending_counts(p_lodge)` → `PendingCounts` (`pending.ts:4-5`; `occurrences.sql:818-826`)
`{ tasks, maintenance, absences, checks, rounds, no_shows }` — todos inteiros; **`null`** para quem não é equipe ativa. 🟢

### 2.3 `report_period(p_lodges uuid[], p_from date, p_to date)` → jsonb (`beta_management.sql:147-234`)
| Bloco | Chaves |
|---|---|
| `order` | array de 12 nomes de bloco |
| `occupancy` | `beds_total, occupied, protected_by_absence, average_occupancy, admissions, outs, transfers_in, transfers_out` |
| `maintenance` | `opened, resolved, overdue, on_hold, in_progress, reopened, average_hours_to_resolve, by_priority{priority:n}, by_location[{location,count}] (top 5)` |
| `no_shows` | `total, residents_1, residents_2, residents_3_plus, beds_cancelled, undone` |
| `warnings` | `verbal, written, final_written` |
| `dinner` | `served, services` — **`null`** se nenhuma casa tem jantar |
| `laundry` | `uses` — **`null`** se nenhuma tem lavanderia |
| `hours` | `planned_minutes, effective_minutes` |
| `rounds_checks` | `checks_launched, checks_pending, rounds_recorded` |
| `temperature` | `alerts` |
| `movements` | `admissions, outs, transfers` |
| `late_entries` | `total, by_reason{late_reason:n}` |
| `coverage` | `shifts_below_minimum` |

### 2.4 `report_details_period(p_lodges, p_from, p_to, p_metric)` → tabela `(ref_id text, label text, at timestamptz, extra text, lodge_id uuid)` (`:33-34`)
Métricas aceitas (`:52-113`): `occupancy.{admissions,outs,transfers_in,transfers_out}`, `maintenance.{opened,resolved,overdue,on_hold,in_progress}`, `no_shows.{total,undone}`, `warnings.<type>`, `temperature.alerts`, `dinner.served`, `laundry.uses`, `late_entries.total`. Métrica desconhecida → conjunto vazio (sem erro). 🟢
Conjunto de métricas clicáveis no front: `DETAIL_METRICS` `management.ts:45-50` (ver divergência de `warnings.*` em code-analysis §5.5 🔴).

### 2.5 `report_purchases(p_from,p_to)` → jsonb (`report_purchases.sql:14-23`)
`orders, placed, items, total, lines_without_price, by_category[{category,total,items}], top_items[{name,qty,total}] (8)`. O tipo TS `Purch` `Reports.tsx:15-16` espera também `by_status` (created/placed/awaiting/delivered) que **não é produzido** 🟡.

### 2.6 `person_summary(p_staff)` → jsonb (`handover_coauthors.sql:93-109`)
`functions{função:n}`, `roster_upcoming[{id,function,lodge_id,starts_at,ends_at}]`, `shifts_recent[{id,lodge_id,opened_at,closed_at,hours_status}]` (10), `notes_recent[{id,lodge_id,kind,body,occurred_at}]` (15), `hours_month{planned_minutes,effective_minutes}`, `tasks_signed_30d`.

### 2.7 `search_audit` → linhas `AuditRow` (`Audit.tsx:20-24`; `audit_search.sql:10`)
`id, occurred_at, actor_staff_id, actor_name, action, table_name, record_id, old_data, new_data`.
`search_access_log` → `ReadRow` (`Audit.tsx:25`; `audit_search.sql:47`): `id, occurred_at, actor_staff_id, actor_name, resident_id, resident_name, context`.

## 3. Parâmetros e limites (constantes)

| Constante | Valor | Onde |
|---|---|---|
| Período do painel | presets 7/14/30/90; custom ≤ 365 dias de diferença | `HomeDashboard.tsx:47,54`; servidor `r16.sql:96` |
| Padrão do painel (servidor sem datas) | 14 dias terminando hoje | `r16.sql:92` |
| `to` máximo no servidor | hoje + 31 | `r16.sql:96` |
| Refresh | painel 120 s; pendências 60 s | `HomeDashboard.tsx:129`; `pending.ts:50` |
| Relatório: período máx. | `p_to - p_from <= 400`; `p_from >= 2020-01-01`; `p_from <= hoje+366` | `check_period` `beta_management.sql:12-14` |
| Audit: janela | padrão 30 dias; máx. 366; limite 1..500 (UI usa 100) | `audit_search.sql:23-26,39`; `Audit.tsx:27` |
| `RANGE_DAYS` | today 0, 7d, 30d, 90d, 365d | `Audit.tsx:28` |
| Truncagem de valor no Audit | 80 caracteres | `auditLabels.ts:45` |
| Campos ignorados no diff | `version, id, created_at` | `audit.ts:3` |
| Hora de referência de ocupação diária | 23:00 | `r16.sql:105`; `report_period` `:157` |
| Top itens de compras | 8; top locais de manutenção 5 | `report_purchases.sql:23`; `beta_management.sql:180` |

## 4. Enums / catálogos de domínio
- Ação de auditoria: `INSERT | UPDATE | DELETE` `Audit.tsx:22`.
- Categorias de relatório: `occupancy, presence, maintenance, services, hours, purchases` `management.ts:157-164`.
- Períodos de relatório: `day, week, fortnight, month, custom` `management.ts:115`.
- Módulos do Audit (código→tabelas) `auditLabels.ts:14-25`: people, residents, presence, handover, maintenance, services, roster, purchasing, structure, settings.
- Prioridades de manutenção `urgent|normal|low`; motivos de lançamento tardio `other_occurrence|system_failure|forgot|info_received_later` (`management.ts:94-95`; parâmetro `handover.late_reasons` `occurrences.sql:36-37`).
- Funções da Rota usadas no relatório: `office|float|cleaner|manager` `management.ts:35`.

## 5. Armazenamento no cliente (`localStorage`)
`home.period` (`{kind,from,to}`), `home.collapsed` (array de ids de cartões) — `HomeDashboard.tsx:46`. Sem dados sensíveis. 🟢
