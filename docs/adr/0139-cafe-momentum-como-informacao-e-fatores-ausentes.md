# 0139 — Café: o momentum do preço como informação no prompt; a sazonalidade e a produção colombiana testadas e não adotadas

## Contexto

A análise "ANÁLISE CAFÉ 19out26" (resposta no `STATUS_DO_PROJETO.md`, §0) pede no item **E10** fatores novos: o
momentum de preço (o retorno de 5, 20 e 60 dias, normalizado pela volatilidade; "a alta de 11,6% em 30 dias não entra no
cálculo atual, e é justamente o movimento que o sistema não explica"), a estrutura a termo, o basis B3 × Nova York, a
oferta colombiana (a produção mensal da Federação Nacional de Cafeteros), a sazonalidade (o retorno médio do mês nos anos
anteriores) e a volatilidade (ATR), com pesos por horizonte na §3 do documento.

Já tratados antes: a estrutura a termo (a curva do ICF, testada no ADR 0131, sem poder de previsão), o basis (calculado
como informação, na tela, item E1) e o ATR (nas carteiras virtuais, ADR 0127; serve à faixa e à posição, não à direção).

Um indicador técnico só entra com a regra de quem decide (`CLAUDE.md`). **Quem decidiu:** o usuário, em 2026-10-21, com
o mesmo poder de decisão do David: o momentum vai ao prompt como informação, sem voto; a produção colombiana é
reconhecida e testada, e só seria coletada se o teste mostrasse valor.

## Evidência (2026-10-21)

O KC de Nova York (Yahoo, `KC=F`, 2000 a 2026, com o retorno do dia da troca de vencimento zerado), nos prazos dos
quatro horizontes do café (1, 5, 21 e 62 pregões).

**Momentum** (z = o retorno de n pregões ÷ a volatilidade diária de 60 pregões × √n; o sinal combinado é a média dos z de
5, 20 e 60):

| Seguir o sinal combinado (\|z\| > 1): acertou o lado | 1 pregão | 5 | 21 | 62 |
|---|---|---|---|---|
| 2000 a 2012 | 47,7% | 52,5% | 45,6% | 47,6% |
| 2013 a 2026 | 51,2% | 47,2% | 44,4% | 47,6% |
| Tudo (1.261 dias) | 49,5% | 49,7% | 45,0% | 47,6% |

- Seguir a tendência não funcionou: em 21 pregões, só 9 de 27 anos ficaram acima de 50%.
- Nos extremos, o efeito é de reversão: com o z de 20 pregões acima de +2, o KC subiu nos 21 pregões seguintes em 33% dos
  dias (24% de 2000 a 2012, 41% de 2013 a 2026; base, 48%); abaixo de −2, em 54%.
- Em 19/10/2026 (dev): z de 5 pregões +1,57, de 20 +1,26, de 60 +0,38: uma alta acima do normal, não extrema.

**Sazonalidade:** fora da amostra (a média do mesmo mês só nos anos anteriores, no mínimo 8), a média acertou o lado do
mês seguinte (21 pregões) em 44,2% de 224 meses; com a média do mês acima de 2% em módulo, em 32,8% de 58 meses. Pior que o
acaso: não adotada.

**Produção colombiana** (reconhecimento em `docs/reconhecimento-fontes/cafe-fnc-producao.md`): a produção registrada
mensal desde 1956, contra o mesmo período do ano anterior, conhecida no dia 10 do mês seguinte. A correlação com o KC em
62 pregões foi positiva (+0,16 no mês, +0,16 em 3 meses, +0,10 em 12 meses): mais produção colombiana veio seguida de
alta, o oposto do esperado, nos dois períodos e com efeito fraco. A "produção registrada" mede as compras internas, que o
próprio preço estimula. Não coletada.

## Decisão

1. **O momentum vai ao prompt do café como INFORMAÇÃO** (bloco 2.1, depois do preço; `factors/momentum-kc.js`; a
   configuração do café na v6, com `MOMENTUM_KC`): o KC do último pregão, a volatilidade diária de 60 pregões, o retorno e
   o z de 5, 20 e 60 pregões, com o tamanho em palavras (dentro do normal, acima do normal, extremo), e a validação acima.
   Não é fator, não tem voto e não entra em `fatoresAFavor` nem em `fatoresContra`. O item 13 do prompt (v14) diz como
   ler: o tamanho do movimento na régua da volatilidade, não um sinal de continuação. O momentum do dia vai também na
   `entrada` da leitura.
2. **A sazonalidade não é adotada** (o teste deu pior que o acaso).
3. **A produção colombiana não é coletada** (o sinal saiu o oposto do esperado). A Federação segue como fonte de eventos
   (ADR 0130).
4. **Com o Comitê** (status, E10): uma regra para o momentum (a reversão nos extremos, contra a premissa do documento) e
   se o basis vira fator.

## Consequências

- A IA passa a ler o tamanho do movimento recente na régua da volatilidade, que o documento diz faltar, com a evidência
  de que, no café, ele não indica continuação.
- O momentum usa o KC do Yahoo, fonte não oficial e provisória (ADR 0129); sem 121 pregões até a data, o bloco diz SEM
  DADO.
