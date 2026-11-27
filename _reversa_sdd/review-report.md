# Relatório de Revisão — DS Lodge

> Revisor Reversa · doc_level=completo · pt-br · answer_mode=file · 2026-11-27. Escrita restrita a `_reversa_sdd/` (sem git, sem segredos, `_pricing/` não lido nem tocado). Revisão cruzada externa (Codex): não disponível → não executada.

## 1. Escopo revisado
~100 artefatos `.md` (11 módulos x 3 arquivos de análise, 11 units `spec.md` + `user-stories.md`, 13 ADRs, 6 de banco, 5 de design system, C4, ERD, RPCs, permissões, máquinas de estado, matrizes). Os 3 arquivos canônicos `requirements/design/tasks` não existem por unit: o Redator usou `spec.md` consolidado (desvio de formato; conteúdo coberto).

## 2. Verificação cruzada spec x código (amostragem)
| Afirmação | Valor nas specs | Verificado no código | Resultado |
|---|---|---|---|
| Tabelas em `public` | 53 | 53 `CREATE TABLE` distintos em `supabase/migrations/*.sql`, nenhum `DROP TABLE` | 🟢 |
| Migrations | 38 | 38 arquivos; última `20261126000038_r16.sql` | 🟢 |
| Regras de erro em `errors.ts` | 97 | 97 pares `[regex, chave]`; arquivo com 113 linhas | 🟢 (mas ver C-2: "~110" em 4 lugares) |
| Funções do banco | 192 (297 defs) / "~190" | 192 nomes `public.*` distintos | 🟢 (C-4) |
| Triggers / policies / índices | 67 / 76 / 50 | 67 / 76 / 50 (`CREATE TRIGGER/POLICY/INDEX`; índice: 51 se contar `UNIQUE INDEX` como em 1 recriado) | 🟢 |
| Testes | 636 em 86 arquivos; `tests/db` 28; e2e 20 | 59 em `src/` + 27 em `tests/` = 86; 28 e 20 | 🟢 |
| Edge functions | 2 | `admin-users`, `send-push` | 🟢 |
| `LOCALES` | só `en-IE` | `src/i18n/index.tsx:5` | 🟢 |
| `not_authorised` -> "Author only" | bug | `errors.ts:5` `/not_author/` antes de `:90` `/not_authorised|…/`; `errors.test.ts` não cobre | 🟢 confirmado |
| `quick_phrases` sem consumidor | sim | nenhuma ocorrência em `src/` nem `supabase/functions/` | 🟢 |
| `interval '24 hours'` literal (lembrete de manutenção) | sim | `occurrences.sql:660,663` | 🟢 |
| VAPID `mailto:noreply@example.com` | sim | `send-push/index.ts:35` | 🟢 |
| Contagem "N residents" inclui `absent/cancelled` | sim | `Continuity.tsx:39` | 🟢 |
| Nome de cache do SW | `shell-v1` | `public/sw.js:3` | 🟢 |
| Redefinição de `report_period`/`report_purchases` na r15 | via `DO` + `pg_get_functiondef` | M37 existe (`r15.sql`), `tests/db/r15.test.ts` cobre | 🟢 |

## 3. Correções factuais aplicadas (5)
| # | Arquivo(s) | Erro comprovado | Correção |
|---|---|---|---|
| C-1 | `modules/ocorrencias-e-passagem-de-turno/code-analysis.md`, `specs/ocorrencias-e-passagem-de-turno/spec.md` (EB-01), `specs/interface-e-i18n/spec.md`, `questions.md` (2 linhas) | Diziam que `late_reason_required` cai em `errors.generic`. `errors.ts:94` `/reason_required/` o mapeia a `errors.reasonRequired`; `invalid_priority/invalid_slot/invalid_performer` estão em `INTERNAL` (`errors.coverage.test.ts:8-11`) | Texto corrigido e reclassificado 🟡→🟢 |
| C-2 | `modules/interface-e-i18n/{data-dictionary,code-analysis}.md`, `specs/interface-e-i18n/spec.md` | "~110 regras" e intervalo `errors.ts:3-207`; real: 97 regras em `:3-102` | Corrigido para 97 / `:3-102` |
| C-3 | `modules/{interface-e-i18n/{code-analysis,flowchart},acesso-e-autenticacao/code-analysis,ocorrencias-e-passagem-de-turno/code-analysis,moradores-e-presenca/code-analysis}.md`, `questions.md` | Referências `errors.ts:183-192`, `:210-219`, `:169`, `:82-180` além do fim do arquivo (113 linhas) | `errorKey` = `:104-112`; regras `:3-102`; `not_authorised` = `:90` |
| C-4 | `rpc-contracts.md`, `inventory.md`, `questions.md` | "~190 funções" | 192 funções distintas |
| C-5 | `findings-verification.md` (#2) | Dizia "sem teste (`grep by_status tests/` não acha)"; existe `tests/db/r15.test.ts:263-264` | Corrigido |
Não foi alterada nenhuma outra afirmação; incertezas permanecem 🟡/🔴 conforme os agentes.

## 4. Revisão cruzada entre units / matrizes
- Nenhuma unit contradiz outra após as correções. Divergência registrada, não factual: `auto_sign_task` (serviços) x `sign_task` (equipe) tratam o assinante de forma diferente (pergunta aberta).
- `permissions.md` marca `station` sem acesso a notificações, mas `my_notifications` admite `audience='lodge'` — tensão já registrada como pergunta, sem produto que a gere.
- `traceability/code-spec-matrix.md` e `spec-impact-matrix.md`: amostra de 6 linhas confere; a matriz de impacto cita corretamente "97 regras".
- Units esperadas x geradas: 11 módulos do Arqueólogo = 11 units. Candidatas a unit própria (Férias/Holidays, Daily Tasks) registradas como lacuna D2.

## 5. Verificação de regressão semântica (step-04)
**Não aplicável**: não existe `_reversa_forward/` (nenhum ciclo `/reversa-coding` anterior), portanto não há `regression-watch.md`. "Reconciliação de adendos": nenhum adendo a reconciliar.

## 6. Perguntas
`questions.md` (126 linhas, modo arquivo) triado em `questions-triage.md`: 16 bugs/riscos prováveis do produto, 7 resolvidas, ~30 linhas duplicadas em 18 grupos, ~65 decisões de negócio, 5 grupos de lacunas de documentação. Nenhuma foi respondida (aguarda o usuário; processar respostas com `reversa`).

## 7. Top 8 achados de produto
1. `not_authorised` exibe "Author only…" (regex `not_author` antes) — todo erro de permissão RLS/42501 que chegue com esse texto engana o usuário; teste não cobre.
2. `open_resident_profile`, `find_former_resident` e `resident_evidence` sem `can_see_lodge` — PII de outra casa acessível por UUID/PASS ID.
3. `maintenance_set_status` com conta `station` (sem posto): guarda avalia NULL, sem erro.
4. `parameters_insert` permite inserir qualquer parâmetro direto pela API, inclusive `security.require_mfa_management`.
5. Manager pode promover a `owner` por update em `staff`; função de Rota `manager` sem restrição no banco.
6. `station` não edita/admite residente (`residents_update` exige posto), enquanto o BedMap permite — inconsistência front x banco.
7. Parâmetros editáveis ignorados: `maintenance.reminder_hours`, `shift.day_start/night_start`, alerta de validade (2 dias fixos), `quick_phrases` sem uso.
8. Privacidade: snapshot offline com PII sem expiração/limpeza no logout; `audit_log` com linha inteira sem retenção; VAPID placeholder `noreply@example.com`; contraste AA e alvos 44 px no design system.

## 8. Limitações
Leitura estática; nenhum teste executado; sem Visor/Tracer; contagens 🟢/🟡/🔴 incluem legendas; amostragem, não varredura exaustiva das afirmações das 100 páginas.
