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
  só `admin` de plataforma, rate-limitado) — para quem quiser rodar a coleta pela UI sem
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

## Atualização (2026-09-20) — primeiro agendamento real

O ADR original não previa quem chama o cron. Como a B3 só mantém uma janela rolante de ~15 meses do CCM
(ADR 0009), a coleta diária passou a ser necessária. Na máquina de desenvolvimento ela roda pelo **Agendador
de Tarefas do Windows**: `backend/scripts/agendar-coleta-windows.ps1` cria a tarefa `FinMind-Coleta-Diaria`
(22:00, `StartWhenAvailable`), que executa `node scripts/run-coleta.js` e acrescenta a saída em
`backend/storage/logs/coleta.log`. `-Remover` desfaz. Continua valendo: **nenhum `node-cron` no backend**.
Limites: só com a máquina ligada, o usuário logado e o MariaDB de dev no ar.

**Produção (VM):** já existe cron, no crontab do usuário `deploy` (**não versionado neste repositório**;
confirmado em 2026-09-20 com `sudo crontab -l -u deploy`). Três execuções por dia, às **04:00, 06:00 e 08:00**
(fuso do servidor **UTC**, confirmado em 2026-09-21 — ou seja, 01:00, 03:00 e 05:00 em Brasília), no formato
`cd /opt/apps/finmind/app && docker-compose -p finmind --project-directory . -f docker/compose.prod.yml exec -T backend npm run collect >> /opt/apps/finmind/logs/coleta-diaria.log 2>&1`.
Como chama `npm run collect`, cobre **todos** os coletores registrados - inclusive os que entraram depois
(FRED, LBMA, CFTC, B3/CCM) - sem mudança. O cron do AgroMind na mesma VM dispara nos mesmos minutos
(04:00/06:00/08:00), o que faz dois processos Node começarem juntos numa máquina de 1 GB; considerar
deslocar o FinMind (ex.: `15 4,6,8 * * *`).

**Verificação em produção (2026-09-21, por SSH):** `timedatectl` = Etc/UTC. O syslog mostra o cron do
FinMind disparando às 08:00 de 20/09 e às 04:00, 06:00 e 08:00 de 21/09, sempre no mesmo segundo que o
do AgroMind. O `coleta-diaria.log` (JSON, pino) registra as três execuções de 21/09 (o `time` convertido
dá 04:00, 06:00 e 08:00 UTC, cada uma levando ~3-4 min) com **todos** os coletores em `success`, 0
falhas e 0 criados (idempotente): BCB (3), FRED (4), LBMA, CFTC (2), B3 e USDA — o USDA rodando confirma
a `NASS_API_KEY` na VM. Nenhum horário da coleta depende de hora específica (a B3 reprocessa 5 dias
úteis; CFTC/USDA/FRED saem no dia seguinte), então UTC não exige mudança. Nesse momento a produção ainda
rodava o código anterior (USDA lendo 3.525 linhas = padrão de 2006; FRED pelo CSV). Não foi visto o
total histórico de execuções com falha (`grep -c ... failed|partial_success`), só as três de 21/09. O
comentário do crontab ("coleta diária (dólar via BCB)") está desatualizado; é só um rótulo.

## Em aberto

- Definição exata do cron de produção (frequência, horário) — decisão
  operacional, não bloqueada por este ADR nem pelo especialista David.
- Se um dia houver múltiplos coletores com cadências muito diferentes entre
  si, reavaliar se ainda faz sentido rodar "todos de uma vez" em
  `run-coleta.js` ou se cada um precisa de agendamento próprio.
