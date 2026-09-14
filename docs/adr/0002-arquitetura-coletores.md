# 0002 — Arquitetura de coletores

## Contexto

`backend/src/collectors/base/collector.interface.js` já existia como um
contrato vazio (`{ codigo, fetch, parse, persist }`, registro privado sem
função de registro pública), pensado para o dia em que houvesse um coletor
real. Com a primeira integração real (ADR 0001), esse contrato precisou
virar pipeline de verdade: timeout configurável, retry em falha transitória,
separação entre falha de comunicação e falha de dado, log estruturado e
registro de execução — o mesmo conjunto de responsabilidades do pipeline de
coleta do AgroMind (`download → parse → normalize → persist`), usado como
referência explícita pelo pedido do usuário.

## Decisão

Estender (não substituir) o contrato existente para:

```js
{
  codigo: string,
  timeoutMs: number,
  tentativasRetry: number,
  download: async ({ signal }) => rawData,
  parse: (rawData) => rawItems[],
  normalize: (rawItems) => { validos, invalidos },
  persist: async (validos, { execucaoId }, deps) => { criados, atualizados, ignorados, falhas }
}
```

- `collector.interface.js` ganhou `registerCollector(collector)` (não
  existia antes — só havia `listCollectors()` sobre um array privado).
- `collector-runner.js` (novo) orquestra qualquer coletor que siga o
  contrato: cria o registro de execução, roda `download` com timeout
  (`AbortController`) + retry (`retry.js`, só na fase de download), `parse`,
  `normalize` e `persist`, calcula o status final e atualiza o registro de
  execução — reutilizável por qualquer coletor futuro, não só o do dólar.
- `collectors/bcb/bcb-usd-brl.collector.js` é o primeiro coletor concreto,
  registrado em `collectors/index.js` (chamado uma vez na subida do processo
  em `app.js`, e pelo script `scripts/run-coleta.js`).

## Alternativas consideradas

- **Manter o contrato antigo (`fetch/parse/persist`), sem `normalize` nem
  runner genérico** — rejeitada: não daria pra separar item inválido de
  falha de comunicação, nem reaproveitar retry/timeout/log entre coletores
  futuros sem duplicar código em cada um.
- **Fila/worker dedicado para rodar coletores** — rejeitada nesta etapa (ver
  ADR 0004); o runner é síncrono, chamado dentro da requisição HTTP (disparo
  manual) ou de um script (cron externo).

## Justificativa

- Mesma forma (download/parse/normalize/persist) do pipeline do AgroMind,
  adaptada às convenções já existentes do FinMind (camadas
  controller→service→repository→model, DI via `deps`, erros como subclasse
  de `AppError`).
- Um item de dado inválido (ex.: data em formato inesperado) nunca aborta o
  restante do lote — só uma falha de comunicação com a fonte (timeout, rede,
  HTTP 5xx) marca a execução inteira como `failed`.

## Consequências

- `GET /api/v1/status` passa a refletir automaticamente `collectors.status:
  "ok"` assim que qualquer coletor for registrado (nenhuma mudança extra
  necessária ali — só chama `listCollectors().length`).
- Adicionar um novo coletor é: criar o módulo em `collectors/<fonte>/`,
  registrá-lo em `collectors/index.js`, e (se persistir um tipo de dado novo)
  criar migration/model/repository seguindo o padrão de `market_quote`
  (ver ADR 0003).
- **Backfill (2026-09-14):** `bcb-usd-brl.collector.js` ganhou uma segunda
  função de download (`downloadIntervalo({ dataInicial, dataFinal })`),
  reaproveitando `parse`/`normalize`/`persist` do coletor original.
  `scripts/backfill-dolar.js` monta um objeto "coletor" que só troca a fase
  de download (últimos N pontos → intervalo de datas) e roda pelo mesmo
  `executarColetor`, gerando o mesmo tipo de registro em
  `collection_execution`. Padrão a seguir para o backfill de um futuro
  coletor: expor uma função de download alternativa no próprio módulo do
  coletor, nunca duplicar parse/normalize/persist num script à parte.
- Durante a validação do backfill, um bug real foi encontrado e corrigido em
  `collector-runner.js`: o `AbortController`/timeout era criado uma única
  vez fora do laço de retry, então uma tentativa abortada por timeout
  deixava o `signal` permanentemente abortado — todas as tentativas
  seguintes do mesmo retry nasciam já abortadas, sem tentar de verdade.
  Corrigido para criar um `AbortController` novo a cada tentativa (com
  teste de regressão em `collector-runner.test.js`).

## Em aberto

- Novos coletores (além do dólar) continuam bloqueados por
  `docs/pendente-especialista-david.md`.
- Execução paralela de múltiplos coletores (hoje é sequencial) — sem
  necessidade real ainda, com só um coletor registrado.
