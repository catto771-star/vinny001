# servicos-da-casa — Dicionário de dados

Escala: 🟢 confirmado · 🟡 inferido · 🔴 lacuna. Migrações em `supabase/migrations/` (abreviações em `code-analysis.md`: M10, M14, M15, M18, M29, M34...). Todas as tabelas: `audit_row()` em INSERT/UPDATE/DELETE (trigger `audit_<tabela>`), RLS ligada, `revoke all` de `anon, authenticated` e `grant select` (escrita só por RPC) 🟢.

## Tabelas

### `laundry_machines` (`M10:338-347`)
| Coluna | Tipo | Null | Default / constraint |
|---|---|---|---|
| id | uuid PK | não | `gen_random_uuid()` |
| lodge_id | uuid → lodges | não | — |
| code | text | não | `unique (lodge_id, code)`; gerado `M{n}-WASH/DRY` em `add_laundry_machine` `M34:121`; semente `A-WASH, A-DRY, B-WASH, B-DRY` `M10:352` |
| label | text | não | ex.: "A · Wash"; ≤ 40 car. validado só no RPC `M34:113-117` |
| kind | text | não | `check in ('wash','dry')` |
| sort_order | int | não | `0` (RPC usa `100+n`) |
| active | boolean | não | `true` |
Trigger de auditoria adicionado em `M34:172` 🟢. RLS: `machines_read` (equipe ativa) + restritiva `house_scope` (`M29:39-41`).

### `laundry_uses` (`M10:356-367`)
`id` uuid PK · `machine_id` → machines (não null) · `lodge_id` → lodges (não null) · `stay_id` → stays (null) · `resident_id` → residents (null; copiado da estadia) · `started_at timestamptz default now()` · `started_by → staff` (não null) · `finished_at` (null) · `finished_by → staff` (null) · `handover_entry_id → handover_entries` (null; anotação de início).
Índice único parcial `laundry_one_open_use (machine_id) where finished_at is null` `M10:369` → no máximo 1 uso aberto por máquina 🟢.

### `fridges` (`M14:241-250`)
`id` uuid PK · `lodge_id` (não null) · `code text not null check (length(trim(code))>0)` · `name text not null check (length(trim(name))>0)` · `sort_order int default 0` · `active boolean default true` · `unique (lodge_id, code)`. Semente: Amiens F1 "Kitchen fridge"; Connolly F1–F4 "Fridge 1–4" `M14:252-258`. `add_fridge` gera `F{n}` e valida nome ≤ 40 `M34:78-89`. RLS `fridges_read`.

### `fridge_readings` (`M10:37-47` + `M14:260-264`)
| Coluna | Tipo | Null | Default / constraint |
|---|---|---|---|
| id | uuid PK | não | gen_random_uuid |
| lodge_id | uuid → lodges | não | — |
| fridge_id | uuid → fridges | não (após backfill) | `M14:260-263` |
| temperature | numeric(4,1) | não | arredondada a 1 casa; RPC valida [-40, 40] |
| range_min / range_max | numeric(4,1) | não | **snapshot** da faixa vigente no momento (padrão 0 / 5) |
| out_of_range | boolean | não | `t < min or t > max` |
| note | text | sim | `nullif(trim(note),'')` |
| recorded_by | uuid → staff | não | `current_staff_id()` |
| recorded_at | timestamptz | não | `now()` |
Índices: `(lodge_id, recorded_at desc)`, `(fridge_id, recorded_at desc)` `M10:49`, `M14:264`. Sem política de UPDATE/DELETE (imutável pela API) 🟢.

### `food_deliveries` (`M10:88-99` + `M14:208` + `M15:127-129,220-221`)
| Coluna | Tipo | Null | Notas |
|---|---|---|---|
| id | uuid PK | não | |
| lodge_id | uuid | não | só Lodges com `has_dinner` (checado no RPC) |
| product | text | não | trim; vazio → `fields_required` |
| supplier | text | não | nome do fornecedor **denormalizado**; atualizado por `update_supplier` `M15:160` |
| supplier_id | uuid → suppliers | **sim** | adicionado em `M15:128`; backfill por nome `M15:129` |
| batch | text | sim (era not null; `M15:127`) | obrigatório conforme `suppliers.require_batch` |
| expiry_date | date | sim (era not null; `M15:127`) | "Best before"; obrigatório conforme `require_best_before` |
| temperature | numeric(4,1) | sim (`M14:208`) | RPC valida [-40, 99]; **sem limite/alerta** (só registro) |
| note | text | sim | |
| received_by | uuid → staff | não | |
| received_at | timestamptz | não | `now()` |
| order_id | uuid → shop_orders | sim | vínculo com pedido (`link_delivery_to_order`) `M15:221` |
Índice `(lodge_id, received_at desc)` `M10:101`.

### `dinner_services` (`M10:135-148`)
`id` PK · `lodge_id` (não null) · `operational_day date` (não null) · `leftovers integer check (>=0)` · `packaged integer check (>=0)` (embalagens: **não** são pessoas atendidas) · `close_note text` · `closed_at timestamptz` · `closed_by → staff` · `edited_at` · `edited_by` · `version int default 1` (trigger `bump_version`: recusa `stale_version` se o cliente enviar versão diferente, `M1:685-697`) · `unique (lodge_id, operational_day)`.

### `dinner_marks` (`M10:150-160`)
`id` PK · `service_id → dinner_services` · `stay_id → stays` · `resident_id → residents` · `served boolean not null` · `marked_by → staff` · `marked_at timestamptz default now()` · `version int default 1` · `unique (service_id, stay_id)`. Índice `dinner_marks_resident_idx (resident_id)`. `grant select` **por coluna**: `(id, service_id, stay_id, resident_id, served, marked_by, version)` — `marked_at` não é legível pelo cliente `M10:494` 🟢.

## Enumerações e constantes de domínio
- `laundry_machines.kind`: `wash | dry` 🟢 (check).
- `handover_entries.kind` inclui `'laundry'` (check redefinido em `M10:5-7` e `M18:5-7`: `note, round, maintenance, warning, laundry, shift`).
- `notifications.kind` gerados por este módulo: `fridge_out_of_range`, `delivery_received`, `delivery_expiring` (audiência `management`; `notifications.audience in ('management','lodge')` `presence:182`).
- `task_templates.auto_key` (text, null): `'fridge_temperature'` é o único valor usado `M10:10-11`.
- Janelas: Dinner 18:00–22:00 do dia operacional (`dinner_stays`, `close_dinner`); dia operacional = 07:00→07:00 Europe/Dublin (`M1:28-47`).

## Parâmetros (tabela `parameters`, vigência por `valid_from`; `param_value` escolhe o mais recente; Lodge específico vence global `M1:133-146`)
| Chave | Valor | Padrão | Validação (`set_system_parameter`) |
|---|---|---|---|
| `fridge.range_celsius` | `{"min":n,"max":n}` | `{"min":0,"max":5}` `seed_structure:56` | objeto numérico; `min >= -30`, `max <= 40`, `min < max` `M30:29-35` |
| `delivery.expiry_alert_days` | inteiro (JSON number; semente `'3'`) | 3 | 0–60 inteiro (patch `M15:165-172`) |
| `records.correction_window_hours` | int | 72 | 1–720 (janela de correção de marca de Dinner por não-gestão) |

## Funções (RPC) e permissões
Todas `revoke ... from public, anon` e `grant execute to authenticated` (`M10:503-520`, `M14:327-328`, `M15:292-299`). Escrita exige `can_write_lodge(lodge)`; leitura `can_see_lodge`. `close_dinner` exige gestão; `add_/rename_/set_*` de geladeira/máquina exigem `structure_guard()` (`M34:4`).

`can_write_lodge` vigente (`M29:19-28`, de `beta_profiles:8-22`): gestão; ou `station` **da própria casa** (`house_scope()`) e Lodge ativo; ou posto aberto (`duty_posts`) Float / do Lodge.

## RLS relevante
- Leitura base: `is_active_staff()` em `fridge_readings`, `food_deliveries`, `dinner_services`, `dinner_marks`, `laundry_machines`, `laundry_uses`, `fridges` (`M10:496-501`, `M14:269`).
- Isolamento por casa (Revisão 8): política **restritiva** `house_scope` `lodge_id is null or can_see_lodge(lodge_id)` criada por varredura em todas as tabelas com coluna `lodge_id` `M29:31-42` (cobre as tabelas acima); `dinner_marks` por pai (`dinner_services`) `M29:56-57`. Conta `station` só vê a própria casa; sem casa definida não vê nada (falha fechada) `M29:1-3`.
- `suppliers` (leitura por equipe ativa, sem `lodge_id`) — ver módulo `compras-e-fornecedores`.

## Relacionamentos
`laundry_uses → laundry_machines/stays/residents/handover_entries/staff` · `fridge_readings → fridges/lodges/staff` · `dinner_marks → dinner_services/stays/residents/staff` · `food_deliveries → suppliers/shop_orders/lodges/staff`. Dinner alimenta `resident_evidence` (módulo `moradores-e-presenca`) e `report_details` métricas `dinner.served`, `laundry.uses`, `temperature.alerts` (módulo `painel-relatorios-e-auditoria`).

## Lacunas 🔴
- Sem DDL de correção/anulação para `fridge_readings`, `food_deliveries`, `dinner_marks` além da janela de 72 h (Dinner).
- `food_deliveries.temperature numeric(4,1)` aceita até 999,9 pela coluna, mas o RPC limita a 99; o mínimo da coluna (-999,9) vs RPC (-40) — a regra efetiva é a do RPC 🟢.
