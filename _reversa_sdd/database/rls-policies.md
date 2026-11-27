# RLS, privilégios e autorização — DS Lodge (Data Master)

> Fonte: `supabase/migrations/*.sql`. 🟢 confirmado · 🟡 inferido · 🔴 lacuna. Contagem: 77 `CREATE POLICY` literais + 1 laço `DO` (migr. 029) que cria `house_scope` nas tabelas com `lodge_id`.
> Cuidado de leitura: `can_write_lodge`, `no_show_review` e muitas funções foram redefinidas em **MAIÚSCULAS** (`CREATE OR REPLACE FUNCTION`, migr. 029/032) e os blocos `DO` da migr. 037 reescrevem funções via `pg_get_functiondef`; use `grep -i` e leia a migração mais recente.

## 1. Modelo de defesa em camadas 🟢

1. **Privilégios de tabela** (`GRANT`): `anon` sem nada (`revoke all on all tables ... from anon, authenticated` na `004`; `server_now()` é a única função liberada a `anon`). `authenticated` recebe apenas `SELECT` (muitas vezes só colunas) e `INSERT/UPDATE` em poucas tabelas de cadastro. **Nenhum DELETE/TRUNCATE** concedido a ninguém.
2. **RLS** habilitado nas 53 tabelas. As políticas de leitura quase sempre são `is_active_staff()`; cadastros (insert/update) por `is_management()`.
3. **Escrita de negócio só por RPC `SECURITY DEFINER`** (`set search_path = public`) que revalida papel, casa e janela de tempo. `alter default privileges ... revoke execute on functions from public/anon/authenticated`: função nova nasce sem EXECUTE; cada migração concede `GRANT EXECUTE ... TO authenticated` explícito (ver `functions-and-triggers.md`).
4. **Isolamento por casa** (`house_scope`, migr. 029): políticas `AS RESTRICTIVE FOR SELECT` somam-se às permissivas (E lógico).

## 2. Funções-chave de autorização 🟢

| Função | Definição | Notas |
|---|---|---|
| `current_staff_id()` | `staff.id` onde `user_id = auth.uid()` **e** `active` | null = sem equipe ativa |
| `current_staff_role()` | `staff.role` do mesmo registro | |
| `is_active_staff()` | `current_staff_id() is not null` | base da leitura |
| `is_management()` | role ∈ {manager, owner, developer} **e** `mfa_satisfied()` | |
| `mfa_satisfied()` (001→005) | true se role fora da gestão, **ou** parâmetro `security.require_mfa_management` = false, **ou** existe `mfa_email_challenges` do usuário criado ±(-15 min,+1 min) em torno do instante de login por OTP/magiclink (`email_code_session_at()` lê `amr` do JWT) | substitui o AAL2/QR da 001 |
| `has_open_post()` | existe `duty_posts` aberto da pessoa | |
| `house_scope()` (029) | para `station`: `staff.home_lodge_id`; demais: null | |
| `can_see_lodge(l)` (029) | `auth.uid() is null` (contexto interno/migração) **ou** (`is_active_staff()` e (role≠station ou `l` = `house_scope()`)) | station sem casa → não vê nada (falha fechada) |
| `can_write_lodge(l)` (001→016→029) | `is_management()` **ou** (station na própria casa ativa) **ou** posto aberto (`float` qualquer casa; `office` na casa) | usado nas RPCs de escrita |

## 3. Políticas por tabela 🟢

Legenda: **A** = `is_active_staff()`; **G** = `is_management()`; **HS** = `house_scope` restritiva (SELECT) ativa; **RPC** = escrita só por função definer (sem INSERT/UPDATE/DELETE direto).

| Tabela | SELECT | INSERT | UPDATE | HS | Colunas visíveis / observações |
|---|---|---|---|---|---|
| `lodges` | A (`lodges_read`) | G | G | sim (`can_see_lodge(id)`) | |
| `rooms` | A | G | G | sim (lodge_id) | escrita real via `add_room`, `rename_room`, `set_room_active` (034) |
| `beds` | A | G | G | sim (via `rooms`) | `add_bed`, `set_bed_active` |
| `staff` | A | G e `role <> 'developer'` | G e (`role <> 'developer'` ou chamador developer) | não | todos veem colegas; Developer não é criado pelo app |
| `parameters` | A | G e `valid_from >= now() - 1 min` | — (histórico imutável) | sim (lodge_id nulo = global passa) | nova vigência, sem UPDATE |
| `duty_posts` | A | RPC | RPC | sim | `assume_post`, `end_my_post` |
| `residents` | A | RPC (`admit_resident`) | G ou `has_open_post()` | sim (sem estadia **ou** estadia numa casa visível) | |
| `stays` | A | RPC | RPC | sim | |
| `audit_log` | G | trigger | proibido (`audit_immutable`) | — | só gestão |
| `access_log` | G | RPC (`open_resident_profile`) | proibido | — | |
| `mfa_email_challenges` | **sem política** (RLS ligado + `revoke all`) | funções definer | — | — | invisível via API |
| `room_check_runs` | A | RPC | RPC | sim | colunas: id, lodge_id, operational_day, slot, checked_at, performed_by, performed_reported_by_entrant, entered_by, status, launched_by, sheet_number, version (**sem** `entered_at`/`created_at`: horário de digitação só a gestão via `room_check_typing_times`) |
| `room_check_marks` | A | RPC | RPC | sim (via run) | id, run_id, stay_id, resident_id, result, marked_by, version |
| `sightings` | A | RPC | RPC | sim | id, resident_id, lodge_id, seen_at, place, recorded_by (sem horário de digitação) |
| `absences`, `no_shows` | A | RPC | RPC | absences: sim (via stay); no_shows: sim (lodge_id) | |
| `notifications` | A **e** (`audience = 'lodge'` ou G) | trigger/RPC | RPC | sim | |
| `notification_reads` | próprio (`staff_id = current_staff_id()`) | próprio | — | — | única tabela com INSERT por política do usuário comum |
| `handover_entries` | A | RPC | RPC | sim | colunas concedidas: id, lodge_id, kind, body, occurred_at, operational_day, round_slot, author_id, late_reason, status, void_reason, voided_by, voided_at, version, `filled_by` (016), `shift_id` (018); **sem** `created_at` |
| `handover_mentions`, `handover_entry_tags`, `handover_entry_staff` | A | RPC | RPC | sim (via entry) | |
| `handover_shifts` | A | RPC | RPC | política própria: Float aberto visível nas duas casas; demais por casa | |
| `handover_tags` | A | RPC (`add_handover_tag`, `set_handover_tag`, `update_handover_tag`, `move_handover_tag`) | RPC | — | |
| `quick_phrases` | A | G | G | — | `grant insert, update` ao usuário; única tabela de frases com escrita direta |
| `task_templates` | A | RPC | G, colunas: title, sort_order, suggested_time, active, weekdays, version | sim | `create_task_template`, `set_task_template_active` |
| `task_extras`, `task_signatures` | A | RPC | RPC | sim | |
| `maintenance_tickets` | A | RPC | RPC | sim | |
| `maintenance_events` | A | RPC | RPC | sim (via ticket) | |
| `maintenance_reminder_snoozes` | **sem política permissiva de leitura**; só `house_scope` restritiva | RPC | — | sim | RLS ligado, sem `GRANT SELECT` ao usuário 🟡 (acesso só por função) |
| `warnings` | A | RPC (`record_warning`) | RPC | sim | |
| `fridges`, `fridge_readings` | A | RPC | RPC | sim | |
| `suppliers` | A | RPC (`add_supplier`, `update_supplier`) | RPC | — | |
| `food_deliveries` | A | RPC | RPC | sim | |
| `dinner_services` | A | RPC | RPC | sim | |
| `dinner_marks` | A | RPC | RPC | sim (via service) | colunas: id, service_id, stay_id, resident_id, served, marked_by, version |
| `laundry_machines`, `laundry_uses` | A | RPC | RPC | sim | |
| `products` | A | RPC | RPC | — | |
| `purchases` | A | RPC | RPC | — | **colunas**: id, supplier, purchased_on, created_by, created_at (sem preço) |
| `purchase_lines` | A | RPC | RPC | — | colunas: id, purchase_id, product_id, quantity (sem `unit_price`; preço via `purchase_prices` G) |
| `product_movements` | A | RPC | RPC | sim (`from_lodge` ou `to_lodge` visível) | |
| `rota_shifts` | G **ou** (A e `status = 'published'`) | RPC | RPC | sim | equipe vê só o publicado |
| `work_intervals` | G | RPC | RPC | sim | |
| `vacations` | G | RPC | RPC | — | |
| `holiday_locks` | A | RPC | RPC | — | |
| `shop_items`, `shop_orders`, `shop_order_lines` | G | RPC (G) | RPC | — | Tesco só gestão |
| `push_prefs`, `push_subscriptions` | **sem política** (RLS ligado + `revoke all`) | RPC (`set_push_pref`, `save_push_subscription`) | RPC | — | `my_push_prefs`, `remove_push_subscription` |

> `house_scope` aplicada por laço a toda tabela base com coluna `lodge_id` exceto `handover_shifts` (política própria): rooms, parameters, duty_posts, stays, room_check_runs, sightings, no_shows, notifications, handover_entries, task_templates, task_extras, task_signatures, maintenance_tickets, warnings, fridge_readings, food_deliveries, dinner_services, laundry_machines, laundry_uses, rota_shifts, work_intervals, fridges. Condição: `lodge_id is null or can_see_lodge(lodge_id)`. Tabelas criadas **depois** da migr. 029 com `lodge_id` não recebem a política automaticamente (nenhuma foi criada com `lodge_id` após a 029 🟢: apenas `suppliers`, que não tem).

## 4. Grants de tabela resultantes 🟢

- `lodges, rooms, beds, staff, residents`: `INSERT, UPDATE` ao `authenticated` (filtrado por RLS). `parameters`: `INSERT`. `quick_phrases`: `INSERT, UPDATE`. `task_templates`: `UPDATE` só nas colunas acima. `notification_reads`: `SELECT, INSERT`.
- Todas as demais: `SELECT` (tabela inteira ou colunas listadas no §3). `audit_log` e `access_log` recebem `SELECT` ao `authenticated` (`20261120000004`), mas as policies `audit_read`/`access_log_read` restringem à gestão.
- `bed_occupancy`: `SELECT` ao `authenticated`.
- Funções internas (`staff_sync_locale`, `handover_fill_default`, `notify_push`, `warning_notify`, `release_cancelled_bed`) têm `revoke all ... from public, anon, authenticated`: só disparam por trigger ou são chamadas por outras definer.

## 5. Riscos e lacunas 🟡/🔴

- 🟡 `maintenance_reminder_snoozes`, `mfa_email_challenges`, `push_*` sem política permissiva: comportamento esperado (acesso só por função), mas `maintenance_reminder_snoozes` tem `house_scope` sem permissiva: confirmar que ninguém tenta `SELECT` direto.
- 🟡 `can_see_lodge` devolve true quando `auth.uid() is null`: protege migrações/agendador, mas qualquer caminho que chame a função sem JWT (por exemplo `service_role` na Edge `admin-users`) ignora o isolamento por casa por desenho.
- 🟡 `residents_update` permite a qualquer posto aberto editar cadastro (qualquer coluna não filtrada por grant: o grant `UPDATE` é de tabela inteira) — sem validação de campos além da RLS.
- 🔴 `anon` ainda pode `EXECUTE server_now()` (por desenho) — superfície mínima, sem dados.
- 🔴 `Edge admin-users` usa chave de serviço (fora do banco): não coberta por RLS (ver `../cross-cutting.md`).
