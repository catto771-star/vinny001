# compras-e-fornecedores — Dicionário de dados

Escala: 🟢 confirmado · 🟡 inferido · 🔴 lacuna. Abreviações: `M11`=20261120000011_management · `RL`=20261121000013_range_limits · `BM`=20261124000017_beta_management · `R15`=20261126000037_r15 · `M29`=20261125000029_house_scope. Todas as tabelas têm trigger `audit_row()` (`audit_<tabela>`), RLS ligada e `revoke all` de `anon, authenticated` com `grant select` (escrita só por RPC) 🟢.

## A. Modelo atual (Beta)

### `suppliers` (`R15:105-122`)
| Coluna | Tipo | Null | Default / constraint |
|---|---|---|---|
| id | uuid PK | não | `gen_random_uuid()` |
| name | text | não | `check (length(trim(name))>0 and char_length(name)<=40)`; índice único `suppliers_name_unique (lower(name))` |
| active | boolean | não | `true` (remoção lógica) |
| require_batch | boolean | não | `false` — exige `batch` na entrega |
| require_best_before | boolean | não | `false` — exige `expiry_date` na entrega |
| require_temperature | boolean | não | `false` — exige `temperature` na entrega |
| links_order | boolean | não | `false` — entrega vira vínculo com pedido + notificação `delivery_received` |
| sort_order | integer | não | `0`; RPC usa `max+1` |
| created_at | timestamptz | não | `now()` |
| version | integer | não | `1`; `update_supplier` faz `version+1` |
Sementes: `Tesco` (links_order=true), `Ripley's` (require_batch, require_best_before) `R15:123-125`. RLS: `suppliers_read` (equipe ativa) — **leitura aberta a toda a equipe**, escrita só gestão por RPC.

### `shop_items` (`BM:274-288`)
| Coluna | Tipo | Null | Default / constraint |
|---|---|---|---|
| id | uuid PK | não | gen_random_uuid |
| sort_order | integer | não | `0` |
| category | text | não | `check (length(trim(category))>0)` |
| name | text | não | `check (length(trim(name))>0)`; único parcial `shop_items_name_unique (lower(name)) where active` |
| default_qty | integer | não | `1`, `check between 0 and 999` |
| default_action | text | não | `'buy'`, `check in ('buy','dont_buy')` |
| tesco_url | text | sim | `check (tesco_url is null or tesco_url ~ '^https://')` |
| image_path | text | sim | caminho estático `/products/<slug>.jpg` (só sementes) |
| active | boolean | não | `true` |
| version | integer | não | `1`; trigger `bump_version` (`stale_version` se divergir) |
Semente: 27 itens em 4 categorias (Dairy & Chilled, Meals & Bakery, Drinks & Groceries, Cleaning & Hygiene) `BM:290-317`; `dont_buy` padrão: Salt, Dish Sponge, Hand Soap. Quantidades padrão = média histórica editável (ex.: Milk 18, Frozen Meals 22) 🟢. RLS `shop_items_read`: **somente gestão** `BM:350`.

### `shop_orders` (`BM:319-328` + `R15:216-221`)
| Coluna | Tipo | Null | Default / constraint |
|---|---|---|---|
| id | uuid PK | não | |
| delivery_date | date | não | validada nos RPCs (create: hoje-30..+366; set_order: ±366) |
| notes | text | sim | `nullif(trim(),'')` |
| status | text | não | **default `'created'`**; `check in ('created','placed','awaiting','delivered')` (era `draft/placed`; `draft` migrado para `created` `R15:216-218`) |
| created_by | uuid → staff | não | |
| created_at | timestamptz | não | `now()` |
| placed_at | timestamptz | sim | preenchido ao ir para `placed`/`awaiting`; null em `created` |
| delivered_at | timestamptz | sim | `= food_deliveries.received_at` no vínculo |
| delivered_by | uuid → staff | sim | `= food_deliveries.received_by` |
| delivery_id | uuid → food_deliveries | sim | entrega que concluiu o pedido |
RLS `shop_orders_read`: gestão `BM:351`.

### `shop_order_lines` (`BM:330-343`)
| Coluna | Tipo | Null | Default / constraint |
|---|---|---|---|
| id | uuid PK | não | |
| order_id | uuid → shop_orders | não | `on delete cascade` |
| item_id | uuid → shop_items | não | `unique (order_id, item_id)` |
| standard_qty | integer | não | `check >= 0` (cópia de `default_qty` no momento da criação) |
| action | text | não | `check in ('standard','more','less','dont')` |
| delta | integer | não | `0`, `check between 0 and 999` |
| final_qty | integer | — | **coluna gerada armazenada**: standard→`standard_qty`; more→`standard_qty+delta`; less→`greatest(standard_qty-delta,0)`; dont→`0` |
| unit_price | numeric(8,2) | sim | `check null or between 0 and 99999`; quantidade total em euros calculada fora (qtd × preço) |
RLS `shop_lines_read`: gestão `BM:352`. Uma nova linha de item criado depois de um pedido **não** aparece nesse pedido (linhas são criadas só em `create_shop_order`), e a UI ignora itens sem linha `Purchases.tsx:226` 🟡.

### Colunas adicionadas em `food_deliveries` que ligam ao módulo (`R15:127-129,221`)
`supplier_id uuid → suppliers` (null; backfill por nome) · `order_id uuid → shop_orders` (null) · `batch`/`expiry_date` agora **nullable**. Estrutura completa em `servicos-da-casa/data-dictionary.md`.

## B. Modelo legado (Fase 3, sem UI)

### `products` (`M11:9-17`)
`id` PK · `name text not null check (length(trim(name))>0)` · índice único `products_name_unique (lower(name))` · `unit text not null default 'un'` · `category text` · `active boolean default true` · `created_at`. RLS `products_read` (equipe ativa).

### `purchases` (`M11:19-26`)
`id` PK · `supplier text not null check (length(trim(supplier))>0)` (**texto livre**, sem FK para `suppliers`) · `purchased_on date not null` · `document_ref text` (documento financeiro: só gestão) · `created_by → staff` · `created_at`. `grant select` por coluna: `(id, supplier, purchased_on, created_by, created_at)` — `document_ref` oculto `M11:708`.

### `purchase_lines` (`M11:28-36`)
`id` PK · `purchase_id → purchases` · `product_id → products` · `quantity numeric(12,3) not null check (>0)` · `unit_price numeric(12,4) not null check (>=0)` (só gestão) · `line_total numeric(12,2) generated always as (round(quantity*unit_price, 2)) stored` (só gestão). `grant select (id, purchase_id, product_id, quantity)` `M11:709`. Índice `(purchase_id)`.

### `product_movements` (`M11:111-123`)
`id` PK · `kind text check in ('allocation','transfer')` · `product_id → products` · `purchase_line_id → purchase_lines` (null) · `from_lodge_id → lodges` (null) · `to_lodge_id → lodges` (not null) · `quantity numeric(12,3) check (>0)` · `note` · `created_by` · `created_at` · `check ((kind='transfer') = (from_lodge_id is not null))`. RLS: `movements_read` + restritiva `house_scope` `can_see_lodge(from) or can_see_lodge(to)` `M29:70-71`.

## Enumerações / valores de domínio
- `shop_orders.status`: `created` (criado) → `placed` (pedido feito no Tesco) → `awaiting` (aguardando entrega) → `delivered` (entregue, só via vínculo) 🟢. Rótulos i18n: `purchases.sCreated|sPlaced|sAwaiting|sDelivered` (`Purchases.tsx:21`).
- `shop_order_lines.action`: `standard`, `more`, `less`, `dont`. `shop_items.default_action`: `buy`, `dont_buy`.
- `product_movements.kind`: `allocation`, `transfer`.
- Handover: tag `delivery` (`handover_tags.code='delivery'`, `notify_default=false` `handover_tags_push:17`) e nota automática do vínculo.

## Parâmetros
`delivery.expiry_alert_days` (3; 0–60) — alerta `delivery_expiring` no registro da entrega (`R15:164,208`).

## Funções (RPC) e quem pode chamar
| RPC | Perfil | Observação |
|---|---|---|
| `create_shop_order`, `set_shop_line`, `set_shop_order`, `update_shop_item`, `shop_order_total` | gestão (`is_management()` — Manager/Owner/Developer **com MFA satisfeito**, `M1:183-191`) | `BM:462-467` |
| `set_shop_order_status`, `link_delivery_to_order`, `add_supplier`, `update_supplier` | gestão | `R15:292-299` |
| `report_purchases` | gestão | `RP:27-28` |
| `record_food_delivery` | quem escreve no Lodge (station da casa, Float/posto, gestão) | cria o registro que alimenta o vínculo |
| legado: `upsert_product`, `create_purchase`, `purchase_prices` | gestão | `M11:721-741` |
| legado: `allocate_purchase_line`, `transfer_product` | `can_write_lodge` | idem |

## Relacionamentos
`shop_order_lines (N) → (1) shop_orders`, `shop_order_lines (N) → (1) shop_items`; `shop_orders (1) ↔ (0..1) food_deliveries` (FKs cruzadas `delivery_id` / `order_id`); `food_deliveries (N) → (1) suppliers`; legado `product_movements → purchase_lines → purchases/products`.

## Lacunas 🔴
- Sem coluna/RPC de desativação de `shop_items` (`active` fixo `true`); sem desvinculação de entrega; pedidos nunca são apagados (nenhuma RPC de DELETE).
- `shop_items.image_path` não é editável pela aplicação (apenas sementes); ativos em `public/products/` (não verificado nesta análise).
