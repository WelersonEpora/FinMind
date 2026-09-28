# 0029 — Conab, Boletim da Safra de Café: produção, área e produtividade por UF, com vintage desde 2023

## Contexto

O fator do café de peso **Alto** "Safra brasileira (bienalidade do café)" (`controle_fatores.xlsx`) tem como fontes a
Conab e a ICO, e o calendário de relatórios do FEL 1 lista o "Boletim da Safra de Café — Conab — 2-3x por ano". É o
passo 2 da onda do café (ADR 0028; status, §3): além da safra, é a fonte que define as regiões do clima do café, pela
decisão do usuário de 2026-09-26 (regiões escolhidas a partir das fontes de produção, não de conhecimento geral).

O usuário autorizou a implementação em 2026-09-28 ("Sim" à recomendação: coletor dos levantamentos desde 2023, sem a
série histórica de 2001–2022). Mesmo padrão de autorização pontual dos ADRs anteriores: vale **só para aquisição de
dados**, sem nenhum fator, sinal ou regra.

## Evidência (chamadas reais, 2026-09-28)

- **Páginas.** Cada levantamento tem uma página `.../safra-de-cafe/<n>o-levantamento-de-cafe-safra-<ano>/<o mesmo>`,
  com "Publicado em" e "Atualizado em". O índice da Conab ("Boletim da Safra de Café") só linka as de 2026, mas as
  de **2023 a 2025 continuam no ar**; antes de 2023, todas dão 404 (conferido em 2010, 2016 a 2022).
- **Planilha.** Linkada no conteúdo da página: `site_previsao-de-safra-cafe-<mês>-<ano>.xls` (2026) ou
  `tabela-de-dados-estimativas-da-producao-e-colheita`, sem extensão (2023–2025). Nos dois casos é **XLS antigo**
  (OLE2), do mesmo modelo (criado em jan/2021), com 11 abas. O `HEAD` responde `text/html`; o `GET`, a planilha.
- **15 levantamentos, de jan/2023 a set/2026, lidos sem nenhum valor inválido** (422 a 458 observações cada).
  Abas usadas: `1 Café Total`, `2 Café Arábica` e `3 Café Conilon`, cada uma com área em produção, produtividade e
  produção por região, UF e sub-região (Bahia: Cerrado, Planalto e Atlântico; Minas: Sul e Centro-Oeste, Triângulo e
  Alto Paranaíba, Zona da Mata e Norte), com a safra atual e a anterior.
- **Diferenças de layout tratadas:** o rótulo da safra era "Safra 2022 (a)" até 2024 e virou "Safra 2024" em 2025; a
  área veio em **mil ha só na planilha de jan/2023** (em ha nas outras 14).
- **Data de publicação conferida com a planilha:** o rodapé traz "Nota: Estimativa em <mês>/<ano>". Em 14 dos 15
  levantamentos a data da página cai no mês da nota. No **1º de 2024** a página diz "Publicado em 24/01/2025" e a nota,
  "janeiro/2024": a página foi republicada (várias foram "atualizadas" em 24/01/2025). O **4º de 2024** saiu mesmo em
  jan/2025 (página e nota concordam), no mesmo mês do 1º de 2025.
- **Números plausíveis e com revisão real:** a safra 2026 foi de 66,2 para 66,7 e 67,6 milhões de sacas nos três
  levantamentos do ano; a de 2024 foi de 58,1 para 58,8, 54,8 e 54,2.
- **Concentração** (set/2026): arábica (48,2 milhões de sacas) em MG 73%, SP 13%, ES 9%, BA 2%, PR 2%; conilon
  (19,4 milhões) em ES 63%, BA 17%, RO 15%.
- **Série histórica** (`.../series-historicas/cafe/...`): XLS com as safras de 2001 a 2026 por UF (área em produção e
  em formação, produtividade, produção), atualizada a cada levantamento: é o valor final de cada safra, **sem as
  revisões**.

## Decisão

- **Coletor `conab-cafe`** (`collectors/conab/conab-cafe.collector.js` + `conab-cafe.parser.js`), no molde da Conab
  milho (ADR 0017): monta a URL de cada levantamento (1º a 4º) de cada ano, 404 = ainda não publicado. A coleta
  diária lê as duas últimas safras (8 páginas); o backfill (`npm run backfill:conab-cafe`), de 2023 em diante. A
  coleta diária se recusa a gravar séries sem carga histórica, como a do milho: **rodar o backfill antes**.
- **Séries** `CONAB.CAFE.<REGIAO>.<METRICA>_<TIPO>` em `observation`, fonte `CONAB_LEVANTAMENTO_CAFE`: métricas `AREA`
  (área em produção, ha), `PRODUTIVIDADE` (sc/ha) e `PRODUCAO` (mil sacas de 60 kg beneficiadas); tipos `TOTAL`,
  `ARABICA` e `CONILON`; regiões com as sub-regiões prefixadas pela UF (`MG_SUL_E_CENTRO_OESTE`).
- **Safra = ano da colheita**, `observed_at` em 1º de janeiro desse ano (convenção, como o 1º de setembro no milho).
- **`published_at` real** (a página), conferido com o mês da nota da planilha. Se não confere (página republicada),
  **estimado** no fim do mês da nota (conservador: nunca antes da publicação real), com o motivo no metadata. Planilha
  sem a nota é inválida.
- **Única conversão:** a área em "mil ha" (só jan/2023) é gravada em ha (×1.000), com `unidadeOriginal` no metadata,
  para a série não mudar de escala. Qualquer outra unidade faz a leitura falhar.
- **Card** `CONAB_CAFE` ("Café - safra por região e UF"), por região, com o seletor de métrica (produção, área e
  produtividade em total, arábica e conilon); destaque no Brasil; marcados por padrão Brasil, MG, ES, SP, BA e RO.
- **Fora, de propósito:** a variação percentual (derivada), área em formação, parque cafeeiro, % colhido por mês e a
  série histórica 2001–2022 (sem revisões, a mesma decisão do milho, ADR 0016). A bienalidade é um ciclo de 2 anos e
  4 safras com revisões mostram pouco dele: se o Comitê pedir o histórico longo, ele está na série histórica.

## Carga em dev (2026-09-28)

`backfill:conab-cafe`: 15 levantamentos, `success`, 0 falhas, **2.968 linhas em 230 séries** (1.106 pontos novos e as
revisões). A coleta diária seguinte leu 7 levantamentos (2025 e 2026) e criou 0. `CONAB.CAFE.BRASIL.PRODUCAO_TOTAL` tem
16 versões, de 2023-01-19 a 2026-09-24, só a do 1º levantamento de 2024 com data estimada.

## Consequências

- **Produção:** rodar `npm run backfill:conab-cafe` logo depois do deploy (~30 s). Até lá a coleta diária do
  `conab-cafe` sai "Parcial", pedindo o backfill.
- **Riscos:** sem API nem dicionário de dados (mudança de layout vira falha explícita); a planilha baixada é a versão
  atual do levantamento (várias páginas foram "atualizadas" depois); a Conab pode tirar do ar as páginas antigas (hoje
  começam em 2023). Licença: a mesma ressalva do milho (pergunta 6 do status).
- **Clima do café (próximo passo):** as regiões da NOAA STAR saem daqui: MG, SP e ES (arábica) e ES, BA e RO (conilon).
