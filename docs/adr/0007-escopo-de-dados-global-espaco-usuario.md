# 0007 — Escopo de dados: Global × Espaço × Usuário

## Contexto

O FinMind tem hoje só dado de mercado (`market_quote`, `collection_execution`)
e identidade (`user`, `system_setting`) — nenhum dado patrimonial. Os próximos
módulos (carteira, operações, alertas, análises personalizadas) trazem dado
**privado**, e a decisão de *como isolá-lo* precisa existir antes da primeira
tabela privada, não depois: escolher o dono do dado com a tabela já criada vira
migração de dados.

Três fatos do código atual moldam a decisão:

- Todo o pipeline (`collectors/`, `market_quote`) é global e não sabe que
  usuários existem. Isso é um ativo a preservar — não faz sentido um
  `tenant_id` em dado de mercado.
- `user.role` (então `owner`/`colaborador`, hoje `admin`/`user` — ver §5) é
  papel de **plataforma**: cria usuários e dispara a coleta global. Não é papel de dono de um patrimônio.
- Os casos de uso previstos não cabem em "um usuário = um dono": uma pessoa
  tem patrimônio pessoal **e** participa do patrimônio da família; um
  assessor gerencia o patrimônio de vários clientes.

Referência (não modelo): o Personal Assistant resolve algo parecido com
`equipe`/`membro` (ADR-0011 de lá), mas lá quase todo dado é da equipe, o
vínculo é 1:1 e o `equipeId` viaja no JWT. Nada disso vale aqui.

## Decisão

### 1. Três escopos

Toda tabela do FinMind pertence a **exatamente um** destes escopos:

| Escopo | Pertence a | Coluna de dono | Quem escreve | Quem lê |
|---|---|---|---|---|
| **GLOBAL** | à plataforma | nenhuma | pipeline global / admin de plataforma | qualquer usuário autenticado (ou só admin de plataforma, se operacional) |
| **PRIVADA** | a um **espaço** | `workspace_id` | membros do espaço, conforme o papel | só membros do espaço |
| **USER** | a um usuário, em qualquer espaço | `user_id` | o próprio usuário | o próprio usuário |

**GLOBAL** — mesmo conteúdo para qualquer usuário, publicável sem expor
ninguém: ativos/instrumentos (catálogo), cotações e históricos, índices,
câmbio, indicadores econômicos, fontes, notícias e seus enriquecimentos
(resumo/etiqueta por IA), eventos corporativos, versões de estratégia do
produto (regras do especialista), análises e sinais **de mercado** (derivados
só de dado global), logs de coleta, configuração da plataforma.

**PRIVADA (do espaço)** — carteiras, operações, aportes, posições
persistidas, patrimônio, rentabilidade persistida, alertas (e seus disparos),
análises personalizadas e saídas de IA sobre dado do espaço, watchlist,
preferências de investimento (perfil, benchmark), ativos/cotações privados
(ex.: previdência, imóvel, fundo fechado sem cotação pública), estratégia
própria do espaço (eventual), configuração do espaço, trilha de auditoria do
espaço.

**USER** — preferências de interface (tema, menu recolhido), foto, dados de
perfil, preferências de notificação pessoal, credenciais.

### 2. Como classificar uma nova tabela

Nesta ordem, parando na primeira resposta "sim":

1. O conteúdo é o mesmo para qualquer usuário e poderia ser publicado sem
   expor ninguém? → **GLOBAL**.
2. É sobre a pessoa (interface, identidade, preferência pessoal),
   independentemente do espaço em que ela esteja? → **USER**.
3. Caso contrário → **PRIVADA**.

Regras adicionais, todas obrigatórias:

- **Na dúvida, PRIVADA.** Relaxar um escopo depois é barato; consertar um
  vazamento não é.
- **Não assuma que "não global" = "do espaço".** O passo 2 existe para isso.
  Perguntar: *se o usuário sair do espaço, esse dado fica com o espaço ou
  vai com ele?* Fica → PRIVADA. Vai → USER.
- **Uma tabela nunca mistura escopos.** Nada de `workspace_id` anulável
  significando "global se nulo" — toda consulta teria de lembrar do
  `OR IS NULL`, e um esquecimento vaza ou some dado. Dois escopos = duas
  tabelas.
- **Global nunca aponta para privado.** FK só vai de PRIVADA/USER para
  GLOBAL (ex.: uma operação referencia um instrumento), nunca o contrário.
- **Dado privado nunca é gravado em tabela global.** Cotação informada por um
  espaço para um ativo sem preço público vai para tabela PRIVADA, jamais para
  `market_quote` — senão um espaço adultera o dado que todos veem.
- **Derivado herda o escopo mais restritivo das entradas.** Cálculo só de
  dado global é GLOBAL; cálculo que toca dado privado é PRIVADO, e só se
  persiste como snapshot, com chave do espaço.
- **Log operacional é GLOBAL no armazenamento, restrito na visibilidade.**
  `collection_execution` não tem dono, mas não é dado para clientes de um
  produto multi-espaço.
- **Toda migration de tabela nova declara o escopo** num comentário de
  cabeçalho (`Escopo: GLOBAL | PRIVADA | USER`), e a tabela entra no registro
  abaixo.

### 3. Registro das tabelas atuais

| Tabela | Escopo | Observação |
|---|---|---|
| `market_quote` | GLOBAL | sem `workspace_id`, e nunca terá |
| `observation` | GLOBAL | dado de mercado point-in-time, append-only (ADR 0008); sem `workspace_id`, e nunca terá |
| `collection_execution` | GLOBAL | visibilidade hoje aberta a autenticados; restringir a admin de plataforma quando houver clientes externos |
| `system_setting` | GLOBAL | configuração da plataforma |
| `user` | USER (identidade) | identidade global, não vínculo com espaço |
| `workspace` | estrutura de vínculo | não é dado de mercado nem privado |
| `workspace_member` | estrutura de vínculo | idem |

### 4. Espaço, membro e usuário

Nome de negócio: **Espaço** (`workspace` no código e no schema, em inglês
como o restante das tabelas — ADR 0003). Ver "Alternativas" para a escolha.

```text
user (global) ──< workspace_member >── workspace
                   role: owner | editor | viewer
```

- Relação **N:N**: um usuário participa de vários espaços; um espaço tem
  vários membros. Não existe `UNIQUE(user_id)` em `workspace_member` — foi
  removido de propósito em relação ao modelo 1:1 do Personal Assistant.
- **Espaço pessoal:** todo usuário nasce com um, criado na mesma transação
  do usuário, com o próprio como `owner`. É marcado por
  `workspace.personal_user_id` (índice único → no máximo um por usuário;
  `NULL` nos espaços compartilhados). Usuários existentes na data da
  migration ganharam o seu por backfill.
- **Regra do espaço pessoal:** é de um usuário só. Compartilhar patrimônio =
  criar **outro** espaço ("Família Souza", "Cliente A"), não adicionar
  membros ao pessoal. O servidor recusa adicionar membros ao espaço pessoal.
- **Assessor:** cada cliente é um espaço em que o assessor é membro
  (`owner` ou `editor`) e o cliente, se for usuário, pode ser `viewer`.
- Papéis no espaço: `owner` gerencia o espaço e os membros e edita; `editor`
  edita dado privado; `viewer` só lê. Hoje só a gestão de membros os aplica
  (adicionar exige `owner`; listar, qualquer membro) — as permissões sobre
  dado privado ainda não têm código, pois não há dado privado. Default no
  banco: `viewer` (menor privilégio). Todo espaço deve ter ao menos um
  `owner` — invariante hoje garantida pelo fato de o owner não ser removível
  nem atribuível (só haverá mais de um quando existir transferência de
  propriedade).
- Revogar acesso = apagar o vínculo (sem coluna `ativo`); a checagem é feita
  no banco a cada request, então a revogação é imediata. (Ainda não existe
  como mudar papel, transferir propriedade ou o próprio membro "sair".)
- **Remover membro (implementado):**
  `DELETE /api/v1/workspaces/:workspaceId/membros/:membroId`, só o `owner`
  daquele espaço. O `membroId` é o id do **vínculo** e é procurado dentro do
  espaço da URL — o id de um vínculo de outro espaço dá 404 (sem isso, o owner
  de um espaço poderia apagar membros de qualquer outro). O **owner nunca é
  removível** (o espaço não pode ficar sem proprietário) e o espaço pessoal
  não tem membros a remover (409). Na interface, a lixeira só aparece nas
  linhas em que a ação é possível, com confirmação. O usuário removido continua
  ativo no FinMind e pode ser incluído de novo; perde o acesso na hora.
- **Excluir espaço (implementado):** `DELETE /api/v1/workspaces/:workspaceId`,
  só o `owner`, **nunca o espaço pessoal**. Confirmação em dois níveis: a
  interface exige digitar o nome exato do espaço, e o **servidor** exige esse
  nome no pedido (`{ confirmacao }`, 400 se ausente ou diferente — case
  sensitive, espaços das pontas aparados), então uma chamada de API por engano
  não apaga nada. Vínculos e espaço saem numa transação; o `DELETE` filtra
  `personal_user_id IS NULL`, então **o banco recusa apagar um espaço pessoal
  mesmo que a checagem do serviço seja burlada** (e o erro desfaz a remoção
  dos vínculos). Os outros membros perdem o acesso (a interface avisa
  quantos). Nada de mercado é afetado. Exclusão é **física e irreversível**.
- **Exclusão de espaço e dados privados futuros:** hoje um espaço só contém
  vínculos, então a exclusão física é segura. Quando existirem tabelas
  PRIVADAS (carteira etc.), elas devem referenciar `workspace` com FK
  `RESTRICT` (§6): a exclusão de um espaço com dados será **bloqueada** até
  que se decida entre exclusão lógica, período de retenção e exportação
  (LGPD). Esse bloqueio é o comportamento desejado, não um defeito.
- **Criar espaço (implementado):** qualquer usuário autenticado cria um
  espaço compartilhado e vira `owner`, numa transação
  (`POST /api/v1/workspaces`, com limite por usuário). Não cria nenhuma
  entidade financeira.
- **Adicionar membro (implementado):** `POST /api/v1/workspaces/:workspaceId/membros`,
  só o `owner` **daquele** espaço, com o e-mail de um usuário já existente e
  ativo, como `editor` ou `viewer` — `owner` não é atribuível (seria
  transferência de propriedade). A interface escolhe o usuário numa **lista**
  (`GET .../membros/candidatos`, abaixo). Sem convite. Duplicação é barrada
  (checagem + índice único). Todo membro vê nome e papel dos membros do
  espaço; só o `owner` vê os e-mails. Nunca se expõe id de usuário nem nada
  de outro espaço.
- **Lista de candidatos — decisão consciente, e o que ela pressupõe:**
  `GET /api/v1/workspaces/:workspaceId/membros/candidatos` devolve os
  usuários **ativos que ainda não são membros** daquele espaço, só com nome e
  e-mail (nunca id, papel ou senha), ordenados por nome. Só o `owner` do
  espaço acessa (404 para não-membro, 403 para editor/leitor, 409 para o
  espaço pessoal). **Como qualquer usuário pode criar um espaço e virar
  `owner`, na prática qualquer usuário consegue listar nome e e-mail de todos
  os usuários ativos do FinMind.** Isso só é aceitável enquanto os usuários
  forem um **grupo fechado e confiável**, provisionado por um admin (não há
  cadastro público). Foi escolhido assim para a usabilidade; a alternativa
  anterior (e-mail exato, sem lista) protegia contra enumeração e continua
  possível.
- **Se o FinMind passar a ter clientes externos que não devem saber quem mais
  o usa**, esta lista precisa ser desligada (voltando ao e-mail exato), ou
  restrita (ex.: só a quem já compartilha um espaço com o candidato, ou só a
  admins de plataforma), ou substituída por convite aceito pelo destinatário.
  As salvaguardas do `POST` continuam valendo para quem chama a API sem a
  lista: e-mail inexistente e usuário inativo têm resposta idêntica, e há
  limite de 10 tentativas por 10 minutos **por usuário** autenticado. Testado
  contra MariaDB real, incluindo ids de espaço hostis (o id entra escapado no
  subselect).

### 5. Administrador da plataforma ≠ papel no espaço

São conceitos independentes, com dados e checagens separados:

| | Administrador da plataforma | Papel no espaço |
|---|---|---|
| Onde vive | `user.role` (`admin` / `user`) | `workspace_member.role` (`owner` / `editor` / `viewer`) |
| Governa | usuários, coleta global, dado GLOBAL | dado PRIVADO de **um** espaço |
| Nunca faz | ler/editar dado privado de um espaço por ser admin | qualquer ação de plataforma |

Consequências: autorização de dado privado consulta **apenas**
`workspace_member`, jamais `user.role`; admin de plataforma **não** tem acesso
automático a espaços de terceiros (menor privilégio; um eventual "acesso de
suporte" seria decisão explícita e auditada, não um efeito colateral).

**Vocabulário separado (migration `20260919110000-rename-platform-roles.js`):**
o papel de plataforma era `owner`/`colaborador` e colidia com o `owner` do
espaço. Agora é `admin`/`user` (`owner→admin`, `colaborador→user`); a coluna
continua `role`, só os valores mudaram. Na interface: "Administrador"/"Usuário"
(plataforma) × "Proprietário"/"Editor"/"Leitor" (espaço).

**Papel e status vêm do banco, não do token.** `require-auth.js` carrega o
usuário a cada request e exige `active`; `req.user.role` é o valor do banco.
O JWT carrega só `sub`. Consequências: desativar um usuário ou mudar seu papel
vale no request seguinte (antes, até o token expirar em 8h); tokens emitidos
antes do rename (com `role: "owner"`) continuam válidos e o `role` que
carregam é ignorado — não foi preciso invalidar sessões. Uma falha do banco
nessa consulta responde 500, não 401 (não desloga por erro de infraestrutura).
Sem cache de propósito, para não reintroduzir o atraso.

### 6. Orientação para o isolamento futuro (não implementado)

Nada abaixo existe ainda — só passa a valer quando a primeira tabela PRIVADA
(provavelmente `carteira`) for criada, e deve ser feito **junto** com ela:

- Rotas privadas sob `/api/v1/workspaces/:workspaceId/...`, fisicamente
  separadas das rotas de mercado, com um middleware que verifica o vínculo
  (usuário ∈ `workspace_member` daquele espaço) **no banco, a cada request**.
  (Versão mínima já existe: `requireWorkspaceMember(...papéis)`, usada só na
  gestão de membros — 404 para quem não é membro, 403 para papel
  insuficiente. As rotas de dado privado o reutilizarão.)
- **Espaço ativo não vai no JWT** (evita token stale: papel/vínculo revogados
  continuariam valendo até 8h). O espaço ativo, quando houver seletor no
  frontend, é estado do cliente derivado da URL — e sempre revalidado no
  servidor. Não há seletor nem "espaço ativo" agora: nenhum consumidor real.
- Repositories de dado privado só existem via factory que exige o
  `workspaceId` (ex.: `forWorkspace(workspaceId)`) — nada de `findByPk(id)`
  solto, que é acesso por id sem checar dono.
- Tabelas filhas de um agregado privado usam FK composta
  `(workspace_id, id)` para o banco recusar um filho apontando para o pai de
  outro espaço; tabelas volumosas consultadas direto carregam `workspace_id`
  próprio.
- MariaDB não tem row-level security: o isolamento é da aplicação + constraints.
  Por isso precisa haver teste de isolamento **contra um MariaDB real no CI**
  (hoje os testes usam só fakes e não provam que um `WHERE workspace_id`
  existe no SQL).
- Módulos de mercado (coletores, `market-data.service`) nunca recebem
  `workspaceId`; evitar dependência inversa com regra de lint quando o
  primeiro módulo privado existir.
- `ON DELETE` em tabelas privadas: preferir `RESTRICT` — apagar espaço ou
  usuário não deve apagar dado patrimonial em silêncio.

### 7. Implicações para o Motor FinMind e a IA

- **Duas fases.** (a) *Análise de mercado*: só dado GLOBAL + versão da
  estratégia, sem contexto de espaço, calculada **uma vez** e reutilizada;
  resultado é GLOBAL. (b) *Personalização*: recebe o resultado global + o
  contexto de **um** espaço explícito, é determinística, e resultado é
  PRIVADO. O contrato atual (`engine.interface.js`, um único argumento) não
  muda agora — muda quando as regras do especialista existirem.
- **IA.** Síntese de mercado/notícia é GLOBAL (custo pago uma vez). IA sobre
  dado do espaço monta a entrada só por repositories escopados ao espaço e
  grava a saída como PRIVADA. Dado privado nunca entra em prompt, log ou
  cache compartilhado. Continua valendo: resposta de IA nunca dispara ação.
- **Reprodutibilidade.** `market_quote` é atualizado por upsert (o valor pode
  ser revisado pela fonte). Análise PRIVADA persistida deve registrar a
  versão da estratégia e a data-base (`as_of`) dos dados usados.
- **Jobs.** A coleta continua global e sem noção de espaço. Qualquer rotina
  que avalie alertas/análises após a coleta é um job **separado**, que
  itera por espaço com falha isolada por espaço, e deve indexar alertas por
  instrumento (avaliar uma vez por instrumento, notificar os espaços
  interessados).

## Alternativas consideradas

- **`tenant_id` nas tabelas atuais.** Rejeitada: `market_quote` e
  `collection_execution` são globais por natureza; não há dado privado
  existente a proteger.
- **Dono = `user_id` (sem espaço).** Rejeitada: não cobre patrimônio
  compartilhado (família) nem o assessor com vários clientes; migrar depois
  custaria mais que criar a estrutura agora, que é mínima.
- **Modelo do Personal Assistant** (vínculo 1:1, `equipeId` no JWT, quase
  todo dado da equipe). Rejeitada nos três pontos: N:N aqui; JWT sem espaço;
  o global domina e o privado é uma camada fina.
- **Nome do conceito:**
  - *Conta* — colide com conta bancária/de corretora, ambíguo em finanças.
  - *Patrimônio* — colide com a métrica "patrimônio", que é um dado
    privado *dentro* do espaço.
  - *Contexto* — colide com o "contexto" da IA (`ai/provider.interface.js`).
  - *Grupo* — descreve pessoas; o "Cliente A" do assessor é um patrimônio,
    não um grupo.
  - *Equipe/Tenant* — Equipe é o conceito do PA (time de trabalho);
    Tenant é jargão técnico que não deve aparecer para o usuário.
  - **Espaço (escolhido)** — neutro sobre o dono (pessoa, família, cliente),
    sem colisão de domínio, natural na interface ("Espaço pessoal",
    "Espaço Família Souza"). Fraqueza: não diz "finanças" por si — o contexto
    do produto resolve.
- **Papéis do espaço como tabela/permissões granulares.** Rejeitada: sem
  dado privado, nada a proteger; três valores num `CHECK` bastam.
- **`workspace_id` anulável para "global ou privado" na mesma tabela.**
  Rejeitada (ver regra "uma tabela nunca mistura escopos").

## Justificativa

A decisão registra o que é caro de mudar depois — o *dono* do dado privado e a
regra de classificação — e adia o que é barato de fazer quando houver
consumidor real (middleware, factory de repository, seletor). Só estrutura
existe agora: nada usa `workspace` para autorizar, e isso é intencional.

## Consequências

- Migration `20260919100000-create-workspace-tables.js`: `workspace` e
  `workspace_member`, com backfill de um espaço pessoal (vínculo `owner`)
  para cada usuário existente, inclusive inativos.
- Novo usuário nasce com espaço pessoal + vínculo `owner`, em transação
  (`user.repository.js::createWithPersonalWorkspace`). O antigo `create`
  solto foi removido: é o único caminho de criação, então não há como criar
  usuário sem espaço. O seeder do admin (SQL cru) replica a regra.
- **Visibilidade na interface (segunda etapa):** `GET /api/v1/workspaces`
  lista só os espaços do usuário autenticado (`{ espacos: [{ id, nome,
  pessoal, papel }] }`); o frontend os carrega junto com a sessão
  (`stores/workspace.js`), mostra o espaço atual num seletor (hoje no menu
  lateral, ver "Navegação" abaixo) e tem a página `/e/:workspaceId`.
  Espaço ativo: URL (em rotas `/e/...`) > último usado (`localStorage`) >
  pessoal — nunca no JWT. O `:workspaceId` da URL é validado no guard do
  router contra a lista do usuário (id inexistente e id de outro usuário
  dão a mesma resposta); isso é UX, não autorização.
- **Gestão de espaços (terceira etapa):** criar espaço e adicionar/listar
  membros (§4), com o papel de plataforma separado do papel no espaço (§5) e
  `requireAuth` revalidando o usuário no banco. A UI: seletor sempre em forma de dropdown
  (com "Criar espaço"), e gestão de membros na página do espaço.
- **Navegação:** o menu lateral tem um grupo "Espaço" cujo cabeçalho é o
  **seletor do espaço ativo** (nome + tipo e papel — ex.: "Compartilhado ·
  Proprietário" —, com destaque visual; sem rótulo de texto "ESPAÇO", que
  repetiria o nome do espaço pessoal, só a linha divisória), seguido do
  que existe dentro do espaço ("Visão geral" funcional; Carteiras, Operações,
  Posições e Patrimônio desabilitados). O seletor é o único lugar que mostra o
  nome do espaço; trocar de espaço não muda a estrutura do menu, só o destino, e
  **leva sempre à Visão geral do espaço escolhido**, de qualquer página (inclusive
  de uma página global de Dados de Mercado).
  A topbar ficou só com o que é global (marca, perfil, sair) — um seletor lá
  sugeria que tudo dependia do espaço, o que não vale para Dados de Mercado. No
  menu recolhido o seletor vira só o ícone (nome na dica); no celular vive na
  gaveta, então o nome do espaço só aparece com a gaveta aberta. O dropdown usa
  posicionamento fixo (a sidebar rola e cortaria um menu absoluto) e largura
  limitada (no celular, à da gaveta, que por ter `transform` também corta filhos
  fixos).
- **Ainda não há dado privado.** A URL do frontend (`/e/:workspaceId`) é distinta do prefixo da API
  (`/api/v1/workspaces/:workspaceId/...`, §6). O prefixo do frontend é
  `/e/` (de "espaço") de propósito — `/t/` foi descartado por ser
  abreviação de "tenant", termo técnico que não deve aparecer para o
  usuário.
- `market_quote` e demais tabelas atuais permanecem inalteradas.
- FK de `workspace_member.user_id` e `workspace.personal_user_id` sem
  `CASCADE`: não é possível apagar um usuário com vínculo sem tratar o espaço
  antes (hoje só o `down` do seeder apaga usuário, e já trata).

## Em aberto

- Reavaliar a lista de candidatos (§4) se o FinMind deixar de ser um grupo
  fechado de usuários.
- Ciclo de vida que falta: mudar papel, transferir propriedade, o membro
  "sair" do espaço por conta própria, convite aceito pelo destinatário
  (alternativa à lista de candidatos), o que ocorre com um espaço pessoal
  quando o usuário é desativado ou removido, e exclusão lógica/exportação de
  espaço com dados (LGPD) quando existirem dados privados.
- Acesso de suporte da plataforma a espaço de terceiros: proibido por padrão
  aqui; se necessário, exige decisão explícita e trilha de auditoria.
- Tabela `instrument` (global) e FK a partir de tabelas privadas — hoje
  `instrument_code` é string livre (ADR 0003); é pré-requisito da carteira.
- Restringir `GET /coletas` (e a foto por id) quando houver usuários que não
  sejam da operação.
- Definir, junto com a primeira tabela privada, o middleware de vínculo, a
  factory de repository e o teste de isolamento com MariaDB real no CI.
