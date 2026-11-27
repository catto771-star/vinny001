# Módulo: moradores-e-presenca — Análise de código

> Arqueólogo Reversa · doc_level=completo · pt-br · 🟢 confirmado · 🟡 inferido · 🔴 lacuna (ver `_reversa_sdd/questions.md`)
> Siglas de migração: `M01`=`20261120000001_foundation.sql`, `M06`=`..._000006_presence.sql`, `M07`=`..._000007_occurrences.sql`, `M10`=`..._000010_services.sql`, `M14`=`20261124000014_beta_operations.sql`, `M29`=`20261125000029_house_scope.sql`, `M32`=`20261125000032_more_settings.sql`, `M35`=`..._000035_bed_room_active.sql`, `M37`=`20261126000037_r15.sql`, `M38`=`20261126000038_r16.sql`. Vale a definição mais recente de cada função.
> Termos: "dia operacional" = 07h→07h (Europe/Dublin); "Lodge/casa" = Amiens ou Connolly.

## 1. Escopo e arquivos

| Camada | Arquivos |
|---|---|
| Páginas | `src/pages/Residents.tsx`, `ResidentProfile.tsx`, `BedMap.tsx`, `Seen.tsx`, `Absences.tsx`, `NoShows.tsx`, `DailySheet.tsx`, `PrintSheet.tsx` |
| Componentes | `src/components/AdmitDialog.tsx` (inclui `FreeBedSelect`), `AnticipateDialog.tsx`, `BedBoard.tsx`, `ResidentPicker.tsx`, `PresenceAlertCard.tsx` |
| Libs | `src/lib/presence.ts`, `useOccupancy.ts`, `time.ts`, `rooms.ts`, `activeLodge.tsx`, `types.ts` |
| SQL | `M01:420-679` (residentes/estadias/Out), `M06` (presença inteira), `M07:793-807` (`bed_occupancy` v2 com FW), `M10:312-333` (`resident_evidence` v2 com Dinner), `M14:41-87`, `M29` (escopo por casa), `M32:67-147`, `M35`, `M37:51-102`, `M38:1-83` |
| Testes | `tests/db/presence.test.ts`, `foundation.test.ts`, `house-scope.test.ts`, `r15.test.ts`, `r16.test.ts`, `review-2/3.test.ts`; `src/pages/Seen*.test.tsx`, `NoShows.test.tsx`, `DailySheet.test.tsx`, `ResidentProfile.test.tsx`, `src/components/AdmitDialog.test.tsx`, `BedBoard.test.tsx`, `src/lib/presence.test.ts`, `useOccupancy.test.ts` |

**Fora do escopo deste módulo:** `src/pages/Vacations.tsx` trata de **férias da equipe** (RPCs `holiday_calendar`, `register_vacation`, `set_vacation_status`, `lock_holiday_dates`; `Vacations.tsx:59-255`), pertence a `equipe-escala-e-horas` 🟢 (registrado em questions.md).

## 2. Residentes e estadias

### 2.1 Modelo de ciclo de vida de uma estadia (`stays.status`) 🟢
`active → out_pending → ended` e `active → ended(transfer)` (`M01:21-22,436-455`).
- `admit_resident` cria `active`.
- `decide_out` (`M01:575-599`): `active → out_pending` (quem escreve na casa; motivo obrigatório `reason_required`).
- `withdraw_out` (`M01:601-621`): `out_pending → active` (gestão, ou quem decidiu o Out).
- `effect_out` (`M01:623-650`): `active|out_pending → ended(end_reason='out')`; **só gestão**; `p_ended_at` ∈ [`admitted_at`, `now()+5min`] (`invalid_out_time`); preenche `out_*` se vazios (`out_reason='Out'`).
- `transfer_resident` (vigente `M38:55-83`): só `active`; encerra estadia atual (`end_reason='transfer'`) e abre nova com `transfer_from_stay_id`.
- `release_cancelled_bed` (`M38:4-11`): encerra (`ended`, `end_reason='out'`) estadia `out_pending` na cama alvo com `ended_at = greatest(least(coalesce(p_at,now()), now()), admitted_at)`. Interna (revoke de public/anon/authenticated, `M38:12`); chamada por `admit_resident` e `transfer_resident`. Efeito: **cama com Out decidido conta como livre** e é "roubada" ao ser reocupada, efetivando a saída sem passar por gestão 🟢 (decisão de negócio explícita, `BedBoard.tsx:102` "livres (inclui as de cancelamento decidido)"; `useOccupancy.ts:37`).
- Concorrência: `for update` em `decide_out/withdraw_out/effect_out/transfer`; integridade final pelos índices únicos `stays_one_open_per_resident` / `stays_one_open_per_bed` (`M01:458-459`) e trigger `stays_check_bed` (vigente `M35:2-18`): recusa cama de outra casa (`bed_not_in_lodge`) e, no INSERT, cama `out_of_service`, inativa ou em quarto inativo (`bed_out_of_service`).

### 2.2 `admit_resident` (vigente `M38:14-53`) 🟢
Parâmetros: `p_lodge, p_bed, p_resident_id?, p_first_name?, p_last_name?, p_date_of_birth?, p_pass_id?, p_admitted_at?` → retorna `stay_id`. Passos:
1. `can_see_lodge(p_lodge)` e `can_write_lodge(p_lodge)` senão `42501`.
2. `p_admitted_at > now()+5min` → `admitted_in_future`.
3. **Residente novo** (sem `p_resident_id`): exige primeiro nome (`name_required`) e PASS ID (`pass_id_required`, desde M37); PASS ID duplicado case-insensitive → `pass_id_exists` (23505); insere `residents` (`trim`, sobrenome `''` se nulo).
4. **Readmissão** (com `p_resident_id`): residente deve existir (`resident_not_found`) e **não** ter estadia aberta (`already_resident`).
5. `release_cancelled_bed(p_bed, p_admitted_at)`; insere `stays` com `admitted_at = coalesce(p_admitted_at, now())`.
Histórico: M01:491 (sem PASS ID obrigatório) → M29:159 (house scope) → M37:51 (PASS ID obrigatório, readmissão) → M38:14 (libera cama cancelada).
Front: `AdmitDialog.tsx:269-291`: busca `find_former_resident` com debounce 300 ms quando PASS ID ≥3 chars (`:236-245`); se `has_open_stay` bloqueia (`valid` exige `!found`, `:247-250`); se ex-residente, botão "usar cadastro" (`loadFormer`, `:252-259`) trava campos e envia só `p_resident_id`. Após sucesso lê `stays.resident_id` para navegar (`:288`).

### 2.3 `find_former_resident(p_pass_id)` (`M37:91-102`) 🟢
Retorna até 1 linha: dados do residente, `has_open_stay`, `last_ended_at = max(stays.ended_at)`, `last_house` (nome do lodge da estadia mais recente). Exige `current_staff_id() is not null`; **não** aplica `can_see_lodge` (qualquer staff ativo, inclusive conta de casa, consulta residente de outra casa) 🟡 — comportamento aparentemente intencional (puxar ex-residente) mas expõe PII entre casas; ver questions.md.

### 2.4 `open_resident_profile` (`M01:788-833`) 🟢
Detalhado em `acesso-e-autenticacao`. Retorna `{resident, stays[]}` e grava `access_log`. SECURITY DEFINER ignora RLS `house_scope` 🟡.

### 2.5 UI
- `Residents.tsx`: lista atual a partir de `bed_occupancy` (view) filtrando `resident_id`, busca client-side `matches` (nome, PASS ID, quarto; `:77-81`); aba "past" consulta `residents` com `stays(...)` `limit(500)` e filtra residentes cujas estadias estão todas `ended` (`:95-103`) — **limite de 500 sem paginação** 🟡. `canAdmit = isManagement || !!post` (`:93`): a conta `station` (Beta) não tem posto, logo **não vê o botão Admit** em Residents embora o banco permita (`can_write_lodge`), enquanto `BedMap.tsx:269` usa `canWriteLodge` e permite 🟡 (inconsistência; questions.md). O mesmo `canEdit = isManagement || !!post` em `ResidentProfile.tsx:92` e a policy `residents_update` (`M01:903-905`: `is_management() or has_open_post()`) impedem a conta de casa de editar o cadastro 🟢.
- `ResidentProfile.tsx`: carrega perfil via RPC (`:65-82`), avisos (`warnings`) e menções (`handover_mentions` → `handover_entries`, limit 50, `:73-77`). Ações: editar cadastro (UPDATE direto em `residents` com `version`, `:293-304`; bloqueio otimista), transferir (`:56-86` do subcomponente `Transfer`; `allow = canWriteLodge(origem) || canWriteLodge(destino)`), decidir Out, retirar Out, efetivar Out (só gestão), registrar warning. `fwActive` = algum warning `final_warning` ativo (`:89`) mostra etiqueta FW.
- `BedMap.tsx`: `open(bed)` (`:263-270`): cama com residente (não `out_pending`) → perfil; gestão → diálogo de gerir cama (admitir / colocar fora de serviço com nota / voltar a uso) via UPDATE em `beds` com `version` lida imediatamente antes (`:272-281` — leitura+update não atômicos, mitigado por `bump_version`); equipe → AdmitDialog se `in_use` e `canWriteLodge`. Estados: `occupied`, `free`, `oos`, `cancelled` (= `out_pending`).
- `useOccupancy`: `supabase.from("bed_occupancy")`, `useLatestRequest` descarta respostas antigas; `summarise` conta `out_pending` como livre e também em `outPending` (`useOccupancy.ts:33-43`).
- `BedBoard` (painel Today): mesmo critério, link para `/beds`.

## 3. Presença — conceitos
Fatos guardados uma vez e **derivados** (`M06:4-6`): marcas do Room Check, avistamentos manuais, check-in, e (desde M10) jantar servido. "Seen" e "No Show" são calculados, nunca digitados diretamente 🟢.

### 3.1 Tempo
| Função | Def. | Lógica |
|---|---|---|
| `operational_day(ts)` | `M01:28-33` | `((ts at time zone 'Europe/Dublin') - 7h)::date` |
| `operational_day_start/end(d)` | `M01:35-47` | `d 07:00` / `d+1 07:00` Dublin (dia de 23/25 h em DST) |
| `shift_of(ts)` | `M06:16-22` | `day` se hora local ∈ [7,19), senão `night` |
| `slot_shift(slot)` | `M06:25-30` | `day` se `'07:00' ≤ slot < '19:00'` (comparação textual) |
| `slot_instant(day, slot)` | `M06:33-38` | slot `< '07:00'` cai em `day+1` |
| `check_slots(lodge, day)` | M29:324-338 (base M06:41-51) | parâmetro `presence.check_times` vigente no **início do dia** (`operational_day_start`), ordenado com horários `<07:00` no fim; exige `can_see_lodge` |
| `correction_window()` | `M06:64-71` | `records.correction_window_hours` (padrão 72) |
Espelhos no front: `presence.ts:slotInstant` (`:61-63`), `time.ts` (`operationalDay`, `operationalDayBounds`, `shiftOf`, `dublinWallTimeToDate`) 🟢.

### 3.2 Estadias presentes
`stays_present_at(lodge, at)` (M29:1484 / M06:54-62): `admitted_at <= at AND (ended_at is null OR ended_at > at)` — **limite exclusivo no fim**. `stays_present_at_any` (`M29:1498`) para vários lodges. Em `residents_without_evidence` o corte é `ended_at >= p_at` (inclusivo) e `admitted_at < p_at` (exclusivo) — critérios distintos entre funções 🟡 (borda: estadia encerrada exatamente em `p_at`).

## 4. Room Check ("Folha do dia")

### 4.1 `open_room_check(lodge, day, slot)` (vigente `M32:67-115`) 🟢
1. `can_see_lodge` + `can_write_lodge`.
2. `slot ∈ check_slots(lodge, day)` senão `invalid_slot`.
3. `v_win = presence.check_window_minutes` (padrão 60, faixa 5–180 em `set_system_parameter`); `planned = slot_instant`; `planned > now()+win` → `check_in_future`.
4. `checked_at = now()` se `now ∈ [planned−win, planned+win]` e `now < operational_day_end(day)`; senão `planned`.
5. Idempotente: retorna run existente; senão INSERT com `sheet_number = left(code,2)||'-'||YYYYMMDD||'-'||HHMM`, `performed_by = entered_by = me`, `ON CONFLICT DO NOTHING` + releitura (corrida).
Histórico: M06:210 (janela fixa 60 min, `checked_at=planned`) → M14:41 (checked_at real) → M29:773 (casa) → M32:67 (janela parametrizada).

### 4.2 `room_check_sheet(run)` (`M07:757-791`) 🟢
Todas as camas ativas do lodge (quartos/camas `active`) × `stays_present_at(lodge, run.checked_at)` (posição **no instante do check**), com `absence_id = active_absence(stay, checked_at)`, `result`, `marked_by`, `final_warning = has_final_warning(res.id)`. Requer `is_active_staff`; o isolamento de casa vem indiretamente de `stays_present_at` (→ `can_see_lodge`) 🟢.

### 4.3 `mark_resident(run, stay, result)` (`M06:328-377`) 🟢
- Autorização `can_write_lodge(run.lodge)`; a estadia deve estar presente no instante do check (`stay_not_in_check`).
- `result='absent'` exige ausência ativa no instante (`no_active_absence`).
- Se já há marca: gestão sempre; senão só o autor (`not_author`) e dentro de `correction_window` desde `marked_at` (`correction_window_closed`); só atualiza se mudou.
- Retorna `{mark_id, absence_active (= seen && há ausência), absence_id}` → front abre `AnticipateDialog` (B05).
- ⚠ Não verifica `run.status='launched'` ao **remarcar** (apenas `clear_mark` e `launch` verificam) → autor/gestão pode alterar marca de check já lançado dentro da janela 🟡.

### 4.4 `clear_mark(run, stay)` (`M06:380-401`)
Run `launched` → `run_launched`. Autor ou gestão. **Executa DELETE real** em `room_check_marks` (rastreado pelo trigger de auditoria) — única exceção ao princípio "nada é apagado" neste módulo 🟢 (B57: "tirar a marca desfaz o Seen").

### 4.5 `launch_room_check(run)` (vigente `M07:272-306`) 🟢
`for update`; `already_launched` → retorna `{status:'already_launched', launched_at_day}` sem duplicar; conta `stays_present_at` sem marca → `unmarked_residents` (detail = n); marca `launched` (`launched_at=now()`, `launched_by`); **efeito colateral**: se `slot ∈ round_slots()` (parâmetro `rounds.hours`) e não existe `handover_entries` kind `round` do dia/slot, insere "Room Check Done" no Handover com `occurred_at = checked_at` (liga com módulo ocorrências). Nota: `launch_room_check` **não foi redefinida em M29** (sem `can_see_lodge`), só `can_write_lodge` 🟢.

### 4.6 `set_room_check_details(run, checked_at, performed_by)` (`M06:255-291`)
Ajusta hora real e quem fez a ronda. Não-gestão: só quem digitou (`entered_by`) e dentro da janela de correção. `checked_at` ∈ [`day_start`, `day_end`) e ≤ `now()+5min` (`invalid_check_time`); `performed_by` deve ser staff ativo com papel `porter|manager|owner|developer` (`invalid_performer`) — **exclui `station`** 🟡 (o front lista `useStaffList`; conta de casa não pode ser "quem fez a ronda").
Front: `DailySheet.tsx:153-162`; seletor de data chama `updateDetails(d, null)`.

### 4.7 `room_check_typing_times(run)` (`M06:434-449`)
Só gestão; retorna `entered`, `launched`, `mark` (horários de digitação). Colunas de digitação (`entered_at`, `launched_at`, `marked_at`, `recorded_at`) são **omitidas do GRANT SELECT** (`M06:807-815`), visíveis só por essa função e pela auditoria 🟢.

### 4.8 Front `DailySheet.tsx`
- Slots de `check_slots`; runs de `room_check_runs` (`RUN_COLUMNS` sem colunas de digitação, `:34`). Slot inicial: o primeiro cujo instante ≤ agora(servidor) senão o primeiro (`:75`).
- `slotDue = slotInstant ≤ now + 60 min` (`:61`) — **60 min fixos no front**, enquanto o banco usa `presence.check_window_minutes` 🟡 (divergência se o parâmetro mudar; botão "Iniciar" pode ficar oculto/mostrado indevidamente).
- Marcação otimista com rollback em erro (`:110-127`); `absent` sem `absence_id` bloqueia no cliente (`:113`).
- Teclado (`keyToResult`, `presence.ts:40-58`): `V/S/1`=seen, `N/2`=not_seen, `A/3`=absent, `Backspace/Delete`=clear; ↑/↓ via `nextResidentIndex`.
- `sheetProgress` (`presence.ts:25-29`): completo se há ≥1 residente e todos marcados (B28).
- Lançar: `launch_room_check`; mostra toast diferente se `already_launched`.

### 4.9 Impressão `PrintSheet.tsx` 🟢
Rota `/sheet/print?lodge=&day=` fora do `Layout` (`App.tsx:94`). Número da folha `printSheetNumber = left(code,2)-YYYYMMDD` (`:13-15`), **diferente** do `sheet_number` do banco (`AM-20261120-1200`) 🟡 (folha de papel ≠ folha digital por slot). Chama `window.print()` 400 ms após carregar camas (`:43-48`). Ausências ativas: `absences` com `ended_at is null`, `starts_at ≤ now`, `expected_return_at > now` (ignora `absence_effective_end`/offset do servidor; usa `new Date()` do cliente) 🟡. Coluna Dinner se `lodge.has_dinner`.

## 5. Ausências

| Função | Def. | Regra |
|---|---|---|
| `register_absence(stay, starts, expected_return, notes)` | `M06:454-482` | estadia aberta (`stay_not_open`); `can_write_lodge`; período válido (`expected > starts`, `invalid_absence_period`); sobreposição com ausência não encerrada da mesma estadia (`tstzrange &&`) → `absence_overlaps` (23P01) |
| `end_absence(absence, returned_at?)` | `M06:485-506` | `for update`; já encerrada → `absence_already_ended`; `returned_at` ∈ [`starts_at`, `now()+5min`] (`invalid_return_time`) |
| `absence_effective_end(a)` | `M06:142-147` | `least(coalesce(ended_at,'infinity'), expected_return_at)` — **não prorroga sozinho** |
| `active_absence(stay, at)` | `M06:149-159` | `starts_at ≤ at < effective_end` |
| `overdue_absences(lodge)` | M29:822 | ausências não encerradas com `expected_return_at < now()` em estadias abertas |
Front `Absences.tsx`: estado `active|overdue|ended` por `absenceState` (`:272-275`); lista via `absences` + embed `stays!inner(lodge_id)` filtrando o lodge, limit 200 (`:295-301`); candidatos a nova ausência = camas com `stay_status==='active'` (exclui `out_pending`; `:381`). Efeitos de negócio: ausência **impede** No Show no período e protege a cama (`M06:122`; `residents_without_evidence`) 🟢.

## 6. Seen (avistamentos)

`record_sighting(resident, lodge, seen_at?, place)` (M29:998; base M06:527-549) 🟢: autorização por casa; `seen_at ≤ now()+5min` (`invalid_seen_time`); residente deve estar presente no lodge no instante (`resident_not_in_lodge`); insere `sightings`; retorna `{sighting_id, absence_active, absence_id}`.
`resident_evidence(resident, day)` (vigente `M10:312-333`) — **uma linha por evidência**:
- `check`: marca `seen` de qualquer run do dia → turno = `slot_shift(slot)`.
- `manual`: `sightings` do dia operacional → `shift_of(seen_at)`.
- `check-in`: `stays.admitted_at` no dia → `shift_of(admitted_at)`.
- `dinner`: `dinner_marks.served` do dia → sempre `night` (Dinner "sim" = Seen Night, confirmado em 20/11, `M10:311`).
`seen_for_day(lodge, day)` (M29:1396): residentes com estadia sobreposta ao dia, `seen_day`/`seen_night` (`exists` de evidência por turno) e arrays `day_sources/night_sources`. Exige `can_see_lodge` + `is_active_staff`.
Front `Seen.tsx`: turno inicial `shiftOf(now servidor)`; "marcar agora" (`record_sighting` com `p_seen_at:null`) só se `live = canWriteLodge && day===today && shift===shiftOf(now)` (`:86`); registro com hora/local via `RecordSighting` (candidatos = residentes do dia **com estadia atual** em `bed_occupancy`, `:185-188`); se `absence_active` abre `AnticipateDialog` → `end_absence(p_returned_at=null)` ("antecipar a presença").

## 7. No Show

### 7.1 Candidatos — `residents_without_evidence(lodge, day, at)` (M29:1260) 🟢
Estadias do lodge presentes em `at` (`admitted_at < at`, `ended_at null or >= at`), **sem nenhuma evidência no dia (qualquer lodge, qualquer turno)**, sem ausência cujo intervalo `[starts_at, effective_end)` intersecte o dia (até `least(at, day_end)`) e sem No Show `confirmed` do dia.

### 7.2 `no_show_review(lodge, day)` (M29:688) 🟢
JSON: `operational_day`, `day_finished = now ≥ day_end − 30min`, `pending_slots` (checks não lançados do dia — **todos**, sem `p_until`), `complete = pending_slots vazio`, `candidates` (com `month_count`), `confirmed` (inclui `undone`, com `undo_reason`).
`pending_slots(lodge, day, until='infinity')` (M06:602-616; M29:884): slots cujo instante ≤ `until` e sem run `launched`.
`noShowReviewDay(now)` front (`presence.ts:69-73`): hoje a partir de 06h30 (end−30 min), senão ontem.

### 7.3 `confirm_no_shows(lodge, day, stays[])` (M29:373) 🟢
Exige `can_write_lodge`, `now ≥ day_end − 30min` (`day_not_finished`), `pending_slots = ∅` (`checks_pending`). Para cada estadia: deve ser candidato (`not_a_candidate`), INSERT em `no_shows` (índice único parcial `no_shows_one_per_day` em `(resident_id, operational_day) where status='confirmed'`); `month_count`; se `≥ presence.no_show_monthly_alert` (padrão 3) → notificação `no_show_monthly_limit` (`audience='management'`, payload com nomes). Retorna lista `{stay_id, resident_id, no_show_id, month_count}`.
- A operação é um loop **em uma transação**; qualquer `not_a_candidate` aborta todas.
`no_show_month_count(resident, stay, day)` (`M06:635-645`): No Shows `confirmed` do **mês de calendário** de `day`, com `operational_day >= operational_day(stay_chain_start(stay))`.
`stay_chain_start` (`M06:619-632`): CTE recursiva seguindo `transfer_from_stay_id` até a 1ª estadia da cadeia; "transferência não zera, readmissão zera" (B36) 🟢.
`undo_no_show(id, reason)` (`M06:755-769`): só gestão; motivo obrigatório; `confirmed→undone` com autor/hora; não confirmado → `no_show_not_confirmed`. O contador passa a ignorar `undone` (filtra `status='confirmed'`).
Front `NoShows.tsx`: seleciona todos candidatos por padrão (`:73`), `canConfirm = complete && day_finished && canWriteLodge && selected>0` (`:85`); mensagem de limite usa `limit` lido de `param_value` (`:80-82`); "Desfazer" só visível à gestão (restante do arquivo, `isManagement`).

### 7.4 `presence_alert(lodge)` (M29:930) 🟢
Aviso 18h30 (consulta a qualquer hora, não grava): `pending_slots(…, until=now())` e `without_evidence = residents_without_evidence(lodge, hoje, now())`. Front `isAfterPresenceAlert(now)` = ≥18:30 (`presence.ts:76-79`); componente `PresenceAlertCard.tsx`.

## 8. Escopo por casa (isolamento) 🟢/🟡
Funções de leitura/escrita foram redefinidas em M29 com `can_see_lodge`. **Não** redefinidas (portanto sem `can_see_lodge`, só `can_write_lodge`/`is_active_staff`): `mark_resident`, `clear_mark`, `launch_room_check`, `set_room_check_details`, `register_absence`, `end_absence`, `decide_out`, `withdraw_out`, `effect_out`, `transfer_resident`, `undo_no_show`, `find_former_resident`, `open_resident_profile`, `resident_evidence`. Para as de escrita o `can_write_lodge` (station só na `house_scope()`) é suficiente; para leitura (`resident_evidence`, `find_former_resident`, `open_resident_profile`) um `station` pode obter dados de residente de outra casa 🟡 (registrado em questions.md). Observação: `resident_evidence` é por design cross-lodge (No Show considera qualquer casa).

## 9. Tratamento de erros (códigos → UI)
Exceções SQL usam códigos textuais e `errcode` (`42501` autorização, `22023` validação, `23505` unicidade, `23514` check, `23P01` exclusão, `P0002` não encontrado, `40001` versão obsoleta). O front converte com `errorKey` (`src/lib/errors.ts:183-192`): ex. `unmarked_residents`→`sheet.markAll`, `checks_pending`→`noShows.incomplete`, `day_not_finished`→`noShows.notFinished`, `check_in_future`→`sheet.notYet`, `absence_overlaps`→`absences.overlaps`, `pass_id_exists`, `already_resident`, `bed_not_in_lodge`, `bed_out_of_service`, `stays_one_open_per_bed`→`bedTaken`, `stays_one_open_per_resident`→`residentHasStay`. Atenção à ordem das regras: `not_author` casa antes de `not_authorised` (ver `acesso-e-autenticacao`). Erros sem regra: `invalid_slot`, `invalid_performer`, `invalid_check_time` (este último casa `/invalid_.*time/`), `stay_not_in_check` (casa `stay_not_(open|active|in_service|in_check)` ✔), `invalid_slot` → `errors.generic` 🟡.
Concorrência de edição: `bump_version` → `stale_version`; `BedMap` e `EditResident` enviam `version` lido.

## 10. Auditoria
Triggers `audit_row` em `residents`, `stays` (M01:768-769), `room_check_runs`, `room_check_marks`, `sightings`, `absences`, `no_shows` (`M06:201-205`); `bump_version` em residents/stays/runs/marks/absences/no_shows/beds (sightings não tem `version`). `access_log` só em `open_resident_profile`.
