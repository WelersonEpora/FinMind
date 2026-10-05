# 0071 — As pendências dos estoques do milho (F3) e a validação contra Chicago

**Status:** aceita (2026-10-05).

## Contexto

O fator "Estoques globais e balanço oferta/demanda (WASDE)" do milho (F3, ADR 0056) tinha três perguntas ao David:

1. quando o estoque/uso dos EUA e o do mundo menos a China divergem, qual decide?
2. em reais, o nível do estoque/uso não antecipou o Indicador ESALQ e até andou ao contrário. O nível continua dando
   direção, ou vira contexto e a revisão decide?
3. a regra do Brasil (estoque/uso da Conab) entra junto, e com que peso?

Pelo CLAUDE.md, a decisão do usuário vale como a do David quando registrada num ADR.

**Validação contra Chicago.** Com o preço mensal do milho americano do FMI (ADR 0069), o fator foi testado em 186
edições do WASDE (2011 a 2026):

| Medida | Junto com o preço (3 meses até o mês da edição) | 1 a 3 meses depois |
|---|---|---|
| Estoque/uso dos EUA | −0,25 | +0,06 a +0,09 |
| Posição no percentil (EUA, desde 2018) | −0,27 | +0,07 a +0,10 |
| Revisão do estoque final dos EUA | −0,35 | +0,02 a +0,04 |
| Estoque/uso do mundo menos a China | −0,25 | +0,06 a +0,09 |

Pela regra, o preço subiu, 3 meses depois, em 13 de 24 edições com pressão de alta e em 18 de 31 com pressão de baixa.
O fator tem o sentido do FEL 1 junto com o preço, mas não o antecipa, como o clima (ADR 0069): o WASDE é público e o
mercado o precifica no dia. Nesse teste, o nível e a revisão têm o mesmo comportamento.

**O balanço da Conab** na base tem as safras de 2018/19 a 2025/26, publicadas desde fev/2025. São menos que as 10
safras do percentil da regra.

## Decisão (usuário, Welerson, 2026-10-05)

1. **Os EUA decidem.** O mundo menos a China segue como contexto. O percentil dele só existe a partir de 2027/28, e
   contra o preço americano ele se comporta como os EUA.
2. **O nível e a revisão seguem dando direção**, como na regra do especialista. A troca pela revisão não é sustentada
   pelos dados. A validação histórica do fator (a parte D do prompt) passa a dizer o resultado contra Chicago: sentido
   confirmado junto com o preço, sem antecipação; em reais, o sentido não aparece.
3. **O Brasil entra como contexto**, fora da conta. O estoque/uso da safra mais nova da Conab (estoque final ÷
   demanda total) aparece num quadro da camada B, no prompt e na tela, até a base ter as 10 safras do percentil. Para
   cada edição do WASDE vale o boletim da Conab publicado antes de a edição seguinte sair; para a última, o mais
   recente até a data.

As três perguntas saem das Pendências do F3 e viram decisões. O cálculo `estoques_milho_wasde` vai à v2 (só com o
contexto, sem mudar a decisão), e a metodologia do milho, à v7.

## Consequências

- O F3 não tem mais pendências com o especialista.
- Quando a base tiver 10 safras da Conab (a partir da safra 2028/29), a regra do Brasil pode entrar na conta por um
  ADR novo.
- A surpresa contra a expectativa dos analistas segue sem coleta, porque a pesquisa é paga. A revisão contra a edição
  anterior continua como substituto.
