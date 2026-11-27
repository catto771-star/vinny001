# Spec Impact Matrix — módulos × dependências

> Arquiteto Reversa · 11 módulos de `_reversa_sdd/modules/`. 🟢 confirmado no código/SQL · 🟡 inferido. Leitura: linha **impacta** coluna quando mudar a linha obriga a revisar a coluna. Legenda: **A** = alto (contrato/dados compartilhados), **M** = médio, **B** = baixo, `·` = nenhum.
> (O skill indica `traceability/spec-impact-matrix.md`; por pedido do solicitante o arquivo fica na raiz de `_reversa_sdd/`.)

## 1. Matriz módulo → módulo (quem impacta quem)

| Origem ↓ / Impactado → | Acesso | Moradores | Ocorrências | Serviços | Compras | Equipe/Escala | Painel/Audit | Config | Offline | Push | UI/i18n |
|---|---|---|---|---|---|---|---|---|---|---|---|
| **Acesso e autenticação** | | A | A | A | A | A | A | A | M | M | M |
| **Moradores e presença** | · | | A | A | · | M | A | B | A | M | M |
| **Ocorrências e passagem de turno** | · | M | | M | · | A | A | M | M | A | M |
| **Serviços da casa** | · | A | A | | A | M | A | M | B | A | M |
| **Compras e fornecedores** | · | · | · | A | | · | M | B | · | M | M |
| **Equipe, escala e horas** | M | · | A | M | · | | A | M | · | M | M |
| **Painel, relatórios e auditoria** | · | M | M | M | M | M | | · | M | · | M |
| **Configurações e cadastros** | M | A | A | A | M | A | A | | M | M | M |
| **Continuidade offline** | · | M | B | · | · | · | · | · | | · | B |
| **Notificações e push** | · | · | M | M | · | M | M | · | M | | B |
| **Interface e i18n** | M | M | M | M | M | M | M | M | M | M | |

Razões das células **A** 🟢/🟡:
- Acesso → todos: `current_staff_role/id`, `is_management`, `can_see_lodge`, `can_write_lodge`, `mfa_satisfied` aparecem em RLS e RPCs de todo módulo; mudar um papel ou o MFA altera permissões em cascata.
- Moradores → Ocorrências/Serviços/Painel: `stays`, `residents`, `beds` são lidas por Dinner (`dinner_marks.stay_id`), Laundry (`laundry_uses.stay_id`), Warnings (`warnings.stay_id`) e relatórios; `stays_present_at` e `pending_slots` alimentam painel e folha.
- Config → Moradores/Ocorrências/Serviços/Equipe: `lodges.has_dinner/has_laundry`, `rooms/beds` (`structure_guard`, `stays_check_bed`), `parameters` (`param_value`) e `handover_tags`.
- Equipe → Ocorrências: `rota_shifts` ↔ `handover_shifts.rota_shift_id`, `shift_hours_review`, `confirm_shift_hours`, `sign_task`.
- Ocorrências → Push: `notifications` + `handover_tag`/`maintenance_opened`/`warning_recorded`/`shift_hours_review`.
- Serviços → Compras: `food_deliveries.supplier_id/order_id` e `link_delivery_to_order`.
- Painel/Audit lê tudo (`audit_log`, `report_*`, `pending_counts`, `home_dashboard`); qualquer coluna renomeada quebra relatórios.

## 2. Matriz módulo × tabelas (E = escreve, L = lê, G = gera por trigger)

| Tabela | Acesso | Morad. | Ocorr. | Serv. | Compras | Equipe | Painel | Config | Push |
|---|---|---|---|---|---|---|---|---|---|
| staff | E,L | L | L | L | L | E,L | L | E | L |
| lodges | L | L | L | L | L | L | L | E | L |
| rooms / beds | | L | | | | | L | E | |
| parameters | L | L | L | L | | L | L | E | |
| duty_posts | L | | L | | | E | L | | |
| residents / stays | | E | L | L | | | L | E (estrutura) | |
| room_check_runs/marks, sightings, absences, no_shows | | E | | | | | L | | G |
| access_log | | G | | | | | L | | |
| handover_* / quick_phrases | | | E | | | L | L | E (tags) | G |
| maintenance_* | | | E | | | | L | | G |
| warnings | | L | E | | | | L | | G |
| task_templates/extras/signatures | | | | E (auto_sign) | | E | L | E | |
| fridges / fridge_readings | | | | E | | | L | E | G |
| food_deliveries / suppliers | | | | E | E | | L | E | G |
| dinner_services/marks | | L | | E | | | L | | |
| laundry_machines/uses | | L | L | E | | | L | E | |
| shop_items/orders/lines | | | | L | E | | L | E | |
| products/purchases/lines/movements (legado) | | | | | E (sem UI) | | L | | |
| rota_shifts / work_intervals / vacations / holiday_locks | | | L | | | E | L | E (locks) | |
| notifications / reads | | G | G | G | | G | L | | E |
| push_subscriptions / push_prefs | | | | | | | | | E |
| audit_log | G | G | G | G | G | G | L | G | |
| mfa_email_challenges | E | | | | | | | | |

## 3. RPCs e funções compartilhadas (alto raio de impacto) 🟢
| Função | Usada por | Risco ao mudar |
|---|---|---|
| `current_staff_id/role`, `is_active_staff`, `is_management` | todas as RLS e RPCs | permissões globais |
| `can_see_lodge`, `can_write_lodge`, `house_scope` (M29) | Moradores, Ocorrências, Serviços, Equipe | escopo por Lodge/posto; espelhado em `AuthProvider.canWriteLodge` |
| `mfa_satisfied`, `email_code_session_at`, `begin_email_verification` | Acesso, `admin-users` | porta de entrada da gestão |
| `server_now`, `operational_day`, `operational_day_start/end`, `slot_instant`, `shift_of` | Presença, Ocorrências, Serviços, Equipe, Painel, front (`time.ts`) | fronteira 07h Dublin; contratos duplicados no TS |
| `param_value` + `set_system_parameter` | presença, geladeira, entregas, manutenção, correção, MFA | chaves: `presence.check_times`, `presence.check_window_minutes`, `presence.no_show_monthly_alert`, `fridge.range_celsius`, `delivery.expiry_alert_days`, `maintenance.default_deadline_hours`, `handover.late_reasons`, `records.correction_window_hours`, `rounds.hours`, `security.require_mfa_management`, `security.session_idle_minutes` |
| `audit_row` + `audit_immutable` | triggers em ~40 tabelas | formato de `audit_log`; `auditLabels.ts` no front |
| `bump_version` / `stale_version` | tabelas com `version` | concorrência otimista; `errors.staleVersion` |
| `notify_push`, `push_keys`, `push_recipients`, `my_notifications` | Ocorrências, Serviços, Equipe, Push | novos `kind` exigem mapeamento em `push_keys` e `message()` |
| `shift_hours_review`, `staff_work_log`, `staff_hours` | Equipe, Ocorrências, Painel | totais de horas (âncora 00h vs 07h) |
| `report_period`, `report_purchases`, `pending_counts`, `pending_slots` | Painel, Moradores, Compras | somas de rascunhos/pedidos |
| `open_resident_profile`, `search_access_log` | Moradores, Painel | registro de leitura (privacidade) |

## 4. Impacto transversal no front
| Artefato | Quem usa | Observação |
|---|---|---|
| `lib/errors.ts` (97 regras regex) | todas as telas | nova exceção SQL sem regra vira `errors.generic`; teste `errors.coverage.test.ts` |
| `i18n/en-IE.ts` (único catálogo) | todas as telas | `LOCALES=["en-IE"]` apesar do enum de banco ter 3 idiomas |
| `lib/time.ts` | Hours, Rota, Today, Handover, DailySheet | espelha funções SQL de dia operacional |
| `lib/types.ts` | todos | tipos de papéis/linhas, sem geração automática a partir do banco 🟡 |
| `activeLodge` / `Layout` | telas por Lodge | troca de Lodge reconsulta |
| `sw.js` | Continuidade, Push | cache `shell-v1` exige bump ao mudar estratégia |

## 5. Pares de acoplamento de risco 🟡
1. Front `canWriteLodge` × SQL `can_write_lodge` (duplicação manual).
2. `time.ts` × funções de tempo SQL (duas implementações da regra 07h).
3. `management.ts` (regras de função na Rota) × `save_rota_shift` (hoje divergentes; ver questions.md).
4. `push_keys` (SQL) × `message()` (Edge) × `push_prefs.key` (CHECK regex): três lugares para cada novo tipo de alerta.
5. Legado de compras (`products/purchases`) ainda no esquema e em testes/seed.
