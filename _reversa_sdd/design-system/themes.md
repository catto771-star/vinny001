# Temas: claro/escuro e cor por casa — DS Lodge (Design System)

> Fonte: `src/theme.css`, `src/elevate.css`, `src/lib/theme.ts`, `src/lib/activeLodge.tsx`, `src/components/ThemeToggle.tsx`, `src/components/Layout.tsx` (`HouseSwitch`), `src/pages/settings/AccountSettings.tsx`, `src/main.tsx`. 🟢 confirmado · 🟡 inferido · 🔴 lacuna. Valores completos em `tokens.md` §2.

## 1. Modelo: 2 eixos independentes = 4 temas 🟢

| Eixo | Atributo em `<html>` | Valores | Quem define | Persistência |
|---|---|---|---|---|
| **Modo** | `data-theme` | `light`, `dark` | `applyTheme(mode, remember)` em `lib/theme.ts`; `main.tsx` aplica `initialTheme()` antes do primeiro render | `localStorage["ui.theme"]` (só quando a pessoa escolhe, `remember=true`); leitura/escrita em `try/catch` (armazenamento indisponível não quebra) |
| **Casa** | `data-house` | `amiens`, `connolly` (= `lodge.code` em minúsculas, `houseOf()`) | `ActiveLodgeProvider` (efeito em `activeLodge.tsx`); `ensureHouse()` aplica `amiens` quando não há casa ativa (login) | casa ativa em `localStorage["lodge.active"]`; casa de abertura por aparelho `lodge.start` (Settings, só Admin) |

Seletores finais: `:root[data-theme="light|dark"][data-house="amiens|connolly"] { ... }` (4 blocos canônicos, fim de `theme.css`, "única fonte de `--bg`, `--hero`, `--hc` e tintas"). Mais `:root[data-theme="light|dark"], :root[data-theme=...][data-house]` (camada de modo) e `:root[data-house=...]` (camada legada de `styles.css`).

## 2. Escolha do modo 🟢

- `defaultTheme(width, standalone)`: **escuro** se app instalado (`display-mode: standalone`) ou largura < 720 px; **claro** no computador (`lib/theme.ts`, teste `theme.test.ts`).
- Prioridade: valor guardado (`light|dark`) > padrão por dispositivo.
- Botão sol/lua (`ThemeToggle`) no topo e em Settings > My account (`chooseTheme`); `applyTheme` também atualiza `meta[name="theme-color"]` (`#000000` escuro / `#ffffff` claro). `color-scheme: light` está só em `:root` base; o modo escuro não declara `color-scheme: dark` 🟡 (controles nativos como scrollbar/`<select>` do SO podem aparecer claros; o código compensa `filter: invert(1)` no ícone de data e `option` com `--surface`).
- Impressão sempre em claro: `@media print { :root[data-theme="dark"] body, .content { background:#fff; color:#000 } }`.

## 3. Escolha da casa 🟢

- **Admin** (gestão, `isManagement`): interruptor `HouseSwitch` (role `radiogroup`, setas alternam) com polegar `--hero`; troca na hora, sem sair do sistema; casa guardada vale **só** para Admin.
- **Conta de casa (`station`)**: sem interruptor; usa sempre `staff.home_lodge_id` (espelha o isolamento do banco, `house_scope()`; ver `../database/rls-policies.md`).
- Ordem de decisão (`pickInitialLodge`): escolhida (Admin) > `post.lodge_id` > `staff.home_lodge_id` > primeira casa.
- Antes do login e sem casa: paleta de Amiens (`ensureHouse`, `DEFAULT_HOUSE`), para que a tela de login tenha cor.
- **Acoplamento com dados** 🔴: o nome do atributo vem do `code` da tabela `lodges` (`AMIENS`, `CONNOLLY`). Uma terceira casa (código diferente) **não tem paleta** (cai na camada de modo, sem `--hc`/`--hero`; botão principal e abas ficariam sem gradiente definido). Não há fallback explícito para códigos desconhecidos.

## 4. As quatro paletas 🟢

| | Amiens (âmbar/areia → cobre) | Connolly (gelo/azul → azul-marinho) |
|---|---|---|
| **Claro** | fundo `#fbf6ee`, superfície `#fffdf9`, elevada `#f3e9d9`; cor da casa `#a34a08`; gradiente `#b45309 → #7a3306`; tinta sobre a casa `#fff`; sombra `110 60 10` | fundo `#f3f7fd`, superfície `#fff`, elevada `#e6eefa`; casa `#1d5fd1`; gradiente `#2563eb → #0f3d99`; sombra `14 50 120` |
| **Escuro** | fundo `#0b0906`, superfície `#1b1610`, elevada `#272018`; casa `#f5b560` (claro sobre escuro); tinta sobre a casa `#2a1500`; gradiente igual ao claro | fundo `#06080c`, superfície `#10151d`, elevada `#1a212c`; casa `#6cb0ff`; tinta `#04142e`; gradiente igual ao claro |

Princípios 🟢 (DESIGN.md rev. 8; garantidos por `themeContrast.test.ts`):
1. **A cor da casa pinta**: botão principal e item selecionado (`--hero`), polegar de abas/interruptor/segmentado, item ativo do menu (círculo `--hc`), faixa inferior da barra superior (`--hc-vivid`), nome da casa, gráficos (`--hc`/`--hc-vivid`), foco e links (`a { color: var(--hc, var(--accent)) }`), faixa de 4 px do diálogo (`--house`), cabeçalho "Today" (`.today-head`).
2. **O resto é neutro** (grafite tingido do matiz da casa no fundo/linhas).
3. **Texto sempre escuro (ou claro no escuro)**; cor pura só em faixas e gradientes com `--on-hero` branco.
4. **As casas não podem voltar a se parecer** (Amiens: mais vermelho que azul em `--surface-2`; Connolly: mais azul).
5. `--hc-vivid` é só decoração (não tem contraste garantido como texto).
6. Semânticas `--ok/--warn/--danger` **não** mudam com a casa (mudam com o modo).

## 5. O que muda por tema (não só cor) 🟢
- **Relevo**: `--shadow-rgb` acompanha a casa no claro (sombra quente no Amiens, azul no Connolly) e é preto no escuro; `--hi`/`--sheen` mais fortes no claro.
- **Cartões**: claro = sombra suave + sem borda; escuro = `--surface` chapado, sem sombra, sem borda (revisão 6) — depois reforçado pelo relevo de `elevate.css`.
- **Topo/menu**: claro usa `--chrome` branco/areia com tinta escura; escuro usa `--bg` quase preto.
- **Entrada de turno** (`.timeline-item.kind-shift`): claro `#eef0ff`, escuro `#16172a`.
- **Logo do login**: escuro ganha cartão branco (azul-marinho some no preto).
- **Seta do `select`** usa `--ink-2`; ícones de data/hora invertidos no escuro.
- **Etiquetas azul/violeta** têm cor de texto própria no escuro (`#7fb3ff`, `#b9a1ff`).

## 6. Lacunas e riscos 🟡/🔴
1. 🔴 Sem fallback para casa desconhecida (item 3).
2. 🟡 `index.html` e `manifest.webmanifest` declaram `theme-color`/`background_color` `#1c1f24` (cromo escuro antigo): a barra do navegador/splash do PWA pode destoar até `applyTheme` rodar.
3. 🟡 Duas camadas concorrentes (`styles.css` casa legada `--house*`, `--chrome*`, e a paleta canônica) coexistem; a canônica vence por especificidade/ordem, mas `--house-ink`/`--house-line` legados ainda são lidos em `styles.css` (`.brand`, `.topbar-house`, `.topbar.is-scrolled`).
4. 🟡 Semânticas e etiquetas coloridas não têm teste de contraste (ver `accessibility.md` §3): amber `.chip.is-on` claro 3,27:1 e danger `.chip.is-on` escuro 3,00:1.
5. 🟡 `color-scheme` não acompanha o modo escuro.
6. 🟡 Cores do calendário de férias (`--hol-*`) não têm versão escura.
