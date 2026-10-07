# 0064 — Qualidade da IA: a avaliação das leituras de tendência

## Contexto

Desde o ADR 0063, cada horizonte da leitura diária de tendência (petróleo, ouro, milho e café; ADRs 0052, 0054, 0058 e
0062) mostra o realizado: a variação do preço e a faixa em que ela caiu. A métrica de acerto ficou de fora, porque estava
com o David (`STATUS_DO_PROJETO.md`, §4, "Avaliação da saída da IA").

**Decisão do usuário (Welerson, 2026-10-05):** o David delegou ao usuário a definição e a implementação da avaliação
da qualidade das leituras da IA. A metodologia abaixo foi fechada com o usuário em 2026-10-05, antes de existir
qualquer resultado: só havia uma ou duas leituras por ativo. Definir a métrica antes de ver os números é parte da
decisão: uma métrica escolhida depois de ver o resultado tende a ser ajustada até ficar bonita.

A delegação é só desta avaliação. Ela não autoriza regra, sinal nem recomendação de mercado (`CLAUDE.md`, "Restrições
permanentes"), e a leitura continua sendo de tendência, nunca recomendação de compra ou venda.

Ao montar a avaliação, apareceu um desvio no realizado do ADR 0063: ele media a partir do preço que a IA recebeu, mas
o prompt define a variação **a partir da data da análise**. A correção está no adendo do ADR 0063 e é pré-requisito
desta avaliação.

## Decisão

### 1. A unidade e as duas bases

A unidade é **uma leitura × um horizonte**. Cada linha guarda dois preços diferentes:

- **Preço que a IA recebeu** (`entrada.precoReferencia`): responde "o que a IA viu?". Continua gravado e visível.
- **Base da avaliação:** o último preço até a data da análise, na mesma série ou contrato da leitura, conhecido
  depois. É o ponto de partida da variação, como o prompt define (tabela 2.4: "entre a data da análise e o fim de cada
  horizonte; o preço de cada data é o do último pregão até ela").

Exemplo: leitura de 05/10; a IA recebeu 100 (03/10); a base da avaliação é 102 (05/10); o preço no alvo é 108 (12/10).
O realizado é +5,88%, a partir de 102.

### 2. Direção

- **Direção lida:** a da faixa lida (BAIXA_* é BAIXA, LATERAL é LATERAL, ALTA_* é ALTA).
- **Direção realizada:** a variação desde a base da avaliação, classificada com o **T1 gravado na leitura** (abaixo de
  T1, em valor absoluto, é LATERAL).
- **Acerto de direção:** a direção lida é igual à realizada. Mostrado sempre como `k de n (x%)`.

### 3. Faixa

Escala: BAIXA_FORTE −2, BAIXA_LEVE −1, LATERAL 0, ALTA_LEVE +1, ALTA_FORTE +2. A faixa realizada usa o T1/T2 gravados
na leitura.

- **Faixa exata:** a faixa lida é igual à realizada, em `k de n (x%)`.
- **Distância média:** a média de |lida − realizada|, de 0 a 4. ALTA_FORTE contra ALTA_LEVE dá 1; contra BAIXA_FORTE,
  4.

Não há "acerto parcial", e o denominador da faixa não depende de a direção ter acertado.

Limitações conhecidas (não são para corrigir): as faixas têm larguras diferentes e as FORTE não têm limite, então
distância 1 pode ser um erro pequeno ou grande. E a distância média favorece as leituras do meio: o pior caso de quem
diz LATERAL é 2, o de uma leitura direcional é 4.

### 4. Benchmarks

Calculados **exatamente nas mesmas linhas** da IA (mesmo ativo, horizonte, datas, base e T1/T2 de cada leitura):

- **Sempre Lateral:** LATERAL em todas as linhas.
- **Persistência:** a faixa da variação passada do mesmo horizonte, como a IA a recebeu (`precoReferencia.variacoes`:
  `d1` para 1 dia, `d7`, `d30` e `d90`), classificada com o T1/T2 daquele horizonte na leitura. Usa só o que a IA tinha:
  a variação termina no preço que ela recebeu, e não é recalculada até a base da avaliação (isso daria ao benchmark uma
  informação que a IA não teve).

Com as faixas nos percentis 40 e 80, o LATERAL tem cerca de 40% dos casos históricos por construção: "Sempre Lateral"
é um benchmark difícil de vencer, de propósito. A tela responde "a IA faz melhor que o óbvio?", não "a IA acerta x%?".

### 5. Quais linhas entram na métrica

Entram as linhas com o horizonte **APURADO** e a leitura **com pregão na própria data da análise** (a base da
avaliação é da data da análise, no mesmo contrato). As demais aparecem no histórico, contadas pelo motivo:

| Motivo | Quando |
|---|---|
| `REFERENCIA_ANTIGA` | Os horizontes contavam do último preço (petróleo, configuração v1), e começavam antes da leitura |
| `A_APURAR`, `AGUARDANDO_DADO`, `SEM_PRECO`, `SEM_PREGAO`, `SEM_BASE` | A situação do realizado (ADR 0063) |
| `SEM_PREGAO_NA_DATA` | Não houve pregão na data da análise (fim de semana, feriado, contrato sem negócio). Sem a regra, as leituras de sexta, sábado e domingo mediriam a mesma janela de preço |
| `INSUFICIENTE` | A IA não leu o horizonte |
| `SEM_BENCHMARK` | A leitura não tem a variação passada do horizonte (contrato com pouco histórico): sem ela, a IA e a Persistência seriam medidas em linhas diferentes |

Os motivos são verificados nessa ordem; uma linha conta só no primeiro que se aplica.

**INSUFICIENTE** fica fora do denominador e aparece como cobertura: "n respondidas de N", sobre as linhas que
entrariam na métrica. Contá-lo como erro empurraria a IA a nunca se abster; contá-lo como LATERAL inventaria uma
leitura; tirá-lo sem mostrar deixaria a IA "escolher os dias fáceis".

### 6. Recorte e síntese

- **Sempre por ativo × horizonte.** Nada agregado entre horizontes: o de 1 dia amadurece em dias e o de 90 em meses, e
  um número geral seria, por meses, quase só o de 1 dia.
- **Síntese sem índice:** não há como juntar direção e faixa num número só sem escolher pesos. A síntese de cada
  célula é a diferença contra o **melhor benchmark** em cada medida (em pontos percentuais no acerto de direção e na
  faixa exata, em faixas na distância), com o n ao lado. Nenhum limite mínimo de n esconde uma célula: o n à vista
  basta.
- **Versões:** cada leitura é medida com a própria régua, e os benchmarks também, então misturar versões da
  configuração na mesma célula continua justo. A tela tem um filtro por versão, com "todas" como padrão.

### 7. Calculado sob demanda e auditável

Nada é gravado: a avaliação sai das leituras (`analise_diaria`) e da camada point-in-time, como o realizado (ADR 0063).
A camada `observation` só acumula versões, então qualquer cálculo passado se refaz com o mesmo `asOf`. Todo número
da tela leva às linhas que o formam: data da análise, horizonte, data-alvo, o preço que a IA recebeu, a base da
avaliação, o preço realizado, a variação, a direção e a faixa lidas e realizadas, os benchmarks e o motivo de estar
fora, quando estiver.

### 8. O significado histórico de cada leitura

- Os horizontes (código, dias, T1/T2) e a data de onde contam vêm da **leitura gravada**, nunca da configuração atual.
  A data-alvo é a data de referência mais os dias gravados.
- A série do preço: as leituras novas gravam o `seriesCode` em `precoReferencia`. As antigas usam um mapa fixo das
  séries de preço de referência (`realizado-analise.service.js`), que não depende da lista de séries do Centro de
  Decisão.

### 9. O gráfico "faixas lidas × preço" (adendo, 2026-10-05)

Escolhido pelo usuário a partir de um protótipo, no lugar da grade de símbolos do AgroMind:

- **Cada faixa é uma leitura**, desenhada na data-alvo e convertida em preço a partir da base dela. Não é um corredor
  contínuo: cada leitura tem a própria base, então as faixas de dias vizinhos não se emendam.
- **Duas visões:**
  - **Quatro horizontes:** em cada data-alvo, o que foi lido para ela 1, 7, 30 e 90 dias antes, lado a lado, uma cor
    por horizonte. Cheia se o preço caiu dentro da faixa, só contorno se caiu fora, tracejada se falta apurar.
  - **Um horizonte:** uma faixa por data-alvo e um marcador pela distância entre faixas (na faixa, uma ao lado, duas ou
    mais), com forma além de cor; opcionalmente, a faixa da Persistência.
- **A faixa FORTE** ("+T2 ou mais") é desenhada com a altura de uma faixa leve e uma seta na ponta aberta; o tooltip
  diz o limite real.
- **As datas futuras** aparecem com o que já foi lido para elas.
- **A janela tem 180 dias:** 90 de realizado e 90 de previsão, com hoje no meio, a mesma nas duas visões e em qualquer
  horizonte (trocar a visão só troca as faixas desenhadas). A linha do preço cobre a janela inteira, mesmo antes da
  leitura mais antiga do período. Cada dia tem a mesma largura nas duas visões, para o tempo ter a mesma
  escala: o gráfico rola, abrindo em hoje.
- **A linha do preço** é, em cada dia, a do contrato que as leituras daquele dia usavam, partida na troca de contrato
  (sem emendar vencimentos). Uma leitura de outro contrato pode ficar ao lado de uma linha que não é a dela perto do
  rolamento; o tooltip mostra a base e o resultado da própria leitura.
- **Fica de fora do gráfico** só a leitura sem faixa (INSUFICIENTE). As de fim de semana, as sem pregão na data, as sem
  benchmark e as da referência antiga aparecem esmaecidas, com o motivo no tooltip: a métrica não as conta. As que só
  aguardam o preço não são esmaecidas.
- **Os cards vêm antes do gráfico:** são a resposta da tela (a IA contra os benchmarks, com o n), e o gráfico mostra de
  onde ela vem. Cada card leva o gráfico ao próprio horizonte (de novo, volta aos quatro) e à lista das suas linhas.

O cálculo é uma função pura (`utils/leque-leituras.js`), e o desenho fica em `components/charts/LequeLeiturasChart.vue`.

#### Por que a barra cresce com o horizonte (adendo, 2026-10-07)

Explicação do desenho, sem decisão nova. A tela "Qualidade da IA" tem um link para este ADR no topo.

- **A altura não é a confiança da IA nem a chance de ela errar.** É a faixa lida convertida em preço: LATERAL vai de
  −T1 a +T1 a partir da base, LEVE de T1 a T2, FORTE de T2 para cima (desenhada com a altura de uma LEVE e uma seta).
  A IA escolhe a faixa; o tamanho dela vem de T1 e T2, que são fixos por horizonte e gravados com cada leitura.
- **T1 e T2 crescem com o horizonte porque o preço anda mais em prazos longos.** Eles são os percentis 40 e 80 da
  variação absoluta do próprio preço avaliado, em 1, 7, 30 e 90 dias, medidos no histórico da base. Num passeio
  aleatório, a oscilação cresce mais ou menos com a raiz do tempo (√90 ≈ 9,5), e os números seguem essa regra (a
  tabela abaixo). Uma alta "leve" em 90 dias é um movimento bem maior que uma alta "leve" amanhã.

| Ativo | T1 / T2 em 1 dia | × √90 (o que a regra prevê) | T1 / T2 reais em 90 dias |
|---|---|---|---|
| Petróleo | 0,8 / 2,3% | 7,6 / 21,8% | 6 / 19% |
| Ouro | 0,4 / 1,2% | 3,8 / 11,4% | 4 / 10% |
| Milho | 0,3 / 1,0% | 2,8 / 9,5% | 3 / 8% |
| Café | 1,0 / 2,7% | 9,5 / 25,6% | 11 / 25% |

Os valores são os da configuração em 2026-10-07; numa recalibração, vale a configuração, não esta tabela. No petróleo
e no milho, o valor real em 90 dias fica um pouco abaixo do previsto, o que é comum quando o preço tende a voltar à
média; isso não foi medido.

- **A calibração deixa a dificuldade parecida em todos os horizontes.** Por construção, cerca de 40% dos casos
  históricos caem em LATERAL, 40% em LEVE e 20% em FORTE, em qualquer prazo. Se a faixa de 90 dias tivesse a altura da
  de 1 dia, quase tudo cairia em FORTE. Se a IA acerta mais ou menos num horizonte, isso está nos cards (contra os
  benchmarks), não na altura da barra.
- **De onde vêm os números** (série, período e valores de cada ativo): petróleo, ADR 0052 (adendo); ouro, ADR 0054;
  milho, ADR 0058 (adendo); café, ADR 0062. A escolha das faixas calibradas, e não de classes fixas iguais em todos os
  prazos, está no ADR 0079. Os valores ficam na configuração de cada ativo (`backend/src/shared/analise-diaria-<ativo>.js`).
- **Recalibração:** quando a volatilidade do ativo mudar de patamar ou o preço avaliado mudar (como o milho, do ESALQ
  para o CCM, e o petróleo, do Brent à vista para o futuro), não de rotina; é manual, numa versão nova da configuração.
  Não mexe no placar contra os benchmarks: eles usam o mesmo T1/T2 de cada leitura, e as leituras antigas continuam
  medidas pela régua gravada com elas (§8). O milho e o café têm histórico curto (desde 2022), então as faixas deles são
  as mais sujeitas a recalibrar.

## Consequências

- A tela "Qualidade da IA" (`/qualidade-ia`) mostra, por ativo, os quatro horizontes com as três medidas da IA e dos
  dois benchmarks, a cobertura e as linhas fora da métrica por motivo, e a lista das linhas de cada número.
- O horizonte de 1 dia das leituras de sexta é sempre `SEM_PREGAO` (a data-alvo cai no sábado).
- O horizonte de 90 dias dos três futuros fica `SEM_PRECO` por construção: o contrato da leitura vence antes da
  data-alvo. Até a decisão dos vencimentos por horizonte (`STATUS_DO_PROJETO.md`, §1), essa coluna praticamente só
  terá número no petróleo.
- **Fora desta versão** (evolução futura): a calibração da confiança, a taxa de inversão (ALTA lida, BAIXA realizada),
  um índice único, o melhor e o pior horizonte, a comparação entre meses, a matriz de confusão, qualquer análise
  estatística (independência das janelas sobrepostas, significância) e a gravação dos resultados.
