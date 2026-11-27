# ADR-0003: Segunda etapa de autenticação da gestão por código enviado por e-mail (em vez de TOTP/QR)

- **Status:** aceito (retroativo, reconstruído do histórico Git e do código)
- **Data (commit):** 2026-11-20
- **Evidências:** 2f6d2f9 ('Segunda etapa da gestão por e-mail em vez de autenticador com QR Code'), migration 20261120000005
- **Confiança:** 🟢 decisão e mecanismo; 🟡 motivo da troca (QR → e-mail) não está no histórico além da mensagem

## Contexto
A gestão (manager/owner/developer) precisa de um segundo fator. A primeira versão usava autenticador com QR Code; a decisão da gestão em 20/11/2026 (comentário da migration) trocou por código por e-mail.

## Decisão
`mfa_satisfied()` aceita a sessão se o papel não é de gestão, ou se o parâmetro `security.require_mfa_management` é falso, ou se há sessão 'otp/magiclink' ligada a um pedido (`mfa_email_challenges`) feito numa sessão com senha até 15 min antes. Limite de 5 pedidos por 15 min. `is_management()` embute `mfa_satisfied()`, logo o banco recusa a gestão sem a 2ª etapa; o front só consulta.

## Consequências
Quem só tem o e-mail, sem a senha, não entra. Dependência do provedor SMTP/limites de e-mail do Supabase (envio manual, só ao clicar). O parâmetro de desligamento existe para ambiente local; risco aberto sobre quem o altera (questions.md).
