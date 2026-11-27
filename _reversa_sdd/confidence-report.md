# Relatório de Confiança — DS Lodge

> Revisor Reversa · doc_level=completo · pt-br · modo de respostas: arquivo (nada foi perguntado no chat). Data: 2026-11-27.
> Método: contagem literal dos marcadores 🟢/🟡/🔴 com `grep -o` em cada `.md` de `_reversa_sdd/` (exceto `_pricing/`, não lido) — antes deste relatório e dos demais artefatos do Revisor. **Aviso:** a contagem inclui marcadores de legenda/cabeçalho (cada arquivo costuma explicar a escala uma vez) e marcadores em tabelas de veredito; é um indicador relativo, não uma auditoria afirmação a afirmação. Resultado total: 1203 🟢 · 420 🟡 · 149 🔴.

## Total geral
| 🟢 | 🟡 | 🔴 | Total | % 🟢 | % 🟡 | % 🔴 |
|---|---|---|---|---|---|---|
| 1203 | 420 | 149 | 1772 | 67.9% | 23.7% | 8.4% |


## Por grupo de artefatos
| Grupo | Arquivos | 🟢 | 🟡 | 🔴 |
|---|---|---|---|---|
| `adrs` | 13 | 13 | 4 | 0 |
| `(raiz)` | 18 | 314 | 85 | 32 |
| `database` | 6 | 80 | 31 | 15 |
| `design-system` | 5 | 27 | 35 | 16 |
| `modules/acesso-e-autenticacao` | 3 | 32 | 14 | 4 |
| `modules/compras-e-fornecedores` | 3 | 22 | 7 | 5 |
| `modules/configuracoes-e-cadastros` | 3 | 36 | 22 | 4 |
| `modules/continuidade-offline` | 3 | 31 | 4 | 2 |
| `modules/equipe-escala-e-horas` | 3 | 25 | 14 | 4 |
| `modules/interface-e-i18n` | 3 | 36 | 6 | 3 |
| `modules/moradores-e-presenca` | 3 | 32 | 19 | 4 |
| `modules/notificacoes-e-push` | 3 | 27 | 7 | 3 |
| `modules/ocorrencias-e-passagem-de-turno` | 3 | 20 | 18 | 4 |
| `modules/painel-relatorios-e-auditoria` | 3 | 44 | 16 | 5 |
| `modules/servicos-da-casa` | 3 | 32 | 11 | 4 |
| `specs/README.md` | 1 | 1 | 3 | 2 |
| `specs/acesso-e-autenticacao` | 2 | 47 | 12 | 5 |
| `specs/compras-e-fornecedores` | 2 | 27 | 8 | 6 |
| `specs/configuracoes-e-cadastros` | 2 | 32 | 11 | 2 |
| `specs/continuidade-offline` | 2 | 22 | 7 | 4 |
| `specs/equipe-escala-e-horas` | 2 | 31 | 13 | 3 |
| `specs/interface-e-i18n` | 2 | 31 | 9 | 3 |
| `specs/moradores-e-presenca` | 2 | 39 | 15 | 6 |
| `specs/notificacoes-e-push` | 2 | 25 | 9 | 3 |
| `specs/ocorrencias-e-passagem-de-turno` | 2 | 39 | 11 | 2 |
| `specs/painel-relatorios-e-auditoria` | 2 | 34 | 8 | 3 |
| `specs/servicos-da-casa` | 2 | 26 | 12 | 3 |
| `traceability` | 1 | 78 | 9 | 2 |

## Por artefato
| Arquivo | 🟢 | 🟡 | 🔴 |
|---|---|---|---|
| `adrs/0001-regras-de-negocio-no-banco-supabase.md` | 1 | 1 | 0 |
| `adrs/0002-nada-e-apagado-privilegios-travados-auditoria.md` | 1 | 0 | 0 |
| `adrs/0003-segunda-etapa-gestao-por-email.md` | 1 | 1 | 0 |
| `adrs/0004-dia-operacional-e-relogio-dublin.md` | 1 | 0 | 0 |
| `adrs/0005-conta-da-casa-station-e-equipe-sem-login.md` | 1 | 0 | 0 |
| `adrs/0006-isolamento-por-casa-no-banco.md` | 1 | 0 | 0 |
| `adrs/0007-handover-por-turno-e-horas-do-roster.md` | 1 | 0 | 0 |
| `adrs/0008-warning-e-final-warning-dois-tipos.md` | 1 | 0 | 0 |
| `adrs/0009-cama-cancelada-fica-livre.md` | 1 | 1 | 0 |
| `adrs/0010-compras-tesco-lista-fixa-e-status.md` | 1 | 0 | 0 |
| `adrs/0011-sistema-so-em-ingles.md` | 1 | 1 | 0 |
| `adrs/0012-pwa-push-e-continuidade-offline.md` | 1 | 0 | 0 |
| `adrs/0013-desenvolvimento-guiado-por-testes.md` | 1 | 0 | 0 |
| `architecture.md` | 4 | 5 | 2 |
| `c4-components.md` | 1 | 1 | 0 |
| `c4-containers.md` | 6 | 4 | 1 |
| `c4-context.md` | 7 | 3 | 1 |
| `cross-cutting.md` | 7 | 6 | 4 |
| `database/audit-coverage.md` | 4 | 8 | 2 |
| `database/functions-and-triggers.md` | 4 | 5 | 3 |
| `database/indexes-and-constraints.md` | 3 | 2 | 1 |
| `database/migrations-history.md` | 2 | 6 | 4 |
| `database/rls-policies.md` | 6 | 6 | 4 |
| `database/schema.md` | 61 | 4 | 1 |
| `dependencies.md` | 0 | 0 | 0 |
| `deployment.md` | 10 | 7 | 4 |
| `design-system/accessibility.md` | 3 | 5 | 2 |
| `design-system/components.md` | 1 | 8 | 3 |
| `design-system/css-contracts.md` | 1 | 4 | 2 |
| `design-system/themes.md` | 7 | 8 | 4 |
| `design-system/tokens.md` | 15 | 10 | 5 |
| `domain.md` | 52 | 12 | 2 |
| `erd-complete.md` | 7 | 2 | 1 |
| `findings-verification.md` | 17 | 8 | 5 |
| `git-analysis.md` | 7 | 3 | 2 |
| `integrations.md` | 16 | 3 | 4 |
| `inventory.md` | 5 | 0 | 0 |
| `modules/acesso-e-autenticacao/code-analysis.md` | 26 | 12 | 1 |
| `modules/acesso-e-autenticacao/data-dictionary.md` | 5 | 2 | 3 |
| `modules/acesso-e-autenticacao/flowchart.md` | 1 | 0 | 0 |
| `modules/compras-e-fornecedores/code-analysis.md` | 12 | 5 | 3 |
| `modules/compras-e-fornecedores/data-dictionary.md` | 4 | 2 | 2 |
| `modules/compras-e-fornecedores/flowchart.md` | 6 | 0 | 0 |
| `modules/configuracoes-e-cadastros/code-analysis.md` | 30 | 14 | 2 |
| `modules/configuracoes-e-cadastros/data-dictionary.md` | 6 | 7 | 2 |
| `modules/configuracoes-e-cadastros/flowchart.md` | 0 | 1 | 0 |
| `modules/continuidade-offline/code-analysis.md` | 26 | 4 | 2 |
| `modules/continuidade-offline/data-dictionary.md` | 2 | 0 | 0 |
| `modules/continuidade-offline/flowchart.md` | 3 | 0 | 0 |
| `modules/equipe-escala-e-horas/code-analysis.md` | 15 | 11 | 2 |
| `modules/equipe-escala-e-horas/data-dictionary.md` | 4 | 3 | 2 |
| `modules/equipe-escala-e-horas/flowchart.md` | 6 | 0 | 0 |
| `modules/interface-e-i18n/code-analysis.md` | 27 | 6 | 2 |
| `modules/interface-e-i18n/data-dictionary.md` | 4 | 0 | 1 |
| `modules/interface-e-i18n/flowchart.md` | 5 | 0 | 0 |
| `modules/moradores-e-presenca/code-analysis.md` | 27 | 14 | 1 |
| `modules/moradores-e-presenca/data-dictionary.md` | 4 | 5 | 3 |
| `modules/moradores-e-presenca/flowchart.md` | 1 | 0 | 0 |
| `modules/notificacoes-e-push/code-analysis.md` | 19 | 7 | 3 |
| `modules/notificacoes-e-push/data-dictionary.md` | 5 | 0 | 0 |
| `modules/notificacoes-e-push/flowchart.md` | 3 | 0 | 0 |
| `modules/ocorrencias-e-passagem-de-turno/code-analysis.md` | 16 | 13 | 1 |
| `modules/ocorrencias-e-passagem-de-turno/data-dictionary.md` | 3 | 5 | 3 |
| `modules/ocorrencias-e-passagem-de-turno/flowchart.md` | 1 | 0 | 0 |
| `modules/painel-relatorios-e-auditoria/code-analysis.md` | 36 | 12 | 3 |
| `modules/painel-relatorios-e-auditoria/data-dictionary.md` | 8 | 4 | 2 |
| `modules/painel-relatorios-e-auditoria/flowchart.md` | 0 | 0 | 0 |
| `modules/servicos-da-casa/code-analysis.md` | 19 | 10 | 2 |
| `modules/servicos-da-casa/data-dictionary.md` | 8 | 1 | 2 |
| `modules/servicos-da-casa/flowchart.md` | 5 | 0 | 0 |
| `permissions.md` | 41 | 12 | 1 |
| `questions.md` | 0 | 1 | 0 |
| `rpc-contracts.md` | 117 | 7 | 4 |
| `spec-impact-matrix.md` | 3 | 4 | 0 |
| `specs/README.md` | 1 | 3 | 2 |
| `specs/acesso-e-autenticacao/spec.md` | 38 | 11 | 4 |
| `specs/acesso-e-autenticacao/user-stories.md` | 9 | 1 | 1 |
| `specs/compras-e-fornecedores/spec.md` | 21 | 8 | 6 |
| `specs/compras-e-fornecedores/user-stories.md` | 6 | 0 | 0 |
| `specs/configuracoes-e-cadastros/spec.md` | 24 | 11 | 2 |
| `specs/configuracoes-e-cadastros/user-stories.md` | 8 | 0 | 0 |
| `specs/continuidade-offline/spec.md` | 17 | 7 | 4 |
| `specs/continuidade-offline/user-stories.md` | 5 | 0 | 0 |
| `specs/equipe-escala-e-horas/spec.md` | 24 | 13 | 3 |
| `specs/equipe-escala-e-horas/user-stories.md` | 7 | 0 | 0 |
| `specs/interface-e-i18n/spec.md` | 23 | 9 | 3 |
| `specs/interface-e-i18n/user-stories.md` | 8 | 0 | 0 |
| `specs/moradores-e-presenca/spec.md` | 30 | 15 | 5 |
| `specs/moradores-e-presenca/user-stories.md` | 9 | 0 | 1 |
| `specs/notificacoes-e-push/spec.md` | 20 | 9 | 3 |
| `specs/notificacoes-e-push/user-stories.md` | 5 | 0 | 0 |
| `specs/ocorrencias-e-passagem-de-turno/spec.md` | 30 | 11 | 2 |
| `specs/ocorrencias-e-passagem-de-turno/user-stories.md` | 9 | 0 | 0 |
| `specs/painel-relatorios-e-auditoria/spec.md` | 26 | 8 | 3 |
| `specs/painel-relatorios-e-auditoria/user-stories.md` | 8 | 0 | 0 |
| `specs/servicos-da-casa/spec.md` | 20 | 12 | 3 |
| `specs/servicos-da-casa/user-stories.md` | 6 | 0 | 0 |
| `state-machines.md` | 14 | 7 | 1 |
| `traceability/code-spec-matrix.md` | 78 | 9 | 2 |

## Cobertura
- **Módulos**: 11 de 11 analisados pelo Arqueólogo, cada um com `code-analysis`, `data-dictionary`, `flowchart` e uma unit em `specs/<módulo>/` (`spec.md` + `user-stories.md`). Os 3 arquivos canônicos `requirements/design/tasks` do template genérico não existem; o Redator consolidou em `spec.md` (registrado como desvio de formato, não como lacuna de conteúdo). Não há `openapi/` (não existe API REST própria; contratos em `rpc-contracts.md`, 🟢).
- **Banco**: 53 tabelas, 38 migrations, 192 funções distintas (297 definições), 67 triggers, 76 `CREATE POLICY`, 50 `CREATE INDEX` — reconferidos no código nesta revisão (ver `review-report.md`). Cobertura de auditoria: 41/53 tabelas (`database/audit-coverage.md`).
- **Contratos de RPC**: `rpc-contracts.md` cobre ~110 de 192 funções (as documentadas pelos módulos). Lacuna conhecida (média).
- **Design system**: tokens, temas, componentes, contratos CSS e acessibilidade documentados; sem validação visual (Visor não executado).
- **Dinâmico**: nenhuma análise dinâmica (Tracer não executado), nenhum teste foi rodado — toda afirmação é estática.
- **Matrizes**: `traceability/code-spec-matrix.md` (78 🟢) e `spec-impact-matrix.md` existem; amostragem de 6 linhas bateu com o código.

## Contradições resolvidas
| # | Contradição | Resolução | Fonte |
|---|---|---|---|
| 1 | Front espera `warnings.warning/final_warning`; `report_period` original devolve `verbal/written/final_written` | Resolvida: M37 converte dados, recria CHECK e reescreve a função via `DO` | `findings-verification.md` #1 |
| 2 | `PurchasesReport` lê `by_status`; `report_purchases` original não o devolve | Resolvida: M37 acrescenta `by_status`; risco residual de teste ausente (🟡) | #2 |
| 3 | `pending_counts` sem `can_see_lodge` | Refutada (versão M29 aplica) | #4 |
| 4 | `push_recipients` sem filtro de casa vs `my_notifications` | Refutada como risco | #8 |
| 5 | `cross-cutting.md`: "19 triggers bump_version" | Corrigida: 18 triggers + `suppliers` manual | `database/functions-and-triggers.md` |
| 6 | `cross-cutting.md`: auditoria "≈40 tabelas" | Corrigida: 41/53 | `database/audit-coverage.md` |
| 7a | `findings-verification.md` dizia que `by_status` não tem teste | **Corrigida**: `tests/db/r15.test.ts:263-264` | `review-report.md` C-5 |
| 7 | Spec dizia que `late_reason_required` cai em `errors.generic` | **Corrigida nesta revisão**: casa `/reason_required/` (`errors.ts:94`) | `review-report.md` C-1 |
| 8 | Módulos citavam "~110 regras" e linhas `errors.ts:183-219`; arquivo tem 97 regras e 113 linhas | **Corrigida nesta revisão** | `review-report.md` C-2/C-3 |
| 9 | "~190 funções" vs 192 distintas | **Corrigida nesta revisão** | C-4 |
| 10 | Divergência de assinante `auto_sign_task` vs `sign_task` | Não é contradição factual: comportamento real, mantido como pergunta (serviços) | `questions-triage.md` |

## Reclassificações nesta revisão
- 🟡→🟢: `late_reason_required` → `errors.reasonRequired` (spec ocorrências, code-analysis); `invalid_priority/invalid_slot/invalid_performer` em `INTERNAL` (spec i18n).
- 🟡→🟢 (verificado, sem alterar texto): 97 regras de erro, 53 tabelas, 38 migrations, 76 policies, 50 índices, 67 triggers, bug `/not_author/` (linha 5) antes de `not_authorised` (linha 90), `quick_phrases` sem consumidor em `src/` e `supabase/functions/`, VAPID `mailto:noreply@example.com`, `LOCALES=["en-IE"]`, `interval '24 hours'` literal.
- Nenhuma reclassificação 🟢→🟡/🔴 foi necessária na amostra.

## Revisão cruzada
- Engine externa consultada: nenhuma (plugin Codex indisponível; `doc_level=completo` → opcional, não oferecida). Apontamentos recebidos: 0.

