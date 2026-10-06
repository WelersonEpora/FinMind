# 0086 — As pendências do dólar do café (F4): a regra de baixa o ano todo, sem a condição do preço recorde

**Status:** aceita (2026-10-06).

## Contexto

O F4 do café ("Câmbio e incentivo à venda do produtor", ADR 0060) mede a variação da PTAX em 10 pregões contra as 260
semanas anteriores: o real se valorizando fora do normal pesa para alta; se desvalorizando forte, para baixa. A regra de
baixa do estudo cita o pico da safra e o preço em reais "em patamar recorde". Duas perguntas estavam abertas: a regra de
baixa vale o ano todo, ou só no pico da safra (maio a outubro)? O preço em reais recorde entra como condição?

O FinMind rodou o próprio cálculo do F4 (2005 a 2026) contra o preço mensal do arábica do FMI (FRED `PCOFFOTMUSDM`),
sem gravar nada. O preço em reais é o do FMI convertido pela PTAX (o ICF em reais só existe desde 2022); recorde = acima
do percentil 90 dos 5 anos anteriores.

| Semanas | n | O preço caiu em 1 mês | Em 3 meses |
|---|---|---|---|
| Todas (base) | 933 | 48% | 53% |
| Pressão de baixa, ano todo | 184 | 52% | 51% |
| Baixa, só de maio a outubro (base do pico: 49% / 51%) | 98 | 47% | 50% |
| Baixa, de novembro a abril | 86 | 57% | 52% |
| Baixa com preço em reais recorde | 102 | 45% | 56% |
| Baixa sem recorde | 68 | 62% | 53% |

Depois da pressão de alta, o preço subiu em 3 meses em 47% das semanas, o mesmo de todas. O fator não separa o preço
em nenhum recorte. Ressalva: o F4 mede um fluxo de 10 pregões e o preço do FMI é a média do mês; o teste é grosseiro
para um efeito de semanas.

## Decisão (usuário, Welerson, 2026-10-06)

1. **A regra de baixa vale o ano todo**, como na v1: restringir ao pico não melhora e corta metade dos sinais.
2. **O preço em reais recorde não entra como condição**: o resultado se contradiz. A PTAX e o preço do ICF já vão ao
   prompt.
3. **Validação histórica:** o resultado vai ao prompt (bloco D do fator), para a IA não dar ao câmbio mais peso do que
   o histórico sustenta.

## Consequências

- O cálculo do F4 não muda; a metodologia do café vai à v7, e o F4 não tem pergunta pendente.
- Um teste com o ICF diário em reais (desde 2022) fica para o backtest.
