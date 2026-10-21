# 0133 — Café: a demanda (F6) e o custo (F5) só no horizonte LONGO, com a validação da resposta

## Contexto

A análise "ANÁLISE CAFÉ 19out26" (resposta no `STATUS_DO_PROJETO.md`, §0) aponta no item **E5** que o F6 (demanda
mundial, o consumo do USDA PSD) é semestral e não deveria pesar num sinal de 7 dias: o consumo não separa o preço (a
validação do ADR 0088 já mostrava isso). Pede retirar o F6 do horizonte curto e mantê-lo só no de 90 dias, com peso
baixo; e, para o acompanhamento mensal, as exportações do Cecafé e os dados da ICO.

No FinMind, o F6 ia à leitura em todos os horizontes, com o peso Médio do FEL 1, e a IA decidia sozinha se ele pesava.
O F5 (custo de produção) já tinha a restrição ao longo prazo (a regra do estudo, no par F5 × F2), mas só como instrução
do prompt (item 1): a IA não era obrigada a segui-la.

**Quem decidiu:** o usuário, em 2026-10-21, com o mesmo poder de decisão do David (`CLAUDE.md`).

## Evidência (as 15 leituras do café no servidor, 05 a 21/10/2026)

| Horizonte | F6 a favor da leitura | F6 contra a leitura | F6 pouco relevante |
|---|---|---|---|
| IMEDIATO | 0 | 1 | 12 |
| CURTO | 0 | 3 | 6 |
| MEDIO | 1 | 14 | 0 |
| LONGO | 1 | 14 | 0 |

- No IMEDIATO, a IA já marcava o F6 como pouco relevante em 12 de 15; no CURTO, em 6; no MEDIO, usava-o sempre.
- **O F6 pressiona para alta** (o consumo cresceu 3,6%, "alta moderada"): nas leituras de baixa, ele aparecia contra a
  leitura. Tirá-lo do CURTO e do MEDIO remove um argumento de alta: **a correção é de lógica, não explica a divergência**
  que a análise aponta. O que sustentou a baixa nas leituras recentes foram o F1 (clima) e o F2 (Conab).
- Em 21/10, a IA pôs o F6 "a favor" da baixa no MEDIO e no LONGO, com a pressão dele de alta: uma incoerência que a regra
  nova reduz no MEDIO.

## Decisão

1. **Mecanismo `soNosHorizontes`** na definição do fator (`metodologia-base.js`): `{ horizontes, motivo }`. O bloco do
   fator no prompt ganha a linha "Horizontes: só informa o LONGO; nos outros, é pouco relevante (não conta a favor nem
   contra)", com o motivo; a tabela 2.3 marca "só no horizonte LONGO"; e o validador da resposta
   (`resposta-analise-diaria.js`) **recusa** a leitura que citar o fator em `fatoresAFavor` ou `fatoresContra` fora
   desses horizontes (a nova chamada segue a regra de sempre). Ali ele só pode ir em `fatoresPoucoRelevantes`.
2. **F6 (CAFE_DEMANDA): só o LONGO, como peso baixo** (o Médio do FEL 1 fica só como referência, dito no motivo).
3. **F5 (CAFE_CUSTO_PRECO_MINIMO): só o LONGO**, a regra do estudo que já estava no prompt, agora também na validação.
4. **Prompt do café v11:** o item 1 diz que os dois só informam o LONGO e que, nos outros horizontes, vão só em
   `fatoresPoucoRelevantes`.
5. **Fora:** as exportações do Cecafé como acompanhamento da demanda. Elas medem a saída do Brasil (oferta), e rotulá-las
   como demanda confundiria a leitura; a demanda de verdade seria a importação dos blocos consumidores (UE e EUA), fonte
   nova. A ICO, no FinMind, dá preços e estoques, não consumo.

**Correção junto (do ADR 0130):** com a meia-vida, a seção de eventos dos agrícolas inclui os eventos de antes da janela
que ainda têm peso; o cabeçalho dizia só "nos últimos 7 dias". Passa a dizer "e, de antes, os que ainda têm peso pela
meia-vida".

## Consequências

- A leitura do café do IMEDIATO ao MEDIO deixa de usar a demanda e o custo como argumento.
- O mecanismo vale para qualquer fator de qualquer ativo, mas só o café o usa por ora.
