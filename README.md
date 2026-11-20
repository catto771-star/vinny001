# DS Lodge

Sistema de operação dos Lodges (Amiens St. e Connolly), conforme a
**Especificação Funcional v1.1**. Só roda no computador da recepção, online.

## Estado

| Fase | Situação |
|------|----------|
| 0. Fundação | Pronta e publicada (Supabase `ds-lodge` na Irlanda + Vercel `ds-lodge.vercel.app`). Teste de ponta a ponta 18/18 contra o Supabase real. Falta: criar as contas reais da gestão. Importação do DOCX adiada por decisão da gestão. |
| 1. Núcleo da operação | Pronta e publicada: Folha do dia (Room Check), Seen, ausências, No Show, Handover com rondas, Daily Tasks (modelo de Amiens nos 3 idiomas; Connolly como cópia), Manutenção, Warnings/FW, pendências. Testes de ponta a ponta: presença 12/12, ocorrências 8/8. |
| 2. Serviços | Pronta e publicada: Fridge/Temperatura (alerta 0–5 °C, conclui a tarefa), Food Delivery, Dinner (Seen Night, fechamento de sobras), Laundry (4 máquinas), Notificações da gestão. Teste de ponta a ponta 7/7. E-mail de alerta depende de SMTP próprio. |
| 3. Gestão | Pronta e publicada: Compras (preços só para a gestão, arredondamento por linha), Distribuição e transferências (sem preços), Rota semanal com publicação e buracos de cobertura, Horas (planejadas × efetivas, ajuste com motivo), Férias (conflito com a Rota avisa), Resumo mensal por Lodge (cada número abre os registros). Teste de ponta a ponta 12/12. |
| Dados de demonstração | No Supabase: 30 dias fictícios nos dois Lodges (ver abaixo). Cenários pela interface: 24/24. |

## Design

Toda tela segue `docs/DESIGN.md` (editorial, alto contraste, mobile-first, dois efeitos de impacto).

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

## Dados de demonstração (fictícios)

`supabase/seed/demo.sql` cria o esquema `demo` (fora da API) com:

- `demo.seed()` — 12 pessoas da equipe (8 Porters com login, Manager, Owner, 2 cleaners), ~80 residentes
  (`is_demo`), 30 dias de checks, Seen, ausências (uma ativa, uma vencida), No Shows (inclusive o 3º do mês com
  cama cancelada e um desfeito), Handover com rondas e anotações, Daily Tasks, manutenção em todos os status,
  warnings e FW, geladeira (com alertas), entregas, Dinner, Laundry, compras, distribuição, Rota (com buracos de
  propósito e uma semana em rascunho), horas e férias (uma em conflito).
- `demo.clear()` — remove tudo o que é demo (inclusive o que alguém registrou sobre residentes demo e os logins).
- `demo.purge_test_data()` — remove as sobras dos testes "[TESTE]".

`tests/db/demo.test.ts` confere que o histórico segue as regras (nenhum check pendente no passado, ninguém sem
evidência fora dos No Shows, camas e postos sem sobreposição, relatório = lista de origem) e que a limpeza
devolve o banco ao estado anterior.

```bash
npm run demo:seed    # cria os logins demo e semeia (imprime a senha comum dos logins uma vez)
npm run demo:clear   # antes de começar a operação real
```

Logins demo: `pedro.almeida`, `aoife.kelly`, `tomasz.nowak`, `lucas.ferreira`, `ciaran.byrne`,
`marta.wisniewska`, `rafael.souza`, `niamh.doyle` — todos `@demo.ds-lodge.test`. A gestão demo (Manager/Owner)
não tem login: a gestão usa as contas reais, com o código por e-mail. `tests/e2e/demo-scenarios.e2e.cjs`
percorre os cenários pela interface.

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
