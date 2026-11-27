# Spec — servicos-da-casa

> Redator Reversa · doc_level=completo · pt-br · 🟢/🟡/🔴. Fontes: `modules/servicos-da-casa/*`, `domain.md` (regras 18–21), `findings-verification.md` (#16), `state-machines.md §13`.

## 1. Objetivo
Registrar os serviços diários da casa: Laundry (Connolly), Fridge/temperatura (ambas), Dinner (Amiens, 18h–22h) e Food Delivery (Amiens), com alertas para a gestão. Backend 100% RPC `SECURITY DEFINER`; tabelas só com `SELECT` para autenticados. 🟢

## 2. Atores
Conta da casa e Admin (escrita), gestão (fechar Dinner, editar após fechado). 🟢

## 3. Requisitos funcionais
**RF-01 Laundry.** `start_laundry(machine, stay?)` (máquina ativa; `can_write_lodge`; estadia do mesmo Lodge e não encerrada; cria nota `kind='laundry'` e `laundry_uses`), `finish_laundry(use)` (idempotente; cria **segunda** nota de término), `laundry_status`. Uma utilização aberta por máquina (`machine_busy`). Só casas com `has_laundry`. 🟢
- 🟡 `start_laundry` não checa `has_laundry`; comentário de `Laundry.tsx:22` ("só libera") está obsoleto.

**RF-02 Fridge.** `record_fridge_reading(fridge, temp, note)`: `temperature_required` se nulo (em branco ≠ 0 °C), `invalid_temperature` fora de [-40, 40], faixa `fridge.range_celsius` (fallback 0–5; limites inclusivos) com **snapshot** (`range_min/max`); fora da faixa → notificação `fridge_out_of_range` (push); `auto_sign_task(lodge,'fridge_temperature')`. Cliente: `parseTemperature` (`,`→`.`, `^-?\d{1,2}(\.\d)?$`). 🟢
- 🟡 `auto_key` foi atribuído pelo título em inglês (frágil). 🟡 `auto_sign_task` assina como a conta que registra (diverge de `sign_task`).
- Não há correção/anulação de leituras. 🔴

**RF-03 Dinner.** `ensure_dinner_service` (criação preguiçosa; exige `has_dinner`), `dinner_stays` (estadias que sobrepõem 18h–22h), `mark_dinner` (liberado a qualquer hora do dia já iniciado; fechado só gestão; autor só da própria marca dentro da janela de correção; idempotente), `close_dinner` (gestão; ≥22:00; quantidades ≥0; **primeiro fechamento** manager/developer; **reedição** owner/developer), `dinner_sheet`, `dinner_summary`. Um toque alterna `served` (desfazer grava `served=false`). "Sim" vale como Seen Night. 🟢
- 🟡 "Não serviu": UI = ausência de marca; `dinner_summary` = `served=false` (duas definições).

**RF-04 Food Delivery.** `record_food_delivery` (vigente M37): exige `can_write_lodge` e `has_dinner`; fornecedor por `uuid` ativo; campos obrigatórios por fornecedor (`batch_required`, `best_before_required`, `temperature_required`); temperatura em [-40, 99]; grava `supplier` (texto) e `supplier_id`; fornecedor `links_order` → notificação `delivery_received`; `expiry <= current_date + delivery.expiry_alert_days` → `delivery_expiring`. 🟢
- Veredito #16 PARCIAL: o parâmetro existe (padrão 3, 0–60) e vale no servidor, mas a faixa "vence logo" da lista usa 2 dias fixos no cliente (`services.ts:expiresSoon`). 🟡
- `current_date` é a data civil do servidor, não o dia operacional de Dublin. 🟡

**RF-05 Notificações dos serviços.** `fridge_out_of_range` (push), `delivery_received`, `delivery_expiring` (apenas in-app). Texto: `notificationText` (`services.ts`). 🟢

## 4. Regras de negócio
RN-01 Laundry: `kind ∈ (wash, dry)`; sementes A/B Wash/Dry para casas com `has_laundry`. 🟢
RN-02 Fridge: várias por casa (Amiens 1, Connolly 4); leitura sempre pertence a uma geladeira; `round(temp,1)`. 🟢
RN-03 Dinner: um serviço por casa × dia operacional (`unique`); uma marca por serviço × estadia. 🟢
RN-04 Food Delivery só existe onde há Dinner (Amiens); fornecedor inativo recusa entrega. 🟢
RN-05 Parâmetro por casa (`param_value(key, lodge)`) existe, mas `set_system_parameter` grava sempre `lodge_id` nulo (faixa por casa não configurável pela UI). 🟡
RN-06 `update_supplier` reescreve `food_deliveries.supplier` ao renomear (histórico muda; auditoria registra). 🟡

## 5. Dados
`laundry_machines`, `laundry_uses`, `fridges`, `fridge_readings`, `dinner_services`, `dinner_marks`, `food_deliveries` (+ `supplier_id`, `order_id`), `suppliers`, `notifications`, `task_signatures` (via `auto_sign_task`). Ver `modules/servicos-da-casa/data-dictionary.md`. 🟢

## 6. Interfaces
RPCs: `start_laundry`, `finish_laundry`, `laundry_status`, `record_fridge_reading`, `record_fridge_temperature` (legado, sem UI), `auto_sign_task`, `ensure_dinner_service`, `dinner_stays`, `dinner_sheet`, `dinner_summary`, `mark_dinner`, `close_dinner`, `record_food_delivery`, `my_notifications`, `mark_notification_read`. Rotas `/laundry`, `/fridge`, `/dinner`, `/deliveries`. 🟢

## 7. Estados
Entrega: registrada → alerta de vínculo → vinculada; sem desvínculo (`state-machines.md §13`). Dinner: aberto → fechado (`closed_at`) → reeditado (`edited_at`). 🟢 / 🟡

## 8. Permissões
Registrar: `can_write_lodge`. Fechar Dinner: gestão (papéis específicos). Marcar Dinner fechado: só gestão. Fornecedores/estrutura: gestão (ver configuracoes). 🟢

## 9. Casos de borda
- EB-01 Corrida em `start_laundry`: o `exists` não é atômico; o índice único parcial garante unicidade (23505). 🟢
- EB-02 Desligar `has_laundry`/`has_dinner` não bloqueia máquinas/serviços existentes. 🟡
- EB-03 Comentários de cabeçalho obsoletos (`Laundry.tsx:22`, `Fridge.tsx:21`, `Deliveries.tsx:35`). 🟢
- EB-04 Entregas: lista limitada a 100; leituras a 120. 🟡
- EB-05 `dinner_not_started` só recusa dia ainda não iniciado; antes das 18h a UI pede confirmação. 🟢

## 10. Requisitos não funcionais
`useLatestRequest` descarta respostas antigas; marcação otimista com rollback via `load()`; push com TTL 3600 s para geladeira. 🟢

## 11. Contradições anotadas
Nenhuma com o Detetive. O veredito #16 (PARCIAL) alinha-se ao registro do módulo.

## 12. Lacunas 🔴
Correção/anulação de leituras e entregas; definição oficial de "não serviu"; desvínculo de entrega.

## 13. Rastreabilidade
`src/pages/Laundry.tsx, Fridge.tsx, Dinner.tsx, Deliveries.tsx`; `src/lib/services.ts`; SQL `M10, M14, M15(r15=M37), M29, M34, handover_tags_push`; testes `src/lib/services.test.ts`, `src/pages/services.ui.test.tsx`, `Deliveries.test.tsx`, `tests/db/services.test.ts`, `beta-operations.test.ts`, `r15.test.ts`.
