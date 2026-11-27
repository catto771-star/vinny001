# ADR-0001: Regras de negócio no PostgreSQL (RPC SECURITY DEFINER + RLS) com cliente React fino

- **Status:** aceito (retroativo, reconstruído do histórico Git e do código)
- **Data (commit):** 2026-11-20
- **Evidências:** 7f77ad6 (Fase 0: banco), 62af565, 1aa55ef, ef02029
- **Confiança:** 🟢 fatos (histórico + migrations); 🟡 motivação inferida

## Contexto
O sistema precisa de integridade forte (presença, auditoria, permissões por casa) e de vários clientes (web, PWA, edge functions).

## Decisão
Toda regra de domínio vive em funções plpgsql `SECURITY DEFINER` com `search_path = public`; o front chama `supabase.rpc(...)`. As tabelas têm RLS e as escritas diretas são revogadas (ADR-0002). Cada fase foi entregue em duas partes: 'no banco' primeiro, 'telas' depois (commits `62af565`→`f197bbe`, `1aa55ef`→`c9e502d`, `ef02029`→`00a113e`).

## Consequências
Regras ficam testáveis em `tests/db/*.test.ts` (Vitest contra Postgres). Em contrapartida, as checagens de autorização estão espalhadas por função (`is_management`, `can_write_lodge`, `can_see_lodge`), e lacunas pontuais aparecem quando uma função esquece a checagem (ver `permissions.md`).
