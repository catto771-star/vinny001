# Settings — análise de negócio e roteiro

Critério: só vira configuração o que (1) muda de uma casa/ano para outro, (2) o Admin sabe decidir sozinho e (3) pode mudar sem quebrar
registros antigos. Regra que protege residentes ou contas, ou que a lei exige, fica fixa. Tudo que muda vale **daqui para frente**
(histórico por `valid_from`) e cada mudança aparece no Audit.

## Já existe
| Área | O que o Admin controla |
|---|---|
| Minha conta | Senha, nome de exibição, casa de abertura (por aparelho), tema |
| Notifications | O que cada Admin recebe no celular (por tag, manutenção, avisos, geladeira, horas) |
| Handover | **Novo:** criar, renomear, cor, ordem, esconder/restaurar e aviso padrão de cada tag (até 20) |
| System | Horários de Room Check e rondas, janela de tolerância, geladeiras (faixa), prazos de manutenção, janela de correção, alerta de No Shows, tempo de sessão |
| Structure | Quartos, camas, geladeiras, máquinas, dados das casas |

## Próximos itens, em ordem de valor para o negócio
1. **Motivos de entrada tardia (Handover).** Hoje são 4 fixos. Valor: a auditoria pede motivos próprios (ex.: "Gardaí on site"). Risco: baixo, desde que motivo antigo
   nunca seja apagado (só escondido). Chave: tabela `handover_late_reasons` (code, label, visible). Teste: motivo escondido não aparece, anotação antiga mantém o rótulo.
2. **Horário de início do Dinner e do Seen Day/Night.** Hoje 18h–22h e 07h/19h no código. Valor: casa nova ou horário de inverno. Risco: **alto** (relatórios e
   No Shows dependem do dia operacional). Só com `valid_from` e com bloqueio de mudar no meio de um dia aberto.
3. **Cobertura mínima do Roster (Office por casa e Float).** O parâmetro já existe e é semeado, mas a tela de buracos usa regra fixa. Valor: alerta de falta de cobertura
   confiável. Risco: médio. Teste: baixar o mínimo para 0 some o alerta daquele turno.
4. **Padrões de turno ao criar no Roster** (07–19, 19–07, Float 12–24, Cleaner 09–13). Hoje fixos no código; poupa digitação por semana. Risco: baixo.
5. **Locais de manutenção sugeridos** (lista de "Where": Room 1, Kitchen, Corridor…). Valor: relatórios por local. Risco: baixo (texto livre continua valendo).
6. **Categorias de compra (Purchases) e preço máximo por item** com alerta. Valor: controle de custo para o chefe. Risco: baixo.
7. **Retenção e exportação.** Exportar CSV (Hours e Audit já têm); acrescentar residentes e relatórios mensais. Retenção (apagar após N anos) **só com decisão jurídica**.
8. **Resumo diário por e-mail para o Manager** (depende de provedor de e-mail/SMTP; hoje inexistente).

## O que NÃO virar configuração
- Verificação em duas etapas e tamanho mínimo da senha (segurança); quem pode ver o quê entre casas (isolamento); tipos de Warning e a regra do Final Warning
  (regra de negócio e jurídica); numeração de camas e a regra "uma estadia por cama"; qualquer coisa que reescreva registros do passado.

## Primeiro lote entregue agora
- Tags do Handover: criar, renomear, cor, ordem e aviso padrão (`add_handover_tag`, `update_handover_tag`, `move_handover_tag`).
- Hours por período (Day, Week, Fortnight, Month) com exportação CSV.
