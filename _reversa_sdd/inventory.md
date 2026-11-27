# Inventário — DS Lodge

> Gerado pelo Scout em 2026-11-27. Escala: 🟢 confirmado no código.

## Visão geral
- **Produto:** aplicação web de gestão de alojamento (hostel) para pessoas em situação de rua, duas casas ("47/48 Amiens" e "Connolly"). UI em inglês (Irlanda). 🟢
- **Arquitetura:** SPA React (Vite) servida pela Vercel; backend 100% Supabase (Postgres + RLS + RPCs SECURITY DEFINER + 2 Edge Functions + Auth). 🟢
- **Projeto Supabase:** `jbcrhkbhjdiqvwalheyp`. Deploy: https://ds-lodge.vercel.app. 🟢
- **Sem CI/CD no repositório** (`.github/workflows` ausente); deploy manual via Vercel/Supabase API. 🟢

## Linguagens (arquivos rastreados)
| Linguagem | Arquivos |
|---|---|
| TypeScript/TSX | ~178 (92 tsx, 86 ts) |
| SQL | 38 migrations (≈9,5 mil linhas) |
| JavaScript (.cjs/.mjs) | ~25 (e2e Playwright, scripts) |
| CSS | 3 (`theme.css`, `styles.css`, `elevate.css`) |

## Estrutura (excluindo node_modules, dist, .git)
- `src/pages/` — 36 telas + `settings/` (AccountSettings, SystemSettings)
- `src/components/` — 36 arquivos (diálogos, BedBoard, HomeDashboard, PendingTile, pickers…)
- `src/lib/` — 53 (services, occurrences, presence, management, continuity, errors, audit, csv, password, push, time…)
- `src/auth/AuthProvider.tsx`, `src/i18n/` (en-IE único)
- `supabase/migrations/` — 38 arquivos (20261120000001 … 20261126000038)
- `supabase/functions/` — `admin-users`, `send-push`
- `tests/db/` — 28 testes de banco; `tests/e2e/` — 20 scripts Playwright
- `docs/` — DESIGN, CENARIOS, SETTINGS-ROTEIRO, manuais PDF (PT/EN/PL)
- `scripts/` — bootstrap-account, db-reset, demo, build-manual
- `public/` — manifest PWA, `sw.js`, ícones, 27 imagens de produtos

## Rotas (src/App.tsx)
Públicas: `/login`, `/email-code`, `/change-password`, `/sheet/print`, `/continuity` (também offline).
Autenticadas: `/` (Today/Home), `tasks`, `residents`, `residents/:id`, `beds`, `sheet`, `seen`, `absences`, `no-shows`, `handover`, `maintenance`, `warnings`, `fridge`, `deliveries`, `dinner`, `laundry`, `notifications`, `vacations`, `settings`.
Somente gestão (`isManagement`): `rota`, `purchases`, `hours`, `reports`, `users`, `audit`; `/structure` → redireciona para `/settings?tab=registers`.

## Banco de dados (superficial — detalhe fica com o Data Master)
53 `create table` nas migrations; ~190 funções. Tabelas: lodges, rooms, beds, residents, stays, staff, parameters, absences, vacations, no_shows, sightings, room_check_runs/marks, handover_entries/shifts/tags/mentions, maintenance_tickets/events/reminder_snoozes, warnings, laundry_machines/uses, fridges, fridge_readings, food_deliveries, suppliers, dinner_services/marks, products, product_movements, shop_items, shop_orders, shop_order_lines, purchases, purchase_lines, rota_shifts, work_intervals, duty_posts, task_templates/extras/signatures, notifications, notification_reads, push_prefs, push_subscriptions, quick_phrases, holiday_locks, mfa_email_challenges, audit_log, access_log.

## Testes
Vitest: 636 testes em 86 arquivos (unit/UI jsdom + DB contra Postgres 16 local, porta 54322). E2E Playwright como scripts `.cjs` (não no `npm test`).

## Pontos de atenção
- Chaves/senhas fora do git; `.env.example` só declara `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY`.
- Precificação interna em `_reversa_sdd/_pricing/` está no `.gitignore`.
