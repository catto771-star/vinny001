# Como desfazer uma mudança no banco (rollback)

O projeto não tem migrações "down". Este roteiro vale para qualquer migração nova.

## Antes de aplicar em produção
1. Rode `npm run db:reset` e `npm test` localmente: tudo deve passar.
2. No painel do Supabase (Project Settings → Backups), confirme que existe um backup recente. Se o plano permitir, faça um backup manual antes de uma migração grande.
3. Leia a migração e anote o que ela cria, altera e apaga. Mudanças que apagam dados (`drop table`, `drop column`, `delete`) exigem um backup explícito antes.

## Se algo der errado depois de aplicar
| O que a migração fez | Como desfazer |
|---|---|
| Criou função, tabela ou coluna nova | Crie uma nova migração com `drop function ...`, `drop table ...` ou `alter table ... drop column ...`. |
| Alterou o corpo de uma função | Reaplique a versão anterior da função: copie o `create or replace function` da migração mais antiga que a definiu (use `grep -i "function public.NOME" supabase/migrations/*.sql` e escolha a anterior). |
| Alterou uma política (RLS) | Reaplique `drop policy` e `create policy` com o texto da versão anterior. |
| Inseriu ou alterou parâmetros | Parâmetros são versionados: insira uma nova linha em `parameters` com o valor antigo. |
| Apagou dados | Restaure o backup do Supabase (ponto no tempo) ou importe só as linhas necessárias. |

## Regras
- Nunca edite uma migração já aplicada em produção: crie uma nova.
- Aplique a correção primeiro no banco local, rode os testes e só então em produção.
- Registre o motivo da reversão no commit.
- O histórico (`audit_log`) mostra quem mudou o quê nos dados e ajuda a decidir o que restaurar.

## Backup por hora (GitHub Actions)
- O workflow `Hourly database backup` roda a cada hora (minuto 17) e guarda o dump **criptografado** (AES-256) como artefato por 14 dias (Actions → a execução → Artifacts).
- Segredos necessários (Settings → Secrets and variables → Actions): `SUPABASE_DB_URL` (string de conexão do **Session pooler**, Supabase → Connect) e `BACKUP_PASSPHRASE` (frase longa; guarde também em um cofre de senhas, sem ela o backup não abre).
- Restaurar: baixe o artefato e rode `gpg -d arquivo.sql.gz.gpg | gunzip > dump.sql`; importe num banco novo com `psql "$URL" -f dump.sql`. Teste a restauração num projeto separado antes de precisar dela.
- Os arquivos têm dados pessoais: nunca os coloque em e-mail, chat ou repositório.
