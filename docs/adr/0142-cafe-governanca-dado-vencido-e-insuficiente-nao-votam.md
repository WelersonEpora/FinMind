# 0142 — Café: o dado vencido e o insuficiente não votam (a governança da análise); o plano de implantação mapeado

## Contexto

A análise "ANÁLISE CAFÉ 19out26" (resposta no `STATUS_DO_PROJETO.md`, §0) traz na **§5** um plano de implantação em 9
semanas (dados, eventos, fatores, backtest, paper trading e a decisão do Comitê) e na **§6** os controles de
governança:

- **dado vencido:** o fator com a idade acima do limite perde o voto (2 dias para preço, 7 para estoques, 14 para clima e
  30 para safra);
- **dado insuficiente:** o fator nessa condição não vota e aparece como alerta;
- contrato registrado em cada horizonte; confirmação obrigatória (sinal de baixa com momentum de 20 dias positivo e
  backwardation exige revisão manual antes da execução); versionamento; revisão (IC mensal, pesos trimestral, imediata
  com evento de magnitude 3); dimensionamento da posição pela volatilidade.

Até aqui, o prompt do café mostrava a idade de cada fator na tabela 2.3 e deixava a defasagem com a IA ("não há
tolerância por fator"); um fator sem dado podia ser citado a favor ou contra.

**Quem decidiu:** o usuário, em 2026-10-21, com o mesmo poder de decisão do David (`CLAUDE.md`): os dois controles de
voto, com o limite da safra em 42 dias (o fim do decaimento do E7, ADR 0135) no lugar dos 30 da §6.

## Evidência (2026-10-21)

- No servidor, o VHI do café (o F1) tinha a referência de 14/10/2026, publicada em 16/10: 7 dias na leitura de 21/10. De
  2016 a 2026, o maior intervalo entre duas semanas da série foi de 9 dias (561 semanas): o limite de 14 dias só tira o
  voto quando a coleta falha. O diário da ICE (o F3) ia até 20/10.
- No banco de dev, parado desde setembro, a tabela 2.3 de 21/10 saiu com o F1 vencido (28 dias) e o F3 sem leitura: o
  caso que a regra cobre.

## Decisão

1. **Dado vencido não vota** (`idadeMaximaVotoDias` na metodologia, por fator): clima (F1) 14 dias, safra (F2) 42 dias,
   estoques (F3) 7 dias. A idade é a da tabela 2.3: da data de referência do dado até a data da análise. O F4, o F5 e o F7
   já não votam (informação), e o F6 só no LONGO; o F8 não está nas categorias da §6. O limite do preço (2 dias) continua
   como o aviso de DEFASADO do bloco 2.1.
2. **Dado insuficiente não vota** (`SEM_DADO_NAO_VOTA`, configuração do café v7): sem dado até a data, ou sem a leitura do
   motor (o histórico não basta).
3. O fator sai na tabela 2.3 com "SEM VOTO" e o motivo; o prompt do café (v15, item 1) manda listá-lo só em
   `fatoresPoucoRelevantes` e registrar a falta em `lacunas` (o alerta da leitura); a resposta que o citar a favor ou
   contra é recusada pela validação (a coleta tenta uma vez mais). A `entrada` da leitura grava o `semVoto` de cada fator.
4. **Os demais controles da §6:** o contrato de cada horizonte, o versionamento, o IC mensal (`npm run ic:cafe`, ADR 0141)
   e o dimensionamento pela volatilidade (o ATR das carteiras virtuais, ADR 0127) já existem; a confirmação obrigatória é
   da execução, que o FinMind não faz (nas carteiras virtuais, seria uma trava da Cartilha), e a revisão imediata com
   evento de magnitude 3 e a dos pesos ficam com o Comitê.
5. **O plano da §5** fica mapeado no status (§0), entrega a entrega, para o item que a resolveu.

## Consequências

- Uma falha de coleta deixa de virar voto velho: o fator sai da conta no dia e a leitura diz a lacuna.
- A Qualidade da IA separa as leituras pela versão da configuração (v7).
