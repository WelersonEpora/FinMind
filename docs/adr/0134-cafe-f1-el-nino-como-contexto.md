# 0134 — Café, F1: o El Niño (RONI do NOAA CPC) como contexto de regime; a chuva por janela testada e não adotada

## Contexto

A análise "ANÁLISE CAFÉ 19out26" (resposta no `STATUS_DO_PROJETO.md`, §0) aponta no item **E6** que o F1 (clima, o VHI
da NOAA) mede a saúde da vegetação, não o risco que move o mercado: em outubro, o VHI de 61 (+36 pontos sobre a mediana
de 30 anos) vira pressão de baixa. Pede: leitura por janela (florada, setembro a novembro: seca ou chuva irregular é
alta, chuva regular é baixa; colheita, maio a setembro: excesso de chuva é alta, tempo seco é baixa; fora delas, peso
mínimo); chuva e temperatura mínima por região (Sul de Minas, Mogiana, Cerrado Mineiro, Espírito Santo); alertas de
geada; a fase do ENSO como regime; e o VHI com peso menor.

A aquisição está encerrada desde 2026-10-01: fonte nova só com uma demanda específica e a autorização do usuário num ADR.
Em 2026-09-24 (`docs/reconhecimento-fontes/clima.md`), a NASA POWER ficou "inadequada" (dá o tempo, não o efeito na
lavoura) e o ONI "possível, não implementado"; voltariam se o Comitê pedisse o risco de clima ou ligasse o El Niño ao
preço, que é o que a análise faz.

**Quem decidiu:** o usuário, em 2026-10-21, com o mesmo poder de decisão do David (`CLAUDE.md`): **autoriza o RONI e o
ONI do NOAA CPC**, só como contexto do F1; o resto (a chuva, a regra por janela, o peso do VHI e a pressão do El Niño)
fica como informação ou decisão do Comitê.

## Evidência (chamadas reais e teste, 2026-10-21)

**As fontes** (detalhe em `docs/reconhecimento-fontes/cafe-enso-cpc.md`):

- **NOAA CPC:** o RONI (o índice que o CPC usa desde 2026 para a força do evento) e o ONI, arquivos texto públicos,
  trimestre móvel desde 1950. Jul-set/2026: RONI +1,69 (El Niño forte), ONI +2,16. A discussão de outubro: "El Niño
  continua se fortalecendo, forte a muito forte provável até jan-mar/2027 (mais de 83% de chance)", com chance alta de
  um evento histórico.
- **NASA POWER:** chuva e mínima diárias por ponto desde 1981, sem chave, ~3 dias de atraso. Numa consulta longa, a
  chuva vem multiplicada por 24 (mesmo rótulo "mm/day").

**O teste** (média dos 4 pontos da NASA POWER: Varginha, Franca, Patrocínio e Venda Nova do Imigrante; a chuva de 30
dias contra a climatologia 1991-2020 do mesmo dia do ano; o KC de Nova York pelo Yahoo, `KC=F`, com o dia da rolagem
zerado, 2000 a 2026; o dado conhecido no pregão, com o atraso de 3 dias):

| Janela | O que a análise diz | Chuva seca (abaixo do p20) | Chuvosa (acima do p80) | Todos os dias |
|---|---|---|---|---|
| Florada (set a nov), 20 pregões | seca = alta | −1,5%, subiu em 39% | +3,6%, subiu em 67% | +0,9%, 51% |
| Florada, por ano (15/out ao fim de jan) | seca = alta | 9 anos (< p30): +2,3%, 44% | 6 anos (> p70): +5,5%, 67% | 26 anos: +4,7%, 54% |
| Colheita (mai a set), 60 pregões | chuva = alta | +5,1%, subiu em 67% | +0,2%, subiu em 52% | +1,9%, 53% |

- **A regra por janela não se confirmou**: na amostra, o sentido saiu o oposto, nas duas janelas. Os anos se
  contradizem (a florada seca de 2024 veio com +51%; as de 2014 e 2015, com −25% e −11%). Hoje a florada está normal
  para chuvosa (93 mm em 30 dias até 18/10, percentil 64).
- **A geada não aparece na NASA POWER**: com a mínima de 3 °C ou menos em 7 dias, só jul/2000; a geada de jul/2021 não.
  A grade de ~50 km suaviza a mínima. A geada continua vindo da leitura diária de eventos (o INMET).

| Fase do ENSO (o RONI do último trimestre publicado) | KC em 120 pregões | Anos |
|---|---|---|
| RONI de +1,0 ou mais (El Niño moderado ou mais forte) | +14,7%, subiu em 78% | 2002-03, 2010, 2015-16, 2023-24, 2026 |
| De +0,5 a +1,0 (fraco) | +5,7%, 48% | — |
| Neutro | +5,2%, 53% | — |
| La Niña (−0,5 ou menos) | −1,0%, 40% | — |

O El Niño é o único sinal no sentido da análise, com mecanismo plausível (seca no Vietnã e na Indonésia, no robusta;
calor no Brasil), mas são cerca de 5 episódios, e os dias dentro de cada um se sobrepõem.

## Decisão

1. **Coletor `noaa-cpc-enso`** (`observation`, fonte `NOAA_CPC`): o RONI e o ONI, séries `NOAA_CPC.ENSO.RONI` e
   `NOAA_CPC.ENSO.ONI`; `observed_at` no 1º dia do mês central do trimestre; `published_at` estimado no dia 14 do mês
   seguinte ao fim do trimestre. A coleta diária relê o arquivo inteiro (o histórico entra na 1ª coleta, sem backfill).
   Card `NOAA_CPC_ENSO`.
2. **F1 v2:** o RONI conhecido em cada semana (point-in-time), com a força pela escala do CPC (fraco a partir de 0,5,
   moderado de 1,0, forte de 1,5, muito forte de 2,0) e o valor de 3 meses antes, num quadro de contexto da camada B.
   **Sem pressão própria:** a decisão do F1 continua a do VHI nas janelas críticas (ADR 0083).
3. **Não adotados, com o Comitê** (perguntas na metodologia do café e no status, E6): a pressão do El Niño; a chuva da
   NASA POWER, nem como contexto (não coletada); a regra por janela (o teste deu o oposto); o peso menor do VHI (sem
   pesos numéricos no prompt, depende da §3 do documento).

## Consequências

- A IA passa a ler, no F1, que há um El Niño forte (hoje, jul-set/2026, +1,69). A probabilidade prevista continua pela
  leitura diária de eventos (ADR 0130).
- A escala do ENSO usa o RONI; o ONI fica no card, para comparação.
