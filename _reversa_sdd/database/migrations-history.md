# Histórico de migrações — DS Lodge (Data Master)

> Fonte: `supabase/migrations/*.sql` (38 arquivos, 9 559 linhas; nome `AAAAMMDDNNNNNN_slug.sql`, de `20261120000001` a `20261126000038`; as "Revisões" 2 a 16 vêm dos comentários de cabeçalho). 🟢 confirmado · 🟡 inferido · 🔴 lacuna.
> Colunas: T = tabelas criadas · F = ocorrências de `CREATE OR REPLACE FUNCTION` (insensível a caixa) · P = `CREATE POLICY` literais · Tr = `CREATE TRIGGER` · I = `CREATE INDEX`. Totais: 53 tabelas, 297 definições de função (192 funções), 67 triggers.

## 1. Linha do tempo

| # | Arquivo (slug) | T | F | P | Tr | I | Tema |
|---|---|---|---|---|---|---|---|
| 001 | `foundation` | 10 | 28 | 20 | 16 | 17 | Fase 0: lodges, rooms, beds, staff, parameters, duty_posts, residents, stays, audit_log, access_log; enums; dia operacional; RLS, helpers de autorização, auditoria, concorrência otimista, admissão/transferência/saída, view `bed_occupancy` |
| 002 | `seed_structure` | 0 | 0 | 0 | 0 | 0 | Carga inicial: casas AMIENS (9 quartos, 37 camas) e CONNOLLY; parâmetros iniciais (`valid_from` 2026-01-01) |
| 003 | `server_time` | 0 | 1 | 0 | 0 | 0 | `server_now()` para o relógio da tela (liberada a `anon`) |
| 004 | `lock_privileges` | 0 | 0 | 0 | 0 | 0 | Revoga `ALL` (incl. DELETE/TRUNCATE) de `anon`/`authenticated`; regrants mínimos |
| 005 | `email_code_second_step` | 1 | 4 | 0 | 1 | 1 | `mfa_email_challenges`; segunda etapa por código de e-mail (substitui QR/AAL2); `staff_sync_locale` |
| 006 | `presence` | 7 | 29 | 8 | 9 | 5 | Fase 1: Room Check, Seen, ausência, No Show, notificações |
| 007 | `occurrences` | 10 | 30 | 12 | 11 | 6 | Handover/rondas, Daily Tasks, manutenção, warnings, pendências; `quick_phrases`; redefine `bed_occupancy` |
| 008 | `task_model` | 0 | 0 | 0 | 0 | 0 | Carga do modelo de tarefas de Amiens (trilíngue); Connolly copia |
| 009 | `task_model_effective_now` | 0 | 0 | 0 | 0 | 0 | Correção: tarefas valem desde a instalação (`created_at = now()`) para não gerar centenas de pendências retroativas |
| 010 | `services` | 6 | 16 | 6 | 7 | 4 | Fase 2: Fridge, Food Delivery, Dinner, Laundry; notificações da gestão |
| 011 | `management` | 7 | 19 | 7 | 9 | 3 | Fase 3: compras, estoque/transferências, Rota, Horas, Férias, relatório mensal |
| 012 | `fix_float_window` | 0 | 1 | 0 | 0 | 0 | Correção: janela do Float 12h-24h (não 36 h) em `coverage_gaps` |
| 013 | `range_limits` | 0 | 12 | 0 | 0 | 0 | Limites: intervalo ≤62 dias, mês válido (varredura em massa travava o banco) |
| 014 | `beta_operations` | 1 | 9 | 1 | 1 | 1 | Beta: `fridges` (leitura por geladeira), Room Check fora do horário, ajustes de operação |
| 015 | `station_role` | 0 | 0 | 0 | 0 | 0 | `ALTER TYPE staff_role ADD VALUE 'station'` (conta de casa) em migração própria |
| 016 | `beta_profiles` | 0 | 9 | 0 | 1 | 0 | Perfis Staff/Admin; `filled_by`, `on_duty_staff`, `split_rota_shift`, horas previstas x trabalhadas; trigger `handover_fill_default` |
| 017 | `beta_management` | 4 | 16 | 4 | 5 | 1 | Reports por período e casa; Purchases Tesco (`shop_*`); Holidays (`holiday_locks`) |
| 018 | `handover_shifts` | 1 | 7 | 1 | 1 | 3 | Handover por turno; `handover_shifts`; confirmação de horas pelo Manager |
| 019 | `tasks_back` | 0 | 2 | 0 | 0 | 0 | Daily Tasks de volta; `sign_task` com `p_signed_by` |
| 020 | `report_purchases` | 0 | 1 | 0 | 0 | 0 | Relatório de compras |
| 021 | `person_summary` | 0 | 1 | 0 | 0 | 0 | Resumo de pessoa (tela Pessoas) |
| 022 | `home_dashboard` | 0 | 1 | 0 | 0 | 0 | Painéis da Home |
| 023 | `handover_tags_push` | 4 | 10 | 2 | 2 | 0 | `handover_tags`, `handover_entry_tags`, `push_prefs`, `push_subscriptions`; `warning_notify` |
| 024 | `push_hook` | 0 | 1 | 0 | 1 | 0 | `notify_push` (pg_net + Vault) |
| 025 | `float_shift` | 0 | 5 | 0 | 0 | 2 | Turno Float no Handover (Office 1/casa, Float 1 global) |
| 026 | `shift_times` | 0 | 2 | 0 | 0 | 0 | Horário informado na abertura/encerramento do turno |
| 027 | `handover_coauthors` | 1 | 2 | 1 | 1 | 1 | `handover_entry_staff` (autor + até 3 colegas) |
| 028 | `handover_search` | 0 | 1 | 0 | 0 | 2 | `search_handover` |
| 029 | `house_scope` | 0 | 53 | 14 | 0 | 0 | Isolamento por casa (`house_scope`, `can_see_lodge`); **reescreve 53 funções** (em MAIÚSCULAS) para validar a casa |
| 030 | `system_settings` | 0 | 1 | 0 | 0 | 0 | `set_system_parameter` |
| 031 | `audit_search` | 0 | 2 | 0 | 0 | 3 | `search_audit`, `search_access_log` + índices |
| 032 | `more_settings` | 0 | 4 | 0 | 0 | 0 | `presence.check_window_minutes`, nome de exibição; redefine `set_system_parameter` e funções de check |
| 033 | `people_roles` | 0 | 0 | 0 | 0 | 0 | `home_lodge_id` só para `station` (`staff_home_only_station`) |
| 034 | `structure` | 0 | 13 | 0 | 1 | 0 | Admin gere quartos, camas, geladeiras, máquinas, casa; audita `laundry_machines` |
| 035 | `bed_room_active` | 0 | 1 | 0 | 0 | 0 | Bug: cama ativa em quarto removido aceitava residente (`stays_check_bed`) |
| 036 | `tags_admin` | 0 | 3 | 0 | 0 | 0 | Admin gere tags (cor, ordem, aviso padrão) |
| 037 | `r15` | 1 | 9 | 1 | 1 | 1 | `suppliers`; Warning/Final Warning (2 tipos, converte dados); PASS ID obrigatório e re-admissão; alerta de validade; pedido Tesco por status; **cinco blocos `DO` com `pg_get_functiondef`** |
| 038 | `r16` | 0 | 4 | 0 | 0 | 0 | `release_cancelled_bed`; `admit_resident`/`transfer_resident` liberam cama cancelada; `home_dashboard` por período |

## 2. Marcos e características 🟢

- **Evolução por fases**: 001-013 = especificação funcional v1.1 (Fases 0-3 + correções); 014-017 = "Beta" (escopos 2-4: dois perfis, gestão); 018-038 = "Revisões" numeradas 2 a 16 (escopo vivo).
- **Migração de dados dentro do DDL** (DML): conversão `warnings.type` (`final_written` → `final_warning`, demais → `warning`, 037); `update staff set home_lodge_id = null` (033); `task_templates.created_at = now()` (009); seeds de tags (023: 8 tags), fornecedores (037: Tesco, Ripley's), geladeiras (014), máquinas (010), parâmetros (vários).
- **Reescrita dinâmica de função** (037): `has_final_warning`, `deactivate_final_warning`, `report_period`, `report_purchases`, `set_system_parameter`. Consulte a metodologia no topo de `functions-and-triggers.md`.
- **Overloads removidos** por `drop function if exists` em 007, 016, 017, 019, 023, 025, 026, 027, 037 (`record_food_delivery`), 038 (`home_dashboard`), evitando chamadas ambíguas em PostgREST.
- **`notify pgrst, 'reload schema'`** ao fim de várias migrações para recarregar o cache da API.
- **Constraints alteradas** (drop/add): `handover_entries_kind_check` (010, 018), `vacations_status_check` (017), `warnings_type_check` (037), `shop_orders_status_check` (037), `staff_home_only_station` (033); coluna nullable: `food_deliveries.temperature/batch/expiry_date` (014, 037).
- **Índice recriado**: `handover_shifts_one_open` (018 → 025, com `function = 'office'`).

## 3. Riscos e lacunas 🟡/🔴

- 🔴 Não há migrações "down" nem versionamento de rollback; `create table`/`create trigger` sem `if not exists` não são idempotentes (reaplicar falha).
- 🟡 A migração 029 (1 580 linhas) concentra a reescrita de 53 funções; qualquer função posterior que a redefina deve preservar as checagens de casa (revisões 037/038 o fazem: `can_see_lodge` + `can_write_lodge`).
- 🟡 Seeds com `valid_from = '2026-01-01'` e carga de produção misturados às migrações (dados de Amiens/Connolly): ambiente de teste herda dados de negócio.
- 🟡 Migrações 037 usam `replace`/`regexp_replace` em texto de função: não falham se o padrão não for encontrado.
- 🟡 A pasta `_pricing/` está fora do escopo deste agente.
- 🔴 O banco de produção não foi consultado (regra do agente); o estado real pode divergir de migrações aplicadas manualmente (ver `../questions.md`).
