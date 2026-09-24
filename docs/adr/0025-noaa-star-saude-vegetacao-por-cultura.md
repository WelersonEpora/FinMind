# 0025 — NOAA STAR: saúde da vegetação por cultura (clima do milho)

## Contexto

O fator do milho **"Clima e safra EUA — Crop Progress"** (peso Alto) do FEL 1 pede "clima (chuva/temperatura)", e a
revisão do relatório (§6.5.1) tornou o clima obrigatório, listando como fontes **NOAA, INMET, NASA POWER, CPTEC/INPE
e ECMWF/Copernicus ERA5**. A auditoria de 2026-09-22 (`docs/cobertura-fatores-fel1-milho-ouro.md`) registrou o clima
como "nem reconhecido".

Em 2026-09-24 o usuário reformulou a pergunta: o que o FEL 1 precisa não é saber se vai chover num lugar, e sim
**quanto o clima afeta o milho e o café**, com uma medida pronta e mensurável que afete o preço. Depois do
reconhecimento (`docs/reconhecimento-fontes/clima.md`), pediu para implementar a NOAA STAR por cultura, **primeiro o
milho e depois o café**. Mesmo padrão de autorização pontual dos ADRs 0001, 0013, 0015 e 0017–0024: vale **só para
aquisição de dados**, sem nenhum fator.

## Por que não as fontes do FEL 1

As cinco fontes da lista do relatório entregam **tempo** (chuva e temperatura por ponto ou por grade), não o efeito
dele na lavoura:

- **NASA POWER** (testada: API sem chave, chuva diária por coordenada), **INMET** (estações), **CPTEC/INPE** e
  **ERA5** (reanálise em grade, com cadastro).
- Para virar algo ligado ao preço do milho, o FinMind teria de escolher regiões, ponderar pela área plantada,
  comparar com a climatologia e decidir o que é "ruim". Isso é um **fator construído pelo FinMind**, que é
  definição do Comitê (`CLAUDE.md`, "Restrições permanentes"), e um trabalho de processamento geoespacial que a
  própria NOAA já faz.
- A "NOAA" da lista do relatório não aponta um produto. O produto que resolve o pedido é o da **NOAA STAR**
  (Vegetation Health por cultura), que não é o que o relatório descreve ("API pública e gratuita" de tempo).

Conclusão registrada: **as fontes de clima do FEL 1 são inadequadas para o FinMind nesta fase** (dado bruto, que só
serviria a um fator ainda não definido). Ficam descartadas até o Comitê pedir previsão do tempo ou risco de geada
(ver "Consequências").

## Evidência (chamadas reais, 2026-09-24)

- **Endpoint:** a página "VH Time Series by administrative regions for specific crop"
  (`vh_adminMeanByCrop.php`) monta, no JavaScript, o link de dados
  `get_TS_admin.php?provinceID=<id>&country=<ISO3>&adminVHversion=GC_Current&yearlyTag=Weekly&type=Mean&TagCropland=<cultura>&year1=<a>&year2=<b>`.
  Sem chave. O `robots.txt` do host não restringe `/smcd/emb/vci/VH/`. O `fetch` do Node funciona.
- **Cobertura:** 161 países, por estado/província (ids de `getProvinceNames.php`), 20+ culturas, entre elas milho
  (`MAIZ`), café arábica (`ACOF`) e robusta (`RCOF`). A máscara de cada cultura é o mapa de área colhida do MapSPAM
  2010.
- **Formato:** HTML com um cabeçalho ("Mean data for BRA  Province= 11: Mato Grosso ... for area with 'MAIZ'") e um
  `<pre>` com `ano,semana, SMN,SMT,VCI,TCI, VHI` por linha. Semana sem dado = `-1` em tudo.
- **Histórico:** desde **1982** (Brasil/milho: 2.339 linhas até 2026, 2.276 semanas com dado; sem dado em 1984-85,
  1994-95 e 2003-05, falhas de satélite).
- **Semana:** o guia do usuário (VHP User Guide v1.4) mostra o período 17 de 2013 como dias do ano 113 a 119: semana N
  = dias 7(N-1)+1 a 7N, 52 semanas. A página considera disponível, no dia D, a semana `floor((D-1)/7)`: **a semana
  sai no dia seguinte ao fim**. Em 24/09/2026 a última era a 38 (17 a 23/09).
- **Conferência com eventos conhecidos:** EUA/milho, seca de 2012, semanas 26-34: VHI de 33 a 39 (semana 30 de 2014,
  safra recorde: 64). Mato Grosso/milho, quebra da safrinha de 2021, semanas 18-22: VHI de 39 a 30. Café arábica em
  Minas Gerais, 2021: de 53 em janeiro a 35 em maio.
- **Licença:** dado do governo dos EUA (NOAA/NESDIS), domínio público.

## Decisão

- **Coletor `noaa-vh-milho`** (`backend/src/collectors/noaa/noaa-vh.collector.js`), criado por uma fábrica por
  cultura (`criarColetorVh("milho")`): o café entra como mais uma entrada em `CULTURAS`, sem código novo.
- **18 regiões:** o **mundo** (faixa global de 55°S a 65°N, código `W65` da página) e os **hemisférios Norte** (0 a 65°N, `WNH`) e **Sul** (40°S a 0, `WSH`), acrescentados no mesmo dia a pedido do usuário; EUA, Brasil, Argentina, China e Ucrânia (os países do card "Milho por país" do WASDE mais a
  Ucrânia, grande exportadora); as 5 maiores UFs de milho da Conab (MT, PR, GO, MS, MG); os 5 maiores estados de milho
  dos EUA (Iowa, Illinois, Nebraska, Minnesota, Indiana).
- **3 índices**, que são o indicador pronto da fonte: **VHI** (saúde da vegetação), **VCI** (condição da vegetação,
  ligada à umidade) e **TCI** (condição térmica, ligada ao calor), 0 a 100. SMN e SMT (NDVI e temperatura de brilho
  suavizados) são insumos dos índices e não entram, pela regra de guardar só o que o motor usa.
- **Em `observation`** (a NOAA reprocessa a série): `NOAA_VH.MILHO.<REGIAO>.<INDICE>`, `source_code = "NOAA_STAR_VH"`,
  `observed_at` = último dia da semana. **`published_at` estimado** (`lag_rule`): fim do dia (UTC) seguinte ao fim da
  semana, a regra da própria página; o serviço limita ao `collected_at` (ADR 0008).
- **Coleta diária** relê o ano corrente e o anterior (18 requisições pequenas): pega a semana nova e as revisões
  recentes. **Backfill** `npm run backfill:noaa-vh` pede desde 1981 (18 requisições de ~100 KB, ~45 s). Cada semana é
  uma observação própria, então a ordem de carga não importa.
- **Card `NOAA_VH_MILHO`** ("Clima sobre o milho - saúde da vegetação (NOAA)"), semanal, com seletor de país/estado
  (padrão Brasil, EUA e Mundo) e de índice (VHI por padrão).

## Resultado (2026-09-24, banco de dev)

- **Backfill:** 122.904 observações (18 regiões × 3 índices × 2.276 semanas, de 1982-01-07 a 2026-09-23), 0
  inválidas, 0 falhas. As 3 regiões globais entraram num segundo backfill (20.484 criadas, as 102.420 anteriores
  ignoradas). Mundo, Norte e Sul na semana 38/2026: 50,13, 48,24 e 54,58, iguais à página.
- **Coleta diária em seguida:** 4.050 lidas, 4.050 ignoradas (idempotente).
- **Conferência com a fonte:** Brasil, VHI das semanas 37 e 38 de 2026: 53,59 e 53,22 no banco e na página.

## Consequências e limitações

- **O histórico é a versão reprocessada de hoje.** A NOAA revisa o algoritmo (há uma versão experimental "WF2025") e
  suaviza os valores recentes. O que se sabia em cada data só existe daqui para frente; revisão futura vira versão
  nova com `collected_at`.
- **100% das datas de publicação são estimadas.** A regra vem do JavaScript da página, não de um calendário oficial.
- **Máscara de cultura fixa (MapSPAM 2010)**, sem separar a safrinha da 1ª safra no Brasil: a estação se vê pela
  semana do ano.
- **Endpoint não documentado como API.** Se a página mudar, a coleta falha com erro de fonte (o parser confere país,
  província, cultura e colunas).
- **Mundo e hemisférios diluem choques regionais** (média ponderada pela área do milho): na seca de 2012 os EUA
  foram a VHI 33-35 e o mundo, a ~44. Servem de termômetro geral, não substituem os países.
- **O VHI mede o efeito já ocorrido.** Não cobre previsão do tempo (o que o mercado precifica à frente) nem geada no
  café, que o VHI só mostra semanas depois. Se o Comitê pedir esses componentes, aí sim entram fontes de dado bruto
  (NOAA CPC, ECMWF, INMET) e um fator.
- **Não implementadas, reconhecidas como possíveis** (`docs/reconhecimento-fontes/clima.md`): USDA "Agriculture in
  Drought" (% da área de milho dos EUA em seca, semanal, desde 2000), FAO ASIS (índice de estresse agrícola por
  estado do Brasil, sem separar cultura, desde 1984) e o ONI da NOAA CPC (El Niño/La Niña, mensal, desde 1950).
- **Nenhum fator:** como o índice entra no preço do milho (regiões, pesos, fases do ciclo, limiar) é do Comitê.
- **Café:** próximo passo pedido pelo usuário; mesma fonte e mesmo coletor.
