# 0076 — As pendências da política comercial do milho (F8): intensidade no lugar do volume, 30 dias e o acumulado

**Status:** aceita (2026-10-05).

## Contexto

O fator "Política comercial e exportações" do milho (F8, ADR 0056) tem duas partes. A primeira é o ritmo dos embarques:
o exportado no ano comercial (fevereiro a janeiro, Comex Stat) contra a média do mesmo trecho nos 5 anos anteriores.
Com 10% ou mais acima, o fator pesa para alta; com 10% ou mais abaixo, para baixa (parte da R-POL v0 do David). A
segunda são os eventos (tarifas, habilitações, embargos), que vêm da leitura diária por IA (ADR 0049) e vão ao prompt
numa janela de 30 dias (ADR 0058), fora do cálculo. As perguntas ao David eram três:

- Qual é o "volume estimado relevante" que torna um evento uma pressão?
- Qual é o decaimento de um evento?
- O ritmo pelo acumulado do ano comercial atende, ou vale o mês contra a média do mesmo mês?

**Os eventos não trazem volume.** A leitura diária grava, por evento, o tipo, o resumo, a pressão, a intensidade (baixa,
média ou alta) e a confiança; não há campo de toneladas. Também não há histórico para validar: buscar eventos antigos
hoje repete o problema do vintage (P12), e em dev quase não há eventos.

**O ritmo, contra o preço** (199 meses de 2010 a 2026, contados da publicação de cada mês):

| Medida | Trocas de direção | Chicago (FMI) 3 meses depois | Chicago 6 meses depois | ESALQ 6 meses depois |
|---|---|---|---|---|
| Acumulado do ano comercial (o cálculo) | 39 | −0,27 | −0,39 | −0,09 |
| Mês contra a média do mesmo mês | 63 | −0,12 | −0,22 | −0,04 |

Pelo acumulado, com embarques 10% ou mais acima da média, Chicago subiu 6 meses depois em 38% dos meses (média −1,6%);
com 10% ou mais abaixo, em 61% (+12,2%). A relação é inversa à regra, e mais forte de 2022 a 2026 (−0,54 em 3 meses).
Uma leitura possível: o Brasil exporta muito quando tem safra grande e milho competitivo, o que é oferta mundial maior.
Contra o ESALQ não há relação, como a metodologia já dizia.

## Decisão (usuário, Welerson, 2026-10-05)

- **O evento relevante é dado pela intensidade, não por um volume.** No prompt, conta como pressão o ato oficial com
  intensidade média ou alta na leitura por IA; com intensidade baixa, é contexto. Nada muda na coleta.
- **Decaimento: a janela de 30 dias**, como já era. O evento pesa mais quanto mais recente e sai do prompt depois de 30
  dias.
- **O ritmo segue pelo acumulado do ano comercial.** O cálculo não muda.
- **A relação inversa com Chicago vai à validação histórica do prompt** (a parte D), como no F3, no F5 e no F7. A
  direção da regra e o peso do David não mudam.

As três perguntas saem das Pendências do F8 e viram decisões. O prompt diário do milho vai à v5 (o item 8 do bloco 4
ganha a regra dos eventos) e a metodologia do milho, à v12.

## Consequências

- O F8 não tem mais pendências com o especialista.
- A intensidade é leitura de outra IA, sem validação humana (ADR 0058): o prompt continua pedindo menos firmeza a um
  evento que a um dado medido.
- A relação inversa com Chicago fica visível para a IA. Se o Comitê quiser rever a direção da regra de embarques, é uma
  decisão nova, com ADR próprio.
