# 0102 — As pendências dos juros do petróleo (F7): o Treasury de 10 anos, com direção própria

**Status:** aceita (2026-10-07).

## Contexto

O F7 do petróleo ("Juros e expectativas macro", FEL 1: "juros altos podem pressionar demanda; juros baixos favorecem",
fonte Fed) é calculado desde 2026-10-03 (ADR 0050, §5c) pelo molde comum dos juros
(`factors/modelos/juro-variacao-semanal.js`): a variação do Treasury de 10 anos (`FRED.DGS10`) em 26 semanas, na média
da semana; subindo mais de 0,5 p.p., pressão de baixa; caindo, de alta; forte a partir de 1 p.p. A meta do Fed
(`FRED.DFEDTARU`) vai na medida como contexto. Duas perguntas estavam abertas:

1. Juros entram como fator com direção própria ou só como contexto para a demanda?
2. O juro longo (Treasury de 10 anos, que o mercado define) serve no lugar da meta do Fed (que o FEL 1 cita)?

Validação contra o Brent futuro contínuo (ADR 0097), 2011 a 2026, 822 semanas, na data de publicação estimada (a
segunda depois da semana), sem gravar nada:

| Variação em 26 semanas | Brent 6 meses antes | 30 dias depois | 91 dias | 182 dias |
|---|---|---|---|---|
| Treasury de 10 anos | +0,45 | −0,09 | −0,16 | −0,14 |
| Treasury, sem 2019-21 (665) | +0,37 | −0,10 | −0,20 | −0,20 |
| Treasury, sem 2014-16 e 2020-21 (560) | +0,38 | −0,10 | −0,19 | −0,12 |
| Meta do Fed | +0,03 | −0,10 | −0,13 | −0,15 |
| Meta do Fed, sem 2019-21 | −0,12 | −0,09 | −0,11 | −0,07 |
| Meta do Fed em 52 semanas, sem 2019-21 | — | — | −0,04 | −0,03 |

| Treasury, variação em 26 semanas | Semanas | Brent subiu 91 dias depois | 182 dias depois | Variação média em 182 dias |
|---|---|---|---|---|
| ≤ −1 p.p. | 42 | 67% | 71% | +14,7% |
| −1 a −0,5 p.p. | 75 | 52% | 41% | −4,0% |
| Neutro (±0,5 p.p.) | 514 | 51% | 49% | +3,9% |
| +0,5 a +1 p.p. | 150 | 48% | 48% | +0,6% |
| ≥ +1 p.p. | 41 | 12% | 12% | −13,1% |
| Todas | 822 | 49% | 47% | — |

- O Treasury antecipa o preço na direção do especialista, de forma moderada e estável: a relação se mantém sem as
  crises, ao contrário da produção dos EUA (ADR 0101). Ele também sobe com o petróleo dos meses anteriores (+0,45).
- A leitura forte (≥ +1 p.p.) se apoia quase só em 2022 (29 das 41 semanas). Sem sobreposição (uma semana a cada 26,
  em seis fases), as amostras são pequenas (3 a 7 casos) e o resultado mistura: com o juro subindo 0,5 p.p. ou mais, o
  Brent subiu em 25% a 57%; caindo, em 40% a 75%.
- A meta do Fed não mostra relação sem a pandemia, como já mostrava a validação contra o WTI.
- Na semana de 2026-10-02: o Treasury +0,93 p.p. em 26 semanas (pressão de baixa moderada, perto de forte); a meta, −0,25
  p.p. em 52 semanas.

## Decisão (usuário, Welerson, 2026-10-07, pelo mesmo poder de decisão do David)

1. **Direção própria**, como no FEL 1: juro subindo pesa para baixa. Como contexto da demanda, sem pressão própria, uma
   relação estável com o preço seguinte ficaria de fora.
2. **O Treasury de 10 anos no lugar da meta do Fed**; a meta fica na medida como contexto do ciclo.

## Implementação

- **Metodologia do petróleo v9:** o F7 sem perguntas, com as duas decisões e o texto D com a validação contra o Brent
  futuro (com a ressalva do episódio de 2022). O cálculo (`juros_petroleo_treasury_10a` v1), as faixas e o prompt (v8)
  não mudam. O molde dos juros, comum a outros ativos, não muda.

## Consequências

- O F7 não tem pergunta pendente. Falta a oferta não-OPEP (F10).
- As leituras já gravadas não mudam.
