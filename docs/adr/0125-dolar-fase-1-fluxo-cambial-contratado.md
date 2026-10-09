# 0125 — Dólar, fase 1 (só aquisição de dados): o fluxo cambial contratado

**Status:** aceita (2026-10-09).

## Contexto

Fase 1 do dólar, só aquisição de dados, pela autorização do ADR 0117 (usuário, Welerson, 2026-10-09), que lista "BCB: o
fluxo cambial contratado" para o fator 3 do relatório do Comitê de 2026-10-08 ("fluxo cambial estrangeiro, spot + futuro"),
em parte: a ponta do futuro e a custódia de não residentes na B3 não estão nesta fonte. O relatório cita o "fluxo cambial
contratado" entre os dados do BCB. Nada vai ao motor, ao prompt, ao Centro de Decisão nem à IA.

No ADR 0117 a série estava "a reconhecer": não foi achada no portal de dados abertos do BCB.

## Reconhecimento da fonte

A série não está no portal de dados abertos: está no SGS, e os códigos estão na **Tabela 13 ("Movimento de câmbio
contratado") dos Indicadores Econômicos Selecionados** do BCB, que traz o código de cada coluna. A fonte é a API do SGS (a
mesma da PTAX, das reservas e da balança, ADRs 0001, 0023 e 0123), sem chave. **Conferência real (2026-10-09):**

- As 10 colunas, de 2008-09-01 em diante, por dia útil, em US$ milhões: o comercial, com a exportação (13962), dividida em
  ACC (13963), pagamento antecipado (13964) e demais (13965), a importação (13966) e o saldo (13967); o financeiro, com as
  compras (13968), as vendas (13969) e o saldo (13970); e o saldo total (13961). O total é a soma dos dois saldos: 766,8 =
  479,0 + 287,8 em 2026-09-30. O financeiro inclui serviços, rendas, investimento direto e em carteira e derivativos; a
  tabela exclui o interbancário e as operações externas do BCB.
- **Divulgação semanal:** na sexta 2026-10-09, o último dia na API era a sexta anterior (2026-10-02); a tabela de quarta
  2026-01-07 ia até 2026-01-02. O BCB divulga às quartas os dias até a sexta anterior.
- **Dados preliminares e revisados** (nota 1 da tabela): as operações de até US$ 50 mil podem ser informadas até o dia 5 do
  mês seguinte, e o mês anterior é revisado na 3ª semana do mês corrente. A API só traz o valor atual (sem vintage).
- O limite de 10 anos por pedido vale (série diária): duas janelas por série. O SGS às vezes devolve HTML ("Requisição
  inválida!") no lugar de JSON: visto no 13968, passou na repetição.
- Os valores vêm com 8 casas decimais.

Nível 5 (oficial, API estável, sem chave, histórico completo).

## Decisão

1. **Um coletor novo, `bcb-fluxo-cambial`**, com as 10 séries `BCB_SGS.FLUXO_CAMBIAL.<COLUNA>`, em `observation`. A coleta
   diária relê os últimos 75 dias de cada série (10 pedidos), para pegar as revisões do mês anterior; o backfill
   (`npm run backfill:bcb-fluxo-cambial`) carrega desde 2008-09-01 (20 pedidos). Cada pedido tem até 3 tentativas.
2. **Data de publicação estimada no fim da quarta-feira da semana seguinte** à do dia observado. A regra não conhece
   feriado: numa quarta de feriado, a divulgação passa para o dia útil seguinte e a regra antecipa um dia. Uma revisão vista
   numa coleta entra como versão nova, com a data da coleta (`point-in-time.service.js`). O histórico carregado já vem
   revisado (o preliminar de cada semana não é recuperável).
3. **As 10 colunas, não só os saldos:** o fator fala do fluxo estrangeiro, que está no financeiro, e a tabela é uma só (o
   custo de mais oito séries é nenhum).
4. **Um card novo**, "Fluxo cambial contratado (BCB)", com as 10 colunas como modalidades e o saldo total como a principal;
   93 cards de `observation`.

## Correção junto: a comparação de "mesmo valor" na camada point-in-time

A segunda carga em dev deu 146 "revisões" com o valor idêntico ao anterior. A causa é geral: `mesmoValor`
(`point-in-time.service.js`) comparava o valor gravado (NUMERIC com 6 casas, arredondado pelo PostgreSQL) com o da fonte
por `toFixed(6)` dos dois lados. No empate da 7ª casa (745,3281545), o PostgreSQL arredonda para cima (745,328155) e o JS,
pelo binário, para baixo (745,328154): os dois não batiam, e cada coleta gravaria uma revisão falsa. Agora "igual" é a
diferença abaixo de 1e-6, a precisão da coluna. Nenhuma fonte anterior tinha mais de 6 casas com esse efeito: no servidor,
as únicas versões com valor igual ao anterior são 21 vintages reais do ALFRED (os preços do FMI), em que a fonte mudou
depois da 6ª casa. As 146 linhas falsas de dev foram apagadas (só existiam lá).

## Verificação

- Carga em dev: 45.350 valores (10 séries de 4.535 dias úteis), 0 falhas, ~8 min. Repetida depois da correção: 45.350
  ignorados. A coleta diária: 490 lidos, 490 ignorados.

## Consequências

- O servidor precisa do backfill (`npm run backfill:bcb-fluxo-cambial`); sem ele, a coleta diária só grava os últimos 75
  dias.
- Com esta fonte, a fase 1 do dólar tem as fontes gratuitas do ADR 0117, menos o risco-país (sem fonte gratuita, pergunta ao
  Comitê). Segue a proposta dos fatores para o Comitê.
