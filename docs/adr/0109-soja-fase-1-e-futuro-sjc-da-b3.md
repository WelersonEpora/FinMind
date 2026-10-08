# 0109 — Soja, fase 1 (só aquisição de dados), começando pelo futuro SJC da B3

**Status:** aceita (2026-10-08).

## Contexto

A proposta da soja como 5º ativo (`docs/proposta-ativo-soja.md`, v2.2) define o preço de referência (o futuro SJC da
B3), 4 fatores, 3 regras sem peso e uma fase 1 só com fontes que o FinMind já coleta. A soja não está entre os 4 ativos
do FEL 1: aparece na lista curta (§5.2, CME ZS, liquidez "muito alta"), sem ter sido selecionada (§5.3). A aquisição de
dados está encerrada desde 2026-10-01, e fonte nova só entra com uma demanda específica e a autorização registrada num
ADR (`CLAUDE.md`).

**Autorização (usuário, Welerson, 2026-10-08, pelo mesmo poder de decisão do David):** começar a fase 1 da soja.
**Limite: só aquisição de dados**, das fontes da §2.13 da proposta. Nada da soja vai ao motor, ao prompt, ao Centro de
Decisão nem à IA: os fatores, as regras, os pesos e a agregação continuam com o Comitê e o David (§2.15 da proposta).
Esta autorização não é precedente para outra fonte nem para qualquer regra.

**Primeira fonte: o futuro SJC da B3.** O arquivo diário do Up2Data guarda só ~15 meses, e a janela anda: cada dia de
atraso perde um dia de histórico (o mesmo caso do GLD, ADR 0044). Por isso o preço vem antes das outras fontes da fase 1.

## Reconhecimento da fonte (`docs/processo-reconhecimento-fontes.md`)

| # | Pergunta | Resposta |
|---|---|---|
| 1 | API oficial? | Não. Os mesmos dois arquivos públicos da B3 do CCM e do ICF: o `TradeInformationConsolidatedFile` do Up2Data (CSV diário) e o Boletim Diário (BDI, PDF do capítulo de derivativos) |
| 2 | Pública ou com autenticação? | Pública |
| 3 | Cadastro ou chave? | Nenhum |
| 4 | Formato | CSV (Up2Data) e PDF (BDI) |
| 5 | Documentação | A ficha do produto na B3: "Contrato Futuro de Soja com Liquidação Financeira pelo Preço do Contrato Futuro Míni de Soja do CME Group", 450 sacas de 60 kg, cotação em US$ por saca com duas casas, vencimentos em janeiro, março, maio, julho, agosto, setembro e novembro, último dia de negociação no 2º dia útil antes do mês de vencimento. O layout dos arquivos é o mesmo do CCM (ADRs 0009 e 0020) |
| 6 | Histórico | BDI: de 2022-03-21 a 2025-12-11, com a tabela por vencimento (depois, o boletim só traz um resumo). Up2Data: a janela de ~15 meses |
| 7 | Revisa valores? | Não: preço de ajuste do pregão. Gravado em `observation`, como os outros futuros da B3 (um valor por vencimento e pregão) |
| 8 | Fuso e publicação | Pregão em Brasília; `published_at` estimado no fim do dia do pregão, como o CCM |
| 9 | Limite de requisições | Nenhum observado; o backfill usa 3 downloads em paralelo, como o do CCM |
| 10 | Licença | A mesma do CCM e do ICF: uso interno (pergunta 6 do FEL 1, ADR 0055) |
| 11 | Riscos | A janela rolante do Up2Data; o BDI no layout novo sem a tabela por vencimento; o título da tabela do SJC no BDI quebra em duas linhas (tratado, abaixo) |

**Conferências reais (2026-10-08):**
- Liquidez nos pregões de 2026-10-01 e 2026-10-07: 768 e 333 contratos, 10 vencimentos, na ordem do ICF do café. O
  outro contrato de soja da B3, o SOY (FOB Santos), teve zero negócios nos dois.
- O preço é o de Chicago: o SJCK24 fechou a 26,35 US$/saca em 2024-03-14, ou 11,95 US$/bushel (26,35 ÷ 2,2046), o
  nível do contrato de maio/2024 da CME naquele dia.
- O BDI tem a tabela do SJC no mesmo layout do CCM, de 2022-03-21 a 2025-12-11; o layout novo mostra
  "SJC: SOJA FINANCEIRA CROSS LISTING", sem a tabela.

## Decisão

1. **O SJC entra como mais um produto da B3** (`collectors/b3/b3-produtos.js`), com o coletor diário `b3-sjc-futuro`
   (Up2Data, segmento AGRIBUSINESS, US$/saca) e o backfill do BDI `b3-sjc-bdi`. Séries `B3.SJC.<TICKER>.<CAMPO>` em
   `observation`, os mesmos campos do CCM.
2. **O parser do BDI aceita título em duas linhas:** o título do SJC ("SJC: Soja com Liquidação Financeira Cross
   Listing (Contrato = 450 Sacas; Cotação =" e, na linha seguinte, "US$/60kg)") quebra antes de "Mercado Futuro".
   Enquanto o parêntese do título está aberto, a linha seguinte é a continuação dele. O CCM e o ICF não mudam.
3. **Dois cards** na tela de observáveis, como os outros futuros: Soja B3 (SJC) — Preços e — Liquidez.

## Implementação

- `b3-produtos.js` (o produto), `shared/utils/b3-contrato.js` (o símbolo), `collectors/index.js` (o registro),
  `b3-bdi-futuro.parser.js` (o título em duas linhas, com teste do caso real de 2024-03-15),
  `observaveis.service.js` (os cards) e os scripts `npm run backfill:b3-sjc` e `npm run backfill:b3-sjc-bdi`.
- Carga em dev (2026-10-08): Up2Data de 2025-06-10 a 2026-10-07 (334 pregões, 13.775 valores); BDI de 2022-03-21 a
  2025-12-11 (28.425 valores novos; os 5.016 do período em comum ficaram com o valor do Up2Data). No total, 949 pregões,
  0 falhas e nenhum valor repetido. O BDI tem o mesmo buraco de 2023 do CCM e do ICF: de fevereiro a novembro, quase sem
  boletim com a tabela.

## Consequências

- O servidor precisa dos dois backfills, nesta ordem: o do Up2Data e o do BDI (que só completa o que falta).
- As demais fontes da fase 1 (§2.13 da proposta) entram uma a uma, cada uma com o seu reconhecimento, citando esta
  autorização.
- A soja não tem Centro de Decisão, realizado, prompt nem leitura da IA: isso é a fase do motor, depois do Comitê.
