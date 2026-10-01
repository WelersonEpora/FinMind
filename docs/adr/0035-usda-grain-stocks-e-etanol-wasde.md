# 0035 — Milho: estoques trimestrais (Grain Stocks) e milho usado para etanol (WASDE)

## Contexto

Duas fontes do FEL 1 para o milho, ambas do USDA e pelo mesmo arquivo de publicações (ESMIS):

- **Grain Stocks**: a tabela de fontes do milho do FEL 1 (p. 10) o cita junto com o Prospective Plantings. Foi
  reconhecido em 2026-09-28 (`docs/reconhecimento-fontes/usda-plantings-grain-stocks.md`) e aguardava o Comitê dizer
  se o fator 3 ("Estoques globais e balanço — WASDE", peso Alto) usa os estoques trimestrais.
- **Milho usado para etanol**: a metade "USDA" do fator 5 ("Demanda de etanol e biocombustível", peso Médio). A
  linha está no WASDE que já baixamos, mas o leitor a descartava de propósito porque o rótulo mudou (ADR 0015).

O usuário autorizou em 2026-10-01 ("Coloque na lista 'Falta fazer' e já pode começar o item 1"), depois da reunião de
2026-09-30 com o David. O item 1 era a lista de fontes grátis em fontes que o FinMind já usa. Vale **só para
aquisição de dados**: medir os fatores é trabalho do David (decisão do usuário, 2026-10-01).

## Evidência (chamadas reais, 2026-10-01)

### Grain Stocks

- A listagem do ESMIS (`/publication/grain-stocks`) tem **103 edições com ZIP (CSV)**, de 2001-06-29 a 2026-09-30
  (a de ontem). Todas baixadas e lidas fora do banco antes de escrever o coletor.
- A tabela usada é a **"Grain Stocks by Position and Month" em unidades domésticas**: milho, sorgo, aveia, cevada,
  trigo e soja em 1º de março, junho, setembro e dezembro, do ano anterior e do corrente, por posição (na fazenda,
  fora da fazenda, total), em mil bushels.
- **Três layouts:** até 2012, o grão vem numa linha de cabeçalho e as datas como "Mar 1"; em 2013-01-11, o CSV veio
  sem aspas, exportado do Excel, com as datas como "1-Mar"; de 2013 em diante, o grão vem numa linha de dado e as
  datas como "March 1".
- **102 de 103 lidas.** A 103ª (2003-02-27) é outro relatório (*Corn, Soybeans, and Wheat Sold Through Marketing
  Contracts*) listado por engano na página do Grain Stocks. Em 2 datas (2013-11-19 e 2019-01-11) a listagem tem a
  edição sem ZIP.
- **Conferências:** a data de dentro do CSV ("Released September 30, 2026") é igual à da listagem nas 102; na fazenda
  + fora da fazenda = total em todos os valores; e o mesmo trimestre em edições diferentes: 1.401 de 1.668 pares de
  versões idênticos, e as 4 diferenças acima de 5% são revisões do USDA (a maior: 1º/set/2019, de 2.114.432 para
  2.220.749 mil bu, +5,0%, no relatório anual de jan/2020).
- **Os números originais que a API do QuickStats perdeu estão aqui:** 1º/mar/2025 = 8.150.669, 1º/jun/2025 =
  4.643.636 e 1º/set/2025 = 1.531.613 (revisado para 1.551.286 em 2026-01-12), os mesmos do reconhecimento.
- **Dois defeitos da fonte achados no caminho:** em 2010, os valores revisados vêm marcados com "*" ("*3497460", nota
  "* Revised."); e na edição de 2010-03-31 a linha "Sorghum", que só nomeia o bloco, veio **com valores**. A 1ª versão
  do leitor tomou esses valores do sorgo como milho; o serviço point-in-time recusou gravá-los por cima (8 falhas),
  e foi assim que o erro apareceu. Corrigido, com uma trava (data repetida no bloco do milho recusa a edição) e um
  teste com o caso real. A carga errada só existiu em dev e foi apagada antes da recarga.

### Etanol no WASDE

- Varridas **as 187 edições** do WASDE com XLS (2011-01-12 a 2026-09-11). O rótulo do etanol no bloco do milho dos
  EUA mudou **uma vez**: **"Ethanol for Fuel"** nas 3 edições de jan a mar/2011 e **"Ethanol & by-products"** nas 184
  de abr/2011 em diante. É a parcela do "Food, Seed & Industrial" que vai para o etanol, em milhões de bushels.

## Decisão

1. **Grain Stocks por um coletor novo** (`usda-grain-stocks.collector.js`, código `usda-grain-stocks-milho`, fonte
   `USDA_NASS_GRAIN_STOCKS`), que reaproveita a listagem e o download do ESMIS da área plantada (ADR 0027) e um leitor
   próprio (`usda-grain-stocks.parser.js`) que percorre a tabela na ordem das linhas. Séries
   `USDA.GRAIN_STOCKS.CORN.TOTAL`, `.ON_FARM` e `.OFF_FARM`; observed_at = a data do estoque; `published_at` **real**
   (data do release, fim do dia em UTC); cada edição é uma versão. O arquivo de outro relatório vira **aviso** (defeito
   conhecido da fonte), não falha. Carga: `npm run backfill:usda-grain-stocks`, **antes** da coleta diária num banco
   novo (a diária recusa gravar enquanto a fonte estiver vazia, como na área plantada).
2. **Etanol no leitor do WASDE**, como **duas séries separadas, sem emendar**: `WASDE.MILHO.EUA.ETHANOL_FUEL` (jan a
   mar/2011) e `WASDE.MILHO.EUA.ETHANOL_BYPRODUCTS` (abr/2011 em diante), no mesmo critério das regiões que mudaram de
   nome (ADR 0015). Duas métricas a mais no card "Milho EUA".
3. **Carga do etanol numa fonte já carregada:** o script do WASDE ganhou `--anosPorBloco`. Em blocos de 5 anos, o 1º
   bloco gravaria a série nova e os seguintes a veriam como carregada, descartando as edições já ingeridas para as
   outras séries: o vintage do etanol pararia em 2015. Por isso, **uma execução só**:
   `npm run backfill:wasde-milho -- --anosPorBloco=99`. As outras séries do WASDE não mudam (as edições já gravadas
   são descartadas).
4. **Frequência nova, TRIMESTRAL**, para o card "Estoques trimestrais de milho dos EUA (USDA Grain Stocks)": uma linha
   em `periodo-grafico.js` (abre em 5 anos, 20 pontos) e nos rótulos das telas, como pede o `CLAUDE.md`.

## Fora do escopo (de propósito)

- **Estoques por estado, outros grãos e a tabela em toneladas** do Grain Stocks.
- **Edições anteriores a 2001-06-29** (só TXT/PDF), como no WASDE e na área plantada.
- **Emendar as duas séries do etanol**, ou qualquer conta com os estoques (uso implícito, variação contra o ano
  anterior, surpresa contra a expectativa): são medidas, e cabem ao David.

## Resultado (2026-10-01, banco de dev)

| Carga | Resultado |
|---|---|
| Grain Stocks (`backfill:usda-grain-stocks`) | 102 edições lidas; **588 linhas** (total 238, na fazenda 117, fora da fazenda 233), 107 trimestres de 2000-03 a 2026-09, **267 revisões**. 0 falhas de gravação; as 2 "falhas" da execução são as 2 edições sem ZIP, e a de 2003-02-27 ficou como aviso |
| Etanol (`backfill:wasde-milho -- --anosPorBloco=99`) | `ETHANOL_BYPRODUCTS`: 154 linhas, 19 safras, desde 2011-04-08; `ETHANOL_FUEL`: 4 linhas, 3 safras, jan e fev/2011 |

**Achado na carga do etanol, anterior a ela:** a listagem do ESMIS tem duas edições de dezembro de 2018, a de
2018-12-11 (já gravada) e a de **2018-12-14**, com cabeçalho de dezembro e valores diferentes (área plantada de 2018:
89,1 contra 88,9). A carga de 2026-09-21 não gravou a de 14/12. Ao reler, o serviço point-in-time recusou os valores
dela para as séries já carregadas, porque são anteriores a versões já gravadas (o append-only não insere versão no
meio da sequência): **227 falhas, nada sobrescrito**, e a execução terminou como "parcial". O etanol, série nova,
recebeu essa edição normalmente. O que é a edição de 14/12 não foi investigado.

## Consequências e limitações

- **Grain Stocks:** a listagem do ESMIS é raspada (sem API confirmada, o mesmo risco dos ADRs 0015 e 0027) e o CSV não
  tem dicionário formal; uma mudança de layout vira falha explícita da edição, não dado errado. Licença: governo dos
  EUA, não verificada juridicamente. As 2 edições sem ZIP (2013-11-19 e 2019-01-11) ficam sem leitura.
- **Etanol:** só os EUA (o WASDE não traz etanol por país). A série de 2011 tem só 3 edições.
- **Num servidor com o WASDE já carregado**, a 1ª coleta diária depois do deploy reporta "carga histórica do WASDE
  ainda não feita" para as 2 séries do etanol, até o backfill de bloco único rodar. As demais séries do WASDE seguem
  normais.
