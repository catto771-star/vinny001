# Preocupações transversais — DS Lodge

> Arquiteto Reversa · 🟢 confirmado · 🟡 inferido · 🔴 lacuna

## 1. Segurança e RLS 🟢
- Modelo "o banco manda": regras de negócio e autorização em RPCs `SECURITY DEFINER` com `search_path` fixo; o front só espelha (`canWriteLodge`, `isManagement`).
- RLS habilitado em todas as tabelas de negócio (53 `enable row level security`); políticas em 12 migrações (`create policy`). Leitura de `staff` exige `is_active_staff()`.
- `20261120000004_lock_privileges.sql`: `alter default privileges … revoke all on functions from anon, authenticated, public` — toda função nova nasce **sem** EXECUTE; cada migração concede explicitamente (`grant execute`) ao papel necessário. `anon` não tem acesso. Concessões de tabela são mínimas (`select` amplo; `insert/update` só em lodges, rooms, beds, staff, residents, `insert` em parameters).
- Funções internas (ex.: `notify_push`) têm `revoke all … from public, anon, authenticated`.
- `mfa_email_challenges`: RLS ligado e todos os privilégios revogados (só funções definer acessam).
- Segunda etapa para Manager/Owner/Developer: `mfa_satisfied()` consultada pelo front (`stage = email_code`) **e** exigida no banco; desativável por parâmetro `security.require_mfa_management` (default seguro: exige).
- `admin-users`: única via que usa a chave de serviço; grava `staff` com o JWT do chamador. CORS `*` e sem rate limit 🔴.
- Privacidade: leitura de perfil de morador registrada em `access_log` (`open_resident_profile`); `unit_price` e `document_ref` visíveis só à gestão; horário de digitação (`created_at`/`entered_at`) visível só à gestão (distinto de `occurred_at`/`checked_at`).
- Cabeçalhos HTTP: `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy: same-origin`; sem CSP 🟡.

## 2. Auditoria por triggers 🟢
- `audit_row()` (AFTER INSERT/UPDATE/DELETE, SECURITY DEFINER) grava em `audit_log`: `actor_user_id = auth.uid()`, `actor_staff_id = current_staff_id()`, `action = tg_op`, `table_name`, `record_id`, `old_data`/`new_data` (jsonb completo).
- UPDATE que só altera `version` não gera linha (`(old - 'version') = (new - 'version')`).
- `audit_log` é imutável: trigger `audit_immutable` levanta `audit_log_is_immutable` (42501) em UPDATE/DELETE.
- Triggers `audit_<tabela>` em 12 migrações (≈ 40 tabelas); tabelas de leitura/derivadas e `audit_log`, `access_log`, `mfa_email_challenges`, `notification_reads` ficam de fora 🟡 (cobertura exata por tabela não verificada integralmente).
- Autoria real preservada nas RPCs e na Edge (JWT do chamador). Preenchimento por terceiro: `app.filled_by` (set_config local) → `handover_entries.filled_by`.
- Consulta: `search_audit`, `search_access_log` (índices por ator e por tabela/tempo); rótulos em `auditLabels.ts`; exportação `csv.ts`.
- Concorrência otimista: `bump_version` (19 triggers) levanta `stale_version` (40001) → `errors.staleVersion`.
- Janela de correção: `records.correction_window_hours` (`correction_window_closed`, `not_author`); anulação com motivo (`void_*`, `undo_reason`) em vez de DELETE.

## 3. Fuso Europe/Dublin e dia operacional 🟢
- Banco guarda `timestamptz` (UTC); tela sempre em `Europe/Dublin` (`lib/time.ts: DUBLIN`).
- **Dia operacional**: das 07:00 de um dia às 07:00 do seguinte (Dublin). SQL: `operational_day(ts) = ((ts at time zone 'Europe/Dublin') - interval '7 hours')::date`; `operational_day_start/end(d)`; `slot_instant`, `shift_of` (Day/Night). TS espelha em `time.ts`.
- Relógio: `server_now()` + `serverOffsetMs` calculado no login (`AuthProvider`) → evita erro de relógio de aparelho; futuro bloqueado (`in_future`, `check_in_future`, `admitted_in_future`).
- Colunas `operational_day date` em: room_check_runs, no_shows, handover_entries, task_extras/signatures, dinner_services.
- Exceções 🟡: Rota usa semanas 00:00 Dublin; Hours usa 07:00 (totais diferem em turnos na fronteira; questions.md). `holiday_locks`/`vacations` usam `date` puro.
- Horário de verão: conversões `at time zone 'Europe/Dublin'` tratam DST no banco; no front via `Intl` 🟢.

## 4. Erros mapeados 🟢
- Convenção: exceções SQL com texto curto e `errcode` (`stale_version`, `not_author`, `bed_occupied`, `staff_overlap`, `role_not_allowed`, `stays_one_open_per_bed`…).
- `lib/errors.ts`: lista ordenada de 97 regras `[regex, chave i18n]`; a primeira que casa vence; `errorKey(error)` aceita string/objeto; sem casamento → `errors.generic`. Também mapeia rede (`Failed to fetch`), sessão (`JWT expired|refresh_token`) e permissão (`row-level security|permission denied|42501` → `errors.notAuthorised`).
- Ordem importa: regras específicas antes de genéricas (`_not_found`, `invalid_.*time`).
- Teste `errors.coverage.test.ts` garante cobertura das chaves; novas exceções devem receber regra + texto em `en-IE.ts`.
- Login traduz status HTTP (429, 400) fora do mapa; Edge `admin-users` devolve JSON `{error}` com status 4xx 🟡.

## 5. Internacionalização — catálogo único 🟢
- `src/i18n/en-IE.ts` é o **único** catálogo; `LOCALES = ["en-IE"]`, `FALLBACK_LOCALE = "en-IE"`; `translate(locale, key, vars)` com interpolação; chave ausente devolve a própria chave; preferência em `localStorage` (`dslodge.locale`).
- O banco ainda declara `app_locale` com `pt-PT`, `en-IE`, `pl-PL` (`staff.locale`; títulos trilíngues em `task_templates.title` e `quick_phrases.text`, selecionados por `pickTitle`). A UI grava `locale = "en-IE"` em toda edição de usuário (🔴 questions.md).
- Datas/horas: `formatClock(instant, locale)` usa `Intl` com locale pedido (testes cobrem `pt-PT`).
- Push (Edge): textos em inglês fixos (`TAG_LABEL`, `message()`), fora do catálogo.
- Testes: `copy.test.ts`, `i18n.test.ts`, `textContainment.test.ts`.

## 6. Outras preocupações
- **Offline/continuidade**: `sw.js` guarda o shell; folha de continuidade (`Continuity.tsx`, `lib/continuity.ts`) para operação sem rede; escritas offline **não** são enfileiradas 🟡.
- **Idempotência**: `maintenance_tickets.request_key` (UK) evita duplicar chamados por reenvio.
- **Último pedido vence**: `useLatestRequest`, `loadSeq` do `AuthProvider`.
- **Sessão**: inatividade por parâmetro; `is_active_staff` a cada 60 s; sem Realtime.
- **Tema/acessibilidade**: `theme.ts`, testes de contraste (`themeContrast.test.ts`).
- **Observabilidade**: sem logging/monitoramento estruturado no repositório 🔴.
