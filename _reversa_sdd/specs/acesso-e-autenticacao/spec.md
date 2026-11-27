# Spec — acesso-e-autenticacao

> Redator Reversa · doc_level=completo · pt-br · Escala: 🟢 confirmado no código · 🟡 inferido · 🔴 LACUNA.
> `Mnn` = migration em `supabase/migrations/` (número do arquivo). Fontes: `modules/acesso-e-autenticacao/*`, `permissions.md`, `findings-verification.md`, `adrs/0003, 0005, 0006`.
> Regra de precedência: onde um achado de módulo foi julgado pelo Detetive (`findings-verification.md`), vale o veredito do Detetive.

## 1. Objetivo
Controlar quem entra no DS Lodge e o que cada papel pode fazer: login com senha, segunda etapa por código de e-mail para a gestão, troca obrigatória de senha, desativação de contas, criação de contas pela gestão (Edge Function `admin-users`), papéis e predicados de autorização, e trilha de auditoria/leitura de dados pessoais. 🟢

## 2. Atores
| Ator | Descrição | Conf. |
|---|---|---|
| Admin (`manager`/`owner`) | Gestão; login + senha + código por e-mail; cria contas | 🟢 |
| `developer` | Papel técnico equivalente à gestão; único; não é criado pelo app | 🟢 |
| Conta da casa (`station`) | Login institucional da casa; vê/escreve só a própria casa | 🟢 |
| Staff (`porter`) / `cleaner` | Cadastro **sem login** no Beta | 🟢 |
| Supabase Auth / SMTP | Emite JWT (`amr`) e o e-mail do código | 🟢 |
| Edge Function `admin-users` | Cria/reseta/(des)ativa contas com chave de serviço | 🟢 |

## 3. Requisitos funcionais
**RF-01 Login com senha.** `signInWithPassword(email.trim(), senha)`; HTTP 429 → `auth.tooManyAttempts`; 400 → `auth.invalidCredentials`. Não há auto-cadastro nem "esqueci a senha". 🟢
- Critério: credencial inválida mostra mensagem de credenciais, sem criar sessão.

**RF-02 Máquina de estados de acesso.** `AuthStage` = `loading → signed_out | not_staff | change_password | email_code | ready` (`AuthProvider.load`). Sem sessão → `signed_out`; sem linha ativa em `staff` → `not_staff`; `must_change_password` → `change_password`; gestão com `mfa_satisfied()≠true` → `email_code`; senão `ready` (carrega casas, `security.session_idle_minutes`, `server_now()`). 🟢
- Critério: respostas obsoletas são descartadas (`loadSeq`, última requisição vence).

**RF-03 Segunda etapa por e-mail (gestão).** `begin_email_verification()` registra o pedido (exige sessão com senha; máx. 5 pedidos/15 min → `too_many_code_requests`), depois `signInWithOtp(shouldCreateUser:false)` e `verifyOtp(type:email)`. O código **nunca** é enviado automaticamente; reenvio tem cooldown de 60 s; botão verificar exige ≥6 caracteres. 🟢
- Critério: só senha não concede papel de gestão; OTP sem pedido prévio não vale; pedido com mais de 15 min antes do OTP não vale.

**RF-04 Troca obrigatória de senha.** `must_change_password=true` (padrão e após reset) força `ChangePassword`: valida igualdade e `passwordAcceptable`, `auth.updateUser`, `mark_password_changed`, `refresh`. 🟢
- Critério: erro contendo "same" mostra `passwordTooWeak` (heurística). 🟡

**RF-05 Política de senha.** ≥10 caracteres, ≥1 letra, ≥1 dígito (front aceita letras acentuadas `À-ž`; Edge só `[A-Za-z]`). Senha temporária: 12 caracteres, 2 dígitos garantidos, alfabeto sem `ilIoO01`, gerada no navegador do Admin. 🟢 / 🟡 (divergência de acentos)

**RF-06 Inatividade e desativação.** Timer no cliente (`mousedown|keydown|touchstart|wheel`) desloga após `security.session_idle_minutes` (padrão 15; faixa 5–240). A cada 60 s `is_active_staff()`; `false` → logout com `errors.accountInactive` (erro de rede não desloga). 🟢

**RF-07 Gate por papel.** `Gate` (`App.tsx`): `station` com PWA instalado → mensagem `adminAppOnly`; `porter|cleaner` com sessão → "use a conta da casa"; rotas só-gestão (`rota, purchases, hours, reports, users, audit`, `structure→/settings?tab=registers`). É UX; a segurança é RLS/RPC. 🟢

**RF-08 Gestão de contas (`admin-users`).** Actions `create`, `reset_password`, `set_active`. Autoriza por `is_management()` (403 `not_authorised`). Detalhe em `rpc-contracts.md §Edge`. 🟢
- `create`: papéis `station|porter|cleaner|manager|owner` (nunca `developer`); login só para `station|manager|owner`; `station` exige `home_lodge_id`; com login exige e-mail e senha forte; compensa com `deleteUser` se o insert em `staff` falhar.
- `reset_password`: marca `must_change_password=true` e só depois troca a senha; sem rollback se a troca falhar. 🟡
- `set_active`: atualiza `staff.active` (trigger encerra posto) e aplica `ban_duration` (`876000h` ou `none`).

**RF-09 Postos de serviço (`assume_post`/`end_my_post`).** Regras de posto Office/Float com tomada de posto por confirmação. Funções mantidas no banco, **sem chamada em `src/`**; `duty_posts` ainda alimenta `can_write_lodge`. 🟢 / 🟡 (legado Beta)

**RF-10 Predicados de autorização.** `is_active_staff`, `is_management` (papel ∧ `mfa_satisfied`), `can_see_lodge`, `can_write_lodge`, `house_scope`, `mfa_satisfied`, `current_staff_id/role`. 🟢

**RF-11 Auditoria e log de leitura.** Ver `painel-relatorios-e-auditoria` (consulta). Neste módulo: `audit_row` (trigger), `audit_immutable`, `access_log` escrito somente por `open_resident_profile`. 🟢

**RF-12 Auto-serviço.** `set_my_locale`, `mark_password_changed`, `set_my_display_name` (≤40 caracteres; vazio volta a `full_name`). 🟢

## 4. Regras de negócio
- RN-01 Gestão = `manager|owner|developer` **e** `mfa_satisfied()`. 🟢
- RN-02 `mfa_satisfied()` verdadeiro se papel não-gestão, ou `security.require_mfa_management=false`, ou pedido `mfa_email_challenges` do usuário em [`email_code_session_at()`−15 min, +1 min]. 🟢
- RN-03 Um único `developer` (índice `staff_single_developer`); cleaner nunca tem login (`role<>'cleaner' or user_id is null`); `home_lodge_id` só para `station` (`staff_home_only_station`). 🟢
- RN-04 Usuário desativado cai em `not_staff` (RLS `staff_read` exige `is_active_staff()`) e fica banido no Auth. 🟢
- RN-05 Nada é apagado: sem DELETE/TRUNCATE para `authenticated` (ADR-0002). 🟢
- RN-06 `UPDATE` que só altera `version` não gera linha de auditoria. 🟢
- RN-07 `bump_version` recusa escrita concorrente com `stale_version` (40001). 🟢

## 5. Dados
Tabelas: `staff`, `duty_posts`, `mfa_email_challenges`, `parameters`, `audit_log`, `access_log`. Enums: `staff_role` (`porter, cleaner, manager, owner, developer, station`), `duty_function` (`office, float`), `app_locale` (`pt-PT, en-IE, pl-PL`). Colunas, índices e constraints completos em `modules/acesso-e-autenticacao/data-dictionary.md`. Parâmetros: `security.session_idle_minutes` (15), `security.require_mfa_management` (true), `records.correction_window_hours` (72). 🟢

## 6. Interfaces (RPCs / Edge)
`mfa_satisfied`, `begin_email_verification`, `is_management`, `is_active_staff`, `assume_post`, `end_my_post`, `set_my_locale`, `mark_password_changed`, `set_my_display_name`, `server_now`, `open_resident_profile`, Edge `admin-users`. Contratos em `rpc-contracts.md`. 🟢

## 7. Estados
Máquina `AuthStage` e MFA documentadas em `state-machines.md §14`. 🟢

## 8. Permissões
Ver `permissions.md §1–§4`. Resumo: anon sem acesso; `station` só a casa própria; gestão com MFA; porter/cleaner sem login. 🟢

## 9. Casos de borda
- EB-01 `updateUser` ok e `mark_password_changed` falha: senha nova mas `must_change_password=true` (sem transação). 🟡
- EB-02 `reset_password`: marca feita e `updateUserById` falha: usuário forçado a trocar senha sem senha nova. 🟡
- EB-03 Offline em `/continuity` mostra `ContinuityOffline` antes de qualquer verificação de login. 🟢
- EB-04 `onAuthStateChange` recarrega só em `SIGNED_IN|SIGNED_OUT|USER_UPDATED`, via `setTimeout(0)` (motivo inferido). 🟡
- EB-05 `assume_post` com `p_lodge` nulo para `station` falha em `can_see_lodge`. 🟡
- EB-06 Mensagem de erro **incorreta** (veredito 3 CONFIRMADO, bug de UX): `errors.ts` testa `/not_author/` (linha 5) antes de `/not_authorised|…/` (linha 90); logo toda recusa `not_authorised` mostra "Author only…". Correção sugerida: ancorar `/\bnot_author\b/` ou reordenar. 🟢

## 10. Requisitos não funcionais
- Segurança: `search_path` fixo; privilégios mínimos; `EXECUTE` revogado por padrão (M04, M05); chave de serviço só na Edge. 🟢
- Resiliência: idempotência de criação por compensação; "última requisição vence". 🟢
- Limites: 5 pedidos de código/15 min; CORS `*` e **sem rate limit** na Edge. 🔴 LACUNA (ver questions.md)
- Observabilidade: sem logging estruturado. 🔴

## 11. Lacunas de segurança confirmadas (vereditos do Detetive)
- #5 `open_resident_profile` não chama `can_see_lodge`: uma `station` pode ler perfil de outra casa se obtiver o UUID (obtido via `find_former_resident`). 🟢 ausência / 🟡 exploração.
- #9 `parameters_insert` aceita qualquer chave direto na API (inclusive `security.require_mfa_management`). 🟢
- #10 Manager promove a `owner` por `update` direto em `staff` (a UI restringe; o banco não). 🟢
- Ociosidade só no cliente; JWT é o único limite no servidor. 🟡
- 🔴 LACUNA: como a conta `developer` é criada; configuração SMTP/remetente do e-mail do código; registro formal da decisão de trocar autenticador por código de e-mail.

## 12. Contradições anotadas
- Nenhuma contradição com o Detetive neste módulo; o item #3 foi confirmado.

## 13. Rastreabilidade
Código: `src/auth/AuthProvider.tsx`, `src/pages/Login.tsx`, `EmailCode.tsx`, `ChangePassword.tsx`, `src/App.tsx`, `src/lib/password.ts`, `supabase.ts`, `types.ts`, `errors.ts`, `supabase/functions/admin-users/index.ts`; SQL `M01, M04, M05, M15, M16, M29, M31, M32, M33`. Testes: `tests/db/email-code.test.ts`, `foundation.test.ts`, `house-scope.test.ts`, `people-roles.test.ts`, `src/pages/EmailCode.test.tsx`, `Users.test.tsx`, `src/lib/password.test.ts`. Matriz completa: `traceability/code-spec-matrix.md`.
