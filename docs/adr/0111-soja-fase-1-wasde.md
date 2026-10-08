# 0111 — Soja, fase 1: o balanço da soja do WASDE

**Status:** aceita (2026-10-08).

## Contexto

A fase 1 da soja, só aquisição de dados, foi autorizada pelo usuário em 2026-10-08 (ADR 0109), com as fontes da §2.13
da proposta (`docs/proposta-ativo-soja.md`). Depois do preço (ADR 0109) e das quatro fontes do ADR 0110, vem o balanço
da soja do WASDE: a proposta o usa na estimativa da oferta dos EUA (F1) e da América do Sul (F2, Brasil e Argentina
somados), na revisão do uso dos EUA (F3, exportação e esmagamento) e na condição da regra R2 (estoque final sobre uso).
Nada vai ao motor.

O WASDE já é coletado para o milho (ADR 0015): a mesma listagem do ESMIS e a mesma planilha de cada edição trazem as
tabelas da soja.

## Reconhecimento (`docs/processo-reconhecimento-fontes.md`)

A fonte passou pelo reconhecimento no ADR 0015; as 11 perguntas não mudam com outra tabela da mesma planilha. O que foi
conferido de novo, nas 187 planilhas de 2011-01 a 2026-09 (todas as edições com XLS), em 2026-10-08:

- **EUA:** aba "U.S. Soybeans and Products Supply and Use (Domestic Measure)", bloco "SOYBEANS". O layout é o do milho
  (colunas por safra, a safra em projeção duas vezes: vale o mês atual). As 13 linhas do grão estão em todas as
  edições: área plantada e colhida, produtividade, estoque inicial, produção, importação, oferta total, esmagamento,
  exportação, semente, resíduo, uso total e estoque final. Diferença do milho: na mesma aba vêm, logo abaixo, os blocos
  do óleo e do farelo, que repetem os rótulos ("Beginning Stocks"...). O bloco da soja acaba no cabeçalho do seguinte.
- **Mundo:** aba "World Soybean Supply and Use" (as de farelo e óleo têm outro título). As colunas são as do milho, com o
  esmagamento ("Domestic Crush") no lugar do consumo para ração; o rodapé começa por "1/ Data based on local marketing
  years", não "1/ Aggregate". Argentina e Brasil vêm em ano comercial ajustado para outubro a setembro (nota da fonte).
- **Regiões:** Argentina, Brasil, China, EUA e México em todas; Paraguai desde mai/2013; Japão até abr/2019; Sudeste
  Asiático e Mundo sem China desde mai/2019; a União Europeia com rótulos por período, como no milho.
- 0 inválidos nas 187 planilhas.

## Decisão

1. **Um parser e um coletor por produto, não um coletor novo.** `wasde-milho.parser.js` e `wasde-milho.collector.js`
   viram `wasde.parser.js` e `wasde.collector.js`, com a configuração de cada produto (`PRODUTOS` no parser, `COLETORES`
   no coletor) e a fábrica `criarColetorWasde`. O do milho não muda: o mesmo código (`wasde-milho`), a mesma fonte e as
   mesmas séries. O script de carga passa a ser `scripts/backfill-wasde.js --produto=...` (`backfill:wasde-milho` segue
   igual; novo `backfill:wasde-soja`).
2. **Soja:** coletor `wasde-soja`, fonte própria `USDA_WASDE_SOJA`, séries `WASDE.SOJA.EUA.<ATRIBUTO>` e
   `WASDE.SOJA.MUNDO.<REGIAO>.<ATRIBUTO>`, observed_at 1º de setembro do ano de início (a convenção do milho; o ano
   comercial da soja nos EUA também começa em setembro). Só o grão: óleo e farelo ficam de fora.
3. **Fonte própria, de propósito.** O coletor descarta as edições já ingeridas olhando os instantes de publicação da
   fonte (ADR 0015). Com uma fonte só, a carga da soja em blocos de 5 anos veria as edições já gravadas para o milho e
   pararia no 1º bloco, o problema do etanol (ADR 0035). Há teste para isso.
4. Dois cards, como os do milho: "Soja EUA (WASDE)" e "Soja por país (WASDE)". O Paraguai ganha rótulo.

## Consequências

- Dois cards novos (78 no total). Nenhum fator, nenhuma regra: a soja continua fora do motor (ADR 0109).
- No servidor, a carga é `npm run backfill:wasde-soja` (~190 downloads), **antes da 1ª coleta diária depois do
  deploy**: sem a carga, a coleta diária se recusa a gravar a soja e manda rodar o backfill (a trava do ADR 0015).
- Faltam na fase 1: área plantada, Grain Stocks, Conab e os eventos.
