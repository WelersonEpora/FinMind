# CLAUDE.md

Guia rápido para trabalhar neste repositório. Para detalhe arquitetural,
veja `docs/architecture.md` e `docs/decisoes-tecnicas.md` — este arquivo
não duplica o que já está lá, só aponta pra onde procurar e resume o que um
agente precisa saber antes de tocar em código.

## Propósito do FinMind

Plataforma de inteligência aplicada ao mercado financeiro: coleta de dados
→ preparação → motor analítico (regras do especialista de mercado) → síntese
por IA → resultado. Hoje é uma **casca inicial** com uma primeira integração
real de dados (cotação do dólar) — autenticação, dashboard e o pipeline de
coleta funcionando de ponta a ponta. O motor analítico e a integração com
IA seguem como contratos vazios até o especialista de mercado ("David")
definir ativos, fontes, regras e critérios de sinal (ver
`docs/pendente-especialista-david.md`).

## Restrições permanentes (não negociáveis nesta fase)

- **Nunca invente estratégia financeira, sinal de compra/venda, indicador
  técnico ou cálculo de mercado** que não tenha sido definido pelo
  especialista David. Um coletor de dado público oficial (ex.: cotação do
  dólar via BCB) é infraestrutura, não estratégia — mas qualquer regra que
  *interprete* esse dado (limiar, sinal, recomendação) é.
- **Nenhuma execução automática de ordens** existe ou deve ser adicionada
  nesta fase. A arquitetura mantém geração de análise e execução de ordens
  como camadas fisicamente separadas (ver `docs/architecture.md`).
- **IA nunca é a fonte de verdade de um dado** quando existe fonte
  estruturada oficial confiável (ver ADR 0001) — e uma resposta de IA nunca
  dispara uma ação sozinha (ver `backend/src/ai/README.md`).
- Antes de implementar qualquer novo coletor/ativo/fonte, confira
  `docs/pendente-especialista-david.md` — a maioria continua bloqueada.

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
docker compose --project-directory . -f docker/compose.dev.yml up -d   # MariaDB + phpMyAdmin

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
```

Pra preencher histórico retroativo (ex.: banco recém-criado):

```bash
cd backend && npm run backfill:dolar                 # últimos 60 dias (padrão)
cd backend && npm run backfill:dolar -- --dias=90
```

`scripts/backfill-dolar.js` reaproveita o mesmo coletor/pipeline/log de
execução da coleta diária — só troca a fase de download pra pedir um
intervalo de datas (`bcb-usd-brl.collector.js::downloadIntervalo`) em vez
dos últimos 10 pontos. Reexecutar é seguro (upsert por chave natural, ver
ADR 0003).

Roda todos os coletores registrados (hoje: só `bcb-usd-brl-venda`),
imprime um resumo estruturado (pino) por coletor e sai com código de erro
se algum falhar. Também dá pra disparar pela API (`POST /api/v1/coletas`,
autenticado como `admin` de plataforma, rate-limitado) ou pela tela `/dados-mercado/
execucoes`. Sem `node-cron`/fila no processo — produção depende de um cron
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
   persist }` — `normalize` retorna `{ validos, invalidos }`; `persist`
   retorna `{ criados, atualizados, ignorados, falhas }`.
2. Um módulo por fonte em `collectors/<fonte>/<nome>.collector.js`,
   registrado (`registerCollector(...)`) em `collectors/index.js`.
3. Persistindo um tipo de dado novo (não uma cotação em `market_quote`)?
   Siga o padrão de `market-quote.repository.js` + migration com chave
   natural única para dedup/upsert (ver ADR 0003).
4. **Antes de codificar:** confirme a fonte/série de verdade (não assuma —
   ver como a série do dólar foi confirmada por chamada real à API antes de
   implementar, ADR 0001) e documente a decisão num ADR novo.
5. Novo ativo/fonte só depois de resolvido em
   `docs/pendente-especialista-david.md` (ou autorização pontual explícita
   do usuário, registrada em ADR, como aconteceu com o dólar).

Ver também `backend/src/collectors/base/README.md`.

## Convenções de persistência e migrations

- Sequelize migrations são a única fonte da verdade do schema —
  `sequelize.sync()` nunca é usado.
- UUID `CHAR(36)` gerado na aplicação (`crypto.randomUUID()`), nunca
  default do banco.
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
  (`observaveis.service.js::CATALOGO_OBSERVAVEIS`), não uma tabela — ver
  `docs/adr/0005-primevue-para-tabelas-de-dados.md` e
  `docs/decisoes-tecnicas.md`.

## Convenções de frontend

- Views ficam em `frontend/src/views/`, uma por rota, sempre dentro de
  `<AppShell>`. Padrão de estado: `loading`/`errorMessage`/dado, com
  `v-if="loading"` → `v-else-if="errorMessage"` → `v-else` (ver
  `DashboardView.vue`/`UsuariosView.vue` como referência).
- Sem Pinia — estado compartilhado é um `reactive()` module-level exposto
  por uma função `useXStore()` (ver `stores/auth.js`).
- Um `service` por recurso em `frontend/src/services/`, funções `async`
  simples sobre `http.js` (axios com cookie de sessão).
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
`.github/workflows/deploy.yml` builda/publica as imagens no GHCR e faz
deploy via SSH na VM em push pra `main`. **Migrations não rodam
automaticamente** — são aplicadas manualmente (`npm run db:migrate`) após
o deploy, mesmo processo de sempre (ver `README.md`).

## O que já está implementado

Ver "O que está pronto" em `README.md` — inclui, desde esta entrega, a
cotação do dólar de ponta a ponta (coleta, persistência, API, frontend).

## O que ainda depende das definições do David

Ver `docs/pendente-especialista-david.md` — qualquer ativo/mercado/fonte
além de USD/BRL via BCB, qualquer regra/cálculo do motor analítico,
critérios de avaliação da IA, condições de sinal operacional e execução
automática de ordens continuam bloqueados até o especialista de mercado
definir. A exceção pontual do dólar está registrada e datada nesse
documento e em `docs/adr/0001-fonte-cotacao-dolar-bcb-sgs.md` — não é
precedente para desbloquear outros ativos sem a mesma autorização
explícita.
