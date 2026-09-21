# FRED — reconhecimento

Nível **5** (coletado e com histórico completo). Linha do índice:
`docs/reconhecimento-fontes/README.md`. Evidência detalhada: ADR 0009 e ADR 0011.
Séries: `DGS10`, `T10YIE`, `DFII10`, `DTWEXBGS`. Coletor: `collectors/fred/fred.collector.js`.

| # | Pergunta | Resposta | Evidência |
|---|---|---|---|
| 1 | API oficial? | Sim: REST (`/fred/series/observations`) e ALFRED (vintages). O coletor diário usa a API com chave; sem chave, cai no CSV do gráfico do site (reserva) | ADRs 0011, 0012 |
| 2 | Pública ou autenticada? | CSV sem autenticação; REST exige chave | ADRs 0009, 0011 |
| 3 | Cadastro/chave? | CSV: não. REST: chave gratuita (`FRED_API_KEY`, registrada em 2026-09-21) | ADR 0011 |
| 4 | Formato | JSON na REST (coleta diária, com chave); CSV na reserva. As duas vias devolvem as mesmas observações (0 diferenças nas 4 séries) | ADR 0012 |
| 5 | Documentação oficial | Existe para a REST. O `fredgraph.csv` (reserva) é o endpoint do gráfico do site e não foi confirmado como interface documentada/estável | — |
| 6 | Histórico | `DGS10` desde 1962; `DFII10` e `T10YIE` desde 2003; `DTWEXBGS` desde 2006 | ADR 0009 |
| 7 | Revisões (vintage) | Medido no ALFRED: `DGS10`/`DFII10`/`T10YIE` **0 revisões** (~2.100 observações); `DTWEXBGS` **33 revisões** em ~380. ALFRED só cobre vintage de ~2015–2018 em diante (varia por série) | ADR 0011 |
| 8 | Fuso / `published_at` | Datas de observação em dia (calendário EUA). Publicação **estimada**: 1 dia útil depois (H.15); `DTWEXBGS` na segunda seguinte (divulgação semanal). Não considera feriados dos EUA | ADR 0009 |
| 9 | Limite de requisições | **Não verificado** | — |
| 10 | Licença | Lida em 2026-09-21 (páginas oficiais; resumo automático, não parecer jurídico). `DGS10`, `DFII10`, `DTWEXBGS`: "Public Domain: Citation Requested" (Board of Governors) — uso comercial interno permitido com citação. `T10YIE`: status **não confirmado**. Termos da API: sem sugerir endosso do Fed; aviso de "não endossado" ao exibir a terceiros. Uso atual: pesquisa interna | ADR 0009 |
| 11 | Riscos técnicos | Reserva CSV não documentada (pode mudar); produção precisa de `FRED_API_KEY` no `.env` da VM (senão segue no CSV); `published_at` estimado; `DTWEXBGS` **não é o DXY** (índice ICE, licenciado); publicação semanal | ADR 0009 |

**Validação cruzada real:** `DGS10 − T10YIE` reproduz `DFII10` em 5.932 de 5.932
pontos (diferença máxima 0).

**Licença (item 4 de `STATUS_DO_PROJETO.md`) — adiada por decisão de 2026-09-21:** não há
distribuição nem comercialização prevista. Antes de exibir a terceiros: citar "Board of
Governors of the Federal Reserve System (US), retrieved from FRED, Federal Reserve Bank of St.
Louis", confirmar o status da `T10YIE`, incluir o aviso da API. A coleta já usa a API (ADR 0012).
