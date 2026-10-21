# 0135 — Café, F2: a revisão da Conab perde força com a idade

## Contexto

A análise "ANÁLISE CAFÉ 19out26" (resposta no `STATUS_DO_PROJETO.md`, §0) aponta no item **E7** que o F2 (safra
brasileira, a revisão do arábica da Conab) trata como sinal pleno uma revisão que o mercado já descontou: o levantamento
de 24/09/2026 (+5,33%, baixa forte) tinha 25 dias. Pede medir a surpresa contra a expectativa do mercado (consenso de
analistas e pesquisas de agências), tratar o dado como evento (sinal forte por 1 a 2 semanas depois da publicação, com
decaimento depois) e manter o nível da safra só como contexto de longo prazo.

No FinMind, o F2 já media a revisão contra o levantamento anterior (o nível era contexto), mas a leitura valia com a mesma
força até o levantamento seguinte, cerca de 3 meses. O consenso de analistas é pago e não é coletado.

**Quem decidiu:** o usuário, em 2026-10-21, com o mesmo poder de decisão do David (`CLAUDE.md`): a intensidade cai pela
idade, por regra do fator (entre três opções: essa, um peso pela meia-vida como nos eventos, ou só levar ao Comitê).

## Evidência (banco de dev, 2026-10-21)

Os 11 levantamentos de 2023 a 2026 e o KC de Nova York (Yahoo, `KC=F`, o dia da rolagem zerado) depois da publicação:

| Publicado | Revisão do arábica | F2 | Dia (véspera → dia seguinte) | 10 pregões | De 10 a 60 pregões |
|---|---|---|---|---|---|
| 18/05/2023 | +1,3% | neutra | +1,1% | −3,9% | −20,2% |
| 20/09/2023 | +0,6% | neutra | −2,1% | −7,5% | +33,0% |
| 14/12/2023 | +1,9% | neutra | +3,7% | −2,6% | +1,8% |
| 25/05/2024 | +3,3% | baixa moderada | +5,1% | −4,5% | +9,7% |
| 19/09/2024 | −6,0% | alta forte | −4,2% | −3,7% | +27,3% |
| 21/01/2025 | 0,0% | neutra | +4,1% | +16,9% | −1,3% |
| 06/05/2025 | +6,6% | baixa forte | −0,7% | −7,9% | −19,9% |
| 04/09/2025 | −4,9% | alta moderada | +0,1% | 0,0% | +12,7% |
| 04/12/2025 | +1,7% | neutra | +0,6% | −16,1% | −14,7% |
| 21/05/2026 | +3,8% | baixa moderada | +1,5% | −9,8% | +54,5% |
| 24/09/2026 | +5,3% | baixa forte | +1,0% | +5,0% | — |

- Com direção, o F2 acertou o lado em **4 de 6 nas 2 primeiras semanas** e em **3 de 5 de 10 a 60 pregões**. A amostra
  não valida nada, mas não sustenta manter a força por 3 meses: se a revisão tem efeito, ele está no começo.
- A reação do dia (a medida "b" da resposta ao E7) foi para o lado oposto ao do F2 em 4 de 6: não ajuda.
- A Conab contra o USDA para o Brasil (a medida "a") teria cerca de 5 pares desde 2023: sem teste.

## Decisão

1. **F2 v2:** no levantamento vigente na data da leitura, a decisão perde força pela idade desde a publicação:
   - até 14 dias: a leitura do levantamento;
   - de 15 a 42 dias: um nível abaixo (forte vira moderada; moderada vira neutra);
   - depois de 42 dias: neutra; a revisão fica como contexto (o valor continua no texto).

   A decisão original fica em `decisaoNoLevantamento`; o texto do fator no prompt ganha a linha "Idade: publicada há N
   dias (...)" e a tela, o passo da idade. Os levantamentos anteriores ficam com a leitura do dia em que saíram (o
   histórico da tela).
2. **A surpresa contra o mercado fica com o Comitê:** o consenso é pago; as estimativas privadas chegam pelas fontes
   secundárias da leitura de eventos (ADR 0130).

## Consequências

- Em 21/10/2026 (27 dias), o F2 passa de "baixa forte" a "baixa moderada"; a partir de 06/11/2026 (43 dias), fica neutro,
  até o levantamento de dezembro.
- Os prazos (14 e 42 dias) são calibração do FinMind, ajustáveis pelo Comitê.
