# 0113 — Soja, fase 1: os estoques trimestrais dos EUA (Grain Stocks)

**Status:** aceita (2026-10-08).

## Contexto

A fase 1 da soja, só aquisição de dados, foi autorizada pelo usuário em 2026-10-08 (ADR 0109), com as fontes da §2.13
da proposta (`docs/proposta-ativo-soja.md`). Na proposta, o Grain Stocks só atualiza a condição da regra R2 (a folga do
balanço), sem virar choque. O WASDE (ADR 0111) só traz o estoque de fim de ano-safra (1º de setembro); os de 1º de
dezembro, março e junho só existem aqui, e o de setembro sai aqui antes de chegar ao WASDE seguinte.

Os estoques do milho já são coletados (ADR 0035), do mesmo relatório. Nada vai ao motor.

## Reconhecimento (`docs/processo-reconhecimento-fontes.md`)

A fonte passou pelo reconhecimento no ADR 0035; as 11 perguntas não mudam com outro bloco da mesma tabela. Conferido de
novo nas edições com CSV (2001-06-29 a 2026-09-30), em 2026-10-08:

- A soja é o **último bloco** ("Soybeans") da mesma tabela por posição e mês em unidades domésticas, nos três layouts do
  milho (cabeçalho até 2012, "1-Mar" em 2013-01-11, linha de dado desde 2013), em mil bushels. O que vem depois dele é o
  fim da tabela (rodapé); a trava da data repetida do milho vale para a soja.
- As 102 edições do Grain Stocks lidas sem erro (1.989 valores). A listagem traz ainda 2 edições sem CSV (2013-11-19 e
  2019-01-11, como no milho) e a de 2003-02-27, que é outro relatório (aviso, como no milho).
- **Contra o WASDE da soja:** o 1º de setembro de 2025 (324.806 mil bushels, revisado em jan/2026) é o estoque final da
  safra 2024/25 no WASDE (325 milhões).

## Decisão

1. O parser ganha o grão (`CULTURAS` em `usda-grain-stocks.parser.js`, pelo rótulo do bloco; `extrairEstoquesMilho` vira
   `extrairEstoques`) e o coletor vira fábrica (`criarColetorGrainStocks`). O do milho não muda: o mesmo código, a mesma
   fonte e as mesmas séries. O script de carga aceita `--cultura` (padrão milho); `backfill:usda-grain-stocks-soja` é o da
   soja.
2. **Soja:** coletor `usda-grain-stocks-soja`, fonte própria `USDA_NASS_GRAIN_STOCKS_SOJA` (pelo motivo do ADR 0111),
   séries `USDA.GRAIN_STOCKS.SOYBEANS.<POSICAO>` (TOTAL, ON_FARM, OFF_FARM), em mil bushels.
3. Um card: "Estoques trimestrais de soja dos EUA (USDA Grain Stocks)".

## Consequências

- Um card novo (80 no total). Nenhum fator, nenhuma regra: a soja continua fora do motor (ADR 0109).
- No servidor, a carga é `npm run backfill:usda-grain-stocks-soja` (~105 downloads, ~3 minutos), **antes da 1ª coleta
  diária depois do deploy** (a mesma trava do milho). A execução termina em sucesso parcial pelas 2 edições sem CSV, como
  a do milho.
- Faltam na fase 1: a Conab e os eventos.
