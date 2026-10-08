# Proposta — Soja como 5º ativo do FinMind (v2.2)

**Situação:** **aprovada** pelo Comitê, com o David, em 2026-10-08 (ADR 0116): os itens 1 a 6 da §2.15, como propostos,
até o prompt diário e o Centro de Decisão. Os pesos (item 8), decididos na mesma data (ADR 0116, adendo): fixos por fator
(F1 e F2 Alto, F3 Médio, F4 Baixo), com a matriz da §2.10 como relevância, não peso, e a agregação pela IA, como no milho
e no café. Ficaram de fora as fontes da fase 2 (item 7). A validação da §3 passa a ser feita pela
Qualidade da IA e por um teste depois, como no milho e no café. O texto abaixo é o da v2.2, como foi aprovado; a
implementação e o que ela operacionalizou estão no ADR 0116.

(Situação da v2.2 quando foi ao Comitê: a arquitetura da v2 foi aprovada como direção; a v2.1 a ajustou, e a v2.2
separa **fatores, regras e agregação**. Substitui a v1 do mesmo dia. **Nenhum peso e nenhuma fórmula de agregação são
propostos:** os pesos são do David, e a agregação é a próxima etapa.)

**Premissa (não reaberta):** o preço de referência é o contrato de soja da B3.

## 0. O fato que muda a metodologia

O contrato de soja da B3 com liquidez é o **SJC**: cotado em **US$ por saca de 60 kg** e **liquidado pelo preço de ajuste
do minicontrato de soja da CME** (ficha do produto na B3; conferido em 2026-10-08). O outro contrato de soja da B3, o
SOY (FOB Santos), não teve negócio nos pregões de 2026-10-01 e 2026-10-07. O SJC negociou de 333 a 768 contratos por
dia nesses pregões, na ordem do ICF do café.

Consequência: **o preço da soja na B3 é o preço de Chicago convertido de bushel para saca.** Não é um preço brasileiro
com base própria, como o CCM do milho. Daí:

- **Câmbio não entra no preço** (o contrato é em dólar) e o **prêmio de Paranaguá também não** (ele é a diferença entre o
  porto e Chicago, e o SJC liquida em Chicago).
- **Chicago não é driver: é o próprio preço.** Os drivers são o que move Chicago.
- **O Brasil entra pelo que move Chicago:** a safra brasileira e argentina como oferta concorrente no mercado mundial,
  não como formação de base.

## 1. Críticas à proposta v1

A numeração dos fatores nesta tabela é a da v1.

| # | Problema | Tipo | O que acontece agora |
|---|---|---|---|
| 1 | O F6 (câmbio e paridade) põe no motor duas variáveis que não entram no preço do SJC | **Errado** | Sai do motor. O câmbio vira, no máximo, hipótese de contexto a testar (§2.11) |
| 2 | A falta do prêmio de Paranaguá aparece como lacuna e como argumento contra o ativo | **Errado** | Não é lacuna: o prêmio não forma o preço do SJC |
| 3 | A §3 comparava instrumentos (SJC × ZS × SOY × FMI) | Desnecessário (decisão tomada) | Removida |
| 4 | F1 (clima), F2 (safra da América do Sul) e F3 (balanço) contam o mesmo choque até três vezes: a seca aparece na condição da lavoura, depois na revisão de produção do WASDE e, por fim, no estoque projetado | **Redundante** | Os fatores de oferta leem o choque enquanto ele é **novo**; a folga do balanço vira regra, sem peso (§2.6) |
| 5 | O F3 misturava nível (estoque/uso), surpresa (Grain Stocks) e área plantada, que é oferta | Mistura de conceitos | A área vai para a oferta dos EUA; o nível do estoque vira a condição da regra R2 |
| 6 | O F4 (demanda da China) usava a importação chinesa do WASDE e a exportação do Brasil para a China (um fluxo da oferta brasileira, mensal e defasado). Nenhum dos dois mede a demanda que move Chicago | **Mal definido** | F3, demanda pela soja dos EUA, desde a fase 1, pela revisão do uso no WASDE; as vendas semanais (Export Sales) viram o observável primário na fase 2 |
| 7 | O F5 (esmagamento, farelo e óleo) era uma lista de observáveis. Misturava fluxo, posicionamento e política | **Lista, não fator** | A margem de esmagamento vira candidata a observável de confirmação do F3 |
| 8 | O F7 dava direção aos fundos (COT), que não são fundamento; no petróleo e no café o extremo não mostrou reversão nem continuação (ADRs 0089 e 0094) | **Errado** | O posicionamento vira a regra R3, igual ao café: só informação, sem direção nem peso (§2.6) |
| 9 | O F8 (política comercial) era fator de evento, mas os eventos de biodiesel estavam no F5 | Inconsistente | Um único fator de evento, F4: política (comércio e biocombustíveis) |
| 10 | Baselines misturados sem regra: média de 5 anos, estimativa anterior, mesmo período do ano anterior, surpresa de relatório (sem a expectativa do mercado, que não coletamos) | Mal definido | Um baseline por tipo de observável (§2.8) |
| 11 | Sem horizonte por fator; a sazonalidade aparecia só no F1 (julho a agosto) | Incompleto | Matriz fator × horizonte (§2.10) e o calendário da safra como regra de aplicabilidade (R1) |
| 12 | 8 fatores copiados do formato do milho, não deduzidos do preço | Prematuro | 4 fatores, 3 regras e 1 observável candidato |
| 13 | A fase 1 estendia cerca de 12 coletores, vários sem uso no motor (custo do IMEA, paridade, Comex de farelo e óleo, COT de farelo e óleo, PSD) | Complexo demais | A fase 1 coleta só o que fatores e regras leem (§2.13) |
| 14 | A relação soja/milho entrava como contexto da soja; ela serve ao milho (ADR 0080) | Mistura de projetos | Fica fora deste motor; é decisão do milho |
| 15 | "Validar contra o FMI e o SJC" sem método, o que na prática é correlação | Mal definido | Teste por direção, intensidade e horizonte, no formato da Qualidade da IA (§3) |

## 2. Nova arquitetura

### 2.1 Objetivo do motor

Ler a tendência do **SJC** em quatro horizontes (1, 7, 30 e 90 dias), com faixa e confiança, como nos outros quatro
ativos. Leitura de tendência, nunca recomendação de compra ou venda.

### 2.2 Preço de referência

O SJC da B3, um vencimento por horizonte (o mais próximo que negocia depois da data-alvo) e o mínimo de 100 contratos
com aviso, como no milho e no café (ADR 0078). Faixas calibradas no próprio SJC (percentis 40 e 80 de cada horizonte),
como nos outros ativos (ADR 0079).

### 2.3 Fatores → Regras → Agregação → Leitura

Três camadas, cada uma com uma função, na ordem em que a leitura é montada:

```text
Observáveis
   │  medição (dentro de cada fator: primário, confirmação, contexto)
   ▼
FATORES ............ F1, F2, F3, F4: cada um com direção e intensidade próprias; cada um recebe peso
   │
   ▼
REGRAS DOS FATORES . R1 (aplicabilidade), R2 (intensidade): mudam a leitura de um fator; sem peso
   │
   ▼
AGREGAÇÃO .......... combina os fatores com os pesos do David (forma a definir e validar)
   │
   ▼
LEITURA CONSOLIDADA  direção, faixa e confiança por horizonte
   │
   ▼
REGRAS DA LEITURA .. R3 (posicionamento): marca o papel dos fundos na leitura, só informação; sem peso, sem direção
   │
   ▼
LEITURA FINAL
```

**Definições**

- **Fator:** um driver econômico independente, com **direção própria** (alta, baixa ou neutro) e intensidade. Tem
  **peso**. Numerado em sequência: F1, F2, F3...
- **Regra:** uma condição que muda a **aplicabilidade**, a **intensidade** de um fator ou **marca** a leitura
  consolidada com um papel gravado (sem alterá-la). Não tem direção própria nem peso. Pode depender de calendário, de período ou do estado do mercado
  (o peso por mês do milho é desse tipo, ADR 0065). Numerada R1, R2, R3...
- **Agregação:** combina os fatores, já com as regras aplicadas, usando os pesos. A forma exata (soma ponderada,
  precedência, votos) é decisão da próxima etapa, com validação histórica. Uma regra de agregação nunca vira fator.
- **Medição** (não é regra): como os observáveis de **um mesmo fator** se combinam (primário, confirmação, contexto,
  §2.5). Regra age sobre a leitura de um fator já medido, ou sobre a leitura consolidada.
- **Contexto:** informação que vai ao prompt e não muda nada (ex.: o estoque mundial, os estados brasileiros).

**Critério para uma condição nova** (para não nascer um "M2" a cada achado):

1. Tem direção própria e passa no teste incremental (§3.2)? → **fator** (Fn, com peso).
2. Não tem direção própria, mas muda a aplicabilidade ou a intensidade de um fator, ou marca a leitura (um papel gravado)? → **regra**
   (Rn, sem peso), com a ficha da §2.6.
3. Não muda nada? → **contexto**.

**Como funciona até haver agregação em código:** nos outros ativos, quem combina os fatores é a IA, orientada pelo prompt;
a agregação em código só vai ao prompt depois de medida contra os benchmarks (ADRs 0066 e 0081). Na soja, igual: os
fatores e as regras vão ao prompt como orientação em texto, com o que cada regra muda e o que não muda.

### 2.4 Calendário da safra (a base da regra R1)

| Fase | EUA | Brasil | Argentina |
|---|---|---|---|
| Intenção e plantio | Mar (intenção) a jun (plantio e área) | Set a dez | Out a jan |
| Fase crítica (floração e enchimento de grãos) | **Jul a ago** | **Dez a fev** | **Jan a mar** |
| Colheita | Set a nov | Jan a abr | Mar a jun |

A fase vem do Crop Progress nos EUA e do calendário fixo no Brasil e na Argentina (o andamento semanal da Conab não é
coletado).

### 2.5 Fatores

**Driver econômico → fator → observáveis.** Quatro fatores, todos com direção própria e peso (a definir pelo David).

| Fator | Driver | Tipo |
|---|---|---|
| F1 | Oferta dos EUA | Calculado |
| F2 | Oferta da América do Sul | Calculado |
| F3 | Demanda pela soja dos EUA | Calculado |
| F4 | Política (comércio e biocombustíveis) | Fator de evento |

**Medição: a regra objetiva dos observáveis (F1, F2 e F3).** Em cada período, cada fator tem **um observável primário**
e, no máximo, observáveis de **confirmação** e de **contexto**:

1. **Primário:** o único que dá a direção e a intensidade do fator no período. Hierarquia fixa: o estado medido da
   lavoura enquanto a estimativa oficial ainda não incorpora a lavoura medida; depois, a estimativa oficial. A troca
   acontece numa **data de publicação definida** nas tabelas abaixo, nunca por julgamento.
2. **Confirmação:** não gera sinal. Se aponta o mesmo lado ou fica neutra, nada muda; se aponta o lado oposto (fora da
   faixa neutra), a intensidade do fator fica limitada a **fraca** e a divergência vai ao prompt. Com o primário neutro,
   a confirmação não cria sinal.
3. **Contexto:** vai ao prompt e não altera a leitura.

Assim, Crop Progress, VHI e previsão do tempo nunca são três sinais: um decide, outro pode limitar, o terceiro só
informa. O mesmo vale para WASDE e Conab.

**F1. Oferta dos EUA (a safra em formação)**
- Driver: produção americana do ano-safra = área × produtividade.
- O que o fator lê: o choque **novo** sobre a produção americana.
- Janela (aplicada pela R1): do Prospective Plantings (fim de março) ao WASDE de janeiro (a produção final).
- Até agosto, dois componentes: área e produtividade são choques diferentes, não o mesmo choque contado duas vezes.
  Depois, um só: a estimativa do WASDE já soma os dois.

| Período (de → até, pelas publicações) | Estágio | Primário | Confirmação | Contexto |
|---|---|---|---|---|
| Prospective Plantings → WASDE de agosto | Intenção e plantio | **Área:** o último relatório de área (o Prospective; a partir do fim de junho, o Acreage) | — | — |
| 1º boletim de condição da safra (início de junho) → WASDE de agosto | Desenvolvimento e fase crítica | **Produtividade:** condição boa + excelente (Crop Progress) | VHI sobre a soja nos EUA | Previsão de 6–10 e 8–14 dias do CPC (IA, IL, MN, IN, NE) |
| WASDE de agosto → WASDE de janeiro | Enchimento, colheita e número final | Revisão de produção no WASDE (os componentes de área e produtividade saem) | Condição boa + excelente, até a última da safra | — |

- Com os dois componentes ativos (junho a agosto): se apontam o mesmo lado, vale o mais intenso; se apontam lados
  opostos, vale o de percentil mais extremo, limitado a fraca.

**F2. Oferta da América do Sul (a safra concorrente)**
- Driver: Brasil e Argentina somam mais da metade da exportação mundial; a safra deles disputa a demanda com a americana
  e move Chicago.
- O que o fator lê: o choque **novo** na produção somada de Brasil e Argentina.
- Janela (aplicada pela R1): 1º de novembro a 30 de junho.
- Estimativa: uma fonte para os dois países, o **WASDE** (Brasil + Argentina somados), o relatório a que Chicago reage e
  o único com os dois na mesma data. A Conab é confirmação da parte brasileira.
- Estado da lavoura: o VHI nacional sobre a soja de cada país, no percentil da mesma semana. Com os dois países ativos,
  a média ponderada pela produção da safra anterior no WASDE. Estados e províncias são contexto.

| Período | Estágio | Primário | Confirmação | Contexto |
|---|---|---|---|---|
| 1º nov → 30 nov | Plantio no Brasil | Revisão de produção BR + AR no WASDE | Conab (Brasil) | — |
| 1º dez → 31 mar | Fase crítica (Brasil: dez a fev; Argentina: jan a mar) | VHI: Brasil em dezembro; Brasil e Argentina, ponderados, em janeiro e fevereiro; Argentina em março | Revisão BR + AR no WASDE; Conab (Brasil) | VHI por estado e província |
| 1º abr → 30 jun | Colheita | Revisão de produção BR + AR no WASDE | Conab (Brasil) | — |

- Janela de cada observável: VHI do Brasil, de 1º de dezembro ao fim de fevereiro; VHI da Argentina, de 1º de janeiro a
  31 de março; WASDE e Conab, a janela inteira do fator (como primário ou confirmação, pela tabela).
- Limite assumido: num WASDE entre dezembro e março, a revisão é só confirmação; o efeito de 1 dia do relatório chega à
  IA pela base do prompt (o balanço vai a ela), não como sinal do fator.

**F3. Demanda pela soja dos EUA (exportação e esmagamento)**
- Driver: quanto o mundo e as esmagadoras compram da soja americana. É o outro lado do preço: sem ele, uma volta da
  China às compras só chegaria ao motor quando virasse estoque.
- O que o fator lê: o choque **novo** na demanda, nunca o nível.
- Janela: o ano todo.
- Fase 1, primário: a revisão do uso total dos EUA (exportação + esmagamento) no WASDE contra a edição anterior.
  Contexto: a revisão da importação da China no WASDE.
- Fase 2, primário: as vendas semanais para exportação (USDA Export Sales), acumulado do ano-safra contra o ritmo
  necessário para a projeção do USDA; a revisão do WASDE passa a confirmação.
- **Observável candidato:** a margem de esmagamento (o valor do óleo e do farelo de uma tonelada de soja contra o preço
  da soja, com as séries mensais do FMI de óleo, farelo e grão, desde 1992; conferidas). Se passar na validação, entra
  como confirmação da parte do esmagamento. Só mensal, logo só 30 e 90 dias. Não é fator: não tem driver separado do
  esmagamento, que já está em F3.
- Limite da fase 1: mensal. Nos horizontes de 1 e 7 dias, a demanda chega só pelos eventos (F4).

**F4. Política (comércio e biocombustíveis): fator de evento**
- Driver: decisões de governo que deslocam a demanda ou a oferta de uma vez.
- Eventos: tarifas e acordos EUA–China (compras, cancelamentos, suspensões), retenções e câmbio especial da Argentina,
  volumes obrigatórios de biocombustível nos EUA (EPA) e crédito tributário, mistura de biodiesel no Brasil.
- Leitura: o evento mais grave da janela de 7 dias, como a geopolítica do petróleo (ADR 0098). A arquitetura atual vale:
  os demais eventos da soja (greve em porto, nível do Mississippi, logística) vão à seção de eventos da base do prompt,
  sem fator (ADR 0095).
- Não vira número contínuo: notícia não tem baseline nem série.

**Por que o posicionamento dos fundos não é F5:** ele não tem direção própria (o COT reage ao preço, e no petróleo e no
café o extremo não antecipou reversão nem continuação, ADRs 0089 e 0094). Sem direção, não há o que ponderar: um peso
para ele seria um peso sobre nada. O que ele traz é o papel dos fundos na leitura, só como informação, como no café: isso é regra (R3).

### 2.6 Regras

Cada regra tem a mesma ficha: a condição, o que afeta, a dimensão, quando se aplica, a validação e o que fica para a
próxima etapa. **Nenhuma regra define fórmula** (multiplicador, desconto): isso é agregação e calibração, na próxima
etapa.

| Regra | Condição (variável → estado) | Afeta | Dimensão | Quando |
|---|---|---|---|---|
| R1. Calendário da safra | Data → fase da cultura em cada país (§2.4) | F1 e F2 (e a escolha do observável primário) | **Aplicabilidade:** fora da janela, o fator lê "fora da janela" e não pressiona | Sempre |
| R2. Folga do balanço | Estoque final sobre uso dos EUA no ano-safra corrente (WASDE) → apertado, normal ou folgado | F1, F2 e F3 | **Intensidade** do choque | Só quando o fator afetado não está neutro |
| R3. Posicionamento dos fundos (igual ao café) | Posição dos fundos (COT) no percentil de 3 anos → extremo comprado, extremo vendido ou fora do extremo | A leitura consolidada, em 7 e 30 dias | **Informação:** marca o papel (EXCESSO ou extremo contra), sem mudar direção, faixa nem confiança | Só no extremo e com direção na leitura |

**R1. Calendário da safra**
- O estágio vai ao prompt com o fator; a troca do observável primário (§2.5) segue as datas da regra.

**R2. Folga do balanço** (a antiga "M1")
- Por que é regra e não fator: o nível do estoque não é notícia, já está no preço; e ele é o resultado dos choques de
  F1, F2 e F3. Com peso próprio, contaria esses choques de novo. Ele não diz para onde o preço vai: diz **quanto** um
  choque o move. Não tem contribuição independente que justifique peso.
- Condição: o percentil do estoque/uso dos EUA no histórico do mesmo mês do ano-safra (para o WASDE, a edição do mesmo
  mês). Estados: **apertado** (até o percentil 20), **normal**, **folgado** (a partir do 80). Os limites são calibração
  do FinMind, como as faixas. Estoque/uso mundial e Grain Stocks entram como contexto da regra.
- Efeito: com o balanço apertado, um choque de F1, F2 ou F3 tende a mover mais o preço; com o folgado, menos. Muda a
  intensidade do fator; nunca a direção e nunca o peso.
- Por que intensidade, e não peso efetivo nem confiança: o peso é do David e fica constante; a regra age na leitura do
  fator antes da agregação. E a regra não diz se a leitura está certa (confiança): diz o tamanho do movimento.
- O que fica em aberto: se o efeito é simétrico (choque de alta e de baixa) e se vale para o F4 (uma tarifa com balanço
  apertado). A validação responde; até lá, só F1 a F3, sem assumir simetria.
- No prompt, até haver agregação em código: o estado do balanço, com a instrução de que muda a intensidade dos choques e
  nunca a direção.
- Regra de independência: a variação mensal do estoque final do WASDE não é lida em lugar nenhum: ela é a soma das
  revisões de oferta (F1, F2) e de demanda (F3).

**R3. Posicionamento dos fundos** (o antigo "P1"): **igual ao café** (ADR 0089, revisão de 2026-10-06)
- Condição: posição líquida dos fundos (managed money) na soja da CBOT (CFTC, 005602) em % dos contratos em aberto, no
  percentil da janela de 3 anos. **Extremo:** percentil 10 ou abaixo (vendidos) ou 90 ou acima (comprados), a mesma
  calibração do café. Lido como reversão: comprados em extremo apontam baixa; vendidos em extremo, alta.
- Horizontes: só 7 e 30 dias (CURTO e MEDIO), como no café. Em 1 e 90 dias, sem papel.
- Papel na leitura, com os valores que o formato da resposta da IA já usa (`posicionamentoCot`):
  - **EXCESSO:** o extremo aponta no mesmo sentido da leitura;
  - **SEM_PAPEL, extremo contra:** o extremo aponta contra a leitura (ex.: fundos comprados em extremo e a leitura de
    alta);
  - **SEM_PAPEL:** fora do extremo, fora dos horizontes ou sem direção na leitura.
- Efeito: **só informação.** Não muda a direção, a faixa nem a confiança, em nenhum caso. O café começou baixando a
  confiança e retirou isso: o extremo sozinho não mostrou reversão nem continuação com significância (cerca de 20
  episódios de cada lado), e o catalisador que o estudo pedia quase nunca aconteceu.
- Por que é regra e não contexto: ela classifica a leitura (o papel fica gravado com ela), o que permite medir depois se
  o papel tem relação com o acerto. Contexto não deixa registro na leitura.
- Fica para depois, com evidência: um efeito na confiança e a hipótese de exigir também um movimento forte de preço
  (extremo depois de uma corrida). Ver §2.7.

### 2.7 Agregação

**Já definido:**
- Entram na agregação só os fatores (F1 a F4), cada um com o seu peso.
- As regras R1 e R2 agem **antes**, na leitura de cada fator; a R3 age **depois**, só marcando o papel dos fundos na
  leitura consolidada, sem alterá-la.
- Uma regra não recebe peso, não soma a favor nem contra e não cria direção.
- Até a agregação em código ser medida contra os benchmarks, quem combina é a IA, com fatores e regras no prompt
  (ADRs 0066 e 0081).

**Para a próxima etapa** (a sugestão do FinMind está em `docs/proposta-pesos-agregacao-soja.md`):
- Os pesos de F1 a F4 (do David), fixos ou por período, como o peso por mês do milho.
- A forma de combinar (soma ponderada, precedência, votos) e de tratar fatores que discordam.
- Quanto a R2 muda a intensidade em cada estado, se é simétrica e se vale para o F4.
- A R3 continua só informativa. Mudar isso exige evidência: a Qualidade da IA medir o acerto das leituras por papel dos
  fundos (EXCESSO, extremo contra, sem papel). A medição valeria também para o café, que já grava o papel. Só com
  diferença clara entre os papéis se discute um efeito na confiança.

### 2.8 Baseline por tipo de observável

Uma regra por tipo, sempre calculada só com o que se sabia na data (point-in-time, ADR 0008). O baseline dá a
**direção** (acima ou abaixo do esperado) e a **intensidade** (o percentil).

| Tipo | Exemplos | Baseline | Por quê |
|---|---|---|---|
| Estimativa oficial (produção, uso) | WASDE, Conab | A edição anterior da mesma fonte, para o mesmo ano-safra | Não coletamos a expectativa do mercado antes do relatório; a revisão é a surpresa que dá para medir |
| Área plantada | Prospective Plantings, Acreage | A área final do ano anterior; o Acreage também contra o Prospective do mesmo ano | É assim que o mercado lê os dois relatórios |
| Estado da lavoura | Condição boa + excelente, VHI | Percentil na **mesma semana do ano**, no histórico disponível sem o ano corrente | Tira a sazonalidade e dá a intensidade na mesma régua dos dois observáveis |
| Previsão do tempo | CPC 6–10 e 8–14 dias | Categoria da previsão (acima ou abaixo do normal) e o número de estados afetados, como no F1 do milho (ADR 0068) | A previsão já vem como desvio do normal |
| Fluxo (F3, fase 2) | Export Sales | Acumulado do ano-safra contra o ritmo necessário para a projeção do USDA | Mede só o que a projeção ainda não tem |
| Margem (observável candidato) | Óleo + farelo − grão | Percentil no histórico do mesmo mês | Sazonalidade da margem |
| Evento (F4) | Política | Sem baseline: gravidade e janela de 7 dias | Regra dos fatores de evento |
| Condição de regra: nível de estoque (R2) | Estoque/uso, Grain Stocks | Percentil no histórico do mesmo mês do ano-safra | Nível, não variação: evita contar de novo o choque |
| Condição de regra: posicionamento (R3) | COT | Percentil na janela de 3 anos; extremo no 10 e no 90 | A mesma régua do café |

### 2.9 Eventos fora dos fatores calculados

- No F4: política comercial e de biocombustíveis (§2.5).
- Na seção de eventos da base do prompt, sem fator: logística (rio, greve, porto), sanidade e outros.
- **Não são eventos:** o clima (é F1 e F2) e as vendas anunciadas pelo USDA (na fase 2, entram no F3).

### 2.10 Matriz fator × horizonte

| Fator | 1d | 7d | 30d | 90d |
|---|---|---|---|---|
| F1. Oferta dos EUA | Média (na janela; alta em dia de relatório e na virada da previsão em julho e agosto) | Alta (jun a ago) | Alta (jun a set) | Média (área e produtividade definem o ano) |
| F2. Oferta da América do Sul | Baixa (média em dia de Conab e WASDE) | Média (dez a fev) | Alta (dez a mar) | Média |
| F3. Demanda pela soja dos EUA | Baixa (fase 2: média nas vendas-relâmpago) | Baixa (fase 2: média) | Média | Média |
| F4. Política | Alta | Alta | Média | Baixa (média se a medida for duradoura, como uma tarifa) |

Fora da janela de safra (R1), F1 e F2 caem para baixa ou nula em todos os horizontes. Relevância das regras por
horizonte (efeito sobre a leitura, não sinal): R2, baixa em 1 e 7 dias, média em 30 e alta em 90; R3, só em 7 e 30 dias,
como no café, e só como informação. A margem, se entrar como observável do F3, só pesa em 30 e 90 dias.

### 2.11 Riscos de sobreposição e regras de independência

| Sobreposição | Como se resolve |
|---|---|
| Clima → condição → produtividade → produção → estoque (o mesmo choque em quatro observáveis) | Em F1 e F2, um primário por período, com a troca nas datas das tabelas; confirmação só limita, contexto só informa. O estoque só entra como condição da R2 (nível) |
| Conab e WASDE estimam a mesma safra brasileira | O WASDE é a estimativa de F2; a Conab é confirmação |
| Variação do estoque final no WASDE | Não é lida: é a soma das revisões de oferta (F1, F2) e de demanda (F3) |
| Folga do balanço com peso próprio | Não tem: é a R2, que só muda a intensidade de F1, F2 e F3 |
| Grain Stocks e WASDE do mês seguinte | Os dois só atualizam a condição da R2; nenhum vira choque |
| Compra chinesa como evento e como venda semanal | Na fase 2, a compra é fluxo (F3), e o F4 fica só com decisões de política |
| Biocombustível como evento (F4) e como margem | F4 lê a decisão; a margem lê o efeito no preço do óleo, como confirmação de F3. Se andarem juntos na validação, a margem sai |
| COT e preço | O COT reage ao preço; só entra na R3, como informação, nunca como direção |
| Projeções de demanda no estoque/uso (R2) e F3 | F3 lê a revisão (fase 1) ou o desvio contra a projeção (fase 2); a R2 lê o nível |

### 2.12 O que fica fora do motor

- Câmbio (BRL) e prêmio/paridade: não entram no preço do SJC. O câmbio pode ser testado como hipótese de segunda ordem
  (real fraco acelera a venda do produtor brasileiro e pesa em Chicago), sem entrar no motor antes disso.
- Chicago como variável explicativa: é o próprio preço.
- Custo de produção e relação de troca com o adubo: agem além de 90 dias.
- Preço de farelo e óleo como fatores próprios: só dentro da margem (observável candidato do F3).
- Relação soja/milho: pertence ao milho (ADR 0080).
- Indicadores técnicos e qualquer regra de compra ou venda (restrição permanente).

### 2.13 Dados da fase 1 (só o que fatores e regras leem; nenhuma fonte nova)

| Dado | Uso | Fonte (já no FinMind) | Trabalho |
|---|---|---|---|
| SJC por vencimento | Preço | B3 Up2Data (e o Boletim Diário para o histórico, a conferir) | Configuração |
| Condição, plantio e colheita da soja | F1; estágio da R1 | USDA NASS Crop Progress | Configuração |
| VHI sobre a soja: EUA, MT, PR, RS, GO, Argentina | F1 e F2 | NOAA STAR (`SOYB`, conferido nos EUA) | Configuração |
| Previsão de 6–10 e 8–14 dias | F1 | NOAA CPC (os mesmos 5 estados do milho) | Nenhum |
| Área plantada | F1 | USDA ESMIS | Extensão do parser |
| Balanço da soja (EUA, mundo, Brasil, Argentina, China), com exportação e esmagamento dos EUA | F1, F2, F3; condição da R2 | WASDE | Extensão do parser |
| Estoques trimestrais | Contexto da R2 | USDA Grain Stocks | Extensão do parser |
| Produção por UF e balanço | F2 | Conab | Extensão do parser |
| COT da soja (005602) | Condição da R3 | CFTC | Configuração |
| Eventos da soja | F4 | Leitura diária por IA | Frente nova e fontes autorizadas |
| Preço mensal de soja, óleo e farelo | Validação de 30 e 90 dias; margem (candidata) | FRED/ALFRED (FMI; conferido) | Configuração |

Fora da fase 1: IMEA, Comex Stat, PSD de oleaginosas e o COT de farelo e óleo.

### 2.14 Dados só na fase 2 (cada um com demanda e ADR)

| Dado | Necessidade | Proxy hoje | Sem ele | Custo | Quando |
|---|---|---|---|---|---|
| Vendas semanais para exportação (USDA Export Sales) | Alta nos 7 e 30 dias: vira o primário do F3 | A revisão do uso no WASDE (mensal, o primário do F3 na fase 1) e os eventos | F3 só mensal; 1 e 7 dias sem demanda, salvo eventos | Baixo: API pública com chave gratuita | 1ª da fase 2 |
| Preço diário longo de Chicago | Alta na pesquisa e na validação, nunca no preço oficial (§3.1) | SJC (curto) e FMI (mensal) | 1 e 7 dias validados com pouco histórico; faixas de 90 dias calibradas em pouco mais de um ano | ZS oficial é pago; o Yahoo é não oficial, como o Brent (ADR 0096) | Fase 2, decisão do Comitê |
| Esmagamento mensal dos EUA (NASS) | Média | Margem pelo FMI | A margem fica só com preço, sem volume | Baixo (a mesma chave do NASS) | Se a margem passar na validação |
| Expectativa do mercado antes do WASDE | Média (é a surpresa real) | Revisão contra a edição anterior | A surpresa medida é a da fonte, não a do mercado | Sem fonte gratuita conhecida | Fora |
| Dados da Argentina (Bolsa de Cereales) | Baixa | WASDE e VHI | Revisões argentinas com atraso | Fonte nova | Só sob demanda |
| Prêmio de Paranaguá | Nula para o SJC | — | Nenhum | — | Não buscar para este motor |

### 2.15 Decisões para o David e o Comitê

1. **A arquitetura:** Fatores → Regras → Agregação → Leitura (§2.3), com o critério para classificar uma condição nova.
2. **Os fatores:** F1 (oferta dos EUA), F2 (oferta da América do Sul), F3 (demanda pela soja dos EUA) e F4 (política).
   Falta algum driver? Algum sobra?
3. **As regras:** R1 (calendário), R2 (folga do balanço) e R3 (posicionamento dos fundos, igual ao café), com o que cada uma afeta e em que
   dimensão (§2.6).
4. **A medição:** o primário de cada período, as datas de troca e o limite a "fraca" quando a confirmação diverge (§2.5).
5. **Os baselines** (§2.8) e os limites das condições: R2 nos percentis 20 e 80; R3 nos percentis 10 e 90, os do café.
6. **A margem de esmagamento:** testar e, se passar, usar como confirmação do F3?
7. **Fonte nova** na fase 2: Export Sales; e o Chicago diário do Yahoo só como série de pesquisa (§3.1).
8. **Próxima etapa:** os pesos de F1 a F4 e a agregação (§2.7): do David e do Comitê, depois da validação.

## 3. Validação histórica

Correlação não basta: um fator pode andar com o preço sem antecipá-lo. O teste é o da Qualidade da IA (ADR 0064),
aplicado a cada fator isolado, com a leitura dele reconstruída na data (só o que se sabia, point-in-time):

1. **Direção:** nas datas em que o fator lê alta (ou baixa), o preço do horizonte subiu (ou caiu) mais vezes que nos dois
   benchmarks da tela, Sempre Lateral e Persistência, nas mesmas datas?
2. **Intensidade:** a leitura forte leva a variações maiores que a fraca? Medido pela faixa em que o preço caiu (as
   faixas calibradas do SJC) e pela distância em faixas.
3. **Horizonte:** um resultado por horizonte; um fator só vale onde passa (a matriz da §2.10 é a hipótese, a validação a
   confirma ou corrige).
4. **Episódios, não dias:** sinais em datas vizinhas contam uma vez, para a autocorrelação não inflar o n; sempre com o
   n à mostra.
5. **Fora da amostra:** limiares calibrados na primeira parte do histórico e testados na segunda.
6. **Por janela de safra:** F1 e F2 testados só dentro da janela da R1.

Limite conhecido: o dado do agro anterior à coleta só existe na versão final (a pergunta 5 do FEL 1, ADR 0055), o que
favorece o fator no teste; o resultado diz isso.

Um fator que não passa nem nos 30 e 90 dias não vai ao prompt como pressão: fica como contexto ou sai, como o refino do
petróleo e os fundos do café (ADRs 0093 e 0089).

### 3.1 Preço oficial e série de pesquisa

| Série | Papel | Onde entra | Onde nunca entra |
|---|---|---|---|
| **SJC (B3)** | Preço oficial e operacional do FinMind | Centro de Decisão, faixas em produção, realizado, Qualidade da IA | — |
| **Chicago diário** (fase 2) | Série auxiliar de pesquisa | Validação histórica dos fatores e das regras (1 e 7 dias), calibração inicial das faixas, teste incremental (§3.2) | Prompt, Centro de Decisão, realizado e Qualidade da IA |
| **FMI mensal** (oficial, desde 1992) | Série auxiliar de pesquisa | Validação de 30 e 90 dias, margem candidata | Idem |

O uso de Chicago como pesquisa é legítimo porque o SJC **é** o preço de Chicago convertido (uma saca de 60 kg tem
2,2046 bushels): a série longa reproduz o mesmo preço, só com mais história.

**O Yahoo só para pesquisa:** aceitável nessas condições, e não como preço oficial:
- os riscos: fonte não oficial, endpoint sem documentação nem garantia, termos que não preveem coleta automática (o
  mesmo caso do Brent, ADR 0096), série contínua com saltos na rolagem e possíveis erros;
- as condições:
  - marcada como não oficial no catálogo;
  - conferida contra o SJC no período em comum: o ajuste do SJC dividido por 2,2046 tem de bater com o ajuste do mesmo
    vencimento em Chicago, e a série só serve se ficar dentro de 0,5% em pelo menos 99% dos dias;
  - retornos que atravessam uma rolagem saem do teste;
  - todo resultado de validação diz que a série é do Yahoo.
- Se a conferência falhar, a validação de 1 e 7 dias fica só com o SJC, e o resultado diz que o histórico é curto.

### 3.2 Contribuição incremental

Não basta cada fator funcionar sozinho: ele tem de acrescentar algo ao que já entrou. A ordem é **F1 → F2 → F3 → F4**.
Para cada fator novo X, contra o conjunto S dos já aceitos, por horizonte:

1. **Combinação de S, só para o teste:** voto simples (cada fator ativo vale um; vence a maioria; empate é lateral). Não
   é peso nem proposta de agregação: é o instrumento mais simples para comparar.
2. **Concordância:** se X concorda com S em 80% ou mais dos episódios em que os dois estão ativos, X mede o mesmo
   fenômeno: vira confirmação, não fator.
3. **Desempate:** nos episódios em que X e S discordam, X tem de acertar a direção em mais da metade, e S com X não pode
   acertar menos que S sozinho.
4. **Cobertura nova:** nos episódios em que S está lateral e X está ativo, X tem de bater os dois benchmarks.
5. **Mínimo de 20 episódios** em cada teste; abaixo disso, o resultado é "inconclusivo", que não aprova.

As regras não passam pelo teste de fator (não têm direção); cada uma tem o seu:
- **R1:** F1 e F2 dentro da janela acertam mais que fora dela? Se não, a janela está errada.
- **R2:** a variação depois dos sinais de F1, F2 e F3 é maior com o balanço apertado que com o folgado (distância em
  faixas e frequência da faixa forte, em 30 e 90 dias), separando choques de alta e de baixa? Se não, a R2 vira
  contexto.
- **R3:** as leituras com papel EXCESSO ou extremo contra acertam a direção de forma diferente das sem papel? Se não,
  ela segue só informativa, como no café; se sim, a próxima etapa discute um efeito na confiança.

## 4. Plano

| Etapa | O quê | Portão |
|---|---|---|
| 0 | Decisões da §2.15, inclusive se e quando a soja entra | Comitê e David |
| 1 | Reconhecimento das extensões da §2.13 e ADR com a autorização ("só aquisição") | Usuário |
| 2 | Coleta e backfills da fase 1 | — |
| 3 | Fatores e regras como proposta na tela de metodologia, com a validação da §3 | — |
| 4 | Pesos e agregação; prompt, leitura diária, Centro de Decisão e Qualidade da IA | Pesos do David; aprovação do Comitê (ADR) |
