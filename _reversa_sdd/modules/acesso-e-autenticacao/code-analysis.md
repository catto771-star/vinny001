# Módulo: acesso-e-autenticacao — Análise de código

> Arqueólogo Reversa · doc_level=completo · idioma pt-br
> Escala: 🟢 confirmado no código · 🟡 inferido · 🔴 lacuna (ver `_reversa_sdd/questions.md`)
> Convenção de caminhos: `M01` = `supabase/migrations/20261120000001_foundation.sql`, `M05` = `..._000005_email_code_second_step.sql`, `M16` = `20261124000016_beta_profiles.sql`, `M29` = `20261125000029_house_scope.sql`, `M31` = `20261125000031_audit_search.sql`, `M30/M32` = `..._system_settings / more_settings`. Definição vigente = a mais recente em ordem de nome de arquivo.

## 1. Escopo e arquivos

| Camada | Arquivo | Papel |
|---|---|---|
| Front | `src/auth/AuthProvider.tsx` (207 l.) | Máquina de estados de acesso, sessão, inatividade, desativação |
| Front | `src/pages/Login.tsx` (69), `EmailCode.tsx` (116), `ChangePassword.tsx` (58) | Telas de cada etapa |
| Front | `src/App.tsx:40-127` (`Gate`) | Roteamento por `stage` e por papel |
| Front | `src/lib/password.ts` (18), `src/lib/supabase.ts` (10), `src/lib/types.ts` (79), `src/lib/errors.ts` (113) | Política de senha, cliente, papéis, mapa de erros |
| Edge | `supabase/functions/admin-users/index.ts` (123) | Criar conta, resetar senha, (des)ativar |
| SQL | `M01`, `M05`, `M16`, `M29`, `M31`, `M30`, `M32`, `20261120000004_lock_privileges.sql`, `20261124000015_station_role.sql`, `20261125000033_people_roles.sql` | Papéis, RLS, MFA por e-mail, auditoria, parâmetros |
| Testes | `tests/db/email-code.test.ts`, `foundation.test.ts`, `house-scope.test.ts`, `people-roles.test.ts`, `audit-search.test.ts`, `system-settings.test.ts`; `src/pages/EmailCode.test.tsx`, `Users.test.tsx`, `Settings.account.test.tsx`, `src/lib/password.test.ts` | Cobertura |

## 2. Máquina de estados de acesso (front) 🟢

`AuthStage = loading | signed_out | not_staff | change_password | email_code | ready` (`AuthProvider.tsx:14-20`).

`load(session)` (`AuthProvider.tsx:67-123`) — algoritmo:
1. Incrementa `loadSeq` (token de "última requisição vence"; descarta respostas obsoletas em `:82`, `:101`, `:113`, `:119`) 🟢.
2. Sem sessão → `signed_out` (`:70-74`).
3. Lê `staff` por `user_id = session.user.id` com `.maybeSingle()` (`:77-81`). Erro ou linha ausente → `not_staff` (`:84-88`). Como RLS `staff_read` exige `is_active_staff()` (`M01:885`), um usuário desativado também cai aqui 🟢.
4. `must_change_password` → `change_password` (`:93-96`).
5. Se papel de gestão (`manager|owner|developer`, `types.ts:62-71`) → chama RPC `mfa_satisfied`; resultado ≠ `true` → `email_code` (`:99-106`). O front **não decide** MFA, só consulta o banco 🟢.
6. Carrega em paralelo lodges ativos, `param_value('security.session_idle_minutes')`, `server_now()` (`:108-112`); calcula `serverOffsetMs = serverNow - Date.now()` (`:117`) usado por relógios (B56); `refreshPost()` (`my_open_post`) e `ready` (`:118-120`).

Eventos: `getSession()` inicial (`:126-129`); `onAuthStateChange` recarrega apenas em `SIGNED_IN | SIGNED_OUT | USER_UPDATED` via `setTimeout(…,0)` para evitar deadlock do client Supabase (`:130-135`) 🟡 (motivo do `setTimeout` inferido; não comentado).

### Inatividade (`:140-155`)
Timer reiniciado em `mousedown|keydown|touchstart|wheel`; ao expirar chama `signOut(t("auth.idleSignedOut",{minutes}))`. Minutos vêm do parâmetro `security.session_idle_minutes` (padrão local 15, `:51`; seed `20261120000002_seed_structure.sql:59`; faixa admitida 5–240 em `M32:52-54`) 🟢. A inatividade é **só no cliente**; não há expiração no servidor além do JWT 🟡 (ver questions).

### Desativação em tempo real (`:158-166`)
A cada 60 s, `rpc("is_active_staff")`; `false` → `signOut(errors.accountInactive)`. Somente se `stage==="ready"` 🟢. Note: `data===false` — erro de rede (`data=null`) não desloga 🟢.

### Derivados (`:168-179`)
- `isManagement = isManagementRole(role)`; `isStation = role==="station"`.
- `lodges`: station só vê `home_lodge_id` (`:172-175`); demais veem todas.
- `canWriteLodge(id)`: `isManagement || (station && lodge visível) || (post && (post.function==="float" || post.lodge_id===id))` (`:176-179`). Espelha `can_write_lodge` do banco (M29:19-28) — o banco é a autoridade 🟢.

## 3. Telas

### Login (`Login.tsx:18-29`)
`signInWithPassword({email.trim(), password})`. Mapeia `status 429 → auth.tooManyAttempts`; `400 → auth.invalidCredentials`; outro → `errorKey`. Não existe auto-cadastro nem "esqueci a senha" 🟢 (conta só é criada pela gestão; `auth.personalAccountOnly`, `:48`).

### EmailCode (`EmailCode.tsx`)
- `maskEmail` (`:10-14`): primeira letra + `*` × `max(len-1, 3)` + domínio.
- `send()` (`:44-60`): 1) `rpc("begin_email_verification")` (registra o pedido na sessão com senha); erro `too_many_code_requests` → `auth.tooManyCodes`; 2) `signInWithOtp({email, shouldCreateUser:false})`; 429/"rate limit" → `tooManyCodes`; 3) `sent=true` e cooldown 60 s (`RESEND_SECONDS`, `:16`, `:34-42`).
- `verify()` (`:62-70`): `verifyOtp({email, token: code.trim(), type:"email"})`; erro → `auth.mfaInvalid`. Sucesso: a nova sessão (amr `otp`) dispara `SIGNED_IN` → `load()`.
- Botão verificar exige `code.trim().length >= 6` (`:93`); `maxLength=10` (`:85`) 🟢.
- Nunca envia código automaticamente (comentário `:22`; economiza limite de e-mails) 🟢.

### ChangePassword (`ChangePassword.tsx:18-33`)
Valida igualdade e `passwordAcceptable` → `auth.updateUser({password})` → `rpc("mark_password_changed")` → `refresh()`. Se `updateError.message` contém "same" mostra `passwordTooWeak` (heurística sobre texto do erro) 🟡.
**Observação**: se `updateUser` passa e `mark_password_changed` falha, a conta fica com senha nova mas `must_change_password=true` (sem transação entre as duas chamadas) 🟡.

### Gate (`App.tsx:40-127`)
- Offline + `/continuity` → `ContinuityOffline` mesmo sem sessão (`:45`).
- `station` + `isStandalone()` (PWA instalado) → mensagem `adminAppOnly` (`:74-81`): o app instalado é só para Admin 🟢.
- `porter|cleaner` com sessão → `useHouseAccount` (`:83-90`): defesa em profundidade; na prática porter/cleaner não têm login pela edge function (ver §5) 🟢.
- Rotas só-gestão: `rota, purchases, hours, reports, users, audit, structure→/settings?tab=registers` (`:114-121`). É controle de UX; a segurança real é RLS/RPC 🟢.

## 4. Política de senha 🟢

| Local | Regra |
|---|---|
| `password.ts:2-4` `passwordAcceptable` | ≥10 caracteres, ≥1 letra (inclui `À-ž`), ≥1 dígito |
| `admin-users/index.ts:31-33` `strongPassword` | ≥10, `[A-Za-z]`, `\d` (não aceita só letras acentuadas — divergência leve com o front) 🟡 |
| `password.ts:7-18` `generateTemporaryPassword` | 12 chars; 2 dígitos garantidos + resto de `letters+digits` (alfabeto sem `ilIoO01`); `random` injetável; embaralhamento Fisher-Yates; usa `crypto.getRandomValues(Uint32Array(1))[0] % n` (viés de módulo desprezível) |
| `staff.must_change_password` default `true` (`M01:104`) | Forçar troca no 1º acesso; reset pela gestão volta a marcar `true` (`admin-users:104-106`) |

## 5. Edge function `admin-users` 🟢

Entrada: `POST` JSON `{action}`; CORS `*` (`:7-11`). OPTIONS → ok; não-POST → 405 (`:36-37`).

Fluxo de autorização (`:44-48`): cria dois clients — `caller` (JWT do chamador, anon key) e `admin` (service role). Chama `caller.rpc("is_management")`; se erro ou `!== true` → **403 `not_authorised`**. Logo exige papel de gestão **e** `mfa_satisfied` (2ª etapa) 🟢.

Ações:
1. **create** (`:57-94`): valida `full_name`, `role ∈ {station,porter,cleaner,manager,owner}` (developer não pode ser criado; ver também `staff_insert` `M01:886-887`). `withLogin = role ∈ {station,manager,owner}` (porter/cleaner não têm login — regra Beta). `station` exige `home_lodge_id`. Com login: exige e-mail e `strongPassword`; `admin.auth.admin.createUser({email, password, email_confirm:true})`. Insere em `staff` **com o JWT do chamador** (RLS + auditoria registram o autor real; `:74-88`) com `must_change_password = withLogin`. Se o insert falha, **compensa** com `deleteUser(userId)` (`:89-92`) 🟢.
2. **reset_password** (`:100-110`): lê alvo via `caller` (RLS); sem `user_id` → 400 `no_login`; senha fraca → 400; **marca primeiro** `must_change_password=true` via `caller` (a RLS `staff_update` protege que só um Developer altere a conta Developer — `M01:888-890`); se `marked` vazio → 403; só depois `updateUserById(password)`. Não há rollback se `updateUserById` falhar após o mark (efeito: usuário forçado a trocar senha sem nova senha) 🟡.
3. **set_active** (`:112-119`): atualiza `staff.active` via `caller` (trigger `staff_on_deactivate` encerra posto, `M01:372-395`) e, se há `user_id`, `updateUserById(ban_duration: "none" | "876000h")` (≈100 anos) — bloqueia novos logins no Auth 🟢.
- Ação desconhecida → 400 `unknown_action` (`:122`); corpo inválido → 400 `invalid_body` (`:50-55`).
- Cliente: `Users.tsx:20-32` (`callAdmin`) lê `error.context.json().error` para a mensagem real; `Users.tsx:288` gera a senha temporária no navegador (`generateTemporaryPassword`) e a exibe para entrega pessoal 🟢.
- A senha temporária trafega do navegador do Admin para a edge function e é mostrada ao Admin; não há envio por e-mail 🟡.

## 5b. Papéis

`staff_role = porter | cleaner | manager | owner | developer` (`M01:16`) + `station` (`20261124000015_station_role.sql:3`, migração separada pois o valor do enum só é usável após commit).
- `staff` check `role <> 'cleaner' or user_id is null` (`M01:110`).
- Índice único `staff_single_developer` (apenas 1 Developer; `M01:113`).
- `staff_home_only_station` (`20261125000033_people_roles.sql:3`): `home_lodge_id` só para `station`; migração zera `home_lodge_id` dos demais.
- Gestão = `manager|owner|developer` (`M01:183-191`; `types.ts:62`).

## 6. Funções SQL de autorização (vigentes)

| Função | Def. vigente | Comportamento |
|---|---|---|
| `current_staff_id()` | `M01:151` | `staff.id` onde `user_id = auth.uid()` **e** `active` |
| `current_staff_role()` | `M01:161` | idem, retorna papel |
| `mfa_satisfied()` | `M05:52-69` (substitui `M01:173`) | `true` se papel não-gestão (ou nulo), **ou** `security.require_mfa_management=false`, **ou** existe `mfa_email_challenges` do usuário com `created_at` ∈ [`email_code_session_at()`−15 min, +1 min] |
| `email_code_session_at()` | `M05:42-50` | maior `timestamp` entre entradas do `amr` do JWT com `method ∈ {otp, magiclink}` |
| `begin_email_verification()` | `M05:71-98` | exige papel gestão (`not_required` p/ outros; `not_authorised` se sem papel), exige `amr` com `password` (`password_session_required`), limita **5 pedidos/15 min** (`too_many_code_requests`, errcode 54000) e insere desafio |
| `is_management()` | `M01:183` | papel gestão **e** `mfa_satisfied()` |
| `is_active_staff()` | `M01:193` | `current_staff_id() is not null` |
| `house_scope()` | `M29:5-9` | para `station`, `home_lodge_id`; senão null |
| `can_see_lodge(l)` | `M29:12-16` | `auth.uid() is null` (contexto interno) **ou** (ativo e (não-station ou `l = house_scope()`)) |
| `can_write_lodge(l)` | `M29:19-28` (substitui M01 e M16:8-22) | gestão; ou station na própria casa ativa; ou posto aberto (float em qualquer casa, office na casa) |
| `assume_post(fn, lodge, confirm)` | `M29:217-301` (base `M01:263-350`) | ver §7 |
| `end_my_post()` | `M01:352-368` | encerra posto aberto com `end_reason='ended'` |
| `staff_on_deactivate` (trigger) | `M01:372-395` | ao desativar grava `deactivated_at/by` e encerra posto (`deactivated`); ao reativar limpa |
| `set_my_locale`, `mark_password_changed`, `set_my_display_name` | `M01:398`, `M01:407`, `M32:151-165` | auto-serviço; nome ≤40 chars (`invalid_name`) |
| `staff_sync_locale` (trigger) | `M05:105-119` | copia `staff.locale` para `auth.users.raw_user_meta_data.locale` (idioma do e-mail do código; B54) |
| `server_now()` | `20261120000003_server_time.sql:3-5` | `clock_timestamp()`; grant a `anon` também |

### Segunda etapa por e-mail — algoritmo 🟢
1. Login com senha → JWT `amr=[password]`.
2. `begin_email_verification` insere `(user_id)` em `mfa_email_challenges` (limite 5/15 min).
3. `signInWithOtp` (Supabase envia o código); `verifyOtp` cria nova sessão com `amr` contendo `otp`.
4. `mfa_satisfied()` compara o `timestamp` do amr `otp` com o `created_at` do desafio: o desafio deve ter sido criado até 15 min **antes** (ou 1 min depois) do OTP. Impede que quem só tem o e-mail (sem senha) obtenha acesso de gestão.
5. Vigência: enquanto o JWT carregar o amr `otp` e existir o desafio na janela; sem expiração própria além da do JWT 🟡.
6. `param security.require_mfa_management=false` desliga (uso dev) (`M05:60`).

## 7. Postos (assume_post) 🟢
Regras (`M29:231-300`): `can_see_lodge(p_lodge)` (nota: `p_lodge` nulo para float → `house_scope` é nulo para não-station; para station a chamada com lodge nulo falha em `can_see_lodge`) 🟡; `office` só `porter`; `float` só `porter|manager`; office exige lodge ativo; float força `p_lodge=null`. Lock `pg_advisory_xact_lock(hashtext('duty_posts'))`. Ocupante diferente: sem `p_confirm_takeover` retorna `{status:'occupied', occupant_staff_id, occupant_name, since}`; com confirmação encerra o ocupante (`taken_over`). Se o próprio chamador já tem posto idêntico → `already_on_post`; diferente → encerra (`switched`). Insere novo → `{status:'assumed', post_id, since, took_over_staff_id}`.
Índices únicos garantem 1 posto/pessoa, 1 office/lodge, 1 float (`M01:219-221`).
No modelo Beta, `station` e `manager/owner` não precisam de posto para escrever (ver `can_write_lodge`); o posto subsiste para porter/float 🟡 (porter não tem login no Beta ⇒ `assume_post` pode ser legado; ver questions).

## 8. Auditoria e log de leitura 🟢
- `audit_row()` (`M01:722-747`): trigger `AFTER I/U/D` em lodges, rooms, beds, staff, parameters, duty_posts, residents, stays (`M01:762-769`) e (em migrações posteriores) outras; **ignora UPDATE que só altera `version`**; grava `actor_user_id=auth.uid()`, `actor_staff_id`, `old_data`, `new_data`, `record_id` (campo `id`). SECURITY DEFINER.
- `audit_immutable()` (`M01:749-760`): `BEFORE UPDATE OR DELETE` em `audit_log` e `access_log` → exceção `audit_log_is_immutable` (42501).
- `access_log` (`M01:772-785`): único ponto de escrita é `open_resident_profile` (`M01:788-833`), que retorna JSON (resident + stays) **e** insere a leitura. Exige `is_active_staff()`; residente inexistente → `resident_not_found` (P0002). Front: `ResidentProfile.tsx:64-66`. Nota: a visibilidade pela casa (RLS restritiva `house_scope` em residents) afeta o `select` dentro da função? A função é SECURITY DEFINER, portanto **ignora RLS**; o isolamento por casa para `station` **não** é aplicado dentro de `open_resident_profile` 🟡 (lacuna registrada).
- `search_audit` / `search_access_log` (`M31:6-76`): só gestão; janela padrão 30 dias, máximo 366 (`range_too_large`), `invalid_range`; `p_limit` clamp 1–500; busca textual `ILIKE` com escape de `\ % _`; paginação por `id < p_before`. Front: `src/pages/Audit.tsx`, `src/lib/audit.ts:diffRecord` (ignora `version,id,created_at`).
- Diferença: `search_audit` retorna `old_data/new_data` completos (inclui PII); acesso só gestão.

## 9. RLS e privilégios 🟢
- `20261120000004_lock_privileges.sql`: revoga tudo de `anon` e `authenticated` em tabelas/sequências; concede só `select` (lodges, rooms, beds, staff, parameters, duty_posts, residents, stays, audit_log, access_log, bed_occupancy), `insert/update` em lodges/rooms/beds/staff/residents, `insert` em parameters. `alter default privileges … revoke` em tabelas, sequências e funções; M05:136 revoga `EXECUTE` a PUBLIC. **Ninguém tem DELETE/TRUNCATE** (nada é apagado, s.9).
- Políticas M01:871-911 — ver data-dictionary.
- Políticas restritivas `house_scope` (select) em toda tabela com `lodge_id` + tabelas filhas (`M29:30-76`): isolam a casa da conta `station`.
- `bump_version()` (`M01:685-697`): bloqueio otimista; `stale_version` (40001) se `new.version ≠ old.version`, senão `version+1`. Mapeado a `errors.staleVersion` (`errors.ts:83`).
- Parâmetros: `set_system_parameter` (`M30:2-63`, vigente `M32:4-64`) só gestão; whitelist de chaves com validação; chave desconhecida → `unknown_parameter`; insere nova vigência (`valid_from=now()`), nunca edita. Faixas: `security.session_idle_minutes` 5–240.
- `parameters_insert` exige `valid_from >= now() - 1 min` (`M01:894-895`) — impede retroagir.

## 10. Tratamento de erros
`errorKey(error)` (`errors.ts:183-192`) percorre `RULES` em ordem e devolve a primeira chave i18n cujo regex casa com `message`; fallback `errors.generic`. Ordem importa: p.ex. `not_author` (linha 84) precede `not_authorised` (linha 169) — `/not_author/` casa também com `not_authorised`, o que faz qualquer erro `not_authorised` resolver para `errors.notAuthor` ("Author only…", `src/i18n/en-IE.ts:117`) em vez de `errors.notAuthorised` (`:105`) 🟢 (consequência lógica do regex; `errors.test.ts:11` só testa `not_author`; a chave `notAuthorised` só é alcançada por "row-level security|permission denied|42501"). Também: `JWT expired|refresh_token` → `errors.sessionEnded`; rede → `errors.network`.

## 11. Testes que documentam o comportamento
`tests/db/email-code.test.ts:36-100`: só senha não dá gestão; senha→pedido→OTP libera; OTP sem pedido não vale; pedir código exige sessão com senha; >15 min não vale; pedido alheio não serve; limite 5/15 min; porter não pede código; `mfa_satisfied` informa necessidade; tabela de pedidos inacessível; idioma copiado ao `auth.users`.
