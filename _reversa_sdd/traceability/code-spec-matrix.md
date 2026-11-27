# Matriz código × spec — DS Lodge

> Redator Reversa · doc_level=completo. Cobertura: 🟢 spec cobre com leitura direta do arquivo · 🟡 cobertura parcial/inferida · n/a sem spec (candidato a análise). Specs em `_reversa_sdd/specs/<módulo>/spec.md`. Abreviações: AUT=acesso-e-autenticacao, MOR=moradores-e-presenca, OCO=ocorrencias-e-passagem-de-turno, SRV=servicos-da-casa, CMP=compras-e-fornecedores, EQP=equipe-escala-e-horas, PNL=painel-relatorios-e-auditoria, CFG=configuracoes-e-cadastros, CON=continuidade-offline, NTF=notificacoes-e-push, UI=interface-e-i18n.
> Arquivos de teste aparecem junto do código que verificam (ou na seção 6).

## 1. Páginas (`src/pages/`)
| Arquivo | Spec principal | Outras | Cobertura |
|---|---|---|---|
| `Login.tsx`, `EmailCode.tsx`, `ChangePassword.tsx` | AUT | — | 🟢 |
| `Residents.tsx`, `ResidentProfile.tsx`, `BedMap.tsx` | MOR | CFG (estado da cama) | 🟢 |
| `Seen.tsx`, `Absences.tsx`, `NoShows.tsx`, `DailySheet.tsx`, `PrintSheet.tsx` | MOR | OCO (ronda) | 🟢 |
| `Handover.tsx`, `Maintenance.tsx`, `Warnings.tsx` | OCO | MOR (menções), NTF | 🟢 |
| `Laundry.tsx`, `Fridge.tsx`, `Dinner.tsx`, `Deliveries.tsx` | SRV | CMP (vínculo) | 🟢 |
| `Purchases.tsx` | CMP | PNL | 🟢 |
| `Rota.tsx`, `Hours.tsx`, `Tasks.tsx`, `Users.tsx` | EQP | AUT (Users) | 🟢 |
| `Vacations.tsx` | EQP | CFG (bloqueios) | 🟡 (férias só parcialmente analisadas) |
| `Today.tsx`, `Reports.tsx`, `Audit.tsx` | PNL | — | 🟢 |
| `Settings.tsx`, `settings/AccountSettings.tsx`, `settings/SystemSettings.tsx`, `Structure.tsx` | CFG | NTF, AUT | 🟢 |
| `Notifications.tsx` | NTF | — | 🟢 |
| `Continuity.tsx` | CON | — | 🟢 |
| `MaintenanceReminder` (em `Maintenance.tsx`) | OCO | UI | 🟢 |
| Testes de página: `EmailCode.test.tsx` AUT · `ResidentProfile.test.tsx`, `DailySheet.test.tsx`, `NoShows.test.tsx`, `Seen.test.tsx`, `Seen.sighting.test.tsx` MOR · `occurrences.ui.test.tsx`, `MaintenanceReminder.test.tsx` OCO · `services.ui.test.tsx`, `Deliveries.test.tsx` SRV · `Purchases.test.tsx`, `management.ui.test.tsx` CMP/EQP/PNL · `Users.test.tsx` EQP · `Audit.test.tsx`, `Today.test.tsx` PNL · `Settings.test.tsx`, `Settings.account.test.tsx`, `Structure.test.tsx` CFG · `Continuity.test.tsx` CON | — | — | 🟢 (conteúdo de `Continuity.test.tsx` não lido 🔴) |

## 2. Componentes (`src/components/`)
| Arquivo | Spec | Cobertura |
|---|---|---|
| `AdmitDialog.tsx`, `AnticipateDialog.tsx`, `BedBoard.tsx`, `PresenceAlertCard.tsx` | MOR | 🟢 |
| `ResidentPicker.tsx` | MOR, OCO | 🟢 |
| `MaintenanceDialog.tsx`, `WarningDialog.tsx`, `StaffPicker.tsx` | OCO | 🟢 |
| `HomeDashboard.tsx`, `PendingTile.tsx`, `ShiftRuler.tsx` | PNL | 🟢 |
| `Layout.tsx` | UI | NTF (badge), CON (`ContinuityKeeper`), PNL (pendências) | 🟢 |
| `Dialog.tsx`, `Tabs.tsx`, `Toast.tsx`, `Notice.tsx`, `Skeleton.tsx`, `FilterBar.tsx`, `LodgeTabs.tsx`, `ThemeToggle.tsx`, `DateTimeField.tsx`, `DateTimeInput.tsx`, `Clock.tsx` | UI | 🟡 (`Tabs`, `Toast`, `Notice`, `Clock`, `DateTimeInput`, `Skeleton` não detalhados) |
| Testes: `AdmitDialog.test`, `BedBoard.test`, `ResidentPicker.test`, `PresenceAlertCard.test` MOR · `StaffPicker.test` OCO · `HomeDashboard.test`, `PendingTile.test` PNL · `BottomNav.test`, `BottomNavAdmin.test`, `Layout.nav.test`, `HouseSwitch.test`, `FilterBar.test`, `ui.test` UI | — | 🟢 |

## 3. Bibliotecas (`src/lib/`, `src/auth/`, `src/i18n/`, `src/main.tsx`, `src/App.tsx`, CSS)
| Arquivo | Spec | Cobertura |
|---|---|---|
| `auth/AuthProvider.tsx` | AUT | 🟢 |
| `App.tsx` (Gate/rotas) | AUT, UI | CON (gate offline) | 🟢 |
| `main.tsx` | UI | CON (registro do SW) | 🟢 |
| `lib/password.ts`, `supabase.ts`, `types.ts` | AUT | 🟢 |
| `lib/errors.ts` (+`errors.test`, `errors.coverage.test`) | UI | AUT (bug #3) | 🟢 |
| `lib/presence.ts`, `useOccupancy.ts`, `rooms.ts`, `useNextCheck.ts` | MOR | PNL (`useNextCheck`) | 🟢 |
| `lib/occurrences.ts`, `useStaffList.ts` | OCO | 🟢 |
| `lib/services.ts` | SRV | NTF (`notificationText`) | 🟢 |
| `lib/management.ts` | EQP | CMP, PNL | 🟢 |
| `lib/useOnDuty.ts` | EQP | OCO, PNL | 🟢 |
| `lib/pending.ts`, `audit.ts`, `auditLabels.ts`, `csv.ts`, `shiftRuler.ts` | PNL | 🟢 |
| `lib/continuity.ts` | CON | 🟢 |
| `lib/push.ts` | NTF | CFG | 🟢 |
| `lib/activeLodge.tsx`, `theme.ts` | CFG | UI | 🟢 |
| `lib/time.ts`, `filters.ts`, `useUrlFilters.ts`, `navGroups.ts`, `transition.ts`, `useLatestRequest.ts` | UI | 🟢 |
| `i18n/index.tsx`, `i18n/en-IE.ts`, `i18n/copy.test.ts`, `i18n/i18n.test.ts` | UI | 🟢 |
| `styles.css`, `theme.css`, `elevate.css` | UI | 🟡 (tokens de tema integrais não detalhados) |
| Testes de lib: `password.test` AUT · `presence.test`, `useOccupancy.test` MOR · `occurrences.test` OCO · `services.test` SRV · `management.test`, `useOnDuty.test` EQP · `pending.test`, `audit.test`, `auditLabels.test`, `shiftRuler.test` PNL · `serviceWorker.test` CON/NTF · `push.test` NTF (🔴 não analisado) · `time.test`, `filters.test`, `theme.test`, `themeContrast.test`, `designSystem.test`, `textContainment.test`, `fonts.test`, `navGroups.test`, `transition.test`, `defaultHouse.test` UI | — | 🟢 |

## 4. Edge Functions, PWA e scripts
| Arquivo | Spec | Cobertura |
|---|---|---|
| `supabase/functions/admin-users/index.ts` | AUT, EQP | 🟢 |
| `supabase/functions/send-push/index.ts` | NTF | 🟢 |
| `public/sw.js` | CON, NTF | 🟢 |
| `public/manifest.webmanifest`, `public/icon-*.png`, `apple-touch-icon.png`, `favicon.png`, `logo.png` | CON | 🟡 |
| `public/products/*` (27 imagens) | CMP (itens do Tesco) | 🟡 |
| `vercel.json`, `vite.config.ts`, `tsconfig.json`, `package.json`, `.env.example` | — (ver `deployment.md`, `integrations.md §7`) | n/a |
| `supabase/templates/sign-in-code.html` | AUT (e-mail do código) | 🟡 |
| `scripts/bootstrap-account.mjs`, `db-reset.mjs`, `demo.mjs`, `build-manual.mjs`, `install-rea.sh`, `videos-to-mp4.sh` | — (operacionais; ver `integrations.md`) | n/a |
| `docs/` (DESIGN, CENARIOS, SETTINGS-ROTEIRO, manuais PDF) | — | n/a |

## 5. Migrations (`supabase/migrations/`)
| Migration | Spec(s) | Cobertura |
|---|---|---|
| `…0001_foundation` | AUT, MOR, PNL, CFG | 🟢 |
| `…0002_seed_structure` | CFG | 🟢 |
| `…0003_server_time` | AUT, UI | 🟢 |
| `…0004_lock_privileges` | AUT | 🟢 |
| `…0005_email_code_second_step` | AUT | 🟢 |
| `…0006_presence` | MOR, NTF | 🟢 |
| `…0007_occurrences` | OCO, MOR, PNL | 🟢 |
| `…0008_task_model`, `…0009_task_model_effective_now`, `…0019_tasks_back` | EQP | 🟢 |
| `…0010_services` | SRV, MOR, NTF | 🟢 |
| `…0011_management`, `…0013_range_limits` | CMP (legado), EQP | 🟢 |
| `…0012_fix_float_window` | EQP | 🟢 |
| `…0014_beta_operations` | SRV, MOR | 🟢 |
| `…0015_station_role` | AUT | 🟢 |
| `…0016_beta_profiles` | EQP, OCO | 🟢 |
| `…0017_beta_management` | CMP, EQP, PNL, CFG | 🟢 |
| `…0018_handover_shifts`, `…0025_float_shift`, `…0026_shift_times` | OCO, EQP | 🟢 |
| `…0020_report_purchases` | CMP, PNL | 🟢 |
| `…0021_person_summary`, `…0027_handover_coauthors` | PNL, EQP, OCO | 🟢 |
| `…0022_home_dashboard` | PNL | 🟢 (substituída por M38) |
| `…0023_handover_tags_push`, `…0024_push_hook` | NTF, OCO, CFG | 🟢 |
| `…0028_handover_search` | OCO | 🟢 |
| `…0029_house_scope` | CFG, AUT, todos | 🟢 |
| `…0030_system_settings`, `…0032_more_settings` | CFG | 🟢 |
| `…0031_audit_search` | PNL, AUT | 🟢 |
| `…0033_people_roles` | AUT, EQP | 🟢 |
| `…0034_structure`, `…0035_bed_room_active` | CFG, MOR | 🟢 |
| `…0036_tags_admin` | OCO, CFG | 🟢 |
| `…0037_r15` | CMP, SRV, OCO, MOR, PNL (patches por `pg_get_functiondef`) | 🟢 |
| `…0038_r16` | MOR, PNL | 🟢 |

## 6. Testes de banco e e2e
| Arquivo | Spec | Cobertura |
|---|---|---|
| `tests/db/email-code.test.ts`, `foundation.test.ts`, `people-roles.test.ts` | AUT | 🟢 |
| `tests/db/presence.test.ts`, `r16.test.ts`, `review-2/3.test.ts` | MOR | 🟢 |
| `tests/db/occurrences.test.ts`, `handover-coauthors.test.ts`, `handover-search.test.ts`, `tags-admin.test.ts` | OCO | 🟢 |
| `tests/db/services.test.ts`, `beta-operations.test.ts` | SRV | 🟢 |
| `tests/db/beta-management.test.ts`, `management.test.ts` | CMP, EQP | 🟢 |
| `tests/db/beta-profiles.test.ts` | EQP | 🟢 |
| `tests/db/audit-search.test.ts` | PNL, AUT | 🟢 |
| `tests/db/system-settings.test.ts`, `settings-more.test.ts`, `structure.test.ts`, `house-scope.test.ts` | CFG | 🟢 |
| `tests/db/r15.test.ts` | CMP, SRV, MOR | 🟢 |
| `tests/db/stress-workflow.test.ts` | OCO, PNL | 🟡 (citado, não lido integralmente) |
| Demais `tests/db/*` (28 no total) e `tests/e2e/*.cjs` (20 scripts Playwright) | — | n/a (candidatos a análise adicional) |

## 7. Resumo de cobertura
- Código de aplicação (`src/**`, Edge Functions, `public/sw.js`): **todos os arquivos de página, componente e lib estão mapeados a uma spec**; 🟡 em arquivos de UI utilitários e CSS.
- Migrations: 38/38 mapeadas.
- Sem spec (n/a): infraestrutura, scripts operacionais, documentação, parte dos testes de banco/e2e.
- Estimativa de cobertura de arquivos de produto (excluindo `docs/`, `scripts/`, config, testes não analisados): **≈ 95 %**. Cobertura funcional de **Férias/Holidays** é a principal lacuna (ver `questions.md`).
