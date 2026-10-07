# 0094 — As pendências dos fundos do petróleo (F8): só informação, sem pressão própria

**Status:** aceita (2026-10-06).

## Contexto

O F8 do petróleo ("Especulação e posicionamento de fundos (COT)", peso Médio) é calculado desde 2026-10-03 (ADR 0050,
item 13): a posição líquida dos fundos (managed money) no WTI da NYMEX em % dos contratos em aberto, contra o percentil
das 156 semanas anteriores. O FEL 1 só diz que o fator "amplifica"; a proposta lia o extremo como risco de reversão
(muito comprados = pressão de baixa; muito vendidos = de alta), com base no WTI: entre os 10% mais vendidos, o WTI subiu
em 74% dos casos 26 semanas depois. Duas perguntas estavam abertas:

1. O COT confirma os outros fatores ou tem direção própria?
2. O que conta como extremo de posição (percentil, desvio-padrão, máxima histórica)?

Com o Brent como preço de referência (ADR 0052, adendo), o FinMind refez a validação contra ele (2026-10-06, sem gravar
nada), 2010 a 2026, com a data de divulgação. Além das semanas (que se sobrepõem num horizonte de 26 semanas), contou os
episódios e fez uma amostra sem sobreposição (a primeira semana do extremo e a seguinte só depois do horizonte), com o
teste binomial contra a base, como na revisão do F7 do café (ADR 0089).

| Janela de 3 anos, Brent 26 semanas depois | Semanas (episódios) | Brent subiu, por semana | Sem sobreposição, no sentido da reversão | p |
|---|---|---|---|---|
| Muito vendidos (≤ P10) | 116 (15) | 66% | 8 de 14 | 0,38 |
| Muito comprados (≥ P90) | 110 (13) | 54% (a reversão pede queda) | 6 de 11 | 0,52 |
| Todas as semanas | 866 | 49% | — | — |

- Com 1 e 5 anos de janela, o lado vendido aponta para a reversão (o Brent subiu em 62% e 68% das semanas), sem
  significância (p de 0,12 a 0,71). O lado comprado muda de sinal entre as janelas. Dos 24 testes (3 janelas, 4 grupos,
  13 e 26 semanas), um deu p < 0,05 (P80 com 1 ano, 26 semanas), o que se espera por acaso.
- Desvio-padrão (z-score em 3 anos) no lugar do percentil: com z ≤ −1,5, o Brent subiu em 71% das semanas; com z ≥ 1,5,
  em 53%. O mesmo quadro.
- Seguir os fundos (o "amplifica"): a posição anda com o preço dos 6 meses anteriores (+0,27), não com o seguinte.

No café, o mesmo teste deu o mesmo resultado (ADR 0089, revisão): o extremo sozinho não mostrou reversão nem continuação
com significância.

## Decisão (usuário, Welerson, 2026-10-06, pelo mesmo poder de decisão do David)

1. **Os fundos ficam só como informação, sem pressão própria.** O cálculo (A e B), a tendência e a validação (D) vão ao
   prompt; em C, só o papel. A IA não os lista a favor nem contra (a validação da resposta recusa) e continua dizendo o
   papel do posicionamento no campo próprio (`posicionamentoCot`), sem ler reversão só pelo extremo e sem baixar a
   confiança só por ele. Das três saídas propostas (manter a reversão nos dois lados; só do lado vendido; só
   informação), foi a recomendada; é a mesma decisão do F7 do café.
2. **Extremo:** fica o percentil dos 3 anos anteriores (P10/P90 e P20/P80), como no ouro e no café, só para descrever a
   posição. A máxima histórica não foi testada: rara demais para a amostra.
3. A simulação da camada C continua na tela de metodologia, só como referência para o Comitê.

## Implementação

- **Fator só de informação** (`informativo: true` em `shared/metodologia-base.js`): como o de contexto (ADR 0054), mas
  sem fator-pai, porque os fundos não explicam um fator específico. Não se combina com `contextoDe`. O campo de quem
  decidiu passa a `papelDecididoPor` e vale para os dois papéis. Passa pelo texto do fator (`texto-prompt.js`: "C — Papel
  na análise: INFORMAÇÃO, por decisão do usuário"), pela situação dos dados no prompt ("INFORMAÇÃO, sem leitura
  própria"), pela leitura gravada (`papel: "INFORMACAO"`), pela validação da resposta (`codigosContexto` inclui os
  informativos), pelo chip "Informação" no Centro de Decisão e pelo selo "Só informação" na tela de metodologia.
- **Metodologia do petróleo v3** e **prompt diário do petróleo v5**, as mesmas versões do ADR 0093 (as duas mudanças
  saem juntas): o F8 sem perguntas, com as duas decisões e o texto D com a validação contra o Brent; o item 3 de "Como
  analisar" e a legenda do bloco 3 dizem como usar um fator de informação, e o item 5 (o COT) diz que o extremo não
  mostrou reversão no histórico do Brent. O cálculo não muda (`fundos_petroleo_cot_wti` v1).

## Consequências

- O F8 não tem pergunta pendente. O petróleo tem dois fatores sem pressão própria: o refino (contexto da demanda) e os
  fundos (informação).
- O papel `informativo` serve a outros fatores que só descrevem o momento, se o Comitê ou o usuário decidir.
- As leituras já gravadas não mudam.
