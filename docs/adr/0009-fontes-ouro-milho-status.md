# 0009 — Fontes de ouro e milho: o que foi coletado de fato e o que não

## Contexto

O relatório FEL 1 cataloga as fontes **sem tê-las testado** (declarado na p. 9). Esta
ADR registra o que a implementação de 2026-09-20 confirmou por chamada real. Regra
do projeto: fonte só entra com evidência (`CLAUDE.md`, "Convenções para novos
coletores"). Modelo de dados: ADR 0008.

## Resultado por fonte

| Fonte | Série(s) `observation` | Acesso | Histórico | `published_at` | Status |
|---|---|---|---|---|---|
| FRED (API REST com chave; CSV público como reserva — ADR 0012) | `FRED.DGS10`, `FRED.T10YIE`, `FRED.DFII10`, `FRED.DTWEXBGS` | `api.stlouisfed.org/fred/series/observations` (reserva: `fredgraph.csv?id=`) | DGS10 desde 1962; DFII10/T10YIE 2003; DTWEXBGS 2006 | **estimado** (1 dia útil; DTWEXBGS = próxima segunda, divulgada semanalmente) | **Coletado e validado** |
| LBMA Gold PM | `LBMA.GOLD_PM.USD` | feed JSON `prices.lbma.org.uk/json/gold_pm.json` | 1968-04-01 → hoje (14.686) | **estimado** (15:00 Londres) | **Coletado**; licença: ver ressalva |
| CFTC COT (Disaggregated Futures Only) | `CFTC.GOLD.*` e `CFTC.CORN.*` × {`OPEN_INTEREST`,`MM_LONG`,`MM_SHORT`} | Socrata `publicreporting.cftc.gov/resource/72hh-3qpy` (sem chave) | 2006-06-13 → hoje (1.058 semanas/contrato) | **real** desde 2022-08 (`:updated_at`); **estimado** (sexta 15:30 ET) antes | **Coletado e validado** |
| USDA NASS Crop Progress (milho) | `USDA.CORN.CONDITION.*`, `USDA.CORN.PROGRESS.*` | QuickStats API — **exige chave** (gratuita) | 1980-04-13 → hoje (piso real da API, confirmado em 2026-09-21; padrão do coletor, `NASS_ANO_INICIAL`). Cada série começa no seu ano: `PLANTED` 1980, `DOUGH`/`SILKING`/`DENTED`/`MATURE`/`HARVESTED` 1981, `CONDITION.*` 1986, `EMERGED` 1999 | **estimado** (16:00 ET, 1º dia útil da semana, com feriados). Regra não validada para 1980–2005 | **Coletado e validado** (2026-09-20/21): 6.758 linhas, 12 séries, 0 falhas |
| B3 — futuros CCM por vencimento | `B3.CCM.<TICKER>.<CAMPO>` | `TradeInformationConsolidatedFile` (Up2Data público, sem chave nem recaptcha) | **~15 meses e rolante** (verificado em 2026-09-20) | — | **Coletor implementado e coletado** (`b3-ccm-futuro`): 20.508 linhas, 321 pregões, 15 vencimentos. **10+ anos NÃO existem de graça** |

**Comex Stat (exportação de milho, mensal, desde 2005):** fonte autorizada depois deste ADR, registrada no
**ADR 0013**.

Validação cruzada real: `DGS10 − T10YIE` reproduz `DFII10` em **5.932 de 5.932**
pontos (diferença máxima 0) — o FRED define T10YIE dessa forma, o que confirma que os
três coletores leem a mesma realidade.

Crop Progress na tela Observáveis: dois cards, `USDA_MILHO_CONDICAO` (5 classes, destaque "boa") e
`USDA_MILHO_PROGRESSO` (7 etapas, destaque "colheita"). O destaque é só a série exibida; nenhuma soma
(ex.: boa+excelente) é calculada — seria um fator. Na condição, as 5 classes somam 100% em cada semana.

### Achados que corrigem o relatório FEL 1

- **COTAHIST NÃO atende CCM/ICF (§6.5.2 incorreta).** A B3 separa "Mercado à vista →
  Cotações históricas (COTAHIST)" de "Derivativos → Ajustes do pregão / Resumo estatístico".
- **Crop Progress:** 16:00 ET, primeiro dia útil da semana, 1º/abr–30/nov (planilha
  "mar–nov" incorreta). Feriado federal desloca para terça — tratado no coletor.
- **COT:** o shutdown de 2025 é visível nos dados: o relatório da semana de
  2025-09-30 só saiu em **2025-11-19 (50 dias depois)**. A regra "terça → sexta" erraria.
  Por isso o coletor usa o timestamp real da fonte sempre que ele é confiável.
- **DTWEXBGS não é o DXY** (índice ICE, licenciado) e é divulgado **semanalmente**.
  O relatório atribui o DXY a "US Treasury/World Bank", que não o publicam.

### Como o COT decide o `published_at`

`:updated_at` do Socrata é o instante real da publicação nas semanas ao vivo
(`2026-09-18T19:30:07Z` = sexta 15:30 ET), mas o histórico anterior foi carregado
**em lote em 2022-08-01**. O coletor detecta o lote (mais de 10 linhas com o mesmo
instante) ou um valor implausível (antes de a CFTC receber os dados) e nesses casos usa
o cronograma oficial, marcado estimado. Resultado: 216 semanas reais, 842 estimadas por contrato.

## B3 / CCM — preço diário dos futuros de milho

**Correção (2026-09-20, mesma data):** a versão anterior desta seção dizia que o download em lote
exigia `recaptchaToken` ("mesmo sinal de anti-bot do CEPEA"). **Estava errada.** O 400 veio de um
`fileName` inválido que eu testei; com o nome correto o endpoint responde sem recaptcha.

**Fonte achada e verificada por requisição real:**

- Duas etapas, ambas `GET`, sem chave e sem recaptcha:
  1. `https://arquivos.b3.com.br/api/download/requestname?fileName=TradeInformationConsolidatedFile&date=AAAA-MM-DD&recaptchaToken=`
     → `{"redirectUrl":"~/download?token=..."}`
  2. `https://arquivos.b3.com.br/api/download?token=...` → CSV (`TradeInformationConsolidatedFile_AAAAMMDD_1.csv`).
- CSV com `;` e vírgula decimal (latin1). Colunas: `RptDt;TckrSymb;ISIN;SgmtNm;MinPric;MaxPric;TradAvrgPric;LastPric;OscnPctg;AdjstdQt;AdjstdQtTax;RefPric;TradQty;FinInstrmQty;NtlFinVol`.
  `AdjstdQt` é o **preço de ajuste**; `TradQty` = negócios; `FinInstrmQty` = contratos; `NtlFinVol` = volume financeiro.
- Todos os vencimentos de CCM aparecem como `CCM<letra><ano>` (ex.: `CCMF27`). Em 2026-09-18 havia 7 linhas de CCM.
  Exemplo: `CCMF27` mín 79,84, máx 80,81, último 80,10, **ajuste 80,17**, 910 negócios, 2.446 contratos.

**Profundidade — o limite que importa:** o arquivo só existe para uma **janela rolante de cerca de
15 meses**. Verificado: há dado em 2025-06-13 e **corpo vazio** em 2025-06-06 e em todas as datas
testadas antes disso (2025-05-30 … 2020-06-19); antes de ~2019 o endpoint devolve 400. O limite exato
entre 2025-06-06 e 2025-06-13 não foi fixado. A janela **avança um dia por dia**: sem coletar, o dado mais
antigo some (o histórico que o FinMind acumular passa a ser o único). Confirmado por fontes públicas que a B3
descontinuou as páginas de "Ajustes do pregão" em dez/2025 e o histórico anterior só existe no Acervo B3 (PDF)
ou em provedores pagos (não verificado pelo FinMind).

**Atualização (2026-09-23, ADR 0020):** o Boletim Diário de Informações (BDI) em PDF, também público e
sem chave, tem a tabela por vencimento do CCM (com **contratos em aberto** e abertura) de **2022-03-21 a
2025-12-11**. O histórico do CCM no FinMind passou a começar em 2022-03-21 (~4,5 anos), com um buraco
de ~9 meses em 2023 (boletins publicados sem o capítulo de derivativos). Continua longe dos 10+ anos; o
parágrafo abaixo segue valendo para o que vem antes de 2022.

**Consequência:** o histórico gratuito da B3 (~1,25 ano) **não atende** os 10-15 anos do §12.1 do
relatório FEL 1 (e mal alcança o piso de "1 a 5 anos" do §4). Alternativas para 10+ anos — nenhuma
implementada nem verificada: (a) histórico pago da B3 (UP2DATA / Acervo B3); (b) provedor comercial
(preço **não verificado**); (c) o indicador CEPEA/ESALQ do milho (base de liquidação financeira do CCM)
como **proxy** — é o preço físico, não o do contrato (sem estrutura a termo, base nem rolagem).
Ressalva de liquidez do próprio relatório (§8.4, §13.3): ICF e CCM têm "liquidez modesta" — a profundidade
útil de anos antigos precisa ser medida nos dados, não presumida.

### Coletor implementado (`collectors/b3/b3-ccm.collector.js`)

- **O que grava:** cada vencimento separado (sem série contínua nem rolagem) e cada campo como uma série
  `B3.CCM.<TICKER>.<CAMPO>` (ex.: `B3.CCM.CCMF27.SETTLE`): `SETTLE` (preço de ajuste), `LAST`, `HIGH`, `LOW`,
  `AVG`, `OSCN_PCT`, `TRADES`, `CONTRACTS`, `VOLUME_BRL` (mais `ADJ_RATE`/`REF_PRICE`, que vêm vazios para
  futuro). O vencimento decodificado (`2027-01`) e o ISIN ficam em `metadata`. Contrato sem negócio no dia
  grava só o que existe (o ajuste), sem inventar zeros.
- **Filtro:** ticker exato `CCM<mês><aa>` + segmento `AGRIBUSINESS`. `CCME11` (segmento CASH) e as opções
  (`CCMF27C006800`...) também começam com "CCM" e ficam de fora.
- **Só aceita arquivo com `Status do Arquivo: Final` e colunas conhecidas**; outro status, ou layout novo, vira
  item inválido (a execução fica `partial_success`, e a janela do dia seguinte refaz). Dia sem arquivo
  (feriado / fora da janela) não é erro. Se **nenhum** pregão de uma janela com 4+ dias úteis devolve arquivo,
  a execução **falha** (fonte caiu ou mudou).
- **`published_at`:** estimado como o fim do dia do pregão em Brasília (o download não traz `Last-Modified`),
  sempre limitado a `collected_at`.
- **Coleta diária:** janela de 7 dias corridos (5 dias úteis), idempotente; recupera dias perdidos de cron.
  **Backfill:** `npm run backfill:b3-ccm` (`--desde=`, `--ate=`), que reaproveita o mesmo coletor.
- **Resultado (2026-09-20):** primeiro pregão com arquivo **2025-06-10**, último 2026-09-18; 321 pregões,
  15 vencimentos, 135 séries, 20.508 linhas, 0 duplicatas. O último pregão de cada vencimento é o **dia 15
  (ou o próximo dia útil)** — confirma o §8.1 do relatório FEL 1 (uma fonte pública consultada dizia "décimo
  dia útil"; os dados não confirmam).
- **Idempotência:** um segundo backfill completo leu 2.916 linhas e criou 0.

### Na tela Observáveis (dois cards, mesmas séries)

`CCM_PRECOS` ("Milho B3 (CCM) — Preços": `SETTLE` principal, `LAST`, `HIGH`, `LOW`, `AVG`, `OSCN_PCT`) e
`CCM_LIQUIDEZ` ("Milho B3 (CCM) — Liquidez": `CONTRACTS` principal, `TRADES`, `VOLUME_BRL`). Os campos têm unidades
diferentes, então o gráfico mostra **um campo por vez**, com **uma linha por vencimento** — vencimentos nunca são
encadeados. Por padrão entram só os vencimentos **ativos** (os que tiveram pregão no último pregão coletado); os
vencidos ficam disponíveis por "Mostrar vencimentos já vencidos". O valor em destaque é o do vencimento ativo
**mais próximo**, sempre identificado (ex.: `76,36 R$/saca (CCMX26)`) — é só o destaque, não uma série.
Contratos, negócios e volume só existem nos dias com negócio (sem zeros inventados). Os vencimentos são
descobertos no banco (`repository.listarItens`, o mesmo mecanismo que lista as regiões do WASDE, ADR 0015), sem catálogo fixo.

### Agendamento

Duas frentes, ambas rodando `run-coleta.js` (todos os coletores; ver ADR 0004):

- **Desenvolvimento:** tarefa `FinMind-Coleta-Diaria` no Agendador do Windows (22:00), criada por
  `backend/scripts/agendar-coleta-windows.ps1`.
- **Produção (VM):** cron do usuário `deploy` (04:00, 06:00 e 08:00; **não versionado**) chamando
  `npm run collect` no container do backend. Cobre a B3 automaticamente desde o deploy que incluiu o coletor.

## Ressalvas de licença (não bloqueiam o MVP)

- **Decisão (2026-09-21):** não há distribuição nem comercialização do sistema ou dos dados num
  horizonte previsível; a licença **não é ação agora**. Fica registrada aqui, nos cards dos
  Observáveis e em `docs/reconhecimento-fontes/` para ser retomada **antes de exibir a terceiros,
  redistribuir ou comercializar**. A leitura dos termos abaixo foi feita em 2026-09-21 a partir
  das páginas oficiais, por resumo automático (não é o texto integral nem parecer jurídico).
- **LBMA:** o preço é administrado pela ICE Benchmark Administration (IBA). O site da LBMA diz
  que "a licence from IBA is required in order to obtain, use or redistribute real-time or
  historical benchmark data"; há licenças de uso, de redistribuição e de acesso a histórico, com
  tabela de taxas da IBA (PDF **não lido**, valores desconhecidos). O histórico tabulado foi movido
  para o portal MyLBMA. O feed JSON usado é público, mas isso não é licença, e as FAQs não dizem
  se pesquisa interna exige uma. Risco: baixo em uso interno; alto ao exibir, usar em avaliação
  ou basear sinal. Alternativas se um dia for necessário: licenciar com a IBA, manter só interno
  ou trocar de fonte.
- **FRED:** por série, na página do FRED: `DGS10` e `DFII10` (Board of Governors, H.15) e
  `DTWEXBGS` (Board of Governors, H.10) são "Public Domain: Citation Requested"; `T10YIE`
  (calculada pelo FRED) **não teve o status confirmado**. A página legal permite uso comercial
  interno de séries "Citation Requested" com citação ao FRED e à fonte original, e proíbe replicar
  o site, raspar a base inteira ou vendê-la como produto. As páginas também trazem o aviso
  padrão "data in this graph are copyrighted" — ler a nota de cada série antes de compartilhar.
  Termos da API (usada só para o ALFRED): o FRED pode ajustar limites; não sugerir endosso do
  Fed; produto para terceiros exibe "This product uses the FRED® API but is not endorsed or
  certified by the Federal Reserve Bank of St. Louis". A coleta diária **passou a usar a API**
  quando há chave, com o CSV do site como reserva (ADR 0012, 2026-09-21).
- **CFTC, USDA:** dados de órgãos do governo dos EUA; nenhuma restrição conhecida (não verificado
  juridicamente).

## Pendências

- Crop Progress: profundidade **resolvida em 2026-09-21** — o QuickStats começa em 1980 (pedir desde
  1900 devolve as mesmas 6.758 linhas) e o padrão do coletor passou a 1980. Segue em aberto validar a
  regra de `published_at` estimada para 1980–2005. Cada etapa de progresso só existe na sua janela
  do ano, e de dez a mar não há dado novo (o card fica "atrasado" por sazonalidade).
- ~~Confirmar o fuso do servidor e a execução do cron com os coletores novos~~ — feito em 2026-09-21: UTC; três
  execuções de 21/09 com todos os coletores em `success` (ADR 0004).
- Decidir a fonte dos 10+ anos (paga ou proxy CEPEA) — decisão de orçamento/escopo.
- ALFRED (vintages reais), quando entrar uma série revisável (ex.: CPI). A coleta diária já usa a API
  do FRED (ADR 0012); a chave `FRED_API_KEY` já está no `.env` da VM de produção.
