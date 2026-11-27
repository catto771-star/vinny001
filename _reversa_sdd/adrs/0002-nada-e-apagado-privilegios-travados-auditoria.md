# ADR-0002: Nada é apagado: privilégios padrão revogados e auditoria imutável

- **Status:** aceito (retroativo, reconstruído do histórico Git e do código)
- **Data (commit):** 2026-11-20
- **Evidências:** 6611957, migration 20261120000004_lock_privileges.sql, `audit_immutable` em foundation.sql
- **Confiança:** 🟢

## Contexto
O Supabase concede ALL (inclusive DELETE/TRUNCATE, que ignora RLS) a `anon`/`authenticated` em tabelas novas. O projeto adota a regra 's.9': correções são novos registros.

## Decisão
`revoke all` em todas as tabelas/sequências/funções para `anon`/`authenticated`, com `alter default privileges` revogando para o futuro; cada migration concede explicitamente só o necessário. Triggers `audit_row` gravam `audit_log`; `audit_immutable` impede alterar/apagar a trilha. Correções usam anulação (`voided`), `undone`, `cancelled`, `active=false`.

## Consequências
Rastreabilidade total e histórico preservado. Exceção conhecida: `clear_mark` faz DELETE real em `room_check_marks` (auditado) — ver questions.md. Toda função nova precisa de `revoke ... from public, anon` + `grant ... to authenticated` (o commit `2f6d2f9` 'Corrige EXECUTE padrão a PUBLIC em funções novas' mostra que isso já falhou uma vez).
