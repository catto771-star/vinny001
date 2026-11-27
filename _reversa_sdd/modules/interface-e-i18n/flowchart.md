# Fluxogramas — interface-e-i18n

## Tema na inicialização e troca 🟢 (`main.tsx:9-10`, `theme.ts`, `ThemeToggle.tsx:7-12`)
```mermaid
flowchart TD
  A[main.tsx] --> B[initialTheme]
  B --> C{ui.theme em localStorage?}
  C -- sim --> D[usa valor]
  C -- não --> E{standalone ou largura<720?}
  E -- sim --> F[dark]
  E -- não --> G[light]
  D --> H[applyTheme: data-theme + theme-color]
  F --> H
  G --> H
  H --> I[ensureHouse: data-house=amiens se vazio]
  I --> J[render App]
  K[clique ThemeToggle] --> L[applyTheme next, remember=true] --> M[grava ui.theme]
```

## Erro do banco → mensagem 🟢 (`errors.ts:104-112`)
```mermaid
flowchart TD
  A[erro Supabase/Postgres] --> B[extrai message]
  B --> C[percorre RULES em ordem]
  C --> D{regex casa?}
  D -- sim --> E[retorna MessageKey]
  D -- não, fim da lista --> F[errors.generic]
  E --> G[t chave → texto en-IE]
```

## Filtros na URL 🟢 (`filters.ts`, `useUrlFilters.ts`)
```mermaid
flowchart LR
  U[URL ?key=valor] --> P[parseFilters: descarta chaves/opções inválidas]
  P --> V[values] --> FB[FilterBar: controles + chips]
  FB -- onChange patch --> S[set: merge + serializeFilters]
  S --> R[setSearchParams replace=true] --> U
  FB -- Clear all --> C[clear: apaga só chaves de defs]
```

## Casca e navegação 🟢 (`Layout.tsx`)
```mermaid
flowchart TD
  L[Layout] --> K[ContinuityKeeper]
  L --> S[Shell]
  S --> R[rota muda] --> T[transitionKind] --> X[data-transition no main]
  R --> G[grupo da rota abre; salva nav.open]
  R --> U[recarrega unread_notifications_count se gestão]
  S --> N{isManagement?}
  N -- sim --> BA[BOTTOM_ADMIN: Home Alerts Presence Log More]
  N -- não --> BC[BOTTOM: Home Room Check Handover Residents Menu]
  BA --> PR[Presence abre Dialog só com grupo Residents]
```

## Tempo Dublin 🟢 (`time.ts`)
```mermaid
flowchart TD
  I[instante UTC] --> P[dublinParts via Intl]
  P --> H{hora < 7?}
  H -- sim --> D1[dia anterior] 
  H -- não --> D2[mesmo dia]
  W[dia + hh:mm parede] --> G[guess UTC − offset]
  G --> V{hora/min conferem?}
  V -- não --> R2[recalcula com offset do resultado]
  V -- sim --> OK[instante]
```
