# Análise de código — continuidade-offline

> Escala: 🟢 confirmado | 🟡 inferido | 🔴 lacuna. Âncoras `arquivo:linha`.

## Propósito
Folha de continuidade (ocupação + chamada de incêndio) imprimível, com cópia guardada no aparelho para abrir sem internet; service worker guarda o "shell" do app. 🟢 (`src/pages/Continuity.tsx:13`, `public/sw.js:1-2`)

## Componentes
| Peça | Papel | Âncora |
|---|---|---|
| `buildSnapshot` | Função pura: monta `Snapshot` a partir de `bed_occupancy`, casas, ausências abertas, plantão e float | `src/lib/continuity.ts:15-29` 🟢 |
| `saveSnapshot` / `loadSnapshot` | Grava/lê JSON em `localStorage["continuity.snapshot"]`; leitura valida `houses` (array) e `at` (string); erros viram `null` | `continuity.ts:31-39` 🟢 |
| `fetchSnapshot` | Consulta `bed_occupancy` (ordem `room_sort`, `bed_number`) e `absences` com `ended_at is null`; devolve `null` se erro (= offline) | `continuity.ts:42-54` 🟢 |
| `useContinuitySnapshot` | Hook: estado inicial do cache, `online` por `navigator.onLine` + eventos `online/offline`, refresh ao abrir e a cada hora | `continuity.ts:57-78` 🟢 |
| `ContinuityKeeper` | Componente invisível no `Layout` que mantém o snapshot fresco em qualquer tela | `src/components/Layout.tsx:105-110` 🟢 |
| `ContinuitySheet` | Apresentação (tabela por casa, aviso offline, botões Refresh/Print) | `Continuity.tsx:14-71` 🟢 |
| `Continuity` | Página autenticada (rota `/continuity`) | `Continuity.tsx:73-78`, `src/App.tsx:113` 🟢 |
| `ContinuityOffline` | Página sem sessão: só lê cache | `Continuity.tsx:81-87` 🟢 |
| Gate offline | Em `Gate`, se `!navigator.onLine` e `pathname === "/continuity"` renderiza `ContinuityOffline` antes de qualquer verificação de login | `src/App.tsx:45` 🟢 |
| Service worker | Cache `shell-v1`; navegação network-first com fallback ao `/` guardado; assets cache-first com atualização em segundo plano; só mesma origem; só GET | `public/sw.js:3-30` 🟢 |
| Registro do SW | Apenas em produção (`import.meta.env.PROD`) em `main.tsx`; `enablePush` também registra `/sw.js` | `src/main.tsx:19-21`, `src/lib/push.ts:34` 🟢 |
| Manifest PWA | `display: standalone`, `start_url /?source=pwa`, ícones 192/512 | `public/manifest.webmanifest:1-15` 🟢 |

## Regras e algoritmos
1. **Status da cama** (`buildSnapshot`, `continuity.ts:21-23`) 🟢: se há `stay_id` → `out_pending` ⇒ `cancelled`; estada com ausência aberta ⇒ `absent`; senão `present`. Sem estada → `bed_status = out_of_service` ⇒ `oos`; senão `free`.
2. **Rótulo do quarto**: `Apartment {code}` se `room_kind = apartment`, senão `Room {code}` (`continuity.ts:11`). Quartos são agrupados por rótulo preservando a ordem da consulta (`:18-20`).
3. **Contagem por casa** (UI): conta camas `present|absent|cancelled` (`Continuity.tsx:39`). Nota: inclui `cancelled` e `absent` na contagem de residentes. 🟡 (intenção: quem consta no registro; ver questions.md)
4. **Linha "Outside" (rollbox)**: caixa de marcar só se há nome e status ≠ `cancelled` (`Continuity.tsx:59`) 🟢.
5. **FW**: tag vermelha "FW" se `final_warning` (`:55`, `continuity.ts:24`) 🟢.
6. **Responsável do escritório**: primeiro post `function="office"` da casa; Float: primeiro post `function="float"` (`continuity.ts:48-50`) 🟢.
7. **Frequência**: `SNAPSHOT_EVERY_MS = 3 600 000` (1 h); efeito reexecuta só quando muda `enabled` ou `lodges.length` (deps parciais, `eslint-disable`, `:65-71`) 🟢. Consequência: `refresh` usa `posts` da renderização da criação do intervalo 🟡 (pode guardar plantão desatualizado até o próximo ciclo).
8. **Cópia ao vivo vs. guardada**: texto muda conforme `online` (`Continuity.tsx:34`) 🟢.
9. **Falha de rede**: `fetchSnapshot` devolve `null` → `online=false` (mesmo que `navigator.onLine` seja true) (`continuity.ts:61-63`) 🟢.

## Service worker — detalhes
- `install`: `caches.open(SHELL).add("/")`; falha ignorada; `skipWaiting` (`sw.js:4-6`) 🟢.
- `activate`: apaga caches diferentes de `shell-v1`; `clients.claim` (`:7-9`) 🟢.
- `fetch`: ignora não-GET, outra origem (inclui Supabase) e `/sw.js` (`:13-15`); navegação: rede e substitui `/` no cache, fallback `caches.match("/")` ou `Response.error()` (`:16-20`); assets por regex de prefixo (`assets/ fonts/ icon favicon logo apple-touch products/`) ou extensão (`js css woff woff2 png jpg svg`): cache-first com revalidação (`:22-29`) 🟢.
- Todas as rotas de navegação são servidas pelo mesmo `/` (SPA), então o React Router resolve a rota. 🟢
- Versão do cache fixa `shell-v1`; não há versionamento automático por build → arquivos `assets/` com hash acumulam no cache (nunca limpos até mudar `SHELL`). 🟡

## Testes
- `src/lib/serviceWorker.test.ts:5-18`: verifica por regex que o SW usa `caches.open(SHELL)`, `req.mode === "navigate"`, fallback ao `/`, filtro de origem e handlers push/notificationclick. Teste textual, não comportamental. 🟢
- `src/pages/Continuity.test.tsx`: existe; conteúdo não analisado nesta passada. 🔴

## Lacunas
Ver `_reversa_sdd/questions.md` (itens `[continuidade-offline]`).
