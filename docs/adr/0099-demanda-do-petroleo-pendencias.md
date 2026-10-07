# 0099 — As pendências da demanda do petróleo (F4): só os EUA e o consumo medido

**Status:** aceita (2026-10-07).

## Contexto

O F4 do petróleo ("Demanda global e atividade econômica", peso Alto no FEL 1, direção "alta com demanda forte; baixa com
recessão", mecanismo "crescimento econômico (China, EUA) define demanda") é calculado desde 2026-10-03 (ADR 0050, §5c):
o consumo dos EUA (derivados fornecidos, EIA) nas últimas 4 semanas contra as mesmas 4 semanas do ano anterior; acima
de 2%, pressão de alta; abaixo de −2%, de baixa. A China ficou de fora por decisão do usuário (2026-10-03), com duas
perguntas abertas:

1. A demanda dos EUA basta como medida, ou a China precisa entrar? A série da China no JODI é "não avaliada" e caiu ~30%
   em 2026 sem explicação.
2. O consumo medido basta, ou é preciso um indicador de atividade econômica (que hoje não é coletado)?

Validação contra o Brent futuro contínuo (ADR 0097), 2011 a 2026, sem gravar nada:

| Medida | Brent 6 meses antes | 30 dias depois | 91 dias | 182 dias |
|---|---|---|---|---|
| EUA, crescimento anual de 4 semanas (821 semanas, na data de publicação) | +0,28 | −0,06 | −0,08 | −0,12 |
| EUA, sem 2020-21 (716) | +0,19 | +0,08 | +0,11 | −0,02 |
| China (JODI), 3 meses contra um ano antes, ~2 meses até a divulgação (187 meses) | +0,05 | — | −0,02 | −0,05 |

- Os EUA andam com o preço que já aconteceu e não o antecipam: medem a situação, como os estoques (ADR 0097). Os
  extremos (≥ +5% e ≤ −5%) foram seguidos de alta em ~70% dos casos em 6 meses, quase só pelo colapso e pela retomada
  da pandemia. Na semana de 2026-09-25, +2,14%: alta fraca.
- A China não mostra relação com o Brent. A queda de 2026 tem explicação provável: acompanha, com um mês de atraso, a
  perda de oferta da OPEP no STEO (ADR 0091), de 25,9 milhões de barris/dia em fev/2026 para 18,4 em março e 16,4 em
  maio, e volta a 20,6 em julho; a da China, de 16,9 em março para 11,7 em junho e 13,4 em julho (−23,7% contra um ano
  antes). No cálculo, um choque de oferta viraria demanda fraca forte, pressão de baixa.
- Nenhum indicador de atividade econômica (PMI, PIB, produção industrial) é coletado; seria fonte nova, e a aquisição
  está encerrada desde 2026-10-01.

## Decisão (usuário, Welerson, 2026-10-07, pelo mesmo poder de decisão do David)

1. **Só os EUA.** A China do JODI fica fora do cálculo e do prompt (a alternativa, como contexto com um aviso, ficou de
   fora: o número pesaria mais que o aviso). Continua coletada, no card do JODI.
2. **O consumo medido basta**, lido como situação, com a direção do especialista, como os estoques. O indicador de
   atividade fica como lacuna; entraria só com uma fonte autorizada num ADR.

## Implementação

- **Metodologia do petróleo v6:** o F4 sem perguntas, com as duas decisões, o texto D com a validação contra o Brent
  futuro e a lacuna da China com a explicação. O cálculo (`demanda_petroleo_eua` v1) e o prompt (v8) não mudam.

## Consequências

- O F4 não tem pergunta pendente. Seguem o dólar, a produção dos EUA, os juros e a oferta não-OPEP.
- A queda da China em 2026 é uma leitura do FinMind (a coincidência com a OPEP), não uma confirmação da fonte.
- As leituras já gravadas não mudam.
