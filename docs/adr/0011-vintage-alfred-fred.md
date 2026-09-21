# 0011 — Vintage real via ALFRED: o que foi confirmado e como foi provado

## Contexto

Item 1 de `STATUS_DO_PROJETO.md` §3 ("Falta fazer — não depende do David"):
provar com dado real que `obterAsOf()` (`point-in-time.service.js`) devolve
um valor diferente do atual quando a fonte revisou um período — o critério de
sucesso do "Núcleo de Observáveis com Vintage" (`docs/analise-critica-fel1-
milho-ouro.md`, §8). O coletor FRED atual (`fred.collector.js`) usa o CSV
público, que só traz a versão **atual** de cada valor; `published_at` é
sempre estimado por regra de defasagem (ver ADR 0008 §"Pendências"). ALFRED
(o arquivo de vintages do FRED) exige a API REST com chave — o usuário
registrou uma chave gratuita em 2026-09-21 (`FRED_API_KEY`, `.env`/`env.js`).

Antes de codificar, confirmei por chamada real à API (convenção do repo,
`CLAUDE.md` "Convenções para novos coletores" e precedente da ADR 0001) como
o ALFRED se comporta de fato para as 4 séries já coletadas.

## O que a chamada real confirmou

Testei `GET /fred/series/observations` com `output_type=2` (uma coluna por
vintage) em 5 janelas de ~9 meses espalhadas entre 2008 e 2023, comparando o
valor de cada `observed_at` entre todas as vintages disponíveis na janela:

| Série | Amostras verificadas | Revisões encontradas |
|---|---|---|
| `DGS10` | ~775 observações, 4 janelas (2008-2023) | **0** |
| `DFII10` | ~775 observações, 4 janelas (2008-2023) | **0** |
| `T10YIE` | ~585 observações, 3 janelas (2015-2023) | **0** |
| `DTWEXBGS` | ~380 observações, 2 janelas (2020, 2023) | **33** (15 em 2020, 18 em 2023) |

Confirma a suspeita já registrada na ADR 0008: `DGS10`/`DFII10`/`T10YIE` são
taxas de mercado (H.15) que na prática não revisam depois de publicadas — não
são um bom caso de teste de vintage, mesmo tendo cobertura ALFRED. **`DTWEXBGS`
revisa de verdade**, com frequência (índice ponderado, recalculado depois da
primeira publicação). Exemplo concreto usado como fixture no teste (§"Prova"
abaixo): `observed_at = 2023-01-03`, publicado em `2023-01-09` como
`122.1578`, revisado em `2023-02-06` para `122.041` (estável até pelo menos
2023-09-30, limite da janela testada).

Achado adicional: a cobertura de vintages do ALFRED **não cobre a série
inteira desde a origem** — `realtime_start` anterior a ~2015-2018 (variando
por série) devolve `"The series does not exist in ALFRED"`, mesmo a série
existindo no FRED desde muito antes (`DGS10` existe desde 1962). ALFRED só
rastreia vintage a partir de quando o FRED passou a versionar aquela série
internamente.

## O obstáculo: append-only não permite "consertar" o que o CSV já gravou

`observation` é append-only (ADR 0008) e `registrarObservacoes`
(`point-in-time.service.js`) só aceita uma versão nova quando o `value`
difere do último **e** o `published_at` dessa versão é **posterior** ao da
última já gravada — senão vira `falha`, de propósito (é o que impede
reescrever histórico).

O coletor diário do FRED já gravou, para essas mesmas datas, o valor **atual
(final)** com um `published_at` **estimado por regra de defasagem** (ex.:
"próxima segunda"). Ao tentar inserir a vintage *original* de `DTWEXBGS`
(pré-revisão, `published_at` real em 2023-01-09) contra o que já está no
banco (valor final `122.041`, `published_at` estimado em torno da mesma
data), duas coisas podem acontecer e nenhuma prova nada:

- Se o valor já bate com o final (maioria dos dias, sem revisão): "mesmo
  valor" → ignorado, nenhuma linha nova.
- Se o valor é o pré-revisão (difere do final já gravado) mas o
  `published_at` real não é posterior ao estimado que já está lá: conflito →
  `falha` — o sistema está, corretamente, recusando reescrever uma história
  que ele julga já saber.

Ou seja: rodar um backfill de vintages contra uma série **já coletada
diariamente** não reproduz o cenário que prova o `asOf()` — o valor "final"
que o CSV gravou já está lá antes da vintage original chegar. Isso não é bug;
é o append-only fazendo o trabalho dele.

## Decisão

Provar `asOf()` com dado real **sem** escrever na `FRED.DTWEXBGS` de
produção/dev: teste de integração (`observation.integration.test.js`, mesmo
padrão de transação com `ROLLBACK` já usado pelo arquivo, `FINMIND_TEST_DB=1`)
usando um `series_code` isolado (`TESTE.PIT.DTWEXBGS_ALFRED`) semeado com os
valores e datas de publicação **reais** confirmados acima. O teste chama
`registrarObservacoes`/`obterAsOf` de verdade contra o MariaDB (não mocka o
mecanismo), só a fonte dos números é um fixture citando a origem.

Isso fecha o item 1 do jeito que a análise crítica pedia (prova com dado
real que `asOf()` diverge do valor atual) sem violar o append-only nem
brigar com o que o coletor diário já gravou.

## Fora de escopo aqui (registrado para não se perder)

- Um **backfill de produção** de vintages ALFRED só faz sentido para uma
  série **antes** da primeira coleta diária via CSV (senão esbarra no mesmo
  conflito descrito acima). Útil quando uma série revisável de verdade
  entrar (ex.: CPI, citada na ADR 0008) — nesse caso, backfillar o ALFRED
  primeiro, ligar a coleta diária depois. Não implementado agora: não foi
  pedido e adicionar uma série nova ao catálogo é decisão à parte (`CLAUDE.md`,
  "Convenções para novos coletores", item 5).
- `DGS10`/`DFII10`/`T10YIE` continuam com `published_at` estimado — não há
  ganho em backfillar vintage real pra elas (não revisam) além de, no
  máximo, uma precisão maior de data de publicação, que o modelo atual
  (revisão = mudança de valor) não tem como capturar sem mudar de valor.
