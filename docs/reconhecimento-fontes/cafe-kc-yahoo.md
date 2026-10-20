# Café arábica de Nova York (ICE KC) pelo Yahoo — reconhecimento

Nível **5** em dev (coletado, histórico que a fonte tem). Linha do índice: `docs/reconhecimento-fontes/README.md`.
Decisão, autorização e riscos: ADR 0129. Séries: `YAHOO.KC.<TICKER>.SETTLE` (com `.HIGH` e `.LOW`) e
`YAHOO.KC_CONTINUO.SETTLE`. Coletor: `yahoo-kc-futuro` (`collectors/yahoo/yahoo-futuro.collector.js`, o mesmo molde do
Brent, ADR 0096).

Motivo do reconhecimento: a análise do café de 2026-10-19 (`STATUS_DO_PROJETO.md`, §0) pede o basis B3 × Nova York
(E1), a curva de Nova York (E3) e um histórico diário longo do café (E3, E4 e E10). O FinMind só tinha a média mensal de
Nova York da ICO (ADR 0061). A oficial, a ICE, é paga: o diário do KC ficou "só com orçamento e licença"
(`cafe-fontes-novas-motor-v1.md`, §6).

## Alternativas testadas (chamada real, 2026-10-20)

| Fonte | Resultado | Serve? |
|---|---|---|
| ICE — dados atrasados do site (`DelayedMarkets.shtml`) | 403 (Cloudflare) | Não |
| ICE — API de gráficos do site (`productguide/charting/contract-data`) | 200 com lista vazia | Não |
| ICE — assinatura de fim de dia | Paga | A fonte oficial; decisão de custo |
| **Yahoo Finance** | 200, JSON, sem chave, com o user-agent do FinMind | **Sim, provisória e não oficial** (ADR 0129) |

## Checklist

| # | Pergunta | Resposta | Evidência |
|---|---|---|---|
| 1 | API oficial? | Não: `query1.finance.yahoo.com/v8/finance/chart/<símbolo>`, a mesma do Brent, sem documentação | chamada real |
| 2 | Pública ou autenticada? | Pública | chamada real |
| 3 | Cadastro/chave? | Não | chamada real |
| 4 | Formato | JSON: `meta` com moeda `USX` (centavos de dólar) e bolsa `NYB`, `timestamp` (meia-noite de Nova York), `close`, `high` e `low`. Ex.: `KCH27.NYB`, 19/10/2026, 302,25 | chamada real |
| 5 | Documentação oficial | Nenhuma da API. Do contrato: ICE Futures U.S., Coffee "C" (KC), 37.500 lb, em centavos de dólar por libra-peso; vencimentos em março, maio, julho, setembro e dezembro | — |
| 6 | Histórico | 7 vencimentos ativos em 2026-10-20 (KCZ26 a KCH28), cada um desde a listagem (2024-01-02 a 2025-04-01); o vencido some no dia seguinte ao vencimento (KCU26, KCK28 e KCF27: "Not Found"); contínua `KC=F` desde 2000-01-03 (6.718 pregões) | chamada real, banco de dev |
| 7 | Revisões (vintage) | Não medidas. A coleta diária relê o último mês: uma correção vira versão nova | — |
| 8 | Fuso / `published_at` | Barra diária na data de Nova York. O pregão fecha às 13:30 ET. O fechamento é o ajuste: no KCH27, o diário de 15, 16 e 19/10/2026 (285,35, 294,50 e 302,25) difere do último negócio das 13:25 (287,25, 294,60 e 299,80). A barra do dia aparece com o pregão aberto: não gravada. `published_at` estimado no fim do dia em Nova York | chamada real |
| 9 | Limite de requisições | Não documentado. A coleta faz 8 pedidos (7 vencimentos e a contínua) com 300 ms entre eles | chamada real |
| 10 | Licença | Termos do Yahoo não preveem coleta automática; o dado é da ICE. Uso pessoal, risco aceito pelo usuário (ADR 0129) | — |
| 11 | Riscos técnicos | Endpoint pode mudar ou fechar; volume com dias repetidos (15 e 16/10/2026; não gravado); a contínua rola sem ajuste no pregão depois do último negócio (21/09/2026: de 294,55 no KCU26 para 276,40 no KCZ26) | chamada real |
