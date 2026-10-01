# 0038 — Café: resumo diário das exportações (Cecafé)

## Contexto

O passo 4 da onda do café (`STATUS_DO_PROJETO.md`, §3) era o reconhecimento rápido de Cecafé, MAPA e Embrapa
(`docs/reconhecimento-fontes/cafe-cecafe-mapa-embrapa.md`, 2026-10-01). MAPA e Embrapa só republicam fontes que o
FinMind já coleta. O Cecafé, a associação dos exportadores, tem um dado original: o **resumo diário** das exportações,
com os certificados de origem, os despachos e os embarques por unidade e por tipo de café. É o único dado diário de
exportação de café e o único com **arábica e conilon separados** (o Comex Stat, ADR 0028, é mensal e não separa).

**Autorização:** o usuário autorizou em 2026-10-01 ("Sim"), **só aquisição de dados**: quais números entram nos
fatores do café é decisão do David.

## Evidência (chamada real, 2026-10-01)

- Página `cecafe.com.br/dados-estatisticos/exportacoes-brasileiras/resumo-diario/`, HTML, sem login. O `robots.txt` do
  Cecafé proíbe robôs em `/*.pdf$` e `/wp-*/` (onde ficam os relatórios mensais), **não nesta página**. A página de
  termos de uso do site existe e está vazia.
- Duas abas (mês atual e anterior), cada uma com "Informações recebidas até: 30/09/2026", o mês ("Setembro 2026") e 3
  tabelas: **Emissão de Certificados de Origem**, **Unidades de Despachos Aduaneiros** e **Unidades de Embarques
  Marítimos e Rodoviários**. Cada linha: a unidade (Santos, Vitória, Rio de Janeiro, Salvador, REDEX/EADI de Minas
  Gerais, outros, totais) e 12 números (movimento do dia, acumulado e mês anterior, cada um em arábica, conilon,
  solúvel e total), em sacas de 60 kg, com ponto como separador de milhar.
- Setembro de 2026, até 30/09: **4.072.399** sacas em certificados de origem (2.895.876 de arábica, 877.430 de
  conilon, 299.093 de solúvel).
- **A coluna "Mês Anterior" não é o fechamento do mês:** na aba de setembro ela dá 3.725.093 certificados para agosto,
  e a aba de agosto dá 3.775.928. É um comparativo parcial.

## Decisão

1. **Coletor** `cecafe-resumo-diario` (`collectors/cecafe/cecafe-resumo-diario.collector.js`), fonte `CECAFE`, uma
   página por dia, raspando as tabelas pelo título (não pela posição).
2. **O que é gravado: o acumulado do mês de cada aba.** Séries `CECAFE.<INDICADOR>.<UNIDADE>.<TIPO>` (indicador:
   CERTIFICADOS, DESPACHOS, EMBARQUES; tipo: ARABICA, CONILON, SOLUVEL, TOTAL), com observed_at = 1º do mês e
   published_at = a data "Informações recebidas até", fim do dia em UTC, estimado (o horário não é dito). **Cada dia
   vira uma versão nova do total do mês**: o histórico de versões guarda a evolução diária com a data exata.
3. **Fora, de propósito:** o "Movimento do Dia" (é a diferença entre duas versões consecutivas) e a coluna "Mês
   Anterior" (comparativo parcial).
4. **Unidade nova** vira item inválido; **número fora do formato brasileiro**, também. Uma mudança de layout derruba a
   coleta com erro explícito, nunca grava errado.
5. **Três cards**, um por indicador, com a unidade no seletor de itens e o tipo de café no seletor de métrica.

## Fora do escopo (de propósito)

- **Os relatórios mensais em PDF** (por tipo, destino e porto): proibidos a robôs pelo `robots.txt`.
- **O IPEP** (índice calculado pelo Cecafé) e as páginas que republicam outras fontes (preços do Cepea e da OIC,
  produção, consumo, estoques).
- **Comparar com o Comex Stat** ou derivar o fluxo diário: são medidas, e cabem ao David.

## Resultado (2026-10-01, banco de dev)

1ª coleta: **156 valores**, 80 séries (setembro e agosto de 2026), 0 falhas. 2ª coleta: 0 criados, 0 revisões. Os 3
cards respondem "em dia" (certificados de origem de setembro: 4.072.399 sacas).

## Consequências e limitações

- **O histórico começa em 2026-10-01** (setembro e agosto de 2026): a página só mostra dois meses, e o histórico mensal
  antigo só existe nos PDFs proibidos.
- **A evolução diária depende da coleta diária:** um dia sem coleta é um dia sem versão (o acumulado seguinte já o
  inclui).
- **Os números do Cecafé não são os do Comex Stat:** certificado de origem, despacho e embarque são etapas diferentes
  do registro de exportação.
- **HTML raspado, sem contrato:** o mesmo risco das listagens do ESMIS (ADRs 0015 e 0027).
