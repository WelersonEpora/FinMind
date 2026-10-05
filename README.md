# FinMind

Plataforma de inteligência aplicada ao mercado financeiro: coleta de
dados, preparação, motor analítico (regras do especialista de mercado)
e síntese por IA. Hoje: autenticação, espaços, a coleta de dados dos
quatro ativos do FEL 1 (petróleo, ouro, milho e café) e, para cada um, a
cadeia inteira até a leitura diária de tendência da IA no Centro de
Decisão. Regras de agregação, critérios de sinal e a avaliação da IA
continuam com o especialista de mercado (David) e o Comitê. Ver
`STATUS_DO_PROJETO.md` (§4).

## Arquitetura

Ver `docs/architecture.md` (estrutura de diretórios, camadas, fluxo
coleta → análise → IA → resultado) e `docs/decisoes-tecnicas.md`
(decisões tomadas nesta fase e por quê).

## Stack

- **Frontend:** Vue 3, Vite, Bootstrap 5 (shell/telas gerais), Apache
  ECharts (gráficos), PrimeVue (tabelas de dados densas — ver
  `docs/adr/0005-primevue-para-tabelas-de-dados.md`).
- **Backend:** Node.js, Express, Sequelize.
- **Banco de dados:** PostgreSQL 16 (ver `docs/adr/0026-postgresql-como-banco.md`).
- **Infra:** Docker, Docker Compose, Nginx, GitHub Actions, GHCR.

## Pré-requisitos

- Node.js 22+
- Docker e Docker Compose (para subir o PostgreSQL local)

## Configuração

```bash
cp .env.example .env
```

Preencha pelo menos `JWT_SECRET` (valor aleatório forte — ex.:
`node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`)
e `ADMIN_EMAIL`/`ADMIN_PASSWORD` (usados só pelo seed do usuário
administrador inicial).

## Subindo o banco de dados (dev)

```bash
docker compose --project-directory . -f docker/compose.dev.yml up -d
```

Sobe PostgreSQL (`localhost:${POSTGRES_PORT}`) e pgAdmin
(`http://localhost:${PGADMIN_PORT}`, 5051 por padrão).

## Backend

```bash
cd backend
npm install
npm run db:migrate
npm run db:seed      # cria o usuário administrador inicial (papel admin)
npm run dev
```

- Healthcheck: `GET http://localhost:3000/health`
- Login: `POST http://localhost:3000/api/v1/auth/login` com o
  `ADMIN_EMAIL`/`ADMIN_PASSWORD` definidos no `.env`.

## Frontend

```bash
cd frontend
npm install
npm run dev
```

Acesse `http://localhost:5173`, faça login com o usuário administrador
seedado.

## Coleta de dados (cotação do dólar, taxa Selic)

Três coletores reais via API SGS do Banco Central: cotação do dólar
(USD/BRL, série 1, fechamento diário — ver
`docs/adr/0001-fonte-cotacao-dolar-bcb-sgs.md`) e a taxa Selic, em duas
séries que compõem um único observável (`SELIC`) — a Meta definida pelo
Copom (série 432) e a Selic realizada, já acumulada no mês e anualizada
pelo próprio BCB (série 1178) — ver
`docs/adr/0006-fonte-taxa-selic-bcb-sgs.md`.

```bash
cd backend
npm run collect      # roda todos os coletores registrados (hoje: dólar e Selic meta/realizada)
```

Pra preencher histórico retroativo de uma vez (ex.: banco recém-criado):

```bash
cd backend
npm run backfill:dolar                    # últimos 60 dias (padrão)
npm run backfill:dolar -- --dias=90
npm run backfill:dolar -- --dataInicial=01/06/2026 --dataFinal=31/07/2026
npm run backfill:dolar -- --dataInicial=01/07/1994   # histórico completo (Plano Real)
npm run backfill:selic -- --dataInicial=01/07/1994   # idem, meta e realizada
```

Intervalos maiores que 10 anos são divididos em janelas automaticamente (a API do
BCB rejeita mais que isso num pedido só).

Reaproveita o mesmo coletor/pipeline da coleta diária (mesmo log de
execução em `collection_execution`) — só troca a chamada à API do BCB para
buscar um intervalo de datas em vez dos últimos 10 pontos. Reexecutar não
duplica nem sobrescreve dado já coletado com o mesmo valor (upsert por
chave natural, ver `docs/adr/0003-persistencia-coletas.md`).

Sem `node-cron`/fila no processo — em produção, um cron externo (fora deste
repositório) chama esse mesmo comando periodicamente (ver
`docs/adr/0004-agendamento-coleta.md`). Também é possível disparar uma
coleta manual autenticado como `admin` via `POST /api/v1/coletas`, ou pela
tela `/dados-mercado/execucoes` no frontend. A API responde na hora (202) e a
coleta roda em segundo plano; o progresso aparece na lista de execuções.

Consultar os dados coletados:
- `GET /api/v1/observaveis` — catálogo de observáveis (hoje: dólar e Selic).
- `GET /api/v1/observaveis/:codigo` — detalhe (cotação atual, cobertura,
  última coleta).
- `GET /api/v1/observaveis/:codigo/historico` — série histórica (filtros
  `pagina`/`tamanhoPagina`/`ordenarPor`/`ordem`).
- `GET /api/v1/coletas` — execuções de coleta (log de execução).
- Frontend: menu "Dados de Mercado" → telas `/dados-mercado/observaveis`
  (catálogo → detalhe com gráfico + tabela histórica) e `/dados-mercado/
  execucoes`.

## Testes

```bash
cd backend && npm test
cd frontend && npm test
```

## Lint

```bash
cd backend && npm run lint
cd frontend && npm run lint
```

## Produção (Docker)

```bash
docker compose --project-directory . -f docker/compose.prod.yml up -d
```

Usa as imagens publicadas no GHCR (`ghcr.io/<owner>/finmind-backend` e
`finmind-frontend`, só `linux/arm64`) — nunca builda localmente em produção.
O banco não faz parte deste compose: é o PostgreSQL compartilhado da VM
(repositório `servidor02-infra`), alcançado pela rede Docker `db`.

Em push pra `main`, `.github/workflows/deploy.yml` builda num runner ARM,
publica no GHCR e faz deploy automático via SSH na VM `servidor02`
(Oracle Cloud, Ampere A1). O site sai em `https://finmind.weslab.com.br`
pelo Nginx Proxy Manager da VM. Ver `docs/architecture.md` § "Deploy".

## O que está pronto

> Visão de uma página do que está pronto, do que falta e do que está
> bloqueado: [`STATUS_DO_PROJETO.md`](STATUS_DO_PROJETO.md).

- Autenticação (login/logout, sessão via cookie JWT httpOnly, rotas
  protegidas, rate limit no login, usuário administrador inicial
  configurável por variável de ambiente).
- Papéis de plataforma (`admin`/`user`, coluna simples em `user`) e gestão
  de usuários (`/usuarios`, só para `admin`) — criar e listar usuários;
  sem permissões granulares ainda. Sem cadastro público: só um `admin`
  autenticado cria novos usuários, pela tela ou por
  `backend/scripts/create-user.js`. Cada requisição revalida o usuário no
  banco: desativar um usuário ou mudar seu papel vale na hora (o JWT só
  identifica quem é). Não confundir com o papel dentro de um espaço
  (`owner`/`editor`/`viewer`).
- Fundação de "Espaços" (`workspace`/`workspace_member`, N:N com
  `user`): todo usuário — existente ou novo — tem um espaço pessoal em que
  é `owner`. Qualquer usuário pode criar espaços ("Criar espaço" no seletor de
  espaço, no menu lateral) e o `owner` de um espaço compartilhado adiciona usuários já
  existentes (botão "Incluir", em modal), como editor ou leitor, e pode remover
  membros (lixeira na linha) ou excluir o espaço — nunca o pessoal, com
  confirmação digitando o nome ("Visão geral" do espaço,
  `/e/:workspaceId`, no grupo Espaço do menu lateral).
  Ainda não há dado privado: isso prepara o isolamento dos futuros dados
  patrimoniais (carteira etc.), enquanto o dado de mercado segue global. Sem
  mudança de papel, transferência de propriedade nem convite por e-mail ainda. Ver
  `docs/adr/0007-escopo-de-dados-global-espaco-usuario.md`.
- Primeira integração real de dados: cotação do dólar (USD/BRL) e taxa
  Selic (meta + realizada) via API SGS do Banco Central — coletores com
  timeout/retry/log de execução, histórico armazenado em banco, endpoints
  (`/api/v1/observaveis*`, `/api/v1/coletas`) e telas "Dados de Mercado"
  (`/dados-mercado/observaveis` — catálogo, padrão de tabela do AgroMind via
  PrimeVue — e `/dados-mercado/execucoes`). O detalhe da Selic mostra as
  duas séries no mesmo gráfico/tabela (mesma unidade, % a.a. — nenhum
  cálculo próprio do FinMind, ver ADR 0006). Ver
  `docs/adr/0001-fonte-cotacao-dolar-bcb-sgs.md`,
  `docs/adr/0005-primevue-para-tabelas-de-dados.md` e
  `docs/adr/0006-fonte-taxa-selic-bcb-sgs.md`.
- Centro de Decisão (`/`, a tela inicial): para um ativo (ouro, petróleo,
  milho, café) e uma data, o preço como era conhecido naquele dia (com troca
  de série, mini-gráfico e variações), a leitura de geopolítica da data e a
  leitura de tendência da IA nos quatro horizontes (nenhum sinal é gerado).
  Ver `docs/adr/0048-centro-de-decisao.md`.
- Qualidade da IA (`/qualidade-ia`): por ativo e horizonte, o que a IA leu
  contra o que o preço fez, em direção e faixa, contra dois benchmarks
  (Sempre Lateral e Persistência), com as linhas de cada número. Ver
  `docs/adr/0064-qualidade-da-ia-avaliacao-das-leituras.md`.
- Tela de configuração/status dos módulos (`/configuracao`).
- Banco de dados PostgreSQL com migrations e seeders.
- Motor analítico por fator nos quatro ativos: fatores, prompt diário e
  leitura de tendência da IA (Gemini) no Centro de Decisão, nunca
  recomendação de compra ou venda (ADRs 0052, 0054, 0058 e 0062; mapa em
  `backend/src/analytics-engine/README.md`). A agregação dos fatores em
  código aguarda o especialista de mercado.
- Docker Compose (dev e prod), Dockerfiles, Nginx.
- CI (lint + testes + build) e publicação de imagens no GHCR.
- Testes automatizados (backend e frontend), incluindo o pipeline de coleta.

## O que depende do especialista de mercado (David)

Ver `STATUS_DO_PROJETO.md`, §4: o que o David e o Comitê ainda definem (regras
e cálculos, formato de apresentação dos resultados, critérios de avaliação da
IA, condições de sinal operacional) e as perguntas em aberto. Ativos e fontes
foram propostos pelo relatório FEL 1, que aguarda a aprovação do Comitê; a
coleta de milho e ouro foi adiantada fonte a fonte, cada uma autorizada no seu
ADR. Execução automática de ordens não existe nesta fase.

## O que ainda depende de decisão operacional (não bloqueado pelo
David)

- Nada pendente em autenticação: permissões granulares e refresh token foram
  descartados em 2026-09-21 (a sessão dura 12h) — ver `docs/decisoes-tecnicas.md`.
