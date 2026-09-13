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

- **Frontend:** Vue 3, Vite, Bootstrap 5.
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
npm run db:seed      # cria o usuário administrador inicial (papel owner)
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
- Papéis (`owner`/`colaborador`, coluna simples em `user`) e gestão de
  usuários (`/usuarios`, só para `owner`) — criar e listar usuários;
  sem edição/desativação nem permissões granulares ainda. Sem
  cadastro público: só um `owner` autenticado cria novos usuários, pela
  tela ou por `backend/scripts/create-user.js`.
- Dashboard inicial com cartões placeholder explícitos (nenhum dado de
  mercado fictício).
- Tela de configuração/status dos módulos (`/configuracao`).
- Banco de dados MariaDB com migrations e seeders.
- Contratos vazios para coleta de dados, motor analítico e integração
  com IA — prontos para receber implementação real.
- Docker Compose (dev e prod), Dockerfiles, Nginx.
- CI (lint + testes + build) e publicação de imagens no GHCR.
- Testes automatizados básicos (backend e frontend).

## O que depende do especialista de mercado (David)

Ver lista completa em `docs/pendente-especialista-david.md`: ativos,
mercados/fontes de dados, dados a coletar, regras e cálculos, formato
de apresentação dos resultados, critérios de avaliação da IA,
condições de sinal operacional e se/como haverá execução automática de
ordens. Nenhum desses itens foi decidido ou simulado nesta entrega.

## O que ainda depende de decisão operacional (não bloqueado pelo
David)

- Gestão de permissões granular, se/quando surgir necessidade real além
  de owner/colaborador.
- Refresh token / renovação de sessão, se o uso justificar.
