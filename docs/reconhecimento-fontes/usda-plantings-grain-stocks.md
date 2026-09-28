# USDA NASS — Prospective Plantings / Acreage e Grain Stocks (milho) — reconhecimento

**Data:** 2026-09-28. **Situação:** **área plantada implementada** (nível 5, pelo ESMIS, ADR 0027);
**Grain Stocks reconhecido** (nível 1), aguardando o Comitê. As duas estão na API do QuickStats (a mesma chave do
Crop Progress, ADR 0009), mas **a API não serve para o vintage de nenhuma das duas**: o número de cada edição, com a
data real, está no **arquivo de edições do ESMIS** (seções no fim).

> **Correção (2026-09-28, antes de implementar):** a primeira versão deste reconhecimento dizia que a área plantada
> tinha "vintage real desde 2012, `published_at` real pelo `load_time`". A verificação ano a ano desmentiu: ver
> "Área plantada: o QuickStats não serve" abaixo. As linhas 6 a 8 do checklist foram corrigidas.

O relatório FEL 1 lista, na tabela de fontes do milho, "USDA/NASS e FAS: WASDE, Crop Progress (condição das
lavouras), **Prospective Plantings, Grain Stocks**" (p. 10). O WASDE e o Crop Progress já são coletados; estes dois
não constavam em nenhum documento do FinMind. Pergunta que guiou o reconhecimento: **o WASDE já traz esses números?**

## Checklist

| # | Pergunta | Resposta (evidência de 2026-09-28) |
|---|---|---|
| 1 | API oficial? | Sim: **QuickStats** (`quickstats.nass.usda.gov/api/api_GET`), a mesma do Crop Progress |
| 2 | Pública ou autenticada? | Pública, com chave |
| 3 | Cadastro ou chave? | Chave gratuita: a **`NASS_API_KEY` que já usamos** serve (consultas feitas com ela) |
| 4 | Formato | JSON, uma linha por valor, com `short_desc`, `reference_period_desc`, `year`, `Value` (texto com separador de milhar) e `load_time` |
| 5 | Documentação | Sim, a do QuickStats (a mesma do ADR 0009) |
| 6 | Histórico | **Área plantada** (`CORN - ACRES PLANTED`, nacional): uma série por estimativa do ano, em `reference_period_desc`: `YEAR - MAR ACREAGE` (o **Prospective Plantings**, 31 de março), `YEAR - JUN ACREAGE` (o **Acreage**, 30 de junho), `AUG/SEP/OCT FORECAST` e `YEAR` (final). **A de março existe de 2012 a 2026** (15 anos); **a de junho só de 2018 em diante**, e faltam estimativas intermediárias em vários anos. **Estoques** (`CORN, GRAIN - STOCKS`, bushels, nacional): 1º de março, junho, setembro e dezembro, total, na fazenda e fora da fazenda, **desde 1926** |
| 7 | Revisa? | **Área:** cada estimativa é uma linha separada (2026: março 95.338 mil acres, junho 95.343, agosto 96.730, setembro 96.777), **mas a linha `YEAR` (final) é sobrescrita a cada revisão** e as dos anos anteriores ao ano da edição não existem como versão. **Estoques: guardam só o valor revisado.** O `load_time` dos estoques de 2025 (março, junho e setembro) é **2026-01-12**: foram revisados no relatório anual de janeiro e o número original sumiu |
| 8 | Publicação | **Área:** o `load_time` só é a data do relatório de ~2020 em diante: as de março de **2012 a 2017 têm todas `load_time` 2018-01-23** (carga em lote) e a de 2019 tem 2020-02-05. **Estoques:** o `load_time` é a data da **última revisão**, não da primeira publicação; a primeira teria de ser **estimada** pelo calendário do NASS (o de 1º de setembro de 2026 sai em **30/09/2026, 12:00 ET**, pelo calendário oficial do NASS lido em 2026-09-28) |
| 9 | Limite de requisições | O mesmo do QuickStats (50.000 linhas por consulta, ADR 0009); as duas consultas trouxeram 142 e 1.132 linhas |
| 10 | Licença | Governo dos EUA, como o Crop Progress; não verificado juridicamente |
| 11 | Riscos | O `Value` vem como texto (`"95,338,000"`); o nome das estimativas em `reference_period_desc` mudou ao longo dos anos (ex.: `AUG ACREAGE` × `AUG FORECAST`, `OCT ACREAGE` × `OCT FORECAST`) |

## O WASDE já traz esses números?

**Área plantada: sim, mas seis semanas depois.** O WASDE só abre a safra nova em maio. Na safra 2026/27, a área
aparece no nosso banco pela primeira vez em **2026-05-12** (95,3 milhões de acres, o número do Prospective Plantings
arredondado), enquanto o USDA o publicou em **2026-03-31**. Entre o fim de março e meados de maio, o motor não
veria o dado que o mercado já precificou. O WASDE também arredonda (95,338 → 95,3).

**Estoques trimestrais: não.** O WASDE só traz o estoque final do ano-safra (1º de setembro). Os estoques de 1º de
dezembro, março e junho, que são os que surpreendem o mercado nos dias do relatório, não estão em nenhuma fonte
nossa. O de 1º de setembro também revisa o estoque final do WASDE, mas o WASDE só o incorpora no mês seguinte.

## Recomendação

**Possíveis, implementar só com autorização** (fonte nova, ainda que da mesma API: `CLAUDE.md`, "Convenções para
novos coletores"). Seria um coletor pequeno, no molde do Crop Progress:

- **Área plantada (Prospective Plantings e Acreage):** vale a pena: antecipa em seis semanas um número que o WASDE só
  traz em maio. **Autorizada e implementada em 2026-09-28 pelo ESMIS, não pela API** (ADR 0027).
- **Estoques trimestrais (Grain Stocks):** dado novo, mas **só com o valor revisado**, então o histórico não é
  point-in-time: vale daqui para frente (como o IMEA, ADR 0018), ou com a primeira publicação estimada e sabendo
  que o número guardado pode ser o revisado. **Superado pelo ESMIS (seção abaixo):** o arquivo de edições tem o
  número original de cada relatório desde 1973, então os estoques não dependem mais da pergunta 5.

## Fontes

- QuickStats API: https://quickstats.nass.usda.gov/api
- Calendário do NASS: https://www.nass.usda.gov/Publications/Calendar/reports_by_date.php
- Consultas feitas: `source_desc=SURVEY`, `commodity_desc=CORN`, `agg_level_desc=NATIONAL`, e
  `statisticcat_desc=AREA PLANTED` (`unit_desc=ACRES`) ou `statisticcat_desc=STOCKS` (`unit_desc=BU`, `domain_desc=TOTAL`)

## Área plantada: o QuickStats não serve; o ESMIS sim (2026-09-28)

Antes de implementar, a lista completa das 142 linhas de `CORN - ACRES PLANTED` do QuickStats, ano a ano, mostrou
que o `load_time` não é a data de publicação no histórico (2012–2017 carregados em 2018-01-23), que a estimativa de
junho só existe desde 2018 e que a final é sobrescrita. O ESMIS guarda cada edição:

| Publicação | Edições | Com ZIP (CSV) |
|---|---|---|
| Prospective Plantings | 61 (1964-03-18 a 2026-03-31) | 25, desde 2002-03-28 |
| Acreage | 52 (1975-06-30 a 2026-06-30) | 26, desde 2001-06-29 |

As 51 com CSV foram lidas sem erro; a data impressa no CSV é igual à da listagem nas 51; o valor do ano da edição é
igual ao do QuickStats nas 15 de março e nas 9 de junho que a API tem. Cada edição traz também 1 ou 2 anos
anteriores com o valor daquele dia. Implementado: ADR 0027.

## Grain Stocks pelo ESMIS: o número como foi publicado (2026-09-28)

O **ESMIS** (`esmis.nal.usda.gov`), o mesmo arquivo de onde vem o WASDE com todas as revisões (ADR 0015), guarda
**cada edição do Grain Stocks** como foi publicada, na página `/publication/grain-stocks` (22 páginas de listagem).

| Pergunta | Resposta (evidência de 2026-09-28) |
|---|---|
| Quantas edições? | **218**, de **1973-10-24 a 2026-06-30**, com a data do relatório na listagem (`datetime`, sem a hora real: o relatório sai ao meio-dia ET) |
| Formatos | **Só PDF** de 1973 a 1994 (88 edições); **PDF + TXT** a partir de 1995; **PDF + TXT + ZIP** a partir de **2001-06-29** (102 edições). O ZIP traz **CSV por tabela** e um `grst_all_tables.csv` (edição de set/2025: 50 KB, gerado na véspera) |
| O número é o original? | **Sim.** Estoque total de milho dos EUA, edição a edição × valor atual na API do QuickStats: 1º/mar/2025, **8.150.669** × 8.147.437 mil bu (−0,04%); 1º/jun/2025, **4.643.636** × 4.642.894 (−0,02%); 1º/set/2025, **1.531.613** × 1.551.286 (**+1,3%**, revisado no relatório anual de janeiro). A API perdeu os três números originais; o ESMIS tem |
| Revisões | Cada edição traz também o trimestre anterior revisado (ex.: a de janeiro traz o 1º de setembro revisado): a cadeia de versões sai das próprias edições, como no WASDE |
| Riscos | A listagem é raspada (sem API confirmada, o mesmo risco do ADR 0015). A edição de 2025-09-30 aparece **três vezes** na listagem, com arquivos idênticos (mesmo MD5): o coletor precisa descartar a repetição. Leitura do CSV sem dicionário formal (há um `grst_help.htm` no ZIP, não lido) |

**Tamanho da revisão × tamanho do sinal:** as revisões medidas vão de 0,02% a 1,3%. O efeito do relatório no estoque
final do WASDE foi de −6% (safra 2022/23: 1.452 → 1.361 mi bu, do WASDE de setembro para o de outubro de 2023) e −3%
(2023/24: 1.812 → 1.760 mi bu). A revisão é menor que o sinal, mas não desprezível no caso de setembro.

**Recomendação revista:** se o Comitê quiser os estoques trimestrais, o caminho é o **ESMIS pelo CSV**, com vintage
real desde 2001-06-29 (~100 edições), e não a API. Antes de 2001 só há TXT/PDF, fora do escopo, como no WASDE.
A decisão deixa de ser "aceitar dado sem vintage" (pergunta 5) e passa a ser só de medida: **o fator 3 usa a
contagem trimestral de estoques, e como?**

- Arquivo de edições: https://esmis.nal.usda.gov/publication/grain-stocks
