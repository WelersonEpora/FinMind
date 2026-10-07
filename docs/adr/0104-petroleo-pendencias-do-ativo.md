# 0104 — As pendências do ativo petróleo: faixas calibradas, sem agregação por ora e eventos sem aprovação humana

**Status:** aceita (2026-10-07).

## Contexto

Com os 10 fatores do petróleo sem pergunta pendente (ADRs 0091 e 0093 a 0103), restavam as do ativo, no card "Ativo"
da Metodologia (ADR 0050, adendo), tiradas da conversa com o David (`docs/conversa-david-respostas-fel1.md`, pontos 1 a
4):

1. Brent futuro como referência: o contrato por horizonte e a mudança de nível (decisão do usuário de 2026-10-07, ADR
   0052, adendo, a confirmar com o David).
2. Formato da leitura da IA: as faixas calibradas, ou a variação central em % com as 6 classes fixas do prompt do milho?
   E os cenários altista, neutro e baixista?
3. Peso e agregação: o mapa sazonal e as regras de agregação do milho valem para o petróleo?
4. Validação dos eventos: a validação humana antes do prompt, pedida no F8 do milho, vale para a geopolítica e a OPEP+?

A 1 foi decidida pelo usuário e só espera a confirmação do David. As outras três foram discutidas uma a uma.

**Formato.** Com as classes fixas do David (abaixo de 1%, 1–3%, 3–5%, 5–7%, 7–10% e 10% ou mais), a variação absoluta
do Brent futuro contínuo de 2010 a 2026 (4.121 dias por horizonte) cairia assim:

| Horizonte | < 1% | 1–3% | 3–5% | 5–7% | 7–10% | ≥ 10% |
|---|---|---|---|---|---|---|
| 1 dia | 60% | 31% | 7% | 2% | 1% | 0% |
| 7 dias | 21% | 37% | 20% | 11% | 7% | 5% |
| 30 dias | 9% | 18% | 17% | 16% | 16% | 24% |
| 90 dias | 7% | 13% | 11% | 10% | 13% | 47% |

Em 1 dia a classe quase não informa (91% nas duas primeiras); em 90 dias, quase metade seria "excepcional". As faixas
calibradas (percentis 40 e 80 de cada horizonte: 0,8/2,3%; 1,8/5%; 4/11%; 6/19%) põem ~40% dos casos em lateral e ~20%
em forte em qualquer horizonte. O café teve o mesmo resultado (ADR 0079); o Comitê aprovou as faixas no milho e no café.

**Agregação.** No milho, a agregação do David em código ficou fora do prompt porque não superou os benchmarks (ADR
0081); no café, a do FinMind está em produção (ADR 0066). No petróleo, a única sazonalidade plausível (a temporada de
gasolina dos EUA) daria mais peso à demanda, que não antecipa o preço em nenhum prazo (ADR 0099). Os papéis dos fatores
(ADR 0103) dão base para uma agregação, mas a Qualidade da IA ainda não tem leituras do petróleo com o Brent futuro para
medi-la.

**Eventos.** Nenhum evento passa por aprovação humana; os filtros são automáticos (fontes autorizadas, a página lida
pela pesquisa, a regra de repetição, ADR 0092), e o motivo de cada rejeição fica na tela. A tela de Eventos não tem
rejeição manual. A leitura do dia roda de madrugada com a coleta: com aprovação antes do prompt, a geopolítica e a
OPEP+, que mudam quase todo dia, chegariam com atraso ou não chegariam.

## Decisão (usuário, Welerson, 2026-10-07, pelo mesmo poder de decisão do David)

1. **Brent futuro:** sem mudança; segue para a confirmação do David.
2. **Formato:** ficam as faixas calibradas, como nos outros três ativos. As classes fixas e a variação central em %
   ficam de fora. Os cenários altista, neutro e baixista ficam para depois, como pergunta comum aos quatro ativos (a
   tese, o argumento contra e a condição de invalidação já cobrem parte deles).
3. **Peso e agregação:** fica o peso do FEL 1, sem peso por mês e sem agregação. Com algumas semanas de leituras com o
   Brent futuro, o FinMind testa uma agregação pelos papéis dos fatores contra os benchmarks da Qualidade da IA (ADR
   0064), como no milho, e a decisão volta com números. As alternativas (a agregação em código já, como no café; ou uma
   orientação em texto no prompt) ficaram de fora.
4. **Eventos:** a geopolítica e a OPEP+ seguem sem aprovação humana, só com os filtros automáticos. Um veto depois (o
   admin rejeita um evento na tela de Eventos, com o motivo, e ele sai dos prompts seguintes) fica como melhoria
   possível, para os quatro ativos. A pergunta do F8 do milho continua com o David.

## Implementação

- **Metodologia do petróleo v11:** o card "Ativo" com as três decisões; fica uma pergunta, a confirmação do Brent
  futuro. O prompt (v9), o cálculo e a tela não mudam.
- `docs/conversa-david-respostas-fel1.md`: a resposta do petróleo nos pontos 2 a 4, que continuam abertos para os
  outros ativos.

## Consequências

- O petróleo tem uma pergunta pendente, a do Brent futuro, com o David.
- Fica a fazer: o teste da agregação do petróleo contra os benchmarks, quando houver leituras com o Brent futuro.
- As leituras já gravadas não mudam.
