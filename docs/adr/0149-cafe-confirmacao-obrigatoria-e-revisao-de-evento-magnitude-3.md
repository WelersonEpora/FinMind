# 0149 — Café: a confirmação obrigatória nas carteiras virtuais e a revisão imediata com evento de magnitude 3

## Contexto

A análise "ANÁLISE CAFÉ 19out26" (resposta no `STATUS_DO_PROJETO.md`, §0) pede, na §6 (governança):

- **Confirmação obrigatória:** "sinal de baixa com momentum de 20 dias positivo e backwardation exige revisão manual antes
  da execução";
- **Revisão:** "IC mensal por fator; revisão trimestral de pesos; revisão imediata em caso de evento de magnitude 3".

O Comitê, na resposta de 2026-10-22: aprova a **revisão imediata com evento de magnitude 3**, e a **confirmação
obrigatória somente nas carteiras virtuais**, até a validação. O FinMind não executa ordens (`CLAUDE.md`): a execução
existe só na simulação das carteiras virtuais (ADR 0127).

**Quem decidiu como aplicar:** o usuário (Welerson), em 2026-10-23, com o mesmo poder de decisão do David (`CLAUDE.md`),
sobre a recomendação do FinMind:

- a confirmação só no **café** (a regra veio da análise do café; estendê-la seria decidir pelos outros ativos), e como um
  **bloqueio** das trilhas automáticas, não um botão de confirmar: a trilha IA mede a IA, e a do operador, a pessoa. Um
  botão que deixasse a trilha IA executar misturaria o julgamento humano à medição pré-registrada (ADR 0127);
- o momentum é o **z de 20 pregões do KC**, a mesma medida que já vai ao prompt (ADR 0139), sem número novo; o
  backwardation, o **1º vencimento negociado do ICF acima do 2º**;
- a magnitude 3 é o **grau ALTA** da leitura diária de eventos (a escala de três níveis do FinMind: BAIXA, MEDIA e ALTA);
- a revisão é um quadro na Metodologia do café com o botão **"Revisado"**, numa tabela nova.

## Decisão

### 1. A confirmação obrigatória (carteiras virtuais, café)

- **O mercado de D−1** (`mercado-carteira.service.js::confirmacaoDoCafe`), na decisão de D: o z de 20 pregões do KC até
  D−1 (`momentum-kc.js`) e os dois primeiros vencimentos do ICF com contratos negociados no último pregão. Exige a revisão
  com o z acima de 0 **e** o 1º vencimento acima do 2º. Sem um dos dois dados, não exige.
- **O motor** (`carteiras/motor.js`): a entrada **vendida** das trilhas IA, Determinística e Persistência no café, com a
  revisão exigida, é bloqueada com o motivo `CONFIRMACAO_OBRIGATORIA` e o detalhe (o z e os dois vencimentos). Aparece nas
  intenções da rodada. A entrada comprada passa; reduzir e zerar nunca são bloqueados (como as travas).
- **O operador** é a revisão manual: a conferência da entrada dele não bloqueia e mostra o aviso
  `CONFIRMACAO_OBRIGATORIA` ("a entrada é decisão sua"). Comprar e segurar nunca vende.
- **A regra está no código** (`CONFIRMACAO_OBRIGATORIA = { CAFE: true }`), não nos parâmetros versionados da carteira:
  é uma regra do Comitê, provisória ("até a validação"), igual para todas as carteiras. Vale a partir do deploy; as
  rodadas anteriores ficam como foram decididas.
- **O dado real (dev):** em 14/10/2026 a regra exigiria a revisão (z +0,07; o ICFZ26 a 360,60 acima do ICFH27 a
  359,40); em 07/10 e em 15/09, não (o momentum negativo).
- Nenhuma mudança na liquidação, no razão ou na medição das carteiras.

### 2. A revisão imediata com evento de magnitude 3 (café)

- **Os pendentes** são calculados (`revisao-evento.service.js`): os eventos **aceitos de grau ALTA** do café na leitura
  diária de eventos, desde 2026-10-22 (a decisão do Comitê), sem revisão.
- **A tabela `revisao_evento`** (GLOBAL, ADR 0007) guarda só a revisão feita: o ativo, a data da leitura, a chave
  natural do evento (o ativo, a data e o título: a leitura do dia pode ser refeita e trocar os ids), a cópia do evento,
  a observação, quem revisou e quando.
- **A API:** `GET /api/v1/revisoes-evento?ativo=CAFE` (autenticado); `POST /api/v1/revisoes-evento` e `POST
  /api/v1/revisoes-evento/desfazer` (admin; a chave no corpo).
- **A tela:** Metodologia do café, seção "Revisões pendentes": cada evento com a data, o título, a pressão e a revisão
  (pendente ou revisado, com a observação), e o botão **Revisado** (admin), com uma observação opcional.
- A revisão é de **governança** (os fatores e as regras diante do fato). A leitura da IA do dia já considera o evento;
  nada é refeito automaticamente.

## Consequências

- **Volume esperado:** no servidor, de 02/10 a 23/10/2026 (53 leituras de eventos), **nenhum evento do café foi aceito**,
  em nenhum grau. A revisão deve disparar pouco, e o dado reforça a crítica do E2 ao módulo de eventos, que a Captura de
  eventos (ADR 0144) vai medir.
- A trilha IA das carteiras que operam café pode ter entradas vendidas bloqueadas; o bloqueio fica registrado e entra na
  leitura da medição (uma intenção não executada).
- Estender a confirmação ou a revisão a outro ativo é uma decisão nova (uma linha em cada constante, e o CHECK da
  tabela).
