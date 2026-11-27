# compras-e-fornecedores — Análise de código

Escala: 🟢 confirmado · 🟡 inferido · 🔴 lacuna. Abreviações (`supabase/migrations/`): `M11`=20261120000011_management · `RL`=20261121000013_range_limits · `BM`=20261124000017_beta_management · `RP`=20261125000020_report_purchases · `R15`=20261126000037_r15 · `M29`=20261125000029_house_scope · `M1`=20261120000001_foundation.

Escopo: tela Purchases (pedidos do Tesco), fornecedores e campos obrigatórios por fornecedor, vínculo entrega↔pedido, relatório de compras e o modelo **legado** de compras/produtos/movimentos (sem UI).

Há dois modelos coexistentes 🟢:
1. **Atual (Beta 4.1)**: `shop_items` / `shop_orders` / `shop_order_lines` (lista fixa do Tesco, pedido por data de entrega para as duas casas) — `BM:271-467`, evoluído por `R15:215-290`.
2. **Legado (Fase 3)**: `products` / `purchases` / `purchase_lines` / `product_movements` (compras por fornecedor texto, alocação por Lodge, transferências) — `M11:6-169`. Nenhuma chamada em `src/` (grep `create_purchase|upsert_product|allocate_purchase_line|transfer_product|purchase_prices`: só `auditLabels.ts:7-22` e testes) 🟢. Mantido no banco, testado em `tests/db/management.test.ts`.

## 1. Tela Purchases — `src/pages/Purchases.tsx`

Acesso: só gestão (leituras de `shop_*` têm RLS `is_management()` `BM:350-352`; todas as RPCs exigem `is_management()`) 🟢.

### 1.1 Estado e carga
- `loadBase` `:66-81`: carrega `shop_items` ativos ordenados por `sort_order` `:68`; últimos 30 `shop_orders` por `delivery_date desc` `:69`; busca fornecedores com `links_order=true` e, se houver, até 20 entregas desses fornecedores **sem pedido** (`order_id is null`) `:71-77` (caixa "entregas sem vínculo"). O pedido selecionado é preservado se ainda existir, senão o primeiro `:80`.
- `loadLines` `:83-89`: linhas do pedido; `useLatestRequest` descarta resposta velha.
- Totais no cliente `:137-139`: `total = Σ final_qty × unit_price` (só linhas com preço), `missingPrice` = linhas com `final_qty>0` sem preço, `toBuy` = linhas com `final_qty>0`.

### 1.2 Regra de quantidade final (cliente = banco) 🟢
`finalQty(standard, action, delta)` `:27-34` ≡ coluna gerada `shop_order_lines.final_qty` `BM:337-339`:
- `standard` → `standard_qty`; `more` → `standard_qty + delta`; `less` → `max(standard_qty - delta, 0)`; `dont` → `0`.
- UI otimista: recalcula localmente e chama `set_shop_line`; em erro, recarrega `:98-109`. Botões de ação `:287-289` mandam `delta = Number(delta) || 1` para more/less e `0` para standard/dont; o campo numérico (3 dígitos) grava no `onBlur` `:292-294`.
- Preço: `parsePrice` `:37-42` (vazio → null; vírgula aceita; `^\d{1,5}(\.\d{1,2})?$`, inválido → `undefined` e o campo marca `aria-invalid`) `:300-302`. Subtotal por linha = `parsed × final_qty` `:274`, formatado por `formatEUR` (`src/lib/management.ts:12-15`, `Intl.NumberFormat` EUR).

### 1.3 Status do pedido — máquina de estados 🟢
`OrderStatus = created | placed | awaiting | delivered` `:19`. Botões `:211-213`:
- `created` → "Mark placed" (`set_shop_order_status('placed')`);
- `placed` → "Mark awaiting" (`'awaiting'`) e "Reopen" (volta a `created`);
- `awaiting` → "Back to placed" (volta a `placed`);
- `delivered` → só informação (`deliveredInfo`: quem e quando) `:214`. Não há botão para sair de `delivered`.
Mudança de data de entrega ou notas usa `set_shop_order` `:111-119` (envia `p_placed = patch.placed ?? status !== 'created'`, de modo que editar data não altera o status).

### 1.4 Criação e lista fixa
- `NewOrderDialog` `:320-340`: data padrão = amanhã (`addDays(operationalDay(new Date()),1)`) `:322`; chama `create_shop_order` `:326`.
- `ItemDialog` `:342-378`: nome, categoria (datalist), qtd padrão (`^\d{1,3}$`), ação padrão buy/dont_buy, link Tesco (`type=url`) → `update_shop_item` `:351-353`. Não há ação de desativar/remover item na UI nem na RPC (`active` nunca é alterado) 🔴.
- Link do Tesco abre com `rel="noreferrer noopener"` `:166,282`.

### 1.5 Vincular entrega a pedido
`UnlinkedRow` `:381-396` lista pedidos em `placed`/`awaiting` `:200`; `link()` `:129-135` chama `link_delivery_to_order` e seleciona o pedido vinculado.

## 2. RPCs do modelo atual (todas `security definer`, `search_path = public`, `revoke ... from public, anon; grant ... to authenticated`)

| RPC | Definição vigente | Regras |
|---|---|---|
| `create_shop_order(p_delivery, p_notes)` | `BM:354-375` | gestão; data finita entre `current_date-30` e `+366` (`invalid_date`); cria o pedido e **uma linha por item ativo** copiando `default_qty`; `standard` se `default_action='buy'`, senão `dont` `:370-372` |
| `set_shop_line(p_line, p_action, p_delta, p_unit_price)` | `BM:377-394` | gestão; ação ∈ {standard,more,less,dont} (`invalid_action`); delta 0–999 (`invalid_quantity`); preço 0–99999 (`invalid_price`); `delta` zerado fora de more/less; `unit_price = round(.,2)`; linha inexistente → `line_not_found`. **Não verifica o status do pedido** (linha de pedido `delivered` continua editável) 🟡 |
| `set_shop_order(p_order, p_delivery, p_notes, p_placed)` | `R15:223-236` (substitui `BM:396-414`) | gestão; data entre ±366 dias de hoje; `status`: mantém `awaiting/delivered`, senão `placed` se `p_placed` else `created`; `placed_at` preservado/definido conforme `:233` |
| `set_shop_order_status(p_order, p_status)` | `R15:238-250` | gestão; `p_status ∈ {created,placed,awaiting}` (`invalid_status`; **não aceita `delivered`** — só o vínculo entrega o pedido); `for update`; pedido `delivered` → `order_delivered`; `placed_at = null` ao voltar a `created`, senão `coalesce(placed_at, now())` |
| `update_shop_item(...)` | `BM:416-444` | gestão; nome/categoria obrigatórios (`name_required`); qtd 0–999; ação buy/dont_buy; URL deve ser `https://` (`invalid_url`); `p_id null` → insere com `sort_order = max+1`; senão update (`item_not_found`). Não altera `image_path` |
| `shop_order_total(p_order)` | `BM:446-460` | gestão; `jsonb {total, items, lines_without_price}` (Σ `final_qty*unit_price`) — **não usada pela UI** (o total é recalculado no cliente) 🟢 |
| `link_delivery_to_order(p_delivery, p_order)` | `R15:252-280` | ver §3 |
| `report_purchases(p_from, p_to)` | `RP:2-26` + patch `R15:283-290` | ver §5 |

## 3. `link_delivery_to_order` — algoritmo 🟢 (`R15:252-280`)
1. Exige `current_staff_id()` e `is_management()` (`not_authorised`).
2. Trava a entrega (`for update`); inexistente → `delivery_not_found`; já vinculada (`order_id` não nulo) → `already_linked` (23505).
3. O fornecedor da entrega precisa ter `links_order = true` (`delivery_not_linkable`).
4. Trava o pedido; inexistente → `order_not_found`; precisa estar em `placed` ou `awaiting` (`order_not_open`).
5. Efeitos: `food_deliveries.order_id = pedido`; `shop_orders.status='delivered'`, `delivered_at = entrega.received_at`, `delivered_by = entrega.received_by`, `delivery_id = entrega.id` `:273-274`.
6. Nota automática no Handover do Lodge da entrega: `kind='note'`, corpo `"Tesco order for DD/MM/YYYY delivered: received by <nome> at DD/MM/YYYY HH24:MI."` (hora em `Europe/Dublin`), `occurred_at = received_at`, menção de `staff_id` do recebedor; e tag `delivery` em `handover_entry_tags` `:275-279`.
7. `v_lines` (contagem de linhas com quantidade) é calculada `:259,272` mas **não utilizada** (código morto) 🟢.
- A ligação é 1 entrega ↔ 1 pedido (`order_id` na entrega e `delivery_id` no pedido). Não existe RPC de desvincular 🔴.
- Não verifica coerência de Lodge/data entre entrega e pedido (pedido é global, "as duas casas juntas" `BM:271-273`) 🟡.

## 4. Fornecedores — `suppliers`
- Cadastro/edição na tela Structure (`src/pages/Structure.tsx:366-396`, via `useSuppliers(false)`); seleção na entrega via `useSuppliers(true)` (`Deliveries.tsx:22-32,128`). Remover = `update_supplier(..., p_active=false)` (restaurar = true) `Structure.tsx:387,395`.
- `add_supplier(p_name, p_batch, p_best_before, p_temperature, p_links_order)` `R15:131-144`: gestão; nome ≠ vazio (`name_required`), ≤ 40 (`invalid_name`), único case-insensitive (`supplier_exists` 23505, também por índice `suppliers_name_unique` `R15:117`); `sort_order = max+1`.
- `update_supplier(p_id, ..., p_active)` `R15:146-161`: mesmas validações (exclui o próprio id); `coalesce` nos flags (null mantém); `version = version+1`; inexistente → `supplier_not_found`; **propaga o novo nome** para `food_deliveries.supplier` `:160`.
- **Campos obrigatórios por fornecedor** 🟢: `require_batch`, `require_best_before`, `require_temperature` (aplicados em `record_food_delivery` `R15:195-197`, e espelhados no cliente `Deliveries.tsx:134-138`); `links_order` liga o fornecedor ao fluxo de pedidos (notificação `delivery_received` + caixa de vínculo). Sementes: **Tesco** (`links_order`, nada obrigatório) e **Ripley's** (lote + best before) `R15:123-125`.
- Fornecedor inativo: não pode receber entrega (`supplier_inactive`) mas o histórico permanece.
- Parâmetro `delivery.expiry_alert_days` (padrão 3; 0–60): alerta de validade — detalhado em `servicos-da-casa/code-analysis.md` §5.

## 5. Relatório de compras — `report_purchases(p_from, p_to)` 🟢
`RP:2-26`: gestão; `check_period(array[gen_random_uuid()], p_from, p_to)` valida o intervalo; considera `shop_orders` com `delivery_date >= p_from and < p_to` e linhas com `final_qty > 0`. Retorna `orders`, `placed` (apenas status `placed`), `by_status {created, placed, awaiting, delivered}` (injetado por `R15:283-290` via `pg_get_functiondef` + `replace`), `items` (Σ qtd), `total` (Σ qtd×preço), `lines_without_price`, `by_category` (ordenado por total desc) e `top_items` (8 maiores por total, depois qtd). Consumido em `src/pages/Reports.tsx:105` (categoria "purchases"). O relatório **não filtra por status**: pedidos `created` entram em `items`/`total` 🟡.

## 6. Modelo legado (sem UI) 🟢
- `upsert_product` `M11:42-62`: gestão; `p_id null` → insert com *upsert* por nome (`on conflict (lower(name))` reativa o produto) senão update.
- `create_purchase(p_supplier, p_on, p_document, p_lines)` versão vigente `RL:413-444`: gestão; fornecedor texto obrigatório (`supplier_required`); `p_lines` array não vazio (`lines_required`); cada linha valida `product_id` (regex UUID e existência), `quantity` 0,001–1.000.000 (até 3 casas), `unit_price` ≤ 1.000.000 (até 4 casas) → `invalid_line`; `purchased_on` padrão `current_date`.
- `purchase_prices(p_purchase)` `M11:88-106`: gestão; devolve linhas com `line_total` e `purchase_total` (`sum() over ()`) + `document_ref`. Preço e documento só gestão (colunas fora do `grant select` `M11:708-709`).
- `allocate_purchase_line(p_line, p_lodge, p_quantity)` vigente `M29:192-215`: `can_see_lodge` + `can_write_lodge(lodge)`; trava a linha; `p_quantity > 0`; `Σ alocações + p_quantity <= quantity comprada` (`exceeds_purchased_quantity`); cria `product_movements(kind='allocation')`.
- `transfer_product(p_product, p_from, p_to, p_quantity, p_note)` vigente `RL:392-411`: origem ≠ destino (`same_lodge`); `can_write_lodge(origem) or (destino)`; quantidade (0, 1.000.000] (`invalid_quantity`); `kind='transfer'` (sem preço; "transferência não é nova despesa" `M11:109`).
- Arredondamento do total da linha: coluna gerada `round(quantity*unit_price, 2)` (arredonda meio centavo para cima) `M11:34`; cliente equivalente `lineTotal` em `src/lib/management.ts:6-10` (compensa ruído de ponto flutuante).

## 7. Riscos e inconsistências 🟡
1. `set_shop_line` edita pedidos `delivered`; sem trilha de status (auditoria `audit_shop_order_lines` registra).
2. `link_delivery_to_order` não é reversível; sem RPC para corrigir vínculo errado.
3. `report_purchases` soma pedidos ainda `created` (rascunho).
4. `set_shop_order` aceita data de entrega até 366 dias no passado (`R15:227`), enquanto `create_shop_order` só 30 dias (`BM:364`).
5. Dependência de texto exato em *patches* via `pg_get_functiondef` (`R15:283-290`, `R15:165-172`).
6. Modelo legado de compras sem UI: risco de código morto/divergência (ver questions.md).

## 8. Testes de referência
`src/pages/Purchases.test.tsx`, `src/pages/management.ui.test.tsx`, `tests/db/beta-management.test.ts:29-72` (itens/linhas/total), `tests/db/r15.test.ts:125-216` (fornecedores, validade, vínculo, status), `tests/db/management.test.ts:41-77,180-189` (legado), `tests/e2e/scenarios-r15.e2e.cjs`.
