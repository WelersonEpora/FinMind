# 0019 — IMEA: balanço de oferta e demanda do milho, extraído do PDF por coordenada

## Contexto

O ADR 0018 implementou dois recortes do IMEA para milho de Mato Grosso (área/produção/
produtividade por safra, via API JSON; custo de produção, via XLSX) e descartou explicitamente o
**balanço de oferta e demanda** (estoque inicial/final, importação, consumo, exportação) porque só
existe em PDF: uma extração de teste com `pdftotext -layout` desalinhava a tabela — o mesmo problema
que já tinha descartado PDF como fonte no WASDE (ADR 0015, "Não extraídos, de propósito").

Em 2026-09-22, nesta conversa, o usuário pediu para investigar uma alternativa e **autorizou
explicitamente** reabrir essa decisão a partir do que a investigação confirmasse — mesmo padrão de
exceção pontual já usado no dólar (ADR 0001), Comex Stat (ADR 0013), WASDE (ADR 0015), Conab (ADR
0017) e no próprio ADR 0018.

## Evidência (chamadas e extrações reais, 2026-09-22)

### O catálogo tem histórico real, diferente da API de safra e do catálogo de custo

`GET /api/arquivo?cadeia=3&nome=Oferta e Demanda` (mesma rota do `imea-custo-milho`, ADR 0018) lista
**79 arquivos**, todos PDF, de **2014-04-14 a 2026-08-31** — uma edição por mês (nome
`"Oferta e Demanda - Milho"`). Diferente da API de safra e do catálogo de custo (só a versão atual),
aqui **cada edição publicada continua no catálogo**: há vintage real a carregar, não só o presente.

Dois achados nos 79 registros, confirmados por chamada real (não presumidos):

- **1 arquivo não é uma edição real**: `"OFERTA E DEMANDA"` (sem "- Milho"), de 2017-01-07, com o
  `Path` em `/Metodologias/3/...` (não no padrão numerado `/3/<id>/...` dos demais). Baixado e lido:
  é um documento de **1 página** explicando o conceito de oferta/demanda, sem a tabela de safra
  (`extrairBalanco` confirma: nenhuma âncora "Estoque Inicial" encontrada). `ehEdicaoValida` exige o
  nome exato `"Oferta e Demanda - Milho"` e descarta este arquivo; mesmo que não descartasse, o
  parser rejeitaria com um inválido explícito, não um sucesso vazio.
- **1 data duplicada**: duas edições em 2017-12-18 (ids `700679871802376192` e
  `728504982270115840`), uma republicação no mesmo dia — mesmo padrão já visto no WASDE (ADR 0015,
  slug `-0`/`v2`). `escolherUmaPorData` fica com a de **maior id** (a mais nova).

Resultado: **77 edições reais** de 2014-04-14 a 2026-08-31.

### A extração por COORDENADA resolve o que o texto corrido não resolvia

Testada com `pdfjs-dist` (biblioteca nova neste projeto, build `legacy/build/pdf.mjs`, sem worker) em
**7 edições espalhadas** (2014-04-14, 2017-12-18, 2019-12-16, 2020-12-14, 2021-12-13, 2023-04-03,
2026-08-31) e depois **nas 77 reais**, via `downloadIntervalo` completo:

- A tabela de balanço é **texto real** em todas (não imagem escaneada), com **as mesmas 10 linhas**
  em toda edição amostrada — Oferta, Estoque Inicial, Importação, Produção, Demanda, Consumo MT,
  Consumo Interestadual, Exportação, Aquisições públicas, Estoque Final (rótulo desconhecido é
  ignorado, não quebra a edição, para o caso de alguma edição fora da amostra ser diferente).
- **Rótulo e números da MESMA linha podem estar em baselines Y levemente diferentes** (ex.: rótulo em
  y=657, números em y=655, em 2017/2020/2021): resolvido agrupando linhas por **proximidade** de Y
  (tolerância de 4pt), nunca por igualdade exata — a 1ª tentativa (igualdade exata) perdia os números
  dessas edições.
- **O cabeçalho de safra muda de formato** entre edições (`"2011/12"` x `"2019/2020"`) e tem colunas
  de **variação percentual** (`"∆ 19/20 e 20/21"`, às vezes numa linha decorativa própria com "ꓥ" e
  o ano com espaço dentro — `"2020 / 2021"`, que não pode ser confundida com o cabeçalho real):
  resolvido lendo só cabeçalhos que casam com `\d{4}/\d{2,4}\*?` e escolhendo a linha com MAIS
  colunas reconhecidas como safra.
- **Achado só nas 77 reais, não nas 7 da amostra inicial**: em **2 edições** (2022-04-18 e
  2022-07-18), o PDF quebra números em vários itens de texto — `"11,"` + `"36"` em vez de `"11,36"`,
  às vezes dígito a dígito numa porcentagem (`"1"+"5"+","+"9"+"8"+"%"` = `"15,98%"`), tanto na tabela
  quanto no texto corrido ao redor dela (provável artefato de como a fonte foi embutida nessas 2
  edições específicas). Sem remontar, 7 valores viravam inválidos (texto não numérico, ex. `"11,"`
  sozinho) e outros fragmentos (ex. `"36"`) entravam como valores pequenos soltos, arriscando grudar
  na coluna errada silenciosamente. Corrigido remontando fragmentos ADJACENTES (gap ≤ 20pt do
  fragmento anterior) que só têm dígito/vírgula/%/hífen — nunca toca em texto (rótulo ou prosa, que
  não casam com esse padrão), então uma frase como "consumo MT foi reajustado... 11,36 milhões..." no
  meio do texto corrido não vira dado (o "rótulo" da linha é a frase inteira, que não bate com nada
  do dicionário).
- Cada valor é lido pela coluna (safra) cujo X está mais perto do cabeçalho, dentro de um raio máximo
  de 20pt — sem o raio, um valor de variação (bem à direita, sem cabeçalho de safra correspondente)
  colaria por engano na última safra.

**Resultado nas 77 edições reais** (`downloadIntervalo` completo, 2026-09-22): **3.369 observações
válidas, 0 inválidas**, todas as 77 edições com as 10 métricas completas. Conferência cruzada: a
Produção de Mato Grosso 2025/26 lida aqui (58,04 milhões de t) bate exatamente com o valor já
confirmado pelo ADR 0018 pela rota da API (`IMEA_MILHO_SAFRA`, 58.036.957,95 t).

### Achado real ao rodar o backfill DUAS vezes contra o banco de dev: rodar de novo pode logar falha, sem corromper dado

`npm run backfill:imea-oferta-demanda` rodado contra o banco de dev (2026-09-22): **802 linhas
gravadas, 3 blocos em `success`, 0 falhas.** Rodado uma **2ª vez** (repetição do comando inteiro, não
a coleta diária): 2 dos 3 blocos terminaram em `partial_success`, com 256 "falhas" registradas — todas
do tipo "valor diferente com `published_at` não posterior à última versão".

**Não é um bug do coletor nem do parser, nem corrompeu dado nenhum** (conferido linha a linha: a
cadeia de revisões de `IMEA.MILHO.BALANCO.OFERTA`/safra 2022/23 tem as 8 revisões esperadas, em ordem,
sem lacuna). É uma característica do mecanismo de deduplicação **compartilhado**
(`persistirPorEdicao`, `collectors/base/persist-observations.js`, usado também pelo WASDE e pela
Conab): quando uma edição repete o MESMO valor da anterior para uma série, o serviço point-in-time
corretamente **não grava linha nova** (só grava mudança real) — mas o controle de "edição já
processada" (`jaIngeridos`, em `persistirPorEdicao`) só reconhece como "já vista" uma edição que
GEROU linha escrita. Numa 2ª rodada completa do zero, uma edição que na 1ª vez foi "mesmo valor, sem
linha" não é reconhecida como já processada; se a série já avançou desde então para uma data mais
recente com valor diferente, reenviá-la "no meio do caminho" esbarra na trava de ordem do serviço
point-in-time — que **recusa a escrita fora de ordem** (correto: prefere falhar a gravar errado) em
vez de silenciosamente aceitar.

**Escopo do achado:** não é exclusivo do IMEA — o mesmo mecanismo é usado por WASDE (ADR 0015) e
Conab (ADR 0017), cujos backfills rodaram em produção uma única vez (nunca foram repetidos por
inteiro para testar esta situação). A coleta diária (que só relê as 2 últimas edições, com
`exigirCargaInicial`) foi testada em repetição nesta mesma investigação e não apresentou o problema.
**Não corrigido nesta ADR**: seria uma mudança no mecanismo compartilhado
(`persist-observations.js`/`point-in-time.service.js`), fora do escopo desta entrega — decisão do
usuário (2026-09-22): documentar como limitação conhecida. **Mitigação operacional**: como o
backfill é uma operação de carga inicial (roda uma vez por ambiente novo, antes da coleta diária —
mesmo padrão do WASDE/Conab), o risco prático é baixo; se precisar repetir um backfill já bem-sucedido
por algum motivo, as "falhas" resultantes são ruído de log, não perda de dado.

## Decisão

- **Um coletor novo**, registrado em `collectors/index.js` e rodado pela rotina diária de sempre:
  `imea-oferta-demanda-milho` (`collectors/imea/imea-oferta-demanda-milho.collector.js` +
  `.parser.js`). Baixa só as **2 edições mais recentes** do catálogo na coleta diária (a nova e uma
  eventual republicação da anterior, mesmo critério do WASDE).
- **Um script de backfill**, `scripts/backfill-imea-oferta-demanda.js` (`npm run
  backfill:imea-oferta-demanda`), que reaproveita o mesmo coletor trocando a fase de download pelo
  intervalo completo (`downloadIntervalo`), em blocos de 5 anos (2014 a hoje, ~3 blocos), mesmo
  padrão do `backfill-wasde-milho.js`. **Ordem de carga**: como no WASDE/Conab, a coleta diária se
  recusa a gravar uma série sem carga histórica (`exigirCargaInicial`, `persistirPorEdicao` de
  `collectors/base/persist-observations.js`) — o backfill (`persistirBackfill`) não tem essa trava e
  deve rodar primeiro em qualquer banco novo.
- `source_code` `IMEA_MILHO_BALANCO`. Séries `IMEA.MILHO.BALANCO.<CAMPO>` (mesmo padrão de nomes do
  `CONAB_MILHO_BALANCO`) — uma série por métrica, sem dimensão regional (o balanço da fonte só existe
  para Mato Grosso como um todo). `observed_at` = 1º de setembro do ano de início da safra (mesma
  convenção do WASDE/Conab/IMEA safra). `published_at` REAL, só a data (a do catálogo de arquivos,
  fim do dia em UTC — ou o instante da coleta, se o fim do dia ainda estiver no futuro).
- **Dependência nova**: `pdfjs-dist` (Apache-2.0, sem dependência nativa), adicionada a
  `dependencies` do backend. Usada em `legacy/build/pdf.mjs`, sem worker (síncrono no processo Node,
  como o resto dos coletores). A leitura do PDF acontece no **download** (assíncrono, esperado pelo
  runner) — `parse()` continua síncrono, como o contrato exige
  (`collectors/base/collector-runner.js` não espera `parse`), operando sobre as páginas já extraídas.
- **Card novo e SEPARADO** do card de safra (`IMEA_MILHO_SAFRA`) no catálogo de observáveis
  (`IMEA_MILHO_BALANCO`, `porCampo`, sem seletor de região — só o de métrica, mesmo desenho do
  `WASDE_MILHO_EUA`/`CONAB_MILHO_BALANCO`). Decisão do usuário, nesta conversa: o balanço não tem
  quebra por região (só Mato Grosso), enquanto o card de safra tem a quebra nas 7 regiões do IMEA —
  colocar as duas coisas no mesmo seletor `porRegiao` deixaria a maioria dos itens sem dado para as
  métricas do balanço. Mesmo critério de compatibilidade que já separou/consolidou os cards de custo
  no ADR 0018, agora aplicado ao eixo "item" em vez de "frequência"/"unidade". O card também documenta
  que a métrica **Produção** aparece nos dois cards (API, no card de safra; PDF, aqui), sem
  reconciliação entre as duas rotas — mesmo princípio de "sem tentar reconciliar" já usado para
  Mensal x Ponderado no custo.
- **Origem explicitada na tela**: por pedido do usuário, `fonteDetalhe.formatoOrigem` começa com
  `"PDF"` e diz explicitamente que o dado foi extraído do texto do PDF publicado pelo IMEA (não de
  uma API), e `fonteDetalhe.metodologia` explica a extração por coordenada — mesmo campo que os
  outros cards já usam para dizer XLS/XLSX/JSON.
- **Não extraído, de propósito**: as colunas de variação percentual entre safras (derivadas, não
  publicadas como dado primário) e o PDF de metodologia do catálogo (não é uma edição).

## Consequências e riscos

- **Backfill não é idempotente em repetição INTEIRA (achado real, ver seção acima)**: rodar
  `npm run backfill:imea-oferta-demanda` uma 2ª vez do zero pode logar falhas espúrias (edições
  "mesmo valor" da 1ª rodada, sem linha própria, reenviadas fora de ordem) — sem corromper dado, o
  serviço point-in-time recusa a escrita em vez de gravar errado. Mecanismo compartilhado com
  WASDE/Conab, não corrigido nesta ADR (decisão do usuário: documentar como limitação conhecida). Na
  prática, não repetir um backfill que já terminou em `success`.
- **Sem API nem dicionário de dados** (mesmo risco do resto do IMEA/WASDE/Conab): uma mudança de
  layout do PDF quebra o coletor com falha clara (âncora ou cabeçalho não encontrado vira inválido
  explícito), não grava errado.
- **Extração por coordenada é mais frágil que planilha/JSON por natureza.** Mitigada por: (a) testada
  contra as 77 edições reais do catálogo inteiro, não só uma amostra; (b) tolerância de Y para
  rótulo/valor desalinhados; (c) remontagem de números fragmentados (achado real em 2 das 77
  edições); (d) raio máximo para não colar valor de variação na safra errada; (e) rótulo desconhecido
  é ignorado, nunca interpretado por adivinhação.
- **Duas rotas para a mesma métrica (Produção)**: o card de safra (API) e este card (PDF) não são
  reconciliados entre si — cada um mostra o que sua rota publica, com o risco documentado no
  `fonteDetalhe.escopo` de cada card.
- **Licença não investigada** (mesma ressalva já registrada para o resto do IMEA no ADR 0018).
- **Não confirmado**: limite de requisições da fonte (mitigado com 1s de pausa entre downloads, mesma
  cautela do `imea-custo-milho`/WASDE). As 77 edições existentes no catálogo em 2026-09-22 foram
  todas lidas com sucesso (0 inválidas); uma edição futura com layout diferente do já visto falha de
  forma clara (âncora, cabeçalho ou rótulo não reconhecido), não grava errado.
