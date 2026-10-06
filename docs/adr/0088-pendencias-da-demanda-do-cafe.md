# 0088 — As pendências da demanda do café (F6): o consumo do PSD, a faixa neutra calibrada e a arbitragem como contexto

**Status:** aceita (2026-10-06).

## Contexto

O F6 do café ("Demanda mundial", ADR 0060) mede o crescimento do consumo mundial no balanço do USDA (PSD) contra a
"taxa tendencial de 1% a 2% a.a." do estudo: dentro dela, neutro; acima, pressão de alta; abaixo, de baixa (forte a 4
p.p. de desvio, calibração do FinMind). Três perguntas estavam abertas: o consumo do PSD substitui as importações e o
desaparecimento aparente da ICO? A faixa neutra de 1% a 2% fica, ou vira calibrada? A arbitragem Nova York − Londres da
ICO entra como a medida da substituição de arábica por robusta?

O FinMind olhou as duas últimas no histórico, sem gravar nada, contra o preço mensal do arábica do FMI (FRED
`PCOFFOTMUSDM`, de julho a julho do ano seguinte) e os preços de Nova York e de Londres da ICO (2011 a 2026).

**Crescimento do consumo** (PSD, valor final, países presentes nas duas safras, 2003 a 2026):

| Faixa | Anos | O preço subiu em 12 meses | Média |
|---|---|---|---|
| Estudo: acima de 2% | 12 | 7 de 11 | +7,6% |
| Estudo: 1% a 2% (neutra) | 0 | — | — |
| Estudo: abaixo de 1% | 12 | 8 de 12 | +13,2% |
| Calibrada: acima de 3,6% (P70) | 7 | 4 de 6 | +11,7% |
| Calibrada: abaixo de −0,6% (P30) | 6 | 4 de 6 | +17,1% |

Com a faixa do estudo, nenhum ano é neutro: o fator pressiona sempre. E o crescimento não separa o preço em nenhuma
versão.

**Arbitragem** (a razão Nova York ÷ Londres contra os 5 anos anteriores; a hipótese do estudo: arábica caro leva à
substituição e pesa para baixa):

| Arbitragem | Meses | Nova York caiu em 3 meses | A razão caiu em 6 meses |
|---|---|---|---|
| Alta (≥ P80) | 36 | 44% | 44% |
| Meio | 66 | 64% | 62% |
| Baixa (≤ P20) | 38 | 34% | 39% |

O contrário da hipótese: com o arábica caro, ele caiu menos, e a diferença não fechou.

## Decisão (usuário, Welerson, 2026-10-06)

1. **Consumo do PSD:** substitui as importações e o desaparecimento aparente da ICO na v1. As estatísticas de comércio
   da ICO são só para membros, e a aquisição de dados está encerrada.
2. **Faixa neutra calibrada:** 2 p.p. em torno de 1,5% (de −0,5% a 3,5%, perto dos percentis 30 e 70 de 2003 a 2026),
   no lugar de 0,5 p.p.; o centro segue o do estudo e o forte, 4 p.p. Como nas faixas da leitura da IA (ADR 0079).
3. **Arbitragem:** não entra na regra; fica como contexto (a razão arábica ÷ robusta do FMI, que já vai ao prompt).
4. **Validação histórica:** os dois resultados vão ao prompt (bloco D do fator).

## Consequências

- O cálculo do F6 vai à v2 (`demanda-cafe.factor.js`: `limiarModeradoPct` de 0,5 para 2); com a safra de 2026 (+3,6%,
  desvio de 2,1 p.p.), a leitura segue de alta moderada.
- A metodologia do café vai à v9; o F6 não tem pergunta pendente.
