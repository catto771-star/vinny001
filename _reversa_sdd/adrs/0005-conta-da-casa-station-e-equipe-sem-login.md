# ADR-0005: Conta da casa (`station`) compartilhada; Porter e Cleaner sem login; gestão chamada de 'Admin'

- **Status:** aceito (retroativo, reconstruído do histórico Git e do código)
- **Data (commit):** 2026-11-24
- **Evidências:** 190394a (Beta 3), migration 20261124000015_station_role.sql, edge function admin-users
- **Confiança:** 🟢

## Contexto
Na recepção, vários porteiros usam o mesmo computador. O Beta passou a ter um login institucional por casa e deixou a equipe operacional sem credenciais.

## Decisão
Papel `station` (novo valor do enum, em migration própria) com `home_lodge_id`; `admin-users` só cria login para `station`, `manager`, `owner`; `porter`/`cleaner` existem só como cadastro (Rota, Handover 'Filled in by', Hours). O `App.tsx` bloqueia porter/cleaner com mensagem 'use a conta da casa'. A pessoa real que trabalha é registrada pelo turno aberto (`handover_shifts.staff_id`) e `filled_by`.

## Consequências
A autoria técnica (`author_id`) é a conta da casa; a pessoa é inferida do turno. Efeitos: assinatura de tarefas pelo turno, edição/anulação por `author_id` serve a qualquer um da recepção (questions.md). `assume_post`/`duty_posts` virou caminho legado.
