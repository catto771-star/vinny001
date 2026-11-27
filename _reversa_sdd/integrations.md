# Integrações externas — DS Lodge

> Arquiteto Reversa · 🟢 confirmado · 🟡 inferido · 🔴 lacuna. Nenhum valor de segredo é citado; apenas nomes de variáveis.

## 1. Mapa

| Integração | Direção | Protocolo | Onde | Conf. |
|---|---|---|---|---|
| Supabase Auth (senha) | front → Auth | HTTPS/JWT | `Login.tsx` → `signInWithPassword`; `lib/supabase.ts` (`persistSession`, storageKey `dslodge.auth`) | 🟢 |
| Supabase Auth (código por e-mail, 2a etapa) | front → Auth → SMTP | HTTPS/SMTP | `EmailCode.tsx` (`signInWithOtp`, `verifyOtp type:email`), `mfa_email_challenges`, `mfa_satisfied()` | 🟢 |
| PostgREST (REST + RPC) | front → DB | HTTPS/JSON | ~116 chamadas `.rpc()/.from()/functions.invoke` em `src/` | 🟢 |
| Edge Function `admin-users` | front → função | HTTPS POST JSON | actions `create`, `reset_password`, `set_active`; CORS `*` | 🟢 |
| Edge Function `send-push` | DB (pg_net) → função | HTTPS POST + `x-push-secret` | `notify_push()` trigger em `notifications` | 🟢 |
| Web Push (VAPID) | função → serviços push → SW | HTTPS / Push API | `web-push@3.6.7`; `lib/push.ts`; `public/sw.js` | 🟢 |
| Vercel | build/host | HTTPS | `vercel.json` (rewrite SPA + cabeçalhos) | 🟢 |
| Supabase Management API | operador → API | HTTPS | `scripts/demo.mjs` (`/v1/projects/{ref}/database/query`) | 🟢 |
| Supabase Realtime | — | WebSocket | **não usado** (sem canais/`postgres_changes`) | 🟢 (ausência) |
| Tesco (links de produto) | só link | — | `shop_items.tesco_url` (CHECK `^https://`); sem chamada de API | 🟢 |

## 2. Supabase Auth
- Sem auto-cadastro e sem "esqueci a senha" (ver módulo acesso-e-autenticacao). Contas criadas só por `admin-users`.
- Claims usados: `amr` (métodos `password`, `otp`/`magiclink`) lidos em `email_code_session_at()`; `mfa_satisfied()` exige pedido `begin_email_verification()` feito com senha até 15 min antes do OTP.
- Limites: erro 429 mapeado a `auth.tooManyAttempts`; `too_many_code_requests` (RPC) a `auth.tooManyCodes`.
- Inatividade: parâmetro `security.session_idle_minutes` aplicado no cliente; checagem `is_active_staff()` a cada 60 s.
- Template do e-mail: `supabase/templates/sign-in-code.html` 🟢; configuração SMTP real fora do repositório 🔴 (ver pergunta no questions.md).

## 3. Edge Function `admin-users` 🟢
- Cria o `auth.users` com a chave de serviço (somente no servidor) e grava `staff` **com o JWT de quem chamou** — assim RLS e `audit_log` registram o autor real.
- Autoriza por papel de gestão + `mfa_satisfied`. Variáveis de ambiente lidas: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (nomes apenas).
- Sem limitação de taxa nem log de tentativas (🔴 questions.md).

## 4. Pipeline de push 🟢
```mermaid
sequenceDiagram
    participant RPC as RPC de negócio
    participant N as notifications (INSERT)
    participant T as trigger notify_push
    participant V as Vault
    participant F as Edge send-push
    participant P as Serviço Web Push
    participant S as Service Worker
    RPC->>N: insere kind + payload
    N->>T: AFTER INSERT
    T->>T: push_keys(kind,payload) vazio? sai
    T->>V: lê push_hook_url, push_hook_secret
    T->>F: net.http_post (x-push-secret)
    F->>F: push_recipients(notification_id) por push_prefs
    F->>P: sendNotification (VAPID, TTL 3600)
    P->>S: evento push
    S->>S: showNotification; clique abre data.url
```
- A trigger nunca bloqueia a gravação (`exception when others then return new`) e só atua onde `pg_net` e `vault` existem (Supabase, não o Postgres local de testes).
- Tipos com push (`push_keys`): `fridge_out_of_range`, `maintenance_opened`, `warning_recorded`, `handover_tag`, `shift_hours_review`. Outros (`delivery_received`, `delivery_expiring`) só aparecem em `notifications` (🔴 questions.md).
- Assinaturas inválidas (HTTP 404/410) são apagadas de `push_subscriptions`.
- Variáveis da função: `PUSH_HOOK_SECRET`, `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`. Front: `VITE_VAPID_PUBLIC_KEY` (chave pública, não é segredo).
- iPhone exige PWA instalado (`isStandalone()`); estados do cliente: `unsupported | needs-install | denied | off | on`.

## 5. Service Worker (`public/sw.js`) 🟢
- Cache `shell-v1`: instalação guarda `/`; `activate` apaga caches antigos.
- Navegação: rede primeiro, cai para `/` em cache offline (React Router resolve a rota).
- Assets (`/assets/`, fontes, ícones, `.js/.css/.png/.svg`): cache primeiro, atualização em segundo plano.
- Só mesma origem, só GET; chamadas ao Supabase nunca são cacheadas (outra origem).
- `push`: exibe notificação (`icon-192`); `notificationclick`: abre `data.url` (padrão `/notifications`).
- Registrado em `main.tsx` e novamente em `push.ts`.

## 6. SMTP / e-mail 🟡
Usado indiretamente pelo Supabase Auth para o código de 6 dígitos (e-mail de confirmação de gestão). O código do repositório não fala SMTP; a configuração (remetente, limites de envio) é do projeto Supabase. O app evita envio automático para economizar cota (comentário em `EmailCode.tsx`).

## 7. Vercel 🟢
Rewrite `/((?!assets/).*)` → `/index.html`; cabeçalhos `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: same-origin`. Sem CSP, sem HSTS explícito (Vercel aplica HTTPS) 🟡.
