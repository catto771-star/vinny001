# Histórias de usuário — interface-e-i18n

## US-UI-01 Navegar pelo menu conforme meu papel (RF-01) 🟢
```gherkin
Cenário: conta da casa
  Dado uma conta station
  Quando abro o app no celular
  Então a barra inferior mostra Home, Room Check, Handover, Residents e Menu

Cenário: Admin
  Dado um Admin
  Então a barra mostra Home, Alerts, Presence, Log e More e o menu inclui Rota, Purchases, Hours, Reports, Users, Audit

Cenário: badges
  Dado 120 pendências
  Então o badge exibe "99+"
```

## US-UI-02 Alternar de casa (RF-01) 🟢
```gherkin
Cenário: Admin com duas casas
  Quando uso o HouseSwitch (setas navegam)
  Então a casa ativa e o tema por casa mudam

Cenário: conta da casa
  Então não há seletor e a casa é sempre a própria
```

## US-UI-03 Tema claro/escuro (RF-04) 🟢
```gherkin
Cenário: padrão
  Dado app instalado ou tela estreita (<720 px)
  Então o tema inicial é escuro; caso contrário, claro

Cenário: escolha manual
  Quando escolho um tema
  Então é guardado em ui.theme e aplicado ao meta theme-color
```

## US-UI-04 Ver mensagens de erro compreensíveis (RF-06) 🟢
```gherkin
Cenário: exceção mapeada
  Quando a RPC levanta bed_occupied
  Então vejo a mensagem correspondente de errors.*

Cenário: exceção desconhecida
  Quando chega um erro sem regra
  Então vejo errors.generic

Cenário: erro de rede
  Quando "Failed to fetch"
  Então vejo errors.network
```

## US-UI-05 Mensagem correta de recusa (RF-06) 🟢 bug confirmado
```gherkin
Cenário: não autorizado
  Dado que uma RPC levanta not_authorised
  Quando o erro é exibido
  Então deveria ser "not authorised"
  # Comportamento atual: aparece "Author only…" (regra /not_author/ casa primeiro)
```

## US-UI-06 Ver horas no fuso de Dublin (RF-07) 🟢
```gherkin
Cenário: dia operacional
  Dado 06:30 de Dublin
  Então operationalDay pertence ao dia anterior

Cenário: horário de verão
  Dado a transição de primavera
  Então um horário inexistente avança ao primeiro existente

Cenário: relógio do aparelho errado
  Quando o relógio do aparelho está atrasado
  Então a UI usa o relógio do servidor (serverOffsetMs)
```

## US-UI-07 Compartilhar filtros por URL (RF-08) 🟢
```gherkin
Cenário: filtro na URL
  Quando filtro por prioridade "urgent" em Maintenance
  Então a URL leva ?priority=urgent e recarregar mantém o filtro

Cenário: valor inválido
  Quando a URL traz um select desconhecido
  Então é descartado

Cenário: busca sem acentos
  Quando busco "joao"
  Então "João" casa (NFD, sem caixa, AND por palavras)
```

## US-UI-08 Imprimir folhas (RF-10) 🟢
```gherkin
Cenário: impressão
  Quando imprimo a folha
  Então a navegação some e a página sai em A4 paisagem preto e branco
```
