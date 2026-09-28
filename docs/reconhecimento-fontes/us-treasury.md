# US Treasury — Fiscal Data API e curvas de juros — reconhecimento (nível 1, sem coletor)

**Data:** 2026-09-28. **Situação:** reconhecida. **Nada novo para o ouro:** o juro real de 10 anos do Tesouro é o
mesmo número do `DFII10` que já coletamos pelo FRED, e o ouro em poder do Tesouro não se mexe desde 2012.
**Recomendação: não implementar** (ver no fim).

O relatório FEL 1 lista "US Treasury: dados de títulos e indicadores macro" entre as fontes do ouro (p. 11), o
coloca como fonte do fator "Juros reais (Fed) e rendimento dos títulos" (§7.2, p. 20) e no plano de integração,
Fase 1: "Fiscal Data API, gratuita, títulos e indicadores, Ouro" (§9.2, p. 28). Pergunta que guiou o
reconhecimento: **o Tesouro tem algo sobre o ouro que o FRED ainda não nos dá?**

## Checklist

| # | Pergunta | Resposta (evidência de 2026-09-28) |
|---|---|---|
| 1 | API oficial? | **Sim, duas coisas diferentes.** (a) **Fiscal Data API** (`api.fiscaldata.treasury.gov`), JSON: dados fiscais e contábeis, inclusive o conjunto `gold_reserve` (ouro do governo dos EUA). (b) **Curvas de juros diárias** no site do Tesouro (`home.treasury.gov/.../daily-treasury-rates.csv`), CSV por ano: curva nominal e **curva real** (TIPS) |
| 2 | Pública ou autenticada? | Pública (HTTP 200 nas duas) |
| 3 | Cadastro ou chave? | Nenhum |
| 4 | Formato | (a) JSON com `data` e `meta` (rótulos e tipos de cada campo). (b) CSV: `Date,"5 YR","7 YR","10 YR","20 YR","30 YR"`, data no formato MM/DD/AAAA |
| 5 | Documentação | (a) Sim, a Fiscal Data documenta cada conjunto e os parâmetros (`fields`, `sort`, `page[size]`). (b) A curva tem página de metodologia; o endpoint CSV é o link de download do site, não uma API documentada |
| 6 | Histórico | (a) `gold_reserve`: **desde 2012-01-31**, mensal, uma linha por local (Denver, Fort Knox, West Point, moedas…). (b) Curva real: **desde 2003-01-02** (10 anos: 2,43 no primeiro dia); curva nominal mais antiga (não medida) |
| 7 | Revisa? | Não medido. (a) O total em onças mudou só por arredondamento em 10 anos (ver abaixo) |
| 8 | Publicação | (a) Mensal (2026-08-31 era a data mais recente). (b) Diária, no fim do dia útil: em 2026-09-28 o CSV já tinha **2026-09-25**, que o `DFII10` do FRED no nosso banco ainda não tinha (o FRED publica depois) |
| 9 | Limite de requisições | Não documentado e não observado (5 chamadas) |
| 10 | Licença | Dado do governo dos EUA (domínio público, em geral); não verificado juridicamente, como no CFTC |
| 11 | Riscos | O CSV da curva é o link de download da página, não uma API; um redesenho do site quebra o endereço |

## O que ela traz que ainda não temos

**Juro real de 10 anos: é o mesmo número.** O Tesouro é a origem do `DFII10` (o FRED republica). Conferido em 4 de 4
datas: 2026-01-02, 1,94 × 1,94; 2026-06-15, 2,15 × 2,15; 2026-09-01, 2,44 × 2,44; 2026-09-24, 2,85 × 2,85. A única
vantagem é chegar **um dia antes**. A curva real também tem os prazos de 5, 7, 20 e 30 anos, que o FEL 1 não pede.

**Ouro em poder do Tesouro: constante.** Em 125 fechamentos de mês (2012-01 a 2022-05, a primeira página da
consulta), a soma de onças teve só 3 valores distintos: 261.498.899, 261.498.926 e 261.499.326. O valor contábil
é fixo por lei (US$ 42,22 por onça). É uma série parada: não mede compra nem venda de ouro por banco central (o
fator 5 do ouro), que é o que o FEL 1 procura. Esse dado continua sendo o do IMF e do WGC, sem reconhecimento.

**Os demais conjuntos da Fiscal Data** (dívida, receitas, despesas, taxas de câmbio oficiais do Tesouro) não
correspondem a nenhum dos 8 fatores do ouro.

## Recomendação

**Não implementar.** O que interessa ao ouro já chega pelo FRED (ADR 0009, ADR 0012). Um dia de atraso no juro real
não muda nada num motor diário que ainda não existe; se um dia mudar, a troca de fonte é só no download do coletor
do FRED. Fica registrado para ninguém procurar de novo.

## Fontes

- Fiscal Data, ouro do Tesouro: https://api.fiscaldata.treasury.gov/services/api/fiscal_service/v2/accounting/od/gold_reserve
- Curva real diária (2026): https://home.treasury.gov/resource-center/data-chart-center/interest-rates/daily-treasury-rates.csv/2026/all?type=daily_treasury_real_yield_curve&field_tdr_date_value=2026&page&_format=csv
