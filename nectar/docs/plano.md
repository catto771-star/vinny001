# Plano de reconstrução

Mapa das funções do Néctar observadas em 18/11/2026 (navegando pelo app e lendo
o JavaScript que ele entrega ao navegador) e a situação de cada uma aqui.

O banco (`supabase/migrations`) já tem as tabelas de todos os módulos; as fases
seguintes acrescentam telas e regras.

## Fase 1: pronta

| Módulo | O que funciona |
|---|---|
| Conta | Cadastro, login e saída por e-mail e senha |
| Início | Saudação, resumo do dia (tarefas, hábitos, lembretes) e próximos lembretes |
| Tarefas | Hoje (contadores, atrasadas, de hoje, feitas hoje), lista completa com busca e filtro por tag, tarefas recorrentes que aparecem sozinhas nos dias escolhidos, análise dos últimos 7 dias e por prioridade |
| Hábitos | Rotina do dia com marcação ou valor, sequência, constância do mês, dias perfeitos, semana, calendário do mês por hábito; tipos feito/não feito, quantidade, duração e medição |
| Lembretes | Atrasados, hoje, semana e depois; lembretes recorrentes por dia da semana, gerados para os próximos 7 dias |
| Importador | Traz tarefas, tags, hábitos, lembretes, cadernos, medidas e histórico do chat exportados do Néctar |

## Fase 1b: Saúde (Treino e Dieta), pronta

| Parte | O que funciona |
|---|---|
| Diário de treino | Treinos com séries por exercício: tipo de série (Working, Feeder, Aquecimento, Top, Back-off, Drop e os que você cadastrar), carga, repetições, descanso e esforço (RPE). Catálogo de 70 exercícios mais os seus |
| Progressão | Só nas working sets, faixa de repetições por exercício com teto de 15: sobe a carga quando todas as séries batem o máximo, senão +1 repetição; sugere reduzir se ficou bem abaixo da faixa. A sugestão já preenche o treino novo |
| Recordes | Carga máxima, 1RM estimado (Epley) e maior volume por exercício; os recordes batidos aparecem em cada treino |
| Volume semanal | Séries, repetições e tonelagem por grupo muscular |
| Cardio | Tipo, distância, tempo, ritmo (min/km), calorias registradas ou estimadas e média por minuto |
| Painel | Volume, frequência, densidade (kg/min) e intensidade (% do 1RM e esforço médio) por semana |
| Diário alimentar | Refeições do dia com busca na TACO, na CoFID e em produtos de marca (Open Food Facts) do Brasil, Irlanda e Reino Unido; alimentos próprios; foto do prato |
| Metas | Metas de dia de treino e de descanso; o dia é de treino automaticamente quando há treino ou cardio, ou à mão; ajuste de macros para um dia específico |
| Treino e dieta juntos | Modo "ajustada pelo treino": meta de descanso mais as calorias gastas no dia, em carboidrato. Tendência de peso, ritmo semanal e manutenção estimada pelo consumo médio |
| Plano e compras | Refeições do plano com alimentos e quantidades; lista de compras para N dias |

## Fase 1c: Saúde completa, pronta

| Parte | O que funciona |
|---|---|
| Ficha de treino | Divisões (A, AB, ABC…) com dias da semana ou rodízio; exercícios com séries, repetições alvo, carga, descanso e observação; treino do dia e registro já preenchido a partir da ficha; criar exercício na hora |
| Diário alimentar | Editar quantidade e refeição de cada item, copiar refeição ou dia, recentes e frequentes, metas em gramas ou % e por dia da semana |
| Avaliação corporal | Peso, gordura, 10 circunferências, fotos de frente, lado e costas, comparação com a anterior e gordura pelo método da Marinha americana |

## Fase 2: Finanças, pronta

| Parte | O que funciona |
|---|---|
| Resumo | Sai, entra, sobra e patrimônio do mês; dia a dia; para onde foi; a pagar no mês; saldos de contas e cartões |
| Lançamentos | Extrato do mês com busca e filtro; entradas e saídas por Pix, débito, crédito, dinheiro, boleto ou transferência |
| Recorrentes | Assinaturas e contas fixas que aparecem todo mês; pagar (lançamento já preenchido) ou pular |
| Parceladas | Compra em N vezes com cada parcela na fatura certa, centavos na 1ª; antecipar o restante |
| Contas e cartões | Saldos por conta, transferências, limite usado, faturas abertas e fechadas, pagamento de fatura por uma conta |
| Análise | 3, 6 ou 12 meses: taxa de sobra média, sobra mês a mês, fluxo e categorias com média mensal |

## Fase 3a: Calendário de Tarefas e Agenda, prontos

| Parte | O que funciona |
|---|---|
| Calendário de Tarefas | Grade do mês com as tarefas no dia em que vencem e as recorrentes projetadas; lista do dia selecionado; nova tarefa no dia; arrastar para remarcar mantendo o horário |
| Agenda | Dia, semana e mês juntando compromissos, tarefas, lembretes, hábitos, treinos da ficha e contas (recorrentes, pendentes e faturas); filtros por tipo; concluir tarefas e lembretes; compromissos com horário, local e observações |

## Fase 3b: Hábitos completos, prontos

| Parte | O que funciona |
|---|---|
| Hoje | Placar do mês, semana navegável (marcar dias passados), rotina agrupada em Manhã, Tarde, Noite e Qualquer hora, botões −/+ e barra de progresso para quantidade e duração, valor para medição, "Em risco hoje" para sequências que zeram, hábitos fora da rotina do dia |
| Frequência | Dias fixos da semana ou N vezes por semana (sequência contada em semanas); cada hábito conta a partir de quando foi criado ou do primeiro registro |
| Hábitos | Lista na ordem que você escolhe (subir e descer), constância do mês e sequência; arquivados com restaurar |
| Detalhe | Sequência atual e recorde, % dos últimos 30 dias, total, mapa de 6 meses, gráfico dos valores e observações por registro |
| Calendário | Mês com feitos por dia e dias perfeitos; registrar qualquer dia passado |
| Análise | Dias perfeitos por semana, desempenho por dia da semana (com o dia mais fraco) e constância por hábito com recorde |

## Fase 4: Projetos, Metas, Conhecimento e Piloto automático, prontos

| Parte | O que funciona |
|---|---|
| Projetos | Lista com progresso e situação (no ritmo, em risco, atrasado) contra o tempo até o prazo; quadro kanban com arrastar; marcos ordenáveis com data; trajetória com linha do tempo; análise; modelos que recalculam as datas pelo novo início. As tarefas do projeto aparecem em Tarefas e na Agenda |
| Metas | Pessoais (somam registros ou seguem o último valor, inclusive para baixo, como peso), financeiras (aportes ou saldo de uma conta), de hábito (vezes feitas) e de projeto (progresso); ritmo, quanto falta por semana, previsão de chegada e evolução |
| Conhecimento | Notas em blocos no formato do Néctar (títulos, listas, checklist, citação, código, negrito e itálico), áreas, busca sem acento, fixadas e favoritas, conexões por [[Título]] e mapa; diário com humor; captura rápida que vira nota ou tarefa |
| Piloto automático | Automações que rodam no servidor (pg_cron, a cada 5 minutos, com o app fechado) nos dias e horários escolhidos: criar tarefa, criar lembrete, resumo do dia e pedido à IA (este espera o assistente); histórico de execuções |

## Fase 5: Assistente, pronto

| Parte | O que funciona |
|---|---|
| Chat | IA pelo OpenRouter (DeepSeek com crédito; sem crédito, modelos gratuitos que aceitam ferramentas, escolhidos do catálogo da OpenRouter). Consulta e altera os dados: tarefas, lembretes, hábitos, gastos e receitas, resumo do mês, notas, metas e projetos. A chave fica nos secrets do Supabase |
| Piloto automático | Os pedidos à IA rodam no horário pelo próprio servidor (cron → banco → função, com segredo guardado no Vault) ou em "Rodar agora"; a resposta aparece no Assistente e no histórico |
| Segurança | Toda consulta das ferramentas é limitada ao dono, testada uma a uma, para valer também quando a função roda como administrador |

## Fase 6: Notificações e app instalável, prontos

| Parte | O que funciona |
|---|---|
| App instalável | Manifesto e service worker; botão "Instalar o app" em Configurações (Chrome/Edge no Android e no computador) e o passo a passo no iPhone |
| Notificações | Push do navegador por aparelho, mesmo com o app fechado: lembretes (na hora e com antecedência), tarefas com horário, resumo do dia (tarefas, atrasadas, hábitos e contas) e respostas do Piloto automático; preferências e "Enviar teste" em Configurações |
| Servidor | Função notify a cada 5 minutos (cron → banco → função), mensagens cifradas no padrão Web Push, nenhuma notificação repetida (registro por chave) e aparelhos desinstalados removidos sozinhos |

## Ajustes pedidos depois da fase 6, prontos

| Parte | O que funciona |
|---|---|
| Avaliação corporal | Página própria com dados, medidas, as três fotos (enviadas ao salvar, com a pose anterior como guia) e observações; edição; comparação com qualquer avaliação, lado a lado ou sobrepostas |
| Moedas | Lançamentos em real, dólar ou euro com a cotação do dia (PTAX do Banco Central, editável); "Ver em R$ / US$ / €" converte as finanças pela cotação de hoje |
| Configurações | Seções Conta (nome, senha, sair de todos os aparelhos), Preferências (tema, tela inicial, fuso, moeda), Saúde, Notificações, Conectores (status da IA, cotações, alimentos, Google Agenda), App no aparelho e Dados e privacidade (exportar tudo em JSON, apagar a conversa) |

## Próximas fases

| Fase | Módulo | O que falta |
|---|---|---|
| 7 | Google Agenda | Sincronizar os compromissos com o Google Agenda (por último, a pedido) |
| 8 | Dados fictícios | Usuário de demonstração com dados realistas em todos os módulos e prints das telas (celular e computador) para o manual; apagado no fim |
| 9 | Manual | Guia curto e direto, com os prints: o que registrar e onde, para tirar o máximo do app |
| 10 | Seus dados | Testar com os dados de teste que você passar, refinar, apagar e inserir os seus dados reais |

Fora do escopo: assinatura e pagamento, plano família, comunidade e integrações
de marca do Néctar (Alexa, Strava), que dependem dos serviços deles.
