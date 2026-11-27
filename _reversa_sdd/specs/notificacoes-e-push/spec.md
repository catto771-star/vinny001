# Spec — notificacoes-e-push

> Redator Reversa · doc_level=completo · pt-br · 🟢/🟡/🔴. Fontes: `modules/notificacoes-e-push/*`, `integrations.md §4`, `findings-verification.md` (#8), ADR 0012. Nenhum segredo é citado; só nomes de variáveis.

## 1. Objetivo
Avisar a gestão por uma central in-app e por push Web (PWA). Marcar como lida não resolve o item de origem. 🟢

## 2. Atores
Admin (destinatário), RPCs de negócio e triggers (produtores), Edge `send-push`, serviço Web Push, Service Worker. 🟢

## 3. Requisitos funcionais
**RF-01 Produzir notificação.** RPCs inserem em `notifications(kind, audience, lodge_id, resident_id?, payload)` (16 pontos). Kinds com texto in-app: `handover_tag`, `maintenance_opened`, `warning_recorded`, `shift_hours_review`, `fridge_out_of_range`, `delivery_received`, `delivery_expiring`, `no_show_monthly_limit`, `coverage_below_minimum`, `vacation_conflict`. 🟢

**RF-02 Disparar push (`notify_push`).** Trigger AFTER INSERT; atua só se existirem `net.http_post` e `vault.decrypted_secrets`; sai se `push_keys(kind,payload)` vazio; lê URL e segredo do Vault; chama `send-push` com `{notification_id}` e `x-push-secret`; engole exceções (push nunca impede o registro). 🟢

**RF-03 Chaves e padrão de push.** `push_keys`: `handover_tag→tag:<code>`, `maintenance_opened→maintenance:<priority|normal>`, `warning_recorded→warning`, `shift_hours_review`, `fridge_out_of_range`; demais kinds sem push (`no_show_monthly_limit`, `coverage_below_minimum`, `vacation_conflict`, `delivery_*`). `push_default`: tags com `notify_default`; `maintenance:urgent`, `warning`, `shift_hours_review`, `fridge_out_of_range` ligados. 🟢

**RF-04 Destinatários (`push_recipients`).** Staff ativo `manager|owner|developer`, notificação `audience='management'`, ≥1 chave habilitada (pref explícita, senão padrão). Não filtra por casa. Veredito #8 REFUTADO como risco: `can_see_lodge` só restringe `station`, e nenhum Admin é filtrado; divergência com `my_notifications` é inócua hoje. 🟢

**RF-05 Edge `send-push`.** Valida `x-push-secret` (403), exige `notification_id` (400), carrega a notificação (404), resolve casa curta e URL por kind (`/handover`, `/maintenance`, `/warnings`, `/hours`, `/fridge`; padrão `/notifications`), envia via `web-push` (VAPID, TTL 3600, tag `n<id>`), atualiza `last_used_at`, apaga assinaturas 404/410, devolve `{sent}`. 🟢

**RF-06 Service Worker.** `push` mostra a notificação (título, corpo, tag, ícone 192, `data.url`); `notificationclick` foca/navega janela ou abre nova. 🟢

**RF-07 Cliente de push (`push.ts`).** `pushState()`: `unsupported|needs-install|denied|off|on`; `enablePush()` (permissão, SW, assinatura VAPID pública, `save_push_subscription`); `disablePush()`; iPhone/iPad fora do standalone ⇒ `needs-install`. 🟢

**RF-08 Assinaturas.** `save_push_subscription` (só gestão; endpoint `https://`; `p256dh` e `auth` não vazios → `invalid_subscription`; upsert por `endpoint` reatribuindo `staff_id`; `device` ≤80), `remove_push_subscription` (só do próprio staff). 🟢

**RF-09 Preferências.** `my_push_prefs` (tags + `warning`, `maintenance:{urgent,normal,low}`, `shift_hours_review`, `fridge_out_of_range`; só gestão), `set_push_pref` (upsert; sem validar a chave além do CHECK). 🟢

**RF-10 Central (`/notifications`).** `my_notifications(p_limit=100)`; marcar lida (otimista) com `mark_notification_read`; `unread_notifications_count` (30 dias) a cada 60 s e a cada mudança de rota; rota só gestão. 🟢 / 🟡 (falha de RPC ignorada).

## 4. Regras de negócio
RN-01 Visibilidade (`my_notifications`, M29): ativo ∧ (`audience='lodge'` ∨ gestão) ∧ (`lodge_id` nulo ∨ `can_see_lodge`); ordem `created_at desc, id desc`; limite 1–200 (padrão 50). 🟢
RN-02 Contagem de não lidas: mesma visibilidade + janela 30 dias + sem `notification_reads`. 🟢
RN-03 `mark_notification_read` insere com `on conflict do nothing` e não verifica `can_see_lodge`. 🟡
RN-04 `TAG_LABEL` do push duplica códigos de tags editáveis. 🟡
RN-05 Textos do push são em inglês fixos (fora do catálogo i18n). 🟢

## 5. Dados
`notifications`, `notification_reads`, `push_prefs` (PK `(staff_id,key)`), `push_subscriptions`, `handover_tags`; segredos de hook no Vault (`push_hook_url`, `push_hook_secret`) — apenas nomes. 🟢

## 6. Interfaces
RPCs: `my_notifications`, `unread_notifications_count`, `mark_notification_read`, `my_push_prefs`, `set_push_pref`, `save_push_subscription`, `remove_push_subscription`; internas: `notify_push`, `push_recipients`, `push_keys`, `push_default`. Edge `send-push` (env: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `PUSH_HOOK_SECRET`; front `VITE_VAPID_PUBLIC_KEY`). 🟢

## 7. Estados
Notificação: criada → push enviado / lida (`state-machines.md §15`). 🟡

## 8. Permissões
Funções internas sem EXECUTE para `public/anon/authenticated`; RPCs de usuário a `authenticated` mas exigindo gestão. Divergência anotada: `permissions.md` marca notificações como ✖ para `station`, enquanto `my_notifications` aceita `audience='lodge'` para quem vê a casa — **contradição 🟡** (nenhum produtor com `audience='lodge'` foi identificado). 🟡

## 9. Casos de borda
- EB-01 Comparação do segredo com `!==` (sem tempo constante). 🟡
- EB-02 Contato VAPID `mailto:noreply@example.com` é placeholder. 🟡
- EB-03 Sem retenção/limpeza de `notifications`. 🔴
- EB-04 Em ambientes sem `pg_net`/Vault (Postgres local de testes) o trigger é no-op. 🟢

## 10. Requisitos não funcionais
Push assíncrono, não bloqueante; TTL 3600 s; assinaturas inválidas limpas; RLS em todas as tabelas. 🟢

## 11. Contradições anotadas
- Veredito #8 prevalece sobre a dúvida "push_recipients sem filtro de casa".
- `permissions.md` (notificações ✖ station) × `my_notifications` (audience lodge): ver §8.

## 12. Lacunas 🔴
Cobertura de testes de `push.test.ts` não analisada; política de retenção; push para `delivery_*`.

## 13. Rastreabilidade
`src/pages/Notifications.tsx`, `src/lib/push.ts`, `src/lib/services.ts` (`notificationText`), `src/pages/Settings.tsx`, `src/components/Layout.tsx`, `public/sw.js`, `supabase/functions/send-push/index.ts`; SQL `M06, M10, M23, M24, M29`; testes `src/lib/push.test.ts`, `serviceWorker.test.ts`.
