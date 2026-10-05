# 0079 — As faixas da leitura da IA no milho e no café: ficam as calibradas

**Status:** aceita (2026-10-05).

## Contexto

A leitura diária classifica a variação de cada horizonte em faixas calibradas no próprio futuro: os percentis 40 e 80
da variação absoluta, por horizonte (o CCM, ADR 0058, adendo; o ICF, ADR 0062). O prompt do milho do David (§6) propõe 6
classes fixas, iguais para todos os horizontes: abaixo de 1% irrelevante, 1–3% fraco, 3–5% moderado, 5–7% forte, 7–10%
muito forte e acima de 10% excepcional (`docs/conversa-david-respostas-fel1.md`, pergunta 2). A pendência do milho e a
do café perguntavam se as classes do David substituem as faixas.

**As variações nas duas réguas** (cada vencimento sem emendar, 2022 a 2026; a variação absoluta em cada horizonte):

| Horizonte | CCM nas classes do David | ICF nas classes do David | Faixas calibradas |
|---|---|---|---|
| 1 dia | 80% irrelevante, 19% fraco | 38% irrelevante, 47% fraco | cerca de 40% lateral, 40% leve e 20% forte, nos dois ativos e em todos os horizontes |
| 7 dias | 48% irrelevante, 40% fraco | de irrelevante a excepcional | |
| 30 dias | de irrelevante a excepcional | 27% excepcional | |
| 90 dias | 9% excepcional | 60% excepcional | |

Com as classes fixas, a classe mais provável muda com o ativo e o horizonte. No milho em 1 dia, "irrelevante" acerta 4
de cada 5 vezes sem dizer nada; no café em 90 dias, "excepcional" é o normal. As faixas calibradas dão a cada classe uma
chance parecida em todos os horizontes: são o "método calibrado" que o próprio prompt do David pede. A favor das classes
fixas fica a comparabilidade: o mesmo número quer dizer o mesmo em todos os ativos e prazos.

## Decisão (usuário, Welerson, 2026-10-05)

- **Ficam as faixas calibradas** no milho e no café. As classes fixas do David ficam registradas aqui como a
  alternativa medida e não adotada.
- A pergunta sai das pendências dos dois ativos. As faixas não mudam; a configuração e o prompt também não. A
  metodologia do milho vai à v15 e a do café, à v3.

## Consequências

- As faixas continuam provisórias no sentido do ADR 0058: recalibram quando a volatilidade do futuro mudar (o histórico
  do CCM e do ICF começa em 2022).
- O petróleo e o ouro têm uma pergunta parecida ao David (o formato da leitura da IA). Ela não é decidida aqui.
