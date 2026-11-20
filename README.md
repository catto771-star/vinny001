# DS Lodge

Sistema de operação dos Lodges (Amiens St. e Connolly), conforme a
**Especificação Funcional v1.1**. Só roda no computador da recepção, online.

## Estado

| Fase | Situação |
|------|----------|
| 0. Fundação | Pronta e publicada (Supabase `ds-lodge` na Irlanda + Vercel `ds-lodge.vercel.app`). Teste de ponta a ponta 18/18 contra o Supabase real. Falta: criar as contas reais da gestão. Importação do DOCX adiada por decisão da gestão. |
| 1. Núcleo da operação | A fazer |
| 2. Serviços | A fazer |
| 3. Gestão | A fazer |

## Estrutura

- `supabase/migrations/` — banco (Postgres/Supabase). Todas as permissões são verificadas no servidor (RLS e funções).
- `supabase/functions/admin-users/` — criação de usuários, redefinição de senha, desativação (usa a chave de serviço só no servidor).
- `src/` — aplicação React + TypeScript (Vite).
- `src/i18n/` — textos em pt-PT, en-IE e pl-PL. Faltar uma chave quebra o build e os testes (B53).
- `tests/db/` — testes de aceite que rodam contra o Postgres, como o usuário real (RLS).

## Rodar localmente

```bash
npm install
cp .env.example .env.local   # preencher com URL e anon key do projeto Supabase
npm run dev
```

## Testes

```bash
npm run test:unit
```

Os testes do banco precisam de um Postgres local (porta 54322) e de `npm run db:reset`,
que aplica `supabase/local/auth_shim.sql` (réplica mínima do auth do Supabase — **só para teste local**)
e as migrações:

```bash
npm run db:reset
npm run test:db
```

## Teste de ponta a ponta

`tests/e2e/phase0.e2e.cjs` percorre a Fase 0 no navegador contra um projeto Supabase real
(primeiro acesso, duas etapas, criação de usuários, Assumir Posto, admissão, Out, auditoria,
idioma, desativação). Cria dados marcados com "[TESTE]". Veja o cabeçalho do arquivo.

## Primeira conta

```bash
SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/bootstrap-account.mjs --role owner --name "Nome" --email e-mail
```

## Decisões tomadas na implementação (a confirmar com a gestão)

- **Office On Duty** só por Porter; **Float** por Porter ou Manager (s.4). Owner e Developer não assumem posto.
- Porter sem posto assumido consulta tudo, mas não registra nada.
- **Transferência** de residente: pode fazer quem registra no Lodge de origem ou no de destino.
- Office/Float podem **retirar** um Out que decidiram; Manager/Owner também.
- Idioma escolhido por usuário e guardado no cadastro (s.15.1, "a confirmar").
- Sessão encerra após 15 min sem atividade (parâmetro `security.session_idle_minutes`).
- Textos em polonês precisam de revisão por falante nativo antes do uso real.
