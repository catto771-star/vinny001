# Máquinas de estado — DS Lodge

> Detetive Reversa · doc_level=completo. 🟢 confirmado no SQL/código · 🟡 inferido · 🔴 lacuna. `Mnn` = migration.
> Nota geral: o banco **valida valores** (CHECK/enum) e pré-condições por função, mas na maioria das entidades **não impõe um grafo** de transições; o grafo abaixo é o permitido pelas RPCs/UI.

## 1. Estadia (`stays.status`: active · out_pending · ended) 🟢
Não existe valor `cancelled`: "cama cancelada" na UI é `out_pending` (decisão de Out aguardando a gestão). `end_reason` ∈ `out | transfer`.
```mermaid
stateDiagram-v2
    [*] --> active: admit_resident (can_write_lodge, PASS ID)
    active --> out_pending: decide_out(motivo) — qualquer escritor da casa
    out_pending --> active: withdraw_out — gestão ou quem decidiu
    out_pending --> ended: effect_out — só gestão (end_reason=out)
    out_pending --> ended: release_cancelled_bed — ao admitir/transferir outro p/ a cama (M38, sem gestão)
    active --> ended: effect_out — gestão (end_reason=out)
    active --> ended: transfer_resident (end_reason=transfer) e cria nova estadia ativa
    ended --> [*]
```
Regras: `transfer_resident` só parte de `active` (`stay_not_active`); `effect_out` falha se `ended` (`stay_not_open`); a cama de uma estadia `out_pending` conta como livre na Home (M38) mas o residente continua listado como `out_pending`.

## 2. Cama (`beds.status`: in_use · out_of_service; `active`) 🟢
```mermaid
stateDiagram-v2
    [*] --> in_use: add_bed (gestão)
    in_use --> out_of_service: update/estado da cama (gestão)
    out_of_service --> in_use: gestão
    in_use --> inativa: set_bed_active(false) (gestão)
    inativa --> in_use: set_bed_active(true)
```
Admissão em `out_of_service` é recusada. `add_bed` não valida quarto ativo (🟡, questions.md).

## 3. No Show (`no_show_status`: confirmed · undone) 🟢
```mermaid
stateDiagram-v2
    [*] --> confirmed: confirm_no_shows (fim do dia−30min, rondas completas, candidato sem evidência)
    confirmed --> undone: undo_no_show(motivo) — só gestão
    undone --> [*]
```
Um `confirmed` por residente/dia (índice parcial); `undone` preserva histórico. `month_count ≥ limite` notifica a gestão.

## 4. Room Check (`room_check_runs.status`: pending · launched) e marcas 🟢
```mermaid
stateDiagram-v2
    [*] --> pending: open_room_check (slot do dia)
    pending --> pending: mark_resident / clear_mark (resultado seen | not_seen | absent)
    pending --> launched: launch_room_check
    launched --> launched: set_room_check_details / check_entry_correction
```
`clear_mark` exige run não lançada e remove a linha de `room_check_marks` (DELETE real, auditado). `mark_resident` pode remarcar enquanto dentro da janela (🟡).

## 5. Ausência (`absences`) 🟢
```mermaid
stateDiagram-v2
    [*] --> aberta: register_absence (sem sobreposição)
    aberta --> encerrada: end_absence(returned_at)
    aberta --> atrasada: retorno previsto vencido (overdue_absences / pending_counts)
    atrasada --> encerrada: end_absence
```
Estado derivado (`ended_at is null` e prazos); não há coluna de status.

## 6. Nota do Handover (`handover_entries.status`: active · voided) 🟢
```mermaid
stateDiagram-v2
    [*] --> active: add_handover_note / insert_handover_entry (kind note|round|maintenance|warning|laundry|shift)
    active --> active: correct_handover_note (só body; gestão ou autor na janela)
    active --> voided: void_handover_note(motivo) (gestão ou autor na janela)
```

## 7. Turno do Handover (`handover_shifts`) 🟢
Ciclo duplo: aberto/fechado (`closed_at`) e `hours_status` ∈ open · pending · confirmed.
```mermaid
stateDiagram-v2
    [*] --> aberto: open_handover_shift (1 por casa; Float global)
    aberto --> fechado_pendente: close_handover_shift (hours_status=pending)
    fechado_pendente --> aberto: passagem — abre turno do próximo (handed_to)
    fechado_pendente --> confirmado: confirm_shift_hours (gestão; ajusta/cria rota_shift)
    confirmado --> [*]
```
Fechar com divergência >15 min do plano da Rota notifica `shift_hours_review`.

## 8. Chamado de manutenção (`maintenance_tickets.status`) 🟢
Valores: open · in_progress · on_hold · resolved · reopened. O banco aceita qualquer troca entre valores válidos (sem grafo); abaixo o fluxo de uso.
```mermaid
stateDiagram-v2
    [*] --> open: create_maintenance (can_write_lodge)
    open --> in_progress: gestão
    in_progress --> on_hold: gestão
    on_hold --> in_progress: gestão
    in_progress --> resolved: gestão ou Office da casa (só "resolved")
    open --> resolved
    resolved --> reopened: gestão
    reopened --> in_progress: gestão
```
`resolved_at/resolved_by` são preenchidos ao resolver e **não** são limpos ao reabrir. Prazo e prioridade só pela gestão. Lacuna: para `station` (sem posto) a checagem avalia NULL e não bloqueia — ver permissions.md §5.

## 9. Warning / Final Warning (`warnings`) 🟢
`type` ∈ warning · final_warning (desde M37; antes verbal/written/final_written); `active` booleano.
```mermaid
stateDiagram-v2
    [*] --> ativa: record_warning (can_write_lodge) — nota no Handover + notificação
    ativa --> desativada: deactivate_final_warning(motivo) — só gestão, só final_warning
    note right of ativa: Final Warning: no máx. uma ativa por estadia
```
Um `warning` simples não tem desativação (🟡).

## 10. Pedido Tesco (`shop_orders.status`) 🟢
```mermaid
stateDiagram-v2
    [*] --> created: create_shop_order (gestão; data ≥ hoje−30d)
    created --> placed: set_shop_order(p_placed) / set_shop_order_status
    placed --> awaiting: set_shop_order_status
    awaiting --> placed: set_shop_order_status
    placed --> created: set_shop_order_status (zera placed_at)
    placed --> delivered: link_delivery_to_order
    awaiting --> delivered: link_delivery_to_order
    delivered --> [*]: terminal (order_delivered)
```
`draft` do M17 foi migrado para `created` em M37. `set_shop_line` não checa o status (🟡).

## 11. Turno da Rota (`rota_shifts.status`) 🟢
```mermaid
stateDiagram-v2
    [*] --> draft: save_rota_shift (gestão; função×papel; sem sobreposição)
    draft --> published: publish_rota(p_from,p_to)
    published --> cancelled: cancel_rota_shift
    draft --> cancelled: cancel_rota_shift
    published --> published: confirm_shift_hours ajusta horários / split_rota_shift
```

## 12. Férias (`vacations.status`) 🟢
```mermaid
stateDiagram-v2
    [*] --> under_review: register_vacation
    [*] --> approved: register_vacation (padrão M17: approved)
    under_review --> approved: set_vacation_status
    approved --> under_review: set_vacation_status
    under_review --> cancelled
    approved --> cancelled: cancel_vacation / set_vacation_status
```
`under_review` e `approved` contam para conflitos de cobertura.

## 13. Entrega de alimentos e vínculo 🟡
```mermaid
stateDiagram-v2
    [*] --> registrada: record_food_delivery
    registrada --> alerta_vinculo: fornecedor links_order → notificação delivery_received
    alerta_vinculo --> vinculada: link_delivery_to_order (já_vinculada recusa)
    registrada --> vencendo: expiry ≤ hoje+N dias → delivery_expiring
```
Não há desvinculação nem anulação (sem RPC).

## 14. Acesso/Autenticação (front `AuthStage`) e MFA 🟢
```mermaid
stateDiagram-v2
    [*] --> loading
    loading --> signed_out: sem sessão
    loading --> not_staff: sem linha ativa em staff
    loading --> change_password: must_change_password
    loading --> email_code: gestão e mfa_satisfied=false
    loading --> ready
    signed_out --> loading: signInWithPassword
    change_password --> loading: updateUser + mark_password_changed
    email_code --> loading: verifyOtp (sessão otp ≤15 min após pedido)
    ready --> signed_out: inatividade (security.session_idle_minutes) / conta desativada (poll 60 s) / signOut
```
MFA no banco: pedido `begin_email_verification` (sessão com senha; máx. 5 em 15 min) → sessão `otp` → `mfa_satisfied()` verdadeiro se o pedido está em [sessão−15 min, sessão+1 min]. `security.require_mfa_management=false` desliga a exigência.

## 15. Notificações 🟡
```mermaid
stateDiagram-v2
    [*] --> criada: trigger/RPC insere em notifications (audience management|lodge)
    criada --> push_enviado: notify_push → send-push (push_keys/push_default/prefs)
    criada --> lida: mark_notification_read (notification_reads)
```
Sem retenção/limpeza identificada.
