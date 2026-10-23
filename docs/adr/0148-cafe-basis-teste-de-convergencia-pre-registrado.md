# 0148 — Café: o basis B3 × Nova York, o desvio a justificar e o teste de convergência pré-registrado

## Contexto

A análise "ANÁLISE CAFÉ 19out26" (resposta no `STATUS_DO_PROJETO.md`, §0) pediu o basis B3 × Nova York em dois lugares:

- no **E1**, com o critério de aceite "basis conciliado, com justificativa para cada desvio acima de 2 desvios padrão";
- no **E10**, como fator novo, com o peso de 10% no CURTO e 5% no MEDIO da §3 (os pesos da §3 não foram adotados, ADR
  0141). O documento não diz em que sentido o basis pesaria.

O basis já é calculado como informação na tela (item E1, `factors/basis-icf-kc.js`), com o percentil no histórico. O
Comitê, na resposta de 2026-10-22: "E10: o momentum não é adotado como regra; o basis fica como informação até ser
testado."

**O que o histórico permite (dev, 2026-10-23).** O ICF só está na base desde 2022-03 (930 pregões com o par). Com o
desvio acima de 2, são **5 episódios em 4,5 anos**: 2 com o ICF barato contra Nova York (07/2022 e 11/2025) e 3 com ele
caro (12/2022, 04/2025 e 03/2026). Um teste agora daria "inconclusivo" por construção.

**Quem decidiu:** o usuário (Welerson), em 2026-10-23, com o mesmo poder de decisão do David (`CLAUDE.md`), sobre a
recomendação do FinMind:

1. o momentum fica como está, informação no prompt, sem voto (ADR 0139): é o que o Comitê decidiu;
2. o basis ganha o que o documento pede de fato: o **desvio (z)** e a **lista dos desvios acima de 2** a justificar, na
   tela, como informação;
3. o teste do basis como fator fica **pré-registrado agora** e só roda quando houver **3 desvios ou mais de cada lado**.

## Decisão

### 1. O desvio e a lista a justificar (implementado)

- O z do basis em % contra a média e o desvio padrão de **todos os pregões anteriores** (mínimo de 60), em cada pregão.
- Os desvios acima de 2 viram uma lista: um por episódio, o 1º pregão de cada sequência. Um pregão fora só abre episódio
  novo 20 pregões depois do último fora.
- A tela (Metodologia do café, "Preço de referência") mostra o z do último pregão e a lista, com a data, o contrato, o
  basis e o lado (o ICF caro ou barato contra Nova York). A justificativa de cada desvio é de quem analisa; a tela não a
  grava.
- Nada disso vai ao prompt, ao Centro de Decisão ou a um fator.

### 2. O teste de convergência (pré-registrado; não rodado)

**A hipótese**, a única que não exige um número inventado: o basis volta para a média (arbitragem entre as duas bolsas).
Com o ICF barato contra Nova York (z abaixo de −2), o ICF tende a subir; com ele caro (z acima de +2), a cair. É a
direção do ativo do café (o ICF-CA), não só a do basis.

**O desenho, congelado:**

- **A unidade é o episódio** (a lista acima), não o pregão: os pregões de um episódio são o mesmo fato.
- **O resultado:** o retorno do **ICF-CA** (a série contínua ajustada, ADR 0140) do 1º pregão depois do início do episódio
  até **21 pregões** depois (o MEDIO). O retorno de 5 pregões (o CURTO) é medido como informação, sem veredito.
- **A base:** a fração de todos os pregões com o par em que o ICF-CA andou no sentido previsto em 21 pregões (subiu, no
  lado barato; caiu, no lado caro).
- **Um lado passa** se a fração de episódios em que o ICF-CA andou no sentido previsto ficar **10 p.p. ou mais acima da
  base** e o retorno médio no sentido previsto for **positivo**.
- **Não passa** se a fração ficar abaixo da base ou o retorno médio no sentido previsto for zero ou negativo. Entre a base
  e +10 p.p. com o retorno positivo, **inconclusivo**.
- **Quando roda:** só com **3 episódios ou mais em cada lado** (a hipótese é simétrica). Antes disso, o comando
  `npm run validacao:basis` só conta os episódios e não calcula nenhum retorno.
- Passando os dois lados, vai ao Comitê a proposta do basis como fator no CURTO e no MEDIO. Até lá, informação.

## Consequências

- O critério de aceite do E1 do documento fica atendido em parte: o desvio aparece e a lista está pronta para a
  justificativa; gravar a justificativa na tela fica para quando alguém pedir.
- Com o ritmo de 2022 a 2026 (cerca de um desvio por ano de cada lado), o teste deve poder rodar em 1 a 2 anos.
- O basis depende do KC pelo Yahoo, fonte não oficial e provisória (ADR 0129).
