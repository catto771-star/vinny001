# Contratos de RPCs e Edge Functions — DS Lodge

> Redator Reversa · doc_level=completo · pt-br. Não há API REST própria: o front fala com **PostgREST** (`supabase.rpc(...)` e `.from(...)`) e com duas **Edge Functions** HTTPS. Por isso os contratos estão em tabelas estilo OpenAPI (nome, entrada, saída, autorização, erros) em vez de `openapi/*.yaml`.
> Escala: 🟢 confirmado no SQL/código · 🟡 assinatura inferida/parcial · 🔴 LACUNA. `Mnn` = migration. Vale a definição **mais recente** (redefinições em M29 e blocos `DO` de M37 — ver `findings-verification.md`).
> Convenções: todas `SECURITY DEFINER` com `search_path = public`; `revoke … from public, anon` e `grant execute … to authenticated` por função (M04); autorização = predicados `is_active_staff`, `is_management` (inclui MFA), `can_see_lodge`, `can_write_lodge`. Erros chegam como `raise exception '<codigo>'` (errcode em parênteses quando conhecido) e o front os traduz com `errorKey` (`src/lib/errors.ts`). Concorrência otimista: `stale_version` (40001). Tolerância de horário futuro: +5 min.
> Cobertura: as ~190 funções do banco **não** foram todas extraídas; este arquivo cobre as RPCs documentadas pelos módulos (~110). 🔴 LACUNA: contrato exaustivo extraído de `pg_proc` (ver `questions.md`).

## 0. Notas gerais
- **Tipos**: `uuid`, `text`, `int`, `timestamptz` (ISO 8601), `date` (`YYYY-MM-DD`), `jsonb`. Retorno "void" = sem payload.
- **Autorização** (coluna Auth): `staff` = `is_active_staff`; `mgmt` = `is_management`; `see(l)`, `write(l)` = `can_see_lodge`/`can_write_lodge` da casa; `—` = interna (sem EXECUTE a `authenticated`).
- **Brechas conhecidas** estão marcadas com ⚠ e remetem aos vereditos do Detetive (#n).

## 1. Acesso e autenticação
| RPC | Entrada | Saída | Auth | Erros principais | Fonte |
|---|---|---|---|---|---|
| `mfa_satisfied()` | — | boolean | staff | — | M05:52-69 🟢 |
| `begin_email_verification()` | — | void | gestão com sessão de senha (`amr` password) | `not_required`, `not_authorised`, `password_session_required`, `too_many_code_requests` (54000; 5/15 min) | M05:71-98 🟢 |
| `is_management()` / `is_active_staff()` | — | boolean | autenticado | — | M01 🟢 |
| `server_now()` | — | timestamptz (`clock_timestamp()`) | autenticado e anon | — | M03 🟢 |
| `set_my_locale(p_locale)` | locale | void | staff | — | M01 🟡 |
| `mark_password_changed()` | — | void | staff | — | M01 🟢 |
| `set_my_display_name(p_name)` | text ≤40; vazio → null | void | staff | `invalid_name` | M32:151-165 🟢 |
| `assume_post(p_function, p_lodge, p_confirm_takeover)` | `office\|float`, uuid?, bool | `{status: occupied\|already_on_post\|assumed\|switched, occupant_staff_id?, occupant_name?, since?, post_id?, took_over_staff_id?}` | see(l) | `role_not_allowed` e checagens de função (office só porter; float porter/manager) — **sem chamada em `src/`** 🟡 | M29:217-301 🟢 |
| `end_my_post()` | — | void | staff | — | M01:352-368 🟢 |
| `open_resident_profile(p_resident)` | uuid | `{resident, stays[]}` (grava `access_log`) | staff ⚠ **sem `can_see_lodge`** (#5) | `resident_not_found` (P0002) | M01:788-833 🟢 |
| `search_audit(p_from,p_to,p_actor,p_tables[],p_actions[],p_record,p_q,p_limit,p_before)` | datas opc.; `p_limit` 1–500; cursor `id` | linhas `(id, occurred_at, actor_staff_id, actor_name, action, table_name, record_id, old_data, new_data)` | mgmt | `not_authorised`, `invalid_range`, `range_too_large` (>366 d) | M31 🟢 |
| `search_access_log(p_from,p_to,p_actor,p_q,p_limit,p_before)` | idem | `(id, occurred_at, actor_staff_id, actor_name, resident_id, resident_name, context)` | mgmt | idem | M31 🟢 |

### Edge Function `admin-users` — `POST /functions/v1/admin-users`
Headers: JWT do chamador (Bearer) e `apikey`; CORS `*`; OPTIONS ok; não-POST → 405. Autoriza por `is_management()` do chamador (≠ true → **403 `{error:"not_authorised"}`**). Insere em `staff` **com o JWT do chamador**; usa chave de serviço (env `SUPABASE_SERVICE_ROLE_KEY`, só no servidor) para o Auth. 🟢
| `action` | Corpo | Resposta | Erros |
|---|---|---|---|
| `create` | `{full_name, display_name?, email?, role ∈ station\|porter\|cleaner\|manager\|owner, locale, home_lodge_id?, password?}` | `{staff_id}` | 400 `invalid_body`; `role` inválido (developer nunca); `station` exige `home_lodge_id`; com login (`station\|manager\|owner`) exige e-mail e senha forte (≥10, letra, dígito); compensação `deleteUser` se o insert falha |
| `reset_password` | `{staff_id, password}` | `{ok:true}` | 400 `no_login`; senha fraca → 400; 403 se a RLS barrar (ex.: alvo developer) |
| `set_active` | `{staff_id, active}` | `{ok:true}` | atualiza `staff.active` + `ban_duration` `876000h`/`none` |
| (outra) | — | — | 400 `unknown_action` |
Sem rate limit nem log de tentativas 🔴.

## 2. Moradores e presença
| RPC | Entrada | Saída | Auth | Erros principais | Fonte |
|---|---|---|---|---|---|
| `admit_resident` | `p_lodge, p_bed, p_resident_id?, p_first_name?, p_last_name?, p_date_of_birth?, p_pass_id?, p_admitted_at?` | uuid (`stay_id`) | see+write | `admitted_in_future`, `name_required`, `pass_id_required`, `pass_id_exists` (23505), `resident_not_found`, `already_resident`, `bed_not_in_lodge`, `bed_out_of_service`, `stays_one_open_per_bed/resident` | M38:14-53 🟢 |
| `find_former_resident(p_pass_id)` | text | 0..1 linha: dados + `has_open_stay`, `last_ended_at`, `last_house` | staff ⚠ **sem `can_see_lodge`** (#7, provável desenho) | — | M37:91-102 🟢 |
| `decide_out(p_stay, p_reason, …)` | estadia, motivo | void | write | `reason_required` | M01:575-599 🟢 |
| `withdraw_out(p_stay)` | uuid | void | gestão ou quem decidiu | `not_author`/`not_authorised` | M01:601-621 🟢 |
| `effect_out(p_stay, p_ended_at?)` | `p_ended_at ∈ [admitted_at, now()+5 min]` | void | mgmt | `invalid_out_time`, `stay_not_open` | M01:623-650 🟢 |
| `transfer_resident(p_stay, p_to_bed, p_at?)` | — | uuid nova estadia | write (origem ou destino) | `stay_not_active`, `invalid_transfer_time`, `bed_*` | M38:55-83 🟢 |
| `release_cancelled_bed(p_bed, p_at)` | — | void | — (interna) | efetiva `out_pending` da cama (#17) | M38:4-11 🟢 |
| `open_room_check(p_lodge, p_day, p_slot)` | — | run (idempotente) | see+write | `invalid_slot`, `check_in_future` | M32:67-115 🟢 |
| `room_check_sheet(p_run)` | uuid | camas × estadias presentes no `checked_at` + `result`, `absence_id`, `final_warning` | staff | — | M07:757-791 🟢 |
| `mark_resident(p_run, p_stay, p_result)` | `seen\|not_seen\|absent` | `{mark_id, absence_active, absence_id}` | write | `stay_not_in_check`, `no_active_absence`, `not_author`, `correction_window_closed` | M06:328-377 🟢 |
| `clear_mark(p_run, p_stay)` | — | void (DELETE real auditado) | write | `run_launched`, `not_author` | M06:380-401 🟢 |
| `launch_room_check(p_run)` | uuid | `{status, launched_at_day}` ou `already_launched` | write | `unmarked_residents` (detail n) | M07:272-306 🟢 |
| `set_room_check_details(p_run, p_checked_at, p_performed_by)` | — | void | gestão ou quem digitou na janela | `invalid_check_time`, `invalid_performer` | M06:255-291 🟢 |
| `room_check_typing_times(p_run)` | — | `entered`, `launched`, `mark` | mgmt | — | M06:434-449 🟢 |
| `register_absence(p_stay, p_starts, p_expected_return, p_notes)` | — | uuid | write | `stay_not_open`, `invalid_absence_period`, `absence_overlaps` (23P01) | M06:454-482 🟢 |
| `end_absence(p_absence, p_returned_at?)` | `∈ [starts_at, now+5 min]` | void | write | `absence_already_ended`, `invalid_return_time` | M06:485-506 🟢 |
| `overdue_absences(p_lodge)` | — | linhas | see | — | M29:822 🟢 |
| `record_sighting(p_resident, p_lodge, p_seen_at?, p_place)` | — | `{sighting_id, absence_active, absence_id}` | see+write | `invalid_seen_time`, `resident_not_in_lodge` | M29:998 🟢 |
| `seen_for_day(p_lodge, p_day)` | — | residentes com `seen_day/seen_night`, `day_sources/night_sources` | see+staff | — | M29:1396 🟢 |
| `resident_evidence(p_resident, p_day)` | — | uma linha por evidência (`check\|manual\|check-in\|dinner`) | staff (cross-lodge por desenho) | — | M10:312-333 🟢 |
| `residents_without_evidence(p_lodge, p_day, p_at)` | — | candidatos a No Show | see | — | M29:1260 🟢 |
| `no_show_review(p_lodge, p_day)` | — | `{operational_day, day_finished, pending_slots, complete, candidates[], confirmed[]}` | see | — | M29:688 🟢 |
| `confirm_no_shows(p_lodge, p_day, p_stays[])` | — | `[{stay_id, resident_id, no_show_id, month_count}]` | write | `day_not_finished`, `checks_pending`, `not_a_candidate` (aborta o lote) | M29:373 🟢 |
| `undo_no_show(p_id, p_reason)` | — | void | mgmt | `reason_required`, `no_show_not_confirmed` | M06:755-769 🟢 |
| `presence_alert(p_lodge)` | — | `{pending_slots, without_evidence}` | see | — | M29:930 🟢 |
| `check_slots(p_lodge, p_day)` / `pending_slots(p_lodge, p_day, p_until)` | — | lista de slots | see | — | M29:324 / M29:884 🟢 |

## 3. Ocorrências e passagem de turno
| RPC | Entrada | Saída | Auth | Erros principais | Fonte |
|---|---|---|---|---|---|
| `add_handover_note(p_lodge, p_body, p_occurred_at, p_mentions, p_late_reason, p_filled_by?, p_tags?, p_co_authors?)` | mentions `[{resident_id}\|{staff_id}]`; ≤3 coautores | uuid | see+write+staff | `body_required`, `invalid_time`, `invalid_filled_by`, `too_many_authors`, `invalid_co_author`, `invalid_tag`, `late_reason_required` | M29:79-134 🟢 |
| `insert_handover_entry(…)` | kind, body, occurred_at, mentions, … | uuid | — (interna) | — | M29:567-588 🟢 |
| `correct_handover_note(p_id, p_body)` | — | void | gestão ou autor na janela | `entry_not_found`, `round_not_editable`, `body_required`, `not_author`, `correction_window_closed` | M07:161-177 🟢 |
| `void_handover_note(p_id, p_reason)` | — | void | idem | `reason_required` | M07:179-196 🟢 |
| `handover_typing_times(p_ids[])` | — | `created_at` por entrada | mgmt | — | M07:198-208 🟢 |
| `search_handover(p_lodge, p_from, p_to, p_q, p_kinds[], p_tags[], p_staff, p_resident, p_function, p_include_voided, p_limit)` | limite 1–100 | entradas | see+staff | `invalid_range`, `range_too_large` (>92 d) | M29:1364-1393 🟢 |
| `room_check_done(p_lodge, p_day, p_slot)` | — | `{status: recorded\|already_recorded, entry_id}` | see+write | `invalid_round_slot`, `round_in_future` | M32:117-147 🟢 |
| `pending_rounds(p_lodge)` | — | slots esquecidos | see | — | M29:862 🟢 |
| `open_handover_shift(p_lodge, p_staff, p_function, p_at)` | `office\|float`; `at ∈ [now−24h, now+5min]` | uuid | see+write | `invalid_function`, `invalid_time`, `invalid_filled_by`, `shift_already_open` (23505) | M29:739-771 🟢 |
| `close_handover_shift(p_shift, p_handed_to?, p_note?, p_at?)` | — | uuid do novo turno ou null | write (**sem `can_see_lodge`**) | `shift_already_closed`, `invalid_time` | M26:39-86 🟢 |
| `match_rota_shift(p_staff, p_lodge, p_at, p_function)` | — | uuid? | — | — | M29:670-686 🟢 |
| `add_handover_tag(p_label, p_color, p_notify)` | rótulo ≤30; cor ∈ red/amber/blue/green/violet/grey | tag | mgmt | `tag_exists`, `too_many_tags` (20), `invalid_color` | M36:7-29 🟢 |
| `update_handover_tag` / `move_handover_tag(p_tag, p_dir)` / `set_handover_tag(p_tag, p_visible)` | — | void | mgmt | `invalid_tag` | M36, M23 🟢 |
| `create_maintenance(p_lodge, p_location, p_description, p_priority, p_request_key)` | `urgent\|normal\|low` | `{ticket_id, entry_id, duplicate?}` | see+write | `invalid_priority`, `*_check` | M29:439-470 🟢 |
| `maintenance_set_status(p_ticket, p_status?, p_deadline?, p_note?)` | status ∈ open,in_progress,on_hold,resolved,reopened | void | gestão tudo; Office da casa só `resolved` ⚠ **station sem posto passa (#6)**, sem `can_see_lodge` | `ticket_not_found`, `invalid_status`, `not_authorised` | M07:583-629 🟢 |
| `maintenance_list(p_lodge)` | — | tickets com `overdue`, `last_event_at` | see | — | M29:608-624 🟢 |
| `maintenance_reminders()` / `snooze_maintenance_reminder(p_ticket)` | — | lista / void | mgmt | — (usa 24 h literal; `maintenance.reminder_hours` não lido, #13) | M07:649-678 🟢 |
| `record_warning(p_stay, p_type, p_note)` | `warning\|final_warning` | uuid | write | `stay_not_open`, `invalid_warning_type`, `final_warning_active` (23505) | M37:25-48 🟢 |
| `deactivate_final_warning(p_id, p_reason)` | — | void | mgmt | `reason_required`, `warning_not_active` | M37 🟢 |
| `has_final_warning(p_resident)` | — | boolean | staff | — | M37 🟢 |
| `pending_counts(p_lodge)` | — | `{tasks, maintenance, absences, checks, rounds, no_shows}` (NULL se não ativo) | staff + **`can_see_lodge`** (#4 REFUTADO) | `not_authorised` (outra casa) | M29:841 🟢 |

## 4. Serviços da casa
| RPC | Entrada | Saída | Auth | Erros principais | Fonte |
|---|---|---|---|---|---|
| `start_laundry(p_machine, p_stay?)` | — | uuid | write | `machine_not_found`, `machine_busy` (23505), `stay_not_open` | M14:101-132 🟢 |
| `finish_laundry(p_use)` | — | void (idempotente) | write | — | M14:134-155 🟢 |
| `laundry_status(p_lodge)` | — | máquinas com uso aberto | see | — | M29:590-606 🟢 |
| `record_fridge_reading(p_fridge, p_temperature, p_note)` | numeric ∈ [-40,40], 1 casa | `{reading_id, out_of_range, …}` 🟡 | write | `fridge_not_found`, `temperature_required`, `invalid_temperature` | M14:271-309 🟢 |
| `auto_sign_task(p_lodge, p_key)` | — | void | — (interna) | — | M10:14-32 🟢 |
| `ensure_dinner_service(p_lodge, p_day)` | — | serviço | see | `service_not_available` | M29:547-565 🟢 |
| `dinner_sheet` / `dinner_summary` / `dinner_stays` | `p_lodge, p_day` | folha / contagens / estadias | see | — | M29 🟢 |
| `mark_dinner(p_lodge, p_day, p_stay, p_served)` | bool | void (idempotente) | see+write | `dinner_not_started`, `dinner_closed`, `stay_not_in_service`, `served_required`, `not_author`, `correction_window_closed` | M29:626-668 🟢 |
| `close_dinner(p_lodge, p_day, p_leftovers, p_packaged, p_note)` | int ≥0 | void | mgmt (1º fechamento manager/developer; reedição owner/developer) | `dinner_not_finished`, `invalid_quantities`, `dinner_already_closed` | M29:340-371 🟢 |
| `record_food_delivery(p_lodge, p_supplier_id, p_product, p_batch?, p_expiry?, p_temperature?, …)` | temp ∈ [-40,99] | uuid 🟡 (lista de parâmetros completa em `r15.sql:176-213`) | see+write | `service_not_available`, `fields_required`, `supplier_inactive`, `batch_required`, `best_before_required`, `temperature_required`, `invalid_temperature` | M37:176-213 🟢 |
| `my_notifications(p_limit)` / `unread_notifications_count()` / `mark_notification_read(p_id)` | limite 1–200 (50) | lista / int / void | gestão (audience) | — | M29:1552-1579; M10:455-466 🟢 |

## 5. Compras e fornecedores
| RPC | Entrada | Saída | Auth | Erros principais | Fonte |
|---|---|---|---|---|---|
| `create_shop_order(p_delivery, p_notes)` | data ∈ [hoje−30, hoje+366] | uuid | mgmt | `invalid_date` | BM:354-375 🟢 |
| `set_shop_line(p_line, p_action, p_delta, p_unit_price)` | ação standard/more/less/dont; delta 0–999; preço 0–99999 | void | mgmt (não checa status do pedido) | `invalid_action`, `invalid_quantity`, `invalid_price`, `line_not_found` | BM:377-394 🟢 |
| `set_shop_order(p_order, p_delivery, p_notes, p_placed)` | data ±366 d | void | mgmt | `invalid_date` | M37:223-236 🟢 |
| `set_shop_order_status(p_order, p_status)` | `created\|placed\|awaiting` | void | mgmt | `invalid_status`, `order_delivered` | M37:238-250 🟢 |
| `update_shop_item(p_id?, p_name, p_category, p_default_qty, p_default_action, p_tesco_url)` | URL `https://` | uuid | mgmt | `name_required`, `invalid_url`, `item_not_found` | BM:416-444 🟢 |
| `shop_order_total(p_order)` | — | `{total, items, lines_without_price}` | mgmt (sem uso na UI) | — | BM:446-460 🟢 |
| `link_delivery_to_order(p_delivery, p_order)` | — | void | mgmt | `delivery_not_found`, `already_linked` (23505), `delivery_not_linkable`, `order_not_found`, `order_not_open` | M37:252-280 🟢 |
| `add_supplier(p_name, p_batch, p_best_before, p_temperature, p_links_order)` | nome ≤40 | uuid | mgmt | `name_required`, `invalid_name`, `supplier_exists` (23505) | M37:131-144 🟢 |
| `update_supplier(p_id, …flags, p_active)` | coalesce nos flags | void | mgmt | `supplier_not_found` (propaga nome a `food_deliveries.supplier`) | M37:146-161 🟢 |
| `report_purchases(p_from, p_to)` | `[from,to)` | `{orders, placed, by_status{created,placed,awaiting,delivered}, items, total, lines_without_price, by_category[], top_items[8]}` | mgmt | `invalid_period` | RP:2-26 + M37:283-291 🟢 (#2 REFUTADO) |
| Legado: `upsert_product`, `create_purchase`, `purchase_prices`, `allocate_purchase_line`, `transfer_product` | ver `modules/compras-e-fornecedores/code-analysis.md §6` | — | mgmt/write | `supplier_required`, `lines_required`, `invalid_line`, `exceeds_purchased_quantity`, `same_lodge`, `invalid_quantity` | M11, RL, M29 🟢 (sem UI) |

## 6. Equipe, escala e horas
| RPC | Entrada | Saída | Auth | Erros principais | Fonte |
|---|---|---|---|---|---|
| `save_rota_shift(p_id, p_staff, p_lodge, p_function, p_start, p_end)` | funções office/float/cleaner/manager | uuid | mgmt+see | `invalid_period`, `staff_not_found`, `role_not_allowed`, `staff_overlap` (23P01), `float_overlap`, `shift_not_found`; ⚠ função `manager` sem restrição de papel no banco (#11) | M29:1320-1362 🟢 |
| `cancel_rota_shift(p_id)` | — | void | mgmt | silêncio se id inexistente | M11:236-246 🟢 |
| `split_rota_shift(p_shift, p_at, p_cover)` | — | void | mgmt | `invalid_split_time` | BP:142-166 🟢 |
| `publish_rota(p_from, p_to)` | ≤62 dias | `{published, gaps}` | mgmt | `invalid_range` | BP:114-138 🟢 |
| `coverage_gaps(p_from, p_to)` | — | janelas em buraco | mgmt | — | RL:17-52 🟢 |
| `staff_hours(p_from, p_to)` / `staff_work_log(p_staff, p_from, p_to)` | — | previsto/efetivo por pessoa / itens `roster\|cover\|cancelled\|manual` | mgmt | — | BP:172-222 🟢 |
| `add_work_interval(p_staff, p_lodge, p_start, p_end, p_note)` | ≤24 h; fim ≤ now+5 min | uuid | mgmt+see | `invalid_period`, `interval_too_long`, `in_future` | M29:136-157 🟢 |
| `adjust_work_interval(p_post, p_start, p_end, p_reason)` | — | void | mgmt | caminho morto na UI | RL:362-390 🟡 |
| `shift_hours_review()` / `confirm_shift_hours(p_shift, p_start, p_end)` | — | linhas / void | mgmt | `shift_not_found`, `invalid_period` | HS:161-181; FS:134-168 🟢 |
| `shift_tasks(p_lodge, p_day, p_shift)` / `pending_tasks(p_lodge)` | — | tarefas | see | — | M29:1422-1447; 904-928 🟢 |
| `sign_task(p_kind, p_task, p_lodge, p_day, p_shift, p_signed_by)` | kind template\|extra | void (idempotente) | see+write | `shift_not_started`, `task_not_in_shift`, `invalid_filled_by` | M29:1449-1482 🟢 |
| `create_task_template(p_lodge, p_shift, p_weekdays, p_title, p_sort, p_suggested_time)` | — | uuid | mgmt | — | M29:472-488 🟢 |
| `create_extra_task(p_lodge, p_day, p_shift, p_staff, p_title, p_due_at)` / `reassign_extra_task(p_extra)` | — | uuid / void | mgmt | — | M29:421-437; OC:478-488 🟢 |
| `set_task_template_active(p_id, p_active)` | — | void | mgmt | `task_not_found` (não chamada pela UI) | TB:41-52 🟢 |
| `person_summary(p_staff)` | — | `{functions, roster_upcoming, shifts_recent, notes_recent, hours_month, tasks_signed_30d}` | mgmt | `staff_not_found` | M27:81-111 🟢 |
| Férias: `register_vacation`, `set_vacation_status`, `cancel_vacation`, `holiday_calendar(p_year)` | ver `state-machines.md §12` | — | mgmt | `dates_locked` | BM, M17 🟡 (assinaturas completas 🔴) |

## 7. Painel, relatórios e auditoria
| RPC | Entrada | Saída | Auth | Erros | Fonte |
|---|---|---|---|---|---|
| `home_dashboard(p_from?, p_to?)` | padrão 14 dias; ≤365; `from ≥ 2020-01-01`; `to ≤ hoje+31` | `{series[], lodges[], totals, maintenance_open, period}` | staff (+`can_see_lodge`) | `invalid_period` | M38:87-137 🟢 |
| `report_period(p_lodges[], p_from, p_to)` | `check_period`: ≥2020-01-01, ≤400 dias | 12 blocos + `order`; `warnings.{warning,final_warning}` | mgmt | `invalid_period` (22023) | BM:119-237 + M37 patch 🟢 (#1 REFUTADO) |
| `report_details_period(p_lodges[], p_from, p_to, p_metric)` | métrica (`'warnings.'\|\|type` aceita as novas chaves) | `label, lodge, at, extra` | mgmt | `invalid_period` | BM:33-117 🟢 |
| `check_period(p_lodges[], p_from, p_to)` | — | void | interna | `invalid_period` | BM:7-18 🟢 |
| `report_details` / `report_monthly` | — | wrappers legados | mgmt | sem uso no front | BM:240-265 🟢 |

## 8. Configurações e cadastros
| RPC | Entrada | Saída | Auth | Erros | Fonte |
|---|---|---|---|---|---|
| `set_system_parameter(p_key, p_value)` | lista fechada (ver `spec.md` de configuracoes RF-03) | void (INSERT com `valid_from=now()`) | mgmt | `not_authorised`, `unknown_parameter`, `invalid_parameter` | M32:4-65 + M37:165-172 🟢 ⚠ `parameters_insert` direto contorna (#9) |
| `param_value(p_key, p_lodge, p_at)` | — | jsonb | staff | — | M01:133-146 🟢 |
| `add_room(p_lodge, p_code, p_kind, p_beds)` | código ≤20; 1..12 camas | uuid | mgmt | `name_required`, `invalid_name`, `invalid_kind`, `too_many_beds`, `lodge_not_found`, `room_exists` | M34:10-27 🟢 |
| `rename_room`, `add_bed`, `set_room_active`, `set_bed_active` | — | void | mgmt | `room_occupied`, `bed_occupied`, `too_many_beds` | M34:29-72 🟢 |
| `add_fridge(p_lodge, p_name)`, `rename_fridge`, `set_fridge_active` | nome ≤40 | uuid / void | mgmt | `invalid_name` | M34:78-89 🟢 |
| `add_laundry_machine(p_lodge, p_kind, p_label)`, `rename_laundry_machine`, `set_laundry_machine_active` | `wash\|dry`; label ≤40 | uuid / void | mgmt | `machine_busy` | M34:110-145 🟢 |
| `update_lodge(p_lodge, p_name, p_short_name, p_has_dinner, p_has_laundry)` | nome ≤60; curto ≤30 | void | mgmt | `lodge_not_found` | M34:147-156 🟢 |
| `my_push_prefs()` / `set_push_pref(p_key, p_enabled)` | — | lista / void | gestão | — | M23:172-204 🟢 |
| `lock_holiday_dates(p_start, p_end, p_note)` / `unlock_holiday_dates(p_id)` | ≤366 dias | uuid / void | mgmt | `invalid_period` | BM:543-573 🟢 |
| Predicados: `house_scope()`, `can_see_lodge(p_lodge)`, `can_write_lodge(p_lodge)` | — | uuid / boolean | internos (grant a authenticated) | — | M29:5-28 🟢 |

## 9. Notificações e push
| Artefato | Entrada | Saída | Auth | Erros | Fonte |
|---|---|---|---|---|---|
| `save_push_subscription(p_endpoint, p_p256dh, p_auth, p_device)` | endpoint `https://`; device ≤80 | void | gestão | `invalid_subscription` | M23:206-221 🟢 |
| `remove_push_subscription(p_endpoint)` | — | void | só o próprio staff | — | M23:223-230 🟢 |
| `notify_push()` (trigger) | `{notification_id}` via `net.http_post` + `x-push-secret` | — | — | exceções engolidas | M24:3-26 🟢 |
| `push_keys(kind, payload)` / `push_default(key)` / `push_recipients(notification_id)` | — | text[] / boolean / staff ids | internas (revogadas) | — | M23:132-170 🟢 |

### Edge Function `send-push` — `POST /functions/v1/send-push`
Chamada só pelo banco. Headers: `x-push-secret` (comparado com env `PUSH_HOOK_SECRET`, `!==`). Corpo `{notification_id}`. Respostas: 403 (segredo), 400 (sem id), 404 (notificação inexistente), 200 `{sent:n}`. Envia com `web-push` (VAPID; TTL 3600; tag `n<id>`), apaga assinatura em 404/410. Variáveis: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `PUSH_HOOK_SECRET`. 🟢

## 10. Tabelas lidas diretamente pelo front (PostgREST `.from`)
`staff` (RLS ativo), `lodges`, `rooms`/`beds`, `bed_occupancy` (view `security_invoker`), `residents` (+`stays`, update direto com `version`), `absences`, `room_check_runs` (colunas de digitação omitidas), `handover_entries`/`handover_shifts`/`handover_tags`, `warnings`, `maintenance_tickets`/`maintenance_events`, `food_deliveries`, `fridges`/`fridge_readings`, `shop_*`, `rota_shifts`, `parameters`, `holiday_locks`, `audit_log`/`access_log` (só gestão). Escritas diretas pelo front limitam-se a `staff`, `residents`, `beds`, `lodges`, `rooms`, `parameters` (insert) — o restante é por RPC. 🟢
