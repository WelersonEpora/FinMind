# 0012 — Coleta do FRED pela API REST, com o CSV como reserva

## Contexto

O coletor do FRED usava o CSV público do gráfico (`fredgraph.csv`): um endpoint do site, sem
documentação nem contrato de estabilidade. Ao ler os termos (ADR 0009, "Ressalvas de licença"), a
parte que o FRED formaliza é a **API** (`api.stlouisfed.org`); o CSV não é a interface documentada.
A chave gratuita (`FRED_API_KEY`) já existe desde o ADR 0011 (ALFRED). Item 4 de
`STATUS_DO_PROJETO.md` §3.

## Evidência (chamada real, 2026-09-21)

`GET https://api.stlouisfed.org/fred/series/observations?series_id=<ID>&api_key=...&file_type=json`,
comparada com o CSV nas 4 séries:

| Série | Observações (API) | Observações (CSV) | Diferenças |
|---|---|---|---|
| `DGS10` | 16.163 | 16.163 | 0 |
| `DFII10` | 5.932 | 5.932 | 0 |
| `T10YIE` | 5.933 | 5.933 | 0 |
| `DTWEXBGS` | 5.188 | 5.188 | 0 |

Formato: `{ observations: [{ date, value, ... }] }`, `value: "."` = dia sem valor (igual ao CSV), limite
de 100.000 por chamada (a maior série tem ~16 mil). Depois de implementado, rodar `npm run collect --
--coletor=fred` contra o banco que já tinha os dados do CSV leu 33.216 linhas e criou **0**: as duas vias
são equivalentes para o `observation`.

## Decisão

- **Com `FRED_API_KEY`:** o coletor usa a API REST.
- **Sem a chave:** cai no CSV público, para a coleta não parar num ambiente sem a chave (o CSV continua
  funcionando; a diferença é o enquadramento nos termos, não o dado).
- O `parse` aceita as duas formas e devolve os mesmos pares `[data, valor]`; o `normalize` não muda.
- `published_at` continua **estimado** por regra de defasagem: nem a API, sem `realtime_start`, nem o CSV
  informam a publicação (vintages reais são o ALFRED, ADR 0011).
- A chave vai na URL (a API não aceita header). `baixar` só põe o **host** nas mensagens de erro, então a
  chave não vaza para o log nem para `collection_execution` (coberto por teste).
- `metadata.fonte` passou de `"FRED CSV"` para `"FRED"` nas linhas **novas**; linhas antigas não mudam
  (`observation` é append-only) e a diferença não afeta nenhuma leitura.

## Alternativas consideradas

- **API obrigatória (sem reserva):** descartada — uma VM sem `FRED_API_KEY` deixaria de coletar as 4 séries
  em silêncio. O CSV como reserva evita isso.
- **Manter só o CSV:** descartada — depende de um endpoint sem contrato e fora dos termos formais da API.

## Consequências

- **Produção precisa da chave:** o backend lê `.env` da VM (`env_file` em `docker/compose.prod.yml`). Enquanto
  `FRED_API_KEY` não estiver lá, a produção continua no CSV, sem erro. Depois de incluí-la, reiniciar o
  backend. **Não é feito pelo deploy** — ação manual na VM.
- Termos da API a respeitar se um dia houver exibição a terceiros: não sugerir endosso do Fed e mostrar
  "This product uses the FRED® API but is not endorsed or certified by the Federal Reserve Bank of St.
  Louis". Uso atual: pesquisa interna (ADR 0009).
- O FRED pode ajustar limites de uso da API; o coletor faz 4 chamadas por execução (3 execuções/dia em
  produção), muito abaixo de qualquer limite razoável.
