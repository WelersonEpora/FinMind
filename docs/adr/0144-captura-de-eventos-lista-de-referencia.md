# 0144 — Captura de eventos: a lista de referência dos agrícolas e o teste de 80%

## Contexto

A análise "ANÁLISE CAFÉ 19out26" (resposta no `STATUS_DO_PROJETO.md`, §0, item E2) pede um teste do módulo de eventos:
capturar 80% dos eventos relevantes em 30 dias. O FinMind respondeu que o teste precisa de uma lista de eventos de
referência (o gabarito) feita por uma pessoa. O Comitê, na resposta recebida em 2026-10-22, aprovou as meias-vidas (ADR
0130, adendo) e decidiu: "A lista de eventos é obrigatória para o critério de captura de 80%."

O Comitê não disse quem monta a lista nem como o teste funciona. **Quem decidiu:** o usuário (Welerson), em 2026-10-23,
com o mesmo poder de decisão do David (`CLAUDE.md`), sobre a proposta do FinMind:

- quem julga a relevância e a captura é o usuário;
- o teste vale para os três ativos que usam o módulo de eventos dos agrícolas (ADR 0130): milho, café e soja;
- a lista mora numa tela, com uma tabela;
- os gatilhos dos candidatos, a janela de captura e a leitura do critério são os propostos (abaixo).

## Decisão

1. **Candidatos gerados sem a IA de eventos.** Se a própria leitura (ou uma IA) definisse o gabarito, o teste seria
   circular. O FinMind sugere candidatos por gatilhos objetivos, e o usuário julga:
   - **Publicação de relatório (CALENDARIO):** o dia em que um relatório do ativo publicou alguma versão na
     `observation`, pelo `source_code`. Os relatórios de cada ativo estão em `shared/captura-eventos.js`. São os
     relatórios do calendário (WASDE, Conab, área plantada e estoques trimestrais do USDA, IMEA; no café, Conab, USDA FAS,
     ICO, ECF e NOAA CPC), não as séries diárias ou semanais. A Federação de Cafeteiros não é coletada: entra à mão.
   - **Movimento do preço (PRECO):** o retorno do dia no vencimento mais negociado do futuro da B3 do ativo (CCM, ICF e
     SJC), dentro do contrato (a troca de vencimento não vira retorno), dividido pelo desvio dos 60 retornos anteriores.
     Com |z| de 2 ou mais, vira candidato. É o gatilho que pergunta o que moveu o preço naquele dia, a falha que a análise
     apontou.
   - **Alerta de fonte secundária (SECUNDARIA):** o evento aceito da leitura sustentado só por fonte secundária (ADR
     0130). Esse vem da IA, então a captura dele é por construção. O resumo mostra o percentual também sem ele.
   - **Adicionado à mão (MANUAL):** o que os gatilhos não pegaram. Entra já como relevante.
2. **Capturado:** o fato aparece num evento **aceito** de uma leitura do ativo do dia do evento até **2 dias úteis**
   depois (segunda a sexta, sem feriados). A leitura roda de madrugada, então o que sai à tarde entra na do dia seguinte.
   A tela mostra os eventos dessa janela, e o usuário marca qual capturou (uma cópia do id, da data e do título: a
   leitura do dia pode ser refeita e trocar os ids) ou "não capturado".
3. **O critério:** num período de **30 dias**, pelo menos **80%** dos relevantes conferidos capturados. O resumo diz se o
   número ainda é provisório (há candidatos a avaliar ou a conferir, ou o período não tem 30 dias).
4. **Períodos passados valem.** As leituras de eventos estão gravadas dia a dia (ADR 0047): um período passado mede a
   leitura como ela foi na época. O otimista é só refazer a leitura com a busca de hoje. Isso permite uma linha de base
   antes das mudanças do E2 (até 20/10/2026, com o prompt anterior ao ADR 0130) e a comparação com o período depois
   delas.
5. **Onde:** a tela `/dados-mercado/captura-eventos` ("Captura de eventos", no grupo Dados de Mercado). A tabela
   `evento_referencia` é GLOBAL (ADR 0007): todos os autenticados veem; gerar os candidatos, avaliar, adicionar e remover
   (só os manuais) é de admin de plataforma, com quem avaliou e quando. Gerar de novo não duplica (chave natural por
   candidato) nem apaga a avaliação.

Os números do critério (80%, 30 dias, 2 dias úteis, |z| de 2, 60 retornos) e os relatórios de cada ativo estão em
`shared/captura-eventos.js` (versão 1). Mudar um deles é uma decisão nova, registrada aqui.

## Evidência (banco de dev, 2026-10-23)

De 01/09 a 13/10/2026: no café, 7 publicações (ICO, NOAA CPC, Conab e USDA FAS) e 1 movimento do preço (ICFZ26 +4,4% em
06/10, z +2,2); no milho, 4 publicações e 1 movimento (CCMX26 −3,0% em 30/09, z −3,8, no dia do Grain Stocks do USDA);
na soja, 3 publicações e 1 movimento (SJCX26 −2,7% em 11/09, z −2,4, no dia do WASDE). Os alertas de fonte secundária
só existem desde 21/10.

## Consequências

- O teste depende da avaliação do usuário: o número só vale com o período avaliado e conferido.
- A captura mede se a leitura **viu** o fato, não se a pressão ou a intensidade estavam certas.
- O gatilho de preço usa a B3: num dia em que o ICF ou o SJC só acompanham Nova York ou Chicago, o fato pode ser de fora
  (o candidato aponta o dia; a causa é com quem avalia).
- Sem calendário de feriados: um feriado conta como dia útil na janela, a favor da captura.
