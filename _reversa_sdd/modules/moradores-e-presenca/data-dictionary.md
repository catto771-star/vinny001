# moradores-e-presenca — Dicionário de dados

🟢 confirmado · 🟡 inferido · 🔴 lacuna. `M01`=`20261120000001_foundation.sql`, `M06`=`..._000006_presence.sql`, `M29`=`20261125000029_house_scope.sql`. Todos os instantes são `timestamptz` (UTC no banco, exibidos em Europe/Dublin).

## Enums
| Enum | Valores | Fonte |
|---|---|---|
| `room_kind` | `room, apartment` | M01:19 |
| `bed_status` | `in_use, out_of_service` | M01:20 |
| `stay_status` | `active, out_pending, ended` | M01:21 |
| `stay_end_reason` | `out, transfer` | M01:22 |
| `check_result` | `seen, not_seen, absent` | M06:8 |
| `check_status` | `pending, launched` | M06:9 |
| `no_show_status` | `confirmed, undone` | M06:10 |
| turnos (`text`) | `day` (07–19h), `night` (19–07h) | M06:16-30 |
| fontes de evidência (`text`) | `check, manual, check-in, dinner` | M06:553-570, M10:312-333 |

## `lodges` (M01:52-62)
`id uuid PK`; `code text UNIQUE` check `^[A-Z_]+$` (AMIENS, CONNOLLY); `name`; `short_name`; `address`; `has_dinner bool default false`; `has_laundry bool default false`; `active bool default true`; `created_at`. Seed: `20261120000002_seed_structure.sql:4-6` (Amiens: dinner; Connolly: laundry). Auditada.

## `rooms` (M01:64-73)
`id`, `lodge_id` FK NOT NULL, `kind room_kind default 'room'`, `code text` check `length(trim)>0`, `sort_order int default 0`, `active default true`, `created_at`. UNIQUE `(lodge_id, kind, code)`. Seed: Amiens 9 quartos/37 camas; Connolly 24 quartos (38 camas) + 5 apartamentos (6 camas) (seed `:9-45` 🟢 por comentário; contagens vêm do texto do seed). Gestão por `add_room`, `rename_room`, `set_room_active` (`20261125000034_structure.sql:10-65`): código ≤20, `kind ∈ {room, apartment}`, 1–12 camas, `room_occupied` ao desativar com estadia aberta.

## `beds` (M01:75-85)
`id`, `room_id` FK, `number int` check `>0`, `status bed_status default 'in_use'`, `status_note text`, `active default true`, `version int default 1`, `created_at`. UNIQUE `(room_id, number)`. `add_bed` ≤12 camas por quarto. `set_bed_active` → `bed_occupied` se há estadia aberta.

## `residents` (M01:420-431)
| Coluna | Tipo | Nulo | Default | Constraint |
|---|---|---|---|---|
| id | uuid | não | `gen_random_uuid()` | PK |
| pass_id | text | sim | — | índice único `lower(pass_id)` onde não nulo e `<> ''` (`residents_pass_id_unique`, `:433`); **obrigatório na admissão nova** desde M37 (RPC, não constraint) |
| first_name | text | não | — | `length(trim)>0` |
| last_name | text | não | `''` | |
| date_of_birth | date | sim | — | |
| notes | text | sim | — | |
| is_demo | boolean | não | `false` | marca dados de demonstração 🟡 |
| version | int | não | 1 | bloqueio otimista |
| created_at / created_by | timestamptz / uuid FK staff | | `now()` | |
Índice `residents_name_idx(lower(last_name), lower(first_name))`. RLS: SELECT `is_active_staff()` + restritiva `house_scope` (sem estadia ou estadia em casa visível; M29:73-76); UPDATE `is_management() or has_open_post()` (M01:903-905); sem INSERT direto (só `admit_resident`; mas `grant insert,update` existe para authenticated, sem policy de insert → bloqueado por RLS 🟡).

## `stays` (M01:436-455)
| Coluna | Tipo | Nulo | Default / constraint |
|---|---|---|---|
| id | uuid PK | | `gen_random_uuid()` |
| resident_id | uuid FK residents | não | |
| lodge_id | uuid FK lodges | não | validado por trigger `stays_check_bed` contra a cama |
| bed_id | uuid FK beds | não | |
| admitted_at | timestamptz | não | `now()` |
| status | stay_status | não | `'active'` |
| transfer_from_stay_id | uuid FK stays | sim | cadeia de transferências |
| out_decided_at / out_decided_by (FK staff) / out_reason | | sim | preenchidos por `decide_out`/`effect_out` |
| ended_at / ended_by / end_reason | | sim | check `(status='ended') = (ended_at is not null)`; `ended_at >= admitted_at` |
| version, created_at, created_by | | | |
Índices únicos parciais `status <> 'ended'`: 1 estadia aberta por residente e por cama (M01:458-459). Índice `(lodge_id, status)`. Triggers: `stays_check_bed` (M35), `bump_version`, `audit_stays`. SELECT `is_active_staff()` + `house_scope`.

## View `bed_occupancy` (vigente M07:793-807, `security_invoker=true`)
Colunas: `lodge_id, lodge_code, room_id, room_kind, room_code, room_sort, bed_id, bed_number, bed_status, stay_id, stay_status, admitted_at, resident_id, first_name, last_name, date_of_birth, pass_id, final_warning (boolean = coalesce(has_final_warning(resident), false))`. Junta `beds`⋈`rooms`⋈`lodges` com `left join stays (status <> 'ended')`; filtra `b.active and r.active and l.active`. Tipo TS: `BedOccupancy` (`src/lib/types.ts:41-60`).

## `room_check_runs` (M06:76-92)
| Coluna | Tipo | Observação |
|---|---|---|
| id | uuid PK | |
| lodge_id | uuid FK | NOT NULL |
| operational_day | date | NOT NULL |
| slot | text | check `^([01]\d|2[0-3]):[0-5]\d$` |
| checked_at | timestamptz | hora real do check (visível a todos) |
| performed_by | uuid FK staff | quem fez a ronda |
| performed_reported_by_entrant | boolean **generated stored** | `performed_by is distinct from entered_by` |
| entered_by | uuid FK staff | quem digitou (nunca muda) |
| entered_at | timestamptz default now() | **só gestão** |
| status | check_status default `'pending'` | |
| launched_at / launched_by | | launched_at só gestão |
| sheet_number | text NOT NULL | `XX-YYYYMMDD-HHMM` |
| version | int | |
UNIQUE `(lodge_id, operational_day, slot)`. Índice `(operational_day, lodge_id)`. GRANT SELECT por coluna exclui `entered_at`, `launched_at` (M06:809-810).

## `room_check_marks` (M06:94-104)
`id`, `run_id` FK, `stay_id` FK, `resident_id` FK, `result check_result NOT NULL`, `marked_by` FK staff, `marked_at default now()` (só gestão), `version`. UNIQUE `(run_id, stay_id)`. Índice `(resident_id)`. **Linhas podem ser apagadas** por `clear_mark` (M06:399) — auditadas 🟢. GRANT SELECT sem `marked_at`.

## `sightings` (M06:110-118)
`id`, `resident_id` FK, `lodge_id` FK, `seen_at timestamptz NOT NULL`, `place text`, `recorded_by` FK staff NOT NULL, `recorded_at default now()` (só gestão). Índice `(resident_id, seen_at)`. Sem `version`. GRANT SELECT sem `recorded_at`.

## `absences` (M06:123-137)
`id`, `stay_id` FK, `resident_id` FK, `starts_at NOT NULL`, `expected_return_at NOT NULL`, `ended_at`, `ended_by` FK, `notes`, `created_by NOT NULL`, `created_at`, `version`. Checks: `expected_return_at > starts_at`; `ended_at is null or ended_at >= starts_at`. Índice `(stay_id)`. Não há constraint de exclusão de sobreposição — a regra está em `register_absence` (`tstzrange &&`, M06:470-476) e pode ser burlada em corrida 🟡 (sem lock da estadia no `register_absence`).

## `no_shows` (M06:161-176)
`id`, `resident_id`, `stay_id`, `lodge_id`, `operational_day date`, `status no_show_status default 'confirmed'`, `confirmed_by`, `confirmed_at default now()`, `undone_by`, `undone_at`, `undo_reason`, `version`. Índice único parcial `(resident_id, operational_day) where status='confirmed'`.

## `notifications` / `notification_reads` (M06:179-194; RLS 822-827)
`notifications(id bigint identity, kind text, audience text default 'management' check ∈ {management, lodge}, lodge_id, resident_id, payload jsonb default '{}', created_at)`. O módulo cria `kind='no_show_monthly_limit'` com payload `{no_show_id, month_count, operational_day, first_name, last_name}`. `notification_reads(notification_id, staff_id, read_at)` PK composta. Leitura: staff ativo e (`audience='lodge'` ou gestão).

## Parâmetros usados (tabela `parameters`, vigência)
| Chave | Valor inicial | Onde |
|---|---|---|
| `presence.check_times` | `["12:00","18:00","22:00"]` (seed 000002:48) | `check_slots` (por lodge, vigente no início do dia) |
| `presence.check_window_minutes` | `60` (M32:2) faixa 5–180 | `open_room_check`, `room_check_done` |
| `presence.no_show_monthly_alert` | `3` (000002:49) faixa 1–31 | `confirm_no_shows`; `NoShows.tsx:80` |
| `records.correction_window_hours` | `72` faixa 1–720 | janela de correção de runs/marcas |
| `rounds.hours` | 12 horários pares (000002:54) | `round_slots()`; ligação launch→Handover |
| `shift.day_start` `"07:00"`, `shift.night_start` `"19:00"` | seed | declarados mas funções SQL usam 7/19 **fixos** 🟡 |

## Retornos estruturados (JSON/tabelas)
- `room_check_sheet` → colunas `room_id, room_kind, room_code, room_sort, bed_id, bed_number, bed_status, stay_id, resident_id, first_name, last_name, date_of_birth, absence_id, result, marked_by, final_warning` (`M07:757-766`); TS `SheetRow` (`presence.ts:5-22`).
- `mark_resident` → `{mark_id, absence_active, absence_id}`; `launch_room_check` → `{status:'launched'|'already_launched', launched_at_day?}`.
- `record_sighting` → `{sighting_id, absence_active, absence_id}`.
- `seen_for_day` → `resident_id, stay_id, first_name, last_name, room_kind, room_code, bed_number, seen_day, seen_night, day_sources[], night_sources[]`.
- `no_show_review` → `{operational_day, day_finished, pending_slots[], complete, candidates[{stay_id, resident_id, first_name, last_name, room_kind, room_code, bed_number, month_count}], confirmed[{id, stay_id, resident_id, first_name, last_name, status, confirmed_at, undo_reason, month_count}]}`.
- `presence_alert` → `{operational_day, pending_slots[], complete, without_evidence[]}`.
- `open_resident_profile` → `{resident, stays[{id, lodge_id, lodge_code, room_code, room_kind, bed_number, status, admitted_at, ended_at, end_reason, out_reason, out_decided_at, out_decided_by_name, version}]}`.
- `find_former_resident` → `(resident_id, first_name, last_name, date_of_birth, pass_id, has_open_stay, last_ended_at, last_house)`.

## Funções utilitárias de leitura (SQL)
`operational_day`, `operational_day_start`, `operational_day_end`, `shift_of`, `slot_shift`, `slot_instant`, `check_slots`, `stays_present_at`, `stays_present_at_any`, `correction_window`, `absence_effective_end`, `active_absence`, `pending_slots`, `stay_chain_start`, `no_show_month_count`, `residents_without_evidence`, `resident_evidence`, `bed_lodge` (M01:462-468). Privilégios: tabelas de presença sem GRANT de escrita (só funções SECURITY DEFINER; `M06:804-815`); `resident_evidence`, `stays_present_at`, `correction_window`, `absence_effective_end`, `active_absence`, `stay_chain_start`, `no_show_month_count`, `residents_without_evidence` ficam **sem EXECUTE para authenticated** (revogadas em M06:829-843 e não reconcedidas) — usadas só internamente 🟢. (Observação: M29 recria várias com `CREATE OR REPLACE`; grants anteriores permanecem.)

## Lacunas
- 🔴 `residents.is_demo`: quem define e como é usado (ver `tests/db/demo.test.ts`).
- 🔴 `shift.day_start/night_start/float_hours` existem como parâmetros, mas o SQL de presença usa 7h/19h literais.
