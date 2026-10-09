# 0124 — Dólar, fase 1: a leitura diária de eventos de mercado do dólar

**Status:** aceita (2026-10-09).

## Contexto

Fase 1 do dólar, só aquisição de dados, pela autorização do ADR 0117 (usuário, Welerson, 2026-10-09), que lista a "leitura
diária de eventos do dólar por IA (o padrão do ADR 0115)" para os fatores 25 ("score fiscal e político doméstico") e 28
("calendário macroeconômico") do relatório do Comitê de 2026-10-08. O relatório põe a IA exatamente aí: "leitura,
processamento e classificação de despachos governamentais, atas de comitês de política monetária e notícias políticas
domésticas (Fatores 25 e 28)" (camada 4).

A leitura de eventos tem hoje duas linhas por dia: a principal (os quatro ativos validados, ADR 0108) e a da soja (ADR
0115). Os sete tipos de evento (geopolítica, política comercial, clima, regulação, logística, sanidade e oferta da OPEP+)
não cobrem o que move o câmbio, e as fontes autorizadas não incluem nenhuma instituição monetária ou fiscal.

## Decisão

1. **O dólar tem leitura PRÓPRIA, no desenho da soja (ADR 0115):** outra chamada (`geopolitica-ia-dolar`), outro prompt
   (`ai/prompts/eventos-dolar-diaria.md`, v1) e outra linha por dia (`frente` = `DOLAR`), com execução, falha e "refazer"
   próprios (`GEOPOLITICA_REFAZER=1 npm run collect -- --coletor=geopolitica-ia-dolar`). A leitura principal e a da soja
   não mudam: **os prompts das três chamadas delas ficaram idênticos, byte a byte** (comparados antes e depois), e testes
   conferem que nenhum deles vê as fontes, os tipos ou os eventos do dólar.
2. **Cinco tipos de evento novos, só da leitura do dólar** (`leituras: ["DOLAR"]` em `shared/eventos-mercado.js`):
   política monetária (o que o Copom ou o Fed sinalizam para os juros, não o número da taxa, que o FinMind já coleta),
   política fiscal, risco institucional, intervenção cambial (só a extraordinária: a rolagem é rotina e as atuações estão
   no ADR 0122) e dado econômico (só a surpresa que a própria fonte declara; o consenso nunca é deduzido). A leitura do
   dólar usa esses cinco e mais a geopolítica (aversão a risco) e a política comercial (tarifas dos EUA contra o Brasil).
   O prompt de cada leitura lista só os seus tipos.
3. **Dez fontes autorizadas novas, só para o dólar** (`soLeituras: ["DOLAR"]` em `fontes-autorizadas.js`): Banco Central do
   Brasil, Ministério da Fazenda (`gov.br/fazenda`), Tesouro Nacional (`gov.br/tesouronacional` e Tesouro Transparente),
   Câmara, Senado, STF, Agência Brasil (EBC), IBGE, Federal Reserve e BLS. Mais três que já estavam autorizadas ganham um
   bloco do dólar (a Casa Branca, o USTR e a AP News). **Uma fonte do dólar só é reconhecida na leitura do dólar:** uma
   página do Fed lida pela leitura principal não sustenta um evento do ouro, como antes; sem isso, as fontes novas
   mudariam o que a leitura validada aceita.
4. **Piso do dólar:** ao menos uma busca no Banco Central, na Fazenda ou no Tesouro Nacional, e uma no Fed (as duas pontas
   do diferencial de juros).
5. **Sem fator:** os eventos vão com `DOLAR=NAO_SE_APLICA`, porque o dólar não tem fatores aprovados. Só aparecem na tela
   Eventos (filtro "Dólar") e no detalhe da execução; nada vai ao Motor, ao prompt diário nem ao Centro de Decisão.
6. **Pressão:** "alta" é o dólar subindo (o real perdendo valor).

## Banco

Migration `20261009120000-eventos-frente-dolar`: a `frente` aceita `DOLAR`; entram `nivel_dolar` e `resumo_dolar` (o nível
obrigatório na leitura do dólar); o evento aceita o ativo `DOLAR` e os cinco tipos novos. O `down` foi testado em dev (ida e
volta). Sem backfill: a busca ao vivo não é reproduzível (ADR 0047).

## Verificação

- Leitura real em dev (2026-10-09): 5 buscas, 8 páginas lidas em três fontes novas (Banco Central, Fazenda e Fed), nível
  NORMAL, piso cumprido depois de uma repetição (a primeira resposta não o cumpria), nenhum evento, nenhum aviso. O resumo
  tratou a rolagem de swap como rotina, como o prompt pede. Respondeu a chave paga (a gratuita estava sem cota naquele
  horário).
- As fontes ainda não lidas numa leitura real (Câmara, Senado, STF, Agência Brasil, IBGE e BLS) só aparecem quando há
  assunto; a cobertura se acompanha no detalhe da execução, como nas outras leituras.

- 1ª leitura no servidor (2026-10-09, pela coleta manual): nível NORMAL, 4 páginas lidas no Fed, no Banco Central e no
  IBGE, nenhum aviso; respondeu a chave paga.

## Consequências

- Mais uma chamada ao Gemini por dia (até quatro, com as novas tentativas), pela mesma chave.
- A migration roda no deploy; a leitura começa na primeira coleta.
- Com esta leitura, a fase 1 do dólar tem as fontes gratuitas do ADR 0117, menos o fluxo cambial contratado (a série não
  foi achada) e o risco-país (sem fonte gratuita, pergunta ao Comitê).
