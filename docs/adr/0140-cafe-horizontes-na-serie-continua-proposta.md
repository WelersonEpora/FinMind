# 0140 — Café: os horizontes medidos na série contínua ajustada do ICF (o ICF-CA), sancionada pelo Comitê

## Contexto

A análise "ANÁLISE CAFÉ 19out26" (resposta no `STATUS_DO_PROJETO.md`, §0) aponta no item **E11** a mistura de contratos
nos horizontes: o de 90 dias era medido no ICFH27 e os demais no ICFZ26, e "a backwardation de 1,6% entra como se fosse
movimento de preço". Pede medir todos os horizontes no mesmo contrato ou numa série contínua ajustada pela rolagem
(avaliando o ICFFUT), separar a variação do preço da variação da estrutura e registrar o contrato de cada horizonte.
Critério de aceite: nenhum horizonte mede variação de preço cruzando dois contratos sem ajuste.

Hoje (ADR 0078), cada horizonte usa o vencimento mais próximo que vale depois da data-alvo (até o dia 15 do mês de
vencimento), e a variação e o realizado de cada um são medidos dentro desse contrato: o critério de aceite já é cumprido,
mas os horizontes partem de preços diferentes. O ICFFUT é a série contínua da Nelogica (Profit), sem acesso. A série
contínua do FinMind (E1, `factors/serie-continua-icf.js`) é proposta, na tela: rolagem por liquidez (a partir de 40
pregões antes do vencimento, para o vencimento com mais contratos negociados em 5 pregões, entre os 3 seguintes; a trava
10 pregões antes) e ajuste proporcional.

**Quem decidiu:** o usuário, em 2026-10-21, com o mesmo poder de decisão do David (`CLAUDE.md`), entre três opções: a
série contínua já; só a liquidez no lugar do dia 15, já; ou propor ao Comitê. **Escolheu propor:** nada muda na
leitura, no Centro de Decisão nem na Qualidade da IA até a sanção.

## Evidência (banco de dev, 2026-10-21)

O ICF de 2022-03-21 a 2026-10-13 (954 pregões; 16 trocas na série contínua). Para cada pregão e horizonte (1, 7, 30 e
90 dias corridos), o realizado até o último pregão antes da data-alvo, pela regra de hoje (A) e pela série contínua (B):

| Horizonte | A: o contrato sem negócio nos 5 pregões até o dia | A: outro contrato que o da contínua | B cruza uma rolagem (ajustada) | Faixa do realizado diferente entre A e B | Diferença média |
|---|---|---|---|---|---|
| IMEDIATO | 14,1% | 55,1% | 1,5% | 15,3% | 0,35 p.p. |
| CURTO | 11,7% | 48,7% | 5,9% | 13,7% | 0,60 p.p. |
| MÉDIO | 11,5% | 30,3% | 27,0% | 7,7% | 0,97 p.p. |
| LONGO | 19,6% | 66,0% | 75,1% | 10,3% | 1,89 p.p. |

- **A mistura existe**: em 76% dos dias, o LONGO usa outro contrato que o IMEDIATO.
- **O defeito maior é o preço sem negócio**: de 12% a 20% dos dias, a regra de hoje mede o horizonte num contrato que
  não negociou na semana (o ajuste é teórico), pela regra do dia 15 e pelos vencimentos de maio e julho, que quase não
  negociam (E1).
- Com a liquidez no lugar do dia 15, mas um contrato por horizonte (A'), a faixa ainda difere da contínua em 7% a 12%
  dos dias: a diferença restante é a da estrutura a termo entre os vencimentos.

## Decisão (proposta para o Comitê)

1. **Medir todos os horizontes do café na série contínua ajustada do ICF** (a regra de rolagem do E1), com o contrato do
   dia informado no prompt e no Centro de Decisão: a variação, o preço de partida e o realizado da Qualidade da IA. A
   curva (bloco 2.2) continua como informação; a variação da estrutura fica separada do preço por construção (o ajuste
   proporcional tira o salto da troca).
2. **Sancionada, a configuração do café ganha uma versão nova**, para a Qualidade da IA separar as leituras medidas por
   contrato das medidas na série contínua.
3. **O pedido** está na metodologia do café (perguntas do ativo) e no status (§0, E11 e E1): sancionar, ajustar os
   números da rolagem (40, 5, 3 e 10 pregões) ou manter um contrato por horizonte com a liquidez no lugar do dia 15.

## Consequências

- Nada muda até a sanção: o prompt, o Centro de Decisão e a Qualidade da IA seguem o ADR 0078.
- Sancionada: o preço de partida dos quatro horizontes passa a ser o mesmo; o preço da série é sintético (negociável só
  no contrato do dia), e o realizado de 90 dias cruza uma rolagem em três de cada quatro dias, ajustada.

## Adendo (2026-10-23): sancionada pelo Comitê e implementada

**Quem decidiu:** o Comitê, na resposta à §0 do status, recebida em 2026-10-22: "E1 e E11 (série contínua e rolagem):
APROVADO. Documentar o método de ajuste e a nomenclatura da série". Entre as duas opções do pedido, o Comitê aprovou a
série contínua em todos os horizontes, com a regra de rolagem como estava (40, 5, 3 e 10 pregões). O nome da série e a
implementação imediata foram decididos pelo usuário (Welerson) em 2026-10-23.

### Nomenclatura

- **ICF-CA**, "ICF contínuo ajustado": a série contínua do ICF do FinMind, calculada na hora e nunca gravada. Em cada
  data, vai com o contrato do dia ao lado ("ICF-CA · ICFZ26"). O contrato por vencimento continua com o nome da B3
  (ICFZ26).
- No código: `factors/serie-continua-icf.js::SERIE_CONTINUA_ICF`. A série `ICF_CA` do Centro de Decisão e o código
  `FINMIND.ICF.ICF-CA.AJUSTE` gravado com cada leitura não existem na `observation`: o realizado recalcula a série.

### O método de ajuste

1. **Rolagem** (`factors/base/serie-continua-futuro.js`, sem olhar o futuro). A partir de 40 pregões antes do último
   pregão do vencimento atual, a série rola para o vencimento seguinte com mais contratos negociados nos últimos 5
   pregões, quando essa soma passa a do atual. Os candidatos são os 3 vencimentos seguintes, e os que não negociam são
   pulados. Se a liquidez não migrar, a trava rola 10 pregões antes do último pregão. O preço do dia da troca já é o do
   vencimento novo.
2. **Ajuste proporcional.** Na troca, todos os preços anteriores são multiplicados pela razão entre o novo e o antigo
   naquele pregão. Os retornos em % ficam iguais aos de cada contrato, e o trecho atual é o preço real. O nível do
   passado ajustado muda a cada troca nova e não é um preço que existiu: só os retornos são comparáveis no tempo.
3. **Exemplo real** (troca de 13/08/2026, do ICFU26 para o ICFZ26, por liquidez: 3.139 contra 2.922 contratos em 5
   pregões). No dia, o ICFU26 fechou a 403,20 e o ICFZ26 a 382,30 US$/saca: razão de 0,9482 (−5,18%, curva invertida).
   - Em 12/08, o ICFU26 fechou a 409,35; ajustado, 409,35 × 0,9482 = 388,13.
   - Em 14/08, o ICFZ26 fechou a 384,00, que é o preço real do trecho atual.
   - De 12/08 a 14/08, sem o ajuste, a variação seria de −6,19%, e os −5,18% da curva entrariam como movimento de
     preço. No ICF-CA, ela é de −1,06% (384,00 ÷ 388,13): o ICFU26 caiu 1,50% até a troca, e o ICFZ26 subiu 0,44%
     depois dela.

### O que mudou

| Onde | Antes (ADR 0078) | Agora |
|---|---|---|
| Prompt do café (v16) e configuração (v8) | Um contrato por horizonte, com a linha "Contrato" na tabela 2.4 | O ICF-CA nos quatro horizontes; o contrato do dia no bloco 2.1. A curva segue no 2.2, como informação |
| O que fica gravado com a leitura | O contrato de cada horizonte | `precoReferencia`: a série `ICF_CA`, o código `FINMIND.ICF.ICF-CA.AJUSTE`, o contrato do dia e `serieContinua` |
| Realizado e Qualidade da IA | No contrato de cada horizonte | Na série ajustada calculada em `agora`. A base é o ponto ajustado da data do preço recebido, e a razão entre dois pontos não muda com as trocas que vêm depois |
| Centro de Decisão | O ICF do vencimento mais próximo | O ICF-CA como 1ª série, com o contrato do dia; o ICF por vencimento continua como opção |
| Metodologia do café (v16) | A série contínua como proposta | O ICF-CA "em uso"; as perguntas do E1 e do E11 viram decisão |

- As leituras até a configuração v7 seguem medidas no contrato gravado com cada horizonte. A versão separa os dois
  grupos na Qualidade da IA.
- As carteiras virtuais não mudam: operam o contrato, com a regra de saída delas (ADR 0127).
- As faixas (T1 e T2) seguem as calibradas no ICF por vencimento (ADR 0062). A variação no ICF-CA, sem o salto da troca,
  não foi medida contra elas: recalibrar, se for o caso, é outra decisão.
