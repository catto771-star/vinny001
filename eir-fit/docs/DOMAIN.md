# Lógica do acompanhamento — regras confirmadas

O aluno é o titular do acompanhamento. Treinos, dietas, refeições, avaliações, prescrições e execuções mantêm vínculo com sua ficha. O profissional é o autor e responsável pela prescrição. Cada profissional consulta apenas o próprio acompanhamento; não recebe acesso ao conteúdo de outro profissional vinculado ao mesmo aluno.

## Planejamento

- **Treino:** conjunto prescrito de exercícios, séries, repetições e cargas; tem dias da semana e estado ativo/inativo. O aluno pode ter vários treinos ativos, inclusive no mesmo dia.
- **Dieta:** contém refeições com horários e alimentos/quantidades. Tem dias da semana e estado ativo/inativo. Várias dietas podem estar ativas se seus dias não coincidirem. No máximo uma dieta ativa por dia para o mesmo aluno.
- A exclusividade da dieta é verificada na API, inclusive entre acompanhamentos distintos da mesma conta/e-mail. Em caso de conflito, o outro profissional recebe apenas o aviso de indisponibilidade; nomes, alimentos e conteúdo não são revelados.
- **Prescrição:** pertence ao aluno, com autor, orientações, vigência e eventual suspensão.
- **Avaliação física:** o profissional registra medidas e observações para o aluno. Avaliações sucessivas são acrescentadas ao histórico, sem substituir as antigas. Registros pessoais de peso na tela Evolução são distintos da avaliação formal.

## Execução real

- **Sessão de treino:** execução de um treino pelo aluno, com início, séries e término. Um treino pode originar várias sessões, inclusive no mesmo dia. Cada série registra carga e repetições reais; o volume é calculado a partir dessas séries.
- Sessões abertas são retomadas, sem criar uma duplicata. O aluno pode corrigir as séries durante a sessão; depois de finalizada, não pode alterá-las. Finalizar novamente não duplica a conclusão. É necessário registrar ao menos uma série de cada exercício; a plataforma não inventa séries executadas a partir da prescrição.
- Inativar o treino impede iniciar uma nova sessão; sessões já iniciadas podem ser retomadas e concluídas. A agenda organiza a semana, mas uma execução de um treino ativo pode acontecer em outro dia: o registro recebe a data real.
- **Consumo de refeição:** o aluno ajusta apenas os gramas dos alimentos previstos. Não pode substituir os alimentos. A API recalcula calorias/macros com os dados nutricionais copiados da prescrição; totais enviados pelo navegador são ignorados.
- Só é possível registrar as refeições da dieta ativa do dia atual. Zero gramas declara que aquele alimento não foi consumido. A ausência de registro não é interpretada como consumo zero.
- O consumo guarda horário previsto, horário do registro original, quantidades, valores previstos e valores consumidos. Corrigir a quantidade no mesmo dia atualiza esse consumo, sem criar outra refeição consumida nem mudar o horário original. Há trilha de auditoria da ação.

## Históricos e análises

Inativar ou revisar um plano não apaga sessões, consumos, prescrições ou avaliações. Cada sessão guarda o treino usado naquele momento. Cada consumo guarda os alimentos e nutrientes daquela prescrição.

A análise de treino usa as séries efetivamente registradas pelo aluno, por exercício, grupo muscular e data. A análise de alimentação usa os consumos diários em calorias e macros e compara o previsto e o realizado nas refeições registradas. As metas prescritas são uma visualização separada, filtrada pela família da dieta para não misturar planos de dias diferentes.

Revisar uma dieta cria uma nova versão da mesma família e inativa apenas a versão anterior. Criar outra dieta é uma ação independente e exige dias livres se ela for ativa. Revisar uma versão histórica quando já existe uma versão mais recente é recusado.

## Dados anteriores

A atualização preserva registros anteriores e acrescenta tabelas de sessões, séries e consumos (versão do esquema 3). Refeições antigas sem dieta são agrupadas em uma dieta legada. Quando não há alimentos/gramas estruturados no dado antigo, a confirmação mantém os valores prescritos: o profissional deve revisar o plano para permitir ajuste de quantidades. Não são inventadas quantidades ou séries históricas.

Fuso de registro: America/Sao_Paulo. A interface oferece pré-visualização dos dias da semana. O controle por data passada/futura e reagendamento com confirmação não fazem parte desta etapa.
