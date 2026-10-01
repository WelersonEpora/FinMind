# B3 — futuro de ouro em dólar (GLD) — reconhecimento

Nível **5** (coletado, histórico completo desde o 1º pregão). Linha do índice: `docs/reconhecimento-fontes/README.md`.
Decisão e autorização: ADR 0044. Séries: `B3.GLD.<TICKER>.<CAMPO>`. Coletor: `b3-gld-futuro`
(`collectors/b3/b3-futuro.collector.js`, o mesmo do CCM e do ICF).

Motivo do reconhecimento: em 2026-10-01 a LBMA fechou o feed público do LBMA Gold Price (403 da Cloudflare em
`prices.lbma.org.uk/json/*.json`, 401 na raiz; a página de preços diz que o histórico foi para o portal MyLBMA, só com
licença da IBA). O coletor `lbma-gold-pm-usd` falhou nas três coletas da manhã (ver [lbma.md](lbma.md)).

## Alternativas testadas (chamada real, 2026-10-01)

| Fonte | Resultado | Serve? |
|---|---|---|
| **B3 — futuro GLD** | No `TradeInformationConsolidatedFile` do Up2Data (o arquivo do CCM e do ICF), segmento `FINANCIAL`, US$/oz | **Sim** |
| FMI — PCPS (`PGOLD`) | API SDMX responde (200), sem chave | Só mensal (média de Londres) |
| Yahoo Finance (`GC=F`, COMEX) | Responde | Não: API não oficial, termos proíbem |
| Swissquote (XAU/USD) | Responde | Não: feed não oficial, só o preço do momento |
| Nasdaq Data Link (`LBMA/GOLD`) | 403 | Não: é a LBMA, mesma licença |
| FRED (`GOLDPMGBD228NLBM`) | Bloqueado | Não: o FRED tirou as séries da LBMA em 2022 |
| BCB SGS 4 (ouro BM&F, grama) | Último ponto em 2019-09-30 | Não: encerrada |
| Bundesbank | Série não encontrada na API (BBEX3) | Republicaria a LBMA, mesma licença |
| Stooq, CME | Desafio anti-robô / 403 | Não |
| World Bank Pink Sheet | Reconhecida em 2026-09-28 | Não: média mensal da LBMA |

## Checklist

| # | Pergunta | Resposta | Evidência |
|---|---|---|---|
| 1 | API oficial? | O mesmo endpoint do Up2Data já usado no CCM (ADR 0009): `arquivos.b3.com.br/api/download/requestname?fileName=TradeInformationConsolidatedFile&date=...`, sem documentação de API | ADR 0009 |
| 2 | Pública ou autenticada? | Pública | chamada real |
| 3 | Cadastro/chave? | Não (o parâmetro `recaptchaToken` vai vazio) | chamada real |
| 4 | Formato | CSV `;`, vírgula decimal, uma linha por instrumento. GLD: `2026-09-30;GLDZ26;BRBMEFGLD0B3;FINANCIAL;4197,5;4267;4208,86;4205,25;0,2;4203,5;;;889;1025;22350855,92` | chamada real |
| 5 | Documentação oficial | Do contrato: matéria da B3 (1 onça, liquidação só financeira, referência no LBMA Gold Price, estreia em 2025-07-21). Do arquivo: nenhuma | Bora Investir (B3) |
| 6 | Histórico | Desde **2025-07-21** (1º pregão, `GLDQ25`, ajuste 3.389,50), ainda dentro da janela de ~15 meses do Up2Data: o histórico inteiro cabe no backfill. O BDI em PDF traz o GLD de 2025-07-21 a 2025-12-11 (com abertura e contratos em aberto), não carregado; de 2022 a 2024 o BDI só tem o ouro à vista em reais (OZ1/OZ2/OZ3, R$/g) | chamada real |
| 7 | Revisões (vintage) | Não esperadas (ajuste de pregão); as mesmas do CCM | ADR 0009 |
| 8 | Fuso / `published_at` | Mesma regra do CCM: fim do dia do pregão em Brasília, estimado | coletor |
| 9 | Limite de requisições | O mesmo arquivo do CCM e do ICF: um download a mais por pregão (~6 MB) | — |
| 10 | Licença | Termos da B3 (os mesmos do CCM e do ICF): uso interno | ADR 0009 |
| 11 | Riscos técnicos | Mesmos do CCM (layout sem documentação, janela rolante). Específicos: é um **futuro**, não o fixing (o preço é de um vencimento e há rolagem); 1 ou 2 vencimentos negociam por dia (média de 4,4 mil contratos/dia, de 14 a 88 mil); não confirmado se a liquidação usa o LBMA AM ou PM | banco de dev |

## Achados

- **Comparação com o LBMA PM** (banco de dev, 286 pregões em comum, de 2025-07-21 a 2026-09-30, o vencimento com mais
  contratos no dia): o ajuste do GLD fica em média a **0,91%** do LBMA PM (diferença absoluta), **0,81% acima** em
  média, no máximo 3,41%. Esperado: é um futuro (custo de carregamento até o vencimento) e o ajuste sai no fim do
  pregão da B3, horas depois do leilão das 15:00 de Londres. Não é a mesma série: é o preço do ouro que o mercado
  brasileiro negocia, liquidado pelo LBMA.
- Vencimentos **mensais**: 18 tickers de `GLDQ25` a `GLDG27`, 294 pregões.

- O volume financeiro (`NtlFinVol`) é em **reais**, como no ICF: 1.025 contratos × US$ 4.208,86 × 1 onça × ~5,18 =
  R$ 22,35 milhões (2026-09-30).
- No mesmo arquivo estão os ETFs de ouro (`GLDI11`, `GLDX11`, `OURO11`, segmento `CASH`): fundos com taxa e câmbio
  embutidos, não o preço do ouro. Ficam de fora (o filtro é o segmento `FINANCIAL` mais o ticker exato).
- Só aparecem no arquivo os vencimentos que negociaram (diferente do CCM, em que vencimentos sem negócio vêm com o
  ajuste).
