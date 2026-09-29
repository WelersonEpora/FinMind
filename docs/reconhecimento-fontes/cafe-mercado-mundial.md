# Café, mercado mundial — reconhecimento (onda do café, passo 3)

**Data:** 2026-09-28. Linha do índice: `docs/reconhecimento-fontes/README.md`. Onda do café: `STATUS_DO_PROJETO.md`,
§3. Quatro fontes: USDA FAS PSD (café), USDA *Coffee: World Markets and Trade*, estoques certificados da ICE e ICO.
Tudo abaixo foi conferido com chamada real nesta data (download dos arquivos, leitura do conteúdo).

**Decisão do usuário (2026-09-28):** implementar a PSD pelo CSV e, com a produção dela, acrescentar países à NOAA
café (feito, ADR 0031); coletar a ICE (diária e backfill), **apesar da cláusula dos termos de uso** (ver abaixo; feito,
ADR 0032); ICO depois.

## USDA FAS PSD — café verde (CSV público)

| # | Pergunta | Resposta |
|---|---|---|
| 1 | API oficial? | Existe a API da PSD (exige chave `FAS_API_KEY`, ADR 0014). Para o café se usa o **arquivo de download** `https://apps.fas.usda.gov/psdonline/downloads/psd_coffee_csv.zip`: o mesmo dado, sem chave. A página de downloads (aplicação JavaScript) não foi lida |
| 2–3 | Autenticação / chave | Pública, sem chave |
| 4 | Formato | ZIP (440 KB) com um CSV (9,3 MB, 87.704 linhas): `Commodity_Code, Commodity_Description, Country_Code, Country_Name, Market_Year, Calendar_Year, Month, Attribute_ID, Attribute_Description, Unit_ID, Unit_Description, Value`. Aspas só em alguns campos (um deles contém vírgula: `Rst,Ground Dom. Consum`) |
| 5 | Documentação | Não lida (a semântica de `Calendar_Year`/`Month` é a do ADR 0014: mês da última revisão) |
| 6 | Histórico | Uma commodity (`0711100`, *Coffee, Green*), **94 países** (inclui `European Union`; **sem agregado mundial**), safras **1960 a 2026**. 19 atributos, todos em mil sacas de 60 kg: Production, Arabica/Robusta/Other Production, Beginning e Ending Stocks, Domestic Consumption (e as de torrado e solúvel), Exports e Imports (grão, torrado e moído, solúvel), Total Supply, Total Distribution |
| 7 | Revisa? | **Sim, mas o arquivo só traz o valor atual** (igual à API do milho, ADR 0014). `Calendar_Year`/`Month` da última revisão: 2026-07 (3.629 linhas), 2025-12 (1.577), 2025-06 (874), 2024-12 (1.615)... o ritmo semestral do relatório (abaixo). O vintage só começa a partir da coleta |
| 8 | `published_at` | Só o **mês** da última revisão, sem dia. O relatório semestral sai entre os dias 18 e 25 (ESMIS, abaixo): o fim do mês é um limite superior. `Last-Modified` do ZIP: 2026-07-22 |
| 9 | Limite | Não verificado (um arquivo por coleta) |
| 10 | Licença | Governo dos EUA; termos do FAS não lidos. Uso interno |
| 11 | Riscos | Sem vintage histórico; layout sem dicionário formal; URL do arquivo não documentada como API |

**Conferência de sanidade (safra 2025, produção, mil sacas):** Brasil 63.000 (arábica 38.000, robusta 25.000),
Vietnã 31.700, Colômbia 12.500, Indonésia 12.370, Etiópia 11.560, Uganda 7.095, Índia 6.430, Honduras 5.530, Peru
4.764, México 4.080. Brasil 2026: 71.900. Esta ordem é a que escolhe os países novos na NOAA café (ADR 0030).

## USDA *Coffee: World Markets and Trade*

Relatório semestral (junho e dezembro) do FAS, **só em PDF**. Listagem do ESMIS
(`esmis.nal.usda.gov/publication/coffee-world-markets-and-trade`, 4 páginas): datas 2023-12-20, 2024-06-20,
2024-12-18, 2025-06-25; a mais nova no ESMIS é de 2025-06, embora a PSD já tenha revisões de 2025-12 e 2026-07 (as
edições recentes estão só no site do FAS, não verificado). **Não implementar:** os números são os da PSD, e o PDF
só acrescentaria o vintage semestral por extração de tabela. As datas da listagem servem de conferência do
`published_at` da PSD.

## ICE Futures U.S. — estoques certificados do Coffee "C"

| # | Pergunta | Resposta |
|---|---|---|
| 1 | API oficial? | Não. Um XLS por pregão em `https://www.ice.com/publicdocs/futures_us_reports/coffee/coffee_cert_stock_AAAAMMDD.xls` |
| 2–3 | Autenticação / chave | Público, sem chave |
| 4 | Formato | XLS antigo (31 KB), uma aba. Blocos: **Total Bags Certified** (sacas por país de origem × porto: ANT, BAR, HA/BR, HOU, MIAMI, NOLA, NY, VA, e total), **Transition Bags Certified** (subconjunto sujeito a desconto a partir de 2027), grading do dia, **Pending Grading Report** e **Flagged for Rebagging**. Em 2026-09-25: 254.304 sacas certificadas (Brasil 52.791, Honduras 53.663, Peru 48.598, Uganda 35.322) |
| 5 | Documentação | Não |
| 6 | Histórico | Um arquivo por pregão desde ~2016-01-04 (sessão anterior; ~2.500 arquivos) |
| 7 | Revisa? | Não medido (é uma foto do dia) |
| 8 | `published_at` | O arquivo traz a hora: "As of: Sep 25, 2026 1:18:21PM" (Nova York, presumido). `Last-Modified` 17:22 GMT |
| 9 | Limite | **Cloudflare responde 429 depois de 2 ou 3 downloads**, mesmo com 10 s entre eles |
| 10 | Licença | **Termos de uso (lidos em 2026-09-28):** licença limitada "only for your own personal, non-commercial use" e "**The foregoing license does not include use of any data mining, robots or similar data gathering or extraction methods.** We may revoke this license at any time". O `robots.txt` não bloqueia `/publicdocs` |
| 11 | Riscos | **Jurídico:** a coleta automatizada fere a cláusula de robôs (risco aceito pelo usuário, ADR da fonte). **Técnico:** bloqueio por 429 (o backfill leva dias); o `curl` desta máquina recusou o certificado uma vez (o `fetch` do Node funciona) |

## ICO — International Coffee Organization

| Produto | Acesso | Conteúdo |
|---|---|---|
| Base de estatísticas | Só membros ou assinantes | — |
| *Coffee Market Report* mensal | PDF público, `www.ico.org/documents/cy2025-26/cmr-0826-e.pdf` (17 páginas; arquivo desde ao menos 2016) | Tabela 1: preços indicativos diários da ICO (composto I-CIP e por grupo) e futuros; 2: diferenciais; 3: balanço mundial (milhões de sacas); 4: exportações por país; 5: **estoques certificados de Nova York e Londres, mensais** |
| I-CIP mensal | PDF, `ico.org/documents/prices/I-CIP_MM.AAAA.pdf` | Preço composto |

**Licença (nota do próprio relatório):** "Materials provided may be used, reproduced, or transmitted, in whole or in
part, in any form [...] if the International Coffee Organization (ICO) is clearly acknowledged as the source" —
reuso livre com citação, mais aberto que a ICE. **Adiada** (decisão do usuário): extração de PDF; a tabela 5 é a
alternativa mensal e licenciada aos estoques da ICE.
