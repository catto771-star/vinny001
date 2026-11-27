# Arqueologia Git — DS Lodge

> Detetive Reversa · doc_level=completo · somente leitura (`git log`/`git show`). Escala: 🟢 confirmado · 🟡 inferido · 🔴 lacuna.

## 1. Panorama 🟢
- 99 commits no repositório (94 de produto/infra até 2026-11-27, mais os da própria instalação do Reversa), de 2026-10-24 a 2026-11-27.
- Duas fases bem distintas:
  1. **Protótipo (24/10)**: 5 commits ("Adiciona telas de residentes/estadias", "verificações de quarto", "sessões de turno"); sem continuidade visível no código atual.
  2. **Reescrita em fases (20/11 em diante)**: "Fase 0" (banco, relógio de Dublin, telas), "Fase 1" (presença, ocorrências), "Fase 2" (serviços), "Fase 3" (gestão), seguidas de "Beta 1–4" (24/11) e "Revisão 2 … 16" (25–26/11). Em 7 dias (20 a 26/11) foram 38 migrations.
- Entre 14 e 16/11: adição de skills de terceiros (`unslop`, REA, Composio) e PRs #1/#2 (só adicionam skills/instalador, sem código de produto) 🟢.
- 27/11: instalação do Reversa e escavação (commits `93ff066`…`01ed4db`); `c8759d2` ignora `_reversa_sdd/_pricing/` para manter valores do negócio fora do repositório 🟢.

## 2. Linha do tempo de decisões
| Data | Commit | Marco | ADR |
|---|---|---|---|
| 20/11 | `7f77ad6`, `71b4bbc` | Banco com permissões/auditoria; idiomas, relógio Dublin, dia operacional | 0001, 0004 |
| 20/11 | `6611957` | Revoga privilégios padrão (TRUNCATE/DELETE); script da 1ª conta | 0002 |
| 20/11 | `2f6d2f9` | 2ª etapa por e-mail em vez de QR/autenticador | 0003 |
| 20/11 | `98af06a` | `agents.md` (regras: testes sempre, bug → teste falhando primeiro) | 0013 |
| 20/11 | `b470249`, `a3d67c1`, `24a3312` | Presença (Room Check, Seen, ausências, No Show), e2e 12/12 | — |
| 20/11 | `1aa55ef`, `ef02029`, `62af565` | Handover, Daily Tasks, Maintenance, Warnings; serviços; gestão | 0001 |
| 21/11 | `0165151`, `8296541` | Testes em massa e varredura de entradas inválidas, com correções | 0013 |
| 24/11 | `95b87f6` | Beta 1: sistema só em inglês, logos das casas, tema por casa | 0011 |
| 24/11 | `44cc379` | Beta 2: Room Check fora do horário, Laundry no Handover, Food Delivery sem temperatura | — |
| 24/11 | `190394a` | Beta 3: conta da casa (Staff) + Admin; Porter/Cleaner sem login; horas vêm do Roster | 0005 |
| 24/11 | `0979779` | Beta 4: Purchases com lista fixa do Tesco; Holidays; Reports por período | 0010 |
| 25/11 | `259cf08` | Handover por turno; horas cruzadas com Roster; corrige FW duplicada | 0007, 0008 |
| 25/11 | `79e0bac` | PWA Admin, tags de Handover, push por Admin | 0012 |
| 25/11 | `4c30700` | Isolamento por casa no banco | 0006 |
| 25/11 | `665ec4a` | Settings: My account e System parameters | — |
| 26/11 | `6fd095c` | Pessoas sem casa, tela Structure, suíte de cenários | 0005 |
| 26/11 | `fc715f3`, `436f3fb` | Revisão 15: Warning/FW, PASS ID e re-admissão, fornecedores, pedidos por status | 0008, 0010 |
| 26/11 | `c2211f6` | Revisão 16: cama cancelada livre, Home por período, continuidade offline | 0009, 0012 |

## 3. Padrões observados
- **Fix/correção**: poucos commits "fix" explícitos (`743650f` admissão com clique rápido; `a4c0857`…`bb4f766`/`tsbuildinfo` são ruído). A maioria das correções vem embutida em commits de fase, citando "achada pela simulação em massa" (FW duplicada, temperatura absurda no Food Delivery) 🟢. Essas mensagens revelam comportamentos esperados: uma só FW ativa por estadia; temperatura plausível na entrega.
- **Reverts**: nenhum `git revert` encontrado 🟢. Há **substituições** de decisão: TOTP→e-mail (`2f6d2f9`), compras por Lodge → lista fixa Tesco (`0979779`), 3 tipos de warning → 2 (`fc715f3`), assumir posto → turno do Handover (`259cf08`), atalhos do Handover → tags (`79e0bac`).
- **Grandes refatorações** (mudança de requisito): Revisão 2 (Home/Handover/Seen/No Show), Revisão 8 (isolamento por casa, via `house_scope`), Revisão 13 (pessoas sem casa, `staff_home_only_station`).
- **Migrations que remendam funções por `pg_get_functiondef` + `replace`** (r15 em `has_final_warning`, `report_period`, `report_purchases`, `set_system_parameter`): padrão de manutenção frágil, mas verificado como funcional (ver findings-verification.md) 🟡.
- **Autoria**: mensagens de revisão do tipo "Revisão N (item X)" indicam um backlog numerado de pedidos do cliente; mensagens de commit são em português e quase todas co-assinadas por IA (trailer `Co-Authored-By`) 🟢.
- **Ruído**: 7 commits "Update TypeScript build info" mostram `tsconfig.tsbuildinfo` versionado 🟡.

## 4. Lacunas 🔴
- Não há issues/PRs de produto no histórico (só PR #1/#2 de skills); o "porquê" de várias decisões só existe nas mensagens de commit e em comentários SQL. Motivação da troca do QR por e-mail só é conhecida pela frase "decisão da gestão em 20/11/2026" (comentário da migration 05).
- Não foi possível datar a descontinuação de `quick_phrases` nem do modelo legado de compras além do que as migrations 23 e 17 sugerem.
