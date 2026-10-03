# 0050 — Proposta de metodologia dos fatores do petróleo, para o David validar

**Status:** aceita (2026-10-02).

## Contexto

Com a aquisição de dados encerrada (`STATUS_DO_PROJETO.md`, §1), o que falta em cada fator não é fonte: é a forma de
medir e de ler. O FEL 1 dá, para cada um dos 10 fatores do petróleo, o tipo, a direção do impacto, o mecanismo de
transmissão, o peso e a fonte (tabela "Fatores de Influência de Preço: Petróleo"), mas não diz como medir.

O projeto já propõe a camada A (a medida) ao Comitê: o milho na §5 e o ouro na §5b do status. Em 2026-10-02 o usuário
(Welerson) pediu ao GitHub Copilot um primeiro desenho dos fatores do petróleo: uma tela "Metodologia do Ativo" e um
catálogo com objetivo, indicadores, referências, interações e uma "decisão adotada" por fator. A revisão achou três
problemas: o rascunho aparecia como decisão (ex.: "estoque contra a média móvel de 5 semanas" no fator de estoques,
que não está no FEL 1); um service derivava a direção da geopolítica dos eventos da IA ("alta" se algum evento tivesse
pressão alta), uma regra de sinal; e o que o David escreveu (direção, mecanismo, fonte) ficava de fora.

**Decisão do usuário (Welerson, 2026-10-02):** seguir na direção dos fatores mesmo assim, como proposta, porque o
David provavelmente tem a mesma dúvida e um caminho concreto (que pode estar errado) é mais fácil de ajustar do que
uma folha em branco. **Limite:** proposta de metodologia para o David validar; não é regra, não alimenta o motor, o
Centro de Decisão nem a IA e não gera sinal.

## Decisão

1. **Um catálogo por ativo, com a origem de cada item** (`backend/src/shared/metodologia-petroleo.js`):
   - `fel1`: o que o David escreveu (tipo, direção, mecanismo, fonte), copiado da tabela do FEL 1 v1.1 sem reescrever;
     nome e peso vêm de `fatores-fel1.js`;
   - `dados`: os cards do catálogo de observáveis que já atendem o fator, se os eventos de mercado atendem, e as
     lacunas conhecidas (fato, não proposta);
   - `proposta`: as três camadas do motor (§5 do status): a medida (A), a comparação (B) e um esboço da leitura (C),
     com `situacao: "PROPOSTA"`. Vira `"VALIDADA"` só quando o David confirmar, com a data registrada aqui;
   - `perguntas`: o que o David precisa decidir para a proposta virar regra.
2. **API** `GET /api/v1/ativos/:ativo/metodologia` (autenticada), resposta `{ ativo, ativos, metodologia }`: os 4 ativos
   do FEL 1 com `disponivel`, e `metodologia` nula para um ativo ainda sem metodologia; ativo fora do FEL 1 dá 404.
   A tela segue o desenho do Centro de Decisão (ADR 0048): título genérico, um card de contexto com o seletor de
   ativo e, depois, os cards dos fatores. **Tela** `/dados-mercado/metodologia/:ativo` ("Metodologia do Ativo" no menu de Dados de Mercado), com um aviso
   fixo de que é proposta e cada bloco rotulado pela origem; o bloco da proposta tem moldura tracejada.
3. **Sai** o service que derivava a direção da geopolítica dos eventos da IA (`petroleo-fatores.service.js`) e a
   "decisão adotada": a direção de um fator é camada C, e o Comitê a decide. O FinMind a **simula** (item 6), com
   parâmetros explícitos.
4. **Por que em `shared/` e não em `factors/`:** `factors/` guarda funções determinísticas e versionadas sobre a
   `observation` (ADR 0008, como o juro real de 10 anos). O catálogo é texto. Quando uma medida proposta for calculada
   (ex.: o estoque contra a média de 5 anos), ela entra em `factors/` nesse molde, sem ser gravada e sem alimentar
   nada até ser validada.
5. **Piloto calculado: estoques EIA** (`factors/estoques-petroleo-eia.factor.js`, versão 1), para o David ver a
   proposta no histórico e não só em texto. Camadas A e B: o estoque de petróleo sem a SPR, a variação contra a
   semana anterior, a média da mesma semana nos 5 anos anteriores (52, 104, ... 260 semanas antes; nula se faltar
   uma) e o desvio contra ela. O preço não entra: o fator mostra só o que está na conta
   dele (decisão do usuário, 2026-10-02; o preço é confrontado com todos os fatores na análise final). Point-in-time
   pelo `obterAsOf`, nunca gravado. API `GET /api/v1/ativos/:ativo/metodologia/fatores/:fator/calculo?desde=`
   (`{ calculo }`, com `situacao`, `periodicidade: "SEMANAL"` e `tempoReal: false`); na tela, dentro do fator,
   com o resumo da última semana marcado pelas camadas (A. Medir, B. Ler) e o gráfico do estoque contra a média.
   Conferido no banco de dev: em
   jun/2020 o estoque estava 15% acima da média (WTI a US$ 38); em jun/2022, 12,5% abaixo (WTI a US$ 109). Os outros
   fatores só ganham cálculo depois de o David reagir a este.
6. **O dado basta? Avaliado fator a fator, com o histórico** (`dados.avaliacao`). O FEL 1 foi escrito com apoio de
   IA, e o usuário (2026-10-02) pediu para verificar se cada fator pode ser medido com o que já temos, sem atender
   necessariamente todos os requisitos do FEL 1. **Estoques EIA: basta.** No banco de dev, de 2010 em diante, o desvio
   do estoque contra a média de 5 anos tem correlação de -0,55 com o nível do WTI (estoque abaixo do normal, preço
   alto). O que o dado não dá é a reação do dia da divulgação: medida no dia estimado da publicação, nem a variação
   semanal nem a variação contra a típica da semana acompanham o WTI (correlações entre -0,05 e +0,04; preço no
   sentido esperado em 55% das 678 semanas com variação acima de 4 milhões de barris desde 1987), porque o mercado
   reage à previsão dos analistas, que é paga. O desvio também não prevê sozinho o WTI das 4 semanas seguintes. A
   reação do dia não é o horizonte do FinMind, então a previsão dos analistas e o API ficam como lacunas sem custo.
   Por isso a "surpresa contra a variação típica" não entrou no piloto. Ressalva: de 1987 em diante, a correlação com
   o nível do WTI some (+0,09), porque a relação muda com o regime de preço (antes e depois do shale).
7. **Camada C simulada, com parâmetros que o Comitê ajusta** (decisão do usuário, 2026-10-02: "estamos tentando
   simular o fator para mostrar como vai ficar"). No fator de estoques: a **direção** (pressão de alta, de baixa ou
   neutra) pelo desvio contra a média de 5 anos, com uma faixa neutra; a **intensidade** (fraca, moderada, forte)
   por um segundo limiar; a **tendência** (apertando, afrouxando, estável) pela mudança do desvio numa janela de
   semanas. O **peso** não é calculado: é o do FEL 1. Padrões do FinMind: faixa neutra de 3%, forte a partir de 10%,
   janela de 4 semanas e mudança mínima de 2 p.p., tirados da distribuição do desvio de 1987 a 2026 (mediana de
   ~5,5%, 3º quartil de ~10%; a mudança em 4 semanas tem mediana de ~1,9 p.p.). Os parâmetros são editáveis na tela
   e vão na query da API (validados; a resposta traz os em uso e os padrões); a regra roda só no backend
   (`decidirEstoques`), e os exemplos (4 semanas reais e 5 cenários hipotéticos) usam a mesma regra. Fica num card
   próprio, "C. Decidir", com a decisão da semana explicada passo a passo e o gráfico do desvio com as faixas. A
   direção simulada **não sai da tela de metodologia**: não alimenta o motor, o Centro de Decisão nem a IA.
8. **Os parâmetros em uso no sistema ficam no banco, ajustáveis na tela** (decisão do usuário, 2026-10-02: "estes
   são os valores usados no sistema, e o usuário pode ajustá-los aqui mesmo"). Tabela `fator_parametro_versao`
   (GLOBAL, ADR 0007): cada ajuste é uma **versão nova**, nunca um UPDATE, com os parâmetros completos, o motivo
   (obrigatório) e quem salvou. Sem versão gravada, valem os padrões do código (item 7). A versão vigente é a de
   número maior; o histórico guarda o que valia em cada data, para um backtest futuro usar os parâmetros da época.
   Na tela, duas ações separadas: **Simular** (qualquer usuário, só na tela, nada gravado) e **Salvar como valores
   do sistema** (só o admin da plataforma, como a coleta manual; quando existir um papel do Comitê, passa a ser
   dele), com o motivo. A tela mostra de onde vêm os valores ("Versão 2, salva por ... em ...", ou "Padrão do
   FinMind") e o histórico das versões. API: `GET` e `POST /api/v1/ativos/:ativo/metodologia/fatores/:fator/parametros`
   (o POST com `requireRole("admin")`; parâmetros incompletos, inválidos ou iguais aos em uso e motivo curto dão
   400; dois salvamentos simultâneos, 409 pelo índice único de fator e versão). O cálculo
   (`.../calculo`) usa os valores do sistema e aceita outros na query só para simular (`simulacao: true`). Quando
   o motor existir, ele lê os parâmetros desta tabela.
9. **`CLAUDE.md`:** a restrição "nunca invente cálculo de mercado" ganha uma exceção explícita para propostas assim
   marcadas.

## Consequências

- O David recebe, por fator, o que ele escreveu, os dados disponíveis, um rascunho e as perguntas, numa tela só.
- O risco é a proposta ser lida como regra, e a direção simulada como sinal. As defesas: o rótulo "Proposta,
  aguardando o David" em cada fator, o aviso fixo na tela, o card da camada C rotulado como simulação e com os
  parâmetros à vista, nenhum consumidor no motor ou na IA e um teste que barra uma proposta sair como validada sem
  mudar o teste.
- Algumas medidas propostas dependem de dado que não é coletado (consenso de analistas, rig count, cotas da OPEP+):
  as lacunas ficam visíveis em cada fator, e fonte nova continua exigindo demanda específica e autorização (§1 do
  status).
- Os outros ativos podem seguir o mesmo molde, um arquivo por ativo registrado em `metodologia-ativo.service.js`.
