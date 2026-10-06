# 0084 — As pendências da safra do café (F2): os limiares de partida e a bienalidade como contexto

**Status:** aceita (2026-10-06).

## Contexto

O F2 do café ("Safra brasileira de arábica", ADR 0060) mede a revisão do arábica em cada levantamento da Conab contra o
anterior da mesma safra. A faixa neutra (2%, |revisão| no percentil 40) e o forte (5%, no percentil 80) são calibração
do FinMind sobre as 11 revisões da base (2023 a 2026; antes disso a Conab não mantém as páginas). Duas perguntas
estavam abertas: esses limiares servem como ponto de partida? A bienalidade (a variação contra a safra anterior) entra
na decisão?

O FinMind olhou as duas no histórico, sem gravar nada, contra o preço mensal do arábica do FMI (FRED `PCOFFOTMUSDM`).

**Revisões da Conab** (as 11 da base; as abaixo de 2% são neutras):

| Levantamento | Revisão | Leitura | Preço em 1 mês | Em 3 meses |
|---|---|---|---|---|
| set/2024 | −5,99% | Alta forte | −0,7% | +23,4% |
| mai/2025 | +6,61% | Baixa forte | −8,7% | −8,0% |
| set/2025 | −4,94% | Alta moderada | +1,1% | −4,8% |
| mai/2024 | +3,33% | Baixa moderada | +6,9% | +12,5% |
| mai/2026 | +3,81% | Baixa moderada | −2,3% | — |
| set/2026 | +5,33% | Baixa forte | — | — |

**Bienalidade:** a produção de arábica do Brasil no PSD do USDA (1992 a 2025; só o valor final, sem vintage) contra a
anterior, e o preço de abril a abril do ano seguinte:

| Safra contra a anterior | Anos | Preço subiu | Média |
|---|---|---|---|
| −10% ou menos | 14 | 5 | −2,1% |
| +10% ou mais | 13 | 7 | +16,8% |
| Entre os dois | 7 | 3 | +21,8% |

A correlação é +0,18, no sentido oposto ao da leitura de oferta. O sinal da variação trocou em 28 de 33 anos: o ciclo é
previsível e o mercado o precifica; o que move o preço é a surpresa, que é a revisão que o fator mede.

## Decisão (usuário, Welerson, 2026-10-06)

1. **Limiares:** a faixa neutra de 2% e o forte de 5% ficam como ponto de partida, até o backtest. As duas revisões
   fortes com preço depois foram seguidas do movimento esperado; as moderadas se dividiram. São episódios, não validação.
2. **Bienalidade:** fica como contexto, fora da decisão, como o estudo deixa.

As perguntas saem da metodologia do café, que vai à v5; o cálculo do fator não muda.

## Consequências

- O F2 do café não tem pergunta pendente; as decisões ficam no fator, na tela de metodologia.
- Os limiares seguem ajustáveis pelo Comitê no card C, e o backtest do F2 continua curto (a Conab só desde 2023).
