# Publicação da Eir Fit

O código está preparado para um único servidor com disco persistente e HTTPS. A publicação externa ainda depende de uma conta de hospedagem. Não foi criada nenhuma conta, contratação ou publicação nesta tarefa.

## Caminho sem comprar domínio: Render

1. Crie uma conta no Render e disponibilize o conteúdo desta pasta em um repositório Git privado seu. Esta pasta ainda não foi enviada a nenhum repositório; não envie o banco `data/`, `.env`, backups ou `node_modules`.
2. Crie um Blueprint a partir desse repositório. O arquivo `render.yaml` declara o serviço Docker, o disco persistente e a verificação de saúde. O plano `starter` e o disco têm custo; confira o preço vigente antes de contratar.
3. O Render fornece um endereço HTTPS `*.onrender.com`; a API usa `RENDER_EXTERNAL_URL` para validar a origem e cookies seguros. Se usar domínio próprio depois, configure `APP_ORIGIN` com o endereço HTTPS final, sem barra no final.
4. Aguarde a implantação e verifique `/api/health` (`{"ok":true}`). Cadastre sua conta profissional. Cadastre uma ficha de aluno com o e-mail correto, gere o convite na tela Evolução e envie o link ao aluno. O aluno cria conta com perfil Aluno e aceita esse convite.
5. Repita o teste com duas contas e confirme que o aluno vê apenas seus planos. Reinicie o serviço e confirme que os dados continuam disponíveis.

Não utilize serviço com disco efêmero: o banco SQLite precisa persistir em `/data`. Mantenha uma única instância; esta versão não usa banco compartilhado entre servidores.

## Alternativa: servidor próprio e domínio

Requer Docker/Compose, DNS do domínio apontado ao servidor e portas 80/443 liberadas.

```sh
cp .env.example .env
# Edite DOMAIN com o endereço real; não use o exemplo.
docker compose up -d --build
```

O Caddy solicita e renova o certificado HTTPS. A API não fica publicada diretamente. Os volumes `eir_data` e `caddy_data` devem ser preservados. Não execute `docker compose down -v` em produção: isso remove dados.

## Backup e restauração

```sh
# No servidor com Node 24:
DATABASE_PATH=/data/eir-fit.sqlite node server/backup.mjs /backups/eir-fit-AAAA-MM-DD.sqlite
# Docker Compose:
docker compose exec app node server/backup.mjs /data/backups/eir-fit-AAAA-MM-DD.sqlite
```

O script usa o mecanismo de backup online do SQLite e verifica a integridade da cópia. Copie o backup para um armazenamento protegido fora do servidor; mantenha acesso restrito e defina retenção. Backups no mesmo disco não protegem contra perda do servidor. Configure a rotina no provedor escolhido.

Para restaurar: pare a aplicação, preserve uma cópia dos arquivos atuais, substitua o banco pela cópia validada e só então remova os arquivos `-wal` e `-shm` antigos antes de iniciar novamente. Restaure também o dono/permissões do arquivo para o usuário do processo. Nunca substitua o banco com a aplicação em execução.

## Limites da primeira versão com backend

O vínculo é entre a conta do aluno e a ficha de cada profissional. Um aluno pode aceitar convites de vários profissionais; cada profissional vê somente as fichas e planos que criou. A área do aluno permite selecionar o acompanhamento de cada profissional. Treino e dieta de profissionais diferentes não expõem o restante da carteira entre eles.

As permissões são verificadas pelo servidor. O perfil declarado no cadastro não verifica registro profissional. Convites expiram em 72 horas e são usados uma vez, com e-mail correspondente. O envio do link é manual. E-mail transacional, recuperação de senha por e-mail, notificações push, cobrança e verificação de registro profissional não estão implementados. Mensagens são atualizadas ao carregar a tela e por consulta periódica; não há WebSocket.

Antes de operação comercial, defina suporte para recuperação de acesso, política de privacidade/consentimento, exclusão/exportação de dados e rotina externa de backup. Essas rotinas operacionais não são fornecidas pela publicação do container.

## Bibliotecas e USDA

A imagem inclui `server/modules.mjs` e `server/catalogs/`. A API atualiza o esquema de forma aditiva ao iniciar. Faça backup antes de atualizar e preserve o volume.

Para ativar FoodData Central, obtenha uma chave no serviço oficial USDA/data.gov e configure `USDA_FDC_API_KEY` como segredo no provedor. Não precisa da chave para cadastro manual e importação de arquivos. No ambiente de desenvolvimento foi salvo somente o requisito e o destino `api.nal.usda.gov` no rascunho; salvar o rascunho não injeta uma chave nem altera a rede desta instância.

As demais bases são importadas após obter os arquivos e confirmar direitos de uso. Consulte `docs/FEATURES.md`. Não publique bases de terceiros antes de conferir licença, edição e atribuição.
