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
| JODI Oil | Demanda global (Alto); OPEP+ (Alto) | **Produção implementada** (ADR 0042): ZIP com CSV mundial, mensal, desde 2002. **O Brasil para em 2022-12, a Rússia em 2023-03 e a Guiana não aparece** | 4 |
| Baker Hughes, contagem de sondas | Produção e shale (Médio) | **Inacessível**: sem resposta daqui nem do servidor (2026-10-01) | 0 |
| OPEP, Monthly Oil Market Report | Decisões da OPEP+ (Alto); demanda global (Alto) | PDF; links montados por script | 0 (incerteza) |
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
- **OPEP (MOMR):** o site responde, mas a página do relatório monta os links por script; o PDF não foi localizado. A
  produção da OPEP por país também está no JODI (a conferir).
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
