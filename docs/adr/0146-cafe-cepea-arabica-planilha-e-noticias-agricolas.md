# 0146 — Café: o Indicador do Arábica do Cepea, pela planilha (histórico) e pela republicação do Notícias Agrícolas (diário)

## Contexto

A análise "ANÁLISE CAFÉ 19out26" (resposta no `STATUS_DO_PROJETO.md`, §0, item E8) pediu o preço físico do arábica, o
Indicador do Café Arábica CEPEA/ESALQ, para o câmbio (F4) e o custo (F5). O Comitê, na resposta recebida em 2026-10-22,
decidiu: "E8 (fonte Cepea): APROVADO. A regra combinada F4 + F5 só entra após backtest."

A aquisição de dados está encerrada desde 2026-10-01 (`CLAUDE.md`): esta é uma fonte nova com demanda específica do
Comitê. O obstáculo é conhecido (ADR 0028; `docs/reconhecimento-fontes/README.md`): o site do Cepea bloqueia a coleta
automática (o desafio do Cloudflare na exportação; `robots.txt` contra agentes de IA), e o arquivo `Indic` da B3, de onde
vem o milho do Cepea (ADR 0021), não traz o café.

**Quem autorizou:** o usuário (Welerson), em 2026-10-23, com o mesmo poder de decisão do David (`CLAUDE.md`):

- o **histórico** pela planilha que o usuário exporta no site do Cepea ("Gerar Excel"), uma vez, com uma tela de
  importação para as atualizações, que funciona igual em dev e no servidor;
- o **diário** pela leitura direta da página do Notícias Agrícolas que republica o indicador, com uma conferência no código
  antes de gravar (abaixo) e o limite de variação de **8%**; **nenhuma coleta pela busca da IA** por enquanto. O usuário
  começou pela busca da IA, no modelo que já usava no AgroMind, e trocou depois do reconhecimento (§2): "se mudar o
  layout, a gente vai perceber e conserta o erro";
- **só o arábica**: o conilon não entra, porque só serviria ao F6, em que a arbitragem entre os dois não entrou na regra
  (o histórico foi contra a hipótese, ADR 0088);
- o **LBMA PM** pela mesma via, avaliado e **não incluído**: a referência do ouro é o GLD da B3 (ADR 0054); o LBMA só
  serviria aos testes futuros, e a série contínua do GLD faz esse papel;
- a **regra F4 + F5**: definida pelo FinMind, com o critério pré-registrado, testada com o KC em reais agora e de novo com
  o Cepea (em ADR próprio).

O limite da autorização: a aquisição do indicador do arábica, para os fatores do café. Não é precedente para outra fonte
nem para outra cotação pela IA.

## Decisão

### 1. O histórico: a planilha do Cepea, importada pela tela (implementado)

- **A planilha conferida** (exportada pelo usuário em 2026-10-23): o Indicador do Café Arábica CEPEA/ESALQ (saca de 60 kg
  líquido, bica corrida, tipo 6, bebida dura para melhor, à vista, descontado o prazo pela taxa NPR, posto São Paulo), em
  R$ e em US$. São **7.506 pregões, de 02/09/1996 a 22/10/2026**, num arquivo só (o site não limitou o período).
  - Nenhuma linha inválida e nenhuma data repetida.
  - Nenhum intervalo maior que 6 dias; de 246 a 251 pregões por ano.
  - O câmbio implícito (R$ ÷ US$) contra a PTAX, em 7.499 dias em comum: 0,23% de diferença na mediana e 1,03% no
    percentil 95. O Cepea usa o câmbio dele.
  - O layout é o que o AgroMind registrou para o milho e a soja: XLS binário, aba "Plan 1" com 4 linhas de cabeçalho
    (título, nota, fonte, colunas) e o dado em texto com a vírgula decimal; o nome do arquivo não diz o produto.
- **O coletor** `cepea-cafe-planilha` (`backend/src/collectors/cepea/cepea-cafe-planilha.collector.js`) lê os arquivos
  recebidos. Nunca faz uma requisição ao Cepea e não é registrado na coleta diária.
  - Ele confere o título ("INDICADOR DO CAFÉ ARÁBICA CEPEA/ESALQ") e as colunas antes de gravar: outro indicador ou outro
    layout recusa a importação inteira.
  - Duas séries na `observation`: `CEPEA.CAFE_ARABICA.AVISTA_BRL` e `CEPEA.CAFE_ARABICA.AVISTA_USD`, com o
    `source_code` `CEPEA`.
  - `published_at` estimado no fim do dia do pregão em Brasília, a regra do milho pela B3.
  - Um dia repetido é ignorado; um valor que o Cepea tenha mudado vira revisão (ADR 0008).
  - Arquivos sobrepostos na mesma importação: o mesmo valor entra uma vez; valores diferentes no mesmo dia não entram.
- **A tela:** o card "Café - Indicador do Arábica CEPEA/ESALQ" em Dados de Mercado, com o botão **Importar planilha**
  (só para o admin). O botão é genérico: aparece em qualquer card que tenha `importacao` no catálogo
  (`observaveis.service.js`), com a rota, o tipo de arquivo e a instrução.
- **A rota:** `POST /api/v1/cepea/cafe/importacao`, admin, com rate limit (10 em 10 minutos), o arquivo na memória (nunca
  gravado em disco), só `.xls`, até 10 MB e 20 arquivos. A importação vira uma execução em Execuções.
- **No servidor:** o administrador abre o card e envia o arquivo, sem cópia para o container nem comando. Em dev, o mesmo
  service por `npm run importar:cepea-cafe -- --arquivo=<planilha.xls>`.
- **Em dev (2026-10-23):** 15.012 valores criados em 4 segundos, sem falha; reimportar ignorou os 15.012.
- O desenho do upload veio do AgroMind (o diálogo, a rota com o `multer` e o rate limit, a importação pelo pipeline do
  coletor).

### 2. O diário: a página do Notícias Agrícolas, com a conferência no código (implementado)

**O reconhecimento da busca pela IA (2026-10-23), que levou à troca.** Antes, o AgroMind (ADR 0029 de lá) tinha buscado o
Indicador do Milho CEPEA/ESALQ pela IA em 11/08/2026: os 3 valores batem ao centavo com o oficial que o FinMind tem pela B3.
No FinMind, um script de reconhecimento (sem gravar) pediu ao Gemini com busca os 5 pregões mais recentes do arábica:

- **6 execuções** (3 com o prompt do AgroMind adaptado e 3 com um prompt melhorado), de 27 a 114 s e de 3 a 15 mil tokens.
  As 30 comparações com a planilha bateram ao centavo, com a data certa.
- **O pregão mais recente não veio.** Com o 1º prompt, a busca procurava pela data da matéria (`"22/10/2026"`) e achava a
  de quinta, com os valores até o dia 21. O prompt melhorado (a matéria de hoje traz o valor de ontem; comece pelas de hoje)
  levou a busca à página do indicador no Notícias Agrícolas, mas ela ainda parou no dia 21.
- **A causa:** a mesma página, aberta direto, já trazia o 22/10 (1.619,85, igual à planilha). A busca do Gemini lê a cópia
  que o Google guardou, de um dia antes: o atraso vem do índice, e nenhum prompt o resolve.
- **As páginas lidas** foram republicações: o Notícias Agrícolas, a Brasil 61 (agência que distribui a cotação a jornais),
  o Portal BEI e o Correio da Mata.

**A fonte, reconhecida:** a página do indicador do arábica no Notícias Agrícolas
(`https://www.noticiasagricolas.com.br/cotacoes/cafe/indicador-cepea-esalq-cafe-arabica`).

- Responde a uma requisição comum (200, 0,4 s). O `robots.txt` libera todos os agentes. O site não tem página de termos de
  uso: só a política de privacidade, que não trata de coleta automática, e "© direitos reservados" no rodapé.
- Traz os **10 últimos fechamentos**: cada um num bloco "Fechamento: DD/MM/AAAA", com "Fonte: Cepea/Esalq" e uma tabela
  `cot-fisicas` (Data, Valor R$, Variação). Só o R$: o US$ fica com a planilha.
- **Os 10 (08/10 a 22/10/2026) bateram ao centavo com a planilha.**
- É uma **republicação não oficial**, como o Yahoo (ADRs 0096 e 0129). O dado deixa de vir da IA, então o ADR 0001 não
  precisa de exceção.

**O coletor** `noticias-agricolas-cepea-cafe` (`backend/src/collectors/noticias-agricolas/cepea-cafe-arabica.collector.js`),
na coleta diária:

- Uma requisição por dia à página; lê o título e as tabelas. Sem o título "Indicador Café Arábica - Cepea/Esalq" ou sem
  nenhum fechamento, a coleta falha e acusa em Execuções (o layout mudou), sem gravar nada.
- Grava na **mesma série** da planilha (`CEPEA.CAFE_ARABICA.AVISTA_BRL`), com o `source_code` `NOTICIAS_AGRICOLAS`: os
  fatores leem uma série só, e a próxima planilha confirma o valor (o mesmo é ignorado) ou o corrige (revisão, ADR 0008).
  A origem de cada valor fica na versão.
- **A conferência, antes de gravar:**
  - **sobreposição:** a página precisa trazer ao menos um dia já na série, e todos os dias já na série precisam bater ao
    centavo. Uma divergência descarta a página inteira (a republicação errou ou é outro indicador);
  - **variação:** um dia novo com mais de **8%** contra o dia anterior não é gravado. De 2010 em diante, só 4 de 4.193
    dias reais passaram disso (o maior, 9,73%); nesses, a planilha cobre;
  - data futura ou de fim de semana é inválida.
- `published_at` estimado no fim do dia do pregão em Brasília, a regra da planilha.
- **A 1ª coleta real (dev, 2026-10-23):** os 10 dias já estavam na série e bateram (10 ignorados, 0 falhas). O 22/10 sai
  na própria página na noite do pregão; a coleta da madrugada traz o pregão do dia anterior.
- **A ordem no servidor:** importar a planilha antes, porque a conferência precisa da sobreposição. Sem ela, a coleta
  registra a falha com essa instrução e não grava nada.

### 3. A regra F4 + F5 (próximo passo)

Definida pelo FinMind a partir da hipótese do documento (preço em reais caindo contra o custo de oportunidade, o produtor
segura a oferta), com o critério pré-registrado antes de rodar, testada com o KC em reais e com o Cepea. Até lá, o F4 e o
F5 seguem como informação (ADRs 0136 e 0138).

## Consequências

- O card do Cepea do café segue a coleta diária (fica "atrasado" com 4 dias sem valor novo). A planilha passa a ser a
  confirmação: exportar de tempos em tempos e importar no card.
- O valor em US$ só vem pela planilha; o diário é só o R$. O US$ do Cepea usa o câmbio dele, não a PTAX.
- Se o Notícias Agrícolas mudar o layout, a coleta falha em Execuções até o ajuste do leitor; a planilha cobre o buraco.
- A busca pela IA fica registrada como alternativa (o reconhecimento acima), sem coletor.
- Licença: dado do Cepea (CC BY-NC 4.0), uso interno, como o milho (ADR 0021). As licenças estão adiadas enquanto o uso é
  pessoal.
- Nenhuma migration: as séries vão na `observation`.
- A tela de detalhe de um observável ganhou o botão de importação para os cards com `importacao` no catálogo, sem código
  por card.
