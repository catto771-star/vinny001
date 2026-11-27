# compras-e-fornecedores — Fluxogramas

Legenda: 🟢 confirmado (referências arquivo:linha em `code-analysis.md`).

## 1. Ciclo de vida do pedido (máquina de estados) 🟢
```mermaid
stateDiagram-v2
  [*] --> created: create_shop_order (cria linhas p/ itens ativos)
  created --> placed: set_shop_order_status('placed') / set_shop_order(p_placed=true)
  placed --> awaiting: set_shop_order_status('awaiting')
  placed --> created: Reopen (set_shop_order_status('created'), placed_at=null)
  awaiting --> placed: Back to placed
  placed --> delivered: link_delivery_to_order
  awaiting --> delivered: link_delivery_to_order
  delivered --> [*]: terminal (order_delivered bloqueia mudanças de status)
```

## 2. Montar o pedido (Purchases.tsx) 🟢
```mermaid
flowchart TD
  A[New order: data de entrega padrão amanhã + notas] --> B[rpc create_shop_order]
  B --> C{Data entre hoje-30 e hoje+366?}
  C -- não --> X1[[invalid_date]]
  C -- sim --> D[insere shop_orders status=created]
  D --> E[para cada shop_items ativo: linha standard_qty=default_qty, action standard ou dont]
  E --> F[UI: lista por categoria]
  F --> G{Ação na linha}
  G -- standard/dont --> H[set_shop_line delta=0]
  G -- more/less --> I[delta 0-999]
  H --> J[final_qty gerada pelo banco e recalculada no cliente]
  I --> J
  F --> K[Preço unitário vazio ou até 2 casas]
  K --> L[set_shop_line unit_price arredondado a 2 casas]
  J --> M[Cliente soma total = Σ final_qty × preço; conta linhas sem preço]
  L --> M
```

## 3. Receber entrega e vincular ao pedido 🟢
```mermaid
flowchart TD
  A[Deliveries: record_food_delivery com fornecedor links_order] --> B[food_deliveries.order_id = null]
  B --> C[notifications delivery_received -> gestão]
  B --> D[Purchases: caixa Entregas sem vínculo lista até 20]
  D --> E[Gestão escolhe pedido placed ou awaiting]
  E --> F[rpc link_delivery_to_order]
  F --> G{Gestão?}
  G -- não --> X0[[not_authorised]]
  G -- sim --> H{Entrega existe?}
  H -- não --> X1[[delivery_not_found]]
  H -- sim --> I{Já vinculada?}
  I -- sim --> X2[[already_linked]]
  I -- não --> J{Fornecedor tem links_order?}
  J -- não --> X3[[delivery_not_linkable]]
  J -- sim --> K{Pedido existe e está placed/awaiting?}
  K -- não --> X4[[order_not_found / order_not_open]]
  K -- sim --> L[food_deliveries.order_id = pedido]
  L --> M[shop_orders: status=delivered, delivered_at=received_at, delivered_by=received_by, delivery_id]
  M --> N[Handover do Lodge: nota 'Tesco order for DD/MM/YYYY delivered: received by X at ...' + tag delivery]
```

## 4. Cadastro de fornecedor e efeito nos campos obrigatórios 🟢
```mermaid
flowchart TD
  A[Structure > Suppliers: Add/Edit] --> B[add_supplier / update_supplier]
  B --> C{Gestão? nome 1-40 car.? nome único case-insensitive?}
  C -- não --> X1[[not_authorised / name_required / invalid_name / supplier_exists]]
  C -- sim --> D[grava flags require_batch, require_best_before, require_temperature, links_order]
  D --> E[update_supplier: propaga novo nome em food_deliveries.supplier]
  D --> F[Deliveries > DeliveryDialog: campos exigidos conforme flags]
  F --> G[record_food_delivery revalida no servidor]
  G --> H{links_order?}
  H -- sim --> I[delivery_received + vínculo a pedido]
  H -- não --> J[só registro]
  G --> K{expiry <= hoje + delivery.expiry_alert_days?}
  K -- sim --> L[delivery_expiring -> gestão]
```

## 5. Relatório de compras 🟢
```mermaid
flowchart LR
  A[Reports: categoria purchases] --> B[rpc report_purchases from to]
  B --> C{Gestão e intervalo válido check_period?}
  C -- não --> X[[not_authorised / período inválido]]
  C -- sim --> D[pedidos com delivery_date em from..to]
  D --> E[linhas com final_qty > 0]
  E --> F[orders, placed, by_status, items, total, lines_without_price]
  E --> G[by_category por total desc; top_items 8]
```
