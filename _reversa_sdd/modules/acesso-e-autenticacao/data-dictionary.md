# acesso-e-autenticacao — Dicionário de dados

Escala: 🟢 confirmado · 🟡 inferido · 🔴 lacuna. `M01`=`20261120000001_foundation.sql`, `M05`=`..._000005_email_code_second_step.sql`, `M29`=`20261125000029_house_scope.sql`.

## Enums

| Enum | Valores | Origem |
|---|---|---|
| `staff_role` | `porter, cleaner, manager, owner, developer` + `station` (adicionado depois) | `M01:16`; `20261124000015_station_role.sql:3` 🟢 |
| `duty_function` | `office, float` | `M01:17` |
| `app_locale` | `pt-PT, en-IE, pl-PL` | `M01:18` |
| `AuthStage` (TS) | `loading, signed_out, not_staff, change_password, email_code, ready` | `AuthProvider.tsx:14` |

## Tabela `staff` (`M01:94-111`)

| Coluna | Tipo | Nulo | Default | Constraint / nota |
|---|---|---|---|---|
| id | uuid | não | `gen_random_uuid()` | PK |
| user_id | uuid | sim | — | UNIQUE, FK `auth.users(id)` ON DELETE SET NULL; cleaner/porter sem login ⇒ null |
| full_name | text | não | — | `length(trim) > 0` |
| display_name | text | sim | — | editável só pelo próprio (`set_my_display_name`, ≤40) |
| role | staff_role | não | — | check `role <> 'cleaner' or user_id is null` |
| email | text | sim | — | índice único `lower(email)` onde não nulo (`staff_email_unique`, `:114`) |
| locale | app_locale | não | `'en-IE'` | trigger copia p/ `auth.users` metadata |
| home_lodge_id | uuid | sim | — | FK lodges; constraint `staff_home_only_station` (só `station`; `20261125000033:3`) |
| active | boolean | não | `true` | trigger `staff_on_deactivate` |
| must_change_password | boolean | não | `true` | zerado por `mark_password_changed()` |
| version | integer | não | `1` | `bump_version` (otimista) |
| created_at/created_by | timestamptz/uuid | — | `now()` | |
| deactivated_at/by | timestamptz/uuid | sim | — | preenchidos por trigger |

Índice único parcial `staff_single_developer` (`role='developer'`) — no máximo 1 Developer 🟢.
Auditado por `audit_staff` (`M01:765`).

## Tabela `duty_posts` (`M01:206-217`)
Colunas: `id uuid PK`, `staff_id` FK staff NOT NULL, `function duty_function` NOT NULL, `lodge_id` FK lodges, `started_at timestamptz default now()`, `ended_at`, `ended_by` FK staff, `end_reason text` check ∈ `ended|taken_over|deactivated|switched`.
Checks: `(function='office') = (lodge_id is not null)`; `ended_at is null or ended_at >= started_at`.
Índices únicos parciais (`ended_at is null`): 1 posto/pessoa (`duty_posts_one_per_person`), 1 office/lodge, 1 float (`:219-221`). Escrita só por funções SECURITY DEFINER (sem policy de insert/update); leitura `is_active_staff()` (`:898`).

## Tabela `mfa_email_challenges` (`M05:30-39`)
`id bigint identity PK`, `user_id uuid NOT NULL` FK `auth.users` ON DELETE CASCADE, `created_at timestamptz default now()`. Índice `(user_id, created_at desc)`. RLS ligada; `revoke all` de anon/authenticated (ninguém lê/escreve diretamente; só `begin_email_verification` e `mfa_satisfied`, SECURITY DEFINER) 🟢.

## Tabela `parameters` (`M01:121-131`)
`id bigint identity PK`; `key text` check `^[a-z0-9_.]+$`; `lodge_id uuid` (nulo = ambos); `value jsonb`; `valid_from timestamptz default now()`; `created_at`; `created_by uuid`. Índice `(key, lodge_id, valid_from desc)`. Política: só INSERT (nova vigência), nunca UPDATE. `param_value(key, lodge, at)` (`M01:133-146`) prefere linha com lodge específico, depois `valid_from` mais recente.

Parâmetros relevantes ao módulo (seed `20261120000002_seed_structure.sql:47-61`):
| Chave | Valor inicial | Validação em `set_system_parameter` (`M32:49-58`) |
|---|---|---|
| `security.session_idle_minutes` | `15` | inteiro 5–240 |
| `security.require_mfa_management` | `true` | **não** está na whitelist de `set_system_parameter` (só alterável direto por INSERT de gestão, política `parameters_insert`) 🟡 |
| `records.correction_window_hours` | `72` | inteiro 1–720 |

## Tabela `audit_log` (`M01:707-717`)
`id bigint identity PK`, `occurred_at default now()`, `actor_user_id uuid`, `actor_staff_id uuid`, `action text NOT NULL` (INSERT/UPDATE/DELETE), `table_name text NOT NULL`, `record_id text`, `old_data jsonb`, `new_data jsonb`. Índices: `(table_name, record_id, occurred_at desc)`, `(occurred_at desc)`, + `M31:2-4` por ator e por tabela/tempo. Imutável (trigger `audit_immutable`). Leitura RLS `is_management()` (`M01:910`); sem policy de escrita (só via trigger SECURITY DEFINER).

## Tabela `access_log` (`M01:772-779`)
`id bigint identity PK`, `occurred_at`, `actor_user_id`, `actor_staff_id`, `resident_id uuid NOT NULL` FK residents, `context text NOT NULL default 'profile'`. Imutável. Leitura só gestão (`:911`). Escrita só em `open_resident_profile`.

## Estruturas de retorno
- `assume_post` → jsonb `{status: occupied|already_on_post|assumed, occupant_staff_id?, occupant_name?, since?, post_id?, took_over_staff_id?}` (`M29:265-299`).
- `search_audit` → `(id, occurred_at, actor_staff_id, actor_name, action, table_name, record_id, old_data, new_data)`; `search_access_log` → `(id, occurred_at, actor_staff_id, actor_name, resident_id, resident_name, context)` (`M31:10,47`).
- Edge `admin-users` body: `create{full_name, display_name?, email?, role, locale, home_lodge_id?, password?}`, `reset_password{staff_id,password}`, `set_active{staff_id,active}`; respostas `{staff_id}` | `{ok:true}` | `{error}` (`index.ts:13-25`).
- JWT: o banco lê `auth.jwt() -> 'amr'` (array de `{method, timestamp}`) para `password`, `otp`, `magiclink` 🟢.

## RLS / privilégios por tabela (resumo)
| Tabela | SELECT | INSERT | UPDATE | Notas |
|---|---|---|---|---|
| staff | `is_active_staff()` (`M01:885`) | gestão e `role <> 'developer'` (`:886-887`) | gestão e (`role<>'developer'` ou chamador developer) (`:888-890`) | sem DELETE |
| parameters | ativo (`:893`) | gestão, `valid_from >= now()-1min` (`:894`) | — | |
| duty_posts | ativo (`:898`) | só funções | só funções | |
| audit_log / access_log | gestão (`:910-911`) | só triggers/funções | proibido (trigger) | |
| mfa_email_challenges | ninguém | só `begin_email_verification` | — | |
| Toda tabela com `lodge_id` | + política restritiva `house_scope` (`M29:30-76`) | | | station só vê a própria casa; `lodge_id is null` passa |

Privilégios base: `anon` sem nada; `authenticated` com select/insert/update mínimos (`20261120000004_lock_privileges.sql:5-12`); funções: `revoke all … from public, anon` e `grant execute … to authenticated` por função.

## Lacunas
- 🔴 Quem cria a conta Developer e como (não há caminho no app; `admin-users` recusa `developer`).
- 🔴 Chaves SMTP/templates do e-mail de código (configuração do projeto Supabase, fora do repositório).
