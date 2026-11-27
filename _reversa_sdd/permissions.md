# Permissões e papéis (RBAC / RLS) — DS Lodge

> Detetive Reversa · doc_level=completo. 🟢 confirmado no SQL/código lido · 🟡 inferido (classificação estática, sem execução) · 🔴 lacuna.
> `Mnn` = migration. Nenhuma credencial ou segredo é citado.

## 1. Papéis
Enum `staff_role`: `porter, cleaner, manager, owner, developer` (M01) + `station` (M15). Nomes de UI (en-IE): `porter`="Staff", `manager`="Manager (Admin)", `owner`="Owner (Admin)", `station`=conta da casa.

| Papel | Login pelo app | Observações |
|---|---|---|
| `developer` | Não é criado pelo app (`staff_insert` e a edge function recusam); só um developer edita outro. Conta técnica, equivalente à gestão. | 🟢 |
| `owner` / `manager` | Sim (edge function `admin-users`); **gestão** ("Admin"). Exigem 2ª etapa por e-mail (`mfa_satisfied`). | 🟢 |
| `station` | Sim; exige `home_lodge_id`; vê/escreve só a própria casa; sem posto (`duty_posts`). | 🟢 |
| `porter` ("Staff") / `cleaner` | **Sem login** no Beta: a edge function não cria usuário; se existir linha com login, `App.tsx` mostra "use a conta da casa". No banco, um porter com posto aberto passa em `can_write_lodge`. | 🟢 / 🟡 |
| anon | Nenhum acesso (privilégios revogados, M04). | 🟢 |

Predicados centrais (SECURITY DEFINER):
- `is_active_staff()` = existe `staff` ativo para `auth.uid()`.
- `is_management()` = papel ∈ {manager, owner, developer} **e** `mfa_satisfied()` (M01/M05).
- `can_see_lodge(l)` = contexto interno (`auth.uid()` nulo) **ou** (ativo e (papel ≠ station **ou** `l` = casa do station)) (M29).
- `can_write_lodge(l)` = `is_management()` **ou** station na própria casa ativa **ou** posto aberto (`function='float'` ou casa igual) (M29).
- `mfa_satisfied()` = papel não-gestão **ou** `security.require_mfa_management=false` **ou** sessão por e-mail válida (M05).

## 2. Camada de tabelas (RLS + grants) 🟢
- Privilégios revogados para `anon`/`authenticated`; só SELECT (e INSERT/UPDATE pontuais) são concedidos; **nenhum DELETE/TRUNCATE** (M04, ADR-0002). Escritas de domínio acontecem por RPC.
- Leitura por equipe ativa: `lodges, rooms, beds, staff, parameters, duty_posts, residents, stays` (políticas `*_read`); `handover_shifts` (leitura geral); `no_shows` etc.
- Escrita direta (gestão): `lodges/rooms/beds` (insert/update), `staff` (`staff_insert` com `role <> 'developer'`; `staff_update` com `role <> 'developer'` salvo se quem altera for developer), `parameters` (insert com `valid_from >= now()-1min`).
- `residents_update`: gestão **ou** `has_open_post()` (conta `station` não tem posto → UI/RLS inconsistentes com `canWriteLodge`).
- `audit_log` e `access_log`: leitura só gestão. Triggers de auditoria; `audit_immutable` bloqueia alteração.
- Política **restritiva** `house_scope` (SELECT) em todas as tabelas com `lodge_id` e em filhas (`beds`, `absences`, `dinner_marks`, `room_check_marks`, `handover_*`, `maintenance_events`, `residents`…): `station` só vê a sua casa; demais papéis veem tudo. `handover_shifts`: Float aberto aparece nas duas casas.
- Casa visível: a UI replica a regra (`AuthProvider.lodges`, `canWriteLodge`), mas o banco é a fonte (ADR-0006).

## 3. Matriz papel × ação
Legenda: ✔ permitido · ✔(c) apenas na própria casa · ✔(p) com posto aberto · ✖ negado · ⚠ lacuna/inconsistência. "Gestão" = manager/owner/developer com MFA satisfeito. Linhas verificadas por leitura de função; as marcadas 🟡 vêm da classificação estática de guardas.

| Ação (RPC / tabela) | Gestão | Station | Porter/Cleaner (se tivesse login) | Fonte | Conf. |
|---|---|---|---|---|---|
| Ver residentes, estadias, camas | ✔ (2 casas) | ✔(c) | ✔(p) leitura | RLS + house_scope | 🟢 |
| Abrir perfil `open_resident_profile` | ✔ | ⚠ qualquer casa (sem `can_see_lodge`) | ✔ | M01:788 | 🟢 |
| Admitir / transferir (`admit_resident`, `transfer_resident`) | ✔ | ✔(c) | ✔(p) | M38 | 🟢 |
| Editar cadastro do residente (`residents_update`) | ✔ | ⚠ ✖ (sem posto; front esconde) | ✔(p) | M01:903 | 🟢 |
| Decidir Out (`decide_out`) | ✔ | ✔(c) | ✔(p) | M01 | 🟢 |
| Retirar Out (`withdraw_out`) | ✔ | só se foi quem decidiu | idem | M01 | 🟢 |
| Efetivar Out (`effect_out`) | ✔ | ✖ | ✖ | M01 | 🟢 |
| Consulta ex-residente por PASS ID (`find_former_resident`) | ✔ | ⚠ qualquer staff ativo, sem filtro de casa | idem | M37:91 | 🟢 (provável desenho de readmissão 🟡) |
| Room Check, Seen, ausências (`open/mark/launch…`, `record_sighting`, `register/end_absence`) | ✔ | ✔(c) | ✔(p) | M06 | 🟢 |
| Confirmar No Show | ✔ | ✔(c) | ✔(p) | M06 | 🟢 |
| Desfazer No Show (`undo_no_show`) | ✔ | ✖ | ✖ | M06 | 🟢 |
| Nota do Handover, abrir/fechar turno | ✔ | ✔(c) | ✔(p) | M29, M26 | 🟢 |
| Corrigir/anular nota | ✔ sempre | só `author_id` = conta, na janela (`check_entry_correction`) | idem | M07 | 🟢 |
| Registrar Warning/FW (`record_warning`) | ✔ | ✔(c) | ✔(p) | M37 | 🟢 |
| Desativar FW (`deactivate_final_warning`) | ✔ | ✖ | ✖ | M07 | 🟢 |
| Criar chamado de manutenção | ✔ | ✔(c) | ✔(p) | M07 | 🟢 |
| Mudar status/prazo do chamado (`maintenance_set_status`) | ✔ qualquer | ⚠ pode "resolver" chamado de **qualquer casa** (guarda avalia NULL; sem `can_see_lodge`) | Office da casa só resolve | M07:583 | 🟢 (leitura estática; sem teste dinâmico) |
| Lembretes/snooze de manutenção | ✔ | ✖ | ✖ | M07 | 🟡 |
| Fridge, Food Delivery, Dinner, Laundry (registrar) | ✔ | ✔(c) | ✔(p) | M10, M29 | 🟢 |
| Fechar Dinner (`close_dinner`) | ✔ | ✖ | ✖ | M10 | 🟡 |
| Assinar tarefa (`sign_task`) | ✔ | ✔(c), assina pela pessoa do turno | ✔(p) | M29:1460 | 🟢 |
| Criar/editar modelos e tarefas extras | ✔ | ✖ | ✖ | M08/M19 | 🟡 |
| Fornecedores, Tesco (pedidos, linhas, vínculo), itens | ✔ | ✖ | ✖ | M17, M37 | 🟢 |
| Rota (salvar/publicar/cancelar/dividir) | ✔ (função×papel; ⚠ `manager` só no front) | ✖ | ✖ | M29:1335 | 🟢 |
| Hours (`staff_hours`, `confirm_shift_hours`, ajustar/adicionar) | ✔ | ✖ | ✖ | M25 | 🟢 |
| Férias (registrar/aprovar/cancelar) e calendário | ✔ | ✖ (rota `vacations` visível à equipe; escrita só gestão) | ✖ | M11, M17 | 🟡 |
| Relatórios (`report_period`, `report_details*`, `report_purchases`, `report_monthly`) | ✔ | ✖ | ✖ | M17/M20 | 🟢 |
| Auditoria e log de acesso (`search_audit`, `search_access_log`, tabelas) | ✔ | ✖ | ✖ | M01, M31 | 🟢 |
| Home (`home_dashboard`) | ✔ | ✔ (filtra por `can_see_lodge`) | ✔ | M38 | 🟢 |
| Contagens de pendências (`pending_counts`) | ✔ | ✔(c) — recusa outra casa (`can_see_lodge`) | ✔ | M29:841; house-scope.test.ts:45 | 🟢 |
| Notificações e preferências de push (`my_notifications`, `my_push_prefs`, `save_push_subscription`) | ✔ | ✖ (todas exigem gestão) | ✖ | M10, M23 | 🟡 |
| Parâmetros do sistema (`set_system_parameter`, lista fechada) | ✔ | ✖ | ✖ | M30 | 🟢 |
| Inserir parâmetro direto (`parameters_insert`) | ✔ ⚠ qualquer chave | ✖ | ✖ | M01:894 | 🟢 |
| Estrutura (`add_room/bed`, `update_lodge`, `structure_guard`) | ✔ | ✖ | ✖ | M34 | 🟢 |
| Usuários (criar, resetar senha, ativar/desativar) via `admin-users` | ✔ (chama `is_management`) | ✖ | ✖ | edge function | 🟢 |
| Alterar papel de usuário (`staff_update`) | ✔ ⚠ manager pode promover a owner por update direto (a UI restringe) | ✖ | ✖ | M01:888 | 🟢 |
| Trocar própria senha/nome/locale | ✔ | ✔ | ✔ | M01, `set_my_*` | 🟢 |

## 4. Fluxo de autorização em camadas
1. Front: `Gate` por `stage` (login → troca de senha → código por e-mail → pronto), depois rotas por `isManagement` (`rota, purchases, hours, reports, users, audit, structure`).
2. Banco: RPC SECURITY DEFINER com `is_management()`/`can_write_lodge()`/`can_see_lodge()`; RLS como rede de proteção para SELECT/INSERT/UPDATE direto.
3. Edge function `admin-users`: valida `is_management` do chamador; cria Auth user com e-mail confirmado e exige senha forte; `developer` recusado.
4. Desativar conta: `is_active_staff()` falso corta o acesso por RLS/RPC na hora; Auth user é banido (`ban_duration`).

## 5. Lacunas de autorização confirmadas (leitura estática) — registradas em `findings-verification.md`
- `open_resident_profile` (M01, única definição) e `maintenance_set_status` (M07, única definição) não chamam `can_see_lodge`: uma conta `station` pode, em tese, ler o perfil completo de um residente de outra casa ou resolver chamado de outra casa se obtiver o UUID (o PASS ID de `find_former_resident` fornece o `resident_id`). 🟢 (ausência da checagem) / 🟡 (explorabilidade, sem teste dinâmico). `pending_counts` **não** é lacuna: M29 a redefine com `can_see_lodge` e há teste.
- `parameters_insert` e `staff_update` permitem à gestão contornar listas fechadas/UI (inserir chave arbitrária; promover a owner). 🟢
- `save_rota_shift` aceita função `manager` para qualquer papel gestor/porter sem restringir no banco (restrição só no front). 🟡
- `push_recipients` não filtra por casa: **não é lacuna** hoje, pois destinatários são só papéis de gestão e `can_see_lodge` só restringe `station`.

## 6. Pontos de MFA/sessão
- 2ª etapa só para gestão; desligável por parâmetro (`security.require_mfa_management`, fora da lista fechada de `set_system_parameter`, mas alterável via `parameters_insert`).
- Ociosidade 15 min (parâmetro 5–240) é só no cliente; JWT é o único limite no servidor. 🟡
