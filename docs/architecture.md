# Arquitetura do FinMind

## Visão geral

O FinMind é dividido em camadas fisicamente separadas, para que o
motor de análise e (futuramente) a execução de ordens nunca fiquem
acoplados:

```text
Coleta → Preparação → Motor analítico (regras) → IA (síntese/avaliação) → Resultado
                                                                              │
                                                              (futuro, separado)
                                                                              ▼
                                                                   Sinal operacional
                                                                              │
                                                              (futuro, separado, com
                                                               validações ainda a definir)
                                                                              ▼
                                                                   Execução de ordens
```

Hoje só a casca de cada camada existe — nenhuma seta acima tem
implementação de domínio real, exceto o transporte (rotas HTTP,
autenticação, banco) e a coleta de dados. Ver `STATUS_DO_PROJETO.md` (§4) pelo
que falta para cada uma.

## Estrutura de diretórios

```text
FinMind/
  backend/
    src/
      config/            # env, conexão com o banco
      controllers/        # HTTP -> services
      services/            # regra de aplicação
      repositories/        # acesso a dados (Sequelize)
      models/              # definição das tabelas
      routes/
      shared/
        errors/            # AppError e subclasses (NotFoundError, ValidationError...)
        middlewares/        # error-handler, require-auth, require-role, rate-limit...
        logger/              # pino
        utils/               # password (bcrypt), jwt, cookie de sessão
      collectors/base/       # contrato de coletor + pipeline (runner/retry)
      collectors/bcb/         # coletores reais: dólar e Selic (SGS) -> market_quote
      collectors/fred|cftc|usda|b3|.../  # ouro/milho/café/petróleo -> observation (point-in-time, ADR 0008/0009); lbma/ encerrado (ADR 0044)
      factors/               # fatores derivados (funções determinísticas sobre asOf(); ADR 0008)
      factors/modelos/       # moldes de fator comuns a vários ativos (COT, dólar, juros): o ativo dá séries e textos (ADR 0053)
      analytics-engine/      # mapa do motor (fatores, prompt diário, leitura de tendência) + contrato da agregação, ainda vazio
      ai/                     # provedor Gemini (eventos e leitura de tendência) e prompts versionados
    database/
      migrations/             # fonte da verdade do schema
      seeders/                # usuário admin inicial (papel admin)
    scripts/
      run-coleta.js            # coleta manual/cron externo (npm run collect)
      backfill-dolar.js         # backfill de histórico (npm run backfill:dolar)
  frontend/
    src/
      router/                  # rotas + guarda de autenticação
      stores/auth.js            # estado de sessão (composable reativo, sem Pinia)
      services/                  # http (axios) + serviços por recurso
      views/                      # Login, Centro de Decisão, Configuração, Observáveis,
                                   # Observável (detalhe), Eventos, Execuções
      components/layout/           # AppShell, Sidebar, Topbar (responsivo)
      components/charts/            # EChartsBase + LineChart (vue-echarts)
      components/centro-decisao/     # seletor de data e card de preço do Centro de Decisão
      components/eventos/            # detalhe do evento, nível e pressão (Eventos e Centro de Decisão)
      theme/                         # preset PrimeVue (finmind-preset.js)
  docker/
    compose.dev.yml               # PostgreSQL + pgAdmin (backend roda local)
    compose.prod.yml              # backend + frontend (imagens GHCR); banco = Postgres compartilhado da VM
  docs/adr/
    NNNN-titulo.md                 # decisões arquiteturais registradas (ADRs)
  .github/workflows/
    ci.yml                         # lint + test + build, toda branch/PR
    deploy.yml                     # build (runner ARM) + push GHCR + deploy SSH, push em main
```

## Camadas do backend

`controllers` só traduzem HTTP ↔ `services`; `services` concentram
regra de aplicação e nunca tocam o Sequelize diretamente (falam com
`repositories`); `models` só definem tabelas e associações. Erros de
domínio são sempre uma subclasse de `AppError`
(`shared/errors/http-errors.js`), tratada de forma centralizada pelo
`error-handler` (`shared/middlewares/error-handler.js`) — nenhum
controller formata resposta de erro manualmente.

## Autenticação

Sessão via JWT num cookie `httpOnly`. `shared/middlewares/require-auth.js`
valida o cookie, confere no banco que o usuário existe e está ativo e popula
`req.user` (papel de plataforma vindo do banco); `require-role.js` restringe
por esse papel; `require-workspace-member.js` restringe por vínculo/papel
em um espaço. Detalhes e justificativa em `docs/decisoes-tecnicas.md`.

## Coleta de dados / motor analítico / IA

Os três módulos vivem isolados em seus próprios diretórios, cada um com um
arquivo de contrato (`*.interface.js`). Desde 2026-10-05, os quatro ativos
(petróleo, ouro, milho e café) têm o motor rodando por fator: os fatores em
`factors/` (camadas A, B e C), o prompt diário montado por
`services/prompt-diario.service.js` e a leitura de tendência do Gemini
(`collectors/analise/`), no Centro de Decisão (ADRs 0052, 0054, 0058 e 0062).
O mapa está em `backend/src/analytics-engine/README.md`. Continua vazio
(`NotConfiguredError`) o contrato da agregação dos fatores em código e de
qualquer sinal, à espera do David e do Comitê (`STATUS_DO_PROJETO.md`, §4).

A coleta (`collectors/`) tem, desde a primeira integração real, um pipeline
completo (`collectors/base/collector-runner.js` + `retry.js`): download com
timeout+retry, parse, normalize (válido/inválido) e persist, registrando
cada execução em `collection_execution`. O primeiro coletor concreto é
`collectors/bcb/bcb-usd-brl.collector.js` (cotação do dólar via API SGS do
Banco Central — ver `docs/adr/0001-fonte-cotacao-dolar-bcb-sgs.md` e
`docs/adr/0002-arquitetura-coletores.md`). Um coletor novo precisa de
autorização explícita registrada no ADR da fonte (`CLAUDE.md`, "Convenções para
novos coletores"). Ver o
`README.md` de cada diretório para detalhes.

## Deploy

`.github/workflows/deploy.yml` builda num runner ARM nativo
(`ubuntu-24.04-arm`) e publica `ghcr.io/<owner>/finmind-backend` e
`finmind-frontend` (só `linux/arm64`) em push pra `main`, e então faz
deploy via SSH (`appleboy/ssh-action`, `scripts/github-deploy.sh` +
`scripts/deploy.sh`) na VM de produção.

**VM `servidor02`** (Oracle Cloud Always Free, Ampere A1 arm64, 2 OCPU /
12 GB, São Paulo), desde 2026-09-26. Até essa data o FinMind dividia com
AgroMind, Personal e Portal uma VM x86 de 1 GB (`servidor01`), que ficou
pequena (~920 MB em swap, três servidores de banco).

```
servidor02
  /opt/apps/infra/            repositório privado servidor02-infra
    postgres/                   PostgreSQL 16 compartilhado, rede Docker "db",
                                sem porta no host; um database/usuário por app
  /opt/apps/finmind/app/      este repositório: backend + frontend (compose.prod.yml)
  /opt/apps/proxy/            Nginx Proxy Manager (network_mode: host):
                                finmind.weslab.com.br -> 127.0.0.1:8083, HTTPS (Let's Encrypt)
  /opt/backups/postgres/      pg_dump diário por database (7 diários + 4 semanais),
                                copiado para o bucket privado backups-servidor02 (Object Storage,
                                apaga após 35 dias)
```

- **Banco:** fora deste compose. O backend entra na rede externa `db` e
  usa `POSTGRES_HOST=postgres`, com o usuário `finmind` (dono só do
  database `finmind`). Ver `docs/adr/0026-postgresql-como-banco.md` e o
  README do `servidor02-infra`.
- **Frontend:** `FRONTEND_PORT=127.0.0.1:8083` no `.env`: só o proxy da
  própria VM alcança; o acesso externo é por HTTPS.
- **Firewall:** security list da sub-rede + `iptables` da imagem Ubuntu
  da Oracle (22, 80 e 443 liberadas antes do `REJECT`). Portas publicadas
  pelo Docker não passam pelo `INPUT`: o que não deve ficar exposto é
  publicado só em `127.0.0.1`.
- **Cron** (crontab do usuário `deploy`, fuso UTC): coleta às 04:00,
  06:00 e 08:00 (`docker compose ... exec -T backend npm run collect`,
  log em `/opt/apps/finmind/logs/coleta-diaria.log`) e backup às 10:00
  (`/opt/apps/infra/postgres/scripts/backup.sh`, log em
  `/opt/backups/postgres/backup.log`), que também copia os dumps para o
  Object Storage (`rclone`, configuração em `~deploy/.config/rclone`).
- **Backup do disco:** política `semanal-3-semanas` da Oracle no boot
  volume (domingo 12:00 UTC).
- **Portainer:** o da VM antiga vê a `servidor02` por um Portainer Agent
  (porta 9001, liberada só para o IP privado da `servidor01`).

### Secrets do GitHub Actions (repositório FinMind)

Em Settings → Secrets and variables → Actions:

- `ORACLE_HOST` — IP público da `servidor02`.
- `ORACLE_USER` — `ubuntu` (o workflow entra como `ubuntu` e roda o deploy
  com `sudo -iu deploy`).
- `ORACLE_SSH_KEY` — chave privada autorizada no `ubuntu` da VM.
- `GHCR_PAT`, `GHCR_USERNAME` — PAT com leitura no GHCR, para o
  `docker login` dentro da VM.

Nenhum desses valores deve ser colado numa conversa nem commitado no
repositório — são configurados diretamente na interface do GitHub.
