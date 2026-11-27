# Painel

Assistente pessoal web (tarefas, hábitos, lembretes, finanças, projetos, metas,
conhecimento e automações), com Supabase próprio. É uma reconstrução, com código
próprio, das funções do Néctar, para depois ser melhorada do seu jeito.

Situação de cada módulo e próximas fases: [docs/plano.md](docs/plano.md).

## Colocar no ar

1. Crie um projeto em [supabase.com](https://supabase.com) (o plano grátis serve).
2. Crie as tabelas: no painel do Supabase, abra **SQL Editor** e execute, em ordem, cada
   arquivo de `supabase/migrations/`. Com a
   [CLI do Supabase](https://supabase.com/docs/guides/cli), `supabase db push` faz o mesmo.
   Publique também a função de busca de produtos de marca:
   `supabase functions deploy food-search`.
3. Configure o app:

   ```bash
   cp .env.example .env.local
   ```

   Preencha `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` com os valores de
   **Project Settings > API** do seu projeto.
4. Rode:

   ```bash
   npm install
   npm run dev
   ```

   Abra o endereço que aparecer, crie sua conta e entre.

Para publicar, `npm run build` gera a pasta `dist/`, que pode ir para Vercel,
Netlify, Cloudflare Pages ou qualquer hospedagem de site estático (configure as
mesmas duas variáveis lá).

## Trazer seus dados do Néctar

Com o arquivo exportado (`nectar-dados.json`) e a sua conta já criada no app:

```bash
SUPABASE_URL=https://SEU-PROJETO.supabase.co \
SUPABASE_SERVICE_ROLE_KEY=sua-service-role-key \
npm run import-nectar -- nectar-dados.json seu@email.com
```

A `service_role` key fica em **Project Settings > API**. Ela ignora as regras de
acesso, então use só no seu computador e nunca a coloque no repositório. Rodar de
novo não duplica nada: os registros são atualizados pelo id.

## Desenvolvimento

Leia `agents.md` antes de mexer no código: são as regras obrigatórias do projeto.

- `npm test`: testes das regras de cada módulo, do importador e das tabelas de alimentos.
- `npm run test:db`: aplica todas as migrações num banco Postgres local temporário e roda
  os testes de `supabase/tests/` (regras de acesso, catálogos, tabelas de alimentos).
  Precisa de um Postgres local; `PSQL` define o comando do psql (padrão `psql`).
- As regras ficam em `src/lib/` (sem dependência de tela) e as telas em `src/pages/`.
- Fontes e licenças das tabelas de alimentos: [docs/alimentos.md](docs/alimentos.md).
