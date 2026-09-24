# 0024 — EIA: produção e estoques semanais de etanol combustível dos EUA

## Contexto

O fator do milho **"Demanda de etanol e biocombustível"** (peso Médio) do FEL 1 tem como fontes "EIA, USDA" e
como dado "Produção de etanol, estoques" (`controle_fatores.xlsx`). O relatório explica o mecanismo: "milho é
matéria-prima de etanol nos EUA; disputa com uso alimentar". A auditoria de 2026-09-22
(`docs/cobertura-fatores-fel1-milho-ouro.md`) registrou esse fator como um dos dois sem nenhuma fonte, e a EIA
como "nunca reconhecida".

Em 2026-09-23 o usuário pediu para ver o que o FEL 1 diz e tentar fazer. Mesmo padrão de autorização pontual dos
ADRs 0001, 0013, 0015 e 0017–0023: vale **só para aquisição de dados**, sem nenhum fator.

## Evidência (chamadas reais, 2026-09-23)

- **A API v2 (`api.eia.gov`) exige chave**: sem ela, 403 `API_KEY_MISSING`. O cadastro é gratuito, mas precisa ser
  feito pelo usuário.
- **O mesmo dado sai sem chave** na planilha histórica de cada série (`/dnav/pet/hist_xls/<SOURCEKEY>w.xls`, ~65 KB,
  aba "Data 1": data da semana e valor). O `robots.txt` da EIA não restringe `/dnav/`. Duas séries:
  - `W_EPOOXE_YOP_NUS_MBBLD` — "Weekly U.S. Oxygenate Plant Production of Fuel Ethanol (Thousand Barrels per Day)";
  - `W_EPOOXE_SAE_NUS_MBBL` — "Weekly U.S. Ending Stocks of Fuel Ethanol (Thousand Barrels)".
- **Histórico:** 851 semanas por série, **de 2010-06-04 a 2026-09-18**, sem lacuna. Todas as semanas terminam numa
  sexta.
- **Conferência com a tabela oficial do WPSR** (`ir.eia.gov/wpsr/table9.csv` e `table1.csv`, edição de 2026-09-23):
  produção 1.028, 1.099, 1.024 e 994 (semanas de 18/09/2026, 11/09/2026, 19/09/2025 e 20/09/2024) e estoques 24.683,
  25.220, 23.468 e 23.524 — **8 de 8 iguais**.
- **Publicação:** a página oficial de calendário do WPSR diz que as tabelas XLS saem "após 10:30 ET de quarta" e que
  "em algumas semanas com feriado a divulgação atrasa um dia". A página lista as exceções de ~2 anos (14 semanas,
  2024-12-27 a 2026-11-06). O `Last-Modified` das planilhas de 2026-09-23 era 15:49 UTC.
- **Licença:** "U.S. government publications are in the public domain [...] You may use and/or distribute any of
  our data" (página Copyrights and Reuse da EIA). A citação é pedida.

## Decisão

- **Duas séries em `observation`:** `EIA.ETANOL.PRODUCAO` (mil barris/dia) e `EIA.ETANOL.ESTOQUES` (mil barris),
  com `source_code = "EIA"`. `observed_at` é a sexta em que a semana termina. Cada coleta baixa as duas planilhas
  inteiras, como o FRED, então a primeira execução já é a carga histórica e não há script de backfill.
- **`published_at` estimado** (`lag_rule`), sempre no fim do dia (UTC), o que é conservador em relação às 10:30 ET:
  1. se a semana está no calendário oficial de feriados, vale a **data alternativa** dele (a página é lida a cada
     coleta; se falhar, a coleta segue só com a regra);
  2. senão, a **regra**: quarta seguinte à sexta, ou quinta se houver feriado federal dos EUA de segunda a quarta
     da semana de divulgação.

  A regra bate com **13 das 14** exceções oficiais. A que não bate é o Natal de 2025 (semana de 19/12, divulgada em
  29/12 por fechamento extraordinário), que a página cobre.
- **Por que planilha, e não a API:** a API exige uma chave que ainda não existe. Se a chave for criada, a troca de
  via fica restrita ao download; o dado é o mesmo.
- Coletor `eia-etanol` (`backend/src/collectors/eia/eia-etanol.collector.js`) na coleta diária. Card
  `ETANOL_EUA_EIA` nos Observáveis, semanal, com seletor de métrica.

## Resultado (2026-09-23, banco de dev)

- **1.702 observações** (851 por série, de 2010-06-04 a 2026-09-18). 24 datas vieram do calendário oficial e 1.678
  da regra. 0 duplicatas, 0 inválidos, 0 falhas.
- Idempotência: a segunda coleta ignorou 1.702 de 1.702.
- Datas de publicação: 1.456 às quartas, 244 às quintas e 2 às segundas (a semana de 19/12/2025 e a correspondente
  da outra série).

## Consequências e limitações

- 100% das datas de publicação são estimadas. **Fechamentos extraordinários antes de 2024-12** (como o Natal de
  2025) não estão na página, então a regra pode antecipar a data em semanas de fim de ano do histórico antigo.
- A planilha traz só o valor atual de cada semana: revisões passadas não são recuperáveis. Uma revisão futura vira
  versão nova com `collected_at` (ADR 0008).
- **Não coletados:** consumo, importação e exportação de etanol, os dados mensais da EIA e a metade "USDA" do
  fator, o milho usado para etanol. Este está no WASDE, cujo coletor não extrai a linha de etanol (a definição mudou
  ao longo das edições, ADR 0015).
- Nenhum fator: a relação entre etanol e o preço do milho é do Comitê.
