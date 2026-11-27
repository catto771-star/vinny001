# ADR-0007: Handover organizado por turno, com horas cruzadas com a Rota e confirmadas pelo Admin

- **Status:** aceito (retroativo, reconstruído do histórico Git e do código)
- **Data (commit):** 2026-11-25
- **Evidências:** 259cf08 (Revisão 2 item 5), 34cca31 (Revisão 5), e1e3003 (turno de Float), migrations 18, 25, 26
- **Confiança:** 🟢

## Contexto
As horas trabalhadas deixaram de vir de 'assumir posto' e passaram a vir do turno aberto/fechado no Handover.

## Decisão
`handover_shifts` (um aberto por casa; Float global), `open_handover_shift`/`close_handover_shift` (passagem opcional abre o turno do próximo), `hours_status open→pending→confirmed`; `confirm_shift_hours` (gestão) grava `confirmed_start/end` e atualiza/cria `rota_shifts`. Divergência >15 min do plano gera notificação `shift_hours_review`.

## Consequências
Hours depende da disciplina de abrir/fechar turno. Turnos de cobertura criados na confirmação podem sobrepor outros (questions.md).
