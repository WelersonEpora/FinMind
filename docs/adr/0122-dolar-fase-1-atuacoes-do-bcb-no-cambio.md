# 0122 — Dólar, fase 1 (só aquisição de dados): as atuações do BCB no mercado de câmbio

**Status:** aceita (2026-10-09).

## Contexto

Fase 1 do dólar, só aquisição de dados, pela autorização do ADR 0117 (usuário, Welerson, 2026-10-09). Nada vai ao motor,
ao prompt, ao Centro de Decisão nem à IA.

O fator 27 do relatório do Comitê de 2026-10-08 é "reservas internacionais e atuações do BCB". As reservas o FinMind já
coleta (ADR 0023). Para as atuações, o relatório pede que a regra "discrimine modalidade (swap tradicional, swap reverso,
linha ou leilão à vista), volume [...] e percepção de efetividade" (§2.3), e trata como alta do dólar os "leilões sem
demanda" (tabela, fator 27).

## Reconhecimento da fonte (`docs/processo-reconhecimento-fontes.md`)

| # | Pergunta | Resposta |
|---|---|---|
| 1 | API oficial? | Não: um CSV do Portal de Dados Abertos do BCB, "Histórico de Atuações no Mercado de Câmbio" (com um PDF de documentação) |
| 2–3 | Pública? Chave? | Pública, sem chave |
| 4 | Formato | CSV em UTF-8 com BOM, vírgula como separador, valores com vírgula decimal entre aspas; 15 colunas |
| 5 | Documentação | A página do conjunto: "todas as atuações do BCB no mercado de câmbio a partir da mudança para o regime de câmbio flutuante (Comunicado 6.565, de 18/01/1999)", "até o momento de publicação do resultado de cada uma", sem cancelamentos e pré-pagamentos posteriores |
| 6 | Histórico | De 1999-01-22 em diante, uma linha por atuação |
| 7 | Revisa valores? | Não: o registro é o do dia da atuação |
| 8 | Publicação | O arquivo é atualizado "até o último dia útil do mês", com as atuações do mês anterior; o resultado de cada leilão é divulgado pelo BCB no próprio dia |
| 9 | Limite de requisições | Nenhum; um download por coleta (~1,3 MB) |
| 10 | Licença | Portal de Dados Abertos do BCB (ODbL) |
| 11 | Riscos | O atraso de até dois meses do arquivo; a rolagem de swaps não separada da oferta nova; um par instrumento/modalidade novo |

**Conferência real (2026-10-09):** 10.439 atuações, todas com 15 colunas, 13 pares de instrumento e modalidade, a última em
2026-08-27. Os mais frequentes: swap cambial tradicional (6.859 atuações, desde 2002-06-28), compra à vista (1.506, de 1999
a 2012), swap reverso (1.029), venda à vista a mercado (383, a última em 2024-12-30), linha pré-fixada (310) e pós-fixada na
Selic (151, desde 2019) e venda à vista pela PTAX (108, desde 2019). Há vários leilões do mesmo par no mesmo dia (3.227 casos)
e leilões conjugados ("Leilão à Vista + Swap Reverso"). Só 7 atuações sem volume aceito; as operações diretas antigas não
têm volume ofertado.

## Decisão

1. **Um coletor novo, `bcb-atuacoes-cambio`**, que baixa o CSV inteiro a cada coleta e grava **por dia e por par
   instrumento/modalidade**: o volume aceito (`ACEITO_USD`), o ofertado (`OFERTADO_USD`) e o número de atuações
   (`LEILOES`), em séries `BCB.ATUACAO_CAMBIO.<ITEM>.<CAMPO>`. Somar os leilões do mesmo dia é aritmética, não
   interpretação; o ofertado fica ao lado do aceito para que a regra do fator possa medir a demanda.
2. **Os 13 pares ficam num mapa** (`shared/utils/bcb-atuacao-cambio.js`), com um código e um rótulo. Um par novo na fonte vira
   item inválido na execução (não é adivinhado) até ser incluído no mapa.
3. **Data de publicação estimada no fim do dia da atuação**, em Brasília: o resultado de cada leilão é público no dia, embora
   o CSV só o traga no fim do mês seguinte. É o que vale para um teste histórico.
4. **Não separa a rolagem de swaps da oferta nova:** o CSV não diz qual é qual. Fica para a regra do fator, na proposta.
5. **Um card** ("Atuações do BCB no câmbio"), com os pares como itens (os usados no ano corrente ou no anterior vêm marcados) e
   os três campos.

## Implementação

- `collectors/bcb/bcb-atuacoes-cambio.collector.js`, `shared/utils/bcb-atuacao-cambio.js`, a dimensão `bcb-atuacao` em
  `observation-data.service.js`, o card em `observaveis.service.js` e os testes com linhas reais.
- Carga em dev (2026-10-09), pela coleta diária: as 10.439 atuações em 13.779 valores, 0 falhas.

## Consequências

- No servidor, o histórico carrega na primeira coleta diária depois do deploy: não há backfill.
- As demais fontes da fase 1 seguem o ADR 0117.
