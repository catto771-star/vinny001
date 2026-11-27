# Análise de código — configuracoes-e-cadastros

> Agente: Arqueólogo (Reversa) · doc_level: completo · Escala: 🟢 confirmado · 🟡 inferido · 🔴 lacuna
> Escopo: `Settings` (abas), `AccountSettings`, `SystemSettings` (parâmetros), `Structure`/Registers (quartos, camas, geladeiras, máquinas, fornecedores, casas), tags do Handover, preferências de push do Admin, isolamento por casa (`house_scope`), `quick_phrases`, `holiday_locks`.
> Caminhos relativos à raiz; SQL em `supabase/migrations/`.

## 1. Mapa

| Camada | Artefato | Função |
|---|---|---|
| UI | `src/pages/Settings.tsx` | Contêiner de abas: Account (todos) · Notifications · Handover · System · Registers (só gestão) |
| UI | `src/pages/settings/AccountSettings.tsx` | Perfil, nome de exibição, senha, aparência, casa inicial, encerrar outras sessões |
| UI | `src/pages/settings/SystemSettings.tsx` | 7 seções de parâmetros com validação no banco |
| UI | `src/pages/Structure.tsx` | Cadastros: quartos/camas, geladeiras, lavanderia, fornecedores, casas |
| DB | `set_system_parameter` | Escrita validada em `parameters` (vigência por `valid_from`) |
| DB | `add_room … update_lodge` (migration 034) | CRUD de estrutura via `structure_guard()` |
| DB | `add/update/move/set_handover_tag`, `my_push_prefs`, `set_push_pref` | Tags e preferências |
| DB | `house_scope()`, `can_see_lodge()`, `can_write_lodge()` + políticas `house_scope` | Isolamento por casa |
| DB | `quick_phrases`, `holiday_locks` | Tabelas auxiliares |

## 2. `Settings.tsx` — abas e dados

- `Settings()` `src/pages/Settings.tsx:86`. Abas `:90-98`: `account` sempre; `notifications`, `handover`, `system`, `registers` só se `isManagement`. A aba vem de `?tab=` `:99-100` (valor inválido ou não permitido cai em `account`); aba `account` limpa a query `:110`. A barra de abas só aparece com mais de 1 aba `:109`. 🟢
- Renderização condicional dupla (`isManagement && tab==="…"`) `:113-116` — defesa de UI; a autorização real é no banco. 🟢
- `/structure` redireciona para `/settings?tab=registers` (inventário de rotas, `_reversa_sdd/inventory.md`); `Structure` com `embedded` usa a sub-aba na chave `reg` `Structure.tsx:31`. 🟢
- `useSettingsData()` `:30-84`: carrega `handover_tags` (`select id, code, label, color, sort_order, visible, notify_default`, ordenado por `sort_order`) e `rpc("my_push_prefs")` `:39-42`; `pushState()` para o estado do aparelho `:49`.
  - `toggleTag` `:52`: **otimista** + `rpc("set_handover_tag")`; em erro, toast e recarrega `:55-58`.
  - `togglePref` `:61`: otimista + `rpc("set_push_pref")`; mesmo padrão.
  - `switchPush` `:70-81`: liga/desliga push (`enablePush/disablePush` em `src/lib/push.ts`); mensagens especiais para `push_denied` e `push_not_configured` `:79`.
  - Obs. 🟡: `NotificationSettings` e `HandoverTagSettings` chamam `useSettingsData()` cada uma e ambas carregam tags **e** prefs (duas consultas redundantes por aba).
- `NotificationSettings` `:121-163`: estado do aparelho (needs-install / unsupported / denied / on / off), botão liga/desliga só em `on|off` `:135`; preferências agrupadas em `GROUPS` (handover/maintenance/other) `:20-24`, cada uma como `checkbox role="switch"`.
- `HandoverTagSettings` `:165-215`: lista ordenável (↑/↓ → `move_handover_tag` `p_dir -1/+1`; desabilitado nas pontas `:200-201`), switch de visibilidade e de aviso padrão (`update_handover_tag` com `p_notify: !notify_default` `:197`), editar via `TagDialog`; `call(name,args)` `:169-175` centraliza erro (`errorKey`) e recarrega.
- `TagDialog` `:217-245`: nome (`maxLength 30`), cor (`TAG_COLORS`, importado de `Handover.tsx`), aviso padrão; botão salvar desabilitado com `!label.trim()`; prévia da tag `:241`. Servidor repete as validações (30 caracteres, cores, unicidade, máximo 20). 🟢

## 3. `AccountSettings.tsx` (todos os perfis)

- `changePassword` `:29-53` — sequência: (1) confirma `next===repeat` (`auth.passwordsDontMatch`); (2) `passwordAcceptable(next)` (`src/lib/password.ts`; regra não relida aqui 🟡); (3) `next!==current`; (4) **re-autentica** com `signInWithPassword({email,password:current})` — falha → `settings.currentWrong` `:37-41`; (5) `auth.updateUser({password:next})` (erro contendo "same" → `sameAsCurrent`); (6) `signOut({scope:"others"})` encerra as demais sessões `:47`; limpa campos e toast. 🟢 Comentário `:36` justifica: impedir troca por quem encontra a tela aberta.
- 🟡 A re-autenticação via `signInWithPassword` pode, para perfis com segundo passo (MFA/e-mail), recriar sessão de nível aal1; efeito no fluxo de e-mail code não verificado (ver questions).
- `signOutOthers` `:55-59` — `signOut({scope:"others"})`.
- `saveName` `:61-66` — `rpc("set_my_display_name",{p_name})` + `refresh()`; servidor `20261125000032_more_settings.sql:151-163`: exige equipe ativa; vazio→`NULL` (volta a usar `full_name`); >40 caracteres → `invalid_name`; atualiza só a própria linha. 🟢
- Aparência: `applyTheme(mode,true)` / `currentTheme` (`src/lib/theme.ts`) — preferência local. Casa inicial (`readStartHouse/writeStartHouse`, `localStorage["lodge.start"]`, `activeLodge.tsx:14-21`) **só para gestão com mais de uma casa** `:121`; `"last"` apaga a chave. 🟢
- Perfil: nome (`staffName`), e-mail (sessão ou `staff.email`), papel, casa (`staff.home_lodge_id`).

## 4. `SystemSettings.tsx` — parâmetros do sistema

### 4.1 Leitura da vigência
- `load` `:104` (arquivo `src/pages/settings/SystemSettings.tsx`): `from("parameters").select("key,value,valid_from,lodge_id").is("lodge_id",null).order("valid_from",desc)`. `currentParams(rows, now)` `:15-22` escolhe, por chave, o valor **mais recente cujo `valid_from <= now`** e `lodge_id` nulo (parâmetros por casa são ignorados na tela) `:20-21`. 🟢
- Após salvar, `onSaved=load` incrementa `version` e remonta `SystemForms` com `key={version}` `:104-106` — descarta rascunho local.

### 4.2 Seções (cada uma com Salvar próprio) — `Section` `:26`
`Section.save` `:33-43`: `busy`, executa `onSave()`, toast `settings.saved`, ou erro → `Notice` com `errorKey`. Cada seção grava **apenas os seus parâmetros** em chamadas sequenciais — **sem transação**: se a 2ª chamada falhar, a 1ª já valeu (🟡).

| Seção (linha) | Parâmetros gravados | Campos / regra de UI |
|---|---|---|
| Room Check `:139-142` | `presence.check_times` (array HH:MM), `presence.check_window_minutes` | `TimeList` (regex `^\d{2}:\d{2}$`, sem repetidos, ordena) `:70-93`; janela numérica |
| Rondas `:147` | `rounds.hours` | `TimeList` |
| Geladeiras `:151` | `fridge.range_celsius {min,max}` | passo 0,5 |
| Entregas `:156` | `delivery.expiry_alert_days` | dias de antecedência do alerta de validade |
| Manutenção `:160-164` | `maintenance.default_deadline_hours {urgent,normal,low}`, `maintenance.reminder_hours` | |
| Registros `:171-174` | `records.correction_window_hours`, `presence.no_show_monthly_alert` | |
| Segurança `:180` | `security.session_idle_minutes` | |

- `num(v)` `:96`: vazio → `NaN`; troca `,` por `.`. `NaN` serializa como `null` em JSON → servidor responde `invalid_parameter` (tipo ≠ number). 🟡 (comportamento inferido de `jsonb_typeof`).
- Link "histórico de mudanças" → `/audit?module=settings` `:137`.

### 4.3 Servidor — `set_system_parameter(p_key text, p_value jsonb)` (versão composta)
Versões: `20261125000030_system_settings.sql:2-63` → redefinida em `20261125000032_more_settings.sql:4-65` (adiciona `presence.check_window_minutes`) → **patch dinâmico** em `20261126000037_r15.sql:165-172` (usa `pg_get_functiondef` + `replace` para incluir `delivery.expiry_alert_days`). 🟢 Padrão frágil (ver questions).
Regras (versão efetiva):

| Chave | Validação | Normalização |
|---|---|---|
| `presence.check_times` | array não vazio, ≤ **8** itens, cada item string `^([01]\d\|2[0-3]):[0-5]\d$` | `distinct` + ordenado |
| `rounds.hours` | idem, ≤ **24** itens | idem |
| `fridge.range_celsius` | objeto com `min`,`max` numéricos; `min>=-30`, `max<=40`, `min<max` | `{min,max}` numeric |
| `maintenance.default_deadline_hours` | objeto `urgent/normal/low` numéricos inteiros `1..8760` e `urgent<=normal<=low` | inteiros |
| `maintenance.reminder_hours` | inteiro `1..168` | int |
| `presence.no_show_monthly_alert` | inteiro `1..31` | int |
| `records.correction_window_hours` | inteiro `1..720` | int |
| `security.session_idle_minutes` | inteiro `5..240` | int |
| `presence.check_window_minutes` | inteiro `5..180` | int |
| `delivery.expiry_alert_days` | inteiro `0..60` (patch r15) | int |
| qualquer outra | `unknown_parameter` (22023) | — |

- Autorização: `current_staff_id() is not null and is_management()` senão `not_authorised` (42501) `030:15-17`. 🟢
- Persistência: **sempre INSERT** em `parameters (key,value,valid_from=now(),created_by)` — "nunca se edita uma linha" `foundation.sql:117-118`; o passado fica. 🟢
- Lista fechada: parâmetros como `security.require_mfa_management`, `shift.*`, `alerts.email`, `handover.late_reasons` **não** são graváveis por aqui (teste `system-settings.test.ts:47`: "desligar verificação em duas etapas por aqui" é recusado). 🟢
- Leitura: `param_value(p_key,p_lodge,p_at)` `foundation.sql:133-146` — escolhe a linha vigente (`valid_from<=p_at`), preferindo valor específico da casa, depois `valid_from desc, id desc`. 🟢

### 4.4 Consumidores conhecidos dos parâmetros 🟡
`presence.check_window_minutes` → `open_room_check`, `room_check_done` (`more_settings.sql:67-147`); `delivery.expiry_alert_days` → `record_food_delivery` (`r15.sql:181`); `security.require_mfa_management` → `mfa_satisfied()` (`foundation.sql:173-181`); demais consumidores (check_times, rounds.hours, fridge range, deadlines, reminder, correction window, idle) ficam em módulos de presença/ocorrências/serviços/acesso (não rastreados linha a linha aqui).

## 5. `Structure.tsx` (Registers)

### 5.1 Navegação
`Structure({embedded})` `:28`: 5 sub-abas `TABS` `:22` (rooms, fridges, laundry, suppliers, houses); chave de query `reg` (embutido) ou `tab`; `rooms` é o padrão e remove a chave `:37`. Seletor de casa (`LodgeTabs` + `useLodgeState`) aparece **exceto** em `houses` e `suppliers` (que são globais) `:48,64`. 🟢

### 5.2 Ação genérica
`useAction(reload)` `:72-85`: `rpc(name,args)`; erro → `Notice` via `errorKey`; sucesso → toast opcional + `reload()`. `SimpleDialog` `:99-116`: submit com `busy`, fecha se `onSave()` verdadeiro. `Removed` `:87-97`: bloco colapsável "N removidos" com restauração.
**Padrão "remover = desativar"** (cabeçalho `:24-27`; migration `034:1-2`): nada é apagado; `active=false`; histórico e Audit permanecem. 🟢

### 5.3 Quartos e camas — `Rooms` `:118-188`
- Carrega `rooms(…, beds(id,number,active,status))` por casa e `bed_occupancy` para marcar camas ocupadas `:127-131`; camas ordenadas por número.
- Contagem `summary` = quartos ativos e camas ativas `:138-144`.
- Botões: `add_bed`, `rename_room` (diálogo), `set_room_active(false)`; camas: `set_bed_active(false)` (×) **só se ativa e não ocupada** `:164`; restaurar cama/quarto.
- `AddRoom` `:190-208`: `p_code` (≤20), `p_kind` room|apartment, `p_beds` 1..12 (input `min 1 max 12`).
- Servidor (`20261125000034_structure.sql`): `structure_guard()` `:4-8` → gestão senão `not_authorised`. `add_room` `:10-27`: valida código vazio (`name_required`), >20 (`invalid_name`), tipo (`invalid_kind`), camas `<1` ou `>12` (`too_many_beds`), casa ativa (`lodge_not_found`), duplicidade **case-insensitive por casa+tipo** (`room_exists` 23505); `sort_order = max+1`; cria N camas numeradas 1..N. `rename_room` `:29-42`; `add_bed` `:44-54` (`número = max(number)+1` incluindo camas removidas; >12 → `too_many_beds`; **não verifica se o quarto está ativo** 🟡); `set_room_active(false)` recusa se há stay ≠ `ended` em qualquer cama do quarto (`room_occupied` 23514) `:61`; `set_bed_active(false)` recusa se cama com stay ≠ `ended` (`bed_occupied`) `:72`.
- Regra de admissão em cama/quarto removidos: `stays_check_bed()` (`20261125000035_bed_room_active.sql:2-18`): no INSERT rejeita cama `status<>'in_use'` ou `not b.active` ou quarto `not r.active` (`bed_out_of_service` 23514); também valida `bed_not_in_lodge` `:8-10`. Corrigiu bug "cama ativa em quarto removido aceitava residente" (comentário `:1`). 🟢

### 5.4 Geladeiras — `Fridges` `:220-259`
`add_fridge(p_lodge,p_name)` `034:78-89`: nome ≤40, casa ativa; `code = 'F' || (max dígitos dos códigos existentes + 1)`, `sort_order = n`. `rename_fridge`, `set_fridge_active` (sem checagem de leituras; leituras antigas permanecem; geladeira inativa não recebe leitura — testado `structure.test.ts:77`). 🟢

### 5.5 Lavanderia — `Laundry` `:282-322`
`add_laundry_machine(p_lodge,p_kind wash|dry,p_label)` `034:110-123`: label ≤40; `code = 'M'||n||'-'||UPPER(kind)` com `n = count+1` incrementado enquanto o código existir (`while exists … loop`) `:119-120`; `sort_order = 100+n`. `set_laundry_machine_active(false)` recusa máquina com uso aberto (`laundry_uses.finished_at is null`) → `machine_busy` 23514 `:141`. Trigger de auditoria adicionado `:172`. 🟢

### 5.6 Casas — `Houses`/`HouseForm` `:324-364`
`update_lodge(p_lodge,p_name,p_short_name,p_has_dinner,p_has_laundry)` `034:147-156`: nome ≤60, curto ≤30, ambos obrigatórios; `coalesce` mantém flags se nulos; `lodge_not_found` se id inexistente. Após salvar chama `refresh?.()` (recarrega `lodges` do `AuthProvider`). **Não é possível criar/desativar casas pela UI** (apenas editar). 🟢
Efeito em cascata: `has_dinner`/`has_laundry` determinam blocos `dinner/laundry` do relatório (`bool_or` em `report_period`), visibilidade das telas Dinner/Laundry/Deliveries (`kitchen = l.has_dinner` `Deliveries.tsx:33`, `Dinner.tsx:25`, `hasLaundry` `Laundry.tsx:20`) e `record_food_delivery` (`service_not_available`, `r15.sql:188`). 🟢

### 5.7 Fornecedores — `Suppliers`/`SupplierDialog` `:365-419`
- Usa `useSuppliers(false)` (de `Deliveries.tsx`). Salvar: `add_supplier` ou `update_supplier` com flags `p_batch, p_best_before, p_temperature, p_links_order` e `p_active`; remover/restaurar = `update_supplier` reenviando todos os campos com `p_active` invertido `:387,395`.
- Servidor `r15.sql:131-161`: gestão; nome vazio → `name_required`, >40 → `invalid_name`, duplicado (lower) → `supplier_exists`; `update_supplier` usa `coalesce` e **propaga o novo nome para `food_deliveries.supplier`** (histórico denormalizado) `:160`; `version = version+1`. Em `record_food_delivery`, supplier inativo → `supplier_inactive`; exigências de lote/validade/temperatura conforme flags `:193-197`. 🟢
- Seeds: `Tesco` (links_order) e `Ripley's` (lote + validade) `:123-125`.

## 6. Tags do Handover (servidor) — `20261125000036_tags_admin.sql`
- `add_handover_tag(p_label,p_color='grey',p_notify=false)` `:7-29`: gestão; rótulo vazio/`>30`; cor ∈ {red, amber, blue, green, violet, grey}; **máx. 20 tags** (conta também as escondidas) `too_many_tags`; duplicado case-insensitive `tag_exists`; `code` = rótulo em minúsculas com `[^a-z]+`→`_`, aparado de `_`, vazio→`tag`; colisão → sufixo `_a`, `_b`… (dígitos traduzidos para letras, `translate(v_n,'0123456789','abcdefghij')` `:23`) porque `push_prefs.key` só aceita `tag:[a-z_]+` (`handover_tags_push.sql:28`). 🟢
- `update_handover_tag` `:31-42` (o **código não muda**); `move_handover_tag(p_tag,p_dir)` `:44-58`: troca `sort_order` com a vizinha (`<` ou `>`); sem vizinha → no-op. `set_handover_tag(p_tag,p_visible)` `handover_tags_push.sql:53-64` (esconder; `invalid_tag`).
- 🟡 `move_handover_tag` e `add_handover_tag` não usam bloqueio; concorrência entre administradores pode duplicar `sort_order` (baixo risco).
- Tabela: `handover_tags` `handover_tags_push.sql:4-11` + coluna `color` `tags_admin.sql:2`. Auditada `:12`. Só `select` para autenticados `:49`; escrita só via funções.
- Preferências: `push_prefs(staff_id,key,enabled)` PK composta `:26-31`; `my_push_prefs()` `:172-191` lista tags + `warning`, `maintenance:{urgent,normal,low}`, `shift_hours_review`, `fridge_out_of_range` com `enabled = coalesce(pref, push_default(key))`; **só gestão**. `set_push_pref` `:193-204` faz upsert (sem validar o `key` além do CHECK da tabela). 🟢 (módulo `notificacoes-e-push` cobre entrega).

## 7. Isolamento por casa — `20261125000029_house_scope.sql`
- `house_scope()` `:5-9`: para papel `station` devolve `staff.home_lodge_id`; demais → `NULL`.
- `can_see_lodge(p_lodge)` `:12-16`: `auth.uid() is null` (contexto interno/migração/agendador) **ou** (`is_active_staff()` **e** (papel ≠ station **ou** `p_lodge is not distinct from house_scope()`)). Station sem casa definida (`house_scope` NULL) **não vê nada** (falha fechada) — mas `p_lodge IS NOT DISTINCT FROM NULL` seria verdadeiro se `p_lodge` fosse NULL (por isso a política usa `lodge_id is null or can_see_lodge`, ver abaixo). 🟡
- `can_write_lodge(p_lodge)` `:19-28`: gestão; ou station na própria casa **ativa**; ou quem tem posto aberto (`duty_posts.ended_at is null`) com função `float` ou na própria casa.
- Políticas **RESTRICTIVE** `house_scope` (somam-se às permissivas): geradas em loop para toda tabela base de `public` com coluna `lodge_id` (exceto `handover_shifts`) `:31-42` com `using (lodge_id is null or can_see_lodge(lodge_id))`; `handover_shifts` deixa o **Float aberto visível nas duas casas** `:46-47`; `lodges` `:51`, `beds` (via quarto) `:53`, tabelas filhas (`absences`, `dinner_marks`, `room_check_marks`, `handover_mentions/entry_tags/entry_staff`, `maintenance_events`, `maintenance_reminder_snoozes`), `product_movements` (de OU para) `:71`, `residents` (sem stays → visível; com stays → só se alguma é da casa) `:74-76`. 🟢
- Teste-guardião: "toda tabela com lodge_id tem política restritiva de casa" `tests/db/house-scope.test.ts:81` — falha se nova tabela esquecer. 🟢
- Fora do alcance do loop: o loop é executado **uma vez** na migration; tabelas com `lodge_id` criadas depois dependem do teste-guardião (e de migrations posteriores replicarem). 🟡
- Cliente: `isStation` (AuthProvider) e `ActiveLodgeProvider` (conta de casa usa sempre a sua; Admin pode guardar casa) `activeLodge.tsx:41-50`. 🟢

## 8. `quick_phrases` 🔴/🟡
Tabela criada em `20261120000007_occurrences.sql:75-80` (`text jsonb` com chaves de idioma `pt-PT/en-IE/pl-PL`, `sort_order`, `active`) com 6 frases semente `:82-88`; RLS: leitura equipe ativa, insert/update gestão `:856-858`; `grant insert, update` `:851`. **Nenhum código em `src/` ou outra migration referencia `quick_phrases`** (grep) e **não há trigger de auditoria**. O Handover migrou para "tags no lugar dos atalhos" (`handover_tags_push.sql:1`). Conclusão 🟡: funcionalidade legada/órfã, sem UI de CRUD. Registrado em questions.

## 9. `holiday_locks` — `20261124000017_beta_management.sql:478-492,543-573`
- Tabela e RLS (leitura equipe ativa; escrita só por RPC). `lock_holiday_dates(p_start,p_end,p_note)` `:543-561`: gestão; datas finitas, `end>=start`, janela ≤366 dias → `invalid_period`; nota vazia→NULL; `created_by=current_staff_id()`. `unlock_holiday_dates(p_id)` `:563-573`: `active=false` (soft delete; **não** gera erro se o id não existe 🟡).
- Efeitos: `register_vacation` recusa se há lock ativo sobreponto (`dates_locked`) `:513-515`; `holiday_calendar(p_year)` mostra bloqueio com prioridade sobre aprovado e em análise `:575-600`; leitura direta pelo front em `src/pages/Vacations.tsx:60` (lista ativos), RPCs em `:86` (unlock) e `:255` (lock). Auditada `:488`; rótulo "Holiday block" em `auditLabels.ts:6`. 🟢
- Detalhe do calendário e férias: módulo `equipe-escala-e-horas`.

## 10. Erros comuns (códigos → UI)
`not_authorised` 42501 · `name_required`, `invalid_name`, `invalid_kind`, `invalid_color`, `invalid_parameter`, `unknown_parameter`, `too_many_beds`, `too_many_tags`, `invalid_tag`, `invalid_period` (22023) · `room_exists`, `tag_exists`, `supplier_exists` (23505) · `room_occupied`, `bed_occupied`, `machine_busy`, `bed_out_of_service`, `bed_not_in_lodge` (23514) · `*_not_found` (P0002). Todos chegam ao front por `errorKey(e)` (`src/lib/errors.ts`) e viram `Notice`/toast. 🟢 (mapeamento completo em `interface-e-i18n`/`errors.ts`, não revalidado aqui)

## 11. Testes de referência
`tests/db/system-settings.test.ts:18-52`, `settings-more.test.ts:26-71`, `structure.test.ts:22-135`, `tags-admin.test.ts:20-94`, `house-scope.test.ts:27-81`, `people-roles.test.ts`, `src/pages/Settings.test.tsx`, `Settings.account.test.tsx`, `Structure.test.tsx`, `src/lib/management.test.ts`. 🟢 (nomes confirmados)
