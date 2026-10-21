# 0131 — Café, F3: o nível do estoque certificado no prompt e o teste da regra com o diário da ICE

## Contexto

A análise "ANÁLISE CAFÉ 19out26" (resposta no `STATUS_DO_PROJETO.md`, §0) aponta no item **E3** que o F3 (estoques
certificados da ICE) mede só a **variação do estoque em 4 semanas** contra os 5 anos anteriores: o "percentil 41" que o
documento cita é o dessa variação (−6,83% em 16/10/2026, uma queda comum), não o do nível. O documento pede o percentil de
longo prazo do nível, a inclinação da curva, o estoque em dias de consumo, uma resposta não linear abaixo do percentil 10
e o teste fora da amostra da correlação com o retorno.

O ADR 0085 já tinha decidido que o nível não dá direção (fica como contexto, o valor da camada A), pelo dado **mensal**
da ICO (2012 a 2026): o estoque "confirma, não antecipa". O teste com o diário da ICE ficou para o servidor.

**Quem decidiu:** o usuário, em 2026-10-21, com o mesmo poder de decisão do David (`CLAUDE.md`): levar o nível ao texto do
fator como contexto (opção A), testar a curva do ICF em seguida (opção C) e levar ao Comitê o sentido da regra (opção B).

## Evidência (2026-10-21, banco do servidor)

**O nível de hoje.** O estoque certificado tinha 234.901 sacas em 20/10/2026: **percentil 1,2** entre os pregões desde
09/2016 (2,5 em 5 anos). A **mínima da série** (desde 01/2016) é de 217.646 sacas, em 15/09/2026. Um ano antes, 468.410;
dois anos antes, 849.961. Na média mensal da ICO para Nova York, ago/2026 (0,24 milhão de sacas) é a menor desde 2012.
Confirma o que o Trading Economics publicou (fonte secundária, ADR 0130): "mínima de quase 27 anos".

**O teste.** O estoque conhecido no pregão anterior (point-in-time), contra o retorno do KC de Nova York (Yahoo, `KC=F`,
ADR 0129) nos 20 e 60 pregões seguintes, de 2017 a 2026. O `KC=F` emenda os contratos sem ajuste: o retorno do dia de cada
rolagem foi zerado (aproximação). As janelas se sobrepõem: em 2022 a 2026, há ~20 períodos independentes de 60 pregões.

*O nível* (percentil entre os pregões dos até 10 anos anteriores), retorno em 60 pregões:

| Nível | 2017–2021 | 2022–2026 |
|---|---|---|
| Abaixo do percentil 10 | +8,7%, subiu em 77% (73 dias, um só episódio, 2020) | +0,9%, subiu em 54% (685 dias) |
| Percentil 20 a 80 | +5,5%, 60% | +15,7%, 80% |
| Percentil 90 ou mais | −6,3%, subiu em 19% | não aconteceu |

De 2022 a 2026, o estoque ficou abaixo do percentil 10 de fev/2022 a mar/2024 e de out/2025 até hoje: uma regra
"abaixo do 10 = alta" ficaria ligada por anos sem antecipar nada. O lado alto funcionou em 2017 a 2021.

*A regra do F3* (variação em 4 semanas, percentil nas 260 semanas anteriores), retorno em 60 pregões:

| Variação | O que a regra diz | 2017–2021 | 2022–2026 |
|---|---|---|---|
| Abaixo do percentil 10 (queda fora do normal) | alta | +0,4%, subiu em 42% | **−6,9%, subiu em 30%** |
| Percentil 90 ou mais (entrada fora do normal) | baixa | +0,9%, 47% | **+9,4%, subiu em 86%** |

Em 2022 a 2026, o sentido foi o **contrário** da regra; em 2017 a 2021, sem relação. Em 02/10 e 09/10/2026, a variação
foi de +16% (percentil 91): o F3 deu pressão de baixa com o preço subindo. Uma explicação plausível: o estoque certificado
segue o preço (com Nova York cara, o café vai para a certificação), em vez de antecipá-lo.

**A curva do ICF** (banco de dev, 2022-03 a 2026-10; a inclinação por mês entre dois vencimentos), contra o retorno da
série contínua do ICF (proposta do E1) e do KC nos 20 e 60 pregões seguintes, em duas definições: (A) o 1º contra o 2º
vencimento, como pede a análise; (B) o contrato líquido (o da série contínua) contra o próximo de março, setembro ou
dezembro, os que negociam.

| | A | B |
|---|---|---|
| Curva invertida | 81% dos dias | 90% dos dias |
| Mediana da inclinação | −0,63% ao mês | −0,47% ao mês |
| Correlação de postos com o retorno seguinte (ICF e KC, 20 e 60 pregões) | −0,12 a +0,06 | −0,06 a +0,08 |
| Mais invertida que o normal (abaixo do percentil 10 dos dias anteriores): ICF em 60 pregões | +13,3%, subiu em 80% | +4,3%, subiu em 49% |
| Todos os dias: ICF em 60 pregões | +6,1%, 59% | +6,1%, 59% |
| Correlação com o estoque certificado | 0,21 | 0,11 |

A curva ficou invertida quase o tempo todo: "invertida = alta" ficaria ligada em 8 a 9 de cada 10 dias. O único sinal
(A, a mais invertida) some na definição B, só com os contratos que negociam: o ajuste de maio e julho, quase sem negócio, é
mais teórico. Em 13/10/2026, −0,11% ao mês (B), menos invertida que o normal do período. Quase não acompanha o estoque:
como fator, não contaria duas vezes com o F3. São 4,5 anos, todos num regime de aperto e alta: falta variação para um
teste conclusivo. No KC, não dá: o Yahoo só tem os vencimentos ativos (desde 2024).

## Decisão

1. **O nível vai ao texto do F3, como contexto** (fator v4, `estoques-cafe-ice.factor.js`): o percentil do estoque entre
   os pregões dos até 10 anos anteriores (com menos de 1 ano, sem percentil) e a mínima da série até o dia, com a data.
   Sem pressão própria e sem resposta não linear: o teste não sustenta uma direção pelo nível. A decisão do fator
   continua a da variação em 4 semanas.
2. **O sentido da regra vai ao Comitê** (pergunta na metodologia do café e no status, E3): tirar a pressão da regra (a
   variação fica como contexto), inverter o sentido ou manter. Até a decisão, a regra fica como está.
3. **A curva não vira fator por ora:** no ICF, não antecipou o retorno, e ela já vai ao prompt como informação (os
   vencimentos de cada horizonte, ADR 0078). A curva de Nova York pode voltar no E10, com mais histórico do KC.
4. **Fora por ora:** o estoque em dias de consumo (o certificado é de 1 a 3 dias do consumo mundial; acrescenta pouco) e
   a resposta não linear (sem evidência).

## Consequências

- A IA passa a ler, no F3, que o estoque está na mínima da série; o peso disso é dela, como o resto do contexto.
- O teste e os números ficam reproduzíveis com a série do servidor; o banco de dev só tem a ICE desde ago/2026 (o fator
  não decide em dev, nem calcula o nível).
