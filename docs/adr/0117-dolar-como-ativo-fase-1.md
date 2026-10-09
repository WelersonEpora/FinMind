# 0117 — O dólar (USD/BRL) como ativo, nos moldes dos demais: fase 1 (só aquisição de dados), com o day-trade numa fase 2

**Status:** aceita (2026-10-09).

## Contexto

O Comitê Gestor entregou em 2026-10-08 o "Relatório final — motor de análise USD/BRL (dólar futuro B3)"
(`docs/Docs_David/COMITÊ GESTOR DE DESENVOLVIMENTO QUANTITATIVO.pdf`, 19 páginas). O relatório junta duas coisas:

1. **um motor de leitura do USD/BRL**: 28 fatores em 8 blocos, cada um com peso, regra de alta e de baixa do dólar,
   fonte e frequência; notas de -2 a +2; um score agregado de -200 a +200 e estados de sinal; a IA só para classificar
   texto (fatores 25 e 28) e explicar o resultado; uma memória que confronta cada leitura com o realizado. A meta de
   acerto acima de 80% vale para **a direção do dia** (o fechamento contra o ajuste anterior), não para cada ciclo
   intradiário (§§1 e 11 do relatório);
2. **um módulo de day-trade** no DOL e no WDO: ciclos de 5 minutos das 08h30 às 15h00, microestrutura (VWAP, book, fluxo
   agressor), janelas da PTAX, três estratégias operacionais (§8), stops, lotes, piramidagem, controle de risco por
   operação e paper trading (§§10 e 11), com a execução automática deixada para depois da fase assistida (§13).

A avaliação feita na conversa de 2026-10-09 mostrou que a parte 1 cabe na arquitetura do FinMind no mesmo padrão dos
outros ativos (coleta → fatores → prompt diário → leitura da IA → realizado e Qualidade da IA). A parte 2 não cabe: pede um
feed pago em tempo real (B3 UMDF por provedor credenciado), um agendador intradiário (hoje a coleta é um lote diário com
cron externo, ADR 0004) e sinal operacional, que o FinMind não emite (só leitura de tendência).

A aquisição de dados está encerrada desde 2026-10-01: fonte nova só com uma demanda específica e a autorização num ADR
(`CLAUDE.md`). Este relatório é a demanda específica do Comitê.

## Decisão (usuário, Welerson, 2026-10-09, pelo mesmo poder de decisão do David)

1. **O dólar (USD/BRL) entra como ativo, nos mesmos moldes dos outros cinco** (como a soja, ADRs 0109 a 0116): primeiro a
   aquisição de dados (fase 1); depois a proposta dos fatores, das regras e da medição, aprovada pelo Comitê; só então o
   prompt diário, a leitura de tendência no Centro de Decisão, o realizado e a Qualidade da IA. A saída é **leitura de
   tendência do dólar, nunca recomendação de compra ou venda**: os estados "COMPRA USD" e "VENDA USD" do relatório viram,
   na proposta, a tendência de alta, neutra ou baixa do dólar.
2. **O day-trade fica para uma fase 2, num módulo próprio, que poderá atender outros ativos.** Ela inclui o ciclo
   intradiário, a microestrutura, as estratégias 8.1 a 8.3, o controle de risco por operação e o paper trading. Não faz
   parte desta decisão e ganha o seu próprio ADR quando for aberta. Nenhuma execução automática de ordens existe ou é
   adicionada.
3. **Autorização da fase 1. Limite: só aquisição de dados**, das fontes gratuitas e oficiais que servem aos fatores do
   relatório na frequência diária ou menor. Nada do dólar vai ao motor, ao prompt, ao Centro de Decisão nem à IA. Cada
   fonte entra com o seu reconhecimento num ADR próprio, citando esta autorização. Esta autorização não é precedente para
   outra fonte nem para qualquer regra.

   | Fonte | Fatores do relatório | Situação |
   |---|---|---|
   | B3: futuros DOL, WDO e DI1 (Up2Data) | 1 e 2 (na versão diária), 5 (o gap, sem o NDF) e 15 | ADR 0118. Urgente: a janela do Up2Data é rolante (~15 meses) |
   | FRED: Treasury de 2 anos (DGS2), VIX (VIXCLS), dólar contra emergentes (DTWEXEMEGS) e S&P 500 (SP500) | 10, 12, 14 (o 2s10s sai de DGS10 − DGS2, sem série nova), 16 e 18 | ADR 0119 |
   | CFTC: o futuro do real brasileiro (CME) | 7 | ADR 0120: o mesmo coletor, mas outro relatório da CFTC (o TFF, das moedas) |
   | BCB: o resultado primário no Focus | 24 | ADR 0121 |
   | BCB: a balança comercial e as transações correntes (SGS) | 26 | ADR 0123 |
   | BCB: o fluxo cambial contratado | 3 (em parte) | ADR 0125: não está no portal de dados abertos, mas no SGS (a Tabela 13 dos Indicadores Econômicos dá os códigos) |
   | BCB: os leilões e as intervenções no câmbio | 27 | ADR 0122 |
   | IPEA: o EMBI+ Brasil | 17 (sem o CDS) | **Sem fonte gratuita** (2026-10-09): o IPEA marca a série JPM366_EMBI366 como INATIVA, com o último ponto em 2024-07-30 (o J.P. Morgan deixou de publicar o EMBI+); o EMBI Global e o CDS são pagos. Pergunta ao Comitê (abaixo) |
   | Leitura diária de eventos do dólar por IA (o padrão do ADR 0115) | 25 e 28 (sem a janela intradiária da PTAX) | ADR 0124 |

   Já coletados, sem fonte nova: a PTAX (desde 1994), a Selic, o Focus (IPCA, Selic e câmbio), as reservas, o índice do
   dólar do Fed (DTWEXBGS e DTWEXAFEGS), o euro e o iene (DEXUSEU e DEXJPUS), o Treasury de 10 anos e o juro real
   (DGS10 e DFII10), a meta do Fed, o Brent e o WTI (EIA), o café, o milho e a soja (ICF, CCM e SJC) e o ouro (GLD).

   **Ficam de fora (pago ou sem fonte):** o tick-by-tick, a VWAP e o book do DOL e do WDO; o fluxo corporativo das
   corretoras (4); o NDF offshore (5); o CME FedWatch (11); o CDS de 5 anos (17); o minério diário da SGX e da DCE (20; o
   preço mensal do FMI pode servir como contexto); a volatilidade implícita e o skew das opções; o consenso de mercado
   para o índice de surpresa.
4. **O preço de referência** (o que a leitura prevê e o realizado mede) é decidido na proposta. A candidata é a PTAX, que
   tem histórico desde 1994 e mede todos os horizontes desde o primeiro dia; o ajuste do DOL é a alternativa. Os quatro
   horizontes são os de sempre: o Imediato (1 dia) mede a meta de direção do dia do relatório.

## Perguntas ao Comitê (antes da proposta dos fatores)

O relatório tem inconsistências que a proposta não pode resolver sozinha:

1. **Os pesos somam 97%, não 100%** (por bloco: 28 + 11 + 14 + 5 + 10 + 14 + 12 + 3). É o mesmo defeito que o relatório
   aponta na versão anterior (95,5%). O texto dá 16% ao bloco de juros (EUA mais Brasil), mas a tabela dá 19% (14 + 5).
2. **A colinearidade continua.** O 2s10s (fator 14) é a diferença entre os fatores 13 e 12. O DXY (8) é feito em boa parte
   de euro e iene, que estão no fator 9. O FedWatch, o 2 anos e o 10 anos andam juntos. Os "8 blocos ortogonais" não têm
   teste de correlação.
3. **A fórmula do score está incompleta.** A confiabilidade da fonte (C), o decaimento (N) e a penalidade de correlação
   (Ω) não têm definição nem valor. Um Ω subtraído empurra o score sempre para o lado negativo: uma penalidade deveria
   encolher o score em direção a zero.
4. **Os estados não fecham.** A §7 lista 5 estados (compra, venda, neutro, reversão em formação e risco ou bloqueio); a
   tabela traz 6 (com forte compra, forte venda e evento crítico); a §10.3 cria "enfraquecimento do sinal".
5. **O texto se contradiz.** A §3 proíbe "somar indicadores como votos", mas o score é uma soma ponderada. A §3 manda
   classificar como neutro quando os blocos divergem; a §7 trata o mesmo conflito como "sinal vulnerável".
6. **As regras seguem lineares onde a §2.3 diz que são condicionais:** o petróleo (19) é "queda = alta do dólar", sem
   separar choque de oferta de choque de demanda; as reservas (27) ficam como fator, embora a §2.3 diga que a correlação
   com o curto prazo é nula; a atividade dos EUA, descrita como condicional, não tem fator.
7. **Faltam limiares.** "Acima da média histórica" e "patamares de suporte" não dizem a janela nem o número; só o gap
   (0,5%) e o VIX (20) têm número.
8. **O volume (2) e o ATR (6) não têm direção:** são filtro ou confirmação, mas a tabela os trata como alta e baixa.
9. **Algumas fontes estão vagas ou desatualizadas:** "relatórios de corretoras" (4), "agências de notícias" (25) e
   "plataformas" para o NDF, o tipo de fonte que a §2.2 critica; a LBMA, que fechou o feed público em 2026-10-01
   (ADR 0044); e o DTWEXBGS, que não é o DXY nem é tempo real (o Fed o publica uma vez por semana).
10. **A meta de 80%:** em câmbio, acertar 80% da direção do dia está muito acima do que se costuma ver. A sugestão é medir
    a leitura contra os benchmarks da Qualidade da IA (ADR 0064) em vez de uma taxa fixa.

11. **O risco-país (fator 17) não tem fonte gratuita:** o EMBI+ parou em 2024-07 e o CDS de 5 anos e o EMBI Global são
    pagos. O fator sai, é medido por outra série já coletada (a curva do DI1 longo, por exemplo), ou o Comitê contrata a
    fonte?

As respostas entram neste ADR (adendo) ou na proposta dos fatores.

## Adendo (usuário, Welerson, 2026-10-09): arquitetura, pesos, petróleo, reservas e atividade dos EUA

- **A arquitetura (decisão 1 da proposta).** Oito fatores, um por bloco do relatório (F1 a F8 de
  `docs/proposta-ativo-dolar.md`, §2.3). Os fatores do relatório viram os observáveis de cada bloco: um principal, que dá
  a direção e a intensidade; no máximo uma confirmação, que nunca cria sinal e, se aponta o lado oposto, limita o fator
  a fraco; e o contexto, que vai ao prompt sem mudar nada. O peso de cada fator é a soma dos pesos do relatório no bloco.
  Motivo: o mesmo fenômeno (por exemplo, juros dos EUA em alta: 2 anos, 10 anos, curva e FedWatch) deixa de valer
  quatro votos, sem a penalidade de correlação que o relatório não define; e os blocos são os "ortogonais" do próprio
  relatório. Perde-se o peso individual de cada fator do relatório dentro do bloco.
- **O primário e a direção de cada fator (decisão 2 da proposta).** Os da §2.3 da proposta, com as direções do relatório e
  três ajustes: no F6, a maioria entre Brent, café (ICF) e soja (SJC), todos cotados em dólar; o milho da B3 (CCM) sai,
  porque é cotado em reais e parte do movimento dele é o próprio dólar convertido. O ouro é contexto do F2, não
  confirmação: em aversão a risco, sobe junto com o dólar (§2.3 c do relatório). No F7, a revisão do IPCA do ano seguinte
  no Focus é o primário e a da Selic, a confirmação; a balança e as transações correntes, mensais, são contexto.
- **O posicionamento dos fundos (decisão 3 da proposta).** Igual ao café e à soja: regra só informativa, sem peso nem
  direção. A posição dos fundos alavancados no real (COT, relatório TFF) no percentil de 3 anos; no extremo (10 ou 90), lido
  como reversão, marca o papel na leitura de 7 e 30 dias (EXCESSO ou extremo contra), sem mudar direção, faixa nem
  confiança. O relatório dava direção ao fator 7, mas no petróleo e no café o extremo não antecipou reversão nem
  continuação (ADRs 0089 e 0094).
- **A régua de intensidade (decisão 4 da proposta).** A variação do primário na janela do horizonte (1, 5, 20 e 60 dias
  úteis) contra as variações da mesma janela nos 3 anos anteriores: neutro abaixo do percentil 40, forte acima do 80,
  fraco entre os dois; a mesma régua das faixas de preço (ADR 0079), só com o que se sabia na data. No F4 e no F6, a
  intensidade é a do vértice ou da commodity mais fraca entre os que concordam; no F5, o lado vem do limiar de 20 do
  relatório. A validação calibra na primeira metade do histórico e testa na segunda.
- **Os pesos (decisão 5 da proposta).** Por categoria, como na soja (ADR 0116), a partir dos pontos do relatório que
  sobram por fator: alto, F2 (dólar global, 15) e F3 (juros dos EUA, 14); médio, F8 (eventos, 9), F6 (commodities, 8) e F5
  (aversão a risco, 7); baixo, F7 (expectativas, 6), F1 (fluxo cambial, 5) e F4 (juros do Brasil, 5). Os números ficam na
  tela de metodologia, como referência; ao prompt vão as categorias e a matriz por horizonte, como relevância. O F4 segue
  a tabela do relatório, embora o texto diga que a curva doméstica pesa tanto quanto o DXY; a validação diz se sobe.
- **O preço de referência (decisão 6 da proposta; o item 4 da decisão acima).** A PTAX de venda: histórico desde 1994
  (faixas e validação em todos os horizontes), sem vencimento nem rolagem. O ajuste do DOL ficou de fora como referência
  (~15 meses de histórico, rolagem mensal com o diferencial de juros, janela de ajuste ruidosa); vai à leitura como
  contexto e fica como a referência da fase 2. O horizonte de 1 dia mede a PTAX contra a do dia anterior, não o
  fechamento contra o ajuste (a métrica do §11 do relatório).
- **Pergunta 11, risco-país (decisão 7 da proposta).** Fica fora: sem fonte gratuita, e nenhuma é contratada. O risco
  fiscal que ele mediria chega pela curva do DI1 (F4) e pelos eventos de política fiscal e de risco institucional (F8). O
  ponto distribuído ao fator 17 cai com ele (os 69 pontos da versão diária já o descontam).
- **Pergunta 10, a medição (decisão 8 da proposta).** Os benchmarks da Qualidade da IA (ADR 0064), como nos outros
  ativos, no lugar da meta de 80%. A taxa de acerto do horizonte de 1 dia (a métrica do §11 do relatório) aparece na
  tela, ao lado dos benchmarks, sem meta fixa.

Com este adendo, as 8 decisões de `docs/proposta-ativo-dolar.md` (§4) e as perguntas 1, 6, 10 e 11 estão decididas. As
outras perguntas (2 a 5, 7 a 9) a proposta resolve pela própria arquitetura; as da fase 2 (fonte intradiária, fórmula do
score, estados de sinal, volume e ATR) ficam para o ADR do day-trade.

- **Pergunta 1 (pesos).** Os 3 pontos que faltavam vão para o dólar contra emergentes (fator 10: 3 → 4), o VIX (16: 4 →
  5) e o risco Brasil (17: 4 → 5), e a tabela fecha em 100. Critérios: não mexer nos blocos cujo total o texto fixa (28
  de fluxo, 14 de commodities, 12 de macro Brasil e 16 das curvas de juros); respeitar o teto de 5% por fator; preferir os
  fatores que o texto trata como mais relevantes. O "16% de juros" do texto não contradiz a tabela: são as curvas
  (fatores 12 a 15), sem o FedWatch (11). Na versão diária sobram 69 pontos (o do 17 cai com ele).
- **Pergunta 6, petróleo.** Fica a regra linear da tabela (queda = alta do dólar). No histórico do FinMind (2000 a
  2026, 334 janelas de 20 dias úteis, Brent da EIA contra a PTAX, o VIX separando a origem do choque), a versão
  condicional da §2.3 do relatório acerta mais na mesma janela (71% contra 65% da linear), mas nenhuma das duas antecipa
  a PTAX (53% na janela seguinte; o mesmo com janelas de 1 e 5 dias). Sem ganho para a leitura, não entra regra nova: a
  ressalva do choque de oferta vai ao prompt como contexto, e a validação da proposta testa as duas versões.
- **Pergunta 6, reservas.** O fator 27 fica com as atuações do BCB, pelo fator de eventos (a intervenção extraordinária,
  quando acontece, na leitura de eventos do dólar; o CSV de atuações chega com até 2 meses e serve à validação). As
  reservas viram contexto, sem direção nem peso, como diz a §2.3 b) do relatório: as regras do fator 27 na tabela só
  falam de atuação. No histórico do FinMind (2000 a 2026, reservas diárias contra a PTAX), as reservas andam com o dólar
  na mesma janela porque reagem a ele (o BCB vende quando o dólar sobe; a alta do dólar global reduz o valor em dólar do
  que está em euro e em ouro) e não antecipam nada em 5 e 20 dias (perto de 50%). Em 60 dias, depois de uma alta forte
  das reservas, o dólar subiu em 35% das vezes, mas com 23 janelas: fica como hipótese para o horizonte de 90 dias, na
  validação da proposta. A atuação também é condicional (§2.3 a): em estresse severo, pode sinalizar esgotamento; lida
  como evento, essa avaliação fica com a IA, que vê o contexto do dia.
- **Pergunta 6, atividade dos EUA.** Sem fator próprio. O efeito condicional que a §2.3 d) do relatório descreve chega
  pelo que já está na proposta: pelo Treasury de 2 anos (dado forte, juros esperados mais altos), pelo VIX e pelo S&P 500
  (dado forte, apetite a risco) e, no dia da divulgação, pela leitura de eventos do dólar (o tipo "dado econômico", com o
  BLS e o Fed entre as fontes). Um fator próprio precisaria do consenso de mercado (pago) e de uma regra de regime que o
  relatório não define; o preço dos juros e do risco já mostra como o mercado leu o dado.

## Consequências

- O dólar não tem fatores, prompt, Centro de Decisão nem leitura da IA até a proposta ser aprovada pelo Comitê.
- O que segue com o Comitê fica em `STATUS_DO_PROJETO.md`, §4.
- A fase 2 (day-trade) só começa com uma decisão própria e um feed contratado. O relatório põe a validação assistida antes
  de qualquer execução; o FinMind mantém a geração de análise e a execução de ordens fisicamente separadas
  (`docs/architecture.md`).
