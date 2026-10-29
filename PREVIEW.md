# Publicar a versão de teste da Eir Fit

A branch `eir-fit-preview` contém a aplicação em `eir-fit/` e um Blueprint Render gratuito neste diretório. O código anterior do repositório permanece intacto.

1. Crie uma conta no Render e conecte este repositório pelo GitHub.
2. Em New > Blueprint, selecione este repositório e a branch `eir-fit-preview`.
3. Confira que o serviço `eir-fit-test` usa plano Free, diretório `eir-fit` e Docker. Não há disco persistente contratado por este Blueprint.
4. Conclua a implantação. O Render fornecerá um endereço HTTPS `*.onrender.com`.
5. No endereço gerado, crie uma conta Coach. Cadastre um aluno com outro e-mail e gere o convite na tela Evolução. Abra o convite em outro navegador/perfil e crie a conta Aluno para experimentar as duas experiências.

## Limites deste teste gratuito

- O banco está no sistema de arquivos temporário da instância. Dados podem desaparecer após reinício, nova implantação ou substituição da instância.
- O serviço pode hibernar quando ocioso; o primeiro acesso pode demorar.
- Use dados fictícios. Não é a implantação para operação com alunos reais.
- USDA ainda precisa de chave para consulta oficial. Cadastro manual de alimentos e importação de arquivos funcionam sem ela.
- O endereço público só existe depois que a implantação termina. A branch e o Blueprint não publicam o serviço sozinhos.

Para uma instalação com dados persistentes, utilize o Blueprint de produção em `eir-fit/render.yaml` ou as instruções em `eir-fit/DEPLOY.md`; esses recursos têm custo e devem ser escolhidos na hospedagem.
