# moradores-e-presenca — Fluxogramas

Fontes: `20261120000001_foundation.sql`, `..._000006_presence.sql`, `20261125000029_house_scope.sql`, `20261125000032_more_settings.sql`, `20261126000037_r15.sql`, `20261126000038_r16.sql`, páginas `src/pages/{Residents,ResidentProfile,BedMap,DailySheet,Seen,Absences,NoShows}.tsx`. 🟢 salvo indicação.

## 1. Ciclo de vida da estadia

```mermaid
stateDiagram-v2
  [*] --> active: admit_resident
  active --> out_pending: decide_out (motivo obrigatório; quem escreve na casa)
  out_pending --> active: withdraw_out (gestão ou quem decidiu)
  active --> ended: effect_out (gestão) end_reason=out
  out_pending --> ended: effect_out (gestão)
  out_pending --> ended: release_cancelled_bed<br/>(outra admissão/transferência ocupa a cama)
  active --> ended: transfer_resident end_reason=transfer
  ended --> [*]
  note right of active: cria nova estadia ligada por transfer_from_stay_id
```

## 2. Admissão

```mermaid
flowchart TD
  A[AdmitDialog: PASS ID] --> B{>=3 chars?}
  B -- sim, debounce 300ms --> C[rpc find_former_resident]
  C --> D{achou?}
  D -- não --> N[Residente novo: nome + PASS ID + cama]
  D -- sim, has_open_stay --> X[Bloqueia: já é residente]
  D -- sim, ex-residente --> U[Usar cadastro → p_resident_id]
  N --> S[rpc admit_resident]
  U --> S
  S --> V1{can_see + can_write lodge?}
  V1 -- não --> E1[42501]
  V1 -- sim --> V2{admitted_at > now+5min?}
  V2 -- sim --> E2[admitted_in_future]
  V2 -- não --> V3{novo?}
  V3 -- sim --> V4[name_required, pass_id_required, pass_id_exists] --> INS
  V3 -- não --> V5[resident_not_found, already_resident] --> INS
  INS[release_cancelled_bed cama] --> ST[INSERT stays]
  ST --> TR{trigger stays_check_bed + índices únicos}
  TR -- cama de outra casa/fora de uso --> E3[bed_not_in_lodge / bed_out_of_service]
  TR -- cama/residente com estadia aberta --> E4[stays_one_open_per_*]
  TR -- ok --> OK[stay_id → navega ao perfil]
```

## 3. Room Check (Folha do dia)

```mermaid
flowchart TD
  S[Escolhe dia + slot] --> D{slotDue front: slot <= agora+60min?}
  D -- não --> W[mensagem 'ainda não']
  D -- sim --> O[rpc open_room_check]
  O --> O1{slot válido? planned <= now+janela?}
  O1 -- não --> EO[invalid_slot / check_in_future]
  O1 -- sim --> O2[checked_at = now se dentro da janela±, senão slot planejado]
  O2 --> RUN[(run: pending)]
  RUN --> L[rpc room_check_sheet: camas × estadias presentes em checked_at]
  L --> M[marcar V/N/A ou Del]
  M --> M1[mark_resident]
  M1 --> M2{estadia presente? absent exige ausência ativa?}
  M2 -- não --> EM[stay_not_in_check / no_active_absence]
  M2 -- sim --> M3{marca existe?}
  M3 -- sim, não gestão --> M4{autor? dentro de 72h?}
  M4 -- não --> EM2[not_author / correction_window_closed]
  M4 -- sim --> UP[UPDATE result]
  M3 -- não --> INS[INSERT mark]
  UP --> RES
  INS --> RES{seen + ausência ativa?}
  RES -- sim --> ANT[AnticipateDialog → end_absence]
  RES -- não --> NEXT[próximo residente]
  M --> CL[clear_mark: run não lançado, autor/gestão → DELETE]
  NEXT --> LA[rpc launch_room_check]
  LA --> LA1{já lançado?}
  LA1 -- sim --> AL[already_launched, sem duplicar]
  LA1 -- não --> LA2{todos marcados?}
  LA2 -- não --> EL[unmarked_residents]
  LA2 -- sim --> LAU[status=launched]
  LAU --> HO{slot ∈ rounds.hours e sem round no Handover?}
  HO -- sim --> RD[INSERT handover 'Room Check Done' ocorrido em checked_at]
```

## 4. Seen — derivação

```mermaid
flowchart LR
  subgraph Evidências do dia operacional
    A[check seen<br/>turno=slot_shift]
    B[sightings manual<br/>turno=shift_of seen_at]
    C[check-in admitted_at<br/>turno=shift_of]
    D[dinner servido<br/>turno=night]
  end
  A & B & C & D --> E[resident_evidence]
  E --> F[seen_for_day: seen_day / seen_night + fontes]
  E --> G[residents_without_evidence]
```

## 5. Ausência comunicada

```mermaid
flowchart TD
  R[register_absence] --> R1{estadia aberta? can_write? expected>starts?}
  R1 -- não --> ER[stay_not_open / not_authorised / invalid_absence_period]
  R1 -- sim --> R2{sobrepõe ausência não encerrada?}
  R2 -- sim --> EO[absence_overlaps]
  R2 -- não --> AB[(absence)]
  AB --> ST{estado}
  ST -->|expected_return > now| ACT[ativa: protege cama, bloqueia No Show]
  ST -->|expected_return < now e sem retorno| OV[overdue_absences: pendência, não prorroga]
  ACT --> SEEN[residente visto: mark seen ou record_sighting]
  SEEN --> Q[AnticipateDialog 'antecipar presença?']
  Q -- sim --> EN[end_absence returned_at=now]
  ACT --> RET[end_absence manual com hora]
  OV --> RET
```

## 6. No Show (lista das 06h30)

```mermaid
flowchart TD
  S[no_show_review lodge, day] --> P{pending_slots vazio?}
  P -- não --> I[complete=false → confirmar bloqueado]
  P -- sim --> F{now >= fim do dia − 30min?}
  F -- não --> NF[day_finished=false]
  F -- sim --> C[candidatos: sem evidência, sem ausência, sem No Show confirmado]
  C --> SEL[Office revisa; todos pré-selecionados]
  SEL --> CF[confirm_no_shows]
  CF --> V{can_write? dia terminado? checks lançados?}
  V -- não --> E[not_authorised / day_not_finished / checks_pending]
  V -- sim --> LOOP[para cada estadia: ainda candidata?]
  LOOP -- não --> ENC[not_a_candidate → rollback total]
  LOOP -- sim --> INS[INSERT no_shows confirmed]
  INS --> CNT[month_count: mês calendário desde início da cadeia de transferências]
  CNT --> LIM{count >= limite (3)?}
  LIM -- sim --> NT[notifications no_show_monthly_limit → gestão]
  LIM -- não --> END[ok]
  NT --> END
  END --> UND[gestão: undo_no_show com motivo → status undone, contador ignora]
```

## 7. Mapa de camas / Out

```mermaid
flowchart TD
  B[BedMap clique em cama] --> Q{tem residente e stay != out_pending?}
  Q -- sim --> PF[perfil do residente]
  Q -- não --> G{gestão?}
  G -- sim --> MG[diálogo: admitir / fora de serviço (nota) / voltar a uso → UPDATE beds com version]
  G -- não --> W{in_use e canWriteLodge?}
  W -- sim --> AD[AdmitDialog com cama fixa]
  PF --> A[Ações no perfil]
  A --> T[Transferir: FreeBedSelect → transfer_resident]
  A --> DO[Decidir Out → decide_out]
  A --> WO[Retirar Out → withdraw_out]
  A --> EO[Efetivar Out (gestão) → effect_out]
```
