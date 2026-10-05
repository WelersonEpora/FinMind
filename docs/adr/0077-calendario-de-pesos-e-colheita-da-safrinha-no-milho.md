# 0077 — O calendário de pesos do milho: os meses sem definição e o ajuste do F1 pela colheita da safrinha

**Status:** aceita (2026-10-05).

## Contexto

O calendário de pesos do Motor do Milho v0 (ADR 0065) deixa meses sem definição: o F1 (clima dos EUA) de janeiro a
maio e o F2 (safrinha) em janeiro e fevereiro. Nesses meses o prompt usava o peso do FEL 1, que é Alto para os dois. A
proposta também reduz o peso do F1 de junho a agosto quando a colheita da safrinha passa de 50%. Essa regra tinha saído
da tela (ADR 0065, adendo) porque o andamento da colheita (IMEA, ADR 0039) é coletado mas não estava na BASE do prompt.
As duas eram pendências do ativo.

**O F1 nos meses sem definição.** Em 41 anos de dados, o fator não tem nenhum ponto de janeiro a abril; em maio são 40,
todos neutros. Não há lavoura nos EUA para ler, e o peso Alto do FEL 1 caía num fator sem leitura.

**O F2 em janeiro e fevereiro.** É o plantio da safrinha, com as primeiras estimativas da Conab. O fator só tem 15
pontos (desde fev/2025): não dá para validar.

**A colheita da safrinha e Chicago** (de junho a agosto, 2018 a 2026, a variação mensal do preço do milho americano do
FMI convertido pela PTAX contra a do Indicador ESALQ, com a colheita de MT no meio do mês):

| Colheita de MT | Meses | Relação entre Chicago em reais e o ESALQ |
|---|---|---|
| Abaixo de 50% | 8 | 0,95 |
| 50% ou mais | 17 | 0,45 |

Com mais da metade colhida, o preço daqui acompanha bem menos o de Chicago, como diz a regra. Ressalva: quase todos os
meses abaixo de 50% são junhos, então o mês e a colheita andam juntos; e são poucos meses.

## Decisão (usuário, Welerson, 2026-10-05)

- **O F1 de janeiro a maio: Baixo**, como o David define de setembro a dezembro.
- **O F2 em janeiro e fevereiro: Médio**, uma transição até o Alto de março.
- Esses meses ficam marcados como decisão do usuário, não do especialista: com "†" e a origem na tabela 2.5 do prompt e
  na tela (`mesesDecididos` em `metodologia-base.js`).
- **O ajuste do F1 pela colheita entra.** O andamento da colheita de MT (IMEA) vai ao bloco do F2 como contexto, fora
  da conta, com o último informe de até 21 dias. Com 50% ou mais colhido, de junho a agosto, o peso do F1 cai um nível:
  Alto vira Médio, Médio vira Baixo. "Reduz" é do David; "um nível" é a leitura do FinMind. A regra vai às condições de
  peso da tabela 2.5, e a IA a aplica quando a BASE mostra o andamento.

As duas pendências saem do ativo e viram decisões. O F2 vai à v3 do cálculo (a decisão não muda; só o contexto e o
peso do mês), a metodologia do milho à v13 e o prompt do milho fica na v5 (ADR 0076), com estas mudanças juntas.

## Consequências

- O calendário não tem mais mês sem peso no milho.
- O peso continua fora da conta dos fatores: é orientação para a IA, como no ADR 0065.
- Na safrinha de 2026, o informe de 17/07 já tinha 78,9% de MT colhido: em julho, o F1 teria ido de Alto a Médio.
