# 0116 — A soja aprovada como 5º ativo: fatores, regras e medição até o prompt e o Centro de Decisão

**Status:** aceita (2026-10-08); adendo dos pesos na mesma data.

## Contexto

A proposta da soja como 5º ativo (`docs/proposta-ativo-soja.md`, v2.2, 2026-10-08) foi levada ao Comitê com as decisões
da §2.15. A fase 1, só aquisição de dados, já estava completa (ADRs 0109 a 0115). Nada da soja ia ao motor, ao prompt
nem ao Centro de Decisão.

## Decisão (Comitê, com o David, reunião de 2026-10-08; registrada pelo usuário, Welerson, em 2026-10-08)

1. **Aprovados como propostos** os itens 1 a 6 da §2.15:
   1. a arquitetura: fatores → regras → agregação → leitura (§2.3), com o critério para uma condição nova;
   2. os fatores: F1 (oferta dos EUA), F2 (oferta da América do Sul), F3 (demanda pela soja dos EUA) e F4 (política,
      fator de evento);
   3. as regras: R1 (calendário da safra, aplicabilidade), R2 (folga do balanço, intensidade) e R3 (posicionamento dos
      fundos, igual ao café: só marca o papel na leitura);
   4. a medição: um primário por período, com a troca nas datas das tabelas, a confirmação que diverge limitando o fator
      a "fraca" e o contexto só informando (§2.5);
   5. os baselines (§2.8) e os limites das regras: R2 nos percentis 20 e 80; R3 nos percentis 10 e 90;
   6. a margem de esmagamento: testar; se passar, vira confirmação do F3. **Não vai ao prompt nesta versão.**
2. **Até o prompt e o Centro de Decisão**, como o milho e o café (ADRs 0058 e 0062): os fatores e as regras vão ao
   prompt diário como orientação em texto, a leitura de tendência da IA aparece no Centro de Decisão, e o realizado e a
   Qualidade da IA a medem. Leitura de tendência, nunca recomendação de compra ou venda.
3. **O preço de referência** é o SJC da B3 (premissa da proposta, §2.2): um vencimento por horizonte, o mais próximo que
   ainda negocia depois da data-alvo, com o aviso de menos de 100 contratos no dia (como o ADR 0078), e as faixas
   calibradas no próprio SJC (percentis 40 e 80 de cada horizonte, como o ADR 0079).

**Fica de fora desta decisão:**

- **os pesos de F1 a F4 e a agregação** (item 8): decididos depois, na mesma data (o adendo, abaixo);
- **as fontes da fase 2** (item 7): o Export Sales e o Chicago diário do Yahoo como série de pesquisa;
- **a validação histórica da §3 antes do prompt.** A proposta a punha antes do prompt (etapa 3 do plano). Com a soja indo
  já ao prompt, como o milho e o café, a validação passa a ser feita pela Qualidade da IA e por um teste histórico
  depois. Um fator que não passar sai do prompt como pressão (§3 da proposta).

## Implementação

**Catálogo.** Os quatro fatores entram em `shared/fatores-fel1.js` com `peso: "A definir"` e a origem
(`origem: "ADR 0116"`): não são do FEL 1. A lista continua sendo a única dos fatores (os eventos marcam o F4 por ela).
Os códigos: `SOJA_OFERTA_EUA`, `SOJA_OFERTA_AMERICA_SUL`, `SOJA_DEMANDA_EUA` e `SOJA_POLITICA`.

**Regras como itens próprios da metodologia.** As regras R1, R2 e R3 são calculadas como os fatores (`factors/`), mas
não são fatores: não têm peso, não têm pressão e não estão no catálogo. A metodologia ganha o campo `regra` (sigla, o
que afeta, a dimensão e quando vale). No prompt, cada regra tem o seu bloco, com o estado na data e o que ele muda; na
tela, uma seção "Regras". Os códigos: `SOJA_R1_CALENDARIO`, `SOJA_R2_FOLGA_BALANCO` e `SOJA_R3_FUNDOS`.

**Fatores** (um ponto por data em que um dado novo é publicado ou em que uma janela muda; point-in-time):

- **F1, oferta dos EUA** (`oferta-eua-soja.factor.js`): na janela, da intenção de plantio (Prospective Plantings) ao
  WASDE de janeiro do ano seguinte. Três períodos, pelas publicações:
  - até o 1º boletim de condição: a **área**: a intenção de plantio contra a área final do ano anterior; o Acreage
    contra a intenção do mesmo ano;
  - do 1º boletim de condição ao WASDE de agosto: a área e a **produtividade** (condição boa + excelente no percentil
    da mesma semana dos anos anteriores), com o VHI dos EUA como confirmação da produtividade. Com os dois no mesmo
    lado, vale o mais intenso; em lados opostos, o de percentil mais extremo, limitado a fraca;
  - do WASDE de agosto ao de janeiro: a **revisão da produção** no WASDE contra a edição anterior, com a condição como
    confirmação até o último boletim do ano.
- **F2, oferta da América do Sul** (`oferta-america-sul-soja.factor.js`): de 1º de novembro a 30 de junho, na safra
  plantada no ano de novembro. Novembro e de abril a junho: a revisão da produção de Brasil + Argentina no WASDE, com a
  Conab (Brasil) como confirmação. De dezembro a março: o VHI sobre a soja no percentil da mesma semana (dezembro, o
  Brasil; janeiro e fevereiro, Brasil e Argentina ponderados pela produção da safra anterior no WASDE; março, a
  Argentina), com o WASDE e a Conab como confirmação.
- **F3, demanda pela soja dos EUA** (`demanda-eua-soja.factor.js`): a revisão do uso (exportação + esmagamento) dos
  EUA no WASDE, na safra mais nova da edição, contra a edição anterior; a revisão da importação da China como contexto.
- **F4, política**: fator de evento, com a janela de 7 dias (como a geopolítica do petróleo, ADR 0098). A leitura diária
  de eventos da soja (ADR 0115) passa a marcar `SOJA_POLITICA` nos eventos de política comercial e de biocombustíveis
  (`eventos-soja-diaria.md` v2); os demais seguem sem fator e vão à seção de eventos da base do prompt. A leitura dos
  quatro ativos não muda.

**A intensidade** de F1 a F3 é a posição da medida no próprio histórico, como no café (calibração do FinMind, ADR 0060):
neutra do percentil 20 ao 80, forte abaixo do 10 ou acima do 90. A proposta aprovada define os baselines (§2.8), não
esses limites; eles são parâmetros do Comitê na tela. A confirmação que aponta o lado oposto, fora da faixa neutra, limita
o fator a fraca (a medição aprovada).

**Regras:**

- **R1** (`calendario-soja.regra.js`): a fase da cultura em cada país (EUA pelo Crop Progress, Brasil e Argentina pelo
  calendário da §2.4) e se F1 e F2 estão na janela.
- **R2** (`folga-balanco-soja.regra.js`): o estoque final sobre o uso dos EUA, na safra mais nova de cada edição do WASDE,
  no percentil das edições do mesmo mês nos anos anteriores: apertado até o percentil 20, folgado a partir do 80. O
  estoque/uso mundial e o Grain Stocks, como contexto. No prompt: muda a intensidade dos choques de F1, F2 e F3, nunca a
  direção; o tamanho do efeito não é definido (a sugestão de agregação o trata como hipótese de teste).
- **R3** (`fundos-soja.regra.js`): o COT da soja na CBOT (managed money, em % dos contratos em aberto) no percentil de 3
  anos, o molde do café: extremo comprado no 90 ou acima, vendido no 10 ou abaixo. Só em 7 e 30 dias; só marca o papel
  (`posicionamentoCot`: EXCESSO ou SEM_PAPEL com o extremo contra), sem mudar direção, faixa nem confiança.

**Leitura diária.** `shared/analise-diaria-soja.js` (v1) e `ai/prompts/soja-analise-diaria.md` (v1), no molde do café:
o SJC por horizonte, a curva, os fatores e as regras, a matriz fator × horizonte da §2.10 como orientação de
relevância (não é peso), os eventos na seção da base. O coletor é `soja-analise-ia-diario`. O Centro de Decisão ganha a
soja (o SJC e o preço mensal do FMI), e o realizado e a Qualidade da IA a medem pelo SJC.

**O que a implementação decidiu (operacionalização do FinMind, para o Comitê conferir):**

- **Empate no F1:** com a área e a produtividade em lados opostos e igualmente extremas (o percentil 0 e o 100, comum num
  ano fora da curva), vale a publicada por último, porque o fator lê o choque novo. A proposta diz só "vale o mais
  extremo".
- **O vencimento do SJC:** no banco, o SJC para de negociar no fim do mês **anterior** ao do contrato (o SJCF26 em
  29/12/2025, o SJCH26 em 26/02/2026). O limite de um contrato para uma data-alvo é o dia 25 do mês anterior, do lado
  seguro (`centro-decisao.service.js::limiteDoSjc`). A regra do dia 15 do CCM e do ICF escolheria um contrato já vencido.
- **As faixas** (percentis 40 e 80 da variação absoluta do SJC no contrato de cada horizonte, 2022-03-21 a 2026-10-07, 886
  a 948 pregões, banco de dev): IMEDIATO 0,5 / 1,4%; CURTO 1,2 / 3,0%; MEDIO 2,6 / 6,4%; LONGO 2,9 / 7,9%. O LONGO fica
  perto do MEDIO: o histórico é curto e tem o buraco de 2023. Provisórias, como as do café.
- **O histórico mínimo:** 10 valores anteriores para a posição de uma medida de F1 a F3 (as revisões do WASDE começam em
  2011: a da produção dos EUA ganha leitura em 2013); 5 anos com a edição do mesmo mês na R2 (o estado começa em 2016).
- **Uma edição do WASDE sem mudança na série do fator** conta como revisão zero (as edições são marcadas pelo balanço
  inteiro de EUA, mundo, Brasil, Argentina e China): sem isso, a revisão da edição anterior pareceria a atual.

**Conferido em dev (2026-10-08):** os fatores nos episódios conhecidos (a seca argentina de 2022/23 dá alta forte em
março; a guerra comercial de 2019 dá a R2 folgada; o Acreage de 2023, alta forte); e uma leitura real da IA
(`gemini-3.8-flash`, 15.547 tokens), válida no formato: lateral em 1 e 7 dias, alta leve com confiança baixa em 30
dias (o F3, a demanda revista para cima), lateral em 90; os fundos em extremo comprado como SEM_PAPEL com o extremo
contra, sem mudar a leitura.

## Consequências

- A soja segue o mesmo caminho do milho e do café: a IA combina os fatores pelo prompt, com o peso fixo de cada um (o
  adendo), e a Qualidade da IA mede as leituras contra os dois benchmarks. Não há agregação em código.
- O histórico do SJC é curto (desde 2022-03-21, com um buraco em 2023): as faixas são provisórias, como as do café.
- A margem de esmagamento fica fora do prompt até o teste.
- A metodologia da soja nasce com os fatores marcados como validados pelo Comitê (ADR 0108, item 3: o que roda está
  validado); um ajuste segue a regra de sempre, validado no Comitê antes de ir ao sistema.

## Adendo (2026-10-08): os pesos e a relevância por horizonte

**Decisão** (Comitê, com o David, 2026-10-08; registrada pelo usuário, Welerson). Aprovada a tabela levada ao Comitê:

| Fator | Peso | 1 dia | 7 dias | 30 dias | 90 dias |
|---|---|---|---|---|---|
| F1. Oferta dos EUA | 3 (Alto) | Média | Alta | Alta | Média |
| F2. Oferta da América do Sul | 3 (Alto) | Baixa | Média | Alta | Média |
| F3. Demanda pela soja dos EUA | 2 (Médio) | Baixa | Baixa | Média | Média |
| F4. Política | 1 (Baixo) | Alta | Alta | Média | Baixa |

1. **O peso é fixo por fator**, o mesmo em todos os horizontes, na escala do FEL 1 (3 = Alto, 2 = Médio, 1 = Baixo),
   como nos outros ativos. A matriz por horizonte **não** vira peso por horizonte.
2. **A matriz de 1, 7, 30 e 90 dias é relevância** (a da §2.10 da proposta, com as notas dela): diz em que prazo o fator
   costuma mover o preço e vai ao prompt como orientação à IA.
3. **A R1 (calendário da safra) continua regra**, não fator: é ela que controla quando F1 e F2 atuam. Os dois têm peso
   Alto por serem as ofertas principais; na maior parte do ano, a janela deixa só um deles atuando.
4. **O F4 tem peso 1, mas um evento político grave pode ser a força de maior impacto no curto prazo.** O peso é
   estrutural; o impacto do evento vem da gravidade dele e da relevância alta em 1 e 7 dias.
5. **A agregação segue a do milho e do café:** a IA combina os fatores pelo prompt. Nenhuma soma ponderada em código
   para a soja. A sugestão do FinMind (`docs/proposta-pesos-agregacao-soja.md`, v1.1) não foi adotada.
6. **R1, R2 e R3 seguem como regras ou contexto, sem peso próprio.**

**Implementação:**

- **Catálogo** (`shared/fatores-fel1.js`): o peso de cada fator da soja (Alto, Alto, Médio, Baixo), com a origem ADR 0116.
  O valor "A definir" deixou de existir.
- **Metodologia** (`shared/metodologia-soja.js`, v2): a relevância como dado próprio (`pesos.relevancia`, validado em
  `metodologia-base.js`: todos os fatores, os quatro horizontes, só Alta, Média ou Baixa), separada do peso. As decisões
  de cada fator citam o peso.
- **Prompt** (`soja-analise-diaria.md`, v2): o peso vai na tabela 2.3 e no título de cada fator, como nos outros ativos;
  o item 2 do bloco 4 orienta pelo peso como ordem de partida (como no café) e separa peso, relevância, intensidade e
  regra; o item 1 escreve "relevância alta" por extenso. Um teste confere que a relevância do prompt é a da metodologia.
- **Tela:** o card "Peso por fator e relevância por horizonte" em "Pesos e relações", com o peso numa coluna e a
  relevância de cada horizonte nas outras; o quadro "Peso" de cada fator diz "fixo, do Comitê".

**Revisão de peso, relevância, intensidade e regra.** Pontos que confundiam e foram corrigidos:

- No prompt v1, a relevância se escrevia "7 dias alta", que a IA podia ler como direção de alta do preço. Passou a
  "relevância alta".
- A tela e o resumo diziam "a definir pelo especialista"; o peso da soja é do Comitê. A linha do peso na explicação do
  fator e o bloco do F4 diziam "peso a definir" em minúsculas; passam a dizer o peso como nos outros ativos.
- A relevância só existia em texto no prompt. Agora é dado da metodologia, e a tela a mostra ao lado do peso, sem
  misturar as duas.
- Não muda: a intensidade (fraca, moderada ou forte) é o tamanho do choque na data, calculado pelo motor, e não depende
  do peso; as regras não têm peso nem direção; a R2 muda a intensidade lida pela IA, não o peso.
