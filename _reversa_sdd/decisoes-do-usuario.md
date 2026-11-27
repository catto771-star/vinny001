# Decisões do usuário (respostas a perguntas-para-voce.md)

Registradas em 2026-11-27. Servem de ordem de serviço para as correções (teste primeiro, depois código).

## Segurança e privacidade
| # | Decisão |
|---|---|
| 1 | C: manter o snapshot offline como está (aparelho da casa). |
| 2 | B: `audit_log` guardado para sempre. |
| 3 | B: Admin e Owner podem desligar `security.require_mfa_management`. |
| 4 | A: inatividade só no cliente é aceitável. |
| 5 | A: conta `developer` só é criada pelo próprio usuário, direto no banco. |
| 6 | B: criar roteiro de como desfazer (rollback) cada migration. |
| — | Problema 4 (Manager promove usuários): mantido; o Manager tem autonomia completa. |

## Moradores e camas
| # | Decisão |
|---|---|
| 7 | A: ocupar cama "Bed cancelled" efetiva a saída automaticamente (como está). |
| 8 | A: remarcar um check já lançado deve avisar e bloquear. |
| 9 | B: desfazer marcação vira "anulado" e continua visível (não apagar). |
| 10 | A: Final Warning zera numa nova estadia (como está). |
| 11 | A: conta de recepção (station) pode admitir e editar residente. |
| 12 | B: busca de ex-residentes sem limite de 500. |

## Ocorrências
| # | Decisão |
|---|---|
| 13 | B: reabrir chamado mantém a data antiga de resolução como histórico. |
| 14 | A: anular nota de ronda continua bloqueando novo registro no slot. |
| 15 | A: menções acompanham a edição da nota. |
| 16 | A: `maintenance.reminder_hours` passa a funcionar. |
| 17 | Turnos 7h/19h são fixos, mas `shift.day_start/night_start` deve funcionar. |
| 18 | A: remover `quick_phrases`. |

## Serviços e compras
| # | Decisão |
|---|---|
| 19 | B: alerta de validade de 2 dias, mas ajustável em Settings (usar `delivery.expiry_alert_days` com padrão 2 e cliente lendo o parâmetro). |
| 20 | A: permitir corrigir leitura de temperatura/entrega, com registro. |
| 21 | A: permitir desvincular entrega de pedido (só Admin). |
| 22 | A: bloquear mudança nas linhas de pedido já entregue. |
| 23 | A: relatório de compras só conta pedidos Placed em diante. |
| 24 | B: itens da lista fixa Tesco não precisam ser desativáveis. |
| 25 | B: manter modelo antigo products/purchases (será usado no futuro). |
| 26 | A: push para todas as notificações hoje sem push. |

## Equipe
| # | Decisão |
|---|---|
| 27 | B: turnos sobrepostos geram aviso, mas são permitidos. |
| 28 | B: cobertura só alerta ausência total (como está). |
| 29 | A: padronizar a semana da Rota às 07:00. |
| 30 | A: criar botão para desativar modelos de Daily Tasks. |

## Configurações e aparência
| # | Decisão |
|---|---|
| 31 | B: criar/desativar casa dentro de Settings (Registers), sem tela dedicada. |
| 32 | A: manter só inglês (remover vestígios de pt/pl). |
| 33 | A: corrigir contrastes AA. |
| 34 | A: rotina automática no GitHub (CI) que rode os testes. |
| 35 | B: CSV do Audit continua como está. |
