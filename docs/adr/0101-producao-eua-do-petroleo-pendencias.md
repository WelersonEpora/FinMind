# 0101 — As pendências da produção dos EUA do petróleo (F6): o crescimento basta, e o recorde é informação

**Status:** aceita (2026-10-07).

## Contexto

O F6 do petróleo ("Produção dos EUA (shale) e rig count", FEL 1: "alta com produção menor; baixa com produção recorde";
mecanismo "rig count e produção de xisto ajustam oferta") é calculado desde 2026-10-03 (ADR 0050, §5c): a produção
semanal da EIA na média de 4 semanas contra as mesmas semanas do ano anterior; acima de 3%, pressão de baixa; abaixo de
−3%, de alta. A distância do recorde vai na medida (A), sem entrar na regra. Duas perguntas estavam abertas:

1. O crescimento anual da produção basta, ou o rig count (Baker Hughes, que antecipa a produção e não é coletado) é
   necessário?
2. A produção em recorde deve pesar por si, mesmo com crescimento pequeno (como em set/2026: recorde, +3,3% no ano)?

Validação contra o Brent futuro contínuo (ADR 0097), 2011 a 2026, 821 semanas, na data de publicação, sem gravar nada:

| Crescimento anual | Brent 6 meses antes | 30 dias depois | 91 dias | 182 dias |
|---|---|---|---|---|
| Todas as semanas | −0,29 | −0,17 | −0,25 | −0,45 |
| Sem 2014-16 e 2020-21 (559) | −0,14 | −0,07 | −0,06 | −0,16 |

| Crescimento anual | Semanas | Brent subiu 91 dias depois | 182 dias depois | Variação média em 182 dias |
|---|---|---|---|---|
| ≤ −10% | 47 | 94% | 100% | +35,3% |
| −10% a −3% | 55 | 56% | 75% | +8,9% |
| Neutro (±3%) | 177 | 51% | 60% | +12,3% |
| +3% a +10% | 255 | 44% | 39% | +1,3% |
| ≥ +10% | 287 | 48% | 34% | −9,5% |
| Todas | 821 | 51% | 48% | — |

- A direção do especialista aparece, mais fraca que a do dólar (ADR 0100) e apoiada em poucos episódios grandes (a
  queda de 2014-16 e a pandemia). Sem sobreposição (uma semana a cada 26, em seis fases), com a produção crescendo 10%
  ou mais o Brent subiu em 20% a 58% dos casos em 182 dias; caindo 3% ou mais, em 75% a 100%, com 3 a 5 casos por fase.
- **Recorde:** a produção a até 1% do recorde com crescimento abaixo de 3% só aconteceu de 2024 a 2026 (42 semanas): o
  Brent subiu 182 dias depois em 15% dos casos em 2024, 71% em 2025 e 100% em 2026. O recorde não mostra efeito
  próprio; com crescimento de 3% ou mais, a regra já dá pressão de baixa.
- O rig count antecipa a produção em alguns meses, não o preço; seria fonte nova, e a aquisição está encerrada desde
  2026-10-01.
- Na semana de 2026-09-25: 13.955 mil barris/dia, no recorde, +3,34% no ano (pressão de baixa fraca).

## Decisão (usuário, Welerson, 2026-10-07, pelo mesmo poder de decisão do David)

1. **O crescimento anual basta.** O rig count fica como lacuna; entraria só com uma fonte autorizada num ADR.
2. **O recorde não pesa por si:** a pressão vem só do crescimento, e a distância do recorde fica na medida como
   informação. Pesar o recorde exigiria mudar o cálculo sem apoio no histórico.

## Implementação

- **Metodologia do petróleo v8:** o F6 sem perguntas, com as duas decisões e o texto D com a validação contra o Brent
  futuro. O cálculo (`producao_petroleo_eua` v1) e o prompt (v8) não mudam.

## Consequências

- O F6 não tem pergunta pendente. Seguem os juros e a oferta não-OPEP.
- As leituras já gravadas não mudam.
