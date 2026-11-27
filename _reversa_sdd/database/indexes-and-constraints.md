# Índices e constraints — DS Lodge (Data Master)

> Fonte: `supabase/migrations/*.sql` (leitura estática). 🟢 confirmado no DDL · 🟡 inferido · 🔴 lacuna.
> PKs, FKs, UNIQUE e CHECK abaixo foram extraídos do DDL de `CREATE TABLE`/`ALTER TABLE`; índices vêm de `CREATE [UNIQUE] INDEX`.

## 1. Índices explícitos (50 `CREATE INDEX`; 1 recriado) 🟢

Além dos índices implícitos de PK/UNIQUE. Parciais (`WHERE`) fazem o papel de **invariantes de negócio**.

### 1.1 Únicos (invariantes)
| Índice | Tabela(colunas) | Predicado | Regra de negócio |
|---|---|---|---|
| `staff_single_developer` | `staff(role)` | `role = 'developer'` | no máximo uma conta Developer |
| `staff_email_unique` | `staff(lower(email))` | `email is not null` | e-mail único sem caixa |
| `duty_posts_one_per_person` | `duty_posts(staff_id)` | `ended_at is null` | uma pessoa em um posto aberto |
| `duty_posts_one_office_per_lodge` | `duty_posts(lodge_id)` | `function='office' and ended_at is null` | um Office por casa |
| `duty_posts_one_float` | `duty_posts(function)` | `function='float' and ended_at is null` | um Float por vez (cobre as duas casas) |
| `residents_pass_id_unique` | `residents(lower(pass_id))` | `pass_id is not null and pass_id <> ''` | PASS ID único sem caixa |
| `stays_one_open_per_resident` | `stays(resident_id)` | `status <> 'ended'` | morador com uma estadia aberta |
| `stays_one_open_per_bed` | `stays(bed_id)` | `status <> 'ended'` | cama com uma estadia aberta |
| `no_shows_one_per_day` | `no_shows(resident_id, operational_day)` | `status = 'confirmed'` | um No Show confirmado por dia |
| `handover_one_round_per_slot` | `handover_entries(lodge_id, operational_day, round_slot)` | `kind = 'round'` | uma ronda por horário |
| `task_signatures_once` | `task_signatures(coalesce(template_id, extra_id), lodge_id, operational_day, shift, staff_id)` | — | assinatura única por tarefa/turno/pessoa |
| `laundry_one_open_use` | `laundry_uses(machine_id)` | `finished_at is null` | máquina com um uso aberto |
| `products_name_unique` | `products(lower(name))` | — | produto único por nome |
| `shop_items_name_unique` | `shop_items(lower(name))` | `active` | item da lista Tesco único entre ativos |
| `handover_shifts_one_open` | `handover_shifts(lodge_id)` | `closed_at is null and function = 'office'` | um turno Office aberto por casa (recriado na `025`; a versão da `018` sem filtro de função foi dropada) |
| `handover_shifts_one_float` | `handover_shifts(function)` | `closed_at is null and function = 'float'` | um turno Float aberto (`025`) |
| `suppliers_name_unique` | `suppliers(lower(name))` | — | fornecedor único por nome (`037`) |

### 1.2 Não únicos (desempenho)
| Índice | Tabela(colunas) | Uso provável |
|---|---|---|
| `beds_room_idx` | `beds(room_id)` | FK/planta |
| `rooms_lodge_idx` | `rooms(lodge_id)` | FK/planta |
| `parameters_lookup` | `parameters(key, lodge_id, valid_from desc)` | `param_value(key)` |
| `duty_posts_started_idx` | `duty_posts(started_at)` | horas/escala |
| `residents_name_idx` | `residents(lower(last_name), lower(first_name))` | busca por nome |
| `stays_lodge_idx` | `stays(lodge_id, status)` | ocupação por casa |
| `audit_log_record_idx` | `audit_log(table_name, record_id, occurred_at desc)` | histórico de um registro |
| `audit_log_time_idx` | `audit_log(occurred_at desc)` | feed do Audit |
| `audit_log_actor_idx` | `audit_log(actor_staff_id, occurred_at desc)` | `search_audit` por ator (`031`) |
| `audit_log_table_time_idx` | `audit_log(table_name, occurred_at desc)` | `search_audit` por tabela (`031`) |
| `access_log_resident_idx` | `access_log(resident_id, occurred_at desc)` | quem leu o perfil |
| `access_log_actor_idx` | `access_log(actor_staff_id, occurred_at desc)` | `search_access_log` (`031`) |
| `mfa_email_challenges_user_idx` | `mfa_email_challenges(user_id, created_at desc)` | último código |
| `room_check_marks_resident_idx` | `room_check_marks(resident_id)` | evidência por morador |
| `room_check_runs_day_idx` | `room_check_runs(operational_day, lodge_id)` | checks do dia |
| `sightings_resident_idx` | `sightings(resident_id, seen_at)` | evidência manual |
| `absences_stay_idx` | `absences(stay_id)` | ausência ativa |
| `handover_entries_feed_idx` | `handover_entries(lodge_id, occurred_at desc)` | feed do Handover |
| `handover_entries_shift_idx` | `handover_entries(shift_id)` | entradas do turno |
| `handover_entries_filled_by_idx` | `handover_entries(filled_by, occurred_at desc)` | busca por pessoa |
| `handover_mentions_resident_idx` / `_entry_idx` | `handover_mentions(resident_id)` / `(entry_id)` | menções |
| `handover_entry_tags_tag_idx` | `handover_entry_tags(tag_id, entry_id)` | busca por tag |
| `handover_entry_staff_staff_idx` | `handover_entry_staff(staff_id)` | busca por colega citado |
| `handover_shifts_time_idx` | `handover_shifts(lodge_id, opened_at desc)` | histórico de turnos |
| `warnings_resident_idx` | `warnings(resident_id)` | advertências do morador |
| `fridge_readings_lodge_idx` / `_fridge_idx` | `(lodge_id, recorded_at desc)` / `(fridge_id, recorded_at desc)` | leituras |
| `food_deliveries_lodge_idx` | `food_deliveries(lodge_id, received_at desc)` | entregas |
| `dinner_marks_resident_idx` | `dinner_marks(resident_id)` | jantar por morador |
| `purchase_lines_purchase_idx` | `purchase_lines(purchase_id)` | linhas da compra |
| `rota_shifts_time_idx` | `rota_shifts(starts_at, ends_at)` | cobertura/sobreposição |

### 1.3 Lacunas de índice 🟡
FKs sem índice dedicado (candidatas se o volume crescer): `stays(resident_id)` e `stays(bed_id)` são cobertos pelos únicos parciais (só linhas abertas — históricos de um morador não têm índice total), `notifications(lodge_id, ...)`, `work_intervals(staff_id)`, `vacations(staff_id)`, `maintenance_tickets(lodge_id, status)`, `task_signatures(lodge_id, operational_day)`, `product_movements(product_id)`. Não há índice GIN em `jsonb` (`audit_log.old_data/new_data`, `parameters.value`). Estas são observações de leitura estática, sem plano de execução.

## 3. Chaves estrangeiras (133)

| Tabela | Coluna | Referencia | On delete |
|---|---|---|---|
| `rooms` | `lodge_id` | `lodges(id)` | no action (restrito) |
| `beds` | `room_id` | `rooms(id)` | no action (restrito) |
| `staff` | `user_id` | `auth.users(id)` | on delete set null |
| `staff` | `home_lodge_id` | `lodges(id)` | no action (restrito) |
| `parameters` | `lodge_id` | `lodges(id)` | no action (restrito) |
| `duty_posts` | `staff_id` | `staff(id)` | no action (restrito) |
| `duty_posts` | `lodge_id` | `lodges(id)` | no action (restrito) |
| `duty_posts` | `ended_by` | `staff(id)` | no action (restrito) |
| `duty_posts` | `adjusted_by` | `staff(id)` | no action (restrito) |
| `residents` | `created_by` | `staff(id)` | no action (restrito) |
| `stays` | `resident_id` | `residents(id)` | no action (restrito) |
| `stays` | `lodge_id` | `lodges(id)` | no action (restrito) |
| `stays` | `bed_id` | `beds(id)` | no action (restrito) |
| `stays` | `transfer_from_stay_id` | `stays(id)` | no action (restrito) |
| `stays` | `out_decided_by` | `staff(id)` | no action (restrito) |
| `stays` | `ended_by` | `staff(id)` | no action (restrito) |
| `stays` | `created_by` | `staff(id)` | no action (restrito) |
| `access_log` | `resident_id` | `residents(id)` | no action (restrito) |
| `mfa_email_challenges` | `user_id` | `auth.users(id)` | on delete cascade |
| `room_check_runs` | `lodge_id` | `lodges(id)` | no action (restrito) |
| `room_check_runs` | `performed_by` | `staff(id)` | no action (restrito) |
| `room_check_runs` | `entered_by` | `staff(id)` | no action (restrito) |
| `room_check_runs` | `launched_by` | `staff(id)` | no action (restrito) |
| `room_check_marks` | `run_id` | `room_check_runs(id)` | no action (restrito) |
| `room_check_marks` | `stay_id` | `stays(id)` | no action (restrito) |
| `room_check_marks` | `resident_id` | `residents(id)` | no action (restrito) |
| `room_check_marks` | `marked_by` | `staff(id)` | no action (restrito) |
| `sightings` | `resident_id` | `residents(id)` | no action (restrito) |
| `sightings` | `lodge_id` | `lodges(id)` | no action (restrito) |
| `sightings` | `recorded_by` | `staff(id)` | no action (restrito) |
| `absences` | `stay_id` | `stays(id)` | no action (restrito) |
| `absences` | `resident_id` | `residents(id)` | no action (restrito) |
| `absences` | `ended_by` | `staff(id)` | no action (restrito) |
| `absences` | `created_by` | `staff(id)` | no action (restrito) |
| `no_shows` | `resident_id` | `residents(id)` | no action (restrito) |
| `no_shows` | `stay_id` | `stays(id)` | no action (restrito) |
| `no_shows` | `lodge_id` | `lodges(id)` | no action (restrito) |
| `no_shows` | `confirmed_by` | `staff(id)` | no action (restrito) |
| `no_shows` | `undone_by` | `staff(id)` | no action (restrito) |
| `notifications` | `lodge_id` | `lodges(id)` | no action (restrito) |
| `notifications` | `resident_id` | `residents(id)` | no action (restrito) |
| `notification_reads` | `notification_id` | `notifications(id)` | no action (restrito) |
| `notification_reads` | `staff_id` | `staff(id)` | no action (restrito) |
| `handover_entries` | `lodge_id` | `lodges(id)` | no action (restrito) |
| `handover_entries` | `author_id` | `staff(id)` | no action (restrito) |
| `handover_entries` | `voided_by` | `staff(id)` | no action (restrito) |
| `handover_entries` | `filled_by` | `staff(id)` | no action (restrito) |
| `handover_entries` | `shift_id` | `handover_shifts(id)` | no action (restrito) |
| `handover_mentions` | `entry_id` | `handover_entries(id)` | no action (restrito) |
| `handover_mentions` | `resident_id` | `residents(id)` | no action (restrito) |
| `handover_mentions` | `staff_id` | `staff(id)` | no action (restrito) |
| `task_templates` | `lodge_id` | `lodges(id)` | no action (restrito) |
| `task_templates` | `created_by` | `staff(id)` | no action (restrito) |
| `task_extras` | `lodge_id` | `lodges(id)` | no action (restrito) |
| `task_extras` | `staff_id` | `staff(id)` | no action (restrito) |
| `task_extras` | `reassigned_from` | `staff(id)` | no action (restrito) |
| `task_extras` | `created_by` | `staff(id)` | no action (restrito) |
| `task_signatures` | `lodge_id` | `lodges(id)` | no action (restrito) |
| `task_signatures` | `template_id` | `task_templates(id)` | no action (restrito) |
| `task_signatures` | `extra_id` | `task_extras(id)` | no action (restrito) |
| `task_signatures` | `staff_id` | `staff(id)` | no action (restrito) |
| `maintenance_tickets` | `lodge_id` | `lodges(id)` | no action (restrito) |
| `maintenance_tickets` | `handover_entry_id` | `handover_entries(id)` | no action (restrito) |
| `maintenance_tickets` | `created_by` | `staff(id)` | no action (restrito) |
| `maintenance_tickets` | `resolved_by` | `staff(id)` | no action (restrito) |
| `maintenance_events` | `ticket_id` | `maintenance_tickets(id)` | no action (restrito) |
| `maintenance_events` | `staff_id` | `staff(id)` | no action (restrito) |
| `maintenance_reminder_snoozes` | `ticket_id` | `maintenance_tickets(id)` | no action (restrito) |
| `maintenance_reminder_snoozes` | `staff_id` | `staff(id)` | no action (restrito) |
| `warnings` | `resident_id` | `residents(id)` | no action (restrito) |
| `warnings` | `stay_id` | `stays(id)` | no action (restrito) |
| `warnings` | `lodge_id` | `lodges(id)` | no action (restrito) |
| `warnings` | `handover_entry_id` | `handover_entries(id)` | no action (restrito) |
| `warnings` | `issued_by` | `staff(id)` | no action (restrito) |
| `warnings` | `deactivated_by` | `staff(id)` | no action (restrito) |
| `fridge_readings` | `lodge_id` | `lodges(id)` | no action (restrito) |
| `fridge_readings` | `recorded_by` | `staff(id)` | no action (restrito) |
| `fridge_readings` | `fridge_id` | `fridges(id)` | no action (restrito) |
| `food_deliveries` | `lodge_id` | `lodges(id)` | no action (restrito) |
| `food_deliveries` | `received_by` | `staff(id)` | no action (restrito) |
| `food_deliveries` | `supplier_id` | `suppliers(id)` | no action (restrito) |
| `food_deliveries` | `order_id` | `shop_orders(id)` | no action (restrito) |
| `dinner_services` | `lodge_id` | `lodges(id)` | no action (restrito) |
| `dinner_services` | `closed_by` | `staff(id)` | no action (restrito) |
| `dinner_services` | `edited_by` | `staff(id)` | no action (restrito) |
| `dinner_marks` | `service_id` | `dinner_services(id)` | no action (restrito) |
| `dinner_marks` | `stay_id` | `stays(id)` | no action (restrito) |
| `dinner_marks` | `resident_id` | `residents(id)` | no action (restrito) |
| `dinner_marks` | `marked_by` | `staff(id)` | no action (restrito) |
| `laundry_machines` | `lodge_id` | `lodges(id)` | no action (restrito) |
| `laundry_uses` | `machine_id` | `laundry_machines(id)` | no action (restrito) |
| `laundry_uses` | `lodge_id` | `lodges(id)` | no action (restrito) |
| `laundry_uses` | `stay_id` | `stays(id)` | no action (restrito) |
| `laundry_uses` | `resident_id` | `residents(id)` | no action (restrito) |
| `laundry_uses` | `started_by` | `staff(id)` | no action (restrito) |
| `laundry_uses` | `finished_by` | `staff(id)` | no action (restrito) |
| `laundry_uses` | `handover_entry_id` | `handover_entries(id)` | no action (restrito) |
| `purchases` | `created_by` | `staff(id)` | no action (restrito) |
| `purchase_lines` | `purchase_id` | `purchases(id)` | no action (restrito) |
| `purchase_lines` | `product_id` | `products(id)` | no action (restrito) |
| `product_movements` | `product_id` | `products(id)` | no action (restrito) |
| `product_movements` | `purchase_line_id` | `purchase_lines(id)` | no action (restrito) |
| `product_movements` | `from_lodge_id` | `lodges(id)` | no action (restrito) |
| `product_movements` | `to_lodge_id` | `lodges(id)` | no action (restrito) |
| `product_movements` | `created_by` | `staff(id)` | no action (restrito) |
| `rota_shifts` | `staff_id` | `staff(id)` | no action (restrito) |
| `rota_shifts` | `lodge_id` | `lodges(id)` | no action (restrito) |
| `rota_shifts` | `created_by` | `staff(id)` | no action (restrito) |
| `work_intervals` | `staff_id` | `staff(id)` | no action (restrito) |
| `work_intervals` | `lodge_id` | `lodges(id)` | no action (restrito) |
| `work_intervals` | `created_by` | `staff(id)` | no action (restrito) |
| `vacations` | `staff_id` | `staff(id)` | no action (restrito) |
| `vacations` | `created_by` | `staff(id)` | no action (restrito) |
| `fridges` | `lodge_id` | `lodges(id)` | no action (restrito) |
| `shop_orders` | `created_by` | `staff(id)` | no action (restrito) |
| `shop_orders` | `delivered_by` | `staff(id)` | no action (restrito) |
| `shop_orders` | `delivery_id` | `food_deliveries(id)` | no action (restrito) |
| `shop_order_lines` | `order_id` | `shop_orders(id)` | on delete cascade |
| `shop_order_lines` | `item_id` | `shop_items(id)` | no action (restrito) |
| `holiday_locks` | `created_by` | `staff(id)` | no action (restrito) |
| `handover_shifts` | `lodge_id` | `lodges(id)` | no action (restrito) |
| `handover_shifts` | `staff_id` | `staff(id)` | no action (restrito) |
| `handover_shifts` | `opened_by` | `staff(id)` | no action (restrito) |
| `handover_shifts` | `closed_by` | `staff(id)` | no action (restrito) |
| `handover_shifts` | `handed_to` | `staff(id)` | no action (restrito) |
| `handover_shifts` | `rota_shift_id` | `rota_shifts(id)` | no action (restrito) |
| `handover_shifts` | `confirmed_by` | `staff(id)` | no action (restrito) |
| `handover_entry_tags` | `entry_id` | `handover_entries(id)` | on delete cascade |
| `handover_entry_tags` | `tag_id` | `handover_tags(id)` | no action (restrito) |
| `push_prefs` | `staff_id` | `staff(id)` | no action (restrito) |
| `push_subscriptions` | `staff_id` | `staff(id)` | no action (restrito) |
| `handover_entry_staff` | `entry_id` | `handover_entries(id)` | on delete cascade |
| `handover_entry_staff` | `staff_id` | `staff(id)` | no action (restrito) |

## 4. UNIQUE e PK compostas por tabela (inline/constraint)

| Tabela | Definição |
|---|---|
| `lodges` | `(code)` |
| `rooms` | `(lodge_id, kind, code)` |
| `beds` | `(room_id, number)` |
| `staff` | `(user_id)` |
| `room_check_runs` | `(lodge_id, operational_day, slot)` |
| `room_check_marks` | `(run_id, stay_id)` |
| `notification_reads` | `PK primary key (notification_id, staff_id)` |
| `maintenance_tickets` | `(request_key)` |
| `maintenance_reminder_snoozes` | `PK primary key (ticket_id, staff_id)` |
| `dinner_services` | `(lodge_id, operational_day)` |
| `dinner_marks` | `(service_id, stay_id)` |
| `laundry_machines` | `(lodge_id, code)` |
| `fridges` | `(lodge_id, code)` |
| `shop_order_lines` | `(order_id, item_id)` |
| `handover_tags` | `(code)` |
| `handover_entry_tags` | `PK primary key (entry_id, tag_id)` |
| `push_prefs` | `PK primary key (staff_id, key)` |
| `push_subscriptions` | `(endpoint)` |
| `handover_entry_staff` | `(entry_id, staff_id)` |
| `handover_entry_staff` | `(entry_id, position)` |

## 5. CHECK (76)

| Tabela | Coluna / escopo | Regra |
|---|---|---|
| `lodges` | `code` | `(code ~ '^[A-Z_]+$')` |
| `rooms` | `code` | `(length(trim(code)) > 0)` |
| `beds` | `number` | `(number > 0)` |
| `staff` | `full_name` | `(length(trim(full_name)) > 0)` |
| `staff` | `(tabela)` | `(role <> 'cleaner' or user_id is null)` |
| `staff` | `(alter 033)` | `staff_home_only_station check (home_lodge_id is null or role = 'station')` |
| `parameters` | `key` | `(key ~ '^[a-z0-9_.]+$')` |
| `duty_posts` | `end_reason` | `(end_reason in ('ended', 'taken_over', 'deactivated', 'switched'))` |
| `duty_posts` | `(tabela)` | `((function = 'office') = (lodge_id is not null))` |
| `duty_posts` | `(tabela)` | `(ended_at is null or ended_at >= started_at)` |
| `residents` | `first_name` | `(length(trim(first_name)) > 0)` |
| `stays` | `(tabela)` | `((status = 'ended') = (ended_at is not null))` |
| `stays` | `(tabela)` | `(ended_at is null or ended_at >= admitted_at)` |
| `room_check_runs` | `slot` | `(slot ~ '^([01]\d\|2[0-3]):[0-5]\d$')` |
| `room_check_runs` | `(tabela)` | `ed_at timestamptz not null` |
| `absences` | `(tabela)` | `(expected_return_at > starts_at)` |
| `absences` | `(tabela)` | `(ended_at is null or ended_at >= starts_at)` |
| `notifications` | `audience` | `(audience in ('management', 'lodge'))` |
| `handover_entries` | `kind` | `(kind in ('note', 'round', 'maintenance', 'warning'))` |
| `handover_entries` | `body` | `(length(trim(body)) > 0)` |
| `handover_entries` | `status` | `(status in ('active', 'voided'))` |
| `handover_entries` | `(tabela)` | `((kind = 'round') = (round_slot is not null))` |
| `handover_entries` | `(alter 010)` | `handover_entries_kind_check check (kind in ('note', 'round', 'maintenance', 'warning', 'laundry'))` |
| `handover_entries` | `(alter 018)` | `handover_entries_kind_check check (kind in ('note', 'round', 'maintenance', 'warning', 'laundry', 'shift'))` |
| `handover_mentions` | `(tabela)` | `((resident_id is null) <> (staff_id is null))` |
| `task_templates` | `shift` | `(shift in ('day', 'night'))` |
| `task_extras` | `shift` | `(shift in ('day', 'night'))` |
| `task_extras` | `title` | `(length(trim(title)) > 0)` |
| `task_signatures` | `shift` | `(shift in ('day', 'night'))` |
| `task_signatures` | `(tabela)` | `((template_id is null) <> (extra_id is null))` |
| `maintenance_tickets` | `location` | `(length(trim(location)) > 0)` |
| `maintenance_tickets` | `description` | `(length(trim(description)) > 0)` |
| `maintenance_tickets` | `priority` | `(priority in ('urgent', 'normal', 'low'))` |
| `maintenance_tickets` | `status` | `(status in ('open', 'in_progress', 'on_hold', 'resolved', 'reopened'))` |
| `maintenance_events` | `kind` | `(kind in ('created', 'status', 'deadline', 'note'))` |
| `warnings` | `type` | `(type in ('verbal', 'written', 'final_written'))` |
| `warnings` | `(alter 037)` | `warnings_type_check check (type in ('warning', 'final_warning'))` |
| `dinner_services` | `leftovers` | `(leftovers >= 0)` |
| `dinner_services` | `packaged` | `(packaged >= 0)` |
| `laundry_machines` | `kind` | `(kind in ('wash', 'dry'))` |
| `products` | `name` | `(length(trim(name)) > 0)` |
| `purchases` | `supplier` | `(length(trim(supplier)) > 0)` |
| `purchase_lines` | `quantity` | `(quantity > 0)` |
| `purchase_lines` | `unit_price` | `(unit_price >= 0)` |
| `product_movements` | `kind` | `(kind in ('allocation', 'transfer'))` |
| `product_movements` | `quantity` | `(quantity > 0)` |
| `product_movements` | `(tabela)` | `((kind = 'transfer') = (from_lodge_id is not null))` |
| `rota_shifts` | `function` | `(function in ('office', 'float', 'cleaner', 'manager'))` |
| `rota_shifts` | `status` | `(status in ('draft', 'published', 'cancelled'))` |
| `rota_shifts` | `(tabela)` | `(ends_at > starts_at)` |
| `rota_shifts` | `(tabela)` | `((function = 'float') = (lodge_id is null))` |
| `work_intervals` | `(tabela)` | `(ends_at > starts_at)` |
| `vacations` | `status` | `(status in ('active', 'cancelled'))` |
| `vacations` | `(tabela)` | `(ends_on >= starts_on)` |
| `vacations` | `(alter 017)` | `vacations_status_check check (status in ('under_review', 'approved', 'cancelled'))` |
| `fridges` | `code` | `(length(trim(code)) > 0)` |
| `fridges` | `name` | `(length(trim(name)) > 0)` |
| `shop_items` | `category` | `(length(trim(category)) > 0)` |
| `shop_items` | `name` | `(length(trim(name)) > 0)` |
| `shop_items` | `default_qty` | `(default_qty between 0 and 999)` |
| `shop_items` | `default_action` | `(default_action in ('buy', 'dont_buy'))` |
| `shop_items` | `tesco_url` | `(tesco_url is null or tesco_url ~ '^https://')` |
| `shop_orders` | `status` | `(status in ('draft', 'placed'))` |
| `shop_orders` | `(alter 037)` | `shop_orders_status_check check (status in ('created', 'placed', 'awaiting', 'delivered'))` |
| `shop_order_lines` | `standard_qty` | `(standard_qty >= 0)` |
| `shop_order_lines` | `action` | `(action in ('standard', 'more', 'less', 'dont'))` |
| `shop_order_lines` | `delta` | `(delta between 0 and 999)` |
| `shop_order_lines` | `unit_price` | `(unit_price is null or unit_price between 0 and 99999)` |
| `holiday_locks` | `(tabela)` | `(ends_on >= starts_on)` |
| `handover_shifts` | `hours_status` | `(hours_status in ('open', 'pending', 'confirmed'))` |
| `handover_shifts` | `(tabela)` | `(closed_at is null or closed_at >= opened_at)` |
| `handover_tags` | `code` | `(code ~ '^[a-z_]+$')` |
| `push_prefs` | `key` | `(key ~ '^(tag:[a-z_]+\|maintenance:(urgent\|normal\|low)\|warning\|shift_hours_review\|fridge_out_of_range)$')` |
| `push_subscriptions` | `endpoint` | `(endpoint ~ '^https://')` |
| `handover_entry_staff` | `position` | `(position between 1 and 3)` |
| `suppliers` | `name` | `(length(trim(name)) > 0 and char_length(name) <= 40)` |

## 6. Invariantes impostas por trigger/função (não por constraint) 🟢

| Regra | Onde | Erro |
|---|---|---|
| Versão otimista: `NEW.version` deve igual a `OLD.version`; incrementa | `bump_version()` (18 tabelas) | `stale_version` (40001) |
| Auditoria imutável | `audit_immutable()` em `audit_log` e `access_log` | `audit_log_is_immutable` (42501) |
| Cama pertence à casa da estadia; no INSERT, cama `in_use` e ativa em quarto ativo | `stays_check_bed()` (001, 035) | `bed_not_in_lodge`, `bed_out_of_service` (23514) |
| Desativar pessoa carimba `deactivated_at/by` e encerra posto aberto (`end_reason='deactivated'`); reativar limpa | `staff_on_deactivate()` | — |
| Copia `staff.locale` para `auth.users.raw_user_meta_data.locale` (AFTER INSERT/UPDATE OF locale, user_id) | `staff_sync_locale()` | — |
| Futuro bloqueado (+5 min) | funções de escrita | `in_future`, `invalid_time`, `admitted_in_future` |
| Intervalos limitados (≤62 dias) / mês / período | `check_range`, `check_month`, `check_period` (013, 017) | `invalid_range`, `range_too_large`, `invalid_month` (22023) |
| Data de vigência de parâmetro | policy `parameters_insert`: `valid_from >= now() - 1 min` | RLS |
