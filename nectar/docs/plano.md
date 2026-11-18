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

## Próximas fases

| Fase | Módulo | Funções do Néctar a reconstruir |
|---|---|---|
| 2 | Finanças | Resumo do mês (entra, sai, sobra, patrimônio), dia a dia, previsão; despesas variáveis; recorrentes (assinaturas, contas fixas) com pular e pagar; compras parceladas com antecipação; contas e cartões, faturas, transferências; análise por período e categoria |
| 3 | Projetos | Trajetória, quadro kanban, tarefas do projeto, marcos (etapas), análise, modelos de projeto |
| 3 | Metas | Metas ativas, concluídas e pausadas; ritmo, progresso e prazo; vínculo com hábitos, projetos e finanças |
| 4 | Conhecimento | Cadernos por área, editor de blocos, favoritos e fixados, conexões entre notas (mapa), diário com humor, captura rápida |
| 4 | Saúde | Medidas corporais, plano de treino com sessões, plano de dieta |
| 5 | Agenda | Visão do dia e do mês juntando tarefas, hábitos, finanças e eventos; sincronização com Google Agenda e Outlook |
| 5 | Assistente | Chat com IA que consulta e altera os módulos, briefing diário, automações agendadas (ex.: revisão semanal do dinheiro) |
| 6 | Notificações | Push, e-mail ou WhatsApp/Telegram para lembretes, tarefas e faturas |

Fora do escopo: assinatura e pagamento, plano família, comunidade e integrações
de marca do Néctar (Alexa, Strava), que dependem dos serviços deles.
