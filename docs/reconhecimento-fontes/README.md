# Índice de reconhecimento de fontes

Uma linha por fonte. Processo, checklist e definição dos níveis 0–5:
`docs/processo-reconhecimento-fontes.md`. A evidência (chamadas reais, números)
vive nos ADRs — este índice só aponta.

**Última atualização: 2026-09-21** (registro retroativo das 7 fontes já implementadas).

## Fontes implementadas

| Fonte | Nível | Incertezas em aberto | Evidência |
|---|---|---|---|
| BCB SGS — dólar (série 1) | 4 | Carga histórica não feita: o banco de dev tem ~60 dias (o backfill existe: `npm run backfill:dolar`). Rate limit não verificado | ADR 0001 |
| BCB SGS — Selic (432 meta, 1178 realizada) | 4 | Idem: ~60 dias no dev (`npm run backfill:selic`). Rate limit não verificado | ADR 0006 |
| FRED — DGS10, T10YIE, DFII10, DTWEXBGS | 5 | Licença lida em 2026-09-21: 3 de 4 séries são domínio público com citação; `T10YIE` não confirmada; **adiada** (sem distribuição prevista). Coleta via API com chave, CSV de reserva; **falta `FRED_API_KEY` na VM**. `published_at` estimado; vintage real só provado por teste (ALFRED cobre só de ~2015–2018 em diante). Reserva CSV `fredgraph.csv` não é a API documentada | ADRs 0009, 0011, 0012 · [fred.md](fred.md) |
| LBMA — ouro PM (USD/oz) | 5 | **Exige licença da IBA** para obter/usar/redistribuir o histórico; **adiada** (sem distribuição prevista, uso interno). Feed JSON não documentado. `published_at` estimado | ADR 0009 · [lbma.md](lbma.md) |
| CFTC COT — ouro e milho | 5 | `published_at` real só desde 2022-08; antes, estimado pelo cronograma. Licença: governo dos EUA, não verificado juridicamente | ADR 0009 |
| USDA NASS — Crop Progress do milho | 5 (dev) | Em produção o histórico 1980+ entra na próxima coleta. `published_at` estimado e **não validado para 1980–2005**. Exige chave gratuita | ADR 0009 |
| B3 — futuros CCM por vencimento | 5 (limitado) | Só existe uma **janela de ~15 meses** de graça; 10+ anos exigem fonte paga (decisão de orçamento). Feed sem documentação oficial | ADR 0009 |

## Candidatas (nível 0 — fora do escopo, sem autorização)

Nenhuma destas tem coletor nem reconhecimento no FinMind. Entrar exige
autorização explícita registrada em ADR (`CLAUDE.md`).

| Fonte | Observação |
|---|---|
| CEPEA | Bloqueada para automação (Cloudflare) — pergunta 7 do David |
| Conab, IMEA | Já reconhecidas no AgroMind; não reavaliadas aqui |
| WASDE / PSD (USDA), NOAA (clima) | Nível 0 também no AgroMind; NOAA/USDA-PSD dependem de chave |
| CPI (BLS/FRED) | Candidata a primeira série revisável de verdade (ADR 0011) |
| WGC (ouro) | Só citada no relatório do David |
