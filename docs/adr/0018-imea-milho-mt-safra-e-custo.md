# 0018 — Milho de Mato Grosso pelo IMEA: área/produção/produtividade por safra e custo de produção

## Contexto

O item 1 da lista "Falta fazer" (`STATUS_DO_PROJETO.md`, §3) pede o IMEA: "oferta e demanda em MT, custos,
intenção de plantio. Boletins mensais XLSX/PDF". Em 2026-09-22 o usuário **autorizou explicitamente** a
implementação a partir do que o reconhecimento abaixo confirmou: exceção pontual prevista em `CLAUDE.md`, mesmo
precedente do dólar (ADR 0001), do Comex Stat (ADR 0013), do WASDE (ADR 0015) e da Conab (ADR 0017).

O IMEA já era candidata nível 0 (`docs/reconhecimento-fontes/README.md`) e o AgroMind tinha um reconhecimento
prévio (nível 1, `AgroMind/docs/reconhecimento-fontes/imea-milho.md`, 2026-07-27) que concluiu: API não documentada,
pública, mas **"só devolve o valor mais recente — profundidade de histórico não confirmada"**. Este ADR retoma esse
reconhecimento com chamadas reais novas e encontra uma segunda rota (o catálogo de arquivos do site) que o
reconhecimento do AgroMind não tinha investigado.

## Evidência (chamadas reais, 2026-09-21/22)

### API de indicadores (área, produção, produtividade)

- **Confirmado o endpoint do AgroMind**, por engenharia reversa do mesmo `config.js` público:
  `GET https://api1.imea.com.br/api/v2/mobile/cadeias/3/cotacoes` (`3` = milho; `config.js` também mapeia
  algodão=1, boi=2, soja=4, leite=7, suíno=8 — outras cadeias do Observatório, fora do escopo). Pública, sem
  autenticação, ~1,4 MB, 5.962 itens na chamada de 2026-09-22.
- **A resposta mistura ~130 indicadores** da cadeia (preço, custo por item, andamento de semeadura/colheita...),
  cada um só com um `IndicadorFinalId` numérico, **sem nome**. Três foram identificados com certeza, casando o
  valor de Mato Grosso com o relatório público "Oferta e Demanda - Milho" de 31/08/2026 (baixado do catálogo, ver
  abaixo) e conferindo as 7 regiões uma a uma:
  - `700940565361721344` = **ÁREA** (ha) — MT 2025/26: 7.434.288,03 ha (relatório: "7,43 milhões de hectares")
  - `701185771642290176` = **PRODUÇÃO** (t) — MT 2025/26: 58.036.957,95 t (relatório: "58,04 milhões de toneladas")
  - `701199398680133632` = **PRODUTIVIDADE** (sc/ha) — MT 2025/26: 130,11 sc/ha (relatório: "130,11 sc/ha")
  - As 7 regiões (Centro-Sul, Médio-Norte, Nordeste, Noroeste, Norte, Oeste, Sudeste) batem exatamente com a tabela
    "ÁREA DE MILHO" / "PRODUÇÃO DE MILHO" do mesmo relatório.
  - Os demais indicadores (unidades `%`, `R$/sc`, `R$/t`, `ha`, `t`, `sc/ha` em outras combinações) **não** foram
    identificados com a mesma certeza e **não são coletados** — registrado como incerteza, não suposição.
- **Cada indicador guarda só a ÚLTIMA versão de cada (safra, localidade)**: filtrando a resposta, cada combinação
  aparece uma única vez, com a `DataPublicacao` da atualização mais recente (só a data, sempre `00:00:00`).
  Confirma o achado do AgroMind: **sem parâmetro de data, sem histórico de revisões nesta rota**. Diferença: o
  AgroMind testou só o indicador de preço spot (`708192508838936581`, 1 registro por localidade, sem safra); os 3
  indicadores usados aqui trazem 4 safras cada um por localidade (2022/23 a 2025/26) — histórico de **safras**, não
  de **revisões** da mesma safra.

### Catálogo de arquivos (`/api/arquivo`) — não investigado pelo AgroMind

- **Rota separada, também pública**: `GET https://api1.imea.com.br/api/arquivo`, descoberta pelo JavaScript de duas
  páginas do site (`view/js/relatoriosmercado.js`, que revelou os parâmetros reais: `cadeia`, `tipo`, `nome`, `page`,
  `pageSize`, `sort` — diferente dos nomes em PascalCase da própria resposta). Lista **todos** os arquivos
  (PDF/XLSX) publicados pelo IMEA desde 2012, com uma URL assinada da S3 (`X-Amz-Expires=432000`, **5 dias**) e a
  data de publicação.
- `TotalCount` em 2026-09-22: **3.318 arquivos**, **781 da cadeia do milho** (`CadeiaId "3"`). Filtrar por
  `nome=Custo de Produção` (com acento) devolve **0 resultados**; `nome=Custo` devolve os 4 esperados — a busca da
  fonte não normaliza acento da forma que se esperava, então o coletor usa `"Custo"` e confere o nome completo
  (sem acento) do lado do FinMind.
- Entre os 781 arquivos do milho: **572 Boletins Semanais** (PDF), **78 "Oferta e Demanda"** (PDF, mensal, de
  2014-04-14 a 2026-08-31 — é o balanço de oferta/demanda que o item 1 pede, com histórico real), 71 "Estimativa de
  Safra" (PDF, parou em 2022-12), 14 "Informe de Semeadura", 13 "Informe de Comercialização", 12 "Informe de
  Colheita", 5 "Boletim Anual" e **4 "Custo de Produção"** (únicos em XLSX; todo o resto é PDF).
- **Os 4 arquivos de custo, baixados e lidos por completo** (`Mensal`/`Ponderado` × `Alta`/`Média` Tecnologia),
  todos publicados em **15/09/2026**, todos `200 OK` sem autenticação:
  - Mesmo layout nos 4: aba `Indice` (uma linha por local: "MT" + ~13 municípios) + uma aba por local
    (`Milho_MT`, `Milho_Mensal_ALTA_sor`...), com cabeçalho `Safra`/`Ano`/`Mês` e uma linha por item de custo (R$/ha),
    terminando em `Unidade: R$/ha.`. `Mensal` só tem colunas de mês da safra corrente; `Ponderado` tem as safras
    `Consolidado` (2021/22 em diante) **e** os meses da safra corrente — os valores do mesmo mês **diferem** entre
    os dois arquivos, e o IMEA não explica a diferença no arquivo.
  - **Lendo os 4 arquivos reais**: 15.402 valores válidos, 5.073 séries, **2 inválidos reais** (não fixture): a aba
    de Tangará da Serra do "Ponderado Média Tecnologia" tem **duas colunas rotuladas "2025/26 Consolidado"** (uma
    deveria ser "2024/25") — ambíguo, as duas ficam de fora, sem inventar qual é qual.
  - **O Índice de 2 dos 4 arquivos lista abas que não existem**: "Nova Mutum" no Mensal Alta, "Querência" e
    "Paranatinga" no Mensal Média — lacuna da própria fonte, tratada como informativa (`locaisSemAba`), não erro.
  - **A grafia da preposição varia** entre o Índice e o título da aba ("Campo Novo do Parecis" vs. "CAMPO NOVO DOS
    PARECIS"): comparados sem preposição, para não barrar uma aba válida.
  - **Duas linhas têm unidade própria**, diferente das demais (R$/ha): "Produtividade Modal (Sc/ha)\*\*" e "Dólar
    compra (R$/US$)" — mantidas na unidade real, não gravadas como R$/ha.
- **O balanço de "Oferta e Demanda"** (estoque, consumo, exportação — o resto do que o item 1 pede) e a **intenção
  de plantio** (o PDF de O&D só narra a área da safra seguinte em texto; "Informe de Semeadura" mede o **andamento**
  do plantio, não a **intenção**) existem **só em PDF**. Uma extração de teste com `pdftotext -layout` no PDF de
  31/08/2026 desalinhou a tabela de balanço (rótulos e valores saem em linhas trocadas) — mesmo problema que já
  descartou PDF como fonte no WASDE (ADR 0015, "Não extraídos, de propósito"). **Não implementado neste ADR.**

## Decisão

- **Dois coletores**, ambos registrados em `collectors/index.js` e rodados pela rotina diária de sempre
  (`npm run collect`, `POST /api/v1/coletas`):
  - `imea-milho-safra` (`collectors/imea/imea-milho-safra.collector.js`): os 3 indicadores identificados
    (área, produção, produtividade), Mato Grosso e as 7 regiões, via a API de cotações.
  - `imea-custo-milho` (`collectors/imea/imea-custo-milho.collector.js`): os 4 arquivos XLSX de custo, via o
    catálogo `/api/arquivo`.
- **Camada point-in-time** (`observation`, ADR 0008), porque o IMEA revisa a estimativa de uma safra ao longo do
  tempo (a API já mostra 4 safras por região) e republica a planilha de custo.
- **`imea-milho-safra`**: `source_code` `IMEA_MILHO_SAFRA`. Séries `IMEA.MILHO.<REGIAO>.<METRICA>` (`METRICA` =
  `AREA`, `PRODUCAO`, `PRODUTIVIDADE`; `REGIAO` = `MATO_GROSSO` + as 7 regiões do IMEA). `observed_at` = 1º de
  setembro do ano de início da safra (convenção, como no WASDE e na Conab). **`published_at` REAL**, mas só a
  **data** (`DataPublicacao`, fim do dia em UTC — ou o instante da coleta, se o fim do dia ainda estiver no futuro,
  para nunca gravar uma data no futuro do relógio). A API só devolve a última versão de cada safra: **sem backfill
  possível nesta rota** (não há parâmetro de data, item 11 do reconhecimento do AgroMind, reconfirmado); o vintage
  de revisões começa a ser construído a partir de agora. Guarda: sem NENHUM dos 3 indicadores conhecidos na
  resposta, a coleta falha (a API trocou os IDs) em vez de "ter sucesso" vazia.
- **`imea-custo-milho`**: um `source_code` por arquivo (`IMEA_CUSTO_MILHO_<MENSAL|PONDERADO>_<ALTA|MEDIA>`), porque
  a reingestão descarta por fonte as edições já lidas e duas planilhas do mesmo dia não podem se descartar uma à
  outra. Séries `IMEA.CUSTO.MILHO.<TIPO>.<PERIODO>.<TECNOLOGIA>_<LOCAL>.<ITEM>` (`PERIODO` = `MES` ou `SAFRA`).
  `observed_at` = 1º do mês (colunas mensais) ou 1º de setembro do ano de início da safra (colunas
  "Consolidado", mesma convenção). **`published_at` REAL, só a data** (a do arquivo no catálogo — o catálogo só
  guarda a versão **atual** de cada planilha: o valor de um mês anterior dentro do arquivo entra com a data de
  publicação do arquivo, não com a data em que o mercado o soube; limite superior conservador, como na Conab). Sem
  histórico de edições anteriores no catálogo: **sem backfill possível**, mesmo limite do coletor de safra.
  `escolherArquivos` pega, de cada (tipo, tecnologia), o arquivo mais **novo** (por `Data`, depois por `Id`, para o
  caso raro de dois arquivos na mesma data).
- **Guardas de leitura** (`imea-custo-milho.parser.js`), aprendidas nos 4 arquivos reais: confere o título da aba
  (tecnologia, "Mensal"/"Ponderado" e local, ignorando a preposição), a linha `Unidade: R$/ha.` no fim de cada
  aba (barra se a fonte mudar a unidade), colunas de período repetidas (ambíguas — nenhuma é gravada) e um rótulo
  com unidade entre parênteses que não é uma das duas linhas conhecidas (vira inválido, não R$/ha por suposição).
  Célula `"-"` ou vazia é ausência (não vira zero); zero numérico publicado é mantido.
- **Não extraído, de propósito**: os demais ~127 indicadores sem nome da API de cotações; a coluna "Var. Mensal"
  das planilhas de custo (derivada); o balanço de oferta e demanda, a intenção de plantio, o andamento de
  semeadura/colheita/comercialização e as estimativas de safra — todos só em PDF; o preço spot do milho (já
  reconhecido, não implementado); as demais cadeias da mesma API (soja, boi, algodão, leite, suíno).
- **Catálogo (Observáveis)**: 4 cards novos.
  - **"Milho de MT por safra e região (IMEA)"**: seletor de região (Mato Grosso + 7 regiões, `porRegiao`) e de
    métrica (área, produção, produtividade); destaque e padrão = Mato Grosso.
  - **"Custo do milho - mensal (IMEA)"**, **"... ponderado, por mês (IMEA)"** e **"... ponderado, por safra
    (IMEA)"**: cada um com o mesmo desenho — seletor de "região" (na verdade `<tecnologia>_<local>`, para comparar
    alta e média tecnologia no mesmo gráfico) e de métrica (os ~62 itens de custo da planilha, tabela
    `imea-custo-itens.js`); destaque e padrão = Mato Grosso em alta e em média tecnologia. Frequência `MENSAL` nos
    dois primeiros, `ANUAL` no terceiro (a dimensão temporal muda; a tela decide o período inicial do gráfico por
    isso, `periodo-grafico.js`).
  - A dimensão "região" do serviço (`observation-data.service.js::DIMENSOES_REGIAO`) ganhou dois descritores novos
    (`imea`, `imea-custo`), no mesmo padrão de `wasde`/`conab`.

## Dois achados reais na validação contra o banco de dev (2026-09-22), corrigidos antes de fechar

A implementação só ficou correta depois de rodar contra o banco de verdade (não só os testes com fixture) — os dois
problemas abaixo não apareciam em nenhum teste unitário porque dependiam do schema real e de valores reais da fonte:

1. **`observation.series_code` era `VARCHAR(60)`** (suficiente para o WASDE, até 47 chars, e a Conab, até 45). A
   convenção `IMEA.CUSTO.MILHO.<TIPO>.<PERIODO>.<TECNOLOGIA>_<LOCAL>.<ITEM>` chega a **91 chars** no pior caso
   (`IMEA.CUSTO.MILHO.PONDERADO.SAFRA.MEDIA_CAMPO_NOVO_DO_PARECIS.CLASSIFICACAO_E_BENEFICIAMENTO`). Sem dar erro: o
   `INSERT IGNORE` do repository (rede de segurança contra a chave única) tratava a truncagem em 60 chars como uma
   colisão de chave única e **descartava a linha inteira em silêncio** — na 1ª coleta real, 10.364 das 15.402
   observações de custo simplesmente não foram gravadas, sem nenhum erro visível além de um `records_failed` genérico.
   **Corrigido** alargando a coluna para 120 chars (`database/migrations/20260922100000-widen-observation-series-code.js`
   + `src/models/observation.js`) — dá margem para fontes futuras sem reabrir esta migration de novo.
2. **Valor com mais de 6 casas decimais.** As planilhas de custo do IMEA guardam o float bruto do cálculo do Excel
   (ex.: `27.8871875`), mas a coluna `value` é `DECIMAL(18,6)` e o `mesmoValor()` do `point-in-time.service.js`
   compara com `Number(x).toFixed(6)`. O arredondamento de ponto flutuante do JavaScript e o arredondamento decimal
   do MariaDB **discordam no 6º dígito** para esses casos (`Number(27.8871875).toFixed(6)` dá `"27.887187"`; o banco,
   ao gravar o mesmo float bruto, grava `"27.887188"`) — sem corrigir, cada nova coleta liam o mesmo valor como
   "revisão" (um valor levemente diferente do anterior), toda vez, sem o IMEA ter revisado nada de verdade.
   **Corrigido** arredondando a 6 casas no parser (`imea-custo-milho.parser.js`, mesmo critério do `mesmoValor()`)
   antes de entregar o valor ao point-in-time — idempotente por construção, com teste cobrindo o caso exato.

## Resultado (banco de dev, 2026-09-22, depois das duas correções acima)

| Coletor | Resultado |
|---|---|
| `imea-milho-safra` | 1 chamada (~1,4 MB, 5.962 itens brutos), **96 observações válidas, 0 inválidas** (8 regiões × 3 métricas × 4 safras), **96 criadas, 0 falhas**. Mato Grosso 2025/26: 7.434.288,03 ha / 58.036.957,95 t / 130,11 sc/ha — confere com o relatório de 31/08/2026 |
| `imea-custo-milho` | 4 arquivos baixados (catálogo + 4 XLSX, com 1 s de pausa entre eles), **15.402 observações válidas, 2 inválidas** (a ambiguidade real de Tangará da Serra, ver acima), **15.402 criadas, 0 falhas de persistência** |
| Reexecução (idempotência) | Mesmo comando repetido: `imea-milho-safra` 0 criadas / 96 ignoradas / 0 falhas; `imea-custo-milho` 0 criadas / 0 atualizadas / 15.402 ignoradas / 2 falhas (as mesmas 2, sempre) — **nenhuma revisão espúria** (confirma a correção do arredondamento) |

Testes automatizados novos (backend, `node --test`): **68 casos**, todos passando — `imea-comum` (5),
`imea-milho-safra.parser` (9), `imea-milho-safra.collector` (8), `imea-custo-milho.parser` (24, contra os defeitos
reais encontrados: colunas ambíguas, aba ausente do Índice, preposição variável, título trocado, unidade mudada,
item repetido, valor não numérico, arredondamento), `imea-custo-milho.collector` (16) e 6 casos novos em
`observaveis.service.test.js` (escopo, seletor de região/local, unidades próprias). Lint e a suíte inteira do
backend (427 testes) seguem verdes.

## Consequências e riscos

- **Sem vintage histórico em nenhum dos dois coletores.** A API de safra e o catálogo de custo só guardam o estado
  atual; o vintage (o que o IMEA sabia em cada mês) só existe nos PDFs (Oferta e Demanda, mensal, desde 2014;
  planilhas de custo antigas não ficam disponíveis). Diferente do WASDE e da Conab, aqui **não há backfill a
  rodar** — as duas tabelas abaixo só passam a crescer a partir da 1ª coleta diária real.
- **IDs de indicador sem nome, identificados por casamento de valor.** Um risco aceito e já registrado (mesma
  prática usada na ABCS pelo AgroMind): se o IMEA um dia recalcular a série de um jeito que altere o valor
  histórico, a identificação não seria re-confirmada automaticamente. Mitigado pela guarda de unidade (barra se a
  unidade do indicador mudar) e pelo teste que fixa os 3 IDs.
- **PDF (oferta e demanda, intenção de plantio, andamento de safra) permanece de fora**, mesmo tendo histórico real
  desde 2014 — é a maior lacuna frente ao pedido original do item 1. Reabrir exigiria um leitor de PDF por
  coordenadas (não avaliado) ou aceitar uma extração menos confiável que a de planilha/JSON.
- **Sem API nem dicionário de dados em nenhuma das duas rotas** (mesmo risco do WASDE/Conab): uma mudança de layout
  quebra o coletor com falha clara, não grava errado.
- **Licença não investigada** (Termos de Uso do site não lidos) — mesma ressalva já registrada para a ABCS/IMEA no
  reconhecimento do AgroMind; uso atual é interno, sem redistribuição.
- **A URL de download expira em 5 dias** (S3 assinada): listar e baixar precisam acontecer na mesma execução —
  já é como o coletor foi escrito (`download` faz as duas coisas).
- **Não confirmado:** limite de requisições da API (poucas chamadas feitas nesta investigação), se o
  `portal.imea.com.br` (mencionado pela própria página, autenticado) tem histórico mais profundo, e o significado
  exato da diferença entre "Mensal" e "Ponderado" no custo (o IMEA não documenta; os dois são gravados como séries
  distintas, sem tentar reconciliar).
- **Migration de schema:** a coluna `observation.series_code` foi alargada de 60 para 120 chars (ver achado acima).
  O `deploy.yml` já roda `npm run db:migrate` automaticamente após subir os containers (passo 4/6); em qualquer
  outro ambiente que ainda não tenha essa migration, rodá-la ANTES da 1ª coleta do IMEA é obrigatório — do
  contrário o sintoma se repete (séries longas descartadas em silêncio pelo `INSERT IGNORE`, sem erro visível além
  de um `records_failed` sem detalhe claro na mensagem).
