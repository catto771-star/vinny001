# Spec — continuidade-offline

> Redator Reversa · doc_level=completo · pt-br · 🟢/🟡/🔴. Fontes: `modules/continuidade-offline/*`, `integrations.md §5`, ADR 0012.

## 1. Objetivo
Oferecer uma **folha de continuidade** imprimível (ocupação por casa + chamada de incêndio/emergência) com cópia guardada no aparelho, abrível sem internet, e um service worker que mantém o shell do app. **Não há fila de escritas offline.** 🟢 / 🟡

## 2. Atores
Qualquer usuário autenticado (cópia atualizada); qualquer pessoa no aparelho offline (apenas leitura do cache). 🟢

## 3. Requisitos funcionais
**RF-01 Montar o snapshot (`buildSnapshot`).** Função pura a partir de `bed_occupancy`, casas, ausências abertas, plantão (post Office por casa, Float). Status da cama: com `stay_id` → `out_pending`⇒`cancelled`; ausência aberta⇒`absent`; senão `present`; sem estadia → `out_of_service`⇒`oos`, senão `free`. Quartos agrupados por rótulo (`Apartment {code}` / `Room {code}`) preservando a ordem. 🟢

**RF-02 Guardar e ler (`saveSnapshot`/`loadSnapshot`).** `localStorage["continuity.snapshot"]`; leitura valida `houses` (array) e `at` (string); erro → `null`. 🟢

**RF-03 Atualizar.** `useContinuitySnapshot`: estado inicial do cache; `online` por `navigator.onLine` e eventos; refresh ao abrir e **a cada 1 h** (`SNAPSHOT_EVERY_MS=3 600 000`); `fetchSnapshot` devolve `null` em erro (⇒ `online=false` mesmo com `navigator.onLine` verdadeiro). `ContinuityKeeper` no `Layout` mantém fresco em qualquer tela. 🟢

**RF-04 Folha (`ContinuitySheet`).** Tabela por casa, aviso conforme online/offline ("cópia ao vivo" × "guardada"), botões Refresh/Print, caixa "Outside" (rollbox) só com nome e status ≠ `cancelled`, tag FW vermelha. Contagem por casa inclui `present|absent|cancelled`. 🟢 / 🟡 (intenção da contagem)

**RF-05 Páginas.** `/continuity` autenticada; `ContinuityOffline` sem sessão (só cache). `Gate`: se `!navigator.onLine` e `pathname==='/continuity'`, mostra `ContinuityOffline` antes de qualquer verificação de login. 🟢

**RF-06 Service worker (`public/sw.js`).** Cache `shell-v1`; `install` guarda `/` (falha ignorada; `skipWaiting`); `activate` remove caches ≠ `shell-v1`; navegação rede-primeiro com fallback ao `/` guardado; assets cache-primeiro com revalidação; só mesma origem e GET; ignora `/sw.js`; Supabase nunca é cacheado. Registrado só em produção (`main.tsx`) e por `enablePush`. 🟢

**RF-07 PWA.** `manifest.webmanifest` com `display: standalone`, `start_url /?source=pwa`, ícones 192/512. 🟢

## 4. Regras de negócio
RN-01 Responsável do escritório = primeiro post `office` da casa; Float = primeiro post `float`. 🟢
RN-02 Cópia guardada pode estar até 1 h desatualizada; o texto deixa claro online/offline. 🟢
RN-03 App instalado (standalone) é só para Admin (`adminAppOnly` para `station`), ver `acesso-e-autenticacao`. 🟢

## 5. Dados
`Snapshot{at, houses[]}` em `localStorage`; consultas `bed_occupancy` e `absences` (`ended_at is null`); `Cache Storage` `shell-v1`. 🟢 Dados pessoais (nomes de residentes) ficam em `localStorage` do aparelho — retenção e limpeza 🔴.

## 6. Interfaces
Rotas `/continuity`; sem RPC própria. 🟢

## 7. Estados
Online/offline derivado; sem estados persistentes além do snapshot. 🟢

## 8. Permissões
`bed_occupancy` e `absences` sob RLS (`house_scope`): `station` vê só a própria casa no snapshot; offline qualquer pessoa com o aparelho lê o cache. 🟡

## 9. Casos de borda
- EB-01 O efeito do hook reexecuta só quando muda `enabled` ou `lodges.length`; `refresh` pode usar `posts` desatualizados até o próximo ciclo. 🟡
- EB-02 `SHELL` fixo: assets com hash acumulam no cache até mudar a versão. 🟡
- EB-03 Escritas offline falham (não há fila); o app só garante leitura da folha. 🟡
- EB-04 `Continuity.test.tsx` existe e não foi analisado; `serviceWorker.test.ts` é textual (regex), não comportamental. 🔴

## 10. Requisitos não funcionais
Disponibilidade offline da folha e do shell; impressão em preto e branco (`elevate.css` print); refresh horário. 🟢

## 11. Contradições anotadas
Nenhuma. O Detetive não revisitou este módulo.

## 12. Lacunas 🔴
Retenção/limpeza do snapshot no aparelho; testes comportamentais do SW; definição de quem deve constar na contagem (cancelled/absent).

## 13. Rastreabilidade
`src/pages/Continuity.tsx`, `src/lib/continuity.ts`, `src/components/Layout.tsx` (Keeper), `src/App.tsx` (Gate), `public/sw.js`, `public/manifest.webmanifest`, `src/main.tsx`, `src/lib/push.ts` (registro do SW), `src/elevate.css` (print); testes `src/lib/serviceWorker.test.ts`, `src/pages/Continuity.test.tsx`.
