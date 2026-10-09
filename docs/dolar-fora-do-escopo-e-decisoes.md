# Dólar (USD/BRL) — o que ficou fora do escopo e o que falta decidir

**Para:** o Comitê e o David. **Data:** 2026-10-09.

**Atualização (2026-10-09):** as decisões da §2.1 e da §2.2 foram tomadas pelo usuário e implementadas: o dólar é o 6º
ativo, até o prompt diário e o Centro de Decisão (ADR 0126). Fica em aberto só a §2.3, para a fase 2.

A fase 1 do dólar (só aquisição de dados, ADRs 0117 a 0125) está completa e carregada no servidor. A proposta dos
fatores está em `docs/proposta-ativo-dolar.md`. Este documento traz só duas coisas: o que do relatório do Comitê de
2026-10-08 ficou fora, e as decisões que faltam para o dólar seguir.

## 1. Fora do escopo

### 1.1 Day-trade: fase 2, num módulo próprio

Decisão do usuário em 2026-10-09 (ADR 0117): a fase 1 é a leitura diária de tendência, nos moldes dos outros ativos. O
day-trade ganha um ADR próprio quando for aberto, e o módulo poderá atender outros ativos. Ficam com ele:

| Item do relatório | Seção | Por que não cabe na leitura diária |
|---|---|---|
| Tendência intraday do DOL: preço contra a VWAP e médias de 9 e 21 períodos | Fator 1 (5%) | Precisa do tick a tick do DOL e do WDO (feed licenciado) |
| Volume e participação no DOL e no WDO | Fator 2 (3%) | Dado em tempo real; sem direção própria |
| Gap de abertura contra o fechamento anterior e o NDF | Fator 5 (3%) | O arquivo diário da B3 não traz a abertura; o NDF é pago |
| Volatilidade realizada (ATR de 14, desvio intraday) | Fator 6 (4%) | Calculado sobre o feed intradiário; sem direção própria |
| Janelas de apuração da PTAX | Fator 28, em parte | São quatro janelas de 10 minutos dentro do pregão |
| Estratégia 1: confluência macro-gap (abertura, 9h00 a 9h30) | 8.1 | Entrada na primeira barra, stop no gap, alvo de 1,5 a 2 ATR |
| Estratégia 2: reversão à média nas janelas da PTAX (11h40 a 13h10) | 8.2 | Lê o book e a média das prévias da PTAX |
| Estratégia 3: rompimento com aversão a risco | 8.3 | Score em ciclos de 5 minutos, piramidagem, trailing stop |
| Monitoramento a cada 5 minutos, estados de sinal e enfraquecimento do sinal | 7, 10.2 e 10.3 | Dependem do score contínuo dentro do pregão |
| Suspensão de sinais nas janelas da PTAX e em volta do Payroll e do CPI | 10.4 | Regra de horário intradiário |
| Análise de encerramento do ciclo (15h00) | 10.5 | Relatório do pregão |
| Controle de risco por operação: stop financeiro e técnico, perda diária máxima, número de operações | 11 | Gestão de posição |
| Backtest com custos (corretagem, emolumentos, slippage, rolagem) e desempenho por faixa de horário | 11 | Mede operações, não leituras |
| Operação assistida (paper trading ou 1 minicontrato WDO) | 13, fase 3 | Opera; a leitura diária não |

**Execução automática de ordens** não existe nem entra, em nenhuma fase (restrição permanente do FinMind). O relatório
também a deixa para depois da operação assistida (§13).

### 1.2 Sem fonte gratuita ou sem fonte coletada

| Fator ou dado | Seção | Situação |
|---|---|---|
| Fluxo corporativo (exportadores e importadores) | Fator 4 (4%) | Relatórios de corretoras: não são públicos |
| NDF offshore do real | Fator 5 | Pago |
| Expectativa de juros dos EUA (CME FedWatch) | Fator 11 (3%) | Pago. Na proposta, a meta do Fed e o Treasury de 2 anos cobrem em parte |
| Risco-país: EMBI+ e CDS de 5 anos | Fator 17 (5%, com o ponto distribuído) | O EMBI+ do IPEA parou em 2024-07; o CDS e o EMBI Global são pagos. Fica fora (decisão do usuário, 2026-10-09) |
| Minério de ferro (SGX e Dalian) | Fator 20 (3%) | Diário pago; o mensal do FMI seria fonte nova |
| Volatilidade implícita, skew e contratos em aberto das opções | 10.2 | Não coletado |
| Consenso de mercado para o índice de surpresa | — | Não coletado: a surpresa só conta quando a fonte a declara (ADR 0124) |
| Ouro da LBMA | Fator 23 | O feed público fechou em 2026-10-01 (ADR 0044); o ouro entra pelo GLD da B3 |

Com 1.1 e 1.2 fora, sobram 21 dos 28 fatores (9 deles em parte) e 69 dos 100 pontos de peso (com os 3 pontos que faltavam distribuídos, §2.2).

## 2. O que falta decidir

### 2.1 Para a leitura diária (a proposta)

| # | Decisão | O que a proposta sugere | Seção da proposta |
|---|---|---|---|
| 1 | A arquitetura | **Decidida** (usuário, 2026-10-09): 8 fatores, os blocos do relatório (F1 a F8); os fatores do relatório viram os observáveis de cada bloco, com um principal por bloco | 2.3 |
| 2 | O observável principal e a direção de cada fator | **Decidida** (usuário, 2026-10-09): os da tabela da §2.3. No F6, a maioria entre Brent, café e soja (o milho da B3 sai: é cotado em reais); o ouro é contexto do F2; no F7, o IPCA do ano seguinte é o principal e a Selic confirma | 2.3 |
| 3 | O posicionamento dos fundos (CFTC) | **Decidida** (usuário, 2026-10-09): só informação, como no café e na soja; marca o papel dos fundos na leitura de 7 e 30 dias, sem mudar direção, faixa nem confiança | 2.4 |
| 4 | A régua de intensidade | **Decidida** (usuário, 2026-10-09): janelas de 1, 5, 20 e 60 dias úteis; neutro abaixo do percentil 40 e forte acima do 80, em 3 anos; a mesma régua das faixas de preço | 2.5 |
| 5 | Os pesos | **Decidida** (usuário, 2026-10-09): por categoria, como na soja. Alto: F2 e F3; médio: F8, F6 e F5; baixo: F7, F1 e F4 (o F4 pela tabela do relatório; a validação diz se sobe) | 2.6 |
| 6 | O preço de referência | **Decidida** (usuário, 2026-10-09): a PTAX de venda, com histórico desde 1994 e sem rolagem; o ajuste do DOL vai como contexto e fica como referência da fase 2 | 2.2 |
| 7 | O risco-país | **Decidida** (usuário, 2026-10-09): fica fora. O risco fiscal chega pelo F4 (curva do DI1) e pelo F8 (eventos fiscais e institucionais) | 1.2 acima |
| 8 | A medição | **Decidida** (usuário, 2026-10-09): os benchmarks da Qualidade da IA (ADR 0064) no lugar da meta de 80%; a taxa do horizonte de 1 dia aparece ao lado, sem meta fixa | 3 |

Sobre o item 8: o relatório aplica os 80% à direção do fechamento do dia contra o ajuste anterior (§11). É o que mede
o horizonte de 1 dia, onde acertar muito acima de 50% é raro em câmbio. A taxa aparece na tela, comparada com os
benchmarks, sem meta fixa.

**As 8 decisões da leitura diária foram tomadas pelo usuário em 2026-10-09** (ADR 0117, adendo). Para a leitura diária, só
falta seguir o plano da proposta (§5).

### 2.2 Perguntas do relatório (ADR 0117): decididas

**Já decididas** (usuário, 2026-10-09, ADR 0117, adendo):

- **Os pesos somavam 97%.** Os 3 pontos foram para o dólar contra emergentes (10: 3 → 4), o VIX (16: 4 → 5) e o risco
  Brasil (17: 4 → 5), sem mexer nos blocos cujo total o texto fixa e respeitando o teto de 5%. O "16% de juros" do texto é
  coerente com a tabela: são as curvas (fatores 12 a 15), sem o FedWatch.
- **O petróleo segue a regra linear da tabela.** No histórico, a condicional da §2.3 não antecipou a PTAX melhor que a
  linear (53% nas duas); a ressalva do choque de oferta vai ao prompt como contexto, e a validação testa as duas.
- **As reservas são contexto; o fator 27 fica com as atuações,** lidas como evento. No histórico, as reservas reagem ao
  dólar e não o antecipam em 5 e 20 dias; um sinal em 60 dias (23 janelas) fica como hipótese para os 90 dias.
- **A atividade dos EUA não tem fator próprio.** O efeito chega pelo Treasury de 2 anos (F3), pelo VIX e pelo S&P 500
  (F5) e, no dia da divulgação, pela leitura de eventos (F8). Um fator exigiria o consenso de mercado (pago) e uma regra
  de regime que o relatório não define.

As outras perguntas do ADR 0117 a proposta resolve como sugestão, e entram na aprovação dela. Nenhuma pergunta do
relatório segue em aberto além das da §2.1.

### 2.3 Para quando o day-trade for aberto (fase 2)

Não bloqueiam a leitura diária; ficam para o ADR do módulo:

- **A fonte intradiária** do DOL e do WDO (tick a tick e book): qual, a que custo e com que licença.
- **A fórmula do score** (Σ w·s·C·N − Ω): o relatório não define C (confiabilidade), N (decaimento) nem Ω (penalidade de
  correlação). E um Ω subtraído empurra o score sempre para o lado negativo.
- **Os estados de sinal:** a §7 tem 5, a tabela tem 6 e a §10.3 cria mais um (enfraquecimento do sinal).
- **Volume (2) e ATR (6):** filtro ou confirmação, já que não têm direção.
- **Se o módulo vale só para o dólar** ou também para os outros ativos com futuro na B3 (milho, café, soja e ouro).
