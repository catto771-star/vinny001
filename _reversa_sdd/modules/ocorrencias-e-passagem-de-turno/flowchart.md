# ocorrencias-e-passagem-de-turno — Fluxogramas

Fontes: `20261120000007_occurrences.sql`, `..._000018_handover_shifts.sql`, `..._000025_float_shift.sql`, `..._000026_shift_times.sql`, `..._000029_house_scope.sql`, `..._000032_more_settings.sql`, `20261126000037_r15.sql`, `src/pages/{Handover,Maintenance,Warnings}.tsx`. 🟢 salvo indicação.

## 1. Registrar nota no Handover

```mermaid
flowchart TD
  U[Composer: texto, @menções, tags, quem preenche, co-autores, hora do fato] --> V{station?}
  V -- sim --> V1[filled_by obrigatório na UI]
  V -- não --> L
  V1 --> L{fato de turno já encerrado e não gestão?}
  L -- sim --> L1[motivo da lista handover.late_reasons obrigatório]
  L -- não --> R
  L1 --> R[rpc add_handover_note]
  R --> A1{can_see_lodge e can_write_lodge?}
  A1 -- não --> E1[42501 not_authorised]
  A1 -- sim --> A2{body vazio? occurred_at > now+5min?}
  A2 -- sim --> E2[body_required / invalid_time]
  A2 -- não --> A3{filled_by e co-autores: staff ativo porter/manager/owner/developer, ≤3?}
  A3 -- não --> E3[invalid_filled_by / invalid_co_author / too_many_authors]
  A3 -- sim --> A4{tags existem e visíveis?}
  A4 -- não --> E4[invalid_tag]
  A4 -- sim --> A5{now > shift_end do fato, não gestão, motivo inválido?}
  A5 -- sim --> E5[late_reason_required]
  A5 -- não --> I[set_config app.filled_by → insert_handover_entry]
  I --> T[trigger handover_fill_default: shift_id do turno office, filled_by]
  T --> M[grava menções, tags, co-autores]
  M --> N{há tags?}
  N -- sim --> NT[notifications handover_tag → gestão → push por preferência]
  N -- não --> OK[id da entrada]
  NT --> OK
```

## 2. Ronda "Room Check Done"

```mermaid
flowchart TD
  C[Chip do slot no Handover] --> H{hoje? slot <= agora+60min? canWrite?}
  H -- não --> D[chip desabilitado]
  H -- sim --> RPC[rpc room_check_done]
  RPC --> V1{slot em rounds.hours?}
  V1 -- não --> E1[invalid_round_slot]
  V1 -- sim --> V2{slot > now + presence.check_window_minutes?}
  V2 -- sim --> E2[round_in_future]
  V2 -- não --> V3{já existe round do slot?}
  V3 -- sim --> AR[already_recorded]
  V3 -- não --> INS[INSERT 'Room Check Done' occurred_at=now, round_slot]
  INS -- unique_violation corrida --> AR
  INS --> OK[recorded]
  LAUNCH[launch_room_check da Folha do dia] -.cria a mesma ronda.-> INS
```

## 3. Turnos do Livro Ata

```mermaid
stateDiagram-v2
  [*] --> SemTurno
  SemTurno --> Aberto: open_handover_shift(lodge, quem assume, função, hora)
  Aberto --> Fechado: close_handover_shift(sem passagem)
  Aberto --> Aberto2: close_handover_shift(handed_to) abre o turno seguinte na mesma função e hora
  Fechado --> [*]
  note right of Aberto: office: 1 por casa; float: 1 global<br/>match_rota_shift liga ao Roster<br/>entradas 'shift' abertura/fechamento
  note right of Fechado: hours_status = pending<br/>divergência > 15 min ou sem Roster → notificação shift_hours_review
```

```mermaid
flowchart TD
  O[open_handover_shift] --> O1{pode ver/escrever? função válida? hora ∈ [-24h,+5min]?}
  O1 -- não --> OE[42501 / invalid_function / invalid_time]
  O1 -- sim --> O2{staff é porter/manager/owner/developer ativo?}
  O2 -- não --> OE2[invalid_filled_by]
  O2 -- sim --> O3{já há turno aberto dessa função (float global; office da casa)?}
  O3 -- sim --> OE3[shift_already_open]
  O3 -- não --> OI[INSERT handover_shifts + entrada 'Shift opened — Nome']
```

## 4. Chamado de manutenção

```mermaid
flowchart TD
  N[MaintenanceDialog: local, descrição, prioridade; request_key=uuid] --> CM[rpc create_maintenance]
  CM --> D{request_key já existe?}
  D -- sim --> DUP[retorna ticket existente duplicate=true]
  D -- não --> P{prioridade válida?}
  P -- não --> EP[invalid_priority]
  P -- sim --> TX[1 transação: entrada Handover 'maintenance' + ticket deadline=now+param + evento created + notificação maintenance_opened]
  TX --> ST((open))
  ST -->|gestão| G[maintenance_set_status: in_progress / on_hold / reopened / resolved / prazo / nota]
  ST -->|posto office da casa| RS[só resolved, sem prazo]
  G --> EV[maintenance_events: status/deadline/note]
  RS --> EV
  EV --> RES{resolved?}
  RES -- sim --> RA[resolved_at, resolved_by]
```

```mermaid
flowchart LR
  A[Gestão: poll 5 min] --> B[rpc maintenance_reminders]
  B --> C{prazo vencido, sem evento desde max(prazo, now-24h), sem snooze 24h?}
  C -- sim --> D[Diálogo: Resolvido / Em andamento+novo prazo / Em espera+nota / Depois]
  D -->|Depois| S[snooze_maintenance_reminder]
  D -->|demais| U[maintenance_set_status]
  D -->|X| X[sessionStorage: ocultar 1 h]
```

## 5. Warning / Final Warning

```mermaid
flowchart TD
  W[WarningDialog: estadia, tipo, nota] --> RW[rpc record_warning]
  RW --> V1{estadia aberta? can_write_lodge?}
  V1 -- não --> E1[stay_not_open / not_authorised]
  V1 -- sim --> V2{tipo ∈ warning, final_warning?}
  V2 -- não --> E2[invalid_warning_type]
  V2 -- sim --> V3{final_warning e já há FW ativo nesta estadia?}
  V3 -- sim --> E3[final_warning_active]
  V3 -- não --> H[insert_handover_entry kind=warning, menciona o residente]
  H --> WR[INSERT warnings ligada à entrada]
  WR --> TR[trigger warnings_notify → notifications warning_recorded → push]
  WR --> FW{final_warning?}
  FW -- sim --> TAG[has_final_warning=true → etiqueta FW em mapas, folha e listas]
  TAG --> DEA[gestão: deactivate_final_warning com motivo → active=false]
```

## 6. Busca no Handover

```mermaid
flowchart TD
  F[Qualquer filtro na FilterBar] --> S{searching?}
  S -- não --> Q1[SELECT handover_entries do dia operacional]
  S -- sim --> Q2[rpc search_handover from=to-29d por padrão]
  Q2 --> V{from/to válidos? intervalo ≤ 92 dias?}
  V -- não --> E[invalid_range / range_too_large]
  V -- sim --> R[filtros: texto ILIKE escapado, tipos, tags, pessoa (filled_by/autor/co-autor), residente (menção), função do turno, anuladas]
  R --> L[limit ≤ 100 ordem occurred_at desc]
  Q1 & L --> J[carrega menções, tags e co-autores das entradas em lote]
```

## 7. Correção / anulação de nota

```mermaid
flowchart TD
  X[Editar ou Anular] --> C[check_entry_correction]
  C --> G{gestão?}
  G -- sim --> OKc
  G -- não --> W{can_write_lodge? autor? dentro de 72h?}
  W -- não --> E[not_authorised / not_author / correction_window_closed]
  W -- sim --> OKc[permitido]
  OKc --> K{ação}
  K -- editar --> ED{kind = round?}
  ED -- sim --> E2[round_not_editable]
  ED -- não --> UP[UPDATE body]
  K -- anular --> VR{motivo?}
  VR -- vazio --> E3[reason_required]
  VR -- ok --> VO[status=voided + autor/hora/motivo]
```
