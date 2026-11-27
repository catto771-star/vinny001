# Triagem de questions.md — DS Lodge

> Revisor Reversa · modo arquivo: nada foi resolvido com o usuário; este documento só classifica as 126 perguntas de `questions.md` (uma por linha). Prioridade: **Alta** = segurança, privacidade, integridade de dados ou erro visível ao usuário; **Média** = regra de negócio/consistência a decidir; **Baixa** = cosmético, volume, documentação. Tipo: **BUG** = provável defeito do produto (comprovado no código); **DECISÃO** = regra de negócio a confirmar; **DOC** = lacuna de documentação/leitura incompleta do Reversa; **DUP** = duplicada de outra; **RESOLVIDA** = já respondida por `findings-verification.md` ou por esta revisão.
> Bloco `[detetive]`, `[arquiteto]`, `[redator]`, `[data-master]`, `[design-system]` = perguntas dos respectivos agentes; foram agrupadas no módulo afetado.

## A. Bugs prováveis do produto (confirmados no código; recomendar correção)
| # | Módulo | Achado | Evidência | Prioridade |
|---|---|---|---|---|
| B1 | acesso / i18n | **Regex `not_author` em `errors.ts` (linha 5) precede `not_authorised` (linha 90)**: `/not_author/` casa dentro de `not_authorised`, então erro de permissão mostra "Author only. Manager or Owner can always amend." em vez de "You do not have permission…". O teste só cobre `row-level security` e `not_author`, nunca `not_authorised`. Correção: ancorar (`/not_author\b/`) ou mover a regra e testar | `src/lib/errors.ts:5,90`; `findings-verification.md` #3 | Alta |
| B2 | moradores/acesso | `open_resident_profile` (PII + log) e `find_former_resident`/`resident_evidence` sem `can_see_lodge`: conta de uma casa acessa residente de outra se tiver UUID/PASS ID | `foundation.sql`; `r15.sql:91-102`; #5, #7 | Alta |
| B3 | ocorrências | `maintenance_set_status`: sem posto aberto (conta `station`) `v_post` é NULL e a guarda avalia NULL, sem `raise` | `occurrences.sql`; #6 | Alta |
| B4 | configurações | `parameters_insert` (RLS) permite gestor inserir qualquer chave direto pela API, inclusive `security.require_mfa_management`, contornando a lista fechada de `set_system_parameter` | #9 | Alta |
| B5 | equipe | Manager promove a `owner` por update direto em `staff`; função de Rota `manager` não restrita no banco | `foundation.sql:888-890`; `house_scope:1335`; #10, #11 | Alta |
| B6 | moradores | `residents_update` exige posto aberto; `station` nunca tem posto, então Admit/Editar some para ela enquanto `BedMap` permite | `foundation.sql:903`; `Residents.tsx:39`; #12 | Média |
| B7 | ocorrências/moradores | Parâmetros não lidos: `maintenance.reminder_hours` (24 h literal), `shift.day_start/night_start` (7/19 literais), `quick_phrases` sem consumidor | `occurrences.sql:660,663`; `presence.sql:20-21`; #13-15 | Média |
| B8 | serviços | Alerta "vence logo" usa 2 dias fixos no cliente; servidor usa `delivery.expiry_alert_days`; `delivery_expiring` usa `current_date` do servidor, não o dia operacional de Dublin | `Deliveries.tsx:102`; `r15:208`; #16 | Média |
| B9 | serviços/equipe | `auto_sign_task` assina como `current_staff_id()` (NULL para `station`), enquanto `sign_task` recusa; assinatura automática de temperatura some para conta de casa | `services.sql:25-26`; `house_scope:1468` | Média |
| B10 | notificações | VAPID `mailto:noreply@example.com` placeholder codificado | `send-push/index.ts:35` | Média |
| B11 | compras | `report_purchases` soma pedidos `created` (rascunho) nos totais; `set_shop_order` aceita 366 dias passados vs 30 em `create_shop_order` | `r15:227`; `beta_management:364` | Média |
| B12 | acesso | Falhas parciais sem compensação: `reset_password` marca `must_change_password` antes de `updateUserById`; `ChangePassword` não-transacional; `strongPassword` da edge só `[A-Za-z]` vs front acentuado | `admin-users/index.ts:31-33`; `password.ts:3` | Média |
| B13 | design-system | Contraste AA violado (`#1f1300` em `--warn`, 3,27:1; `#fff` em `--danger` escuro, 3,00:1); alvos de toque < 44 px; faltam `prefers-contrast`/`forced-colors` | `design-system/accessibility.md` | Média |
| B14 | moradores | `release_cancelled_bed` efetiva Out `out_pending` ao ocupar a cama sem `effect_out` da gestão (comportamento confirmado; intenção 🔴) | `r16.sql:4-11`; #17 | Média |
| B15 | geral | `errors.ts`: `invalid_priority`, `invalid_slot`, `invalid_performer` caem em `errors.generic` (aceitos em `INTERNAL`; mensagem ruim para o usuário) | `errors.coverage.test.ts:8-11` | Baixa |
| B16 | repositório | `tsconfig.tsbuildinfo` versionado (7 commits de ruído) | git log | Baixa |

## B. Perguntas já RESOLVIDAS (manter só como histórico)
- **painel #1 (warnings)** e **#2 (`by_status`)**: refutadas — M37 corrige (`findings-verification.md` #1, #2). Ambos têm teste em `tests/db/r15.test.ts` (linhas 63-70 e 263-264); sobra só a verificação de `set_system_parameter` pós-patch.
- **painel #3 (`pending_counts` sem `can_see_lodge`)**: refutada (#4). **notificações #1 (`push_recipients`)**: refutada como risco (#8).
- **equipe/`[data-master]` "19 triggers"**: corrigido (18 + `suppliers` manual).
- **`[redator]` `errors.ts` para `late_reason_required`**: resolvida nesta revisão — já mapeia (`/reason_required/`); `invalid_*` estão em `INTERNAL`.
- **`[arquiteto]` auditoria "≈40 tabelas"**: respondida em `database/audit-coverage.md` (41/53).

## C. Duplicadas (consolidar; manter a primeira)
| Grupo | Linhas duplicadas | Mantida |
|---|---|---|
| `not_authorised`/"Author only" | `[acesso]` e `[detetive]` | B1 |
| `open_resident_profile` sem `can_see_lodge` | `[acesso]`, `[detetive]` e parte de `[moradores]` | B2 |
| `find_former_resident` PII entre casas | `[moradores]`, `[detetive]` | B2 |
| `maintenance_set_status` com `station` | `[ocorrências]`, `[detetive]` | B3 |
| `release_cancelled_bed` sem gestão | `[moradores]`, `[detetive]` | B14 |
| `quick_phrases` sem uso | `[configurações]`, `[ocorrências]`, `[data-master]` | B7 |
| Alerta de validade / `delivery.expiry_alert_days` | `[serviços]` (2×: 2 dias e Dublin) | B8 |
| `delivery_received/expiring` sem push | `[notificações]`, `[serviços]` | decisão P1 |
| `shift.day_start/night_start` literais | `[moradores]` | B7 |
| VAPID `noreply@example.com` | `[notificações]`, `[arquiteto]` | B10 |
| Snapshot de continuidade em localStorage (privacidade) | `[continuidade]`, `[redator]` | decisão P2 |
| Retenção de `audit_log`/`notifications` / LGPD | `[notificações]`, `[data-master]` | decisão P3 |
| `mark_resident` remarcar check `launched` | `[moradores]`, `[redator]` | decisão P4 |
| `house_scope` não cobre tabelas novas | `[configurações]`, `[data-master]` | decisão P5 |
| Cobertura de auditoria faltante (`handover_entry_tags`, `quick_phrases`, `laundry_machines`, `suppliers`) | `[painel]`, `[data-master]`, `[arquiteto]` | decisão P6 |
| `~190` funções / contrato exaustivo | `[redator]` | doc D1 |
| Patches `pg_get_functiondef + replace` da r15 frágeis | `[configurações]`, `[detetive]`, `[data-master]` | decisão P7 |
| Tasks fora de equipe / Vacations | `[moradores]` e `[redator]` | doc D2 |
| Idiomas pt-PT/pl-PL | `[arquiteto]`, `[interface]` (`setLocale`) | decisão P8 |

## D. Decisões de negócio abertas (lacunas só o usuário resolve)
**Alta**
- P2/P3 Privacidade (LGPD/GDPR): snapshot offline com nomes/DOB/PASS ID sem expiração nem limpeza no logout; `audit_log`/`access_log` guardam linha inteira (PII, `unit_price`) sem retenção/particionamento; `notifications` sem limpeza.
- Sessão: inatividade só no cliente (JWT); quem pode desligar `security.require_mfa_management` e em que ambientes; origem da conta `developer`.
- Operação: como migrations vão a produção, backup/rollback (sem `down`), SMTP do código de login, provisionamento dos segredos do Vault do push.
- P5 Garantia de `house_scope` para tabelas novas (teste-guardião roda no CI? não há CI/CD no repositório).
**Média**
- Compras: legado `products/purchases/…` ainda é requisito? corrigir linhas de pedido entregue, desvincular entrega, desativar item da lista fixa Tesco, validar coerência entrega x pedido.
- Serviços: corrigir/anular leitura de geladeira ou entrega lançada errada; faixa de temperatura por casa; renomear fornecedor reescreve histórico; `has_laundry/has_dinner` não bloqueia; definição de "Não serviu" (ausência de marca vs `served=false`).
- Moradores/ocorrências: `mark_resident` remarcar; `clear_mark` faz DELETE real (contraria ADR-0002; auditado); race em `register_absence`; reabrir chamado não zera `resolved_*`; `void_handover_note` bloqueia nova ronda no slot; `correct_handover_note` não atualiza menções/tags; edição por `author_id` na conta de casa; `final_warning_active` por estadia, não por residente; DailySheet com janela fixa 60 min vs parâmetro.
- Equipe: cobertura parcial vs total em `coverage_gaps`; `confirm_shift_hours` pode sobrepor turno; caminho "Ajustar"/`assume_post` ainda suportado?; Users grava `locale="en-IE"`; tela para desativar templates de Daily Tasks; âncora 00:00 (Rota) vs 07:00 (Hours); rate limit/CORS aberto na edge `admin-users`.
- Notificações: kinds sem push (`no_show_monthly_limit`, `coverage_below_minimum`, `vacation_conflict`, `delivery_*`); `TAG_LABEL` fixo em inglês; `audience='lodge'` não usada; station vê notificações `lodge`?
- Config/estrutura: `add_bed` não checa quarto ativo e limite 12 conta inativas; sem UI para criar/desativar casas; troca de senha re-autentica e pode rebaixar aal2; gravações sequenciais sem transação em `SystemSettings`.
- Painel: CSV do Audit só linhas carregadas e cabeçalhos em inglês; `planned_minutes` sem casa só com 2+ casas; erros de RPC silenciados (também `Notifications.tsx`); `suppliers`/`laundry_machines` fora de `MODULES`; `report_details_period` sem LIMIT e `search_audit` sem trigram.
- Design/PWA: `theme-color` `#1c1f24` vs `applyTheme`; `data-house` sem fallback para casa nova; FKs sem índice dedicado; `created_by/adjusted_by` sem FK.
**Baixa**
- Cache `shell-v1` sem versionamento/limpeza; efeito do intervalo de continuidade com `posts` desatualizado; contagem "N residents" inclui `absent/cancelled`; `aria-label="×"` fixo; hora repetida do DST em `dublinWallTimeToDate`; imports mortos IBM Plex; Storybook inexistente; `residents.is_demo`; limite 500 ex-residentes; `docs/DESIGN.md` desatualizado vs código; decisão de não usar Realtime; registro formal da troca QR→código de e-mail; `Vacations.tsx` pertence à equipe.

## E. Lacunas de documentação do Reversa (não são problemas do produto)
- D1 Contrato exaustivo de 192 funções via `pg_proc` (hoje ~110) — Média.
- D2 Férias/Holidays e Daily Tasks sem módulo/spec próprio (`Vacations.tsx`, `register_vacation`, …) — Média.
- D3 Não analisados: `src/pages/Continuity.test.tsx`; definição completa dos tokens por casa em `theme.css` além da linha 92; origem de `--ios-ease`; valor real de `STORAGE_KEY` e contagem de quartos/camas do seed; critérios de `passwordAcceptable` (`src/lib/password.ts`) — Baixa.
- D4 Nenhum teste foi executado; Visor/Tracer não executados — Média.
- D5 [Revisão] `tests/db/r15.test.ts:63-70` JÁ cobre `report_period().warnings` (chaves `warning/final_warning`); `tests/db/r15.test.ts:263-264` também cobre `by_status` (findings-verification corrigido); resta verificar teste específico para `set_system_parameter` pós-patch — Baixa.

## Contagem
Total de linhas em `questions.md`: 126 (antes das correções desta revisão). Bugs/risco de produto: 16; resolvidas: 7; duplicadas consolidadas: 18 grupos (~30 linhas); decisões de negócio: ~65; lacunas de documentação: 5 grupos (~10 linhas).
