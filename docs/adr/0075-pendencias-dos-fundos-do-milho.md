# 0075 — As pendências dos fundos do milho (F7): reversão nos extremos, sem esperar o gatilho

**Status:** aceita (2026-10-05).

## Contexto

O fator "Especulação e posicionamento de fundos" do milho (F7, ADR 0056) lê a posição líquida do managed money no milho
da CBOT (COT da CFTC) contra os 10 anos anteriores. Vendido em extremo (P10 ou abaixo) pesa para alta, a recompra; comprado
em extremo (P90 ou acima), para baixa, a liquidação. É a leitura de reversão da regra do David (R-FUN v0). O FEL 1 diz
outra coisa: os fundos "amplificam" o movimento. A regra pede ainda um gatilho de alta de F1, F3 ou F8 junto com o
extremo, e o cálculo não o usa. As perguntas ao David eram: a reversão substitui o "amplifica" do FEL 1? E o extremo
sozinho já é pressão na v1?

**Validação contra Chicago** (o preço mensal do milho americano do FMI, ADR 0069; 546 semanas de 2016 a 2026, cerca de
11 episódios de vendidos e 6 de comprados):

| Situação | Semanas | Chicago 3 meses depois | Chicago 6 meses depois | ESALQ 26 semanas depois |
|---|---|---|---|---|
| Vendido em extremo | 118 | subiu em 70% (+4,3%) | 55% (+6,8%) | 63% (+19,6%) |
| Comprado em extremo | 38 | subiu em 63% (+9,1%) | 47% (+5,9%) | 16% (−7,2%) |
| Fora dos extremos | 368 | subiu em 47% (−0,7%) | 44% (+0,8%) | 56% (+4,6%) |
| Vendido, com gatilho de alta de F1, F3 ou F8 | 66 | 73% (+3,8%) | 55% (+4,8%) | 30% (+5,8%) |
| Vendido, sem gatilho | 52 | 67% (+5,0%) | 56% (+9,4%) | 89% (+30,3%) |

(O ESALQ só existe desde 2018, por isso tem menos semanas.)

- A reversão dos vendidos aparece nas duas medidas.
- A dos comprados aparece em reais (ESALQ), mas não em Chicago. Lá pesa o ciclo de alta de nov/2021 a mai/2022 (a guerra
  na Ucrânia, +39% em 6 meses); fora ele, sobram 3 episódios curtos.
- O gatilho não melhorou a leitura: os vendidos sem gatilho se saíram igual ou melhor.

## Decisão (usuário, Welerson, 2026-10-05)

- **Reversão, com ressalva.** Nos extremos, a leitura de reversão da regra substitui o "amplifica" do FEL 1. A ressalva
  dos comprados vai à validação histórica do prompt (a parte D).
- **O extremo sozinho já é pressão na v1**, como o cálculo já faz. A orientação do prompt continua: alinhado ao sinal de
  F1, F3 ou F8, reforça a firmeza deles; contra, é risco de reversão (ADR 0065). O F7 segue sem voto próprio na
  agregação.

As duas perguntas saem das Pendências do F7 e viram decisões. O cálculo não muda. A metodologia do milho vai à v11.

## Consequências

- O F7 não tem mais pendências com o especialista.
- Com poucos episódios independentes, a leitura dos comprados é a mais frágil; a ressalva fica visível para a IA.
- Na revisão do FEL 1, o texto do fator deve trocar "amplifica" pela reversão nos extremos.
