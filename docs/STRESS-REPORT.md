# Relatório de estresse

> Gerado por `npm run load` em 2026-11-27 07:03 UTC · banco local isolado `dslodge_load` (nunca a produção) · duração 31 s

**Resultado: TODOS OS CRITÉRIOS PASSARAM** (26/26)

## Volume de dados fictícios
| Tabela | Linhas |
|---|---|
| Moradores | 5000 (+81 ativos agora) |
| Estadias | 5000 |
| Notas de Handover | 60000 |
| Leituras de geladeira | 30000 |
| Entregas | 8000 |
| Chamados de manutenção | 3000 |

## Tempos de resposta
| Operação | p50 | p95 | Limite | |
|---|---|---|---|---|
| Home do Admin (home_dashboard, 30 dias) | 1003 ms | 1392 ms | 1500 ms | ✅ |
| Reports: 60 dias (máximo permitido), as duas casas | 194 ms | 268 ms | 3000 ms | ✅ |
| Reports: compras (1 ano) | 2 ms | 3 ms | 1500 ms | ✅ |
| Handover: busca por texto (60 dias, de 60 mil notas) | 2 ms | 3 ms | 2500 ms | ✅ |
| Handover: um dia | 1 ms | 1 ms | 1500 ms | ✅ |
| Audit: busca recente (limite 100) | 2 ms | 2 ms | 1500 ms | ✅ |
| Mapa de camas (bed_occupancy) | 41 ms | 43 ms | 1500 ms | ✅ |
| Folha do dia (seen_for_day) | 587 ms | 619 ms | 1500 ms | ✅ |
| Ex-moradores por PASS ID (5 mil históricos) | 4 ms | 5 ms | 1500 ms | ✅ |
| Lista de residentes (join com estadias) | 587 ms | 790 ms | 2500 ms | ✅ |
| Contadores de pendências (pending_counts) | 199 ms | 237 ms | 1500 ms | ✅ |
| Notificações (my_notifications) | 1 ms | 2 ms | 1500 ms | ✅ |

## Todos os critérios
- ✅ Admitir moradores em todas as camas livres pelo fluxo real: 81/81
- ✅ Tempo: Home do Admin (home_dashboard, 30 dias): p50 1003 ms · p95 1392 ms (limite 1500 ms)
- ✅ Tempo: Reports: 60 dias (máximo permitido), as duas casas: p50 194 ms · p95 268 ms (limite 3000 ms)
- ✅ Reports: período de 1 ano é recusado com mensagem clara (limite de projeto): 
- ✅ Tempo: Reports: compras (1 ano): p50 2 ms · p95 3 ms (limite 1500 ms)
- ✅ Tempo: Handover: busca por texto (60 dias, de 60 mil notas): p50 2 ms · p95 3 ms (limite 2500 ms)
- ✅ Tempo: Handover: um dia: p50 1 ms · p95 1 ms (limite 1500 ms)
- ✅ Tempo: Audit: busca recente (limite 100): p50 2 ms · p95 2 ms (limite 1500 ms)
- ✅ Tempo: Mapa de camas (bed_occupancy): p50 41 ms · p95 43 ms (limite 1500 ms)
- ✅ Tempo: Folha do dia (seen_for_day): p50 587 ms · p95 619 ms (limite 1500 ms)
- ✅ Tempo: Ex-moradores por PASS ID (5 mil históricos): p50 4 ms · p95 5 ms (limite 1500 ms)
- ✅ Tempo: Lista de residentes (join com estadias): p50 587 ms · p95 790 ms (limite 2500 ms)
- ✅ Tempo: Contadores de pendências (pending_counts): p50 199 ms · p95 237 ms (limite 1500 ms)
- ✅ Tempo: Notificações (my_notifications): p50 1 ms · p95 2 ms (limite 1500 ms)
- ✅ Concorrência: 25 admissões na mesma cama → exatamente 1 vence: 1 sucesso(s)
- ✅ Concorrência: mesmo PASS ID em 20 camas → exatamente 1 vence: 1 sucesso(s)
- ✅ Concorrência: 300 notas de Handover ao mesmo tempo, sem perda: 300/300 ok · +300 linhas
- ✅ Concorrência: 40 cliques na mesma marcação do Room Check → 1 só registro: 1 registro(s), 5 recusa(s)
- ✅ Concorrência: 100 temperaturas + 100 entregas ao mesmo tempo: 200/200 ok
- ✅ Concorrência: mesma entrega ligada a 2 pedidos ao mesmo tempo → 1 vínculo: 1 sucesso(s)
- ✅ Carga: 60 leituras pesadas simultâneas (Home + busca): 8.2 s no total
- ✅ Integridade: nenhuma cama com 2 residentes: 0
- ✅ Integridade: nenhum morador em 2 camas: 0
- ✅ Integridade: nenhum PASS ID duplicado: 0
- ✅ Integridade: nenhuma marcação duplicada: 0
- ✅ Auditoria registrou as operações do estresse: 1023 linhas no audit_log
