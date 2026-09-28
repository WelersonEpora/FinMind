# 0027 — Área plantada de milho dos EUA: Prospective Plantings e Acreage (USDA NASS, pelo ESMIS)

## Contexto

A tabela de fontes do milho do relatório FEL 1 (p. 10) lista, na linha do USDA/NASS, "WASDE, Crop Progress (condição
das lavouras), **Prospective Plantings**, Grain Stocks". O WASDE (ADR 0015) e o Crop Progress (ADR 0009) já eram
coletados; os outros dois não constavam em nenhum documento do FinMind. O reconhecimento de 2026-09-28
(`docs/reconhecimento-fontes/usda-plantings-grain-stocks.md`) mostrou o que eles acrescentam.

**A área plantada já está no WASDE, mas atrasada.** O WASDE só abre a safra nova em maio. Em 2026 o USDA publicou a
intenção de plantio (Prospective Plantings) em **31/03** e o nosso WASDE só a trouxe em **12/05**; o Acreage de
**30/06** só entra no WASDE de ~10/07. Nas duas janelas o mercado já precificou um número que o motor não via. A
área plantada é insumo do fator 1 do milho ("Clima e safra EUA", peso Alto) e do balanço do fator 3 ("Estoques e
balanço — WASDE", peso Alto).

O usuário autorizou a implementação em 2026-09-28 ("o primeiro vamos fazer"), só da área plantada. Mesmo padrão de
autorização pontual dos ADRs 0001, 0013, 0015 e 0017–0025: vale **só para aquisição de dados**, sem nenhum fator.
O **Grain Stocks** ficou de fora: aguarda o Comitê dizer se o fator 3 usa a contagem trimestral de estoques.

## Por que o ESMIS e não a API do QuickStats

O reconhecimento começou pela API do QuickStats (a mesma chave do Crop Progress), que tem uma linha por estimativa
do ano (`YEAR - MAR ACREAGE`, `YEAR - JUN ACREAGE`, `AUG/SEP/OCT FORECAST`, `YEAR`). A primeira leitura registrou
"vintage real desde 2012, com `load_time` = data do relatório". **Estava errada**, e a verificação ano a ano
(2026-09-28) mostrou por quê:

- as estimativas de março de **2012 a 2017 têm todas `load_time` 2018-01-23** (carga em lote), e a de 2019 tem
  2020-02-05: o `load_time` só é a data do relatório de ~2020 em diante;
- a de junho (`JUN ACREAGE`) **só existe desde 2018**;
- faltam estimativas intermediárias em vários anos, e a linha `YEAR` é **sobrescrita** a cada revisão (a de 2024
  tem `load_time` 2025-09-30; a de 2026 é hoje igual à estimativa de setembro).

O **ESMIS** (`esmis.nal.usda.gov`), o arquivo de publicações do USDA que já sustenta o vintage do WASDE, guarda
**cada edição como foi publicada**:

| Publicação | Edições no ESMIS | Com ZIP (CSV) |
|---|---|---|
| Prospective Plantings (`/publication/prospective-plantings`) | 61, de 1964-03-18 a 2026-03-31 | 25, de **2002-03-28** a 2026-03-31 |
| Acreage (`/publication/acreage`) | 52, de 1975-06-30 a 2026-06-30 | 26, de **2001-06-29** a 2026-06-30 |

Antes do ZIP só há TXT/PDF, fora do escopo (como no WASDE, que também começa onde começa o arquivo legível).

## Evidência (chamadas reais, 2026-09-28)

- **Listagem:** HTML, 10 edições por página, com a data do release em `<time datetime>` e os links de PDF/TXT/ZIP;
  as linhas do topo se repetem em toda página. Sem API confirmada (o mesmo risco do ADR 0015).
- **Arquivo:** o ZIP de cada edição traz um CSV por tabela e um CSV com todas (`pspl_all_tables.csv`,
  `acrg_all.csv`, `ACRG_ALL.CSV`...). Cada linha começa pelo número da tabela e por um tipo (`t` título, `h`
  cabeçalho, `u` unidade, `d` dado).
- **Layout:** a tabela da área do milho muda de número e de título: nº 8 e "Corn: Area Planted by State and United
  States" (Prospective Plantings até 2013), nº 91 e "Corn Area Planted - States and United States" (de 2014), nº 11 e
  "Corn Area Planted for All Purposes and Harvested for Grain" (Acreage, com o título em duas linhas de 2003 a 2009 e
  colunas de área colhida). O total é "US" até 2009 e "United States" depois. O leitor acha a tabela pelo sentido do
  título, não pelo número.
- **As 51 edições com CSV lidas sem erro.** A data impressa no próprio CSV ("Released March 31, 2026") é igual à da
  listagem nas 51.
- **Conferência contra o QuickStats:** o valor do ano da edição é igual nas **15 edições de março (2012–2026)** e
  nas **9 de junho (2018–2026)** que a API tem.
- **Cada edição traz o ano corrente e 1 ou 2 anteriores**, com o valor que o USDA tinha naquele dia. Ex.: a edição
  de março de 2014 traz 2012 = 97.155, que a API mostra hoje como 97.291 (revisado depois).

## Decisão

1. **Coletor `usda-area-plantada-milho`** (`backend/src/collectors/usda/usda-area-plantada.collector.js`, leitor em
   `usda-area-plantada.parser.js`), registrado em `collectors/index.js`. Grava em `observation` (ADR 0008), fonte
   `USDA_NASS_AREA`.
2. **Uma série: `USDA.CORN.AREA_PLANTED`**, em **mil acres, como publicado**, só o total dos EUA. `observed_at` =
   1º/set do ano do plantio (a convenção do WASDE: safra 2026/27 = 2026-09-01), para ficar lado a lado com
   `WASDE.MILHO.EUA.AREA_PLANTED`. Cada edição grava o ano corrente e os anteriores que traz: cada um é uma versão
   (revisão = linha nova). O metadado diz o relatório e se o valor é **intenção** (o ano da edição do Prospective
   Plantings) ou **área plantada**.
3. **`published_at` REAL** (a data da listagem, conferida com a do CSV), no fim do dia em UTC: o relatório sai ao
   meio-dia de Washington, e a hora não vem na fonte (conservador, como no WASDE).
4. **Coleta diária:** a edição mais recente de cada publicação (2 listagens, 2 ZIPs pequenos); edições já gravadas
   são descartadas. **Backfill:** `npm run backfill:usda-area-plantada`, todas as edições com CSV, **uma execução**
   (~1,5 min). Em banco novo, o backfill vem ANTES da coleta diária: a diária se recusa a gravar com a série vazia
   (`persistirPorEdicao`, o mesmo mecanismo do WASDE e da Conab).
5. **Card nos Observáveis:** `USDA_MILHO_AREA_PLANTADA` ("Milho EUA - Área plantada (USDA)"), frequência `ANUAL`.

## Fora do escopo (de propósito)

- As **reestimativas de agosto a janeiro** (relatório Crop Production): saem no mesmo dia do WASDE e já estão em
  `WASDE.MILHO.EUA.AREA_PLANTED`. Por isso a leitura point-in-time desta série entre julho e março devolve o número
  de junho, não o mais recente do USDA: o mais recente está no WASDE.
- A quebra por estado, a área colhida (no Acreage), as outras culturas e as tabelas de biotecnologia.
- As edições anteriores a 2001-06 (só TXT/PDF).
- O **Grain Stocks**: reconhecido, com o mesmo arquivo no ESMIS (CSV desde 2001-06-29, número original de cada
  edição); aguarda o Comitê.

## Resultado (2026-09-28, banco de dev)

- Coleta diária com a série vazia: **recusada** (1 falha: "rode o backfill antes"), nada gravado.
- Backfill: **51 edições, 127 valores, 27 anos (2000–2026), 92 linhas** (27 criadas, 65 revisões, 35 iguais à versão
  anterior e ignoradas), **0 falhas**, ~1,5 min.
- Reexecução: coleta diária 0 criados / 5 ignorados; backfill repetido 0 criados / 127 ignorados, **0 falhas** (o
  backfill repetido do WASDE podia logar falhas espúrias; aqui o `persistirPorEdicao` descarta as edições já
  ingeridas).
- 0 duplicatas por (`observed_at`, `published_at`).
- **Point-in-time:** em 2026-04-15 a série devolve **95.338 mil acres** para 2026 (a intenção de 31/03), enquanto o
  WASDE ainda não tinha nenhum valor para a safra 2026/27. Safra 2012: 95.864 (intenção, 30/03/2012) → 96.405
  (Acreage, 29/06/2012) → 97.155 (28/03/2013).

## Consequências e limitações

- **Depende do HTML da listagem do ESMIS** e do layout do CSV, sem dicionário formal (há um `*_help.htm` no ZIP, não
  lido). Uma mudança de layout vira **falha explícita** da edição (tabela, colunas, total ou unidade inesperados),
  nunca um valor gravado errado.
- **Licença:** dado do governo dos EUA; termos do ESMIS não lidos (uso interno), como no ADR 0015.
- **Rate limit** do ESMIS não documentado: 1 s de pausa entre requisições, sem problema em ~70 requisições.
- **No servidor:** backfill rodado em 2026-09-28, com os mesmos números de dev (51 edições; 27 criados, 65 revisões,
  35 ignorados, 0 falhas, ~76 s). Em banco novo, repetir o backfill antes da coleta diária.
- Nenhum fator: como a área plantada (ou a diferença entre intenção e área plantada) entra no preço é definição do
  Comitê.
