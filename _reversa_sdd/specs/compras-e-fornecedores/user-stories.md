# Histórias de usuário — compras-e-fornecedores

## US-CMP-01 Criar pedido do Tesco (RF-01) 🟢
```gherkin
Cenário: pedido com a lista fixa
  Dado itens ativos na lista do Tesco
  Quando crio um pedido para amanhã
  Então nasce uma linha por item com a quantidade padrão e ação standard ou dont

Cenário: data fora do limite
  Quando escolho data 40 dias no passado
  Então recebo invalid_date
```

## US-CMP-02 Ajustar quantidades e preços (RF-02, RF-07) 🟢
```gherkin
Cenário: comprar mais
  Dado quantidade padrão 2
  Quando escolho "more" com delta 3
  Então final_qty = 5

Cenário: comprar menos além do zero
  Dado quantidade padrão 2
  Quando escolho "less" com delta 5
  Então final_qty = 0

Cenário: preço inválido
  Quando digito "12,345"
  Então o campo marca aria-invalid e nada é salvo

Cenário: linhas sem preço
  Quando há linhas com final_qty>0 sem preço
  Então o total mostra aviso de linhas sem preço
```

## US-CMP-03 Avançar o pedido (RF-03) 🟢
```gherkin
Cenário: marcar feito
  Dado pedido "created"
  Quando clico "Mark placed"
  Então status="placed" e placed_at é preenchido

Cenário: reabrir
  Dado "placed"
  Quando clico "Reopen"
  Então volta a "created" e placed_at é zerado

Cenário: pedido entregue
  Dado "delivered"
  Quando tento alterar o status
  Então recebo order_delivered
```

## US-CMP-04 Cadastrar fornecedor com campos obrigatórios (RF-05) 🟢
```gherkin
Cenário: nome duplicado
  Dado fornecedor "Tesco"
  Quando crio "tesco"
  Então recebo supplier_exists

Cenário: desativar
  Quando removo um fornecedor
  Então active=false e o histórico permanece

Cenário: renomear
  Quando renomeio o fornecedor
  Então food_deliveries.supplier de entregas antigas é atualizado
```

## US-CMP-05 Vincular entrega ao pedido (RF-06) 🟢
```gherkin
Cenário: vínculo válido
  Dado entrega do Tesco sem pedido e pedido "placed"
  Quando vinculo
  Então o pedido vira "delivered", a entrega recebe order_id e surge nota no Handover com a tag delivery

Cenário: entrega já vinculada
  Quando vinculo de novo
  Então recebo already_linked

Cenário: fornecedor sem links_order
  Quando tento vincular entrega de Ripley's
  Então recebo delivery_not_linkable

Cenário: pedido não elegível
  Dado pedido "created"
  Quando vinculo
  Então recebo order_not_open
```

## US-CMP-06 Relatório de compras (RF-08) 🟢
```gherkin
Cenário: totais por status
  Dado pedidos created, placed, awaiting e delivered no período
  Quando abro Reports > purchases
  Então vejo total, por categoria, top 8 itens e contagem por status (incluindo created)

Cenário: período inválido
  Quando informo to <= from
  Então recebo invalid_period
```
