# 0127 — Carteiras virtuais com trilhas: operador, IA e regra fixa, em simulação

**Status:** aceita (2026-10-13). Decisão do usuário (Welerson), com o mesmo poder de decisão do David. Implementação em
etapas (abaixo).

## Contexto

O Comitê enviou a **Cartilha de Operações v1.0** (`docs/Docs_David/Cartilha Gestão FINMIND.pdf`), versão para avaliação,
não aprovada: swing e position trade em café, milho e soja (B3, R$ 10.000) e em ouro e petróleo (conta internacional,
US$ 2.000), com risco por operação, stop pela estrutura com piso de 1,5× o ATR(14), alvos, travas e 30 dias de paper
trading com diário (Cap. 9.4). "O FinMind diz o quê e por quê; o SMC diz quando e onde."

O usuário quer testar **se a IA é viável na decisão operacional**, em simulação, ao lado do operador e de uma regra fixa,
com o mesmo capital e as mesmas regras. Isso esbarra em restrições permanentes do `CLAUDE.md` (nenhuma recomendação de
compra ou venda, nenhum stop ou indicador técnico sem definição do David, nenhuma resposta de IA disparando ação,
backtest fora do escopo), que este ADR excepciona **só neste módulo e só no virtual**.

## Decisão

### 1. Exceções às restrições permanentes (só no módulo de carteiras, só em simulação)

1. Uma **recomendação** diária da IA por ativo (entrar comprado, entrar vendido, não entrar; manter, reduzir, zerar),
   visível ao operador. Continua sem preço de entrada, stop, alvo ou quantidade.
2. A **execução automática virtual** das trilhas IA e Determinística: ordens e lançamentos no razão da carteira, nunca
   uma ordem real. Nenhum adaptador de corretora existe; uma regra de lint impede o módulo de depender de um.
3. O **ATR(14), o stop, os alvos e as travas** da Cartilha, como parâmetros configuráveis e versionados por carteira,
   nunca fixos no código.
4. A resposta da IA só vira ação virtual **depois do motor de risco**, que roda antes e por cima dela: a IA nunca
   ultrapassa um limite nem anula um stop.

Continua proibido: execução real, corretora, rolagem de contratos e backtest contado no experimento. Um replay de dias
passados só serve para validar o motor.

### 2. As trilhas

Toda carteira nasce com **três trilhas ativas**, com o mesmo capital, a mesma data de início, os mesmos parâmetros e o
mesmo motor de marcação e custos. Nenhuma pode ser desligada (só as travas pausam uma trilha).

- **OPERADOR:** o diário de paper trading, preenchido à mão. Ciclo: planejada → aberta → em gestão → encerrada (ou
  cancelada). O sistema confere tamanho, piso de ATR, R:R e travas e calcula o resultado em R.
- **IA:** aplica a recomendação diária pelo motor.
- **DETERMINÍSTICA:** a regra fixa da §6 sobre as leituras de tendência do dia. Não chama IA, mas as leituras são da IA:
  "IA − Determinística" mede o valor da recomendação, não da IA inteira.

**Referências calculadas**, pelo mesmo motor e sem decisão: só caixa (Selic), comprar e segurar, e **Persistência** (a
direção da variação de 30 dias do preço, o benchmark do ADR 0064), a única referência sem nenhuma IA.

### 3. A rodada diária em duas fases

- **Decidir** na madrugada de D, depois das leituras do dia, com dados até o ajuste de D−1.
- **Liquidar** na madrugada de D+1, no ajuste de D.

Isso impede o look-ahead por construção. A rotina é um script próprio (`npm run carteiras`), separado da coleta, no cron
do servidor às 06h30 de Brasília: liquida as rodadas pendentes (até 5 dias para trás) e decide a de hoje. Uma rodada
decidida nunca é refeita (só uma rodada que falhou sem nenhuma intenção gravada). A rodada **congela uma cópia** das
leituras que usou (id, `hash_entrada`, leituras e preço recebido), porque `analise_diaria` pode ser substituída no
REFAZER. O horizonte IMEDIATO não é operável (ADR 0106).

### 4. A recomendação

- **Uma chamada por carteira por dia**, depois das leituras. Entrada: as leituras congeladas de CURTO, MEDIO e LONGO de
  cada ativo e os eventos da semana; **nenhum estado de trilha** (D8). A IA responde, por ativo, **os três ramos** (sem
  posição, comprado, vendido), com prioridade, porquê, evidências citadas pelos ids recebidos e o que invalida a tese. O
  motor aplica o ramo do estado de cada trilha; a mesma resposta serve ao operador e à trilha IA.
- **Modelo fixado** por variável própria (`GEMINI_MODEL_RECOMENDACAO`), que recusa alias (`*-latest`), e **só a chave
  paga**. Um `modelVersion` devolvido diferente do fixado é tratado como falha. Trocar o modelo ou a versão do prompt
  abre um segmento novo de medição (ADR 0010).
- **Validação estrita** (no molde de `shared/resposta-analise-diaria.js`): todos os ativos uma vez, prioridades de 1 a n,
  ações do enum de cada ramo, evidências existentes na entrada, textos preenchidos, nenhum campo de preço. Uma
  recomendação contrária à leitura não é recusada: é marcada e medida. Duas respostas inválidas, ou o Gemini fora, levam
  ao **fallback "manter"** na trilha IA (sem novas entradas; posições, stops e alvos seguem).
- **Registro:** prompt, instrução, resposta bruta, modelo pedido e devolvido, tokens por tipo, custo e tentativas.
- **Consistência:** uma vez por semana, uma réplica com a mesma entrada, que não decide nada.

### 5. A execução simulada (D1, D4, D10, D13)

- **Quantidade fracionária** nas três trilhas (D1), com o indicador "com contratos inteiros: cabe? capital mínimo" em
  cada ordem. Os resultados em R e em % não dependem do tamanho.
- **Trilhas automáticas** (D4): entrada no **ajuste de D** mais a slippage do ativo; stop = piso × ATR(14) até D−1 a
  partir da entrada (sem SMC, o piso é o stop); alvos da Tabela 2 (alvo 1 com saída de 50% e stop no ponto de entrada;
  alvo 2 final); tamanho pela fórmula da Cartilha sobre o patrimônio de D−1.
- **Stop e alvos** a partir de D+1, pela **mínima e máxima** do dia (D4); stop e alvo no mesmo dia: conta o stop; o dia
  inteiro além do stop (gap): saída ao preço médio do dia. Sem máxima e mínima (o Brent hoje), pelo ajuste.
- **R:R conferido pelo alvo 2** (D10): no ouro e no petróleo, o R:R combinado da Tabela 2 (2,25) fica abaixo do mínimo
  dela (2,5). **Fator de risco overnight 1,0** na v1 (D10): em swing toda posição dorme, e "metade do risco" valeria
  sempre; a pergunta vai ao Comitê.
- **Vencimento** (D13): o contrato é o primeiro com limite (`limiteDoVencimento`) a mais de 30 dias úteis de D e pelo
  menos 100 contratos negociados (ADR 0078); a posição é **encerrada** (não rolada) 15 dias úteis antes do limite, e o
  dia seguinte pode reentrar no próximo vencimento. Desde o adendo de 2026-10-15, os três números são por ativo (o dólar
  usa 3, 2 e 100).
- **Travas** (D11): perda diária e semanal sem novas entradas no resto do dia e da semana; drawdown de 10% pausa a trilha
  até uma retomada manual, com motivo; 3 perdas seguidas pausam por 5 pregões (proposta do FinMind); a véspera de
  evento de alto impacto fica desligada (não há calendário formal de eventos).
- **Caixa:** todas as trilhas e referências rendem a **Selic sobre o patrimônio inteiro** (futuro não consome caixa): a
  distância para a referência "só caixa" é o resultado das operações.

### 6. A regra da trilha Determinística (D5), versão 1

Sobre as leituras congeladas do dia:

- **Sem posição:** entrar comprado se o MEDIO está em ALTA com confiança MEDIA ou ALTA e o CURTO não está em BAIXA;
  entrar vendido no simétrico; senão, não entrar.
- **Com posição:** zerar se o MEDIO virou para o lado oposto; reduzir 50% (uma vez por operação) se o MEDIO está LATERAL
  ou INSUFICIENTE, ou com confiança BAIXA; senão, manter.
- **Prioridade:** a confiança do MEDIO, depois a faixa FORTE antes da LEVE, depois a ordem fixa dos ativos da carteira.
- Leitura ausente: não entrar, ou manter.

### 7. O operador (D3)

- O preço de execução é **informado** por ele e conferido contra a mínima e a máxima do contrato no dia; fora da faixa,
  recusado.
- **No prazo** é o registro feito antes da liquidação do dia da entrada. Um **registro tardio** é aceito até 5 dias
  úteis para trás (parâmetro da carteira), conferido no estado daquele dia (preço, vagas e travas); o motor refaz os dias
  desde então. Conta só na medição "com tardias", fora da métrica principal.
- **O que muda depois do registro:** planejada, tudo; aberta e em gestão, só o stop a favor da posição e o texto do
  diário; encerrada, só o texto. Uma correção de número vira um evento com o valor antigo, o novo e o motivo. O stop
  nunca é ampliado.

### 8. Parâmetros e permissões

- **Por carteira**, versionados e append-only: conta, moeda, capital e início (fixos desde a criação); ativos; por ativo,
  a Tabela 2 (risco, piso de ATR, alvos, R:R mínimo), slippage e custo; da carteira, a Tabela 3 e as regras da §5. Uma
  versão nova exige motivo, vale a partir da próxima rodada para as três trilhas e abre um segmento novo de medição. Os
  padrões são os da Cartilha v1.0.
- **O custo por contrato é a exceção** (decisão do usuário, 2026-10-13): custo é fato, não escolha de estratégia. Sem o
  número real, a carteira roda com custo zero e o aviso "custo pendente". Quando ele chegar, vale **desde o início**:
  lançamentos de correção com a data de cada execução já feita (o razão segue append-only) e o patrimônio refeito, sem
  abrir segmento novo. Os parâmetros de uma data são os da última versão INICIAL ou AJUSTE vigente nela, com o custo da
  última correção por cima: a correção não traz para trás um ajuste feito depois do início. Custo e outra mudança na
  mesma versão são recusados.
- **No sistema**, iguais para todas as carteiras e mudados só por ADR: o modelo e a chave da IA, a versão do prompt da
  recomendação, a versão das regras da Determinística, a especificação dos contratos, o calendário e o horário da rotina.
- **Só o dono do espaço** muda parâmetros; o editor usa o diário; o viewer só lê.

### 9. Dados e escopo

As tabelas do módulo são **PRIVADAS** do espaço (ADR 0007, §6 e §7): `workspace_id`, repositórios só por
`forWorkspace(workspaceId)`, FK composta `(workspace_id, carteira_id)`, `ON DELETE RESTRICT` e teste de isolamento
contra o Postgres real no CI. Nenhum dado privado vai ao prompt. Tabelas previstas: `carteira`,
`carteira_parametros_versao`, `carteira_trilha`, `carteira_rodada`, `rodada_leitura`, `recomendacao`, `intencao`,
`ordem`, `operacao`, `operacao_evento`, `lancamento` (o razão, append-only) e `patrimonio_diario` (projeção recalculável
a partir do razão). Cada uma entra no registro do ADR 0007 na migration que a cria.

### 10. Medição pré-registrada (D6, D7)

- **Pergunta principal (revista pelo usuário em 2026-10-14, no dia da 1ª rodada, antes de qualquer resultado):** a IA
  agrega valor ao processo, sobre uma regra sem nenhuma IA? Medida: a **diferença diária de retorno IA − Persistência**,
  em % do capital inicial, com intervalo de 80% por block bootstrap (blocos de 10 pregões, semente fixa). Veredito:
  agrega se o limite inferior > 0; inconclusivo se o intervalo contém 0; não agrega se o limite superior < 0. *Era* "a
  recomendação agrega valor sobre a regra fixa?" (IA − Determinística): o usuário observou que o projeto quer saber se a
  IA é viável no processo, e não só a recomendação.
- **As duas partes**, que somam a principal, com intervalo e **sem veredito** (um veredito só, para não multiplicar a
  chance de um "agrega" por acaso): a **recomendação** (IA − Determinística, as mesmas leituras) e as **leituras de
  tendência** (Determinística − Persistência, a mesma regra fixa). Custo aceito pelo usuário: a Persistência fica
  posicionada quase sempre, e a diferença depende mais do tipo de mercado do período; o intervalo tende a ser mais
  largo.
- **Datas:** avaliação na **1ª rodada + 6 meses** (FEL 1, §12.1) e final em +12 meses; aos 3 meses, só descritivo, sem
  parar. Conta só o segmento principal: mudar parâmetros, ou o modelo ou o prompt da recomendação, reinicia a contagem.
  Mudar o prompt ou o modelo das leituras de tendência **não** reinicia: fica registrado na tela (decisão do usuário,
  2026-10-14; os prompts das leituras seguem em ajuste, ADR 0108).
- ~~**O custo da IA fica na métrica secundária** (D6): é fixo por carteira e não cresce com o capital; na principal, o
  veredito dependeria do capital escolhido. A tela mostra o ponto de equilíbrio.~~ **Revisto pelo usuário em
  2026-10-14: o custo da IA sai da medição.** O projeto quer saber se a IA é viável no processo, e não só a recomendação;
  a etapa 7 contava só as chamadas da recomendação (escolha do FinMind, não do usuário), e o valor (centavos por dia)
  não pesa em nenhuma conclusão. O custo de cada chamada segue no registro da recomendação (§4), com os preços
  opcionais no `.env`.
- **Secundárias:** as métricas da Cartilha (Cap. 9.5) por trilha e ativo; Sharpe sobre a Selic, volatilidade, drawdown e
  tempo exposto; atribuição (dias divergentes, operador alinhado × contrário à recomendação, recomendações contrárias à
  leitura, cortes do motor, fallback, consistência e custos).

### 11. Ativos e contas (D2, D12)

Petróleo, ouro, milho, café e soja; o dólar fica fora (entrou na conta B3 pelo adendo de 2026-10-15). O petróleo segue no Brent (o WTI fica guardado). A **soja entra**,
com a divergência registrada: a Cartilha a trata como ativo de observação até decisão do Comitê (§2.2e). **Começa pela
conta B3** (milho, café e soja): o piso da Tabela 2 no agro é o ATR(14) diário, calculável com dados oficiais. Na conta
internacional, o piso usa o ATR diário (a Cartilha pede o de 4 horas, que não temos), e o stop do petróleo pede a
máxima e a mínima do Brent (D2): elas vêm na mesma resposta do Yahoo que já coletamos (ADR 0096); a coleta delas, na
etapa 8, num adendo a este ADR. Até lá, ATR do ajuste.

## Etapas

0. Este ADR; `CLAUDE.md`, `STATUS_DO_PROJETO.md` e ADR 0007.
1. O domínio puro (`backend/src/carteiras/`): parâmetros, ATR, risco, travas, motor e razão, com testes.
2. Migrations, models e repositórios `forWorkspace`; a criação da carteira; o teste de isolamento com o Postgres no CI.
   As tabelas desta etapa são `carteira`, `carteira_parametros_versao` e `carteira_trilha`; as da rodada, das ordens e
   do razão entram na 3, com quem as usa, e a `recomendacao`, na 4.
3. A rodada, a trilha Determinística, as referências e o script. Tabelas: `carteira_rodada`, `carteira_rodada_leitura`
   (a cópia congelada), `carteira_intencao`, `carteira_ordem`, `carteira_posicao` e `carteira_posicao_evento`,
   `carteira_lancamento` (o razão) e `carteira_patrimonio_diario`. O que esta etapa definiu:
   - **A rotina** (`npm run carteiras`, no cron do usuário `deploy` às 06h30 de Brasília): cria SEM_DECISAO os dias
     úteis sem rodada (a rotina não rodou), liquida as pendentes em ordem e para na primeira sem dado, e decide o dia.
     Com uma liquidação pendente, a rodada do dia fica SEM_DECISAO; um erro na decisão também (nada é gravado da decisão
     que falhou). Toda rodada é liquidada, com ou sem decisão: stop, alvos, marcação e Selic.
   - **O mercado** (só dado global): o contrato é o primeiro vencimento com o limite a mais de 30 dias úteis e com a
     liquidez mínima no último pregão até D−1; o ATR(14) dele; a PTAX de D−1 para o tamanho. Na liquidação, a barra do
     dia, a PTAX do dia e a Selic realizada (% a.a.) em taxa diária de 252 dias úteis. Calendário de segunda a sexta:
     o dia útil do caixa é o da PTAX; até 4 dias corridos a liquidação espera pelo dado do dia, depois o trata como
     feriado (as ordens expiram e o caixa não rende). **Ajuste de 2026-10-14** (decisão do usuário): o dia sem dado é
     reconhecido como feriado assim que existir o mesmo dado de um dia posterior (a PTAX posterior, se falta a PTAX; o
     ajuste posterior de um dos contratos, se falta a barra), sem esperar os 4 dias, que ficam só para o dado atrasado.
     Como o dado do primeiro pregão depois do feriado só sai no fim desse dia, a carteira retoma na rotina da manhã
     seguinte: um feriado custa 1 dia útil sem decisão (com a espera de 4 dias, um feriado na segunda custava 3). Um
     calendário de feriados da B3 no código evitaria esse dia; não foi adotado.
   - **As referências:** o caixa só rende; a Persistência é a direção da variação de 30 dias do contrato operado, com a
     faixa LATERAL do MEDIO do ativo, passada pela regra da Determinística e pelo motor; o comprar e segurar fica
     comprado em cada ativo com 1/n do patrimônio, sem alavancagem, sem stop nem alvo, sai no vencimento e volta no
     pregão seguinte (proposta do FinMind: a Cartilha não define a referência). A IA e o operador só rendem o caixa
     até as etapas 4 e 6.
4. A recomendação e a trilha IA. Tabela: `carteira_recomendacao`. O que esta etapa definiu:
   - **A chamada** fica na decisão da rodada, depois do mercado e antes do motor: o prompt `ai/prompts/carteira-recomendacao.md`
     (versão 1), só com a chave paga e o modelo de `GEMINI_MODEL_RECOMENDACAO` (em 2026-10-13, `gemini-3.8-flash`, o
     que o alias da leitura diária devolvia). Sem o modelo fixado (vazio ou alias), sem a chave paga ou sem nenhuma
     leitura no dia, nada vai à IA e a trilha IA fica no fallback; a falha nunca derruba a rodada.
   - **A entrada** são as leituras de CURTO, MEDIO e LONGO (tendência, faixa, confiança, tese e o que a invalida) e até 10
     eventos aceitos dos últimos 7 dias por ativo, cada um com um id (`MILHO.MEDIO`, `MILHO.EV1`) que as evidências
     citam. Um ativo sem leitura no dia fica fora da entrada, e a trilha IA não entra nele (ou mantém), como a regra fixa.
   - **Contrária à leitura** é um ramo contra a tendência do MEDIO: entrar comprado com ele em BAIXA (vendido com ele em
     ALTA), ou manter comprado com ele em BAIXA (vendido com ele em ALTA). Fica marcada no registro e na intenção.
   - **A réplica** é a da primeira recomendação válida da semana (segunda a domingo), com o mesmo prompt.
   - **O custo** soma os tokens de todas as chamadas do dia (o raciocínio conta como saída), pelos preços em
     `GEMINI_RECOMENDACAO_PRECO_ENTRADA` e `_SAIDA` (US$ por milhão); sem eles, fica nulo e os tokens bastam para
     calcular depois.
   - Testado em dev em 2026-10-13 com as leituras de 05/10 a 09/10: as 5 respostas e a réplica válidas na 1ª chamada, de 18
     a 25 s e de 3 a 7 mil tokens cada.
5. API e telas (protótipo aprovado: lista, criação, configuração, visão geral, recomendação, posições, operações,
   patrimônio). **Adiantada em parte** (decisão do usuário, 2026-10-13, para ver o módulo antes da IA): a API sob
   `/workspaces/:workspaceId/carteiras` (qualquer membro lê; só o dono cria e registra versão, §8) e as telas do que já
   roda: a lista e a criação (só a conta B3 até a etapa 8; os parâmetros padrão, mudados depois por versão) e a de uma
   carteira, com visão geral (o patrimônio no gráfico como retorno acumulado em % do capital, para as trilhas se
   compararem na mesma escala), rodadas, posições, operações e configuração. A tela da recomendação entra com a etapa 4.
6. O diário do operador. Sem tabela nova (a `carteira_ordem` ganha a situação CANCELADA). Decisões do usuário em
   2026-10-14: a saída pelo motor (stop e alvos) e também à mão; os alvos calculados pela Tabela 2; o registro tardio
   numa sub-etapa depois; do diário da Cartilha (Cap. 9.4), por ora só o checklist dos 8 itens (Cap. 7.1). O que esta
   etapa definiu:
   - **O dia de registro** é o da rodada mais recente ainda não liquidada, se for de hoje ou do dia útil anterior (antes
     das 06h30, a de ontem segue aberta). Fora disso (liquidada, uma anterior pendente, rotina atrasada), nada é
     registrado. Cada escrita trava a rodada (`SELECT ... FOR UPDATE`); a liquidação trava a mesma linha e confere que as
     ordens são as que leu (senão, refaz): uma ordem nunca entra num dia já liquidado.
   - **A entrada:** ativo, lado, preço e stop. A conferência usa o mesmo mercado das trilhas automáticas no dia (até o
     ajuste de D−1, no instante da decisão da rodada) e o patrimônio da véspera: o stop do lado certo, o piso de ATR, o
     R:R, o tamanho pelo risco, as vagas e as travas; as entradas já planejadas no dia ocupam vaga e ativo, e uma saída
     planejada não libera vaga no mesmo dia. A quantidade e os alvos saem do motor; o preço é conferido contra a mínima
     e a máxima do contrato na liquidação (fora da faixa, a ordem é REJEITADA).
   - **O checklist:** os itens 4 a 6 (stop no piso, alvos e R:R, dimensionamento) o sistema marca pelas verificações; os
     outros cinco, o operador. Um item desmarcado não impede o registro: a entrada fica "fora da Cartilha" e conta na
     aderência (Cap. 9.5).
   - **Planejada:** a entrada aguarda a liquidação; editar cancela a ordem (motivo EDITADA) e cria outra, e cancelar a
     marca CANCELADA. A linha nunca é apagada.
   - **A saída à mão:** zerar ou reduzir (a fração da carteira, uma vez por operação), com o preço, conferido contra a
     faixa do dia. Uma saída por posição e dia (a do vencimento conta). Na liquidação, o stop e os alvos são avaliados
     antes, pela faixa do dia, como nas outras trilhas.
   - **O stop movido** só a favor e ainda do lado da perda em relação ao último ajuste; vale **a partir do pregão
     seguinte** ao dia aberto (proposta do FinMind: no mesmo dia, o stop seria escolhido já vendo o preço do dia). Fica
     como evento STOP_MOVIDO da posição; a liquidação aplica o mais recente em vigor.
   - **O vencimento** encerra as posições do operador como as das outras trilhas (a decisão gera a saída 15 dias úteis
     antes do limite).
   - Testado em dev em 2026-10-14 pela API, com uma carteira de teste começando no dia: conferência (piso recusado,
     plano com quantidade, alvos e risco de 2%), registro com o checklist, segunda entrada no mesmo ativo e terceira sem
     vaga recusadas, edição e cancelamento. A saída e o stop movido, só nos testes (sem uma posição aberta em dev).
7. A medição. Decisões do usuário em 2026-10-14: a pergunta principal e o custo da IA agora, as secundárias (Cartilha,
   Sharpe, atribuição) numa sub-etapa; antes dos 6 meses, os números parciais sem veredito; uma aba própria, "Medição".
   O que esta etapa definiu:
   - **A medida:** o retorno de cada dia em % do capital inicial (a variação do patrimônio sobre o dia anterior; no 1º
     dia, sobre o capital), nos dias liquidados das duas trilhas, e a diferença IA − Determinística.
   - **O intervalo** da média diária por block bootstrap **circular** (os blocos dão a volta no fim da série), com
     **10.000 reamostragens**, semente **127** e os quantis de 10% e 90%; o da acumulada é o da média vezes os dias. Só
     a partir de **20 dias** medidos (dois blocos). O circular, as reamostragens, a semente e o mínimo são proposta do
     FinMind.
   - **O segmento:** a versão dos parâmetros da rodada (a correção de custo não conta), o modelo pedido e a versão do
     prompt da recomendação principal; o dia sem um deles herda o anterior, e um campo que passa de vazio a conhecido
     não abre segmento. Vale o último; os anteriores aparecem, sem contar. Sem dia liquidado, a contagem começa no
     início da carteira.
   - **As datas** são o início do segmento + 3, 6 e 12 meses (o dia que falta no mês vira o último dele). A avaliação e
     a final usam só os dias **antes** da data delas, congeladas; antes da avaliação, a tela mostra o parcial (dias,
     acumulada, média e intervalo) sem veredito.
   - **O custo da IA** no segmento: as chamadas (a principal e a réplica), os tokens e o custo em US$; uma chamada gravada
     sem custo é calculada pelos tokens com os preços do `.env` de agora. Sem preço, o custo fica incompleto e o ponto de
     equilíbrio não aparece. Em reais pela PTAX mais recente. O **ponto de equilíbrio** é o capital em que a vantagem
     acumulada (em %) paga o custo: custo ÷ vantagem.
   - Testado em dev em 2026-10-14 com a carteira de demonstração (desde 15/09): 21 dias, IA − Determinística de −1,93%,
     intervalo de −3,87% a +0,01%; o cálculo leva ~20 ms.
   - **A pergunta principal mudou em 2026-10-14** (§10): IA − Persistência com veredito; IA − Determinística e
     Determinística − Persistência como partes, com intervalo, sem veredito; as mudanças das leituras registradas (a
     versão do prompt e o modelo da cópia congelada de cada rodada, `carteira_rodada_leitura`). Nas secundárias, a linha
     IA − Persistência saiu (virou a pergunta) e a atribuição passou a se chamar "por dentro da recomendação".
   - **O custo da IA saiu da aba em 2026-10-14** (D6 revisto, §10): o bloco do custo e o ponto de equilíbrio. Os dias
     em fallback, que estavam nele, foram para a atribuição das secundárias.
   - **7b, as métricas secundárias** (feita em 2026-10-14; o usuário pediu os três blocos juntos, como propostos).
     Descritivas, sem veredito, no segmento em vigor, na aba Medição abaixo da principal (`carteiras/secundarias.js`):
     - **Atribuição:** os dias em que IA e Determinística carregavam posições diferentes (outro ativo ou lado) e a
       diferença acumulada neles e nos outros; a diferença por ativo pelo razão (ajuste e custos; o caixa à parte; a
       soma é a da principal); as recomendações contrárias à leitura (dias, ramos, aplicadas pela trilha IA e o resultado
       das entradas que nasceram delas); os cortes do motor por trilha e motivo; a consistência da réplica (ações por
       ativo e ramo e prioridades repetidas). O fallback segue no bloco do custo.
     - **Painel das seis trilhas:** retorno em % do capital desde o início do segmento; volatilidade e Sharpe
       anualizados (√252) sobre o retorno de cada dia em relação ao dia anterior, só com 20 dias; o Sharpe sobre o
       retorno da trilha CAIXA (a Selic, ou a meta do Fed na internacional); maior recuo contra o `drawdownMaxPct` dos
       parâmetros; tempo exposto (dias com posição carregada de um ajuste para o outro); custos de operação do razão. E a
       diferença acumulada **IA − Persistência**, só o número, sem o custo das leituras.
     - **Cartilha (Cap. 9.5)** por trilha (sem o caixa e o comprar e segurar) e ativo, das operações que entraram no
       segmento: operações, encerradas, acerto, resultado médio em R, R:R realizado (ganho médio em R ÷ perda média em
       R) contra o planejado (o alvo 2 em R) e o resultado em % do capital; a aderência do operador (as entradas, sem as
       canceladas, com o checklist inteiro).
     - **Fica para depois:** "operador alinhado × contrário à recomendação", até haver operações do operador. As
       definições de "exposto", do R:R realizado, da anualização e do mínimo de 20 dias são proposta do FinMind.
     - Testado em dev com a carteira de demonstração: a soma por ativo (−1,93% no café, −0,003% no caixa) fecha com a
       diferença acumulada da principal; o cálculo leva de 20 a 40 ms.
8. A conta internacional: ouro (o futuro em dólar da B3, GLD) e petróleo (o Brent da NYMEX, pelo Yahoo), em dólar,
   com o capital padrão da Cartilha (US$ 2.000); a quantidade em onças e barris (§5). O que esta etapa definiu:
   - **Adendo de dados (autorizado pelo usuário em 2026-10-14, junto com a etapa):** o coletor do Brent (ADR 0096)
     passa a gravar a **máxima e a mínima** do dia de cada vencimento (`YAHOO.BZ.<TICKER>.HIGH` e `.LOW`), que vêm na
     mesma resposta (verificado por chamada real em 2026-10-14). Um dia com a faixa incoerente (a máxima abaixo da
     mínima ou o ajuste fora dela) fica sem ela, com aviso. O histórico sai do mesmo `backfill:yahoo-brent`. Com a
     faixa, o ATR(14) do petróleo é o verdadeiro (em dev, de 1,42 só pelo ajuste para 3,37) e o stop e os alvos são
     avaliados pela mínima e pela máxima, como no agro. A Cartilha pede o ATR de 4 horas; segue o diário (§11).
   - **O calendário da conta** é o pregão da NYMEX, pelo Brent contínuo (`YAHOO.BZ_CONTINUO.SETTLE`), no lugar da
     PTAX: um dia é útil se tem o Brent do dia; um dia sem ele é feriado assim que existe o de um dia posterior (como
     na B3). O ouro segue o pregão da B3: num feriado só da B3, o ouro fica sem barra (as ordens dele expiram e a
     posição não é marcada). Sem câmbio: os preços e o patrimônio são em dólar.
   - **O caixa rende a meta do Fed** (decisão do usuário, 2026-10-14), no lugar da Selic do §5: o ponto médio da faixa
     (FRED `DFEDTARL` e `DFEDTARU`, já coletados), em taxa diária de 252 dias úteis, só nos dias úteis da conta.
   - Testado em dev em 2026-10-14 com uma carteira de teste começando no dia (apagada depois): a rodada decidida, as
     referências com quantidades em onças e barris, o diário e a medição em dólar.

**A 1ª rodada** é o início da primeira carteira, criada quando as três trilhas puderem começar juntas (depois da etapa
4); a data é registrada aqui nesse dia e fixa a avaliação (§10). **Registrada em 2026-10-14:** a carteira "B3 – Cartilha
v1.0" (espaço Família Souza) começou em **2026-10-14**, decidido pelo usuário. A tela só aceita início depois de hoje;
ela foi criada para 15/10 e o usuário mudou o início para 14/10 no banco (a carteira e a versão 1 dos parâmetros, sem
nenhuma rodada ainda), com a rotina rodada à mão. Exceção só deste 1º dia: a rodada foi decidida depois da abertura da
B3, e não às 06h30, com os insumos travados até a véspera como em qualquer rodada (a leitura da madrugada e o mercado
até D−1). Daí em diante, o cron das 06h30 (ADR 0004). **A conta internacional, registrada em 2026-10-14:** a carteira
"Internacional – Cartilha v1.0" (espaço Família Souza; ouro e petróleo, US$ 2.000, os padrões da Cartilha) começou em
**2026-10-14**, decidido pelo usuário. Criada pela tela para 15/10, teve o início mudado para 14/10 no banco pelo
usuário (a carteira e a versão 1 dos parâmetros, sem nenhuma rodada ainda, com a guarda do id, da conta e da data), e
a rotina rodou à mão: a rodada de 14/10 foi decidida depois da abertura do mercado, com os insumos travados até a
véspera, a mesma exceção do 1º dia da B3. A avaliação dela conta dessa data (cada carteira tem a sua medição). Os custos reais por contrato (corretagem e
emolumentos da B3) e o tamanho do contrato do café (a Cartilha diverge entre 100 e ~458 sacas; com quantidade
fracionária, não muda o resultado em R nem em %) podem chegar depois (§8).

## Adendo de 2026-10-15: o dólar na conta B3 (decisão do usuário)

**Contexto.** O §11 deixou o dólar fora: a Cartilha v1.0 não o traz como ativo operado (só como risco cambial da conta
internacional), e a Tabela 2 não tem parâmetros para ele. O usuário (Welerson, com o mesmo poder de decisão do David)
decidiu incluí-lo em 2026-10-15, com as decisões abaixo, propostas pelo assistente.

**Decisões (usuário, 2026-10-15):**

1. **O contrato:** o minidólar da B3 (**WDO**), na **conta B3**, em reais. Mesmo ajuste do DOL em todos os vencimentos
   (ADR 0118), e é onde está a liquidez (em 2026-10-08, 2,26 milhões de contratos de WDOX26 contra 277 mil de DOLX26).
   Especificação: US$ 10.000 por contrato, cotado em R$ por US$ 1.000 (multiplicador 10), tick de 0,5 ponto. A
   **Qualidade da IA continua pela PTAX** (ADR 0126): a carteira precisa de um contrato negociável, a medição da leitura
   não.
2. **O vencimento, sem rolar, com números próprios:** entra só com **mais de 3 dias úteis** até o limite, **encerra 2
   dias úteis antes** dele e exige **100 contratos** no dia. O WDO vence todo mês e o negócio fica no 1º vencimento; com
   os 30 e 15 do agro, a carteira operaria o 2º ou o 3º, com ~0,1% a 0,3% do volume do 1º. A opção de rolar foi
   descartada: a rolagem carrega o diferencial de juros.
3. **O risco e os alvos:** os do agro da B3 (2%, piso de 1,5× o ATR(14), alvo 1 em 1R, alvo 2 em 3R, R:R mínimo 1:2).
4. **A slippage:** 1 tick (o agro usa 2).

**Implementação.**

- **O vencimento e a liquidez passam a ser parâmetros por ativo** (`carteiras/parametros.js`: de `execucao` para cada
  ativo; na tela, da "Execução simulada" para a tabela "Por ativo"). Nos outros ativos, os mesmos 30, 15 e 100. As
  versões já gravadas não são reescritas (append-only): na leitura, o valor único da execução vai para cada ativo
  (`noFormatoAtual`), e nada muda no que as carteiras existentes faziam.
- `carteiras/especificacoes.js` v2 (o DOLAR) e `mercado-carteira.service.js` (o WDO, `B3.WDO`).
- **O limite do contrato** (`centro-decisao.service.js::limiteDoVencimento`): no DOL e no WDO, o **último dia útil do
  mês anterior** ao do contrato, sem o 31 de dezembro (a B3 não abre). Antes, valia o dia 15 do mês do contrato, duas
  semanas depois do fim real. Conferido no banco de dev: todos os WDO de 2025-06 a 2026-09 pararam nesse dia (o WDOF26
  em 2025-12-30). Muda só para DOL e WDO, e a leitura diária do dólar não usa contrato por horizonte (ADR 0126).
- A rodada, a recomendação da IA e os eventos já eram genéricos por ativo: o dólar entra com a leitura de tendência
  (ADR 0126) e os eventos dele (ADR 0124).
- **Conferido em dev:** a decisão usa o WDOV26 até 2026-09-24 e o WDOX26 a partir de 2026-09-25, com ATR(14) de 45 a 60
  pontos e o ponto valendo R$ 10.

**Decisões seguintes (usuário, 2026-10-15):**

5. **As travas e as vagas:** o dólar segue as da conta B3 (4% no dia, 8% na semana, no máximo 2 posições), disputando as
   vagas com o agro. A Cartilha (Cap. 6) limita a exposição **por conta**: "máx. 2 posições simultâneas por conta;
   risco agregado ≤ limite diário". Com o dólar a 2%, 2 × 2% = 4%, o limite diário; uma vaga própria (6%) passaria dele.
6. **A Persistência do dólar pela PTAX:** a direção dos 30 dias vem da PTAX de venda, a série da faixa LATERAL (1,9%)
   e da Qualidade da IA (ADR 0064); a execução segue no WDO. O WDO embute o diferencial de juros e converge para a PTAX
   até o vencimento: no banco de dev, cada vencimento fica ~0,6% acima do anterior, e a variação de 30 dias do WDO
   sai ~0,5 p.p. abaixo da PTAX (em 2026-10-09: −2,02% no WDO, "baixa"; −1,45% na PTAX, "lateral").
   `mercado-carteira.service.js` (`variacaoPela`).
7. **O dólar numa carteira própria**, sem o agro. O café e a soja da B3 já têm exposição ao dólar (o preço em dólar,
   convertido pela PTAX; o stop protege só o preço em dólar), e o dólar na mesma carteira a somaria ou anularia. Em dev
   (2026-10-09, R$ 10.000, 1R = 2%): uma alta de 2% no dólar vale ±1,1R no WDO, ±1,2R na soja só pelo câmbio e ±0,4R no
   café; dólar e soja comprados, com o real subindo 2%, perderiam ~2,2R (4,4%), acima da trava diária. Sem regra de
   correlação na Cartilha, a separação evita o caso sem inventar regra. Uma conta própria ("B3 dólar") foi descartada:
   a conta define moeda, calendário, caixa e travas, iguais aos da B3. Implementação: `carteiraPropria` na
   especificação do dólar; `validarParametros` recusa a mistura (a criação e as versões novas); o padrão da conta B3
   (`painel-carteira.service.js`) e a tela de criação (`utils/carteiras.js::selecaoPadrao` e `alternarAtivo`) deixam o
   dólar desmarcado, marcá-lo desmarca os outros, e marcar outro o desmarca.

**Pergunta ao Comitê:**

- **A correlação**, para quando se quiser dólar e agro na mesma carteira: que regra vale (bloquear a mesma direção,
  contar a exposição cambial no risco agregado...)? Até lá, a trava da decisão 7.
- **O custo por contrato** do WDO começa pendente, como nos outros ativos.

## Alternativas consideradas

- **Contratos inteiros com capital maior:** com R$ 10.000, nenhum contrato da B3 cabe no risco de 2% pelo piso de ATR
  (o milho pede ~R$ 38 mil, o café ~R$ 470 mil). Um modo por trilha quebraria a regra de "tudo igual". Fica como
  indicador.
- **O estado da carteira no prompt:** com três trilhas em estados diferentes, não há um estado só; os três ramos
  resolvem e mantêm dado privado fora do prompt.
- **Sharpe como métrica principal:** em 12 meses, uma diferença de 0,5 não é demonstrável; a diferença diária pareada
  usa todos os dias.
- **Avaliar o stop só no ajuste:** subestima as perdas (o preço passa do stop e volta no mesmo dia); a Cartilha pede
  stop no servidor (§2.6).

## Consequências

- As primeiras tabelas PRIVADAS e a primeira IA sobre dado de espaço (sem dado privado no prompt).
- O CI ganha um Postgres para o teste de isolamento.
- A §5 do `STATUS_DO_PROJETO.md` (fora do escopo) passa a citar esta exceção.
- Os parâmetros da Cartilha entram como estão; o Comitê pode mudá-los numa versão nova da carteira, sem código.
