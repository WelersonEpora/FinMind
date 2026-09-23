# Cobertura de dados dos fatores do FEL 1 — Milho e Ouro

**Data:** 2026-09-22
**Status:** auditoria técnica do estado atual. **Não decide nada, não propõe fórmula
nem metodologia de fator.** Responde uma pergunta só: para os 8 fatores de Milho e os
8 de Ouro do `controle_fatores.xlsx` (aba "Controle de Fatores"), a matéria-prima
(observável bruto, com vintage) já existe no FinMind?
**Método:** cruzamento de `docs/Docs_David/controle_fatores.xlsx`, `docs/adr/0009-
fontes-ouro-milho-status.md`, `backend/src/services/observaveis.service.js`
(`CATALOGO_OBSERVAVEIS`) e `backend/src/collectors/index.js` com consulta real ao
banco de dev (`observation`/`market_quote`/`collection_execution`) em 2026-09-22.

> Convenção seguida: **observável** = série bruta coletada, com vintage, nunca
> calculada; **fator** = função determinística e versionada de observáveis
> (ADR 0008). Este documento só mapeia observáveis — a fórmula de cada fator
> continua pendente do especialista David.

---

## 1. Fontes por ativo — cadastrada × implementada × coletada × com histórico

### Milho

| Fonte (FEL 1) | Coletor implementado | Coletado de fato (linhas no banco, 2026-09-22) | Histórico/backfill | Coleta diária |
|---|---|---|---|---|
| USDA NASS Crop Progress | ✅ `usda-nass-crop-progress-milho` | ✅ 6.758 linhas, 12 séries | ✅ 1980→hoje | ✅ (condicionado a `NASS_API_KEY` — ver §6) |
| USDA WASDE (balanço) | ✅ `wasde-milho` | ✅ 27.309 linhas, 167 séries | ✅ 2011→hoje, vintage real (24.542 revisões) | ✅ |
| Conab (Boletim da Safra) | ✅ `conab-milho` | ✅ 3.436 linhas, 397 séries | ⚠️ só fev/2025→hoje | ✅ |
| Comex Stat (exportação) | ✅ `comex-milho-exportacao` | ✅ 520 linhas, 2 séries | ✅ 2005→hoje | ✅ |
| IMEA — safra MT | ✅ `imea-milho-safra` | ✅ 96 linhas, 24 séries | ⚠️ só 2022/23→hoje, sem vintage retroativo possível | ✅ |
| IMEA — custo de produção | ✅ `imea-custo-milho` | ✅ 15.402 linhas, 5.073 séries | ⚠️ vintage começa em 15/09/2026 | ✅ |
| IMEA — oferta/demanda (PDF) | ✅ `imea-oferta-demanda-milho` | ✅ 802 linhas gravadas (3.369 itens válidos no parser, dedup por revisão) | ✅ 2014-04→2026-08, vintage real | ✅ |
| B3 CCM (futuro) | ✅ `b3-ccm.collector.js` | ✅ 20.563 linhas, 135 séries | ❌ só ~15 meses (limite da fonte gratuita) | ✅ |
| CFTC COT (milho) | ✅ `cftc-cot-corn` | ✅ 3.174 linhas | ✅ 2006→hoje | ✅ |
| CEPEA (preço físico) | ❌ | ❌ | — | — |
| USDA FAS PSD | ❌ (reconhecida, adiada por decisão do usuário) | ❌ | — | — |
| Clima (NOAA/INMET/NASA POWER) | ❌ nem reconhecida | ❌ | — | — |
| EIA (etanol de milho) | ❌ nem reconhecida | ❌ | — | — |
| Frete marítimo / prêmio de porto | ❌ nenhuma fonte identificada | ❌ | — | — |

### Ouro

| Fonte (FEL 1) | Coletor implementado | Coletado de fato | Histórico/backfill | Coleta diária |
|---|---|---|---|---|
| LBMA Gold Price PM | ✅ `lbma-gold-pm-usd` | ✅ 14.687 linhas | ✅ 1968→hoje | ✅ |
| FRED (DGS10/DFII10/T10YIE) | ✅ `fred-dgs10` etc. | ✅ 27.191 linhas (3 séries) | ✅ 1962/2003→hoje | ✅ |
| FRED DTWEXBGS (proxy DXY) | ✅ `fred-dtwexbgs` | ✅ 5.193 linhas | ✅ 2006→hoje | ✅ |
| CFTC COT (ouro) | ✅ `cftc-cot-gold` | ✅ 3.174 linhas | ✅ 2006→hoje | ✅ |
| CPI EUA (FRED) | ❌ sem coletor (mesma API já em uso p/ DGS10) | ❌ | — | — |
| WGC (reservas de BC, ETFs) | ❌ nível 0 | ❌ | — | — |
| IMF Data (SDMX) | ❌ nível 0 | ❌ | — | — |
| DXY real (ICE) | ❌ licenciado, sem substituto gratuito exato | ❌ | — | — |
| USGS (produção mineral) | ❌ (decisão consciente: peso baixo, ignorar no MVP) | ❌ | — | — |

---

## 2. Cobertura dos 8 fatores de Milho

| # | Fator (peso, xlsx) | Dados necessários | Já disponível | Lacuna |
|---|---|---|---|---|
| 1 | Clima e safra EUA — Crop Progress (Alto) | % condição/progresso da lavoura EUA; clima (chuva/temperatura) | Crop Progress completo (USDA, 1980→hoje) | Clima (NOAA/INMET/NASA POWER) — não coletado, nem reconhecido |
| 2 | Safrinha brasileira, 2ª safra (Alto) | Área/produção/produtividade da 2ª safra | Conab (nacional/UF, vintage fev/2025+) e IMEA (só MT, sem vintage) | Vintage anterior a fev/2025 é irrecuperável; série 1976/77+ não carregada (decisão) |
| 3 | Estoques globais e balanço — WASDE (Alto) | Estoque final, produção, balanço mundial | WASDE EUA + por país, vintage real 2011+ | Pré-2011 só em PDF, não coletado |
| 4 | Dólar/USDBRL e paridade de exportação (Médio) | USD/BRL + frete marítimo + prêmio de porto | USD/BRL completo (1994+); exportação Comex Stat (2005+) | **Frete e prêmio de porto: nenhuma fonte identificada** — o fator não é calculável hoje mesmo com o resto perfeito |
| 5 | Demanda de etanol/biocombustível (Médio) | Produção de etanol de milho, estoques (EIA/USDA) | — | **Nada.** EIA nem foi reconhecida como fonte |
| 6 | Custo de insumos — fertilizantes, diesel (Médio) | Preço de fertilizantes e diesel | IMEA custo de produção traz linhas agregadas ("Fertilizantes e corretivos", "Operações mecanizadas — diesel"), só Mato Grosso, em R$/ha (custo composto, não preço isolado) | Sem cobertura fora de MT; sem série de preço de insumo isolada |
| 7 | Especulação — COT (Médio) | Posições CFTC (OI, MM long/short) | Completo, 2006+ | Nenhuma relevante |
| 8 | Política comercial/exportações — China, tarifas (Médio) | Exportação por destino, eventos de tarifa | Comex Stat só traz total nacional exportado, sem quebra por país | Sem exportação por destino (China específica); sem captura de evento de tarifa (doutrina do projeto veda isso como "número" sem camada de evidência) |

**Resumo:** 3/8 com matéria-prima essencialmente completa (Crop Progress, WASDE, COT); 3/8 com cobertura parcial real (safrinha, dólar/paridade, custo de insumos); 2/8 sem nenhuma fonte hoje (etanol, política comercial por destino).

## 3. Cobertura dos 8 fatores de Ouro

| # | Fator (peso, xlsx) | Dados necessários | Já disponível | Lacuna |
|---|---|---|---|---|
| 1 | Juros reais (Fed) e yield 10a (Alto) | DGS10, DFII10, T10YIE | Completo + fator versionado já validado (`DGS10−T10YIE = DFII10` em 5.932/5.932 pontos) | Nenhuma — fator mais maduro do sistema |
| 2 | Dólar — índice DXY (Alto) | Índice DXY (ICE) | Só o substituto DTWEXBGS (Fed) — metodologia e composição diferentes | DXY real é licenciado, não coletado; a planilha do David atribui a fonte errada ("US Treasury, World Bank" — nenhum publica o DXY, achado já no ADR 0009) |
| 3 | Inflação e expectativas (Alto) | CPI observado + breakeven inflation | Breakeven (T10YIE) completo | **CPI em si não é coletado** (mesma API do FRED já em uso, falta só o coletor) |
| 4 | Geopolítica e risco sistêmico (Alto) | Eventos qualitativos | — | **Nada.** Não vira "número" sem camada de evidência de IA Search — só proposta em `analise-critica-fel1-milho-ouro.md`/ADR 0010 (desenho futuro), não construída |
| 5 | Demanda de bancos centrais/reservas (Alto) | Compras de reservas (IMF/WGC/BCB) | — | Nenhuma fonte reconhecida (nível 0) |
| 6 | Fluxo de ETFs de ouro (Médio) | Holdings/fluxo WGC | — | Nenhuma fonte (WGC Goldhub sem API pública) |
| 7 | Posicionamento de fundos — COT (Médio) | CFTC ouro | Completo, 2006+ | Nenhuma relevante |
| 8 | Produção/oferta de mineração (Baixo) | USGS | — | Nenhuma fonte — decisão consciente de ignorar no MVP (peso baixo) |

**Resumo:** 2/8 completamente cobertos (juros reais, COT); 1/8 coberto por proxy metodologicamente diferente (DXY); 5/8 sem nenhum dado (CPI, geopolítica, reservas de BC, ETFs, produção mineral — este último de baixa prioridade por decisão).

---

## 4. Preço e mercado

| Ativo | Instrumento | Periodicidade | OHLCV? | Volume/OI? | Histórico real |
|---|---|---|---|---|---|
| Milho | B3 CCM (R$/saca) — não é o ZC da CME | Diária, por vencimento | Parcial: `SETTLE/LAST/HIGH/LOW/AVG` sim, mas cada campo é uma série própria, não um candle único | `CONTRACTS`/`TRADES`/`VOLUME_BRL` sim; **sem Open Interest por vencimento** | ~15 meses (limite estrutural da fonte gratuita) |
| Ouro | LBMA Gold Price PM (fixing) | Diária | Não — preço fixado único, não OHLCV de pregão | Não | 1968→hoje (licença IBA pendente para uso além de pesquisa interna) |

O modelo `observation` (`value DECIMAL(18,6)` escalar) não tem colunas nativas de OHLCV — o coletor B3 contorna isso com uma série por campo. Funciona, mas não é uma tabela de candle nativa.

Nenhuma das duas séries de preço atende, isoladamente, ao padrão de backtest do FEL 1 (§12.1: 10-15 anos, OHLCV+OI). CME ZC e GC (futuro do ouro) não foram reconhecidos como fonte (pagos). Continua sendo o risco nº1 já identificado em `analise-critica-fel1-milho-ouro.md`.

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
| Reuniões FOMC | Ouro | ❌ | — |
| Gold Demand Trends (WGC) | Ouro | ❌ | — |
| Gold Reserve Statistics (IMF) | Ouro | ❌ | — |
| Indicadores de Preços (Cepea) | Milho | ❌ bloqueada | — |
| Relatório Focus e Reservas (BCB) | Ouro | ❌ | — |

O FinMind não tem uma entidade de "calendário de relatórios" própria — o que existe é o coletor rodando no calendário real da fonte. Para os relatórios marcados ❌, não há coletor nem registro de calendário dentro do sistema: a única cobertura é a linha na planilha do David.

---

## 6. Riscos e achados operacionais desta auditoria

- **Point-in-time comprovado com dado real**, não só documentado: `WASDE.MILHO.EUA.ENDING_STOCKS`, safra 2022/23, tem 18 versões distintas de `published_at` no banco de dev. Isso já cumpre o "critério de sucesso" que `analise-critica-fel1-milho-ouro.md` (§8) definia como pré-requisito antes de especificar fatores.
- **USDA Crop Progress depende de `NASS_API_KEY` para ser registrado** (`collectors/index.js:47-51`); sem a chave, o coletor não roda e a coleta geral não falha nem destaca isso — **confirmado em produção que a chave está presente** (2026-09-22).
- **"3.369 observações" (IMEA O&D) é o número de itens válidos no parser, não linhas gravadas** — o banco tem 802 linhas após a deduplicação por revisão do serviço point-in-time (ADR 0008: só grava quando o valor muda). Corrigido no `STATUS_DO_PROJETO.md` nesta data.
- Vintage do agro (Conab, IMEA) é estruturalmente irrecuperável para o passado — decisão pendente do Comitê (`pendente-especialista-david.md` / pergunta 5 de `analise-critica-fel1-milho-ouro.md` §H), a ser levada à próxima reunião junto com a pergunta 3 (orçamento para preço de futuros).

---

## 7. Conclusão

**A. Pronto:** pipeline de coleta + log de execução; camada `observation` point-in-time comprovada com dado real; juro real 10a (ouro, fator versionado validado); COT ouro e milho; WASDE; Crop Progress; USD/BRL e Selic.

**B. Parcial:** Conab e IMEA (dado de qualidade, vintage começando agora ou só desde fev/2025); B3 CCM (~15 meses, sem OI por vencimento, contrato diferente do CME ZC); índice do dólar via proxy FRED (não é o DXY real); custo de insumos do milho só via agregados IMEA/MT.

**C. Faltante:** preço de futuros de 10+ anos (bloqueador nº1 para qualquer backtest); frete marítimo/prêmio de porto; demanda de etanol (EIA); CPI, reservas de bancos centrais e fluxo de ETFs de ouro (WGC/IMF); exportação de milho por país de destino; clima (NOAA/INMET/NASA POWER).

**D. Próximo passo:** as perguntas 3 (orçamento para preço de futuros) e 5 (vintage do agro: aceitar viés retroativo ou só acumular a partir de agora) do §4 de `STATUS_DO_PROJETO.md` são as duas decisões do Comitê que travam qualquer avanço de fator — nenhuma implementação nova faz sentido antes dessas respostas. As fontes sem cobertura listadas em "C" ficam no radar (`STATUS_DO_PROJETO.md`, §3) até decisão do David sobre prioridade.
