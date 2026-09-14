# 0005 — PrimeVue para tabelas de dados densas (Observáveis/Execuções)

## Contexto

O usuário pediu que as telas de "Observáveis" (catálogo de indicadores) e "Execuções" (log de
execução de coleta) seguissem exatamente o padrão já validado no AgroMind — filtros,
paginação, ordenação e botão de atualizar numa tabela — reaproveitando "os mesmos
componentes e bibliotecas do AgroMind". Investigação no AgroMind (`C:\Source\AgroMind\
frontend`) confirmou que ele usa **PrimeVue v4** (`primevue`, `@primevue/themes`,
`primeicons`) com `DataTable`/`Column`/`Button`/`Dialog` diretamente, sem um componente Vue
próprio de tabela — o reuso entre telas é uma convenção de CSS global (`tabela-card`,
`tabela-paginada`, `tabela-refresh-botao`, `tabela-linhas-por-pagina`).

O FinMind, até aqui, só usava Bootstrap 5 em todo o frontend.

## Decisão

- **PrimeVue entra como segunda biblioteca de UI**, só para tabelas de dados densas
  (Observáveis, Execuções, e a tabela histórica da tela de detalhe de um observável).
  Bootstrap continua sendo a base de todo o resto do app (login, dashboard, usuários, shell,
  modais simples). Mesmas versões do AgroMind: `primevue ^4.5.5`, `@primevue/themes ^4.5.4`,
  `primeicons ^7.0.0`.
- Registro global mínimo em `main.js` (`app.use(PrimeVue, { theme, locale })`), mas só os
  componentes efetivamente usados são importados (`DataTable`, `Column`, `Button`, `Dialog`)
  — sem registrar o PrimeVue "completo".
- **Tema**: preset `Aura` padrão do `@primevue/themes`, com uma customização mínima
  (`frontend/src/theme/finmind-preset.js`) só pra alinhar a cor primária ao azul já usado no
  FinMind (`#0d6efd`). **Não** foi replicado o preset de 71 linhas + arquivo de tokens CSS do
  AgroMind (`agromind-preset.js`/`agromind-tokens.css`) — aquilo resolve uma identidade visual
  própria do AgroMind (paleta completa, modo claro/escuro, tokens compartilhados com o resto
  da UI), sem equivalente hoje no FinMind (que não tem um sistema de tokens CSS, só Bootstrap
  + algumas cores literais). Se um dia FinMind quiser paridade visual completa com PrimeVue em
  mais telas, é um ajuste isolado nesse preset.
- **Reuso via CSS, não via componente Vue** — portada a mesma convenção `tabela-card`/
  `tabela-paginada`/`tabela-refresh-botao`/`tabela-linhas-por-pagina` (global, não scoped) pra
  `frontend/src/assets/main.css`, igual ao `style.css` do AgroMind. Cada view continua
  escrevendo seu próprio `<DataTable>`/`<Column>` (colunas diferentes por tela), só a moldura/
  paginação/botão de atualizar é compartilhada via classe CSS.
- Paginação/ordenação/filtro: **client-side** pra listas pequenas e limitadas (Observáveis —
  hoje 1 linha, catálogo estático), **lazy/server-side** pra tabelas que crescem sem teto
  (Execuções, histórico de um observável) — mesmo critério do AgroMind.

## Alternativas consideradas

- **Construir um wrapper Vue de tabela genérico** — rejeitada; o próprio AgroMind não tem um
  (usa `DataTable`/`Column` direto em cada view + convenção de CSS), então não haveria um
  padrão de referência pra portar, e um wrapper novo seria uma abstração inventada sem
  precedente.
- **Migrar todo o FinMind pra PrimeVue** (abandonar Bootstrap) — fora de escopo; o pedido foi
  especificamente sobre as tabelas de Observáveis/Execuções, e o resto do app já está
  funcionando bem com Bootstrap.
- **Replicar o preset/tokens completos do AgroMind** — rejeitada por ora (ver "Decisão" acima)
  — mais trabalho de manutenção de um sistema de design que o FinMind não tem em outro lugar,
  sem ganho funcional imediato pro pedido feito.

## Justificativa

Reaproveitar exatamente a lib/padrão já validado no AgroMind reduz risco (comportamento de
paginação/ordenação/filtro já testado em produção lá) e mantém as duas aplicações-irmãs
consistentes pra quem trabalha nas duas. A customização de tema mínima evita duplicar um
sistema de design completo antes de haver necessidade real de paridade visual total.

## Consequências

- Bundle do frontend cresce (~1.37MB minificado antes de gzip, ~380KB gzip) — aceito pelo
  mesmo motivo do ECharts (ADR anterior sobre gráfico): consistência com o padrão já validado
  supera o custo de tamanho nesta fase.
- `npm install` reporta `@primevue/themes` como pacote descontinuado a favor de
  `@primeuix/themes` — mesma versão usada no AgroMind hoje, então não é uma escolha isolada do
  FinMind; se o AgroMind migrar, replicar a migração aqui.
- Duas convenções de UI coexistindo (Bootstrap + PrimeVue) exige atenção em novas telas: usar
  PrimeVue só quando a tela for uma tabela de dados densa nesse mesmo padrão; qualquer outra
  necessidade de UI usa Bootstrap, como já era.

## Em aberto

- Paridade visual completa (tokens/preset dedicados) se um dia for pedida explicitamente.
- Se o catálogo de observáveis crescer muito além de poucas dezenas de itens, reavaliar se a
  listagem ainda deve ser client-side (mesmo critério que levaria o AgroMind a reavaliar sua
  própria tela de Observáveis).
