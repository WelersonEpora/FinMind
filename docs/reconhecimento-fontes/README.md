# Índice de reconhecimento de fontes

Uma linha por fonte. Processo, checklist e definição dos níveis 0–5:
`docs/processo-reconhecimento-fontes.md`. A evidência (chamadas reais, números)
vive nos ADRs — este índice só aponta.

**Última atualização: 2026-09-21** (registro retroativo das 7 fontes já implementadas).

## Fontes implementadas

| Fonte | Nível | Incertezas em aberto | Evidência |
|---|---|---|---|
| BCB SGS — dólar (série 1) | 5 | Histórico desde 01/07/1994 carregado em dev e produção (2026-09-21). Limite da API: 10 anos por pedido (406 acima). Rate limit não verificado | ADR 0001 |
| BCB SGS — Selic (432 meta, 1178 realizada) | 5 | Idem (meta desde 05/03/1999, realizada desde 04/07/1994). A meta traz datas futuras, até a próxima reunião do Copom (o BCB publica o alvo vigente); a janela de 2014–2024 da meta falhou uma vez com HTML no lugar de JSON e passou na repetição | ADR 0006 |
| FRED — DGS10, T10YIE, DFII10, DTWEXBGS | 5 | Licença lida em 2026-09-21: 3 de 4 séries são domínio público com citação; `T10YIE` não confirmada; **adiada** (sem distribuição prevista). Coleta via API com chave, CSV de reserva; chave `FRED_API_KEY` já está na VM. `published_at` estimado; vintage real só provado por teste (ALFRED cobre só de ~2015–2018 em diante). Reserva CSV `fredgraph.csv` não é a API documentada | ADRs 0009, 0011, 0012 · [fred.md](fred.md) |
| LBMA — ouro PM (USD/oz) | 5 | **Exige licença da IBA** para obter/usar/redistribuir o histórico; **adiada** (sem distribuição prevista, uso interno). Feed JSON não documentado. `published_at` estimado | ADR 0009 · [lbma.md](lbma.md) |
| CFTC COT — ouro e milho | 5 | `published_at` real só desde 2022-08; antes, estimado pelo cronograma. Licença: governo dos EUA, não verificado juridicamente | ADR 0009 |
| USDA NASS — Crop Progress do milho | 5 (dev) | Em produção o histórico 1980+ entra na próxima coleta. `published_at` estimado e **não validado para 1980–2005**. Exige chave gratuita | ADR 0009 |
| Comex Stat (MDIC) — exportação de milho | 5 (dev) · 4 (produção) | **Cobertura só a partir de 2005** (o NCM anterior muda e não foi mapeado; pode ser estendido). API pública sem chave; rate limit rígido (429, backoff crescente); revisões da fonte não confirmadas; `published_at` estimado; licença não explícita (uso interno). Falta o backfill na VM | ADR 0013 |
| B3 — futuros CCM por vencimento | 5 (limitado) | Só existe uma **janela de ~15 meses** de graça; 10+ anos exigem fonte paga (decisão de orçamento). Feed sem documentação oficial | ADR 0009 |

## Candidatas (nível 0 — sem coletor, sem autorização)

Todas listadas no relatório do David (FEL 1). Nenhuma tem coletor nem
reconhecimento no FinMind; a lista de trabalho está em `STATUS_DO_PROJETO.md` §3.
Entrar em implementação exige a decisão do David ou autorização explícita
registrada em ADR (`CLAUDE.md`). "AgroMind" indica o nível que a fonte tem lá.

| Fonte | Observação |
|---|---|
| USDA FAS — PSD Online / WASDE | Oferta e demanda global; exige chave. AgroMind: nível 0 |
| Conab | Boletins XLSX/PDF, sem API. AgroMind: balanço nível 5; preços bloqueados (reCAPTCHA) |
| IMEA (MT) | Boletins XLSX/PDF. AgroMind: nível 4, só o valor mais recente |
| CEPEA | Bloqueada para automação (Cloudflare) — pergunta 7 do David |
| FAO/AMIS | FAOSTAT API; nunca reconhecida |
| BCB Focus | Expectativas de mercado. AgroMind: nível 3 (Selic) |
| Clima — NOAA, INMET, NASA POWER, CPTEC/INPE, ECMWF ERA5 | Acrescentadas na revisão do relatório. AgroMind: NOAA nível 0 |
| Abimilho, CNA | Estatísticas do setor, sem API |
| CPI (BLS/FRED) | Candidata nossa (não do relatório) a primeira série revisável de verdade (ADR 0011) |
| WGC (ouro) | Só citada no relatório do David |
