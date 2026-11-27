# ADR-0008: Advertências reduzidas a dois tipos: Warning e Final Warning

- **Status:** aceito (retroativo, reconstruído do histórico Git e do código)
- **Data (commit):** 2026-11-26
- **Evidências:** fc715f3 (Revisão 15), 436f3fb (Migração 37), migration 20261126000037_r15.sql; origem: 259cf08 (FW duplicada)
- **Confiança:** 🟢

## Contexto
Havia `verbal`, `written` e `final_written`. A Revisão 15 padronizou nomes e simplificou.

## Decisão
A migration converte linhas (`final_written`→`final_warning`, demais→`warning`), recria o CHECK e reescreve por `pg_get_functiondef + replace/regexp_replace` as funções `has_final_warning`, `deactivate_final_warning` e `report_period`. Regra mantida: no máximo uma Final Warning ativa por estadia; só a gestão a desativa (com motivo).

## Consequências
Os relatórios passam a expor `warnings.warning` e `warnings.final_warning`; o front já espera esses nomes (achado dos agentes refutado — ver findings-verification.md). A abordagem por `replace` sobre o texto da função é frágil a mudanças futuras.
