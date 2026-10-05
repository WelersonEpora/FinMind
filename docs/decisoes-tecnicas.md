# Decisões técnicas — casca inicial

Decisões tomadas sem definição prévia do usuário ou do especialista de
mercado, escolhendo sempre a alternativa mais simples, segura e
extensível disponível, conforme combinado.

## Autenticação

JWT (HS256) num cookie `httpOnly` + `Secure` (só em produção,
`NODE_ENV=production`) + `SameSite=Lax`, expiração fixa de 12h (uma constante em `config/env.js` alimenta o JWT e o
cookie; era 8h até 2026-09-21), sem refresh token (usuário faz login de novo
ao expirar). Decisão de 2026-09-21: refresh token não será implementado —
poucos usuários internos e a revogação já é imediata (o usuário é revalidado
no banco a cada request); a solução para sessão curta demais é aumentar a
duração, não renovar em silêncio.

Sem CORS habilitado — a API só responde a requisições de mesma origem
(proxy Nginx em produção, proxy do Vite em dev). Combinado com o fato de
a API ser JSON-only (`express.json()` exige `Content-Type:
application/json`, que o navegador não envia em formulários HTML
simples e que dispararia um preflight CORS bloqueado em qualquer outra
origem), isso já mitiga CSRF sem precisar de um token CSRF separado.

Senhas com `bcryptjs` (implementação pura em JavaScript, sem
compilação nativa — mais simples de buildar numa imagem Alpine que
`bcrypt`), 12 rounds de salt.

**Refresh token:** descartado em 2026-09-21 (ver acima). Se um dia o sistema
for exposto a muito mais usuários, reavaliar.

## Identificadores (UUID)

Tipo `uuid` nativo do PostgreSQL, gerado na aplicação via
`crypto.randomUUID()` (Sequelize `defaultValue`), nunca por default do
banco. (Na época do MariaDB era `CHAR(36)`; a linha de base do Postgres
passou para `uuid`, ADR 0026.)

## Papéis e permissões

Coluna `role` (string, `admin` / `user`; era `owner` / `colaborador` até a
migration `20260919110000-rename-platform-roles.js`) direto em `user` — sem
tabela `role` separada (a versão inicial tinha uma tabela + FK; trocada
por essa coluna simples, ver migration
`20260913100000-simplify-user-role-to-column.js`). Mesmo padrão já
usado no Personal-Assistant (`models/membro.js`). É o papel de
**plataforma**: `require-role.js` já restringe a `admin` as rotas de
usuários (`/users*`) e o disparo manual de coleta (`POST /coletas`); as
demais rotas só exigem autenticação. O papel e o status `active` são lidos
do **banco** a cada request (`require-auth.js`); o JWT carrega só `sub`.
Não é papel dentro de um espaço
(esse fica em `workspace_member.role` — ver
`docs/adr/0007-escopo-de-dados-global-espaco-usuario.md`). Uma tabela
com FK não paga o próprio custo enquanto não houver permissões
granulares. **Decisão de 2026-09-21:** permissões granulares ficam como
estão (dois papéis fixos, `admin`/`user`, e `owner`/`editor`/`viewer` no
espaço) — não há caso de uso que eles não cubram. Se um dia houver, o
caminho natural é uma tabela `permission` + junção `role_permission`, sem
alterar o que já existe.

## Usuário administrador inicial

Seeder idempotente (`database/seeders/…-seed-admin-user.js`) que lê
`ADMIN_EMAIL`/`ADMIN_PASSWORD` do ambiente — falha alto e claro se
ausentes. Nunca grava uma senha default conhecida no repositório ou no
banco.

## Configurações do sistema

Tabela `system_setting` (chave/valor/descrição) para parâmetros de
configuração futuros (ex.: parâmetros de uma fonte de dados, feature
flags). Vazia hoje — nenhuma configuração real existe ainda para
guardar nela.

## Armazenamento futuro de estratégias e regras (proposta, não
implementada)

A especificação pede explicitamente para não criar tabela de
estratégia sem necessidade real — então isto é só uma proposta para
quando as regras do David existirem:

```text
strategy_version
  id            CHAR(36) PK
  name          VARCHAR       -- nome da estratégia/regra
  version       INT           -- versionamento explícito (nunca sobrescreve)
  status        ENUM          -- draft | active | archived
  rules_json    JSON          -- definição estruturada da regra/cálculo
  created_by    CHAR(36) FK -> user.id
  created_at / updated_at
```

Versionamento explícito por linha (nunca UPDATE de `rules_json` numa
versão já ativa) permite rastrear, em qualquer análise passada, com
qual exata versão de regra ela foi gerada — pré-requisito de auditoria
citado na especificação.

## Motor analítico, coleta e IA

Cada um é um módulo com um arquivo de contrato (`*.interface.js`) e,
onde aplicável, uma implementação nula que lança
`NotConfiguredError` explícito, para que o resto do sistema possa
referenciá-los sem acoplar a uma implementação futura específica. A
coleta e a IA (Gemini) já têm implementação real; o motor roda por fator
nos quatro ativos (fatores, prompt diário e leitura de tendência, ver
`backend/src/analytics-engine/README.md`), e só a agregação dos fatores
em código segue como contrato vazio.

## Banco de dados

PostgreSQL 16, driver `pg`, Sequelize com migrations como fonte da
verdade do schema (nunca `sequelize.sync()`). Em produção, um servidor
Postgres compartilhado pelos apps da VM, com database e usuário próprios
do FinMind (repositório `servidor02-infra`). Até 2026-09-26 o banco foi
MariaDB 11; a troca e o porquê estão em
`docs/adr/0026-postgresql-como-banco.md`.

## CI/CD

`ci.yml` roda lint + testes + build em toda branch/PR, sem depender de
nenhum serviço externo (os testes de backend não abrem conexão real
com o banco — só validam contratos e regras isoladas). `deploy.yml`
builda num runner ARM nativo (`ubuntu-24.04-arm`) e publica as imagens
`linux/arm64` no GHCR, e faz deploy via SSH na VM `servidor02` (Oracle
Cloud, Ampere A1, 2 OCPU / 12 GB) em push pra `main` — mesmo padrão do
AgroMind (`appleboy/ssh-action` + `scripts/deploy.sh`). Até 2026-09-26 o
FinMind dividia com o AgroMind uma VM x86 de 1 GB, que ficou pequena
(swap cheio, três servidores de banco); ver `docs/architecture.md` §
"Deploy".

## Lint

ESLint (config flat, mínima) em backend e frontend — necessário pelo
step de lint pedido explicitamente no CI; o AgroMind não tinha isso
configurado ainda.
