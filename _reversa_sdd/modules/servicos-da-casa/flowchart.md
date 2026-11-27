# servicos-da-casa — Fluxogramas

Legenda de confiança: 🟢 confirmado no código (arquivo:linha em `code-analysis.md`).

## 1. Laundry: iniciar e finalizar 🟢
```mermaid
flowchart TD
  A[Laundry.tsx: lista laundry_status] --> B{Máquina ocupada?}
  B -- não --> C[Botão Start: escolhe residente opcional]
  C --> D[rpc start_laundry p_machine p_stay]
  D --> E{Máquina ativa?}
  E -- não --> X1[[machine_not_found]]
  E -- sim --> F{can_write_lodge?}
  F -- não --> X2[[not_authorised]]
  F -- sim --> G{Já existe uso aberto?}
  G -- sim --> X3[[machine_busy 23505]]
  G -- não --> H{p_stay informado?}
  H -- sim --> I{Estadia do mesmo Lodge e não encerrada?}
  I -- não --> X4[[stay_not_open]]
  I -- sim --> J
  H -- não --> J[insert_handover_entry kind=laundry 'Wash started — A · Wash' + menção ao residente]
  J --> K[insert laundry_uses com handover_entry_id]
  B -- sim --> L[Botão Finish]
  L --> M[rpc finish_laundry p_use]
  M --> N{Já finalizado?}
  N -- sim --> O[retorna sem efeito idempotente]
  N -- não --> P[update finished_at finished_by]
  P --> Q[insert_handover_entry 'Dry finished — B · Dry']
```

## 2. Fridge: registrar temperatura 🟢
```mermaid
flowchart TD
  A[Fridge.tsx: digita temperatura] --> B{parseTemperature válido?}
  B -- não, vazio --> X0[Botão desabilitado / hint fridge.blankHint]
  B -- sim --> C[rpc record_fridge_reading]
  C --> D{Geladeira ativa?}
  D -- não --> X1[[fridge_not_found]]
  D -- sim --> E{can_write_lodge?}
  E -- não --> X2[[not_authorised]]
  E -- sim --> F{null ou fora de -40..40?}
  F -- sim --> X3[[temperature_required / invalid_temperature]]
  F -- não --> G[Lê param fridge.range_celsius, padrão 0-5]
  G --> H[out_of_range = t < min ou t > max]
  H --> I[insert fridge_readings com snapshot da faixa]
  I --> J{out_of_range?}
  J -- sim --> K[notifications fridge_out_of_range -> management + push]
  J -- não --> L
  K --> L[auto_sign_task fridge_temperature: assina tarefa do turno atual]
  L --> M[Cliente: toast sucesso ou alerta; recarrega]
```

## 3. Dinner: marcar quem pegou e fechar 🟢
```mermaid
flowchart TD
  A[Dinner.tsx: dinner_sheet + dinner_summary do dia] --> B[Toque em Took]
  B --> C{Antes das 18h e ainda não confirmou?}
  C -- sim --> D[Dialog earlyConfirm]
  D --> E
  C -- não --> E[rpc mark_dinner p_served = !served]
  E --> F{can_write_lodge?}
  F -- não --> X1[[not_authorised]]
  F -- sim --> G{Dia operacional já começou?}
  G -- não --> X2[[dinner_not_started]]
  G -- sim --> H[ensure_dinner_service cria/obtém serviço]
  H --> I{Serviço fechado e quem marca não é gestão?}
  I -- sim --> X3[[dinner_closed]]
  I -- não --> J{Estadia em dinner_stays 18h-22h?}
  J -- não --> X4[[stay_not_in_service]]
  J -- sim --> K{Já existe marca?}
  K -- não --> L[insert dinner_marks]
  K -- sim --> M{Gestão?}
  M -- sim --> N[update se valor mudou]
  M -- não --> O{Autor e dentro da janela 72h?}
  O -- não --> X5[[not_author / correction_window_closed]]
  O -- sim --> N
  L --> P[served=true vira evidência Seen Night em resident_evidence]
  N --> P
  Q[Após 22h, gestão: Fechar] --> R[rpc close_dinner leftovers packaged nota]
  R --> S{Serviço já fechado?}
  S -- não --> T{Perfil manager ou developer?}
  T -- sim --> U[grava closed_at closed_by]
  T -- não --> X6[[not_authorised]]
  S -- sim --> V{Perfil owner ou developer?}
  V -- sim --> W[grava edited_at edited_by, mantém nota se vazia]
  V -- não --> X7[[dinner_already_closed]]
```

## 4. Deliveries: nova entrega e alertas 🟢
```mermaid
flowchart TD
  A[Deliveries.tsx: New Delivery] --> B[Escolhe fornecedor ativo]
  B --> C[Cliente exige lote/validade/temperatura conforme flags do fornecedor]
  C --> D[rpc record_food_delivery]
  D --> E{can_see/can_write e Lodge tem Dinner?}
  E -- não --> X1[[not_authorised / service_not_available]]
  E -- sim --> F{Fornecedor existe, ativo, produto não vazio?}
  F -- não --> X2[[fields_required / supplier_inactive]]
  F -- sim --> G{Faltou lote, best before ou temperatura exigidos?}
  G -- sim --> X3[[batch_required / best_before_required / temperature_required]]
  G -- não --> H{Temperatura fora de -40..99?}
  H -- sim --> X4[[invalid_temperature]]
  H -- não --> I[insert food_deliveries com supplier texto e supplier_id]
  I --> J{supplier.links_order?}
  J -- sim --> K[notifications delivery_received -> management]
  J -- não --> L
  K --> L{expiry <= current_date + delivery.expiry_alert_days?}
  L -- sim --> M[notifications delivery_expiring -> management]
  L -- não --> N[fim]
  M --> N
  N --> O[Lista: tag vence logo se <= 2 dias fixo; tag vinculado/aguardando vínculo]
```
