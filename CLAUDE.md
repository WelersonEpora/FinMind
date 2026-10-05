# CLAUDE.md

Guia rápido para trabalhar neste repositório. Para detalhe arquitetural,
veja `docs/architecture.md` e `docs/decisoes-tecnicas.md` — este arquivo
não duplica o que já está lá, só aponta pra onde procurar e resume o que um
agente precisa saber antes de tocar em código.

## Propósito do FinMind

Plataforma de inteligência aplicada ao mercado financeiro: coleta de dados
→ preparação → motor analítico (regras do especialista de mercado) → síntese
por IA → resultado. Hoje: autenticação, espaços, o Centro de Decisão (tela inicial) e a **coleta de
dados de milho e ouro** (as fontes do relatório FEL 1 do especialista de mercado,
"David"), guardada com data de publicação. Nos quatro ativos (petróleo, ouro, milho e café),
a cadeia roda inteira: os fatores, o prompt diário e a leitura de tendência da IA no Centro
de Decisão (ADRs 0050 a 0052, 0054, 0058 e 0062). O que segue com o David e o Comitê está em
`STATUS_DO_PROJETO.md`, §4.

## Restrições permanentes (não negociáveis nesta fase)

- **Nunca invente estratégia financeira, sinal de compra/venda, indicador
  técnico ou cálculo de mercado** que não tenha sido definido pelo
  especialista David. Um coletor de dado público oficial (ex.: cotação do
  dólar via BCB) é infraestrutura, não estratégia — mas qualquer regra que
  *interprete* esse dado (limiar, sinal, recomendação) é. **Exceção:**
  uma *proposta* de metodologia de fator para o David validar (ADR 0050)
  é permitida, desde que fique marcada como proposta (`situacao:
  "PROPOSTA"`), separada do que vem do FEL 1 e não alimente o motor, o
  Centro de Decisão nem a IA. A direção de um fator pode ser *simulada*
  (camada C), com parâmetros explícitos e ajustáveis pelo Comitê, só na
  tela de metodologia. **Exceção do petróleo, do ouro, do milho e do café
  (ADRs 0052, 0054, 0058 e 0062):** com as decisões dos fatores aprovadas pelo
  David em 2026-10-03 (petróleo e ouro) e pelo Comitê em 2026-10-04 (milho) e
  2026-10-05 (café), o prompt diário vai à IA e a leitura de tendência (nunca
  recomendação de compra ou venda) aparece no Centro de Decisão desses ativos;
  um ativo novo segue a regra acima.
- **Nenhuma execução automática de ordens** existe ou deve ser adicionada
  nesta fase. A arquitetura mantém geração de análise e execução de ordens
  como camadas fisicamente separadas (ver `docs/architecture.md`).
- **IA nunca é a fonte de verdade de um dado** quando existe fonte
  estruturada oficial confiável (ver ADR 0001) — e uma resposta de IA nunca
  dispara uma ação sozinha (ver `backend/src/ai/README.md`).
- **A aquisição de dados está encerrada desde 2026-10-01** (`STATUS_DO_PROJETO.md`, §1):
  não proponha fonte nova por iniciativa própria. Fonte nova só com uma demanda
  específica (do David, do Comitê ou do usuário), se estiver no FEL 1 e com
  autorização explícita do usuário registrada num ADR. As candidatas estão em
  `docs/reconhecimento-fontes/README.md`; as perguntas ao David, na §4 do status.

## Arquitetura e estrutura do repositório

Ver `docs/architecture.md` (diagrama de camadas, árvore de diretórios
completa, convenções de deploy) e `docs/decisoes-tecnicas.md` (por que cada
decisão foi tomada). Resumo do que muda com mais frequência:

- **Backend** (`backend/src/`): `controllers` → `services` → `repositories`
  → `models` (Sequelize), nessa ordem estrita — `services` nunca tocam
  Sequelize diretamente. Erros de domínio são sempre uma subclasse de
  `AppError` (`shared/errors/`), tratados centralmente por
  `shared/middlewares/error-handler.js`.
- **Coleta de dados** (`backend/src/collectors/`): pipeline genérico em
  `base/` (`collector.interface.js`, `collector-runner.js`, `retry.js`) +
  coletores concretos por fonte (`bcb/bcb-usd-brl.collector.js`). Ver
  "Convenções para novos coletores" abaixo.
- **Frontend** (`frontend/src/`): `views/` (uma por rota) consomem
  `services/` (axios), que chamam a API. Componentes de gráfico ficam
  isolados em `components/charts/` — nenhuma view importa `echarts`/
  `vue-echarts` diretamente.
- **ADRs** (`docs/adr/`): decisões arquiteturais registradas uma a uma.
  Leia antes de propor uma mudança estrutural; atualize/reference uma ADR
  existente em vez de duplicá-la.

## Como executar

```bash
cp .env.example .env   # preencher JWT_SECRET, ADMIN_EMAIL/ADMIN_PASSWORD
docker compose --project-directory . -f docker/compose.dev.yml up -d   # PostgreSQL + pgAdmin (dev; produção usa o Postgres compartilhado da VM, ADR 0026)

cd backend && npm install && npm run db:migrate && npm run db:seed && npm run dev
cd frontend && npm install && npm run dev   # http://localhost:5173
```

Detalhes completos (portas, healthcheck, produção) em `README.md`.

## Testes, lint e build

```bash
cd backend  && npm run lint && npm test
cd frontend && npm run lint && npm test && npm run build
```

Backend usa `node --test` (Node built-in), nunca abre conexão real com o
banco nos testes automatizados — serviços/coletores são testados via
injeção de dependência (`deps = {}`, ver "Convenções de persistência"
abaixo); só o download HTTP de um coletor é mockado trocando
`global.fetch` dentro do teste. Frontend também usa `node --test`, sem
Vitest/Cypress.

## Como rodar a coleta manual

```bash
cd backend && npm run collect
# eventos de mercado (o coletor da geopolítica): uma leitura por dia (as execuções seguintes pulam a chamada à IA); para trocar a leitura de hoje (ADRs 0047 e 0049):
cd backend && GEOPOLITICA_REFAZER=1 npm run collect -- --coletor=geopolitica
# leitura de tendência do petróleo, do ouro, do milho e do café (rodam depois de todos os coletores; uma por ativo e dia, ADRs 0052, 0054, 0058 e 0062); para trocar a de hoje (todas, ou uma com --coletor=milho-analise):
cd backend && ANALISE_DIARIA_REFAZER=1 npm run collect -- --coletor=analise
```

Pra preencher histórico retroativo (ex.: banco recém-criado):

```bash
cd backend && npm run backfill:dolar                 # últimos 60 dias (padrão)
cd backend && npm run backfill:dolar -- --dias=90
# histórico completo (dólar e Selic; ~2 min cada) - início do Plano Real:
cd backend && npm run backfill:dolar -- --dataInicial=01/07/1994
cd backend && npm run backfill:selic -- --dataInicial=01/07/1994
# exportação de milho do Comex Stat, desde 2005 (~13 min: rate limit da fonte):
cd backend && npm run backfill:comex-milho
# exportação de café verde do Comex Stat, desde 1997 (~15 min):
cd backend && npm run backfill:comex-cafe
# exportação de milho por país de destino (Comex Stat), desde 2005 (~20 min: rate limit; bloco com 429 se repete com --anoInicial):
cd backend && npm run backfill:comex-milho-destino
# balanço do milho do WASDE (USDA/ESMIS), edições de 2011 em diante (~190 downloads, ~5 min):
cd backend && npm run backfill:wasde-milho
# série nova no WASDE já carregado (ex.: o etanol, ADR 0035): numa execução só, senão o vintage dela para no 1º bloco:
cd backend && npm run backfill:wasde-milho -- --anosPorBloco=99
# área plantada de milho dos EUA (USDA/ESMIS: Prospective Plantings e Acreage), edições com CSV desde 2001-06 (~51 downloads, ~1,5 min); ANTES da coleta diária em banco novo:
cd backend && npm run backfill:usda-area-plantada
# estoques trimestrais de milho dos EUA (USDA Grain Stocks, pelo ESMIS), edições com CSV desde 2001-06 (~103 downloads, ~3 min); ANTES da coleta diária em banco novo:
cd backend && npm run backfill:usda-grain-stocks
# milho da Conab (boletim mensal), os 15 levantamentos do índice, desde fev/2025 (~1 min); ANTES da coleta diária em banco novo:
cd backend && npm run backfill:conab-milho
# café da Conab (Boletim da Safra de Café), os levantamentos desde jan/2023 (~30 s); ANTES da coleta diária em banco novo:
cd backend && npm run backfill:conab-cafe
# balanço de oferta e demanda do milho do IMEA (PDF mensal), edições de 2014-04-14 em diante (~77 downloads, ~2 min); ANTES da coleta diária em banco novo:
cd backend && npm run backfill:imea-oferta-demanda
# andamento da semeadura e da colheita do milho de MT (IMEA, um PDF por safra: 26 informes, < 1 min); em qualquer ordem:
cd backend && npm run backfill:imea-andamento
# paridade de exportação do milho de MT (IMEA, tabela diária do Boletim Semanal), edições desde 2021-06-07 (~260 PDFs, ~7 min, uma execução só); ANTES da coleta diária em banco novo:
cd backend && npm run backfill:imea-paridade
# futuros de milho da B3 (CCM): janela de ~15 meses do Up2Data (CSV) e, antes disso, o Boletim Diário (PDF),
# de 2022-03-21 a 2025-12-11, com abertura e contratos em aberto (~940 PDFs); o 2º só completa o que falta:
cd backend && npm run backfill:b3-ccm
cd backend && npm run backfill:b3-ccm-bdi
# futuros de café arábica da B3 (ICF): as mesmas duas fontes e a mesma ordem (ADR 0028):
cd backend && npm run backfill:b3-icf
cd backend && npm run backfill:b3-icf-bdi
# futuro de ouro em dólar da B3 (GLD): só o Up2Data, desde o 1º pregão (2025-07-21; ~300 arquivos, ~2 min). Urgente: a janela é rolante (ADR 0044):
cd backend && npm run backfill:b3-gld
# Indicador do Milho CEPEA/ESALQ pelo arquivo `Indic` da B3, de 2018-06-08 (1º pregão com o milho) em diante (~2.100 downloads):
cd backend && npm run backfill:b3-milho-esalq
# expectativas do Focus (BCB) de IPCA, Selic e câmbio por ano, uma observação por boletim, desde 2000 (3 requisições, ~6 s):
cd backend && npm run backfill:bcb-focus
# reservas internacionais do BCB (SGS 13621, total diário), desde 1998-09-01 (3 janelas de 10 anos):
cd backend && npm run backfill:bcb-reservas
# saúde da vegetação por cultura da NOAA STAR (milho: VHI/VCI/TCI, 18 regiões, com mundo e hemisférios), desde 1982 (18 requisições, ~45 s):
cd backend && npm run backfill:noaa-vh
# saúde da vegetação sobre a área do café (NOAA STAR, 19 regiões), desde 1982 (19 requisições):
cd backend && npm run backfill:noaa-vh-cafe
# estoques certificados do café "C" da ICE, um XLS por pregão desde 2016-01-04 (~2.700 downloads, ~15 h: 20 s entre
# eles e pausa quando a ICE responde 429; retoma de onde parou). Só no servidor, em segundo plano (ADR 0032):
cd backend && npm run backfill:ice-cafe-estoques
# as sacas aguardando classificação (pending grading) do mesmo arquivo, nos dias já gravados sem elas (mesmo ritmo, ~15 h; ADR 0061):
cd backend && npm run backfill:ice-cafe-estoques -- --serie=pendente
# relatório mensal da ICO (preços por grupo e estoques certificados de Nova York e Londres), out/2012 em diante (~165 PDFs, ~8 min); ANTES da coleta diária em banco novo:
cd backend && npm run backfill:ico-cafe
# estoques de café nos portos europeus da ECF (por tipo, mensal, 2020 em diante; ~8 PDFs, < 1 min); ANTES da coleta diária em banco novo:
cd backend && npm run backfill:ecf-cafe
```

A API do BCB rejeita (406) um pedido com mais de 10 anos: os scripts dividem o
intervalo em janelas de até 10 anos (uma execução por janela). `scripts/backfill-dolar.js` reaproveita o mesmo coletor/pipeline/log de
execução da coleta diária — só troca a fase de download pra pedir um
intervalo de datas (`bcb-usd-brl.collector.js::downloadIntervalo`) em vez
dos últimos 10 pontos. Reexecutar é seguro (upsert por chave natural, ver
ADR 0003).

Roda todos os coletores registrados (hoje: BCB dólar/Selic + os de `observation` — BCB Focus (expectativas de IPCA, Selic e câmbio), BCB reservas internacionais, FMI (ouro nas reservas dos bancos centrais), World Gold Council (ouro em ETFs e oferta e demanda; uso interno), FRED (juros, índices do dólar, moedas da cesta do DXY, meta do Fed e, pelo ALFRED, o CPI e o preço mensal do café do FMI), CFTC (ouro, milho, café e petróleo WTI), ANP (produção de petróleo por UF), JODI (produção de petróleo e demanda de derivados por país), ICE (estoques certificados do café e as sacas aguardando classificação), ICO (preços por grupo e estoques certificados de Nova York e Londres, mensal), ECF (estoques de café nos portos europeus), Cecafé (resumo diário das exportações de café), B3 (futuros CCM, ICF e o ouro em dólar GLD; a LBMA saiu em 2026-10-01, quando o feed fechou, ADR 0044), B3/Indicador do Milho CEPEA/ESALQ, Comex Stat (exportação de milho, de milho por país de destino e de café), EIA (etanol; e o petróleo: estoques, produção, refino e preços à vista de WTI, Brent, gasolina e diesel), NOAA STAR (saúde da vegetação sobre o milho e o café), WASDE (balanço do milho, com o milho usado para etanol), USDA/ESMIS (área plantada do milho: Prospective Plantings e Acreage; e os estoques trimestrais do Grain Stocks), USDA FAS (PSD do café, balanço por país), Conab (milho do boletim mensal, café do Boletim da Safra de Café e o custo de produção do café), IMEA (milho de MT por safra, custo de produção, balanço de oferta e demanda, andamento da semeadura e da colheita e paridade de exportação), com `NASS_API_KEY`, USDA e, com `GEMINI_API_KEY_FREE` e/ou `GEMINI_API_KEY` (a gratuita primeiro, a paga como reserva), a leitura diária de eventos de mercado do ouro, do petróleo, do milho e do café (Gemini com busca na web em fontes autorizadas, sete tipos de evento, a geopolítica entre eles; fora da `observation`: tabelas próprias, uma leitura por dia, entregue ao Motor por `geopolitica.service.js`, ADRs 0047 e 0049) e, por último, a leitura diária de tendência do petróleo, do ouro, do milho e do café (o prompt diário de cada um enviado ao Gemini sem busca, resposta em JSON validada, tabela `analise_diaria`, ADRs 0052, 0054, 0058 e 0062); `--coletor=<trecho>` filtra),
imprime um resumo estruturado (pino) por coletor e sai com código de erro
se algum falhar. Também dá pra disparar pela API (`POST /api/v1/coletas`,
autenticado como `admin` de plataforma, rate-limitado) ou pela tela `/dados-mercado/
execucoes`: a API responde na hora (**202**, `{ coleta }`) e roda os coletores em
segundo plano (a coleta leva minutos); um segundo pedido com uma coleta manual em
andamento recebe **409**. A tela se atualiza sozinha enquanto houver execução em
andamento. Sem `node-cron`/fila no processo — produção depende de um cron
externo (fora deste repositório) chamando esse mesmo comando (ver
`docs/adr/0004-agendamento-coleta.md`).

## Como funciona o pipeline de coleta

```
Coletor → download (timeout + retry) → parse → normalize (válido/inválido) → persist → registro de execução
```

Orquestrado por `backend/src/collectors/base/collector-runner.js`
(`executarColetor`). Um item de dado inválido (ex.: data em formato
inesperado) nunca aborta o lote inteiro — só falha de comunicação com a
fonte (timeout, rede, HTTP 5xx) marca a execução inteira como `failed`.
Toda execução vira uma linha em `collection_execution` (log de execução,
consultável em `GET /api/v1/coletas` e na tela `/dados-mercado/execucoes`).
Detalhe completo e alternativas consideradas:
`docs/adr/0002-arquitetura-coletores.md`.

## Convenções para novos coletores

1. Contrato (`backend/src/collectors/base/collector.interface.js`):
   `{ codigo, timeoutMs, tentativasRetry, download, parse, normalize,
   persist }` — `normalize` retorna `{ validos, invalidos }` (e, opcional,
   `avisos`: defeito CONHECIDO da fonte que o coletor trata de propósito, sem
   gravar nada; fica no detalhe da execução e não conta como falha; e
   `detalhes`: objeto livre do coletor, também no detalhe da execução - ex.: a
   geopolítica registra `{ ia: { chave, modelo, tokens, buscas, paginasLidas,
   versaoPrompt } }`, mostrado no bloco "IA" da tela Execuções); `persist`
   retorna `{ criados, atualizados, ignorados, falhas }`.
2. Um módulo por fonte em `collectors/<fonte>/<nome>.collector.js`,
   registrado (`registerCollector(...)`) em `collectors/index.js`.
3. Persistindo um tipo de dado novo (não uma cotação em `market_quote`)?
   Siga o padrão de `market-quote.repository.js` + migration com chave
   natural única para dedup/upsert (ver ADR 0003).
4. **Antes de codificar:** confirme a fonte/série de verdade (não assuma —
   ver como a série do dólar foi confirmada por chamada real à API antes de
   implementar, ADR 0001), faça o **reconhecimento da fonte** (checklist de 11
   perguntas + nível 0–5, `docs/processo-reconhecimento-fontes.md`; uma linha
   em `docs/reconhecimento-fontes/README.md`) e documente a decisão num ADR novo.
5. Novo ativo/fonte só com **autorização explícita do usuário, registrada no
   "Contexto" do ADR** da fonte (quem autorizou, quando e o limite: em geral,
   "só aquisição de dados"). Vale para as fontes do FEL 1 enquanto o Comitê não
   o aprova; fonte fora do FEL 1 precisa da decisão do David/Comitê.

Ver também `backend/src/collectors/base/README.md`.

## Convenções de persistência e migrations

- Sequelize migrations são a única fonte da verdade do schema —
  `sequelize.sync()` nunca é usado.
- UUID (tipo `uuid` do PostgreSQL) gerado na aplicação
  (`crypto.randomUUID()`), nunca default do banco.
- Tabelas/colunas em `snake_case`, `created_at`/`updated_at` explícitos via
  `Sequelize.literal("CURRENT_TIMESTAMP")`.
- Services nunca chamam Sequelize direto — sempre por um repository
  (`backend/src/repositories/`), que expõe funções específicas (não um
  `findWhere` genérico).
- Toda função de service aceita um último parâmetro opcional `deps = {}`
  para injeção em teste (troca de repository/logger por um fake) — ver
  qualquer `*.service.js`/`*.service.test.js` existente como referência.
- Granularidade temporal deve refletir a fonte real: uma fonte diária usa
  `DATEONLY`, nunca `DATETIME` com hora inventada (ver ADR 0003).
- **Toda tabela nova tem um escopo: GLOBAL, PRIVADA (do espaço) ou USER** —
  declare no cabeçalho da migration (`Escopo: ...`) e registre a tabela em
  `docs/adr/0007-escopo-de-dados-global-espaco-usuario.md` (§3). Dado de
  mercado é GLOBAL e nunca ganha `workspace_id`; dado patrimonial é
  PRIVADA (`workspace_id`); preferência/perfil pessoal é USER. Na dúvida,
  PRIVADA. Uma tabela nunca mistura escopos. Nunca autorize dado de um
  espaço por `user.role` (papel de plataforma) — só por `workspace_member`.
  Todo usuário tem um espaço pessoal (criado com o usuário, em transação,
  via `user.repository.js::createWithPersonalWorkspace` — não crie `User`
  por outro caminho).

- **Dado que a fonte REVISA (ou de que se precisa saber "quando foi publicado")
  vai em `observation`, não em `market_quote`** — camada point-in-time,
  **append-only** (nunca UPDATE/DELETE; revisão = linha nova), lida por
  `point-in-time.service.js::obterAsOf` (`published_at <= asOf`). Separa
  `observed_at`/`published_at`/`collected_at`; `published_at` estimado por regra
  fica marcado (`published_at_is_estimated`). Observável = série bruta coletada;
  **fator** = função determinística e versionada em `backend/src/factors/`,
  nunca gravada. Ver `docs/adr/0008-camada-observation-point-in-time.md`
  (status de cada fonte: ADR 0009). Séries que não revisam (PTAX, Selic)
  continuam em `market_quote`.

## Convenções de API

- Prefixo `/api/v1/...` (exceto `GET /health`, fora do prefixo de
  propósito). Um arquivo de rota por recurso, registrado em
  `backend/src/routes/index.js`.
- `requireAuth` em toda rota autenticada (valida o JWT **e** carrega o
  usuário no banco a cada request: desativado = 401 na hora, e
  `req.user.role` vem do banco, nunca do token); `requireRole("admin")` em
  rotas restritas a admin de plataforma (ex.: disparo manual de coleta);
  `requireWorkspaceMember(...papéis)` em rotas de um espaço
  (`/workspaces/:workspaceId/...`). Papel de plataforma (`user.role`:
  `admin`/`user`) e papel no espaço (`workspace_member.role`:
  `owner`/`editor`/`viewer`) são coisas diferentes — nunca misture.
- Resposta de sucesso: objeto com chave nomeada pelo recurso (`{ cotacao }`,
  `{ historico, paginacao }`, `{ execucoes, paginacao }`) — nunca um
  envelope genérico `{ data }`.
- Resposta de erro (sempre via `error-handler.js`, nunca formatada à mão no
  controller): `{ error: { code, message, details } }`.
- Um endpoint que expõe uma série com granularidade menor que tempo real
  (ex.: cotação diária) deve dizer isso explicitamente na resposta (ver
  `periodicidade`/`tempoReal` em `GET /api/v1/observaveis/:codigo`) — nunca
  sugerir que é um dado ao vivo.
- Catálogo de observáveis (`GET /api/v1/observaveis`, `:codigo`,
  `:codigo/historico`) é uma lista estática no código
  (`observaveis.service.js::CATALOGO_OBSERVAVEIS`; itens com `origem: "observation"`
  leem da camada point-in-time, ADR 0008), não uma tabela — ver
  `docs/adr/0005-primevue-para-tabelas-de-dados.md` e
  `docs/decisoes-tecnicas.md`.

## Convenções de frontend

- Views ficam em `frontend/src/views/`, uma por rota, sempre dentro de
  `<AppShell>`. Padrão de estado: `loading`/`errorMessage`/dado, com
  `v-if="loading"` → `v-else-if="errorMessage"` → `v-else` (ver
  `CentroDecisaoView.vue`/`UsuariosView.vue` como referência).
- Sem Pinia — estado compartilhado é um `reactive()` module-level exposto
  por uma função `useXStore()` (ver `stores/auth.js`).
- Um `service` por recurso em `frontend/src/services/`, funções `async`
  simples sobre `http.js` (axios com cookie de sessão).
- **A tela de detalhe de um observável (`ObservavelDetalheView.vue`) é uma só para TODOS os cards: nunca
  reimplemente nada por card.** Um card novo herda dela, sem código de tela: exportação da tabela em CSV (botão de
  download ao lado do atualizar; série inteira, com os filtros da tabela, `GET /observaveis/:codigo/exportacao.csv`),
  período do gráfico com a opção **Tudo**, período inicial por frequência em `utils/periodo-grafico.js` (série
  `ANUAL` abre em **10 anos**, as demais em 30 dias), título do gráfico e da tabela com a métrica em uso e os seletores
  de métrica (`campos`) e de item (`itens`) que vêm da API. Um card novo é só uma entrada no `CATALOGO_OBSERVAVEIS`, com
  `frequencia` obrigatória e uma das quatro conhecidas (um teste barra outra); frequência nova precisa de uma linha em
  `periodo-grafico.js`. O `index.html` sai com `Cache-Control: no-cache` (`frontend/nginx.conf`): depois de um deploy
  não precisa de refresh forçado.
- Gráficos: só `components/charts/` conhece `echarts`/`vue-echarts`
  (`EChartsBase.vue` genérico + `LineChart.vue` concreto); a lógica de
  montar a `option` do ECharts fica em `utils/echarts-option-builder.js`
  (função pura, testável sem DOM).
- **Tabelas de dados densas** (com filtro/paginação/ordenação/atualizar):
  PrimeVue `DataTable`/`Column`/`Button`/`Dialog` diretamente na view (sem
  wrapper Vue próprio), com a moldura/paginação compartilhada via classe
  CSS global `tabela-card`/`tabela-paginada`/`tabela-refresh-botao`/
  `tabela-linhas-por-pagina` (`assets/main.css`) — ver `ObservaveisView.vue`
  (client-side, dataset pequeno) e `ExecucoesView.vue` (lazy/server-side)
  como referência. Fora desse caso, UI continua sendo Bootstrap — ver ADR
  0005.
- **Espaço ativo** (`stores/workspace.js`, carregado junto com a sessão em
  `stores/auth.js`) é só contexto de interface — nunca vai no JWT. Rotas
  privadas a um espaço vivem sob `/e/:workspaceId/...` e o guard do router
  já valida o `:workspaceId` contra os espaços do usuário; páginas de
  mercado (`/dados-mercado/...`) são globais e não levam espaço na URL. O
  guard é UX, não segurança: o servidor deve checar o vínculo quando houver
  dado privado (ADR 0007, §6). Na sidebar, o grupo **Espaço** lista o que
  existe *dentro* do espaço ativo (hoje só "Visão geral", `/e/:workspaceId`;
  Carteiras/Operações/Posições/Patrimônio são placeholders desabilitados) — o
  **seletor de espaço** (`WorkspaceSwitcher.vue`) é o cabeçalho desse grupo e o
  único lugar que mostra o nome do espaço; a topbar não tem seletor. Escolher um
  espaço leva sempre à Visão geral dele, de qualquer página. Cuidado
  em CSS scoped: use `:global(.a .b)` com o seletor INTEIRO dentro — com
  `:global(.a) .b` o Vue descarta o `.b` e gera uma regra só com `.a`.
- Novo item de menu: `components/layout/AppSidebar.vue`. Rota avulsa vai no
  array `links`; um grupo de rotas relacionadas (ex.: "Dados de Mercado")
  ganha seu próprio array + bloco `.finmind-group-label` no template, mesmo
  padrão de "Espaço"/"Sistema" já existentes. Não adicione links desabilitados
  de módulos que ainda não existem (o menu só mostra o que funciona); a
  exceção são os placeholders do grupo Espaço (`espacoFutureLinks`), que já
  têm estrutura decidida (ADR 0007).

## CI/CD

`.github/workflows/ci.yml` roda lint + test (backend e frontend) + build
(frontend) em toda branch/PR, sem depender de banco real.
`.github/workflows/deploy.yml` builda num runner ARM nativo, publica as
imagens (só `linux/arm64`) no GHCR e faz deploy via SSH na VM `servidor02`
(Oracle Cloud, Ampere A1) em push pra `main`. **Migrations rodam
automaticamente** como parte do deploy — `scripts/deploy.sh` (passo 4/6)
executa `npm run db:migrate` dentro do container `backend` logo após subir
os containers atualizados (seeders no passo 5/6).

O banco de produção **não está no compose do FinMind**: é o PostgreSQL
compartilhado da VM, do repositório privado `servidor02-infra`
(`/opt/apps/infra/postgres`), com database e usuário `finmind`, alcançado
pela rede Docker `db`. Backup diário (`pg_dump`, 7 diários + 4 semanais em
`/opt/backups/postgres`) e o cron da coleta rodam no crontab do usuário
`deploy` da VM. Ver `docs/adr/0026-postgresql-como-banco.md`.

## Status do projeto

`STATUS_DO_PROJETO.md` (raiz) é o painel de uma página do que está pronto, do
que falta e do que está bloqueado pelo David/Comitê — ponto de entrada para
retomar o trabalho. A tela `/status-projeto` renderiza este arquivo como está
(`status-projeto.service.js`; o `deploy.yml` o copia para a imagem do backend),
então ele deve continuar sendo markdown simples (tabelas, listas, negrito). A
única exceção de HTML aceita pela tela é `<details>`/`<summary>` sem atributos
(seção recolhível, ex.: "Entregas realizadas"); qualquer outra tag é mostrada
como texto. As menções a documentos (`ADR 0027`, `ADRs 0022 e 0023`,
`` `docs/....md` ``, `` `CLAUDE.md` ``) viram links que abrem o documento num
**modal da mesma tela** (`?doc=<id>` na URL; `GET /api/v1/documentos/:id`,
`documentos-projeto.service.js`): ADRs, `docs/reconhecimento-fontes/`, `docs/*.md`
e `CLAUDE.md` — nunca `docs/Docs_David` nem `docs/Docs_Base`. O `deploy.yml` copia
esses arquivos para a imagem; um teste falha se o status citar um ADR ou documento
que não existe. Escreva as menções nesses formatos para virarem link.
**Ao fechar uma entrega, atualize-o no mesmo commit**
(data de "Última atualização" incluída); ele só aponta para os ADRs/docs, nunca
copia conteúdo deles. Quando o David responder uma das perguntas da §4,
registre a resposta e a data ali (e num ADR, se a decisão for estrutural). O
antigo `docs/pendente-especialista-david.md` foi aposentado em 2026-09-28: o
status é o único lugar do que falta decidir.

## O que já está implementado

Ver `STATUS_DO_PROJETO.md` (visão atual) e "O que está pronto" em `README.md`
(detalhe da casca: autenticação, espaços, telas).

## O que ainda depende das definições do David

Ver `STATUS_DO_PROJETO.md`, §4 ("O que o David e o Comitê ainda definem" e as
perguntas). Qualquer regra/cálculo do motor analítico, critérios de avaliação
da IA, condições de sinal operacional e formato de apresentação continuam
bloqueados até o David/Comitê definir; execução automática de ordens não existe
nesta fase. Ativos e fontes: o FEL 1 propôs, o Comitê ainda não aprovou; a coleta
de milho e ouro foi adiantada fonte a fonte, cada uma autorizada no seu ADR, e
nenhuma autorização é precedente para outra fonte ou para qualquer regra.
