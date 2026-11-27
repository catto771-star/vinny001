# Histórias de usuário — painel-relatorios-e-auditoria

## US-PNL-01 Ver a Home do turno (RF-01) 🟢
```gherkin
Cenário: conta da casa
  Dado conta da casa Amiens com próximo check às 12:00
  Quando abro a Home
  Então vejo "Next check" levando a /sheet e o cartão "On duty" da Rota

Cenário: gestão sem posto
  Quando um Admin abre a Home
  Então o botão primário leva a /no-shows
```

## US-PNL-02 Acompanhar o painel por período (RF-02) 🟢
```gherkin
Cenário: período padrão
  Quando abro o painel
  Então vejo os últimos 14 dias com ocupação, admissões, saídas, No Shows e manutenção

Cenário: período inválido
  Quando informo intervalo maior que 365 dias
  Então o front não envia e o servidor recusaria com invalid_period

Cenário: cama com Out decidido
  Dado uma estadia out_pending
  Quando vejo a casa
  Então a cama conta como livre e a legenda indica cancelamento decidido
```

## US-PNL-03 Ver pendências (RF-03) 🟢
```gherkin
Cenário: contadores
  Dado 2 checks pendentes e 1 chamado aberto
  Quando abro a Home
  Então o PendingTile mostra as duas linhas com link para /sheet e /maintenance

Cenário: isolamento por casa
  Dado conta da casa Amiens
  Quando pede pending_counts de Connolly
  Então recebe not_authorised
```

## US-PNL-04 Consultar relatórios (RF-04, RF-06) 🟢
```gherkin
Cenário: warnings clicáveis
  Dado warnings registrados no mês
  Quando abro Reports > presence
  Então vejo "warning" e "final_warning" e posso abrir a lista de detalhe

Cenário: split por casa
  Quando seleciono as duas casas
  Então cada métrica mostra "AMIENS n · CONNOLLY m"

Cenário: casa sem Dinner
  Quando seleciono só Connolly
  Então o bloco dinner não aparece

Cenário: período inválido
  Quando o intervalo excede 400 dias
  Então recebo invalid_period
```

## US-PNL-05 Relatório de compras (RF-05) 🟢
```gherkin
Cenário: contagem por status
  Quando abro Reports > purchases
  Então vejo contagens created, placed, awaiting e delivered e aviso de linhas sem preço
```

## US-PNL-06 Pesquisar a auditoria (RF-07, RF-08) 🟢
```gherkin
Cenário: mudanças recentes
  Dado que sou Admin
  Quando filtro módulo "residents" e ação UPDATE
  Então vejo diffs antes→depois sem version, id e created_at

Cenário: busca com símbolos
  Quando busco "100%"
  Então % é tratado como texto

Cenário: período longo
  Quando escolho 400 dias
  Então recebo range_too_large

Cenário: sem permissão
  Quando uma conta da casa chama search_audit
  Então recebe not_authorised
```

## US-PNL-07 Exportar CSV (RF-07) 🟢
```gherkin
Cenário: exportar linhas carregadas
  Dado 2 páginas carregadas
  Quando exporto
  Então o arquivo audit-AAAA-MM-DD.csv traz só essas linhas, com BOM e cabeçalho em inglês

Cenário: injeção de fórmula
  Dado um valor "=cmd()"
  Quando exporto
  Então a célula é prefixada com apóstrofo
```

## US-PNL-08 Ver leituras de perfil (RF-08) 🟢
```gherkin
Cenário: aba reads
  Quando abro a aba "reads"
  Então vejo "opened profile of X" com autor e horário
```
