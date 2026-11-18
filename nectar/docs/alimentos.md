# Tabelas de alimentos

O app usa três fontes. Valores por 100 g da parte comestível.

| Fonte | País | Alimentos | Licença |
|---|---|---|---|
| TACO, 4ª edição ampliada e revisada (NEPA/UNICAMP, 2011) | Brasil | 591 | Reprodução permitida citando a fonte |
| CoFID 2021, McCance and Widdowson's Composition of Foods Integrated Dataset (Public Health England) | Reino Unido; é também a referência usada na Irlanda | 2.854 | Open Government Licence v3.0 |
| Open Food Facts | produtos de marca do Brasil, Irlanda e Reino Unido | busca ao vivo | Open Database License (ODbL) |

As duas primeiras ficam no banco (migração `supabase/migrations/20261118000003_foods_seed.sql`).
O Open Food Facts é consultado na hora pela função `food-search`; o produto escolhido é
salvo como alimento seu, com os valores do momento.

Contains public sector information licensed under the Open Government Licence v3.0
(CoFID). Fonte TACO: NEPA/UNICAMP, Tabela Brasileira de Composição de Alimentos, 4ª ed., 2011.
Dados de produtos: Open Food Facts contributors, openfoodfacts.org.

## Regenerar a carga

1. Baixe a TACO processada (CSV) do repositório
   [brolesi/taco](https://github.com/brolesi/taco), commit
   `b800c910dfc9d2e8e6bab45dd42e5b8f5167b466`, arquivo
   `data/processed/taco/taco_composicao.csv`.
2. Baixe a planilha da CoFID 2021 em
   [gov.uk](https://www.gov.uk/government/publications/composition-of-foods-integrated-dataset-cofid).
3. Rode:

   ```bash
   node scripts/build-foods.mjs taco_composicao.csv McCance_Widdowsons_Composition_of_Foods_Integrated_Dataset_2021..xlsx
   ```

A CoFID 2021 usa o código 13-669 para dois alimentos (berinjela assada e agrião cru);
o segundo entra como `13-669#2` para não ser descartado.
