# 0121 — Dólar, fase 1 (só aquisição de dados): o resultado primário no Focus, e o Focus sem `$select`

**Status:** aceita (2026-10-09).

## Contexto

Fase 1 do dólar, só aquisição de dados, pela autorização do ADR 0117 (usuário, Welerson, 2026-10-09). Nada vai ao motor,
ao prompt, ao Centro de Decisão nem à IA.

O fator 24 do relatório do Comitê de 2026-10-08 é o "Relatório Focus (IPCA, Selic, Câmbio, Primário)". O FinMind já coleta o
Focus anual de IPCA, Selic e câmbio (ADR 0022, escopo do FEL 1); falta o resultado primário.

## Reconhecimento

A fonte é a mesma do ADR 0022 (API OData Olinda do BCB, endpoint `ExpectativasMercadoAnuais`, sem chave, licença ODbL).
**Conferência real (2026-10-09):** o indicador "Resultado primário" está no endpoint anual, sem `IndicadorDetalhe`, com a
mediana em % do PIB (negativo é déficit) para o ano corrente e até 9 anos à frente (de 2026 a 2035 no boletim de
2026-10-02: -0,405% em 2026, -0,4% em 2027), cerca de 60 respondentes e a primeira pesquisa em 2000-01-03, como os outros
três. A série inteira, na base de 30 dias, tem 43.371 linhas.

**Um defeito da fonte, achado na mesma conferência:** a API passou a responder com a página de erro do BCB (HTML, "Error
code: 20261009T133350Z-...") a **qualquer** `$select`, até de um campo só, em qualquer consulta. Sem o `$select`, as
mesmas consultas funcionam. O coletor do Focus usava `$select`: a próxima coleta diária falharia nos quatro indicadores.

## Decisão

1. **O resultado primário entra como o quarto indicador do coletor do Focus** (`bcb-focus`), com a mesma regra (um ponto
   por boletim semanal, a mediana na base de 30 dias, a data de publicação estimada): séries
   `BCB_FOCUS.ANUAL.<ANO>.PRIMARIO`, em % do PIB. É um campo novo no card do Focus.
2. **O coletor deixa de mandar `$select`.** O `normalize` lê os campos pelo nome; os que vêm a mais (média, desvio, mínimo e
   máximo) são ignorados. A resposta fica maior (a série inteira de um indicador, ~10 MB, só no backfill; a coleta diária
   pede 35 dias). Se o BCB voltar a aceitar o `$select`, nada muda no dado.

## Implementação

- `bcb-focus.collector.js` (o indicador e a URL sem `$select`), `observaveis.service.js` (o campo no card) e os testes.
- Carga em dev (2026-10-09), `npm run backfill:bcb-focus`, 0 falhas: o primário de 2000-01-07 a 2026-10-02, 1.396
  boletins, 37 anos-alvo, 9.022 valores. Nos outros três indicadores, só os 15 valores dos boletins que faltavam em dev, e
  nenhum valor existente mudou: tirar o `$select` não mudou o dado.

## Consequências

- No servidor: `npm run backfill:bcb-focus` (para o histórico do primário; os outros três indicadores ficam como estão).
- As demais fontes da fase 1 seguem o ADR 0117.
