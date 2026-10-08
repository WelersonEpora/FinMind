# 0115 — Soja, fase 1: a leitura diária de eventos de mercado da soja

**Status:** aceita (2026-10-08).

## Contexto

A fase 1 da soja, só aquisição de dados, foi autorizada pelo usuário em 2026-10-08 (ADR 0109). Na proposta
(`docs/proposta-ativo-soja.md`, §2.5 e §2.9), o F4 (política comercial e de biocombustíveis) é um fator de evento: tarifas
e acordos entre os EUA e a China, retenções e câmbio especial da Argentina, os volumes do RFS para o biodiesel nos EUA e
a mistura de biodiesel no Brasil. A logística e a sanidade vão à seção de eventos, sem fator. O clima não é evento (é F1
e F2). A §2.13 lista "Eventos da soja: frente nova e fontes autorizadas".

A leitura diária de eventos (ADRs 0047, 0049 e 0092) é uma linha por dia com os quatro ativos validados (ADR 0108), em
duas chamadas ao Gemini (ouro e petróleo; milho e café). Pôr a soja nela mudaria o prompt dos quatro ativos e faria uma
falha da soja derrubar a leitura do dia inteiro.

**Decisões do usuário, em 2026-10-08:**
1. A soja tem **leitura separada**: outra chamada, outro prompt e outra linha por dia; a leitura dos quatro ativos não
   muda em nada. Quando a soja for aprovada como ativo, o Comitê decide se as duas viram uma.
2. O desenho abaixo (frente no banco, coletor próprio, eventos só na tela).
3. Os eventos da soja ficam **sem fator**: a soja não tem fatores no FEL 1, e o F4 é uma proposta ainda não aprovada.

## Decisão

1. **Banco** (migration `20261008120000-eventos-frente-soja`): `geopolitica_leitura` ganha a `frente` (`PRINCIPAL`, a de
   sempre; `SOJA`) e a chave única passa a ser (dia, frente); `nivel_ouro` e `nivel_petroleo` deixam de ser NOT NULL, com
   um CHECK que mantém a obrigação na leitura principal; entram `nivel_soja` e `resumo_soja` (obrigatório o nível na
   leitura da soja); o evento aceita `SOJA`. As leituras existentes ficam como `PRINCIPAL`.
2. **Código:** o vocabulário (`shared/eventos-mercado.js`) ganha a soja, a frente da soja e as LEITURAS; o repositório
   filtra pela frente (a leitura do dia, a última leitura e a leitura de um ativo); o coletor ganha uma configuração por
   leitura. O módulo continua sendo o coletor da leitura principal (`geopolitica-ia-diario`); o da soja é
   `geopolitica-ia-soja`, registrado logo depois, com execução, falha e "refazer" próprios (`GEOPOLITICA_REFAZER=1 npm run
   collect -- --coletor=geopolitica-ia-soja`). O leitor da resposta reconhece a seção e os valores da soja.
3. **Prompt próprio:** `ai/prompts/eventos-soja-diaria.md` (v1), no mesmo formato de resposta da leitura principal (o
   mesmo parser). Diz o que o FinMind já coleta da soja (não é evento), o que pode ser evento (política comercial,
   biocombustíveis, regulação de importação, logística e sanidade), que o clima não é evento e que o fator é sempre
   NAO_SE_APLICA. Reforço: pesquisar antes de responder (a resposta sem busca é descartada).
4. **Fontes:** nenhuma nova. Onze das fontes já autorizadas ganham um bloco da soja, com o papel, os tipos e as buscas da
   soja: USTR, Casa Branca, MOFCOM, União Europeia, MAPA, USDA FAS, Bolsa de Comercio de Rosario (só logística), governo da
   Argentina, EPA, MME/CNPE e Canal do Panamá. O `ativos` e o `papel` de cada fonte não mudam. O INMET e o CPC (clima)
   ficam de fora; o nível do rio Mississippi, citado na proposta, não tem fonte autorizada.
5. **Piso da soja:** ao menos uma fonte de política comercial ou regulação da soja; as de logística sozinhas não bastam.
6. **Onde aparece:** só na tela Eventos (filtro "Soja") e no detalhe da execução. Nada vai ao Motor, ao prompt diário,
   à leitura de tendência nem ao Centro de Decisão (ADR 0109).

## Verificação

- **O prompt das duas chamadas da leitura principal ficou idêntico, byte a byte** (comparado antes e depois da mudança;
  `geopolitica-diaria@14`), e um teste confere que nenhuma das duas menciona a soja.
- Leitura real em dev (2026-10-08): 6 buscas, 7 páginas lidas em 6 fontes autorizadas (USTR, USDA FAS, União Europeia,
  EPA, MME e governo da Argentina), nível NORMAL, piso cumprido, sem aviso; a leitura principal do dia ficou intacta.
- **Achado:** às 16h-17h de 2026-10-08, o Gemini respondeu sem pesquisar em cerca de metade das chamadas, nas duas
  leituras (a frente de milho e café, sem mudança nenhuma, também). A defesa de sempre vale para a soja: duas tentativas
  por execução e três horários na madrugada; sem pesquisa, nada é gravado. No servidor, a leitura principal pesquisou na
  1ª execução de todos os dias de 02 a 08/10.

## Consequências

- Mais uma chamada ao Gemini por dia (até quatro, se a IA não pesquisar ou não cumprir o piso), pela mesma chave.
- A migration roda no deploy. Sem backfill: a leitura começa na primeira coleta (a busca ao vivo não é reproduzível,
  ADR 0047).
- Com isto, a fase 1 da soja está completa (ADRs 0109 a 0115).
