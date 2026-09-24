# 0023 — Reservas internacionais brasileiras (BCB, SGS 13621)

## Contexto

A linha "Relatório Focus e Reservas (BCB)" do relatório FEL 1 (ouro) tem duas metades. O Focus foi implementado
no ADR 0022. As **Reservas** ficaram de fora daquela entrega por escopo: não foi uma limitação da fonte. O FEL 1
descreve a fonte como "Banco Central do Brasil — **Reservas internacionais brasileiras**", pela "API de dados
abertos gratuita (api.bcb.gov.br); reservas internacionais", com periodicidade semanal/mensal. Ela aparece entre as
fontes do fator do ouro "Demanda de bancos centrais (reservas)", ao lado de IMF e WGC.

Em 2026-09-23 o usuário pediu para completar o que o FEL 1 pede. Mesmo padrão de autorização pontual dos ADRs 0001,
0013, 0015 e 0017–0022: vale **só para aquisição de dados**, sem nenhum fator.

## Evidência (chamadas reais, 2026-09-23)

- O Portal de Dados Abertos do BCB lista duas séries diárias de reservas: **13621** e **13982**. O serviço web do
  SGS (`getUltimoValorXML`) dá os nomes oficiais:

  | Série | Nome oficial | Unidade | Desde |
  |---|---|---|---|
  | 13621 | Reservas internacionais - **Total** - diária | US$ (milhões) | 1998-09-01 |
  | 13982 | Reservas internacionais - Conceito liquidez - Total - Diária | US$ (milhões) | 2008-01-02 |
  | 3546 | Reservas internacionais - **Total** - mensal | US$ (milhões) | 1971-01 |

- O conceito liquidez (13982) "inclui as operações de linhas com recompra e empréstimos em moeda estrangeira feitas
  pelo Banco Central" (descrição oficial) e **difere do total desde nov/2024** (ex.: dez/2025, 372.984 contra
  358.234).
- **A mensal oficial (3546) é o fim de mês da diária 13621**: 32 de 32 meses iguais (jan/2024 a ago/2026). Depois
  da carga, 330 de 336 meses iguais desde 1998. Os **6 diferentes são de 2007 a 2010**, por 1 a 67 US$ milhões
  (2007-11, 2008-09, 2009-01, 2009-03, 2009-04, 2010-02). A causa não foi determinada; pode ser revisão da mensal
  sem revisão da diária.
- **Defasagem:** na quarta, 23/09/2026, por volta das 20:40 em Brasília, o último valor era o de terça, 22/09. O
  valor de D sai no dia útil seguinte. Só uma medição: o horário exato não é conhecido.
- A API aceita no máximo 10 anos por pedido, como nas outras séries do SGS. Uma janela de 10 anos devolveu XML no
  lugar de JSON uma vez e passou na repetição; algumas respostas levaram 15 a 20 s.
- Há um ponto num sábado (2000-09-16), uma peculiaridade da fonte, mantida como veio.
- **Licença:** ODbL (Portal de Dados Abertos do BCB).

## Decisão

- **Uma série: SGS 13621** (o "Total"), em `observation`: `BCB_SGS.RESERVAS_INTERNACIONAIS`, `source_code = "BCB_SGS"`,
  unidade `US$ milhões`, um valor por dia útil. É o que o FEL 1 chama de "reservas internacionais brasileiras", e
  a mensal oficial é o fim de mês dela: coletar a mensal seria gravar o mesmo dado duas vezes (o FEL 1 diz
  "semanal/mensal"; a diária cobre os dois).
- **Não coletados:** o conceito liquidez (é uma variante de conceito, não o total), a mensal (e, com ela, o período
  de 1971 a 1998) e a composição das reservas (ouro, moedas, títulos). Esta última **não** é o que o FEL 1 pede na
  linha do BCB.
- **Em `observation`, não em `market_quote`** (onde estão dólar e Selic): o FEL 1 exige saber quando o dado ficou
  disponível, e a revisão não foi medida. Se a fonte revisar, a versão nova entra sozinha (ADR 0008).
- **`observed_at`** = o dia da reserva. **`published_at`** estimado (base `lag_rule`) = fim do dia (UTC) da
  **próxima data da própria série**, que é o próximo dia útil do BCB, então os feriados saem da fonte. Mesma
  técnica do ADR 0022. O ponto mais recente ainda não tem data seguinte: vai sem `published_at` e o serviço usa
  `collected_at` (ADR 0008), o que é conservador.
- Coletor `bcb-reservas-internacionais` (`backend/src/collectors/bcb/bcb-reservas.collector.js`) na coleta diária,
  com os 10 últimos pontos. Backfill `npm run backfill:bcb-reservas`: série inteira, 3 janelas de 10 anos numa
  execução, até 3 tentativas por janela. Card `RESERVAS_INTERNACIONAIS_BCB` nos Observáveis, diário.

## Resultado (2026-09-23, banco de dev)

- **7.046 observações, de 1998-09-01 a 2026-09-22.** 7.045 com a regra do próximo dia da série e 1 com
  `collected_at` (22/09). 0 duplicatas, 0 revisões, 0 inválidos. Nenhuma publicação cai no dia observado ou antes.
- Idempotência: a coleta diária logo depois do backfill ignorou 10 de 10; o backfill repetido ignorou 7.046 de 7.046.
- Contra a mensal oficial: 330 de 336 meses iguais (acima).
- `asOf()`: até 2026-09-08 12:00 UTC vale o dado de 03/09 (373.396). O de sexta, 04/09 (372.881), só vale a partir
  do fim de 08/09, porque a segunda, 07/09, foi feriado.

**Servidor (2026-09-23):** `npm run backfill:bcb-reservas` gravou 7.046 observações, 0 falhas, em ~65 s: os mesmos
números de dev.

## Consequências e limitações

- 100% das datas de publicação são estimadas, com uma medição só da defasagem. O ponto mais recente de cada coleta
  entra com `collected_at`.
- Revisão da diária não foi medida. Há 6 meses de 2007–2010 em que a mensal oficial difere do fim de mês da diária.
- Sem histórico antes de 1998-09-01 na diária (a mensal iria a 1971, mas não é coletada).
- Não implementado: conceito liquidez, composição das reservas (ouro), reservas de outros países (IMF, WGC) e
  qualquer fator.
