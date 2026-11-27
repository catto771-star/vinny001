# Dicionário de dados / constantes — interface-e-i18n

> Sem tabelas de banco neste módulo. Chaves de armazenamento e constantes. 🟢

## localStorage / DOM
| Chave / atributo | Valores | Âncora | Observação |
|---|---|---|---|
| `ui.theme` | `light` \| `dark` | `src/lib/theme.ts:96` | gravado só com `applyTheme(mode, true)` |
| `nav.open` | JSON `string[]` (rótulos de grupo) | `src/lib/navGroups.ts:2` | leitura valida array de strings |
| `dslodge.locale` | — | `src/i18n/index.tsx:50` | removida na inicialização (legado) |
| `lodge.active`, `lodge.start` | id da casa | `src/lib/activeLodge.tsx:13-14` | casa ativa/inicial (outro módulo) |
| `continuity.snapshot` | JSON | ver continuidade-offline | |
| `html[data-theme]` | light/dark | `theme.ts:114` | |
| `html[data-house]` | `amiens` (padrão) / `connolly` | `theme.ts:130-133` | `DEFAULT_HOUSE` |
| `meta[name=theme-color]` | #000000 / #ffffff | `theme.ts:115` | |

## Tipos
| Tipo | Definição | Âncora |
|---|---|---|
| `ThemeMode` | `"light" \| "dark"` | `theme.ts:95` |
| `Locale` | `"en-IE"` | `i18n/index.tsx:5-6` |
| `MessageKey` | caminhos de `Messages` | `:15` |
| `Vars` | `Record<string,string\|number>` | `:16` |
| `Item` (nav) | `{to,label:MessageKey,icon,managementOnly?}` | `Layout.tsx:23` |
| `Group` | `{label,items,phase?}` | `Layout.tsx:24` |
| `TransitionKind` | push\|pop\|fade\|none | `transition.ts:482` |
| `FilterDef` | `{key,label,type: search\|select\|multi\|date\|text, options?, primary?}` | `filters.ts:394-401` |
| `FilterValues` | `Record<string,string>` (multi = CSV) | `:402` |
| `ActiveFilter` | `{key,label,remove}` | `:434` |
| `Shift` | day\|night | `time.ts:331` |

## Constantes
| Nome | Valor | Âncora |
|---|---|---|
| `DUBLIN` | `Europe/Dublin` | `time.ts:253` |
| `OPERATIONAL_DAY_START_HOUR` | 7 | `:254` |
| Turno Day/Night | 07–19 / 19–07 | `:334` |
| `CLOSE_MS` (Dialog) | 200 | `Dialog.tsx:4` |
| Limiar do tema escuro | largura < 720 ou standalone | `theme.ts:99` |
| Poll de badges | 60 000 ms | `Layout.tsx:210` |
| Scroll "is-scrolled" | > 8 px | `Layout.tsx:194` |
| Badge máximo | 99+ | `Layout.tsx:215,244` |
| Breakpoints | 719/720, 900, 1024, 1099/1100, 1180, 1200, 1279, 1400 px | styles/theme/elevate.css |
| Raio | 22px (cartões/botões/campos), 16px textarea, 14/10 tokens | `theme.css:11-17` |
| Curva | `--press: cubic-bezier(.32,.72,0,1)`; `--ios-ease` (definição não localizada nos trechos lidos) | `elevate.css:26`; 🔴 |
| Fontes | `-apple-system … Inter` (`@fontsource/inter` 400/500/600/700) | `theme.css:1-8` |

## Mapa de erros — famílias principais (`errors.ts`) 🟢
| Padrão (regex) | Chave de mensagem |
|---|---|
| `stale_version` | errors.staleVersion |
| `not_author` / `correction_window_closed` | errors.notAuthor / errors.correctionWindowClosed |
| `not_authorised\|row-level security\|permission denied\|42501` | errors.notAuthorised |
| `JWT expired\|refresh_token` | errors.sessionEnded |
| `Failed to fetch\|NetworkError\|network` | errors.network |
| `*_not_found\|invalid input syntax for type uuid` | errors.notFound |
| `invalid_range\|range_too_large\|invalid_month` | errors.invalidRange |
| `stays_one_open_per_bed` / `…per_resident` | errors.bedTaken / errors.residentHasStay |
| (nenhum casa) | errors.generic |
Lista completa: 97 regras em `src/lib/errors.ts:3-102` (cada uma `[regex, chave]`); códigos internos isentos: `invalid_priority, invalid_warning_type, invalid_slot, invalid_round_slot, invalid_quantities, invalid_performer, audit_log_is_immutable, not_required, password_session_required` (`errors.coverage.test.ts:9-12`).

## Menu (rotas por grupo) 🟢 (`Layout.tsx:27-78`)
| Grupo | Rotas (gestão-only marcadas *) |
|---|---|
| Overview | `/`, `/tasks`, `/notifications`*, `/continuity` |
| Residents & Presence | `/residents /sheet /seen /absences /no-shows /warnings /beds` |
| Occurrences | `/handover /maintenance` |
| Services | `/fridge /deliveries /dinner /laundry` |
| Team & Management | `/rota* /purchases* /hours* /vacations /reports* /users* /audit* /settings` |
Barra inferior Admin: `/`, `/notifications`, `#presence`, `/handover` + More; barra de casa: `/`, `/sheet`, `/handover`, `/residents` + Menu (`:89-102`).

## Seções do catálogo en-IE (linha inicial) 🟢
app 8, errors 30, auth 123, post 155, continuity 178, suppliers 202, structure 213, filters 257, nav 277, today 321, residents 364, sheet 421, seen 466, absences 489, noShows 506, handover 532, tasks 614, maintenance 649, warnings 688, pending 704, fridge 714, deliveries 731, dinner 751, laundry 775, notifications 789, purchases 806, rota 859, hours 899, vacations 932, reports 960, beds 1039, users 1055, audit 1106, theme 1143, settings 1147, home 1250, residentPicker 1290 (`src/i18n/en-IE.ts`).
