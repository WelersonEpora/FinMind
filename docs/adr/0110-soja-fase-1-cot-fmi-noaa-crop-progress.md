# 0110 — Soja, fase 1: COT, preços mensais do FMI, saúde da vegetação e Crop Progress

**Status:** aceita (2026-10-08).

## Contexto

A fase 1 da soja, só aquisição de dados, foi autorizada pelo usuário em 2026-10-08 (ADR 0109), com as fontes da §2.13
da proposta (`docs/proposta-ativo-soja.md`). Depois do preço (o SJC, ADR 0109), vêm as quatro fontes que o FinMind já
coleta para outros ativos e que só precisam de outra cultura ou de outro contrato: o COT da CFTC, os preços mensais do
FMI pelo ALFRED, a saúde da vegetação da NOAA STAR e o Crop Progress do USDA. Nenhuma fonte nova; nada vai ao motor.

| Fonte | Para quê (proposta da soja) | Coletor de origem |
|---|---|---|
| CFTC COT, soja da CBOT (005602) | A regra R3 (posicionamento dos fundos, igual ao café) | `cftc-cot` (ADR 0009) |
| FMI, preços mensais de soja, óleo e farelo | Validação de 30 e 90 dias; a margem de esmagamento candidata | ALFRED, como o milho (ADR 0069) |
| NOAA STAR VH, máscara `SOYB` | F1 (EUA, confirmação) e F2 (Brasil e Argentina, primário na fase crítica) | `noaa-vh` (ADRs 0025 e 0030) |
| USDA NASS Crop Progress, soja | F1 (condição, primário de junho ao WASDE de agosto) e o estágio da regra R1 | `usda-crop-progress` (ADR 0009) |

## Reconhecimento (`docs/processo-reconhecimento-fontes.md`)

As quatro fontes já passaram pelo reconhecimento nos ADRs de origem; as 11 perguntas não mudam com outra cultura ou
contrato (acesso, chave, formato, histórico, revisão, publicação, limite, licença e riscos são os mesmos). O que foi
conferido de novo, por chamada real em 2026-10-08:

- **CFTC:** o contrato 005602 ("SOYBEANS - CHICAGO BOARD OF TRADE") no mesmo dataset. 1.060 semanas, de 2006-06-13 a
  2026-09-29, como os outros contratos. Farelo (026603) e óleo (007601) existem e ficam de fora.
- **FMI:** `PSOYBUSDM` (Global price of Soybeans), `PSOILUSDM` (Soybean Oil) e `PSMEAUSDM` (Soybean Meal), US$/t, média
  do mês, desde 1992-01, no release 365 do FRED, com as mesmas 91 versões desde 2015-11-06 do milho.
- **NOAA:** a máscara `SOYB` responde com a série da soja (a resposta confere a máscara pedida). Ids de região conferidos
  pelo cabeçalho da própria série: BRA 21 = Rio Grande do Sul; ARG 1 = Buenos Aires, 6 = Córdoba, 21 = Santa Fe. 68.300
  valores, desde 1982. **Achado:** a fonte marca semana sem dado com -1 (Buenos Aires, semanas 24 a 28 de 1994). Passa
  a ser aviso (defeito conhecido, nada gravado), não falha; vale para as três culturas.
- **Crop Progress:** `commodity_desc=SOYBEANS`, a mesma consulta do milho. Condição desde 1986; etapas: plantio (desde
  1980), emergência (1999), floração, formação de vagens, queda das folhas (1981) e colheita (1981). Até 2026-10-04.

## Decisão

1. **CFTC:** o contrato `soybeans` (séries `CFTC.SOYBEANS.*`), coletor `cftc-cot-soybeans`, card "CFTC COT - Soja
   (CBOT)".
2. **FMI:** coletor `fred-soja-fmi` (fonte própria `FRED_ALFRED_FMI_SOJA`, como o milho), séries `FRED.PSOYBUSDM`,
   `FRED.PSOILUSDM` e `FRED.PSMEAUSDM`, card "Soja - preços mensais do FMI". A coleta diária relê tudo com as versões
   (não precisa de backfill).
3. **NOAA:** a cultura `soja` (máscara `SOYB`), coletor `noaa-vh-soja`: EUA, Brasil e Argentina (o que os fatores leem)
   e, como contexto, MT, PR, RS, GO, Buenos Aires, Córdoba e Santa Fe. Backfill `npm run backfill:noaa-vh-soja`.
4. **Crop Progress:** o coletor vira fábrica por cultura (`criarColetorCropProgress`), sem mudar o do milho (o mesmo
   código e as mesmas séries); o da soja é `usda-nass-crop-progress-soja`, séries `USDA.SOYBEANS.*`, dois cards
   (condição e progresso).

## Consequências

- Cinco cards novos (76 no total). Nenhum fator, nenhuma regra: a soja continua fora do motor (ADR 0109).
- No servidor, só a NOAA precisa de backfill (`npm run backfill:noaa-vh-soja`, 10 requisições, poucos minutos); o
  COT, o FMI e o Crop Progress baixam o histórico inteiro na primeira coleta diária depois do deploy.
- Faltam na fase 1: área plantada, WASDE, Grain Stocks, Conab e os eventos (extensões de parser e uma frente nova).
