# 0044 — Ouro: feed da LBMA fechado; futuro de ouro em dólar da B3 (GLD) na coleta diária

## Contexto

Em 2026-10-01 as três coletas da manhã do `lbma-gold-pm-usd` (ADR 0009) falharam com
`prices.lbma.org.uk respondeu com status 403`. O preço do ouro era coletado só dali.

**Autorização:** o usuário pediu em 2026-10-01 para verificar alternativas para o ouro e, com o levantamento em mãos,
respondeu "sim" à proposta: (1) reconhecer e implementar o futuro GLD da B3, (2) tirar o coletor da LBMA da coleta
diária e (3) registrar o fechamento do feed. **Só aquisição de dados**: se o GLD faz o papel do preço do ouro em
algum fator, decide o David.

## Evidência (chamada real, 2026-10-01)

- **LBMA:** `gold_pm.json`, `gold_am.json` e `silver.json` dão 403 (página "Sorry, you have been blocked" da
  Cloudflare) do servidor e de outra máquina, também com cabeçalhos de navegador e `Referer` do site da LBMA. A raiz
  `prices.lbma.org.uk/` responde 401. A página de preços da LBMA diz que o histórico "has been moved to our MyLBMA
  Portal" e que é preciso licença da IBA para "obtain, use or redistribute real-time or historical benchmark data".
  Não é instabilidade: o acesso público acabou.
- **Alternativas:** FMI PCPS (só mensal), Yahoo e Swissquote (não oficiais), Nasdaq Data Link e Bundesbank
  (republicam a LBMA), FRED (sem a LBMA desde 2022), BCB SGS 4 (encerrada em 2019), Stooq e CME (bloqueiam). Tabela em
  `docs/reconhecimento-fontes/b3-gld-ouro.md`.
- **B3 GLD:** o futuro de ouro em dólar estreou em 2025-07-21 (1 onça troy, cotado em US$/oz, liquidação só
  financeira, referência no LBMA Gold Price). Está no `TradeInformationConsolidatedFile` do Up2Data, o arquivo do CCM e
  do ICF, no segmento `FINANCIAL` (os agrícolas são `AGRIBUSINESS`). O Up2Data ainda tem o 1º pregão (`GLDQ25`, ajuste
  3.389,50): o histórico inteiro cabe no backfill. Volume financeiro em reais (1.025 × US$ 4.208,86 × ~5,18 = R$ 22,35
  milhões em 2026-09-30).

## Decisão

1. **Coletor `b3-gld-futuro`**: o GLD vira um produto de `b3-produtos.js`, no mesmo coletor do CCM e do ICF. O
   produto ganha o campo `segmento` (o filtro deixa de ser `AGRIBUSINESS` fixo). Séries `B3.GLD.<TICKER>.<CAMPO>`,
   preço em `USD/oz`, a mesma regra de `published_at` (fim do dia do pregão, estimado).
2. **Sem BDI:** o produto não tem coletor do BDI (`criarColetorFuturoBdi("gld")` recusa). O BDI traz o GLD só de
   2025-07-21 a 2025-12-11 e acrescentaria só abertura e contratos em aberto desse trecho.
3. **Backfill** `npm run backfill:b3-gld` (desde 2025-07-21). É urgente pelo mesmo motivo do CCM: a janela do Up2Data
   é rolante e o 1º pregão sai dela em breve.
4. **Cards** `GLD_PRECOS` e `GLD_LIQUIDEZ`, iguais aos do CCM e do ICF, sem os campos que só vêm do BDI.
5. **LBMA fora da coleta diária:** o coletor deixa de ser registrado (o código fica). O card `OURO_LBMA` continua
   mostrando o histórico (1968-04-01 a 2026-09-30) com a situação nova **Encerrada** (`encerradaEm` no catálogo), em
   vez de "Atrasada" para sempre.

## Fora do escopo (de propósito)

- Uma série contínua do GLD (encadear vencimentos): é um cálculo, do David.
- O ouro à vista em reais da B3 (OZ1/OZ2/OZ3, R$/g): outro instrumento, não pedido.
- A licença da IBA para voltar a ter o LBMA: adiada, como as outras (uso pessoal, 2026-10-01).

## Resultado (2026-10-01, banco de dev)

Backfill: 294 pregões (2025-07-21 a 2026-09-30), 601 linhas, **5.409 valores**, 0 falhas, em ~2 min. Reexecução:
0 criados, 5.409 ignorados. **Servidor (2026-10-01, informado pelo usuário):** os mesmos 601 lidos, 5.409 criados,
0 falhas. Contra o LBMA PM, em 286 pregões em comum (o vencimento mais negociado do dia), o ajuste do
GLD fica a 0,91% em média, 0,81% acima (custo de carregamento e horário do ajuste), no máximo 3,41%.

## Consequências e limitações

- O histórico longo do preço do ouro fica sendo o da LBMA já gravado, até 2026-09-30. Daí em diante, o GLD. As duas
  séries **não são a mesma**: emendá-las é decisão do David.
- O GLD é um futuro com rolagem e 1 ou 2 vencimentos negociando por dia; o histórico tem só 14 meses.
- Não confirmado se a liquidação usa o LBMA AM ou o PM.
- Os riscos do arquivo do Up2Data (sem documentação, janela rolante) são os do CCM (ADR 0009).
