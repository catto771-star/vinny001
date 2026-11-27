# Lacunas remanescentes — DS Lodge

> Revisor Reversa · doc_level=completo · severidade: crítico (bloqueia reimplementação fiel ou expõe risco), moderado, cosmético. Detalhe e origem em `questions-triage.md`.

## Crítico
- Isolamento por casa incompleto em `open_resident_profile`, `find_former_resident`, `resident_evidence`, `maintenance_set_status` (comportamento desejado indefinido).
- `parameters_insert` e `staff` update direto contornam as RPCs de gestão (regra pretendida vs implementada).
- Política de privacidade/retenção (snapshot offline, `audit_log`, `notifications`) não definida.
- Processo de deploy/migração, backup e rollback ausentes do repositório.
## Moderado
- Contrato exaustivo de ~82 funções ainda não documentadas em `rpc-contracts.md` (192 existentes, ~110 documentadas).
- Parâmetros editáveis ignorados por código (reminder_hours, shift, expiry alert).
- Férias/Holidays e Daily Tasks sem unit própria; origem da conta `developer`; efeitos de `release_cancelled_bed`.
- Sem análise dinâmica e sem execução de testes.
## Cosmético
- Cache SW sem versionamento, imports IBM Plex mortos, `DESIGN.md` desatualizado, `tsbuildinfo` versionado, mensagens genéricas para `invalid_*`.
