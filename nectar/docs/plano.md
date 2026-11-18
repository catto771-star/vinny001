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

## Próximas fases

| Fase | Módulo | Funções do Néctar a reconstruir |
|---|---|---|
| 2 | Finanças | Resumo do mês (entra, sai, sobra, patrimônio), dia a dia, previsão; despesas variáveis; recorrentes (assinaturas, contas fixas) com pular e pagar; compras parceladas com antecipação; contas e cartões, faturas, transferências; análise por período e categoria |
| 3 | Projetos | Trajetória, quadro kanban, tarefas do projeto, marcos (etapas), análise, modelos de projeto |
| 3 | Metas | Metas ativas, concluídas e pausadas; ritmo, progresso e prazo; vínculo com hábitos, projetos e finanças |
| 4 | Conhecimento | Cadernos por área, editor de blocos, favoritos e fixados, conexões entre notas (mapa), diário com humor, captura rápida |
| 4 | Saúde (restante) | Medidas corporais além do peso, ficha de treino com sessões por dia da semana |
| 5 | Agenda | Visão do dia e do mês juntando tarefas, hábitos, finanças e eventos; sincronização com Google Agenda e Outlook |
| 5 | Assistente | Chat com IA que consulta e altera os módulos, briefing diário, automações agendadas (ex.: revisão semanal do dinheiro) |
| 6 | Notificações | Push, e-mail ou WhatsApp/Telegram para lembretes, tarefas e faturas |

Fora do escopo: assinatura e pagamento, plano família, comunidade e integrações
de marca do Néctar (Alexa, Strava), que dependem dos serviços deles.
