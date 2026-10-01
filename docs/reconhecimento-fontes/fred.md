# FRED — reconhecimento

Nível **5** (coletado e com histórico completo). Linha do índice:
`docs/reconhecimento-fontes/README.md`. Evidência detalhada: ADR 0009 e ADR 0011.
Séries: `DGS10`, `T10YIE`, `DFII10`, `DTWEXBGS`. Coletor: `collectors/fred/fred.collector.js`.

| # | Pergunta | Resposta | Evidência |
|---|---|---|---|
| 1 | API oficial? | Sim: REST (`/fred/series/observations`) e ALFRED (vintages). O coletor diário usa a API com chave; sem chave, cai no CSV do gráfico do site (reserva) | ADRs 0011, 0012 |
| 2 | Pública ou autenticada? | CSV sem autenticação; REST exige chave | ADRs 0009, 0011 |
| 3 | Cadastro/chave? | CSV: não. REST: chave gratuita (`FRED_API_KEY`, registrada em 2026-09-21) | ADR 0011 |
| 4 | Formato | JSON na REST (coleta diária, com chave); CSV na reserva. As duas vias devolvem as mesmas observações (0 diferenças nas 4 séries) | ADR 0012 |
| 5 | Documentação oficial | Existe para a REST. O `fredgraph.csv` (reserva) é o endpoint do gráfico do site e não foi confirmado como interface documentada/estável | — |
| 6 | Histórico | `DGS10` desde 1962; `DFII10` e `T10YIE` desde 2003; `DTWEXBGS` desde 2006 | ADR 0009 |
| 7 | Revisões (vintage) | Medido no ALFRED: `DGS10`/`DFII10`/`T10YIE` **0 revisões** (~2.100 observações); `DTWEXBGS` **33 revisões** em ~380. ALFRED só cobre vintage de ~2015–2018 em diante (varia por série) | ADR 0011 |
| 8 | Fuso / `published_at` | Datas de observação em dia (calendário EUA). Publicação **estimada**: 1 dia útil depois (H.15); `DTWEXBGS` na segunda seguinte (divulgação semanal). Não considera feriados dos EUA | ADR 0009 |
| 9 | Limite de requisições | **Não verificado** | — |
| 10 | Licença | Lida em 2026-09-21 (páginas oficiais; resumo automático, não parecer jurídico). `DGS10`, `DFII10`, `DTWEXBGS`: "Public Domain: Citation Requested" (Board of Governors) — uso comercial interno permitido com citação. `T10YIE`: status **não confirmado**. Termos da API: sem sugerir endosso do Fed; aviso de "não endossado" ao exibir a terceiros. Uso atual: pesquisa interna | ADR 0009 |
| 11 | Riscos técnicos | Reserva CSV não documentada (pode mudar); a produção só usa a API se `FRED_API_KEY` estiver no `.env` da VM (já está; senão segue no CSV); `published_at` estimado; `DTWEXBGS` **não é o DXY** (índice ICE, licenciado); publicação semanal | ADR 0009 |

**Validação cruzada real:** `DGS10 − T10YIE` reproduz `DFII10` em 5.932 de 5.932
pontos (diferença máxima 0).

**Licença (ver "Entregas de 2026-09-21" em `STATUS_DO_PROJETO.md`) — adiada por decisão de 2026-09-21:** não há
distribuição nem comercialização prevista. Antes de exibir a terceiros: citar "Board of
Governors of the Federal Reserve System (US), retrieved from FRED, Federal Reserve Bank of St.
Louis", confirmar o status da `T10YIE`, incluir o aviso da API. A coleta já usa a API (ADR 0012).

## Séries do ouro acrescentadas em 2026-10-01 (ADR 0033)

CPI (`CPIAUCSL`, `CPILFESL`, `CPIAUCNS`, pelo ALFRED), meta do Fed (`DFEDTARU`, `DFEDTARL`, `DFEDTAR`), as 6 moedas
da cesta do DXY (`DEXUSEU`, `DEXJPUS`, `DEXUSUK`, `DEXCAUS`, `DEXSDUS`, `DEXSZUS`) e o índice do dólar contra as
economias avançadas (`DTWEXAFEGS`). Só o que muda em relação às 11 respostas acima (evidência completa no ADR 0033):

| # | Pergunta | Resposta | Evidência |
|---|---|---|---|
| 6 | Histórico | CPI cheio com ajuste desde 1947, núcleo desde 1957, sem ajuste desde 1913; meta em faixa desde 2008-12-16 e alvo único de 1982-09-27 a 2008-12-15; moedas desde 1971 (euro desde 1999); `DTWEXAFEGS` desde 2006 | ADR 0033 |
| 7 | Revisões (vintage) | **CPI revisa** (657 de 955 meses no cheio com ajuste); as moedas quase nunca (1 ou 2 datas); `DTWEXAFEGS` revisa como o `DTWEXBGS`; a meta é o valor vigente | ADR 0033 |
| 8 | `published_at` | CPI: **real**, a data de cada versão do ALFRED (949 de 949 iguais ao calendário do release 10). Moedas e `DTWEXAFEGS`: segunda seguinte (H.10). Meta: o próprio dia | ADR 0033 |
| 10 | Licença | Mesma origem das séries já lidas (Board of Governors do Fed; o CPI é do BLS, governo dos EUA). A página de cada série nova **não foi lida**: confirmar antes de exibir a terceiros. Uso interno | — |
| 11 | Riscos técnicos | O CPI só vem pela API (o ALFRED exige chave): sem `FRED_API_KEY`, não é coletado. O CPI mudou de base em fev/1988: as versões anteriores estão em 1967 = 100 | ADR 0033 |

## Preço mensal do café do FMI, acrescentado em 2026-10-01 (ADR 0045)

`PCOFFOTMUSDM` (arábica, "Other Mild Arabica") e `PCOFFROBUSDM` (robusta), do release 365 ("Primary Commodity
Prices", do FMI), pelo ALFRED, como o CPI. Só o que muda em relação às respostas acima (evidência completa no ADR 0045):

| # | Pergunta | Resposta | Evidência |
|---|---|---|---|
| 6 | Histórico | 1992-01 em diante, mensal (US¢/lb, média do mês). Os meses de 1980 a 1991 estavam nas versões antigas e foram retirados da série atual | ADR 0045 |
| 7 | Revisões (vintage) | **Revisa:** 530 de 559 meses do arábica têm mais de uma versão (91 versões desde 2015-11-06) | ADR 0045 |
| 8 | `published_at` | A data de cada versão no ALFRED, que é quando chegou ao FRED, não quando o FMI publicou: o FRED já ficou 706 dias sem atualizar a série (2017 a 2019). Mediana de 47 dias depois do 1º do mês, desde 2015 | ADR 0045 |
| 10 | Licença | "Copyright © 2016, International Monetary Fund. Reprinted with permission" (nota da série); os termos do FMI não foram lidos. Uso interno | ADR 0045 |
| 11 | Riscos técnicos | Só pela API (o ALFRED exige chave). A data atrasa nos intervalos em que o FRED não atualiza. Fonte própria (`FRED_ALFRED_FMI`), separada da do CPI | ADR 0045 |
