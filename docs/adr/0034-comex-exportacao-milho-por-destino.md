# 0034 — Exportação de milho por país de destino (Comex Stat)

## Contexto

O fator 8 do milho na planilha `controle_fatores.xlsx`, "Política comercial e exportações — China, tarifas", pede a
exportação por destino. O FinMind só gravava o total nacional (ADR 0013). O reconhecimento de Abimilho e CNA
(`docs/reconhecimento-fontes/abimilho-cna.md`, 2026-09-24) já tinha notado que a mesma API do Comex Stat traz a quebra
por país, e a pergunta 12 da §4 do status a propunha ao Comitê.

O usuário autorizou em 2026-10-01 ("Coloque na lista 'Falta fazer' e já pode começar o item 1"). O item 1 era a lista
de fontes grátis em fontes que o FinMind já usa, depois da reunião de 2026-09-30 com o David. A autorização vale
**só para aquisição de dados**: medir os fatores é trabalho do David (decisão do usuário, 2026-10-01). A parte de
eventos da pergunta 12 (tarifas) não é tratada aqui.

## Evidência (chamadas reais, 2026-10-01)

- `POST /general` com `details: ["country"]`, NCM 10059010, 2025: **553 linhas, 97 países**, de 32 a 59 países por
  mês (2012: de 13 a 42). Cada linha traz `year`, `monthNumber`, `country` (o **nome**, em português), `metricFOB` e
  `metricKG`. Não traz código de país.
- `GET /tables/countries`: **281 países**, cada um com `id` (3 dígitos) e `text` (o nome), sem nome repetido (China =
  160, Irã = 372, Estados Unidos = 249).
- **A soma dos países é igual ao total já gravado em 48 de 48 valores** (os 12 meses de 2012 e de 2025, em kg e em
  US$), comparados com `COMEX.MILHO.EXPORT.KG` e `.FOB_USD` do banco de dev.
- O limite de requisições é o mesmo do ADR 0013 (HTTP 429 depois de chamadas seguidas): a pausa e a espera crescente
  do coletor valem também aqui.

## Decisão

1. **Um terceiro "produto" no coletor do Comex Stat** (`comex-exportacao.collector.js`): `milho-destino`, código
   `comex-milho-exportacao-destino`, o mesmo NCM e o mesmo início (2005) do milho, com `porPais: true`. A consulta pede
   `details: ["country"]`, e o resto do coletor (pausa, 429, `published_at` estimado no dia 15 do mês seguinte,
   releitura do ano corrente e do anterior) é o mesmo.
2. **O país é gravado pelo código, não pelo nome.** A tabela de países fica no código (`shared/utils/comex-pais.js`,
   gerada da API em 2026-10-01), como a dos países da PSD (ADR 0031). Um nome que não esteja nela vira item inválido,
   com o aviso para atualizar a tabela, nunca uma série com o nome no lugar do código. Assim a coleta não faz uma
   chamada a mais (e não gasta o limite de requisições) para ler a tabela.
3. **Séries** `COMEX.MILHO.EXPORT_DESTINO.<CODIGO_PAIS>.KG` e `.FOB_USD`, mensais, como publicadas. Um mês sem
   exportação para um país não tem linha (ausência, não zero).
4. **Carga histórica** pelo script do Comex que já existe: `npm run backfill:comex-milho-destino` (2005 até hoje, em
   blocos de 5 anos).
5. **Card** "Exportação de milho por destino (Comex Stat)", com um item por país (seletor de países, como o da PSD do
   café) e o volume ou o valor FOB no seletor de métrica. O destaque é a China, porque a planilha a nomeia; vêm
   marcados os 5 maiores destinos de 2025.

## Fora do escopo (de propósito)

- **Participação da China no total, ranking de destinos ou variação**: são medidas, e cabem ao David.
- **Tarifas e decisões de governo** (a outra metade do fator 8): são eventos, não números. Dependem da busca de
  eventos, que não existe (pergunta 12).
- **Porto, UF de origem e via de transporte**, e o **café por destino**: a mesma API traz, mas o usuário não pediu.
  O café é uma linha a mais em `PRODUTOS`, se for o caso.

## Resultado (2026-10-01, banco de dev)

- `npm run backfill:comex-milho-destino`: **15.028 linhas**, 153 países, de jan/2005 a ago/2026, 0 falhas de gravação.
  Dois blocos (2020–2024 e 2025–2026) falharam no 1º passe por 429 (o limite da fonte, depois das chamadas do
  reconhecimento) e passaram ao repetir só eles com `--anoInicial=2020`, como o script orienta.
- **A soma dos países é igual ao total gravado em 260 de 260 meses** (kg), a série inteira.
- Maiores destinos de 2025, em volume: Irã (9,08 Mt), Egito (7,65), Vietnã (4,27), Arábia Saudita (1,95) e China
  (1,86). São os marcados de início no card.

## Consequências e limitações

- **A tabela de países é uma foto.** Se o Comex Stat incluir ou renomear um país, a coleta passa a reportar o nome
  como inválido até a tabela ser regenerada (o aviso diz qual nome).
- **As mesmas ressalvas do total (ADR 0013):** só desde 2005 (antes o NCM muda), `published_at` estimado e revisões da
  fonte não confirmadas.
- **A coleta diária faz duas chamadas a mais** ao Comex Stat (o ano corrente e o anterior, por país), em sequência com
  as do milho e do café: o 429 pode aparecer mais, e a espera crescente do coletor o absorve.
