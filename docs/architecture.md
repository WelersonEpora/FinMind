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
autenticação, banco). Ver `docs/pendente-especialista-david.md` pelo
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
      collectors/bcb/         # coletor real: cotação do dólar (SGS série 1)
      analytics-engine/      # contrato do motor de regras (placeholder)
      ai/                     # contrato de provedor de IA (placeholder)
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
      views/                      # Login, Dashboard, Configuração, Observáveis,
                                   # Observável (detalhe), Execuções
      components/layout/           # AppShell, Sidebar, Topbar (responsivo)
      components/charts/            # EChartsBase + LineChart (vue-echarts)
      theme/                         # preset PrimeVue (finmind-preset.js)
  docker/
    compose.dev.yml               # MariaDB + phpMyAdmin (backend roda local)
    compose.prod.yml              # MariaDB + backend + frontend (imagens GHCR)
  docs/adr/
    NNNN-titulo.md                 # decisões arquiteturais registradas (ADRs)
  .github/workflows/
    ci.yml                         # lint + test + build, toda branch/PR
    publish.yml                    # build + push das imagens no GHCR, push em main
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
arquivo de contrato (`*.interface.js`). O motor analítico e a IA continuam
contratos vazios (`NotConfiguredError`), aguardando as definições do
especialista David (ver `docs/pendente-especialista-david.md`).

A coleta (`collectors/`) tem, desde a primeira integração real, um pipeline
completo (`collectors/base/collector-runner.js` + `retry.js`): download com
timeout+retry, parse, normalize (válido/inválido) e persist, registrando
cada execução em `collection_execution`. O primeiro coletor concreto é
`collectors/bcb/bcb-usd-brl.collector.js` (cotação do dólar via API SGS do
Banco Central — ver `docs/adr/0001-fonte-cotacao-dolar-bcb-sgs.md` e
`docs/adr/0002-arquitetura-coletores.md`). Novos coletores (além do dólar)
continuam bloqueados por `docs/pendente-especialista-david.md`. Ver o
`README.md` de cada diretório para detalhes.

## Deploy

`.github/workflows/deploy.yml` builda e publica `ghcr.io/<owner>/
finmind-backend` e `finmind-frontend` em push pra `main`, e então faz
deploy via SSH na mesma VM Oracle Cloud onde o AgroMind já roda —
mesmo padrão validado lá (`appleboy/ssh-action`, usuário `deploy`,
`scripts/deploy.sh` + `scripts/github-deploy.sh` na raiz do repo).

**Importante:** essa VM é Always Free (1 vCPU / 1GB RAM) e já roda o
AgroMind inteiro (Postgres + backend + frontend). Rodar os dois lado a
lado é uma decisão consciente, não uma validação de capacidade — se
houver sinal de falta de memória (containers reiniciando, OOM no
`dmesg`), a resposta é mover um dos dois pra outra VM, não espremer
mais serviço na mesma.

Convenções que diferem do AgroMind só para não colidir na mesma
máquina:

- **Diretório:** `/opt/apps/finmind/app` (AgroMind usa
  `/opt/apps/agromind/app`).
- **Nome do projeto Docker Compose:** `finmind` (`scripts/deploy.sh`),
  o que prefixa containers/rede como `finmind_...` — sem colisão com
  `agromind_...`.
- **Porta do frontend:** `8083` (`FRONTEND_PORT` no `.env` da VM) —
  AgroMind usa `8081`.
- **MariaDB não publica porta no host** em produção (só rede interna
  Docker), igual ao Postgres do AgroMind — sem risco de colisão de
  porta de banco.

### Bootstrap único na VM (antes do primeiro deploy automático)

Segue o mesmo processo já usado pro AgroMind, só apontando pro
diretório do FinMind:

```bash
sudo -iu deploy bash -lc '
  mkdir -p /opt/apps/finmind &&
  cd /opt/apps/finmind &&
  git clone https://github.com/WelersonEpora/FinMind.git app &&
  cd app &&
  cp .env.example .env
  # editar .env: JWT_SECRET, ADMIN_EMAIL/ADMIN_PASSWORD, MARIADB_*,
  # FRONTEND_PORT=8083, GHCR_OWNER=welersonepora
'
```

### Secrets do GitHub Actions (repositório FinMind)

Secrets são por repositório — os do AgroMind não são reaproveitados
automaticamente. Adicionar em Settings → Secrets and variables →
Actions do repo `FinMind`:

- `ORACLE_HOST`, `ORACLE_USER` — mesmos valores já usados no repo do
  AgroMind (mesma VM).
- `ORACLE_SSH_KEY` — pode ser a mesma chave privada já usada pelo
  AgroMind (`github-actions-agromind`, já autorizada nessa VM/usuário
  `deploy`) ou uma chave dedicada nova, se preferir segregar por
  aplicação.
- `GHCR_PAT`, `GHCR_USERNAME` — mesmos usados no AgroMind (PAT com
  permissão de leitura no GHCR, pra `docker login` dentro da VM).

Nenhum desses valores deve ser colado nesta conversa nem commitado no
repositório — são configurados diretamente na interface do GitHub.

(adicionar esse job em `.github/workflows/publish.yml`, junto com os
secrets `ORACLE_HOST`/`ORACLE_USER`/`ORACLE_SSH_KEY` no repositório,
quando a VM estiver pronta).
