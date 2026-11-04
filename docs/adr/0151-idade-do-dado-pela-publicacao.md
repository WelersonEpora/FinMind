# 0151 — A idade do dado no prompt conta da publicação, e o período aparece pelo nome

## Contexto

O item **E5** do "Relatório de oportunidades de melhoria: sistema de sinais do ouro (prompt ouro-v3)", de 2026-11-01
(resposta no `STATUS_DO_PROJETO.md`, §0), aponta que os fatores trimestrais do ouro (bancos centrais e minas) apareciam
no prompt de 2026-10-30 com **idade de 212 dias**: a idade era contada da data de referência, 2026-04-01, o 1º dia do
2º trimestre, e não da publicação. Pede que a idade do dado seja definida explicitamente e que o backtest use a data de
disponibilidade.

O que o FinMind tinha:

- **A tabela 2.3 do prompt** (`prompt-diario.service.js::situacaoDoFator`, a mesma nos seis ativos) dizia "referência
  01/04/2026 | publicado em 01/10/2026 (data estimada) | idade: 212 dia(s)". Pela convenção da camada point-in-time, a
  referência de um dado mensal ou trimestral é o 1º dia do período (ADR 0008): num trimestre, a idade passava de 200 dias
  mesmo com o dado recém-publicado. Nada era excluído no ouro (ele não tem limite de dado vencido), mas a IA lia a idade
  errada.
- **O backtest** já usa a disponibilidade: a leitura point-in-time só vê o que tinha `published_at` até a data (ADR
  0008). O problema é outro: o World Gold Council não informa quando publicou, e o histórico dele foi carregado de uma vez
  em 2026-10-01, com essa data como publicação estimada (`wgc-ouro.collector.js`, a convenção da 1ª coleta, como na PSD e
  no FMI, ADRs 0031 e 0036). Daí em diante, a coleta diária grava o trimestre novo perto do dia em que sai. Em 2026-11-04,
  a API do WGC ainda ia só até o 2º trimestre de 2026.

**Quem decidiu:** o usuário (Welerson), em 2026-11-04, com o mesmo poder de decisão do David (`CLAUDE.md`), seguindo a
ordem de trabalho da resposta à análise do ouro.

## Decisão

1. **A idade conta da publicação**, a data em que o dado ficou disponível, nos seis ativos: "idade: publicado há N
   dia(s)". A data de referência dá lugar ao **período pelo nome**, como no bloco do fator: "Semana encerrada em
   09/10/2026", "Mês de 08/2026", "Trimestre de 2º/2026". Em 2026-10-30, os trimestrais do ouro passam de "212 dias" a
   "publicado há 29 dias (data estimada)".
2. **O limite de dado vencido segue contado da referência** (ADR 0142: o clima, a safra e os estoques do café, com os
   limites decididos assim). O texto do SEM VOTO diz isso: "dado vencido (8 dias desde a referência, acima do limite de 7)".
3. **O histórico do WGC fica como está.** A camada é append-only, e a data da 1ª coleta é o limite superior seguro da
   publicação (nenhum dado aparece antes de ter saído). Para um teste no histórico, o script usa o atraso típico da fonte
   (o `ic:ouro`, ADR 0150: 7 dias nos ETFs; ~1 mês depois do fim do trimestre nos trimestrais), escrito no próprio script.

## Consequências

- O texto da tabela 2.3 muda nos seis ativos (o que a IA lê; a regra não muda). A versão dos prompts não muda: o texto
  vem do código, e a entrada gravada de cada leitura guarda a idade nova.
- No 2º trimestre de 2026, a data estimada (2026-10-01) é posterior à real (o WGC publicou em 2026-07-30): a idade
  aparece menor que a real, marcada como estimada. Some a partir do 3º trimestre, gravado pela coleta diária.
