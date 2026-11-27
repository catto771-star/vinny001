# acesso-e-autenticacao — Fluxogramas

Fontes: `src/auth/AuthProvider.tsx`, `src/pages/{Login,EmailCode,ChangePassword}.tsx`, `supabase/functions/admin-users/index.ts`, `20261120000005_email_code_second_step.sql`, `20261125000029_house_scope.sql`. Confiança 🟢 salvo indicação.

## 1. Estágios de acesso (`AuthProvider.load`, `:67-123`)

```mermaid
flowchart TD
  A[load session] --> B{sessão?}
  B -- não --> SO[signed_out → Login]
  B -- sim --> C[SELECT staff WHERE user_id]
  C --> D{linha existe?<br/>RLS exige ativo}
  D -- não/erro --> NS[not_staff]
  D -- sim --> E{must_change_password?}
  E -- sim --> CP[change_password → ChangePassword]
  E -- não --> F{papel é gestão?}
  F -- sim --> G[rpc mfa_satisfied]
  G -- != true --> EC[email_code → EmailCode]
  G -- true --> H
  F -- não --> H[lodges + param idle + server_now + my_open_post]
  H --> R[ready → Gate por papel]
  R --> P{station e PWA instalado?}
  P -- sim --> X1[adminAppOnly]
  P -- não --> Q{porter/cleaner?}
  Q -- sim --> X2[useHouseAccount]
  Q -- não --> APP[Rotas; gestão vê rota/purchases/hours/reports/users/audit]
```

## 2. Segunda etapa por e-mail (sequência)

```mermaid
sequenceDiagram
  participant U as Usuário gestão
  participant FE as EmailCode.tsx
  participant DB as Postgres (RPC)
  participant AU as Supabase Auth
  U->>AU: signInWithPassword (amr=password)
  FE->>DB: begin_email_verification()
  DB-->>DB: exige amr password; <5 pedidos/15min; INSERT mfa_email_challenges
  FE->>AU: signInWithOtp(email, shouldCreateUser=false)
  AU-->>U: e-mail com código
  U->>FE: digita código (>=6)
  FE->>AU: verifyOtp(type=email)
  AU-->>FE: nova sessão (amr inclui otp)
  FE->>DB: (AuthProvider) mfa_satisfied()
  DB-->>DB: desafio.created_at em [otp-15min, otp+1min]?
  DB-->>FE: true → ready
```

## 3. Primeira senha

```mermaid
flowchart LR
  A[Admin cria conta<br/>Users.tsx:288 gera senha temporária] --> B[edge admin-users create]
  B --> C[auth.admin.createUser + INSERT staff com JWT do Admin<br/>must_change_password=true]
  C --> D[1º login]
  D --> E[ChangePassword: iguais? passwordAcceptable?]
  E -- ok --> F[auth.updateUser password]
  F --> G[rpc mark_password_changed]
  G --> H[refresh → próximo estágio]
  F -- erro 'same' --> E
```

## 4. Edge function admin-users

```mermaid
flowchart TD
  S[POST] --> M{método POST?}
  M -- não --> E405[405]
  M -- sim --> R[caller.rpc is_management]
  R -- != true --> E403[403 not_authorised]
  R -- true --> BD{body JSON válido?}
  BD -- não --> E400a[400 invalid_body]
  BD -- sim --> ACT{action}
  ACT -- create --> C1[valida nome, papel; station exige home_lodge]
  C1 --> C2{papel com login?<br/>station/manager/owner}
  C2 -- sim --> C3[email + senha forte → admin.createUser]
  C2 -- não --> C4
  C3 --> C4[caller INSERT staff]
  C4 -- erro --> C5[deleteUser compensa → 400]
  C4 -- ok --> OK1[200 staff_id]
  ACT -- reset_password --> P1[SELECT alvo via caller]
  P1 --> P2[UPDATE must_change_password=true via caller<br/>RLS protege developer]
  P2 -- 0 linhas --> E403
  P2 --> P3[admin.updateUserById password] --> OK2[200 ok]
  ACT -- set_active --> A1[UPDATE staff.active via caller]
  A1 -- 0 linhas --> E403
  A1 --> A2[admin.updateUserById ban 876000h ou none] --> OK2
  ACT -- outro --> E400b[400 unknown_action]
```

## 5. Posto (assume_post)

```mermaid
flowchart TD
  A[assume_post fn, lodge, confirm] --> B{can_see_lodge e staff ativo?}
  B -- não --> X[42501 not_authorised]
  B -- sim --> C{fn=office → role=porter?<br/>fn=float → porter|manager?}
  C -- não --> X2[role_cannot_take_*]
  C -- sim --> D[advisory lock duty_posts]
  D --> E{ocupante outro no posto?}
  E -- sim, sem confirm --> OC[retorna occupied]
  E -- sim, confirm --> TK[encerra ocupante: taken_over]
  E -- não --> F
  TK --> F{eu já tenho posto?}
  F -- igual --> AL[already_on_post]
  F -- diferente --> SW[encerra: switched] --> INS
  F -- nenhum --> INS[INSERT duty_posts] --> OK[assumed]
```

## 6. Inatividade e desativação (cliente)

```mermaid
flowchart LR
  ev[mousedown/keydown/touchstart/wheel] --> rst[reinicia timer idleMinutes]
  rst -->|expira| so[signOut + aviso idleSignedOut]
  tick[a cada 60 s em ready] --> chk[rpc is_active_staff]
  chk -- false --> so2[signOut + accountInactive]
  chk -- true/erro --> tick
```

## 7. Leitura sensível auditada

```mermaid
flowchart LR
  P[ResidentProfile.tsx:66] --> R[rpc open_resident_profile]
  R --> A{is_active_staff?}
  A -- não --> X[42501]
  A -- sim --> J[monta jsonb resident+stays]
  J --> N{encontrado?}
  N -- não --> NF[P0002 resident_not_found]
  N -- sim --> L[INSERT access_log] --> RET[retorna perfil]
  G[Gestão] --> SAL[search_access_log, só is_management, janela ≤366d, limite ≤500]
```
