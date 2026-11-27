# C4 Nível 1 — Contexto do sistema DS Lodge

> Arquiteto Reversa · 🟢 confirmado · 🟡 inferido · 🔴 lacuna

DS Lodge é um PWA operacional de abrigos ("Lodges") da DePaul/DS em Dublin: presença de moradores, passagem de turno, manutenção, serviços da casa, compras, escala e horas, com trilha de auditoria.

```mermaid
C4Context
    title DS Lodge — Contexto
    Person(station, "Station / Porter", "Equipe de turno no Lodge: rondas, passagem de turno, jantar, lavanderia, geladeira")
    Person(cleaner, "Cleaner", "Sem login; aparece só em Rota e Hours (registrado pela gestão)")
    Person(mgmt, "Manager / Owner / Developer", "Gestão: cadastros, escala, horas, compras, relatórios, auditoria (2a etapa por código de e-mail)")

    System(app, "DS Lodge (PWA)", "React 18 + Vite; regras de negócio em RPCs PostgreSQL; offline parcial")

    System_Ext(supa, "Supabase", "Auth, PostgreSQL 16 + RLS, Edge Functions, Vault, pg_net")
    System_Ext(vercel, "Vercel", "Hospedagem estática do front + cabeçalhos de segurança")
    System_Ext(smtp, "Provedor SMTP / e-mail do Supabase Auth", "Envia o código de 6 dígitos (template sign-in-code)")
    System_Ext(push, "Serviços Web Push (FCM/Apple/Mozilla)", "Entrega push VAPID aos aparelhos dos Admins")

    Rel(station, app, "Usa no tablet/celular da casa", "HTTPS")
    Rel(mgmt, app, "Usa no desktop/celular (PWA instalado)", "HTTPS")
    Rel(cleaner, mgmt, "Horários registrados por", "processo humano")
    Rel(app, supa, "supabase-js: Auth, RPC, REST", "HTTPS / JWT")
    Rel(vercel, app, "Serve HTML/JS/CSS/sw.js")
    Rel(supa, smtp, "Código de login", "SMTP")
    Rel(supa, push, "send-push via web-push", "HTTPS VAPID")
    Rel(push, mgmt, "Notificação no aparelho")
```

## Atores 🟢
| Ator | Papel no banco (`staff_role`) | Observação |
|---|---|---|
| Station | `station` | Vê só o Lodge de casa (`home_lodge_id`) |
| Porter | `porter` | Escopo de operação por posto (`duty_posts`) |
| Cleaner | `cleaner` | `user_id` nulo (CHECK em `staff`) |
| Manager/Owner | `manager`,`owner` | Gestão; exige `mfa_satisfied()` |
| Developer | `developer` | Mesmo conjunto de privilégios de gestão (`is_management`) |

## Sistemas externos 🟢/🟡
- Supabase (Auth, DB, Edge Functions, Vault): 🟢.
- Vercel: 🟢 (`vercel.json`); sem CI/CD no repositório (`ci_cd: []`) 🟢.
- SMTP: 🟡 — o SQL/front usam `signInWithOtp`; o provedor SMTP é configuração do projeto Supabase fora do repositório (apenas o template `supabase/templates/sign-in-code.html` está versionado).
- Web Push: 🟢 (`web-push@3.6.7`, VAPID).
