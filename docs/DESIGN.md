# DS Lodge — Direção de design

Vale para todas as telas. Toda tela nova segue este documento; toda tela alterada é trazida
para ele. Revisado em 20/11/2026 (e de novo em 24/11, tipografia e escala) com passadas "Unslop" (método de Damir Sokolovsky,
@heydamir, CC BY 4.0), que tirou o visual de sistema gerado por IA.

## Direção

- **Produto.** O console de turno da recepção de dois hostels em Dublin: presença,
  Handover, serviços e gestão, usado 12 horas seguidas.
- **Caráter.** Exato, firme, um pouco caloroso.
- **Mundo.** O balcão da recepção e o livro de registro: papel pautado, tinta, o relógio da
  parede, o turno da noite.
- **Destaques (onde entram cor e detalhe).** O quadro de camas (cada quarto com as suas
  camas: ocupada, livre, Out decidido, fora de uso, FW) e os dados de cada tela. O resto da
  interface fica quieto.
- **Assinatura.** A régua do dia operacional 07:00 → 07:00, com as rondas e os checks de cada
  Lodge (feito, atrasado, vencendo, por vir) e a marca do "agora". Aparece só na tela Hoje.

## Regras

1. **Interface quieta, dados ricos.** Fundo, cartões, bordas e texto vêm de uma rampa
   grafite neutra. Um acento azul-tinta (`--accent`) só na ação/seleção/número que importa e
   no "agora" da régua. Verde, âmbar e vermelho só com significado (feito, atenção, atraso).
2. **Ação principal primeiro.** O topo de Hoje diz o dia, o turno, quem eu sou no posto e a
   próxima ação (lançar o check). Pendências logo abaixo, como lista com link.
3. **Sem efeitos decorativos.** Nada de vidro, brilho que segue o cursor, gradiente de cor,
   brilho pulsante, shimmer, molas ou cartões que pulam no hover. Movimento só para explicar:
   troca de cor no hover, leve redução ao pressionar, diálogo que sobe 8 px, aba que desliza.
4. **Texto.** Sem ponto final em rótulos e botões, sem exclamação, sem caixa-alta com
   espaçamento (rótulos em caixa normal). Sem itálico.
5. **Mobile-first.** Áreas de toque ≥ 44 px; tabelas viram listas no celular; barra inferior
   sólida presa à borda.
6. **Acessibilidade.** Contraste AA no mínimo; foco visível em azul-tinta;
   `prefers-reduced-motion` desliga as animações.

## Tokens (src/styles.css)

| Token | Valor | Uso |
|-------|-------|-----|
| `--ink` / `--ink-2` / `--ink-3` | #171717 / #525252 / #707070 | texto principal, secundário, apagado e ícones |
| `--paper` / `--surface` / `--surface-2` | #f7f7f6 / #fff / #f1f1f0 | página, cartões, elevado (linha ativa, trilho) |
| `--line` / `--line-strong` | texto a 8% / 16% | fios finos entre itens; bordas de campos |
| `--accent` | #2449a8 | ação/seleção/foco; "agora" na régua |
| `--ok` / `--warn` / `--danger` | #16723a / #9a5800 / #c0261c | feito, atenção, atraso/erro (com versões `-soft`) |
| `--radius-sm` / `--radius` / `--radius-lg` | 6 / 8 / 12 px | etiqueta e linha / botão e campo / cartão (diálogo 16) |
| `--ease-out` | cubic-bezier(0.22, 1, 0.36, 1) | a única curva |
| `--fast` / `--base` / `--slow` | 140 / 180 / 320 ms | feedback / menus / entradas |

Espaçamento na grade de 4 px (raiz 16 px; `0.25rem` = 4 px).

## Tipografia e escala

- **IBM Plex Sans** (400, 500, 600) em toda a interface — trocada em 25/11 por ser mais aberta e natural que a Geist.
- **IBM Plex Mono** (400, 500) para horários, datas no relógio, códigos de quarto/cama, número da folha,
  contagens e a régua.
- **Escala fluida:** o tamanho-raiz cresce com a tela (`clamp(16px, 0.55vw + 8.5px, 19px)`): 16 px em
  notebook, ~19 px em monitor Full HD. Todas as medidas de layout estão em `rem`, então menu lateral,
  controles, régua e quadro de camas crescem junto. Texto base 16 px; apoio 14–13 px; nada abaixo de
  12 px (só rótulos mono da régua e do quadro de camas).
- **Ocupação da tela:** o conteúdo usa a largura disponível (teto 104 rem, centrado) ao lado de um menu de
  15,5 rem; o quadro de camas não estica os cartões.
- Títulos de página 32 px/500; números de destaque 32–36 px/500. Hierarquia por tamanho e cor, não por peso.
- Barra inferior do celular usa rótulos curtos (uma linha).

## Componentes

- **Abas** (`components/Tabs.tsx`): trilho cinza com indicador branco que desliza.
- **Skeleton**: linhas estáticas cinza enquanto carrega (sem shimmer).
- **Toast**: retângulo escuro de cantos 10 px, sobe 8 px; vermelho para erro.
- **Diálogo**: entra subindo 8 px; no celular vira *sheet* de baixo.
- **Contagens no menu**: número em mono, vermelho contido sobre fundo claro, sem bolha cheia.
- **Régua do dia** (`components/ShiftRuler.tsx`) e **quadro de camas** (`components/BedBoard.tsx`).

## Casa ativa (Beta)

- Sem a marca DS Lodge: o símbolo das duas casas (telhado, três pessoas e mão, sem o texto) fica no menu e no login;
  o nome da casa ativa aparece só no cabeçalho.
- Cabeçalho e menu em tom claro da cor da casa: Amiens ocre (`#BC833C`), Connolly azul (`#507089` / `#072E4B`).
  O texto continua escuro (contraste AA); a cor pura só aparece em faixas (diálogos, item ativo do menu, seletor de casa).
- O seletor de casa no topo troca a casa na hora (Float), sem sair do sistema.

## Ícones

`lucide-react`, 16 px no menu (18 px nos demais), traço padrão, cor do texto apagado;
o item ativo do menu usa o acento. Nunca emoji na interface.

## Revisão 6 (25/11): visual "app de banco"

- Fonte **Plus Jakarta Sans** (400–800), números fortes e grandes.
- **Modo claro e escuro** (`src/theme.css`, `src/lib/theme.ts`): escuro por padrão no celular e no app instalado,
  claro no computador; o botão sol/lua no topo troca e a escolha fica guardada.
- **Cor da casa em tudo**: Amiens âmbar→cobre, Connolly azul→azul-marinho — cartão de destaque da Home, faixa sob a
  barra superior, nome da casa, item ativo do menu, seletor de casa, gráficos e botões. O resto é neutro.
- Cartões bem arredondados sem borda, botões e seletores em pílula, ícones do menu em círculos.

## Revisão 7 — texto sempre dentro da caixa e transições iOS/Mac

- Botões, campos e chips usam raio fixo de 22px (não mais 999px). Até 44px de altura continuam com forma de pílula; com várias linhas (ex.: turnos do Roster) viram cartões arredondados e o canto não corta o texto. Botões quebram palavras longas (`overflow-wrap:anywhere`) e não passam de 100% da largura. Abas não encolhem (a faixa rola). Guardado por `src/lib/textContainment.test.ts`; a varredura de todas as telas (celular/computador, claro/escuro) não achou texto fora da caixa.
- Transições (`src/lib/transition.ts` + `.content[data-transition]`): abrir detalhe = entra pela direita; voltar = entra pela esquerda; trocar de seção = esmaecer rápido com leve escala (Mac). Curva do iOS `cubic-bezier(.32,.72,0,1)`, 220–380ms. Janelas abrem com escala no computador e sobem como folha no celular. Respeita "reduzir movimento".

## Revisão 8 — paleta por casa, controles de seleção, interruptor das casas e menu em módulos

- Paleta canônica por casa e tema no fim de `src/theme.css` (`--bg`, `--surface`, `--hc`, `--on-hc`, `--hero`, `--on-hero`, `--hero-btn-ink`). Amiens = âmbar/areia; Connolly = gelo/azul. `src/lib/themeContrast.test.ts` exige AA (4,5:1) em todos os pares e que as casas não voltem a se parecer.
- Botão principal e item selecionado usam o gradiente da casa (`--hero`) com tinta `--on-hero`. O botão "No Shows" do topo usa fundo branco e tinta `--hero-btn-ink`.
- Abas: trilho com polegar deslizante; ponto de status (`idle/progress/done/danger`) no lugar do texto "· not started" (texto só para leitor de tela e `title`). Chips: contorno; selecionado = gradiente com ✓.
- Interruptor das casas (`HouseSwitch`): só Admin vê e alterna; conta de casa (station) vê apenas a sua casa e ignora a casa guardada no navegador.
- Menu lateral: módulos retraídos; o da rota ativa abre sozinho; o cabeçalho soma as pendências dos submódulos e cada submódulo mostra a sua (ex.: Occurrences 23 = Handover 10 + Maintenance 13). Estado guardado em `nav.open`.
- Handover: **Author** + até 3 colegas (`StaffPicker`: chip do autor com avatar, chips removíveis, "+ Add colleague n/4" com busca). Banco: `handover_entry_staff` (máx. 3 por anotação), `add_handover_note(... p_co_authors)`. Vocabulário revisto (Author, Time of occurrence, Raise maintenance request, Amend…).
- Filtros: `FilterBar` + `useUrlFilters` (filtros na URL, chips, Clear all, contagem). Handover procura em vários dias via `search_handover` (até 92 dias, 100 resultados); Maintenance e Warnings filtram no navegador.
- Abas não rolam a página (corrigido o `scrollIntoView`).
