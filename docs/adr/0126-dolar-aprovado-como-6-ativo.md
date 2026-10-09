# 0126 — O dólar (USD/BRL) aprovado como 6º ativo: fatores, regra e medição até o prompt e o Centro de Decisão

**Status:** aceita (2026-10-09).

## Contexto

A fase 1 do dólar, só aquisição de dados, ficou completa em 2026-10-09 (ADRs 0117 a 0125). A proposta dos fatores
(`docs/proposta-ativo-dolar.md`, v1), feita a partir do relatório do Comitê de 2026-10-08, levou 8 decisões; o que ficou
fora do escopo (o day-trade, na fase 2) e o que faltava decidir estão em `docs/dolar-fora-do-escopo-e-decisoes.md`.

## Decisão (usuário, Welerson, 2026-10-09, com o mesmo poder de decisão do David)

As 8 decisões da proposta e as perguntas do relatório estão no adendo do ADR 0117. Em resumo:

1. **Arquitetura:** 8 fatores, os blocos do relatório; os fatores do relatório viram os observáveis de cada bloco, com um
   primário, no máximo uma confirmação e o contexto.
2. **Primários e direções** (as direções são as do relatório): F1 fluxo cambial (o saldo financeiro de 20 dias úteis);
   F2 dólar global (o índice do Fed contra emergentes); F3 juros dos EUA (o Treasury de 2 anos); F4 juros do Brasil (os
   três vértices do DI); F5 aversão a risco (o VIX, com o limiar de 20); F6 commodities (a maioria entre Brent, café e
   soja; o milho da B3 sai, cotado em reais); F7 expectativas (a revisão do IPCA do ano seguinte no Focus); F8 eventos.
3. **Os fundos (R1):** só informação, como no café e na soja.
4. **A régua de intensidade:** a variação na janela de cada horizonte (1, 5, 20 e 60 dias úteis) contra as da mesma
   janela nos 3 anos anteriores; neutra abaixo do percentil 40, forte a partir do 80.
5. **Os pesos:** por categoria. Alto: F2 e F3; Médio: F8, F6 e F5; Baixo: F7, F1 e F4.
6. **O preço de referência:** a PTAX de venda; o ajuste do DOL como contexto.
7. **O risco-país:** fora.
8. **A medição:** os benchmarks da Qualidade da IA, sem a meta fixa de 80%.

Com isso, **o dólar vai até o prompt e o Centro de Decisão**, como a soja (ADR 0116): os fatores e a regra vão ao
prompt diário como orientação em texto, a leitura de tendência da IA aparece no Centro de Decisão, e o realizado e a
Qualidade da IA a medem. Leitura de tendência, nunca recomendação de compra ou venda. A validação histórica da §3 da
proposta passa a ser feita pela Qualidade da IA e por um teste depois, como na soja. O day-trade fica para a fase 2.

## Implementação

**Catálogo** (`shared/fatores-fel1.js`): os 8 fatores com `origem: "ADR 0126"` e o peso por categoria. A regra R1 fica
fora do catálogo, como as da soja. O peso de um fator fora do FEL 1 diz quem o decidiu (`pesoDecididoPor`: o Comitê na
soja, o usuário no dólar), na explicação e na tela.

**A régua por horizonte** (`factors/modelos/dolar-comum.js`). Cada ponto de um fator do dólar tem uma leitura por
horizonte (`porHorizonte`), não uma só. O prompt leva as quatro na parte C (`texto-prompt.js`, genérico: só um ponto com
`porHorizonte` muda de formato); a `decisao` do ponto, a da tela e do resumo, é a de 30 dias. As chaves dos parâmetros
começam por `regua` (o texto do prompt as escreve inteiras). Molde comum dos fatores de primário e confirmação:
`factors/modelos/dolar-variacao.js` (F2, F3 e F5).

**Fatores** (`factors/`, um ponto por dia útil; o F7, por boletim):

- **F1** (`fluxo-dolar.factor.js`): o saldo financeiro acumulado em 20 dias úteis; o sinal dá a direção (saída = alta) e o
  tamanho, na régua, a intensidade; o saldo total confirma; o comercial é contexto. A mesma leitura em 7, 30 e 90 dias.
- **F2** (`global-dolar.factor.js`): DTWEXEMEGS, com o DTWEXBGS confirmando e o euro e o iene como contexto.
- **F3** (`juros-eua-dolar.factor.js`): DGS2, com o DGS10 confirmando; o juro real (DFII10) e a meta do Fed (DFEDTARU) como
  contexto. A inclinação é a diferença dos dois níveis.
- **F4** (`juros-brasil-dolar.factor.js`): os janeiros de Y+1, Y+3 e Y+5 (F27, F29 e F31 em 2026; a troca é no começo do
  ano), cada vértice na régua; os três do mesmo lado dão a direção, com a intensidade do mais fraco.
- **F5** (`risco-dolar.factor.js`): o VIX na régua, com o limiar do relatório: alta só acima de 20, baixa só abaixo dele;
  o S&P 500 confirma (caindo aponta alta do dólar).
- **F6** (`commodities-dolar.factor.js`): Brent (o 1º vencimento contínuo do Yahoo), café (ICF) e soja (SJC), cada um na
  régua; a maioria de dois dá a direção, com a intensidade da mais fraca da maioria.
- **F7** (`expectativas-dolar.factor.js`): a revisão da mediana do IPCA do ano seguinte contra o boletim anterior, com a
  da Selic confirmando; o primário, o câmbio do Focus, a balança e as transações correntes como contexto. A mesma leitura
  nos quatro horizontes.
- **F8**: fator de evento, com a janela de 7 dias. A leitura de eventos do dólar (`eventos-dolar-diaria.md` v2) passa a
  marcar `DOLAR_EVENTOS` nos cinco tipos próprios do dólar; a política comercial e a geopolítica seguem sem fator e vão à
  seção de eventos da base. A leitura dos outros ativos não muda.
- **R1** (`fundos-dolar.regra.js`): os fundos alavancados no real (COT, TFF), no percentil de 3 anos; no extremo, lidos como
  reversão, apontam para o dólar: comprados em real, alta; vendidos, baixa.

**Preço** (`shared/preco-market-quote.js`). A PTAX está em `market_quote`, não em `observation`: o Centro de Decisão e o
realizado a leem por esse módulo, com as linhas no formato da observation (`BCB.PTAX.VENDA`). A data de publicação é
estimada às 13h30 do dia (depois da última janela de apuração). O DOL é a 2ª série do Centro de Decisão.

**Leitura diária.** `shared/analise-diaria-dolar.js` (v1) e `ai/prompts/dolar-analise-diaria.md` (v1), no molde da soja: a
PTAX com 4 casas, a curva do DOL como contexto (`CURVA.futuro`, só os vencimentos negociados no dia), os fatores com a
leitura por horizonte, a regra R1, a relevância por horizonte e o peso por categoria. O coletor é `dolar-analise-ia-diario`.
A Qualidade da IA mostra o preço com até 4 casas.

**O que a implementação decidiu (operacionalização do FinMind, para o Comitê conferir):**

- **As faixas da PTAX** (percentis 40 e 80 da variação absoluta, de 2010 a 2026, banco de dev, 4.141 a 4.203 dias):
  IMEDIATO 0,4 / 1,0%; CURTO 0,9 / 2,3%; MEDIO 1,9 / 4,9%; LONGO 3,1 / 8,6%. Estáveis desde 2000 e desde 2016.
- **A R2 (defasagem)** tira o horizonte de 1 dia do F1 e do F2, cujos dados saem uma vez por semana. Nos outros, a idade
  do dado vai à tabela 2.3 do prompt, para a IA pesar.
- **O histórico mínimo** da régua: 60 variações anteriores. O DI1 só tem dados desde 2025-06 (o F4 começa em 2025-09); as
  três commodities juntas, desde 2022 (o F6 começa em 2022-06).
- **O ouro**, contexto aprovado do F2, não entra no cálculo: o GLD é por vencimento e a LBMA fechou o feed.
- **O F7 e a régua:** metade das revisões semanais da mediana do Focus é zero, então uma revisão de 0,01 p.p. já passa do
  percentil 40 e vira leitura fraca. O prompt pede pouca firmeza a ela; o Comitê pode subir o limite deste fator.
- **O Brent contínuo** tem os saltos da rolagem do 1º vencimento; o café e a soja usam, em cada janela, o contrato mais
  próximo com as duas pontas, sem emendar.
- **Comparação geral:** um defeito na comparação de "mesmo valor" da camada point-in-time foi corrigido junto do fluxo
  cambial (ADR 0125).

**Conferido em dev (2026-10-09):** o prompt monta em ~3 s com os 8 fatores e a regra; uma leitura real da IA
(`gemini-3.8-flash`, 21.860 tokens), válida na 1ª resposta: lateral em 1 dia; lateral com confiança baixa em 7 dias (o
dólar global em alta contra os juros dos EUA e o VIX em queda); alta leve em 30 dias (os dois fatores de peso Alto em
alta forte); lateral em 90 dias (os juros dos EUA em alta contra as commodities subindo). Os fundos fora do extremo, sem
papel. O Centro de Decisão mostra a PTAX e o DOL, e o realizado e a Qualidade da IA leem a PTAX.

## Consequências

- O dólar segue o caminho da soja: a IA combina os fatores pelo prompt, com o peso por categoria, e a Qualidade da IA mede
  as leituras contra os dois benchmarks. Não há agregação em código; a fórmula do score do relatório não é adotada.
- Mais uma chamada ao Gemini por dia (a leitura de tendência do dólar).
- A metodologia do dólar nasce com os fatores validados pelo usuário; um ajuste segue a regra de sempre, decidido antes de
  ir ao sistema, num ADR.
- A fase 2 (o day-trade) segue fora: o ciclo intradiário, as estratégias e o controle de risco por operação, num módulo
  próprio (ADR 0117). Nenhuma execução automática de ordens.
