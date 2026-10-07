# 0107 — Acesso de leitura do assistente ao banco do servidor

**Status:** aceita (2026-10-07).

## Contexto

O banco local não tem a série diária que só o servidor coleta (as leituras da IA, o realizado, as execuções, os
estoques da ICE desde 2016, o Brent futuro). Para conferir um caso como o da expectativa "um dia adiantada" (ADR 0106),
o assistente dependia de prints da tela ou de comandos rodados pelo usuário no Portainer.

O usuário propôs abrir o banco do servidor ao assistente, primeiro com escrita. Ficou só a leitura: a escrita direta
pula a `observation` append-only (ADR 0008), as migrations e o registro da execução, e um erro em produção custa até
um dia de dados num Postgres compartilhado com outras aplicações (ADR 0026). O que exigiria escrita (corrigir um dado,
recarregar uma série, refazer uma leitura) segue por script ou migration no repositório, rodado pelo usuário.

## Decisão (usuário, Welerson, 2026-10-07)

1. **Um papel só de leitura, `finmind_leitura`**, com `SELECT` apenas nas tabelas de mercado e de execução:
   `observation`, `market_quote`, `analise_diaria`, `collection_execution`, `geopolitica_leitura`, `geopolitica_evento`,
   `fator_parametro_versao` e `sequelize_meta`. Fica sem acesso a `user`, `workspace`, `workspace_member` e
   `system_setting`. O papel abre toda transação em modo somente leitura, com `statement_timeout` de 30 s e no máximo
   2 conexões.
2. **Nenhuma porta aberta para a internet.** Um contêiner `socat` na rede `db` publica o Postgres só em
   `127.0.0.1:15432` da VM, sem reiniciar o Postgres compartilhado. O acesso é por túnel SSH com uma **chave só do túnel** (`finmind_tunel`, no computador do usuário, fora do repositório), autorizada na VM com `restrict,port-forwarding,permitopen="127.0.0.1:15432",command="/bin/false"`: não abre shell, não executa comando nem copia arquivo, e só encaminha para a ponte do banco. A chave pessoal do usuário, com acesso total à VM, não é usada. O assistente abre o túnel quando precisa e o fecha ao terminar, com uma regra local do Claude Code (`.claude/settings.local.json`, fora do git) que libera só o `ssh` com essa chave.
3. **Credencial fora do git**, em `.env.servidor` na raiz do repositório (no `.gitignore`).
4. **Uso:** `backend/scripts/consulta-servidor.js` (o SQL como argumento; `--json` para as linhas em JSON), que também
   abre a sessão em modo somente leitura. Só para análise: nada lido no servidor vira dado gravado no banco local.
5. Uma tabela GLOBAL nova não entra sozinha: precisa de um `GRANT SELECT` ao papel, rodado pelo usuário. Não há
   `ALTER DEFAULT PRIVILEGES`, para que uma tabela de espaço ou de usuário nunca seja aberta por engano.

## Implementação (rodada pelo usuário na VM)

1. O papel, como superusuário do Postgres (no contêiner `postgres`):

   ```sql
   CREATE ROLE finmind_leitura LOGIN PASSWORD '<senha>' CONNECTION LIMIT 2;
   ALTER ROLE finmind_leitura SET default_transaction_read_only = on;
   ALTER ROLE finmind_leitura SET statement_timeout = '30s';
   GRANT CONNECT ON DATABASE finmind TO finmind_leitura;
   \c finmind
   GRANT USAGE ON SCHEMA public TO finmind_leitura;
   GRANT SELECT ON observation, market_quote, analise_diaria, collection_execution,
     geopolitica_leitura, geopolitica_evento, fator_parametro_versao, sequelize_meta TO finmind_leitura;
   ```

2. A ponte local na VM: `docker run -d --name finmind-pg-leitura --restart unless-stopped --network db
   -p 127.0.0.1:15432:5432 alpine/socat tcp-listen:5432,fork,reuseaddr tcp-connect:postgres:5432`.
3. A chave do túnel, no fim de `/home/ubuntu/.ssh/authorized_keys`:
   `restrict,port-forwarding,permitopen="127.0.0.1:15432",command="/bin/false" ssh-ed25519 AAAA... finmind-tunel`.
4. O túnel: `ssh -i ~/.ssh/finmind_tunel -N -L 15432:127.0.0.1:15432 ubuntu@<servidor02>`. Conferido em 2026-10-07: um
   comando pela chave é recusado, e a consulta entra como `finmind_leitura`, sem acesso a `user`, `workspace` e
   `system_setting` e sem escrita.

## Consequências

- O assistente confere no servidor, com a série inteira, o que antes dependia de print.
- Para revogar: apagar a linha `finmind-tunel` do `authorized_keys` (corta o túnel); de vez, também
  `docker rm -f finmind-pg-leitura`, `DROP OWNED BY finmind_leitura` (no database `finmind`) e `DROP ROLE finmind_leitura`.
- Se a chave do túnel ou a senha do papel vazarem, o alcance é a leitura das tabelas de mercado.
