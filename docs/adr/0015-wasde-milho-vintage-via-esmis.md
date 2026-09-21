# 0015 — Balanço do milho pelo WASDE (USDA/ESMIS): vintage real, a partir de 2011

## Contexto

O ADR 0014 reconheceu a PSD (USDA FAS) e achou o limite que importa: **a API só devolve a edição mais recente**
de cada dado, sem histórico de revisões. Para um backtest sem viés de antecipação (ADR 0008) isso não basta: o
balanço do milho é revisado todo mês, e o que vale para uma data passada é o que estava publicado *naquele dia*.

O **ESMIS** (`esmis.nal.usda.gov`, antes na Cornell) guarda **cada edição mensal do WASDE**, cada uma uma "foto"
datada, em PDF, TXT, XLS e XML. Em 2026-09-21 o usuário **autorizou explicitamente** a implementação a partir das
planilhas XLS de 2011 em diante ("se precisar de mais vintage a gente reve isso"): exceção pontual prevista em
`CLAUDE.md`, mesmo precedente do dólar (ADR 0001) e do Comex Stat (ADR 0013). **A PSD continua sem coletor**: este
ADR não a desbloqueia. Nenhuma regra, limiar ou sinal é derivado do dado; só o que o USDA publica, como publica.

## Evidência (chamadas reais, 2026-09-21)

- **Listagem em HTML, sem API confirmada.** `GET /concern/publications/3t945q76s?page=N` traz 10 edições por
  página, da mais nova para a mais antiga, cada uma com a **data exata do release** (`<time datetime>`), o link da
  edição (`/publication/world-agricultural-supply-and-demand-estimates/<slug>`) e os arquivos. A página
  `/api-documentation` só carrega com JavaScript: não foi lida. O `fetch` do Node alcança o site; o `curl` local
  falhou por certificado (`self signed certificate in certificate chain`, problema da rede local; a verificação
  não foi desligada).
- **190 edições desde 2011-01-12; 189 têm XLS.** A exceção é uma edição especial de 2014-01-23 (só PDF). Duas URLs
  de arquivo coexistem: `release-files/796054/wasde0926.xls` (recentes) e
  `release-files/3t945q76s/pv63h524n/j9603704v/wasde0622.xls` (antigas).
- **O XLS é idêntico, byte a byte, ao baixado pelo navegador** (mesmo hash).
- **Layout estável de 2011 a 2026.** Os 189 XLS passaram pelo leitor: sempre as mesmas 39 séries dos EUA e 19–20
  regiões no mundo, cabeçalho ("January 2011", "WASDE - 490") sempre igual ao mês do release, **0 itens inválidos**.
  O número da edição vai de 490 a 675.
- **Republicação no mesmo dia.** O slug `2026-05-12-0` é `wasde0526v2.xls` (versão 2 do WASDE de maio/2026), e
  2019-11-08 aparece 3 vezes (mesma edição 594, arquivo `latest.xls`). Na edição nº 584 há duas datas
  (2018-12-11 e 2018-12-14).
- **Meses sem edição no ESMIS (2011-01 a 2026-09): 2013-10, 2019-01 e 2025-10.** O coletor não precisa "completar"
  nada: `asOf()` nesses meses devolve a edição anterior, que era de fato a última publicada. A coincidência com
  paralisações do governo dos EUA (out/2013, dez/2018–jan/2019, out/2025) é leitura nossa; o ESMIS não explica.
- **Meses com mais de uma edição:** 2014-01 (10/jan e uma edição especial de 23/jan, só PDF), 2018-12 (11 e 14/dez,
  ambas nº 584) e 2019-11 (3 entradas de 08/nov, mesma edição 594).
- **O nome do arquivo não segue padrão e não é usado**: o coletor só usa a data da listagem. Padrões vistos:
  `wasde-MM-DD-AAAA.xls` (2011–2018), `ORIGwasde-...` (jul e ago/2013), `WASDE-582-October-11-2018.xls`,
  **`latest.xls` (nov/2018 a jul/2021)**, `wasdeMMAA.xls` e `wasdeMMAAv2.xls` (**v2 em dez/2024, abr/2025, mai/2025,
  mai/2026 e jun/2026**: 5 correções em ~2 anos). Em todos, o mês do cabeçalho da planilha confere com a data.
- **Defeitos reais das planilhas, achados na validação em massa** (todos tratados no leitor, com teste):
  - `"NA"` na 1ª projeção de uma safra (a coluna do mês anterior) → ausência, não dado;
  - linha `"filler"` (preenchimento) na edição de jan/2015;
  - número com asterisco de nota (`"95.3 *"`, área "conforme o Prospective Plantings") → o valor vale;
  - preço médio ao produtor em **faixa** (`"4.80 - 5.60"`) → não extraído;
  - **título "Selected Other" com um `0` solto** na coluna de estoque final, em 137 das 189 edições: sem o
    tratamento viraria um zero falso numa "região" inexistente.

## Decisão

- **Coletor** `wasde-milho` (`collectors/wasde/`), sempre registrado (não exige chave). Lê o **XLS**; o TXT/PDF de
  antes de 2011 não é lido (outro leitor, fora do escopo). O leitor acha tudo pelo **texto** (título da aba, rótulo
  "CORN", cabeçalho "Beginning Stocks … Ending Stocks", ano `2024/25 Est.`), nunca por número de página ou coluna.
- **Séries** em `observation` (ADR 0008), valores **como publicados, sem conversão de unidade**:
  - `WASDE.MILHO.EUA.<ATRIBUTO>`: área plantada e colhida (M acres), produtividade (bu/acre), estoque inicial e
    final, produção, importação, oferta total, ração e resíduo, alimentação/sementes/indústria, consumo interno,
    exportação, uso total (M bu).
  - `WASDE.MILHO.MUNDO.<REGIAO>.<ATRIBUTO>`: estoque inicial e final, produção, importação, consumo para ração,
    consumo interno e exportação (Mt), para cada linha da tabela (mundo, mundo sem China, EUA, Brasil, Argentina,
    Ucrânia, China, UE...). A região é o rótulo da fonte normalizado: **rótulos que mudaram ao longo dos anos
    (`EU_27`, `EU_27_UK`, `EUROPEAN_UNION`, `FSU_12`) são séries distintas, não emendadas** (não inventamos a ponte).
  - **Não extraídos, de propósito:** preço ao produtor (projeção em faixa), etanol (a definição mudou: "Ethanol for
    Fuel" × "Ethanol & by-products"), CCC/estoques livres/empréstimos (só nas edições antigas) e o bloco "Feed Grains".
- **`observed_at`** = 1º de setembro do ano de início da safra (2024/25 → 2024-09-01). É **convenção**: o WASDE agrega
  "anos comerciais locais". A safra e a situação (`final` / `est` / `proj`) ficam em `metadata`.
- **`published_at` REAL** = fim do dia UTC da data do release (vem da listagem). O horário não: o WASDE sai ao
  meio-dia de Nova York, então o fim do dia é conservador (nunca antecipa o que se sabia). `published_at_is_estimated
  = false`, base `source`. Cada edição grava só a **coluna corrente** (a de mês anterior da safra em projeção repete
  a edição anterior).
- **Vintage:** o serviço point-in-time grava uma linha nova só quando o valor **muda** entre edições (mesmo valor =
  ignorado). As edições entram em ordem cronológica.
- **Reingestão idempotente:** o `persist` descarta as edições cujo `published_at` já existe para a fonte (ver
  "Resultado"). Uma lacuna que ficou para trás (edição antiga não gravada) segue para o serviço e, se seu valor
  difere do atual, é reportada como falha: o modelo append-only não insere versão no meio da sequência.
- **Mesma data, mais de uma edição:** vale a **última** (sufixo maior do slug: a republicação corrigida). A anterior,
  publicada horas antes, não é representável (o modelo não guarda duas versões no mesmo `published_at`) e fica só
  no site. **Se a v1 já foi ingerida, uma v2 do mesmo dia publicada depois é ignorada** (a edição já consta como
  ingerida); corrigir isso exigiria atualizar uma linha, o que o append-only proíbe. Datas diferentes (2018-12-11 e 2018-12-14) são duas edições e geram revisão normal.
- **Coleta diária:** as **3 últimas** edições (pega a nova e uma correção republicada de uma recente): 3 downloads de
  ~340 KB. **Backfill** `npm run backfill:wasde-milho` (`--anoInicial`, `--anoFinal`; recusa antes de 2011), em
  blocos de 5 anos, uma execução por bloco. Pausa de 1 s entre requisições (a política de uso do ESMIS não foi
  confirmada).
- **Guardas:** o arquivo baixado precisa ter assinatura de XLS (OLE) e ≥ 50 KB (barra uma página de erro salva
  como `.xls`); o mês do cabeçalho da planilha tem de ser o mês do release (barra um arquivo trocado).
- **Dependência:** `xlsx` (SheetJS) **0.20.3, do CDN oficial da SheetJS** (`cdn.sheetjs.com`), não do npm: a versão do
  npm parou na 0.18.5, que tem vulnerabilidades conhecidas (prototype pollution e ReDoS ao ler arquivo malicioso).
  O `package-lock.json` fixa a URL e o hash de integridade. O `npm audit` continua com 2 avisos moderados, ambos do
  `uuid` dentro do `sequelize` (anteriores a esta entrega).
- **Git:** as planilhas **não** são versionadas (`docs/Docs_Base/` no `.gitignore`). O servidor **não precisa delas**:
  o coletor baixa direto do ESMIS, e os testes usam fixtures em código; os 2 testes contra planilhas reais só
  rodam se a pasta local existir.
- **Tela:** 4 cards nos Observáveis (estoque final e produção, EUA e mundo), frequência **Anual (por safra)**.

## Resultado (banco de dev, 2026-09-21)

Backfill de 2011 a 2026 em 4 blocos (um por execução), ~9 minutos: **188 edições lidas** (187 com XLS, depois de
juntar as 3 entradas de 2019-11-08 numa só, mais a edição especial de 2014-01-23, sem planilha), **27.309
linhas em 167 séries**, sendo 2.767 primeiras versões e **24.542 revisões**; 52.518 valores iguais aos da edição
anterior foram ignorados; **0 estimadas** (todos os `published_at` são reais, de 2011-01-12 a 2026-09-11). O bloco
2011–2015 ficou `partial_success` com 1 falha: é a edição especial de 2014-01-23, que não tem XLS (esperado e
permanente). Os outros 3 blocos, `success`. O resultado do banco bate exatamente com a simulação em memória feita
antes (mesmas 27.309 linhas).

O vintage aparece de ponta a ponta. Estoque final dos EUA, safra 2024/25 (milhões de bushels), por edição: 2.102
(mai/2024, 1ª projeção) → 2.057 (set/2024) → 1.738 (dez/2024) → 1.465 (abr/2025) → 1.415 (mai/2025) → 1.305
(ago/2025) → 1.532 (nov/2025) → **1.551** (jan/2026, final, igual à PSD). Safra 2010/11: 745 (jan/2011) → 675 → 730
→ 880 → 940 → 920 → **1.128** (out/2011). Os 4 cards dos Observáveis mostram 19 safras (2008 a 2026) e 256 versões.

**Achado depois do 1º backfill (corrigido):** a primeira coleta diária real deu 380 falhas. O serviço point-in-time só
compara cada valor com a **última** versão gravada; reler as edições de jul e ago (a coleta diária relê as 3 últimas)
contra a versão de set já gravada era lido como "valor diferente com `published_at` anterior". Nenhum dado errado
foi gravado, mas a coleta ficaria sempre em `partial_success` e o backfill não seria idempotente. O `persist` do
coletor agora **descarta as edições já ingeridas** (o mesmo instante de publicação já existe para a fonte) antes de
chamar o serviço. Depois da correção: coleta diária `success` (3 edições lidas, 1.314 ignoradas, **0 falhas**) e o
bloco 2026 do backfill repetido também (3.942 ignoradas, 0 criadas, 0 falhas), com as 27.309 linhas intactas.

## Consequências e riscos

- **Raspagem de HTML.** Sem API confirmada, o coletor depende da estrutura da listagem do ESMIS
  (`<time datetime>`, links `/publication/...` e `release-files`). Uma mudança do site quebra a listagem: o coletor
  falha (a execução vira `failed`, sem gravar nada) em vez de gravar errado. Confirmar a API do ESMIS é a saída.
- **Vintage só a partir de 2011**, e só para o que o WASDE publica (EUA, ~20 regiões). Os demais países da PSD e o
  período anterior seguem sem vintage.
- **Republicação corrigida perde a versão anterior do mesmo dia** (ver acima). Uma correção **em outra data** vira
  revisão normal.
- **Mudança de `situacao` sem mudança de valor não é registrada** (a estimativa vira "final" sem o número mudar): o
  valor ignorado mantém o metadado da 1ª versão.
- **Unidades diferentes da PSD** (EUA em milhões de bushels; a PSD e o WASDE-mundo em mil t / Mt). Nenhuma conversão
  é feita; quem cruzar as duas fontes declara o fator.
- **Não confirmados:** a licença de uso dos dados (governo dos EUA; termos do ESMIS não lidos, uso interno), o limite
  de requisições do ESMIS (backfill ~190 downloads a 1 por segundo, sem problemas) e o XML/CSV consolidado de 2010–2025.
- **Produção: o backfill vem ANTES da coleta diária.** A diária lê só as 3 últimas edições; se gravasse primeiro,
  o backfill não conseguiria inserir as edições antigas das mesmas safras (append-only não insere no meio da
  sequência) e o vintage delas ficaria truncado. Por isso a coleta diária **se recusa a gravar enquanto a fonte
  estiver vazia**: registra uma falha com a instrução "rode `npm run backfill:wasde-milho`" e não grava nada. O
  script de backfill usa `persistirBackfill`, sem essa trava. Depois do deploy: rodar o backfill na VM (~5 min) e
  conferir por consulta ao banco. Nenhuma variável de ambiente nova.
