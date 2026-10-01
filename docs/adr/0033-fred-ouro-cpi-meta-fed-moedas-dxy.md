# 0033 — Ouro: CPI dos EUA (pelo ALFRED), meta do Fed e moedas da cesta do DXY (FRED)

## Contexto

O cruzamento das fontes do FEL 1 com o que o FinMind coleta (`docs/cobertura-fatores-fel1-milho-ouro.md`, §3) deixou
três fontes do ouro sem coleta, todas no FRED, a mesma API do juro real (ADR 0012):

| Fator do ouro (planilha `controle_fatores.xlsx`) | O que a planilha pede | O que faltava |
|---|---|---|
| Juros reais (Fed) e rendimento dos títulos (Alto) | "FOMC, yield 10 anos, juros reais" | A meta do Fed (FOMC); o calendário de reuniões está na aba "Calendário de Relatórios" |
| Dólar, índice DXY (Alto) | "Índice DXY" | O DXY é da ICE e licenciado. Só tínhamos o índice amplo do Fed (`DTWEXBGS`), de outra cesta |
| Inflação e expectativas inflacionárias (Alto) | "CPI, breakeven inflation" | O CPI. O breakeven (`T10YIE`) já era coletado |

O usuário autorizou em 2026-10-01 ("Coloque na lista 'Falta fazer' e já pode começar o item 1"), depois da reunião de
2026-09-30 com o David. O item 1 era a lista de fontes grátis em fontes que o FinMind já usa, e incluía estas três.
O usuário deixou claro que **medir os fatores é trabalho do David**; o do FinMind é ter as fontes. Por isso esta
autorização vale **só para aquisição de dados**, como nos ADRs anteriores. Nenhuma medida, índice remontado ou regra
sai daqui.

## Evidência (chamadas reais, 2026-10-01)

Metadados (`fred/series`, `series/release`, `series/vintagedates`):

| Série | Freq. | Desde | Release | Versões no ALFRED |
|---|---|---|---|---|
| `CPIAUCSL` (CPI cheio, com ajuste sazonal) | Mensal | 1947-01 | 10, Consumer Price Index | 669, desde 1972-07-21 |
| `CPILFESL` (núcleo, com ajuste) | Mensal | 1957-01 | 10 | 376, desde 1996-12-12 |
| `CPIAUCNS` (cheio, sem ajuste) | Mensal | 1913-01 | 10 | 931, desde 1949-03-24 |
| `DFEDTARU` / `DFEDTARL` (faixa da meta) | Diária | 2008-12-16 | 101, FOMC Press Release | 3.795 / 5.122 |
| `DFEDTAR` (alvo único, encerrada) | Diária | 1982-09-27 a 2008-12-15 | 101 | 1 |
| `DEXUSEU`, `DEXJPUS`, `DEXUSUK`, `DEXCAUS`, `DEXSDUS`, `DEXSZUS` | Diária | 1971 (euro: 1999) | 17, H.10 | ~655, desde 2014-03-18 |
| `DTWEXAFEGS` (dólar contra economias avançadas) | Diária | 2006-01-02 | 17, H.10 | 400, desde 2019-02-04 |

**Revisões**, medidas com `realtime_start=1776-07-04`, `realtime_end=9999-12-31`, `output_type=1`:

| Série | Linhas (mês ou dia × versão) | Datas revisadas |
|---|---|---|
| `CPIAUCSL` | 3.103 para 955 meses | 657 (1.904 revisões) |
| `CPILFESL` | 2.259 para 835 | 455 |
| `CPIAUCNS` | 2.500 para 1.363 | 528 |
| `DEXUSEU` / `DEXJPUS` / `DEXSZUS` | ~1 linha por dia | 1 / 2 / 1 em toda a série |
| `DTWEXAFEGS` | 21.160 para 5.328 dias | 5.029 (revisa como o índice amplo, ADR 0011) |
| `DFEDTARU` / `DFEDTARL` | não medido: o ALFRED recusa mais de 2.000 versões por pedido | é a meta vigente no dia, não uma estimativa |

**Data de publicação do CPI:** as **949** datas de versão das três séries caem **todas** em datas do release 10 do
FRED (`release/dates`, 953 datas desde 1949-03-24; 0 fora do calendário). A data da versão é a data real do release
do BLS.

**Divulgação das demais:** `last_updated` em 2026-09-28 (segunda) para as moedas e o `DTWEXAFEGS`, com o último dado
em 25/09: o mesmo lote semanal do H.10 que o `DTWEXBGS` (ADR 0012). A meta do Fed foi atualizada às 07:01 CT de
2026-09-30 com o valor do próprio dia ("the data updated each day is the data effective as of that day").

**O DXY pode ser remontado, mas não aqui.** A fórmula do DXY é pública e as 6 moedas são as do H.10. Remontado com
elas, deu ~100,97 em 2026-09-25. Na variação de 1 mês (2006–2026, 5.171 dias), o DXY remontado tem correlação de 0,97
com o `DTWEXAFEGS` e de 0,89 com o `DTWEXBGS`, e direção oposta em 7,1% e 13,5% das janelas, respectivamente. Remontar
o índice é um cálculo, e cabe ao David decidir se quer o DXY remontado, um índice do Fed ou os dois. Este ADR só
garante a matéria-prima.

**Licença:** a mesma origem das séries já lidas no ADR 0009 (Board of Governors do Fed, "Public Domain: Citation
Requested") e, no CPI, o BLS (governo dos EUA). **A página de cada série nova não foi lida** (o site do FRED não
respondeu à consulta automática em 2026-10-01): confirmar antes de exibir a terceiros. O uso continua interno.

## Decisão

1. **Moedas, índice das economias avançadas e meta do Fed no coletor do FRED** (`fred.collector.js`), uma execução por
   série, como as 4 que já existiam: `DEXUSEU`, `DEXJPUS`, `DEXUSUK`, `DEXCAUS`, `DEXSDUS`, `DEXSZUS`, `DTWEXAFEGS`,
   `DFEDTARU`, `DFEDTARL` e `DFEDTAR`. Séries `FRED.<ID>`, fonte `FRED`. `published_at` **estimado**: a segunda-feira
   seguinte para o H.10 (regra do `DTWEXBGS`) e o próprio dia para a meta. A lista de séries virou a fonte do registro
   (`SERIES_COLETADAS`): uma série nova no coletor entra na coleta diária sem mexer em `collectors/index.js`.
2. **CPI por um coletor próprio** (`fred-cpi.collector.js`, código `fred-cpi`), que lê **todas as versões do ALFRED**,
   cada uma com a data real do release (fim do dia em UTC, `published_at_is_estimated = false`). Fonte `FRED_ALFRED`
   (separada da `FRED`: o descarte de versões já gravadas em `persistirPorEdicao` é por fonte, e uma data de versão do
   CPI coincide com datas estimadas das séries diárias). As 3 séries vão numa execução só: se uma falhar no download,
   nenhuma é gravada. Os meses anteriores à 1ª versão guardada entram com a data dessa versão, um **limite superior**,
   marcado em `metadata.limiteSuperior`. Exige `FRED_API_KEY` (o ALFRED só existe na API); sem ela o coletor não é
   registrado e um aviso vai para o log, como o do Crop Progress.
3. **Sem backfill à parte:** a coleta diária do CPI já baixa todas as versões e só grava as novas. As demais séries
   baixam a série inteira a cada coleta, como as 4 anteriores.
4. **Três cards novos e um ampliado** em `CATALOGO_OBSERVAVEIS`: "Câmbio - moedas da cesta do DXY (Fed)" (seletor de
   moeda), "Meta de juros do Fed (FOMC)" (limites e alvo único), "Inflação ao consumidor dos EUA (CPI)" (seletor das 3
   séries) e "Índices do dólar (Fed)", antes "Índice amplo do dólar", agora com o das economias avançadas.

## Fora do escopo (de propósito)

- **Remontar o DXY**, calcular a inflação de 12 meses do CPI ou a faixa média da meta: são medidas, e quem as define é o
  David.
- **O calendário de reuniões do FOMC** como dado próprio: a meta diária mostra cada decisão no dia em que vale. As datas
  das reuniões futuras estão na planilha do David.
- **Outros índices de preço** (PCE, CPI por componente) e o **vintage da meta e das moedas** pelo ALFRED: nenhuma das
  duas revisa de modo relevante.

## Resultado (2026-10-01, banco de dev)

| Série | Linhas | Período | Revisões |
|---|---|---|---|
| `FRED.CPIAUCSL` | 3.075 | 1947-01 a 2026-08 | 2.120 (306 meses com limite superior) |
| `FRED.CPILFESL` | 2.259 | 1957-01 a 2026-08 | 1.424 (478 com limite superior) |
| `FRED.CPIAUCNS` | 2.500 | 1913-01 a 2026-08 | 1.137 (435 com limite superior) |
| 6 moedas | 6.955 (euro) a 13.982 cada | 1971 (euro: 1999) a 2026-09-25 | 0 |
| `FRED.DTWEXAFEGS` | 5.198 | 2006-01-02 a 2026-09-25 | 0 (só o valor atual) |
| `FRED.DFEDTARU` / `DFEDTARL` | 6.498 cada | 2008-12-16 a 2026-09-30 | 0 |
| `FRED.DFEDTAR` | 9.577 | 1982-09-27 a 2008-12-15 | 0 |

0 falhas nas 14 execuções. A 2ª execução foi idempotente: 0 criados, 0 revisões, tudo ignorado. As 28 versões do CPI
que não viraram linha são versões do ALFRED com o mesmo valor da anterior, que o serviço point-in-time ignora de
propósito. Os 4 cards respondem "em dia".

## Consequências e limitações

- **O CPI mudou de base em fev/1988** (de 1967 = 100 para 1982-84 = 100): as versões anteriores a 1988-02-26 estão na
  base antiga (agosto de 1986: 328,2 na versão de 1986 e 109,6 na de 1988). Para comparar o CPI ao longo do tempo,
  vale a versão vigente na data da consulta; não se mistura uma versão antiga com uma nova.
- **O CPI não tem reserva sem chave:** sem `FRED_API_KEY`, não é coletado. As demais séries usam o CSV público como
  reserva (ADR 0012).
- **A meta do Fed é estimada no próprio dia.** O comunicado sai às 14:00 ET do último dia da reunião, um dia antes de
  a nova meta valer. Ninguém sabe a meta antes do comunicado, mas o motor só a vê na data em que passa a valer.
- **`DTWEXAFEGS` revisa:** como o `DTWEXBGS`, a coleta guarda o valor atual, e uma revisão vista depois vira versão
  nova com a data da coleta (ADR 0011).
- **Nenhuma destas séries é o DXY.** O card do câmbio diz isso; o DXY oficial continua licenciado.
