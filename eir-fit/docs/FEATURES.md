# Módulos de acompanhamento da Eir Fit

## Perfis e acesso

Coach pode prescrever treino e dieta. Para preservar contas existentes, o banco mantém o valor legado `both`; a API expõe `coach` e aceita ambos no cadastro. Personal mantém apenas prescrição de treino e nutricionista apenas dieta. Cada biblioteca é privada ao profissional. Os dados clínicos e de execução são vinculados à ficha do aluno e seguem a autorização da relação profissional/aluno.

Prescrições de suplementos/substâncias são registros manuais com identificação do prescritor, instrução, via, frequência, período e motivo de suspensão. O campo de habilitação é declarado; a plataforma não verifica habilitação, não recomenda doses e não gera assinatura digital de receita. O profissional responde pelo conteúdo registrado.

## Idiomas

Interface em português do Brasil, inglês e espanhol. O seletor está na entrada e no cabeçalho. A preferência é guardada neste navegador. Conteúdo cadastrado (nomes dos exercícios, orientações, alimentos e mensagens) e nomes oficiais das bases não são traduzidos automaticamente. Algumas mensagens técnicas de validação da API permanecem em português como fallback.

## Exercícios e treino

Biblioteca inicial opcional com 12 exercícios e descrições originais Eir Fit. Adicionar novamente não duplica os modelos. O profissional pode cadastrar exercícios próprios, grupo muscular, equipamento e URL HTTPS do YouTube. São aceitos vídeos `/watch`, `youtu.be`, `/shorts` e `/embed`, normalizados para uma URL de vídeo; o servidor não baixa o vídeo nem consulta URLs arbitrárias.

Na biblioteca, selecione os exercícios e prescreva para o aluno selecionado. O aluno inicia uma sessão de treino e registra carga em kg e repetições de cada série durante a execução. Sessões abertas podem ser retomadas. As análises usam esses registros reais, separados da prescrição. A dashboard apresenta carga por exercício, volume por grupo muscular e por data. Volume = carga × repetições × séries; não estima força, fadiga ou intensidade fisiológica. Cargas devem usar o mesmo critério entre sessões e a unidade da máquina pode não ser equivalente entre equipamentos.

## Alimentos, refeições e protocolos

Alimentos são normalizados por 100 g de porção comestível, em kcal e gramas de proteína/carboidratos/gorduras. Fibra em g e sódio em mg são preservados quando disponíveis. Campos ausentes não são substituídos por zero. Alimentos sem os quatro valores principais completos são recusados para composição.

O construtor permite selecionar alimento, refeição, horário e gramas. A API recalcula os valores a partir do alimento autorizado; ignora totais enviados pelo navegador. Uma publicação cria um protocolo imutável com versão, data, valores por 100 g, quantidades e proveniência. Dietas ativas têm dias da semana exclusivos. Uma revisão inativa apenas a versão anterior da mesma dieta, sem apagar sessões, protocolos ou consumos. As dashboards de alimentação usam o consumo diário real informado pelo aluno; metas dos protocolos aparecem separadamente, por família de dieta. O aluno pode ajustar os gramas previstos, sem substituir alimentos.

A energia armazenada na fonte é usada diretamente, sem forçar a equivalência de 4/4/9 kcal; fontes podem adotar fatores específicos, fibras e outras convenções. Os números exibidos são arredondados; os cálculos internos não são arredondados item por item.

### Fontes oficiais

O catálogo contém USDA FoodData Central, TBCA, TACO, ANSES CIQUAL, CoFID, Australian Food Composition Database, MEXT e Canadian Nutrient File. O catálogo não significa que as bases completas estejam carregadas.

- **USDA**: conector de busca e importação individual por FDC ID. Exige `USDA_FDC_API_KEY` no servidor e acesso HTTPS a `api.nal.usda.gov`. A busca é limitada a Foundation, SR Legacy e FNDDS; a importação relê o alimento na API, sem confiar nos valores do navegador. A consulta ao serviço oficial ainda não foi validada neste ambiente porque a chave não foi fornecida. Não há credencial de demonstração ou chave embutida.
- **Outras tabelas**: importação JSON normalizada, até 100 alimentos/90 KB por lote, com fonte, edição, código original e confirmação de direitos de uso. O profissional precisa obter os arquivos e confirmar as condições da edição. Valores enviados por arquivo são marcados como origem declarada, não como consulta verificada à fonte oficial. Não há scraping ou redistribuição automática dessas bases.
- **Cadastro próprio**: fonte `custom`, com referência de rótulo/medição e edição/data. Não é certificado por tabelas oficiais.

O exemplo em `examples/foods-import-template.json` usa dados fictícios para ilustrar o formato. Não o apresente como conteúdo de uma tabela real.

## Avaliação física

Histórico com peso, percentual de gordura informado pelo avaliador, cintura, quadril, tórax, braço, coxa, panturrilha e observações. Campos não medidos permanecem ausentes. IMC é calculado a partir de peso e altura da ficha; não mede composição corporal. Os gráficos não estimam gordura corporal nem oferecem diagnóstico. Avaliações existentes são preservadas.

## Dados e implantação

Tabelas adicionais `library` e `clinical` são criadas de forma aditiva, sem apagar os dados existentes. Versão do esquema: 3. Tabelas de sessões, séries executadas e consumos são acrescentadas. Consulte `docs/DOMAIN.md` para as regras confirmadas de agenda, hierarquia, privacidade e histórico. Backup deve incluir o banco inteiro, usando `server/backup.mjs`. A imagem Docker inclui os módulos e os catálogos. Publicação e recuperação de senha por e-mail continuam pendentes, conforme DEPLOY.md.
