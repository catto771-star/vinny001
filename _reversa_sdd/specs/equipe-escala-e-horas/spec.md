# Spec — equipe-escala-e-horas

> Redator Reversa · doc_level=completo · pt-br · 🟢/🟡/🔴. Siglas: `BP`=beta_profiles, `HS`=handover_shifts, `FS`=float_shift, `ST`=shift_times, `TB`=tasks_back, `BM`=beta_management. Fontes: `modules/equipe-escala-e-horas/*`, `state-machines.md §7, §11, §12`, `permissions.md`, `findings-verification.md` (#10, #11, #15), ADR 0007.
> Escopo: Rota (escala), Hours, Daily Tasks, Users e a ponte Handover-shift → horas. Vacations/Holidays são adjacentes (analisadas apenas parcialmente; ver §12).

## 1. Objetivo
Planejar a escala (Rota), apurar horas planejadas × efetivas, gerir tarefas diárias assinadas, e administrar contas/equipe, mantendo a conciliação entre turnos reais do Handover e o plano. 🟢

## 2. Atores
Admin (gestão), conta da casa (assina tarefas pela pessoa do turno), Staff/Cleaner (cadastro sem login). 🟢

## 3. Requisitos funcionais
**RF-01 Salvar turno da Rota (`save_rota_shift`).** Gestão; `p_end > p_start` (`invalid_period`); pessoa ativa; função×papel (`cleaner`↔cleaner, `office` só `porter`, `float` `porter|manager`) → `role_not_allowed`; sem sobreposição da mesma pessoa (`staff_overlap`); Float único por vez (`float_overlap`); Float sem casa. 🟢
- Veredito #11 CONFIRMADO: função `manager` **não** é restrita a papéis no banco (a restrição de `rotaRoles("manager")` é só do front).
- 🟡 função não-Float com `p_lodge` nulo falha com erro cru da constraint.

**RF-02 Publicar (`publish_rota`).** Gestão; intervalo ≤62 dias; publica rascunhos gravando `planned_*`; calcula `coverage_gaps` e, se >0, notifica `coverage_below_minimum`. 🟢

**RF-03 Cancelar e dividir.** `cancel_rota_shift` (sem checar existência), `split_rota_shift` (`invalid_split_time`; cobertura opcional herda validações; publica a cobertura sem `planned_*`). 🟢

**RF-04 Cobertura (`coverage_gaps`).** Janelas Day 07–19, Night 19–07 (office por casa) e Float 12:00–24:00; "buraco" = nenhuma interseção. 🟡 cobertura parcial não é detectada (pergunta aberta).

**RF-05 Hours (`staff_hours`, `staff_work_log`).** Previsto = Σ overlap de `planned_*`; efetivo = Σ overlap de turnos publicados até agora + `work_intervals`. Períodos dia/semana/quinzena/mês, intervalo em 07:00 Dublin, exportação CSV com BOM. 🟢
- Caminho "Ajustar" (`adjust_work_interval` sobre `duty_posts`) é **morto**: `staff_work_log` não devolve `source='post'`. 🟡

**RF-06 Lançar horas (`add_work_interval`).** Gestão; `can_see_lodge`; ≤24 h (`interval_too_long`); fim ≤ agora+5 min (`in_future`). 🟢

**RF-07 Revisão de turnos (`shift_hours_review`, `confirm_shift_hours`).** Turnos do Handover fechados (60 dias) com plano ao lado; `mismatch` se sem escala ou |Δ|>15 min; "Confirmar real" ou "Usar roster"; sobrescreve `starts_at/ends_at` da Rota (o `planned_*` permanece) ou cria turno `published` sem checar sobreposição. 🟢 / 🟡

**RF-08 Daily Tasks.** `shift_tasks` (modelos ativos agora + extras), `pending_tasks` (7 dias; `overdue`), `sign_task` (turno iniciado; signatário porter/manager/owner/developer; idempotente; permite tarefa passada), `create_task_template`, `create_extra_task`, `reassign_extra_task`. `set_task_template_active` e `my_task_alerts` **não** são chamadas pela UI. 🟢
- 🟡 Desativar modelo altera turnos passados (sem histórico de `active`).

**RF-09 Users.** Lista, edição (com `version`), reset de senha, (des)ativação, `person_summary` (funções 60 dias, escalas 14 dias, turnos, notas, horas do mês, assinaturas 30 dias). Papel só troca dentro do grupo com/sem login. `locale` é sempre gravado como `en-IE` (🟡 reseta idioma). 🟢

**RF-10 Edge `admin-users`.** Ver `acesso-e-autenticacao` RF-08. 🟢

**RF-11 Quem está de serviço.** `on_duty_staff`/`useOnDuty`: Office da casa, senão Float, pelos turnos publicados que cobrem agora (usa relógio do cliente, não `serverOffsetMs`; recarrega a cada 60 s). 🟡

## 4. Regras de negócio
RN-01 `overlap_minutes` = minutos inteiros truncados. 🟢
RN-02 Edição de turno **publicado** altera o horário real, nunca `planned_*`. 🟢
RN-03 Cancelar turno publicado mantém `planned_*` e conta como previsto (falta). 🟢
RN-04 Pessoas não pertencem a casa; só `station` guarda `home_lodge_id`. 🟢
RN-05 Assinatura de tarefa: uma por pessoa; várias pessoas podem assinar a mesma tarefa (`task_signatures_once`). 🟢
RN-06 Modelos de tarefa: 24 por casa semeados (13 Day + 11 Night), `created_at` zerado para evitar pendências retroativas. 🟢
RN-07 Horário padrão: Float 12:00–00:00, Cleaner 09:00–13:00, Office Day 07:00–19:00, Night 19:00–07:00. 🟢
RN-08 Manager pode promover a `owner` por `update` direto em `staff` (veredito #10 CONFIRMADO; a UI restringe o banco não). 🟢

## 5. Dados
`staff`, `duty_posts`, `rota_shifts`, `work_intervals`, `handover_shifts`, `task_templates`, `task_extras`, `task_signatures`, `vacations`, `holiday_locks`. Ver `modules/equipe-escala-e-horas/data-dictionary.md`. 🟢

## 6. Interfaces
Rotas `/rota`, `/hours`, `/tasks`, `/users`, `/vacations`. RPCs: `save_rota_shift`, `cancel_rota_shift`, `split_rota_shift`, `publish_rota`, `coverage_gaps`, `staff_hours`, `staff_work_log`, `add_work_interval`, `adjust_work_interval`, `shift_hours_review`, `confirm_shift_hours`, `match_rota_shift`, `on_duty_staff`, `shift_tasks`, `pending_tasks`, `sign_task`, `create_task_template`, `create_extra_task`, `reassign_extra_task`, `set_task_template_active`, `person_summary`. 🟢

## 7. Estados
`state-machines.md §7` (turno Handover), `§11` (turno Rota), `§12` (férias). 🟢

## 8. Permissões
Rota/Hours/Users/Tasks de criação: gestão. Assinar tarefa: `can_write_lodge` (conta da casa assina pela pessoa do turno). `staff_update` bloqueia só `developer`. 🟢

## 9. Casos de borda
- EB-01 Rota usa semanas 00:00 Dublin; Hours usa 07:00 (totais diferentes na fronteira). 🟡
- EB-02 `confirm_shift_hours` pode criar turno sobreposto. 🟡
- EB-03 `Rota.tsx` redefine `minutesLabel` (duplicação). 🟡
- EB-04 `add_work_interval` não valida existência/atividade da pessoa nem sobreposição. 🟡
- EB-05 `hours.planned_minutes`: turnos com `lodge_id` nulo só entram quando há >1 casa. 🟡

## 10. Requisitos não funcionais
Concorrência otimista (`version`); atualização de `useOnDuty` a cada 60 s; Edge function sem rate limit e com CORS `*`. 🔴

## 11. Contradições anotadas
Nenhuma com o Detetive; vereditos #10, #11, #15 (`quick_phrases`) compatíveis.

## 12. Lacunas 🔴
Vacations/Holidays (`register_vacation`, `set_vacation_status`, `holiday_calendar`, `lock_holiday_dates`, conflitos) só foram parcialmente analisadas — **sem spec detalhada** (ver questions.md). Ferramentas legadas de posto (`assume_post`).

## 13. Rastreabilidade
`src/pages/Rota.tsx, Hours.tsx, Tasks.tsx, Users.tsx, Vacations.tsx`; `src/lib/management.ts, useOnDuty.ts, password.ts`; `supabase/functions/admin-users/index.ts`; SQL `M01, M07, M08, M09, M11, M12, M13, M16, M18, M19, M25, M26, M27, M29, M33`; testes `management.test.ts`, `useOnDuty.test.ts`, `Users.test.tsx`, `tests/db/management.test.ts`, `beta-profiles.test.ts`.
