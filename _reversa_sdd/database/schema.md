# Schema do banco — DS Lodge (Data Master)

> Agente: Data Master · doc_level=completo · idioma pt-br · fonte: leitura estática de `supabase/migrations/*.sql` (38 arquivos, `20261120000001` a `20261126000038`). Nenhum banco foi acessado.
> Escala: 🟢 confirmado no SQL · 🟡 inferido · 🔴 lacuna.
> Complementa `../erd-complete.md` (diagramas) e `../modules/*/data-dictionary.md` (significado de negócio). Este arquivo é o dicionário físico completo, gerado a partir do DDL e já com os `ALTER TABLE` posteriores listados em cada tabela.

## Visão geral 🟢

- **53 tabelas** em `public` + `auth.users` (Supabase) referenciada por `staff.user_id` e `mfa_email_challenges.user_id`. RLS habilitado em todas as 53.
- **1 view**: `bed_occupancy` (`security_invoker = true`), redefinida na migração 7 (acrescenta `final_warning` via `has_final_warning`).
- **10 enums** (abaixo). Sem extensões criadas pelas migrações; `gen_random_uuid()` (nativo PG13+); `pg_net` e `vault` são usados de forma opcional por `notify_push` (só existem no Supabase).
- **Nada é apagado**: privilégios de `DELETE`/`TRUNCATE` revogados (`20261120000004`); "remover" = desativar (`active=false`), anular com motivo (`void_*`) ou novo registro. Única exceção de DELETE real: `ON DELETE CASCADE` (`mfa_email_challenges`←`auth.users`, `handover_entry_tags`/`handover_entry_staff`/`handover_mentions`←`handover_entries`, `shop_order_lines`←`shop_orders`).
- **Concorrência otimista**: coluna `version integer not null default 1` em 19 tabelas; 18 têm trigger `BEFORE UPDATE` `bump_version()` (ver `functions-and-triggers.md`) e `suppliers` incrementa manualmente em `update_supplier` (`version = version + 1`) sem trigger 🟢.
- **Tempo**: `timestamptz` (UTC); `date` para `operational_day` (07:00-07:00 Europe/Dublin) e datas puras (`vacations`, `holiday_locks`, `shop_orders.delivery_date`).
- **Chaves**: UUID (`gen_random_uuid()`) em quase todas; `bigint generated always as identity` apenas em `parameters`, `audit_log`, `access_log`, `mfa_email_challenges`, `notifications`, `handover_mentions`, `maintenance_events` (🟢).

## Enums 🟢

| Tipo | Valores | Origem |
|---|---|---|
| `staff_role` | `porter`, `cleaner`, `manager`, `owner`, `developer`, `station` (+`station` em `20261124000015`) | 001, 015 |
| `duty_function` | `office`, `float` | 001 |
| `app_locale` | `pt-PT`, `en-IE`, `pl-PL` | 001 |
| `room_kind` | `room`, `apartment` | 001 |
| `bed_status` | `in_use`, `out_of_service` | 001 |
| `stay_status` | `active`, `out_pending`, `ended` | 001 |
| `stay_end_reason` | `out`, `transfer` | 001 |
| `check_result` | `seen`, `not_seen`, `absent` | 006 |
| `check_status` | `pending`, `launched` | 006 |
| `no_show_status` | `confirmed`, `undone` | 006 |

(10 tipos: 7 na fundação, 3 em presença; o valor `station` entrou numa migração própria porque `ALTER TYPE ... ADD VALUE` só pode ser usado após o commit.)

Domínios por `CHECK` em `text` (não são enums): `handover_entries.kind` (`note,round,maintenance,warning,laundry,shift`), `warnings.type` (`warning,final_warning`), `shop_orders.status` (`created,placed,awaiting,delivered`), `vacations.status` (`under_review,approved,cancelled`), `handover_shifts.function` (`office,float`), `handover_tags.color` (`red,amber,blue,green,violet,grey`).

## View `bed_occupancy` 🟢

Une `beds` → `rooms` → `lodges` (apenas `active` nos três) com `stays` aberta (`status <> 'ended'`) e `residents`. Colunas: lodge_id, lodge_code, room_id, room_kind, room_code, room_sort, bed_id, bed_number, bed_status, stay_id, stay_status, admitted_at, resident_id, first_name, last_name, date_of_birth, pass_id, `final_warning` (= `coalesce(has_final_warning(resident), false)`). `security_invoker = true`: respeita a RLS (incl. `house_scope`) de quem consulta. `grant select ... to authenticated` (`20261120000001`, redefinida na 007).

## Parâmetros versionados (`parameters`) 🟢

Chave/valor `jsonb` com vigência (`valid_from`); leitura por `param_value(key)` (última vigência ≤ agora). Chaves semeadas ou criadas: `presence.check_times`, `presence.no_show_monthly_alert`, `presence.check_window_minutes` (mig. 032), `shift.day_start`, `shift.night_start`, `shift.float_hours`, `shift.minimum_coverage`, `rounds.hours`, `records.correction_window_hours`, `fridge.range_celsius`, `maintenance.default_deadline_hours`, `maintenance.reminder_hours`, `security.session_idle_minutes`, `security.require_mfa_management`, `alerts.email`, `handover.late_reasons`, `delivery.expiry_alert_days` (mig. 037). `set_system_parameter` valida e grava só um subconjunto (presence.check_times, rounds.hours, fridge.range_celsius, maintenance.*, presence.no_show_monthly_alert, records.correction_window_hours, security.session_idle_minutes, presence.check_window_minutes, delivery.expiry_alert_days); demais chaves não são editáveis pela UI (`unknown_parameter`).

## 1. Estrutura física, pessoas e configuração

### `lodges` 🟢

Criada em `20261120000001`.

| Coluna | Tipo | Nulo | Default | Regras / FK |
|---|---|---|---|---|
| `id` | `uuid` | não | `gen_random_uuid()` | PK |
| `code` | `text` | não |  | UNIQUE; CHECK (code ~ '^[A-Z_]+$') |
| `name` | `text` | não |  |  |
| `short_name` | `text` | não |  |  |
| `address` | `text` | sim |  |  |
| `has_dinner` | `boolean` | não | `false` |  |
| `has_laundry` | `boolean` | não | `false` |  |
| `active` | `boolean` | não | `true` |  |
| `created_at` | `timestamptz` | não | `now()` |  |

### `rooms` 🟢

Criada em `20261120000001`.

| Coluna | Tipo | Nulo | Default | Regras / FK |
|---|---|---|---|---|
| `id` | `uuid` | não | `gen_random_uuid()` | PK |
| `lodge_id` | `uuid` | não |  | FK -> lodges(id) |
| `kind` | `public.room_kind` | não | `'room'` |  |
| `code` | `text` | não |  | CHECK (length(trim(code)) > 0) |
| `sort_order` | `integer` | não | `0` |  |
| `active` | `boolean` | não | `true` |  |
| `created_at` | `timestamptz` | não | `now()` |  |

Constraints de tabela:

- `unique (lodge_id, kind, code)`

### `beds` 🟢

Criada em `20261120000001`.

| Coluna | Tipo | Nulo | Default | Regras / FK |
|---|---|---|---|---|
| `id` | `uuid` | não | `gen_random_uuid()` | PK |
| `room_id` | `uuid` | não |  | FK -> rooms(id) |
| `number` | `integer` | não |  | CHECK (number > 0) |
| `status` | `public.bed_status` | não | `'in_use'` |  |
| `status_note` | `text` | sim |  |  |
| `active` | `boolean` | não | `true` |  |
| `version` | `integer` | não | `1` |  |
| `created_at` | `timestamptz` | não | `now()` |  |

Constraints de tabela:

- `unique (room_id, number)`

### `staff` 🟢

Criada em `20261120000001`.

| Coluna | Tipo | Nulo | Default | Regras / FK |
|---|---|---|---|---|
| `id` | `uuid` | não | `gen_random_uuid()` | PK |
| `user_id` | `uuid` | sim |  | UNIQUE; FK -> auth.users(id) on delete set null |
| `full_name` | `text` | não |  | CHECK (length(trim(full_name)) > 0) |
| `display_name` | `text` | sim |  |  |
| `role` | `public.staff_role` | não |  |  |
| `email` | `text` | sim |  |  |
| `locale` | `public.app_locale` | não | `'en-IE'` |  |
| `home_lodge_id` | `uuid` | sim |  | FK -> lodges(id) |
| `active` | `boolean` | não | `true` |  |
| `must_change_password` | `boolean` | não | `true` |  |
| `version` | `integer` | não | `1` |  |
| `created_at` | `timestamptz` | não | `now()` |  |
| `created_by` | `uuid` | sim |  |  |
| `deactivated_at` | `timestamptz` | sim |  |  |
| `deactivated_by` | `uuid` | sim |  |  |

Constraints de tabela:

- `check (role <> 'cleaner' or user_id is null)`

Alterações posteriores (`ALTER TABLE`):

- `20261125000033`: `add constraint staff_home_only_station check (home_lodge_id is null or role = 'station')`

### `duty_posts` 🟢

Criada em `20261120000001`.

| Coluna | Tipo | Nulo | Default | Regras / FK |
|---|---|---|---|---|
| `id` | `uuid` | não | `gen_random_uuid()` | PK |
| `staff_id` | `uuid` | não |  | FK -> staff(id) |
| `function` | `public.duty_function` | não |  |  |
| `lodge_id` | `uuid` | sim |  | FK -> lodges(id) |
| `started_at` | `timestamptz` | não | `now()` |  |
| `ended_at` | `timestamptz` | sim |  |  |
| `ended_by` | `uuid` | sim |  | FK -> staff(id) |
| `end_reason` | `text` | sim |  | CHECK (end_reason in ('ended', 'taken_over', 'deactivated', 'switched')) |

Constraints de tabela:

- `check ((function = 'office') = (lodge_id is not null))`
- `check (ended_at is null or ended_at >= started_at)`

Alterações posteriores (`ALTER TABLE`):

- `20261120000011`: `add column adjust_reason text`
- `20261120000011`: `add column adjusted_by uuid references public.staff(id)`

### `parameters` 🟢

Criada em `20261120000001`.

| Coluna | Tipo | Nulo | Default | Regras / FK |
|---|---|---|---|---|
| `id` | `bigint` | não |  | PK; generated always as identity primary key |
| `key` | `text` | não |  | CHECK (key ~ '^[a-z0-9_.]+$') |
| `lodge_id` | `uuid` | sim |  | FK -> lodges(id) |
| `value` | `jsonb` | não |  |  |
| `valid_from` | `timestamptz` | não | `now()` |  |
| `created_at` | `timestamptz` | não | `now()` |  |
| `created_by` | `uuid` | sim |  |  |

### `mfa_email_challenges` 🟢

Criada em `20261120000005`.

| Coluna | Tipo | Nulo | Default | Regras / FK |
|---|---|---|---|---|
| `id` | `bigint` | não |  | PK; generated always as identity primary key |
| `user_id` | `uuid` | não |  | FK -> auth.users(id) on delete cascade |
| `created_at` | `timestamptz` | não | `now()` |  |


## 2. Moradores, estadias e presença

### `residents` 🟢

Criada em `20261120000001`.

| Coluna | Tipo | Nulo | Default | Regras / FK |
|---|---|---|---|---|
| `id` | `uuid` | não | `gen_random_uuid()` | PK |
| `pass_id` | `text` | sim |  |  |
| `first_name` | `text` | não |  | CHECK (length(trim(first_name)) > 0) |
| `last_name` | `text` | não | `''` |  |
| `date_of_birth` | `date` | sim |  |  |
| `notes` | `text` | sim |  |  |
| `is_demo` | `boolean` | não | `false` |  |
| `version` | `integer` | não | `1` |  |
| `created_at` | `timestamptz` | não | `now()` |  |
| `created_by` | `uuid` | sim |  | FK -> staff(id) |

### `stays` 🟢

Criada em `20261120000001`.

| Coluna | Tipo | Nulo | Default | Regras / FK |
|---|---|---|---|---|
| `id` | `uuid` | não | `gen_random_uuid()` | PK |
| `resident_id` | `uuid` | não |  | FK -> residents(id) |
| `lodge_id` | `uuid` | não |  | FK -> lodges(id) |
| `bed_id` | `uuid` | não |  | FK -> beds(id) |
| `admitted_at` | `timestamptz` | não | `now()` |  |
| `status` | `public.stay_status` | não | `'active'` |  |
| `transfer_from_stay_id` | `uuid` | sim |  | FK -> stays(id) |
| `out_decided_at` | `timestamptz` | sim |  |  |
| `out_decided_by` | `uuid` | sim |  | FK -> staff(id) |
| `out_reason` | `text` | sim |  |  |
| `ended_at` | `timestamptz` | sim |  |  |
| `ended_by` | `uuid` | sim |  | FK -> staff(id) |
| `end_reason` | `public.stay_end_reason` | sim |  |  |
| `version` | `integer` | não | `1` |  |
| `created_at` | `timestamptz` | não | `now()` |  |
| `created_by` | `uuid` | sim |  | FK -> staff(id) |

Constraints de tabela:

- `check ((status = 'ended') = (ended_at is not null))`
- `check (ended_at is null or ended_at >= admitted_at)`

### `room_check_runs` 🟢

Criada em `20261120000006`.

| Coluna | Tipo | Nulo | Default | Regras / FK |
|---|---|---|---|---|
| `id` | `uuid` | não | `gen_random_uuid()` | PK |
| `lodge_id` | `uuid` | não |  | FK -> lodges(id) |
| `operational_day` | `date` | não |  |  |
| `slot` | `text` | não |  | CHECK (slot ~ '^([01]\d\|2[0-3]):[0-5]\d$') |
| `performed_by` | `uuid` | não |  | FK -> staff(id) |
| `performed_reported_by_entrant` | `boolean` | sim |  | generated always as (performed_by is distinct from entered_by) stored |
| `entered_by` | `uuid` | não |  | FK -> staff(id) |
| `entered_at` | `timestamptz` | não | `now()` |  |
| `status` | `public.check_status` | não | `'pending'` |  |
| `launched_at` | `timestamptz` | sim |  |  |
| `launched_by` | `uuid` | sim |  | FK -> staff(id) |
| `sheet_number` | `text` | não |  |  |
| `version` | `integer` | não | `1` |  |

Constraints de tabela:

- `checked_at timestamptz not null`
- `unique (lodge_id, operational_day, slot)`

### `room_check_marks` 🟢

Criada em `20261120000006`.

| Coluna | Tipo | Nulo | Default | Regras / FK |
|---|---|---|---|---|
| `id` | `uuid` | não | `gen_random_uuid()` | PK |
| `run_id` | `uuid` | não |  | FK -> room_check_runs(id) |
| `stay_id` | `uuid` | não |  | FK -> stays(id) |
| `resident_id` | `uuid` | não |  | FK -> residents(id) |
| `result` | `public.check_result` | não |  |  |
| `marked_by` | `uuid` | não |  | FK -> staff(id) |
| `marked_at` | `timestamptz` | não | `now()` |  |
| `version` | `integer` | não | `1` |  |

Constraints de tabela:

- `unique (run_id, stay_id)`

### `sightings` 🟢

Criada em `20261120000006`.

| Coluna | Tipo | Nulo | Default | Regras / FK |
|---|---|---|---|---|
| `id` | `uuid` | não | `gen_random_uuid()` | PK |
| `resident_id` | `uuid` | não |  | FK -> residents(id) |
| `lodge_id` | `uuid` | não |  | FK -> lodges(id) |
| `seen_at` | `timestamptz` | não |  |  |
| `place` | `text` | sim |  |  |
| `recorded_by` | `uuid` | não |  | FK -> staff(id) |
| `recorded_at` | `timestamptz` | não | `now()` |  |

### `absences` 🟢

Criada em `20261120000006`.

| Coluna | Tipo | Nulo | Default | Regras / FK |
|---|---|---|---|---|
| `id` | `uuid` | não | `gen_random_uuid()` | PK |
| `stay_id` | `uuid` | não |  | FK -> stays(id) |
| `resident_id` | `uuid` | não |  | FK -> residents(id) |
| `starts_at` | `timestamptz` | não |  |  |
| `expected_return_at` | `timestamptz` | não |  |  |
| `ended_at` | `timestamptz` | sim |  |  |
| `ended_by` | `uuid` | sim |  | FK -> staff(id) |
| `notes` | `text` | sim |  |  |
| `created_by` | `uuid` | não |  | FK -> staff(id) |
| `created_at` | `timestamptz` | não | `now()` |  |
| `version` | `integer` | não | `1` |  |

Constraints de tabela:

- `check (expected_return_at > starts_at)`
- `check (ended_at is null or ended_at >= starts_at)`

### `no_shows` 🟢

Criada em `20261120000006`.

| Coluna | Tipo | Nulo | Default | Regras / FK |
|---|---|---|---|---|
| `id` | `uuid` | não | `gen_random_uuid()` | PK |
| `resident_id` | `uuid` | não |  | FK -> residents(id) |
| `stay_id` | `uuid` | não |  | FK -> stays(id) |
| `lodge_id` | `uuid` | não |  | FK -> lodges(id) |
| `operational_day` | `date` | não |  |  |
| `status` | `public.no_show_status` | não | `'confirmed'` |  |
| `confirmed_by` | `uuid` | não |  | FK -> staff(id) |
| `confirmed_at` | `timestamptz` | não | `now()` |  |
| `undone_by` | `uuid` | sim |  | FK -> staff(id) |
| `undone_at` | `timestamptz` | sim |  |  |
| `undo_reason` | `text` | sim |  |  |
| `version` | `integer` | não | `1` |  |


## 3. Handover, tarefas, manutenção e advertências

### `handover_shifts` 🟢

Criada em `20261125000018`.

| Coluna | Tipo | Nulo | Default | Regras / FK |
|---|---|---|---|---|
| `id` | `uuid` | não | `gen_random_uuid()` | PK |
| `lodge_id` | `uuid` | não |  | FK -> lodges(id) |
| `staff_id` | `uuid` | não |  | FK -> staff(id) |
| `opened_at` | `timestamptz` | não | `now()` |  |
| `opened_by` | `uuid` | não |  | FK -> staff(id) |
| `closed_at` | `timestamptz` | sim |  |  |
| `closed_by` | `uuid` | sim |  | FK -> staff(id) |
| `handed_to` | `uuid` | sim |  | FK -> staff(id) |
| `close_note` | `text` | sim |  |  |
| `rota_shift_id` | `uuid` | sim |  | FK -> rota_shifts(id) |
| `hours_status` | `text` | não | `'open'` | CHECK (hours_status in ('open', 'pending', 'confirmed')) |
| `confirmed_start` | `timestamptz` | sim |  |  |
| `confirmed_end` | `timestamptz` | sim |  |  |
| `confirmed_by` | `uuid` | sim |  | FK -> staff(id) |
| `confirmed_at` | `timestamptz` | sim |  |  |

Constraints de tabela:

- `check (closed_at is null or closed_at >= opened_at)`

Alterações posteriores (`ALTER TABLE`):

- `20261125000025`: `add column function text not null default 'office' check (function in ('office', 'float'))`

### `handover_entries` 🟢

Criada em `20261120000007`.

| Coluna | Tipo | Nulo | Default | Regras / FK |
|---|---|---|---|---|
| `id` | `uuid` | não | `gen_random_uuid()` | PK |
| `lodge_id` | `uuid` | não |  | FK -> lodges(id) |
| `kind` | `text` | não | `'note'` | CHECK (kind in ('note', 'round', 'maintenance', 'warning')) |
| `body` | `text` | não |  | CHECK (length(trim(body)) > 0) |
| `occurred_at` | `timestamptz` | não |  |  |
| `operational_day` | `date` | não |  |  |
| `round_slot` | `text` | sim |  |  |
| `author_id` | `uuid` | não |  | FK -> staff(id) |
| `created_at` | `timestamptz` | não | `now()` |  |
| `late_reason` | `text` | sim |  |  |
| `status` | `text` | não | `'active'` | CHECK (status in ('active', 'voided')) |
| `void_reason` | `text` | sim |  |  |
| `voided_by` | `uuid` | sim |  | FK -> staff(id) |
| `voided_at` | `timestamptz` | sim |  |  |
| `version` | `integer` | não | `1` |  |

Constraints de tabela:

- `check ((kind = 'round') = (round_slot is not null))`

Alterações posteriores (`ALTER TABLE`):

- `20261120000010`: `drop constraint handover_entries_kind_check`
- `20261120000010`: `add constraint handover_entries_kind_check check (kind in ('note', 'round', 'maintenance', 'warning', 'laundry'))`
- `20261124000016`: `add column filled_by uuid references public.staff(id)`
- `20261125000018`: `drop constraint handover_entries_kind_check`
- `20261125000018`: `add constraint handover_entries_kind_check check (kind in ('note', 'round', 'maintenance', 'warning', 'laundry', 'shift'))`
- `20261125000018`: `add column shift_id uuid references public.handover_shifts(id)`

### `handover_mentions` 🟢

Criada em `20261120000007`.

| Coluna | Tipo | Nulo | Default | Regras / FK |
|---|---|---|---|---|
| `id` | `bigint` | não |  | PK; generated always as identity primary key |
| `entry_id` | `uuid` | não |  | FK -> handover_entries(id) |
| `resident_id` | `uuid` | sim |  | FK -> residents(id) |
| `staff_id` | `uuid` | sim |  | FK -> staff(id) |

Constraints de tabela:

- `check ((resident_id is null) <> (staff_id is null))`

### `handover_entry_staff` 🟢

Criada em `20261125000027`.

| Coluna | Tipo | Nulo | Default | Regras / FK |
|---|---|---|---|---|
| `id` | `uuid` | não | `gen_random_uuid()` | PK |
| `entry_id` | `uuid` | não |  | FK -> handover_entries(id) on delete cascade |
| `staff_id` | `uuid` | não |  | FK -> staff(id) |
| `position` | `smallint` | não |  | CHECK (position between 1 and 3) |

Constraints de tabela:

- `unique (entry_id, staff_id)`
- `unique (entry_id, position)`

### `handover_tags` 🟢

Criada em `20261125000023`.

| Coluna | Tipo | Nulo | Default | Regras / FK |
|---|---|---|---|---|
| `id` | `uuid` | não | `gen_random_uuid()` | PK |
| `code` | `text` | não |  | UNIQUE; CHECK (code ~ '^[a-z_]+$') |
| `label` | `text` | não |  |  |
| `sort_order` | `integer` | não | `0` |  |
| `visible` | `boolean` | não | `true` |  |
| `notify_default` | `boolean` | não | `false` |  |

Alterações posteriores (`ALTER TABLE`):

- `20261125000036`: `add column color text not null default 'grey' check (color in ('red', 'amber', 'blue', 'green', 'violet', 'grey'))`

### `handover_entry_tags` 🟢

Criada em `20261125000023`.

| Coluna | Tipo | Nulo | Default | Regras / FK |
|---|---|---|---|---|
| `entry_id` | `uuid` | não |  | FK -> handover_entries(id) on delete cascade |
| `tag_id` | `uuid` | não |  | FK -> handover_tags(id) |

Constraints de tabela:

- `primary key (entry_id, tag_id)`

### `quick_phrases` 🟢

Criada em `20261120000007`.

| Coluna | Tipo | Nulo | Default | Regras / FK |
|---|---|---|---|---|
| `id` | `uuid` | não | `gen_random_uuid()` | PK |
| `text` | `jsonb` | não |  |  |
| `sort_order` | `integer` | não | `0` |  |
| `active` | `boolean` | não | `true` |  |

### `task_templates` 🟢

Criada em `20261120000007`.

| Coluna | Tipo | Nulo | Default | Regras / FK |
|---|---|---|---|---|
| `id` | `uuid` | não | `gen_random_uuid()` | PK |
| `lodge_id` | `uuid` | não |  | FK -> lodges(id) |
| `shift` | `text` | não |  | CHECK (shift in ('day', 'night')) |
| `weekdays` | `integer[]` | sim |  |  |
| `title` | `jsonb` | não |  |  |
| `sort_order` | `integer` | não | `0` |  |
| `suggested_time` | `text` | sim |  |  |
| `active` | `boolean` | não | `true` |  |
| `created_by` | `uuid` | sim |  | FK -> staff(id) |
| `created_at` | `timestamptz` | não | `now()` |  |
| `version` | `integer` | não | `1` |  |

Alterações posteriores (`ALTER TABLE`):

- `20261120000010`: `add column auto_key text`

### `task_extras` 🟢

Criada em `20261120000007`.

| Coluna | Tipo | Nulo | Default | Regras / FK |
|---|---|---|---|---|
| `id` | `uuid` | não | `gen_random_uuid()` | PK |
| `lodge_id` | `uuid` | não |  | FK -> lodges(id) |
| `operational_day` | `date` | não |  |  |
| `shift` | `text` | não |  | CHECK (shift in ('day', 'night')) |
| `staff_id` | `uuid` | sim |  | FK -> staff(id) |
| `title` | `text` | não |  | CHECK (length(trim(title)) > 0) |
| `due_at` | `timestamptz` | sim |  |  |
| `reassigned_from` | `uuid` | sim |  | FK -> staff(id) |
| `created_by` | `uuid` | não |  | FK -> staff(id) |
| `created_at` | `timestamptz` | não | `now()` |  |
| `version` | `integer` | não | `1` |  |

### `task_signatures` 🟢

Criada em `20261120000007`.

| Coluna | Tipo | Nulo | Default | Regras / FK |
|---|---|---|---|---|
| `id` | `uuid` | não | `gen_random_uuid()` | PK |
| `lodge_id` | `uuid` | não |  | FK -> lodges(id) |
| `operational_day` | `date` | não |  |  |
| `shift` | `text` | não |  | CHECK (shift in ('day', 'night')) |
| `template_id` | `uuid` | sim |  | FK -> task_templates(id) |
| `extra_id` | `uuid` | sim |  | FK -> task_extras(id) |
| `staff_id` | `uuid` | não |  | FK -> staff(id) |
| `duty_function` | `text` | não |  |  |
| `signed_at` | `timestamptz` | não | `now()` |  |

Constraints de tabela:

- `check ((template_id is null) <> (extra_id is null))`

### `maintenance_tickets` 🟢

Criada em `20261120000007`.

| Coluna | Tipo | Nulo | Default | Regras / FK |
|---|---|---|---|---|
| `id` | `uuid` | não | `gen_random_uuid()` | PK |
| `lodge_id` | `uuid` | não |  | FK -> lodges(id) |
| `location` | `text` | não |  | CHECK (length(trim(location)) > 0) |
| `description` | `text` | não |  | CHECK (length(trim(description)) > 0) |
| `priority` | `text` | não |  | CHECK (priority in ('urgent', 'normal', 'low')) |
| `status` | `text` | não | `'open'` | CHECK (status in ('open', 'in_progress', 'on_hold', 'resolved', 'reopened')) |
| `deadline_at` | `timestamptz` | não |  |  |
| `request_key` | `uuid` | não |  | UNIQUE |
| `handover_entry_id` | `uuid` | sim |  | FK -> handover_entries(id) |
| `created_by` | `uuid` | não |  | FK -> staff(id) |
| `created_at` | `timestamptz` | não | `now()` |  |
| `resolved_at` | `timestamptz` | sim |  |  |
| `resolved_by` | `uuid` | sim |  | FK -> staff(id) |
| `version` | `integer` | não | `1` |  |

### `maintenance_events` 🟢

Criada em `20261120000007`.

| Coluna | Tipo | Nulo | Default | Regras / FK |
|---|---|---|---|---|
| `id` | `bigint` | não |  | PK; generated always as identity primary key |
| `ticket_id` | `uuid` | não |  | FK -> maintenance_tickets(id) |
| `kind` | `text` | não |  | CHECK (kind in ('created', 'status', 'deadline', 'note')) |
| `from_value` | `text` | sim |  |  |
| `to_value` | `text` | sim |  |  |
| `note` | `text` | sim |  |  |
| `staff_id` | `uuid` | sim |  | FK -> staff(id) |
| `at` | `timestamptz` | não | `now()` |  |

### `maintenance_reminder_snoozes` 🟢

Criada em `20261120000007`.

| Coluna | Tipo | Nulo | Default | Regras / FK |
|---|---|---|---|---|
| `ticket_id` | `uuid` | não |  | FK -> maintenance_tickets(id) |
| `staff_id` | `uuid` | não |  | FK -> staff(id) |
| `snoozed_at` | `timestamptz` | não | `now()` |  |

Constraints de tabela:

- `primary key (ticket_id, staff_id)`

### `warnings` 🟢

Criada em `20261120000007`.

| Coluna | Tipo | Nulo | Default | Regras / FK |
|---|---|---|---|---|
| `id` | `uuid` | não | `gen_random_uuid()` | PK |
| `resident_id` | `uuid` | não |  | FK -> residents(id) |
| `stay_id` | `uuid` | não |  | FK -> stays(id) |
| `lodge_id` | `uuid` | não |  | FK -> lodges(id) |
| `type` | `text` | não |  | CHECK (type in ('verbal', 'written', 'final_written')) |
| `note` | `text` | sim |  |  |
| `handover_entry_id` | `uuid` | não |  | FK -> handover_entries(id) |
| `issued_by` | `uuid` | não |  | FK -> staff(id) |
| `issued_at` | `timestamptz` | não | `now()` |  |
| `active` | `boolean` | não | `true` |  |
| `deactivated_by` | `uuid` | sim |  | FK -> staff(id) |
| `deactivated_at` | `timestamptz` | sim |  |  |
| `deactivation_reason` | `text` | sim |  |  |
| `version` | `integer` | não | `1` |  |

Alterações posteriores (`ALTER TABLE`):

- `20261126000037`: `drop constraint warnings_type_check`
- `20261126000037`: `add constraint warnings_type_check check (type in ('warning', 'final_warning'))`


## 4. Serviços da casa

### `fridges` 🟢

Criada em `20261124000014`.

| Coluna | Tipo | Nulo | Default | Regras / FK |
|---|---|---|---|---|
| `id` | `uuid` | não | `gen_random_uuid()` | PK |
| `lodge_id` | `uuid` | não |  | FK -> lodges(id) |
| `code` | `text` | não |  | CHECK (length(trim(code)) > 0) |
| `name` | `text` | não |  | CHECK (length(trim(name)) > 0) |
| `sort_order` | `integer` | não | `0` |  |
| `active` | `boolean` | não | `true` |  |

Constraints de tabela:

- `unique (lodge_id, code)`

### `fridge_readings` 🟢

Criada em `20261120000010`.

| Coluna | Tipo | Nulo | Default | Regras / FK |
|---|---|---|---|---|
| `id` | `uuid` | não | `gen_random_uuid()` | PK |
| `lodge_id` | `uuid` | não |  | FK -> lodges(id) |
| `temperature` | `numeric(4, 1)` | não |  |  |
| `range_min` | `numeric(4, 1)` | não |  |  |
| `range_max` | `numeric(4, 1)` | não |  |  |
| `out_of_range` | `boolean` | não |  |  |
| `note` | `text` | sim |  |  |
| `recorded_by` | `uuid` | não |  | FK -> staff(id) |
| `recorded_at` | `timestamptz` | não | `now()` |  |

Alterações posteriores (`ALTER TABLE`):

- `20261124000014`: `add column fridge_id uuid references public.fridges(id)`
- `20261124000014`: `alter column fridge_id set not null`

### `suppliers` 🟢

Criada em `20261126000037`.

| Coluna | Tipo | Nulo | Default | Regras / FK |
|---|---|---|---|---|
| `id` | `uuid` | não | `gen_random_uuid()` | PK |
| `name` | `text` | não |  | CHECK (length(trim(name)) > 0 and char_length(name) <= 40) |
| `active` | `boolean` | não | `true` |  |
| `require_batch` | `boolean` | não | `false` |  |
| `require_best_before` | `boolean` | não | `false` |  |
| `require_temperature` | `boolean` | não | `false` |  |
| `links_order` | `boolean` | não | `false` |  |
| `sort_order` | `integer` | não | `0` |  |
| `created_at` | `timestamptz` | não | `now()` |  |
| `version` | `integer` | não | `1` |  |

### `food_deliveries` 🟢

Criada em `20261120000010`.

| Coluna | Tipo | Nulo | Default | Regras / FK |
|---|---|---|---|---|
| `id` | `uuid` | não | `gen_random_uuid()` | PK |
| `lodge_id` | `uuid` | não |  | FK -> lodges(id) |
| `product` | `text` | não |  |  |
| `supplier` | `text` | não |  |  |
| `batch` | `text` | não |  |  |
| `expiry_date` | `date` | não |  |  |
| `temperature` | `numeric(4, 1)` | não |  |  |
| `note` | `text` | sim |  |  |
| `received_by` | `uuid` | não |  | FK -> staff(id) |
| `received_at` | `timestamptz` | não | `now()` |  |

Alterações posteriores (`ALTER TABLE`):

- `20261124000014`: `alter column temperature drop not null`
- `20261126000037`: `alter column batch drop not null`
- `20261126000037`: `alter column expiry_date drop not null`
- `20261126000037`: `add column supplier_id uuid references public.suppliers(id)`
- `20261126000037`: `add column order_id uuid references public.shop_orders(id)`

### `dinner_services` 🟢

Criada em `20261120000010`.

| Coluna | Tipo | Nulo | Default | Regras / FK |
|---|---|---|---|---|
| `id` | `uuid` | não | `gen_random_uuid()` | PK |
| `lodge_id` | `uuid` | não |  | FK -> lodges(id) |
| `operational_day` | `date` | não |  |  |
| `leftovers` | `integer` | sim |  | CHECK (leftovers >= 0) |
| `packaged` | `integer` | sim |  | CHECK (packaged >= 0) |
| `close_note` | `text` | sim |  |  |
| `closed_at` | `timestamptz` | sim |  |  |
| `closed_by` | `uuid` | sim |  | FK -> staff(id) |
| `edited_at` | `timestamptz` | sim |  |  |
| `edited_by` | `uuid` | sim |  | FK -> staff(id) |
| `version` | `integer` | não | `1` |  |

Constraints de tabela:

- `unique (lodge_id, operational_day)`

### `dinner_marks` 🟢

Criada em `20261120000010`.

| Coluna | Tipo | Nulo | Default | Regras / FK |
|---|---|---|---|---|
| `id` | `uuid` | não | `gen_random_uuid()` | PK |
| `service_id` | `uuid` | não |  | FK -> dinner_services(id) |
| `stay_id` | `uuid` | não |  | FK -> stays(id) |
| `resident_id` | `uuid` | não |  | FK -> residents(id) |
| `served` | `boolean` | não |  |  |
| `marked_by` | `uuid` | não |  | FK -> staff(id) |
| `marked_at` | `timestamptz` | não | `now()` |  |
| `version` | `integer` | não | `1` |  |

Constraints de tabela:

- `unique (service_id, stay_id)`

### `laundry_machines` 🟢

Criada em `20261120000010`.

| Coluna | Tipo | Nulo | Default | Regras / FK |
|---|---|---|---|---|
| `id` | `uuid` | não | `gen_random_uuid()` | PK |
| `lodge_id` | `uuid` | não |  | FK -> lodges(id) |
| `code` | `text` | não |  |  |
| `label` | `text` | não |  |  |
| `kind` | `text` | não |  | CHECK (kind in ('wash', 'dry')) |
| `sort_order` | `integer` | não | `0` |  |
| `active` | `boolean` | não | `true` |  |

Constraints de tabela:

- `unique (lodge_id, code)`

### `laundry_uses` 🟢

Criada em `20261120000010`.

| Coluna | Tipo | Nulo | Default | Regras / FK |
|---|---|---|---|---|
| `id` | `uuid` | não | `gen_random_uuid()` | PK |
| `machine_id` | `uuid` | não |  | FK -> laundry_machines(id) |
| `lodge_id` | `uuid` | não |  | FK -> lodges(id) |
| `stay_id` | `uuid` | sim |  | FK -> stays(id) |
| `resident_id` | `uuid` | sim |  | FK -> residents(id) |
| `started_at` | `timestamptz` | não | `now()` |  |
| `started_by` | `uuid` | não |  | FK -> staff(id) |
| `finished_at` | `timestamptz` | sim |  |  |
| `finished_by` | `uuid` | sim |  | FK -> staff(id) |
| `handover_entry_id` | `uuid` | sim |  | FK -> handover_entries(id) |


## 5. Compras, estoque e pedidos Tesco

### `products` 🟢

Criada em `20261120000011`.

| Coluna | Tipo | Nulo | Default | Regras / FK |
|---|---|---|---|---|
| `id` | `uuid` | não | `gen_random_uuid()` | PK |
| `name` | `text` | não |  | CHECK (length(trim(name)) > 0) |
| `unit` | `text` | não | `'un'` |  |
| `category` | `text` | sim |  |  |
| `active` | `boolean` | não | `true` |  |
| `created_at` | `timestamptz` | não | `now()` |  |

### `purchases` 🟢

Criada em `20261120000011`.

| Coluna | Tipo | Nulo | Default | Regras / FK |
|---|---|---|---|---|
| `id` | `uuid` | não | `gen_random_uuid()` | PK |
| `supplier` | `text` | não |  | CHECK (length(trim(supplier)) > 0) |
| `purchased_on` | `date` | não |  |  |
| `document_ref` | `text` | sim |  |  |
| `created_by` | `uuid` | não |  | FK -> staff(id) |
| `created_at` | `timestamptz` | não | `now()` |  |

### `purchase_lines` 🟢

Criada em `20261120000011`.

| Coluna | Tipo | Nulo | Default | Regras / FK |
|---|---|---|---|---|
| `id` | `uuid` | não | `gen_random_uuid()` | PK |
| `purchase_id` | `uuid` | não |  | FK -> purchases(id) |
| `product_id` | `uuid` | não |  | FK -> products(id) |
| `quantity` | `numeric(12, 3)` | não |  | CHECK (quantity > 0) |
| `unit_price` | `numeric(12, 4)` | não |  | CHECK (unit_price >= 0) |
| `line_total` | `numeric(12, 2)` | sim |  | generated always as (round(quantity * unit_price, 2)) stored |

### `product_movements` 🟢

Criada em `20261120000011`.

| Coluna | Tipo | Nulo | Default | Regras / FK |
|---|---|---|---|---|
| `id` | `uuid` | não | `gen_random_uuid()` | PK |
| `kind` | `text` | não |  | CHECK (kind in ('allocation', 'transfer')) |
| `product_id` | `uuid` | não |  | FK -> products(id) |
| `purchase_line_id` | `uuid` | sim |  | FK -> purchase_lines(id) |
| `from_lodge_id` | `uuid` | sim |  | FK -> lodges(id) |
| `to_lodge_id` | `uuid` | não |  | FK -> lodges(id) |
| `quantity` | `numeric(12, 3)` | não |  | CHECK (quantity > 0) |
| `note` | `text` | sim |  |  |
| `created_by` | `uuid` | não |  | FK -> staff(id) |
| `created_at` | `timestamptz` | não | `now()` |  |

Constraints de tabela:

- `check ((kind = 'transfer') = (from_lodge_id is not null))`

### `shop_items` 🟢

Criada em `20261124000017`.

| Coluna | Tipo | Nulo | Default | Regras / FK |
|---|---|---|---|---|
| `id` | `uuid` | não | `gen_random_uuid()` | PK |
| `sort_order` | `integer` | não | `0` |  |
| `category` | `text` | não |  | CHECK (length(trim(category)) > 0) |
| `name` | `text` | não |  | CHECK (length(trim(name)) > 0) |
| `default_qty` | `integer` | não | `1` | CHECK (default_qty between 0 and 999) |
| `default_action` | `text` | não | `'buy'` | CHECK (default_action in ('buy', 'dont_buy')) |
| `tesco_url` | `text` | sim |  | CHECK (tesco_url is null or tesco_url ~ '^https://') |
| `image_path` | `text` | sim |  |  |
| `active` | `boolean` | não | `true` |  |
| `version` | `integer` | não | `1` |  |

### `shop_orders` 🟢

Criada em `20261124000017`.

| Coluna | Tipo | Nulo | Default | Regras / FK |
|---|---|---|---|---|
| `id` | `uuid` | não | `gen_random_uuid()` | PK |
| `delivery_date` | `date` | não |  |  |
| `notes` | `text` | sim |  |  |
| `status` | `text` | não | `'draft'` | CHECK (status in ('draft', 'placed')) |
| `created_by` | `uuid` | não |  | FK -> staff(id) |
| `created_at` | `timestamptz` | não | `now()` |  |
| `placed_at` | `timestamptz` | sim |  |  |

Alterações posteriores (`ALTER TABLE`):

- `20261126000037`: `drop constraint shop_orders_status_check`
- `20261126000037`: `alter column status set default 'created'`
- `20261126000037`: `add constraint shop_orders_status_check check (status in ('created', 'placed', 'awaiting', 'delivered'))`
- `20261126000037`: `add column delivered_at timestamptz`
- `20261126000037`: `add column delivered_by uuid references public.staff(id)`
- `20261126000037`: `add column delivery_id uuid references public.food_deliveries(id)`

### `shop_order_lines` 🟢

Criada em `20261124000017`.

| Coluna | Tipo | Nulo | Default | Regras / FK |
|---|---|---|---|---|
| `id` | `uuid` | não | `gen_random_uuid()` | PK |
| `order_id` | `uuid` | não |  | FK -> shop_orders(id) on delete cascade |
| `item_id` | `uuid` | não |  | FK -> shop_items(id) |
| `standard_qty` | `integer` | não |  | CHECK (standard_qty >= 0) |
| `action` | `text` | não |  | CHECK (action in ('standard', 'more', 'less', 'dont')) |
| `delta` | `integer` | não | `0` | CHECK (delta between 0 and 999) |
| `final_qty` | `integer` | sim |  | generated always as ( case action when 'standard' then standard_qty when 'more' then standard_qty + delta when 'less' then greatest(standard_qty - delta, 0) else 0 end) stored |
| `unit_price` | `numeric(8, 2)` | sim |  | CHECK (unit_price is null or unit_price between 0 and 99999) |

Constraints de tabela:

- `unique (order_id, item_id)`


## 6. Equipe: escala, horas, férias

### `rota_shifts` 🟢

Criada em `20261120000011`.

| Coluna | Tipo | Nulo | Default | Regras / FK |
|---|---|---|---|---|
| `id` | `uuid` | não | `gen_random_uuid()` | PK |
| `staff_id` | `uuid` | não |  | FK -> staff(id) |
| `lodge_id` | `uuid` | sim |  | FK -> lodges(id) |
| `function` | `text` | não |  | CHECK (function in ('office', 'float', 'cleaner', 'manager')) |
| `starts_at` | `timestamptz` | não |  |  |
| `ends_at` | `timestamptz` | não |  |  |
| `status` | `text` | não | `'draft'` | CHECK (status in ('draft', 'published', 'cancelled')) |
| `published_at` | `timestamptz` | sim |  |  |
| `created_by` | `uuid` | não |  | FK -> staff(id) |
| `created_at` | `timestamptz` | não | `now()` |  |
| `version` | `integer` | não | `1` |  |

Constraints de tabela:

- `check (ends_at > starts_at)`
- `check ((function = 'float') = (lodge_id is null))`

Alterações posteriores (`ALTER TABLE`):

- `20261124000016`: `add column planned_starts_at timestamptz`
- `20261124000016`: `add column planned_ends_at timestamptz`

### `work_intervals` 🟢

Criada em `20261120000011`.

| Coluna | Tipo | Nulo | Default | Regras / FK |
|---|---|---|---|---|
| `id` | `uuid` | não | `gen_random_uuid()` | PK |
| `staff_id` | `uuid` | não |  | FK -> staff(id) |
| `lodge_id` | `uuid` | sim |  | FK -> lodges(id) |
| `starts_at` | `timestamptz` | não |  |  |
| `ends_at` | `timestamptz` | não |  |  |
| `note` | `text` | sim |  |  |
| `created_by` | `uuid` | não |  | FK -> staff(id) |
| `created_at` | `timestamptz` | não | `now()` |  |
| `version` | `integer` | não | `1` |  |

Constraints de tabela:

- `check (ends_at > starts_at)`

### `vacations` 🟢

Criada em `20261120000011`.

| Coluna | Tipo | Nulo | Default | Regras / FK |
|---|---|---|---|---|
| `id` | `uuid` | não | `gen_random_uuid()` | PK |
| `staff_id` | `uuid` | não |  | FK -> staff(id) |
| `starts_on` | `date` | não |  |  |
| `ends_on` | `date` | não |  |  |
| `note` | `text` | sim |  |  |
| `status` | `text` | não | `'active'` | CHECK (status in ('active', 'cancelled')) |
| `created_by` | `uuid` | não |  | FK -> staff(id) |
| `created_at` | `timestamptz` | não | `now()` |  |

Constraints de tabela:

- `check (ends_on >= starts_on)`

Alterações posteriores (`ALTER TABLE`):

- `20261124000017`: `drop constraint if exists vacations_status_check`
- `20261124000017`: `alter column status set default 'approved'`
- `20261124000017`: `add constraint vacations_status_check check (status in ('under_review', 'approved', 'cancelled'))`

### `holiday_locks` 🟢

Criada em `20261124000017`.

| Coluna | Tipo | Nulo | Default | Regras / FK |
|---|---|---|---|---|
| `id` | `uuid` | não | `gen_random_uuid()` | PK |
| `starts_on` | `date` | não |  |  |
| `ends_on` | `date` | não |  |  |
| `note` | `text` | sim |  |  |
| `active` | `boolean` | não | `true` |  |
| `created_by` | `uuid` | não |  | FK -> staff(id) |
| `created_at` | `timestamptz` | não | `now()` |  |

Constraints de tabela:

- `check (ends_on >= starts_on)`


## 7. Notificações, push, auditoria

### `notifications` 🟢

Criada em `20261120000006`.

| Coluna | Tipo | Nulo | Default | Regras / FK |
|---|---|---|---|---|
| `id` | `bigint` | não |  | PK; generated always as identity primary key |
| `kind` | `text` | não |  |  |
| `audience` | `text` | não | `'management'` | CHECK (audience in ('management', 'lodge')) |
| `lodge_id` | `uuid` | sim |  | FK -> lodges(id) |
| `resident_id` | `uuid` | sim |  | FK -> residents(id) |
| `payload` | `jsonb` | não | `'{}'::jsonb` |  |
| `created_at` | `timestamptz` | não | `now()` |  |

### `notification_reads` 🟢

Criada em `20261120000006`.

| Coluna | Tipo | Nulo | Default | Regras / FK |
|---|---|---|---|---|
| `notification_id` | `bigint` | não |  | FK -> notifications(id) |
| `staff_id` | `uuid` | não |  | FK -> staff(id) |
| `read_at` | `timestamptz` | não | `now()` |  |

Constraints de tabela:

- `primary key (notification_id, staff_id)`

### `push_prefs` 🟢

Criada em `20261125000023`.

| Coluna | Tipo | Nulo | Default | Regras / FK |
|---|---|---|---|---|
| `staff_id` | `uuid` | não |  | FK -> staff(id) |
| `key` | `text` | não |  | CHECK (key ~ '^(tag:[a-z_]+\|maintenance:(urgent\|normal\|low)\|warning\|shift_hours_review\|fridge_out_of_range)$') |
| `enabled` | `boolean` | não |  |  |

Constraints de tabela:

- `primary key (staff_id, key)`

### `push_subscriptions` 🟢

Criada em `20261125000023`.

| Coluna | Tipo | Nulo | Default | Regras / FK |
|---|---|---|---|---|
| `id` | `uuid` | não | `gen_random_uuid()` | PK |
| `staff_id` | `uuid` | não |  | FK -> staff(id) |
| `endpoint` | `text` | não |  | UNIQUE; CHECK (endpoint ~ '^https://') |
| `p256dh` | `text` | não |  |  |
| `auth` | `text` | não |  |  |
| `device` | `text` | sim |  |  |
| `created_at` | `timestamptz` | não | `now()` |  |
| `last_used_at` | `timestamptz` | sim |  |  |

### `audit_log` 🟢

Criada em `20261120000001`.

| Coluna | Tipo | Nulo | Default | Regras / FK |
|---|---|---|---|---|
| `id` | `bigint` | não |  | PK; generated always as identity primary key |
| `occurred_at` | `timestamptz` | não | `now()` |  |
| `actor_user_id` | `uuid` | sim |  |  |
| `actor_staff_id` | `uuid` | sim |  |  |
| `action` | `text` | não |  |  |
| `table_name` | `text` | não |  |  |
| `record_id` | `text` | sim |  |  |
| `old_data` | `jsonb` | sim |  |  |
| `new_data` | `jsonb` | sim |  |  |

### `access_log` 🟢

Criada em `20261120000001`.

| Coluna | Tipo | Nulo | Default | Regras / FK |
|---|---|---|---|---|
| `id` | `bigint` | não |  | PK; generated always as identity primary key |
| `occurred_at` | `timestamptz` | não | `now()` |  |
| `actor_user_id` | `uuid` | sim |  |  |
| `actor_staff_id` | `uuid` | sim |  |  |
| `resident_id` | `uuid` | não |  | FK -> residents(id) |
| `context` | `text` | não | `'profile'` |  |

## Observações de modelagem 🟢/🟡

- `staff.role` + `staff_home_only_station` (`home_lodge_id is null or role = 'station'`): só a conta de casa guarda casa (migr. 033). Índice único `staff_single_developer` limita a um Developer.
- `stays`: invariantes por índices parciais únicos (uma estadia aberta por morador e por cama) + trigger `stays_check_bed` (cama ativa, quarto ativo — migr. 035 — e casa coerente).
- `task_signatures_once` usa `coalesce(template_id, extra_id)`: a assinatura referencia template **ou** extra (`check ((template_id is null) <> (extra_id is null))`: exatamente um dos dois — polimórfico exclusivo).
- `audit_log.record_id` é `text` (guarda `id` de PK uuid ou bigint) — sem FK; `old_data/new_data` guardam a linha inteira em `jsonb` (inclui PII e `unit_price`, acessível só à gestão).
- `foreign key` para `auth.users` apenas em `staff.user_id` (`on delete set null`) e `mfa_email_challenges.user_id` (`cascade`); `created_by`/`deactivated_by` em `staff` e `parameters.created_by` **não** têm FK 🟡 (ver `questions.md`).
- `food_deliveries.supplier` (texto) coexiste com `supplier_id` (FK, migr. 037); `suppliers` renomeado propaga o nome (`update_supplier`). `shop_orders.delivery_id` ↔ `food_deliveries.order_id` formam referência circular consistente, mantida por `link_delivery_to_order` 🟡.
