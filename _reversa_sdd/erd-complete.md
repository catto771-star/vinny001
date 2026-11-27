# ERD completo — DS Lodge

> Arquiteto Reversa · doc_level=completo · fonte: `supabase/migrations/*.sql` (38 migrações, 53 tabelas em `public`, mais `auth.users` do Supabase).
> Escala: 🟢 confirmado no SQL · 🟡 inferido · 🔴 lacuna. Atributos limitados aos principais (PK, FK, campos de negócio, `version` de concorrência otimista).
> Mudanças por `ALTER TABLE` posteriores estão incorporadas (ex.: `fridge_readings.fridge_id`, `food_deliveries.supplier_id/order_id`, `handover_entries.shift_id/filled_by`, `rota_shifts.planned_*`, `handover_tags.color`, `shop_orders.delivered_*`).

## 1. Estrutura física e pessoas

```mermaid
erDiagram
    AUTH_USERS ||--o| STAFF : "user_id (1:0..1)"
    LODGES ||--o{ ROOMS : "lodge_id"
    ROOMS ||--o{ BEDS : "room_id"
    LODGES ||--o{ STAFF : "home_lodge_id"
    STAFF ||--o{ DUTY_POSTS : "staff_id"
    LODGES ||--o{ DUTY_POSTS : "lodge_id (office)"
    LODGES ||--o{ PARAMETERS : "lodge_id (nulo = global)"
    AUTH_USERS ||--o{ MFA_EMAIL_CHALLENGES : "user_id"

    AUTH_USERS {
        uuid id PK
        text email
    }
    LODGES {
        uuid id PK
        text code UK
        text name
        text short_name
        bool has_dinner
        bool has_laundry
        bool active
    }
    ROOMS {
        uuid id PK
        uuid lodge_id FK
        enum kind
        text code
        int sort_order
        bool active
    }
    BEDS {
        uuid id PK
        uuid room_id FK
        int number
        enum status
        bool active
        int version
    }
    STAFF {
        uuid id PK
        uuid user_id FK_UK
        text full_name
        text display_name
        enum role
        enum locale
        uuid home_lodge_id FK
        bool active
        bool must_change_password
        int version
    }
    DUTY_POSTS {
        uuid id PK
        uuid staff_id FK
        enum function
        uuid lodge_id FK
        timestamptz started_at
        timestamptz ended_at
        text end_reason
    }
    PARAMETERS {
        bigint id PK
        text key
        uuid lodge_id FK
        jsonb value
        timestamptz valid_from
    }
    MFA_EMAIL_CHALLENGES {
        bigint id PK
        uuid user_id FK
        timestamptz created_at
    }
```

Notas 🟢: `staff.role` inclui station/porter/cleaner/manager/owner/developer (`check (role <> 'cleaner' or user_id is null)` — Cleaner não tem login). `parameters` é um histórico versionado por `valid_from` (a leitura usa `param_value(key)`), sem FK para `staff` em `created_by`. `mfa_email_challenges` não é exposta a `anon/authenticated` (RLS ligado, privilégios revogados).

## 2. Moradores, estadias e presença

```mermaid
erDiagram
    RESIDENTS ||--o{ STAYS : "resident_id"
    LODGES ||--o{ STAYS : "lodge_id"
    BEDS ||--o{ STAYS : "bed_id"
    STAYS ||--o| STAYS : "transfer_from_stay_id"
    STAYS ||--o{ ABSENCES : "stay_id"
    RESIDENTS ||--o{ ABSENCES : "resident_id"
    STAYS ||--o{ NO_SHOWS : "stay_id"
    RESIDENTS ||--o{ NO_SHOWS : "resident_id"
    LODGES ||--o{ NO_SHOWS : "lodge_id"
    LODGES ||--o{ ROOM_CHECK_RUNS : "lodge_id"
    ROOM_CHECK_RUNS ||--o{ ROOM_CHECK_MARKS : "run_id"
    STAYS ||--o{ ROOM_CHECK_MARKS : "stay_id"
    RESIDENTS ||--o{ ROOM_CHECK_MARKS : "resident_id"
    RESIDENTS ||--o{ SIGHTINGS : "resident_id"
    LODGES ||--o{ SIGHTINGS : "lodge_id"
    RESIDENTS ||--o{ ACCESS_LOG : "resident_id"
    STAFF ||--o{ STAYS : "created_by / ended_by / out_decided_by"
    STAFF ||--o{ ROOM_CHECK_RUNS : "performed_by / entered_by"
    STAFF ||--o{ SIGHTINGS : "recorded_by"

    RESIDENTS {
        uuid id PK
        text pass_id
        text first_name
        text last_name
        date date_of_birth
        bool is_demo
        int version
    }
    STAYS {
        uuid id PK
        uuid resident_id FK
        uuid lodge_id FK
        uuid bed_id FK
        timestamptz admitted_at
        enum status
        uuid transfer_from_stay_id FK
        timestamptz out_decided_at
        timestamptz ended_at
        enum end_reason
        int version
    }
    ROOM_CHECK_RUNS {
        uuid id PK
        uuid lodge_id FK
        date operational_day
        text slot
        timestamptz checked_at
        uuid performed_by FK
        uuid entered_by FK
        timestamptz entered_at
        enum status
        text sheet_number
        int version
    }
    ROOM_CHECK_MARKS {
        uuid id PK
        uuid run_id FK
        uuid stay_id FK
        uuid resident_id FK
        enum result
        uuid marked_by FK
        int version
    }
    SIGHTINGS {
        uuid id PK
        uuid resident_id FK
        uuid lodge_id FK
        timestamptz seen_at
        text place
        uuid recorded_by FK
    }
    ABSENCES {
        uuid id PK
        uuid stay_id FK
        uuid resident_id FK
        timestamptz starts_at
        timestamptz expected_return_at
        timestamptz ended_at
        int version
    }
    NO_SHOWS {
        uuid id PK
        uuid resident_id FK
        uuid stay_id FK
        uuid lodge_id FK
        date operational_day
        enum status
        uuid confirmed_by FK
        uuid undone_by FK
        int version
    }
    ACCESS_LOG {
        bigint id PK
        timestamptz occurred_at
        uuid actor_staff_id
        uuid resident_id FK
        text context
    }
```

Notas 🟢: `unique (lodge_id, operational_day, slot)` em `room_check_runs`; `unique (run_id, stay_id)` em `room_check_marks`; `performed_by` ≠ `entered_by` é rastreado (coluna gerada `performed_reported_by_entrant`). `no_shows` guarda `undo_reason`. `access_log` registra leituras de perfil (RPC `open_resident_profile`), sem UPDATE.

## 3. Ocorrências, passagem de turno, manutenção e avisos

```mermaid
erDiagram
    LODGES ||--o{ HANDOVER_SHIFTS : "lodge_id"
    STAFF ||--o{ HANDOVER_SHIFTS : "staff_id / opened_by / closed_by / handed_to"
    ROTA_SHIFTS ||--o{ HANDOVER_SHIFTS : "rota_shift_id"
    HANDOVER_SHIFTS ||--o{ HANDOVER_ENTRIES : "shift_id"
    LODGES ||--o{ HANDOVER_ENTRIES : "lodge_id"
    STAFF ||--o{ HANDOVER_ENTRIES : "author_id / filled_by"
    HANDOVER_ENTRIES ||--o{ HANDOVER_MENTIONS : "entry_id"
    RESIDENTS ||--o{ HANDOVER_MENTIONS : "resident_id (xor staff_id)"
    STAFF ||--o{ HANDOVER_MENTIONS : "staff_id (xor resident_id)"
    HANDOVER_ENTRIES ||--o{ HANDOVER_ENTRY_TAGS : "entry_id"
    HANDOVER_TAGS ||--o{ HANDOVER_ENTRY_TAGS : "tag_id"
    HANDOVER_ENTRIES ||--o{ HANDOVER_ENTRY_STAFF : "entry_id (coautores, pos 1..3)"
    STAFF ||--o{ HANDOVER_ENTRY_STAFF : "staff_id"
    LODGES ||--o{ MAINTENANCE_TICKETS : "lodge_id"
    HANDOVER_ENTRIES ||--o| MAINTENANCE_TICKETS : "handover_entry_id"
    MAINTENANCE_TICKETS ||--o{ MAINTENANCE_EVENTS : "ticket_id"
    MAINTENANCE_TICKETS ||--o{ MAINTENANCE_REMINDER_SNOOZES : "ticket_id"
    STAFF ||--o{ MAINTENANCE_REMINDER_SNOOZES : "staff_id"
    RESIDENTS ||--o{ WARNINGS : "resident_id"
    STAYS ||--o{ WARNINGS : "stay_id"
    LODGES ||--o{ WARNINGS : "lodge_id"
    HANDOVER_ENTRIES ||--o| WARNINGS : "handover_entry_id"
    LODGES ||--o{ TASK_TEMPLATES : "lodge_id"
    LODGES ||--o{ TASK_EXTRAS : "lodge_id"
    TASK_TEMPLATES ||--o{ TASK_SIGNATURES : "template_id (xor extra_id)"
    TASK_EXTRAS ||--o{ TASK_SIGNATURES : "extra_id (xor template_id)"
    STAFF ||--o{ TASK_SIGNATURES : "staff_id"
    LODGES ||--o{ QUICK_PHRASES : "global (sem lodge)"

    HANDOVER_SHIFTS {
        uuid id PK
        uuid lodge_id FK
        uuid staff_id FK
        text function
        timestamptz opened_at
        timestamptz closed_at
        uuid handed_to FK
        uuid rota_shift_id FK
        text hours_status
        timestamptz confirmed_start
        timestamptz confirmed_end
        uuid confirmed_by FK
    }
    HANDOVER_ENTRIES {
        uuid id PK
        uuid lodge_id FK
        text kind
        text body
        timestamptz occurred_at
        date operational_day
        text round_slot
        uuid author_id FK
        uuid filled_by FK
        uuid shift_id FK
        text status
        text late_reason
        int version
    }
    HANDOVER_MENTIONS {
        bigint id PK
        uuid entry_id FK
        uuid resident_id FK
        uuid staff_id FK
    }
    HANDOVER_TAGS {
        uuid id PK
        text code UK
        text label
        bool visible
        bool notify_default
        text color
    }
    HANDOVER_ENTRY_TAGS {
        uuid entry_id PK_FK
        uuid tag_id PK_FK
    }
    HANDOVER_ENTRY_STAFF {
        uuid id PK
        uuid entry_id FK
        uuid staff_id FK
        smallint position
    }
    QUICK_PHRASES {
        uuid id PK
        jsonb text
        int sort_order
        bool active
    }
    MAINTENANCE_TICKETS {
        uuid id PK
        uuid lodge_id FK
        text location
        text priority
        text status
        timestamptz deadline_at
        uuid request_key UK
        uuid handover_entry_id FK
        int version
    }
    MAINTENANCE_EVENTS {
        bigint id PK
        uuid ticket_id FK
        text kind
        text from_value
        text to_value
        uuid staff_id FK
    }
    MAINTENANCE_REMINDER_SNOOZES {
        uuid ticket_id PK_FK
        uuid staff_id PK_FK
        timestamptz snoozed_at
    }
    WARNINGS {
        uuid id PK
        uuid resident_id FK
        uuid stay_id FK
        uuid lodge_id FK
        text type
        uuid handover_entry_id FK
        bool active
        int version
    }
    TASK_TEMPLATES {
        uuid id PK
        uuid lodge_id FK
        text shift
        int_array weekdays
        jsonb title
        text auto_key
        bool active
        int version
    }
    TASK_EXTRAS {
        uuid id PK
        uuid lodge_id FK
        date operational_day
        text shift
        uuid staff_id FK
        text title
        timestamptz due_at
    }
    TASK_SIGNATURES {
        uuid id PK
        uuid lodge_id FK
        date operational_day
        text shift
        uuid template_id FK
        uuid extra_id FK
        uuid staff_id FK
        text duty_function
        timestamptz signed_at
    }
```

Nota 🟡: `quick_phrases` não tem FK; é catálogo global trilíngue (`text jsonb`). Os ids de menções (`handover_mentions`) usam XOR (`resident_id` ou `staff_id`) via CHECK 🟢.

## 4. Serviços da casa (geladeira, entregas, jantar, lavanderia)

```mermaid
erDiagram
    LODGES ||--o{ FRIDGES : "lodge_id"
    FRIDGES ||--o{ FRIDGE_READINGS : "fridge_id"
    LODGES ||--o{ FRIDGE_READINGS : "lodge_id"
    LODGES ||--o{ FOOD_DELIVERIES : "lodge_id"
    SUPPLIERS ||--o{ FOOD_DELIVERIES : "supplier_id"
    SHOP_ORDERS ||--o{ FOOD_DELIVERIES : "order_id"
    LODGES ||--o{ DINNER_SERVICES : "lodge_id"
    DINNER_SERVICES ||--o{ DINNER_MARKS : "service_id"
    STAYS ||--o{ DINNER_MARKS : "stay_id"
    RESIDENTS ||--o{ DINNER_MARKS : "resident_id"
    LODGES ||--o{ LAUNDRY_MACHINES : "lodge_id"
    LAUNDRY_MACHINES ||--o{ LAUNDRY_USES : "machine_id"
    STAYS ||--o{ LAUNDRY_USES : "stay_id"
    RESIDENTS ||--o{ LAUNDRY_USES : "resident_id"
    HANDOVER_ENTRIES ||--o{ LAUNDRY_USES : "handover_entry_id"

    FRIDGES {
        uuid id PK
        uuid lodge_id FK
        text code
        text name
        bool active
    }
    FRIDGE_READINGS {
        uuid id PK
        uuid lodge_id FK
        uuid fridge_id FK
        numeric temperature
        numeric range_min
        numeric range_max
        bool out_of_range
        uuid recorded_by FK
    }
    SUPPLIERS {
        uuid id PK
        text name
        bool require_batch
        bool require_best_before
        bool require_temperature
        bool links_order
        bool active
        int version
    }
    FOOD_DELIVERIES {
        uuid id PK
        uuid lodge_id FK
        uuid supplier_id FK
        uuid order_id FK
        text product
        text supplier
        text batch
        date expiry_date
        numeric temperature
        uuid received_by FK
        timestamptz received_at
    }
    DINNER_SERVICES {
        uuid id PK
        uuid lodge_id FK
        date operational_day
        int leftovers
        int packaged
        timestamptz closed_at
        uuid closed_by FK
        int version
    }
    DINNER_MARKS {
        uuid id PK
        uuid service_id FK
        uuid stay_id FK
        uuid resident_id FK
        bool served
        uuid marked_by FK
        int version
    }
    LAUNDRY_MACHINES {
        uuid id PK
        uuid lodge_id FK
        text code
        text label
        text kind
        bool active
    }
    LAUNDRY_USES {
        uuid id PK
        uuid machine_id FK
        uuid lodge_id FK
        uuid stay_id FK
        uuid resident_id FK
        timestamptz started_at
        timestamptz finished_at
        uuid handover_entry_id FK
    }
```

Nota 🟢: `food_deliveries.supplier` (texto) coexiste com `supplier_id` (FK) — texto histórico copiado no registro (ver questions.md). Faixa da geladeira é copiada em cada leitura (`range_min/max`), por isso a leitura é autocontida.

## 5. Compras, equipe, escala e horas

```mermaid
erDiagram
    SHOP_ITEMS ||--o{ SHOP_ORDER_LINES : "item_id"
    SHOP_ORDERS ||--o{ SHOP_ORDER_LINES : "order_id (cascade)"
    STAFF ||--o{ SHOP_ORDERS : "created_by / delivered_by"
    PRODUCTS ||--o{ PURCHASE_LINES : "product_id (legado)"
    PURCHASES ||--o{ PURCHASE_LINES : "purchase_id (legado)"
    PRODUCTS ||--o{ PRODUCT_MOVEMENTS : "product_id (legado)"
    PURCHASE_LINES ||--o{ PRODUCT_MOVEMENTS : "purchase_line_id (legado)"
    LODGES ||--o{ PRODUCT_MOVEMENTS : "from_lodge_id / to_lodge_id (legado)"
    STAFF ||--o{ ROTA_SHIFTS : "staff_id"
    LODGES ||--o{ ROTA_SHIFTS : "lodge_id (nulo se float)"
    STAFF ||--o{ WORK_INTERVALS : "staff_id"
    LODGES ||--o{ WORK_INTERVALS : "lodge_id"
    STAFF ||--o{ VACATIONS : "staff_id"
    STAFF ||--o{ HOLIDAY_LOCKS : "created_by"
    STAFF ||--o{ PUSH_SUBSCRIPTIONS : "staff_id"
    STAFF ||--o{ PUSH_PREFS : "staff_id"
    NOTIFICATIONS ||--o{ NOTIFICATION_READS : "notification_id"
    STAFF ||--o{ NOTIFICATION_READS : "staff_id"
    LODGES ||--o{ NOTIFICATIONS : "lodge_id"
    RESIDENTS ||--o{ NOTIFICATIONS : "resident_id"

    SHOP_ITEMS {
        uuid id PK
        text category
        text name
        int default_qty
        text default_action
        text tesco_url
        bool active
        int version
    }
    SHOP_ORDERS {
        uuid id PK
        date delivery_date
        text status
        timestamptz placed_at
        timestamptz delivered_at
        uuid created_by FK
    }
    SHOP_ORDER_LINES {
        uuid id PK
        uuid order_id FK
        uuid item_id FK
        int standard_qty
        text action
        int delta
        int final_qty "gerada"
        numeric unit_price
    }
    PRODUCTS {
        uuid id PK
        text name
        text unit
        bool active
    }
    PURCHASES {
        uuid id PK
        text supplier
        date purchased_on
        text document_ref
        uuid created_by FK
    }
    PURCHASE_LINES {
        uuid id PK
        uuid purchase_id FK
        uuid product_id FK
        numeric quantity
        numeric unit_price
        numeric line_total "gerada"
    }
    PRODUCT_MOVEMENTS {
        uuid id PK
        text kind
        uuid product_id FK
        uuid purchase_line_id FK
        uuid from_lodge_id FK
        uuid to_lodge_id FK
        numeric quantity
    }
    ROTA_SHIFTS {
        uuid id PK
        uuid staff_id FK
        uuid lodge_id FK
        text function
        timestamptz starts_at
        timestamptz ends_at
        timestamptz planned_starts_at
        timestamptz planned_ends_at
        text status
        int version
    }
    WORK_INTERVALS {
        uuid id PK
        uuid staff_id FK
        uuid lodge_id FK
        timestamptz starts_at
        timestamptz ends_at
        int version
    }
    VACATIONS {
        uuid id PK
        uuid staff_id FK
        date starts_on
        date ends_on
        text status
    }
    HOLIDAY_LOCKS {
        uuid id PK
        date starts_on
        date ends_on
        bool active
    }
    NOTIFICATIONS {
        bigint id PK
        text kind
        text audience
        uuid lodge_id FK
        uuid resident_id FK
        jsonb payload
    }
    NOTIFICATION_READS {
        bigint notification_id PK_FK
        uuid staff_id PK_FK
        timestamptz read_at
    }
    PUSH_SUBSCRIPTIONS {
        uuid id PK
        uuid staff_id FK
        text endpoint UK
        text p256dh
        text auth
        timestamptz last_used_at
    }
    PUSH_PREFS {
        uuid staff_id PK_FK
        text key PK
        bool enabled
    }
    AUDIT_LOG {
        bigint id PK
        timestamptz occurred_at
        uuid actor_user_id
        uuid actor_staff_id
        text action
        text table_name
        text record_id
        jsonb old_data
        jsonb new_data
    }
```

Notas 🟢: o modelo `products/purchases/purchase_lines/product_movements` é **legado** (sem chamadas em `src/`; ver questions.md); o fluxo vivo é `shop_items → shop_orders → shop_order_lines`. `audit_log` não tem FKs (propositalmente genérico: `table_name` + `record_id` texto) e é imutável (trigger `audit_immutable`).

## 6. Inventário das 53 tabelas por domínio

| Domínio | Tabelas |
|---|---|
| Estrutura/identidade (8) | lodges, rooms, beds, staff, duty_posts, parameters, mfa_email_challenges, audit_log |
| Moradores/presença (9) | residents, stays, access_log, room_check_runs, room_check_marks, sightings, absences, no_shows, warnings |
| Ocorrências/tarefas (14) | handover_shifts, handover_entries, handover_mentions, handover_tags, handover_entry_tags, handover_entry_staff, quick_phrases, maintenance_tickets, maintenance_events, maintenance_reminder_snoozes, task_templates, task_extras, task_signatures, notifications |
| Serviços (8) | fridges, fridge_readings, food_deliveries, dinner_services, dinner_marks, laundry_machines, laundry_uses, suppliers |
| Compras (7) | shop_items, shop_orders, shop_order_lines, products*, purchases*, purchase_lines*, product_movements* (*legado) |
| Equipe/escala (4) | rota_shifts, work_intervals, vacations, holiday_locks |
| Notificações/push (3) | notification_reads, push_subscriptions, push_prefs |

(`notifications` aparece em Ocorrências por ser gerada pelas RPCs dessas telas; contagem total de tabelas únicas = 53 🟢.)
