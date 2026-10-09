# 0119 — Dólar, fase 1 (só aquisição de dados): Treasury de 2 anos, VIX, S&P 500 e o dólar contra os emergentes, do FRED

**Status:** aceita (2026-10-09).

## Contexto

Fase 1 do dólar, só aquisição de dados, pela autorização do ADR 0117 (usuário, Welerson, 2026-10-09). Nada vai ao motor,
ao prompt, ao Centro de Decisão nem à IA.

Quatro fatores do relatório do Comitê de 2026-10-08 têm série gratuita e oficial no FRED, a fonte que o FinMind já coleta
(ADRs 0009, 0012 e 0033):

| Fator do relatório | Série do FRED | Observação |
|---|---|---|
| 12 — Treasury 2 anos | DGS2 | A própria série que o relatório cita |
| 14 — Curva 2s10s e juros reais | DGS10 − DGS2 e DFII10 | O 2s10s (T10Y2Y) é a diferença de duas séries coletadas: não entra como série nova |
| 10 — Dólar contra emergentes (MXN, CLP, COP, ZAR) | DTWEXEMEGS | O índice do Fed contra as economias emergentes, no lugar de quatro moedas soltas (o FRED não tem todas, e o índice já pondera pelo comércio) |
| 16 — VIX | VIXCLS | O fechamento diário; o relatório pede tempo real, que é da fase 2 |
| 18 — S&P 500 futuro (ES) | SP500 | O índice à vista no fechamento: o futuro ES é licenciado pela CME |

## Reconhecimento da fonte (`docs/processo-reconhecimento-fontes.md`)

A fonte é a mesma do ADR 0012: API REST do FRED com a chave `FRED_API_KEY`, CSV público de reserva, sem limite de
requisições observado. Muda o que é próprio de cada série:

**Conferências reais (2026-10-09), pelo CSV e pelo ALFRED (a data em que cada valor apareceu, de 2026-09-14 a 2026-10-07):**

| Série | Histórico | Publicação medida | Revisões | Licença (nota do FRED) |
|---|---|---|---|---|
| DGS2 | 1976-06-01 | Dia útil seguinte, em todas as datas (H.15) | Nenhuma | Board of Governors do Fed: domínio público, citação pedida |
| DTWEXEMEGS | 2006-01-02 | Lote semanal às segundas (H.10), como o DTWEXBGS | Nenhuma no período (o índice amplo revisa; a regra é a mesma) | Board of Governors do Fed |
| VIXCLS | 1990-01-02 | Em geral, a manhã do dia seguinte (o FRED atualizou às 08:37 CT); de 2026-09-23 a 2026-09-25, só em 2026-09-28 | Nenhuma | "Copyright, Chicago Board Options Exchange. Reprinted with permission" |
| SP500 | **2016-10-10** | No fim da noite do mesmo dia (19:01 CT, já o dia seguinte em UTC) | Sem versões no ALFRED | Acordo entre o FRED e a S&P Dow Jones Indices: **só 10 anos de histórico diário** |

## Decisão

1. **As quatro séries entram no coletor do FRED** (`collectors/fred/fred.collector.js`), uma execução por série, como as
   outras: `fred-dgs2`, `fred-dtwexemegs`, `fred-vixcls` e `fred-sp500`. Séries `FRED.<ID>` em `observation`.
2. **Data de publicação estimada:** DGS2, VIXCLS e SP500 no dia útil seguinte à data observada; DTWEXEMEGS na segunda
   seguinte. No VIX, o atraso eventual do FRED só adia a disponibilidade real: a regra nunca antecipa o que a fonte publica
   no prazo. No S&P 500, o fechamento sai depois da meia-noite UTC; o dia seguinte é o limite seguro.
3. **O S&P 500 tem uma janela de 10 anos que anda**, como o Up2Data da B3: o que a coleta acumula passa a ser o histórico.
4. **Licença:** uso interno, como as outras séries do FRED (a decisão de licenças está adiada enquanto o uso for pessoal).
   O VIX é da CBOE e o S&P 500 da S&P Dow Jones Indices: os dois ficam marcados nos cards.
5. **Cards:** o DTWEXEMEGS vira a modalidade "economias emergentes" do card de índices do dólar do Fed; o Treasury de
   2 anos, o VIX e o S&P 500 ganham cards próprios.

## Implementação

- `fred.collector.js` (as quatro séries e as regras de publicação), `observaveis.service.js` (os cards) e os testes.
- Carga em dev (2026-10-09), pela coleta diária (o coletor baixa a série inteira), 0 falhas: DGS2 de 1976-06-01 a
  2026-10-07 (12.585 valores); DTWEXEMEGS de 2006-01-02 a 2026-10-02 (5.203); VIXCLS de 1990-01-02 a 2026-10-07 (9.290);
  SP500 de 2016-10-10 a 2026-10-08 (2.513).

## Consequências

- No servidor, as quatro séries carregam o histórico inteiro na primeira coleta diária depois do deploy: não há backfill.
- O relatório pede o VIX, o S&P 500 e o DXY em tempo real: isso é da fase 2 (day-trade, ADR 0117), com feed pago.
- As demais fontes da fase 1 seguem o ADR 0117.
