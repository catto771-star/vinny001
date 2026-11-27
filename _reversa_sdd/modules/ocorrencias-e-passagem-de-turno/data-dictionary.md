# ocorrencias-e-passagem-de-turno — Dicionário de dados

🟢 confirmado · 🟡 inferido · 🔴 lacuna. Siglas: `M07`=`20261120000007_occurrences.sql`, `M18`=`20261125000018_handover_shifts.sql`, `M23`=`..._000023_handover_tags_push.sql`, `M25`=`..._000025_float_shift.sql`, `M27`=`..._000027_handover_coauthors.sql`, `M29`=`..._000029_house_scope.sql`, `M36`=`..._000036_tags_admin.sql`, `M37`=`20261126000037_r15.sql`.

## `handover_entries` (M07:42-59 + alterações)
| Coluna | Tipo | Nulo | Default | Constraint / nota |
|---|---|---|---|---|
| id | uuid | não | `gen_random_uuid()` | PK |
| lodge_id | uuid FK lodges | não | | `house_scope` restritiva (M29:30-42) |
| kind | text | não | `'note'` | check ∈ `note, round, maintenance, warning, laundry, shift` (M18:5-7; M07:45 e M10:5-7 anteriores) |
| body | text | não | | check `length(trim(body))>0` |
| occurred_at | timestamptz | não | | hora do **fato** (informada); ≤ now+5 min nas notas |
| operational_day | date | não | | derivado de `occurred_at`, ou o dia informado nas rondas |
| round_slot | text | sim | | check `(kind='round') = (round_slot is not null)` |
| author_id | uuid FK staff | não | | `current_staff_id()` (na conta de casa = a conta da casa) |
| created_at | timestamptz | não | `now()` | horário de **digitação** (só gestão; fora do GRANT SELECT) |
| late_reason | text | sim | | item de `handover.late_reasons`; só gravado se houve atraso |
| status | text | não | `'active'` | ∈ `active, voided` |
| void_reason / voided_by / voided_at | | sim | | anulação |
| version | int | não | 1 | `bump_version` |
| filled_by | uuid FK staff | sim | (trigger) | M16:42 — pessoa que preencheu; default por `handover_fill_default` |
| shift_id | uuid FK handover_shifts | sim | (trigger) | M18:31; só turnos **office** (M25) |
Índices: único parcial `handover_one_round_per_slot (lodge_id, operational_day, round_slot) where kind='round'` (não filtra status); `(lodge_id, occurred_at desc)`; `(shift_id)`; `(filled_by, occurred_at desc)` (M28:3).
Triggers: `handover_bump_version`, `audit_handover_entries`, `handover_fill_default`.
GRANT SELECT por coluna (M07:847-848 + `shift_id` M18:38 + `filled_by` M16:258 🟢): exclui `created_at`. RLS: `handover_read` (`is_active_staff()`) + `house_scope`. Sem INSERT/UPDATE/DELETE para authenticated (só funções).

## `handover_mentions` (M07:64-73)
`id bigint identity PK`, `entry_id uuid FK`, `resident_id uuid FK`, `staff_id uuid FK`; check `(resident_id is null) <> (staff_id is null)` (exatamente um). Índices por `resident_id` e `entry_id`. RLS leitura ativa + `house_scope` via entrada (M29:60-61). Escrita só por `insert_handover_entry`.

## `handover_tags` (M23:4-11, M36:2)
`id uuid PK`; `code text UNIQUE` check `^[a-z_]+$`; `label text`; `sort_order int default 0`; `visible bool default true`; `notify_default bool default false`; `color text default 'grey'` check ∈ `red, amber, blue, green, violet, grey`. Semente: incident(red,notify), emergency(red,notify), health(amber,notify), damage(amber,notify), conduct, visitor, delivery, general. Regras de gestão (`M36`): ≤20 tags, rótulo ≤30 e único (case-insens.). Auditada. SELECT para staff ativo; escrita só por funções de gestão.

## `handover_entry_tags` (M23:19-23)
PK `(entry_id, tag_id)`; `entry_id` FK **ON DELETE CASCADE** (sem uso prático: nada é apagado), `tag_id` FK. Índice `(tag_id, entry_id)` (M28). `house_scope` via entrada.

## `handover_entry_staff` (M27:2-10) — co-autores
`id uuid PK`, `entry_id` FK CASCADE, `staff_id` FK, `position smallint` check `1..3`. UNIQUE `(entry_id, staff_id)` e `(entry_id, position)`. Índice por `staff_id`. Auditada. No máx. 3 por entrada (`too_many_authors`).

## `handover_shifts` (M18:9-26 + M25)
| Coluna | Tipo | Observação |
|---|---|---|
| id | uuid PK | |
| lodge_id | uuid FK NOT NULL | para Float também recebe a casa onde foi aberto |
| staff_id | uuid FK NOT NULL | quem assume o turno |
| opened_at | timestamptz default now() | horário informado em M26 |
| opened_by | uuid FK NOT NULL | |
| closed_at / closed_by | | check `closed_at is null or closed_at >= opened_at` |
| handed_to | uuid FK | quem recebe a passagem |
| close_note | text | |
| rota_shift_id | uuid FK rota_shifts | via `match_rota_shift` |
| hours_status | text default `'open'` | check ∈ `open, pending, confirmed` |
| confirmed_start / confirmed_end / confirmed_by / confirmed_at | | confirmação de horas (módulo equipe) |
| function | text NOT NULL default `'office'` | check ∈ `office, float` (M25:3) |
Índices únicos parciais: 1 office aberto por lodge (`handover_shifts_one_open`, M25:5); 1 float aberto global (`handover_shifts_one_float`, M25:6); `(lodge_id, opened_at desc)`. Auditada. RLS: leitura ativa + `house_scope` especial: Float aberto aparece nas duas casas (`M29:44-47`).

## `quick_phrases` (M07:75-88)
`id uuid`, `text jsonb {"pt-PT","en-IE","pl-PL"}`, `sort_order`, `active`. 6 frases semente. Gestão insere/atualiza (policies M07:857-858). **Sem uso identificado no front atual** (substituídas por tags, M23 cabeçalho) 🟡.

## `maintenance_tickets` (M07:511-526)
| Coluna | Tipo | Nulo | Default / constraint |
|---|---|---|---|
| id | uuid PK | | |
| lodge_id | uuid FK | não | |
| location | text | não | `length(trim)>0` |
| description | text | não | `length(trim)>0` |
| priority | text | não | ∈ `urgent, normal, low` |
| status | text | não | `'open'`; ∈ `open, in_progress, on_hold, resolved, reopened` |
| deadline_at | timestamptz | não | `now() + maintenance.default_deadline_hours[priority]` |
| request_key | uuid | não | UNIQUE (idempotência) |
| handover_entry_id | uuid FK | sim | entrada criada junto |
| created_by | uuid FK | não | |
| created_at | timestamptz | não | `now()` |
| resolved_at / resolved_by | | sim | só preenchidos ao resolver; não zerados ao reabrir 🟡 |
| version | int | não | 1 |
Triggers: `maintenance_bump_version`, `audit_maintenance_tickets`. SELECT ativo + `house_scope`; escrita só por funções.

## `maintenance_events` (M07:528-537)
`id bigint identity`, `ticket_id` FK, `kind` ∈ `created, status, deadline, note`, `from_value`, `to_value` (texto), `note`, `staff_id`, `at default now()`. Sem versão e sem auditoria própria. `house_scope` via ticket (M29:66-67).

## `maintenance_reminder_snoozes` (M07:539-544)
PK `(ticket_id, staff_id)`, `snoozed_at default now()`. Upsert por `snooze_maintenance_reminder`.

## `warnings` (M07:683-698, M37:5-8)
| Coluna | Tipo | Nulo | Default / constraint |
|---|---|---|---|
| id | uuid PK | | |
| resident_id / stay_id / lodge_id | uuid FK | não | lodge da estadia |
| type | text | não | `warnings_type_check`: `warning`, `final_warning` (M37; antes `verbal, written, final_written`) |
| note | text | sim | |
| handover_entry_id | uuid FK | **não** | entrada `kind='warning'` associada |
| issued_by | uuid FK | não | |
| issued_at | timestamptz | não | `now()` |
| active | boolean | não | `true` |
| deactivated_by / deactivated_at / deactivation_reason | | sim | só FW, só gestão |
| version | int | não | 1 |
Índice `(resident_id)`. Triggers: `warnings_bump_version`, `audit_warnings`, `warnings_notify` (AFTER INSERT → `notifications`). **Não há** índice único que impeça dois FW ativos; a regra é procedural em `record_warning` (por estadia) 🟡.

## `notifications` (do módulo de presença; usadas aqui)
`id bigint identity`, `kind text`, `audience text default 'management'` ∈ `management, lodge`, `lodge_id`, `resident_id`, `payload jsonb default '{}'`, `created_at`. Tipos produzidos: `handover_tag {entry_id, tags[], excerpt}`, `maintenance_opened {ticket_id, location, priority}`, `warning_recorded {warning_id, type, name}`, `shift_hours_review {shift_id, name, function?}`. Trigger `notifications_push` → `notify_push()` (M24).

## `push_prefs` / `push_subscriptions` (M23:26-42) — referência
`push_prefs(staff_id, key, enabled)` PK `(staff_id, key)`; `key` check `^(tag:[a-z_]+|maintenance:(urgent|normal|low)|warning|shift_hours_review|fridge_out_of_range)$`. `push_subscriptions(id, staff_id, endpoint UNIQUE check ^https://, p256dh, auth, device, created_at, last_used_at)`.

## Parâmetros (tabela `parameters`)
| Chave | Valor inicial | Uso |
|---|---|---|
| `handover.late_reasons` | `["other_occurrence","system_failure","forgot","info_received_later"]` (M07:36-37) | motivos aceitos para nota atrasada; i18n `handover.reasons.<chave>` |
| `rounds.hours` | 12 horários `00:00…22:00` de 2 em 2 h | `round_slots()`; edit. por `set_system_parameter` (1–24 itens, `HH:MM`) |
| `presence.check_window_minutes` | 60 (5–180) | janela de antecedência de `room_check_done` |
| `records.correction_window_hours` | 72 (1–720) | janela de correção de notas |
| `maintenance.default_deadline_hours` | `{urgent:24, normal:168, low:720}` | prazo; validação: inteiros 1–8760 e `urgent ≤ normal ≤ low` |
| `maintenance.reminder_hours` | 24 (1–168) | seed/validação existem; **as funções usam 24 h literais** (`M07:660,663`) 🟡 |

## Enums / tipos de domínio (TS)
- `Entry.kind` (`Handover.tsx:34`); `Filter` (`:47`); `Suggestion` (`:48`).
- `TagColor` e `TAG_COLORS` (`Handover.tsx:363-364`); `HandoverTag` (`:365`).
- `TicketStatus` (`Maintenance.tsx:23`), `Priority` (`MaintenanceDialog.tsx:10`), `WarningType` (`WarningDialog.tsx:11`).
- `OnDutyPost.function` inclui `cleaner|manager` além de `office|float` (`useOnDuty.ts:9`), coerente com `rota_shifts.function` ∈ `office, float, cleaner, manager` (`20261120000011_management.sql:178`) 🟢.

## Estruturas de retorno
- `create_maintenance` → `{ticket_id, entry_id, duplicate}`.
- `room_check_done` → `{status: 'recorded'|'already_recorded', entry_id}`.
- `maintenance_list` → `(id, lodge_id, location, description, priority, status, deadline_at, created_at, created_by, resolved_at, overdue, last_event_at)`.
- `maintenance_reminders` → `(id, lodge_id, location, description, priority, status, deadline_at)`.
- `search_handover` → `(id, lodge_id, kind, body, occurred_at, operational_day, round_slot, author_id, filled_by, late_reason, status, void_reason, version)`.
- `handover_typing_times` → `(id, author_id, at)`.
- `pending_counts` → `{tasks, maintenance, absences, checks, rounds, no_shows}`.

## Lacunas
- 🔴 Uso real de `quick_phrases` (tabela, sem UI identificada).
- 🔴 `maintenance.reminder_hours` não é lido pelas funções de lembrete.
