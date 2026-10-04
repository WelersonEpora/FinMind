# 0056 — Metodologia dos fatores do milho: a proposta v0 do David na tela, com o fator de estoques calculado

**Status:** aceita (2026-10-04).

## Contexto

O David mandou, junto com as respostas ao FEL 1 (ADR 0055), o "Motor do Milho — Tabelas por Fator", versão 0, de
2026-10-02. Para cada um dos 8 fatores, o documento traz:

- a coleta e as camadas A, B e C;
- uma regra de alta e uma de baixa (R-CLI-01 v0 etc.);
- o peso por mês e as correlações com os outros fatores;
- ao fim, uma matriz de correlação, as regras de agregação e um prompt para a IA.

É proposta para deliberação do Comitê, com limiares e pesos ilustrativos.

**Decisão do usuário (Welerson, 2026-10-04):** com as respostas do David registradas, seguir para o milho como no
petróleo (ADR 0050) e no ouro (ADR 0053): a metodologia na tela, com a proposta v0 do David, calculando os fatores
um a um. **Limite:** o milho não vai ao prompt diário, à IA nem ao Centro de Decisão até a aprovação do Comitê, como
foi no petróleo (ADR 0052) e no ouro (ADR 0054). Nada gera sinal de compra ou venda.

## Decisão

1. **Os 8 fatores do milho** (`shared/metodologia-milho.js`), no formato de `metodologia-base.js`:
   - a tabela "Fatores de Influência de Preço: Milho" do FEL 1 v1.1, copiada sem reescrever;
   - os cards que já atendem cada fator e as lacunas;
   - a proposta nas três camadas;
   - as perguntas de cada fator;
   - a parte do ativo (`doAtivo`, ADR 0050, adendo).
2. **A proposta é do David, não do FinMind.** Dois campos opcionais novos em `proposta`:
   - `autoria`: "David, Motor do Milho v0";
   - `regrasEspecialista` ({ alta, baixa }): as regras como ele escreveu.

   O modal mostra os dois, e a situação passa a "Proposta do especialista, aguardando o Comitê". O resumo das camadas A, B
   e C condensa o documento dele. O que o FinMind acrescenta para o cálculo fica dito na leitura.
3. **Leitura de todas as edições** (`point-in-time.service.js::obterVersoesAsOf`, `observation.repository.js::
   buscarVersoesAsOf`). Devolve todas as versões publicadas até uma data, não só a vigente. Um fator de revisão
   reconstrói o que cada edição dizia: como a `observation` só grava quando o valor muda, o que uma edição disse de uma
   série é a última versão até ela. Serve também à safrinha (F2), que lê as revisões da Conab.
4. **F3, estoques e balanço (WASDE), calculado** (`factors/estoques-milho-wasde.factor.js`, versão 1), um ponto por
   edição do WASDE:
   - **A.** O estoque/uso da safra mais nova da edição (estoque final ÷ uso total), dos EUA. O mundo e o mundo menos a
     China vão como contexto, com o uso = consumo + exportação − importação.
   - **B.** O percentil contra as 10 safras anteriores, como a edição as conhecia. A posição (percentil − 50, em
     pontos) é a medida da faixa. A revisão do estoque final dos EUA é contra a edição anterior.
   - **C.** A R-EST v0 do David, com os limiares dele: o P25/P75 (posição 25) e a revisão de 3%. O nível passa pela
     decisão por faixa; a revisão é a segunda condição.
   - **Acréscimos do FinMind, ajustáveis pelo Comitê:**
     - nível e revisão opostos dão neutra;
     - forte com os dois no mesmo sentido ou no P10/P90;
     - tendência pela posição de 3 edições antes (20 pontos).
   - A segunda condição vai ao texto do prompt por um campo novo da apresentação, `regraAdicional` (`texto-prompt.js`),
     com os parâmetros em uso. Conferido no banco de dev: o WASDE de 2026-09-11 (safra 2026/27) dá 9,68%, no percentil
     20, revisado −5,2%, e o resultado é pressão de alta forte.
5. **Validação histórica contra o Indicador CEPEA/ESALQ** (B3, R$/saca, desde 2018-06-08, ADR 0021), com 95 edições de
   2018-09 a 2026-09:
   - **O nível não antecipa o preço em reais e anda ao contrário do FEL 1.** A posição tem +0,44 com o indicador 90
     dias depois (+0,50 em 2018–2021; +0,34 em 2022–2026).
   - **A revisão tem o sentido esperado, fraco:** −0,16 com os 30 dias seguintes.
   - **Pela regra:** com pressão de alta, o indicador subiu em 16 de 23 casos em 90 dias; com pressão de baixa, também
     subiu, em 17 de 30.

   O preço em reais mistura o dólar e o mercado interno, e sem o ZC não há como testar contra Chicago. O resultado
   vai na parte D do fator e numa pergunta ao David: o nível dá direção ou vira contexto? Combina com o parecer dele:
   "o preço reage à surpresa, não ao nível".

## Consequências

- A tela Metodologia do Ativo passa a ter o milho, com o F3 calculado e os outros 7 com a proposta e as regras do
  David. A ordem dos próximos cálculos segue o que a base já tem: F7 Fundos, F1 Clima, F2 Safrinha, F8 Política,
  F5 Etanol, F4 Dólar, F6 Insumos.
- **As regras do David pedem mais do que a decisão por faixa:** condições combinadas, peso por mês e comparação no
  mesmo levantamento. O F3 coube com uma segunda condição. O peso por mês e as regras de agregação (bloco de oferta,
  fundos como multiplicador) ficam para quando o Comitê os aprovar (pendência do ativo).
- **O mundo menos a China só existe no WASDE desde a safra 2017/18.** O percentil de 10 safras dele só a partir de
  2027/28; até lá, só o nível, como contexto.
- O milho continua sem prompt diário: `metodologia.promptDiario` é falso, e um teste garante.

## Não implementado (de propósito)

Os outros 7 cálculos; o peso por mês e a agregação; a convexidade do peso no F3; o balanço da Conab no F3; a paridade
do IMEA (precisa de ADR com a autorização); o prompt diário e a leitura da IA do milho; o café.

## Adendo (2026-10-04): F7, posicionamento dos fundos, calculado

- **O molde do COT ganha a janela como parâmetro** (`factors/modelos/fundos-cot.js`, `anosJanela`, padrão 3). Os
  campos passam a ter nomes genéricos (`percentilJanela`, `p10Janela`, `medianaJanela`, `p90Janela`). Prova de que o
  petróleo e o ouro não mudaram: o texto do prompt, a explicação e os exemplos dos dois, gerados com o banco de dev em
  três datas (hoje, 2024-03-12 e 2015-07-07), saíram idênticos antes e depois; só o nome dos campos dos pontos mudou.
- **F7 do milho** (`factors/fundos-milho.factor.js`, versão 1), no molde, com a R-FUN v0 do David:
  - a posição do managed money do milho da CBOT contra os **10 anos** anteriores;
  - leitura de **reversão**: comprados no P90 ou acima pesam para baixa, vendidos no P10 ou abaixo para alta;
  - a faixa neutra vai até 40 pontos (P10/P90), e a tendência é de 4 semanas;
  - acrescentados pelo FinMind: o forte no P5/P95 (45 pontos) e a mudança mínima de 15 pontos;
  - o gatilho de F1, F3 ou F8 cruza fatores e fica para a agregação.
- **Validação contra o Indicador ESALQ** (417 semanas, 2018 a 2026): a posição relativa de 10 anos tem **−0,44** com o
  indicador 26 semanas depois (−0,40 em 2018–2021; −0,54 em 2022–2026), contra −0,20 com a janela de 3 anos.
  - Fundos no P90 ou acima: o indicador subiu em 4 de 38 semanas (média −7,8%).
  - Fundos no P10 ou abaixo: subiu em 40 de 62 (+20,4%).

  O histórico confirma a leitura e a janela do David, e não o "amplifica" do FEL 1. Ressalva: são poucos episódios
  independentes (cerca de 6 de vendidos e 4 de comprados).
- **Em 2026-10-04 os fundos estão no percentil 92,8:** pressão de baixa moderada. O F3 (estoques) dá alta forte no
  mesmo dia. É o conflito que a agregação proposta pelo David trata (o F7 como regra de risco quando está contra),
  pendente do Comitê.

## Adendo (2026-10-04): F1, clima e safra nos EUA, calculado

- **Fator com regra própria na tela genérica.** A R-CLI v0 do David não é uma faixa simétrica: o limiar de alta
  (−5 p.p.) é diferente do de baixa (+3 p.p.), e a baixa pede semanas seguidas. Três extensões opcionais, sem mudar
  os fatores existentes:
  - a validação dos parâmetros (`lerParametros`) só exige "moderado menor que forte" quando o fator tem os dois, e
    valida `semanasTendencia` e `semanasSeguidas` só quando existem;
  - o texto do prompt aceita a regra do fator (`apresentacao.regra`, com os parâmetros entre chaves; as janelas em
    semanas saem sem casa decimal);
  - o gráfico da camada C aceita os limiares do fator (`graficoC.limiares`, em `utils/metodologia.js::seriesComFaixas`
    e `rotulosDasFaixas`).
- **F1 do milho** (`factors/clima-milho-eua.factor.js`, versão 1), semanal, com a condição da lavoura do USDA desde
  1986:
  - **A.** Boa + excelente, a variação na semana e a polinização.
  - **B.** A média da mesma semana nos 5 anos anteriores, o desvio e o percentil de 10 anos (contexto).
  - **C.** A R-CLI v0, só de junho a agosto: alta com o desvio de −5 p.p. ou pior, ou queda de 3 p.p. na semana;
    baixa com +3 p.p. por 3 semanas seguidas.
  - **Fica de fora:** a condição da previsão do NOAA/CPC, porque o dado não é coletado. Está declarada no texto e na
    tela.
  - **Acrescentados pelo FinMind:** alta forte com as duas condições; baixa forte com a polinização concluída (90%, o
    "sobe para Alto" do David); alta e baixa juntas dão neutra; tendência por 2 semanas.
  - O peso do mês do David vai no ponto como texto, fora da conta.
- **Validação contra o Indicador ESALQ** (115 semanas de junho a agosto, 2018 a 2026): **sem relação**. O desvio tem
  +0,15 com o indicador 13 semanas depois, o sentido contrário. Nas semanas de pressão de baixa, o indicador subiu em
  25 de 26 (+13,6%), puxado por 2024 e 2025. São só 9 safras, e o efeito chega ao CCM por Chicago e pela paridade,
  atenuado pela safrinha. A validação que falta é contra o ZC (Fase 2 da P8); vai como pergunta ao David.

## Adendo (2026-10-04): F2, safrinha, calculado

- **F2 do milho** (`factors/safrinha-milho.factor.js`, versão 1), um ponto por levantamento da Conab, lido de todas as
  versões (`obterVersoesAsOf`).
  - **A.** A produção, a área e a produtividade da 2ª safra; a revisão contra o levantamento anterior; a revisão
    acumulada contra a 1ª estimativa (a de outubro, o 1º levantamento).
  - **B.** A safra anterior no MESMO levantamento (o mesmo mês, um ano antes; o número do levantamento vem do mês) e
    a variação contra ela.
  - **C.** A R-SAF v0 do David: 3% contra a safra anterior, ou a acumulada de 2% em 2 levantamentos seguidos. Abaixo
    dos limiares, uma revisão para cima dá viés de baixa fraco, como ele escreveu.
  - **Fora da conta, sem o dado:** o alerta agroclimático e o plantio na janela.
  - **Acrescentados pelo FinMind:** forte com nível e revisão no mesmo sentido; neutra com os dois opostos.
  - **Novo parâmetro:** `levantamentosSeguidos`, validado como inteiro.
- **A leitura de "revisão acumulada em 2 levantamentos seguidos"** é a acumulada contra a 1ª estimativa passando do
  limiar em 2 levantamentos seguidos. É o que o exemplo do David usa (+1,5% contra a 1ª estimativa, "abaixo de +2%").
  Vai como pergunta para ele confirmar.
- **Um levantamento que a base não tem** (a fonte não publicou: mar a jun/2025 e jan/2026) não vira "mesmo estágio":
  a comparação fica sem dado. A comparação só existe na safra 2025/26, em 4 meses: fev (+13,8%, baixa), jul (+4,7%,
  baixa), ago (+1,3%) e set/2026 (+0,09%).
- **Confere com o exemplo do David:** no 12º levantamento de 2025/26, nível +0,09% e acumulada +1,51%, abaixo dos
  limiares, com viés de baixa fraco pela revisão de +0,99%. É a leitura dele.
- **Sem validação histórica:** 15 levantamentos não testam o fator contra o preço. A avaliação diz "não basta para
  validar". A validação mais longa depende da aproximação pelo WASDE (o Brasil desde 2011, P5), ainda não calculada.

## Adendo (2026-10-04): F8, a parte numérica (exportações), calculada

- **F8 do milho** (`factors/exportacao-milho.factor.js`, versão 1), mensal, com o Comex Stat desde 2005:
  - **A.** O milho exportado no mês e a participação da China (código 160), com a variação contra o mesmo mês do ano
    anterior, a medida que o David pediu na P12.
  - **B.** O ritmo: o acumulado do ano comercial (fevereiro a janeiro, o da Conab) contra a média do mesmo trecho nos
    5 anos anteriores.
  - **C.** A parte dos embarques da R-POL v0: ±10% contra a média de 5 anos. Acrescentados pelo FinMind: o forte a
    partir de 25% e a tendência por 3 meses.
- **Os eventos não entram na conta.** Tarifas, habilitações e embargos vêm da leitura diária por IA (ADR 0049), e o
  David pediu validação humana antes do prompt (pendência).
- **Por que o acumulado e não o mês.** O mês sozinho contra a média do mesmo mês salta na entressafra: +67% em
  mar/2026 e −35% em mai/2026, sobre volumes pequenos. O David pede o "ritmo de embarque contra a média de 5 anos da
  mesma época" e lista o "acumulado do ano comercial" como medida. A escolha vai como pergunta para ele.
- **Validação contra o Indicador ESALQ** (97 meses, 2018 a 2026, contados da publicação de cada mês): **sem relação
  estável.** −0,06 com o indicador 3 meses depois no período todo; +0,35 em 2018–2021 (o sentido do FEL 1) e −0,31 em
  2022–2026 (o contrário). As exportações seguem a competitividade do milho brasileiro, e a relação troca de regime.
- **Em agosto de 2026**, o ano comercial vai 23,6% abaixo do ritmo dos 5 anos anteriores: pressão de baixa moderada.

## Adendo (2026-10-04): F5 (etanol, só os EUA) e F6 (insumos, só a margem) calculados

- **F5** (`factors/etanol-milho.factor.js`, versão 1), semanal, com a produção de etanol da EIA desde 2010.
  - **A.** A produção e a moagem implícita de milho (× 42 ÷ 2,8 galões por bushel, o rendimento da proposta).
  - **B.** O desvio contra a média das 4 semanas anteriores e, como contexto, contra a mesma semana do ano anterior.
  - **C.** A parte da EIA da R-ETA-02 v0: 3% ou mais abaixo da média de 4 semanas → pressão de baixa. Acrescentado
    pelo FinMind: forte com a semana também 3% abaixo do ano anterior.
  - **Fica de fora:** a regra de alta e o resto da de baixa pedem a margem do etanol de milho e o Brasil (UNEM, ANP,
    Cepea), que não são coletados. O fator só dá baixa.
  - **Validação contra o Indicador ESALQ** (432 semanas): fraca, no sentido da regra. Nas semanas com pressão de
    baixa, o indicador caiu em média 1,4% em 13 semanas (subiu em 44% delas); nas neutras, subiu em média 3,5% (60%).
- **F6** (`factors/insumos-milho.factor.js`, versão 1), semanal (o último pregão).
  - **A.** O custo total e o operacional efetivo por saca da média de MT (IMEA, R$/ha ÷ sc/ha), da safra mais nova
    que o IMEA tinha publicado até o pregão, e o Indicador ESALQ.
  - **B.** A margem sobre o custo total.
  - **C.** A parte da margem da R-INS-01 v0: margem de 0% ou menos → pressão de alta (o piso). Acrescentado pelo
    FinMind: forte com o preço no custo operacional efetivo ou abaixo.
  - **Fica de fora:** a relação de troca e a regra de baixa pedem o preço do fertilizante, que não é coletado. O
    fator só dá alta.
- **Dois limites do F6, declarados na tela:**
  - O custo é de MT, e o preço é de Campinas: a margem fica maior que a do produtor de MT.
  - O custo por safra só é conhecido na base desde a 1ª coleta (2026-09-15): point-in-time, o fator tem poucas semanas.
    Como leitura dos números, fora do point-in-time: em meados de 2024 o indicador (~R$ 57) estava no custo da safra
    2023/24 (R$ 58,60) antes da alta para ~R$ 74; em 2023 o aperto de MT não aparece no preço de Campinas.
- **Com isso, o milho tem 7 dos 8 fatores calculados.** Falta o F4 (dólar e paridade), que depende da paridade do
  IMEA (P16) e de um ADR com a autorização da coleta. A simulação de 2026-09-30:
  - **Alta:** estoques forte.
  - **Baixa:** fundos forte; etanol e exportações moderada; safrinha fraca.
  - **Neutros:** clima e insumos.
