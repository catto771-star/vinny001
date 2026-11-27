# Índice das specs — DS Lodge

> Redator Reversa · layout `feature-folder`, granularidade `module` (conforme `.reversa/config.toml [specs]`), doc_level=completo, pt-br.
> Cada módulo tem `spec.md` (objetivo, atores, RF, regras, dados, interfaces, estados, permissões, casos de borda, RNF, rastreabilidade, confiança 🟢🟡🔴) e `user-stories.md` (Gherkin).
> **Precedência**: onde `modules/*` e `findings-verification.md` divergem, as specs seguem o veredito do Detetive e anotam a contradição na seção "Contradições anotadas".

| # | Módulo | Spec | Histórias | Escopo resumido |
|---|---|---|---|---|
| 1 | acesso-e-autenticacao | [spec](acesso-e-autenticacao/spec.md) | [US](acesso-e-autenticacao/user-stories.md) | Login, MFA por e-mail, senha, papéis, `admin-users`, auditoria de leitura |
| 2 | moradores-e-presenca | [spec](moradores-e-presenca/spec.md) | [US](moradores-e-presenca/user-stories.md) | Residentes, estadias, Out, camas, Room Check, Seen, ausências, No Show |
| 3 | ocorrencias-e-passagem-de-turno | [spec](ocorrencias-e-passagem-de-turno/spec.md) | [US](ocorrencias-e-passagem-de-turno/user-stories.md) | Handover, rondas, turnos, manutenção, warnings, tags |
| 4 | servicos-da-casa | [spec](servicos-da-casa/spec.md) | [US](servicos-da-casa/user-stories.md) | Laundry, Fridge, Dinner, Food Delivery |
| 5 | compras-e-fornecedores | [spec](compras-e-fornecedores/spec.md) | [US](compras-e-fornecedores/user-stories.md) | Pedidos Tesco, fornecedores, vínculo de entrega, relatório; modelo legado |
| 6 | equipe-escala-e-horas | [spec](equipe-escala-e-horas/spec.md) | [US](equipe-escala-e-horas/user-stories.md) | Rota, Hours, Daily Tasks, Users (Férias só parcial) |
| 7 | painel-relatorios-e-auditoria | [spec](painel-relatorios-e-auditoria/spec.md) | [US](painel-relatorios-e-auditoria/user-stories.md) | Home, painel, pendências, Reports, Audit/CSV |
| 8 | configuracoes-e-cadastros | [spec](configuracoes-e-cadastros/spec.md) | [US](configuracoes-e-cadastros/user-stories.md) | Parâmetros, estrutura, tags, conta, isolamento por casa |
| 9 | continuidade-offline | [spec](continuidade-offline/spec.md) | [US](continuidade-offline/user-stories.md) | Folha de continuidade, snapshot local, service worker, PWA |
| 10 | notificacoes-e-push | [spec](notificacoes-e-push/spec.md) | [US](notificacoes-e-push/user-stories.md) | Central, `send-push`, preferências, assinaturas |
| 11 | interface-e-i18n | [spec](interface-e-i18n/spec.md) | [US](interface-e-i18n/user-stories.md) | Layout, tema, i18n en-IE, mapa de erros, fuso, filtros |

## Artefatos globais
- [`../rpc-contracts.md`](../rpc-contracts.md) — contratos das RPCs e Edge Functions (no lugar de OpenAPI REST: não há API REST própria).
- [`../traceability/code-spec-matrix.md`](../traceability/code-spec-matrix.md) — arquivo de código × spec.
- Base: `../domain.md`, `../state-machines.md`, `../permissions.md`, `../erd-complete.md`, `../architecture.md`, `../adrs/`, `../findings-verification.md`, `../questions.md`.

## Vereditos do Detetive aplicados
| # | Achado | Veredito | Onde está tratado |
|---|---|---|---|
| 1 | Warnings `verbal/written` × `warning/final_warning` | REFUTADO | painel (RF-04), ocorrências (RF-10) |
| 2 | `report_purchases.by_status` ausente | REFUTADO | compras (RF-08), painel (RF-05) |
| 3 | `not_authorised` → "Author only" | CONFIRMADO (bug UX) | interface (RF-06), acesso (EB-06) |
| 4 | `pending_counts` sem `can_see_lodge` | REFUTADO | ocorrências (RF-11), painel (RF-03) |
| 5 | `open_resident_profile` sem `can_see_lodge` | CONFIRMADO | acesso §11, moradores (RF-03) |
| 6 | `maintenance_set_status` com `station` | CONFIRMADO | ocorrências (RF-09) |
| 7 | `find_former_resident` sem `can_see_lodge` | CONFIRMADO (provável desenho) | moradores (RF-02) |
| 8 | `push_recipients` sem filtro de casa | REFUTADO como risco | notificações (RF-04) |
| 9 | `parameters_insert` aceita qualquer chave | CONFIRMADO | configurações (RF-03), acesso §11 |
| 10 | Manager promove a owner | CONFIRMADO | equipe (RN-08), acesso §11 |
| 11 | Função de Rota `manager` sem restrição no banco | CONFIRMADO | equipe (RF-01) |
| 12 | `residents_update` exige posto | CONFIRMADO | moradores (RF-04) |
| 13 | `maintenance.reminder_hours` não lido | CONFIRMADO | ocorrências (RF-09), configurações |
| 14 | `shift.day_start/night_start` não lidos | CONFIRMADO | moradores (RN-05), ocorrências (RN-04) |
| 15 | `quick_phrases` sem consumidor | CONFIRMADO | configurações (RF-11) |
| 16 | Alerta de validade 2 dias fixos no cliente | PARCIAL | serviços (RF-04) |
| 17 | Cama cancelada efetivada sem gestão | CONFIRMADO (intenção 🔴) | moradores (RF-07) |

## Contradições anotadas entre fontes
1. `modules/painel-relatorios-e-auditoria` (§4, §5.5, §5.7) × Detetive #1, #2, #4 → vale o Detetive (refutados).
2. `permissions.md` (notificações ✖ para `station`) × `my_notifications` (`audience='lodge'` visível a quem vê a casa) → 🟡 pendente; ver `questions.md`.
3. `domain.md` regra 10 cita janela de correção em Room Check; não reverificada pelo Detetive 🟡.

## Estado da geração
- 11 units, 22 arquivos canônicos (spec + user-stories) + 3 globais (`rpc-contracts.md`, `code-spec-matrix.md`, este índice).
- `requirements/design/tasks` do template original do Writer foram consolidados em `spec.md` por solicitação do orquestrador (SDD único por módulo).
- Lacuna de cobertura: Férias/Holidays (sem spec dedicada); contrato exaustivo de RPCs.
