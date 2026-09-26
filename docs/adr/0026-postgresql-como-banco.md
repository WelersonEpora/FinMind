# 0026 — PostgreSQL como banco (servidor compartilhado na VM de produção)

**Status:** aceito em 2026-09-26 (decisão do usuário). Execução pendente: até a virada, o FinMind continua em
MariaDB 11 e vale `docs/decisoes-tecnicas.md` § "Banco de dados".

## Contexto

O MariaDB foi escolhido na casca inicial sem justificativa registrada ("mesmo princípio do AgroMind", que na
verdade usa Postgres). Três coisas mudaram desde então:

1. **O FinMind virou uma base de séries point-in-time** (`observation`, ADR 0008): ~350 mil linhas, versões por
   `published_at`, e a pergunta central é "o último valor publicado até a data X". O uso esperado a seguir é
   **análise** sobre essa base (correlações entre séries, alinhamento de frequências), não só leitura de telas.
2. **Consultas analíticas no MariaDB já custaram caro.** O `listarItens` levava ~10 s no NOAA porque o otimizador
   não usava o índice num `GROUP BY` por expressão (commit `8c03c2e`); a listagem de Observáveis teve o mesmo
   problema (`c6475e5`). Foram contornados reescrevendo a consulta, mas é o tipo de SQL que vai se repetir.
3. **Existe uma VM de produção própria.** Em 2026-09-26 o FinMind saiu da VM Always Free de 1 GB (compartilhada
   com AgroMind, Personal e Portal, ~920 MB em swap, três servidores de banco) para uma VM Ampere A1 de 2 OCPU /
   12 GB (`servidor02`), também Always Free. O Personal deve vir em seguida. Há memória para um banco bem
   dimensionado, e três servidores de banco pequenos deixam de fazer sentido.

## Decisão

- **PostgreSQL 16** (imagem `postgres:16-alpine`, a mesma do AgroMind e do Personal) como banco do FinMind.
- **Um único servidor Postgres na VM**, compartilhado pelos apps pessoais que forem para ela, com **um database e
  um usuário por app** (`finmind`, `personal`, …). Cada usuário só tem permissão no próprio database. Nenhum app
  conecta como superusuário.
- **O Postgres fica num compose próprio** (repositório privado `servidor02-infra`, clonado em `/opt/apps/infra`; o Postgres em `/opt/apps/infra/postgres`, fora do repositório de cada app), numa **rede
  Docker externa** (`db`) na qual os composes dos apps entram. Nenhuma porta publicada no host.
- **Backup lógico diário por database** (`pg_dump`, consistente), com retenção **7 diários + 4 semanais**, guardado
  no disco da VM e copiado para um bucket do Object Storage da Oracle com regra de ciclo de vida de 35 dias. Soma-se
  ao backup semanal do disco (política `semanal-3-semanas`), que já existe. O script de backup fica versionado.
- **Schema recomeçado por uma migration de linha de base (baseline)** que cria o schema atual em Postgres. As 13
  migrations do MariaDB saem da pasta ativa (continuam no git). Motivo: 4 delas têm SQL escrito à mão, parte dele
  específico do MariaDB (crases, `ALTER TABLE ... DROP FOREIGN KEY`, `FROM user` sem aspas) e parte só para corrigir
  truncamentos do próprio MariaDB. Esse histórico não tem valor num banco novo.
- **Dados migrados por cópia, nunca recoletados.** A `observation` guarda quando cada valor foi coletado e cada
  revisão da fonte (ADR 0008). As fontes só devolvem a versão de hoje, então recoletar perderia o histórico
  point-in-time. A carga é feita a partir de um dump do MariaDB, com conferência de contagem e de conteúdo.

## O que muda no código (levantado em 2026-09-26)

| Ponto | MariaDB hoje | Postgres |
|---|---|---|
| Driver / dialeto | `mysql2`, `dialect: "mysql"` (`src/config/database.js`, `sequelize.config.js`) | `pg` + `pg-hstore`, `dialect: "postgres"` |
| Inserção em lote da `observation` | `INSERT IGNORE ... VALUES ?` (sintaxe de array aninhado do `mysql2`), `affectedRows` | `INSERT ... ON CONFLICT (uk_pit) DO NOTHING` com placeholders montados, `rowCount` |
| Truncamento silencioso | o `INSERT IGNORE` rebaixava erro de tamanho a aviso (migrations `widen-*`) | o Postgres rejeita valor longo demais: o erro aparece. É melhor, mas os limites de tamanho do repositório (`TAMANHO_MAXIMO`) precisam continuar valendo |
| Tabela `user` | nome livre | **`user` é palavra reservada**: o Sequelize coloca aspas sozinho, mas todo SQL escrito à mão precisa de `"user"` (hoje: migrations; conferir `sequelize.literal`/`sequelize.query`) |
| Comparação de texto | collation sem distinção de maiúsculas: `findByEmail` e o índice único de e-mail ignoram caixa; `Op.like` do filtro de execuções também | distingue maiúsculas: e-mail em `citext` (ou normalizado em minúsculas na escrita e na busca), filtro com `Op.iLike` |
| `DATETIME` (`published_at`, `collected_at`, …) | sem fuso, gravado em UTC por `paraDatetimeSql` | `timestamptz`, sessão em UTC; conferir que nenhuma data muda na carga |
| `DECIMAL(18,6)` | volta como string | `NUMERIC(18,6)`, também string no `pg`; conferir o arredondamento no 6º dígito (ADR 0018 registrou divergência JS × banco) |
| `JSON` | `JSON` (alias de `LONGTEXT`) | `JSONB` |
| Funções de texto | `SUBSTRING_INDEX` (hoje só num comentário, depois de `8c03c2e`) | `split_part` |

Os testes automáticos não pegam nada disso: usam repositórios falsos e não abrem conexão com o banco. Por isso a
validação é o teste de paridade abaixo.

## Como validar antes da virada

1. **Carga:** Postgres de dev criado pela migration de linha de base e carregado com o dump de produção.
2. **Contagem por tabela** igual nos dois bancos.
3. **Paridade da `observation`:** para todas as séries, `obterAsOf` em várias datas (inclusive antes e depois de
   revisões conhecidas, como WASDE e Conab) e `buscarHistoricoAtual` devolvem o mesmo resultado nos dois bancos.
4. **Coleta:** uma execução completa (`npm run collect`) no Postgres de dev sem falha, e a reexecução sem
   duplicatas (dedup pela chave natural, ADR 0003).
5. **Telas:** login (com e-mail em caixa diferente), Observáveis, os cards por região/vencimento, exportação CSV e
   Execuções.

## Virada em produção

Numa janela sem coleta (fora de 04:00–08:00 UTC): parar o backend, dump do MariaDB, carga no Postgres, contagens,
trocar o `.env` e o compose, subir o backend e conferir as telas. O volume do MariaDB fica guardado (sem uso) por
algumas semanas antes de ser apagado, para permitir voltar atrás.

## Alternativas consideradas

- **Continuar no MariaDB.** Funciona no volume atual, e os problemas de desempenho foram contornados. Rejeitada
  porque o uso esperado é analítico, e o Postgres traz o que falta para isso: `DISTINCT ON` e `LATERAL` para o
  "último valor até a data X", agregados estatísticos (`corr`, `regr_*`, `percentile_cont`), `FILTER`,
  `generate_series` para alinhar frequências, views materializadas, índices BRIN e suporte de primeira classe nas
  ferramentas de análise. Também traz **segurança por linha** (row-level security), que o ADR 0007 registrou como
  ausente no MariaDB.
- **Um servidor Postgres por app.** Isola mais (uma atualização ou restauração afeta um app só), mas multiplica o
  cache e os processos fixos, que é o que apertava a VM antiga. Rejeitada nesta escala. O isolamento que importa
  (dados de um app fora do alcance do outro) vem dos usuários e databases separados.
- **Manter as migrations do MariaDB e torná-las portáveis.** Exigiria reescrever SQL que só existiu para corrigir
  o próprio MariaDB. Rejeitada em favor da linha de base.
- **TimescaleDB.** Útil para séries temporais muito grandes (hypertables, agregados contínuos). Fica para quando
  houver uma necessidade concreta: o volume atual não pede.

## Consequências

- `docs/decisoes-tecnicas.md`, `docs/architecture.md`, `README.md`, `CLAUDE.md`, `.env.example` e os composes
  passam a descrever o Postgres **na virada**, não antes.
- Atualizar uma versão maior do Postgres atinge todos os apps da VM de uma vez: é planejada, com backup antes.
- O BI (em discussão, dependente de reunião) nasceria sobre este Postgres, com um usuário somente leitura e views
  de "versão vigente" e "como se sabia na data", para não ler a `observation` crua e cair em *look-ahead bias*.
  Não faz parte desta decisão.

## Resultado da paridade (2026-09-26, bancos de dev com os mesmos dados)

Mesmas funções dos serviços rodadas nos dois bancos e comparadas: listagem de Observáveis, detalhe dos 26 cards,
histórico com várias paginações/ordenações/filtros e cada item x métrica dos cards com seletor (6.296 consultas),
exportação CSV dos 26 cards, execuções, e o `asOf` de todas as 6.195 séries em 6 datas, nos modos padrão e estrito
(1.556.697 linhas). **Conteúdo idêntico em tudo**, depois de duas correções que o teste revelou:

- `published_at_is_estimated = 0` e `SUM(published_at_is_estimated)`: o Postgres não compara nem soma booleano como
  número. Trocados por `= FALSE` e `SUM(CASE WHEN ... THEN 1 ELSE 0 END)`, que valem nos dois bancos (o teste de
  integração `observation.integration.test.js` passa 7/7 em ambos).
- Ordenações sem desempate (histórico por valor, execuções por início): com valores repetidos cada banco devolvia
  os empatados numa ordem, e a paginação podia repetir ou pular linhas. Ganharam desempate pela chave de cada linha.

Diferença que fica: a **ordem** das séries com `_` no nome (collations diferentes) quando a consulta ordena por
`series_code`; o conteúdo é o mesmo. Tempo da bateria completa: ~1h51 no MariaDB, ~6 min no PostgreSQL.
