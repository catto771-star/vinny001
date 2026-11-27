# ADR-0013: Desenvolvimento guiado por testes e simulações em massa

- **Status:** aceito (retroativo, reconstruído do histórico Git e do código)
- **Data (commit):** 2026-11-20
- **Evidências:** 98af06a (agents.md), 0165151 (testes em massa), 555a1c1
- **Confiança:** 🟢

## Contexto
`agents.md` impõe: ler regras antes de codar, teste para cada regra, bug = teste que falha primeiro, 100% dos testes antes de concluir.

## Decisão
Suítes `tests/db` (regras), `src/**/*.test.tsx` (UI), e2e e cenários; simulações de stress (`stress-workflow.test.ts`) acharam bugs reais (ex.: FW duplicada, corrigida em 259cf08).

## Consequências
Dependência estrutural de os testes acompanharem renomeações (ex.: warnings.* após r15). Muitos commits 'Update TypeScript build info' (tsbuildinfo versionado).
