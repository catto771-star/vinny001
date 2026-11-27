# servicos-da-casa — Análise de código

Escala: 🟢 confirmado no código · 🟡 inferido · 🔴 lacuna. Abreviações de migração (pasta `supabase/migrations/`):
`M10`=20261120000010_services · `M14`=20261124000014_beta_operations · `M29`=20261125000029_house_scope · `M15`=20261126000037_r15 · `M18`=20261125000018_handover_shifts · `M34`=20261125000034_structure · `M30`/`M32`=system_settings/more_settings · `M1`=20261120000001_foundation · `presence`=20261120000006_presence · `handover_tags_push`=20261125000023_handover_tags_push · `beta_profiles`=20261124000016_beta_profiles.

Escopo: Laundry, Fridge, Dinner, Deliveries (Food Delivery), `src/lib/services.ts`, alertas de validade e a ponte com notificações. Backend 100% RPC `security definer` (`set search_path = public`); escritas só por RPC (tabelas têm apenas `grant select`, `M10:489-494`) 🟢.

## 1. Telas (frontend)

| Tela | Arquivo | Lodge | RPCs / leituras | Papel de escrita |
|---|---|---|---|---|
| Laundry | `src/pages/Laundry.tsx` | só `has_laundry` (Connolly) via `useLodgeState(hasLaundry)` `:20,27` | `laundry_status` `:37`, `start_laundry` `:105`, `finish_laundry` `:47` | `canWriteLodge(lodgeId)` `:32` |
| Fridge | `src/pages/Fridge.tsx` | ambos | `fridges`, `fridge_readings` (limit 120), `param_value('fridge.range_celsius')` `:40-44`; grava `record_fridge_reading` `:69` | `canWriteLodge` `:122` |
| Dinner | `src/pages/Dinner.tsx` | só `has_dinner` (Amiens) `:25,34` | `dinner_sheet`, `dinner_summary` `:53-54`, `mark_dinner` `:72`, `close_dinner` `:210` | `canWriteLodge && (!closed \|\| isManagement)` `:46` |
| Deliveries | `src/pages/Deliveries.tsx` | só `has_dinner` `:33` | tabela `food_deliveries` (limit 100) `:52`, `record_food_delivery` `:142`, hook `useSuppliers` `:22-32` | `canWriteLodge` |
| Helpers | `src/lib/services.ts` | — | `parseTemperature` `:4-8`, `isOutOfRange` `:10-12`, `expiresSoon` `:15-18`, `notificationText` `:31-61` | — |

Padrão comum: `useLatestRequest()` descarta respostas antigas (`Laundry.tsx:31,36-38`, `Dinner.tsx:39,50-56`) 🟢; erros de RPC → `t(errorKey(error))` em toast/`Notice` 🟢.

## 2. Laundry (Connolly)

### 2.1 Regras 🟢
- Máquinas por Lodge (`laundry_machines`), `kind in ('wash','dry')`; semente de 4 máquinas A/B Wash/Dry para todo Lodge com `has_laundry` `M10:349-354`. Gestão pode adicionar/renomear/desativar (`add_laundry_machine`, `rename_laundry_machine`, `set_laundry_machine_active` `M34:110-145`; código `M{n}-{KIND}` gerado em loop `M34:119-121`; ordem `100+n`).
- Uma única utilização aberta por máquina: índice único parcial `laundry_one_open_use ... where finished_at is null` `M10:369` + checagem explícita `machine_busy` (23505) `M14:118-120`.
- `start_laundry(p_machine, p_stay)` `M14:101-132`:
  1. máquina precisa existir e estar `active` (senão `machine_not_found` P0002) `:113-114`;
  2. `current_staff_id() is not null and can_write_lodge(v_m.lodge_id)` senão `not_authorised` 42501 `:115-117`;
  3. se `p_stay` informado, a estadia deve ser do mesmo Lodge e `status <> 'ended'` (`stay_not_open`) `:121-124`;
  4. cria linha no Handover (`kind='laundry'`) com corpo `"Wash started — A · Wash"` via `laundry_entry_body` `M14:93-99`, mencionando o residente (`[{"resident_id": ...}]`) quando há estadia `:125-126`;
  5. insere `laundry_uses` com `handover_entry_id` do passo 4 `:127-129`.
- `finish_laundry(p_use)` `M14:134-155`: `for update`; idempotente (`if finished_at is not null then return`) `:149`; grava `finished_at/finished_by` e cria **segunda** anotação `"Dry finished — B · Dry"` com o mesmo residente `:151-153`. A versão original (`M10:406-421`) "só libera sem anotação"; foi superada em `M14` — o comentário de `Laundry.tsx:22` ("finalizar só libera") está desatualizado 🟢.
- `laundry_status(p_lodge)` `M29:590-606`: `can_see_lodge` + máquinas ativas com `left join` na utilização aberta e no residente; ordena por `sort_order`.
- Observação: a utilização aponta só para a anotação de início (`handover_entry_id`); a anotação de término não é referenciada de volta 🟢.
- `Laundry.tsx:99-134`: seletor de residente lista só camas com `stay_id` (de `useOccupancy`) e permite "sem residente" (`p_stay: null`) `:105,127-128`.

### 2.2 Tratamento de erros 🟢
`machine_busy` pode ocorrer em corrida de dois cliques: a checagem `exists` não é atômica, mas o índice único parcial garante a unicidade (falha 23505 mapeada por `errorKey`).

## 3. Fridge / Temperatura

- Modelo atual: várias geladeiras por Lodge (`fridges`, `M14:241-258`: Amiens 1 "Kitchen fridge", Connolly 4). Cada leitura pertence a uma geladeira (`fridge_readings.fridge_id not null`, backfill `M14:260-263`) 🟢. O comentário de cabeçalho de `Fridge.tsx:21` ("só a geladeira") está desatualizado.
- `record_fridge_reading(p_fridge, p_temperature, p_note)` `M14:271-309` 🟢:
  1. geladeira ativa existe (`fridge_not_found` P0002) `:285-286`;
  2. `can_write_lodge` `:287-289`;
  3. `p_temperature is null` → `temperature_required` (em branco ≠ 0 °C) `:291`; fora de [-40, 40] → `invalid_temperature` `:292`;
  4. faixa lida de `param_value('fridge.range_celsius', lodge)` com *fallback* 0–5 `:293-295`; `out_of_range = t < min or t > max` (limites inclusivos) `:296`;
  5. grava leitura com **snapshot** da faixa (`range_min/range_max`) e `round(temp,1)` `:297-299`;
  6. se fora da faixa: `notifications(kind='fridge_out_of_range', audience='management', payload{reading_id,temperature,min,max,fridge_id,fridge_name})` `:300-305`;
  7. `auto_sign_task(lodge, 'fridge_temperature')` `:306`.
- `auto_sign_task(p_lodge, p_key)` `M10:14-32`: no turno atual (`operational_day(now())`, `shift_of(now())`), assina o(s) modelo(s) de `shift_tasks` com `task_templates.auto_key = p_key` (`on conflict do nothing`). `auto_key='fridge_temperature'` foi aplicado por `update ... where title ->> 'en-IE' = 'Fridge temperature'` `M10:10-11`, ou seja, por **título em inglês** (🟡 frágil: renomear o modelo ou criar um novo sem `auto_key` quebra o vínculo). Assina como `current_staff_id()` (a conta da casa, se for station) e `duty_function = coalesce(post.function, role)` `:25-26` (🟡 diverge de `sign_task`, que exige signatário porter/manager/owner/developer — ver §7).
- `record_fridge_temperature(p_lodge,…)` `M14:312-325` (redefinida em `M29:982-996`): legado por casa; grava na primeira geladeira ativa. Não chamada pela UI (`grep` em `src/`) 🟢.
- Cliente `Fridge.tsx:64-77`: `parseTemperature` (`services.ts:4-8`: troca `,` por `.`, regex `^-?\d{1,2}(\.\d)?$`, vazio → `null`); botão salvar desabilitado se `parsed === null` (`:144`); alerta local `isOutOfRange` só para UX (toast `fridge.savedAlert`) `:72`; a decisão real é do banco 🟢.
- Histórico: `fridge_readings` sem RPC de edição/anulação (apenas `select`) — leitura errada não é corrigível pela aplicação 🔴 (ver questions.md).
- Parâmetro por Lodge: `param_value(key, lodge)` prioriza linha do Lodge `M1:133-146`, mas `set_system_parameter` insere sempre `lodge_id` nulo `M30:64` → faixa por casa não é configurável pela UI 🟡.

## 4. Dinner (Amiens, 18h–22h)

- Entidades: `dinner_services` (um por Lodge × dia operacional, `unique (lodge_id, operational_day)`) e `dinner_marks` (um por serviço × estadia) `M10:135-160`.
- `ensure_dinner_service(p_lodge, p_day)` `M29:547-565`: `can_see_lodge`; exige `lodges.has_dinner` (`service_not_available`); `insert ... on conflict do nothing` + select (criação preguiçosa e idempotente).
- `dinner_stays(p_lodge, p_day)` `M29:512-526`: estadias do Lodge com `admitted_at < slot_instant(dia,'22:00') and (ended_at is null or ended_at > slot_instant(dia,'18:00'))` — qualquer sobreposição com a janela 18h–22h. `slot_instant` (`presence:33-38`) coloca horários ≥ 07:00 no dia civil do dia operacional 🟢.
- `mark_dinner(p_lodge,p_day,p_stay,p_served)` versão vigente `M29:626-668` (origem `M14:162-203`) 🟢:
  1. `can_see_lodge` e `can_write_lodge`;
  2. só recusa dia que **ainda não começou**: `operational_day_start(p_day) > now()` → `dinner_not_started` (Beta: liberado a qualquer hora; antes das 18h a UI pede confirmação `Dinner.tsx:41-43,65-68,160-182`). A versão original recusava antes de 18h−30 min `M10:215-217` — superada;
  3. serviço fechado (`closed_at`) só aceita gestão (`dinner_closed`);
  4. a estadia precisa estar em `dinner_stays` (`stay_not_in_service`); `p_served is null` → `served_required`;
  5. se já existe marca (`for update`): não-gestão só altera a própria marca (`not_author`) e dentro da janela de correção `correction_window()` (padrão 72 h, `records.correction_window_hours`, `presence:64-70`; `correction_window_closed`); só faz `update` se o valor mudou (idempotente);
  6. senão insere com `marked_by = current_staff_id()`.
- Cliente: um toque no botão "took" alterna `served` (`Dinner.tsx:151-152`: `mark(r, r.served !== true)`), ou seja, desfazer grava uma marca `served=false` (não apaga) 🟢. Atualização otimista com *rollback* via `load()` em erro `:70-79`.
- Contagem: o cliente calcula `notServed = linhas − served` `Dinner.tsx:83` ("só se marca quem pegou"), enquanto `dinner_summary` conta apenas marcas explícitas `served=false` `M29:538-539` — duas definições diferentes de "não serviu" 🟡.
- `close_dinner(p_lodge,p_day,p_leftovers,p_packaged,p_note)` `M29:340-371` 🟢: exige gestão e `now() >= slot_instant(dia,'22:00')` (`dinner_not_finished`); quantidades ≥ 0 (`invalid_quantities`); **primeiro fechamento** só `manager`/`developer` (grava `closed_at/closed_by`); **reedição** após fechado só `owner`/`developer` (grava `edited_at/edited_by`, nota anterior preservada via `coalesce`; senão `dinner_already_closed`). A UI espelha: `Dinner.tsx:84`.
- `dinner_summary` `M29:528-545` e `dinner_sheet` `M29:490-510`: leitura com `can_see_lodge`; sheet ordena por `rooms.sort_order, code, beds.number` e inclui `has_final_warning(resident)` (tag "FW" `Dinner.tsx:147`).
- Evidência de presença: `resident_evidence` (`M10:312-333`) inclui `'dinner'`/`night` quando `served = true` → "Sim" vale como Seen Night (confirmado em 20/11 segundo o comentário `M10:311`) 🟢.
- Validação de fechamento no cliente: só dígitos `^\d+$` `Dinner.tsx:207`.

## 5. Food Delivery (Deliveries)

- Evolução de `record_food_delivery` (4 versões): `M10:104-130` (tudo obrigatório) → `M14:210-236` (temperatura opcional) → `M16/beta_profiles:227-256` (faixa -40..99) → `M29:952-980` (`can_see_lodge`) → **versão vigente** `M15:175-213` (fornecedor por `uuid`; a anterior foi `drop function`, `M15:175`) 🟢.
- Versão vigente `M15:176-213`:
  1. `can_see_lodge` + `can_write_lodge` (`not_authorised`); Lodge precisa ter `has_dinner` (`service_not_available`) — Food Delivery só existe onde há Dinner (Amiens);
  2. fornecedor existe (`fields_required` se não) e `active` (`supplier_inactive`); produto não vazio;
  3. **campos obrigatórios por fornecedor**: `require_batch` → `batch_required`; `require_best_before` → `best_before_required` (`p_expiry`); `require_temperature` → `temperature_required` `:195-197`;
  4. temperatura, se informada, em [-40, 99] (`invalid_temperature`); `round(temp,1)`;
  5. grava `supplier` (texto = nome do fornecedor, denormalizado) **e** `supplier_id`; `batch`/`expiry_date`/`temperature` aceitam null (`M15:127`, `M14:208`);
  6. se `suppliers.links_order` → notificação `delivery_received` (management) com `delivery_id, supplier, product, received_by(nome)` `:204-207`;
  7. **alerta de validade**: se `p_expiry <= current_date + v_days` (`v_days` = `param_value('delivery.expiry_alert_days')`, padrão 3) → notificação `delivery_expiring` `:208-211`. `current_date` é a data civil do servidor/sessão (não o dia operacional de Dublin) 🟡.
- Parâmetro `delivery.expiry_alert_days`: inteiro 0–60, validado por *patch* textual de `set_system_parameter` via `pg_get_functiondef` + `replace` `M15:165-172` 🟡 (frágil: depende do texto exato de `M32`).
- Cliente: `DeliveryDialog` `Deliveries.tsx:126-147` replica a obrigatoriedade (`valid` `:134-136`: produto + fornecedor + lote/validade/temperatura conforme flags; temperatura opcional precisa ser vazia ou parseável). Rótulos "(opcional)" derivados das flags `:138`. Lista: tag **"vence logo"** quando `expiresSoon(expiry, today)` com **2 dias fixos** (`services.ts:15-18`, `Deliveries.tsx:102`) — diverge do parâmetro do banco (padrão 3) 🟡. Tag "vinculado"/"aguardando vínculo" para fornecedores com `links_order` `:98`.
- Notificações de entrega são só in-app: `push_keys` não mapeia `delivery_*` (`handover_tags_push:132-143`) → sem push 🟢.
- Texto das notificações: `notificationText` `services.ts:50-53` (data de validade formatada por `split("-").reverse().join("/")`).
- `useSuppliers(onlyActive)` `Deliveries.tsx:22-32` é reutilizado em Structure/Settings (cadastro) — ver módulo `configuracoes-e-cadastros` e `compras-e-fornecedores`.

## 6. Alertas e notificações geradas

| kind | Origem | Audiência | Push? |
|---|---|---|---|
| `fridge_out_of_range` | `record_fridge_reading` `M14:300-305` | management | sim (default ligado) `push_default`, `handover_tags_push:145-155` |
| `delivery_received` | `record_food_delivery` `M15:204-207` | management | não |
| `delivery_expiring` | `record_food_delivery` `M15:208-211` | management | não |

Leitura: `my_notifications` / `unread_notifications_count` (versão `M29:1552-1578`): audiência `lodge` ou gestão, filtra por `can_see_lodge`, janela de 30 dias para o contador, limite 1–200. `mark_notification_read` `M10:455-465` (insert idempotente em `notification_reads`).

## 7. Inconsistências e riscos 🟡
1. `auto_sign_task` assina como a conta que registra (pode ser `station`), enquanto `sign_task` (`M29:1468-1475`) recusa signatário que não seja porter/manager/owner/developer e, para station, usa a pessoa do turno aberto.
2. "Vence logo" fixo em 2 dias × parâmetro 3 dias.
3. Comentários de cabeçalho obsoletos: `Laundry.tsx:22`, `Fridge.tsx:21`, `Deliveries.tsx:35` ("sem alerta"), `Dinner.tsx:27` (Seen/fechamento corretos).
4. `update_supplier` reescreve `food_deliveries.supplier` retroativamente ao renomear `M15:160` (a auditoria registra, mas o texto histórico muda).
5. Desligar `has_laundry`/`has_dinner` em `update_lodge` (`M34:147-154`) não bloqueia máquinas já existentes: `start_laundry` não checa `has_laundry` 🟡.

## 8. Testes de referência
`src/lib/services.test.ts` (parse/faixa/validade), `src/pages/services.ui.test.tsx`, `src/pages/Deliveries.test.tsx`, `tests/db/services.test.ts`, `tests/db/beta-operations.test.ts:100-176` (laundry/dinner/fridges), `tests/db/r15.test.ts:125-190` (fornecedores, validade, `delivery_received`), `tests/e2e/phase2-services.e2e.cjs`.
