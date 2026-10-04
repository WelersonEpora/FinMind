# 0050 — Proposta de metodologia dos fatores do petróleo, para o David validar

**Status:** aceita (2026-10-02). Em 2026-10-03 o David aprovou em reunião as decisões tomadas para os fatores (as
respostas por escrito virão depois), e a proposta passou a alimentar a IA e o Centro de Decisão do petróleo (ADR 0052).

## Contexto

Com a aquisição de dados encerrada (`STATUS_DO_PROJETO.md`, §1), o que falta em cada fator não é fonte: é a forma de
medir e de ler. O FEL 1 dá, para cada um dos 10 fatores do petróleo, o tipo, a direção do impacto, o mecanismo de
transmissão, o peso e a fonte (tabela "Fatores de Influência de Preço: Petróleo"), mas não diz como medir.

O projeto já propõe a camada A (a medida) ao Comitê: o milho na §5 e o ouro na §5b do status. Em 2026-10-02 o usuário
(Welerson) pediu ao GitHub Copilot um primeiro desenho dos fatores do petróleo: uma tela "Metodologia do Ativo" e um
catálogo com objetivo, indicadores, referências, interações e uma "decisão adotada" por fator. A revisão achou três
problemas: o rascunho aparecia como decisão (ex.: "estoque contra a média móvel de 5 semanas" no fator de estoques,
que não está no FEL 1); um service derivava a direção da geopolítica dos eventos da IA ("alta" se algum evento tivesse
pressão alta), uma regra de sinal; e o que o David escreveu (direção, mecanismo, fonte) ficava de fora.

**Decisão do usuário (Welerson, 2026-10-02):** seguir na direção dos fatores mesmo assim, como proposta, porque o
David provavelmente tem a mesma dúvida e um caminho concreto (que pode estar errado) é mais fácil de ajustar do que
uma folha em branco. **Limite:** proposta de metodologia para o David validar; não é regra, não alimenta o motor, o
Centro de Decisão nem a IA e não gera sinal.

## Decisão

1. **Um catálogo por ativo, com a origem de cada item** (`backend/src/shared/metodologia-petroleo.js`):
   - `fel1`: o que o David escreveu (tipo, direção, mecanismo, fonte), copiado da tabela do FEL 1 v1.1 sem reescrever;
     nome e peso vêm de `fatores-fel1.js`;
   - `dados`: os cards do catálogo de observáveis que já atendem o fator, se os eventos de mercado atendem, e as
     lacunas conhecidas (fato, não proposta);
   - `proposta`: as três camadas do motor (§5 do status): a medida (A), a comparação (B) e um esboço da leitura (C),
     com `situacao: "PROPOSTA"`. Vira `"VALIDADA"` só quando o David confirmar, com a data registrada aqui;
   - `perguntas`: o que o David precisa decidir para a proposta virar regra.
2. **API** `GET /api/v1/ativos/:ativo/metodologia` (autenticada), resposta `{ ativo, ativos, metodologia }`: os 4 ativos
   do FEL 1 com `disponivel`, e `metodologia` nula para um ativo ainda sem metodologia; ativo fora do FEL 1 dá 404.
   A tela segue o desenho do Centro de Decisão (ADR 0048): título genérico, um card de contexto com o seletor de
   ativo e, depois, os cards dos fatores. **Tela** `/dados-mercado/metodologia/:ativo` ("Metodologia do Ativo" no menu de Dados de Mercado), com um aviso
   fixo de que é proposta e cada bloco rotulado pela origem; o bloco da proposta tem moldura tracejada.
3. **Sai** o service que derivava a direção da geopolítica dos eventos da IA (`petroleo-fatores.service.js`) e a
   "decisão adotada": a direção de um fator é camada C, e o Comitê a decide. O FinMind a **simula** (item 6), com
   parâmetros explícitos.
4. **Por que em `shared/` e não em `factors/`:** `factors/` guarda funções determinísticas e versionadas sobre a
   `observation` (ADR 0008, como o juro real de 10 anos). O catálogo é texto. Quando uma medida proposta for calculada
   (ex.: o estoque contra a média de 5 anos), ela entra em `factors/` nesse molde, sem ser gravada e sem alimentar
   nada até ser validada.
5. **Piloto calculado: estoques EIA** (`factors/estoques-petroleo-eia.factor.js`, versão 1), para o David ver a
   proposta no histórico e não só em texto. Camadas A e B: o estoque de petróleo sem a SPR, a variação contra a
   semana anterior, a média da mesma semana nos 5 anos anteriores (52, 104, ... 260 semanas antes; nula se faltar
   uma) e o desvio contra ela. O preço não entra: o fator mostra só o que está na conta
   dele (decisão do usuário, 2026-10-02; o preço é confrontado com todos os fatores na análise final). Point-in-time
   pelo `obterAsOf`, nunca gravado. API `GET /api/v1/ativos/:ativo/metodologia/fatores/:fator/calculo?desde=`
   (`{ calculo }`, com `situacao`, `periodicidade: "SEMANAL"` e `tempoReal: false`); na tela, dentro do fator,
   com o resumo da última semana marcado pelas camadas (A. Medir, B. Ler) e o gráfico do estoque contra a média.
   Conferido no banco de dev: em
   jun/2020 o estoque estava 15% acima da média (WTI a US$ 38); em jun/2022, 12,5% abaixo (WTI a US$ 109). Os outros
   fatores só ganham cálculo depois de o David reagir a este.
6. **O dado basta? Avaliado fator a fator, com o histórico** (`dados.avaliacao`). O FEL 1 foi escrito com apoio de
   IA, e o usuário (2026-10-02) pediu para verificar se cada fator pode ser medido com o que já temos, sem atender
   necessariamente todos os requisitos do FEL 1. **Estoques EIA: basta.** No banco de dev, de 2010 em diante, o desvio
   do estoque contra a média de 5 anos tem correlação de -0,55 com o nível do WTI (estoque abaixo do normal, preço
   alto). O que o dado não dá é a reação do dia da divulgação: medida no dia estimado da publicação, nem a variação
   semanal nem a variação contra a típica da semana acompanham o WTI (correlações entre -0,05 e +0,04; preço no
   sentido esperado em 55% das 678 semanas com variação acima de 4 milhões de barris desde 1987), porque o mercado
   reage à previsão dos analistas, que é paga. O desvio também não prevê sozinho o WTI das 4 semanas seguintes. A
   reação do dia não é o horizonte do FinMind, então a previsão dos analistas e o API ficam como lacunas sem custo.
   Por isso a "surpresa contra a variação típica" não entrou no piloto. Ressalva: de 1987 em diante, a correlação com
   o nível do WTI some (+0,09), porque a relação muda com o regime de preço (antes e depois do shale).
7. **Camada C simulada, com parâmetros que o Comitê ajusta** (decisão do usuário, 2026-10-02: "estamos tentando
   simular o fator para mostrar como vai ficar"). No fator de estoques: a **direção** (pressão de alta, de baixa ou
   neutra) pelo desvio contra a média de 5 anos, com uma faixa neutra; a **intensidade** (fraca, moderada, forte)
   por um segundo limiar; a **tendência** (apertando, afrouxando, estável) pela mudança do desvio numa janela de
   semanas. O **peso** não é calculado: é o do FEL 1. Padrões do FinMind: faixa neutra de 3%, forte a partir de 10%,
   janela de 4 semanas e mudança mínima de 2 p.p., tirados da distribuição do desvio de 1987 a 2026 (mediana de
   ~5,5%, 3º quartil de ~10%; a mudança em 4 semanas tem mediana de ~1,9 p.p.). Os parâmetros são editáveis na tela
   e vão na query da API (validados; a resposta traz os em uso e os padrões); a regra roda só no backend
   (`decidirEstoques`), e os exemplos (4 semanas reais e 5 cenários hipotéticos) usam a mesma regra. Fica num card
   próprio, "C. Decidir", com a decisão da semana explicada passo a passo e o gráfico do desvio com as faixas. A
   direção simulada **não sai da tela de metodologia**: não alimenta o motor, o Centro de Decisão nem a IA.
8. **Os parâmetros em uso no sistema ficam no banco, ajustáveis na tela** (decisão do usuário, 2026-10-02: "estes
   são os valores usados no sistema, e o usuário pode ajustá-los aqui mesmo"). Tabela `fator_parametro_versao`
   (GLOBAL, ADR 0007): cada ajuste é uma **versão nova**, nunca um UPDATE, com os parâmetros completos, o motivo
   (obrigatório) e quem salvou. Sem versão gravada, valem os padrões do código (item 7). A versão vigente é a de
   número maior; o histórico guarda o que valia em cada data, para um backtest futuro usar os parâmetros da época.
   Na tela, duas ações separadas: **Simular** (qualquer usuário, só na tela, nada gravado) e **Salvar como valores
   do sistema** (só o admin da plataforma, como a coleta manual; quando existir um papel do Comitê, passa a ser
   dele), com o motivo. A tela mostra de onde vêm os valores ("Versão 2, salva por ... em ...", ou "Padrão do
   FinMind") e o histórico das versões. API: `GET` e `POST /api/v1/ativos/:ativo/metodologia/fatores/:fator/parametros`
   (o POST com `requireRole("admin")`; parâmetros incompletos, inválidos ou iguais aos em uso e motivo curto dão
   400; dois salvamentos simultâneos, 409 pelo índice único de fator e versão). O cálculo
   (`.../calculo`) usa os valores do sistema e aceita outros na query só para simular (`simulacao: true`). Quando
   o motor existir, ele lê os parâmetros desta tabela.
9. **Segundo fator calculado: produção dos EUA, e a tela genérica** (2026-10-03). O dado da EIA basta: de 2010 em
   diante, o crescimento anual da produção tem correlação de -0,39 com o WTI 26 semanas depois (-0,22 em 13; -0,19
   desde 1990), a direção do FEL 1, e o preço não aparece puxando a produção no mesmo período. A semana isolada é
   estimativa arredondada da EIA (desde 2023, metade das semanas é múltiplo de 100 mil barris/dia), por isso a
   medida é a média de 4 semanas e o crescimento contra as mesmas 4 semanas do ano anterior, mais a distância do
   recorde. O rig count, também no FEL 1, não é coletado: antecipa a produção, mas não é necessário para medi-la.
   Padrões: faixa neutra de 3%, forte a partir de 10%, janela de 13 semanas (a produção muda devagar) e mudança
   mínima de 2 p.p. (mediana de ~2,1 a 2,5 p.p. em 13 semanas). Com o 2º fator, a camada C virou um núcleo comum,
   `factors/base/decisao-por-faixa.js` (decisão, explicação passo a passo e exemplos), e cada fator exporta uma
   `METODOLOGIA` (cálculo, explicação, exemplos, parâmetros padrão e a `apresentacao`: quadros, gráficos, rótulos e
   parâmetros). A tela (`CalculoFator.vue` e `DecisaoFator.vue`) não conhece nenhum fator: desenha a apresentação,
   e a explicação vem pronta do backend. Um fator novo é um módulo em `factors/` e uma linha no service; um teste
   de contrato confere que todo campo citado pela apresentação existe nos pontos calculados.
10. **Terceiro fator calculado: demanda, só dos EUA** (2026-10-03). O consumo semanal dos EUA (derivados fornecidos,
    EIA, desde 1990) anda junto com o preço (+0,28 com a variação do WTI dos 6 meses anteriores, desde 2010), mas
    não o antecipa (perto de zero com o WTI 13 ou 26 semanas depois): os dois seguem a economia, e o fator mede a
    situação. A China, que o FEL 1 cita, ficou de fora **por decisão do usuário**: no JODI ela é "não avaliada" pelo
    próprio JODI e caiu ~30% de mar a jun/2026 (de ~17.500 para ~11.700 mil barris/dia) sem explicação; fica como
    lacuna e pergunta ao David. Medida e comparação iguais às da produção (média de 4 semanas contra as mesmas 4
    do ano anterior), agora num núcleo comum, `factors/base/crescimento-anual-semanal.js`, usado pelos dois. A
    decisão por faixa ganhou o **sentido** (`acimaPressiona`): na demanda, crescer acima da faixa é pressão de
    ALTA, o inverso dos fatores de oferta. Padrões: faixa de 2%, forte a partir de 5% (percentis ~50 e 80 desde
    2010), 13 semanas e 2,5 p.p.
11. **Quarto fator calculado: refino** (2026-10-03). A margem de refino não é publicada pela EIA: o FinMind calcula o
    crack 3-2-1 com os preços à vista que já coleta, [(2 × gasolina + 1 × diesel) × 42 − 3 × Brent] ÷ 3, em US$ por
    barril, na média dos dias da semana. Contra o **Brent**, e não o WTI: os derivados de Nova York são precificados
    contra o Brent, e em 2011-2013 o WTI ficou até US$ 20 abaixo dele, o que inflava o crack com WTI (US$ 47 em 2012
    contra US$ 29 com o Brent). Desde 2006 (o diesel S10); a média de 5 anos, desde 2011. O desvio contra a média da
    mesma semana é em **US$ por barril**, não em %: a média chega a US$ 7 e o desvio em % explodia (+247% em 2012).
    No histórico, a margem acima do normal anda com refinarias mais cheias (+0,25 com a utilização), o mecanismo do
    FEL 1, mas não antecipa o preço do petróleo. Padrões: faixa de US$ 3, forte a partir de US$ 10, 4 semanas e
    US$ 3 (percentis ~40 e ~80 do |desvio| e a mediana da mudança em 4 semanas). Hoje a margem está extrema
    (US$ 52,5 contra US$ 23,4 de média), como na crise do diesel de 2022: a leitura disso é pergunta ao David. Com o
    4º fator, a média da mesma semana em 5 anos virou o núcleo `factors/base/mesma-semana-5-anos.js` (estoques e
    refino), e a decisão por faixa aceita a unidade da medida (% ou US$/barril) na explicação, nos parâmetros e no
    gráfico; as chaves dos parâmetros continuam terminando em "Pct" e "Pp" (são as das versões já gravadas).
12. **Quinto fator calculado: dólar** (2026-10-03). O índice do Fed contra as moedas das economias avançadas
    (DTWEXAFEGS), o mais próximo do DXY que o FEL 1 cita (o DXY da ICE é licenciado), na média da semana, contra a
    média das 52 semanas anteriores (o normal recente). É o fator com a relação mais forte com o preço: o desvio tem
    -0,56 com a variação do WTI dos 6 meses anteriores e -0,37 com o WTI 26 semanas depois, desde 2015 (o índice
    amplo, também coletado, anda ainda mais junto, -0,63, mas antecipa um pouco menos: pergunta ao David). Dólar
    acima do normal é pressão de baixa. Padrões: faixa de 2%, forte a partir de 5%, 4 semanas e 1,5 p.p. A média
    semanal de uma série diária (sábado a sexta) virou o núcleo `factors/base/semana-de-dias.js`, usado pelo
    refino e pelo dólar.
13. **Sexto fator calculado: fundos (COT)** (2026-10-03). A posição líquida dos fundos (managed money) no WTI, em %
    dos contratos em aberto (o mercado cresceu muito desde 2006), e o percentil dela nas 156 semanas (3 anos)
    anteriores; a medida da decisão é a **posição relativa**, o percentil menos 50 (de -50 a +50), e a semana é a
    terça da posição. O FEL 1 só diz que o fator "amplifica"; a proposta lê o **extremo como risco de reversão**
    (muito comprados = pressão de baixa), e o histórico sustenta isso, não a leitura de seguir os fundos: a posição
    segue o preço (+0,2 com o WTI das 13 a 26 semanas anteriores), e com os fundos entre os 10% mais vendidos o WTI
    subiu em 74% dos casos 26 semanas depois (média +12%), contra 44% (média -1%) entre os 10% mais comprados. É o
    primeiro fator sem direção própria no FEL 1: cabe na decisão por faixa sem mudar a tela, e a leitura é pergunta
    ao David. Padrões: faixa de 30 pontos (percentis 20 a 80), forte a partir de 40 (10 e 90), 4 semanas e 15 pontos
    (mediana da mudança em 4 semanas, ~11). O mesmo molde serve ao COT do ouro, do milho e do café.
14. **Sétimo fator calculado: juros** (2026-10-03). A proposta citava a meta do Fed, mas no histórico (2010 a 2026)
    ela só se relaciona com o preço por causa da pandemia: sem 2019 a 2021, a correlação com o WTI 26 ou 52
    semanas depois fica perto de zero. A medida passou a ser o **Treasury de 10 anos**, que embute a expectativa do
    mercado para o Fed (os futuros de Fed Funds não são coletados): a variação em 26 semanas, em p.p., tem -0,17 com
    o WTI 26 semanas depois (-0,29 sem a pandemia), e com o juro subindo 1 p.p. ou mais no ano o WTI caiu em 76% dos
    casos nas 26 semanas seguintes. A meta e o ciclo do Fed (variação em 52 semanas) ficam como contexto. Juro
    subindo é pressão de baixa, a direção do FEL 1. Padrões: faixa de 0,5 p.p., forte a partir de 1 p.p. (percentis
    ~60 e acima de 80), 4 semanas e 0,25 p.p. (mediana ~0,19). Com ele, a explicação da decisão por faixa mostra o
    limiar com duas casas quando ele tem (0,25 não vira "0,3").
15. **Oitavo fator calculado: oferta não-OPEP, o primeiro mensal** (2026-10-03). A produção somada de Brasil (ANP,
    m³ por UF, convertida em mil barris/dia: × 6,28981 ÷ dias do mês ÷ 1.000), Noruega e Canadá (JODI), na média de 3
    meses, contra os mesmos 3 meses do ano anterior. **Por decisão do usuário:** os EUA ficaram de fora (já são o
    fator de produção dos EUA; contariam duas vezes) e o Canadá entrou, embora fora do FEL 1 (4º produtor do mundo,
    dado completo no JODI). A Guiana não reporta a nenhuma fonte coletada. O mês só entra com os três países. No
    histórico (2010 a 2026), o crescimento destes três não antecipa o preço (perto de zero com o WTI 6 e 12 meses
    depois, contando os ~2 meses até a divulgação): mede a situação, como a demanda; a relação aparece nos EUA. Como
    a oferta deles cresceu quase sempre (pré-sal, areias betuminosas), o fator fica em pressão de baixa em cerca de
    metade dos meses. Padrões: faixa de 3%, forte a partir de 7% (percentis ~40 e ~80), 3 meses e 2 p.p. (mediana
    ~1,9). Com ele, a decisão por faixa e a tela aceitam um fator mensal: a janela da tendência é em meses (a chave
    continua `semanasTendencia`, a das versões gravadas) e os textos de período ("Mês de 07/2026", "meses antes")
    seguem a `periodicidade` do cálculo.
16. **OPEP+ e geopolítica: fatores de evento, sem cálculo** (2026-10-03, decisão do usuário). Os dois não têm o
    que medir: o resultado deles é o que vem da leitura diária de eventos (ADRs 0047 e 0049), repassado à IA do ativo
    com pouco tratamento. A produção da OPEP+ não serve: o JODI perdeu os Emirados e o Irã (2018), a Rússia (2023) e
    o Iraque (2024), e as cotas não são coletadas. **Sem mudar o prompt**, o fator lê os eventos de outro jeito: os
    aceitos marcados com ele (`PETROLEO_OPEP`, `PETROLEO_GEOPOLITICA`) numa **janela de dias** (45 na OPEP+, cujos
    oito países dos cortes voluntários se reúnem todo mês; 7 na geopolítica — ajustado de 30 para 7 em 2026-10-04, David:
    eventos geopolíticos recorrentes em dias consecutivos são desdobramentos do mesmo fato, não acúmulo independente),
    e não só os do dia. A janela é a memória
    do que segue valendo (a decisão do mês passado), porque a leitura diária só registra o fato novo das 24 a 48
    horas e o evento não diz até quando vale. Cada evento vai com a data da leitura que o registrou e a idade em dias
    (a data exata do fato, quando a fonte a dá, está no resumo), o tipo, o canal, a pressão (leitura da IA), a
    intensidade, a confiança e a página da fonte; o bloco abre com o nível e o resumo do ativo na leitura mais recente
    e lista os dias sem leitura (sem informação, não calmaria). `geopolitica.service.js::obterEventosDoFator` monta o
    bloco; a tela mostra os eventos e o texto exato do prompt (`GET /ativos/:ativo/metodologia/fatores/:fator/eventos`).
    Limites conhecidos: a reunião da OPEP+ que só mantém as cotas pode não virar evento (o tipo "Política de oferta"
    pede decisão extraordinária); o mesmo fato pode reaparecer em dias seguintes como desdobramento. Se a falta da
    data exata ou da vigência atrapalhar, muda-se o prompt (campos de data do fato e vigência).
17. **O texto de cada fator para o prompt** (2026-10-03, decisão do usuário). Os fatores não decidem: são subsídio
    para uma IA que lê os 10 juntos e tenta entender a tendência no curto, médio e longo prazo. Cada fator calculado
    entrega um bloco de texto, montado por uma função genérica (`factors/base/texto-prompt.js`) a partir do que ele já
    declara: o período do ponto (semana ou mês, não é tempo real) e quatro partes, sempre nesta ordem. **A — Medida**
    (os dados observados e as variações); **B — Leitura** (a referência, a comparação e a regra aplicada, com a origem
    dos parâmetros: padrão, versão salva ou simulação, porque a margem até o limiar importa); **C — Leitura do fator**
    (pressão alta, baixa ou neutra, intensidade e tendência: "leitura", e não "decisão sugerida", para não transmitir
    ideia de recomendação operacional); **D — Validação histórica** (a relação com o preço no histórico, a avaliação
    do dado do catálogo), separada de propósito: contextualiza a qualidade da relação e não entra na leitura atual. O
    texto não diz que os parâmetros não foram validados: a tela inteira já diz que tudo é proposta. A tela mostra o
    mesmo texto ("Texto exato que vai ao prompt"), como nos fatores de evento: o que se vê é o que a IA recebe.
    **O título diz o dado usado** (decisão do usuário): quando o dado é mais estreito que o nome do FEL 1, o fator
    ganha um título próprio (`nome` no catálogo) e o nome do FEL 1 fica no bloco do especialista na tela
    (`nomeFel1`): "Oferta não-OPEP (Brasil, Noruega e Canadá)" (o FEL 1 diz Brasil, Guiana e Noruega; a Guiana não
    reporta e não entra no cálculo), "Demanda dos EUA (consumo de derivados)" (FEL 1: demanda global), "Dólar (índice
    do Fed contra as economias avançadas)" (FEL 1: DXY, licenciado) e "Produção dos EUA" (FEL 1: com o rig count, não
    coletado). O cálculo não muda.
18. **Simulação numa data** (2026-10-03, decisão do usuário). A tela escolhe uma data e mostra, em cada card, o que
    o fator mostraria com o que se sabia até o fim dela, e o bloco dos fatores completo (os 10 textos, na ordem do
    catálogo, com um cabeçalho) que iria ao prompt da IA do ativo (`GET /ativos/:ativo/metodologia/simulacao?data=`).
    Os fatores calculados usam a camada point-in-time com `asOf` no fim do dia em São Paulo (-03:00; nos verões com
    horário de verão, até 2019, a diferença é de uma hora); os de evento, a janela até a data. O cálculo e os eventos de
    um fator também aceitam `data`, e o modal de detalhes segue a data simulada. Os parâmetros da camada C são os em uso
    hoje (usar a versão que valia na data é possível, mas fica para depois). Data no futuro: 400. Limites do próprio
    dado: o histórico do JODI tem a data da 1ª coleta como publicação (limite superior, ADR 0042), então numa data
    antiga a oferta não-OPEP fica sem dado; a leitura diária de eventos começa em 2026-10-02. É a base para, no futuro,
    testar o prompt contra o histórico.
19. **`CLAUDE.md`:** a restrição "nunca invente cálculo de mercado" ganha uma exceção explícita para propostas assim
   marcadas.

## Consequências

- O David recebe, por fator, o que ele escreveu, os dados disponíveis, um rascunho e as perguntas, numa tela só.
- O risco é a proposta ser lida como regra, e a direção simulada como sinal. As defesas: o rótulo "Proposta,
  aguardando o David" em cada fator, o aviso fixo na tela, o card da camada C rotulado como simulação e com os
  parâmetros à vista, nenhum consumidor no motor ou na IA e um teste que barra uma proposta sair como validada sem
  mudar o teste.
- Algumas medidas propostas dependem de dado que não é coletado (consenso de analistas, rig count, cotas da OPEP+):
  as lacunas ficam visíveis em cada fator, e fonte nova continua exigindo demanda específica e autorização (§1 do
  status).
- Os outros ativos podem seguir o mesmo molde, um arquivo por ativo registrado em `metodologia-ativo.service.js`.
