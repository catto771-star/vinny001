# Análise de código — notificacoes-e-push

> Escala: 🟢 confirmado | 🟡 inferido | 🔴 lacuna. Valores de segredos/chaves não foram lidos nem citados (apenas nomes de variáveis).

## Propósito
Avisos para a gestão (central in-app) e push Web (PWA) para Admins. Marcar como lida não resolve o item de origem. 🟢 (`src/pages/Notifications.tsx:9`)

## Arquitetura (fim a fim)
1. Uma RPC de negócio faz `insert into public.notifications (kind, audience, lodge_id, [resident_id], payload)` — 16 pontos de inserção em migrations (ver data-dictionary) 🟢.
2. Trigger `notifications_push` (AFTER INSERT) chama `public.notify_push()` (`supabase/migrations/20261125000024_push_hook.sql:3-26`) 🟢.
3. `notify_push` só atua se existirem `net.http_post` e `vault.decrypted_secrets`; se `push_keys(kind,payload)` for vazio, sai; lê URL e segredo do Vault; faz `net.http_post` com corpo `{notification_id}` e cabeçalho `x-push-secret` (`:13-19`) 🟢. Qualquer exceção é engolida: "push nunca impede o registro" (`:21-22`) 🟢.
4. Edge Function `send-push` (`supabase/functions/send-push/index.ts:29-59`): valida `x-push-secret` contra env `PUSH_HOOK_SECRET` (403); exige `notification_id` (400); com service role carrega a notificação (404), chama RPC `push_recipients`, resolve nome curto da casa, monta mensagem (`message()`), busca assinaturas de `push_subscriptions` por `staff_id in ids`, envia via `web-push` com `TTL: 3600` e `tag: "n<id>"`; atualiza `last_used_at`; apaga assinatura em 404/410; devolve `{sent}` 🟢. Env usadas: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `PUSH_HOOK_SECRET` (nomes apenas).
5. Service worker `push` mostra a notificação (`title`, `body`, `tag`, ícone `/icon-192.png`, `data.url`, padrão `/notifications`) e `notificationclick` foca/navega janela existente ou abre nova (`public/sw.js:32-54`) 🟢.
6. Cliente (`src/lib/push.ts`): `pushState()` → `unsupported|needs-install|denied|off|on` (`:17-27`); `enablePush()` pede permissão, registra `/sw.js`, assina com chave VAPID pública (`VITE_VAPID_PUBLIC_KEY`), grava via RPC `save_push_subscription` (`:30-41`); `disablePush()` chama `remove_push_subscription` e cancela a assinatura (`:43-49`); `urlBase64ToUint8Array` (`:6-10`); `isStandalone()` (`:13-15`) 🟢. iPhone/iPad fora do modo standalone ⇒ `needs-install` (`:21`).
7. Preferências por Admin em Settings (`src/pages/Settings.tsx:35-83, 122-137`): `my_push_prefs`, `set_push_pref`, botão ligar/desligar aparelho 🟢. Códigos de erro locais `push_not_configured`/`push_denied` tratados em `Settings.tsx:79` 🟢.

## Central de notificações (UI)
- `Notifications` (`Notifications.tsx:10-62`): carrega `my_notifications(p_limit=100)`; clique marca lida (otimista) e chama `mark_notification_read`; mostra texto via `notificationText` (`src/lib/services.ts:31-60`) 🟢. Falha de RPC não é tratada (erro ignorado; lista vazia) 🟡.
- Badge de não lidas: `Layout` chama `unread_notifications_count` ao mudar rota e a cada 60 s, somente para gestão (`Layout.tsx:205-212`); `badgeFor("/notifications")` devolve o contador (`src/lib/pending.ts:28-31`) 🟢.
- Rota `/notifications` é `managementOnly` no menu (`Layout.tsx:33`) 🟢.

## Regras de negócio
- **Visibilidade** (RPC `my_notifications` mais recente, `20261125000029_house_scope.sql:1552-1565`): ativo ∧ (audience='lodge' ∨ gestão) ∧ (lodge_id nulo ∨ `can_see_lodge`); ordem `created_at desc, id desc`; limite `clamp(coalesce(p_limit,50),1,200)` 🟢.
- **Contagem de não lidas**: mesma visibilidade + janela de 30 dias + sem registro em `notification_reads` (`:1567-1579`) 🟢.
- **Marcar lida**: insere em `notification_reads` com `on conflict do nothing`, só se visível por audience (não verifica `can_see_lodge`) (`20261120000010_services.sql:455-466`) 🟡.
- **Quem recebe push** (`push_recipients`, `20261125000023_handover_tags_push.sql:158-170`): staff ativo com papel `manager|owner|developer`, notificação com `audience='management'`, e ao menos uma chave de `push_keys` habilitada (pref explícita, senão `push_default`). Não filtra por casa (`can_see_lodge`) 🟡/🔴.
- **push_keys** (`:132-143`): `handover_tag`→`tag:<cada tag>`; `maintenance_opened`→`maintenance:<priority|normal>`; `warning_recorded`→`warning`; `shift_hours_review`; `fridge_out_of_range`; demais kinds ⇒ sem push.
- **push_default** (`:145-156`): `tag:*` → `handover_tags.notify_default` (falso se tag inexistente); `maintenance:urgent`, `warning`, `shift_hours_review`, `fridge_out_of_range` ⇒ verdadeiro; resto falso.
- **Assinatura**: apenas gestão; endpoint deve começar `https://`; `p256dh` e `auth` não vazios senão `invalid_subscription`; upsert por `endpoint` reatribuindo `staff_id`; `device` truncado em 80 (`:206-221`) 🟢. Remoção só do próprio staff (`:223-230`).
- **Mensagem do push** (`send-push/index.ts:12-27`): título `"<casa curta> · ..."`; URL de destino por kind (`/handover`, `/maintenance`, `/warnings`, `/hours`, `/fridge`; padrão `/notifications`). Rótulos em inglês fixos `TAG_LABEL` (`:7-10`) — duplicam códigos de tags de handover (que são editáveis em `handover_tags`) 🟡.
- **Divergência de cobertura**: kinds com texto in-app mas sem push: `no_show_monthly_limit`, `coverage_below_minimum`, `vacation_conflict`, `delivery_received`, `delivery_expiring` 🟢 (inferido de `push_keys`).

## Segurança 🟢
- `notifications`, `notification_reads`, `push_prefs`, `push_subscriptions` com RLS; `revoke all` de anon/authenticated; `grant select` em `notifications` e `select, insert` em `notification_reads` (`20261120000006_presence.sql:801-826`); `push_prefs`/`push_subscriptions` só via RPC (`20261125000023:46-48`).
- Funções internas (`notify_push`, `push_recipients`, `warning_notify`, `push_keys`, `push_default`) sem execute para `public/anon/authenticated`; `push_recipients` explicitamente revogada de `authenticated` (`:233-236`). As RPCs de usuário (`my_push_prefs`, `set_push_pref`, `save_push_subscription`, `remove_push_subscription`) liberadas a `authenticated` (`:237-239`).
- Edge function protegida por segredo compartilhado (comparação `!==` simples, sem tempo constante) 🟡.
- Contato VAPID fixo `mailto:noreply@example.com` (`index.ts:35`) 🟡 placeholder.

## Testes
- `src/lib/push.test.ts` existe (não analisado em detalhe) 🔴; `src/lib/serviceWorker.test.ts:15-18` cobre existência dos handlers push.

## Lacunas
Ver `_reversa_sdd/questions.md` (itens `[notificacoes-e-push]`).
