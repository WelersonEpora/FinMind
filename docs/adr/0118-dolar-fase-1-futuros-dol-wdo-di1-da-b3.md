# 0118 — Dólar, fase 1 (só aquisição de dados): os futuros DOL, WDO e DI1 da B3

**Status:** aceita (2026-10-09).

## Contexto

O dólar (USD/BRL) entrou como ativo em 2026-10-09, na fase 1, só aquisição de dados (ADR 0117, decisão do usuário,
Welerson, pelo mesmo poder de decisão do David). Esta fonte entra por essa autorização, com o mesmo limite: nada vai ao
motor, ao prompt, ao Centro de Decisão nem à IA.

No relatório do Comitê de 2026-10-08, o dólar futuro (DOL e WDO) é o instrumento do motor e a fonte dos fatores 1 e 2
(tendência e volume), e do 5 (o gap de abertura). O DI1 é o fator 15 (a curva pré: DI1F27, DI1F29 e DI1F31). Os três vêm no
mesmo arquivo diário do Up2Data que o FinMind já baixa para o milho, o café, o ouro e a soja.

**Por que é a primeira fonte:** o arquivo do Up2Data só guarda ~15 meses, e a janela anda: cada dia de atraso perde um dia
de histórico (o caso do GLD, ADR 0044, e do SJC, ADR 0109).

## Reconhecimento da fonte (`docs/processo-reconhecimento-fontes.md`)

| # | Pergunta | Resposta |
|---|---|---|
| 1 | API oficial? | Não. O arquivo público `TradeInformationConsolidatedFile` do Up2Data (o mesmo do CCM, ADR 0009) |
| 2 | Pública ou com autenticação? | Pública |
| 3 | Cadastro ou chave? | Nenhum |
| 4 | Formato | CSV diário, com todos os derivativos (~6 MB) |
| 5 | Documentação | As fichas dos contratos na B3. DOL: US$ 50.000; WDO: US$ 10.000; os dois cotados em R$ por US$ 1.000, vencimento em todos os meses, liquidados pela PTAX. DI1: a taxa DI acumulada até o vencimento, negociada em taxa (% a.a., base 252) e liquidada em PU (100.000 no vencimento) |
| 6 | Histórico | A janela de ~15 meses do Up2Data. O Boletim Diário (BDI) do segmento financeiro não foi avaliado: o histórico longo do câmbio é a PTAX, desde 1994 (ADR 0001) |
| 7 | Revisa valores? | Não: preço de ajuste do pregão. Gravado em `observation`, como os outros futuros da B3 (um valor por vencimento e pregão) |
| 8 | Fuso e publicação | Pregão em Brasília; `published_at` estimado no fim do dia do pregão, como o CCM |
| 9 | Limite de requisições | Nenhum observado; o backfill usa 3 downloads em paralelo |
| 10 | Licença | A mesma dos outros futuros da B3: uso interno (pergunta 6 do FEL 1, ADR 0055) |
| 11 | Riscos | A janela rolante; o DI1 com unidades diferentes por campo (abaixo); a maior parte dos vencimentos do DOL sem negócio (só o ajuste) |

**Conferências reais (arquivos de 2025-07-01 e 2026-10-08):**

- **Segmento `FINANCIAL`** nos três, com tickers no formato dos outros futuros (DOLX26, WDOX26, DI1F27). O arquivo traz
  também o ETF DOLX11 (segmento `CASH`), que o filtro descarta.
- **DOL e WDO** têm o **mesmo preço de ajuste** em todos os vencimentos (DOLX26 e WDOX26: 5.040,028 em 2026-10-08, ou
  R$ 5,04 por dólar). O negócio se concentra no 1º vencimento: em 2026-10-08, 277.000 contratos de DOLX26 e 2.255.158 de
  WDOX26. Os outros ~20 vencimentos aparecem todo dia só com o ajuste.
- **DI1:** 39 vencimentos em 2025-07-01 e 44 em 2026-10-08. A **mínima, a máxima, a média e o último vêm em taxa** (DI1F27:
  13,451% a.a. no último), mas **o ajuste vem em PU** (97.186,98), com a **taxa de ajuste na coluna `AdjstdQtTax`**
  (13,445%). Os vencimentos longos sem negócio trazem só o PU e a taxa de ajuste.

## Decisão

1. **DOL, WDO e DI1 entram como mais três produtos da B3** (`collectors/b3/b3-produtos.js`), com os coletores diários
   `b3-dol-futuro`, `b3-wdo-futuro` e `b3-di1-futuro` (Up2Data, segmento `FINANCIAL`). Séries
   `B3.<PRODUTO>.<TICKER>.<CAMPO>` em `observation`, os mesmos campos dos outros futuros. Sem BDI.
2. **O WDO entra junto com o DOL**, mesmo com o mesmo ajuste: é onde está a liquidez (o volume do fator 2 do relatório é o
   do DOL e do WDO).
3. **Unidade por campo** (`unidadesCampo`, novo em `b3-produtos.js`): no DI1, os campos de preço ficam em `pct_aa`, o
   ajuste (`SETTLE`) em `BRL_PU` e a taxa de ajuste (`ADJ_RATE`) em `pct_aa`. Os outros produtos não mudam.
4. **Seis cards** na tela de observáveis: preços e liquidez do DOL, do WDO e do DI1. O do DI1 se chama "Taxas e PU", abre
   na taxa de ajuste e tem o PU como outro campo.
5. **Vencimentos padrão no gráfico** (`quantidadePadrao` e `mesesPadrao` em `porVencimento`, novos): o DOL e o WDO abrem nos
   3 vencimentos ativos mais próximos; o DI1, nos 6 janeiros ativos mais próximos (os vértices de referência). Os demais
   continuam disponíveis para seleção. Os outros futuros não mudam (sem a configuração, abrem em todos os ativos).

## Implementação

- `b3-produtos.js` (os produtos e `unidadesCampo`), `b3-futuro.collector.js` (a unidade por campo),
  `shared/utils/b3-contrato.js` (os símbolos), `collectors/index.js` (o registro), `observaveis.service.js` (os cards; o
  texto da metodologia do card sem BDI passou a ser de cada produto, antes era só o do GLD), `observation-data.service.js`
  (os vencimentos padrão) e os scripts `npm run backfill:b3-dol`, `npm run backfill:b3-wdo` e `npm run backfill:b3-di1`.
- Testes com as linhas reais de 2026-10-08 (DOL, WDO, o ETF DOLX11 e o DI1F27).
- Carga em dev (2026-10-09): os três de 2025-06-10 a 2026-10-08, 335 pregões cada, 0 falhas. DOL: 39 vencimentos, 13.365
  valores; WDO: 38 vencimentos, 18.666 valores; DI1: 60 vencimentos, 134.996 valores.

## Consequências

- O servidor precisa dos três backfills (`npm run backfill:b3-dol`, `npm run backfill:b3-wdo` e `npm run backfill:b3-di1`),
  em qualquer ordem, o quanto antes (a janela é rolante).
- O preço de referência do dólar (a PTAX ou o DOL) é decidido na proposta dos fatores (ADR 0117).
- As demais fontes da fase 1 entram uma a uma, cada uma com o seu reconhecimento, citando o ADR 0117.
