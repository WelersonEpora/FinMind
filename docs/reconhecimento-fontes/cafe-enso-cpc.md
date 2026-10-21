# El Niño e La Niña (NOAA CPC, RONI e ONI) e a chuva da NASA POWER — reconhecimento

Nível **5** em dev para o ENSO (coletado, todo o histórico que a fonte tem). Linha do índice:
`docs/reconhecimento-fontes/README.md`. Decisão, autorização e o teste: ADR 0134. Séries: `NOAA_CPC.ENSO.RONI` e
`NOAA_CPC.ENSO.ONI`. Coletor: `noaa-cpc-enso` (`collectors/noaa/noaa-cpc-enso.collector.js`). A NASA POWER foi testada
e **não** é coletada (nível 2).

Motivo do reconhecimento: a análise do café de 2026-10-19 (`STATUS_DO_PROJETO.md`, §0, item E6) pede a fase do ENSO
como regime e a chuva e a temperatura mínima por região do café. Em 2026-09-24 (`clima.md`), a NASA POWER ficou
"inadequada" e o ONI "possível, não implementado": voltariam se o Comitê pedisse o risco de clima ou ligasse o El Niño
ao preço, que é o que a análise faz.

## ENSO (NOAA CPC)

| # | Pergunta | Resposta | Evidência |
|---|---|---|---|
| 1 | API oficial? | Não é API: arquivos texto públicos do CPC, `cpc.ncep.noaa.gov/data/indices/RONI.ascii.txt` e `oni.ascii.txt` (o nome do RONI é com maiúsculas; `roni.ascii.txt` dá 404) | chamada real, 2026-10-21 |
| 2 | Pública ou autenticada? | Pública | chamada real |
| 3 | Cadastro/chave? | Não | chamada real |
| 4 | Formato | Texto com colunas: o RONI `SEAS YR ANOM`; o ONI `SEAS YR TOTAL ANOM`. Uma linha por trimestre móvel (DJF a NDJ), o ano do mês central. Ex.: JAS 2026, RONI +1,69, ONI +2,16 | chamada real |
| 5 | Documentação oficial | Páginas do ONI e do RONI do CPC; a discussão mensal (`ensodisc.shtml`) usa o RONI para a força do evento desde 2026 | chamada real |
| 6 | Histórico | Desde DJF/1950 (920 trimestres cada, até JAS/2026) | banco de dev: 1.840 valores |
| 7 | Revisões (vintage) | O CPC recalcula os trimestres recentes todo mês. O arquivo só traz o valor atual: a revisão vista numa coleta entra como versão nova, com a data da coleta | — |
| 8 | Fuso / `published_at` | A discussão mensal sai na 2ª quinta-feira do mês. `published_at` ESTIMADO no dia 14 do mês seguinte ao fim do trimestre (nunca antecipa) | chamada real |
| 9 | Limite de requisições | Não documentado; 2 arquivos por dia | — |
| 10 | Licença | Dado do governo dos EUA (domínio público) | — |
| 11 | Riscos técnicos | Mudança de nome ou de formato do arquivo (o coletor confere o cabeçalho); a previsão probabilística só existe em figura (fica com a leitura diária de eventos, ADR 0130) | chamada real |

## NASA POWER (testada, não coletada)

| # | Pergunta | Resposta | Evidência |
|---|---|---|---|
| 1 | API oficial? | Sim: `power.larc.nasa.gov/api/temporal/daily/point` | chamada real, 2026-10-21 |
| 2-3 | Pública, sem chave? | Sim | chamada real |
| 4 | Formato | JSON por ponto: `PRECTOTCORR` (chuva corrigida, mm/dia) e `T2M_MIN` (°C), dado de modelo e satélite (MERRA-2, GEOS-IT), não de estação | chamada real |
| 6 | Histórico | Diário desde 1981; o atraso é de ~3 dias (em 21/10/2026, até 18/10; os dias seguintes vêm com -999) | chamada real |
| 11 | Riscos técnicos | **Numa consulta longa (1991 a 2026), a chuva vem multiplicada por 24**, com o mesmo rótulo "mm/day": conferido em 1995 e 2025 contra consultas de um ano (razão exata de 24,00 em todos os dias). Um coletor teria de pedir por ano ou conferir a escala. A grade de ~50 km suaviza a mínima: a **geada de jul/2021 não aparece** (mínima acima de 3 °C nos 4 pontos) | chamada real |

Pontos testados: Varginha (Sul de Minas, -21,55 / -45,43), Franca (Mogiana, -20,54 / -47,40), Patrocínio (Cerrado
Mineiro, -18,94 / -46,99) e Venda Nova do Imigrante (montanhas do ES, -20,34 / -41,13). O resultado do teste contra o
preço está no ADR 0134.
