# Verificação de achados controversos dos agentes

> Detetive Reversa · método: leitura estática de migrations, front, testes e `git log` (somente leitura). Nenhum teste foi executado. Veredito: **CONFIRMADO**, **REFUTADO** ou **PARCIAL**. Escala 🟢/🟡/🔴 refere-se à confiança do veredito.
> Armadilha metodológica: várias funções são redefinidas em `20261125000029_house_scope.sql` com `CREATE OR REPLACE FUNCTION` em maiúsculas e, em `20261126000037_r15.sql`, por blocos `DO` com `pg_get_functiondef + replace`. Quem lê só o SQL original ou usa `grep` case-sensitive vê a versão antiga.

| # | Achado (módulo) | Veredito | Conf. |
|---|---|---|---|
| 1 | Reports/warnings: front espera `warnings.warning/final_warning`, mas `report_period` devolve `verbal/written/final_written` (painel-relatorios) | **REFUTADO** | 🟢 |
| 2 | `PurchasesReport` lê `by_status`, mas `report_purchases` não devolve (painel/compras) | **REFUTADO** | 🟢 |
| 3 | `not_authorised` resolve para a mensagem "Author only…" (acesso-e-autenticacao) | **CONFIRMADO** (bug de UX) | 🟢 |
| 4 | `pending_counts` não chama `can_see_lodge` (painel) | **REFUTADO** | 🟢 |
| 5 | `open_resident_profile` sem `can_see_lodge` (acesso/moradores) | **CONFIRMADO** (lacuna de isolamento) | 🟢 ausência / 🟡 exploração |
| 6 | `maintenance_set_status` com conta `station`: guarda avalia NULL (ocorrências) | **CONFIRMADO** | 🟢 leitura / 🟡 exploração |
| 7 | `find_former_resident` sem `can_see_lodge` (moradores) | **CONFIRMADO**, provavelmente intencional | 🟡 |
| 8 | `push_recipients` sem filtro de casa vs `my_notifications` (notificações) | **REFUTADO como risco** | 🟢 |
| 9 | `parameters_insert` permite qualquer chave direto pela API (configurações) | **CONFIRMADO** | 🟢 |
| 10 | Manager pode promover a owner por update direto em `staff` (equipe) | **CONFIRMADO** | 🟢 |
| 11 | Função de Rota `manager` não restrita no banco (equipe) | **CONFIRMADO** | 🟢 |
| 12 | `residents_update` exige posto; `station` não tem posto (moradores) | **CONFIRMADO** | 🟢 |
| 13 | `maintenance.reminder_hours` não é lido (ocorrências) | **CONFIRMADO** | 🟢 |
| 14 | `shift.day_start/night_start` não são lidos (moradores) | **CONFIRMADO** | 🟢 |
| 15 | `quick_phrases` sem consumidor (configurações/ocorrências) | **CONFIRMADO** | 🟢 |
| 16 | Alerta de validade da lista de entregas usa 2 dias fixos, não o parâmetro (serviços) | **PARCIAL** (parâmetro existe; cliente ignora) | 🟡 |
| 17 | Cama cancelada (`out_pending`) é efetivada sem gestão ao ocupar a cama (moradores) | **CONFIRMADO** como comportamento (M38); intenção 🔴 | 🟢 / 🔴 |

## Detalhes
**1. Warnings — REFUTADO.** `report_period` em `beta_management.sql:191-195` e `house_scope.sql:1213-1215` ainda emite `verbal/written/final_written`, mas a migration `20261126000037_r15.sql:5-22` (a última, depois de 029/030/031/032) converte os dados (`final_written`→`final_warning`, resto→`warning`), recria o CHECK em `('warning','final_warning')` e, num bloco `DO`, pega a definição vigente de `report_period` por `pg_get_functiondef` e aplica `regexp_replace` (troca `verbal`+`written` por `warning`) e `replace` (`final_written`→`final_warning`, `warnings.final_written`→`warnings.final_warning`). O texto da 029 casa com a regex (linhas consecutivas, mesmo espaçamento). `report_details_period` usa `'warnings.' || w.type`, logo aceita as novas chaves. O front (`management.ts:48,70`: `warnings: ["warning","final_warning"]`) e os testes (`stress-workflow.test.ts:247`, `review-2.test.ts:105-108`) estão alinhados. Nenhuma migration posterior (só `r16`) redefine `report_period`. **Risco residual 🟡:** o patch por `replace` é silencioso se o texto não casar, e nenhum teste de banco confere as chaves de `report_period().warnings` — recomenda-se um teste.

**2. `by_status` — REFUTADO.** `report_purchases` original (`20261125000020`) só traz `placed`, mas `20261126000037_r15.sql:283-291` aplica `replace` sobre a definição vigente acrescentando `'by_status'` com `created/placed/awaiting/delivered`. A CTE `o` não filtra status, então inclui rascunho (`created`) — coerente com a pergunta de compras sobre incluir rascunhos nos totais. **Risco residual 🟡:** sem teste (`grep by_status tests/` não acha). `Reports.tsx:34` usa `?.[s] ?? 0`, o que mascararia falha futura.

**3. `not_authorised` → "Author only" — CONFIRMADO.** `src/lib/errors.ts`: `RULES` é percorrida em ordem, primeiro match vence. A regra `/not_author/` (linha 5) é substring de `not_authorised`, e vem antes de `/not_authorised|row-level security|permission denied|42501/` (linha 90). Como `errorKey` usa só `message`, toda recusa de RPC com `raise exception 'not_authorised'` mostra `errors.notAuthor` ("Author only. Manager or Owner can always amend."). O teste (`errors.test.ts:11`) só cobre `"not_author"`. Correção sugerida: ancorar `/\bnot_author\b/` ou mover a regra de `not_authorised` para antes.

**4. `pending_counts` — REFUTADO.** Há duas definições: `occurrences.sql:812` (sem `can_see_lodge`) e `house_scope.sql:841` (`CREATE OR REPLACE FUNCTION`, maiúsculas), que a substitui com a checagem. `tests/db/house-scope.test.ts:44-48` afirma que a conta de casa recebe `not_authorised` ao consultar a outra casa.

**5/6/7. Funções SECURITY DEFINER sem `can_see_lodge`.** `open_resident_profile` (M01:788) e `maintenance_set_status` (M07:583) têm uma única definição e não filtram por casa; `find_former_resident` (M37:91) idem. O isolamento por RLS não os protege porque contornam RLS. Para `station`: o `resident_id` pode ser obtido via `find_former_resident(pass_id)` e usado em `open_resident_profile` (que devolve `to_jsonb(r)` do residente e as estadias). Em `maintenance_set_status`, `v_post` é nulo para `station`, `not (NULL and …)` avalia NULL e não levanta exceção; só a segunda checagem limita o status a `resolved`. Explorabilidade depende de conhecer UUIDs; sem teste dinâmico (🟡). Item 7 é provavelmente desenho da readmissão (Revisão 15) — decisão de produto.

**8. `push_recipients` — REFUTADO como risco.** Destinatários são `manager/owner/developer` ativos (M23:166), e `can_see_lodge` só restringe `station`; logo nenhum Admin é filtrado por casa. A divergência com `my_notifications` é inócua hoje.

**9/10. Gestão contornando a UI.** `parameters_insert` (`foundation.sql:894`) só exige `is_management()` e `valid_from` recente, com `grant insert` de tabela inteira (M04:12); `staff_update` (`foundation.sql:888`) só barra `developer`. Logo um manager insere qualquer chave (inclusive `security.require_mfa_management`) e altera papéis por API.

**11. Rota.** `save_rota_shift` (M29:1335-1338): `(p_function='cleaner') <> (v_role='cleaner')`, `office` só porter, `float` porter/manager; função `manager` sem restrição de papel no banco (a restrição declarada em `management.ts:105-112` é só do front).

**12–15.** `residents_update` = `is_management() or has_open_post()` (`foundation.sql:903`), front usa `isManagement || !!post` (`Residents.tsx:39`, `ResidentProfile.tsx:92`). `maintenance_reminders` usa `interval '24 hours'` literal (`occurrences.sql:660,663`) apesar do parâmetro editável. `shift_of` usa 7/19 literais (`presence.sql:20-21`); `shift.day_start/night_start` só existem no seed. `quick_phrases` só aparece em `occurrences.sql`; nenhuma referência em `src/` ou `supabase/functions/`.

**16.** A faixa "vence logo" da lista usa `expiresSoon(…)` com 2 dias fixos no cliente, enquanto `record_food_delivery` (M37) usa `delivery.expiry_alert_days`.

**17.** `release_cancelled_bed` (`r16.sql:4-11`) executa o encerramento da estadia `out_pending` ao admitir/transferir, sem `is_management()`. É comportamento confirmado; se é a regra de negócio desejada permanece 🔴.

## Outros achados já registrados nos módulos que **não** foram reverificados
Todos os demais itens de `questions.md` seguem 🟡/🔴 conforme o Arqueólogo.
