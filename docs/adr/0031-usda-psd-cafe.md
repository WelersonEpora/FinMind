# 0031 — USDA FAS PSD do café: balanço por país pelo CSV público, sem vintage histórico

## Contexto

Dois fatores do café no `controle_fatores.xlsx` pedem dado de fora do Brasil: "Estoque global e certificado (ICE)"
(peso Alto: estoque certificado da ICE e balanço da ICO) e "Demanda global e consumo" (Médio: consumo global e
importações, fontes ICO e USDA). A safra dos outros produtores (Vietnã, Colômbia...) é a outra metade da oferta, que a
Conab (ADR 0029) não cobre. É o passo 3 da onda do café (status, §3): a ICO só publica o balanço em PDF, e a base
dela é só para membros (`docs/reconhecimento-fontes/cafe-mercado-mundial.md`).

O usuário autorizou a implementação em 2026-09-28 ("Sim, PSD + países NOAA" à recomendação: coletar a PSD do café pelo
CSV e acrescentar à NOAA café os países escolhidos pela produção dela). Mesmo padrão de autorização pontual dos ADRs
anteriores: vale **só para aquisição de dados**, sem nenhum fator, sinal ou regra. A soma dos países num total mundial
seria um fator e não é feita.

## Evidência (chamadas reais, 2026-09-28)

- **Arquivo.** `https://apps.fas.usda.gov/psdonline/downloads/psd_coffee_csv.zip`, público, sem chave (a API da PSD
  exige `FAS_API_KEY`, ADR 0014). ZIP de 440 KB com um CSV de 9,3 MB e 87.704 linhas; `Last-Modified` 2026-07-22.
- **Conteúdo.** Uma commodity (`0711100`, *Coffee, Green*), 94 países (inclui a União Europeia; **sem agregado
  mundial**), safras de 1960 a 2026, 19 atributos, todos em mil sacas de 60 kg.
- **Sem revisões.** Cada país × safra × atributo tem uma linha, com o valor atual e o mês da última revisão
  (`Calendar_Year`/`Month`): 2026-07 (3.629 linhas), 2025-12, 2025-06, 2024-12... o ritmo semestral do *Coffee: World
  Markets and Trade*, que o ESMIS lista com datas entre 18 e 25 de junho e dezembro.
- **Achado: metade das linhas não tem mês de revisão.** `Month` = `00`, com `Calendar_Year` igual à safra, em todas as
  linhas das safras de 1960 a 1998 e em parte das de 1999 a 2003 (16.478 dos 32.312 valores coletados).
- **Números.** Safra 2025, produção: Brasil 63.000 (arábica 38.000, robusta 25.000), Vietnã 31.700, Colômbia 12.500,
  Indonésia 12.370, Etiópia 11.560, Uganda 7.095, Índia 6.430, Honduras 5.530. Brasil 2026: 71.900.

## Decisão

- **Coletor `usda-psd-cafe`** (`collectors/usda/usda-psd-cafe.collector.js`), na camada `observation` (ADR 0008),
  `source_code` `USDA_FAS_PSD`. Um download por coleta diária; **sem backfill** (o arquivo só tem o valor atual): a
  primeira coleta é a carga, e o vintage começa a partir dela, como no IMEA (ADR 0018).
- **7 dos 19 atributos**, os que alimentam os dois fatores e a oferta: produção (total, arábica, robusta), estoque
  final, consumo interno, exportação e importação. Fora: as quebras por tipo (grão, torrado e moído, solúvel), a outra
  produção e as identidades do balanço (estoque inicial, oferta e distribuição totais).
- **Todos os 94 países**: sem total mundial na fonte, um agregado futuro (fator do Comitê) precisa de todos.
- **Séries** `USDA.PSD.CAFE.<PAIS>.<CAMPO>`, com o **código de país da PSD** (`BR`, `VM`, `CO`), não o nome: o código
  sobrevive a uma troca de nome. Rótulos em português em `shared/utils/psd-pais.js`. `observed_at` = 1º de janeiro do
  ano que dá nome à safra (a convenção da Conab café).
- **published_at**: o fim do mês da última revisão, em UTC, **estimado** (limite superior; o relatório sai entre os
  dias 18 e 25). Sem mês de revisão (`00`), sem published_at: vale o instante da coleta (regra do ADR 0008). Uma
  revisão vista depois entra com o instante da coleta (regra do serviço para dado estimado).
- **Card** `USDA_PSD_CAFE` ("Café - balanço por país (USDA PSD)"), por país, com seletor de métrica; padrão: Brasil,
  Vietnã, Colômbia, Indonésia e Etiópia.

## Carga em dev (2026-09-28)

`npm run collect -- --coletor=usda-psd-cafe`: 32.312 lidos e criados, 0 falhas, 658 séries (94 × 7), em ~9 s. A 2ª
execução: 32.312 ignorados, 0 criados (idempotente).

## Países na NOAA café (mesma autorização, 2026-09-28)

A regra de 2026-09-26 (regiões do clima tiradas das fontes de produção, ADR 0030) pedia uma fonte de produção por país:
é esta. Entram os **7 maiores produtores depois do Brasil** na safra 2025 da PSD, todos acima de 5 milhões de sacas.
A Índia (6.430) não estava na lista discutida antes da implementação, mas entra pelo critério (produz mais que
Honduras). Comparação das duas máscaras da NOAA (VHI, 1982 a 2026, 2.276 semanas, chamada real):

| País | Arábica / robusta na PSD (2025) | Diferença entre as máscaras (mediana / p95 / máx.) | Série |
|---|---|---|---|
| Vietnã | 4% / 96% | 1,26 / 3,69 / 7,00 | `VIETNA_ROBUSTA` (RCOF) |
| Colômbia | 100% / 0% | 3,16 / 9,24 / 19,95 | `COLOMBIA_ARABICA` (ACOF) |
| Indonésia | 11% / 89% | 2,98 / 9,02 / 14,95 | `INDONESIA_ROBUSTA` (RCOF) |
| Etiópia | 100% / 0% | sem máscara de robusta | `ETIOPIA_ARABICA` (ACOF) |
| Uganda | 16% / 84% | 3,96 / 11,66 / 18,55 | `UGANDA_ROBUSTA` (RCOF) |
| Índia | 27% / 73% | 0,13 / 0,35 / 0,58 (mesmos pixels) | `INDIA` ("café") |
| Honduras | 100% / 0% | 6,15 / 20,92 / 35,24 | `HONDURAS_ARABICA` (ACOF) |

Fora do Brasil as máscaras medem lugares diferentes (menos na Índia). Cada país usa a do tipo que domina a produção
dele, e o rótulo diz qual: gravar as duas daria, nos países de um tipo só, uma série sobre um café que quase não
existe ali. A Índia, com máscaras iguais, segue o Brasil (uma série "café", pela `ACOF`).

**Carga em dev:** `npm run backfill:noaa-vh-cafe`, 19 regiões: 47.796 observações novas (7 × 2.276 semanas × 3
índices), as 81.936 das 12 regiões antigas ignoradas, 0 falhas. Conferência: o pior VHI de fevereiro a maio entre 2013
e 2019 no Vietnã é o de 2016 (27,0; média 37,0), a seca do El Niño no Planalto Central.

## Consequências

- Uma leitura "o que se sabia em D" anterior a 2026-09-28 não vê as safras sem mês de revisão, nem o valor antigo das
  revisadas: não há como recuperar o que a PSD dizia antes (o relatório em PDF seria o caminho, fora deste ADR).
- O mês da revisão é o da **última** mudança do valor, não o da primeira publicação.
- Licença não lida (governo dos EUA); uso interno. Layout sem dicionário: o coletor confere o cabeçalho, o nome de cada
  atributo e a unidade, e falha ou marca inválido em vez de gravar coluna trocada.
- **Produção:** a PSD entra na 1ª coleta diária depois do deploy (sem backfill); os 7 países da NOAA precisam de
  `npm run backfill:noaa-vh-cafe` (a coleta diária só relê o ano corrente e o anterior).
