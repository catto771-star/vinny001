# ADR-0011: Interface operacional somente em inglês (infraestrutura i18n mantida)

- **Status:** aceito (retroativo, reconstruído do histórico Git e do código)
- **Data (commit):** 2026-11-24
- **Evidências:** 95b87f6 (Beta 1), ad2f606
- **Confiança:** 🟢 fato; 🟡 intenção de reativar idiomas

## Contexto
O Beta fixou o idioma do sistema em inglês; manuais continuam em PT, EN e PL (ffa349f).

## Decisão
`src/i18n` mantém os três catálogos, mas `initialLocale` ignora/limpa a preferência e o cadastro grava `locale='en-IE'`.

## Consequências
Código de i18n parcialmente morto (`setLocale`); e-mails usam o idioma do cadastro.
