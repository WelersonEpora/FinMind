# 0067 — NOAA CPC: previsão de temperatura e precipitação 6–10 e 8–14 dias no Corn Belt

**Status:** aceita (2026-10-05).

## Contexto

A regra de alta do fator F1 (Clima e Safra nos EUA, ADR 0056) inclui uma condição do NOAA/CPC: "previsão de calor
acima e chuva abaixo do normal em 8–14 dias". O dado não estava na base. Reconhecimento feito em 2026-10-05 por
chamadas reais à fonte.

**Fonte confirmada:** NOAA CPC (Climate Prediction Center), FTP público:
`https://ftp.cpc.ncep.noaa.gov/GIS/us_tempprcpfcst/`. Quatro arquivos ZIP por dia:
`610temp_latest.zip`, `610prcp_latest.zip`, `814temp_latest.zip`, `814prcp_latest.zip`. Cada ZIP contém um Shapefile
com ~20 polígonos (o número varia a cada dia) e campos `Fcst_Date`, `Start_Date`, `End_Date`, `Prob` (%) e `Cat` (Above/Normal/Below).
Confirmado em 2026-10-05: `Fcst_Date=20261005`, `Start_Date=20261011`, `End_Date=20261015` no arquivo 610temp.

**O que o arquivo traz:** os polígonos são faixas de probabilidade disjuntas (33-40, 40-50...), não aninhadas; o resto do
país é um polígono de fundo que o CPC grava com `Cat=Normal` e `Prob=36`. O histórico de geoprocessamento do próprio
`.shp.xml` mostra a origem: um polígono "default" preenchido com "Prob 36, Cat 'Normal'", do qual se apagam as faixas.
Esse fundo é a área de **chances iguais (EC)** do mapa, e não uma previsão de "perto do normal".

**Um ponto não representa o Corn Belt:** na emissão de 2026-10-05, a temperatura de 8 a 14 dias era "acima 33%" em
Illinois, Nebraska e Indiana e chances iguais em Iowa e Minnesota.

| # | Pergunta | Resposta (evidência de 2026-10-05) |
|---|---|---|
| 1 | API oficial? | Não documentada. Arquivos no FTP público; URL deduzida da página web do CPC |
| 2 | Pública? | Sim, sem autenticação |
| 3 | Cadastro/chave? | Não |
| 4 | Formato? | ZIP com Shapefile: DBF (campos `Fcst_Date`, `Start_Date`, `End_Date`, `Prob`, `Cat`; ~20 polígonos) + SHP (geometria, tipo 5 - Polygon) |
| 5 | Documentação? | Nenhuma para o FTP; produto descrito na página do CPC |
| 6 | Histórico? | **Sem backfill útil.** Apenas `_latest.zip` na coleta diária. FTP tem 1 arquivo por série datado (2015-01-25). Histórico por formulário web, não automatizável |
| 7 | Revisa? | Não revisa o passado. Cada dia publica previsão para um período futuro |
| 8 | Publicação | Diária, ~15–16h hora do leste. Confirmado: `Fcst_Date` = data da coleta |
| 9 | Limite de req? | Não verificado. 4 ZIPs por dia, ~13 MB total |
| 10 | Licença? | Governo dos EUA (NOAA), domínio público |
| 11 | Riscos? | (a) Parsing de geometria SHP necessário para point-in-polygon; (b) Sem backfill; (c) Endpoint não documentado, pode mudar; (d) Forecast "equal chances" aparece como Cat=Normal |

**Autorização:** usuário (Welerson), 2026-10-05. Limite: apenas coleta — nenhuma regra de fator é alterada sem
aprovação do David/Comitê.

## Decisão

1. **Coletor `noaa-cpc`** (`collectors/noaa/noaa-cpc.collector.js`): baixa os 4 `_latest.zip` por dia (pelo `baixar`
   comum, modo binário), lê o ZIP com `shared/utils/zip.js`, o DBF e o SHP (sem biblioteca externa; ray casting par-ímpar
   sobre todos os anéis, o que respeita os furos do polígono de fundo) e lê a previsão num ponto de cada um dos **5 maiores
   estados de milho**, os mesmos do card de saúde da vegetação (ADR 0025), aproximadamente no centro da área de milho:

   | Estado | Ponto |
   |---|---|
   | Iowa (`EUA_IA`) | 42,0°N 93,5°W |
   | Illinois (`EUA_IL`) | 40,5°N 89,0°W |
   | Nebraska (`EUA_NE`) | 41,0°N 97,5°W |
   | Minnesota (`EUA_MN`) | 44,0°N 94,5°W |
   | Indiana (`EUA_IN`) | 40,3°N 86,3°W |

2. **Séries `NOAA_CPC.<ESTADO>.<CAMPO>`** (20), com `CAMPO` = `TEMP_6_10`, `PRCP_6_10`, `TEMP_8_14`, `PRCP_8_14`.
   Valor: `+Prob` se `Cat=Above`, `−Prob` se `Cat=Below`, `0` se `Cat=Normal`. A categoria, a probabilidade, o período
   previsto e `chancesIguais` (o fundo: `Normal` com 36%) ficam nos metadados.

3. **Um card só, `NOAA_CPC_MILHO`**, no formato do card da NOAA VH (`porRegiao`, descritor `noaa-cpc`, com os rótulos
   dos estados da VH): o estado é o item (linhas do gráfico) e o horizonte × variável é a métrica. Entra nos dados do
   fator "Clima e safra nos EUA" do milho na tela de metodologia.

4. **`observed_at = Fcst_Date`** (data de emissão). `published_at` = fim desse dia em UTC, **estimado** (o CPC publica
   por volta das 15h do leste dos EUA). Não revisa.

5. **Sem backfill:** a coleta acumula a partir de 2026-10-05.

6. **O fator não muda nesta entrega.** Como a condição do CPC entra no fator foi decidido em seguida (ADR 0068).

## Consequências

- A condição da previsão na regra de clima do milho é decidida no ADR 0068. Sem histórico, ela não tem como ser
  testada no passado.
- `docs/reconhecimento-fontes/README.md` e `docs/reconhecimento-fontes/clima.md` são atualizados.
