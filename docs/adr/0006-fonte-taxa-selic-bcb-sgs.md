# 0006 — Fonte da taxa Selic: meta (SGS 432) e realizada (SGS 1178)

## Contexto

Com o dólar já rodando de ponta a ponta (ADR 0001), o usuário do projeto
pediu explicitamente para adiantar mais um dado de infraestrutura enquanto
as definições do especialista David (`docs/pendente-especialista-david.md`)
não chegam: a taxa Selic. Esse pedido é, na prática, a mesma exceção
pontual já registrada em `docs/pendente-especialista-david.md` — só para
este caso específico (ativo = Selic). Nenhum outro ativo, mercado ou fonte
fica desbloqueado por este ADR.

"Selic" não é uma série única no SGS do BCB. A primeira versão desta ADR
coletava só a série 432 (Meta Selic). Na revisão, o usuário levantou dois
pontos que mudaram a decisão:

1. A meta (uma decisão do Copom) e a taxa diária efetiva de mercado (série
   11) são conceitualmente coisas diferentes (alvo vs. resultado
   observado), mas **precisam falar da mesma grandeza** — taxa de juros —
   só que expressa em janelas de tempo diferentes (anualizada vs. diária).
   Comparar as duas exigiria compor a diária ao longo do tempo (juros
   compostos) para chegar num número anualizado comparável à meta.
2. Fazer essa composição dentro do FinMind seria, na prática, um cálculo de
   mercado — exatamente o que este projeto está proibido de inventar sem
   definição do especialista David (ver `CLAUDE.md`, "Restrições
   permanentes").

Confirmado por chamada real à API (mesmo critério da ADR 0001, não
assumido): o próprio BCB já publica essa composição pronta, na série
**1178** ("Taxa de juros - Selic acumulada no mês anualizada", % a.a.):

- `GET https://api.bcb.gov.br/dados/serie/bcdata.sgs.1178/dados/ultimos/5?formato=json`
  → valores como 13.65/13.90, na mesma ordem de grandeza da meta (série
  432, ~13.75) — porque já é a taxa diária efetiva composta e anualizada
  **pelo Banco Central**, não por nós.

Isso resolve os dois problemas ao mesmo tempo: mesma grandeza/unidade que a
meta (permitindo comparação direta, inclusive no mesmo gráfico) sem que o
FinMind precise calcular nada — só coletar mais um dado bruto oficial, como
já faz com a meta.

## Decisão

Coletar duas séries do SGS do Banco Central, sob o mesmo instrumento
genérico `SELIC` (reaproveitando `market_quote`, ADR 0003, sem migration
nova):

- **Meta Selic** — série **432**, "Meta para a taxa Selic definida pelo
  Copom" (% a.a.). `source_code: BCB_SGS_432`, `modality: meta`. Muda só
  nas ~8 reuniões do Copom por ano; entre elas, a série publica um ponto
  por dia repetindo o mesmo valor.
- **Selic realizada** — série **1178**, "Taxa de juros - Selic acumulada
  no mês anualizada" (% a.a.). `source_code: BCB_SGS_1178`,
  `modality: realizada`. Já é a composição/anualização feita pelo BCB da
  taxa diária efetiva (série 11) — não recalculamos nada aqui.

Ambas em `unit: "% a.a."` — mesma unidade, mesma grandeza, comparáveis
diretamente (mesmo eixo Y num gráfico, por exemplo), sem nenhuma
transformação numérica feita pelo FinMind.

Mesmo critério da ADR 0001: fontes públicas, oficiais, sem
chave/autenticação; nenhuma síntese por IA é usada para obter esses
valores.

## Alternativas consideradas

- **Série 11 (Selic diária efetiva, % a.d., não anualizada)** — descartada
  nesta forma. É a fonte primária do "realizado", mas expressa numa escala
  completamente diferente da meta (~0,05 vs. ~13,75) — comparar as duas
  exigiria o FinMind compor/anualizar a série por conta própria, o que é um
  cálculo de mercado fora do escopo permitido nesta fase. A série 1178 é a
  mesma informação, já convertida pelo BCB pra unidade comparável.
- **Coletar só a meta (versão inicial desta ADR)** — descartada após a
  revisão: mostrar só "o que foi decidido" sem "o que de fato aconteceu" é
  informação incompleta para qualquer leitura de mercado.
- **IA com busca na web** — descartada pelo mesmo motivo da ADR 0001:
  existe fonte oficial estruturada, então IA nunca deve ser a fonte de
  verdade desse dado.

## Justificativa

- Fontes públicas, oficiais, gratuitas, sem chave — mesma API já validada
  para o dólar.
- Reaproveita 100% do pipeline genérico de coleta (`collector-runner.js`,
  `market_quote`, catálogo de observáveis).
- Nenhum cálculo/transformação numérica feito pelo FinMind — as duas séries
  já vêm prontas e na mesma unidade direto do BCB.
- Coluna `modality` (`meta`/`realizada`) evita qualquer tabela ou migration
  nova.

## Consequências

- Dois coletores novos, `bcb-selic-meta` e `bcb-selic-realizada`
  (`backend/src/collectors/bcb/`), registrados em `collectors/index.js`,
  seguindo o mesmo contrato do coletor do dólar.
- Uma entrada `SELIC` no catálogo de observáveis
  (`observaveis.service.js::CATALOGO_OBSERVAVEIS`), representando as duas
  séries — aparece automaticamente em `GET /api/v1/observaveis`, na tela
  `/dados-mercado/observaveis` e no detalhe com gráfico (duas linhas,
  mesma escala) + tabela histórica (coluna "Modalidade" distinguindo as
  linhas), com `periodicidade: "diaria"`/`tempoReal: false` explícitos.
  "Valor atual" no card/destaque mostra a meta (é o número publicamente
  reconhecido como "a taxa Selic"); o gráfico/tabela mostram as duas.
- Nenhum outro ativo, mercado ou fonte fica desbloqueado por este ADR; os
  demais itens de `docs/pendente-especialista-david.md` continuam
  pendentes do especialista David.
- Sem execução automática de ordens, sem regra/sinal derivado desses
  valores — só coleta e exibição do dado bruto oficial, em ambos os casos.

## Em aberto

- Backfill histórico da Selic (equivalente a `scripts/backfill-dolar.js`)
  não implementado nesta etapa — pode ser adicionado depois reaproveitando
  o mesmo padrão (`downloadIntervalo`) para as duas séries.
