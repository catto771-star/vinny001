# ADR-0006: Isolamento por casa aplicado no banco (house_scope / can_see_lodge)

- **Status:** aceito (retroativo, reconstruído do histórico Git e do código)
- **Data (commit):** 2026-11-25
- **Evidências:** 4c30700 ('House isolation in the database'), migration 20261125000029_house_scope.sql
- **Confiança:** 🟢

## Contexto
Com a conta de casa, esconder a outra casa só no front seria insuficiente.

## Decisão
`house_scope()` devolve a casa do `station`; `can_see_lodge()` libera tudo para quem não é `station` e para o contexto interno (`auth.uid()` nulo); política RLS **restritiva** `house_scope` de SELECT em toda tabela com `lodge_id` (gerada por loop) e em tabelas filhas; RPCs ganharam `can_see_lodge`/`can_write_lodge` (reescritas como blocos `CREATE OR REPLACE` gerados por dump). Um teste-guardião (`tests/db/house-scope.test.ts`) cobre tabelas novas.

## Consequências
Falha fechada para `station` sem casa. Funções SECURITY DEFINER esquecidas ignoram a RLS e vazam dados entre casas (ver `permissions.md`: `open_resident_profile`, `maintenance_set_status`). Admin/gestão vê as duas casas por desenho.
