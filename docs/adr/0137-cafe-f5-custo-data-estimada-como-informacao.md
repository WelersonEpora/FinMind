# 0137 — Café, F5: o custo com a data de publicação estimada e o fator como informação, piso de longo prazo

## Contexto

A análise "ANÁLISE CAFÉ 19out26" (resposta no `STATUS_DO_PROJETO.md`, §0) aponta no item **E9** que o F5 (custo de
produção e margem, o ICF em reais contra a mediana do custo do arábica da Conab) fica neutro por construção: a regra de
baixa pede 2 anos de margem, e o custo só é conhecido na base desde 01/10/2026. Pede usá-lo como contexto de piso no
horizonte acima de 90 dias ("quando o preço se aproxima do custo operacional, a oferta tende a cair no médio prazo"),
sem sinal diário.

A Conab não informa quando publica o custo (ADR 0043): o `published_at` é o da coleta, marcado como estimado, e o
histórico desde 2003 só valia para leituras depois de 01/10/2026. Cada aba da planilha traz o mês dos preços usados
(`mesReferenciaPrecos`, nos metadados): de 2014 em diante, quase sempre outubro ou novembro do próprio ano. O custo de
2025 (preços de out/2025) já estava publicado na 1ª coleta, em out/2026; o de 2026, ainda não. O F5 já só informava o
horizonte LONGO (ADR 0133).

**Quem decidiu:** o usuário, em 2026-10-21, com o mesmo poder de decisão do David (`CLAUDE.md`), entre três opções: a
data estimada com o F5 como informação; só a data estimada, mantendo a regra; ou levar tudo ao Comitê.

## Evidência (banco de dev, 2026-10-21)

O KC de Nova York em reais (Yahoo, `KC=F`, × a PTAX; o dia da rolagem zerado no retorno) contra a mediana do custo total
do arábica do ano mais novo conhecido, com o custo conhecido 12 meses depois do mês dos preços, de 2004 a 2026:

| Margem sobre o custo total | 120 pregões | 250 pregões | Anos |
|---|---|---|---|
| 0% ou menos (abaixo do custo) | +71,6%, subiu em 90% | +91,5%, 100% | só 2013 |
| De 0% a 25% | +8,2%, 52% | +33,7%, 78% | 2009, 2010, 2012 a 2014, 2017 a 2020 |
| De 25% a 75% | +3,2%, 50% | +4,5%, 50% | — |
| De 75% a 150% | +7,7%, 55% | +13,7%, 58% | — |
| Acima de 150% | −3,8%, 42% | −7,3%, 28% | 2005, 2021-22, 2024-26 |
| Todos os dias | +4,7%, 51% | +9,4%, 53% | — |

- O sentido é o do estudo (margem fina antes de alta; margem muito alta antes de queda), mas com poucos episódios, e os
  dias dentro de cada um se sobrepõem.
- A regra de baixa como está (a margem no percentil 80 dos 5 anos) se inverte: de 2004 a 2015, o KC subiu em 250
  pregões em 15% dos dias; de 2016 a 2026, em 46%.
- No fator (o ICF da base, desde 2022), na semana de 16/10/2026: margem de +71,9% sobre o custo total de 2025 e de +97,3%
  sobre o operacional, no percentil 18,2. O custo de 2025 (R$ 1.051, contra R$ 844 em 2024) passou a contar em
  01/10/2026 e baixou a margem em 37 p.p.

## Decisão

1. **F5 v2, data estimada:** o custo de cada município e ano conta como conhecido no 1º dia do 12º mês depois do mês dos
   preços da planilha (sem o mês, dezembro do ano do custo), ou na coleta, se for antes; o ponto sai com a data
   marcada como estimada. É uma regra conservadora: o atraso real é desconhecido e pode ser menor. A `observation` não
   muda (append-only): a regra fica no fator, com os metadados da linha.
2. **O F5 vai ao prompt como INFORMAÇÃO** (`informativo`, papel decidido pelo usuário), um piso de longo prazo: sem
   pressão própria e fora de `fatoresAFavor` e `fatoresContra` em todos os horizontes (a validação da resposta recusa);
   continua só no LONGO (ADR 0133). A regra continua calculada e na tela. O item 1 do prompt do café (v13) diz como ler a
   margem.
3. **Com o Comitê** (perguntas na metodologia do café e no status, E9): uma regra por faixa de margem, com pressão no
   LONGO; e confirmar a data estimada ou acompanhar a data real das próximas publicações da Conab.

## Consequências

- O F5 deixa de ficar neutro por falta de histórico: a margem existe desde 2022 (o ICF da base) e o percentil, desde
  11/2024. O episódio de 2013 fica antes do ICF da base: os exemplos da tela continuam sem episódio.
- A junção do F4 e do F5 num fator de incentivo do produtor (E8 e E9) continua com o Comitê.
