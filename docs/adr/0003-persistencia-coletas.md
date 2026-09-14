# 0003 — Persistência e rastreabilidade das coletas

## Contexto

A primeira integração real de dados (ADR 0001) precisava de um lugar para
guardar tanto a série coletada (cotação do dólar) quanto o histórico de
execuções de coleta (log de execução, pedido explicitamente pelo usuário
como componente necessário, análogo ao `coleta_execucao` do AgroMind). O
FinMind não tinha, até aqui, nenhuma tabela de dado de mercado — só `user` e
`system_setting`.

## Decisão

Duas tabelas novas, com nomes em inglês (consistente com `user`/
`system_setting`), não uma cópia literal do nome das tabelas do AgroMind:

**`market_quote`** — observações de séries financeiras, genérica por
instrumento (não específica do dólar):
- `instrument_code` (ex.: `"USD_BRL"`) e `source_code` (ex.:
  `"BCB_SGS_1"`) — strings livres, não uma tabela de ativos à parte (não há
  necessidade real disso ainda — ver `docs/pendente-especialista-david.md`).
- `modality` (`venda`/`compra`) — permite adicionar a série de compra (SGS
  10813) no futuro sem alterar o esquema.
- `reference_date` como `DATEONLY` (não `DATETIME`) — a fonte inicial é um
  fechamento diário, sem timestamp intradiário real; gravar uma hora
  fictícia (ex.: meia-noite) sugeriria uma precisão que a fonte não tem.
- `value` como `DECIMAL(18,6)` (não `FLOAT`), para nunca perder precisão em
  cálculos financeiros.
- `collection_execution_id` (FK) — toda observação sabe exatamente qual
  execução a gerou.
- Índice **único** em `(instrument_code, reference_date, source_code,
  modality)` — é a chave natural de deduplicação/upsert; o prefixo
  `(instrument_code, reference_date)` também serve às consultas de
  histórico por instrumento+período.

**`collection_execution`** — log de execução de coleta (qualquer coletor,
não só o do dólar): `collector_code`, `trigger_type` (`manual`/`script`),
`status` (`running`/`success`/`partial_success`/`failed`), `started_at`/
`finished_at`, contadores (`records_read/created/updated/skipped/failed`),
`duration_ms`, `error_message`, `triggered_by` (FK opcional para `user`,
quando disparo é manual), `metadata` (JSON, ex.: detalhe dos itens
inválidos).

Upsert por chave natural: reexecutar a coleta no mesmo dia com o mesmo valor
não gera duplicata nem `UPDATE` desnecessário (conta como "ignorado"); um
valor diferente para a mesma data atualiza o registro existente.

## Alternativas consideradas

- **Copiar a modelagem do AgroMind (`observacao` + `coleta_execucao`,
  com `commodity_id`/`regiao_id`/`indicador_id` como FKs para tabelas de
  domínio)** — rejeitada; o FinMind não tem (nem deveria inventar agora)
  tabelas de ativo/indicador/região antes das definições do David. Uma
  string de código (`instrument_code`) resolve o caso de uso atual sem
  comprometer uma modelagem de domínio que ainda não existe.
- **`DATETIME` em `reference_date`** — rejeitada, ver justificativa acima
  (a fonte não tem granularidade intradiária).
- **`FLOAT`/`DOUBLE` para `value`** — rejeitada por risco de erro de
  arredondamento em valores financeiros.

## Justificativa

Chave natural + upsert é o mecanismo mais simples que já resolve
"duplicidade de execução tratada adequadamente" (pedido explícito do
usuário) sem precisar de um guard de "já rodou hoje" como o do AgroMind (lá
existia para evitar gastar cota paga de IA a cada retry do cron; aqui a API
do BCB é gratuita e sem limite prático, então o upsert simples já basta).

## Consequências

- Primeira associação Sequelize real do projeto
  (`CollectionExecution.hasMany(MarketQuote)` / `MarketQuote.belongsTo
  (CollectionExecution)` / `CollectionExecution.belongsTo(User, {as:
  "usuarioDisparo"})`) — os models anteriores (`User`, `SystemSetting`) não
  tinham nenhuma.
- Adicionar um novo instrumento/ativo não exige migration nova — só um novo
  `instrument_code`/`source_code` nos dados.

## Em aberto

- Se/quando o especialista David definir uma lista formal de ativos, avaliar
  se `instrument_code`/`source_code` como string livre ainda é suficiente ou
  se vale a pena uma tabela de domínio (`asset`/`instrument`) — decisão
  adiada de propósito, sem necessidade real hoje.
