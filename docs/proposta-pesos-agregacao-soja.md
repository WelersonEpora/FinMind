# Proposta — Pesos e agregação da soja (v1.1)

**Situação: não adotada.** O Comitê, com o David, decidiu em 2026-10-08 (ADR 0116, adendo) pesos fixos por fator (F1 e
F2 Alto, F3 Médio, F4 Baixo), a matriz da §2.10 como relevância (orientação ao prompt, não peso) e a agregação da IA, como
no milho e no café, sem a soma ponderada por horizonte desta proposta. O texto abaixo fica como registro.

Proposta do FinMind para o Comitê e o David (v1.1, 2026-10-08). É a etapa que a proposta da soja deixou para
depois (`docs/proposta-ativo-soja.md`, §2.7 e item 8 da §2.15). **Nenhum número daqui é do David:** os pesos são dele, e
esta é uma sugestão para ele aceitar, mudar ou recusar. Nada daqui é decisão do Comitê. Até a aprovação, nada vai ao
motor, ao prompt nem ao Centro de Decisão.

A v1.1 corrige a v1 do mesmo dia depois de uma revisão crítica (§10).

## 1. O que o histórico já ensinou

O café e o milho tiveram agregação em código, com pesos por horizonte e um score (ADRs 0066 e 0081). Medida no
histórico da B3, como a Qualidade da IA mede uma leitura, ela **não superou o "sempre lateral" em nenhum horizonte**, e
quando saía do lateral errava a direção na maior parte das vezes (no café, de 18% a 37% de acerto). Saiu do prompt nos
dois ativos e ficou só na tela de metodologia.

Três lições valem para a soja:

1. **O motor sai do lateral demais.** As faixas são calibradas para cerca de 40% lateral, 40% leve e 20% forte; um
   motor que só fala "lateral" acerta a faixa em cerca de 40% dos dias. Ele só deve sair do lateral quando os fatores
   somam força de verdade, e não para reproduzir a frequência do preço.
2. **Redistribuir o peso de um fator sem dado faz um fator sozinho decidir.**
3. **Sem teste antes, não há como saber.** No café, a agregação foi à produção antes do teste e saiu depois.

## 2. Pesos por horizonte: uma hipótese inicial, não uma medida de contribuição

**A regra:** o peso vem da matriz fator × horizonte da proposta aprovada (§2.10): Alta = 3, Média = 2, Baixa = 1,
normalizada em cada horizonte. Na fase 1, o F3 usa a relevância da fase 1 (a revisão mensal do WASDE).

| Fator | 1 dia | 7 dias | 30 dias | 90 dias |
|---|---:|---:|---:|---:|
| F1. Oferta dos EUA | Média → 2 | Alta → 3 | Alta → 3 | Média → 2 |
| F2. Oferta da América do Sul | Baixa → 1 | Média → 2 | Alta → 3 | Média → 2 |
| F3. Demanda pela soja dos EUA | Baixa → 1 | Baixa → 1 | Média → 2 | Média → 2 |
| F4. Política | Alta → 3 | Alta → 3 | Média → 2 | Baixa → 1 |

O percentual de cada fator depende de quais fatores estão na janela da safra na data (§3). Com os quatro na janela:
1 dia 29/14/14/43%; 7 dias 33/22/11/33%; 30 dias 30/30/20/20%; 90 dias 29/29/29/14%.

**O que a matriz mede e o que ela não mede.** A matriz diz quanto um fator *pode* mover o preço naquele prazo quando ele
dispara (relevância). O peso de uma soma ponderada deveria refletir também quanto o fator *acerta* quando dispara
(confiabilidade), e isso a matriz não sabe: um fator relevante medido por um observável fraco (o F3 da fase 1, mensal,
pela revisão do WASDE) ganha peso que pode não merecer. Por isso:

- **A favor:** a matriz já foi aprovada, é transparente e não usa o histórico, então não há ajuste ao dado. Os pesos
  são economicamente coerentes: a política domina o curtíssimo prazo quando há evento; as ofertas dominam 30 dias; a
  demanda ganha peso no prazo em que o WASDE mensal a enxerga.
- **Risco 1, cardinalidade:** 3, 2 e 1 supõem que Alta vale três vezes Baixa. Nenhuma outra escala é mais justificável,
  mas o resultado não pode depender dela: o teste roda também com outras escalas monotônicas (ex.: 2, 1,5 e 1; 4, 2 e
  1) e **só relata a sensibilidade**, sem escolher a melhor (seria ajuste ao histórico).
- **Risco 2, relevância no pico:** a matriz diz "Alta (jun a ago)" no F1 em 7 dias; o peso usa Alta em toda a janela.
  A regra do choque recente (§3) cobre a maior parte disso: fora do pico, o F1 é lido por relatórios, que só contam nos
  dias seguintes à publicação.
- **Risco 3, a matriz é hipótese:** a §3 da proposta valida cada fator por horizonte. Se a validação corrigir a matriz
  (um fator não passa num horizonte), o peso daquele fator naquele horizonte vira zero, pela mesma regra. Os pesos
  seguem a matriz validada, e não o contrário.
- **Nenhum peso domina:** pela §3, nenhum fator passa de 60% do peso em nenhum horizonte e em nenhuma época do ano
  (o máximo é a política em 1 dia, de meados de janeiro ao fim de março).

## 3. O estado de cada fator na data

A v1 tratava "fora da janela", "neutro" e "sem dado" do mesmo jeito: zero, sem redistribuir o peso. Eles não são a mesma
coisa:

| Estado | O que significa | Nota | Peso |
|---|---|---|---|
| **Fora da janela** (R1) | O fator não se aplica nesta época: a regra aprovada diz que ele "não pressiona" | — | **Sai do horizonte:** os pesos se normalizam entre os fatores na janela |
| **Neutro** | O fator foi medido e não há choque | 0 | Fica: o silêncio é informação |
| **Sem choque recente** (1 e 7 dias) | O último relatório saiu antes do horizonte: já está no preço | 0 | Fica, como neutro |
| **Sem dado** | O fator deveria falar e não se sabe o que diria | 0 | Fica, e a confiança cai (§5) |

**Por que tirar o fator fora da janela.** Sem isso, a época conta duas vezes: a R1 já tira o fator, e o peso dele,
parado no denominador, ainda puxa a leitura para o lateral. Na prática, de julho a outubro (o F2 fora da janela), o
motor não conseguiria dar "forte" em 30 dias nem com o F1 e o F3 fortes no mesmo sentido: justamente na fase crítica
da safra americana. A v1 usava esse mesmo argumento contra o peso por mês e não o aplicou a si mesma.

**Por que isso não volta ao problema do café.** No café, o peso do fator **sem dado** ia para os outros. Aqui, neutro e
sem dado continuam no denominador; só sai o fator que a regra aprovada declara fora de época. O F3 e o F4 valem o ano
todo e há sempre o F1 ou o F2 na janela, então todo horizonte tem pelo menos três fatores. A garantia que importa é
outra: **nenhum fator sozinho chega a "forte"** (§4), em nenhuma época.

**Choque recente em 1 e 7 dias.** A proposta aprovada diz que os fatores leem o choque **novo**, e que o F1 em 1 dia é
"alto em dia de relatório". Um relatório de três semanas atrás não é choque para o próximo pregão. Regra, sem número
novo: em 1 e 7 dias, um observável conta só se foi publicado dentro do próprio horizonte (no último pregão, para 1 dia;
nos últimos 7 dias, para 7 dias). Em 30 e 90 dias, vale a leitura do fator como está.

## 4. Como combinar

1. **Nota de cada fator:** a intensidade que o motor já calcula, com o sinal da direção. Fraca = 1, moderada = 2,
   forte = 3.
2. **Score:** S = a média das notas, ponderada pelos pesos dos fatores na janela (§3). S vai de −3 a +3, na mesma
   escala da nota.
3. **Direção:** o sinal de S.
4. **Faixa:** |S| abaixo de 1 é **lateral**; de 1 a 2, **leve**; 2 ou mais, **forte**. Os limites são a própria escala
   da nota: a leitura consolidada é leve quando os fatores somam, em média, pelo menos um choque fraco, e forte quando
   somam pelo menos um moderado.

   A v1 calibrava esses limites nos percentis 40 e 80 de |S|. Isso estava errado por dois motivos. Primeiro, obrigaria
   o motor a sair do lateral em 60% dos dias, tivesse ou não o que dizer: é exatamente a lição 1. Segundo, com a maior
   parte dos dias com S = 0 (sem evento, sem relatório recente), o percentil 40 seria zero, e qualquer sinal viraria
   "leve".

   Consequência dos pesos da §2: um fator sozinho, mesmo forte, chega no máximo a 1,8 (a política em 1 dia, de
   meados de janeiro a março). **"Forte" exige pelo menos dois fatores no mesmo sentido.**
5. **R2 (folga do balanço):** só se passar no teste dela (§6).

Exemplo, 30 dias, em julho. Na janela estão o F1, o F3 e o F4, com pesos 3, 2 e 2 (3/7, 2/7 e 2/7). O F1 dá alta
forte (condição da lavoura no percentil 8), o F3 dá baixa fraca e o F4 está neutro.
S = (3 × 3 − 2 × 1) / 7 = 1,0: alta leve. O F3 aponta contra: a confiança é baixa.

## 5. Confiança

A v1 punha "no máximo média" sem dizer por quê. São três coisas diferentes:

- **A limitação da validação:** o histórico é curto. Isso diz quanto confiamos nas regras do motor, não quanto uma
  leitura específica é firme. Não justifica, sozinha, um teto na leitura.
- **A confiança da leitura:** deve sair do estado do motor na data, por regra:
  - **baixa:** um fator ativo aponta contra a direção, um fator na janela está sem dado, ou só um fator está ativo;
  - **alta:** leitura forte, todos os fatores na janela com dado, pelo menos dois ativos no mesmo sentido e nenhum contra;
  - **média:** o resto.
- **Uma restrição provisória:** hoje ninguém mede se "alta" acerta mais que "média". A calibração da confiança está em
  aberto na Qualidade da IA (ADR 0064). Enquanto isso, uma leitura **alta** sai como **média**. É uma regra provisória
  e declarada, com saída: ela cai quando houver pelo menos 20 episódios de confiança alta (o mínimo da §3.2 da
  proposta) e a direção deles acertar pelo menos tanto quanto a das leituras de confiança média.

## 6. R2: folga do balanço

**O mecanismo é defensável.** Com estoque apertado, a oferta não amortece um choque, e o preço precisa se mover mais
para racionar o uso. Com estoque folgado, o estoque absorve. É a relação clássica entre estoque e volatilidade das
commodities armazenáveis. Mudar a **intensidade**, e não a direção nem o peso, é coerente com isso (§2.6 da proposta).

**A forma, "±1 nível", não é.** Ela é só a forma mais simples, sem evidência, e tem defeitos:

- **Não é uniforme:** de fraca para moderada a nota dobra (1 para 2); de moderada para forte, sobe 50%; a forte não
  sobe, e a fraca não desce. O efeito real depende de onde o fator está.
- **A simetria é improvável:** a teoria da estocagem prevê efeito maior na alta (o estoque não fica negativo e o preço
  dispara) do que na baixa. A proposta aprovada já deixa isso em aberto.
- **Pode desfazer a medição aprovada:** se a confirmação diverge, o fator fica limitado a fraca (§2.5). A R2 não pode
  subir esse fator: o limite da medição vem antes e prevalece.

**F1, F2 e F3, e não o F4.** O canal vale para os três. O choque da América do Sul também move mais o preço com os EUA
apertados, porque a demanda migra para a soja americana. No F4, o efeito tem sinal ambíguo (uma tarifa chinesa com os
EUA apertados pode pesar menos), e o evento não tem intensidade por percentil. Fica de fora, como a proposta diz.

**Recomendação:** a R2 entra na agregação em código **só como hipótese de teste**, nas duas formas (sem efeito e ±1
nível, separando alta de baixa). Ela passa a valer só se passar no teste da §3.2 da proposta. Se não passar, vira
contexto, como a proposta já prevê.

**Onde testar:** no SJC, desde 2022, há uns quatro anos-safra e pouca variação do estado do balanço: o teste seria, na
prática, de quatro pontos. O teste certo é em 30 e 90 dias (onde a R2 importa, pela matriz), com:

- as edições do WASDE desde 2011 (as versões de cada data já estão na base);
- o preço mensal do FMI (oficial, desde 1992) e, se autorizado, o Chicago diário (§8);
- **agrupado por ano-safra**: o estado do balanço muda devagar, e dias do mesmo ano não são independentes.

São cerca de 15 anos-safra, com poucos apertados. É provável o resultado "inconclusivo", e então a R2 fica como
contexto no código.

**No prompt da IA nada muda:** a proposta aprovada já manda o estado do balanço com a instrução de que ele muda a
intensidade, e nunca a direção.

## 7. R3: posicionamento dos fundos

A v2.2 aprovada define a R3 como **regra da leitura consolidada**: ela age depois da agregação e **marca o papel dos
fundos** (EXCESSO ou extremo contra), gravado com a leitura, sem mudar direção, faixa nem confiança (§2.3 e §2.6 da
proposta, aprovadas hoje como estão). Ela é regra, e não contexto, porque deixa registro na leitura e permite medir
depois se o papel tem relação com o acerto.

A v1 deste documento estava coerente com isso, mas a frase "só como informação" pode ser lida como "contexto". Fica
mais claro assim:

> **R3: regra da leitura consolidada.** Efeito atual: marca o papel dos fundos (7 e 30 dias). Efeito na confiança:
> **pendente da validação** (§3.2 da proposta). Se as leituras com papel acertarem de forma diferente das sem papel, a
> próxima etapa propõe o efeito.

A hipótese do "movimento esticado" (o extremo dos fundos depois de uma corrida forte de preço) está na v2.2 como algo
para depois, com evidência (§2.6). Ela não está na regra aprovada. Transformar a R3 em regra de risco agora
contrariaria a decisão de hoje e o resultado do café (ADR 0089).

## 8. Histórico curto e o Chicago diário como série de pesquisa

Usar o Chicago diário do Yahoo só como série de pesquisa (o item 7 da §2.15, ainda não decidido) amplia a validação de
verdade, mas menos do que parece:

- **O limite é o dado dos fatores, não o preço.** O F2, o F3 e a R2 leem as edições do WASDE, que existem desde 2011.
  O Chicago antes disso não serve ao teste conjunto. O ganho real é 2011 a 2022: cerca de 11 anos a mais, o que em 90
  dias leva de uns 6 para mais de 40 episódios independentes.
- **A confirmação da Conab só existe desde fev/2025:** antes disso, o F2 é testado sem ela.
- **Parte do dado do agro tem a data de publicação estimada** (Crop Progress, VHI). A versão final favorece o fator,
  como a proposta já avisa.
- **Mudança de regime:** a China como compradora dominante, a guerra comercial de 2018 e o diesel renovável depois de
  2021 mudam a resposta do preço. Um teste dominado por 2011–2021 pode aprovar algo que não vale hoje.
- **Comparabilidade:** a Qualidade da IA mede pelo contrato de cada horizonte no SJC. A série contínua do Yahoo tem
  rolagens; com elas fora, a amostra não é a mesma.

**Condição para não criar uma falsa robustez:** o resultado sai **separado por período** (Chicago 2011–2021 e SJC de
2022 em diante). Um horizonte só passa se passar no período do SJC, ou se for inconclusivo nele e não contrariar o
período do Chicago. Passar só no período do Chicago não aprova nada.

## 9. O portão: por horizonte

A agregação nasce **só na tela de metodologia**, com um script que a roda em qualquer data sem IA (como
`npm run agregacao:cafe`). Cada horizonte entra no prompt e no Centro de Decisão **por si**: um horizonte ruim não barra
os outros, e um bom não depende dos outros.

Para cada horizonte, fora da amostra (§8: a separação por período), com os critérios fixados antes de rodar:

1. superar **os dois** benchmarks da Qualidade da IA (sempre lateral e persistência) em faixa exata **e** em distância;
2. quando sair do lateral, acertar a direção em mais da metade das vezes;
3. pelo menos 20 episódios em cada teste (sinais em datas vizinhas contam uma vez). Abaixo disso, o resultado é
   "inconclusivo", que não aprova.

Os pesos, os limites e as regras não mudam entre um horizonte e outro para "fazer passar": o teste é da mesma
agregação nos quatro.

- **Testar quatro horizontes aumenta a chance de um passar por sorte.** Por isso os critérios são fixados antes, o
  teste é fora da amostra e há uma saída: depois de entrar, se a Qualidade da IA mostrar, em pelo menos 20 episódios,
  que o horizonte não supera os dois benchmarks, ele sai do prompt.
- **Superar os benchmarks é necessário, não suficiente.** A pergunta final é se a agregação melhora a leitura da IA.
  A versão do prompt muda quando um horizonte entra, e a Qualidade da IA compara as leituras com e sem.
- **Expectativa:** em 1 dia, o mais provável é não passar.

## 10. O que mudou da v1 para a v1.1

| # | v1 | v1.1 | Por quê |
|---|---|---|---|
| 1 | Limites da faixa nos percentis 40 e 80 de \|S\| | A própria escala da nota (1 e 2) | Os percentis forçavam o motor a sair do lateral em 60% dos dias, o erro do café |
| 2 | Fator fora da janela conta zero, sem normalizar | Sai do horizonte; neutro e sem dado ficam | Sem isso, a época contava duas vezes e o motor não daria forte na fase crítica dos EUA |
| 3 | Relatório antigo valia em 1 e 7 dias | Só o choque publicado dentro do horizonte | A proposta aprovada lê o choque novo |
| 4 | R2 ±1 nível como regra | Hipótese de teste, sem passar por cima do limite da medição, testada por ano-safra | A forma não tem evidência, nem a simetria |
| 5 | R3 "só como informação" | Regra da leitura, com o efeito na confiança pendente | Mesma regra, redação que não a confunde com contexto |
| 6 | Confiança no máximo média | Regra estrutural, com o teto como restrição provisória declarada e saída | O teto não tinha justificativa como regra do motor |
| 7 | Portão em 30 e 90 dias, depois 1 e 7 | Por horizonte, com critérios prévios e saída | Um horizonte não contamina o outro |
| 8 | Pesos 3, 2 e 1 | Iguais, como hipótese inicial, com a sensibilidade relatada | Relevância não é confiabilidade |
| 9 | Yahoo como alternativa | Com a separação por período | Evitar uma falsa robustez |

## 11. Decisões para o David e o Comitê

1. **Os pesos:** a hipótese inicial pela matriz de relevância (3, 2 e 1), zerada onde a validação da §3 da proposta
   reprovar o fator. Ou o David define outros.
2. **O estado do fator:** fora da janela sai do horizonte; neutro, sem choque recente e sem dado contam zero.
3. **A combinação:** a média ponderada das notas, com a faixa pela escala da nota (1 e 2).
4. **A confiança:** a regra estrutural da §5, e se o teto provisório em "média" vale até a calibração.
5. **A R2:** só como hipótese de teste, por ano-safra, em 30 e 90 dias; contexto se não passar.
6. **A R3:** a redação da §7, com o efeito na confiança pendente da validação.
7. **O portão por horizonte** da §9, com a saída pela Qualidade da IA.
8. **O histórico:** esperar a Qualidade da IA acumular leituras, ou autorizar o Chicago do Yahoo só como série de
   pesquisa, com a separação por período da §8.
9. **Os pesos no prompt antes do portão:** como orientação à IA, como o calendário do milho (ADR 0065), ou só depois.
