# Cobertura de dados dos fatores do FEL 1 — Milho e Ouro

**Data:** 2026-09-22, **revisada em 2026-09-28** (entregas de 23 a 25/09 e reconhecimento das fontes do FEL 1 que
ainda não tinham registro: USDA Prospective Plantings e Grain Stocks, World Bank e US Treasury; a área plantada do
USDA foi implementada no mesmo dia, ADR 0027).
**Status:** auditoria técnica do estado atual. **Não decide nada, não propõe fórmula
nem metodologia de fator.** Responde uma pergunta só: para os 8 fatores de Milho e os
8 de Ouro do `controle_fatores.xlsx` (aba "Controle de Fatores"), a matéria-prima
(observável bruto, com vintage) já existe no FinMind?
**Método:** cruzamento de `docs/Docs_David/controle_fatores.xlsx`, do relatório FEL 1 v1.1 (tabelas de fontes da
§6.2, fontes obrigatórias da §6.5, fatores da §7.2, calendário da §7.4 e plano de integração da §9.2),
`docs/adr/0009-fontes-ouro-milho-status.md`, `backend/src/services/observaveis.service.js`
(`CATALOGO_OBSERVAVEIS`) e `backend/src/collectors/index.js` com consulta real ao
banco de dev (`observation`/`market_quote`/`collection_execution`) em 2026-09-28.

> Convenção seguida: **observável** = série bruta coletada, com vintage, nunca
> calculada; **fator** = função determinística e versionada de observáveis
> (ADR 0008). Este documento só mapeia observáveis — a fórmula de cada fator
> continua pendente do especialista David.

---

## 1. Fontes por ativo — cadastrada × implementada × coletada × com histórico

Linhas no banco de dev em 2026-09-28. Todos os coletores implementados rodaram entre 27 e 28/09 (§6).

### Milho

| Fonte (FEL 1) | Coletor implementado | Coletado de fato (linhas no banco) | Histórico/backfill | Coleta diária |
|---|---|---|---|---|
| USDA NASS Crop Progress | ✅ `usda-nass-crop-progress-milho` | ✅ 6.766 linhas, 12 séries | ✅ 1980→hoje | ✅ (condicionado a `NASS_API_KEY`, presente em produção) |
| USDA NASS Prospective Plantings e Acreage (área plantada) | ✅ `usda-area-plantada-milho`, pelo ESMIS (ADR 0027, 2026-09-28) | ✅ 92 linhas, 1 série (27 anos) | ✅ 2001-06→hoje, vintage real | ✅ |
| USDA NASS Grain Stocks | ✅ `usda-grain-stocks-milho`, pelo ESMIS (ADR 0035, 2026-10-01) | ✅ 588 linhas, 3 séries (total, na fazenda, fora) | ✅ 2001-06→hoje, vintage real (267 revisões) | ✅ |
| USDA WASDE (balanço) | ✅ `wasde-milho` | ✅ 27.309 linhas, 167 séries | ✅ 2011→hoje, vintage real (24.542 revisões) | ✅ |
| USDA FAS PSD | ❌ reconhecida, adiada por decisão do usuário (o WASDE por país já cobre) | ❌ | — | — |
| Conab (Boletim da Safra) | ✅ `conab-milho` | ✅ 3.436 linhas, 397 séries | ⚠️ só fev/2025→hoje | ✅ |
| Comex Stat (exportação) | ✅ `comex-milho-exportacao` e, por país de destino, `comex-milho-exportacao-destino` (ADR 0034, 2026-10-01) | ✅ 520 linhas do total, 2 séries; e uma série por país e métrica | ✅ 2005→hoje | ✅ |
| IMEA — safra MT | ✅ `imea-milho-safra` | ✅ 120 linhas, 24 séries | ⚠️ só 2022/23→hoje, sem vintage retroativo possível | ✅ |
| IMEA — custo de produção | ✅ `imea-custo-milho` | ✅ 15.402 linhas, 5.073 séries | ⚠️ vintage começa em 15/09/2026 | ✅ |
| IMEA — oferta/demanda (PDF) | ✅ `imea-oferta-demanda-milho` | ✅ 802 linhas gravadas (3.369 itens válidos no parser, dedup por revisão) | ✅ 2014-04→2026-08, vintage real | ✅ |
| IMEA — paridade de exportação (boletim semanal em PDF) | ❌ reconhecida, aguarda o Comitê (pergunta 16) | ❌ | 2015→hoje (572 edições) | — |
| B3 CCM (futuro) | ✅ `b3-ccm-futuro` + backfill `b3-ccm-bdi` (ADR 0020) | ✅ 63.110 linhas, 347 séries | ⚠️ 2022-03-21→hoje, com buraco de ~9 meses em 2023; contratos em aberto só até 2025-12-11 | ✅ |
| CME ZC (futuro) | ❌ pago (perguntas 2 e 3) | ❌ | — | — |
| CFTC COT (milho) | ✅ `cftc-cot-corn` | ✅ 3.177 linhas, 3 séries | ✅ 2006→hoje | ✅ |
| Indicador CEPEA/ESALQ (preço físico), pela B3 | ✅ `b3-milho-esalq` (ADR 0021) | ✅ 4.124 linhas, 2 séries (R$ e US$) | ⚠️ só 2018-06-08→hoje | ✅ |
| EIA (etanol de milho) | ✅ `eia-etanol` (ADR 0024) | ✅ 1.702 linhas, 2 séries | ✅ 2010→hoje | ✅ |
| Clima — NOAA STAR, saúde da vegetação sobre o milho | ✅ `noaa-vh-milho` (ADR 0025); as fontes de clima do FEL 1 (NASA POWER, INMET, CPTEC/INPE, ERA5) reconhecidas como inadequadas | ✅ 122.904 linhas, 54 séries (18 regiões × VHI/VCI/TCI) | ⚠️ 1982→hoje, mas é a versão reprocessada de hoje (vintage só daqui para frente) | ✅ |
| World Bank Pink Sheet (milho FOB Golfo) | ❌ reconhecida em 2026-09-28, não implementar por ora ([world-bank-pink-sheet.md](reconhecimento-fontes/world-bank-pink-sheet.md)) | ❌ | Mensal, 1960→hoje | — |
| FAO/AMIS | ❌ reconhecida, adiada (o WASDE já cobre o balanço mundial) | ❌ | — | — |
| Abimilho, CNA | ❌ reconhecidas, descartadas: só republicam dado de outras fontes | ❌ | — | — |
| Frete marítimo / prêmio de porto | ❌ frete sem valor isolado (marítimo sem fonte gratuita); o valor pronto é a paridade do IMEA, acima | ❌ | — | — |

### Ouro

| Fonte (FEL 1) | Coletor implementado | Coletado de fato | Histórico/backfill | Coleta diária |
|---|---|---|---|---|
| LBMA Gold Price PM | ✅ `lbma-gold-pm-usd` | ✅ 14.691 linhas | ✅ 1968→hoje | ✅ |
| FRED (DGS10/DFII10/T10YIE) | ✅ `fred-dgs10` etc. | ✅ 28.043 linhas (3 séries) | ✅ 1962/2003→hoje | ✅ |
| FRED DTWEXBGS (proxy DXY) | ✅ `fred-dtwexbgs` | ✅ 5.193 linhas | ✅ 2006→hoje | ✅ |
| CFTC COT (ouro) | ✅ `cftc-cot-gold` | ✅ 3.177 linhas, 3 séries | ✅ 2006→hoje | ✅ |
| BCB — reservas internacionais | ✅ `bcb-reservas-internacionais` (ADR 0023) | ✅ 7.048 linhas (só o total, sem a composição em ouro) | ✅ 1998→hoje | ✅ |
| BCB — Focus (IPCA, Selic, câmbio) | ✅ `bcb-focus` (ADR 0022) | ✅ 20.258 linhas, 93 séries | ✅ 2000→hoje | ✅ |
| US Treasury (Fiscal Data e curvas de juros) | ❌ reconhecida em 2026-09-28, não implementar: o juro real é o mesmo `DFII10` e o ouro do Tesouro é constante ([us-treasury.md](reconhecimento-fontes/us-treasury.md)) | — (já coberto pelo FRED) | — | — |
| World Bank Pink Sheet (ouro) | ❌ reconhecida em 2026-09-28: é a média mensal da LBMA | — (já coberto pela LBMA) | — | — |
| CPI EUA (BLS, pelo ALFRED do FRED) | ✅ `fred-cpi` (ADR 0033, 2026-10-01): cheio e núcleo com ajuste, cheio sem ajuste, com todas as versões | ✅ 7.834 linhas, 3 séries | ✅ 1913/1947/1957→hoje, vintage real desde 1949/1972/1996 | ✅ |
| Meta do Fed (FOMC, pelo FRED) | ✅ `fred-dfedtaru`, `fred-dfedtarl`, `fred-dfedtar` (ADR 0033) | ✅ 22.573 linhas, 3 séries | ✅ 1982→hoje | ✅ |
| Moedas da cesta do DXY e dólar contra economias avançadas (FRED, H.10) | ✅ `fred-dex*` (6) e `fred-dtwexafegs` (ADR 0033) | ✅ 6 moedas + 5.198 linhas do índice | ✅ 1971/1999/2006→hoje | ✅ |
| WGC (reservas de BC, ETFs) | ❌ nível 0 | ❌ | — | — |
| FMI — IRFCL, ouro nas reservas dos bancos centrais (SDMX) | ✅ `fmi-irfcl-ouro` (ADR 0036, 2026-10-01) | ✅ 43.513 valores, 88 países + 2 agregados | ✅ 1999-12→hoje (sem vintage antes da 1ª coleta) | ✅ |
| CME GC (futuro) | ❌ pago (pergunta 3) | ❌ | — | — |
| DXY real (ICE) | ❌ licenciado. As 6 moedas da cesta são coletadas (acima): remontar o índice é um cálculo, a decidir pelo David | ❌ | — | — |
| USGS (produção mineral) | ❌ (decisão consciente: peso baixo, ignorar no MVP) | ❌ | — | — |

---

## 2. Cobertura dos 8 fatores de Milho

| # | Fator (peso, xlsx) | Dados necessários | Já disponível | Lacuna |
|---|---|---|---|---|
| 1 | Clima e safra EUA — Crop Progress (Alto) | % condição/progresso da lavoura EUA; clima (chuva/temperatura) | Crop Progress completo (USDA, 1980→hoje); efeito do clima na lavoura (VHI/VCI/TCI da NOAA STAR sobre a área do milho, EUA e Brasil por estado, 1982→hoje, ADR 0025) | Previsão do tempo (o que o mercado precifica à frente): só em dado bruto, não coletado. A área plantada do Prospective Plantings (31/03) e do Acreage (30/06) é coletada desde 2026-09-28 (ADR 0027), antes de chegar ao WASDE |
| 2 | Safrinha brasileira, 2ª safra (Alto) | Área/produção/produtividade da 2ª safra | Conab (nacional/UF, vintage fev/2025+) e IMEA (só MT, sem vintage) | Vintage anterior a fev/2025 é irrecuperável; série 1976/77+ não carregada (decisão) |
| 3 | Estoques globais e balanço — WASDE (Alto) | Estoque final, produção, balanço mundial | WASDE EUA + por país, vintage real 2011+ | Pré-2011 só em PDF, não coletado. Estoques trimestrais dos EUA (Grain Stocks, 1º de dez/mar/jun) não estão no WASDE: **coletados desde 2026-10-01** pelo ESMIS, com o número original de cada edição desde 2001 (ADR 0035) |
| 4 | Dólar/USDBRL e paridade de exportação (Médio) | USD/BRL + paridade (preço interno vs. Chicago + frete + câmbio) | USD/BRL completo (1994+); exportação Comex Stat (2005+) | A **paridade calculada pelo IMEA** (MT, desde 2015) existe e aguarda a pergunta 16. Frete sozinho não serve (seria o FinMind montar a fórmula); frete marítimo sem fonte gratuita |
| 5 | Demanda de etanol/biocombustível (Médio) | Produção de etanol de milho, estoques (EIA/USDA) | Produção e estoques semanais da EIA desde 2010 (ADR 0024) | Nenhuma desde 2026-10-01: o milho usado para etanol do WASDE é coletado, em 2 séries porque o rótulo mudou em abr/2011 (ADR 0035) |
| 6 | Custo de insumos — fertilizantes, diesel (Médio) | Preço de fertilizantes e diesel | IMEA custo de produção traz linhas agregadas ("Fertilizantes e corretivos", "Operações mecanizadas — diesel"), só Mato Grosso, em R$/ha (custo composto, não preço isolado) | Sem cobertura fora de MT; sem série de preço de insumo isolada (o Campo Futuro da CNA/Cepea é só PDF anual) |
| 7 | Especulação — COT (Médio) | Posições CFTC (OI, MM long/short) | Completo, 2006+ | Nenhuma relevante |
| 8 | Política comercial/exportações — China, tarifas (Médio) | Exportação por destino, eventos de tarifa | Comex Stat: o total nacional e, desde 2026-10-01, por país de destino | A exportação por país de destino é **coletada desde 2026-10-01** (ADR 0034). Eventos de tarifa dependem da busca de eventos, que não existe |

**Resumo:** 4/8 com matéria-prima essencialmente completa (clima e safra EUA, WASDE, etanol pela EIA, COT); 3/8 com cobertura parcial real (safrinha, dólar/paridade, custo de insumos); 1/8 só com metade (política comercial: a exportação por destino desde 2026-10-01; os eventos de tarifa, não). Desde 2026-10-01 também o etanol do USDA (fator 5) e os estoques trimestrais (fator 3).

## 3. Cobertura dos 8 fatores de Ouro

| # | Fator (peso, xlsx) | Dados necessários | Já disponível | Lacuna |
|---|---|---|---|---|
| 1 | Juros reais (Fed) e yield 10a (Alto) | DGS10, DFII10, T10YIE | Completo + fator versionado já validado (`DGS10−T10YIE = DFII10` em 5.932/5.932 pontos). O `DFII10` é o número do Tesouro dos EUA (4 de 4 datas iguais, reconhecimento de 2026-09-28) | Nenhuma — fator mais maduro do sistema. A meta do Fed (FOMC) é coletada desde 2026-10-01 (ADR 0033) |
| 2 | Dólar — índice DXY (Alto) | Índice DXY (ICE) | Os índices do Fed DTWEXBGS (amplo) e, desde 2026-10-01, DTWEXAFEGS (economias avançadas, mais próximo da cesta do DXY), e as 6 moedas da cesta do DXY (ADR 0033) | DXY real é licenciado, não coletado; remontá-lo pelas 6 moedas é um cálculo, a decidir pelo David; a planilha do David atribui a fonte errada ("US Treasury, World Bank" — nenhum publica o DXY, achado já no ADR 0009) |
| 3 | Inflação e expectativas (Alto) | CPI observado + breakeven inflation | Breakeven (T10YIE) completo | Nenhuma desde 2026-10-01: o CPI é coletado pelo ALFRED, com todas as versões e a data real de cada uma (ADR 0033) |
| 4 | Geopolítica e risco sistêmico (Alto) | Eventos qualitativos | — | **Nada.** Não vira "número" sem camada de evidência de IA Search — só proposta em `analise-critica-fel1-milho-ouro.md`/ADR 0010 (desenho futuro), não construída |
| 5 | Demanda de bancos centrais/reservas (Alto) | Compras de reservas (IMF/WGC/BCB) | Reservas internacionais **totais** do Brasil (BCB, 1998+, ADR 0023) | Desde 2026-10-01, o ouro nas reservas de 88 países pelo FMI (ADR 0036), mensal desde 1999; Brasil, Angola e Chile com o volume em unidade errada na fonte (marcado). Falta o total mundial, que o WGC compila |
| 6 | Fluxo de ETFs de ouro (Médio) | Holdings/fluxo WGC | — | Nenhuma fonte (WGC Goldhub sem API pública) |
| 7 | Posicionamento de fundos — COT (Médio) | CFTC ouro | Completo, 2006+ | Nenhuma relevante |
| 8 | Produção/oferta de mineração (Baixo) | USGS | — | Nenhuma fonte — decisão consciente de ignorar no MVP (peso baixo) |

**Resumo:** 2/8 completamente cobertos (juros reais, COT); 1/8 coberto por proxy metodologicamente diferente (DXY); 1/8 com cobertura mínima (reservas totais do Brasil, sem a compra de ouro dos bancos centrais); 4/8 sem nenhum dado (CPI, geopolítica, ETFs, produção mineral — este último de baixa prioridade por decisão).

---

## 4. Preço e mercado

| Ativo | Instrumento | Periodicidade | OHLCV? | Volume/OI? | Histórico real |
|---|---|---|---|---|---|
| Milho | B3 CCM (R$/saca) — não é o ZC da CME | Diária, por vencimento | Parcial: `SETTLE/LAST/HIGH/LOW/AVG` (e abertura no Boletim Diário) sim, mas cada campo é uma série própria, não um candle único | `CONTRACTS`/`TRADES`/`VOLUME_BRL` sim; **contratos em aberto por vencimento só até 2025-12-11** (Boletim Diário) | Desde 2022-03-21, com buraco de ~9 meses em 2023 (ADR 0020) |
| Milho | Indicador CEPEA/ESALQ, pela B3 (R$ e US$/saca) | Diária | Não — preço físico único | Não | Desde 2018-06-08 (ADR 0021) |
| Ouro | LBMA Gold Price PM (fixing) | Diária | Não — preço fixado único, não OHLCV de pregão | Não | 1968→hoje (licença IBA pendente para uso além de pesquisa interna) |

O modelo `observation` (`value DECIMAL(18,6)` escalar) não tem colunas nativas de OHLCV — o coletor B3 contorna isso com uma série por campo. Funciona, mas não é uma tabela de candle nativa.

Nenhuma das séries de preço atende, isoladamente, ao padrão de backtest do FEL 1 (§12.1: 10-15 anos, OHLCV+OI). CME ZC e GC (futuro do ouro) não foram reconhecidos como fonte (pagos). A Pink Sheet do Banco Mundial traz o milho FOB Golfo dos EUA desde 1960, mas é **mensal** e sem OHLCV: não muda esse quadro. Continua sendo o risco nº1 já identificado em `analise-critica-fel1-milho-ouro.md`.

---

## 5. Relatórios do calendário (`controle_fatores.xlsx`, aba "Calendário de Relatórios")

| Relatório | Ativo(s) | Capturado (dado)? | Histórico? |
|---|---|---|---|
| WASDE | Milho | ✅ | ✅ 2011→hoje |
| Crop Progress | Milho | ✅ | ✅ 1980→hoje |
| Boletim da Safra de Grãos (Conab) | Milho | ✅ | ⚠️ só fev/2025→hoje |
| Exportações (Comex Stat) | Milho | ✅ | ✅ 2005→hoje |
| Boletim Mensal (IMEA) | Milho | ✅ (safra, custo, O&D) | ⚠️ misto (O&D tem vintage; safra/custo não) |
| COT | Ouro, Milho | ✅ | ✅ 2006→hoje |
| LBMA Gold Price | Ouro | ✅ | ✅ 1968→hoje |
| Reuniões FOMC | Ouro | ✅ a meta vigente em cada dia (ADR 0033); o calendário das reuniões futuras não | ✅ 1982→hoje |
| Gold Demand Trends (WGC) | Ouro | ❌ | — |
| Gold Reserve Statistics (IMF) | Ouro | ❌ | — |
| Indicadores de Preços (Cepea) | Milho | ✅ pela B3 (ADR 0021) | ⚠️ 2018-06-08→hoje |
| Relatório Focus e Reservas (BCB) | Ouro | ✅ Focus (IPCA, Selic e câmbio por ano, ADR 0022) e Reservas (total diário, ADR 0023) | ✅ Focus 2000→hoje; Reservas 1998→hoje |

Fora do calendário do xlsx, mas na tabela de fontes do milho do FEL 1 (p. 10): **Prospective Plantings** (31 de
março, com o **Acreage** de fim de junho: coletados desde 2026-09-28, ADR 0027) e **Grain Stocks** (trimestral; o
próximo sai em **30/09/2026**: reconhecido, não coletado).

O FinMind não tem uma entidade de "calendário de relatórios" própria — o que existe é o coletor rodando no calendário real da fonte. Para os relatórios marcados ❌, não há coletor nem registro de calendário dentro do sistema: a única cobertura é a linha na planilha do David.

---

## 6. Riscos e achados operacionais desta auditoria

- **Point-in-time comprovado com dado real**, não só documentado: `WASDE.MILHO.EUA.ENDING_STOCKS`, safra 2022/23, tem 18 versões distintas de `published_at` no banco de dev. Isso já cumpre o "critério de sucesso" que `analise-critica-fel1-milho-ouro.md` (§8) definia como pré-requisito antes de especificar fatores.
- **Coleta em dia (2026-09-28):** todos os coletores implementados tiveram execução em 27 ou 28/09 no banco de dev, com status `success`, exceto dois casos: `imea-custo-milho` terminava sempre em `partial_success` **de propósito** (a planilha "Ponderado Média Tecnologia" repete o rótulo "2025/26 Consolidado" em duas colunas de Tangará da Serra; o coletor não grava nenhuma das duas) — desde 2026-09-28 o caso é um **aviso da fonte** e a execução fica `success` (ADR 0002); e uma execução de `fred-dtwexbgs` ficou em `running` desde 11:03 UTC de 28/09 no banco de dev (processo local interrompido; a execução anterior levou menos de 1 s). Produção não foi consultada.
- **USDA Crop Progress depende de `NASS_API_KEY` para ser registrado** (`collectors/index.js`); sem a chave, o coletor não roda e a coleta geral não falha nem destaca isso — **confirmado em produção que a chave está presente** (2026-09-22). A área plantada (ADR 0027) não usa a chave: vem do ESMIS, porque o histórico da API não tem a data real de publicação.
- **"3.369 observações" (IMEA O&D) é o número de itens válidos no parser, não linhas gravadas** — o banco tem 802 linhas após a deduplicação por revisão do serviço point-in-time (ADR 0008: só grava quando o valor muda).
- Vintage do agro (Conab, IMEA) é estruturalmente irrecuperável para o passado — decisão pendente do Comitê (pergunta 5 da §4 de `STATUS_DO_PROJETO.md`).
- **Fontes do FEL 1 sem nenhum reconhecimento** depois desta revisão: só as do ouro WGC e IMF (nível 0) e o calendário do FOMC. As demais têm uma linha em `docs/reconhecimento-fontes/README.md`.

---

## 7. Conclusão

**A. Pronto:** pipeline de coleta + log de execução; camada `observation` point-in-time comprovada com dado real; juro real 10a (ouro, fator versionado validado); COT ouro e milho; WASDE; Crop Progress; área plantada do USDA (Prospective Plantings e Acreage); clima sobre o milho (NOAA STAR); etanol (EIA); Indicador CEPEA/ESALQ (desde 2018); Focus e reservas do BCB; USD/BRL e Selic.

**B. Parcial:** Conab e IMEA (dado de qualidade, vintage começando agora ou só desde fev/2025); B3 CCM (desde 2022, com buraco em 2023, sem contratos em aberto depois de 2025-12-11, contrato diferente do CME ZC); índice do dólar via proxy FRED (não é o DXY real); custo de insumos do milho só via agregados IMEA/MT; reservas de banco central só o total do Brasil.

**C. Faltante:** preço de futuros de 10+ anos (bloqueador nº1 para qualquer backtest); compras de ouro por bancos centrais e fluxo de ETFs de ouro (WGC/IMF); previsão do tempo. O CPI (ADR 0033) e o milho usado para etanol (ADR 0035) foram coletados em 2026-10-01.

**D. Existe e aguarda decisão:** paridade de exportação do IMEA (pergunta 16). A exportação por destino (ADR 0034) e os estoques trimestrais do Grain Stocks (ADR 0035) foram coletados em 2026-10-01, só como aquisição: como entram nos fatores é do David.

**E. Reconhecido e sem valor novo:** US Treasury (duplica o FRED), Pink Sheet do Banco Mundial para o ouro (duplica a LBMA), Abimilho e CNA (republicam outras fontes), clima bruto do FEL 1 (NASA POWER, INMET, CPTEC, ERA5).

**F. Próximo passo:** as perguntas 3 (orçamento para preço de futuros) e 5 (vintage do agro: aceitar viés retroativo ou só acumular a partir de agora) do §4 de `STATUS_DO_PROJETO.md` continuam sendo as duas decisões do Comitê que travam qualquer avanço de fator. Das lacunas de "C", a única resolvível sem custo nem decisão de método é o CPI (coletor do FRED já existente); as demais ficam no radar (`STATUS_DO_PROJETO.md`, §3) até decisão do David sobre prioridade.
