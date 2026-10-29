# Eir Fit

Plataforma responsiva de treino, nutrição e acompanhamento com React/Vite, API Node 24 e banco SQLite persistente. O protótipo local foi substituído por contas e autorização no servidor. Nenhum dado antigo do localStorage é importado automaticamente.

## Desenvolvimento

```sh
cd /workspace/forma
npm ci
# Terminal 1 (origem deve corresponder exatamente à URL usada no navegador):
APP_ORIGIN=http://127.0.0.1:5173 npm start
# Terminal 2:
npm run dev -- --port 5173
```

A API escuta na porta 3001. O Vite encaminha `/api`. Em produção, `npm run build` e `npm start` servem frontend e API na mesma origem. Use `NODE_ENV=production`, `APP_ORIGIN=https://endereco-real` e um `DATABASE_PATH` persistente. O runtime de produção usa apenas módulos nativos do Node; não requer dependências de desenvolvimento.

## Fluxo real

1. Profissional cria conta como personal, nutricionista ou ambos.
2. Cadastra a ficha de um aluno com o e-mail correto.
3. Prescreve treino e/ou refeições para aquela ficha, conforme seu perfil.
4. Na tela Evolução gera um convite e envia o link ao aluno. O link é secreto, expira em 72 horas e pode ser usado uma vez.
5. O aluno cria conta com o mesmo e-mail, perfil Aluno, e abre o convite. Se já estiver conectado, o convite também é processado ao abrir a página.
6. O aluno vê somente as fichas vinculadas à sua conta, executa treinos e registra refeições, hidratação, medidas e mensagens.
7. O profissional acompanha os registros. Personal não prescreve dieta; nutricionista não prescreve treino. Um aluno pode se vincular a mais de um profissional, com acompanhamentos separados.

O aluno não consegue trocar de perfil pela interface. O servidor verifica o usuário e o vínculo em cada leitura/escrita; IDs enviados pelo navegador não concedem acesso.

## Armazenamento e autenticação

- Banco criado automaticamente em `data/eir-fit.sqlite`, com chaves estrangeiras, WAL, índices, transações e versão do esquema.
- Senhas com scrypt e salt aleatório. Sessões opacas, hashes dos tokens no banco, validade de sete dias e cookie HttpOnly/SameSite; Secure em produção.
- Validação de origem nas escritas, limite de requisição, validação de campos e limites para tentativas de acesso.
- Prescrições, medidas, mensagens e atividades têm vínculo persistente com a ficha do aluno. O autor e o momento são registrados no servidor.
- Sem dados fictícios na aplicação. Os testes criam contas próprias para validar os fluxos.

## Testes

`npm run test:api` inicia servidores temporários com banco isolado e verifica isolamento entre contas, permissões, convite de uso único com e-mail correspondente, validação de planos, idempotência de conclusão, rollback, bloqueio de origem externa, logout e persistência após reinício.

Com API e Vite ativos: `npm test` usa Chromium em `/usr/bin/chromium` (ajuste `playwright.config.js` em outra máquina). Cobre contas independentes, cadastro, prescrição, aceite do convite, treino, refeição, água, medidas, mensagens, recarga, logout e layout mobile.

`npm run build` gera `dist/`. `node server/backup.mjs /caminho/backup.sqlite` cria e valida uma cópia consistente do banco.

## Publicação e limites

Veja [DEPLOY.md](DEPLOY.md) para Render com endereço HTTPS fornecido pelo provedor ou Docker Compose com domínio próprio, backup e restauração. A publicação externa ainda não foi realizada. E-mail transacional/recuperação de senha, edição e histórico de versões dos treinos, pagamentos e rotinas de privacidade para operação comercial continuam pendentes.

## Ampliação de funcionalidades

Perfil coach, português/inglês/espanhol, biblioteca de exercícios com YouTube, biblioteca alimentar, construtor de refeições por gramas, protocolos alimentares versionados, progressão de cargas e volume muscular, registros de suplementos/substâncias e avaliação física com gráficos. Veja [docs/FEATURES.md](docs/FEATURES.md) para o funcionamento, as fontes oficiais, o que ainda depende de chave/arquivos e as limitações dos indicadores.

As alterações são aditivas no banco. Não substitua o banco existente por um banco novo para atualizar. Na hospedagem, configure `USDA_FDC_API_KEY` como segredo se quiser ativar a consulta USDA; nunca a coloque no frontend ou no Git.

## Regras do acompanhamento

As regras confirmadas estão em [docs/DOMAIN.md](docs/DOMAIN.md): agenda semanal de treinos/dietas, uma dieta ativa por dia, privacidade entre profissionais, séries reais registradas durante o treino e diário alimentar com ajuste de quantidades. A atualização preserva os dados anteriores; faça backup antes de atualizar.
