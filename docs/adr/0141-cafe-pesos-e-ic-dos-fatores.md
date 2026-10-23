# 0141 — Café: os pesos por horizonte da análise testados e não adotados; o IC de cada fator e o script da revisão

## Contexto

A análise "ANÁLISE CAFÉ 19out26" (resposta no `STATUS_DO_PROJETO.md`, §0) propõe na **§3** uma nova estrutura de fatores
com pesos por horizonte (curto, médio e longo, cada um somando 100%), "hipóteses iniciais para backtest, não valores
definitivos": o momentum e a estrutura a termo, os estoques, os eventos, o clima, a Conab, a Colômbia, o basis, a
sazonalidade, o câmbio, os juros, a demanda e o custo, com o F7 como modificador. Na **§4**, o método para comprovar uma
inversão de sinal: o IC (correlação de Spearman entre o escore do fator e o retorno futuro) em 1, 5, 20 e 60 dias, em
janelas de 12 meses, fora da amostra e com bootstrap em blocos, e a regra de decisão: IC negativo e estável por 12 meses
ou mais, revisar a lógica; negativo num episódio isolado, manter; indistinguível de zero, rebaixar o peso ou desligar. A
**§6** pede o IC mensal por fator.

O FinMind não tem pesos numéricos no prompt do café: a IA combina os fatores com as regras do estudo como orientação
(ADR 0062); a agregação em código com pesos por família não superou o "sempre lateral" no histórico do ICF e saiu do
prompt (ADR 0066, adendo de 2026-10-07). Dos fatores da tabela da §3, a Colômbia e a sazonalidade foram testadas e não
adotadas, e o momentum vai como informação (ADR 0139); os eventos só existem desde 10/2026; o basis não tem regra.

**Quem decidiu:** o usuário, em 2026-10-21, com o mesmo poder de decisão do David (`CLAUDE.md`): não adotar pesos
numéricos, registrar o IC e criar o script para a revisão.

## Evidência (banco de dev, 2026-10-21)

`npm run ic:cafe` (`scripts/ic-fatores-cafe.js`, com `factors/base/ic-fatores.js`): cada fator calculado no histórico
inteiro (cada semana point-in-time, a leitura valendo do pregão seguinte à disponibilidade), o escore da leitura C (alta
positiva, baixa negativa; forte 2, moderada 1, fraca 0,5, neutra 0) e o KC de Nova York depois (Yahoo, a troca de
vencimento ajustada). Entre colchetes, o intervalo de 90% do bootstrap em blocos de 13 semanas:

| Fator | Semanas | 1 pregão | 5 | 21 | 62 |
|---|---|---|---|---|---|
| F1 Clima | 1.236 (2002 a 2026) | −0,06 [−0,11; −0,00] | +0,00 | +0,01 | +0,10 [−0,01; +0,24] |
| F4 Câmbio | 935 (2008 a 2026) | −0,06 [−0,11; +0,00] | −0,01 | −0,02 | −0,01 |
| F5 Custo (a regra proposta, ADR 0138) | 1.164 (2004 a 2026) | −0,04 | +0,00 | +0,03 | +0,14 [−0,02; +0,27] |
| F7 Fundos | 897 (2009 a 2026) | −0,01 | −0,02 | −0,07 [−0,16; +0,02] | **−0,14 [−0,28; −0,01]** |
| F8 Juros | 1.398 (2000 a 2026) | +0,02 | +0,02 | −0,00 | +0,01 |
| Momentum (seguir a tendência) | 1.313 (2000 a 2026) | +0,02 | −0,02 | −0,05 [−0,13; +0,02] | +0,01 |

- Sem histórico para o IC no dev: o F2 (11 levantamentos desde 2023), o F3 (o diário da ICE só está no servidor; o teste
  do ADR 0131, com o dado do servidor, deu a regra invertida em 2022 a 2026) e o F6 (2 pontos).
- **Os pesos da §3**, sobre os fatores que votam (o momentum, o F1, o F2, o F3, o F6 e o F8, renormalizados sem os que
  faltam), de 2016 a 2026: IC de −0,00 no curto, +0,01 no médio e +0,06 no longo; com o escore fora de ±0,25, acertou o
  lado em 48%, 47% e 50% das semanas.
- **A inversão (§4):** só o F7 no LONGO tem IC negativo com o intervalo excluindo o zero: o fluxo dos fundos tende a
  continuar, não a reverter. Mas é instável (o IC das janelas de 12 meses em 21 pregões ficou positivo em 53 de 65) e o F7
  já é só informação (ADR 0132). Os demais têm IC indistinguível de zero; o F1 e o F5 no LONGO ficam perto de um sinal
  positivo, sem significância.

## Decisão

1. **Os pesos da §3 não são adotados:** com os fatores que existem, o composto não tem sinal, como a agregação do ADR 0066.
   A IA segue combinando os fatores pelo prompt, com os papéis decididos do E3 ao E10.
2. **O IC de cada fator fica registrado** (aqui e no status, §0) e é refeito por `npm run ic:cafe`, a revisão mensal da §6.
   No servidor, o script mede também o F3. Não chama a IA e não grava nada.
3. **Com o Comitê:** o que fazer com os fatores de IC indistinguível de zero (pela regra da §4, rebaixar o peso ou
  desligar), e se o F7 invertido no LONGO pede revisão da lógica (hoje ele já não vota).

## Consequências

- Nenhuma mudança no prompt nem no Centro de Decisão.
- A §4 do documento fica respondida com o IC; a revisão mensal da §6 tem um comando.

## Adendo (2026-10-23): a decisão do Comitê e o que mudou

O Comitê, na resposta de 2026-10-22: os pesos da §3 não são adotados; "fatores com IC indistinguível de zero devem ser
rebaixados ou desligados"; e, para o F7, "revisar a lógica sem inversão automática".

**Quem decidiu como aplicar:** o usuário (Welerson), em 2026-10-23, com o mesmo poder de decisão do David (`CLAUDE.md`),
sobre a recomendação do FinMind. Os fatores que ainda votavam no café eram o F1, o F2, o F6 e o F8.

| Fator | IC (1 / 5 / 21 / 62 pregões) | O que mudou |
|---|---|---|
| F8 Juros | +0,02 / +0,02 / 0,00 / +0,01 (2000 a 2026) | **Desligado:** vai à IA como INFORMAÇÃO (`informativo`, papel decidido pelo Comitê). É a maior amostra, com o IC zero em todos os prazos |
| F1 Clima | −0,06 / 0,00 / +0,01 / +0,10 (2002 a 2026) | **Rebaixado:** peso Baixo (Alto no FEL 1; Médio desde o E6) e voto **só no LONGO** (`soNosHorizontes`), onde o IC é positivo (sem significância) e está o El Niño aprovado no E6. Nos outros horizontes, a resposta que o citar a favor ou contra é recusada; o clima de curto prazo chega pelos eventos |
| F2 Safra | Sem histórico para o IC (11 levantamentos) | Mantido, com o decaimento aprovado (E7). A regra não se aplica sem IC; `npm run ic:cafe` mede quando houver dado |
| F6 Demanda | Sem histórico para o IC (2 pontos) | Mantido, já só no LONGO |

**O F7, revisto sem inversão automática:** o F7 já não votava (ADR 0132). A leitura de reversão (vendidos em extremo,
alta) teve o IC de −0,14 no LONGO; seguir o fluxo, a inversão, também não se sustentou (ADR 0132). O F7 passa a ser lido
como **risco de posição concentrada, sem sentido**: muitos fundos de um lado só aumentam o risco de um movimento forte
quando a posição for desmontada, sem dizer o lado. Nenhum teste novo: as duas direções já foram testadas.

**Onde:** a metodologia do café v21 e o prompt do café v20 (itens 6, 9 e 10; no mesmo prompt, corrigida a frase que dizia
que a curva do ICF não estava na BASE).

**A consequência:** no IMEDIATO, no CURTO e no MEDIO, só o F2 vota no café, além dos eventos e do preço como informação. A
leitura curta deve sair mais vezes LATERAL ou INSUFICIENTE. Nenhum fator mostrou poder no curto prazo, e a Qualidade da IA
já mostrava que o "sempre lateral" não era batido.
