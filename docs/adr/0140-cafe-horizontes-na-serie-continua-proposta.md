# 0140 — Café: os horizontes medidos na série contínua ajustada do ICF, proposta para a sanção do Comitê

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
