# Spec — ocorrencias-e-passagem-de-turno

> Redator Reversa · doc_level=completo · pt-br · 🟢/🟡/🔴. Fontes: `modules/ocorrencias-e-passagem-de-turno/*`, `state-machines.md §6–9`, `findings-verification.md` (#6, #13, #15), ADR 0007/0008.

## 1. Objetivo
Registrar o Livro Ata (Handover) por turno, rondas, chamados de manutenção e advertências (Warning/Final Warning), com menções, tags, coautores, turnos de trabalho e busca. 🟢

## 2. Atores
Admin; conta da casa (`station`, informa obrigatoriamente "filled by"); Office/Float (turnos de Handover); sistema (triggers de preenchimento e notificação). 🟢

## 3. Requisitos funcionais
**RF-01 Nota do Handover (`add_handover_note`).** Exige `can_see_lodge`, staff ativo e `can_write_lodge`; corpo obrigatório (`body_required`); horário ≤ agora+5 min (`invalid_time`); `p_filled_by` ∈ porter/manager/owner/developer ativos (`invalid_filled_by`, exclui `station`); até 3 coautores sem repetição (`too_many_authors`, `invalid_co_author`); tags existentes e visíveis (`invalid_tag`); fato atrasado (`now() > shift_end`) exige `late_reason` da lista `handover.late_reasons` (exceto gestão). Com tags gera notificação `handover_tag`. 🟢
- Critério: máx. 4 pessoas no total (1 filled_by + 3).

**RF-02 Preenchimento padrão (trigger `handover_fill_default`).** Liga a nota ao turno Office aberto (`opened_at <= greatest(occurred_at, now()-12h)`; `occurred_at >= opened_at−5 min`) e preenche `filled_by` (config `app.filled_by` → pessoa do turno → pessoa da Rota se `station` → quem digita). 🟢

**RF-03 Corrigir/anular.** `correct_handover_note` (só `body`; bloqueia `kind='round'`), `void_handover_note` (motivo obrigatório); gestão sempre; demais só o autor dentro de `records.correction_window_hours` (72). Menções/tags/coautores não são reconstruídos na correção. 🟢 / 🟡

**RF-04 Rondas.** `round_slots()` (`rounds.hours`), `room_check_done` (idempotente; janela `presence.check_window_minutes`; devolve `recorded`/`already_recorded`), `pending_rounds` (slot+30 min vencido). Ronda anulada continua ocupando o índice `handover_one_round_per_slot`. 🟢 / 🟡

**RF-05 Turnos do Livro Ata.** `open_handover_shift` (função office|float; `at` ∈ [agora−24 h, agora+5 min]; `shift_already_open`; liga à Rota por `match_rota_shift`), `close_handover_shift` (`hours_status='pending'`; divergência >15 min do plano ou ausência de Rota → notificação `shift_hours_review`; passagem `handed_to` abre o turno do próximo). Gera notas "Shift opened/closed". 🟢

**RF-06 Busca (`search_handover`).** Filtros: período (≤92 dias), texto, kinds, tags, pessoa (filled_by, autor ou coautor), residente (menção), função, `include_voided`; limite 1–100. Qualquer filtro ativo troca a listagem por dia pela busca. 🟢

**RF-07 Menções e coautores (UI).** `@` com sugestões (até 6), só envia menções cujo `@Label` ainda está no corpo (colisão de nomes iguais 🟡). 🟢

**RF-08 Tags.** `add_handover_tag` (rótulo ≤30, cor ∈ red/amber/blue/green/violet/grey, máx. 20, único case-insens., `code` gerado `[a-z_]+`), `update_handover_tag`, `move_handover_tag`, `set_handover_tag` (esconder). Sem exclusão. Semente: `incident, emergency, health, damage` (notificam) e `conduct, visitor, delivery, general`. 🟢

**RF-09 Manutenção.** `create_maintenance` (idempotente por `request_key`; prazo = parâmetro por prioridade; cria entrada de Handover, ticket, evento e notificação `maintenance_opened`), `maintenance_set_status`, `maintenance_list`, `maintenance_reminders` e `snooze_maintenance_reminder` (gestão). Lembrete de 24 h **literal**. 🟢
- Veredito #13 CONFIRMADO: `maintenance.reminder_hours` existe e é editável mas não é lido. 🟢
- Veredito #6 CONFIRMADO: para `station` (sem posto) a guarda de `maintenance_set_status` avalia NULL e não bloqueia; só `resolved` é permitido; sem `can_see_lodge` (qualquer casa se o UUID for conhecido). 🟢 leitura / 🟡 exploração.

**RF-10 Warnings.** `record_warning(stay, type, note)` com tipos `warning|final_warning` (M37); uma FW ativa por **estadia** (`final_warning_active`); cria nota `kind='warning'` e notificação `warning_recorded`; `deactivate_final_warning` só gestão e com motivo; `warning` simples nunca é desativável; `has_final_warning(resident)` alimenta a etiqueta FW. 🟢

**RF-11 Pendências.** `pending_counts(lodge)` (tarefas, manutenção, ausências, checks, rondas, no_shows) — veredito #4: **possui** `can_see_lodge` (M29:841, teste `house-scope.test.ts:44-48`). 🟢

## 4. Regras de negócio
- RN-01 `handover_entries.kind` ∈ note, round, maintenance, warning, laundry, shift; `(kind='round') = (round_slot is not null)`. 🟢
- RN-02 Entradas nunca são apagadas; "apagar" = `status='voided'`. 🟢
- RN-03 Um turno Office aberto por casa; um Float global (índices `handover_shifts_one_open`, `handover_shifts_one_float`). 🟢
- RN-04 Turnos Day 07–19 / Night 19–07 com valores literais. 🟢
- RN-05 Motivos de atraso iniciais: `other_occurrence, system_failure, forgot, info_received_later`. 🟢
- RN-06 Prazos padrão de manutenção `{urgent:24, normal:168, low:720}` horas; fallback 168. 🟢
- RN-07 `resolved_at/by` não são limpos na reabertura. 🟡
- RN-08 `push` padrão ligado: tags com `notify_default`, `maintenance:urgent`, `warning`, `shift_hours_review`. 🟢

## 5. Dados
`handover_entries`, `handover_mentions`, `handover_entry_tags`, `handover_entry_staff`, `handover_tags`, `handover_shifts`, `maintenance_tickets` (`request_key` UK), `maintenance_events`, `maintenance_reminder_snoozes`, `warnings`, `notifications`. Dicionário em `modules/.../data-dictionary.md`. 🟢

## 6. Interfaces
Ver `rpc-contracts.md` §Ocorrências. Rotas `/handover`, `/maintenance`, `/warnings`. 🟢

## 7. Estados
`state-machines.md` §6 (nota), §7 (turno), §8 (manutenção, sem grafo imposto), §9 (warning). 🟢

## 8. Permissões
Escrita: `can_write_lodge`. Correção: gestão ou autor na janela (para `station` o autor é a conta da casa, não a pessoa — 🟡). Manutenção: status/prazo só gestão; Office da casa só resolve. Desativar FW, lembretes: gestão. `close_handover_shift`, `record_warning`, `correct/void` sem `can_see_lodge` (só `can_write_lodge`). 🟢

## 9. Casos de borda
- EB-01 `late_reason_required` e `invalid_priority` sem regra em `errors.ts` → `errors.generic`. 🟡
- EB-02 `DEFAULT_HOURS` fixo no diálogo de manutenção só para dica. 🟡
- EB-03 Chip de ronda usa 60 min fixos no front. 🟡
- EB-04 `create_maintenance` com `request_key` duplicado retorna `duplicate:true` antes de validar a prioridade. 🟢
- EB-05 `p_filled_by` nulo: a filtragem de coautores não remove ninguém. 🟡
- EB-06 Reabrir mantém `resolved_at` anterior. 🟡

## 10. Requisitos não funcionais
Idempotência (`request_key`, `room_check_done`); transação única (nota + ticket + evento + notificação); push nunca bloqueia a gravação (`notify_push` engole exceções). Lembrete de manutenção consulta a cada 5 min, dispensa por 1 h via `sessionStorage`. 🟢

## 11. Contradições anotadas
- Nenhuma com o Detetive nas regras acima; `pending_counts` e `warnings` tratadas conforme veredito. O módulo cita `warning_recorded` etc. sem push para `delivery_*`, consistente.

## 12. Lacunas 🔴
Uso real de `quick_phrases` (sem consumidor); efeito de anular ronda sobre o slot; correção de menções.

## 13. Rastreabilidade
`src/pages/Handover.tsx, Maintenance.tsx, Warnings.tsx`; `src/components/MaintenanceDialog.tsx, WarningDialog.tsx, StaffPicker.tsx, ResidentPicker.tsx, FilterBar.tsx`; `src/lib/occurrences.ts, useOnDuty.ts, useStaffList.ts, filters.ts, useUrlFilters.ts`; SQL `M07, M10, M16, M18, M23–M29, M32, M36, M37`; testes `tests/db/occurrences.test.ts, handover-coauthors, handover-search, tags-admin, r15`.
