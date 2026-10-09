# Proposta — Dólar (USD/BRL) como 6º ativo do FinMind (v1)

**Situação:** **aprovada** pelo usuário em 2026-10-09, com o mesmo poder de decisão do David (ADR 0126): as 8 decisões da
§4 (ADR 0117, adendo, com as perguntas do relatório: os 3 pontos que faltavam nos pesos, o petróleo pela regra linear, as
reservas como contexto e a atividade dos EUA sem fator próprio), até o prompt diário e o Centro de Decisão. A
implementação e o que ela operacionalizou estão no ADR 0126. O texto abaixo é o da v1, com as decisões anotadas. A fase 1
(só aquisição de dados) está nos ADRs 0117 a 0125.

**Base:** o relatório do Comitê de 2026-10-08 sobre o dólar (28 fatores em 8 blocos, com pesos e regras de alta e de
baixa) e a decisão do ADR 0117: a leitura é diária e de tendência, nos moldes dos outros ativos; o day-trade fica para
uma fase 2, num módulo próprio. **As direções vêm do relatório.** As janelas e os limiares que o relatório não dá são
calibração do FinMind, marcados como tal e ajustáveis pelo Comitê, como no café e na soja.

## 0. O que muda ao passar do relatório para a versão diária

O relatório desenha um motor intradiário: tick a tick, VWAP, book, janelas da PTAX. A versão diária, que é o que o
FinMind faz nos outros ativos, perde o que só existe dentro do pregão:

- **O bloco mais pesado é o que mais perde:** "preço, microestrutura e fluxo" (fatores 1 a 7) tem 28% no relatório.
  Na versão diária sobram o fluxo cambial à vista (3, em parte) e o posicionamento da CFTC (7).
- **Três fatores não têm fonte gratuita:** o fluxo das corretoras (4), o FedWatch (11) e o risco-país (17: o EMBI+ parou em
  2024-07, e o CDS é pago). O minério (20) não tem fonte coletada; trazê-lo seria fonte nova.
- **Algumas séries chegam com defasagem:** o índice do dólar do Fed sai uma vez por semana; o fluxo cambial, às quartas,
  com os dias até a sexta anterior; a balança, por volta do dia 25 do mês seguinte. Um dado defasado não serve para o
  horizonte de 1 dia: isso entra na matriz fator × horizonte (§2.7).

Os pesos do relatório somam 97, não 100. Os 3 pontos que faltavam foram para os fatores 10, 16 e 17 (decisão do usuário,
2026-10-09, ADR 0117, adendo). Somando, sobram **69 dos 100 pontos de peso** na versão diária (o ponto do 17 cai com ele).

## 1. Os 28 fatores do relatório na versão diária

| # | Fator do relatório | Peso | Na versão diária | Dado (já coletado) |
|---|---|---|---|---|
| 1 | Tendência intraday do DOL (VWAP, médias 9/21) | 5 | Fase 2 (intradiário) | — |
| 2 | Volume e participação no DOL/WDO | 3 | Fase 2 (sem direção própria: pergunta 8) | — |
| 3 | Fluxo cambial estrangeiro (à vista + futuro) | 5 | **F1**, só o à vista | Fluxo cambial contratado, financeiro (ADR 0125) |
| 4 | Fluxo corporativo (corretoras) | 4 | Sem fonte | — |
| 5 | Gap de abertura e NDF | 3 | Fase 2 (o Up2Data não traz a abertura; o NDF é pago) | — |
| 6 | Volatilidade realizada (ATR) | 4 | Fase 2 (sem direção própria: pergunta 8) | — |
| 7 | Posicionamento especulativo (CFTC) | 4 | **R1** (regra, sem peso: §2.4) | COT do real, TFF (ADR 0120) |
| 8 | DXY | 5 | **F2** | Índices do dólar do Fed (o DXY é licenciado) |
| 9 | Euro e iene | 3 | **F2** | DEXUSEU e DEXJPUS |
| 10 | Dólar contra emergentes | 4 (era 3) | **F2** | DTWEXEMEGS (ADR 0119) |
| 11 | Expectativa de juros dos EUA (FedWatch) | 3 | **F3**, pela meta do Fed e pelo 2 anos | Meta do Fed, DGS2 |
| 12 | Treasury 2 anos | 4 | **F3** | DGS2 (ADR 0119) |
| 13 | Treasury 10 anos | 4 | **F3** | DGS10 |
| 14 | Curva 2s10s e juro real | 3 | **F3** | DGS10 − DGS2; DFII10 |
| 15 | Curva do DI (F27, F29, F31) | 5 | **F4** | DI1 da B3 (ADR 0118) |
| 16 | VIX | 5 (era 4) | **F5** | VIXCLS (ADR 0119) |
| 17 | Risco Brasil (EMBI+ e CDS) | 5 (era 4) | **Fora** (sem fonte gratuita; decisão do usuário, 2026-10-09) | — |
| 18 | S&P 500 futuro | 2 | **F5**, pelo índice à vista | SP500 (ADR 0119) |
| 19 | Petróleo | 4 | **F6** | Brent e WTI (EIA) |
| 20 | Minério de ferro | 3 | Sem fonte coletada | — |
| 21 | Café | 2 | **F6** | ICF (B3) |
| 22 | Soja e milho | 2 | **F6**, pela soja (o milho da B3 é cotado em reais: §2.3) | SJC (B3) |
| 23 | Ouro | 3 | **F2**, como contexto (§2.3) | GLD (B3) |
| 24 | Focus | 4 | **F7** | Focus, com o primário (ADR 0121) |
| 25 | Score fiscal e político | 4 | **F8** (evento) | Leitura de eventos do dólar (ADR 0124) |
| 26 | Balança e transações correntes | 2 | **F7** | Balanço de pagamentos (ADR 0123) |
| 27 | Reservas e atuações do BCB | 2 | **F8** (a atuação extraordinária); reservas como contexto | Eventos (ADR 0124); atuações (ADR 0122); reservas |
| 28 | Calendário macro e janelas da PTAX | 3 | **F8** (o dado que surpreende); a janela da PTAX é intradiária | Eventos (ADR 0124) |

## 2. Arquitetura

### 2.1 Objetivo

Ler a tendência do dólar em quatro horizontes (1, 7, 30 e 90 dias), com faixa e confiança, como nos outros ativos.
**Leitura de tendência, nunca recomendação:** os estados "COMPRA USD" e "VENDA USD" do relatório viram tendência de
alta, lateral ou de baixa do dólar. A pontuação de -200 a +200, os limiares de ±60, a zona morta e os estados de ordem
do relatório ficam com a fase 2 ou com a agregação (§2.6), não com esta leitura.

### 2.2 Preço de referência (decidido)

**A PTAX de venda** (BCB, desde 1994, já no FinMind). Mede todos os horizontes desde o primeiro dia e é a taxa oficial do
mercado; não tem vencimento, rolagem nem mínimo de contratos. Faixas calibradas na própria PTAX (percentis 40 e 80 de
cada horizonte), como nos outros ativos (ADR 0079). Decidido pelo usuário em 2026-10-09. O ajuste do DOL ficou de fora como
referência: ~15 meses de histórico no Up2Data (sem faixas nem validação de 90 dias), rolagem mensal com o diferencial
de juros embutido (uma série contínua seria escolha nossa) e a janela de 15h50 a 16h00, que o próprio relatório chama
de ruidosa (§2.5). Nos horizontes de 7, 30 e 90 dias as duas dão quase sempre a mesma direção; a diferença está no de
1 dia, que mede a PTAX contra a do dia anterior, não o fechamento contra o ajuste (a métrica do §11 do relatório). O
ajuste do DOL vai à leitura como contexto, e a fase 2 (day-trade) o adota como referência.

### 2.3 Os fatores: os blocos do relatório (decidido)

O relatório agrupa os 28 fatores em 8 blocos "ortogonais" e veda "somar indicadores como votos". A proposta leva isso
até o fim: **cada bloco vira um fator, com uma só direção, e os fatores do relatório viram os observáveis dele.** Dentro
de um fator, um observável é o **primário** (dá a direção e a intensidade), outro pode ser **confirmação** (se aponta o
lado oposto, limita a intensidade a fraca; nunca cria sinal) e o resto é **contexto** (vai ao prompt, não muda nada), a
mesma medição da soja. Assim, o 2 anos, o 10 anos e a inclinação não são três votos sobre o mesmo juro americano (a
pergunta 2 do ADR 0117).

| Fator | Bloco do relatório | Primário | Confirmação | Contexto | Peso do relatório que sobra |
|---|---|---|---|---|---|
| F1. Fluxo cambial | 1 (fator 3) | Saldo do fluxo financeiro | Saldo total | Saldo comercial; exportação e importação | 5 |
| F2. Dólar global | 2 (8 a 10) e o ouro (23) | Índice do Fed contra emergentes | Índice amplo do Fed | Euro, iene; ouro | 15 |
| F3. Juros dos EUA | 3 (11 a 14) | Treasury de 2 anos | Treasury de 10 anos | 2s10s, juro real, meta do Fed | 14 |
| F4. Juros do Brasil | 4 (15) | A curva do DI1 nos três vértices | — | — | 5 |
| F5. Aversão a risco global | 5 (16 e 18) | VIX | S&P 500 | — | 7 |
| F6. Commodities (termos de troca) | 6 (19, 21 e 22) | Brent, café (ICF) e soja (SJC), pela maioria | — | — | 8 |
| F7. Expectativas e contas externas | 7 (24 e 26) | Revisão do IPCA do ano seguinte (Focus) | Revisão da Selic (Focus) | Primário e câmbio do Focus; balança e transações correntes | 6 |
| F8. Eventos domésticos e de política | 7 e 8 (25, 27 e 28) | Fator de evento (leitura do dólar) | — | Reservas; atuações rotineiras | 9 |

As direções, do relatório:

- **F1. Fluxo cambial:** saída líquida (saldo financeiro negativo) aponta alta do dólar; entrada, baixa. A medida é o saldo
  acumulado das últimas 4 semanas divulgadas, no percentil do histórico. A fonte é semanal e chega com 5 a 12 dias:
  não lê o horizonte de 1 dia.
- **F2. Dólar global:** o dólar subindo contra os emergentes aponta alta do dólar contra o real; caindo, baixa. O índice
  sai uma vez por semana: o F2 não lê o horizonte de 1 dia (o euro e o iene, diários, vão como contexto). **O ouro é
  contexto**, não confirmação: o próprio relatório (§2.3 c) diz que, em aversão a risco, o ouro e o dólar sobem juntos.
  Os 3 pontos de peso do fator 23 ficam no F2.
- **F3. Juros dos EUA:** o 2 anos subindo aponta alta do dólar; caindo, baixa. A meta do Fed faz o papel do FedWatch: uma
  decisão fora do esperado chega como evento (F8, política monetária).
- **F4. Juros do Brasil:** "abertura generalizada" (os três vértices subindo) aponta alta do dólar; "fechamento" (os três
  caindo), baixa. Vértices mistos são neutros. Os vértices são os do relatório (F27, F29 e F31) e andam com o tempo: o
  janeiro mais próximo de 1, 3 e 5 anos.
- **F5. Aversão a risco:** o VIX acima de 20 e subindo aponta alta do dólar; abaixo de 20 e caindo, baixa (o limiar é do
  relatório). Fora disso, neutro.
- **F6. Commodities:** a maioria entre Brent, café (ICF) e soja (SJC), os três cotados em dólar, caindo aponta alta do
  dólar; subindo, baixa (com três, não há empate). **O milho da B3 (CCM) fica fora:** é cotado em reais, e parte do
  movimento dele é o próprio dólar convertido; a soja representa o fator 22 ("soja e milho"). A "maioria" é proposta do FinMind: o relatório dá uma regra por commodity, e somá-las
  seria votar dentro do bloco. **O petróleo segue a regra linear da tabela** (decisão do usuário, 2026-10-09): no histórico
  (2000 a 2026, janelas de 20 dias úteis), a versão condicional da §2.3 do relatório (só choque de demanda, separado pelo
  VIX) não antecipou a PTAX melhor que a linear (53% nas duas, na janela seguinte); as duas só andam junto com o dólar na
  mesma janela (65% e 71%). A ressalva da §2.3 vai ao prompt como contexto: num choque de oferta (evento de geopolítica ou
  da OPEP+ na semana), o efeito do petróleo sobre o real é incerto. A validação (§3) testa as duas versões; se nenhuma
  antecipar, o petróleo vira só contexto.
- **F7. Expectativas e contas externas:** a revisão semanal do IPCA do ano seguinte no Focus para cima (expectativa
  desancorando) aponta alta do dólar; para baixo, baixa. A revisão da Selic confirma, na direção do relatório ("elevação
  de IPCA e juros"). Nuance para a validação: Selic esperada mais alta também atrai carry e pode derrubar o dólar. A
  balança e as transações correntes, mensais e com um mês de atraso, são contexto.
- **F8. Eventos:** o evento mais grave da janela de 7 dias na leitura de eventos do dólar, como a geopolítica do petróleo
  (ADR 0098): política monetária e fiscal, risco institucional, intervenção cambial extraordinária e dado econômico com
  surpresa declarada pela fonte (ADR 0124). Sem número contínuo. O fator 27 do relatório entra aqui pela atuação; **as
  reservas são só contexto** (decisão do usuário, 2026-10-09): no histórico, reagem ao dólar e não o antecipam em 5 e 20
  dias. Um sinal em 60 dias (depois de alta forte das reservas, o dólar subiu em 35% das vezes, 23 janelas) fica como
  hipótese para o horizonte de 90 dias, na validação (§3).

### 2.4 Regras

| Regra | Condição | Afeta | Dimensão |
|---|---|---|---|
| R1. Posicionamento dos fundos (como no café e na soja) | Posição dos fundos alavancados no real (COT, TFF) no percentil de 3 anos; extremo no 10 e no 90 | A leitura consolidada, em 7 e 30 dias | **Informação:** marca o papel (EXCESSO ou extremo contra), sem mudar direção, faixa nem confiança |
| R2. Defasagem | A idade do último dado do observável primário | Cada fator | **Aplicabilidade:** um fator com dado mais velho que o horizonte não pressiona aquele horizonte |

**Por que o posicionamento não é fator:** o relatório lhe dá direção (fundos vendidos em real = alta do dólar), mas no
petróleo e no café o extremo dos fundos não antecipou reversão nem continuação com significância (ADRs 0089 e 0094), e
no ouro a relação mudou de regime. A proposta repete o café e a soja: só informação, gravada com a leitura, para medir
depois (**decidido**, usuário, 2026-10-09). Como no café, o extremo é lido como reversão: fundos alavancados no extremo
comprado em real (percentil 90 ou acima) apontam alta do dólar; no extremo vendido (10 ou abaixo), baixa. O papel é
EXCESSO quando o extremo aponta no mesmo sentido da leitura e "extremo contra" quando aponta contra; não muda direção,
faixa nem confiança. Só nos horizontes de 7 e 30 dias. Se a Qualidade da IA mostrar diferença de acerto entre os papéis,
a próxima etapa discute um efeito.

**O que não é regra nem fator:** os estados "reversão em formação" e "risco/bloqueio" do relatório dependem de uma
pontuação contínua e de dado intradiário; ficam com a agregação (§2.6) e com a fase 2.

### 2.5 Baseline e intensidade (decidido)

Uma régua para os fatores de preço (F2 a F6): a variação do observável primário na janela do horizonte (1, 5, 20 e 60
dias úteis), contra as variações da mesma janela nos 3 anos anteriores. **Neutro** abaixo do percentil 40 da variação
absoluta; **forte** acima do 80; fraco entre os dois. É a mesma régua das faixas de preço (ADR 0079). Calibração do
FinMind, decidida pelo usuário em 2026-10-09 e ajustável pelo Comitê. Sempre só com o que se sabia na data
(point-in-time, ADR 0008). Exemplo (Treasury de 2 anos, 2023-10 a 2026-10): em 20 dias úteis, neutro até 11 pb e forte a
partir de 31 pb; em 1 dia, 3 e 7 pb.

- **F4:** cada vértice do DI1 na régua dele; o fator só tem direção se os três apontam o mesmo lado, com a intensidade
  do mais fraco.
- **F5:** o lado vem do limiar do relatório (VIX acima ou abaixo de 20); o "subindo" ou "caindo" e a intensidade, da
  régua.
- **F6:** cada commodity classificada na régua; vale a maioria, com a intensidade da mais fraca entre as que a formam (como no F4).

Para o F1, o saldo de 4 semanas no percentil do histórico (o fluxo tem sinal: a direção é o sinal, a intensidade o
percentil). Para o F7, a revisão semanal do Focus contra o boletim anterior. Para o F8, a regra dos fatores de evento:
gravidade e janela de 7 dias.

### 2.6 Agregação

Como na soja e no café: **sem agregação em código.** Os fatores, as regras e os pesos vão ao prompt como orientação, e
quem combina é a IA (ADRs 0066 e 0081). A fórmula do relatório (Σ w·s·C·N − Ω, de -200 a +200, limiares de ±60) não é
adotada nesta fase: C, N e Ω não têm definição (pergunta 3), e uma agregação em código só entra depois de medida contra
os benchmarks.

**Os pesos: por categoria, como na soja** (decidido pelo usuário em 2026-10-09). As categorias saem dos pontos do
relatório que sobram por fator (§2.3: 69 pontos); os números ficam na tela de metodologia, como referência, e não vão ao
prompt (a IA não aplica "22% contra 20%"). A matriz da §2.7 vai junto, como relevância por horizonte, não como peso.

| Categoria | Fatores | Pontos do relatório (renormalizado) |
|---|---|---|
| **Alto** | F2 (dólar global), F3 (juros dos EUA) | 15 (22%) e 14 (20%) |
| **Médio** | F8 (eventos), F6 (commodities), F5 (aversão a risco) | 9 (13%), 8 (12%) e 7 (10%) |
| **Baixo** | F7 (expectativas), F1 (fluxo cambial), F4 (juros do Brasil) | 6 (9%), 5 (7%) e 5 (7%) |

O F4 segue a tabela do relatório (5 pontos), embora o texto diga que a curva doméstica pesa tanto quanto o DXY: a
validação diz se ele merece subir.

### 2.7 Matriz fator × horizonte

A relevância de cada fator por horizonte. A R2 tira um fator de um horizonte quando o dado está velho demais para ele.

| Fator | 1d | 7d | 30d | 90d |
|---|---|---|---|---|
| F1. Fluxo cambial | — (defasagem de 5 a 12 dias) | Média | Alta | Média |
| F2. Dólar global | — (o primário sai uma vez por semana; o euro e o iene vão como contexto) | Alta | Alta | Média |
| F3. Juros dos EUA | Média | Alta | Alta | Alta |
| F4. Juros do Brasil | Alta | Alta | Alta | Média |
| F5. Aversão a risco | Alta | Média | Baixa | Baixa |
| F6. Commodities | Baixa | Média | Média | Média |
| F7. Expectativas e contas externas | Baixa | Média | Alta | Alta |
| F8. Eventos | Alta | Alta | Média | Baixa (média se a medida for duradoura) |

### 2.8 Riscos de sobreposição

| Sobreposição | Como se resolve |
|---|---|
| 2 anos, 10 anos, 2s10s e FedWatch | Um fator (F3), um primário |
| DXY, euro, iene e emergentes | Um fator (F2), um primário; o índice amplo é feito em boa parte de euro e iene |
| DI abrindo e o dólar subindo pelo mesmo risco fiscal | O F4 lê a curva; o F8 lê o fato. Se andarem juntos na validação, o F4 vira confirmação do F8 |
| Ouro e dólar global | O ouro é contexto do F2: em aversão a risco, sobe junto com o dólar (§2.3 c do relatório) |
| Atuação do BCB no CSV e na leitura de eventos | O CSV sai com até 2 meses: serve à validação. O F8 lê a atuação extraordinária quando acontece |
| Focus de câmbio e o próprio dólar | O câmbio do Focus é contexto, nunca primário: é uma previsão do mesmo preço |

### 2.9 O que fica fora

- O ciclo intradiário, a microestrutura, as estratégias e o controle de risco por operação: fase 2 (ADR 0117).
- O NDF, o FedWatch, o CDS, o EMBI e o fluxo das corretoras: pagos ou sem fonte.
- A volatilidade implícita e o skew das opções; o consenso de mercado para o índice de surpresa.
- Indicadores técnicos e qualquer regra de compra ou venda (restrição permanente).

## 3. Validação histórica

O teste é o da Qualidade da IA (ADR 0064), fator por fator, com a leitura reconstruída na data, contra a PTAX:

1. **Direção:** nas datas em que o fator lê alta (ou baixa), a PTAX subiu (ou caiu) mais vezes que nos dois benchmarks,
   Sempre Lateral e Persistência?
2. **Intensidade:** a leitura forte leva a variações maiores que a fraca?
3. **Horizonte:** um resultado por horizonte; a matriz da §2.7 é a hipótese.
4. **Episódios, não dias**, com o n à mostra; **fora da amostra:** limiares calibrados na primeira metade e testados na
   segunda.
5. **Contribuição incremental**, na ordem dos pesos (F2, F3, F8, F6, F5, F7, F1, F4): um fator que concorda com os já
   aceitos em 80% ou mais vira confirmação, como na soja.

O histórico é longo para quase tudo (a PTAX desde 1994; o FRED desde os anos 1970 a 2006; o Focus desde 2000; o fluxo
desde 2008; o COT do real desde 2011). As exceções: o DI1 (~15 meses no Up2Data), o S&P 500 (10 anos no FRED) e os
eventos (só daqui para frente). **A meta de 80% do relatório não é critério** (decidido pelo usuário em 2026-10-09): em
câmbio, acertar a direção do dia muito acima de 50% é raro; a medida é bater os benchmarks da Qualidade da IA (ADR
0064), como nos outros ativos. A taxa de acerto do horizonte de 1 dia (a métrica dos 80%, §11 do relatório) aparece na
tela, ao lado dos benchmarks, sem meta fixa.

## 4. Decisões para o Comitê

1. **A arquitetura: decidida** (usuário, 2026-10-09): os 8 blocos do relatório como fatores (F1 a F8), os fatores do
   relatório como observáveis, com um primário por fator (§2.3).
2. **Os primários e as direções: decididos** (usuário, 2026-10-09), como na §2.3: no F6, Brent, café e soja (sem o milho,
   cotado em reais); o ouro como contexto do F2; no F7, o IPCA do ano seguinte como primário e a Selic como confirmação.
3. **O posicionamento (R1): decidido** (usuário, 2026-10-09): só informação, como no café e na soja (§2.4).
4. **A régua de intensidade: decidida** (usuário, 2026-10-09), como na §2.5: janelas de 1, 5, 20 e 60 dias úteis;
   percentis 40 e 80 em 3 anos. A validação calibra na primeira metade do histórico e testa na segunda.
5. **Os pesos: decididos** (usuário, 2026-10-09): por categoria, como na soja (§2.6): alto F2 e F3; médio F8, F6 e F5;
   baixo F7, F1 e F4.
6. **O preço de referência: decidido** (usuário, 2026-10-09): a PTAX de venda (§2.2); o ajuste do DOL como contexto.
7. **O risco-país: decidido** (usuário, 2026-10-09): fica fora. O risco fiscal chega pelo F4 (a curva do DI1) e pelo F8
   (eventos de política fiscal e de risco institucional).
8. **As perguntas 1 a 10 do ADR 0117**, que esta proposta resolve assim: 1 (pesos), decidida (os 3 pontos nos fatores 10, 16 e 17) e pela §2.6; 2 (colinearidade), pela
   §2.3; 3 (fórmula), sem fórmula nesta fase; 4 e 5 (estados e contradições), pela leitura de tendência; 6 (petróleo
   linear), decidida (a linear, com a ressalva como contexto); 6 (reservas), decidida (contexto); 6 (atividade dos EUA), decidida (sem fator: chega pelo F3, pelo F5 e pelo F8); 7 (limiares), pela §2.5; 8 (volume e ATR), na fase 2; 9 (fontes vagas), pela tabela da §1;
   10 (meta de 80%), decidida (os benchmarks, §3).
9. **A medição: decidida** (usuário, 2026-10-09): os benchmarks da Qualidade da IA, sem a meta fixa de 80% (§3).

## 5. Plano

| Etapa | O quê | Portão |
|---|---|---|
| 0 | Fase 1, só aquisição (ADRs 0117 a 0125) | Feito |
| 1 | Decisões da §4 | Tomadas pelo usuário em 2026-10-09 (ADR 0117, adendo) |
| 2 | Fatores e regras na tela de metodologia, com a validação da §3 pela Qualidade da IA e por um teste depois | Feito (ADR 0126) |
| 3 | Pesos; prompt diário, leitura no Centro de Decisão, realizado e Qualidade da IA | Feito (ADR 0126) |
| — | Day-trade, num módulo próprio | Fase 2, ADR próprio |
