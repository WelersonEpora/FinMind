# FAO / AMIS — reconhecimento (nível 1, adiada)

**Data:** 2026-09-23. **Situação:** reconhecida, **adiada por decisão do usuário** (2026-09-23): o balanço
mundial do milho com vintage já vem do **WASDE** (ADR 0015, desde 2011, EUA + ~20 regiões). A necessidade
de uma implantação futura foi levada ao Comitê (`STATUS_DO_PROJETO.md` §4, pergunta 15).

O relatório FEL 1 descreve uma fonte só — "FAO / AMIS: balanço global de grãos, alertas de mercado,
mensal; API + download; FAOSTAT API pública; AMIS com dados em Excel; Fase 2, gratuita" (p. 11, 15 e 30).
Na prática são **duas fontes diferentes**, e nenhuma bate com essa descrição.

## FAOSTAT (base estatística da FAO)

| # | Pergunta | Resposta (evidência de 2026-09-23) |
|---|---|---|
| 1 | API oficial? | Sim, `faostatservices.fao.org/api/v1`. A antiga `fenixservices.fao.org` está fora do ar (HTTP 521) |
| 2 | Pública ou autenticada? | **Autenticada desde 2025**: sem token, 401 "Missing Authorization Header". O **download em lote** é aberto (`bulks-faostat.fao.org/production/datasets_E.json`, 69 datasets, zip de CSV) |
| 3 | Cadastro ou chave? | API: conta gratuita no portal de desenvolvedor e token JWT (`POST /api/v1/auth/login`). Lote: nenhum |
| 4 | Formato | JSON (API); CSV em zip (lote). O de produção (QCL) tem 33 MB zipado |
| 5 | Documentação | Há repositório público da API e notas metodológicas por domínio |
| 6 | Histórico | Milho (QCL): área colhida, produção e produtividade **anuais**, **1961–2024**, por país e mundo. **Sem estoque nem balanço** |
| 7 | Revisa? | Não medido. Cada atualização substitui a base (sem edições anteriores) |
| 8 | Publicação | Anual, com **mais de 1 ano de atraso**: o ano de 2024 entrou na base em 2025-12-31 (`DateUpdate` do QCL) |
| 9 | Limite de requisições | Não verificado |
| 10 | Licença | **CC BY 4.0**, citação obrigatória (Termos de Uso das bases estatísticas da FAO). `robots.txt` da FAO sem restrição relevante |
| 11 | Riscos | Não é o "balanço global mensal" que o relatório descreve. Produção anual já vem de WASDE/Conab/IMEA, com vintage |

## AMIS (Agricultural Market Information System)

| # | Pergunta | Resposta (evidência de 2026-09-23) |
|---|---|---|
| 1 | API oficial? | **Não há, hoje.** O app antigo da base de mercado (`app.amis-outlook.org`) consultava um OLAP Pentaho/Saiku anônimo em `api.amis-outlook.org`, **desativado**: o HTTPS derruba a conexão no TLS e o HTTP devolve 403 de um bucket do Google Cloud Storage |
| 2 | Pública ou autenticada? | O portal novo (`www.amis-outlook.org`, Angular + Strapi) manda **SQL cru** do navegador para `POST /data/fetch`, que o executa no BigQuery da FAO (`fao-maps.fao_amis.*`) **sem autenticação**. Um único teste, repetindo a consulta que a própria página envia (lista de países), respondeu 200 em ~4,6 s. **Não é uma interface publicada**: aceita o SQL que o cliente mandar. Não foi sondado além disso |
| 3 | Cadastro ou chave? | Nenhum no `/data/fetch`. O portal tem login (Strapi) para áreas restritas e reCAPTCHA em formulários |
| 4 | Formato | JSON (linhas do BigQuery). O "Excel" do relatório não apareceu: os `.xlsx` públicos do portal são da base de **políticas comerciais**, não do balanço |
| 5 | Documentação | Nenhuma para o acesso aos dados |
| 6 | Histórico | Balanço por país e mundo, **três fontes lado a lado**: AMIS/FAO (`CBS`), IGC e USDA (`PSD`). Profundidade não medida |
| 7 | Revisa? | Sim: cada atualização fica guardada com `last_update` (**vintage**), e a tela compara as duas últimas |
| 8 | Publicação | Mensal. O relatório oficial é o **AMIS Market Monitor** em PDF (~10 edições/ano; nº 140 em jul/2026) |
| 9 | Limite de requisições | Não verificado |
| 10 | Licença | Números da FAO: CC BY 4.0. **Números do IGC**: dado comercial do IGC, com redistribuição não esclarecida |
| 11 | Riscos | Construir sobre o `/data/fetch` seria depender de uma porta aberta por descuido (SQL arbitrário), que a FAO pode fechar a qualquer momento: **não recomendado**. A via oficial seria o PDF do Market Monitor (extração por coordenada, mesmo método do IMEA, ADR 0019) ou pedir acesso à secretaria da AMIS |

## Recomendação

**Adiar.** O que a AMIS acrescenta ao FinMind é uma **segunda opinião** (FAO e IGC) sobre o mesmo balanço
que o WASDE já entrega com vintage. Se o Comitê pedir: (1) pedir acesso aos dados à secretaria da AMIS;
(2) enquanto isso, ler o PDF do Market Monitor. O FAOSTAT só entra se alguém precisar de produção anual desde
1961.

## Fontes

- FAO — Statistical Database Terms of Use: https://www.fao.org/contact-us/terms/db-terms-of-use/en/
- FAOSTAT public API: https://github.com/FAOSTAT/faostat-api
- AMIS Market Monitor: https://www.amis-outlook.org/amis-monitoring/monthly-report/en/
