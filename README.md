# FinMind

Plataforma de inteligência aplicada ao mercado financeiro: coleta de
dados, preparação, motor analítico (regras do especialista de mercado)
e síntese por IA. Esta é a **casca inicial** do projeto — autenticação,
dashboard e infraestrutura funcionando de ponta a ponta, com os módulos
de domínio (coleta, motor analítico, IA) preparados como contratos
vazios até que o especialista de mercado (David) defina ativos, fontes,
regras e critérios de sinal. Ver `docs/pendente-especialista-david.md`.

## Arquitetura

Ver `docs/architecture.md` (estrutura de diretórios, camadas, fluxo
coleta → análise → IA → resultado) e `docs/decisoes-tecnicas.md`
(decisões tomadas nesta fase e por quê).

## Stack

- **Frontend:** Vue 3, Vite, Bootstrap 5 (shell/telas gerais), Apache
  ECharts (gráficos), PrimeVue (tabelas de dados densas — ver
  `docs/adr/0005-primevue-para-tabelas-de-dados.md`).
- **Backend:** Node.js, Express, Sequelize.
- **Banco de dados:** MariaDB.
- **Infra:** Docker, Docker Compose, Nginx, GitHub Actions, GHCR.

## Pré-requisitos

- Node.js 22+
- Docker e Docker Compose (para subir o MariaDB local)

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

Sobe MariaDB (`localhost:${MARIADB_PORT}`) e phpMyAdmin
(`http://localhost:${PHPMYADMIN_PORT}`).

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
```

Reaproveita o mesmo coletor/pipeline da coleta diária (mesmo log de
execução em `collection_execution`) — só troca a chamada à API do BCB para
buscar um intervalo de datas em vez dos últimos 10 pontos. Reexecutar não
duplica nem sobrescreve dado já coletado com o mesmo valor (upsert por
chave natural, ver `docs/adr/0003-persistencia-coletas.md`).

Sem `node-cron`/fila no processo — em produção, um cron externo (fora deste
repositório) chama esse mesmo comando periodicamente (ver
`docs/adr/0004-agendamento-coleta.md`). Também é possível disparar uma
coleta manual autenticado como `admin` via `POST /api/v1/coletas`, ou pela
tela `/dados-mercado/execucoes` no frontend.

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
`finmind-frontend`) — nunca builda localmente em produção.

Em push pra `main`, `.github/workflows/deploy.yml` builda, publica no
GHCR e faz deploy automático via SSH na mesma VM Oracle Cloud onde o
AgroMind já roda (porta `8083`, para não colidir com o `8081` do
AgroMind). Ver `docs/architecture.md` § "Deploy" pelas convenções
usadas para os dois projetos dividirem a mesma VM sem colidir, pelo
risco de memória (VM Always Free, 1 vCPU/1GB RAM) e pelos secrets do
GitHub Actions que precisam ser configurados no repositório antes do
primeiro deploy automático.

## O que está pronto

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
- Dashboard inicial com o cartão de cotação do dólar já mostrando dado real;
  os demais cartões seguem placeholders explícitos (nenhum outro dado de
  mercado fictício).
- Tela de configuração/status dos módulos (`/configuracao`).
- Banco de dados MariaDB com migrations e seeders.
- Motor analítico e integração com IA seguem como contratos vazios,
  prontos para receber implementação real quando o especialista de mercado
  definir regras/critérios.
- Docker Compose (dev e prod), Dockerfiles, Nginx.
- CI (lint + testes + build) e publicação de imagens no GHCR.
- Testes automatizados (backend e frontend), incluindo o pipeline de coleta.

## O que depende do especialista de mercado (David)

Ver lista completa em `docs/pendente-especialista-david.md`: ativos,
mercados/fontes de dados, dados a coletar, regras e cálculos, formato
de apresentação dos resultados, critérios de avaliação da IA,
condições de sinal operacional e se/como haverá execução automática de
ordens. Nenhum desses itens foi decidido ou simulado nesta entrega.

## O que ainda depende de decisão operacional (não bloqueado pelo
David)

- Gestão de permissões granular, se/quando surgir necessidade real além
  de admin/user.
- Refresh token / renovação de sessão, se o uso justificar.
