# 0020 — B3: histórico do CCM por vencimento a partir do Boletim Diário (BDI) em PDF

## Contexto

O coletor `b3-ccm-futuro` (ADR 0009) lê o arquivo público `TradeInformationConsolidatedFile` do
Up2Data, que só existe numa **janela rolante de ~15 meses**: o FinMind tinha o CCM de 2025-06-10 em
diante (20.618 linhas em 2026-09-23), sem contratos em aberto. A pesquisa de 2026-09-23 (conversa com
o usuário) encontrou um segundo caminho público da própria B3: o **Boletim Diário de Informações
(BDI)**, cujo capítulo de derivativos em PDF traz, por vencimento do CCM, contratos em aberto, preços
(abertura, mínimo, máximo, médio, último, ajuste), negócios, contratos e volume.

Em 2026-09-23 o usuário **autorizou explicitamente** usar o BDI para ampliar o histórico do CCM, como
backfill complementar ao coletor atual, sem estrutura de dados nova e sem mexer em CME/ZC (mesmo
padrão de exceção pontual dos ADRs 0001, 0013, 0015, 0017, 0018 e 0019). Não é fonte nova de ativo:
é o mesmo instrumento (CCM) e a mesma bolsa (B3) do ADR 0009.

## Evidência (chamadas reais, 2026-09-23)

### Onde está o arquivo e até onde ele vai

- App público `https://arquivos.b3.com.br/bdi/` (sem chave, sem captcha). O `config.js` do app declara
  `minDate: "2022-01-01"`.
- `GET /bdi/download/status?dateRef=AAAA-MM-DD` diz se há boletim na data (`statusName`
  "Publicado"/"Republicado", `lastUpdateDate`). Varredura dos **1.191 dias úteis** de 2022-03-01 a
  2026-09-22: 0 erros HTTP; **1.132 com boletim**; os **59 sem boletim são todos feriados da B3**
  (Carnaval, Sexta-feira Santa, Corpus Christi, 20/11, Natal, 31/12...). Nenhum pregão falta.
- `GET /bdi/download/bdi/AAAA-MM-DD/BDI_03-1_AAAAMMDD.pdf` = capítulo de derivativos (~500 KB, ~60
  páginas). A B3 responde **500** também para arquivo inexistente: por isso o coletor só pede o PDF
  quando o status diz que o boletim existe.
- **Primeira data:** 2022-03-01 é uma edição isolada, sem capítulo de derivativos; a série contínua
  começa em **2022-03-21**, e é o 1º boletim com a tabela do CCM.
- **Última data com a tabela: 2025-12-11.** Desde 2025-12-12 o capítulo virou um resumo de 2 páginas,
  sem vencimentos (a B3 migrou os dados para tabelas do app; comunicado no próprio `config.js`). A
  tabela estruturada que substituiu o PDF (`POST /bdi/table/ConsolidatedTradesDerivatives/...`) **não
  tem contratos em aberto** e só responde para datas recentes (vazia em 2025-06-02, 2023-01-16).
- **Lacunas reais dentro do período:** há boletins publicados SEM o capítulo de derivativos (ex.:
  2023-07-03 a 2023-07-07: o `BDI_03-1` tem 1 página; o boletim completo `BDI_00` de 2023-07-03 tem 85
  páginas e nenhuma tabela de derivativos; `BDI_03-2/-3/-4`, `BDI_01/02/04` de 2023-07-05 também não).
  Não há outra rota pública conhecida para esses dias. Relação completa na seção "Resultado".

### A tabela e o que foi achado nela

Extração por **coordenada** (`pdfjs-dist`, `shared/utils/pdf-texto.js`, a mesma do IMEA, ADR 0019).
Cada vencimento é uma linha com **13 valores sempre na mesma ordem**, "-" na célula vazia: contratos
em aberto, negócios, contratos, volume, abertura, mínimo, máximo, médio, último, ajuste, variação em
pontos, última oferta de compra, de venda. Achados que o parser trata:

- **O formato numérico alterna de um boletim para outro, não por ano**: padrão americano (`9,677` e
  `87.04`) ou brasileiro (`10.653` e `65,26`) — ex.: 2022-10-03 brasileiro, 2023-01-16 americano,
  2025-06-13 brasileiro, 2025-09-15 americano; numa mesma semana de jan/2023, 4 num e 1 no outro. O
  formato é detectado **por boletim**, pela coluna de ajuste, e cada número é validado pela regra
  estrita daquele formato: "1,020" nunca vira 1,02 — ou casa, ou é inválido.
- **Duas células coladas num item só** ("3,512 145,828,089" = contratos + volume): os itens são
  quebrados por espaço antes de contar os 13 valores.
- A mesma página tem outras tabelas do CCM (opções) com o mesmo título: só a que vem depois de
  "Mercado Futuro" é lida. A tabela pode continuar na página seguinte (cabeçalho repetido é pulado).

Travas contra leitura na ordem errada: contagem exata de 13 valores; cabeçalho com as palavras
esperadas; mínimo <= abertura/médio/último <= máximo; ajuste obrigatório; data do rodapé ("REFERENTE A
... 16 DE JANEIRO DE 2023") igual à data pedida.

### Conferência com o CSV do Up2Data

Nas datas em que as duas fontes existem, preço, contratos e negócios **batem exatamente** (à mão em
2025-06-13 e 2025-09-15; no backfill completo, 0 divergências — ver "Resultado"). A única diferença:
**o BDI arredonda o volume financeiro para inteiro** (218.878.358 x 218.878.357,50).

## Decisão

- **Coletor `b3-ccm-bdi`** (`collectors/b3/b3-ccm-bdi.collector.js` + `b3-bdi-ccm.parser.js`), **só
  backfill**: não é registrado na coleta diária (o layout com a tabela acabou em 2025-12-11, não há
  dado novo). Script `npm run backfill:b3-ccm-bdi` (`--desde=`, `--ate=`, limitados ao período com
  tabela), com o runner e o log de execução de sempre (`collection_execution`).
- **Mesmas séries, sem estrutura nova:** `B3.CCM.<TICKER>.<CAMPO>` em `observation`, `source_code`
  `B3`, os mesmos campos do CSV (`SETTLE`, `LAST`, `HIGH`, `LOW`, `AVG`, `TRADES`, `CONTRACTS`,
  `VOLUME_BRL`) e dois novos: **`OPEN`** (abertura) e **`OPEN_INTEREST`** (contratos em aberto). Cada
  vencimento continua separado (sem série contínua). `OSCN_PCT` não existe no BDI (a "variação em
  pontos" é derivada do ajuste, seria um fator) e as ofertas de compra/venda não são coletadas.
- **Complementar, nunca concorrente:** um par (série, pregão) que já existe não é regravado — o que
  veio do CSV fica. Sem isso, o volume arredondado do BDI viraria uma "revisão" falsa no serviço
  point-in-time. A divergência entre as duas fontes é **medida e logada** (tolerância de 0,5 só no
  volume), nunca gravada. Reexecutar não grava nada (idempotente, testado).
- **`published_at`: a mesma regra do CSV** (fim do dia do pregão em Brasília, estimado), para a série
  não ter duas regras de publicação conforme o período. O `lastUpdateDate` do BDI **não** serve: é a
  hora da ÚLTIMA (re)publicação — pregões de fev/2025 foram republicados em 2025-03-26, até 42 dias
  depois; usá-lo faria um ajuste conhecido no próprio pregão parecer publicado semanas depois. Ele
  fica em `metadata.bdiAtualizadoEm`, com `bdiStatus`, `arquivo`, `url`, `formatoNumerico` e
  `campoFonte` (rastreabilidade); `collected_at` e `collection_execution_id` como em todo coletor.
- **Cards:** `CCM_PRECOS` ganha "Preço de abertura" e `CCM_LIQUIDEZ` ganha "Contratos em aberto";
  a metodologia do card explica as duas fontes e os períodos.
- `lerPdf` saiu do parser do IMEA para `shared/utils/pdf-texto.js` (agora são dois leitores de PDF).

## Resultado (backfill completo em dev, 2026-09-23)

Intervalo pedido: 2022-03-01 a 2025-12-11 = **988 dias úteis**, 50 deles feriados (sem boletim).

| | |
|---|---|
| Boletins com a tabela lida | **745** (306 em padrão americano, 439 em brasileiro), de **2022-03-21 a 2025-12-11** |
| Boletins publicados sem a tabela (lacuna da fonte) | **193** (lista abaixo) |
| Erros / linhas inválidas | **0** |
| Observações novas | **42.303**, em 31 vencimentos (CCMK22 a CCMX26), todas `revision_seq` 0 |
| Conferência com o que já estava gravado | 1ª rodada: **7.601 valores** (o CSV de 2025-06-10 a 2025-12-11, mais as janelas de teste), **0 divergências** (volume dentro da tolerância de arredondamento). 2ª rodada: 47.982 valores (inclui o que a 1ª gravou), 0 divergências |
| Pares (série, pregão) duplicados | **0** |
| CCM no banco depois (dev) | **62.921 linhas** (antes 20.618), 938 pregões, de 2022-03-21 a 2026-09-22 |

Por campo, depois do backfill: `SETTLE` 7.920 · `LAST`/`HIGH`/`LOW`/`AVG`/`TRADES`/`CONTRACTS`/
`VOLUME_BRL` 6.083 cada · `OPEN_INTEREST` 5.449 e `OPEN` 4.760 (ambos de 2022-03-21 a 2025-12-11) ·
`OSCN_PCT` 2.211 (só CSV, desde 2025-06-10).

**Lacunas da fonte (193 boletins publicados sem a tabela):** 2022-03-01 · 2023-02-03 a 02-16 ·
2023-02-22 a 03-23 · **2023-04-03 a 07-07** · **2023-07-21 a 11-30** · 2024-12-24 · 2024-12-31 ·
2025-02-03 · 2025-02-11 · 2025-09-08 (dias úteis dentro de cada faixa; algumas datas isoladas entre
as faixas de 2023 têm a tabela). Conferido baixando amostras de todas as faixas: o capítulo tem ~70-90
KB (1-2 páginas: só a legenda dos códigos de vencimento), contra ~500 KB de um boletim completo, e o
texto não menciona CCM nem milho. **O CCM tem, portanto, um buraco de ~9 meses em 2023** (fev a nov,
com poucos dias lidos) que nenhuma rota pública conhecida cobre.

**Achado ao rodar (corrigido antes deste registro):** a 1ª rodada completa leu só 713 boletins e deu 4
erros de cabeçalho. Duas causas no parser, ambas reproduzidas nos PDFs reais e cobertas por teste: (a)
o título "CCM: Milho..." no pé de uma página, com "Mercado Futuro" no topo da seguinte — o rodapé entre
os dois fazia o parser desistir da tabela (ex.: 2024-03-11, 2022-05-23); (b) cabeçalho quebrado como
"Contratos em" / "Aberto" (ex.: 2024-08-15). A 2ª rodada (idempotente) completou os 32 boletins que
faltavam, sem tocar no que já estava gravado.

Tempo: ~15 min por rodada completa em dev; pico de memória do processo ~360 MB (o resultado de
todos os boletins fica em memória até a gravação). Em VM pequena, rodar por ano (`--desde`/`--ate`).

## Consequências e riscos

- **Não chega a 10 anos.** O CCM passa a começar em 2022-03-21 (~4,5 anos), **com um buraco de ~9
  meses em 2023** (seção "Resultado"). Antes de 2022 continua valendo o ADR 0009 (histórico pago da
  B3 / provedor comercial).
- **Contratos em aberto só até 2025-12-11**: depois disso nem o BDI em PDF nem a tabela estruturada
  do app trazem o dado por vencimento (a B3 anunciou um "Quadro analítico das posições em aberto" a
  partir de 2026-06-30, ainda não investigado). Para o período recente, o open interest agregado do
  milho continua vindo do CFTC (ZC, não CCM).
- **`published_at` do open interest é um pouco otimista**: a B3 consolida as posições depois do
  pregão; o "fim do dia" pode estar horas adiantado em relação à divulgação real. Mesma regra do resto
  da série, registrada aqui para quem montar backtest com o dado.
- **Extração de PDF é frágil por natureza.** Mitigada pelas travas acima e pela conferência com o CSV
  no período sobreposto; um layout diferente vira inválido explícito, nunca dado gravado errado.
- **Mais dados, tela mais lenta (achado real em produção, corrigido):** com o triplo de linhas do CCM, o
  resumo de cobertura dos cards (`resumirSeries`) passou a ler cada linha na tabela, por causa de duas colunas
  fora de índice. Em dev: ~1,1 s por detalhe do card; na VM, disputando CPU com o backfill, ~20 s e requisições
  abortadas. Migration `20260923100000-add-observation-covering-index` (índice de cobertura
  `series_code, source_code, observed_at, published_at_is_estimated`): resumo de ~800 ms para ~37 ms, detalhe
  do card para ~250 ms.
- **Arquivo sem documentação oficial nem licença lida** (mesma situação do CSV, ADR 0009). Uso
  interno.
