# equipe-escala-e-horas — Dicionário de dados

Escala: 🟢 confirmado · 🟡 inferido · 🔴 lacuna. Abreviações como em `code-analysis.md` (M1, OC, M8, M11, BP, HS, FS, M27, M29, M33). Todas as tabelas têm trigger `audit_row()` (exceto onde indicado), RLS ligada, `revoke all` de `anon, authenticated` e `grant select` (escrita só por RPC/edge function; exceção: `staff` e `task_templates`, abaixo) 🟢. Instantes são `timestamptz` (UTC) exibidos em Europe/Dublin; **dia operacional** = 07:00→07:00 Dublin (`operational_day*`, `M1:28-47`).

## Enumerações
| Tipo | Valores | Fonte |
|---|---|---|
| `staff_role` | `porter, cleaner, manager, owner, developer` + `station` | `M1:16`, `20261124000015_station_role.sql:3` |
| `duty_function` | `office, float` | `M1:17` |
| `app_locale` | `pt-PT, en-IE, pl-PL` | `M1:18` |
| `rota_shifts.function` (text) | `office, float, cleaner, manager` | `M11:178` |
| `rota_shifts.status` (text) | `draft, published, cancelled` | `M11:181` |
| `handover_shifts.function` (text) | `office, float` | `FS:3` |
| `handover_shifts.hours_status` (text) | `open, pending, confirmed` | `HS:20` |
| `task_*.shift` (text) | `day, night` | `OC:314,329,343` |
| `duty_posts.end_reason` | `ended, taken_over, deactivated, switched` | `M1:214` |
Grupos de papel no cliente: `LOGIN_ROLES = station, manager, owner, developer`; gestão = `manager, owner, developer` (`src/pages/Users.tsx:18-19`, `src/lib/types.ts:69`).

## Tabelas

### `staff` (`M1:94-111` + `M33:4`)
| Coluna | Tipo | Null | Default / constraint |
|---|---|---|---|
| id | uuid PK | não | `gen_random_uuid()` |
| user_id | uuid unique → `auth.users` (`on delete set null`) | sim | nulo = sem login (Porter, Cleaner) |
| full_name | text | não | `check (length(trim(full_name))>0)` |
| display_name | text | sim | |
| role | staff_role | não | |
| email | text | sim | índice único `lower(email)` onde não nulo `M1:114` |
| locale | app_locale | não | `'en-IE'` (sincronizado com Auth por trigger `staff_sync_locale` `…05_email_code_second_step.sql:87-105`) |
| home_lodge_id | uuid → lodges | sim | `check (home_lodge_id is null or role='station')` `M33:4` |
| active | boolean | não | `true` |
| must_change_password | boolean | não | `true` (edge function grava `withLogin`) |
| version | integer | não | `1`; `bump_version` (`stale_version` 40001 se divergir) |
| created_at / created_by | timestamptz / uuid | não / sim | `now()` |
| deactivated_at / deactivated_by | timestamptz / uuid | sim | carimbados por `staff_on_deactivate` `M1:372-395` |
Constraints/índices: `check (role <> 'cleaner' or user_id is null)` `M1:110`; `staff_single_developer` (no máx. 1 developer) `M1:113`. RLS: `staff_read` (equipe ativa; **inclui e-mail**), `staff_insert` (gestão, `role <> 'developer'`), `staff_update` (gestão; `with check role <> 'developer' or caller developer`) `M1:885-890`; `grant insert, update` na tabela inteira `M1:855`.

### `duty_posts` (`M1:206-222`; + `adjust_reason`, `adjusted_by` `M11:311`)
`id` PK · `staff_id → staff` · `function duty_function` · `lodge_id → lodges` (null) · `started_at default now()` · `ended_at` · `ended_by` · `end_reason` (check acima) · checks `(function='office') = (lodge_id is not null)` e `ended_at is null or ended_at >= started_at` · índices únicos parciais: 1 posto aberto por pessoa, 1 Office aberto por Lodge, 1 Float aberto `M1:219-221`. Estado **legado** na Beta (ver code-analysis §0) 🟡.

### `rota_shifts` (`M11:174-191` + `BP:111`)
| Coluna | Tipo | Null | Default / constraint |
|---|---|---|---|
| id | uuid PK | não | |
| staff_id | uuid → staff | não | |
| lodge_id | uuid → lodges | sim | nulo só para Float (`check ((function='float') = (lodge_id is null))`) |
| function | text | não | check `office,float,cleaner,manager` |
| starts_at / ends_at | timestamptz | não | `check (ends_at > starts_at)`; **horário real** (editável após publicar) |
| status | text | não | `'draft'` |
| published_at | timestamptz | sim | |
| created_by / created_at | uuid / timestamptz | não | |
| version | integer | não | `1` (`bump_version`) |
| planned_starts_at / planned_ends_at | timestamptz | sim | **horário previsto** fixado na publicação (`coalesce(planned, atual)` `BP:127-128`); nulo = cobertura sem escala |
Índice `(starts_at, ends_at)`. RLS `rota_read`: gestão vê tudo; equipe ativa só `status='published'` `M11:716-717`; restritiva `house_scope` por `lodge_id` (`lodge_id is null or can_see_lodge`) `M29:31-42`. Não há DDL de exclusão de sobreposição (a regra está em `save_rota_shift`) 🟡.

### `work_intervals` (`M11:313-326`)
Horas lançadas à parte pela gestão: `id` PK · `staff_id` · `lodge_id` (null) · `starts_at/ends_at` (`check ends_at > starts_at`; RPC limita ≤ 24 h e fim ≤ agora+5 min) · `note` · `created_by` · `created_at` · `version`. RLS `work_intervals_read`: só gestão `M11:718`.

### `handover_shifts` (`HS:9-26` + `FS:3-6`)
`id` PK · `lodge_id` (not null; para Float guarda o Lodge de onde foi aberto) · `staff_id` (pessoa no turno) · `opened_at default now()` · `opened_by` · `closed_at` · `closed_by` · `handed_to` · `close_note` · `rota_shift_id → rota_shifts` (turno previsto casado) · `hours_status default 'open'` · `confirmed_start/end/by/at` · `function text not null default 'office'` · `check (closed_at is null or closed_at >= opened_at)`. Índices únicos parciais: `handover_shifts_one_open (lodge_id) where closed_at is null and function='office'`, `handover_shifts_one_float (function) where closed_at is null and function='float'` `FS:5-6`. RLS: leitura equipe ativa; política restritiva especial: Float aberto aparece nas duas casas `M29:44-47`. Detalhe do Handover em `ocorrencias-e-passagem-de-turno`.

### `task_templates` (`OC:311-323` + `M10:10`)
`id` PK · `lodge_id` · `shift` (`day|night`) · `weekdays integer[]` (ISO 1=segunda … 7=domingo; nulo = todos) · `title jsonb not null` (`{"pt-PT","en-IE","pl-PL"}`) · `sort_order int default 0` · `suggested_time text` (só referência, ex. `"07:30"`) · `active default true` · `created_by` · `created_at` (regra: modelo vale a partir de `created_at <= fim do turno`) · `version` · `auto_key text` (ex. `'fridge_temperature'`). `grant update (title, sort_order, suggested_time, active, weekdays, version)` + política `templates_update` (gestão) — **edição direta pela API é permitida** `OC:852,860` 🟢.

### `task_extras` (`OC:325-337`)
`id` PK · `lodge_id` · `operational_day date` · `shift` · `staff_id` (null = para o turno todo) · `title text check (length(trim(title))>0)` · `due_at` (null) · `reassigned_from → staff` · `created_by` · `created_at` · `version`.

### `task_signatures` (`OC:339-350`)
`id` PK · `lodge_id` · `operational_day` · `shift` · `template_id → task_templates` (null) · `extra_id → task_extras` (null) · `staff_id → staff` (quem assinou) · `duty_function text` (função do posto, `'office'` para station, ou o papel) · `signed_at default now()` · `check ((template_id is null) <> (extra_id is null))` · único `(coalesce(template_id,extra_id), lodge_id, operational_day, shift, staff_id)` `OC:352`. Imutável pela API (só `select`).

### `vacations` (adjacente; `M11:424-435`)
`staff_id`, `starts_on/ends_on` (`ends_on >= starts_on`), `status active|cancelled`, `note`; `register_vacation` gera notificação `vacation_conflict` se houver turnos no período. RLS só gestão. Detalhes fora do escopo.

## Parâmetros relacionados
Nenhum parâmetro numérico próprio de Rota/Horas: mínimo de cobertura (1 Office Day, 1 Office Night por Lodge, 1 Float 12–24h) está **fixo no SQL** de `coverage_gaps` (`RL:30-41`); tolerância de 15 min do cruzamento Handover×Rota está **fixa** em `close_handover_shift`/`shift_hours_review` (`ST:76`, `HS:173`); `check_range` ≤ 62 dias `RL:11`. 🟢 (todas constantes embutidas).

## Funções e perfis
| RPC | Perfil | Ref. |
|---|---|---|
| `save_rota_shift`, `cancel_rota_shift`, `split_rota_shift`, `publish_rota`, `coverage_gaps`, `staff_hours`, `staff_work_log`, `add_work_interval`, `adjust_work_interval`, `shift_hours_review`, `confirm_shift_hours`, `person_summary`, `create_task_template`, `create_extra_task`, `reassign_extra_task`, `set_task_template_active` | gestão (`is_management()`) | `M11:721-741`, `BP:167-168`, `HS:221-225`, `TB:37-38,53-54` |
| `shift_tasks`, `pending_tasks` | equipe ativa com `can_see_lodge` | `M29:904,1422` |
| `sign_task` | `can_write_lodge` (station, gestão ou posto) | `M29:1449` |
| `open_handover_shift`, `close_handover_shift` | `can_write_lodge` | `ST:88-89` |
| `on_duty_staff` | equipe ativa | `BP:103-104` |
| edge `admin-users` | `is_management()` | `supabase/functions/admin-users/index.ts:47` |

## Relacionamentos
`rota_shifts (N) → (1) staff`; `handover_shifts.rota_shift_id → rota_shifts`; `task_signatures → task_templates | task_extras`, `→ staff`; `handover_entries.shift_id → handover_shifts` e `handover_entries.filled_by → staff`; `duty_posts → staff/lodges`; `staff.home_lodge_id → lodges` (só station); `notifications` geradas: `coverage_below_minimum`, `shift_hours_review`, `vacation_conflict` (audiência `management`).

## Lacunas 🔴
- Não há `unique`/`exclude` no banco para sobreposição de turnos (apenas validação em RPC; `confirm_shift_hours` pode criar sobreposição).
- Não há trilha de histórico para `task_templates.active`/título além de `audit_log`.
- O campo `staff.locale` é reescrito pela tela Users (ver code-analysis §5.1).
