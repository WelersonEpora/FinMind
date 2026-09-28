# World Bank — Commodity Price Data ("Pink Sheet") — reconhecimento (nível 1, sem coletor)

**Data:** 2026-09-28. **Situação:** reconhecida. **Ouro: nada novo** (é a média mensal do preço que a LBMA já nos
dá por dia). **Milho: um dado novo**, o preço de exportação do milho americano (FOB Golfo) desde 1960, mas mensal.
**Recomendação: não implementar por ora** (ver no fim).

O relatório FEL 1 lista "World Bank — Commodity Markets: preços internacionais de commodities (Pink Sheet)" entre as
fontes do ouro (p. 11 e 14) e no plano de integração, Fase 1, "API Commodity Markets, gratuita, Pink Sheet de
preços, Ouro e Petróleo" (§9.2, p. 28). Pergunta que guiou o reconhecimento: **o que a Pink Sheet traz de milho e de
ouro que ainda não temos?**

## Checklist

| # | Pergunta | Resposta (evidência de 2026-09-28) |
|---|---|---|
| 1 | API oficial? | **Não para preços.** A API de indicadores (`api.worldbank.org/v2/sources`, 100 fontes listadas) não tem fonte de preço de commodity: a "API Commodity Markets" do FEL 1 não se confirma. O dado sai em **planilha**: `CMO-Historical-Data-Monthly.xlsx` (e a anual), link na página `worldbank.org/en/research/commodity-markets` |
| 2 | Pública ou autenticada? | Pública (HTTP 200, sem login). `curl` do Git Bash falha no certificado; o `fetch` do Node funciona (o mesmo caso dos hosts `usda.gov`) |
| 3 | Cadastro ou chave? | Nenhum |
| 4 | Formato | XLSX. Aba `Monthly Prices`: linha 5 com o nome da série, linha 6 com a unidade, depois uma linha por mês (`1960M01`). Abas `Description` (definição e fontes de cada série) e `Mismatch Details` (ver pergunta 7) |
| 5 | Documentação | Aba `Description` da própria planilha. Sem dicionário de dados formal nem aviso de mudança de layout |
| 6 | Histórico | **1960-01 a 2026-08** (800 meses), mensal, em US$ nominais. **Milho** (`Maize`, coluna 30): "Maize (U.S.), no. 2, yellow, f.o.b. US Gulf ports", US$/t; 2026-08 = 224,0. **Ouro** (`Gold`, coluna 69): US$/oz troy; 2026-08 = 4.411 |
| 7 | Revisa? | **Sim, e a própria planilha mostra.** A aba `Mismatch Details` compara a edição atual com a anterior, célula a célula: na edição de 02/09/2026 há diferenças em meses de **2020-09 a 2026-07** (farelo de soja, óleos, gás, LNG…). **Nenhuma em milho ou ouro nesta edição.** A URL do arquivo é sempre a mesma: a edição anterior é sobrescrita. Não achamos um arquivo das edições antigas (os PDFs mensais da Pink Sheet trazem só os últimos meses) |
| 8 | Publicação | Mensal. A célula A4 traz a data ("Updated on September 02, 2026"), igual ao `Last-Modified` do arquivo (2026-09-02): o `published_at` seria **real, só a data**. O mês de agosto saiu em 2 de setembro |
| 9 | Limite de requisições | Planilha: nenhum observado (1 download). O catálogo de dados (`datacatalogapi.worldbank.org`) respondeu **429** com `retry-after` em 3 tentativas seguidas |
| 10 | Licença | **Não confirmada para esta planilha.** O catálogo do Banco Mundial usa CC BY 4.0 em geral, mas a aba `Description` cita como fontes do ouro e do milho a **Bloomberg Finance L.P.**, a Kitco, a Thomson Reuters Datastream, a Platts e a LBMA, entre outras. Não achamos uma licença específica da Pink Sheet |
| 11 | Riscos | O layout da planilha depende da posição das colunas (a coluna tem só o nome, sem código). **A definição do ouro mudou em jun/2025**: até maio/2025 era o fixing da tarde de Londres (LBMA PM); desde junho é a "média do preço à vista" (fonte comercial). O milho é um **preço de exportação** (Golfo dos EUA), não o futuro ZC da CME |

## O que ela traz que ainda não temos

**Ouro: nada.** É a média mensal do mesmo preço que coletamos por dia. Conferimos com a média mensal da LBMA PM do
nosso banco: 2020-03, Pink Sheet 1.592 × LBMA 1.591,9; 2025-07, 3.340 × 3.338,3; 2026-06, 4.228 × 4.238,3;
2026-08, 4.411 × 4.409,9. As diferenças de alguns dólares vêm dos dias de fixing (e, desde jun/2025, da troca de
fonte). Uma média mensal de um preço que já temos por dia é um cálculo, não um dado novo.

**Milho: um preço físico de exportação dos EUA, mensal, desde 1960.** Nenhuma outra fonte nossa tem isso: o CCM da
B3 começa em 2022 e o indicador CEPEA em 2018, os dois em reais e no Brasil. Mas ele **não resolve a pergunta do
preço histórico** (perguntas 2 e 3 da §4 do `STATUS_DO_PROJETO.md`): é mensal, não diário, e sem abertura, máxima,
mínima nem contratos em aberto, que é o que o FEL 1 exige para backtest (§6.5.2 e §12.1).

## Recomendação

**Não implementar por ora.** Para o ouro ela duplica a LBMA. Para o milho, o dado é novo, mas o motor ainda não
tem uma medida que o use. Pode servir, no futuro, como **referência de longo prazo do preço do milho em dólar**, se
o Comitê decidir que o preço mensal basta para algum estudo; nesse caso, antes de implementar, confirmar a licença
(pergunta 10) e guardar a planilha de cada mês, porque a fonte sobrescreve a anterior.

## Fontes

- Página: https://www.worldbank.org/en/research/commodity-markets
- Planilha mensal (edição de 2026-09-02): https://thedocs.worldbank.org/en/doc/74e8be41ceb20fa0da750cda2f6b9e4e-0050012026/related/CMO-Historical-Data-Monthly.xlsx
- Lista de fontes da API de indicadores: https://api.worldbank.org/v2/sources?format=json&per_page=100
