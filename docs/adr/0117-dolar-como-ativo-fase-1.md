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
   | FRED: Treasury de 2 anos (DGS2), VIX (VIXCLS), dólar contra emergentes (DTWEXEMEGS) e S&P 500 (SP500) | 10, 12, 14 (o 2s10s sai de DGS10 − DGS2, sem série nova), 16 e 18 | A fazer |
   | CFTC: o futuro do real brasileiro (CME) | 7 | A fazer: o mesmo coletor, um mercado novo |
   | BCB: o resultado primário no Focus; o fluxo cambial contratado e a balança (SGS) | 24, 3 (em parte) e 26 | A fazer |
   | BCB: os leilões e as intervenções no câmbio | 27 | A reconhecer |
   | IPEA: o EMBI+ Brasil | 17 (sem o CDS) | A reconhecer |
   | Leitura diária de eventos do dólar por IA (o padrão do ADR 0115) | 25 e 28 (sem a janela intradiária da PTAX) | A fazer |

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

As respostas entram neste ADR (adendo) ou na proposta dos fatores.

## Consequências

- O dólar não tem fatores, prompt, Centro de Decisão nem leitura da IA até a proposta ser aprovada pelo Comitê.
- O que segue com o Comitê fica em `STATUS_DO_PROJETO.md`, §4.
- A fase 2 (day-trade) só começa com uma decisão própria e um feed contratado. O relatório põe a validação assistida antes
  de qualquer execução; o FinMind mantém a geração de análise e a execução de ordens fisicamente separadas
  (`docs/architecture.md`).
