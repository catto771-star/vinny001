# Cobertura de auditoria — DS Lodge (Data Master)

> Fonte: `CREATE TRIGGER audit_*` em `supabase/migrations/*.sql` (grep case-insensitive; triggers `audit_<tabela>` existem só como comandos literais, sem laço `DO`). 🟢 confirmado · 🟡 inferido · 🔴 lacuna.
> Resultado: **41 das 53 tabelas** têm trigger de auditoria; **12 não têm**. (O `cross-cutting.md` dizia "≈ 40 tabelas" e "cobertura exata não verificada": esta é a verificação integral.)

## 1. Mecanismo 🟢

- Trigger `AFTER INSERT OR UPDATE OR DELETE ... FOR EACH ROW EXECUTE FUNCTION public.audit_row()` (`SECURITY DEFINER`).
- Grava em `audit_log`: `actor_user_id = auth.uid()`, `actor_staff_id = current_staff_id()`, `action` (INSERT/UPDATE/DELETE), `table_name`, `record_id` (texto), `old_data`/`new_data` (linha inteira em `jsonb`), `occurred_at` (default `now()`).
- **UPDATE que só altera `version` não gera linha**. Os demais UPDATE gravam a linha inteira antes/depois (não só o diff).
- `audit_log` e `access_log` são imutáveis (`audit_immutable()` → `audit_log_is_immutable`, 42501); sem DELETE/TRUNCATE concedido.
- Leitura só pela gestão (`audit_read`); busca paginada em `search_audit` (índices por ator, por tabela/tempo e por registro).
- Como RPCs são `SECURITY DEFINER`, o ator real continua sendo o JWT do chamador (`auth.uid()` é do chamador); com `app.filled_by` o "preenchido por" fica em `handover_entries.filled_by`.
- Mudanças feitas por migração (sem JWT) gravam `actor_user_id`/`actor_staff_id` nulos (ex.: a conversão de `warnings.type` na 037 passa pelos gatilhos e é auditada sem ator).

## 2. Tabelas COM trigger de auditoria (41) 🟢

### 1. Estrutura, pessoas e configuração

| Tabela | Trigger | Migração do trigger | Tabela criada em |
|---|---|---|---|
| `lodges` | `audit_lodges` | 001 | 001 |
| `rooms` | `audit_rooms` | 001 | 001 |
| `beds` | `audit_beds` | 001 | 001 |
| `staff` | `audit_staff` | 001 | 001 |
| `parameters` | `audit_parameters` | 001 | 001 |
| `duty_posts` | `audit_duty_posts` | 001 | 001 |
| `fridges` | `audit_fridges` | 014 | 014 |
| `laundry_machines` | `audit_laundry_machines` | 034 | 010 |

### 2. Moradores e presença

| Tabela | Trigger | Migração do trigger | Tabela criada em |
|---|---|---|---|
| `residents` | `audit_residents` | 001 | 001 |
| `stays` | `audit_stays` | 001 | 001 |
| `room_check_runs` | `audit_room_check_runs` | 006 | 006 |
| `room_check_marks` | `audit_room_check_marks` | 006 | 006 |
| `sightings` | `audit_sightings` | 006 | 006 |
| `absences` | `audit_absences` | 006 | 006 |
| `no_shows` | `audit_no_shows` | 006 | 006 |

### 3. Handover, tarefas, manutenção, advertências

| Tabela | Trigger | Migração do trigger | Tabela criada em |
|---|---|---|---|
| `handover_shifts` | `audit_handover_shifts` | 018 | 018 |
| `handover_entries` | `audit_handover_entries` | 007 | 007 |
| `handover_entry_staff` | `audit_handover_entry_staff` | 027 | 027 |
| `handover_tags` | `audit_handover_tags` | 023 | 023 |
| `task_templates` | `audit_task_templates` | 007 | 007 |
| `task_extras` | `audit_task_extras` | 007 | 007 |
| `task_signatures` | `audit_task_signatures` | 007 | 007 |
| `maintenance_tickets` | `audit_maintenance_tickets` | 007 | 007 |
| `warnings` | `audit_warnings` | 007 | 007 |

### 4. Serviços

| Tabela | Trigger | Migração do trigger | Tabela criada em |
|---|---|---|---|
| `fridge_readings` | `audit_fridge_readings` | 010 | 010 |
| `suppliers` | `audit_suppliers` | 037 | 037 |
| `food_deliveries` | `audit_food_deliveries` | 010 | 010 |
| `dinner_services` | `audit_dinner_services` | 010 | 010 |
| `dinner_marks` | `audit_dinner_marks` | 010 | 010 |
| `laundry_uses` | `audit_laundry_uses` | 010 | 010 |

### 5. Compras e estoque

| Tabela | Trigger | Migração do trigger | Tabela criada em |
|---|---|---|---|
| `products` | `audit_products` | 011 | 011 |
| `purchases` | `audit_purchases` | 011 | 011 |
| `purchase_lines` | `audit_purchase_lines` | 011 | 011 |
| `product_movements` | `audit_product_movements` | 011 | 011 |
| `shop_items` | `audit_shop_items` | 017 | 017 |
| `shop_orders` | `audit_shop_orders` | 017 | 017 |
| `shop_order_lines` | `audit_shop_order_lines` | 017 | 017 |

### 6. Equipe

| Tabela | Trigger | Migração do trigger | Tabela criada em |
|---|---|---|---|
| `rota_shifts` | `audit_rota_shifts` | 011 | 011 |
| `work_intervals` | `audit_work_intervals` | 011 | 011 |
| `vacations` | `audit_vacations` | 011 | 011 |
| `holiday_locks` | `audit_holiday_locks` | 017 | 017 |
> A coluna "Migração do trigger" mostra o sufixo de 3 dígitos da migração que criou o trigger (ex.: `001` = fundação). `laundry_machines` foi criada na `010` **sem** trigger; só passou a ser auditada na `034` (Admin passou a editar máquinas): alterações entre `010` e `034` não têm trilha (a tabela era só carga inicial 🟡).

## 3. Tabelas SEM trigger de auditoria (12) 🟢

| Tabela | Por quê (inferido) | Trilha alternativa / risco |
|---|---|---|
| `audit_log` | é a própria trilha; imutável | trigger `audit_log_immutable` |
| `access_log` | log de leitura de perfil, imutável | trigger `access_log_immutable` |
| `mfa_email_challenges` | marca de pedido de código (só `user_id`, `created_at`; o código em si fica no Supabase Auth) | sem trilha; só funções definer acessam (RLS ligado, privilégios revogados) |
| `notifications` | mensagens derivadas de eventos já auditados | 🟡 eventos de origem estão auditados |
| `notification_reads` | marca de leitura pessoal | sem trilha (baixo risco) |
| `handover_mentions` | derivada do texto da anotação (menção de morador) | auditada indiretamente via `handover_entries` |
| `handover_entry_tags` | ligação entrada x tag | 🟡 **lacuna**: troca de tags de uma anotação não é auditada isoladamente (a `handover_entry_staff` equivalente é auditada) |
| `quick_phrases` | catálogo de frases | 🟡 edição por gestão sem trilha (`phrases_insert/update` diretos) |
| `maintenance_events` | linha do tempo do chamado (já é histórico) | histórico próprio; `maintenance_tickets` auditada |
| `maintenance_reminder_snoozes` | adiamento de lembrete | baixo risco |
| `push_prefs` | preferências pessoais | baixo risco |
| `push_subscriptions` | endpoints/chaves de push (dados do dispositivo) | evitar guardar segredos em `audit_log` (decisão aparente 🟡) |

## 4. Achados e recomendações 🟡

1. `handover_entry_tags` e `quick_phrases` ficam fora: se o requisito for "toda alteração de dado de negócio é auditada", adicionar triggers (ver `../questions.md`).
2. `record_id` é texto sem FK; `audit_log` não referencia `lodge_id`, então filtros por casa dependem de `new_data->>'lodge_id'` 🟡.
3. `old_data`/`new_data` guardam a linha inteira (inclui `unit_price`, `date_of_birth`, `pass_id`): a proteção é a RLS de leitura só para gestão.
4. Não há particionamento nem política de retenção para `audit_log` 🔴.
