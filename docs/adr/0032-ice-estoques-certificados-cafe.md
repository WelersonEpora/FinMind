# 0032 — ICE: estoques certificados do café "C", diário desde 2016, com o risco dos termos de uso aceito

## Contexto

O fator do café de peso **Alto** "Estoque global e certificado (ICE)" (`controle_fatores.xlsx`) tem como indicador o
"estoque certificado ICE" e o balanço da ICO. O balanço mundial veio da PSD (ADR 0031); o estoque certificado só a ICE
publica por dia (a ICO traz a média mensal num PDF). Reconhecimento: `docs/reconhecimento-fontes/cafe-mercado-mundial.md`.

**Autorização do usuário (2026-09-28), com risco aceito.** Os termos de uso do site da ICE, lidos nesse dia, dão uma
licença "only for your own personal, non-commercial use" e dizem que ela "does not include use of any data mining,
robots or similar data gathering or extraction methods. We may revoke this license at any time". Informado dessa
cláusula, e de que o 429 do Cloudflare é a aplicação dela, o usuário manteve a decisão: **coleta diária e backfill**.
Vale **só para aquisição de dados**, uso interno, sem redistribuição, e sem nenhum fator, sinal ou regra. A alternativa
licenciada, se o risco precisar ser eliminado, é a tabela 5 do *Coffee Market Report* da ICO (mensal, reuso livre com
citação) ou uma licença de dados da ICE (paga).

## Evidência (chamadas reais, 2026-09-28)

- **Arquivo.** `https://www.ice.com/publicdocs/futures_us_reports/coffee/coffee_cert_stock_AAAAMMDD.xls`, público, sem
  chave, listado na página "Certified Stock Reports" da ICE. Dia sem pregão: **404**. O `robots.txt` não bloqueia
  `/publicdocs`.
- **Layout.** XLS antigo, uma aba: título `COFFEE "C" CERTIFIED WAREHOUSE STOCK REPORT`, "As of: Sep 25, 2026
  1:18:21PM" e o bloco de sacas certificadas (uma linha por origem, uma coluna por porto e "Total"), depois blocos
  auxiliares. **Os portos mudam** (2016: Antwerp, Barcelona, Hamburg/Bremen, Houston, Miami, New Orleans, New York;
  2021: Virginia no lugar de New Orleans; 2026: siglas, com NOLA e VA) e a linha "TOTAL BAGS CERTIFIED" só existe nos
  recentes; os blocos auxiliares mudam de formato (pendentes por porto em 2016, por origem em 2026).
- **Soma confere** nos três arquivos lidos: 2016-01-04, 1.730.059 sacas (14 origens); 2021-07-21, 2.190.238 (12);
  2026-09-25, 254.304 (16).
- **Data de publicação real.** O `Last-Modified` guarda o horário original de cada arquivo: 2016-01-04 18:41:28 GMT,
  2021-07-21 17:52:17 GMT, 2026-09-25 17:22:12 GMT, minutos depois do "As of" (horário de Nova York).
- **Limite.** Na sessão anterior, 429 depois de 2 ou 3 downloads, mesmo com 10 s entre eles. Nesta, 3 downloads com
  20 s entre eles passaram, e a coleta diária de 3 arquivos também.

## Decisão

- **Coletor `ice-cafe-estoques`** (`collectors/ice/ice-cafe-estoques.collector.js`), camada `observation` (ADR 0008),
  `source_code` `ICE_COFFEE_CERT`.
- **Só o bloco de sacas certificadas, só a coluna Total:** uma série por origem e o total,
  `ICE.CAFE_C.ESTOQUE.<ORIGEM>.CERTIFICADO` (origem = nome da planilha normalizado; `TOTAL`), em sacas. Fora: a quebra
  por porto, as sacas de transição, a classificação do dia, as pendentes e as marcadas para reensaque. Uma origem
  ausente num dia não vira zero (o FinMind não grava valor que a fonte não publicou).
- **Conferência:** título, "As of" igual ao dia do arquivo e a soma das origens igual ao total; se falhar, nada do
  arquivo é gravado (inválido daquele dia).
- **published_at** = `Last-Modified` (real), se estiver entre o "As of" e 3 dias depois; senão, o "As of" em
  `America/New_York`, estimado. A série não revisa.
- **Contenção** (por causa dos termos de uso e do limite): um pedido por vez, **20 s** entre eles, só dos dias que
  ainda não estão no banco, com o user-agent do FinMind. Um 429 espera o `Retry-After` ou um recuo crescente (1, 2, 5
  e 10 min no backfill; 1 e 2 min na diária) e tenta de novo; persistindo, o lote **para** e grava o que já baixou (o
  resto vira aviso). Nenhuma técnica de evasão (troca de IP, disfarce de navegador).
- **Coleta diária:** os dias úteis dos últimos 7 que faltam no banco, no máximo 3 por execução, sem pedir o dia
  corrente antes das 18h UTC (o arquivo sai ~13h20 de Nova York).
- **Backfill:** `npm run backfill:ice-cafe-estoques` (`--desde`/`--ate`), desde 2016-01-04, em blocos mensais do mais
  recente para o mais antigo, cada um gravado ao terminar; bloqueado por 429, pausa de 30 min e repete o bloco; 6
  bloqueios seguidos, para. Reexecutar retoma de onde parou. Sem nenhum 429, ~2.700 arquivos levam ~15 h.
- **Card** `ICE_CAFE_ESTOQUES` ("Café - estoques certificados da ICE"), por origem; destaque e padrão: o total.

## Carga em dev (2026-09-28)

Coleta diária: 3 arquivos (21 a 23/09), 51 valores, 0 falhas; total de 253.355, 256.678 e 254.480 sacas.
Backfill de teste (`--desde=2026-08-01`): 36 arquivos em ~12 min, **nenhum 429** com 20 s entre os pedidos; 1 dia sem
arquivo (07/09, Labor Day, feriado nos EUA); 39 pregões de 2026-08-03 a 2026-09-25, 17 séries (16 origens e o total),
total entre 217.646 e 260.720 sacas, todas com `published_at` real. O backfill completo não foi rodado em dev (ver
abaixo).

## Consequências

- **Risco jurídico** aceito pelo usuário: a ICE pode revogar o acesso sem aviso, e o dado não pode ser exibido a
  terceiros nem redistribuído. Antes de qualquer uso fora do FinMind, trocar pela ICO (tabela 5, mensal) ou licenciar.
- **Risco técnico:** endpoint sem documentação, layout que já mudou (o parser só depende do 1º bloco e da coluna
  "Total"), e o 429, que pode tornar o backfill lento (dias) ou inviável.
- **Produção:** a coleta diária entra com o deploy; o backfill completo roda **só no servidor** (dev e servidor ao mesmo
  tempo dobram os pedidos ao mesmo site).
