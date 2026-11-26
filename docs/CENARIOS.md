# Cenários de uso (base do manual)

Cada cenário é executado de ponta a ponta por um roteiro em `tests/e2e/` com dados de demonstração (`node scripts/demo.mjs seed`).
O resultado é conferido no banco, não só na tela. As capturas de tela dos roteiros ilustram o manual.

## Conta Admin (Manager ou Owner)
| # | Cenário | Resultado esperado | Roteiro |
|---|---|---|---|
| 1 | People: criar Staff (Porter ou Float) | Pessoa sem casa e sem login | admin-people-structure |
| 2 | People: criar Cleaner | Pessoa sem casa e sem login | admin-people-structure |
| 3 | People: criar Manager/Owner | Login criado e primeira senha mostrada uma vez | admin-people-structure |
| 4 | People: editar nome curto, desativar e reativar | Mudança gravada; some das listas de Author | admin-people-structure |
| 5 | Structure: criar quarto com N camas | Camas numeradas 1..N aparecem no mapa | admin-people-structure |
| 6 | Structure: + Bed e remover cama livre | Cama removida some do mapa; histórico fica | admin-people-structure |
| 7 | Structure: remover quarto ocupado | Recusado: "A resident is in this room. Move them first." | admin-people-structure |
| 8 | Structure: geladeira nova, renomear, remover e restaurar | Leituras antigas ficam; removida não recebe leitura | admin-people-structure |
| 9 | Structure: máquina de lavar nova e removida | Removida some da tela de Laundry | admin-people-structure |
| 10 | Structure: renomear casa, ligar/desligar Dinner e Laundry | Valem nas telas na hora | admin-people-structure |
| 11 | Residents: admitir em cama nova | Estadia ativa; cama aparece ocupada | admin-people-structure |
| 12 | Warnings: Final Warning e desativação com motivo | Só o Admin desativa; fica na auditoria | admin-operations |
| 13 | Maintenance: pedido urgente até resolvido | Prazo por prioridade; aviso de prazo não interrompe formulário aberto | admin-operations |
| 14 | Fridge: leitura fora da faixa | Alerta ao Manager e notificação | admin-people-structure |
| 15 | Handover: anotação com tag e colega (até 3) | Tag e colegas gravados; busca em vários dias acha | admin-operations |
| 16 | Settings: janela do Room Check 45 → 60 | Parâmetro novo vale daqui para frente; histórico no Audit | admin-operations |
| 17 | Audit: filtro por módulo, pessoa, período e registro | Evento com antes → depois legível | admin-people-structure |
| 18 | Absences: registrar e registrar o retorno | Cama protegida no período; retorno encerra | admin-operations |
| 19 | Residents: Out (decisão e efetivação) | Cama libera só quando o Admin efetiva | admin-operations |
| 20 | Roster, Purchases, Holidays, Reports | Telas carregam sem erro e sem texto quebrado | admin-operations |

## Conta de casa (Staff)
| # | Cenário | Resultado esperado | Roteiro |
|---|---|---|---|
| 21 | Menu e URLs de Admin | Sem interruptor de casas; /structure e /audit voltam para a Home | station |
| 22 | Handover: abrir turno Office com a pessoa do Roster | Turno aberto | station |
| 23 | Handover: anotação com Author, tag e colega | Author gravado; colega gravado | station |
| 24 | Handover: encerrar passando para outra pessoa | Novo turno abre na hora | station |
| 25 | Seen, Dinner (Took the meal), Fridge, Maintenance | Cada registro aparece no banco | station |
| 26 | Isolamento | A conta de Amiens não vê dados de Connolly | station |
| 27 | Laundry (Connolly): iniciar e finalizar | Máquina volta a ficar livre | station |

## Bugs achados nesta rodada (com teste)
1. O aviso "Deadline passed" abria por cima de outro formulário (`MaintenanceReminder.test.tsx`).
2. Cama ativa dentro de quarto removido ainda aceitava residente (`tests/db/scenarios-structure.test.ts`).
3. `demo.clear()` falhava com turnos do Handover ligados ao Roster (`tests/db/demo.test.ts`).
4. Rótulo do perfil no topo estourava a largura; descrição longa do pedido de manutenção vazava do cartão.

## Revisão 15
| # | Cenário | Resultado esperado | Onde |
|---|---|---|---|
| 1 | Admitir com PASS ID de ex-residente | Aviso e pergunta para puxar o cadastro; nova estadia no mesmo residente | AdmitDialog, tests/db/r15.test.ts |
| 2 | Admitir com PASS ID de quem ainda é residente | Aviso e botão desabilitado | AdmitDialog |
| 3 | New Delivery com Ripley's sem Batch code | Botão desabilitado; DB recusa com `batch_required` | Deliveries, r15.test.ts |
| 4 | Recebimento do Tesco por quem está On Duty | Alerta para o Admin; Admin vincula ao pedido; pedido vira Delivered e o Handover recebe a nota | Purchases, r15.test.ts |
| 5 | Best before dentro do parâmetro | Alerta `delivery_expiring` para o Admin | r15.test.ts |
| 6 | Qualquer tela, qualquer largura | Nenhum texto fora da caixa | tests/e2e/text-overflow.e2e.cjs |
