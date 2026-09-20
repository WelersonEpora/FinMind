# 0008 — Camada `observation` (point-in-time, append-only)

## Contexto

`market_quote` (ADR 0003) guarda **um valor por (instrumento, data)** e faz
upsert: se a fonte publica um valor diferente, ele **sobrescreve** o anterior.
Isso serve para PTAX e Selic, que não são revisadas. Não serve para os dados
que o relatório FEL 1 manda coletar (WASDE, Conab, Crop Progress, CPI, COT...):
eles são revisados, e o backtest previsto no FEL 1 (§9.4, §12.3) só é válido se
o sistema souber responder **"o que estava disponível em D?"**. Sobrescrever
destrói exatamente essa informação, e ela **não é recuperável depois** — ninguém
reconstrói retroativamente o que uma fonte publicava numa data passada.

Este ADR autoriza pontualmente, a pedido do usuário do projeto (2026-09-20),
a coleta de dados de **ouro e milho** listados na análise
`docs/analise-critica-fel1-milho-ouro.md`. Como nas exceções do dólar e da
Selic, vale **só para aquisição de dados**: nenhum sinal, limiar, indicador
técnico ou estratégia foi decidido aqui (ver `CLAUDE.md`, restrições
permanentes). Fontes e status: ADR 0009.

## Decisão

### Tabela `observation` — Escopo: GLOBAL

`id`, `series_code`, `observed_at` (DATE), `published_at` (DATETIME, UTC),
`collected_at` (DATETIME, UTC), `value` DECIMAL(18,6), `unit`, `source_code`,
`published_at_is_estimated`, `revision_seq`, `collection_execution_id`,
`metadata` (JSON). Chave única `uk_pit (series_code, observed_at, published_at)`.
Sem `created_at/updated_at`: a tabela nunca é atualizada e `collected_at` já é o
momento da criação. Convenção de `series_code`: `FONTE.SERIE[.DIMENSAO]`
(`FRED.DGS10`, `CFTC.GOLD.MM_LONG`); o catálogo vive no código dos coletores.

### Três instantes que não se confundem

| Campo | Significa |
|---|---|
| `observed_at` | a que período/data o valor **se refere** (a terça-feira do COT, o dia do fechamento) |
| `published_at` | quando o valor **passou a estar disponível** publicamente (UTC) |
| `collected_at` | quando o **FinMind baixou** o valor |

### Append-only

Nenhuma linha é atualizada ou apagada. Uma revisão da fonte entra como linha
**nova** (mesmo `series_code + observed_at`, `published_at` posterior). Garantias:
o model bloqueia `update`/`destroy`/`upsert` em todas as vias do Sequelize
(hooks), o repository não expõe nenhuma operação de alteração, e a chave única
impede duplicar a mesma versão. **Não** usamos trigger no banco: exigiria
privilégio extra e complica migrations/testes; se o dado passar a ser escrito
por outro sistema, reavaliar.

### Regra de escrita (`point-in-time.service.js::registrarObservacoes`)

Compara com a **versão mais recente já guardada** do mesmo `(series_code, observed_at)`:
sem versão anterior → insere (`revision_seq` 0); **mesmo valor → não escreve**
(por isso recoletar a série inteira é idempotente, mesmo quando `published_at`
é estimado e mudaria a cada coleta); valor diferente → versão nova
(`revision_seq` + 1). Valor diferente com `published_at` **não posterior** à
última versão é um conflito que o modelo não representa e vai para `falhas`.
`revision_seq` é informativo (ordem de inserção); a ordem que vale é `published_at`.

### `published_at`: real, estimado e o limite conservador

1. **Fonte informa** o instante → usado, `published_at_is_estimated = false`
   (ex.: `:updated_at` do Socrata da CFTC nas semanas publicadas ao vivo).
2. **Fonte não informa, mas há regra documentada de defasagem** → regra aplicada,
   `published_at_is_estimated = true`, base em `metadata.publishedAtBasis = "lag_rule"`
   (ex.: LBMA = leilão das 15:00 de Londres; FRED = 1 dia útil; Crop Progress = 16:00 ET no
   primeiro dia útil da semana).
3. **Nada disso** → `collected_at`, estimado, `publishedAtBasis = "collected_at"`. Nunca uma data anterior inventada.

Nunca depois de `collected_at` quando estimado (o valor já estava em mão). Um
`published_at` **real** no futuro do relógio é rejeitado, não corrigido. Quando
uma **revisão** é descoberta numa fonte de `published_at` estimado, vale
`collected_at` (a regra descreve a publicação original, não a da revisão).
Tudo em **UTC**; a conversão de fusos (ET, Londres) acontece só na entrada, no coletor.

### `asOf()`

`published_at <= :asOf` e, para cada `(series_code, observed_at)`, a versão de maior
`published_at` (`ROW_NUMBER() OVER (PARTITION BY ... ORDER BY published_at DESC)`).
Dois modos — **decisão que merece atenção**:

- **padrão** — "o que o mercado já podia saber": vale o `published_at` estimado por regra.
- **`estrito`** — "o que o FinMind de fato já tinha coletado": versões estimadas só
  valem a partir de `collected_at`.

Por que dois: com a regra literal "sem publicação → `collected_at`", todo histórico
recuperado num backfill ficaria com `published_at` = dia do backfill e `asOf(2020-07-15)`
não devolveria nada — o experimento seria impossível. Guardar a **melhor estimativa**
em `published_at` (marcada) e `collected_at` separado preserva as duas leituras sem
perder informação; a `estrito` é a regra literal. Um experimento sério deve reportar
qual modo usou e o percentual de pontos estimados.

### Observável × fator

**Observável** = série bruta coletada, em `observation`, com vintage; nunca calculada.
**Fator** = função **determinística e versionada** de observáveis lidos via `asOf()`;
**não é gravada** em `observation` (mesmo princípio da Camada Analítica do AgroMind:
recalculável, versionada por `FACTOR_VERSION`). Posição líquida do COT, juro real,
retornos, volatilidade, spreads são fatores. Primeiro fator:
`factors/juro-real-10a.factor.js`. Um fator nunca contém valor gerado por IA.

### `market_quote` NÃO é migrado agora

PTAX e Selic não são revisadas: o upsert é correto para elas e migrar seria custo
sem retorno. As duas tabelas convivem. Reavaliar quando um dado que hoje está em
`market_quote` passar a precisar de vintage, ou quando houver um consumidor que
queira uma única API de leitura.

### Onde o dado aparece

A tela **Observáveis** lê `observation` pelo mesmo catálogo estático de `market_quote`:
itens com `origem: "observation"` em `observaveis.service.js::CATALOGO_OBSERVAVEIS` (cards:
`OURO_LBMA`, `TREASURY_10A`, `DOLAR_AMPLO_FED`, `COT_OURO`, `COT_MILHO`, `CCM_PRECOS`, `CCM_LIQUIDEZ`), via
`observation-data.service.js`. Um card agrupa séries de **mesma unidade** (a modalidade é a
série no gráfico) — por isso o índice do dólar não divide card com os juros. A tela mostra
sempre a visão **vigente hoje** (`asOf = agora`) e, por honestidade, a coluna "Disponível desde"
com a marca "estimada" e o percentual de datas estimadas por observável. A leitura "o que se
sabia em D" continua sendo `obterAsOf`, usada por fatores e pelo experimento.

## Limitações

- `published_at` estimado é uma **hipótese**, não um fato: em feriados dos EUA a
  publicação real pode atrasar além da regra (não há calendário de feriados, só o
  necessário ao Crop Progress). Antes de confiar num resultado, verificar o percentual
  de observações estimadas (`resumirSeries`).
- O CSV do FRED traz só a versão **atual** dos valores: revisões passadas dessas séries
  (raras — são taxas de mercado) não são recuperáveis por ele. ALFRED (vintages reais) exigiria
  a API com chave; fica para quando alguma série revisável do FRED (ex.: CPI) entrar.
- `DECIMAL(18,6)` cobre preços, taxas e contagens; não foi pensado para séries com mais casas.
- A coleta baixa a **série inteira** a cada execução (dezenas de KB a ~1 MB por fonte) —
  aceitável hoje, revisitar se alguma fonte crescer muito.
- `POST /api/v1/coletas` executa **todos** os coletores registrados em sequência (ADR 0004);
  com os novos, uma execução manual leva dezenas de segundos.

## Alternativas consideradas

- **Estender `market_quote` com `published_at`.** Rejeitada: a chave natural e o upsert
  são a própria causa do problema; consertar seria reescrever a tabela.
- **Guardar só `collected_at` como `published_at`.** Rejeitada como única regra (ver `asOf`).
- **Tabela de versões separada da tabela "atual".** Rejeitada: duas fontes de verdade;
  o `asOf()` já entrega a visão "atual" (`asOf = agora`).
- **Persistir os fatores.** Rejeitada: viraria cache que diverge quando a fórmula muda;
  recalcular é barato e a versão do fator identifica a fórmula.
