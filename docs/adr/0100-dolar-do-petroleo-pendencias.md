# 0100 — As pendências do dólar do petróleo (F5): o índice das economias avançadas, como fator próprio

**Status:** aceita (2026-10-07).

## Contexto

O F5 do petróleo ("Dólar (índice DXY)", peso Médio no FEL 1, direção "dólar forte pressiona; dólar fraco favorece") é
calculado desde 2026-10-03 (ADR 0050, §5c) pelo molde comum do dólar (`factors/modelos/dolar-economias-avancadas.js`):
o índice do Fed contra as economias avançadas (`FRED.DTWEXAFEGS`) na média da semana, contra a média das 52 semanas
anteriores; acima de 2%, pressão de baixa; abaixo de −2%, de alta. O DXY oficial (ICE) é licenciado e não é coletado.
Duas perguntas estavam abertas:

1. O índice do Fed das economias avançadas serve no lugar do DXY, ou o índice amplo (26 moedas, `FRED.DTWEXBGS`)?
2. O dólar é um fator próprio (peso Médio) ou um filtro que confirma os outros?

Validação contra o Brent futuro contínuo (ADR 0097), 2011 a 2026, 821 semanas, na data de publicação estimada (a
segunda depois da semana), sem gravar nada:

| Índice | Brent 6 meses antes | 30 dias depois | 91 dias | 182 dias |
|---|---|---|---|---|
| Economias avançadas | −0,38 | −0,14 | −0,19 | −0,35 |
| Amplo | −0,47 | −0,13 | −0,15 | −0,30 |
| Economias avançadas, desde 2015 | −0,30 | −0,11 | −0,19 | −0,41 |
| Economias avançadas, sem 2014-16 e 2020-21 | −0,11 | — | −0,24 | −0,38 |
| Amplo, sem 2014-16 e 2020-21 | −0,19 | — | −0,27 | −0,42 |

| Economias avançadas, desvio | Semanas | Brent subiu 91 dias depois | 182 dias depois | Variação média em 182 dias |
|---|---|---|---|---|
| ≤ −5% | 34 | 56% | 53% | +11,5% |
| −5% a −2% | 159 | 70% | 79% | +17,9% |
| Neutro (±2%) | 350 | 44% | 43% | −1,2% |
| +2% a +5% | 200 | 53% | 42% | +1,9% |
| ≥ +5% | 78 | 22% | 10% | −18,4% |
| Todas | 821 | 49% | 47% | — |

- Sem sobreposição (uma semana a cada 26, em seis fases), com o dólar 2% ou mais abaixo do normal o Brent subiu em 63%
  a 75% dos casos em 182 dias; 2% ou mais acima, em 18% a 58%.
- É o único fator do petróleo validado até aqui que antecipa o preço na direção do especialista, e a relação se mantém
  sem as crises. Os dois índices dão quase o mesmo resultado.
- Na semana de 2026-09-25: +1,62% (neutro), com o dólar se fortalecendo; o amplo, +0,28%.

## Decisão (usuário, Welerson, 2026-10-07, pelo mesmo poder de decisão do David)

1. **Fica o índice das economias avançadas** no lugar do DXY: o mais parecido com o do especialista e um pouco melhor
   nos horizontes da leitura (−0,19 contra −0,15 em 91 dias). O amplo continua coletado.
2. **Fator próprio**, como no FEL 1 (peso Médio), com a direção do especialista. Como filtro, sem pressão própria, o
   sinal mais consistente do histórico ficaria de fora, e a regra anteciparia a agregação, que é do David.

## Implementação

- **Metodologia do petróleo v7:** o F5 sem perguntas, com as duas decisões e o texto D com a validação contra o Brent
  futuro. O cálculo (`dolar_petroleo_afe` v1), as faixas e o prompt (v8) não mudam. O molde do dólar, comum ao ouro,
  não muda.

## Consequências

- O F5 não tem pergunta pendente. Seguem a produção dos EUA, os juros e a oferta não-OPEP.
- As leituras já gravadas não mudam.
