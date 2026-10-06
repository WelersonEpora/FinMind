# 0085 — As pendências dos estoques do café (F3): o ritmo da v1, o nível e os dados novos como contexto

**Status:** aceita (2026-10-06).

## Contexto

O F3 do café ("Estoques certificados da ICE", ADR 0060) mede a variação do estoque certificado em 4 semanas contra as
260 semanas anteriores: queda fora do normal pesa para alta; entrada fora do normal, para baixa. Três perguntas estavam
abertas: essa variação representa a "queda sustentada por mais de [CALIBRAR] sessões" do estudo, ou se contam sessões
seguidas? O nível do estoque também dá direção? Como entram as sacas aguardando classificação (pending grading) e os
estoques dos portos europeus (ECF), na base desde o ADR 0061?

O estoque diário da ICE desde 2016 está no servidor (no banco de dev, só desde ago/2026). O FinMind testou as regras no
estoque certificado de Nova York do relatório mensal da ICO (2012 a 2026, o mesmo estoque, mensal) e na ECF (total,
desde 2020), contra o preço do arábica do FMI (FRED `PCOFFOTMUSDM`), sem gravar nada. Em todos os meses, o preço subiu
em 3 meses em 43% das vezes e em 6 meses em 49%.

| Regra | Alta: o preço subiu em 3 / 6 meses | Baixa: o preço caiu em 3 meses (57% em todos) |
|---|---|---|
| Ritmo (variação do mês abaixo do P20 / acima do P80 em 5 anos) | 40% / 55% | 47% |
| Sequência (3 meses seguidos de queda) | 48% / 61% | — |
| Nível (abaixo do P20 / acima do P80 em 5 anos) | 40% / 44% | 63% (8 meses) |
| Ritmo de queda com a ECF caindo | 40% / 53% (15 meses) | — |
| Ritmo de queda com a ECF subindo | 25% / 42% (12 meses) | — |

O estoque certificado não antecipa o preço: tende a cair junto com a alta, porque o café sai da bolsa quando o mercado
aperta. É o padrão do F3 do milho (confirma, não antecipa; ADR 0071).

## Decisão (usuário, Welerson, 2026-10-06)

1. **Queda sustentada:** fica a variação em 4 semanas contra o próprio histórico (a v1). A sequência teve leve vantagem
   só em 6 meses, e meses seguidos não são as sessões do estudo; o teste no dado diário da ICE pode ser rodado no
   servidor.
2. **Nível:** não dá direção; o estoque da semana (camada A) já vai ao prompt como contexto.
3. **Pendentes e ECF:** vão ao prompt como contexto, fora da regra: as sacas aguardando classificação da semana (e 4
   semanas antes) e o último mês da ECF publicado até a semana (e o anterior). O sentido do estudo aparece, mas a
   amostra não basta para condicionar a regra.
4. **Validação histórica:** o resultado acima vai ao prompt (bloco D do fator: "confirma, não antecipa"), como nos
   fatores do milho.

## Consequências

- O cálculo do F3 vai à v2 (`estoques-cafe-ice.factor.js`): lê também `ICE.CAFE_C.ESTOQUE.TOTAL.PENDENTE` e
  `ECF.CAFE.ESTOQUE_TOTAL`, só para o texto; a decisão não muda.
- A metodologia do café vai à v6; o F3 não tem pergunta pendente.

## Correção (2026-10-06, revisão crítica)

A v2 lia a ECF pela última versão de cada mês (`obterAsOf`): um mês revisado depois da semana sumia do histórico, e a
semana mostrava um mês mais antigo (na de 2026-08-07, fevereiro em vez de abril). A v3 do cálculo lê todas as versões
(`obterVersoesAsOf`) e usa, de cada mês, a mais nova publicada até a semana. Não havia uso de dado futuro, e o ponto
de hoje não muda.
