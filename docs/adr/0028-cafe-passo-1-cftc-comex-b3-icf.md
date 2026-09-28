# 0028 — Café, passo 1: COT do Coffee C (CFTC), exportação de café verde (Comex Stat) e futuro ICF (B3)

## Contexto

O FEL 1 põe o café em primeiro na ordem de desenvolvimento (CAFÉ → PETRÓLEO → MILHO → OURO, §5.5). Em 2026-09-26 o
usuário decidiu que as fontes do café entram numa **onda completa**, inclusive o clima pela NOAA STAR, com as regiões
escolhidas a partir das fontes de produção do café. Em 2026-09-28 o usuário autorizou começar a onda pelo **passo 1**:
as fontes do café que reaproveitam coletores já existentes ("vale a pena seguir com o passo 1 e registrar no status do
projeto"; "Sim" à proposta de implementação e registro). Mesmo padrão de autorização pontual dos ADRs 0001, 0013,
0015 e 0017–0027: vale **só para aquisição de dados**, sem nenhum fator, sinal ou regra, e **não é precedente** para as
demais fontes do café (Conab café, estoques certificados da ICE, ICO, USDA FAS, Cecafé), que entram cada uma no seu ADR.

O que cada fonte deste passo cobre no FEL 1:

| Fonte | Onde o FEL 1 a cita | Fator do café na planilha (`controle_fatores.xlsx`) |
|---|---|---|
| CFTC COT, Coffee C (ICE) | Calendário de relatórios ("COT — Ouro, Petróleo, Café, Milho") | "Especulação e posicionamento de fundos" (CFTC COT, ICE) |
| Comex Stat, café verde | Tabela de fontes do café ("Exportações brasileiras de café: volume, valor, destinos") e calendário ("Exportações (Comex Stat) — Café, Milho") | Não nomeado em nenhum fator do café; o uso fica para o Comitê |
| B3, futuro ICF | Contratos priorizados (§5, "Café Arábica B3 ICF") e séries de preço (§6.5.2) | O preço do ativo, não um fator |

## Evidência (chamadas reais, 2026-09-28)

**CFTC.** No dataset Socrata `72hh-3qpy` (o mesmo do ouro e do milho), o café é o código **`083731`**: 995 semanas como
"COFFEE C - ICE FUTURES U.S." e 64 como "COFFEE C - NEW YORK BOARD OF TRADE" (o nome antigo da bolsa, o mesmo código).
São 1.059 semanas, de **2006-06-13 a 2026-09-22**, a mesma cobertura do ouro e do milho.

**Comex Stat.** A busca de NCMs por "café" (`/tables/ncm`) devolve 14 códigos. O **`09011110`** ("café não torrado, não
descafeinado, em grão", o café verde) tem dado plausível desde **1997**, o primeiro ano do Comex Stat:

| Ano | Volume | Em sacas de 60 kg |
|---|---|---|
| 1997 | 868 mil t | 14,5 milhões |
| 2000 | 966 mil t | 16,1 milhões |
| 2004 | 1,41 Mt | 23,5 milhões |
| 2005 | 1,35 Mt | 22,5 milhões |
| 2024 | 2,77 Mt | 46,1 milhões (o recorde conhecido) |

O café solúvel (`21011110`) também responde (2024: 90,9 mil t), mas fica de fora: é peso de produto, não de café verde,
e somá-lo exigiria uma conversão que seria escolha do FinMind. Torrado e descafeinado são pequenos. Diferente do milho,
não há mudança de NCM a mapear: um único código cobre a série inteira.

**B3, arquivo diário (Up2Data).** O `TradeInformationConsolidatedFile` de 2026-09-25 traz o ICF no **mesmo layout** do CCM
(segmento `AGRIBUSINESS`, ticker `ICF<mês><aa>`). ICFZ26 e ICFH27 negociaram. Os outros vencimentos só trazem o preço de
ajuste. Os preços são em **US$/saca** (a cotação do contrato), mas o **volume financeiro é em R$**: 539 contratos × 100
sacas × US$ 338,94 × ~5,19 = R$ 94,8 milhões, o valor do arquivo. O conilon (**CNL**) aparece com preço de referência e
**nenhum negócio** em 5 vencimentos: fica de fora, como o FEL 1 já apontava (liquidez nula).

**B3, Boletim Diário (BDI).** Os PDFs de 2022-03-21 e 2024-06-14 têm a tabela "ICF: Café Arábica 4/5 (Contrato = 100
Sacas; Cotação = US$/60kg) — Mercado Futuro" com as **mesmas 13 colunas** do CCM e os mesmos defeitos já tratados
(contratos e volume colados numa célula; formato numérico americano até 2023 e brasileiro depois). O volume também é em
R$: 303 contratos × 100 sacas × US$ 274,20 × ~5,38 = R$ 44,7 milhões (U24, 2024-06-14).

**B3, arquivo `Indic` (descartado para o café).** O arquivo de onde vem o Indicador do Milho CEPEA/ESALQ (ADR 0021)
**não traz o café**: de agro, só milho (`IAMIL`), boi (`IABOIDI`), etanol (`IAETH`) e soja (`RTSOY`). O preço à vista do
café segue sem fonte automatizável (a CEPEA bloqueia automação).

## Decisão

- **Os coletores do milho viram genéricos por produto**, sem mudar nada do milho (mesmos códigos de coletor, mesmas
  séries, mesmos comandos npm; a coleta de 2026-09-28 do milho criou 0 linhas e ignorou todas):
  - `collectors/b3/b3-futuro.collector.js` (antes `b3-ccm.collector.js`), `b3-futuro-bdi.collector.js` (antes
    `b3-ccm-bdi.collector.js`) e `b3-bdi-futuro.parser.js` (antes `b3-bdi-ccm.parser.js`), com os produtos em
    `b3-produtos.js` (símbolo, prefixo das séries, unidade do preço e título da tabela no BDI);
  - `collectors/comex/comex-exportacao.collector.js` (antes `comex-milho-exportacao.collector.js`), um produto por NCM;
  - `shared/utils/b3-contrato.js::decodificarFuturoB3` aceita CCM e ICF.
- **Coletores novos**, na coleta diária: `cftc-cot-coffee`, `comex-cafe-exportacao` e `b3-icf-futuro`. O
  `b3-icf-bdi` é só backfill, como o `b3-ccm-bdi` (a tabela por vencimento acabou em 2025-12-11).
- **Séries** (todas em `observation`, sem tabela nova): `CFTC.COFFEE.{OPEN_INTEREST,MM_LONG,MM_SHORT}`,
  `COMEX.CAFE.EXPORT.{KG,FOB_USD}` e `B3.ICF.<TICKER>.<CAMPO>`, com o preço em `USD/saca` e o volume em `BRL`.
- **Backfill**: `npm run backfill:comex-cafe` (desde 1997), `npm run backfill:b3-icf` e depois
  `npm run backfill:b3-icf-bdi` (a mesma ordem do CCM: o BDI só completa o que o Up2Data não tem). A CFTC não precisa:
  a coleta diária já pede o histórico inteiro.
- **Cards**: `COT_CAFE`, `COMEX_CAFE_VOLUME`, `COMEX_CAFE_VALOR`, `ICF_PRECOS` e `ICF_LIQUIDEZ`, pela mesma tela de
  detalhe dos demais.

## Carga em dev (2026-09-28)

- **Coleta diária:** `cftc-cot-coffee` criou 3.177 linhas (1.059 semanas × 3 séries), `comex-cafe-exportacao` 40 (2025 e
  2026) e `b3-icf-futuro` 97 (5 pregões; o de 2026-09-28 ainda "Parcial", como sempre durante o dia). Os coletores do
  milho, já generalizados, rodaram em seguida e criaram 0 linhas.
- **`backfill:comex-cafe`:** 6 blocos em `success`, **356 meses por série, de 1997-01 a 2026-08**, 0 falhas. A soma
  mensal bate com o total anual da API em 1997, 2000, 2005 e 2024 (14,5, 16,1, 22,5 e 46,1 milhões de sacas).
- **`backfill:b3-icf`:** 326 pregões do Up2Data, de **2025-06-10** (o mesmo início de janela do CCM) a 2026-09-25, 13
  vencimentos, 10.282 observações.
- **`backfill:b3-icf-bdi`:** 988 dias úteis, **747 boletins com a tabela do ICF** (o CCM teve 745), de 2022-03-21 a
  2025-12-11, 308 no formato americano e 439 no brasileiro, 0 erros, 24.570 observações novas (~33 min em dev). A
  conferência cruzada com o Up2Data comparou 3.681 valores do período em comum: **0 divergências**. O buraco é o mesmo
  do CCM: **de 2023-02-03 a novembro de 2023** os boletins saíram sem o capítulo de derivativos (185 pregões), e mais 5
  dias soltos (2 em dez/2024, 2 em fev/2025, 1 em set/2025).
- **Resultado:** o ICF tem **943 pregões desde 2022-03-21, em 30 vencimentos**.

## Consequências

- **Produção:** rodar na VM, depois do deploy, `backfill:comex-cafe`, `backfill:b3-icf` e `backfill:b3-icf-bdi`, nessa
  ordem para o ICF.
- **Custo:** o `b3-ccm-futuro` e o `b3-icf-futuro` baixam o mesmo arquivo do Up2Data (~6 MB por pregão), um download a
  mais por dia útil. Cada um falha e é reexecutado sozinho. Se pesar, os dois podem ler um download só.
- **Licença:** a mesma do CCM para o preço da B3 (pergunta 6 da §4 do status: uso interno); CFTC e Comex Stat, as mesmas
  ressalvas dos ADRs 0009 e 0013.
- **Fora deste passo:** preço do KC (ICE, só pago: a mesma lacuna do ZC, pergunta 2), café solúvel, torrado e
  descafeinado, conilon (CNL), à vista do café (sem fonte automatizável) e o risco de geada (sem indicador pronto
  gratuito; montar um seria regra do David).
- **Próximos passos da onda do café:** Conab (Boletim da Safra de Café), que define as regiões do clima; depois NOAA STAR
  café (`ACOF`/`RCOF`, ADR 0025); reconhecimento dos estoques certificados da ICE, do USDA FAS (PSD e *Coffee: World
  Markets and Trade*) e da ICO; reconhecimento rápido de Cecafé, MAPA e Embrapa.
