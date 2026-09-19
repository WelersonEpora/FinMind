# Decisões técnicas — casca inicial

Decisões tomadas sem definição prévia do usuário ou do especialista de
mercado, escolhendo sempre a alternativa mais simples, segura e
extensível disponível, conforme combinado.

## Autenticação

JWT (HS256) num cookie `httpOnly` + `Secure` (só em produção,
`NODE_ENV=production`) + `SameSite=Lax`, expiração fixa de 8h, sem
refresh token nesta fase (usuário faz login de novo ao expirar).

Sem CORS habilitado — a API só responde a requisições de mesma origem
(proxy Nginx em produção, proxy do Vite em dev). Combinado com o fato de
a API ser JSON-only (`express.json()` exige `Content-Type:
application/json`, que o navegador não envia em formulários HTML
simples e que dispararia um preflight CORS bloqueado em qualquer outra
origem), isso já mitiga CSRF sem precisar de um token CSRF separado.

Senhas com `bcryptjs` (implementação pura em JavaScript, sem
compilação nativa — mais simples de buildar numa imagem Alpine que
`bcrypt`), 12 rounds de salt.

**Extensão futura natural:** refresh token / renovação silenciosa de
sessão, se o tempo de uso justificar.

## Identificadores (UUID)

`CHAR(36)`, gerado na aplicação via `crypto.randomUUID()` (Sequelize
`defaultValue`), nunca por default do banco. Evita depender de
`UUID()`/tipo nativo do MariaDB, que varia por versão do servidor —
mesma convenção usada no AgroMind (Postgres), adaptada.

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
granulares. Quando houver necessidade real delas, o caminho natural é
uma tabela `permission` + junção `role_permission`, sem alterar o que já
existe.

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
`NotConfiguredError` explícito. Nenhum dos três tem qualquer lógica de
domínio hoje — só o contrato de entrada/saída, para que o resto do
sistema (dashboard, status) possa referenciá-los sem acoplar a uma
implementação futura específica.

## Banco de dados

MariaDB 11 (LTS), driver `mysql2`, Sequelize com migrations como fonte
da verdade do schema (nunca `sequelize.sync()`), mesmo princípio do
AgroMind.

## CI/CD

`ci.yml` roda lint + testes + build em toda branch/PR, sem depender de
nenhum serviço externo (os testes de backend não abrem conexão real
com o banco — só validam contratos e regras isoladas). `deploy.yml`
builda e publica as imagens Docker no GHCR e faz deploy via SSH na
mesma VM Oracle Cloud onde o AgroMind já roda, em push pra `main` —
mesmo padrão do AgroMind (`appleboy/ssh-action` + `scripts/deploy.sh`).
Decisão consciente de dividir a mesma VM Always Free (1 vCPU/1GB RAM)
entre os dois projetos; ver `docs/architecture.md` § "Deploy" pelo
risco de memória e pelas convenções usadas para não colidir com o
AgroMind (diretório, nome do projeto Compose, porta do frontend).

## Lint

ESLint (config flat, mínima) em backend e frontend — necessário pelo
step de lint pedido explicitamente no CI; o AgroMind não tinha isso
configurado ainda.
