# Clima — reconhecimento das fontes (FEL 1 §6.5.1) e implementação da NOAA STAR por cultura

**Data:** 2026-09-24. **Situação:** NOAA STAR, saúde da vegetação por cultura, **implementada para o milho** (ADR
0025); café é o próximo passo. As cinco fontes de clima do FEL 1 são **inadequadas** para o FinMind nesta fase.
Outras três fontes foram reconhecidas como possíveis e **não serão implementadas** por ora.

## A pergunta certa

O FEL 1 lista o clima como obrigatório (fator do milho "Clima e safra", peso Alto), mas o que o motor precisa não é
saber se vai chover num lugar: é **quanto o clima afeta a lavoura de milho e de café**, numa medida pronta e
mensurável. O critério usado aqui: a fonte entrega um **indicador ligado à cultura**, já calculado por ela, ou só
**dado de tempo** que o FinMind teria de transformar (o que seria um fator, definição do Comitê)?

## As fontes do FEL 1: inadequadas

| Fonte do FEL 1 | O que entrega (verificado) | Por que é inadequada |
|---|---|---|
| NOAA (sem produto definido no relatório) | O relatório diz "API pública e gratuita", sem dizer qual. As APIs de tempo da NOAA (estações, previsão) dão chuva e temperatura | Dado de tempo. O produto útil da NOAA é outro (STAR, abaixo) |
| INMET | Estações meteorológicas (chuva, temperatura), só Brasil | Dado bruto por ponto; séries com falhas; sem ligação com a cultura |
| NASA POWER | API sem chave, testada: chuva diária por coordenada (ex.: -12,5 / -55,5, MT, 0,08 mm em 01/08/2026); reanálise desde ~1981 | Dado bruto por ponto; precisaria de regiões, pesos e climatologia montados pelo FinMind |
| CPTEC/INPE | Previsão e monitoramento, mapas | Dado bruto ou mapa, sem série pronta por cultura |
| ECMWF/Copernicus ERA5 | Reanálise em grade, com cadastro | Dado bruto em grade (NetCDF), processamento geoespacial pesado |

Em todas, transformar o tempo em "efeito no milho" é escolher regiões, ponderar pela área plantada, comparar com a
média e definir o que é "ruim": um **fator construído pelo FinMind**, que não pode ser inventado. Somar e Climatempo
são comerciais (Fase 3 do relatório).

## A fonte adotada: NOAA STAR, Vegetation Health por cultura

| # | Pergunta | Resposta (evidência de 2026-09-24) |
|---|---|---|
| 1 | API oficial? | Não documentada como API. É o link de dados em texto da página oficial "VH Time Series by administrative regions for specific crop" (`get_TS_admin.php`, parâmetros tirados do JavaScript da página) |
| 2 | Pública ou autenticada? | Pública |
| 3 | Cadastro ou chave? | Não |
| 4 | Formato | HTML com cabeçalho (país, província, cultura, versão) e um `<pre>` com `ano,semana, SMN,SMT,VCI,TCI, VHI`; semana sem dado = `-1` |
| 5 | Documentação | VHP User Guide v1.4 (formato e definição da semana) e as páginas do produto; não há documentação do endpoint |
| 6 | Histórico | Desde **1982**, semanal, 161 países, por estado/província, 20+ culturas (milho, café arábica e robusta, soja, trigo...). Buracos de satélite em 1984-85, 1994-95 e 2003-05 |
| 7 | Revisa? | **Sim, por reprocessamento**: versão atual "GC_Current" e uma experimental "WF2025"; valores recentes suavizados. Revisão semana a semana não medida (vai para `observation`) |
| 8 | Publicação | A semana sai no **dia seguinte** ao fim (regra do JavaScript da página; em 24/09 a última era a 38, de 17 a 23/09). Sem calendário oficial: data estimada |
| 9 | Limite de requisições | Não verificado. ~3 s e ~100 KB por série completa; a coleta diária faz 15 requisições pequenas |
| 10 | Licença | Governo dos EUA (NOAA/NESDIS), domínio público |
| 11 | Riscos | (a) Endpoint não documentado: pode mudar sem aviso. (b) Máscara de cultura fixa (MapSPAM 2010), sem separar safrinha de 1ª safra. (c) Mede o efeito já ocorrido: não é previsão, e geada no café aparece com atraso. (d) Histórico = versão reprocessada de hoje |

**Por que resolve o pedido:** o VHI (0 a 100) é medido **só onde há a cultura**, e a NOAA trata valor abaixo de 40
como estresse. Os índices componentes separam a causa: VCI (verdor, ligado à umidade) e TCI (temperatura, ligado ao
calor). Conferido contra secas conhecidas: EUA em 2012 (VHI 33-39 no verão, contra 64 em 2014), Mato Grosso na
safrinha de 2021 (39 a 30) e café arábica em Minas Gerais em 2021 (de 53 a 35). Uma fonte só, com o mesmo método,
cobre todos os produtores relevantes de milho e de café: não é preciso uma fonte de clima por país.

**Recomendação: adotar.** Implementada para o milho (coletor `noaa-vh-milho`, 15 regiões, VHI/VCI/TCI, desde 1982 —
ADR 0025). Café em seguida, pela mesma fonte.

## Outras fontes possíveis (reconhecidas, não serão implementadas por ora)

| Fonte | O que entrega (verificado) | Por que não agora |
|---|---|---|
| USDA "Agriculture in Drought" (agindrought.unl.edu) | **% da área de milho dos EUA em seca**, por intensidade (D0 a D4), semanal (quinta), **desde 2000**, nacional e por estado. JSON sem chave por trás da tabela do site (`Home.aspx/ReturnCropData2020`, não documentado). Semana de 22/09/2026: 58% sem seca, 22% em D1 ou pior | Só EUA e só seca; o VHI da NOAA já cobre os EUA (e o calor). Complementa o Crop Progress; entra se o Comitê pedir |
| FAO ASIS — Agricultural Stress Index | **% da área agrícola com VHI < 35**, por estado do Brasil, a cada 10 dias, **desde 1984** (CSV aberto no site da FAO GIEWS; só a estação 1 para o Brasil) | Não separa a cultura (lavoura em geral). O VHI por cultura da NOAA é mais específico |
| NOAA CPC — ONI (El Niño / La Niña) | Anomalia de temperatura do Pacífico (Niño 3.4), mensal (trimestre móvel), **desde 1950**, arquivo texto sem chave | É o regime climático de fundo, não o efeito na lavoura. Ligar La Niña a seca no Sul do Brasil e na Argentina já é uma regra, que é do Comitê |

## O que continua sem fonte

- **Previsão do tempo** (o que o mercado precifica à frente): só em dado bruto (NOAA CPC, ECMWF).
- **Risco de geada no café**: não foi encontrado indicador pronto gratuito; o VHI mostra o dano semanas depois.

Esses dois componentes só entram se o Comitê definir que o fator de clima olha a previsão, e não só o estado atual
da lavoura.

## Fontes

- NOAA STAR, VH por cultura: https://www.star.nesdis.noaa.gov/smcd/emb/vci/VH/vh_adminMeanByCrop.php?type=Province_Weekly_MeanPlot
- VHP User Guide v1.4: https://www.star.nesdis.noaa.gov/smcd/emb/vci/WebDataVH/VH_doc/VHP_uguide_v1.4_2013_1221.pdf
- U.S. Agricultural Commodities in Drought: https://agindrought.unl.edu/
- FAO GIEWS, ASIS Brasil: https://www.fao.org/giews/earthobservation/country/index.jsp?lang=en&code=BRA
- NOAA CPC, ONI: https://www.cpc.ncep.noaa.gov/data/indices/oni.ascii.txt
- NASA POWER: https://power.larc.nasa.gov/
