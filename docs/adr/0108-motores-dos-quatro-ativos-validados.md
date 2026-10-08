# 0108 — Os motores dos quatro ativos validados pelo Comitê; a fase passa a ser acompanhar a Qualidade da IA

**Status:** aceita (2026-10-08).

## Contexto

Em 2026-10-07, os quatro ativos tinham a cadeia inteira rodando todo dia (coleta → fatores → prompt diário → leitura de
tendência da IA no Centro de Decisão), com a avaliação na Qualidade da IA (ADRs 0063 e 0064). Cada motor tinha sido
aprovado para ir ao prompt (petróleo e ouro pelo David em 2026-10-03, ADRs 0052 e 0054; milho e café pelo Comitê em
2026-10-04 e 2026-10-05, ADRs 0058 e 0062), e as pendências de cada fator foram decididas uma a uma depois, a maioria
pelo usuário (ADRs 0065 a 0104).

Mesmo assim, no código, os 34 fatores seguiam marcados como `PROPOSTA` (ADR 0050): a marca só mudaria com a validação
do David, que não tinha acontecido. O prompt de cada fator dizia "Regra: proposta", e o status mostrava o milho e o
café como "entregues e aguardando validação".

## Decisão (Comitê, com o David, reunião de 2026-10-07; registrada pelo usuário, Welerson, em 2026-10-08)

1. **Os motores dos quatro ativos estão validados como estão hoje:** os fatores, os cálculos, o que vai ao prompt e as
   decisões já registradas nos ADRs, inclusive as do usuário.
2. **A fase passa a ser acompanhar:** o Comitê acompanha a tela Qualidade da IA (`/qualidade-ia`) para ver como cada
   motor se sai e onde ajustar. Não há cadência nem critério fixo para um ajuste.
3. **O que roda está validado (usuário, 2026-10-08):** o sistema inteiro, não só os motores, conta como validado pelo
   Comitê; nenhuma tela marca o que foi validado. Se aparecer um problema, a solução é validada no Comitê **antes** de
   ir ao sistema, e a validação fica registrada num ADR. Só o que ainda não roda (um ativo novo, a agregação em código
   na tela de metodologia) leva a marca de proposta.
4. **Não muda com esta decisão:** os 10 pontos da conversa com o David (`docs/conversa-david-respostas-fel1.md`), entre
   eles a confirmação do Brent futuro no petróleo e o instrumento do ouro; o FEL 1 revisado; a agregação em código, que
   segue proposta do FinMind só na tela de metodologia (ADRs 0066 e 0081); os critérios do backtest; e o formato de
   apresentação. A leitura segue de tendência, nunca recomendação de compra ou venda.

## Implementação

- `shared/metodologia-base.js`: `montarFatores` recebe a validação do ativo (`{ por, data, adr }`) e marca todos os
  fatores como `VALIDADA`, com ela em `proposta.validacao`; a constante `VALIDACAO_MOTORES` guarda a desta reunião.
- Metodologias: petróleo v12, ouro v3, milho v22 e café v15 (2026-10-08). O bloco de cada fator no prompt passa a dizer
  "Regra: validada"; a instrução do sistema dos quatro prompts não muda.
- Tela de metodologia: sem selo de validado (item 3); o resumo deixa de dizer "proposta" e o cálculo de cada fator
  aparece como "Calculado", não "Proposta calculada". A palavra "proposta" fica só num ativo que ainda não roda.
- `STATUS_DO_PROJETO.md`: a etapa 2 e os motores como validados; a etapa 6 (simulação) como a fase atual.

## Consequências

- A partir da primeira coleta depois do deploy, as leituras gravam a versão nova da metodologia; as já gravadas não mudam. A troca
  de "proposta" por "validada" no prompt fica registrada na versão, para separar as leituras na Qualidade da IA se for
  preciso.
- Um fator novo, ou um ativo novo, começa como proposta, como antes (ADR 0050).
- A agregação em código continua marcada como proposta: a validação é dos fatores e do motor como roda, não dela.
