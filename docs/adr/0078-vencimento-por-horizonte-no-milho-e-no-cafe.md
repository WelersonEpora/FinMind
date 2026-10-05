# 0078 — O vencimento de cada horizonte no milho e no café, e a curva no prompt

**Status:** aceita (2026-10-05).

## Contexto

A leitura diária do milho e a do café usam o futuro da B3 como preço (o CCM, ADR 0058; o ICF, ADR 0062): o vencimento
mais próximo negociado, o mesmo nos quatro horizontes. A Qualidade da IA avalia cada horizonte no mesmo contrato da
leitura, sem trocar de vencimento no meio da medida (ADR 0064). A pendência do ativo perguntava se cada horizonte
deveria ter o seu vencimento, com uma liquidez mínima, e a curva no prompt.

**O defeito.** Quando o contrato vence antes da data-alvo, o horizonte fica "sem preço" e nunca é avaliado. Nos dados de
2022 a 2026:

| Horizonte | CCM: o mais próximo vence antes da data-alvo | ICF |
|---|---|---|
| Imediato (1 dia) | 3% dos dias | 0% |
| Curto (7 dias) | 13% | 3% |
| Médio (30 dias) | 50% | 20% |
| Longo (90 dias) | 100% | 78% |

No milho, o horizonte de 90 dias nunca seria avaliado. Nenhuma avaliação se perdeu: as primeiras leituras são de 04/10
(milho) e 05/10 (café).

**A liquidez** (contratos negociados por dia, mediana, pela distância até o vencimento):

| Meses até o vencimento | 0 | 1 | 2 | 3 | 4 | 5 | 6 | 8 | 10 |
|---|---|---|---|---|---|---|---|---|---|
| CCM | 4.271 | 6.133 | 4.701 | 2.756 | 1.533 | 1.030 | 520 | 244 | 72 |
| ICF | 0 | 234 | 318 | 315 | 204 | 56 | 13 | 0 | 0 |

Os contratos em aberto, que a pergunta citava, só existem até dez/2025 (vinham do boletim diário em PDF); o arquivo da
B3 que alimenta a coleta hoje não os traz. A liquidez usa os contratos negociados no dia.

## Decisão (usuário, Welerson, 2026-10-05)

- **Um vencimento por horizonte**, no milho e no café: o mais próximo que ainda negocia depois da data-alvo. Um
  contrato vale até o dia 15 do mês de vencimento (o CCM vence no dia 15; o ICF teve o último pregão do dia 18 ao 23).
  O dia 15 é escolha do FinMind, do lado seguro, porque o código do contrato só traz o mês.
- **A leitura e a avaliação de cada horizonte usam esse contrato.** A tabela 2.4 do prompt traz, por horizonte, o
  contrato, o preço, os contratos negociados e as variações dele. A entrada gravada guarda o contrato, a série e as
  variações de cada horizonte: a avaliação apura no contrato do horizonte, com a base dele, e a Persistência usa as
  variações que a IA recebeu desse contrato.
- **A curva vai ao bloco 2.2:** o ajuste e os contratos negociados de cada vencimento no último pregão, como fatos (a
  inclinação não é sinal por si).
- **Liquidez mínima: 100 contratos negociados no dia, só com aviso.** Abaixo disso, o contrato é o mesmo, e o prompt
  marca POUCA LIQUIDEZ e pede menos confiança no horizonte. Ajuste sem contratos no dia conta como zero negócios (a B3
  deixa o campo vazio). O 100 é número do FinMind. No CCM, o contrato do longo ficaria abaixo dele em 5 de 937 dias; no
  ICF, pouco líquido, o aviso sai em cerca de um quarto dos dias.

O bloco 2.1 continua com o vencimento mais próximo (o mesmo do Centro de Decisão). Hoje (02/10/2026): no milho, o CCMX26
nos três primeiros horizontes e o CCMF27 no longo; no café, o ICFZ26 e o ICFH27.

A pergunta sai das pendências do milho e do café. Versões: configuração do milho e do café v3, prompt do milho v6 e do
café v3, metodologia do milho v14 e do café v2.

## Consequências

- Os horizontes de 30 e 90 dias passam a ser avaliáveis. As leituras gravadas antes desta versão continuam no contrato
  da leitura (sem contrato por horizonte na entrada) e ficam separadas pela versão da configuração na Qualidade da IA.
- O ouro (GLD) usa a mesma leitura do vencimento mais próximo e não foi medido aqui. Se tiver o mesmo problema, a mesma
  configuração (`CURVA.porHorizonte`) resolve, com uma decisão própria.
