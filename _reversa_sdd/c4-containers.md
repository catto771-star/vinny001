# C4 Nível 2 — Containers

> 🟢 confirmado · 🟡 inferido · 🔴 lacuna

```mermaid
C4Container
    title DS Lodge — Containers
    Person(user, "Equipe e gestão", "Navegador / PWA")

    System_Boundary(vercel, "Vercel") {
        Container(spa, "SPA React", "React 18.3, Vite 5.4, React Router 6.28, TypeScript", "Telas por papel, i18n, relógio do servidor, fila de continuidade")
        Container(sw, "Service Worker", "public/sw.js (shell-v1)", "Cache do shell, push, abre rota ao tocar")
    }

    System_Boundary(sb, "Supabase") {
        Container(auth, "Supabase Auth (GoTrue)", "JWT, signInWithOtp/verifyOtp", "Senha + código por e-mail; claim amr")
        ContainerDb(pg, "PostgreSQL 16", "53 tabelas, RLS, triggers, RPCs SECURITY DEFINER", "Regras de negócio, auditoria, dia operacional")
        Container(fn_admin, "Edge Function admin-users", "Deno + supabase-js 2.45.4", "Criar conta, resetar senha, (des)ativar; usa service role")
        Container(fn_push, "Edge Function send-push", "Deno + web-push 3.6.7", "Entrega push às assinaturas")
        ContainerDb(vault, "Vault + pg_net", "vault.decrypted_secrets", "URL e segredo do hook de push")
    }

    System_Ext(smtp, "SMTP / e-mail", "Código de login")
    System_Ext(wp, "Web Push services", "FCM / APNs / Mozilla")

    Rel(user, spa, "HTTPS")
    Rel(spa, sw, "register('/sw.js')")
    Rel(spa, auth, "Login, OTP, updateUser", "HTTPS")
    Rel(spa, pg, "RPC e REST via PostgREST (~116 chamadas)", "HTTPS + JWT")
    Rel(spa, fn_admin, "functions.invoke('admin-users')", "HTTPS + JWT")
    Rel(fn_admin, auth, "admin API (service role)")
    Rel(fn_admin, pg, "insere em staff com o JWT do chamador")
    Rel(pg, vault, "notify_push lê segredos")
    Rel(pg, fn_push, "net.http_post com x-push-secret", "HTTPS")
    Rel(fn_push, pg, "push_recipients, push_subscriptions (service role)")
    Rel(fn_push, wp, "VAPID", "HTTPS")
    Rel(wp, sw, "evento push")
    Rel(auth, smtp, "Envia código")
```

| Container | Tecnologia | Responsabilidade | Confiança |
|---|---|---|---|
| SPA | React/Vite/TS, `@/` alias, Vitest | UI, estados de acesso (`AuthStage`), mapeamento de erros, i18n | 🟢 |
| Service Worker | JS puro | Cache `shell-v1` (rede primeiro para navegação; cache primeiro para assets); push | 🟢 |
| PostgreSQL | PL/pgSQL | Todas as regras (RPCs), RLS, auditoria, notificações | 🟢 |
| admin-users | Deno | Única operação com chave de serviço acionada pelo front | 🟢 |
| send-push | Deno | Disparada apenas pelo banco, protegida por `x-push-secret` | 🟢 |
| Realtime | — | **Não usado**: não há canais Realtime no front; atualização por consultas/relógios (🟡 polling de 60 s em `AuthProvider`) | 🟡 |

Dívida 🟡: ambas as Edge Functions usam `mailto:noreply@example.com` como assunto VAPID e `admin-users` tem CORS `*` (ver questions.md).
