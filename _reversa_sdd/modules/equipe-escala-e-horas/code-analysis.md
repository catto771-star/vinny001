# equipe-escala-e-horas — Análise de código

Escala: 🟢 confirmado · 🟡 inferido · 🔴 lacuna. Abreviações (`supabase/migrations/`): `M1`=20261120000001_foundation · `OC`=20261120000007_occurrences · `M8`/`M9`=…08_task_model / …09_task_model_effective_now · `M11`=20261120000011_management · `FF`=20261120000012_fix_float_window · `RL`=20261121000013_range_limits · `BP`=20261124000016_beta_profiles · `HS`=20261125000018_handover_shifts · `TB`=20261125000019_tasks_back · `FS`=20261125000025_float_shift · `ST`=20261125000026_shift_times · `M27`=20261125000027_handover_coauthors · `M29`=20261125000029_house_scope · `M33`=20261125000033_people_roles · `M15s`=20261124000015_station_role · `M10`=20261120000010_services.

Escopo: Rota (escala), Hours (horas planejadas × efetivas), Tasks (Daily Tasks), Users (equipe/contas), `useOnDuty`, `src/lib/management.ts`, edge function `admin-users`, e a ponte Handover-shift → horas (`handover_shifts`). Vacations/Holidays são adjacentes e ficam fora desta análise (apenas o efeito `vacation_conflict` na publicação é citado).

## 0. Perfis e permissões-base 🟢
- `staff_role`: `porter, cleaner, manager, owner, developer` (`M1:16`) + `station` (conta da casa; `M15s:3`). `duty_function`: `office | float` (`M1:17`).
- Beta: só `station` (conta da casa) e gestão (`manager/owner/developer`) têm login; Porter e Cleaner são cadastros sem login (`admin-users/index.ts:61`, `staff.check (role <> 'cleaner' or user_id is null)` `M1:110`).
- `is_management()` = papel manager/owner/developer **e** MFA satisfeito (`aal2`, desligável por parâmetro de desenvolvimento) `M1:173-191`.
- `can_write_lodge(lodge)` vigente (`M29:19-28`): gestão; ou `station` da própria casa (`house_scope()`) com Lodge ativo; ou posto aberto (`duty_posts`) Float/do Lodge. `can_see_lodge` `M29:12-16`: `auth.uid() is null` (contexto interno) ou equipe ativa; station só vê a própria casa.
- "Quem está trabalhando" vem da Rota publicada, não de "Assumir Posto" (Beta) — comentário `useOnDuty.ts:4`. `assume_post`/`end_my_post` (`M1:263-364`) continuam no banco mas **nenhuma chamada em `src/`** (grep) 🟢; `duty_posts` ainda alimenta `can_write_lodge` e `staff_on_deactivate` (encerra posto ao desativar) `M1:372-395`.

## 1. Rota — `src/pages/Rota.tsx`

### 1.1 Frontend 🟢
- Semana de segunda a domingo: `weekStart(operationalDay(new Date()))` `:45`, `weekStart/weekDays` em `src/lib/management.ts:25-33`; intervalo da carga em **00:00 de Dublin** (`dublinWallTimeToDate(start,"00:00")` `:49-50`) — diferente do dia operacional (07:00) usado em Hours.
- `load` `:59-72`: `rota_shifts` não cancelados que intersectam a semana (RLS: equipe vê só `published`; gestão também `draft` `M11:715-717`); só para gestão chama `coverage_gaps` e `staff_hours` `:65-66`. `staff_hours` é filtrado para `planned>0 or effective>0` `:70`.
- `publish` `:83-90`: `publish_rota(from,to)`; toasts `rota.published` e, se `gaps>0`, `rota.gaps`. Botão desabilitado sem rascunhos `:~104`.
- Turno por dia civil de início (`civilDay` `:38-41`). Rótulos: turno publicado sem `planned_starts_at` = "cobertura" (`rota.cover`); diferença entre previsto e real é mostrada (`rota.plannedWas`).
- `ShiftDialog` `:192-…`:
  - função ∈ office/float/cleaner/manager; pessoas elegíveis = `rotaRoles(fn)` (`management.ts:105-112`: office→porter; float→porter,manager; cleaner→cleaner; manager→manager,owner,developer);
  - horários padrão `defaultTimes` (`management.ts:38-42`): Float 12:00–00:00 (dia seguinte), Cleaner 09:00–13:00, Office Day 07:00–19:00, Night 19:00–07:00 (dia seguinte);
  - `submit` `:214-230`: fim ≤ início ⇒ fim no dia seguinte (`dublinWallTimeToDate(endT <= startT ? addDays(date,1) : date, endT)` `:220`); Float envia `p_lodge = null` `:222`;
  - dividir turno `split` `:232-240` (hora da saída + cobertura opcional; se a hora ≤ início, assume dia seguinte `:~234`), cancelar `cancelShift` `:241-246`.

### 1.2 RPCs 🟢
- `save_rota_shift(p_id,p_staff,p_lodge,p_function,p_start,p_end)` vigente `M29:1320-1362` (origem `M11:193-234`):
  1. `can_see_lodge(p_lodge)` + `is_management()`; `p_start/p_end` não nulos e `p_end > p_start` (`invalid_period`);
  2. pessoa ativa (`staff_not_found` P0002);
  3. **regra de perfil** `:1335-1338`: `(função='cleaner') <> (papel='cleaner')`; `office` exige `porter`; `float` exige `porter` ou `manager` ⇒ `role_not_allowed`. **A função `manager` não tem restrição própria** (qualquer papel não-cleaner passa, inclusive `porter`/`station`), ao contrário de `rotaRoles("manager")` no cliente que declara "espelhar" o banco 🟡;
  4. sobreposição da mesma pessoa com outro turno não cancelado: `tstzrange(...) &&` ⇒ `staff_overlap` (23P01) `:1339-1342`;
  5. Float: só um por vez (`float_overlap`) `:1344-1347`;
  6. insert/update: `lodge_id` forçado a null para Float; update só em turno não cancelado (`shift_not_found`). Tabela impõe `check ((function='float') = (lodge_id is null))` (`M11:187`) ⇒ função não-Float com `p_lodge null` falha com erro cru de constraint (sem mensagem amigável) 🟡. Edição de turno já **publicado** altera `starts_at/ends_at` (horário real) sem tocar `planned_*` (comportamento intencional: "mudanças depois mexem no horário real" `BP:107-109`).
- `cancel_rota_shift(p_id)` `M11:236-246`: gestão; `update status='cancelled'` sem checar existência (id inexistente = silêncio). Turno publicado cancelado mantém `planned_*` e conta como previsto (falta) em `staff_hours`/`staff_work_log` `BP:170-171,215`.
- `split_rota_shift(p_shift,p_at,p_cover)` `BP:142-166`: gestão; turno não cancelado (`for update`); `p_at` estritamente entre início e fim (`invalid_split_time`); encurta o original (`ends_at=p_at`); se há cobertura, cria novo turno via `save_rota_shift(null, cover, lodge, função, p_at, fim_original)` (herda validações; erro de perfil/sobreposição desfaz tudo) e, se o original estava `published`, publica a cobertura sem `planned_*` (⇒ "cover").
- `publish_rota(from,to)` vigente `BP:114-138`: gestão; `check_range` (início<fim, ≤ 62 dias `RL:3-13`); publica rascunhos que intersectam o intervalo gravando `planned_starts_at/ends_at = coalesce(planned, atual)`; calcula `coverage_gaps` e, se >0, insere notificação `coverage_below_minimum` (management) `payload{gaps,from,to}`; retorna `{published, gaps}`.
- `coverage_gaps(from,to)` vigente `RL:17-52` (janela Float corrigida em `FF:4-38`): gestão; para cada dia operacional e Lodge ativo gera janelas **Day 07–19** e **Night 19–(07 do dia seguinte)** e uma janela **Float 12:00–24:00** (`slot_instant(d,'12:00')` → `slot_instant(d,'00:00')`, esta última já é meia-noite seguinte `FF:1-3`). Uma janela é "buraco" se **nenhum** turno não cancelado a intersecta (`&&`) com função `float` (janela Float) ou `office` no mesmo Lodge (janelas Day/Night). Logo cobertura **parcial** não é detectada 🟡. Turnos `manager`/`cleaner` não contam.

### 1.3 Algoritmos
`overlap_minutes(a1,a2,b1,b2) = max(0, floor(extract(epoch from least(a2,b2) - greatest(a1,b1))/60))` `M11:373-378` (minutos inteiros, truncados).

## 2. Hours — `src/pages/Hours.tsx`

### 2.1 Frontend 🟢
- Período dia/semana/quinzena/mês (`PeriodKind`, `periodRange`/`shiftPeriod` `management.ts:114-154`; quinzena = semana anterior + corrente `:124-127`), âncora padrão hoje; intervalo em **07:00 Dublin** `Hours.tsx:44`.
- `load` `:46-51` chama `staff_hours`; `loadLog` `:53-57` chama `staff_work_log` por pessoa. `exportCsv` `:78-91` (BOM, colunas Name/Profile/Planned/Worked/Difference, `h:mm`).
- `IntervalDialog` `:167-217`: lançar horas (`add_work_interval`, nota opcional, Lodge) ou ajustar um item `source='post'` (`adjust_work_interval`, motivo obrigatório `:178`). Validação: `e2 > s`. **Porém** `staff_work_log` vigente (`BP:200-222`) só devolve `roster|cover|cancelled|manual`; o ramo `post` (botão "Ajustar" `:146`) nunca aparece ⇒ caminho morto 🟡. Itens `roster/cover` levam a `/rota` `:147`.
- `ShiftReview` `:229-285` (revisão 25/11): lista `shift_hours_review()` filtrando `hours_status='pending'`; "Confirmar tudo que bate" confirma sequencialmente as linhas sem `mismatch` com `opened_at/closed_at` `:250-253`; por linha: "Confirmar real" (abertura/encerramento do Handover) ou "Usar roster" (horário previsto) `:240-249`.

### 2.2 RPCs 🟢
- `staff_hours(from,to)` vigente `BP:172-197`: gestão; `check_range`; por pessoa (exclui `station`; inclui ativos ou quem tem turno no período):
  - **previsto** = Σ `overlap_minutes(planned_starts_at, planned_ends_at, from, to)` dos turnos com `planned_starts_at` (publicados e cancelados depois = falta);
  - **efetivo** = Σ overlap de `starts_at/ends_at` dos turnos `published` até `least(p_to, now())` **+** Σ overlap de `work_intervals` (horas lançadas à parte) em `[from,to]`.
  (Versões anteriores usavam `duty_posts`: `M11:380-400`, `RL:298-319`; o comentário de `Hours.tsx:30` "Assumir Posto" está obsoleto.)
- `staff_work_log(staff,from,to)` `BP:200-222`: gestão; `roster` (publicado com `planned`), `cover` (publicado sem `planned`), `cancelled` (cancelado com `planned`) e `manual`; texto "planned HH:MM–HH:MM" quando o real difere do previsto.
- `add_work_interval(staff,lodge,start,end,note)` vigente `M29:136-157`: `can_see_lodge(lodge)` + gestão; `p_staff/p_start/p_end` não nulos e finitos, `end > start` (`invalid_period`); duração ≤ 24 h (`interval_too_long`); `end <= now()+5 min` (`in_future`). Não valida existência/atividade da pessoa (FK) nem sobreposição.
- `adjust_work_interval(post,start,end,reason)` `RL:362-390`: gestão; motivo obrigatório; trava `duty_posts`; `end > start`; ≤ 24 h; grava `adjust_reason/adjusted_by` (apenas para `duty_posts`).
- `shift_hours_review()` `HS:161-181`: gestão; turnos do Handover **fechados** nos últimos 60 dias com o previsto da escala ao lado; `mismatch = sem escala ou |início_escala − abertura| > 15 min ou |fim_escala − encerramento| > 15 min`; pendentes primeiro.
- `confirm_shift_hours(shift,start,end)` vigente `FS:134-168`: gestão; turno fechado (`shift_not_found`); `start/end` default = abertura/encerramento; `end > start`, ≤ 24 h, `end <= now()+5 min` (`invalid_period`). Se o turno tem `rota_shift_id`: **sobrescreve** `starts_at/ends_at` da escala (o `planned_*` permanece); senão cria turno `published` (função `float`, `office` para porter ou `manager`) sem checar sobreposição `:158-161` 🟡. Marca `hours_status='confirmed'` + `confirmed_start/end/by/at`.

## 3. Turnos do Handover (fonte das horas reais) 🟢
- Tabela `handover_shifts` (`HS:9-26` + `FS:3`): um turno de **Office** aberto por Lodge e **um Float** aberto globalmente (índices únicos parciais `FS:5-6`).
- `open_handover_shift(lodge,staff,function,at)` vigente `M29:739-771` (origem `ST:6-37`): `can_see_lodge` + `can_write_lodge`; função office|float; horário não futuro (+5 min) nem > 24 h no passado (`invalid_time`); pessoa ativa com papel porter/manager/owner/developer (`invalid_filled_by`); `shift_already_open` (23505); liga ao turno da Rota via `match_rota_shift` e escreve anotação "Shift opened — Nome" (Float: "Float shift opened —").
- `match_rota_shift(staff,lodge,at,function)` `M29:670-686`: turno **publicado** da pessoa; Float casa só `function='float'`; Office casa `lodge_id = lodge or null`; janela `starts_at − 3 h ≤ at < ends_at`; escolhe o de início mais próximo.
- `close_handover_shift(shift,handed_to,note,at)` `ST:39-86`: `shift_already_closed`; `at` entre abertura e agora+5 min; `hours_status='pending'`; anotação "Shift closed — …"; se `|escala − real| > 15 min` ou sem escala, notificação `shift_hours_review` (management, push default ligado); se `handed_to`, abre imediatamente o turno de quem assume (mesma função e mesmo horário `at`).
- `handover_fill_default` (trigger `BEFORE INSERT` em `handover_entries`, `FS:25-52`): vincula a anotação ao turno de Office aberto (janela de até 12 h) e preenche `filled_by` (escolha explícita → pessoa do turno → pessoa da Rota se `station` → quem digita).
- `on_duty_staff(lodge, at)` `BP:25-36` e `useOnDuty` (`src/lib/useOnDuty.ts:16-44`): Office do Lodge, senão Float (ordenado office primeiro, início mais recente). O cliente lê `rota_shifts` publicados que cobrem `new Date()` (relógio do cliente, **não** `serverOffsetMs`) e recarrega a cada 60 s `:22-35`; `onDutyFor` `:42-44`.

## 4. Tasks (Daily Tasks) — `src/pages/Tasks.tsx`

### 4.1 Modelo e regras 🟢
- Três tabelas (`OC:311-352`): `task_templates` (modelo recorrente por Lodge+turno `day|night`, `weekdays` ISO 1–7 ou null = todos os dias, título jsonb `{pt-PT,en-IE,pl-PL}`, `suggested_time` texto de referência, `active`, `auto_key`), `task_extras` (tarefa avulsa do dia/turno, para uma pessoa ou para o turno todo, `due_at`, `reassigned_from`), `task_signatures` (assinatura com `staff_id`, `duty_function`, `signed_at`). Check `(template_id is null) <> (extra_id is null)`; índice único `task_signatures_once (coalesce(template,extra), lodge, day, shift, staff)` ⇒ várias pessoas podem assinar a mesma tarefa, a mesma pessoa só uma vez `OC:352`.
- Semente (24 modelos por Lodge para Amiens e Connolly, 13 Day + 11 Night, em 3 idiomas) `M8:5-34`; `M9:5-8` zera `created_at` dos modelos sem autor para `now()` (evita "pendências" retroativas desde 01/01/2026).
- Turnos: Day 07–19, Night 19–07 (`shift_start_of/shift_end_of` `OC:21-34`). `shift_tasks(lodge,day,shift)` vigente `M29:1422-1447`: `can_see_lodge`; modelos **ativos agora** do Lodge/turno com `weekdays` null ou contendo o dia ISO e `created_at <= shift_end_of(day,shift)`; mais os extras do dia/turno; ordena por `sort_order` (extras = 1000) e `suggested_time`; devolve `signatures` jsonb ordenadas. (Desativar um modelo faz a tarefa sumir também de turnos passados — o campo `active` não tem histórico 🟡.)
- `pending_tasks(lodge)` `M29:904-928`: varre os **últimos 7 dias operacionais** (hoje−6..hoje) × {day,night} cujo turno já começou, e devolve tarefas **sem nenhuma assinatura**; `overdue` quando `coalesce(due_at, fim_do_turno) < now()`; `overdue_since` correspondente. A tela mostra só as `overdue` `Tasks.tsx:79`.
- `sign_task(kind,task,lodge,day,shift,signed_by)` vigente `M29:1449-1482` (origem `TB:4-36`): `can_see_lodge` + `can_write_lodge`; recusa turno que começa a > 5 min no futuro (`shift_not_started`); a tarefa deve existir naquele turno (`task_not_in_shift`); signatário = `p_signed_by`, senão (station) a pessoa do turno de Handover aberto, senão quem chama; precisa ser ativo e porter/manager/owner/developer (`invalid_filled_by`); `duty_function` = função do posto aberto, ou `'office'` para station, ou o papel; `on conflict do nothing` (idempotente). Permite assinar **tarefa passada** (pendente) 🟢.
- `create_task_template(lodge,shift,weekdays,title,sort,suggested_time)` vigente `M29:472-488`: gestão; sem validação de `weekdays`/título além dos checks da tabela; `sort` default 0; UI envia `sort=100` e título só em `en-IE` `Tasks.tsx:250` (outros idiomas caem em `en-IE` via `pickTitle`, `src/lib/occurrences.ts:44-47`).
- `create_extra_task(lodge,day,shift,staff,title,due_at)` `M29:421-437`: gestão; título `trim` (check `length(trim)>0`); sem validar a pessoa nem `due_at`.
- `reassign_extra_task(extra)` `OC:478-488`: gestão; tarefa de pessoa fora do turno passa para o turno (`reassigned_from = staff_id; staff_id = null`) (regra B15).
- `set_task_template_active(id, active)` `TB:41-52` (gestão; `task_not_found`) e `my_task_alerts()` `OC:491-505` **não são chamadas pela UI** (grep) 🟢 ⇒ não há como desativar um modelo recorrente pela tela.
- Assinatura automática (Fridge): ver `servicos-da-casa` — `auto_sign_task` insere em `task_signatures` com `auto_key`.

### 4.2 Frontend 🟢
`Tasks.tsx`: dia + turno (default turno atual pelo relógio ajustado `serverOffsetMs` `:47-50`); `canWrite = canWriteLodge(lodgeId)` `:62`; conta da casa escolhe "assinando como" (default = pessoa do turno aberto, consulta `handover_shifts` `:64-67`; lista `porter/manager/owner/developer` `:59`); botão assinar `sign` `:86-93` envia `p_signed_by = signer || shiftPerson || null`; gestão: "Tarefa recorrente" (`RecurringTaskDialog` `:240-281`, sem dias = todos os dias `:250`) e "Extra" (`ExtraTaskDialog` `:283-336`; pessoas = `role !== 'station'`); "Reatribuir" para extras de pessoa não assinados `:169-171`. Progresso = tarefas com ≥ 1 assinatura / total `:106,130`. Pendentes atrasadas listadas abaixo com duração "atrasada há …" `:184-207`.

## 5. Users — `src/pages/Users.tsx` e `admin-users`

### 5.1 Frontend 🟢
- Lista `staff` (todos) ordenada por ativo/nome `:51-54`; abas Ativos/Inativos e Equipe(`role ≠ station`)/Contas(`user_id` não nulo) `:124`; ações Editar / Redefinir senha (só com login e ativo) / Desativar-Reativar, ocultas para `developer` e para o próprio usuário `:135-145`.
- `CREATABLE_ROLES = station,porter,cleaner,manager,owner`; `LOGIN_ROLES = station,manager,owner,developer` `:18-19`. Criação com login gera senha temporária no cliente (`generateTemporaryPassword`, `src/lib/password.ts`) e a exibe uma vez `:288-301,104-110`.
- Edição `:271-287`: `update staff` com `version` (concorrência otimista — `bump_version` recusa `stale_version`); papel só troca dentro do grupo (com login ↔ com login; sem login ↔ sem login) `:278`; `home_lodge_id` só para station `:280`. **`locale` é sempre gravado como `"en-IE"`** (constante `:261`, enviada em `:279` e na criação `:294`) ⇒ editar uma pessoa reseta o idioma dela 🟡.
- `PersonDialog` `:203-244` chama `person_summary(staff)` (gestão): funções na Rota (60 dias), próximas escalas (14 dias), 10 turnos recentes do Handover, 15 anotações (como autor ou coautor, exclui `kind='shift'`), horas do mês via `staff_hours`, e assinaturas de tarefas nos últimos 30 dias `M27:81-111`.

### 5.2 Edge function `supabase/functions/admin-users/index.ts` 🟢
- CORS aberto (`*`) `:7-11`; só POST `:36`. Cria dois clientes: `caller` (JWT do chamador, anon key) e `admin` (service role, só no servidor) `:44-45`.
- Autorização: `caller.rpc("is_management")` ≠ true ⇒ 403 `not_authorised` `:47-48` (gestão com MFA).
- `create` `:57-94`: valida nome, papel ∈ {station,porter,cleaner,manager,owner} (developer **nunca** criado) `:58-59`; login só para station/manager/owner `:61`; station exige `home_lodge_id` `:62`; com login: e-mail obrigatório e senha forte (≥ 10 car., letra e dígito) `:31-33,66-68`; `auth.admin.createUser(email_confirm:true)` `:69`; insere em `staff` **com o JWT do chamador** (RLS e auditoria registram o autor real) com `must_change_password = withLogin` `:74-87`; se o insert falha, **remove** o usuário de Auth criado (compensação) `:89-91`.
- `reset_password` `:96-108`: alvo lido via RLS; precisa ter login (`no_login`) e senha forte; marca `must_change_password=true` primeiro (RLS: um Developer só é alterado por Developer) e só então troca a senha por service role.
- `set_active` `:96,110-120`: atualiza `staff.active` via RLS (trigger `staff_on_deactivate` encerra postos abertos e carimba `deactivated_*` `M1:372-395`) e aplica `ban_duration` `876000h` (≈ 100 anos) ao desativar ou `none` ao reativar `:117`.
- Ação desconhecida ⇒ 400 `unknown_action` `:122`. Não há limitação de taxa nem registro de tentativa no código da função 🔴.

### 5.3 RLS de `staff` `M1:884-890`
Leitura: toda a equipe ativa (inclui e-mail). Insert: gestão com `role <> 'developer'`. Update: `using is_management()` e `with check is_management() and (role <> 'developer' or current role = developer)`; `grant insert, update` na tabela inteira `M1:855` ⇒ um Manager pode, via API direta, alterar qualquer coluna (inclusive promover a `owner`); a UI restringe, o banco não 🟡.

## 6. Utilitários `src/lib/management.ts` 🟢
`lineTotal` `:6-10` (compras), `formatEUR` `:12-15`, `minutesLabel` `:18-22` (ex.: "12 h 05", negativos com "−"), `weekStart/weekDays` `:25-33`, `defaultTimes` `:38-42`, `rotaRoles` `:105-112`, `periodRange` `:116-140`, `shiftPeriod` `:143-154` (mês vai ao dia 1 sem pular meses curtos), `REPORT_CATEGORIES`/`blocksOf` `:157-168` (relatórios). Nota: `Rota.tsx:26-34` redefine `minutesLabel` (formato igual, sem sinal) e `signedMinutes` — duplicação 🟡.

## 7. Riscos e inconsistências 🟡
1. `rotaRoles("manager")` (cliente) mais restrito que `save_rota_shift` (servidor).
2. `coverage_gaps` só detecta ausência total de turno na janela.
3. Ramo "Ajustar post" de Hours e `assume_post`/`end_my_post` sem uso (legado Beta).
4. `confirm_shift_hours` pode criar turno sobreposto.
5. Rota semanal 00:00 × Hours 07:00 (âncoras diferentes).
6. `Users.tsx` sobrescreve `locale`.
7. `useOnDuty` usa relógio do cliente.
8. `Hours.tsx:30` e outros comentários obsoletos.

## 8. Testes de referência
`src/lib/management.test.ts`, `src/lib/useOnDuty.test.ts`, `src/pages/Users.test.tsx`, `src/pages/management.ui.test.tsx`, `tests/db/management.test.ts`, `tests/db/beta-profiles.test.ts`, `tests/db/occurrences.test.ts`, `tests/db/house-scope.test.ts`, `tests/e2e/phase3-management.e2e.cjs`, `tests/e2e/scenarios-admin-people-structure.e2e.cjs`.
