# 0030 — Clima do café: NOAA STAR, saúde da vegetação sobre a área do café

## Contexto

O fator do café de peso **Alto** "Clima e eventos meteorológicos (geadas, secas, chuvas)" (`controle_fatores.xlsx`) é o
principal driver do café no FEL 1 ("Café — o clima manda"). O ADR 0025 escolheu a NOAA STAR, saúde da vegetação por
cultura, como a medida pronta do efeito do clima sobre a lavoura, implementou o milho e deixou o café para a onda do
café, com as regiões escolhidas a partir das fontes de produção (decisão do usuário de 2026-09-26). A fonte de produção
é a Conab (ADR 0029): arábica em MG 73%, SP 13% e ES 9%; conilon em ES 63%, BA 17% e RO 15% (set/2026).

O usuário autorizou em 2026-09-28 ("Sim" a seguir com a NOAA café depois da Conab) e, diante do achado abaixo, escolheu
a **opção A** ("A - e deixa claro na ADR essa decisão"). Mesmo padrão de autorização pontual: **só aquisição de dados**,
sem nenhum fator, sinal ou regra.

## O achado: no Brasil a NOAA não separa arábica de conilon

A NOAA tem duas máscaras de café (MapSPAM 2010): **arábica (`ACOF`)** e **robusta (`RCOF`)**. O plano era uma série de
arábica em MG, SP e ES e uma de conilon em ES, BA e RO. A comparação das duas máscaras na série inteira (VHI, 1982 a
2026, 2.276 semanas, chamada real de 2026-09-28) mostrou que, **dentro do Brasil, elas cobrem os mesmos pixels**:

| Região | Diferença mediana | p95 | Máxima | Semanas iguais (< 0,05) |
|---|---|---|---|---|
| Brasil | 0,14 | 0,47 | 0,70 | 18% |
| Espírito Santo | 0,03 | 0,08 | 0,13 | 80% |
| Minas Gerais | 0,09 | 0,30 | 0,43 | 30% |
| Bahia | 0,11 | 0,34 | 0,68 | 25% |
| Rondônia | 0,07 | 0,20 | 0,55 | 40% |
| **Mundo** | **1,37** | **4,78** | **10,33** | **1%** |

(Diferenças em pontos da escala de 0 a 100.) Fora do Brasil as máscaras são outras: o robusta do mundo é o do Vietnã, da
Indonésia e da África. Gravar arábica e conilon separados no Brasil daria séries praticamente duplicadas, com rótulos
que sugerem uma diferença que a fonte não mede.

## Decisão (opção A, escolhida pelo usuário)

- **No Brasil, uma série só, "café"** (arábica e conilon juntos), pela máscara `ACOF`, que ali é a do café em geral:
  **Brasil** e as UFs **MG, SP, ES, BA e RO** (as maiores produtoras de arábica e de conilon da Conab, que juntas cobrem
  95% de cada tipo). Rondônia e Bahia, de conilon, também usam essa máscara: no Brasil ela é a mesma.
- **No mundo e nos hemisférios, arábica e robusta separados** (`ACOF` e `RCOF`): mundo (55°S a 65°N), Hemisfério Norte
  (0 a 65°N) e Hemisfério Sul (40°S a 0), porque ali as duas medem lugares diferentes.
- **Outros países produtores** (Vietnã, Colômbia, Indonésia, Etiópia, Honduras...) **ainda não**: pela regra de
  2026-09-26, entram quando uma fonte de produção por país (USDA FAS ou ICO, passo 3 da onda) for reconhecida.
- **Opção B, descartada:** arábica e conilon separados também no Brasil, com uma nota de que as séries são quase iguais.

## Implementação

- O coletor da NOAA (`collectors/noaa/noaa-vh.collector.js`, ADR 0025) ganhou a cultura `cafe` (`noaa-vh-cafe`) e a
  possibilidade de uma região usar outra máscara que a da cultura (`tagCropland` na região): as regiões de robusta
  pedem `RCOF`, e a resposta é conferida contra a máscara pedida. Ids de estado da NOAA (`getProvinceNames.php`): BA 5,
  ES 8, MG 13, RO 22, SP 25.
- **Séries** `NOAA_VH.CAFE.<REGIAO>.<VHI|VCI|TCI>`, 12 regiões: `BRASIL`, `BR_MG`, `BR_SP`, `BR_ES`, `BR_BA`, `BR_RO`,
  `MUNDO_ARABICA`, `MUNDO_ROBUSTA`, `HEMISFERIO_NORTE_ARABICA`, `HEMISFERIO_NORTE_ROBUSTA`, `HEMISFERIO_SUL_ARABICA`,
  `HEMISFERIO_SUL_ROBUSTA`. A máscara usada fica em `metadata.cultura`.
- As mesmas regras do milho: semana N = dias do ano 7(N-1)+1 a 7N; `published_at` estimado no dia seguinte ao fim da
  semana; releitura do ano corrente e do anterior; histórico reprocessado.
- **Backfill:** `npm run backfill:noaa-vh-cafe` (12 requisições, desde 1982). **Card:** `NOAA_VH_CAFE` ("Clima sobre o
  café - saúde da vegetação"), por região, com o seletor VHI/VCI/TCI; destaque no Brasil.

## Carga em dev (2026-09-28)

81.936 observações (12 regiões × 2.276 semanas × 3 índices), de 1982-01-07 a 2026-09-23, 0 falhas; a coleta diária
seguinte leu 3.240 e criou 0.

**A geada de 20/07/2021 aparece, mas não isolada.** O VHI de São Paulo caiu de 33 (fim de junho) para 24 nas semanas
seguintes (em 2020, o mesmo período ficou entre 35 e 49); o de Minas ficou em ~41 (~58 em 2020). Como 2021 foi também
ano de seca forte, o índice mostra o **dano somado**, semanas depois: não é alerta de geada, e não separa geada de seca.

## Consequências

- **Produção:** rodar `npm run backfill:noaa-vh-cafe` depois do deploy (a coleta diária só relê o ano corrente e o
  anterior).
- **Risco de geada** (temperatura mínima em MG e SP, de maio a agosto, pedida pelo FEL 1) continua sem fonte: não há
  indicador pronto gratuito, e montar um seria regra do David (ADR 0025).
- **Riscos da fonte:** os do ADR 0025 (endpoint não documentado, máscara fixa de 2010, histórico reprocessado).
