# 0095 — Os eventos numa seção da base do prompt, não em cada fator

**Status:** aceita (2026-10-07). Revê o item 3 do ADR 0058 (eventos em fatores calculados, no milho) e a parte de
eventos do ADR 0062 (o café).

## Contexto

A leitura diária de eventos por IA (ADRs 0047, 0049 e 0092) marca cada evento com o fator do FEL 1 que ele afeta, em
cada ativo. Até aqui, os eventos chegavam ao prompt diário de dois jeitos:

- **Ouro e petróleo:** só nos fatores de evento (a geopolítica; no petróleo, também a OPEP+, calculada com eventos, ADR
  0091). Um evento marcado com outro fator (a demanda, os estoques) não ia a lugar nenhum.
- **Milho e café:** em cada um dos 8 fatores, depois do cálculo, os eventos marcados com ele (ADR 0058, item 3; o café
  herdou, ADR 0062). Eram 8 blocos de eventos por dia, quase sempre "nenhum evento".

O usuário (Welerson, 2026-10-07) levantou que o desenho do FinMind não é esse: cada fator reflete uma condição que
pesa no preço, e os eventos são outra fonte de dado. Conferido nos documentos do David:

- **FEL 1** (`docs/Docs_David/Relatório FEL 1 Commodities - v1.1 Revisado.docx`): fator de eventos só na geopolítica
  do ouro e do petróleo. Nenhuma menção a eventos em cada fator.
- **Respostas do David** (`Respostas FINMIND_V02.docx`): eventos só no F8 do milho (política comercial): a P12
  ("tarifas como eventos"), a proposta do F8 e a linha "Eventos" da tabela de agregação do Motor do Milho v0 ("F8 entra
  como flag [...] após confirmação oficial e validação humana"), com o F8 como único fator afetado. O estudo do café
  não traz eventos por fator.
- A distribuição por fator foi do FinMind (ADR 0058, item 3: "a leitura de eventos atribui cada evento a um dos 8
  fatores [...]. Por isso cada fator calculado passa a levar também os eventos marcados com ele"). O catálogo do café
  atribuía a ela um pedido do David (P12, ADR 0055), mas o que o ADR 0055 registra da reunião de 2026-10-03 é o pedido
  de avaliar **um fator de eventos** também no milho e no café.

Os eventos em cada fator misturam duas fontes no mesmo bloco: a leitura do motor (C) sai do cálculo, e logo abaixo vem a
pressão que outra IA leu numa notícia; o mesmo choque chega duas vezes (o evento hoje, o dado semanas depois); e o prompt
leva ruído. Criar um fator de eventos no milho e no café mexeria na metodologia do David (um fator tem peso do FEL 1 e
leitura do motor) só para dar um lugar a uma fonte de dado.

## Decisão (usuário, Welerson, 2026-10-07, pelo mesmo poder de decisão do David e do Comitê)

1. **Os eventos vão a uma seção só da BASE do prompt** de cada ativo ("EVENTOS DO ATIVO"; 2.5 no ouro, no petróleo e no
   café; 2.6 no milho, depois dos pesos por mês). Cada evento aceito da janela aparece uma vez, com a data, a idade, o
   tipo, as fontes e **a condição que afeta** (o código e o nome do fator marcado pela leitura, ou "nenhum fator do FEL
   1"). Não é fator: não tem peso nem leitura do motor e não muda a lista de fatores do FEL 1. O cálculo dos fatores
   não usa os eventos.
2. **Os fatores cuja condição é o próprio evento ficam com os seus**, como o David desenhou: a geopolítica (ouro e
   petróleo), a OPEP+ (ADR 0091) e o F8 do milho (política comercial, 30 dias). Esses eventos não se repetem na seção.
3. **Janela:** 7 dias, como antes; nos eventos marcados com a demanda do café, 30 dias (decisão do Comitê na aprovação
   do café, mantida).
4. **Como a IA usa a seção** (item de eventos de "Como analisar" de cada prompt): para dizer o que o cálculo da
   condição afetada ainda não mostra, sem contar duas vezes o que o dado já reflete; a pressão de um evento é leitura de
   outra IA, sem validação humana; ao citar um evento como evidência, a origem é EVENTO e o fator, o código da condição
   afetada.
5. A validação humana dos eventos, que o David pede no F8, segue como ponto 4 da conversa com ele
   (`docs/conversa-david-respostas-fel1.md`); esta decisão não a muda.

## Implementação

- `geopolitica.repository.js::listarEventosAceitosDoAtivo` e `geopolitica.service.js::obterEventosDoAtivo`: os eventos
  aceitos do ativo na janela (a mais longa entre a padrão e a de cada fator), sem os dos fatores de evento, com a seção
  pronta para o prompt (os dias sem leitura e o retrato do ativo na leitura mais recente, como nos fatores de evento).
- `shared/metodologia-base.js`: `janelaEventos` (opcional, por fator) e `eventosDoAtivo` na metodologia de cada ativo
  (a janela padrão, `JANELA_EVENTOS_PADRAO` = 7, a de cada fator e os fatores de evento a excluir).
- Catálogos: o `evento` sai dos fatores F1 a F7 do milho e dos 8 do café (a demanda do café ganha `janelaEventos: 30`).
  **Metodologia do milho v21 e do café v13**; as do ouro e do petróleo não mudam. A decisão do café deixa de atribuir a
  distribuição ao David.
- `metodologia-ativo.service.js::simularFatores` devolve `eventosDoAtivo`; `prompt-diario.service.js` preenche
  `{{bloco_eventos}}` e grava na entrada da leitura a janela e quantos eventos foram (`eventosDoAtivo`).
- **Prompts:** milho v7, café v6, ouro v2 e petróleo v6 (a seção na base, o item de eventos de "Como analisar" e a
  legenda do bloco 3).
- **Telas:** a Metodologia do Ativo deixa de marcar os fatores do milho (F1 a F7) e do café com "Com eventos"; o
  "Ver prompt completo" mostra a seção. No Centro de Decisão, as evidências da leitura dizem quantos eventos foram à
  seção e em quantos dias, e o nível do ativo na leitura de eventos aparece também no milho e no café.

## Consequências

- O milho passa de 8 blocos de eventos por dia para 1 (o F8) e uma seção; o café, de 8 para a seção. O ouro e o
  petróleo passam a levar à IA os eventos marcados com os outros fatores, que antes se perdiam.
- O retrato do ativo (nível e resumo do dia) aparece na seção e, no ouro e no petróleo, também no bloco da geopolítica.
- As leituras já gravadas não mudam; as evidências delas não têm a seção (`eventosDoAtivo` nulo).
