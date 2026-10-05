# 0065 — Peso por mês e agregação do milho no prompt diário

**Status:** aceita (2026-10-05).

## Contexto

O Motor do Milho v0 do David (ADR 0056) traz um calendário de pesos (fator × mês), pesos condicionais, uma matriz de
relações 8×8 e nove regras de agregação. O ADR 0059 levou tudo isso à tela de metodologia, **só na tela**: o prompt
diário (ADR 0058) seguiu com o peso do FEL 1 e proibia a IA de criar um peso por mês. Em outubro a diferença aparece:
pelo calendário do David, o F1 (clima dos EUA) e o F2 (safrinha) têm peso Baixo e o F4 (dólar e paridade) tem peso Alto.
O prompt dizia o contrário.

**Decisão do usuário (Welerson, 2026-10-05):** o calendário e as regras de agregação vão ao prompt do milho **como texto
fixo**, sem nenhum cálculo novo. O cálculo dos fatores (camadas A, B e C) não muda. É a autorização que o ADR 0059 pedia
ao Comitê, dada pelo usuário antes dele. O Comitê pode revê-la, e a agregação em código continua com ele. **Limite:**
só o milho. O ouro e o petróleo não têm calendário, e o café descartou os pesos fixos (ADR 0060).

## Decisão

1. **O calendário vai como tabela fixa no bloco 2.5 do prompt** ("Peso de cada fator por mês"). A tabela tem os 8
   fatores × 12 meses, com o peso do FEL 1 ao lado como referência, e é o mesmo texto todos os dias. A IA escolhe a
   coluna do mês da data da análise. A tabela é montada de `pesos` em `shared/metodologia-milho.js`, o mesmo dado da
   tela (`prompt-diario.service.js::blocoPesos`). Assim a tela e o prompt não divergem quando um mês mudar. O campo
   `pesos.noPrompt` (`metodologia-base.js`) liga a tabela, registra a autorização e diz o que vale no mês não definido.
2. **Mês que a proposta não define:** vale o peso do FEL 1, marcado com `*` na tabela. São o F1 de janeiro a maio e o
   F2 em janeiro e fevereiro. Na tela, esses meses seguem como "não definido". A pergunta ao David continua aberta.
3. **F7 (fundos) não vota.** A tabela do fator dava peso Médio, mas as regras de agregação dizem que ele não vota. Vale a
   regra de agregação, e na tabela o F7 sai sem peso próprio. O multiplicador numérico (×1,25) não vai ao prompt: o
   texto diz que, alinhado ao sinal de F1, F3 ou F8, o F7 reforça a firmeza desses fatores, e que, contra o sinal, é
   risco de reversão.
4. **Condições** (o F5 Alto na base de MT de junho a setembro, o F6 Médio com vencimento de 6 meses ou mais, o F8 Alto
   com destino grande e ato confirmado) vão abaixo da tabela. Só valem quando a BASE mostra que estão atendidas.
5. **As regras de agregação vão como orientação qualitativa** no bloco 4 (instrução do sistema):
   - o peso do mês no lugar do peso do FEL 1;
   - o teto do bloco de oferta (três sinais na mesma direção valem um fator Alto);
   - o F3 como filtro também do etanol;
   - o câmbio tendendo a atenuar uma alta de Chicago;
   - o F7 que não vota: ele nunca entra em `fatoresAFavor` nem em `fatoresContra`, e o papel dele vai só em
     `posicionamentoCot`;
   - peso não é direção: um fator com pressão neutra, mesmo de peso Alto, não é argumento a favor nem contra.

   As duas últimas frases entraram depois do teste quente (abaixo). Nada que peça conta à IA: sem soma de pesos, pontuação nem multiplicador. As regras com número (o teto, o ×1,25, a
   paridade líquida sem o preço de Chicago) ficam como frase ou fora.
6. **Versões:** o prompt `milho-analise-diaria` passa à v2 e a metodologia do milho à v2 (2026-10-05). A configuração
   das faixas não muda. As leituras gravam as duas versões, e a Qualidade da IA (ADR 0064) separa as leituras de antes e
   de depois.

## Consequências

- A partir de 2026-10-05, a leitura do milho pondera os fatores pelo mês. Em outubro, o câmbio e a paridade pesam mais
  que o clima dos EUA e a safrinha.
- A tela de metodologia diz que o calendário está no prompt, com a autorização. As regras de agregação mudam de
  situação: o mapa sazonal e o F3 como filtro passam a "orientação no prompt".
- A IA continua sem fórmula: duas leituras do mesmo dia podem ponderar de forma diferente. A agregação em código, que
  tornaria isso determinístico e testável no histórico, é a etapa 5 do status, com o Comitê.

## Teste quente (2026-10-05)

Para isolar o efeito do texto, os prompts v1 e v2 foram enviados ao Gemini (gemini-3.8-flash) sobre a mesma base do
milho de 2026-10-05, montada no banco local, duas vezes cada, sem gravar nada.

- **O peso do mês pegou.** A v2 cita o peso do mês ("peso Alto em outubro", "peso Baixo no mês") em todas as respostas;
  a v1, nunca. O eixo da leitura mudou: na v1 dominavam a liquidação dos fundos e a safrinha. Na v2 dominam os estoques
  (F3, Alto), de um lado, e a exportação e o etanol, do outro, e a safrinha (Baixo em outubro) perde papel.
- **Dois desvios, corrigidos.** Na primeira versão do texto, o F7 entrou nas listas de argumentos em todas as respostas
  (4 vezes em cada uma), e o F4 neutro, de peso Alto, entrou como argumento em 2 das 4 respostas. Com as duas frases
  acima, a segunda rodada teve 0 ocorrências de cada.
- **O que segue:** no médio prazo, o F3 de alta forte contra dois fatores Médios de baixa é um equilíbrio real. As duas
  respostas da v2 divergiram ali (alta leve e baixa leve), ambas com confiança BAIXA. O teto do bloco de oferta não foi
  posto à prova, porque em outubro só o F3 tem peso Alto no bloco.

## Fora do escopo

A agregação em código; a matriz de relações 8×8 inteira no prompt (só as relações que mudam a leitura viraram frase); os
pesos do ouro, do petróleo e do café; as notas de peso por força do sinal (ex.: "Médio; Alto quando a polinização está
concluída"), que seguem só na tela.

## Adendo (2026-10-05): as regras de peso por força do sinal vão ao prompt

**Decisão do usuário (Welerson, 2026-10-05):** tudo o que o card "Peso por fator e por mês" da tela mostra como
orientação vai ao prompt, ou sai do card.

- **Vão ao prompt** (bloco 2.5, lista "Condições e regras de peso", que só valem quando a BASE mostra que estão
  atendidas), ao lado das condições que já iam:
  - F1: pressão de baixa com peso Médio; Alto quando a polinização está concluída (90% ou mais da área);
  - F2: revisão para cima que não atinge os limiares, viés baixista fraco com peso Baixo;
  - F3: o peso cresce quanto mais baixo o percentil do estoque/uso (convexidade); de baixa, Médio (o Alto pede uma
    surpresa contra a expectativa do mercado, que não está na BASE);
  - F5: pressão de baixa com peso Médio, mesmo de junho a setembro.

  A polinização, a condição da lavoura, a revisão da Conab e o percentil do estoque/uso estão na BASE.
- **Sai da tela e vira pergunta:** o ajuste do F1 ao CCM (reduzir o peso de junho a agosto enquanto a colheita da
  safrinha passa de 50%). O andamento da colheita (IMEA) é coletado, mas não está na BASE do prompt.
- **Sai do card:** a coluna "Sugestão do especialista" (o calendário é a versão aplicada dela; o texto segue no ADR 0056).
  As notas que só explicam o calendário ficam.
- **A tela mostra o que vai:** a tabela ganha a coluna "Hoje no FinMind", com o chip "Orientação no prompt" e, por
  fator, as mesmas linhas que vão ao prompt (`metodologia-base.js`, `noPrompt`; o prompt e a tela usam o mesmo dado).
- **Versões:** prompt `milho-analise-diaria` v3 e metodologia do milho v3.

## Adendo (2026-10-05): as relações entre os fatores vão ao prompt

**Decisão do usuário (Welerson, 2026-10-05):** o card "Relações entre os fatores" só mostra o chip "Orientação no
prompt" se o que ele orienta vai ao prompt.

- **Vão ao prompt** (bloco 2.5, lista "Relações entre os fatores", como orientação, não fórmula): as frases do Motor
  do Milho v0 ao lado da matriz, ou seja, os fatores que mais influenciam os demais (F1 e F3; F4 conversor, F7
  amplificador), as correlações inversas relevantes e a defasagem de F2 × F6. O item 9 do bloco 4 diz para usá-las ao
  julgar se uma divergência é esperada ou um conflito de verdade, sem somar nem descontar nada por elas.
- **Não vai:** a matriz de símbolos (++, +, (−), ±...). É um julgamento estrutural ainda a validar, e 64 células
  convidariam a IA a fazer conta, contra a regra de que nada quantitativo de agregação vai a ela. Fica na tela como
  referência, e o card diz isso.
- **Versão:** prompt `milho-analise-diaria` v4; o texto vem de `shared/metodologia-milho.js` (`relacoes.leitura` e
  `relacoes.observacoes`), o mesmo do card.

## Adendo (2026-10-05): as regras de agregação "em parte"

**Decisões do usuário (Welerson, 2026-10-05)**, no card "Regras de agregação" da tela:

- **Fundos como multiplicador:** passa a "Orientação no prompt". O que vai (o F7 não vota; alinhado ao sinal, reforça;
  contra, é risco de reversão) é a forma aprovada, e o multiplicador numérico (×1,25) ficou fora por decisão do
  usuário (adendo anterior); o card diz isso. Sai das perguntas ao Comitê.
- **Sinais defasados:** passa a "Orientação no prompt". O bloco do F6 no prompt ganha a data de efeito esperada, de 6 a
  12 meses depois do período do dado, sobre a safrinha seguinte (`efeitoDefasado` no fator, em
  `shared/metodologia-milho.js`; a linha sai de `factors/base/texto-prompt.js`). É conta de calendário sobre a regra do
  David, não regra nova; o item 1 do prompt cita a data.
- **Eventos:** continua "em parte". **Não haverá validação humana** dos eventos antes do prompt (confirma o Comitê,
  ADR 0058; a pergunta sai). Falta o David definir o valor do **volume estimado relevante** e o do **decaimento** (as
  duas são perguntas do F8). Sem esses valores, nada disso é inventado no prompt.
- **Versão:** prompt `milho-analise-diaria` v4 (com o adendo anterior).
