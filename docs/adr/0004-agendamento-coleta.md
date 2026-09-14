# 0004 — Agendamento da coleta

## Contexto

A cotação do dólar (ADR 0001) precisa ser atualizada periodicamente (uma vez
por dia útil, no máximo, já que a fonte é diária — ver ADR 0001). O FinMind
não tinha, até aqui, nenhuma infraestrutura de agendamento (sem
`node-cron`, fila ou worker), e o pedido do usuário foi explícito: não
adicionar esse tipo de dependência nesta etapa, e usar como referência o
padrão do AgroMind (script de coleta acionado por cron externo, scheduler
fora do backend principal).

## Decisão

- `backend/scripts/run-coleta.js` — script standalone que registra os
  coletores (`collectors/index.js`), roda todos os coletores registrados
  (hoje só o do dólar) via `executarColetor({ triggerType: "script" })`,
  loga um resumo estruturado por coletor e sai com código de erro (`exit
  1`) se qualquer execução tiver `status: "failed"` — para um cron externo
  conseguir alertar. `npm run collect` (backend) roda esse script.
- Nenhum `node-cron`, fila ou worker adicionado ao processo do backend.
  Quem agenda a execução periódica é infraestrutura externa ao repositório
  (cron do host, systemd timer, ou equivalente na VM de produção) chamando
  `docker compose exec backend npm run collect` (mesmo padrão do AgroMind,
  cujo cron de produção também não está versionado neste repositório).
- Também existe disparo manual via `POST /api/v1/coletas` (autenticado,
  só `owner`, rate-limitado) — para quem quiser rodar a coleta pela UI sem
  esperar o próximo ciclo do cron.
- Duplicidade de execução (o mesmo dia rodado mais de uma vez, seja pelo
  cron ou manualmente) é resolvida na camada de persistência: upsert por
  chave natural em `market_quote` (ver ADR 0003) — reexecuções com o mesmo
  valor não geram nem duplicata nem `UPDATE` desnecessário.

## Alternativas consideradas

- **`node-cron` dentro do processo do backend** — rejeitada nesta etapa
  (pedido explícito do usuário); também exigiria cuidado extra com múltiplas
  réplicas do backend rodando o mesmo cron simultaneamente, problema que não
  existe com cron externo de instância única.
- **Fila/worker (ex.: BullMQ)** — rejeitada; complexidade desnecessária para
  "rodar uma função HTTP-like uma vez por dia útil", sem justificar Redis ou
  processo adicional nesta fase.
- **Guard de "já rodou hoje" antes de chamar a fonte** (como o AgroMind faz
  para a pesquisa via IA) — rejeitada por não ser necessária aqui: a API do
  BCB é gratuita, sem limite prático de uso, e o upsert já torna reexecuções
  seguras e baratas.

## Justificativa

Mesmo raciocínio do AgroMind: manter o scheduler fora do backend principal
evita acoplar a aplicação a uma infraestrutura de agendamento antes de haver
necessidade real (mais de um coletor, cadência diferente por coletor,
paralelismo) — e evita reinventar o que o próprio SO/orquestrador já
resolve bem (cron, systemd timer).

## Consequências

- Nenhuma novidade de infraestrutura no `docker-compose`/CI para este ADR —
  o script já roda dentro do container existente do backend.
- Documentado em `CLAUDE.md` como o cron de produção deveria ser configurado
  (fora deste repositório).

## Em aberto

- Definição exata do cron de produção (frequência, horário) — decisão
  operacional, não bloqueada por este ADR nem pelo especialista David.
- Se um dia houver múltiplos coletores com cadências muito diferentes entre
  si, reavaliar se ainda faz sentido rodar "todos de uma vez" em
  `run-coleta.js` ou se cada um precisa de agendamento próprio.
