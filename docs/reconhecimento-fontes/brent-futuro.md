# Brent futuro (NYMEX BZ) pelo Yahoo — reconhecimento

Nível **5** em dev (coletado, histórico que a fonte tem). Linha do índice: `docs/reconhecimento-fontes/README.md`.
Decisão, autorização e riscos: ADR 0096. Séries: `YAHOO.BZ.<TICKER>.SETTLE` e `YAHOO.BZ_CONTINUO.SETTLE`. Coletor:
`yahoo-brent-futuro` (`collectors/yahoo/yahoo-brent-futuro.collector.js`).

Motivo do reconhecimento: o preço de referência do petróleo é o do instrumento operado (P2, ADR 0055), o Brent
**futuro**; o FinMind só tinha o Brent **físico** da EIA, publicado uma vez por semana (ADR 0040).

## Alternativas testadas (chamada real, 2026-10-07)

| Fonte | Resultado | Serve? |
|---|---|---|
| ICE — Report Center, "Futures" de fim de dia | Página pública; API do relatório 409 fora do navegador; cotação atrasada 403 (Cloudflare) | Só para conferência manual: a entrega automática é paga (política de dados da ICE, §2.6) |
| ICE — assinatura de fim de dia (ICE Futures Europe – Commodities) | US$ 2.500/ano + US$ 50 por trimestre de histórico (desde 2013-Q2) | A fonte oficial; decisão do Comitê (P3, ADR 0055) |
| CME (BZ) | 403, bloqueio por "web scraping" | Não |
| Stooq | Desafio de JavaScript | Não |
| **Yahoo Finance** | 200, JSON, sem chave | **Sim, provisória e não oficial** (ADR 0096) |
| Pepperstone | Não testado (exige conta) | A conferir |

## Checklist

| # | Pergunta | Resposta | Evidência |
|---|---|---|---|
| 1 | API oficial? | Não: `query1.finance.yahoo.com/v8/finance/chart/<símbolo>`, usado pelo próprio site, sem documentação | chamada real |
| 2 | Pública ou autenticada? | Pública | chamada real |
| 3 | Cadastro/chave? | Não. Responde 429 ao user-agent do curl e 200 ao do FinMind | chamada real |
| 4 | Formato | JSON: `meta` (símbolo, moeda, bolsa), `timestamp` (meia-noite de Nova York) e `indicators.quote[0].close`. Ex.: `BZZ26.NYM`, 06/10/2026, 100,58 | chamada real |
| 5 | Documentação oficial | Nenhuma da API. Do contrato: NYMEX "Brent Crude Oil Last Day Financial" (BZ), liquidado pelo ICE Brent | — |
| 6 | Histórico | Vencimentos ativos desde a listagem (2018 a 2020); vencido some no dia seguinte ao vencimento; contínua `BZ=F` desde 2007-07-30 (4.776 pregões, 58 sem fechamento) | chamada real, banco de dev |
| 7 | Revisões (vintage) | Não medidas. A coleta diária relê o último mês: uma correção vira versão nova | — |
| 8 | Fuso / `published_at` | Barra diária na data de Nova York. O fechamento é o ajuste (14:28–14:30 ET), conferido em 21 pregões. A barra do dia aparece com o pregão aberto: não gravada. `published_at` estimado no fim do dia em Nova York | chamada real |
| 9 | Limite de requisições | Não documentado; 429 com user-agent de ferramenta. A coleta faz 14 pedidos com 300 ms entre eles | chamada real |
| 10 | Licença | Termos do Yahoo não preveem coleta automática; o dado é da CME. Uso pessoal, risco aceito pelo usuário (ADR 0096) | — |
| 11 | Riscos técnicos | Endpoint pode mudar ou fechar; volume com dias repetidos (não gravado); NYMEX em vez de ICE (centavos de diferença no ajuste) | chamada real |
