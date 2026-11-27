# Dicionário de dados — continuidade-offline

## Estruturas TypeScript (`src/lib/continuity.ts:6-9`) 🟢
| Tipo | Campo | Tipo | Obrig. | Origem / observação |
|---|---|---|---|---|
| `Snapshot` | `at` | string ISO-8601 | sim | `new Date().toISOString()` (`:28`) |
| | `float` | string \| null | sim | nome do post Float (`:50`) |
| | `houses` | `SnapHouse[]` | sim | uma por casa visível ao usuário |
| `SnapHouse` | `id` | string (uuid) | sim | `lodges.id` |
| | `name` | string | sim | `lodges.name` |
| | `onDuty` | string \| null | sim | responsável Office da casa |
| | `rooms` | `SnapRoom[]` | sim | |
| `SnapRoom` | `code` | string | sim | `Room X` / `Apartment X` (`:11`) |
| | `beds` | `SnapBed[]` | sim | |
| `SnapBed` | `n` | number | sim | `bed_number` |
| | `name` | string \| null | sim | `residentName(b)` se `resident_id` |
| | `dob` | string \| null | sim | `date_of_birth` (data civil) |
| | `passId` | string \| null | sim | `pass_id` |
| | `status` | `free\|present\|absent\|cancelled\|oos` | sim | regra em code-analysis §1 |
| | `fw` | boolean | sim | `!!final_warning` |

## Fontes no banco (leitura) 🟢
- Vista `bed_occupancy` (colunas usadas: `lodge_id, room_kind, room_code, room_sort, bed_number, bed_status, stay_id, stay_status, resident_id, date_of_birth, pass_id, final_warning` + nome) — `continuity.ts:44`. Definição fora deste módulo.
- Tabela `absences` (`stay_id`, `ended_at is null`) — `:45`.
- `useOnDuty().posts` (Roster/postos) — `Continuity.tsx:75`.

## Constantes e chaves
| Nome | Valor | Âncora |
|---|---|---|
| localStorage `continuity.snapshot` | JSON do `Snapshot` | `continuity.ts:12` |
| `SNAPSHOT_EVERY_MS` | 3 600 000 | `:13` |
| Cache SW | `shell-v1` | `public/sw.js:3` |
| Notas por status | `continuity.sAbsent/sCancelled/sFree/sOos` | `Continuity.tsx:9-11` |
| Manifest | name "47/48 Amiens & Connolly Lodge — Admin"; short_name "Lodges Admin"; start_url `/?source=pwa`; scope `/`; display standalone; orientation portrait; cores #1c1f24 | `manifest.webmanifest:2-10` |
| Ícones | `/icon-192.png` (any), `/icon-512.png` (any maskable) | `:11-14` |
| Classes CSS de impressão | `.continuity-*`, `.rollbox`, `.no-print` | `src/elevate.css:286-299` |
