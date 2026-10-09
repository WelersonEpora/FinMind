# 0120 — Dólar, fase 1 (só aquisição de dados): o COT do real brasileiro, pelo relatório TFF da CFTC

**Status:** aceita (2026-10-09).

## Contexto

Fase 1 do dólar, só aquisição de dados, pela autorização do ADR 0117 (usuário, Welerson, 2026-10-09). Nada vai ao motor,
ao prompt, ao Centro de Decisão nem à IA.

O fator 7 do relatório do Comitê de 2026-10-08 é o posicionamento especulativo no futuro de real da CFTC: alta do dólar
com a "posição líquida de fundos alavancados vendida em real", baixa com ela comprada. O FinMind já coleta o COT de cinco
contratos (ADRs 0009, 0028, 0040 e 0110), mas pelo relatório **Disaggregated**, que só cobre commodities.

## Reconhecimento da fonte (`docs/processo-reconhecimento-fontes.md`)

A fonte é a mesma dos outros COT (API Socrata pública da CFTC, sem chave). Muda o relatório:

| # | Pergunta | Resposta |
|---|---|---|
| 1 | API oficial? | Sim: o dataset `gpe5-46if` (Traders in Financial Futures, só futuros) no `publicreporting.cftc.gov` |
| 2–3 | Pública? Chave? | Pública, sem chave |
| 4 | Formato | JSON (Socrata), os mesmos campos de data e de publicação do Disaggregated |
| 5 | Documentação | As notas explicativas do COT na CFTC. O TFF divide as posições em dealers, gestores de ativos (asset managers), fundos alavancados (leveraged funds) e outros; o Disaggregated, em produtores, swap dealers, managed money e outros |
| 6 | Histórico | Desde 2011-04-05 para o real: 753 relatórios até 2026-09-29, **com semanas faltando** (a CFTC só publica um contrato nas semanas em que ele passa do limite de divulgação) |
| 7 | Revisa valores? | Raramente, como os outros COT (correções entram como versão nova) |
| 8 | Publicação | A mesma dos outros COT: o dado de terça sai na sexta, 15:30 ET; `:updated_at` real desde ago/2022 (conferido: 2026-10-02T19:30:08Z para o relatório de 2026-09-29, uma linha por instante), estimado antes |
| 9 | Limite de requisições | Nenhum observado; um pedido por coleta |
| 10 | Licença | Dado público do governo dos EUA |
| 11 | Riscos | As semanas faltando; o contrato é cotado em dólares por real (comprado em real = vendido em dólar) |

**Conferência real (2026-10-09):** o real não aparece no Disaggregated (`72hh-3qpy`, nenhuma linha com "BRAZIL") e aparece
no TFF como "BRAZILIAN REAL - CHICAGO MERCANTILE EXCHANGE", código 102741. Em 2026-09-29: 146.704 contratos em aberto;
fundos alavancados com 37.418 comprados e 27.865 vendidos; gestores de ativos com 68.465 e 1.450; dealers com 7.611 e 67.366.

## Decisão

1. **O coletor do COT passa a aceitar dois relatórios** (`collectors/cftc/cftc-cot.collector.js`): cada contrato diz o seu
   (`relatorio`, o Disaggregated por padrão) e o relatório define a URL e os campos. Os cinco contratos atuais não mudam.
2. **O real entra pelo TFF** (`cftc-cot-brl`), com os contratos em aberto e as posições compradas e vendidas das três
   categorias: os fundos alavancados (o que o relatório do Comitê lê) e, pelo mesmo pedido, os gestores de ativos e os
   dealers. Séries `CFTC.BRL.<CAMPO>` em `observation`. A posição líquida não é gravada: é um fator.
3. **Um card** na tela de observáveis: "CFTC COT - Real brasileiro (CME)".

## Implementação

- `cftc-cot.collector.js` (os relatórios e o contrato), `collectors/index.js` (o registro), `observaveis.service.js` (o
  card) e o teste com a linha real de 2026-09-29.
- Carga em dev (2026-10-09), pela coleta diária (o coletor baixa o histórico inteiro): 753 semanas, de 2011-04-05 a
  2026-09-29, 5.271 valores, 0 falhas; data de publicação real em 212 semanas (desde ago/2022) e estimada em 541.

## Consequências

- No servidor, o histórico carrega na primeira coleta diária depois do deploy: não há backfill.
- As demais fontes da fase 1 seguem o ADR 0117.
