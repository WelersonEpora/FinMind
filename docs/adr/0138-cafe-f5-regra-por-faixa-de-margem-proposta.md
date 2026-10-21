# 0138 — Café, F5: a margem com o KC em reais e a regra por faixa de margem, proposta para a sanção do Comitê

## Contexto

O ADR 0137 (análise do café de 2026-10-19, item E9) deu ao F5 a data de publicação estimada do custo e o levou ao prompt
como informação, um piso de longo prazo, deixando a regra com o Comitê. O usuário pediu, em 2026-10-21, que o FinMind
estimasse uma regra plausível, calibrada no histórico, para o Comitê só sancionar ou ajustar.

A regra da v1 tinha duas partes: as candidatas do estudo para a alta (o preço abaixo do custo por um "período
prolongado": 4 semanas, moderada sobre o custo total, forte sobre o operacional) e, para a baixa, a margem total no
percentil 80 do próprio histórico. O teste do ADR 0137 mostrou que a regra de baixa se inverte entre antes e depois de
2016, e que a margem em nível (não em percentil) separa melhor o preço seguinte. O horizonte LONGO do café é de 90 dias
(cerca de 62 pregões); o efeito do custo é mais forte em um ano.

O F5 usava o ICF da B3, que só está na base desde 2022: a regra seria calibrada num preço (o KC, desde 2004) e aplicada
em outro (o ICF dá uma margem cerca de 20 p.p. menor).

**Quem decidiu:** o usuário, em 2026-10-21, com o mesmo poder de decisão do David (`CLAUDE.md`): o F5 passa a medir a
margem com o KC em reais, e a regra por faixa fica calculada como proposta, com o pedido de sanção ao Comitê. **A
regra não está em vigor no prompt:** o F5 segue como informação até a sanção.

## Evidência (banco de dev, 2026-10-21)

As semanas do F5 v3 de 2004 a 2026 (o KC contínuo do Yahoo × a PTAX contra a mediana do custo da Conab, com a data
estimada do ADR 0137) e o KC de Nova York depois da semana (o dia da rolagem zerado):

| Leitura da regra proposta | Semanas | Quando | 62 pregões (o LONGO): subiu | Mais de +11% | Menos de −11% | 250 pregões: subiu |
|---|---|---|---|---|---|---|
| Alta forte (abaixo do custo operacional, 4 semanas) | 3 | 2013 | 100% (+55%) | 100% | 0% | 100% |
| Alta moderada (abaixo do custo total, 4 semanas) | 8 | 2013 | 100% (+28%) | 38% | 0% | 100% |
| Alta fraca (margem total de até 15%) | 59 | 2008, 2010, 2012-14, 2019 | 51% (+11%) | 42% | 29% | 92% |
| Baixa moderada (margem total acima de 200%) | 106 | 2021-22, 2024-26 | 38% (−4,5%) | 15% | 35% | 16% |
| Neutra | 975 | — | 51% (+2,5%) | 26% | 18% | 54% |
| Todas as semanas (base) | 1.151 | — | 50% (+2,6%) | 26% | 20% | 53% |

- A alta acerta o lado em 59% das semanas no LONGO e em 93% em um ano; a alta fraca, sozinha, quase não muda a chance de
  alta em 62 pregões, mas aumenta a de uma alta grande (42% contra 26%).
- A baixa acerta o lado em 62% das semanas no LONGO e em 84% em um ano, em dois episódios, os dois depois de 2016.
- **Descartado:** uma faixa de baixa fraca (margem de 150% a 200%): depois dela, o KC subiu em 59% das semanas em 62
  pregões e em 65% em 250 (34 semanas).
- Os episódios são poucos (a alta, 2013 e algumas semanas de 2008 a 2019; a baixa, dois), e as semanas de um episódio
  se sobrepõem: a regra é plausível, não validada.
- Na semana de 23/10/2026, a margem total é de +99% e a operacional, de +129%: neutra. De 2026-07 a 2026-09, com o custo
  de 2024 (o de 2025 só conta desde 01/10/2026), a regra dava baixa fraca na versão descartada e neutra na proposta.

## Decisão

1. **F5 v3** (`custos_cafe_conab_kc`): o preço é o KC de Nova York (1º vencimento contínuo, Yahoo) em reais pela PTAX,
   desde 2004; o percentil da margem total em 5 anos fica como contexto.
2. **A regra proposta**, calculada na tela (camada C), com os limiares como parâmetros ajustáveis pelo Comitê:

   | Condição (a margem do KC em reais sobre o custo da Conab) | Leitura |
   |---|---|
   | Abaixo do custo operacional por 4 semanas seguidas | Alta forte |
   | Abaixo do custo total por 4 semanas seguidas | Alta moderada |
   | Margem total de até 15% | Alta fraca |
   | Margem total acima de 200% | Baixa moderada |
   | Entre 15% e 200% | Neutra |

3. **Pedido de sanção ao Comitê** (metodologia do café, F5, e `STATUS_DO_PROJETO.md`, §0, E9): sancionar, ajustar os
   limiares ou manter o F5 só como informação. Sancionada, o F5 deixa de ser informação e volta a ter pressão, só no
   LONGO (a validação da resposta continua recusando-o nos outros horizontes, ADR 0133).

## Consequências

- O prompt não muda de papel: o bloco do F5 traz o KC em reais no lugar do ICF, e a camada C continua sem pressão.
- A tela mostra a regra proposta, o gráfico com as faixas e os episódios (2013, 2019, 2021-22 e 2024-25).
- O preço é de fonte não oficial e provisória (ADR 0129) e não tem o diferencial do físico brasileiro.
