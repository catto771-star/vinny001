# Módulo: ocorrencias-e-passagem-de-turno — Análise de código

> Arqueólogo Reversa · doc_level=completo · pt-br · 🟢 confirmado · 🟡 inferido · 🔴 lacuna (ver `_reversa_sdd/questions.md`)
> Siglas: `M07`=`supabase/migrations/20261120000007_occurrences.sql`, `M10`=`..._000010_services.sql`, `M16`=`20261124000016_beta_profiles.sql`, `M18`=`20261125000018_handover_shifts.sql`, `M23`=`..._000023_handover_tags_push.sql`, `M24`=`..._000024_push_hook.sql`, `M25`=`..._000025_float_shift.sql`, `M26`=`..._000026_shift_times.sql`, `M27`=`..._000027_handover_coauthors.sql`, `M28`=`..._000028_handover_search.sql`, `M29`=`..._000029_house_scope.sql`, `M32`=`..._000032_more_settings.sql`, `M36`=`..._000036_tags_admin.sql`, `M37`=`20261126000037_r15.sql`. Vale a definição mais recente.

## 1. Escopo e arquivos

| Camada | Arquivos |
|---|---|
| Páginas | `src/pages/Handover.tsx` (697 l.), `Maintenance.tsx` (365), `Warnings.tsx` (164) |
| Componentes | `src/components/MaintenanceDialog.tsx`, `WarningDialog.tsx`, `StaffPicker.tsx`, `ResidentPicker.tsx`, `FilterBar.tsx` |
| Libs | `src/lib/occurrences.ts` (47), `useOnDuty.ts`, `useStaffList.ts`, `filters.ts`, `useUrlFilters.ts`, `time.ts` |
| SQL | `M07:1-210` (Handover), `M07:213-306` (rondas), `M07:508-678` (manutenção), `M07:680-754` (warnings), `M16:44-113`, `M18`, `M23`, `M25`, `M26`, `M27`, `M28`, `M29`, `M32:67-147`, `M36`, `M37:1-49` |
| Testes | `tests/db/occurrences.test.ts`, `handover-coauthors.test.ts`, `handover-search.test.ts`, `tags-admin.test.ts`, `r15.test.ts`; `src/lib/occurrences.test.ts`, `src/pages/occurrences.ui.test.tsx`, `MaintenanceReminder.test.tsx`, `src/components/FilterBar.test.tsx` |

Fora de escopo (outros módulos, apenas referenciados): Daily Tasks (`shift_tasks`, `sign_task`, `task_*`), jantar/lavanderia/geladeira que também escrevem no Handover (`laundry_entry_body`, `mark_dinner` — `M14`), push (`send-push`, `push_*`), `rota_shifts`/horas (`shift_hours_review`, `confirm_shift_hours`).

## 2. Handover (Livro Ata)

### 2.1 Entidade e tipos de entrada 🟢
`handover_entries.kind` ∈ `note, round, maintenance, warning, laundry, shift` (constraint final em `M18:5-7`; evolução `M07:45` → `M10:5-7` (+laundry) → `M18` (+shift)). Mapa de rótulos do front: `Handover.tsx:51-58`. Invariante: `(kind='round') = (round_slot is not null)` (`M07:58`) e um round por `(lodge, operational_day, round_slot)` (`handover_one_round_per_slot`, `M07:61`).
Entradas são **imutáveis em conteúdo de fato**: correção edita `body`; "apagar" é `status='voided'` com motivo (`M07:179-196`). Não há DELETE (sem GRANT de escrita; `M07:843-850`).

### 2.2 `insert_handover_entry` (interna; vigente `M29:567-588`) 🟢
Parâmetros `(lodge, kind, body, occurred_at, mentions jsonb, late_reason?, round_day?, round_slot?)`. `can_see_lodge`; INSERT com `body=trim`, `operational_day = coalesce(round_day, operational_day(occurred_at))`, `author_id = current_staff_id()`; itera `mentions` (`[{resident_id}|{staff_id}]`) e grava `handover_mentions` (check XOR resident/staff, `M07:69`). SECURITY DEFINER; sem GRANT a authenticated (revogada, `M07:869`) → só interna. Usada por notas, rondas, manutenção, warnings (e serviços).

### 2.3 Trigger `handover_fill_default` (BEFORE INSERT; vigente `M25:25-54`) 🟢
Preenche `shift_id` e `filled_by` (quem preencheu):
1. Procura turno **Office** do lodge (`function='office'`) aberto: `opened_at <= greatest(occurred_at, now()-12h)` e (`closed_at is null or closed_at > occurred_at`), o mais recente.
2. `shift_id` ← esse turno se `occurred_at >= opened_at − 5 min`.
3. `filled_by` (se nulo) ← `coalesce(app.filled_by (config de sessão), staff do turno, [se role=station] on_duty_staff(lodge, occurred_at), current_staff_id())`.
Histórico: `M16:44` (só filled_by) → `M18:56` (shift) → `M25:25` (restringe a Office).
`app.filled_by` é injetado por `add_handover_note` via `set_config(..., true)` (local à transação) — mecanismo de passar "quem preenche" ao trigger 🟢.
`on_duty_staff(lodge, at)` (`M16:25-36`, escopo M29:722): `rota_shifts` publicados cobrindo `at`; prefere `office` da casa, senão `float`; mais recente.

### 2.4 `add_handover_note` (vigente `M29:79-134`; assinatura 8 params: `p_lodge, p_body, p_occurred_at, p_mentions, p_late_reason, p_filled_by?, p_tags?, p_co_authors?`) 🟢
Sequência:
1. `can_see_lodge` + staff ativo + `can_write_lodge` (`42501`).
2. `body_required` se vazio; `invalid_time` se `occurred_at > now()+5min`.
3. `p_filled_by` deve ser staff ativo com papel `porter|manager|owner|developer` (`invalid_filled_by`) — **exclui `station`**.
4. **Co-autores**: dedup preservando ordem (`unnest ... with ordinality`, `min(ord)`), remove o próprio `p_filled_by`; `> 3` → `too_many_authors`; cada um deve ser staff ativo nos mesmos papéis (`invalid_co_author`). (Máximo "4 pessoas no total": 1 filled_by + 3.) Nota: se `p_filled_by` é nulo, a filtragem `c.id is distinct from p_filled_by` não remove ninguém.
5. **Tags**: cada tag deve existir e `visible` (`invalid_tag`).
6. **Atraso**: se `now() > shift_end(v_at)` e não gestão → exige `p_late_reason ∈ handover.late_reasons` (`late_reason_required`). Motivos iniciais `["other_occurrence","system_failure","forgot","info_received_later"]` (`M07:36-37`). `late_reason` só é gravado quando de fato há atraso (mesmo para gestão, que não precisa informar).
7. Insere via `insert_handover_entry(kind='note')`; depois `handover_entry_tags` (distinct) e `handover_entry_staff(entry, staff, position=ordinality)`.
8. **Notificação**: se há tags, INSERT em `notifications(kind='handover_tag', audience='management', payload{entry_id, tags[codes ordenados por sort_order], excerpt=left(trim(body),140)})` — independe de a tag ter `notify_default` (o filtro é por preferência no push, ver §6) 🟢.
Histórico: `M07:120` (5 params) → `M16:66` → `M23:68` (tags) → `M27:19` (co-autores) → `M29:79` (escopo).
`shift_end(ts)` (`M07:8-19`): fim do turno Day(7–19h)/Night(19–7h) de Dublin que contém `ts`. Espelho: `occurrences.ts:shiftEnd` (`:4-10`) e `isLateFact` (`:13-15`) 🟢. Os limites 7/19 são **literais** (não leem `shift.day_start/night_start`) 🟡.

### 2.5 Correção e anulação
`check_entry_correction(entry)` (`M07:145-159`): gestão passa; senão `can_write_lodge`, `author_id = current_staff_id()` (`not_author`), `created_at >= now() - correction_window()` (72 h; `correction_window_closed`).
- `correct_handover_note(id, body)` (`M07:161-177`): `entry_not_found`; bloqueia `kind='round'` (`round_not_editable`); `body_required`; só atualiza `body`. **Não** reconstrói menções/tags/co-autores 🟡 (menções ficam as originais mesmo que o texto mude).
- `void_handover_note(id, reason)` (`M07:179-196`): exige motivo (`reason_required`); `status='voided'`, `voided_by/at`. Não bloqueia `round` (anular ronda é permitido) 🟡. O índice único `handover_one_round_per_slot` não filtra `status`, logo uma ronda anulada **impede** registrar outra no mesmo slot (`room_check_done` retorna `already_recorded` do id anulado) 🟡.
- UI: ações editar/anular só em `kind==='note'` ativas e `isManagement || (author_id === me.id && canWrite)` (`Handover.tsx:310`). Para conta de casa (`station`), o `author_id` é a conta da casa, não a pessoa (`filled_by`) 🟡.
- `handover_typing_times(ids[])` (`M07:198-208`): só gestão; retorna `created_at` (horário de digitação) por entrada; a coluna `created_at` não está no GRANT SELECT (`M07:847-848`).

### 2.6 Rondas ("Room Check Done") — `round_slots`, `room_check_done`, `pending_rounds`
- `round_slots()` (`M07:213-220`) = parâmetro `rounds.hours` (12 horários de 2 em 2 h).
- `room_check_done(lodge, day, slot)` (vigente `M32:117-147`): `can_see` + `can_write`; `slot ∈ round_slots` (`invalid_round_slot`); `slot_instant(day,slot) > now()+janela` → `round_in_future` (janela = `presence.check_window_minutes`, padrão 60); idempotente: se já existe round do slot retorna `{status:'already_recorded', entry_id}`; senão insere `'Room Check Done'` com `occurred_at=now()` (hora real) e `round_slot`; `unique_violation` concorrente → trata como `already_recorded`. Retorna `{status:'recorded', entry_id}`.
  Histórico: janela 15 min (`M07:235`) → 60 min (`M14:21`) → parâmetro (`M32`).
- `pending_rounds(lodge)` (`M07:253-269`, escopo M29:862): slots do dia atual cujo `slot_instant + 30 min <= now()` sem linha round → "esquecidas".
- Front: faixa de rondas só se `day===today` (`Handover.tsx:191`); chip habilitado se `slot <= agora+60 min` (**60 fixo no front**, `:196`, vs. parâmetro do banco 🟡) e `canWrite`; "esquecida" = slot+30 min ≤ agora (`:198`); `groupRounds` (`:61-71`) agrupa rondas **consecutivas ativas** numa linha única no filtro "all".
- Ligação com Presença: `launch_room_check` cria a mesma ronda automaticamente (ver `moradores-e-presenca` §4.5).

### 2.7 Turnos do Livro Ata (`handover_shifts`)
`open_handover_shift(lodge, staff, function='office', at?)` (vigente `M29:739-771`):
- `can_see`/`can_write`; `function ∈ {office, float}` (`invalid_function`); `at ∈ [now−24h, now+5min]` (`invalid_time`); `p_staff` ativo com papel `porter|manager|owner|developer` (`invalid_filled_by`).
- **Unicidade**: já existe turno aberto da mesma função (float: global; office: da casa) → `shift_already_open` (23505); reforçado pelos índices `handover_shifts_one_open` (por lodge, office) e `handover_shifts_one_float` (global) (`M25:3-6`).
- Liga ao Roster: `match_rota_shift(staff, lodge, at, function)` (`M25:9-23`, M29:670): turno `published` da pessoa cuja janela `[starts_at−3h, ends_at)` contém `at`, mais próximo do início; para float casa `function='float'`; para office `lodge_id = lodge or null`.
- Insere entrada `kind='shift'` "Shift opened — Nome" ("Float shift opened — …"); `shift_id` só para office (float fica `null` na entrada).
`close_handover_shift(shift, handed_to?, note?, at?)` (`M26:39-86`; escopo posterior? não redefinida em M29 → sem `can_see_lodge`, só `can_write_lodge`): `for update`; `shift_already_closed`; `at ∈ [opened_at, now+5min]` (`invalid_time`); `handed_to` válido; `hours_status='pending'`; entrada `Shift closed — Nome [handed over to X][. nota]`; compara com o Roster: divergência `> 900 s` em início **ou** fim, ou ausência de turno do Roster → notificação `shift_hours_review` (gestão); se `handed_to` → abre automaticamente o turno do próximo com a mesma função e horário (`open_handover_shift(lodge, handed_to, function, at)`) e devolve o novo id; senão devolve `null`.
Fila de horas: `shift_hours_review()` / `confirm_shift_hours()` (`M18:161-229`, `M25:134`) pertencem a `equipe-escala-e-horas` (referência).
Front `ShiftBar` (`Handover.tsx:380-478`): Office por casa e Float global; carregamento `handover_shifts` com `closed_at is null`; quem assume padrão = pessoa escalada (`onDutyFor`); `open()` envia `p_at = startAt`; `close()` envia `p_handed_to` ou `null` e `p_at = endAt`. Barras visíveis só se `canWrite && day === today`.

### 2.8 Busca — `search_handover` (vigente `M29:1364-1393`) 🟢
Parâmetros `(lodge, from, to, q?, kinds[]?, tags[]?, staff?, resident?, function?, include_voided=false, limit=100)`. Validações: `can_see_lodge`, staff ativo; `from/to` não nulos, finitos, `to>=from` (`invalid_range`); `to - from > 92` dias (`range_too_large`). Filtros: janela `occurred_at ∈ [operational_day_start(from), operational_day_start(to+1))`; `status='active'` salvo `include_voided`; `body ILIKE` com escape de `\ % _`; `kind = any(kinds)`; `tags` (qualquer); `staff` casa `filled_by`, `author_id` **ou** co-autor; `resident` via `handover_mentions`; `function` via `handover_shifts.function`. Ordem `occurred_at desc`, `limit` clamp 1–100. Retorna só colunas leíveis (sem `created_at`).
Front: qualquer filtro ativo troca de listagem por dia para `search_handover` (`searching`, `Handover.tsx:104,114-121`); padrão últimos 30 dias até o dia escolhido (`from = to − 29`); filtros em URL (`useUrlFilters`).
Listagem normal (sem filtro): `handover_entries` com `or(occurred_at no dia operacional, operational_day = day)` (`:128`) — inclui rondas cujo `operational_day` é o dia embora `occurred_at` caia depois da meia-noite.

### 2.9 Menções e co-autores (UI)
`mentionQuery(text, caret)` (`occurrences.ts:28-32`): regex `(?:^|\s)@([\p{L}\p{N}'-]{0,30})$` sobre o texto até o cursor. `insertMention` substitui o último `@` antes do cursor por `@Nome ` (`:35-41`). `Composer` (`Handover.tsx:480-661`): sugestões = até 6 (residentes presentes + staff) casando `includes` (case-insens.); Enter/Tab escolhem a 1ª; só envia menções cujo `@Label` ainda existe no corpo (`:560-562`, comparação textual simples 🟡: nomes repetidos/iguais colidem). Menções de residente ligam ao perfil (`/residents/:id`) e alimentam a visão do perfil (`ResidentProfile`: `handover_mentions` limit 50).
`StaffPicker` define `filled_by` e até 3 co-autores; para `isStation` o autor é **obrigatório** (`required={isStation}`, botão desabilitado sem `chosenFiller`, `:654`) 🟢.
Atraso na UI: `late = occurredAt && isLateFact(occurredAt, now) && !isManagement` (`:523`); exige motivo da lista `handover.late_reasons` (lida via `param_value`, `:519`).

### 2.10 Tags do Handover
Tabela `handover_tags` (M23:4-11 + `color` M36:2). Semente: `incident, emergency, health, damage` (notify_default=true), `conduct, visitor, delivery, general` (false). Gestão: `set_handover_tag(tag, visible)` (esconder; `M23:53-64`), `add_handover_tag(label, color, notify)` (`M36:7-29`: rótulo ≤30; cor ∈ {red, amber, blue, green, violet, grey}; **máx. 20 tags**; rótulo único case-insens.; `code` gerado = `lower` com `[^a-z]+→_`, sufixo `_a`, `_b`… (dígito→letra) para manter o formato `^[a-z_]+$` exigido pelas preferências de push), `update_handover_tag` (`:31-42`), `move_handover_tag(tag, dir)` (troca `sort_order` com o vizinho; `:44-58`). Não há exclusão de tag. Front `useHandoverTags(onlyVisible)` (`Handover.tsx:368-375`).

## 3. Manutenção

### 3.1 Estados e regras 🟢
`maintenance_tickets.status` ∈ `open, in_progress, on_hold, resolved, reopened`; `priority` ∈ `urgent, normal, low` (`M07:511-526`). `request_key uuid UNIQUE` = idempotência de clique duplo (B32).
- `create_maintenance(lodge, location, description, priority, request_key)` (vigente `M29:439-470`): `can_see`/`can_write`; se `request_key` já existe retorna `{ticket_id, entry_id, duplicate:true}` (antes de validar prioridade); `invalid_priority`; prazo = `now() + param maintenance.default_deadline_hours[priority]` (padrão seed `{urgent:24, normal:168, low:720}`; fallback 168 h); cria **na mesma transação**: entrada de Handover `kind='maintenance'` com corpo `"<local> — <descrição>"`, ticket, evento `created`, notificação `maintenance_opened` (gestão) com payload `{ticket_id, location, priority}`. Constraints de texto não vazio vêm do CHECK (`location`/`description`) — erro vira `..._check` → `errors.fieldRequired` (`errors.ts:93`).
- `maintenance_set_status(ticket, status?, deadline?, note?)` (`M07:583-629`, **não redefinida**): `for update`; `ticket_not_found`; `invalid_status`; **permissões**: gestão faz tudo; não-gestão só "resolver" e apenas se `my_open_post().function='office'` **e** `lodge_id` = do ticket; qualquer `p_deadline` ou status ≠ `resolved` por não-gestão → `not_authorised`. Efeitos: troca de status grava `resolved_at/by` só ao resolver (**ao reabrir não limpa** `resolved_at/by`, ver §3.3), evento `status(from,to,note)`; mudança de prazo grava evento `deadline` (`from_value/to_value` em texto); o `note` é consumido pelo primeiro evento aplicável, senão cria evento `note`.
  ⚠ Brecha 🟡: `v_post` é composto nulo quando a pessoa não tem posto aberto; a expressão `not (v_post.function = 'office' and v_post.lodge_id = v_t.lodge_id)` resulta em `NULL`, e `IF NULL` não dispara a exceção — logo uma conta **sem posto** (ex.: `station` da casa, no Beta) passaria o teste de autorização para **resolver** qualquer chamado de qualquer casa por RPC (as restrições de prazo/status ≠ resolved continuam valendo). O teste `tests/db/occurrences.test.ts:249-259` cobre Float e Office de outra casa (que têm posto), não a ausência de posto. O front só mostra o botão a `isManagement` ou posto office da casa (`Maintenance.tsx:170,214`), então a UI não expõe o caso.
- `maintenance_list(lodge)` (vigente `M29:608-624`): `overdue = status<>'resolved' and deadline_at < now()`; `last_event_at`; ordena não resolvidos primeiro, por prazo.
- `maintenance_reminders()` (`M07:649-665`): só gestão; chamados não resolvidos com prazo vencido cujo último evento (ou criação) é **anterior** a `greatest(deadline_at, now()-24h)` e sem snooze do usuário nas últimas 24 h. Ou seja: lembra de novo a cada 24 h até haver resposta (B34/B35).
- `snooze_maintenance_reminder(ticket)` (`M07:667-678`): upsert em `maintenance_reminder_snoozes (ticket, staff)` com `snoozed_at=now()`; só gestão.

### 3.2 Front
- `Maintenance` (`Maintenance.tsx:48-159`): abas Abertos/Resolvidos (client-side), filtros URL (texto, prioridade, atrasados, período de criação); criar se `canWriteLodge`.
- `MaintenanceDialog`: `requestKey = crypto.randomUUID()` por instância (`useMemo`); `DEFAULT_HOURS` **hardcoded** `{24,168,720}` só para a dica de prazo (`:11,73`) enquanto o servidor usa o parâmetro 🟡.
- `TicketDialog` (`:161-263`): gestão altera status/prazo; não-gestão com `canResolve = post.function==='office' && post.lodge_id===ticket.lodge_id` só resolve (`:170`). Histórico via `maintenance_events` (ordem decrescente).
- `MaintenanceReminder` (`:265-365`): só gestão; consulta a cada 5 min; botão "X" dispensa por 1 h via `sessionStorage` (`maint.reminder.until`, com try/catch); não aparece enquanto houver `dialog[open]` (MutationObserver) até exibir uma vez; respostas: Resolvido / Em andamento (novo prazo obrigatório) / Em espera (nota obrigatória) / Depois (snooze).

### 3.3 Observações
- Reabertura (`reopened`) mantém `resolved_at/resolved_by` anteriores (o `case` só seta ao resolver e **não zera** nos demais status) → o teste de consistência de `tests/db/stress-workflow.test.ts:225` (`status='resolved' ⇔ resolved_at not null`) não cobre o inverso 🟡.
- Auditoria: apenas `maintenance_tickets` tem `audit_row` (`M07:547`); `maintenance_events` é o histórico funcional.

## 4. Warnings e Final Warning

### 4.1 Tipos 🟢
Apenas `warning` e `final_warning` (`M37:5-8`: converteu dados antigos — `final_written→final_warning`, demais→`warning`; constraint `warnings_type_check`). Funções antigas reescritas por `pg_get_functiondef` + `replace` (`M37:10-23`).

### 4.2 `record_warning(stay, type, note)` (vigente `M37:25-48`) 🟢
`for update` na estadia; `stay_not_open` se encerrada; `can_write_lodge(stay.lodge)`; `invalid_warning_type` (rótulo nulo); `final_warning` com outro FW ativo na mesma estadia → `final_warning_active` (23505; **só na mesma estadia**, não por residente) 🟡; cria entrada `kind='warning'` no Handover (`'Warning'|'Final Warning'` + `': nota'`, mencionando o residente) e linha em `warnings` ligada a ela (`handover_entry_id NOT NULL`). Trigger `warnings_notify` (`M23:115-129`) gera `notifications(kind='warning_recorded', audience='management')` com `{warning_id, type, name}`.
- `deactivate_final_warning(id, reason)` (`M07:731-745`, reescrita M37): só gestão; motivo obrigatório; `active=false` com autor/hora/motivo apenas se `type='final_warning' and active`; senão `warning_not_active`.
- `has_final_warning(resident)` (`M07:747-754`, M37): existe warning `final_warning` ativo do residente (qualquer estadia). Alimenta a etiqueta **FW** na view `bed_occupancy` e na folha do dia.
- Warnings "never expire" (`warnings.neverExpire`): só a gestão desativa FW; `warning` simples nunca é desativável 🟢.
Front: `WarningDialog` (`WarningDialog.tsx`) lista residentes com `stay_id` (inclui `out_pending`; `record_warning` aceita qualquer estadia não encerrada); `Warnings.tsx` lista por lodge (limit 200), filtros e desativar FW (gestão).

## 5. Pendências relacionadas
`pending_counts(lodge)` (`M07:812-827`, M29:841): `{tasks, maintenance (chamados não resolvidos), absences, checks, rounds, no_shows (candidatos de ontem)}` — alimenta as "bolinhas" de navegação (`src/lib/pending.ts`).

## 6. Notificações e push (interface do módulo)
`notifications` criadas por este módulo: `handover_tag`, `maintenance_opened`, `warning_recorded`, `shift_hours_review`. `notify_push()` (`M24:3-24`, trigger AFTER INSERT em `notifications`): se existir `net.http_post` e o Vault tiver `push_hook_url/push_hook_secret` chama a edge function `send-push` com `{notification_id}`; qualquer exceção é engolida (push nunca bloqueia o registro). `push_keys(kind, payload)` (`M23:132-143`) mapeia: `handover_tag → 'tag:<code>'` (uma por tag), `maintenance_opened → 'maintenance:<priority>'`, `warning_recorded → 'warning'`, `shift_hours_review`, `fridge_out_of_range`. Padrão de envio (`push_default`, `M23:145-155`): tags com `notify_default`, `maintenance:urgent`, `warning`, `shift_hours_review`, `fridge_out_of_range`; preferências por Admin sobrepõem (`push_prefs`). Destinatários: staff ativo `manager|owner|developer` (`push_recipients`, `M23:158-170`). Detalhes no módulo `notificacoes-e-push`.

## 7. Tratamento de erros (UI)
Todas as chamadas usam `errorKey(error)` (`src/lib/errors.ts:104-112`). Códigos deste módulo: `late_reason_required` (casa `/reason_required/` em `errors.ts:94` → `errors.reasonRequired`; confirmado na revisão) 🟢; `invalid_time` (casa `/invalid_.*time|admitted_in_future/` → `errors.invalidTime`); `body_required` → `fieldRequired`; `too_many_authors`, `invalid_co_author`, `invalid_filled_by`, `invalid_tag`, `tag_exists`, `invalid_color`, `too_many_tags`, `shift_already_open`, `shift_already_closed|shift_not_found` → `shiftClosed`; `final_warning_active`; `warning_not_active`; `round_not_editable|run_launched` → `runLaunched`; `invalid_priority` (sem regra → generic 🟡); `ticket_not_found` (`_not_found` → `notFound`); `invalid_status`; `invalid_function`; `range_too_large|invalid_range` → `invalidRange`; `correction_window_closed`; `not_author` (e a colisão com `not_authorised`, ver `acesso-e-autenticacao`).
Concorrência: `bump_version` (handover_entries, maintenance_tickets, warnings) ⇒ `stale_version`.

## 8. Escopo por casa
`insert_handover_entry`, `add_handover_note`, `create_maintenance`, `maintenance_list`, `search_handover`, `room_check_done`, `pending_rounds`, `open_handover_shift` têm `can_see_lodge` (M29). Sem `can_see_lodge`: `correct_handover_note`, `void_handover_note` (usam `check_entry_correction` → `can_write_lodge`), `maintenance_set_status`, `close_handover_shift`, `record_warning` (usa `can_write_lodge`), `maintenance_reminders`. Leituras diretas (`handover_entries`, `warnings`, `maintenance_tickets`, mentions, tags) são cobertas pela política restritiva `house_scope` em tabelas com `lodge_id` (`M29:30-42`) e por joins para filhas (`M29:60-69`) — mas **`warnings` e `maintenance_events` têm `lodge_id`/ticket**: `warnings` tem `lodge_id` ✔ (coberta), `handover_entry_staff` ✔ (`M29:64-65`). 🟢
