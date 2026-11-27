# Funções, triggers e views — DS Lodge (Data Master)

> Fonte: `supabase/migrations/*.sql`. 🟢 confirmado · 🟡 inferido · 🔴 lacuna.
> **Metodologia (importante):** 297 ocorrências de `CREATE OR REPLACE FUNCTION` (case-insensitive, incluindo as redefinições em MAIÚSCULAS da migr. 029/032) correspondem a **192 funções distintas**. A migração 037 ainda **reescreve funções via `DO $$ ... pg_get_functiondef ... replace ... EXECUTE`** (`has_final_warning`, `deactivate_final_warning`, `report_period`, `report_purchases`, `set_system_parameter`): o corpo vigente dessas é o resultado da substituição, não o texto de nenhuma migração isolada. Para qualquer função vale a **última** migração listada na coluna "Última migração".
> Todas as funções de negócio são `SECURITY DEFINER` com `set search_path = public` (as `invoker` são utilitárias imutáveis). Padrão de privilégio: função nova **sem** EXECUTE (`alter default privileges ... revoke`), concessão explícita a `authenticated`.

## 1. Triggers (67) 🟢

| Grupo | Qtde | Evento | Função | Tabelas |
|---|---|---|---|---|
| Auditoria `audit_<tabela>` | 41 | AFTER INSERT OR UPDATE OR DELETE, por linha | `audit_row()` | ver `audit-coverage.md` |
| Concorrência otimista `*_bump_version`/`*_bump` | 18 | BEFORE UPDATE | `bump_version()` | staff, residents, beds, stays, room_check_runs, room_check_marks, absences, no_shows, handover_entries, task_templates, task_extras, maintenance_tickets, warnings, dinner_services, dinner_marks, rota_shifts, work_intervals, shop_items |
| Imutabilidade `audit_log_immutable`, `access_log_immutable` | 2 | BEFORE UPDATE OR DELETE | `audit_immutable()` | audit_log, access_log |
| `staff_on_deactivate` | 1 | BEFORE UPDATE (staff) | `staff_on_deactivate()` | encerra posto aberto e carimba desativação |
| `stays_check_bed` | 1 | BEFORE INSERT/UPDATE (stays) | `stays_check_bed()` | cama na casa certa; no INSERT, cama/quarto ativos e em uso |
| `staff_sync_locale` | 1 | AFTER INSERT/UPDATE OF locale, user_id (staff) | `staff_sync_locale()` | copia idioma para `auth.users.raw_user_meta_data` |
| `handover_fill_default` | 1 | BEFORE INSERT (handover_entries) | `handover_fill_default()` | preenche `filled_by` (de `app.filled_by`/turno) e `shift_id` do turno aberto |
| `warnings_notify` | 1 | AFTER INSERT (warnings) | `warning_notify()` | notificação aos gestores |
| `notifications_push` | 1 | AFTER INSERT (notifications) | `notify_push()` | chama a Edge `send-push` por `pg_net`/Vault; `exception when others` engole falhas (push nunca bloqueia o registro) |

**`bump_version`**: `if new.version is distinct from old.version then raise 'stale_version' (40001)`; senão `new.version := old.version + 1`. Cross-cutting dizia "19 triggers": são **18** triggers em 18 tabelas; existe uma 19ª coluna `version` (`suppliers`), incrementada manualmente por `update_supplier` (sem trigger) 🟢.

**`audit_row`**: grava `audit_log(actor_user_id=auth.uid(), actor_staff_id=current_staff_id(), action=tg_op, table_name, record_id=id::text, old_data, new_data)`; **não registra UPDATE que só mudou `version`** (`(old - 'version') = (new - 'version')`). `SECURITY DEFINER`.

## 2. View

`bed_occupancy` (`security_invoker = true`): ver `schema.md`.

## 3. Catálogo de funções (192)

Colunas: "(n: lista)" = número de definições e sufixos das migrações que a (re)definem. `Acesso`: `authenticated` = `GRANT EXECUTE`; `interna (revogada)` = sem EXECUTE para o usuário (chamada por outras definer/trigger).

### Tempo, identidade e autorização

| Função | Última migração (defs) | Modo | Acesso | Resumo |
|---|---|---|---|---|
| `operational_day` | 001 (1: 001) | invoker · immutable | authenticated | dia operacional: (ts em Dublin - 7h)::date |
| `operational_day_start` | 001 (1: 001) | invoker · immutable | authenticated | início 07:00 do dia operacional |
| `operational_day_end` | 001 (1: 001) | invoker · immutable | authenticated | fim (07:00 do dia seguinte) |
| `param_value` | 001 (1: 001) | definer · stable | authenticated | valor vigente do parâmetro (última `valid_from` <= agora) |
| `current_staff_id` | 001 (1: 001) | definer · stable | authenticated | staff ativo do `auth.uid()` |
| `current_staff_role` | 001 (1: 001) | definer · stable | authenticated | papel do staff ativo |
| `mfa_satisfied` | 005 (2: 001,005) | definer · stable | authenticated | segunda etapa por e-mail satisfeita (ver rls-policies) |
| `is_management` | 001 (1: 001) | definer · stable | authenticated | manager/owner/developer + MFA |
| `is_active_staff` | 001 (1: 001) | definer · stable | authenticated | há staff ativo |
| `can_write_lodge` | 029 (3: 001,016,029) | definer · stable | authenticated | gestão, conta de casa na sua casa, ou posto aberto (float/casa) |
| `house_scope` | 029 (1: 029) | definer · stable | authenticated | casa da conta station (null para os demais) |
| `can_see_lodge` | 029 (1: 029) | definer · stable | authenticated | isolamento por casa |
| `server_now` | 003 (1: 003) | invoker | anon+authenticated | hora do servidor para o relógio da tela (liberada a anon) |
| `email_code_session_at` | 005 (1: 005) | invoker · stable | authenticated | instante do login por código (lê `amr` do JWT) |
| `begin_email_verification` | 005 (1: 005) | definer | authenticated | gera o código por e-mail (Manager/Owner/Developer) em `mfa_email_challenges` |
| `shift_of` | 006 (1: 006) | invoker · immutable | authenticated | 'day'/'night' de um instante |
| `slot_shift` | 006 (1: 006) | invoker · immutable | authenticated | turno de um horário 'HH:MM' |
| `slot_instant` | 006 (1: 006) | invoker · immutable | authenticated | instante de um horário em um dia operacional (antes das 07h = dia seguinte) |
| `shift_end` | 007 (1: 007) | invoker · immutable | authenticated | fim do turno de um instante |
| `shift_start_of` | 007 (1: 007) | invoker · immutable | authenticated | início do turno (dia, turno) |
| `shift_end_of` | 007 (1: 007) | invoker · immutable | authenticated | fim do turno (dia, turno) |
| `iso_weekday` | 007 (1: 007) | invoker · immutable | interna (revogada) | dia da semana ISO |
| `overlap_minutes` | 011 (1: 011) | invoker · immutable | interna (revogada) | minutos de sobreposição de dois intervalos |
| `check_range` | 013 (1: 013) | invoker · immutable | authenticated | valida intervalo (início<fim, ≤62 dias) |
| `check_month` | 013 (1: 013) | invoker · immutable | authenticated | valida mês |
| `check_period` | 017 (1: 017) | invoker · immutable | authenticated | valida período para relatórios |
| `correction_window` | 006 (1: 006) | definer · stable | interna (revogada) | intervalo de correção (`records.correction_window_hours`) |
| `set_my_locale` | 001 (1: 001) | definer | authenticated | idioma da própria conta |
| `mark_password_changed` | 001 (1: 001) | definer | authenticated | zera `must_change_password` |
| `set_my_display_name` | 032 (1: 032) | definer | authenticated | nome de exibição próprio (032) |
| `set_system_parameter` | 032 (2: 030,032) | definer | authenticated | edita parâmetro validado com nova vigência (gestão) |

### Postos (Office/Float) e estrutura

| Função | Última migração (defs) | Modo | Acesso | Resumo |
|---|---|---|---|---|
| `my_open_post` | 001 (1: 001) | definer · stable | authenticated | posto aberto do chamador |
| `has_open_post` | 001 (1: 001) | definer · stable | authenticated | há posto aberto |
| `assume_post` | 029 (2: 001,029) | definer | authenticated | abre posto Office/Float |
| `end_my_post` | 001 (1: 001) | definer | authenticated | encerra o posto |
| `on_duty_staff` | 029 (2: 016,029) | definer · stable | authenticated | quem está de serviço (Roster/postos) numa casa e instante |
| `structure_guard` | 034 (1: 034) | definer · stable | interna (revogada) | interna: só gestão e bloqueia mudança de estrutura em uso |
| `update_lodge` | 034 (1: 034) | definer | authenticated | dados da casa (034) |
| `add_room` | 034 (1: 034) | definer | authenticated | cria quarto (034) |
| `rename_room` | 034 (1: 034) | definer | authenticated | renomeia quarto |
| `set_room_active` | 034 (1: 034) | definer | authenticated | ativa/desativa quarto |
| `add_bed` | 034 (1: 034) | definer | authenticated | cria cama |
| `set_bed_active` | 034 (1: 034) | definer | authenticated | ativa/desativa cama |
| `add_fridge` | 034 (1: 034) | definer | authenticated | cria geladeira |
| `rename_fridge` | 034 (1: 034) | definer | authenticated | renomeia geladeira |
| `set_fridge_active` | 034 (1: 034) | definer | authenticated | ativa/desativa geladeira |
| `add_laundry_machine` | 034 (1: 034) | definer | authenticated | cria máquina |
| `rename_laundry_machine` | 034 (1: 034) | definer | authenticated | renomeia máquina |
| `set_laundry_machine_active` | 034 (1: 034) | definer | authenticated | ativa/desativa máquina |
| `bed_lodge` | 001 (1: 001) | invoker · stable | authenticated | casa de uma cama |

### Moradores e estadias

| Função | Última migração (defs) | Modo | Acesso | Resumo |
|---|---|---|---|---|
| `admit_resident` | 038 (4: 001,029,037,038) | definer | authenticated | admissão (PASS ID obrigatório; re-admissão; libera cama cancelada) |
| `transfer_resident` | 038 (2: 001,038) | definer | authenticated | transferência entre camas/casas (cadeia `transfer_from_stay_id`) |
| `decide_out` | 001 (1: 001) | definer | authenticated | decide saída (`out_pending`) |
| `withdraw_out` | 001 (1: 001) | definer | authenticated | retira a decisão de saída |
| `effect_out` | 001 (1: 001) | definer | authenticated | efetiva a saída |
| `release_cancelled_bed` | 038 (1: 038) | definer | interna (revogada) | libera a cama de um `out_pending` (interna, 038) |
| `open_resident_profile` | 001 (1: 001) | definer | authenticated | lê perfil e grava `access_log` |
| `find_former_resident` | 037 (1: 037) | definer · stable | authenticated | busca ex-morador por PASS ID/nome para re-admissão (037) |
| `stay_chain_start` | 006 (1: 006) | definer · stable | interna (revogada) | início da cadeia de transferências |
| `stays_present_at` | 029 (2: 006,029) | definer · stable | interna (revogada) | estadias presentes num instante (por casa) |
| `stays_present_at_any` | 029 (2: 017,029) | definer · stable | interna (revogada) | idem para várias casas |

### Presença: Room Check, Seen, ausência, No Show

| Função | Última migração (defs) | Modo | Acesso | Resumo |
|---|---|---|---|---|
| `check_slots` | 029 (2: 006,029) | definer · stable | authenticated | horários do Room Check |
| `pending_slots` | 029 (2: 006,029) | definer · stable | authenticated | horários ainda pendentes |
| `open_room_check` | 032 (4: 006,014,029,032) | definer | authenticated | abre/obtém o check de um horário |
| `set_room_check_details` | 006 (1: 006) | definer | authenticated | quem fez/digitou e folha |
| `room_check_sheet` | 006 (1: 006) | invoker · stable | authenticated | folha do check |
| `mark_resident` | 006 (1: 006) | definer | authenticated | marca morador (seen/not_seen/absent) |
| `clear_mark` | 006 (1: 006) | definer | authenticated | limpa marca |
| `launch_room_check` | 007 (2: 006,007) | definer | authenticated | lança o check (vira evidência) |
| `room_check_typing_times` | 006 (1: 006) | definer · stable | authenticated | horários de digitação (gestão) |
| `room_check_done` | 032 (4: 007,014,029,032) | definer | authenticated | resumo do check |
| `register_absence` | 006 (1: 006) | definer | authenticated | ausência comunicada |
| `end_absence` | 006 (1: 006) | definer | authenticated | encerra ausência |
| `absence_effective_end` | 006 (1: 006) | invoker · immutable | interna (revogada) | fim efetivo da ausência |
| `active_absence` | 006 (1: 006) | definer · stable | interna (revogada) | ausência vigente num instante |
| `overdue_absences` | 029 (2: 006,029) | definer · stable | authenticated | ausências vencidas |
| `record_sighting` | 029 (2: 006,029) | definer | authenticated | avistamento manual (Seen) |
| `resident_evidence` | 010 (2: 006,010) | definer · stable | interna (revogada) | evidência (marcas + avistamentos) por turno |
| `seen_for_day` | 029 (2: 006,029) | definer · stable | authenticated | vistos no dia |
| `residents_without_evidence` | 029 (2: 006,029) | definer · stable | interna (revogada) | candidatos a No Show |
| `no_show_month_count` | 006 (1: 006) | definer · stable | interna (revogada) | contagem mensal de No Show |
| `no_show_review` | 029 (2: 006,029) | definer · stable | authenticated | revisão do dia (redefinida em maiúsculas, 029) |
| `confirm_no_shows` | 029 (2: 006,029) | definer | authenticated | confirma No Shows e notifica limite mensal |
| `undo_no_show` | 006 (1: 006) | definer | authenticated | desfaz (`undone`) |
| `presence_alert` | 029 (2: 006,029) | definer · stable | authenticated | alertas de presença |

### Handover, rondas, tarefas, manutenção e advertências

| Função | Última migração (defs) | Modo | Acesso | Resumo |
|---|---|---|---|---|
| `insert_handover_entry` | 029 (2: 007,029) | definer | authenticated | insere entrada genérica (usada por todas as RPCs) |
| `add_handover_note` | 029 (5: 007,016,023,027,029) | definer | authenticated | anotação com tags, autor e até 3 colegas (assinatura mais recente: 029) |
| `check_entry_correction` | 007 (1: 007) | definer · stable | interna (revogada) | valida janela de correção/autoria |
| `correct_handover_note` | 007 (1: 007) | definer | authenticated | corrige anotação |
| `void_handover_note` | 007 (1: 007) | definer | authenticated | anula com motivo |
| `handover_typing_times` | 007 (1: 007) | definer · stable | authenticated | horário de digitação (gestão) |
| `round_slots` | 007 (1: 007) | definer · stable | authenticated | horários de ronda |
| `pending_rounds` | 029 (2: 007,029) | definer · stable | authenticated | rondas pendentes |
| `handover_fill_default` | 025 (3: 016,018,025) | trigger | interna (revogada) | trigger BEFORE INSERT: preenche `filled_by` e `shift_id` |
| `search_handover` | 029 (2: 028,029) | definer · stable | authenticated | busca por período e filtros (028/029) |
| `set_handover_tag` | 023 (1: 023) | definer | authenticated | mostrar/ocultar tag |
| `add_handover_tag` | 036 (1: 036) | definer | authenticated | cria tag (036) |
| `update_handover_tag` | 036 (1: 036) | definer | authenticated | edita tag |
| `move_handover_tag` | 036 (1: 036) | definer | authenticated | reordena tag |
| `match_rota_shift` | 029 (3: 018,025,029) | definer · stable | interna (revogada) | turno da escala que corresponde a quem abriu |
| `open_handover_shift` | 029 (4: 018,025,026,029) | definer | authenticated | abre turno (Office/Float, horário informado) |
| `close_handover_shift` | 026 (3: 018,025,026) | definer | authenticated | encerra turno e passa o serviço |
| `shift_hours_review` | 018 (1: 018) | definer · stable | authenticated | revisão de horas do turno |
| `confirm_shift_hours` | 025 (2: 018,025) | definer | authenticated | gestão confirma horas (vira `work_intervals`) |
| `shift_tasks` | 029 (2: 007,029) | definer · stable | authenticated | tarefas do turno |
| `pending_tasks` | 029 (2: 007,029) | definer · stable | authenticated | tarefas pendentes |
| `sign_task` | 029 (3: 007,019,029) | definer | authenticated | assina tarefa (assinatura mais recente 019/029) |
| `auto_sign_task` | 029 (2: 010,029) | definer | interna (revogada) | assinatura automática por `auto_key` |
| `create_task_template` | 029 (2: 007,029) | definer | authenticated | cria template de tarefa |
| `set_task_template_active` | 019 (1: 019) | definer | authenticated | ativa/desativa template |
| `create_extra_task` | 029 (2: 007,029) | definer | authenticated | cria tarefa extra |
| `reassign_extra_task` | 007 (1: 007) | definer | authenticated | reatribui extra |
| `my_task_alerts` | 007 (1: 007) | definer · stable | authenticated | alertas de tarefas do chamador |
| `create_maintenance` | 029 (2: 007,029) | definer | authenticated | abre chamado (idempotente por `request_key`) |
| `maintenance_set_status` | 007 (1: 007) | definer | authenticated | muda status |
| `maintenance_list` | 029 (2: 007,029) | definer · stable | authenticated | lista chamados |
| `maintenance_reminders` | 007 (1: 007) | definer · stable | authenticated | lembretes |
| `snooze_maintenance_reminder` | 007 (1: 007) | definer | authenticated | adia lembrete |
| `record_warning` | 037 (3: 007,018,037) | definer | authenticated | Warning/Final Warning (037; texto 'Final Warning') |
| `deactivate_final_warning` | 007 (1: 007) | definer | authenticated | desativa FW (reescrita por DO na 037) |
| `has_final_warning` | 007 (1: 007) | definer · stable | authenticated | morador tem FW ativo (reescrita na 037) |
| `warning_notify` | 023 (1: 023) | trigger | interna (revogada) | trigger AFTER INSERT em `warnings`: notificação |
| `pending_counts` | 029 (2: 007,029) | definer · stable | authenticated | contadores de pendências |

### Serviços: Fridge, Delivery, Dinner, Laundry

| Função | Última migração (defs) | Modo | Acesso | Resumo |
|---|---|---|---|---|
| `record_fridge_temperature` | 029 (3: 010,014,029) | definer | authenticated | leitura legada de temperatura |
| `record_fridge_reading` | 014 (1: 014) | definer | authenticated | leitura por geladeira (014) |
| `laundry_entry_body` | 014 (1: 014) | invoker · immutable | interna (revogada) | texto da nota de lavanderia |
| `record_food_delivery` | 037 (5: 010,014,016,029,037) | definer | authenticated | entrega: fornecedor, lote, validade (assinatura de 037) |
| `ensure_dinner_service` | 029 (2: 010,029) | definer | interna (revogada) | garante o jantar do dia |
| `dinner_stays` | 029 (2: 010,029) | definer · stable | interna (revogada) | estadias do jantar |
| `mark_dinner` | 029 (3: 010,014,029) | definer | authenticated | marca refeição servida |
| `close_dinner` | 029 (2: 010,029) | definer | authenticated | fecha o jantar |
| `dinner_summary` | 029 (2: 010,029) | definer · stable | authenticated | resumo/sobras |
| `dinner_sheet` | 029 (2: 010,029) | definer · stable | authenticated | folha do jantar |
| `start_laundry` | 014 (2: 010,014) | definer | authenticated | inicia uso |
| `finish_laundry` | 014 (2: 010,014) | definer | authenticated | finaliza uso |
| `laundry_status` | 029 (2: 010,029) | definer · stable | authenticated | estado das máquinas |
| `add_supplier` | 037 (1: 037) | definer | authenticated | cria fornecedor (037) |
| `update_supplier` | 037 (1: 037) | definer | authenticated | edita fornecedor e propaga nome |
| `link_delivery_to_order` | 037 (1: 037) | definer | authenticated | liga entrega a pedido Tesco; nota automática no Handover |

### Notificações e push

| Função | Última migração (defs) | Modo | Acesso | Resumo |
|---|---|---|---|---|
| `my_notifications` | 029 (2: 010,029) | definer · stable | authenticated | notificações do chamador |
| `mark_notification_read` | 010 (1: 010) | definer | authenticated | marca lida |
| `unread_notifications_count` | 029 (2: 010,029) | definer · stable | authenticated | contagem de não lidas |
| `push_keys` | 023 (1: 023) | invoker · immutable | interna (revogada) | chaves de preferência por tipo |
| `push_default` | 023 (1: 023) | definer · stable | interna (revogada) | padrão de preferência |
| `push_recipients` | 023 (1: 023) | definer · stable | interna (revogada) | destinatários |
| `my_push_prefs` | 023 (1: 023) | definer · stable | authenticated | preferências do chamador |
| `set_push_pref` | 023 (1: 023) | definer | authenticated | grava preferência |
| `save_push_subscription` | 023 (1: 023) | definer | authenticated | guarda assinatura PWA |
| `remove_push_subscription` | 023 (1: 023) | definer | authenticated | remove assinatura |
| `notify_push` | 024 (1: 024) | trigger | interna (revogada) | trigger AFTER INSERT em `notifications`: chama Edge send-push via pg_net/Vault (falha silenciosa) |

### Compras, estoque e pedidos Tesco

| Função | Última migração (defs) | Modo | Acesso | Resumo |
|---|---|---|---|---|
| `upsert_product` | 011 (1: 011) | definer | authenticated | produto |
| `create_purchase` | 013 (2: 011,013) | definer | authenticated | compra com linhas |
| `purchase_prices` | 011 (1: 011) | definer · stable | authenticated | preços (só gestão) |
| `allocate_purchase_line` | 029 (2: 011,029) | definer | authenticated | aloca linha a casa |
| `transfer_product` | 013 (2: 011,013) | definer | authenticated | transferência entre casas |
| `create_shop_order` | 017 (1: 017) | definer | authenticated | pedido Tesco |
| `set_shop_line` | 017 (1: 017) | definer | authenticated | linha do pedido |
| `set_shop_order` | 037 (2: 017,037) | definer | authenticated | dados do pedido |
| `set_shop_order_status` | 037 (1: 037) | definer | authenticated | status created/placed/awaiting/delivered (037) |
| `update_shop_item` | 017 (1: 017) | definer | authenticated | item da lista |
| `shop_order_total` | 017 (1: 017) | definer · stable | authenticated | total do pedido |

### Equipe: escala, horas, férias

| Função | Última migração (defs) | Modo | Acesso | Resumo |
|---|---|---|---|---|
| `save_rota_shift` | 029 (2: 011,029) | definer | authenticated | grava turno da Rota |
| `cancel_rota_shift` | 011 (1: 011) | definer | authenticated | cancela |
| `split_rota_shift` | 016 (1: 016) | definer | authenticated | divide |
| `coverage_gaps` | 013 (3: 011,012,013) | definer · stable | authenticated | buracos de cobertura (012/013) |
| `publish_rota` | 016 (3: 011,013,016) | definer | authenticated | publica a Rota |
| `adjust_work_interval` | 013 (2: 011,013) | definer | authenticated | ajusta horas |
| `add_work_interval` | 029 (3: 011,013,029) | definer | authenticated | adiciona horas |
| `staff_hours` | 016 (3: 011,013,016) | definer · stable | authenticated | horas previstas x trabalhadas |
| `staff_work_log` | 016 (3: 011,013,016) | definer · stable | authenticated | diário de trabalho |
| `vacation_conflicts` | 011 (1: 011) | definer · stable | interna (revogada) | conflitos de férias |
| `register_vacation` | 017 (2: 011,017) | definer | authenticated | registra férias |
| `cancel_vacation` | 011 (1: 011) | definer | authenticated | cancela |
| `set_vacation_status` | 017 (1: 017) | definer | authenticated | status |
| `lock_holiday_dates` | 017 (1: 017) | definer | authenticated | bloqueia datas |
| `unlock_holiday_dates` | 017 (1: 017) | definer | authenticated | libera |
| `holiday_calendar` | 017 (1: 017) | definer · stable | authenticated | calendário anual |

### Relatórios, painéis, auditoria

| Função | Última migração (defs) | Modo | Acesso | Resumo |
|---|---|---|---|---|
| `report_details` | 029 (4: 011,013,017,029) | definer · stable | authenticated | detalhe mensal |
| `report_monthly` | 029 (4: 011,013,017,029) | definer · stable | authenticated | relatório mensal |
| `report_details_period` | 029 (2: 017,029) | definer · stable | authenticated | detalhe por período |
| `report_period` | 029 (2: 017,029) | definer · stable | authenticated | relatório por período (reescrito por DO na 037) |
| `report_purchases` | 020 (1: 020) | definer · stable | authenticated | relatório de compras (reescrito por DO na 037) |
| `person_summary` | 027 (2: 021,027) | definer · stable | authenticated | resumo de pessoa |
| `home_dashboard` | 038 (3: 022,029,038) | definer · stable | authenticated | painéis da Home (assinatura trocada na 038) |
| `search_audit` | 031 (1: 031) | definer · stable | authenticated | busca no Audit |
| `search_access_log` | 031 (1: 031) | definer · stable | authenticated | busca no log de acesso |

### Triggers genéricos e de domínio

| Função | Última migração (defs) | Modo | Acesso | Resumo |
|---|---|---|---|---|
| `bump_version` | 001 (1: 001) | trigger | interna (revogada) | controle otimista |
| `audit_row` | 001 (1: 001) | trigger | interna (revogada) | auditoria |
| `audit_immutable` | 001 (1: 001) | trigger | interna (revogada) | bloqueia UPDATE/DELETE em logs |
| `staff_on_deactivate` | 001 (1: 001) | trigger | interna (revogada) | desativação |
| `staff_sync_locale` | 005 (1: 005) | trigger | interna (revogada) | sincroniza idioma |
| `stays_check_bed` | 035 (2: 001,035) | trigger | interna (revogada) | valida cama |

## 4. Regras de negócio no banco (resumo) 🟢

- **Dia operacional 07:00-07:00 Europe/Dublin**; `slot_instant` coloca horários antes das 07h no dia seguinte; Float 12:00-24:00 (`012` corrigiu janela de 36 h).
- **Futuro bloqueado** (+5 min de tolerância): `admitted_in_future`, `check_in_future`, `round_in_future`, `invalid_time`.
- **Janela de correção** `records.correction_window_hours` (72 h): `correction_window_closed`, `not_author`; anulações exigem motivo, nada é apagado.
- **Casa**: toda RPC de escrita valida `can_see_lodge` e `can_write_lodge`; `not_authorised` (42501).
- **No Show**: candidatos = moradores sem evidência no dia (marcas `seen` do Room Check + `sightings`); contagem mensal gera notificação ao atingir `presence.no_show_monthly_alert`.
- **Warnings**: dois tipos (`warning`, `final_warning`); `final_warning_active` (23505) impede dois FW ativos; cria entrada no Handover (`insert_handover_entry`) e notifica.
- **Tesco**: `created → placed → awaiting → delivered`; ao ligar entrega (`link_delivery_to_order`) grava nota automática com tag `delivery` no Handover e vincula `delivery_id`/`order_id`.
- **Validade**: `delivery.expiry_alert_days` (default 3) gera aviso `delivery_expiring`; fornecedores definem `require_batch/best_before/temperature` e `links_order` (`Tesco`: nenhum obrigatório, liga pedido; `Ripley's`: lote e validade).
- **Push**: preferências por tipo (`push_prefs`) e destinatários via `push_recipients`; só Admins.
- **Erros** (`errcode` + texto curto) mapeados no front em `lib/errors.ts` (97 regras).

## 5. Riscos e lacunas 🟡/🔴

- 🟡 O texto exato final de `report_period`, `report_purchases`, `set_system_parameter`, `has_final_warning`, `deactivate_final_warning` só existe após a execução dos `DO` da 037 (substituições de string frágeis: se o texto-base mudar, o `replace` não falha, apenas não altera). Sem banco, não foi possível ler o `pg_get_functiondef` vigente.
- 🟡 `push_recipients`/`push_keys` definem quem recebe: conferir em `src/lib` a lista de chaves para não divergir.
- 🔴 Sem agendador (`pg_cron`) nas migrações; "pendências" são calculadas na leitura, nunca por job.
- 🟡 Redefinições repetidas (ex.: `add_handover_note` 5x; `open_room_check` 4x) ampliam o risco de divergência entre assinaturas; as antigas foram dropadas explicitamente (`drop function if exists`) nas migrações 016, 019, 023, 025, 026 e 027 para evitar ambiguidade de overload.
