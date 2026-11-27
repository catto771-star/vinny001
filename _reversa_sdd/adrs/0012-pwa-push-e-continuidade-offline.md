# ADR-0012: PWA para Admins com push via banco (pg_net) e folha de continuidade offline

- **Status:** aceito (retroativo, reconstruído do histórico Git e do código)
- **Data (commit):** 2026-11-25
- **Evidências:** 79e0bac, c2211f6, migrations 23 e 24, public/sw.js
- **Confiança:** 🟢

## Contexto
Admins precisam de alertas no iPhone; a recepção precisa de uma folha de chamada de incêndio quando a rede cai.

## Decisão
`notifications` + `push_keys/push_default/push_recipients` decidem quem recebe; gatilho no banco chama a edge function `send-push` (VAPID, segredos só no Supabase). Service worker com cache de shell; `Continuity.tsx` mantém snapshot local por casa.

## Consequências
O snapshot guarda dados pessoais em localStorage sem expiração (questions.md). `push_recipients` só considera papéis de gestão; kinds sem `push_keys` nunca geram push.
