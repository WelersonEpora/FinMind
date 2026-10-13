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
  dia seguinte pode reentrar no próximo vencimento.
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
  abrir segmento novo.
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

- **Pergunta principal:** a recomendação agrega valor sobre a regra fixa? Medida: a **diferença diária de retorno IA −
  Determinística**, em % do capital inicial, com intervalo de 80% por block bootstrap (blocos de 10 pregões, semente
  fixa). Veredito: agrega se o limite inferior > 0; inconclusivo se o intervalo contém 0; não agrega se o limite
  superior < 0.
- **Datas:** avaliação na **1ª rodada + 6 meses** (FEL 1, §12.1) e final em +12 meses; aos 3 meses, só descritivo, sem
  parar. Conta só o segmento principal: mudar parâmetros, modelo ou prompt reinicia a contagem.
- **O custo da IA fica na métrica secundária** (D6): é fixo por carteira e não cresce com o capital; na principal, o
  veredito dependeria do capital escolhido. A tela mostra o ponto de equilíbrio.
- **Secundárias:** as métricas da Cartilha (Cap. 9.5) por trilha e ativo; Sharpe sobre a Selic, volatilidade, drawdown e
  tempo exposto; atribuição (dias divergentes, operador alinhado × contrário à recomendação, recomendações contrárias à
  leitura, cortes do motor, fallback, consistência e custos).

### 11. Ativos e contas (D2, D12)

Petróleo, ouro, milho, café e soja; o dólar fica fora. O petróleo segue no Brent (o WTI fica guardado). A **soja entra**,
com a divergência registrada: a Cartilha a trata como ativo de observação até decisão do Comitê (§2.2e). **Começa pela
conta B3** (milho, café e soja): o piso da Tabela 2 no agro é o ATR(14) diário, calculável com dados oficiais. Na conta
internacional, o piso usa o ATR diário (a Cartilha pede o de 4 horas, que não temos), e o stop do petróleo pede a
máxima e a mínima do Brent (D2): elas vêm na mesma resposta do Yahoo que já coletamos (ADR 0096); a coleta delas, na
etapa 8, num adendo a este ADR. Até lá, ATR do ajuste.

## Etapas

0. Este ADR; `CLAUDE.md`, `STATUS_DO_PROJETO.md` e ADR 0007.
1. O domínio puro (`backend/src/carteiras/`): parâmetros, ATR, risco, travas, motor e razão, com testes.
2. Migrations, models e repositórios `forWorkspace`; a criação da carteira; o teste de isolamento com o Postgres no CI.
3. A rodada, a trilha Determinística, as referências e o script.
4. A recomendação e a trilha IA.
5. API e telas (protótipo aprovado: lista, criação, configuração, visão geral, recomendação, posições, operações,
   patrimônio).
6. O diário do operador.
7. A medição.
8. A conta internacional.

**A 1ª rodada** é o início da primeira carteira, criada quando as três trilhas puderem começar juntas (depois da etapa
4); a data é registrada aqui nesse dia e fixa a avaliação (§10). Os custos reais por contrato (corretagem e
emolumentos da B3) e o tamanho do contrato do café (a Cartilha diverge entre 100 e ~458 sacas; com quantidade
fracionária, não muda o resultado em R nem em %) podem chegar depois (§8).

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
