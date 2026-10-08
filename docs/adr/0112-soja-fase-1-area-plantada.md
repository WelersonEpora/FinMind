# 0112 — Soja, fase 1: a área plantada dos EUA (Prospective Plantings e Acreage)

**Status:** aceita (2026-10-08).

## Contexto

A fase 1 da soja, só aquisição de dados, foi autorizada pelo usuário em 2026-10-08 (ADR 0109), com as fontes da §2.13
da proposta (`docs/proposta-ativo-soja.md`). A proposta usa a área plantada no F1 (oferta dos EUA): do Prospective
Plantings (fim de março) ao WASDE de agosto, o último relatório de área é o observável primário, e a partir do fim de
junho é o Acreage. O WASDE (ADR 0111) só incorpora esses números semanas depois: em 2026, a intenção de 31/03 entrou no
WASDE de 12/05, e o Acreage de 30/06 no de 10/07.

A área plantada do milho já é coletada (ADR 0027), dos mesmos relatórios: o CSV de cada edição traz a tabela da soja.
Nada vai ao motor.

## Reconhecimento (`docs/processo-reconhecimento-fontes.md`)

A fonte passou pelo reconhecimento no ADR 0027; as 11 perguntas não mudam com outra tabela do mesmo CSV. Conferido de
novo nas 51 edições com CSV (Acreage desde 2001-06-29, Prospective Plantings desde 2002-03-28), em 2026-10-08:

- **Título:** "Soybeans: Area Planted by State and United States" (Prospective Plantings) e "Soybeans: Area Planted and
  Harvested by State and United States" (Acreage) até 2009; "Soybean Area Planted - States and United States" e
  "Soybean Area Planted and Harvested - States and United States" desde 2010. As outras tabelas da soja ficam de fora
  pela regra do milho ou porque o título não fala de "Area Planted": biotecnologia, soja plantada depois de outra
  cultura (Acreage, até 2009) e as cinco da ferrugem asiática (Prospective Plantings de 2005).
- **Colunas, unidade e total:** os do milho (mil acres; "US" até 2009, "United States" depois). As 51 lidas sem erro.
- **Contra o WASDE da soja (ADR 0111):** a intenção de 2026 (84.700 mil acres) é a área do WASDE de maio (84,7 milhões);
  o Acreage de 2026 (85.365) é a do WASDE de julho (85,4). O mesmo em 2025 (83.495 e 83,5; 83.380 e 83,4).

## Decisão

1. O parser ganha a cultura (`CULTURAS` em `usda-area-plantada.parser.js`, pelo começo do título) e o coletor vira
   fábrica (`criarColetorAreaPlantada`), como no WASDE. O do milho não muda: o mesmo código, a mesma fonte e a mesma
   série. O script de carga aceita `--cultura` (padrão milho); `backfill:usda-area-plantada-soja` é o da soja.
2. **Soja:** coletor `usda-area-plantada-soja`, fonte própria `USDA_NASS_AREA_SOJA` (pelo mesmo motivo do WASDE, ADR
   0111), série `USDA.SOYBEANS.AREA_PLANTED` (o prefixo do Crop Progress da soja), observed_at 1º de setembro do ano do
   plantio. Só o total dos EUA, como no milho.
3. Um card: "Soja EUA - Área plantada (USDA)".

## Consequências

- Um card novo (79 no total). Nenhum fator, nenhuma regra: a soja continua fora do motor (ADR 0109).
- No servidor, a carga é `npm run backfill:usda-area-plantada-soja` (51 downloads, ~2 minutos), **antes da 1ª coleta
  diária depois do deploy** (a mesma trava do milho).
- Faltam na fase 1: Grain Stocks, Conab e os eventos.
