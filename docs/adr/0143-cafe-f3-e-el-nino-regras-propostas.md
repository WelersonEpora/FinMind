# 0143 — Café: o sentido do F3 e a pressão do El Niño, regras propostas para a sanção do Comitê

## Contexto

A análise "ANÁLISE CAFÉ 19out26" (resposta no `STATUS_DO_PROJETO.md`, §0) deixou duas perguntas abertas com o Comitê:

- **E3 (ADR 0131):** a regra do F3 (a variação do estoque certificado da ICE em 4 semanas contra as 260 semanas
  anteriores; queda fora do normal = alta, entrada fora do normal = baixa) deu o sinal invertido em 2022 a 2026. As
  opções eram tirar a pressão, inverter ou manter.
- **E6 (ADR 0134):** o El Niño (o RONI do NOAA CPC) foi ao F1 como contexto, sem pressão; a pergunta era se o El Niño
  forte deve pesar para alta, e em quais horizontes.

Como no F5 (ADR 0138), o usuário pediu em 2026-10-21 que o FinMind calibrasse no histórico uma regra plausível para cada
um, para o Comitê só sancionar ou ajustar.

**Quem decidiu:** o usuário, em 2026-10-21, com o mesmo poder de decisão do David (`CLAUDE.md`): as duas regras ficam
como **proposta**, com o pedido de sanção ao Comitê. **Nada muda no prompt até a sanção:** o F3 segue com a regra de
hoje, e o El Niño, como contexto do F1.

## Evidência (2026-10-21)

O método é o da §4 da análise (ADR 0141): a leitura semanal contra o retorno do KC de Nova York (Yahoo, `KC=F`, com o
retorno do dia da rolagem zerado) nos 5, 21 e 62 pregões seguintes (os horizontes CURTO, MEDIO e LONGO) e em 120; a
correlação de postos (IC) com o intervalo de 90% do bootstrap em blocos de 13 semanas.

**O F3** (o diário da ICE do servidor; o percentil da variação exige 200 semanas, então a série começa em 12/2019; 357
semanas até 16/10/2026):

| Variação em 4 semanas | Semanas | KC em 62 pregões | Subiu |
|---|---|---|---|
| Queda abaixo do percentil 10 | 78 | −3,3% | 37% |
| Queda do percentil 10 ao 20 | 45 | +2,0% | 49% |
| Do percentil 20 ao 80 | 135 | +9,8% | 68% |
| Entrada do percentil 80 ao 90 | 29 | +10,8% | 79% |
| Entrada no percentil 90 ou mais | 57 | +8,3% | 82% |

- O IC da leitura invertida é de **+0,27 em 62 pregões, intervalo [+0,15; +0,43]**: positivo até 2021 e de 2022 em
  diante (+0,27, [+0,07; +0,46]). Em 21 pregões, +0,13 ([+0,01; +0,27]), e não se sustenta de 2022 em diante; em 5,
  +0,05, sem sinal.
- **O sinal está no lado da queda.** A entrada fora do normal não dá retorno médio maior que o da faixa neutra: ela
  ficaria neutra.
- Na regra proposta (abaixo), a baixa acertou o lado em 59% das semanas (123): o KC subiu em 41% delas, contra 73% nas
  semanas sem sinal. São 13 episódios de queda abaixo do percentil 10 (2019 a 2026).
- O ADR 0131 achou "sem relação" em 2017 a 2021 com outro percentil (o nível diário em 5 anos, a partir de 2017); com o
  percentil do próprio fator, que só existe desde 12/2019, a relação aparece também em 2020 e 2021.
- O mecanismo não está claro. Uma leitura plausível: a saída rápida de café da bolsa acontece quando o preço de Nova
  York deixa de compensar a entrega (o café vai para o físico), e isso antecede um preço mais fraco. A variação quase não
  acompanha o retorno passado do KC (correlação −0,14).

**O El Niño** (o RONI do último trimestre publicado, no dia 14 do mês seguinte ao fim do trimestre; o arquivo do CPC é a
versão de hoje, revisada; 1.399 semanas, 2000 a 2026):

| RONI publicado | Semanas | 62 pregões | Subiu | 120 pregões | Subiu |
|---|---|---|---|---|---|
| +2,0 ou mais | 17 | +4,9% | 82% | +15,9% | 100% |
| +1,5 a +2,0 | 18 | +3,6% | 56% | +14,4% | 83% |
| +1,0 a +1,5 | 60 | +6,6% | 67% | +14,8% | 72% |
| +0,5 a +1,0 | 157 | +3,8% | 48% | +5,6% | 50% |
| Neutro | 597 | +3,0% | 52% | +5,2% | 53% |
| La Niña | 536 | de −2,2% a +1,8% | 38% a 50% | — | — |
| Todas | 1.385 | +1,8% | 49% | +3,4% | 49% |

- O IC da regra (o RONI de +1,0 ou mais) é de **+0,10 em 62 pregões, intervalo [+0,02; +0,19]**, e de +0,18 em 120
  ([+0,08; +0,29]). Em 5 e 21 pregões, zero.
- **A força não escala:** o forte (1,5 a 2,0) não foi melhor que o moderado. A regra fica com uma intensidade só, fraca.
- **São 4 episódios completos:** 2002-03 (62 pregões: −6,0%, subiu em 8% das semanas), 2010 (+10,7%, 82%), 2015-16
  (+3,7%, 66%) e 2023-24 (+12,5%, 91%). O de 2026 começou em 18/09/2026 (o RONI de jul-set, +1,69). A La Niña não mostra
  sentido estável: fica fora.

## Decisão

1. **Regra proposta para o F3** (pergunta de sanção na metodologia do café, F3, e no status, E3): só no LONGO, a queda do
   estoque fora do normal pesa para **baixa** (moderada abaixo do percentil 10, fraca do 10 ao 20); a entrada fora do
   normal e a faixa do meio ficam neutras; nos outros horizontes, o F3 vira contexto. Os percentis do fator continuam os
   de hoje (260 semanas). Em 16/10/2026, a variação foi de −6,8% (percentil 40): neutra.
2. **Regra proposta para o El Niño** (pergunta de sanção na metodologia do café, F1, e no status, E6): só no LONGO, com o
   RONI publicado de +1,0 ou mais, uma pressão de **alta fraca** ao lado da leitura do VHI; abaixo disso, ou nos outros
   horizontes, só contexto. Hoje, +1,69: daria alta fraca no LONGO.
3. **Até a sanção, nada muda no prompt nem na tela:** o F3 segue com a regra de hoje (o usuário manteve a regra até a
   decisão do Comitê, ADR 0131), e o El Niño, só como contexto do F1. Sancionadas, as duas viram mudança de versão do
   fator e do prompt, num ADR.
4. As outras perguntas do E6 (a chuva por janela e o peso do VHI) seguem como estão.

## Consequências

- O Comitê recebe duas regras com os números para sancionar ou ajustar (os percentis 10 e 20 do F3; o limiar de +1,0 do
  RONI e o horizonte), no lugar de perguntas abertas.
- As duas regras são plausíveis, não validadas: o F3 tem 7 anos de semanas sobrepostas, e o El Niño, 4 episódios.
