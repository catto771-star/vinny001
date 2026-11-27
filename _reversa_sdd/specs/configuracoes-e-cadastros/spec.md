# Spec — configuracoes-e-cadastros

> Redator Reversa · doc_level=completo · pt-br · 🟢/🟡/🔴. Siglas: `M30/M32/M34/M35/M36/M37` = migrations de 25–26/11. Fontes: `modules/configuracoes-e-cadastros/*`, `findings-verification.md` (#9, #15), `permissions.md`, ADR 0001, 0002, 0006, 0011.

## 1. Objetivo
Configurar o sistema: parâmetros com vigência, estrutura física (casas, quartos, camas, geladeiras, máquinas), fornecedores, tags do Handover, preferências de push do Admin, conta pessoal, bloqueios de férias e o isolamento por casa (`house_scope`). 🟢

## 2. Atores
Admin (todas as abas), qualquer usuário (aba Account). 🟢

## 3. Requisitos funcionais
**RF-01 Abas de Settings.** `account` (todos); `notifications`, `handover`, `system`, `registers` (só gestão); `?tab=` inválido cai em `account`; `/structure` redireciona a `/settings?tab=registers`. 🟢

**RF-02 Conta pessoal.** Troca de senha (confirma igualdade, `passwordAcceptable`, ≠ atual, **reautentica** com `signInWithPassword`, `updateUser`, `signOut({scope:'others'})`); nome de exibição (`set_my_display_name`, ≤40); aparência (claro/escuro local); casa inicial (só gestão com ≥2 casas, `localStorage["lodge.start"]`). 🟢 / 🟡 (efeito da reautenticação sobre o nível MFA não verificado)

**RF-03 Parâmetros do sistema (`set_system_parameter`).** Gestão; **lista fechada** com validação: `presence.check_times` (≤8, `HH:MM`), `rounds.hours` (≤24), `fridge.range_celsius` (`min>=-30`, `max<=40`, `min<max`), `maintenance.default_deadline_hours` (1..8760, `urgent<=normal<=low`), `maintenance.reminder_hours` (1..168), `presence.no_show_monthly_alert` (1..31), `records.correction_window_hours` (1..720), `security.session_idle_minutes` (5..240), `presence.check_window_minutes` (5..180), `delivery.expiry_alert_days` (0..60); chave desconhecida → `unknown_parameter`. Sempre INSERT com `valid_from=now()`. Cada seção da UI grava seus parâmetros em chamadas sequenciais **sem transação**. 🟢 / 🟡
- Veredito #9 CONFIRMADO: `parameters_insert` (política de tabela) permite à gestão inserir **qualquer chave**, inclusive `security.require_mfa_management`, contornando a lista fechada.
- Veredito #13/#14: `maintenance.reminder_hours` e `shift.day_start/night_start` existem mas não são lidos. 🟢

**RF-04 Estrutura (`structure_guard` = gestão).** `add_room` (código ≤20, kind room|apartment, 1..12 camas, `room_exists` por casa+tipo case-insens.), `rename_room`, `add_bed` (número = max+1 inclusive removidas; >12 → `too_many_beds`; não valida quarto ativo 🟡), `set_room_active(false)` (recusa com estadia aberta: `room_occupied`), `set_bed_active(false)` (`bed_occupied`), `add_fridge`/`rename_fridge`/`set_fridge_active`, `add_laundry_machine`/`rename`/`set_laundry_machine_active` (`machine_busy`), `update_lodge` (nome ≤60, curto ≤30, flags; **sem criar/desativar casas**). Padrão "remover = desativar". 🟢

**RF-05 Admissão em cama/quarto removidos.** `stays_check_bed` rejeita no INSERT cama `out_of_service`, inativa ou em quarto inativo (`bed_out_of_service`) e `bed_not_in_lodge`. 🟢

**RF-06 Fornecedores.** CRUD na aba Registers (`useSuppliers`, `add_supplier`, `update_supplier`); regras em `compras-e-fornecedores` RF-05. 🟢

**RF-07 Tags do Handover.** Ver `ocorrencias-e-passagem-de-turno` RF-08; UI: reordenar (↑/↓), visibilidade, aviso padrão, `TagDialog` (nome ≤30, cor). 🟢

**RF-08 Preferências de push.** `my_push_prefs`/`set_push_pref` (só gestão); estado do aparelho; ver `notificacoes-e-push`. 🟢

**RF-09 Bloqueios de férias.** `lock_holiday_dates` (gestão; ≤366 dias), `unlock_holiday_dates` (soft delete; sem erro para id inexistente 🟡); efeito: `register_vacation` recusa com `dates_locked`; calendário mostra o bloqueio com prioridade. 🟢

**RF-10 Isolamento por casa.** `house_scope()`, `can_see_lodge`, `can_write_lodge`; políticas RESTRICTIVE `house_scope` (SELECT) em toda tabela com `lodge_id`, `handover_shifts` com Float visível em ambas, `lodges`, `beds`, filhas, `residents`; teste-guardião `house-scope.test.ts:81`. 🟢

**RF-11 `quick_phrases`.** Tabela com 6 frases semente; **sem consumidor** em `src/` ou funções, sem UI, sem auditoria (veredito #15 CONFIRMADO). 🟢 funcionalidade órfã.

## 4. Regras de negócio
RN-01 `param_value(key, lodge, at)`: linha vigente (`valid_from<=at`), prefere valor da casa, depois `valid_from desc, id desc`. 🟢
RN-02 A tela só lê parâmetros com `lodge_id` nulo (por casa ignorados). 🟡
RN-03 `can_see_lodge`: `auth.uid() is null` ou ativo ∧ (não-station ∨ casa própria); station sem casa não vê nada. 🟢
RN-04 Tags: máx. 20, cores {red, amber, blue, green, violet, grey}; `code` imutável. 🟢
RN-05 Parâmetros fora da lista fechada (`security.require_mfa_management`, `shift.*`, `alerts.email`, `handover.late_reasons`) não são graváveis por `set_system_parameter`. 🟢

## 5. Dados
`parameters`, `lodges`, `rooms`, `beds`, `fridges`, `laundry_machines`, `suppliers`, `handover_tags`, `push_prefs`, `push_subscriptions`, `quick_phrases`, `holiday_locks`, `staff`. Armazenamento local: `lodge.start`, `lodge.active`, `ui.theme`. 🟢

## 6. Interfaces
RPCs: `set_system_parameter`, `add_room`, `rename_room`, `add_bed`, `set_room_active`, `set_bed_active`, `add_fridge`, `rename_fridge`, `set_fridge_active`, `add_laundry_machine`, `rename_laundry_machine`, `set_laundry_machine_active`, `update_lodge`, `add/update/move/set_handover_tag`, `my_push_prefs`, `set_push_pref`, `lock_holiday_dates`, `unlock_holiday_dates`, `param_value`, `set_my_display_name`. 🟢

## 7. Estados
"Remover = desativar" (`active=false`); parâmetros com vigência. 🟢

## 8. Permissões
Gestão (MFA satisfeito) em tudo, exceto Account. Estrutura: `structure_guard()`. `parameters_insert` e `staff_update` são brechas conhecidas (§3 RF-03). 🟢

## 9. Casos de borda
- EB-01 `num("")` → NaN → `null` → `invalid_parameter` (inferido). 🟡
- EB-02 Duas consultas redundantes (`useSettingsData` em duas abas). 🟡
- EB-03 `move_handover_tag`/`add_handover_tag` sem lock (risco baixo de `sort_order` duplicado). 🟡
- EB-04 Tabelas com `lodge_id` criadas após a migration dependem do teste-guardião. 🟡
- EB-05 `has_dinner`/`has_laundry` desligados não removem dados existentes. 🟡

## 10. Requisitos não funcionais
Segurança: `SECURITY DEFINER` + `search_path` fixo; histórico imutável de parâmetros; atualização otimista com recarga em erro na UI. 🟢

## 11. Contradições anotadas
Nenhuma com o Detetive; #9 e #15 confirmados.

## 12. Lacunas 🔴
Política de retenção de snapshots/notificações; parâmetros por casa sem UI; histórico retroativo de `active` em modelos de tarefa.

## 13. Rastreabilidade
`src/pages/Settings.tsx`, `settings/AccountSettings.tsx`, `settings/SystemSettings.tsx`, `Structure.tsx`, `Vacations.tsx` (bloqueios); `src/lib/activeLodge.tsx, theme.ts, password.ts`; SQL `M01, M07, M17, M23, M29, M30, M32, M34, M35, M36, M37`; testes `tests/db/system-settings.test.ts, settings-more, structure, tags-admin, house-scope`, `src/pages/Settings.test.tsx`, `Settings.account.test.tsx`, `Structure.test.tsx`.
