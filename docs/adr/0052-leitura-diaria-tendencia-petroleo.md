# 0052 — Leitura diária de tendência do petróleo pela IA, no Centro de Decisão

**Status:** aceita (2026-10-03).

## Contexto

O prompt diário de análise do petróleo (ADR 0051) junta os 10 fatores e o WTI à vista numa data para a IA ler a
tendência em quatro horizontes (1, 7, 30 e 90 dias). Ele era só gerado e mostrado: o `CLAUDE.md` e o ADR 0050 não
deixavam as propostas de fator alimentarem o motor, o Centro de Decisão nem a IA.

**Autorização (Welerson, 2026-10-03):** em reunião no mesmo dia, o **David aprovou as decisões tomadas para os fatores
do petróleo** (ADRs 0050 e 0051) e pediu o mesmo tratamento para os fatores do ouro; ele termina os do milho e depois
faz os do café, e vai mandar as respostas por escrito. Com isso, o usuário autorizou seguir com a implementação do
petróleo: a coleta diária que envia o prompt à IA e a leitura no Centro de Decisão. O limite: **só o petróleo**, e
**leitura de tendência, não recomendação** (nada de comprar, vender ou equivalente). Os outros ativos continuam como
estavam.

## Decisão

1. **Uma chamada diária ao Gemini, sem busca na web e com a resposta em JSON** (`ai/gemini-search.provider.js::gerarJson`),
   com as mesmas duas chaves da leitura de eventos (a gratuita primeiro, a paga como reserva). A IA só interpreta a BASE
   e a leitura do motor que o prompt traz; não pesquisa. O JSON com a busca era o problema no AgroMind (ADR 0047); sem
   a busca, não é.
2. **No pipeline de coleta**, como a leitura de eventos: o coletor `petroleo-analise-ia-diario`
   (`collectors/analise/analise-diaria-ia.collector.js`) monta o prompt do dia (`prompt-diario.service.js`, o mesmo da
   tela) e é registrado **por último**, para usar a base do dia já coletada, inclusive a leitura de eventos. Tem
   registro de execução, roda no mesmo cron e aparece na tela Execuções (modelo, chave, tokens, versões, respostas
   recusadas). **Uma leitura por dia**, a primeira que der certo; as execuções seguintes pulam a chamada.
   `ANALISE_DIARIA_REFAZER=1` troca a do dia.
3. **Validação determinística da resposta** (`shared/resposta-analise-diaria-petroleo.js`): as quatro leituras na ordem
   dos horizontes; tendência, faixa e confiança nas escalas do formato; a faixa coerente com a tendência; com
   INSUFICIENTE, faixa e confiança nulas e ao menos uma lacuna; o código de cada fator citado entre os do prompt; cada
   evidência citada existente; tese e condição de invalidação preenchidas. Resposta recusada: **uma** nova chamada;
   recusada de novo, **nada é gravado** e a execução falha com os motivos. A tela nunca mostra uma leitura fora do
   formato.
4. **Gravação de cada leitura** (tabela `analise_diaria`, GLOBAL, uma por ativo e dia): as versões do prompt, da
   metodologia e da configuração, o hash da entrada, a entrada estruturada, a instrução e o prompt enviados, a resposta
   bruta, as quatro leituras validadas, o modelo, os tokens e a chave. É o que o ADR 0010 pede para reconstituir o que
   a IA recebeu e respondeu, e a base para comparar depois a leitura com o realizado (direção e faixa, com
   `classificarVariacao`).
5. **No Centro de Decisão do petróleo**, o espaço "Análise do FinMind" mostra a leitura **feita na data escolhida**
   (nunca a de outro dia no lugar): os quatro horizontes, cada um com tendência, faixa (com o intervalo em %, das faixas
   gravadas com a leitura), confiança e tese, e o detalhe num modal (forças, fatores a favor e contra, COT, evidências,
   lacunas, argumento contra e o que invalida a leitura). O rodapé diz que é leitura de tendência, não recomendação, e
   traz o modelo, as versões e o hash. Os quatro horizontes ficam numa linha própria, em linha do tempo; ao lado do
   preço, o card **"Evidências analisadas pelo FinMind"** resume o que formou o prompt (o preço de referência com as
   variações, cada fator com a leitura do motor ou os eventos, e as lacunas), com a tabela completa em "Ver detalhes" e,
   em "Ver prompt enviado", a instrução, o prompt e a resposta da IA como ficaram gravados
   (`GET /api/v1/centro-decisao/analise?ativo=&data=`, só ao abrir). Tudo sai da leitura gravada, nunca recalculado:
   um parâmetro alterado depois não muda o que a tela diz que a IA recebeu. Os outros ativos continuam com o espaço
   reservado.

## Consequências

- O petróleo tem a cadeia completa rodando todo dia: coleta → fatores (A, B, C) → prompt → IA → leitura no Centro de
  Decisão. A primeira leitura (2026-10-03, em dev) passou na validação de primeira, com ~27,5 mil tokens.
- **Os parâmetros dos fatores e as faixas continuam provisórios** (ADRs 0050 e 0051): a aprovação do David foi das
  decisões; os valores ainda podem mudar com as respostas por escrito, e cada mudança é versão nova, gravada com a
  leitura do dia. Os fatores continuam marcados como proposta no código até as respostas chegarem.
- A leitura só existe da primeira execução em diante: não há leitura retroativa (a tela diz "sem leitura" nas datas
  anteriores). Gerar leituras do passado com o prompt point-in-time seria possível, mas não foi pedido.
- Custo: uma chamada por dia (duas, se a primeira for recusada), ~27,5 mil tokens.
- O horizonte de 1 dia continua limitado pelo preço semanal da EIA (ADR 0051): a IA sabe disso pela data do último
  preço e tende a dar confiança baixa a ele. Desde o adendo abaixo, ele conta da data da análise e não cai mais num dia
  que já passou.

## Não implementado (de propósito)

Recomendação de compra ou venda; síntese entre horizontes; comparação automática com o realizado e métrica de acerto
(a estrutura existe, a avaliação é do Comitê); leitura retroativa; o mesmo para o ouro, o milho e o café (o ouro é o
próximo, a pedido do David).

## Adendo (2026-10-03): os horizontes contam da data da análise

**Contexto.** A primeira leitura em produção (2026-10-03) contou os horizontes de 29/09, o último preço do WTI na base
(a EIA publica uma vez por semana), como o ADR 0051 tinha decidido. Mas a leitura já usava eventos de 01 e 02/10: o
horizonte de 1 dia caía em 30/09, um dia que já tinha passado, lido com notícias posteriores a ele, e na comparação
com o realizado o preço de uma data seria medido contra a informação de outra. O usuário decidiu trocar a referência
(2026-10-03). A mudança é de como a leitura é contada, não de estratégia, e vai ao David junto com as respostas por
escrito.

**Decisão.**

1. Os horizontes contam da **data da análise** (`shared/analise-diaria-petroleo.js::REFERENCIA_HORIZONTES =
   "DATA_DA_ANALISE"`, configuração v2). A faixa é a variação do WTI entre a data da análise e o fim do horizonte; o
   preço de cada data é o do último pregão até ela (conhecido depois, na comparação com o realizado).
2. O prompt (v2) diz que o preço entre o último pregão da base e a data da análise **não está na base e é
   desconhecido**, e que a IA não o estima; eventos posteriores ao último preço podem já ter movido o preço nesse
   intervalo, e isso entra na confiança.
3. Cada leitura guarda a referência na entrada (`referenciaHorizontes`), e a tela mostra a de cada leitura como foi
   gravada: a de 2026-10-03, feita com a v1, continua dizendo que conta de 29/09 até ser refeita
   (`ANALISE_DIARIA_REFAZER=1`).
