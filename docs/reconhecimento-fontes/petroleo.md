# Reconhecimento — fontes do petróleo (FEL 1)

Reconhecimento feito em 2026-10-01, com chamada real, das fontes que o FEL 1 lista para o petróleo (§6.2, tabela 5:
12 fontes; §6.5.2, preço) e que a planilha `controle_fatores.xlsx` liga aos 10 fatores do petróleo. Ponto de partida
da onda do petróleo (`STATUS_DO_PROJETO.md`, §3), autorizada pelo usuário em 2026-10-01, só aquisição de dados. O que
foi implementado está no ADR 0040.

## Resumo

| Fonte | Fator (peso, planilha) | Resultado | Nível |
|---|---|---|---|
| EIA, planilhas do Weekly Petroleum Status Report | Estoques dos EUA (Alto); produção e shale (Médio); refino (Médio) | **Implementada** (ADR 0040): 11 séries semanais desde 1982 | 4 |
| EIA, preços à vista (WTI, Brent, gasolina, diesel) | Preço (FEL 1, §6.5.2) | **Implementada** (ADR 0040): diária, WTI desde 1986, Brent desde 1987 | 4 |
| CFTC COT, WTI da NYMEX | Especulação (Médio) | **Implementada** (ADR 0040): o coletor do COT, código 067651, desde 2006 | 4 |
| ANP, dados abertos | Oferta fora da OPEP (Médio) | **Implementada** (ADR 0041): CSV mensal por UF e terra/mar, desde 1997 | 4 |
| JODI Oil | Demanda global (Alto); OPEP+ (Alto) | **Produção implementada** (ADR 0042): ZIP com CSV mundial, mensal, desde 2002. **O Brasil para em 2022-12, a Rússia em 2023-03 e a Guiana não aparece**. **Demanda implementada** (ADR 0046): outro arquivo (derivados), 105 países desde 2002; **sem a Rússia, Brasil até 2022-02** | 4 |
| Baker Hughes, contagem de sondas | Produção e shale (Médio) | **Inacessível**: sem resposta daqui nem do servidor (2026-10-01) | 0 |
| EIA, Short-Term Energy Outlook (STEO), arquivo de edições | Decisões da OPEP+ (Alto) | **Implementada** (ADR 0091, 2026-10-06): produção da OPEP e da OPEP+ por país e capacidade ociosa da OPEP, uma planilha por edição desde jan/2008, sem as cotas | 5 |
| OPEP, Monthly Oil Market Report e comunicados | Decisões da OPEP+ (Alto); demanda global (Alto) | **Bloqueada**: 403 com o desafio do Cloudflare em todas as páginas (2026-10-06) | 0 |
| IEA, Oil Market Report | Demanda global (Alto) | 403; assinatura (FEL 1) | Pago |
| API, Weekly Statistical Bulletin | Estoques (Alto) | A página citada dá 404; assinatura | Pago (a confirmar) |
| MME | — | Boletins em PDF, não testado | 0 |
| CME (CL), ICE (Brent), S&P Global Platts | Preço | Pagos (FEL 1, §6.5.2) | Pago |
| Dólar (DXY) e juros (Fed) | Dólar (Médio); juros (Médio) | Já coletados para o ouro (ADRs 0009 e 0033) | 5 |
| Geopolítica | Geopolítica (Alto) | Mesma situação do ouro: depende do David | — |

## EIA — Weekly Petroleum Status Report e preços à vista

| # | Pergunta | Resposta (evidência) |
|---|---|---|
| 1 | API oficial? | Sim, a API v2 (`api.eia.gov`), que **exige chave** (ADR 0024). O mesmo dado sai sem chave na planilha histórica de cada série (`/dnav/pet/hist_xls/<sourcekey><w ou d>.xls`), o caminho já usado pelo etanol |
| 2–3 | Autenticação / chave | Planilha pública, sem chave |
| 4 | Formato | XLS, aba "Data 1": linha `Sourcekey`, cabeçalho e uma linha por período (`Sep 25, 2026`, valor) |
| 5 | Documentação | Páginas oficiais do WPSR e dos preços à vista; a planilha não é documentada como API |
| 6 | Histórico | 16 séries testadas, todas com dado até 2026-09-25 (semanais) ou 2026-09-29 (diárias). Estoques de petróleo sem a SPR e na SPR, entrada nas refinarias e destilados desde 1982-08-20; produção desde 1983; gasolina e importação desde 1990; utilização e derivados fornecidos desde nov/1990; exportação desde 1991; Cushing desde 2004. WTI desde 1986-01-02, Brent desde 1987-05-20, gasolina de NY desde 1986, diesel S10 de NY desde 2006. **Futuros da NYMEX (RCLC1 a 4): pararam em 2024-04-05** |
| 7 | Revisões | A planilha traz só o valor atual (sem versões); a produção semanal é estimativa, depois substituída pelos números mensais (outra publicação). Revisão da série semanal não medida |
| 8 | `published_at` | `Last-Modified` de **todas** as 16 planilhas em quarta 2026-09-30, 14:42–14:45 UTC (10:43 ET, logo depois do WPSR). Os **preços diários saem uma vez por semana**, junto com o WPSR, com os dias até a terça anterior (medido numa divulgação só). Regra de feriado e calendário oficial: a do etanol (ADR 0024) |
| 9 | Limite de uso | Não informado; ~15 planilhas por coleta (~130 a 500 KB cada) |
| 10 | Licença | Dado do governo dos EUA. **Os preços à vista a EIA obtém de um fornecedor comercial (Refinitiv/LSEG)**: licença não verificada (uso pessoal, decisão do usuário de 2026-10-01) |
| 11 | Riscos | Planilha sem contrato (o layout é o mesmo do etanol desde 2026-09-23); a regra de publicação dos preços diários foi medida uma vez; os futuros saíram da EIA (a mesma saída pode acontecer com os preços à vista) |

## CFTC COT — petróleo WTI

| # | Pergunta | Resposta (evidência) |
|---|---|---|
| 1–5 | Acesso | A mesma API Socrata do ouro, do milho e do café (ADR 0009), sem chave |
| 6 | Histórico | "CRUDE OIL, LIGHT SWEET - NEW YORK MERCANTILE EXCHANGE", código **067651**, desde 2006-06-13 até 2026-09-22 (1.059 semanas). O código 067411 é o WTI da ICE Futures Europe (outro contrato, desde 2009); o Brent da ICE Europe não está na CFTC |
| 7–11 | Demais | Os do COT (ADR 0009): `published_at` real desde 2022-08, estimado antes |

## ANP — dados abertos de produção

| # | Pergunta | Resposta (evidência) |
|---|---|---|
| 1 | API oficial? | Não: arquivos CSV na página de dados abertos (`gov.br/anp/.../dados-abertos/producao-de-petroleo-e-gas-natural-por-estado-e-localizacao`) |
| 2–3 | Autenticação | Pública, sem chave |
| 4 | Formato | CSV com `;`, UTF-8 com BOM: `ANO;MÊS;GRANDE REGIÃO;UNIDADE DA FEDERAÇÃO;PRODUTO;LOCALIZAÇÃO;PRODUÇÃO` (m³), mês por extenso abreviado (`JAN`) |
| 6 | Histórico | **Desde jan/1997**, por UF e terra/mar (7.921 linhas). **Os meses futuros do ano corrente vêm preenchidos com 0** (nov e dez/2026): um coletor tem de tratar isso, senão grava zeros falsos |
| 7–8 | Revisões / publicação | Não medidos (sem data de atualização no arquivo; o cabeçalho HTTP não trouxe `Last-Modified`) |
| 9–11 | Demais | Não verificados; licença de dados abertos do governo, não lida |

## JODI Oil

| # | Pergunta | Resposta (evidência) |
|---|---|---|
| 1 | API oficial? | Não: ZIP para download (`jodidata.org/_resources/files/downloads/oil-data/world_primary_csv.zip`, 23 MB; CSV de 285 MB) |
| 4 | Formato | CSV: `REF_AREA, TIME_PERIOD, ENERGY_PRODUCT, FLOW_BREAKDOWN, UNIT_MEASURE, OBS_VALUE, ASSESSMENT_CODE`; produtos (petróleo, NGL, outros e total) e fluxos (produção, importação, exportação, refino, estoques, variação de estoque) por país |
| 6 | Histórico | Mensal, **de jan/2002 a jul/2026** (arquivo de 2026-09-21) |
| 7 | Revisões | O arquivo é a versão atual; o `ASSESSMENT_CODE` indica a qualidade do dado. Revisões não medidas |
| 2–3, 5, 8–11 | Demais | Público, sem chave; o resto não verificado. O arquivo é grande: um coletor teria de filtrar países e fluxos |

## Fontes com incerteza ou pagas

- **Baker Hughes (sondas): inacessível.** `rigcount.bakerhughes.com` e o endereço histórico não responderam (conexão sem resposta)
  em 2026-10-01, nem desta máquina nem do servidor (teste do usuário no container, timeout de 30 s). Não implementar; só volta se o site passar a responder.
- **OPEP (MOMR e comunicados):** em 2026-10-01 o site respondia, mas a página do relatório montava os links por script.
  Em 2026-10-06, todas as páginas (`monthly-oil-market-report.html`, `press-releases.html`, `momr.opec.org`) respondem
  403 com o desafio do Cloudflare ("Just a moment..."): acesso automático bloqueado. As cotas por país só estão nos
  comunicados. A produção da OPEP por país vem do STEO da EIA (abaixo).
- **IEA (OMR):** 403 a acesso automático; assinatura, segundo o FEL 1.
- **API (Weekly Statistical Bulletin):** a página citada redireciona para um 404; o boletim é vendido por assinatura
  (a confirmar). Os estoques semanais da EIA saem um dia depois e são públicos.
- **MME:** boletins em PDF; não testado (tende a republicar a ANP).
- **CME (CL), ICE (Brent), S&P Global Platts:** pagos. O preço à vista da EIA (acima) é a alternativa gratuita.

## Atualização de 2026-10-01 (passo 2)

- **ANP implementada** (ADR 0041). A página informa "atualizado em" por arquivo e a regra "até o último dia do mês
  subsequente ao mês de referência": a data de publicação do mês mais recente é real. Metadados oficiais: óleo e
  condensado, sem LGN. A soma anual confere com os totais da ANP (2019: 2,79 milhões de barris por dia).
- **JODI:** no arquivo de 2026-09-21, a produção de petróleo (`CRUDEOIL`, `INDPROD`, `KBD`) tem 104 países com valor;
  EUA, Arábia Saudita, Noruega e China até jul/2026; **Brasil até dez/2022, Rússia até mar/2023, Guiana sem dado**.
  Sem agregado mundial. A linha `CONVBBL` é o fator de conversão (barris por tonelada), não produção. O
  `ASSESSMENT_CODE` 3 ("não avaliado") é a maioria das linhas. Produção implementada, autorizada pelo usuário (ADR 0042).
- **JODI, demanda (2026-10-01):** fica no arquivo de derivados (`world_secondary_csv.zip`, 58 MB, CSV de 650 MB), não
  no de petróleo bruto. A demanda total (`TOTPRODS`, `TOTDEMO`, `KBD`) tem 105 países com valor; EUA, China (desde
  2004), Japão, Coreia e Alemanha até jul/2026, Índia até mar/2026; **Rússia sem dado, Brasil até fev/2022, Irã até
  jul/2018**. EUA em jul/2026: 21.160 mil barris/dia, contra 21.050 a 21.500 da EIA semanal. Implementada, autorizada
  pelo usuário (ADR 0046).

## EIA — Short-Term Energy Outlook (STEO), arquivo de edições (2026-10-06)

Pedido do F1 do petróleo (decisões da OPEP+), pelo usuário, no lugar das cotas, inacessíveis (ADR 0091).

| # | Pergunta | Resposta (evidência) |
|---|---|---|
| 1 | API oficial? | Sim, a API v2 (`api.eia.gov/v2/steo`), que exige chave e só guarda a edição atual. O arquivo de edições (`/outlooks/steo/archives/<mmm><aa>_base.xlsx`; XLS até 2013) guarda cada edição |
| 2–3 | Pública? Chave? | O arquivo é público, sem chave. A `DEMO_KEY` da API bateu no limite em ~10 chamadas |
| 4 | Formato | Planilha por edição. A produção de petróleo bruto da OPEP está na tabela 3c até 2023 (por país, com a capacidade e a ociosa de cada um) e na 3d de 2024 em diante (OPEP e OPEP+ por país; capacidade e ociosa só da OPEP). 1ª coluna = código da série da EIA (`copr_sa`, às vezes em maiúsculas), linhas 3 e 4 = ano e mês |
| 5 | Documentação | As notas de rodapé de cada tabela (filiação da OPEP e da OPEP+); o site do STEO |
| 6 | Histórico | Edições mensais de jan/2008 a out/2026 lidas (226); a de jan/2005 não tem a tabela por país. Cada edição traz ~4 anos de histórico e a previsão até o fim do ano seguinte (só o histórico é gravado) |
| 7 | Revisões | **Sim, medidas:** a OPEP total muda em 96% dos meses entre a 1ª estimativa e 3 edições depois (mediana de 100 mil barris/dia; p90 de 470 mil) e em 98% em 12 edições (mediana de 290 mil). A edição que tira um país da OPEP refaz o total para trás |
| 8 | Fuso e publicação | Mensal. Sai na terça depois da 1ª quinta do mês (5 edições conferidas). O `Last-Modified` é de 1 a 5 dias ANTES da divulgação (o arquivo fica pronto antes); a "Forecast date" (desde 2024) é o fechamento da previsão, também antes. `published_at` estimado: fim da quarta seguinte |
| 9 | Limite | ~10 s por pedido (servidor lento); nenhum 429 em ~450 pedidos com 4 em paralelo |
| 10 | Licença | Domínio público (governo dos EUA), como as demais séries da EIA |
| 11 | Riscos | O layout muda (3c → 3d); a filiação muda (Indonésia 2009, Catar 2019, Equador 2020, Angola 2024, Emirados 2026); o `oct13_base.xls` responde 200 com uma página de erro em HTML (a edição está no `.xlsx`); a capacidade por país só existe até 2023; as cotas não estão na fonte |
