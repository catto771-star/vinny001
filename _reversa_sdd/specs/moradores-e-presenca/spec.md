# Spec — moradores-e-presenca

> Redator Reversa · doc_level=completo · pt-br · 🟢 confirmado · 🟡 inferido · 🔴 LACUNA. `Mnn` = migration. Vale a definição mais recente de cada função. Fontes: `modules/moradores-e-presenca/*`, `domain.md`, `state-machines.md §1–5`, `permissions.md`, `findings-verification.md`, ADR 0004/0006/0009.

## 1. Objetivo
Gerir residentes e estadias (admissão, transferência, Out), o mapa de camas, a presença diária (Room Check, Seen, ausências) e o No Show, por casa e por dia operacional (07:00–07:00 Dublin). 🟢

## 2. Atores
Admin (gestão), conta da casa (`station`, na própria casa), Staff com posto (legado), sistema (derivações de presença). 🟢

## 3. Requisitos funcionais
**RF-01 Admitir residente (`admit_resident`).** Exige `can_see_lodge` e `can_write_lodge`; PASS ID obrigatório e único sem diferenciar maiúsculas (`pass_id_required`, `pass_id_exists`); readmissão via `p_resident_id` (recusa se há estadia aberta: `already_resident`); `p_admitted_at` ≤ agora+5 min; libera cama cancelada (`release_cancelled_bed`). 🟢
- Critério: admitir em cama `out_of_service`, inativa ou de quarto inativo → `bed_out_of_service`; cama de outra casa → `bed_not_in_lodge`.

**RF-02 Consultar ex-residente (`find_former_resident`).** Busca por PASS ID (≥3 caracteres, debounce 300 ms); devolve dados, `has_open_stay`, `last_ended_at`, `last_house`. Bloqueia admissão se há estadia aberta. 🟢
- Veredito #7 CONFIRMADO: não aplica `can_see_lodge` (qualquer staff ativo, inclusive `station`, vê residente de outra casa); provavelmente intencional para readmissão 🟡; decisão de produto 🔴.

**RF-03 Perfil do residente (`open_resident_profile`).** Retorna `{resident, stays[]}` e grava `access_log`. 🟢 Veredito #5 CONFIRMADO: sem `can_see_lodge` (lacuna de isolamento; explorabilidade 🟡).

**RF-04 Editar cadastro.** `UPDATE` direto em `residents` com `version` (otimista). Política `residents_update` = `is_management() or has_open_post()`. Veredito #12 CONFIRMADO: `station` não tem posto, logo não edita (UI `isManagement || !!post` coerente com a RLS, mas incoerente com `canWriteLodge`; o botão Admit em `Residents.tsx` também some para `station`, enquanto `BedMap.tsx` permite). 🟢

**RF-05 Out (decidir, retirar, efetivar).** `decide_out` (escritor da casa; motivo obrigatório): `active→out_pending`; `withdraw_out` (gestão ou quem decidiu); `effect_out` (só gestão; `p_ended_at` em [admissão, agora+5 min]). 🟢

**RF-06 Transferir (`transfer_resident`).** Só de `active` (`stay_not_active`); encerra com `end_reason='transfer'` e abre nova estadia com `transfer_from_stay_id`; `allow = canWriteLodge(origem) || canWriteLodge(destino)` na UI. 🟢

**RF-07 Cama cancelada libera a cama.** Admitir/transferir para cama com `out_pending` encerra automaticamente a estadia anterior (`release_cancelled_bed`, M38), sem `effect_out` da gestão. Veredito #17 CONFIRMADO como comportamento; intenção 🔴 LACUNA. Na UI a cama conta como livre (Home, `useOccupancy`, `BedBoard`). 🟢 / 🔴

**RF-08 Mapa de camas (`BedMap`).** Estados `occupied|free|oos|cancelled`; gestão altera estado da cama (admitir, fora de serviço com nota, voltar a uso) por `UPDATE` com `version`; equipe admite se `canWriteLodge`. 🟢

**RF-09 Room Check (Folha do dia).** `open_room_check` (idempotente; slot ∈ `check_slots`; janela `presence.check_window_minutes`), `room_check_sheet`, `mark_resident` (`seen|not_seen|absent`), `clear_mark` (DELETE real, auditado), `launch_room_check` (conta não marcados; cria "Room Check Done" no Handover se o slot ∈ `rounds.hours`), `set_room_check_details`, `room_check_typing_times` (gestão). 🟢
- Critério: `absent` exige ausência ativa (`no_active_absence`); remarcar fora do autor/gestão ou após a janela → `not_author`/`correction_window_closed`.
- 🟡 `mark_resident` não verifica `status='launched'` ao remarcar.

**RF-10 Ausências.** `register_absence` (período válido; sem sobreposição → `absence_overlaps`), `end_absence` (`returned_at` ∈ [início, agora+5 min]), `overdue_absences`. Ausência protege a cama e impede No Show. 🟢 (sobreposição sem constraint de exclusão 🟡)

**RF-11 Seen.** Evidência derivada de `check`, `manual` (`record_sighting`), `check-in` e `dinner` (marca `served=true` = Seen Night). `seen_for_day` por turno. 🟢

**RF-12 No Show.** `residents_without_evidence`, `no_show_review`, `confirm_no_shows` (≥ fim do dia−30 min; todas as rondas lançadas; transação única), `undo_no_show` (só gestão, com motivo), `no_show_month_count` (cadeia de transferências), alerta mensal `presence.no_show_monthly_alert` → notificação `no_show_monthly_limit`. 🟢

**RF-13 Alerta de presença 18:30 (`presence_alert`).** Consulta sem gravar; front exibe após 18:30. 🟢

**RF-14 Folha impressa (`PrintSheet`).** Rota `/sheet/print`, fora do Layout; `window.print()` após 400 ms. 🟢

## 4. Regras de negócio
RN-01 Um residente, uma estadia aberta (`stays_one_open_per_resident`); uma cama, uma estadia aberta (`stays_one_open_per_bed`). 🟢
RN-02 Horários não podem estar no futuro (tolerância 5 min) nem antes da admissão. 🟢
RN-03 Cancelar a cama exige motivo; efetivar só gestão. 🟢
RN-04 No Show: um `confirmed` por residente/dia (índice parcial `no_shows_one_per_day`); contador do mês de calendário com `operational_day >= dia(stay_chain_start)`; "transferência não zera, readmissão zera". 🟢
RN-05 `shift_of`: Day 07–19, Night 19–07 com valores literais (`shift.day_start/night_start` **não** são lidos — veredito #14 CONFIRMADO). 🟢
RN-06 `stays_present_at`: fim exclusivo; `residents_without_evidence`: `ended_at >= p_at` inclusivo (critérios distintos). 🟡
RN-07 Quarto com no máx. 12 camas (a numeração inclui camas removidas). 🟡

## 5. Dados
`residents`, `stays`, `beds`, `rooms`, `lodges`, `room_check_runs`, `room_check_marks`, `sightings`, `absences`, `no_shows`; view `bed_occupancy` (`security_invoker=true`, inclui `final_warning`). Colunas de digitação (`entered_at`, `launched_at`, `marked_at`, `recorded_at`) fora do `GRANT SELECT` (só gestão via função). Detalhe: `modules/moradores-e-presenca/data-dictionary.md`. 🟢

## 6. Interfaces
RPCs: `admit_resident`, `find_former_resident`, `open_resident_profile`, `decide_out`, `withdraw_out`, `effect_out`, `transfer_resident`, `release_cancelled_bed` (interna), `open_room_check`, `room_check_sheet`, `mark_resident`, `clear_mark`, `launch_room_check`, `set_room_check_details`, `room_check_typing_times`, `register_absence`, `end_absence`, `overdue_absences`, `record_sighting`, `resident_evidence`, `seen_for_day`, `residents_without_evidence`, `no_show_review`, `confirm_no_shows`, `undo_no_show`, `no_show_month_count`, `presence_alert`, `check_slots`, `pending_slots`. Contratos: `rpc-contracts.md`. Rotas: `/residents`, `/residents/:id`, `/beds`, `/sheet`, `/sheet/print`, `/seen`, `/absences`, `/no-shows`. 🟢

## 7. Estados
`state-machines.md` §1 (estadia), §2 (cama), §3 (No Show), §4 (Room Check), §5 (ausência). "Cama cancelada" na UI = `out_pending` (não existe `cancelled`). 🟢

## 8. Permissões
Gestão: tudo (2 casas). `station`: escreve na própria casa; `undo_no_show` e `effect_out` ✖. Funções de escrita não redefinidas em M29 (`mark_resident`, `clear_mark`, `launch_room_check`, `register_absence`, `end_absence`, `decide_out`, `withdraw_out`, `transfer_resident`…) dependem só de `can_write_lodge`, suficiente. Leitura sem `can_see_lodge`: `find_former_resident`, `open_resident_profile`, `resident_evidence` (esta é cross-lodge por desenho). 🟢

## 9. Casos de borda
- EB-01 `confirm_no_shows`: qualquer `not_a_candidate` aborta todo o lote. 🟢
- EB-02 `DailySheet.slotDue` usa 60 min fixos; o banco usa `presence.check_window_minutes`. 🟡
- EB-03 `Residents` aba "past" limitada a 500 sem paginação. 🟡
- EB-04 `PrintSheet`: número da folha difere do `sheet_number` do banco; ausências usam `new Date()` do cliente. 🟡
- EB-05 `set_room_check_details`/`add_handover_note` não aceitam `station` como "quem fez". 🟡
- EB-06 Erros sem regra em `errors.ts` (`invalid_slot`, `invalid_performer`) caem em `errors.generic`. 🟡
- EB-07 `add_bed` não valida quarto ativo. 🟡

## 10. Requisitos não funcionais
- Concorrência: `for update` + `bump_version`; índices únicos como rede final. 🟢
- Tempo: relógio do servidor (`serverOffsetMs`) no cliente; dia operacional idêntico no SQL e em `time.ts`. 🟢
- Privacidade: leitura de perfil auditada; colunas de digitação ocultas. 🟢
- Desempenho: sem paginação em listas de residentes passados (500). 🟡

## 11. Contradições anotadas
- Nenhuma com o Detetive. Vereditos #5, #7, #12, #14, #17 confirmados. 🟡 `domain.md` regra 10 cita "janela de correção" (não reverificada).

## 12. Lacunas 🔴
Significado de `residents.is_demo`; intenção de liberar cama cancelada sem a gestão (#17); política de acesso interlojas a ex-residentes (#7).

## 13. Rastreabilidade
Páginas `Residents, ResidentProfile, BedMap, Seen, Absences, NoShows, DailySheet, PrintSheet`; componentes `AdmitDialog, AnticipateDialog, BedBoard, ResidentPicker, PresenceAlertCard`; libs `presence.ts, useOccupancy.ts, time.ts, rooms.ts, activeLodge.tsx`; SQL `M01, M06, M07, M10, M14, M29, M32, M35, M37, M38`; testes `tests/db/presence.test.ts, foundation, house-scope, r15, r16, review-2/3`. Ver `traceability/code-spec-matrix.md`.
