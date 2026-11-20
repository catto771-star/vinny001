# DS Lodge — Direção de design

Vale para todas as fases (0 em diante). Toda tela nova segue este documento; toda tela
alterada é trazida para ele. Decisão da gestão em 20/11/2026.

## Princípios

1. **Editorial, não template.** Light mode de alto contraste (referência: Linear, editoriais
   do Awwwards). Nada de fileiras de cards iguais com sombra: a hierarquia vem da tipografia,
   do espaço e de grades assimétricas (*bento*) onde há mais de um tipo de informação.
2. **Ação principal primeiro.** A tela mostra antes o que a recepção precisa fazer agora
   (lançar o check, quem está sem evidência, pendências). O resto fica limpo.
3. **Nada muda de forma seca.** Abas, modais, filtros, listas e botões têm transição.
   Carregamento usa *skeleton*; ações concluídas têm retorno visual (toast, check animado).
4. **Só dois elementos de impacto:**
   - **vidro fosco** (glassmorphism) na barra de navegação inferior (celular) e na barra
     superior ao rolar;
   - **brilho sutil que segue o cursor** nos blocos do bento da tela Hoje.
   Nenhum outro efeito decorativo.
5. **Dados reais do nicho.** Quartos, camas, residentes, checks, turnos de Dublin — nunca
   "Lorem ipsum" nem números inventados na interface.
6. **Mobile-first.** Áreas de toque ≥ 44 px; tabelas viram listas legíveis no celular.
   (A spec prevê uso no computador da recepção; o layout responsivo não muda regras.)
7. **Acabamento.** Contraste AA no mínimo (texto principal AAA). Sem bordas e sombras
   desnecessárias: superfícies se separam por cor e por fio fino (*hairline*) só onde ajuda
   a leitura. `prefers-reduced-motion` desliga as animações.

## Tokens (src/styles.css)

| Token | Valor | Uso |
|---|---|---|
| `--ink` | `#0B0B0C` | texto principal, botão primário (contraste 19:1) |
| `--ink-2` | `#3D3D42` | texto secundário (10:1) |
| `--ink-3` | `#6B6B73` | rótulos, legendas (5:1) |
| `--paper` | `#F6F5F2` | fundo da aplicação |
| `--surface` | `#FFFFFF` | blocos, tabelas, modais |
| `--line` | `#E6E4DF` | fios finos |
| `--accent` | `#2F3CED` | foco, seleção, indicador das abas, links |
| `--ok` / `--warn` / `--danger` | `#0E7A3E` / `#A15C00` / `#C0261C` | estados |

Tipografia: **Inter** (variável, números tabulares) para interface; **Instrument Serif**
para títulos de página e números grandes do bento. Fontes hospedadas no próprio site
(sem Google Fonts — RGPD).

Movimento: `--ease-out: cubic-bezier(0.22, 1, 0.36, 1)`; `--ease-spring:
cubic-bezier(0.34, 1.56, 0.64, 1)` só em micro-feedback; durações 120–320 ms.

## Componentes base (src/components)

- `Tabs` — abas com indicador deslizante (Lodges, checks, filtros).
- `Skeleton` — linhas de carregamento com brilho.
- `Toast` — confirmação de ações (salvo, lançado, confirmado).
- `Dialog` — abre com escala e fade; fecha animado.
- `Button` states — pressão (escala), carregando (spinner), concluído.
- `Layout` — trilho lateral no desktop; barra inferior de vidro no celular.
