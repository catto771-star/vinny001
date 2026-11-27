# Dicionário de dados — configuracoes-e-cadastros

> Escala: 🟢 confirmado · 🟡 inferido · 🔴 lacuna. Caminhos relativos à raiz; SQL em `supabase/migrations/`.

## 1. `parameters` — parâmetros com vigência (`20261120000001_foundation.sql:121-131`)
| Coluna | Tipo | Nulo | Default | Notas |
|---|---|---|---|---|
| `id` | bigint identity PK | não | | desempate em `param_value` |
| `key` | text | não | | CHECK `key ~ '^[a-z0-9_.]+$'` |
| `lodge_id` | uuid FK `lodges(id)` | sim | NULL | NULL = vale para as duas casas; a tela só lê/grava NULL |
| `value` | jsonb | não | | |
| `valid_from` | timestamptz | não | `now()` | início da vigência |
| `created_at` | timestamptz | não | `now()` | |
| `created_by` | uuid | sim | | `current_staff_id()` quando gravado por `set_system_parameter` |

Índice `parameters_lookup(key, lodge_id, valid_from desc)` `:131`. Gatilho `audit_parameters` `:766`.
RLS `:842`: `parameters_read` (equipe ativa) `:893`; `parameters_insert` exige `is_management() and valid_from >= now() - interval '1 minute'` `:894-895`; **não há UPDATE/DELETE** (grant só select+insert `:856`) → histórico imutável por desenho. 🟢
Leitura vigente: `param_value(p_key, p_lodge, p_at)` `:133-146`.
🟡 Política de INSERT direto permite a um gestor inserir **qualquer chave** pela API (sem passar pela validação de `set_system_parameter`); a proteção de chaves sensíveis (ex. `security.require_mfa_management`) depende de a UI usar a RPC. Ver questions.

### 1.1 Catálogo de chaves conhecidas
| Chave | Valor padrão (seed) | Tipo JSON | Editável pela tela? | Limites validados | Origem |
|---|---|---|---|---|---|
| `presence.check_times` | `["12:00","18:00","22:00"]` | array HH:MM | sim | 1–8 itens | `seed_structure.sql:48` |
| `presence.check_window_minutes` | `60` | int | sim | 5–180 | `more_settings.sql:2` |
| `presence.no_show_monthly_alert` | `3` | int | sim | 1–31 | `seed_structure.sql:49` |
| `rounds.hours` | 12 horários pares `00:00…22:00` | array HH:MM | sim | 1–24 itens | `seed_structure.sql:54` |
| `records.correction_window_hours` | `72` | int | sim | 1–720 | `seed_structure.sql:55` |
| `fridge.range_celsius` | `{"min":0,"max":5}` | objeto | sim | min ≥ -30, max ≤ 40, min < max | `seed_structure.sql:56` |
| `maintenance.default_deadline_hours` | `{"urgent":24,"normal":168,"low":720}` | objeto | sim | inteiros 1–8760; urgent ≤ normal ≤ low | `seed_structure.sql:57` |
| `maintenance.reminder_hours` | `24` | int | sim | 1–168 | `seed_structure.sql:58` |
| `security.session_idle_minutes` | `15` | int | sim | 5–240 | `seed_structure.sql:59` |
| `delivery.expiry_alert_days` | `3` | int | sim | 0–60 | `r15.sql:164` |
| `security.require_mfa_management` | `true` | boolean | **não** (lista fechada) | — | `seed_structure.sql:60` |
| `shift.day_start` / `shift.night_start` | `"07:00"` / `"19:00"` | string | não | — | `seed_structure.sql:50-51` |
| `shift.float_hours` | `{"start":"12:00","end":"24:00"}` | objeto | não | — | `seed_structure.sql:52` |
| `shift.minimum_coverage` | `{"office_per_shift_per_lodge":1,"float":{…,"count":1}}` | objeto | não | — | `seed_structure.sql:53` |
| `alerts.email` | `{"enabled":false,"types":{…5 tipos…: false}}` | objeto | não | — | `seed_structure.sql:61` |
| `handover.late_reasons` | `["other_occurrence","system_failure","forgot","info_received_later"]` | array | não | — | `occurrences.sql:36-37` |

Observação 🟡: `valid_from` dos seeds é `2026-01-01` (anterior à vigência real); a primeira edição pela tela cria linha com `valid_from=now()`.

## 2. Estrutura física

### 2.1 `lodges` — `foundation.sql:52-62`
`id uuid PK default gen_random_uuid()`, `code text NOT NULL UNIQUE CHECK (code ~ '^[A-Z_]+$')`, `name text NOT NULL`, `short_name text NOT NULL`, `address text`, `has_dinner boolean NOT NULL default false`, `has_laundry boolean NOT NULL default false`, `active boolean NOT NULL default true`, `created_at timestamptz default now()`.
Seeds `seed_structure.sql:4-6`: `AMIENS` ("Amiens St.", jantar sim, lavanderia não), `CONNOLLY` (jantar não, lavanderia sim). RLS: `lodges_read` (equipe), `lodges_write` INSERT e `lodges_update` UPDATE só `is_management()` `:871-873`; restritiva `house_scope` por `can_see_lodge(id)` (`house_scope.sql:51`). Auditada `:762`. A UI só edita `name`, `short_name`, `has_dinner`, `has_laundry` (via `update_lodge`); `address` e `active` não têm UI 🟡. Limites do RPC: nome ≤60, curto ≤30.

### 2.2 `rooms` — `foundation.sql:64-73`
`id`, `lodge_id FK NOT NULL`, `kind room_kind ('room'|'apartment') NOT NULL default 'room'`, `code text NOT NULL CHECK (length(trim(code))>0)`, `sort_order int NOT NULL default 0`, `active boolean NOT NULL default true`, `created_at`, `UNIQUE (lodge_id, kind, code)` (sensível a caixa; o RPC reforça **case-insensitive**). Índice `rooms_lodge_idx`. RLS `rooms_read/write/update` `:875-877`; restritiva via `lodge_id`. Auditada `:763`. Limite RPC: código ≤20.
Seed: Amiens 9 quartos/37 camas; Connolly 24 quartos + 5 apartamentos (sem quarto 13) `seed_structure.sql:8-44` (contagens de comentário `:8,24`; números não recontados 🟡).

### 2.3 `beds` — `foundation.sql:75-85`
`id`, `room_id FK NOT NULL`, `number int NOT NULL CHECK (>0)`, `status bed_status ('in_use'|'out_of_service') NOT NULL default 'in_use'`, `status_note text`, `active boolean NOT NULL default true`, `version int default 1`, `created_at`, `UNIQUE(room_id, number)`. Índice `beds_room_idx`. RLS `beds_read/write/update` `:879-881`; restritiva por `rooms.lodge_id` (`house_scope.sql:53`). Gatilhos: `beds_bump_version` `:701`, `audit_beds` `:764`. Máx. 12 camas por quarto (RPC; número da nova cama = `max(number)+1`, contando removidas). `status` é gerido pelo módulo de moradores/ocupação (`out_of_service`), distinto de `active` (remoção cadastral). 🟢

### 2.4 `fridges` — `beta_operations.sql:241-249`
`id`, `lodge_id FK NOT NULL`, `code text NOT NULL CHECK (trim>0)`, `name text NOT NULL CHECK (trim>0)`, `sort_order int default 0`, `active boolean default true`, `UNIQUE(lodge_id, code)`. Código gerado `F<n>`. Seed: Amiens F1 "Kitchen fridge"; Connolly F1–F4 `:252-258`. RLS: leitura equipe `:269`; escrita só RPC. `fridge_readings.fridge_id NOT NULL FK` `:260-263`. Auditada `:250`. Limite nome ≤40.

### 2.5 `laundry_machines` — `services.sql:338-347`
`id`, `lodge_id FK NOT NULL`, `code text NOT NULL`, `label text NOT NULL`, `kind text CHECK in ('wash','dry') NOT NULL`, `sort_order int default 0`, `active boolean default true`, `UNIQUE(lodge_id, code)`. Seed (casas com lavanderia): A-WASH, A-DRY, B-WASH, B-DRY `:349-354`. Código novo `M<n>-WASH|DRY`. RLS `machines_read` `:500`; auditada só a partir de `034:172` (🟡 antes, mudanças não eram auditadas). Limite label ≤40.

### 2.6 `suppliers` — `20261126000037_r15.sql:105-118`
`id`, `name text NOT NULL CHECK (trim>0 AND char_length<=40)`, `active boolean default true`, `require_batch`, `require_best_before`, `require_temperature`, `links_order` (todos `boolean NOT NULL default false`), `sort_order int default 0`, `created_at`, `version int default 1`. Índice único `suppliers_name_unique (lower(name))`. RLS: leitura equipe `:122`; escrita só RPC. Auditada `:118`. `food_deliveries.supplier_id FK` e `supplier` (texto denormalizado, sincronizado em `update_supplier`) `:127-129,160`. Seed: Tesco, Ripley's `:123-125`.

## 3. Tags e preferências de notificação

### 3.1 `handover_tags` — `20261125000023_handover_tags_push.sql:4-11` + `20261125000036_tags_admin.sql:2`
`id uuid PK`, `code text NOT NULL UNIQUE CHECK (code ~ '^[a-z_]+$')`, `label text NOT NULL`, `sort_order int default 0`, `visible boolean default true`, `notify_default boolean default false`, `color text NOT NULL default 'grey' CHECK in (red, amber, blue, green, violet, grey)`.
Seeds `:13-17`: incident, emergency, health, damage (aviso padrão **sim**), conduct, visitor, delivery, general (não). Cores iniciais: incident/emergency=red, health/damage=amber, resto grey (`tags_admin.sql:3`). Limites: rótulo ≤30; ≤20 tags no total; rótulo único case-insensitive. RLS leitura equipe `:50`; só RPC para escrever. Auditada `:12`. O tipo TS `HandoverTag`/`TAG_COLORS` vem de `src/pages/Handover.tsx` 🟢.

### 3.2 `push_prefs` — `:26-31`
`staff_id uuid FK NOT NULL`, `key text NOT NULL CHECK (key ~ '^(tag:[a-z_]+|maintenance:(urgent|normal|low)|warning|shift_hours_review|fridge_out_of_range)$')`, `enabled boolean NOT NULL`, PK `(staff_id, key)`. Sem linha = padrão `push_default(key)`. RLS ligada; sem grants diretos (`revoke all … from anon, authenticated` `:48`) — acesso só por `my_push_prefs`/`set_push_pref`. Tipo TS `Pref {key,label,group,enabled}` `Settings.tsx:18`.

### 3.3 `push_subscriptions` — `:33-42`
`id`, `staff_id FK`, `endpoint text UNIQUE CHECK '^https://'`, `p256dh`, `auth`, `device`, `created_at`, `last_used_at`. (Conteúdo detalhado no módulo `notificacoes-e-push`; colunas `p256dh`/`auth` são segredos de assinatura — valores não lidos.)

## 4. Auxiliares

### 4.1 `quick_phrases` — `occurrences.sql:75-80`
`id uuid PK`, `text jsonb NOT NULL` (`{"pt-PT","en-IE","pl-PL"}`), `sort_order int default 0`, `active boolean default true`. 6 frases semente `:82-88`. RLS: `phrases_read` (equipe), `phrases_insert/update` (gestão) `:856-858`; `grant insert, update`. Sem auditoria e **sem consumidor no código** 🟡/🔴.

### 4.2 `holiday_locks` — `beta_management.sql:478-487`
`id uuid PK`, `starts_on date NOT NULL`, `ends_on date NOT NULL`, `note text`, `active boolean NOT NULL default true`, `created_by uuid NOT NULL FK staff(id)`, `created_at timestamptz default now()`, `CHECK (ends_on >= starts_on)`. RLS: leitura equipe `:492`; `revoke all`, `grant select` `:490-491`. Auditada `:488`. Soft delete via `active=false`. Janela por bloqueio ≤ 366 dias (RPC).

### 4.3 `staff` (colunas relevantes a Configurações)
`display_name text` (≤40 via RPC), `home_lodge_id uuid FK lodges` — **só permitido para `role='station'`** (`staff_home_only_station` `people_roles.sql:3-4`), `role staff_role ('porter','cleaner','manager','owner','developer','station')`, `email text` (único case-insensitive), `locale`, `must_change_password`. (`foundation.sql:94-111`; valor `station` em `station_role.sql:3`.) Definição completa: módulo `acesso-e-autenticacao`/`equipe-escala-e-horas`.

## 5. Funções utilitárias de acesso (assinaturas)
| Função | Retorno | Efeito |
|---|---|---|
| `current_staff_id()` | uuid | staff ativo do `auth.uid()` (`foundation.sql:151`) |
| `current_staff_role()` | staff_role | idem (`:161`) |
| `is_management()` | boolean | papel manager/owner/developer **e** `mfa_satisfied()` (`:183-191`) |
| `is_active_staff()` | boolean | `current_staff_id() is not null` (`:193`) |
| `mfa_satisfied()` | boolean | `true` se `security.require_mfa_management=false` ou JWT `aal2` (`:173-181`) |
| `house_scope()` | uuid | casa da conta `station`; NULL nos demais (`house_scope.sql:5`) |
| `can_see_lodge(uuid)` | boolean | ver §7 de code-analysis (`:12`) |
| `can_write_lodge(uuid)` | boolean | gestão ∨ station na própria casa ativa ∨ posto aberto float/da casa (`:19`) |
| `structure_guard()` | void | gestão ou `not_authorised`; `revoke` de authenticated `034:171` |

## 6. Assinaturas das RPCs deste módulo (todas SECURITY DEFINER, `search_path=public`, `revoke … from public, anon`, `grant execute … to authenticated`)
`set_system_parameter(text, jsonb)` · `add_room(uuid,text,text='room',int=1)` · `rename_room(uuid,text)` · `add_bed(uuid)` · `set_room_active(uuid,bool)` · `set_bed_active(uuid,bool)` · `add_fridge(uuid,text)` · `rename_fridge(uuid,text)` · `set_fridge_active(uuid,bool)` · `add_laundry_machine(uuid,text,text)` · `rename_laundry_machine(uuid,text)` · `set_laundry_machine_active(uuid,bool)` · `update_lodge(uuid,text,text,bool,bool)` · `add_supplier(text,bool,bool,bool,bool)` · `update_supplier(uuid,text,bool,bool,bool,bool,bool)` · `add_handover_tag(text,text='grey',bool=false)` · `update_handover_tag(uuid,text,text,bool)` · `move_handover_tag(uuid,int)` · `set_handover_tag(uuid,bool)` · `my_push_prefs()` · `set_push_pref(text,bool)` · `set_my_display_name(text)` · `lock_holiday_dates(date,date,text)` · `unlock_holiday_dates(uuid)`.
Nota 🟢: grants de `add_supplier`/`update_supplier` confirmados em `20261126000037_r15.sql:293` (bloco `do $$` de revoke/grant).

## 7. Armazenamento local
`localStorage["lodge.start"]` (casa inicial do Admin) `activeLodge.tsx:14`; chave da casa ativa `STORAGE_KEY` `activeLodge.tsx:35,50` (valor literal não conferido); tema (`src/lib/theme.ts`). Sem dados sensíveis. 🟢
