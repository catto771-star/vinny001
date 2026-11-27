# ADR-0010: Compras: lista fixa do Tesco com pedidos por status e vínculo à entrega (substitui o modelo de produtos/compras)

- **Status:** aceito (retroativo, reconstruído do histórico Git e do código)
- **Data (commit):** 2026-11-24
- **Evidências:** 0979779 (Beta 4), fc715f3 (Revisão 15), migrations 17 e 37
- **Confiança:** 🟢

## Contexto
O primeiro modelo (products/purchases/movimentos entre Lodges) foi trocado pela lista fixa de 27 produtos do Tesco; 'Remove a distribuição de compras por Lodge' (0979779).

## Decisão
`shop_items`, `shop_orders` (`created→placed→awaiting→delivered`), `shop_order_lines` com preço; `link_delivery_to_order` liga uma entrega de fornecedor com `links_order` a um pedido e marca `delivered`, gerando nota no Handover (tag `delivery`).

## Consequências
O modelo legado permanece no banco sem uso no front. `delivered` é terminal e sem desvinculação. Valores de preços ficam fora do repositório (`_reversa_sdd/_pricing/` é ignorado — c8759d2).
