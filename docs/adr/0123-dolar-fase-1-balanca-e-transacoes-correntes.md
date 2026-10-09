# 0123 — Dólar, fase 1 (só aquisição de dados): a balança comercial e as transações correntes do balanço de pagamentos

**Status:** aceita (2026-10-09).

## Contexto

Fase 1 do dólar, só aquisição de dados, pela autorização do ADR 0117 (usuário, Welerson, 2026-10-09). Nada vai ao motor,
ao prompt, ao Centro de Decisão nem à IA.

O fator 26 do relatório do Comitê de 2026-10-08 é "balança comercial e transações correntes" (Comex Stat e BCB, "diário /
mensal"). O balanço de pagamentos do BCB dá os dois saldos na mesma fonte e no mesmo conceito.

## Reconhecimento da fonte

A fonte é a API do SGS do BCB (a mesma da PTAX, da Selic e das reservas, ADRs 0001 e 0023), sem chave. **Conferência real
(2026-10-09):**

- SGS 22707, "Balança comercial - Balanço de Pagamentos - mensal - saldo", e SGS 22701, "Transações correntes - mensal -
  saldo": US$ milhões, de 1995-01 a 2026-08 (380 meses cada). O dia do ponto é o 1º do mês.
- Para série mensal, o pedido sem datas devolve a série inteira (o limite de 10 anos por pedido é das diárias).
- O agosto de 2026 já estava na API em 2026-10-09: o BCB divulga o setor externo por volta do dia 25 do mês seguinte.
- O balanço de pagamentos é revisado, e a API só traz o valor atual (sem vintage).

## Decisão

1. **Um coletor novo, `bcb-balanco-pagamentos`**, que baixa as duas séries inteiras a cada coleta (~380 pontos cada) e grava
   só o que mudou: `BCB_SGS.BALANCA_COMERCIAL_BP` e `BCB_SGS.TRANSACOES_CORRENTES`, em `observation`.
2. **Data de publicação estimada no último dia do mês seguinte:** nunca antecipa a divulgação. Uma revisão vista numa coleta
   entra como versão nova, com a data da coleta (`point-in-time.service.js`), nunca com a data original.
3. **Só os dois saldos**, que são o que o fator pede. A balança semanal do Comex Stat (MDIC), mais rápida mas de outro
   conceito, fica de fora por enquanto: se a proposta do fator pedir o dado semanal, entra num ADR próprio.
4. **Um card** ("Balança comercial e transações correntes (BCB)"), mensal, com as duas séries.

## Implementação

- `collectors/bcb/bcb-balanco-pagamentos.collector.js`, o card em `observaveis.service.js` e os testes.
- Carga em dev (2026-10-09), pela coleta diária: 380 meses de cada série, 760 valores, 0 falhas.

## Consequências

- No servidor, o histórico carrega na primeira coleta diária depois do deploy: não há backfill.
- As demais fontes da fase 1 seguem o ADR 0117.
