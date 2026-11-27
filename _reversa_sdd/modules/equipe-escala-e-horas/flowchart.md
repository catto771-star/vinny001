# equipe-escala-e-horas — Fluxogramas

Legenda: 🟢 confirmado (referências em `code-analysis.md`).

## 1. Rota: montar, publicar e cobertura 🟢
```mermaid
flowchart TD
  A[Rota.tsx: gestão abre ShiftDialog] --> B[Escolhe função, pessoa elegível rotaRoles, Lodge, dia, início, fim]
  B --> C[fim <= início => dia seguinte; Float sem Lodge]
  C --> D[rpc save_rota_shift]
  D --> E{Gestão, período válido, pessoa ativa?}
  E -- não --> X1[[not_authorised / invalid_period / staff_not_found]]
  E -- sim --> F{Perfil permitido na função? office=porter, float=porter|manager, cleaner<->cleaner}
  F -- não --> X2[[role_not_allowed]]
  F -- sim --> G{Mesma pessoa com turno sobreposto?}
  G -- sim --> X3[[staff_overlap]]
  G -- não --> H{Float e já há outro Float no intervalo?}
  H -- sim --> X4[[float_overlap]]
  H -- não --> I[insert ou update do rascunho/turno]
  I --> J[status draft: só gestão vê]
  J --> K[rpc publish_rota from..to, máx 62 dias]
  K --> L[drafts do intervalo -> published, planned_* = starts/ends]
  L --> M[coverage_gaps: janelas Day 07-19, Night 19-07, Float 12-24]
  M --> N{Janela sem nenhum turno que a intersecte?}
  N -- sim --> O[notifications coverage_below_minimum + aviso na tela]
  N -- não --> P[ok]
  L --> Q[Equipe passa a ver o publicado; useOnDuty usa a escala]
```

## 2. Dividir e cancelar turno 🟢
```mermaid
flowchart TD
  A[Turno existente] --> B{Ação}
  B -- Cancelar --> C[cancel_rota_shift status=cancelled]
  C --> D[Publicado mantém planned_*: conta como previsto = falta]
  B -- Dividir --> E[split_rota_shift p_at p_cover]
  E --> F{p_at entre início e fim?}
  F -- não --> X[[invalid_split_time]]
  F -- sim --> G[original.ends_at = p_at]
  G --> H{Há cobertura?}
  H -- não --> I[fim]
  H -- sim --> J[save_rota_shift cobertura de p_at até fim original]
  J --> K{Original publicado?}
  K -- sim --> L[cobertura published sem planned_ => 'cover']
  K -- não --> M[cobertura draft]
```

## 3. Horas: previsto × efetivo e confirmação do Handover 🟢
```mermaid
flowchart TD
  A[Porter/Float abre turno no Handover: open_handover_shift] --> B[match_rota_shift: turno publicado até 3h antes do início]
  B --> C[handover_shifts aberto, hours_status=open]
  C --> D[close_handover_shift handed_to nota at]
  D --> E[hours_status=pending; anotação Shift closed]
  E --> F{Sem escala ou diferença > 15 min em alguma ponta?}
  F -- sim --> G[notifications shift_hours_review -> gestão + push]
  F -- não --> H
  D --> I{handed_to informado?}
  I -- sim --> J[abre turno de quem assume no mesmo horário]
  G --> H[Hours.tsx ShiftReview: shift_hours_review mostra pendentes]
  H --> K{Gestão decide}
  K -- Confirmar real --> L[confirm_shift_hours com abertura/encerramento]
  K -- Usar roster --> M[confirm_shift_hours com horário previsto]
  K -- Confirmar todos que batem --> L
  L --> N{Turno já ligado a escala?}
  M --> N
  N -- sim --> O[sobrescreve starts_at/ends_at da escala; planned_* permanece]
  N -- não --> P[cria turno published de cobertura]
  O --> Q[hours_status=confirmed]
  P --> Q
  Q --> R[staff_hours: previsto Σ planned_*; efetivo Σ turnos published até agora + work_intervals]
  S[Hours.tsx: + Lançar horas] --> T[add_work_interval ≤24h, não futuro] --> R
```

## 4. Daily Tasks: assinar e pendências 🟢
```mermaid
flowchart TD
  A[Tasks.tsx: dia + turno] --> B[shift_tasks: modelos ativos com weekday + extras]
  B --> C[Lista com assinaturas]
  C --> D[Assinar: sign_task]
  D --> E{can_write_lodge?}
  E -- não --> X1[[not_authorised]]
  E -- sim --> F{Turno começa > 5 min no futuro?}
  F -- sim --> X2[[shift_not_started]]
  F -- não --> G{Tarefa pertence ao turno?}
  G -- não --> X3[[task_not_in_shift]]
  G -- sim --> H[Signatário = escolhido, senão pessoa do turno aberto se station, senão quem chama]
  H --> I{Ativo e porter/manager/owner/developer?}
  I -- não --> X4[[invalid_filled_by]]
  I -- sim --> J[insert task_signatures on conflict do nothing]
  K[pending_tasks: 7 dias operacionais, turnos iniciados, sem assinatura] --> L{coalesce due_at, fim do turno < agora?}
  L -- sim --> M[Mostra como atrasada; pode assinar com dia/turno originais]
  N[Gestão] --> O[create_task_template recorrente]
  N --> P[create_extra_task pessoa ou turno]
  N --> Q[reassign_extra_task: pessoa vira turno]
  R[record_fridge_reading] --> S[auto_sign_task auto_key=fridge_temperature]
```

## 5. Users: criar, redefinir senha, desativar 🟢
```mermaid
flowchart TD
  A[Users.tsx StaffForm] --> B{Perfil com login? station, manager, owner}
  B -- não Porter/Cleaner --> C[callAdmin create sem senha nem e-mail obrigatório]
  B -- sim --> D[Gera senha temporária no cliente]
  D --> E[callAdmin create com e-mail e senha]
  C --> F[Edge admin-users]
  E --> F
  F --> G{rpc is_management do chamador?}
  G -- não --> X1[[403 not_authorised]]
  G -- sim --> H{Dados válidos? papel != developer, station com casa, senha >=10 letra+dígito}
  H -- não --> X2[[400 erro]]
  H -- sim --> I[service role: auth.admin.createUser se login]
  I --> J[insert staff com JWT do chamador RLS+auditoria]
  J --> K{Falhou?}
  K -- sim --> L[deleteUser compensa]
  K -- não --> M[staff_id; senha mostrada uma vez ao gestor]
  N[Redefinir senha] --> O[staff.must_change_password=true via RLS] --> P[service role updateUserById]
  Q[Desativar/Reativar] --> R[staff.active via RLS; trigger encerra postos] --> S[ban_duration 876000h ou none]
```
