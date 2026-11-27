# Spec — compras-e-fornecedores

> Redator Reversa · doc_level=completo · pt-br · 🟢/🟡/🔴. Siglas: `BM`=beta_management (M17 de 24/11), `R15`=`20261126000037_r15` (M37), `RP`=report_purchases, `RL`=range_limits. Fontes: `modules/compras-e-fornecedores/*`, `findings-verification.md` (#2), ADR 0010.

## 1. Objetivo
Gerir pedidos do Tesco a partir de uma lista fixa de itens (por data de entrega, para as duas casas juntas), fornecedores com campos obrigatórios por fornecedor, vínculo entrega↔pedido e o relatório de compras. Existe ainda um **modelo legado** (products/purchases/purchase_lines/product_movements) sem UI. 🟢

## 2. Atores
Somente gestão (RLS `is_management()` nas tabelas `shop_*` e em todas as RPCs). Conta da casa registra entregas (módulo servicos-da-casa). 🟢

## 3. Requisitos funcionais
**RF-01 Criar pedido (`create_shop_order`).** Data entre hoje−30 e hoje+366 (`invalid_date`); cria uma linha por item ativo copiando `default_qty` e `default_action` (`standard` se buy, senão `dont`). UI: data padrão = amanhã. 🟢

**RF-02 Editar linha (`set_shop_line`).** Ação ∈ standard/more/less/dont (`invalid_action`), delta 0–999, preço 0–99999 (`invalid_price`); `final_qty` é coluna gerada: standard→`standard_qty`; more→+delta; less→`max(standard−delta,0)`; dont→0 (cliente espelha em `finalQty`). Não verifica o status do pedido: linha de pedido `delivered` continua editável. 🟢 / 🟡

**RF-03 Status do pedido.** `set_shop_order_status` aceita `created|placed|awaiting` (não `delivered`); pedido `delivered` → `order_delivered`; voltar a `created` zera `placed_at`. `set_shop_order` altera data/notas sem mudar o status. 🟢

**RF-04 Itens (`update_shop_item`).** Nome/categoria obrigatórios, qtd 0–999, ação buy|dont_buy, URL `https://` (`invalid_url`); `p_id` nulo insere. Não existe desativar item (UI nem RPC). 🔴

**RF-05 Fornecedores.** `add_supplier`/`update_supplier`: nome ≤40, único case-insens. (`supplier_exists`), flags `require_batch`, `require_best_before`, `require_temperature`, `links_order`; remover = `active=false`; renomear propaga a `food_deliveries.supplier`. Sementes: Tesco (`links_order`), Ripley's (lote + validade). 🟢

**RF-06 Vincular entrega a pedido (`link_delivery_to_order`).** Exige gestão; entrega inexistente → `delivery_not_found`; já vinculada → `already_linked`; fornecedor com `links_order` (`delivery_not_linkable`); pedido `placed|awaiting` (`order_not_open`). Efeitos: `order_id`, `status='delivered'`, `delivered_at/by`, `delivery_id`; nota "Tesco order for DD/MM/YYYY delivered: received by … at …" no Handover do Lodge da entrega, com tag `delivery`. Irreversível (sem desvínculo). 🟢 / 🔴

**RF-07 Total do pedido.** Cliente soma `final_qty × unit_price`; `shop_order_total` existe mas não é usada pela UI. 🟢

**RF-08 Relatório de compras (`report_purchases`).** Gestão; período validado por `check_period`; pedidos com `delivery_date` em `[from,to)`; linhas com `final_qty>0`. Retorna `orders`, `placed`, **`by_status {created, placed, awaiting, delivered}`**, `items`, `total`, `lines_without_price`, `by_category`, `top_items` (8). 🟢
- Veredito #2 REFUTADO (achado original: "front lê `by_status` que a RPC não devolve"): `R15:283-291` aplica `replace` sobre a definição vigente e acrescenta `by_status`; a CTE não filtra status, logo inclui rascunho (`created`). Risco residual 🟡: nenhum teste cobre `by_status` e `Reports.tsx:34` usa `?.[s] ?? 0`, o que mascararia uma falha.

**RF-09 Modelo legado (sem UI).** `upsert_product`, `create_purchase`, `purchase_prices`, `allocate_purchase_line`, `transfer_product`. Sem chamada em `src/` (só testes e demo). Ainda é requisito? 🔴

## 4. Regras de negócio
RN-01 Máquina de estados: `created→placed→awaiting`, `placed→created`, `awaiting→placed`, `placed|awaiting→delivered` (só por vínculo); `delivered` terminal. 🟢
RN-02 Total e subtotal usam arredondamento de 2 casas (`round(qty*price,2)`); cliente compensa ruído de ponto flutuante (`lineTotal`). 🟢
RN-03 Preço `parsePrice`: vazio→null; `^\d{1,5}(\.\d{1,2})?$`, vírgula aceita. 🟢
RN-04 `unit_price` e `document_ref` são visíveis só à gestão. 🟢
RN-05 Pedido é global ("as duas casas juntas"); o vínculo não valida Lodge/data da entrega. 🟡
RN-06 `set_shop_order` aceita data até 366 dias no passado; `create_shop_order` só 30. 🟡

## 5. Dados
`suppliers`, `shop_items`, `shop_orders`, `shop_order_lines` (`final_qty` gerada), colunas `food_deliveries.supplier_id/order_id`; legado `products`, `purchases`, `purchase_lines`, `product_movements`. Dicionário em `modules/compras-e-fornecedores/data-dictionary.md`. 🟢

## 6. Interfaces
Rota `/purchases` (só gestão). RPCs: `create_shop_order`, `set_shop_line`, `set_shop_order`, `set_shop_order_status`, `update_shop_item`, `shop_order_total`, `link_delivery_to_order`, `add_supplier`, `update_supplier`, `report_purchases` + legado. Contratos em `rpc-contracts.md`. 🟢

## 7. Estados
`state-machines.md §10`. 🟢

## 8. Permissões
Tudo gestão (`is_management()`); `allocate_purchase_line` e `transfer_product` usam `can_see/can_write_lodge`. 🟢

## 9. Casos de borda
- EB-01 `v_lines` calculada em `link_delivery_to_order` e não usada (código morto). 🟢
- EB-02 `set_shop_line` em pedido `delivered` / sem trilha de status. 🟡
- EB-03 Itens criados depois não aparecem em pedidos já criados. 🟡
- EB-04 O relatório soma pedidos `created` (rascunho); decisão de produto pendente. 🔴
- EB-05 Patches por `pg_get_functiondef`+`replace` (R15) falham em silêncio se o texto não casar. 🟡

## 10. Requisitos não funcionais
`useLatestRequest`; atualização otimista com recarga em erro; links do Tesco com `rel="noreferrer noopener"`; RLS de leitura só gestão. 🟢

## 11. Contradições anotadas
- O módulo (`code-analysis` §5, painel §5.7) registrou a ausência de `by_status`; o Detetive **refutou** — vale `by_status` presente. 🟢

## 12. Lacunas 🔴
Desativação de itens; desvínculo/correção de entrega vinculada; escopo do modelo legado; inclusão de rascunhos no relatório.

## 13. Rastreabilidade
`src/pages/Purchases.tsx`, `Structure.tsx` (fornecedores), `Deliveries.tsx`, `src/lib/management.ts`; SQL `M11, RL, BM, RP, M29, R15`; testes `Purchases.test.tsx`, `management.ui.test.tsx`, `tests/db/beta-management.test.ts`, `r15.test.ts`, `management.test.ts`.
