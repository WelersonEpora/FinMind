# FinMind — Status do projeto

Painel de uma página: o que está **pronto**, o que **falta** e o que está
**bloqueado** por decisão do especialista de mercado (David) ou do Comitê.
Serve para retomar o trabalho sem reconstruir o contexto.

**Última atualização: 2026-10-01.**

> **Regra de manutenção:** ao fechar uma entrega, atualize este arquivo **no
> mesmo commit**. Aqui só entra o estado (pronto / falta / bloqueado) e o link
> de onde está o detalhe — nunca cópia de conteúdo. Em caso de conflito,
> vale o documento apontado: `CLAUDE.md` (regras e convenções) e os ADRs em
> `docs/adr/` (decisões, evidências e a autorização de cada fonte). O que depende
> do David e do Comitê está aqui mesmo, na §4.

## 1. Onde estamos

A **infraestrutura de dados** para ouro e milho está pronta: coleta,
armazenamento point-in-time (com data de publicação) e exibição nos
Observáveis. O **café** está nos passos 1 a 3 da onda (posição dos fundos, exportação,
futuro ICF da B3, safra da Conab, clima pela NOAA STAR, balanço por país do USDA e estoques certificados da ICE:
ADRs 0028 a 0032; falta o passo 4, §3). **Nada interpreta esses dados ainda** — motor analítico, IA,
sinais, backtest e execução de ordens seguem como contratos vazios, à espera
das definições do David (ver `CLAUDE.md`, "Restrições permanentes").
O desenho já está decidido: o motor prepara a base (fatores e regras do Comitê)
e a **IA gera a recomendação**, que uma pessoa decide se segue (§5).

## Próximos passos

Caminho até **fechar a arquitetura do milho e do ouro**: a cadeia completa (Coleta → A → B → C → prompt → IA →
recomendação) rodando em simulação, com regras aprovadas. Só a etapa atual tem detalhe; as seguintes são detalhadas
quando chegar a vez delas.

| Etapa | O quê | Responsável | Situação |
|---|---|---|---|
| **1. Decisões de base** | Critérios de aprovação do backtest, preço e orçamento, instrumento e horizontes, medidas dos fatores do milho (só a camada A) e ajustes no FEL 1 | Comitê | **Atual** |
| 2. Entendimento do ouro | Propor a medida (camada A) dos 8 fatores do ouro, como a §5 faz para o milho, para o Comitê confirmar | FinMind → Comitê | **Proposta pronta** (§5b), aguarda o Comitê |
| 3. Medidas e dados | Implementar as medidas confirmadas e coletar os dados aprovados que faltam | FinMind | Depende da 1 |
| 4. Regras | O Comitê define a leitura (B) e a regra (C) de cada fator; o FinMind faz o backtest; o Comitê aprova | Comitê + FinMind | Depende da 3 |
| 5. IA em simulação | Prompt, registro de cada recomendação e simulação por pelo menos 6 meses (FEL 1, §12.1, Camada 3) | FinMind executa, Comitê avalia | Depende da 4 |

**Etapa 1 em detalhe**

| Momento | O que acontece | Responsável |
|---|---|---|
| 1a. Reunião | Apresentar o processo, os informes e as perguntas (§4 e §5); responder o que der na hora | FinMind apresenta, Comitê responde |
| 1b. Retorno | Devolver as respostas pendentes, no prazo combinado na reunião | Comitê |
| 1c. Registro | Anotar cada resposta e a data no Status (§4) e, se decidir algo estrutural, no ADR correspondente | FinMind |

<details>
<summary>2. Pronto</summary>

### Plataforma

| Item | Detalhe |
|---|---|
| Autenticação e papéis (`admin`/`user`) | Cookie JWT httpOnly, sessão de 12h (sem refresh token), revalidação a cada request, gestão de usuários |
| Espaços (`workspace`) | Espaço pessoal + compartilhados, seletor na sidebar. **Ainda sem dado privado** — ADR 0007 |
| Pipeline de coleta | Download → parse → normalize → persist, retry, log em `collection_execution` — ADR 0002 |
| Camada point-in-time | Tabela `observation` append-only + `asOf()` — ADR 0008 |
| Fator versionado | `backend/src/factors/juro-real-10a.factor.js`: juro real 10a = `DFII10`, com `DGS10 − T10YIE` como validação cruzada (5.932 de 5.932 datas iguais). Não exposto na tela |
| Tela "Status do projeto" | `/status-projeto` (menu Sistema): renderiza este arquivo, via `GET /api/v1/status-projeto`. Visível a **todo usuário autenticado** — temporária, a retirar depois da fase de desenvolvimento. O `deploy.yml` copia o arquivo para a imagem do backend |
| Telas de dados | `/dados-mercado/observaveis` (48 cards) e `/dados-mercado/execucoes` — ADR 0005 |
| Banco de dados | **PostgreSQL 16** desde 2026-09-26 (antes MariaDB): servidor compartilhado da VM (repositório `servidor02-infra`), database e usuário próprios do FinMind. Backup diário `pg_dump` (7 diários + 4 semanais) e backup semanal do disco — ADR 0026 |
| Produção | VM `servidor02` (Oracle Always Free, Ampere A1 arm64, 2 OCPU / 12 GB), `https://finmind.weslab.com.br` pelo Nginx Proxy Manager — `docs/architecture.md` § "Deploy" |
| Agendamento | Dev: Agendador do Windows às 22:00. Produção: cron do usuário `deploy` na `servidor02` (coleta 04:00, 06:00, 08:00 **UTC**; backup 10:00 UTC, **não versionado**) — ADR 0004, ADR 0026 |
| CI/CD | Lint + testes + build em toda branch; deploy por push na `main` (imagens `linux/arm64` num runner ARM nativo), que já roda as migrations automaticamente (`scripts/deploy.sh`, passo 4/6) |

### Dados coletados

Evidências e ressalvas de cada fonte: no ADR apontado na coluna Status (o ADR 0009 cobre FRED, LBMA, COT, Crop Progress e CCM).

| Fonte | Acesso | Séries | Histórico | `published_at` | Status |
|---|---|---|---|---|---|
| BCB SGS | API REST (JSON) | Dólar (PTAX venda), Selic meta e realizada | Dólar desde 01/07/1994, Selic realizada desde 04/07/1994, meta desde 05/03/1999 — dev e produção (backfill feito em 2026-09-21) | — (`market_quote`, não revisa) | ✅ ADRs 0001, 0006 |
| BCB Focus | API OData (JSON) | Expectativas (mediana, base 30 dias) de **IPCA, Selic de fim de ano e câmbio de fim de ano**, por ano-calendário (ano corrente + até 4): 93 séries, uma observação por boletim semanal | **Desde 2000-01-07** (1.394 boletins, 20.258 observações em dev e no servidor) | **Estimado** (1º dia útil depois da semana do boletim, tirado da própria fonte; o boletim mais recente entra com a data da coleta) | ✅ Validado em 2026-09-23 em dev: igual ao PDF do boletim em 6 datas (2005–2026), 0 duplicatas, reexecução idempotente — ADR 0022. **Backfill rodado no servidor em 2026-09-23** (20.258 criados, 0 falhas, os mesmos números de dev). Escopo estrito do FEL 1 |
| BCB SGS — reservas internacionais | API REST (JSON) | Total, diária (série 13621), US$ milhões: a outra metade da linha "Relatório Focus e Reservas" do FEL 1 | **Desde 1998-09-01** (7.046 dias úteis em dev e no servidor) | **Estimado** (o valor de D sai no dia útil seguinte, data tirada da própria série; o ponto mais recente entra com a data da coleta) | ✅ Validado em 2026-09-23 em dev: fim de mês igual à série mensal oficial em 330 de 336 meses, 0 duplicatas, reexecução idempotente — ADR 0023. **Backfill rodado no servidor em 2026-09-23** (7.046 criados, 0 falhas) |
| FMI — IRFCL (ouro nas reservas dos bancos centrais) | API SDMX (JSON, sem chave) | Volume (milhões de onças troy) e valor (US$ milhões) do ouro nas reservas de 88 países e 2 agregados (área do euro, BCE), na escala que a fonte declara: o fator do ouro "Demanda de bancos centrais", peso Alto | **Mensal desde dez/1999** (43.513 valores em dev) | **Não informado**: vale a data da coleta (vintage desde a 1ª coleta) | ✅ Validado em dev em 2026-10-01: 0 falhas, reexecução idempotente; **no servidor no mesmo dia** (43.513 criados, 0 falhas, informado pelo usuário). Volume em unidade errada em Brasil (desde mar/2026), Angola e Chile, marcado e não corrigido; licença com restrição a download em massa automatizado, risco aceito pelo usuário — ADR 0036 |
| World Gold Council (Goldhub) | API JSON interna dos gráficos (sem login, sem documentação) | Ouro em ETFs por região (toneladas e US$ milhões), semanal; e o balanço trimestral de oferta e demanda (17 linhas: bancos centrais com o não declarado, ETFs, barras e moedas, joalheria, tecnologia, produção das minas, reciclagem, hedge), em toneladas: os fatores do ouro de ETFs, bancos centrais e mineração | ETFs **desde 2003-02-28**; balanço **desde o 1º tri/2010** (10.454 valores em dev) | **Não informado**: vale a data da coleta | ⚠️ **Licença só pessoal e não comercial: uso interno, risco aceito pelo usuário** (pedir permissão ao WGC antes de uso comercial). Validado em dev em 2026-10-01: 0 falhas, reexecução idempotente; **no servidor no mesmo dia** (9.332 + 1.122 criados, 0 falhas, informado pelo usuário) — ADR 0037 |
| FRED | API REST (JSON, com chave); CSV de reserva | DGS10, T10YIE, DFII10, DTWEXBGS; desde 2026-10-01, para o ouro: DTWEXAFEGS (dólar contra as economias avançadas), as 6 moedas da cesta do DXY e a meta do Fed (faixa e alvo único) | DGS10 desde 1962; DFII10/T10YIE 2003; DTWEXBGS e DTWEXAFEGS 2006; moedas 1971 (euro 1999); meta desde 1982-09-27 | Estimado (meta: o próprio dia) | ✅ Coleta pela API, CSV de reserva — ADR 0012. Vintage real (ALFRED) provado via teste — ADR 0011. Séries novas validadas em dev em 2026-10-01 (0 falhas, reexecução idempotente) e **coletadas no servidor no mesmo dia** (coleta manual, informado pelo usuário) — ADR 0033 |
| FRED (ALFRED) — CPI dos EUA | API REST (JSON, com chave; sem reserva) | CPI cheio e núcleo com ajuste sazonal, e cheio sem ajuste (BLS), **com todas as versões** | Cheio desde 1947 (sem ajuste: 1913), núcleo desde 1957; versões desde 1972, 1996 e 1949 | **Real** (data de cada versão: 949 de 949 iguais ao calendário do release do BLS); limite superior antes da 1ª versão | ✅ Validado em dev em 2026-10-01: 7.834 linhas, 4.681 revisões, 0 falhas, reexecução idempotente; **no servidor no mesmo dia** (informado pelo usuário). Mudou de base em fev/1988 — ADR 0033 |
| LBMA | Feed JSON público (não documentado) | Ouro PM (USD/oz) | Desde 1968 | Estimado | ✅ Licença da IBA exigida p/ exibir/redistribuir — adiada (uso interno) |
| CFTC COT | API Socrata (JSON) | Ouro, milho e café (Coffee C da ICE, desde 2026-09-28): open interest, MM long/short | Desde 2006 | Real desde 2022-08; estimado antes | ✅ Café: ADR 0028 |
| USDA NASS | API QuickStats (JSON, com chave) | Crop Progress do milho (12 séries) | Desde 1980 (piso real da API; cada série começa no seu ano) | Estimado (regra não validada p/ 1980–2005) | ✅ Validado em 2026-09-21 (6.758 linhas); histórico 1980+ já carregado no servidor (informado pelo usuário) |
| B3 CCM | CSV (Up2Data) + PDF (Boletim Diário, extração por coordenada) | Futuros de milho, por vencimento (preços, liquidez e, até 2025-12-11, contratos em aberto) | **Desde 2022-03-21**, em dev e no servidor (BDI rodado no servidor, informado pelo usuário em 2026-09-23): Boletim Diário (PDF) até 2025-12-11 + Up2Data (CSV, janela de ~15 meses) daí em diante; **buraco de ~9 meses em 2023** na fonte | Estimado | ✅ ADRs 0009, 0020. 10+ anos **não existem de graça** |
| B3 ICF | Os mesmos arquivos e coletores do CCM | Futuros de café arábica, por vencimento (preços em US$/saca, volume em R$, contratos em aberto até 2025-12-11) | **Desde 2022-03-21**, em dev e no servidor (943 pregões, 30 vencimentos): Boletim Diário até 2025-12-11 (747 boletins, 0 divergências com o CSV) + Up2Data desde 2025-06-10; o mesmo **buraco de 2023** do CCM | Estimado | ✅ ADR 0028 |
| Comex Stat (MDIC) | API (JSON, sem chave) | Exportação mensal (volume em kg e valor FOB em US$) de milho e de café verde (NCM 09011110, desde 2026-09-28); desde 2026-10-01, a de milho **por país de destino** (código de país da tabela da API) | Milho **desde 2005** (jan/2005 a ago/2026, 260 meses; antes disso o código NCM muda e não foi mapeado — pode ser estendido depois). Café **desde 1997**, o 1º ano do Comex Stat (356 meses, dev e servidor, 2026-09-28) | Estimado (dia 15 do mês seguinte); revisões da fonte não confirmadas | ✅ Milho validado em 2026-09-21 em dev e produção (260 meses por série) — ADR 0013. Café: ADR 0028. Milho por destino: 15.028 linhas, 153 países, desde 2005, soma dos países = total em 260 de 260 meses, carga em dev e **no servidor** em 2026-10-01 (15.028 linhas nos dois; o bloco 2020–2024 repetido por 429) — ADR 0034 |
| USDA WASDE (ESMIS) | HTML (listagem, raspada) + XLS de cada edição | Balanço do milho por edição mensal: EUA (13 atributos e, desde 2026-10-01, o milho usado para etanol, em 2 séries porque o rótulo mudou em abr/2011) e ~20 regiões do mundo (7 atributos), 169 séries | **Desde 2011-01** (188 edições, XLS; antes só PDF/TXT) | **Real, com dia** (data do release); **vintage real**: 24.542 revisões guardadas | ✅ Validado em 2026-09-21 em dev (27.309 linhas) e **backfill já rodado no servidor** (informado pelo usuário) — ADR 0015. Etanol: carga em dev e **no servidor** em 2026-10-01 (158 linhas desde 2011-01, mesmos números; as 227 recusas da edição de 2018-12-14 também) — ADR 0035 |
| USDA NASS — Grain Stocks (ESMIS) | HTML (listagem, raspada) + CSV dentro do ZIP de cada edição | Estoques de milho dos EUA em 1º de março, junho, setembro e dezembro, na fazenda, fora da fazenda e total (mil bushels) | **Desde 2001-06-29** (102 edições com CSV; antes só TXT/PDF): 107 trimestres, de 2000-03 a 2026-09 | **Real, só a data** (release, conferida com o CSV); **vintage real**: cada edição é uma versão (267 revisões), com o número original que a API do QuickStats perdeu | ✅ Validado em dev em 2026-10-01: 102 de 103 edições lidas (a outra é um relatório trocado na listagem: aviso), 3 layouts, na fazenda + fora = total em todos os valores, 588 linhas. **Backfill no servidor em 2026-10-01**, com os mesmos números de dev (informado pelo usuário) — ADR 0035 |
| Conab (Boletim da Safra de Grãos) | XLSX de cada levantamento (página HTML) | Milho por safra (1ª, 2ª, 3ª e total) por Região/UF (área, produtividade, produção) e balanço nacional (estoque inicial e final, produção, importação, suprimento, consumo, exportação, demanda total): 397 séries | **Vintage (estimativas mês a mês) só desde fev/2025**: são 15 levantamentos mensais, o máximo que o índice da Conab mantém (com lacunas); antes disso a fonte não oferece. O balanço traz também os valores de safras de 2018/19 a 2025/26, mas sem vintage próprio. As séries históricas desde 1976/77 e os preços **não** foram carregados (adiado por decisão) | **Real, com data e hora** (página do levantamento); **vintage real**: cada levantamento é uma versão (até 10 revisões por valor). Nas safras antigas é um **limite superior**: entra com a data do primeiro levantamento lido, então uma consulta anterior a fev/2025 volta vazia | ✅ Validado em 2026-09-21 em dev (3.436 linhas) e **backfill e coleta diária já rodados no servidor, 0 falhas** (informado pelo usuário) — ADR 0017 |
| Conab (Boletim da Safra de Café) | XLS de cada levantamento (página HTML) | Café por safra (total, arábica e conilon) por região, UF e sub-região da Bahia e de Minas: área em produção, produtividade e produção (mil sacas): 230 séries | **Vintage desde jan/2023** (15 levantamentos; antes disso a Conab não mantém a página). A série histórica 2001–2026 (sem revisões) **não** foi carregada | **Real, com data e hora**, conferido com o mês da planilha; **estimado** só no 1º levantamento de 2024 (página republicada) | ✅ Validado em 2026-09-28 em dev e no servidor (2.968 linhas, 0 falhas nos dois) — ADR 0029 |
| Cecafé — resumo diário das exportações | HTML (tabelas da página, raspadas) | Acumulado do mês de certificados de origem, despachos aduaneiros e embarques de café, por unidade (Santos, Vitória, Rio, Salvador, REDEX/EADI de MG, outros, total) e por tipo (**arábica, conilon** e solúvel), em sacas de 60 kg: 3 cards | **Desde 2026-10-01** (a página só mostra o mês atual e o anterior: setembro e agosto de 2026 na 1ª coleta) | **Data da fonte** ("Informações recebidas até"), horário estimado; cada dia vira uma versão do acumulado do mês | ✅ Validado em dev em 2026-10-01: 156 valores, 80 séries, 0 falhas, reexecução idempotente; **no servidor no mesmo dia** (156 criados, 0 falhas, informado pelo usuário) — ADR 0038 |
| IMEA — milho de MT | API JSON não documentada (safra) + XLSX (custo) | Área/produção/produtividade por safra (Mato Grosso + 7 regiões, 3 indicadores identificados na API por casamento de valor) e custo de produção (Mensal/Ponderado × Alta/Média Tecnologia, ~62 itens por hectare): 3 cards (Mensal e Ponderado convivem no mesmo seletor de custo mensal, como o WASDE faz por unidade — aqui por frequência) | Safras 2022/23 a 2026/27 (API; a 2026/27 apareceu na coleta diária de 2026-09-23) e custo publicado em 15/09/2026 (catálogo). **Sem backfill possível**: nem a API nem o catálogo de arquivos guardam edições anteriores — o vintage começa a partir de agora | **Real, só a data** (data da última atualização na API; data do arquivo no catálogo) | ✅ Validado e gravado no banco de dev em 2026-09-22 (96 observações de safra; 15.402 de custo, 5.073 séries; reexecução idempotente) — ADR 0018 |
| B3 — Indicador do Milho CEPEA/ESALQ | TXT de largura fixa em ZIP (arquivo `Indic`, Pesquisa por pregão) | Indicador à vista, em R$ e US$ por saca | Fonte **desde 2018-06-08** (antes, o milho não consta do arquivo). **No servidor, desde 2018-06-08** (backfill concluído, informado pelo usuário em 2026-09-23); em dev, carregado só de 2021-01-04 em diante | Estimado (fim do dia do pregão) | ✅ 66 de 66 datas iguais ao histórico da CEPEA — ADR 0021 |
| EIA — etanol dos EUA | XLS (planilha histórica de cada série, sem chave; a API exige chave) | Produção semanal de etanol combustível (mil barris/dia) e estoques (mil barris): o fator do milho "Demanda de etanol" | **Desde 2010-06-04** (851 semanas por série, 1.702 observações em dev e no servidor; 1ª coleta no servidor conferida em 2026-09-24) | **Estimado** (quarta; quinta em semana de feriado; data do calendário oficial da EIA quando ele lista a semana) | ✅ Validado em 2026-09-23 em dev: 8 de 8 valores iguais à tabela oficial do WPSR, 0 duplicatas, reexecução idempotente — ADR 0024 |
| NOAA STAR — clima sobre o milho | Texto (link de dados da página oficial, sem chave; endpoint não documentado) | Saúde da vegetação **medida só sobre a área do milho**: VHI, VCI (umidade) e TCI (calor), 0 a 100, semanal, em 18 regiões (mundo, hemisférios Norte e Sul; EUA, Brasil, Argentina, China, Ucrânia; MT, PR, GO, MS, MG; Iowa, Illinois, Nebraska, Minnesota, Indiana): o fator do milho "Clima e safra" | **Desde 1982** (2.276 semanas por série, 122.904 observações em dev e no servidor; backfill no servidor em 2026-09-24: 122.904 criadas, 0 falhas, ~17 min) | **Estimado** (dia seguinte ao fim da semana, regra da página) | ✅ Validado em 2026-09-24 em dev: valores iguais à página, secas de 2012 (EUA) e 2021 (MT) visíveis, 0 falhas, reexecução idempotente — ADR 0025 |
| NOAA STAR — clima sobre o café | O mesmo endpoint do milho | VHI, VCI e TCI **sobre a área do café**, semanal, em 19 regiões: Brasil, MG, SP, ES, BA e RO (uma série "café": no Brasil as máscaras de arábica e robusta cobrem os mesmos pixels); os 7 maiores produtores depois do Brasil pela PSD (Vietnã, Indonésia e Uganda em robusta; Colômbia, Etiópia e Honduras em arábica; Índia, "café"); e mundo e hemisférios Norte e Sul, com arábica e robusta separados: o fator do café "Clima e eventos meteorológicos" | **Desde 1982** (19 regiões, 129.732 observações, em dev e no servidor; conferido no servidor em 2026-09-30) | **Estimado** (a regra do milho) | ✅ Validado em dev em 2026-09-28: 0 falhas; a seca e a geada de 2021 visíveis (SP de 33 para 24), mas o índice não separa geada de seca; a seca de 2016 no Vietnã é o pior VHI de 2013–2019 — ADRs 0030 e 0031 |
| ICE — estoques certificados do café "C" | XLS por pregão (arquivo público, sem documentação) | Sacas certificadas por origem (16 hoje) e o total: o "estoque certificado ICE" do fator do café de peso Alto | Fonte **desde 2016-01-04**; **completo no servidor desde 2016-01-04** (backfill concluído em 2026-09-30; o 1º, de 2026-09-29, parou no meio e foi retomado); em dev, só 2026-08-03 a 2026-09-25 (39 pregões, teste do backfill) | **Real** (`Last-Modified` do arquivo) | ⚠️ Termos de uso da ICE excluem robôs: risco aceito pelo usuário, uso interno — ADR 0032 |
| USDA FAS — PSD do café | CSV dentro de um ZIP (download público, sem chave) | Balanço do café verde por país: produção (total, arábica e robusta), estoque final, consumo interno, exportação e importação, em mil sacas: 658 séries (94 países × 7). Sem total mundial na fonte | Safras **desde 1960**; **sem vintage histórico** (só o valor atual): o vintage começa na 1ª coleta (32.312 valores em dev; no servidor, na 1ª coleta diária depois do deploy) | **Estimado** (fim do mês da última revisão; as safras até 2003 não trazem o mês e ficam com a data da coleta) | ✅ Validado em dev em 2026-09-28: 0 falhas, idempotente — ADR 0031 |
| USDA NASS — área plantada de milho dos EUA (Prospective Plantings e Acreage) | HTML (listagem do ESMIS, raspada) + CSV dentro do ZIP de cada edição | Área plantada total dos EUA, em mil acres: a **intenção de plantio** (fim de março) e a **área plantada** (fim de junho), com a revisão dos anos anteriores que cada edição traz. O WASDE só traz esse número semanas depois (em 2026: USDA em 31/03, WASDE em 12/05) | **Desde 2001-06-29** (51 edições, 27 anos, 92 linhas em dev e no servidor); antes só TXT/PDF | **Real, só a data** (listagem, igual à impressa no CSV nas 51 edições); **vintage real** | ✅ Validado em 2026-09-28 em dev: 51 de 51 edições lidas, valores iguais ao QuickStats (15 de março e 9 de junho), 0 falhas, 0 duplicatas, reexecução idempotente — ADR 0027. **Backfill rodado no servidor em 2026-09-28** (27 criados, 65 revisões, 35 ignorados, 0 falhas, ~76 s: os mesmos números de dev) |
| IMEA — balanço de oferta e demanda do milho de Mato Grosso | PDF (extração por coordenada) | Estoque inicial/final, importação, produção, demanda, consumo (MT e interestadual), exportação, aquisições públicas: 1 card, extraído por COORDENADA do PDF mensal (x/y de cada texto) | **Vintage real, 77 edições, 2014-04-14 a 2026-08-31** (catálogo inteiro, descartando 1 PDF de metodologia e 1 republicação no mesmo dia) | **Real, só a data** (data do arquivo no catálogo) | ✅ Validado contra as 77 edições reais em 2026-09-22: 3.369 itens válidos no parser, 0 inválidos; **802 linhas gravadas em `observation`** após deduplicação por revisão (o serviço point-in-time só grava quando o valor muda — ver ADR 0008); backfill em blocos de 5 anos — ADR 0019 |
| IMEA — andamento da semeadura e da colheita do milho de MT | PDF (Informes de Semeadura e de Colheita, um por safra, lidos por coordenada) | % acumulado da área semeada e colhida, semanal, em Mato Grosso e nas 7 regiões do IMEA: 1 card | Semeadura **desde 2012/13**, colheita **desde 2015/16** (25 de 26 informes; a colheita 2014/15 é recusada: cabeçalho defeituoso na fonte) | **Estimado** (o próprio dia da semana do informe) | ✅ Validado em dev em 2026-10-01: 2.560 valores, 16 séries, percentuais sempre crescentes e até 100%, reexecução idempotente — ADR 0039 |

### Como tratamos as fontes de dados

Nenhuma fonte entra sem **reconhecimento técnico prévio**: um checklist de 11
perguntas (API, chave, formato, histórico, revisões, data de publicação, limite
de uso, **licença**, riscos), respondido com **chamada real** e não com suposição.
O que não foi confirmado fica registrado como **incerteza declarada**. O relatório
FEL 1 catalogou 42 fontes sem testar nenhuma; este processo (portado do AgroMind)
é o que separa "catalogada" de "confirmada". Cada fonte tem um **nível de
maturidade** de 0 a 5: 0 identificada · 1 reconhecimento concluído · 2 modelo
definido · 3 coletor implementado · 4 coleta validada · 5 histórico carregado.

Nível **não** significa "sem ressalvas" — uma fonte no nível 5 ainda pode ter
licença pendente. Por isso a coluna de ressalvas é a que importa na reunião.

A tabela vai do nível mais alto ao mais baixo, para ler de cima para baixo o que
falta. No nível 1, a ordem é: primeiro as que **aguardam o Comitê**, depois as
**adiadas por decisão do usuário** e, por fim, as **descartadas** (não implementar).
Uma fonte nova entra no lugar do seu nível. Se ela precisa de uma decisão, isso
está na coluna "Depende de", não no nível:

| Fonte | Nível | Ressalva principal | Depende de |
|---|---|---|---|
| BCB dólar / Selic | 5 | Meta traz datas futuras (até a próxima reunião do Copom) — é o alvo vigente, não uma previsão | — |
| BCB Focus (IPCA, Selic, câmbio) | 5 | Data de publicação **estimada** (a fonte só diz "primeiro dia útil da semana", sem hora); o boletim mais recente entra com a data da coleta (~1 dia depois, conservador). Só o endpoint anual: sem Selic por reunião, PIB, Top 5 nem inflação 12/24 meses (fora do FEL 1). Licença ODbL | — |
| BCB reservas internacionais | 5 | Data de publicação **estimada** (defasagem de 1 dia útil medida uma vez só); revisão não medida: em **6 meses de 2007–2010** a mensal oficial difere do fim de mês da diária (1 a 67 US$ milhões, causa não determinada). Só o total: conceito liquidez e composição (ouro) não coletados | — |
| FMI — ouro nas reservas dos bancos centrais (IRFCL) | 4 | **Sem data de publicação nem versões** (vintage desde a 1ª coleta). **Volume em unidade errada em 3 países** (Brasil desde mar/2026, Angola, Chile), marcado pela conferência de preço implícito; valor em US$ contábil em EUA e Arábia Saudita. Sem total mundial. Licença lida só por trechos; restrição a download em massa automatizado (risco aceito) — ADR 0036 | Ler os termos à mão antes de exibir a terceiros |
| World Gold Council (ETFs, demanda e oferta) | 4 | **Licença só pessoal e não comercial: uso interno, risco aceito pelo usuário (2026-10-01)**. API interna sem documentação nem contrato; sem data de publicação nem versões (vintage desde a 1ª coleta) — ADR 0037 | Pedir permissão ao WGC antes de uso comercial |
| FRED | 5 | Licença lida: 3 de 4 séries domínio público c/ citação; `T10YIE` não confirmada; as séries de 2026-10-01 (moedas, meta do Fed, CPI) têm a mesma origem, página não lida. **Adiada** (uso interno). Nenhuma das séries é o DXY (licenciado): remontá-lo pelas 6 moedas é um cálculo, a decidir pelo David. O CPI só vem pela API (ALFRED) — ADR 0033 | Retomar antes de exibir a terceiros |
| LBMA (ouro) | 5 | **Exige licença da IBA** p/ usar/redistribuir o histórico. **Adiada** (uso interno) | Retomar antes de exibir a terceiros |
| CFTC COT (ouro, milho e café) | 5 | Data de publicação estimada antes de 2022-08 | — |
| USDA Crop Progress | 5 | Data de publicação estimada, não validada p/ 1980–2005 | — |
| Comex Stat (MDIC) (milho, milho por destino e café) | 5 | Milho **só a partir de 2005** (NCM anterior não mapeado); café desde 1997, só o café verde (solúvel, torrado e descafeinado de fora); revisões não confirmadas; rate limit rígido (429) | — |
| USDA WASDE — arquivo ESMIS (milho) | 5 | **Só de 2011 em diante** (antes só PDF/TXT); só EUA e ~20 regiões; raspa o HTML da listagem (sem API confirmada); republicação no mesmo dia: vale a última na carga, mas se a 1ª já tinha entrado, a do mesmo dia publicada depois é ignorada; licença e limite de uso não confirmados. **Backfill já rodado em produção (informado pelo usuário)**. Em qualquer banco novo ele vem ANTES da coleta diária: a diária se recusa a gravar enquanto a fonte estiver vazia (senão truncaria o vintage) | — |
| USDA NASS — Grain Stocks (estoques trimestrais do milho, pelo ESMIS) | 5 | **Só de 2001-06-29 em diante** (antes só TXT/PDF); só o total dos EUA por posição. Listagem raspada (sem API confirmada) e CSV sem dicionário, em 3 layouts; a listagem tem um relatório trocado (2003-02-27, aviso) e 2 edições sem ZIP. Licença não verificada juridicamente. Backfill ANTES da coleta diária — ADR 0035 | — |
| Conab — boletim mensal (milho: 1ª/2ª/3ª safra por UF e balanço) | 5 | **Vintage real por levantamento**, `published_at` real; **só de fev/2025 em diante** (o que o índice mantém, com lacunas). Sem API (quebra se o layout mudar); `published_at` das safras antigas é limite superior; a planilha é a versão atual (pode ter correção posterior); licença não verificada. **Backfill já rodado no servidor (2026-09-21, informado pelo usuário; o log mostra 15 levantamentos, 0 falhas, 88 s: a Conab é acessível de lá)**. Em qualquer banco novo ele vem ANTES da coleta diária | — |
| Conab — Boletim da Safra de Café | 5 | **Vintage real, só de jan/2023 em diante** (15 levantamentos, ~4 por safra: 4 safras com revisões mostram pouco da bienalidade, um ciclo de 2 anos). Data da página conferida com a planilha (1 republicada, estimada). Sem API; as páginas antigas não estão no índice (URL montada pelo coletor). Série histórica 2001–2026 sem revisões, não carregada. Backfill ANTES da coleta diária | Comitê, se quiser o histórico longo |
| Cecafé — resumo diário das exportações de café | 4 | **Histórico só desde 2026-10-01** (a página mostra dois meses; o mensal antigo só nos PDFs, proibidos a robôs). HTML raspado sem contrato. Os números não são os do Comex Stat (etapas diferentes da exportação) — ADR 0038 | — |
| IMEA — balanço de oferta e demanda (PDF) | 5 | **Vintage real, 2014-04-14 a 2026-08-31** (77 edições). Extração por coordenada (sem API nem dicionário de dados: quebra se o layout mudar). Só Mato Grosso (sem quebra regional); Produção não reconciliada com o card de safra; licença não investigada. **Repetir o backfill inteiro** (não a coleta diária) **depois de já ter terminado em sucesso pode logar falhas espúrias**, sem corromper dado (achado real, mecanismo compartilhado com WASDE/Conab) — não repetir um backfill já concluído | — |
| IMEA — andamento da semeadura e da colheita (PDF) | 5 | Só a versão final de cada safra (o catálogo substitui o arquivo a cada semana): vintage só daqui para frente. Colheita 2014/15 recusada (cabeçalho sem o Médio-Norte). PDF lido por coordenada, sem contrato — ADR 0039 | — |
| B3 — Indicador do Milho CEPEA/ESALQ | 5 | **Só desde 2018-06-08** (antes, só pela exportação manual do site da CEPEA, que bloqueia automação). Número da CEPEA, origem B3; US$ difere por centavos; endpoint de download não documentado como API | — |
| EIA — etanol dos EUA | 5 | Data de publicação **estimada**; fechamentos extraordinários anteriores a 2024-12 (ex.: Natal) podem ter data antecipada no histórico. A planilha só traz o valor atual (revisão não medida). Sem chave da API: usa a planilha do site. Falta a metade "USDA" do fator (milho usado para etanol, no WASDE, não extraído) | — |
| NOAA STAR — saúde da vegetação por cultura (milho) | 5 | **Endpoint não documentado** (link de dados da página oficial). A NOAA reprocessa a série: o histórico é a versão de hoje (vintage real só daqui para frente). Data de publicação **estimada**. Máscara de cultura fixa, sem separar safrinha de 1ª safra. Mede o efeito já ocorrido: não é previsão do tempo nem pega geada a tempo. No servidor, a gravação do backfill levou ~17 min (45 s em dev): o banco da VM é bem mais lento | — |
| NOAA STAR — saúde da vegetação por cultura (café) | 5 | As do milho. **No Brasil não separa arábica de conilon** (as duas máscaras cobrem os mesmos pixels): uma série "café" por UF; só mundo e hemisférios separam. Mostra o dano de geada e seca somado, semanas depois: não é alerta de geada. Outros países produtores só depois do USDA FAS ou da ICO | — |
| USDA — área plantada do milho (Prospective Plantings e Acreage, pelo ESMIS) | 5 | Listagem em HTML raspada (sem API confirmada) e CSV sem dicionário formal: uma mudança de layout vira falha explícita da edição. Só o total dos EUA, desde 2001-06. **Não pela API do QuickStats** (lá o histórico foi carregado em lote e a estimativa final é sobrescrita). As reestimativas de agosto a janeiro ficam no WASDE. Licença e limite de uso do ESMIS não confirmados — ADR 0027 | — |
| B3 CCM | 5 (limitado) | **Só ~4,5 anos de histórico grátis** (desde 2022-03-21, com buraco em 2023); contratos em aberto por vencimento só até 2025-12-11 | David/Comitê (pergunta 3, orçamento) |
| B3 ICF (café arábica) | 5 (limitado) | As mesmas do CCM (desde 2022-03-21, buraco em 2023, contratos em aberto só até 2025-12-11). O preço que forma o mercado é o KC da ICE (FEL 1), que só existe pago | David/Comitê (pergunta 2, preço) |
| IMEA — milho de MT (safra e custo) | 4 | **Sem backfill possível** (nem a API nem o catálogo guardam edição anterior): vintage começa agora. IDs de indicador sem nome (identificados por casamento de valor); o andamento da semeadura e da colheita vem desde 2026-10-01 por outro coletor (ADR 0039); não há documento próprio de intenção de plantio; licença não investigada | — |
| Paridade de exportação do milho (IMEA) | 1 | **Dado original com valor, aguardando decisão.** O **Boletim Semanal – Milho** do IMEA (PDF, 572 edições desde 2015-02-02) traz a **paridade de exportação calculada pela própria fonte** (R$/saca, Mato Grosso), com diferencial de base e prêmio portuário: é o dado que o FEL 1 descreve ("preço interno vs. Chicago + frete + câmbio"), e não existe em outra base nossa. Exige leitura da tabela por coordenada (como no ADR 0019). Ressalvas: é a paridade de MT, não a de Campinas; muda de contrato de referência (quebra de série); porto do prêmio incerto. Não implementado | Comitê (pergunta 16) |
| FAO/AMIS (FAOSTAT e base da AMIS) | 1 | **Adiada (decisão do usuário, 2026-09-23): o WASDE já cobre o balanço mundial do milho com vintage.** FAOSTAT é só produção anual (1961–2024, >1 ano de atraso); a AMIS não tem API oficial (só o PDF do Market Monitor) e mistura números do IGC, de licença não esclarecida | Comitê (pergunta 15) |
| USDA FAS PSD (milho) | 1 | Reconhecida, **sem coletor; adiada por decisão do usuário (2026-09-21)**: o WASDE por país já cobre o necessário por ora. Sem vintage histórico (API só dá a edição atual); licença e janela do rate limit não confirmadas | Retomar só se o David pedir países fora da seleção do WASDE ou histórico anterior a 2008 |
| Conab — séries históricas (desde 1976/77) e preços | 1 | Reconhecidas, **sem coletor por decisão do usuário**: as séries históricas não têm vintage; os preços em TXT cobrem só ~12 meses e o histórico longo segue bloqueado | Retomar quando houver uma opção |
| Outras fontes de clima: USDA Ag in Drought, FAO ASIS, NOAA CPC ONI | 1 | **Possíveis, não serão implementadas por ora** (2026-09-24). Ag in Drought: % da área de milho dos EUA em seca, semanal, desde 2000 (só EUA, só seca). ASIS (FAO): % da área agrícola em estresse por estado, desde 1984, sem separar a cultura. ONI: El Niño/La Niña, mensal, desde 1950 (regime de fundo; ligá-lo ao preço é regra). O VHI da NOAA STAR já cobre o efeito na lavoura — `docs/reconhecimento-fontes/clima.md` | Comitê, se pedir |
| Abimilho e CNA (estatísticas e panorama do setor) | 1 | **Sem valor para o FinMind: só republicam dado de outras fontes** (reconhecidas em 2026-09-24). Nenhuma tem API. Os números vêm de Comex Stat, Conab, USDA e Cepea (já coletados) ou da Céleres (comercial); o painel da Abimilho está parado desde nov/2024 e o site está com o certificado vencido; a CNA só publica PDFs (Panorama, VBP = Conab × Cepea, custo do Campo Futuro levantado pela Cepea). **Não implementar.** Achado lateral: a API do Comex Stat já usada traz a **exportação por país de destino** (97 países em 2025), a lacuna do fator 8 do milho (China) — `docs/reconhecimento-fontes/abimilho-cna.md` | — |
| Clima do FEL 1: NASA POWER, INMET, CPTEC/INPE, ECMWF ERA5 (e a "NOAA" genérica do relatório) | 1 | **Inadequadas para o FinMind nesta fase** (2026-09-24). Entregam **tempo** (chuva, temperatura por ponto ou grade), não o **efeito do clima no milho e no café**: transformá-las em algo ligado ao preço exigiria o FinMind escolher regiões, pesos e limiares, ou seja, montar um fator. O indicador pronto veio de outro produto da NOAA (STAR, acima). **Não implementar**; só voltam se o Comitê pedir previsão do tempo ou risco de geada — `docs/reconhecimento-fontes/clima.md` | — |
| World Bank — Pink Sheet | 1 | **Não implementar por ora** (reconhecida em 2026-09-28). Sem API de preços: planilha mensal desde 1960, sobrescrita a cada mês. **Ouro** = média mensal da LBMA que já temos. **Milho** = preço de exportação FOB Golfo dos EUA, dado novo, mas mensal e sem OHLCV (não resolve as perguntas 2 e 3). Licença não confirmada (cita Bloomberg e outras fontes comerciais) — `docs/reconhecimento-fontes/world-bank-pink-sheet.md` | — |
| US Treasury (Fiscal Data e curvas de juros) | 1 | **Não implementar** (reconhecida em 2026-09-28). A curva real do Tesouro é a origem do `DFII10` do FRED (4 de 4 datas iguais, um dia antes). O ouro do Tesouro é constante desde 2012 (~261,5 milhões de onças, valor contábil fixo): não mede compra por banco central — `docs/reconhecimento-fontes/us-treasury.md` | — |
| Frete (rodoviário e marítimo) | 1 | **Sem valor isolado.** Rodoviário: 28 rotas saindo de MT na API do IMEA, em R$/t, **só o valor atual**; sozinho é só componente da paridade (usá-lo seria o FinMind montar a própria fórmula, que é um fator). Marítimo: **nenhuma fonte gratuita encontrada**. Não implementar | — |
| B3 — café à vista pelo arquivo `Indic` e conilon (CNL) | 1 | **Descartados** (2026-09-28, ADR 0028). O `Indic` não traz o café (só milho, boi, etanol e soja): o à vista do café segue sem fonte automatizável. O CNL tem preço de referência e nenhum negócio | — |

Processo: `docs/processo-reconhecimento-fontes.md`. Uma linha por fonte, com
evidência: `docs/reconhecimento-fontes/README.md` (checklist completo em arquivo
próprio para FRED, LBMA, FAO/AMIS, BCB Focus, reservas do BCB, Abimilho e CNA, clima, USDA
Prospective Plantings e Grain Stocks, World Bank e US Treasury).

**Cruzamento completo com os 8+8 fatores do `controle_fatores.xlsx` (auditoria de
2026-09-22, revisada em 2026-09-28):** `docs/cobertura-fatores-fel1-milho-ouro.md` — fator → dado
necessário → dado disponível → lacuna, sem propor fórmula.

</details>

<details>
<summary>3. Falta fazer</summary>

Fontes de **milho** que o relatório do David lista (FEL 1, §6.5, §7 e o plano de
integração da §9.2) e que ainda **não coletamos**. Já feitas: USDA NASS (Crop
Progress), CFTC, B3 (CCM), Indicador do Milho CEPEA/ESALQ (pela B3), Comex Stat, WASDE (balanço do milho), área plantada do USDA (Prospective Plantings e Acreage), Conab (boletim mensal), IMEA (área/produção/produtividade por safra, custo e balanço de oferta e demanda), EIA (etanol), clima do milho (NOAA STAR, saúde da vegetação por cultura), BCB SGS, BCB Focus (IPCA, Selic e câmbio) e reservas internacionais do BCB (ambos ligados ao ouro) e FRED. Aqui se faz o **reconhecimento** de cada
fonte (níveis 0→1, `docs/processo-reconhecimento-fontes.md`) e a **recomendação**,
para decidir e levar à reunião com o David. **Reconhecer não é implementar:**
nenhum coletor novo entra sem a decisão do David ou autorização explícita
registrada em ADR (§6). Só entram fontes que ele mencionou; o AgroMind já
reconheceu várias delas, e reaproveita-se o conhecimento (endpoints, layout,
armadilhas), não o código (outro banco, outra arquitetura).

| # | Fonte (como o relatório a descreve) | Observação |
|---|---|---|
| 1 | **Medidas dos fatores do milho** (camada A do motor) | Aguarda o Comitê confirmar o entendimento da §5. Confirmado, a ordem proposta é COT, estoque/uso do WASDE e % boa + excelente do Crop Progress, no molde do juro real 10a |
| 2 | **Consolidar a recomendação para a reunião** | Uma linha por fonte: adotar, adiar ou descartar, com custo, licença, histórico, risco e o que depende do David. Alimenta as perguntas 2, 3 e 5 da §4 |

**Fontes fundamentais que faltam no milho e no ouro (levantamento de 2026-10-01).** Depois da reunião de 2026-09-30,
o foco do FinMind é a matéria-prima: medir os fatores é trabalho do David (decisão do usuário, 2026-10-01). Cruzamento
das fontes do FEL 1 e da planilha com o que já coletamos: `docs/cobertura-fatores-fel1-milho-ouro.md`. Cada fonte entra
com um ADR e a autorização do usuário, só aquisição de dados.

| Bloco | Fonte | Ativo | Situação |
|---|---|---|---|
| 1. Grátis, em fonte que já usamos | CPI dos EUA (pelo ALFRED, com a data real de cada versão) | Ouro | **Feito**, dev e servidor (ADR 0033) |
| 1 | Meta do Fed (FOMC) | Ouro | **Feito**, dev e servidor (ADR 0033) |
| 1 | As 6 moedas da cesta do DXY e o índice do dólar contra as economias avançadas (FRED). O DXY em si é licenciado; remontá-lo é um cálculo, a decidir pelo David | Ouro | **Feito**, dev e servidor (ADR 0033) |
| 1 | Exportação de milho por país de destino (Comex Stat, a API já usada) | Milho | **Feito**, dev e servidor (ADR 0034) |
| 1 | Milho usado para etanol (linha do WASDE, no arquivo já baixado) | Milho | **Feito**, dev e servidor (ADR 0035) |
| 1 | Grain Stocks, estoques trimestrais (USDA, pelo ESMIS, como a área plantada) | Milho | **Feito**, dev e servidor (ADR 0035) |
| 2. Reconhecer | Compras de ouro pelos bancos centrais (FMI, *Gold Reserve Statistics*, que é o IRFCL na API SDMX) | Ouro | **Feito**, dev e servidor (ADR 0036): 88 países, mensal desde 1999 |
| 2 | ETFs e demanda de ouro (World Gold Council, *Gold Demand Trends*) | Ouro | **Feito**, dev e servidor (ADR 0037), uso interno com o risco da licença aceito: ETFs semanais desde 2003; bancos centrais, ETFs e minas trimestrais desde 2010 |
| 3. Mais trabalho | Paridade de exportação do IMEA (boletim semanal em PDF) | Milho | A fazer (reconhecida) |
| 3 | Intenção de plantio e andamento da safra do IMEA (PDF) | Milho | **Feito** em dev (ADR 0039): andamento da semeadura (desde 2012/13) e da colheita (desde 2015/16) por região de MT, semanal. Não há documento próprio de intenção de plantio (a estimativa de safra vem da API, ADR 0018) |
| Fora do alcance | Futuros com histórico longo (ZC e GC, da CME): só pagos | Milho e ouro | Orçamento (perguntas 2 e 3) |
| Fora do alcance | Geopolítica: a planilha aponta o World Gold Council, que não publica um índice de risco | Ouro | O David dizer o que espera |

**Café, numa onda completa (decisão do usuário, 2026-09-26):** as fontes do café, inclusive o clima pela NOAA STAR
(mesmo coletor do milho, ADR 0025: uma entrada nova em `CULTURAS`, com `ACOF`/`RCOF`), com as regiões
escolhidas a partir das fontes de produção do café, não de conhecimento geral. A onda começou em 2026-09-28, sem
esperar a reunião do Comitê (só aquisição de dados, cada fonte autorizada no seu ADR):

| Passo | Fontes | Situação |
|---|---|---|
| 1. Reaproveitar coletores do milho | CFTC COT (Coffee C da ICE), Comex Stat (café verde), B3 ICF (Up2Data e Boletim Diário) | **Feito** (ADR 0028). Descartados no caminho: o arquivo `Indic` da B3 (não traz o café à vista) e o conilon CNL (nenhum negócio) |
| 2. Safra brasileira e clima | Conab (Boletim da Safra de Café), depois NOAA STAR café com as regiões tiradas dela | **Feito**: Conab (ADR 0029) e NOAA café (ADR 0030). No Brasil a NOAA não separa arábica de conilon (as duas máscaras cobrem os mesmos pixels): uma série "café" por UF, e arábica e robusta separados só no mundo e nos hemisférios (decisão do usuário) |
| 3. Reconhecer as fontes novas | Estoques certificados da ICE, USDA FAS (PSD e *Coffee: World Markets and Trade*), ICO | **Reconhecido** (`docs/reconhecimento-fontes/cafe-mercado-mundial.md`). **PSD do café feita** (ADR 0031) e, pela produção dela, os 7 maiores produtores depois do Brasil na NOAA café (Vietnã, Colômbia, Indonésia, Etiópia, Uganda, Índia e Honduras, um tipo por país). **Estoques certificados da ICE feitos** (ADR 0032), com o risco dos termos de uso aceito pelo usuário (excluem robôs); backfill completo no servidor, desde 2016-01-04; a ICO (PDF mensal, reuso livre com citação) fica para depois; o *World Markets and Trade* não entra (PDF com os números da PSD) |
| 4. Reconhecimento rápido | Cecafé, MAPA, Embrapa (tendem a só republicar dado de outras fontes) | **Reconhecido** (2026-10-01): MAPA e Embrapa só republicam (não implementar). O Cecafé tem um dado original, o **resumo diário** dos certificados de origem por porto, com **arábica e conilon separados** (o Comex Stat não separa): **implementado, dev e servidor** (ADR 0038), com o histórico a partir da 1ª coleta. Os PDFs mensais do Cecafé são proibidos a robôs — `docs/reconhecimento-fontes/cafe-cecafe-mapa-embrapa.md` |

**Preço do café: a mesma situação do milho.** A saída que usamos no milho (o futuro da B3, pelo Up2Data e pelo Boletim
Diário) **já está feita para o café**: o **ICF**, futuro de café arábica da B3, por vencimento, desde 2022-03-21, em dev e
no servidor (passo 1, ADR 0028). E tem **o mesmo problema de backtest do CCM**: só **~4,5 anos** de histórico, com o
buraco de 2023, abaixo dos 10 a 15 anos da §12.1 do FEL 1 (pergunta 8). O histórico longo e diário só existe no **KC**
(o futuro de café arábica "C" da ICE, em Nova York, a referência mundial do arábica), que é **pago**: é para o café o
que o ZC é para o milho (perguntas 2 e 3). Uma saída **grátis, mas mensal**, foi confirmada em 2026-09-30 por chamada
real: o preço do arábica e do robusta do FMI no FRED (`PCOFFOTMUSDM` e `PCOFFROBUSDM`, US¢/lb, desde 1992), que
reaproveita o coletor do FRED. Serve para ciclos longos (a geada de 2021), não para regras diárias. **Não
implementada**: fonte nova, aguarda a autorização do usuário ou do Comitê.

Fica também para o Comitê, **só do café**, o risco de geada (sem indicador pronto gratuito; montá-lo seria regra do
David).

O IMEA foi implementado em **área, produção, produtividade, custo de
produção** (API e catálogo de arquivos, JSON/XLSX — ADR 0018) e **balanço de
oferta e demanda** (PDF mensal, extraído por coordenada — ADR 0019).
O **andamento da semeadura e da colheita** (Informes de Semeadura e de Colheita, PDF por safra, lido por coordenada) foi
implementado em 2026-10-01 (ADR 0039). Não existe um documento próprio de intenção de plantio no catálogo: a estimativa
de safra em PDF parou em 2022, e a atual vem pela API de safra (ADR 0018).

Fora desta lista: o **preço histórico dos futuros** (B3 com 10+ anos e CME ZC, ambos
pagos), que está na §4 (perguntas 2 e 3), e as fontes de ouro que ele lista e não
coletamos (WGC, CME/COMEX, FMI, USGS), que estão nas ressalvas da §2 e na §6. US Treasury e
Banco Mundial foram reconhecidos em 2026-09-28 e não trazem nada novo para o ouro (§2).

### Infraestrutura pendente

Nenhuma no momento (a última, `imea-custo-milho` sempre "Parcial", foi resolvida em 2026-09-28: o rótulo repetido
de Tangará da Serra virou aviso da fonte, ADR 0002).

### Carga histórica pendente no servidor

Backfills já validados em dev que ainda não rodaram na VM. Ao rodar, tirar a linha daqui e marcar "dev e servidor"
na coluna Status de "Dados coletados" (§2).

As anteriores (Grain Stocks, etanol do WASDE, exportação de milho por destino, ouro do FMI, World Gold Council e Cecafé)
rodaram no servidor em 2026-10-01, com os mesmos números de dev.

| Carga | Comando (no container `backend`) | Duração | Ordem |
|---|---|---|---|
| Andamento da semeadura e da colheita do milho (IMEA, ADR 0039) | `npm run backfill:imea-andamento` | < 1 min | Qualquer. Termina como "parcial" com 1 falha: a colheita 2014/15, recusada de propósito |

A PSD do café não precisa de backfill: a 1ª coleta diária depois do deploy é a carga (ADR 0031). O mesmo vale para as séries do ouro no FRED e o CPI (ADR 0033), que baixam a série inteira, com todas as versões, a cada coleta.

</details>

<details>
<summary>4. Bloqueado — depende do David / Comitê</summary>

**O que o David e o Comitê ainda definem** (a lista que ficava num documento à parte, aposentado em 2026-09-28):

| Definição | Situação |
|---|---|
| Ativos, mercados, fontes e dados a coletar | **Propostos pelo FEL 1** (café, petróleo, milho e ouro; as fontes e a planilha de fatores), aguardando a aprovação do Comitê. A coleta de milho e ouro foi adiantada, **só aquisição de dados**, fonte a fonte, cada uma autorizada no seu ADR (ADRs 0001, 0006, 0008, 0009, 0013, 0015, 0017 a 0025 e 0027); a do café começou do mesmo jeito (ADRs 0028 a 0032) |
| Regras e cálculos do motor (camadas B e C) | Em aberto: é a etapa 1 dos "Próximos passos" e o §5 (a medida de cada fator, camada A, é proposta pelo FinMind para o Comitê confirmar) |
| Formato de apresentação dos resultados | Em aberto (dashboard, relatório, alerta...) |
| Avaliação da saída da IA | Em aberto: o que é acerto (horizonte e métrica), ver §5, "Memória com avaliação". O papel da IA já foi decidido (pergunta 11) |
| Condições de sinal operacional | Em aberto: nenhum sinal é gerado hoje |
| Execução automática de ordens | **Não existe nesta fase** (restrição permanente, `CLAUDE.md`): uma pessoa decide e executa. A arquitetura mantém análise e execução em camadas separadas (`docs/architecture.md`) |

Perguntas da análise crítica (`docs/analise-critica-fel1-milho-ouro.md`, §H).
Preencher a resposta e a data quando o David responder.

**Prioridade da próxima reunião (decidido em 2026-09-22, auditoria da camada de
dados; a 2 somada em 2026-09-23; a 8 e a ordem, em 2026-09-27):** primeiro o
**"Backtest em detalhe"** (abaixo da tabela: o que é e o que o Comitê define), depois
a **pergunta 8** (quantos anos de histórico, que resolve boa parte da 2), depois as
**perguntas 2 e 3** (juntas: preço futuro do milho e orçamento), porque definem se o
backtest é viável, e por fim a **9 e a 10** (contra o que comparar e limites fixados
antes). As **5, 6 e 11** deixaram de ser perguntas em 2026-09-27: viraram informes, para
ciência do Comitê. Ver `docs/cobertura-fatores-fel1-milho-ouro.md`, §7.

| # | Pergunta | Trava? | Resposta / data |
|---|---|---|---|
| 1 | Milho + Ouro como **prova de arquitetura** (sem mudar a ordem CAFÉ→PETRÓLEO→MILHO→OURO) é aceitável? | | — |
| 2 | Milho: podemos seguir só com o **CCM (B3)**, que é grátis mas só tem **~4 anos** de histórico, ou precisamos do **ZC (CME)**, que é **pago**? Ouro: **GC** ou preço de referência? **Discutir depois da pergunta 8**, que resolve boa parte desta. **Detalhe para a reunião logo abaixo da tabela** | ⛔ | — |
| 3 | Existe **orçamento para dados de preço**? Sem isso não há backtest. **Para o milho, é respondida junto com a pergunta 2** (escolher o ZC = ter orçamento para ele); segue valendo para o **ouro** (o futuro GC da CME também é pago) | ⛔ | — |
| 4 | Confirmam que o **COTAHIST não atende CCM/ICF**? Qual a alternativa? (o ADR 0009 já confirma que não atende; para o CCM, a alternativa encontrada foi o Boletim Diário da B3, ADR 0020 — ver pergunta 2). **Detalhe logo abaixo da tabela** | | — |
| 5 | **Vintage do agro (para ciência do Comitê):** o dado do agro é revisado depois de publicado, e parte do passado só existe na versão final. Isso limita o **backtest** de algumas regras (sobretudo as da Safrinha antes de fev/2025), mas o impacto é localizado: o WASDE tem as revisões do milho desde 2011 (EUA e ~20 países, incluindo o Brasil), e **a partir de agora o FinMind guarda cada revisão de todas as fontes**. A avaliação da IA será feita daqui para frente. **Detalhe logo abaixo da tabela** | | — |
| 6 | **Licença e redistribuição (para ciência do Comitê):** hoje todo o uso é interno (decisão de 2026-09-21). **Antes de exibir, redistribuir ou comercializar** dados ou análises para terceiros, algumas fontes exigem licença ou autorização específica: LBMA (ouro), CEPEA/ESALQ e B3 (preços do milho) e Conab. **Detalhe logo abaixo da tabela** | | — |
| 7 | **CEPEA** está bloqueada para automação. Export manual é aceitável em produção? | | **Não se aplica mais** (decisão do usuário, 2026-09-23): o mesmo indicador vem da B3, automatizado, desde 2018-06-08 — ADR 0021. Só voltaria se o David pedir o histórico anterior a 2018 |
| 8 | **Contradição do FEL 1:** o backtest precisa de **1 a 5 anos** de histórico (§4) ou de **10 a 15 anos** (§12.1)? Qual vale? **Discutir antes da pergunta 2:** com 1 a 5 anos, o CCM (~4,5 anos, grátis) praticamente atende; com 10 a 15, o milho só fecha com o ZC (pago). **Detalhe logo abaixo da tabela** | | — |
| 9 | Qual o **benchmark** do Sharpe mínimo, isto é, **contra o que** o resultado do backtest é comparado (ex.: só comprar e segurar)? **Detalhe logo abaixo da tabela** | | — |
| 10 | **Tarefa do Comitê:** fixar os **limites de aprovação da §12.2 antes do primeiro teste**, a "nota que passa" (Sharpe mínimo, perda máxima tolerada, número mínimo de operações etc.). O FEL 1 já exige que seja antes: definir depois de ver o resultado invalida o teste. **Depende das perguntas 8 e 9.** Ver "Backtest em detalhe", abaixo da tabela | | — |
| 11 | **O papel da IA (para ciência do Comitê):** a IA é a **analista** do processo e **gera a recomendação** (comprar, vender, manter ou ficar de fora, no curto, médio e longo prazo), sempre com base nos dados e nas regras que o motor envia. Uma pessoa decide e executa; nenhuma ordem sai automaticamente. Ver §5, "O papel da IA" | | — |
| 12 | **Como abastecer o fator 8 do milho (política comercial: China, tarifas)?** Proposta: (1) **exportação por destino**, número oficial: **já coletada desde 2026-10-01** (ADR 0034, só aquisição); a medida, B e C são do Comitê, como nos demais fatores; (2) **tarifas e decisões de governo**, que são eventos (a busca de eventos **ainda não foi desenvolvida**): a IA leria boletins oficiais e registraria cada evento de forma estruturada (tipo, país, produto, data, link), capturado no dia em que sai. A IA nunca produz um número que entre no motor. **Detalhe logo abaixo da tabela** | | — |
| 13 | **Ajustes no documento FEL 1 (para os autores corrigirem):** inconsistências encontradas no relatório v1.1 e na planilha, reunidas num item só: a Seção 16 citada mas inexistente, o COTAHIST, o WASDE e o café, o período do Crop Progress e o prazo da demo. Nenhuma trava o FinMind. **Detalhe logo abaixo da tabela** | | — |
| 14 | **WASDE impacta café** (planilha) ou não (texto revisado)? Qual prevalece? **Incluída no item 13** | | — |
| 15 | **FAO/AMIS** foi reconhecida e **adiada**: o WASDE já traz o balanço mundial do milho com vintage. Existe necessidade de implantá-la no futuro? **Detalhe logo abaixo da tabela** | | — |
| 16 | **Paridade de exportação do milho:** o FinMind deve guardar a **paridade já calculada pelo IMEA** (valor pronto), os **componentes** dela (frete, prêmio de porto) ou nada por ora? **Detalhe logo abaixo da tabela** | | — |

<details>
<summary>Backtest em detalhe — o que é e o que o Comitê define (perguntas 8, 9 e 10; ler antes das outras)</summary>

**O que é:** fingir que estamos numa data do passado, aplicar uma regra usando **só o que se sabia naquele dia**,
anotar a decisão e depois ver o que o preço fez. Repete-se para centenas de datas e soma-se o resultado. Responde a
uma pergunta: **"se essa regra existisse nos últimos X anos, teria funcionado?"**

**Exemplos com os nossos fatores** (as regras são **inventadas**, só para ilustrar):

| Fator | Regra (fictícia) | Como se testa | Armadilha |
|---|---|---|---|
| COT (fundos) | "Fundos muito comprados → preço cai nas 4 semanas seguintes" | Toda sexta desde 2006: olhar o COT publicado naquele dia e o preço 4 semanas depois | O COT se refere à **terça** mas só sai na **sexta**: usar o dado na terça é saber 3 dias antes de todo mundo |
| WASDE (estoque/uso) | "Corte do estoque/uso dos EUA → alta no mês seguinte" | Cada edição desde 2011 (~180 testes) | Nenhuma: temos o número exato de cada edição. É o nosso melhor caso |
| Safrinha (Conab) | "3 revisões seguidas para cima → pesa para baixa" | Cada levantamento mensal | Antes de fev/2025 só existe o número final: a regra não pode ser testada ali (pergunta 5) |
| Crop Progress | "Lavoura abaixo de 60% boa + excelente em julho → alta até a colheita" | Um julho por ano | Com o preço do CCM desde 2022, são **só 4 julhos**: 4 acertos podem ser sorte |
| Sistema completo (FEL 1, §12) | Todas as regras juntas, gerando operações | Simular as operações descontando os custos (corretagem, rolagem, spread) | Esquecer um custo faz o resultado parecer melhor do que é |

**Cada fator do FEL 1 é um candidato a backtest.** Os fatores vieram do conhecimento de mercado (FEL 1, §7.2), não
de um teste com dados. Um fator sozinho ("o WASDE influencia o preço") não se testa: testa-se a **regra** que o Comitê
construir sobre ele. Em princípio, todo fator pode ser validado; na prática, depende de haver dado e casos
suficientes. Os 8 do milho:

| Fator | Dá para validar? | Por quê |
|---|---|---|
| 3. WASDE (estoque/uso) | ✅ Bem | Uma edição por mês desde 2011, com a data de cada número |
| 7. COT (fundos) | ✅ Bem | Semanal desde 2006, muitos casos |
| 4. Dólar | ✅ Bem | Diário desde 1994 (a paridade ainda não tem dado) |
| 5. Etanol (EIA) | ✅ Razoável | Semanal desde 2010 |
| 1. Crop Progress | ⚠️ Pouco | Um ciclo por ano: com o CCM desde 2022, são só 4 safras |
| 2. Safrinha (Conab) | ⚠️ Pouco | Revisões só desde fev/2025; antes, só a aproximação pelo WASDE (pergunta 5) |
| 6. Insumos (IMEA) | ⚠️ Ainda não | O histórico com as datas de publicação começou agora |
| 8. Política comercial | ❌ Difícil | Tarifas são eventos raros e não são números; a exportação por destino ainda não é coletada |

Um backtest precisa de muitas repetições para separar regra de sorte. Nos fatores com poucos casos (um por ano, ou
eventos raros), a validação vem mais da experiência de mercado do que do teste, e isso deve ser dito abertamente.

**A recomendação da IA não passa por backtest.** O modelo **conhece** o passado (aprendeu com textos da época), então
o teste seria viciado. Ela é testada **daqui para frente**, em simulação: é a "Camada 3 — Demo" do FEL 1 (§12.1, no
mínimo 6 meses). O backtest vale para as regras B e C, feitas em código.

**Quem define o quê:**

| Quem | Define |
|---|---|
| **Comitê** | **O que testar:** as regras B e C de cada fator. **Com quanto histórico:** pergunta 8. **Contra o que comparar:** pergunta 9 (ex.: "só comprar e segurar"). **Qual resultado aprova:** os limites da §12.2, definidos **antes** do teste (pergunta 10). E qual instrumento e horizonte (item 7 da §5) |
| **FinMind (engenharia)** | **Como testar sem trapacear:** só o dado publicado em cada data (o motor já faz isso), custos descontados, e o período usado para ajustar a regra separado do período usado para testá-la (walk-forward). A §12 do FEL 1 já define boa parte disso |

**O que o FEL 1 já pede como critério de aprovação (§12.2):** número mínimo de operações (sugere 100 por ativo),
Sharpe mínimo (retorno ajustado ao risco), perda máxima tolerada (drawdown), profit factor, desempenho fora da amostra
que não degrade demais, lucro mantido com custos 50% maiores e resultado estável com pequenas mudanças nos parâmetros.
**Os limites de cada um estão em aberto**, e a §12.2 exige que sejam fixados antes do teste: definir depois de ver o
resultado é se enganar.

**Ordem sugerida na reunião:** esta seção → **pergunta 8** (quantos anos; resolve boa parte da 2) → **perguntas 2 e 3**
(preço e orçamento) → **9 e 10** (comparação e limites).

**Como apresentar:** "Backtest é testar uma regra no passado, só com o que se sabia em cada data. O Comitê decide o
que testar, com quanto histórico, contra o que comparar e qual resultado aprova, antes de testar. A engenharia garante
que o teste não trapaceia. A IA é testada daqui para frente, em simulação."

</details>

<details>
<summary>Pergunta 8 em detalhe — quantos anos de backtest (para levar à reunião)</summary>

**A decisão:** quantos anos de histórico o backtest precisa ter para o Comitê confiar numa regra? O próprio FEL 1 dá
duas respostas diferentes (`docs/analise-critica-fel1-milho-ouro.md`, contradição 1). O texto, conferido no relatório
v1.1 em 2026-09-27:

- **§4 (Metodologia, item "Execução"):** "Backtest histórico (**1 a 5 anos**) com separação in-sample/out-of-sample
  e walk-forward analysis [...]. Os critérios de aprovação estão detalhados na Seção 12."
- **§12.1 (Camada 1, acrescentada na v1.1):** "Backtest histórico: **10 a 15 anos** de dados point-in-time, cobrindo
  ao menos um ciclo completo de alta e de baixa **em cada commodity** (para o café, obrigatoriamente incluindo a geada
  de 2021; para o petróleo, o choque de 2020 e o de 2022)."

**Não é uma diferença por ativo:** nenhuma das duas passagens fala de um ativo específico. A §4 vale para o sistema
todo, e a §12.1 vale para "cada commodity". **Indício de qual prevalece:** a própria §4 remete os critérios à §12, que
é mais nova (v1.1) e mais detalhada; tudo indica que a §4 ficou desatualizada. Mesmo assim, cabe ao Comitê confirmar.
A §12.1 também traz um critério melhor que o número de anos: **um ciclo completo de alta e de baixa**, e a §12.2
sugere **no mínimo 100 operações por ativo** no backtest.

**Por que importa:** esta resposta decide a pergunta 2. É o critério; a pergunta 2 (CCM ou ZC) é a consequência.

| Se valer | Milho | Ouro |
|---|---|---|
| **1 a 5 anos** (§4) | O **CCM** (grátis, desde mar/2022, ~4,5 anos) praticamente atende, com o buraco de ~9 meses em 2023. Nada a comprar | O **LBMA** (desde 1968) atende com folga |
| **10 a 15 anos** (§12.1) | Só o **ZC** (Chicago, pago) tem histórico para isso. O CCM só chega lá por volta de 2032-2037 | O LBMA atende; a licença da IBA é o ponto de atenção (pergunta 6) |

**E os fatores?** O preço não é o único limite. Com 10 a 15 anos, o **WASDE** atende (revisões desde 2011, ~15 anos),
mas a **Conab** (revisões só desde fev/2025) não; ela entraria com o número revisado ou pela aproximação do WASDE
(pergunta 5).

**Nossa leitura:** 1 a 5 anos é pouco para testar regras de um ativo com ciclo anual de safra: 4 anos são só 4 safras,
e dificilmente um ciclo completo de alta e de baixa.
Mas 10 a 15 anos custam dinheiro (ZC) e esbarram no vintage do agro. Um caminho intermediário: testar agora com o que
existe (CCM, ~4,5 anos), declarando o limite, e usar o ZC para confirmar as regras num histórico longo, se houver
orçamento (pergunta 3).

**A IA não entra nesta conta.** A recomendação da IA é avaliada daqui para frente, não no passado (pergunta 5): o
número de anos de backtest vale para as regras B e C, feitas em código.

**Como apresentar:** "O FEL 1 pede 1 a 5 anos na §4 e 10 a 15 na §12.1, as duas para todos os ativos. A §12 é a
mais nova e a própria §4 remete a ela, então entendemos que vale a §12.1. Confirmam? Se sim, o milho exige comprar o
ZC para o histórico longo; se valer a §4, o CCM gratuito atende."

</details>

<details>
<summary>Pergunta 2 em detalhe — preço futuro do milho (para levar à reunião)</summary>

**A decisão:** o FinMind pode fazer a análise e o backtest do milho **só com o CCM
(B3)**, aceitando um histórico curto, ou precisamos do **ZC (CME/Chicago)**, que é **pago**? Esta resposta
já responde a **pergunta 3 (orçamento) para o milho**: escolher o ZC é aprovar gasto com dado de preço.

**O que temos hoje do CCM (B3, R$/saca) — grátis:**

- Preço diário **por vencimento** (ajuste, abertura, máxima, mínima, médio, último), negócios, contratos,
  volume e **contratos em aberto**.
- **Desde 2022-03-21 — cerca de 4 anos e meio** (backfill do Boletim Diário da B3 + coleta diária), no
  servidor desde 2026-09-23.
- **Com um buraco de ~9 meses em 2023** (fev a nov): a B3 publicou esses boletins sem a tabela de
  derivativos. Não há outra fonte grátis para esse período.
- Contratos em aberto por vencimento **só até 2025-12-11** (a B3 deixou de publicar); preço e liquidez
  seguem diários.
- **Antes de 2022, nada de graça.** O histórico mais antigo do CCM só existe comprando da própria B3 (preço
  não publicado, só por cotação).

**Nossa leitura:** acreditamos que é possível trabalhar com o CCM — é o preço que o mercado brasileiro de
fato negocia —, **mas com apenas ~4 anos de backfill**, e com o buraco de 2023. Isso fica **abaixo dos
10–15 anos** que o próprio relatório FEL 1 pede para backtest (§12.1; a §4 fala em 1–5 anos — ver pergunta 8).

**O ZC (CME, US$/bushel) — pago:**

- É a referência mundial do milho, muito mais líquido que o CCM, com **histórico longo** (16+ anos por
  vencimento, com contratos em aberto).
- **Não há fonte grátis confiável.** As grátis (Yahoo, Stooq, Investing) são vetadas pelo próprio FEL 1
  para decisão (série contínua com rolagem opaca). A Nasdaq Data Link (antiga Quandl) descontinuou a série.
- **Opção mais barata encontrada (não contratada):** Databento, pagando só pelo uso — histórico de 2010 em
  diante; estimativa de uma compra única pequena (possivelmente dentro do crédito grátis de US$ 125 da
  conta nova — **a confirmar** com o cálculo de custo da própria Databento antes de qualquer compra).
  Alternativas: Norgate (~US$ 270/ano, desde 1980, mas presa ao Windows), FirstRate (compra única, preço
  não publicado), CME DataMine (oficial, só por cotação).
- **Licença:** uso interno (análise e backtest da equipe) em geral é permitido; **mostrar o dado da CME a
  usuários de fora** exige licença de distribuição da CME — muda o custo se o FinMind virar produto.

**As respostas possíveis, e o que cada uma implica:**

1. **Só CCM** → nada a comprar; backtest do milho limitado a ~4 anos (com o buraco de 2023) até o
   histórico crescer com a coleta diária.
2. **CCM + ZC** (o ZC como histórico longo e fator de preço global; o CCM como preço local operado) →
   precisa de orçamento (pergunta 3). É a nossa recomendação técnica.
3. **Só ZC** → precisa de orçamento; perde o preço em reais que o produtor brasileiro negocia.

Em qualquer caso, **qual dos dois é o ativo operado** é uma decisão do Comitê; converter o ZC para R$/saca
(paridade) é um fator, que também passa por ele.

</details>

<details>
<summary>Pergunta 9 em detalhe — contra o que comparar o backtest (para levar à reunião)</summary>

**A decisão:** o resultado do backtest vai ser comparado **com o quê**? O FEL 1 (§12.2) pede um "Sharpe mínimo", mas
não diz a referência.

**Por que precisa de comparação:** um número sozinho não diz se é bom. Se o backtest mostrar que o sistema ganharia
12% ao ano (número ilustrativo):

- e o milho subiu 15% ao ano no período, **só comprar e segurar** teria sido melhor: o sistema não acrescentou nada;
- e o CDI rendeu 11%, deixar o dinheiro aplicado daria quase o mesmo **sem risco nenhum**.

**O que é o Sharpe:** o retorno **por unidade de risco**. Um sistema que ganha 12% com pouca oscilação é melhor que um
que ganha 12% com altos e baixos violentos.

**As referências mais comuns:**

| Referência | A pergunta que ela responde |
|---|---|
| **Comprar e segurar o milho** | O sistema é melhor do que ficar comprado o tempo todo? |
| **CDI** | Vale o risco, ou era melhor deixar o dinheiro aplicado? |
| **Ficar de fora** | O sistema ganha alguma coisa, ou perde dinheiro? |
| **Decisão aleatória** | O sistema acerta mais do que uma moeda jogada para cima? |

**Nossa leitura:** usar **duas réguas ao mesmo tempo**, comprar e segurar o milho **e** o CDI. A regra só é aprovada
se superar as duas. A análise crítica do FEL 1 já apontava o "comprar e segurar" como o mínimo; o CDI entra porque, no
Brasil, é o custo de oportunidade de qualquer dinheiro parado.

**O Sharpe fica no backtest; o CDI também vai para o prompt.** São dois usos diferentes:

- **No backtest,** o Sharpe e a referência servem para o Comitê **aprovar ou reprovar uma regra**, olhando o passado
  inteiro. Não vão para o prompt: não dizem nada sobre a decisão de hoje.
- **No prompt,** a Selic de hoje entra como **custo de oportunidade** (§5, exemplo do prompt): a IA só recomenda
  comprar se o ganho que os fatores sugerem compensar o risco frente ao dinheiro parado. Com a Selic alta, o milho
  precisa entregar mais para valer a pena, e a recomendação plausível passa a ser "ficar de fora".

**Como apresentar:** "O FEL 1 pede um Sharpe mínimo, mas não diz comparado com quê. Propomos duas réguas: a regra
precisa ser melhor do que só comprar e segurar o milho e melhor do que deixar o dinheiro no CDI. Concordam?"

</details>

<details>
<summary>Pergunta 4 em detalhe — COTAHIST e o histórico do CCM (para levar à reunião)</summary>

**Mais informe do que pergunta.** Já verificamos e já temos a alternativa: ao Comitê só cabe confirmar.

**De onde vem:** o relatório FEL 1 (§6.5.2) diz que o **COTAHIST**, o arquivo gratuito de histórico de cotações da
B3, "atende ICF e CCM" (futuros de café arábica e de milho). Se fosse verdade, teríamos de graça o histórico completo
do preço futuro do milho.

**O que verificamos:** **não atende** (ADR 0009). O COTAHIST é o histórico do **mercado à vista** (ações, fundos
etc.); os futuros ficam em outra área da B3 ("Derivativos → Ajustes do pregão"). A afirmação do relatório está
errada.

**A alternativa que encontramos:** o histórico do CCM foi montado com duas fontes da própria B3, ambas gratuitas:

- **Up2Data** (CSV): a coleta diária, com uma janela de ~15 meses.
- **Boletim Diário** (PDF, ADR 0020): de **21/03/2022 a 11/12/2025**, com abertura e contratos em aberto.

Resultado: **o CCM está coberto desde mar/2022, por vencimento.** Antes de 2022 não encontramos fonte gratuita.

**O que resta ao Comitê:**

1. **Confirmar** que o COTAHIST não atende, para corrigir o §6.5.2 do FEL 1 e ninguém mais contar com ele.
2. **ICF (café):** o caminho do Boletim Diário deve servir também para o café, mas não foi testado (o café está fora
   do escopo por enquanto).
3. **A consequência importante está na pergunta 2, não aqui:** a alternativa tem ~4 anos e meio de histórico. Se isso
   basta ou se é preciso pagar pelo ZC da CME é o que a pergunta 2 decide.

**Como apresentar:** "O relatório indicava o COTAHIST para o CCM; ele não atende. Encontramos o Boletim Diário da B3 e
cobrimos o CCM desde 2022. O que falta decidir, se 4 anos bastam, é a pergunta 2."

</details>

<details>
<summary>Pergunta 5 em detalhe — vintage do agro (informe, para levar à reunião)</summary>

**Não é uma decisão, é um informe:** o Comitê precisa estar ciente de um limite do backtest e de como ele está sendo
resolvido.

**O que é "vintage":** o número **como ele era conhecido em cada data**. O dado do agro é uma estimativa que a fonte
revisa. Exemplo real do banco, a Safrinha 2024/25 da Conab:

| Publicado em | Estimativa da 2ª safra 2024/25 |
|---|---|
| 13/02/2025 | 96.048 mil t |
| 10/07/2025 | 104.538 mil t |
| 14/08/2025 | 109.567 mil t |
| 11/09/2025 | 112.033 mil t |
| 11/12/2025 | **113.228 mil t** (final) |

De fevereiro ao fim, a estimativa subiu 18%.

**Por que isso importa no backtest:** o backtest testa uma regra no passado: roda o motor numa data antiga, só com o
que se sabia naquela data, e compara com o que o preço fez depois. Em fev/2025, o mercado conhecia 96 milhões de t.
Se o teste usar o número final (113), o motor "sabe" algo que ninguém sabia, e o resultado sai melhor do que seria na
vida real (viés de olhar o futuro). Quando a fonte só publica o número atual, as estimativas antigas **não existem mais
em lugar nenhum**: não é uma escolha nossa.

**Onde estamos (milho):**

| Situação | Fontes |
|---|---|
| ✅ Todas as revisões, histórico longo | **WASDE** (desde 2011): balanço do milho dos EUA e de ~20 países, **incluindo o Brasil** (total, sem separar as safras). **IMEA oferta e demanda** (desde 2014, só MT) |
| ⚠️ Revisões só desde fev/2025 | **Conab** |
| ⚠️ Revisões começando agora | **IMEA** safra e custo; **NOAA** (a fonte reprocessa o histórico) |
| — Quase não revisam | Dólar PTAX, COT, preços da B3 |

**O impacto é localizado:**

- **Importa muito** nas regras baseadas em revisão ou surpresa: sem vintage, elas nem podem ser calculadas no
  passado. É o caso da Safrinha antes de fev/2025.
- **Importa pouco** nos dados que quase não revisam (dólar, COT, preços da B3).
- **O limite maior é outro:** o preço do CCM só existe desde 2022 (pergunta 2), então o backtest do milho já fica na
  janela de 2022 a 2026. Nessa janela, o WASDE (peso Alto) tem vintage completo; a Conab tem desde fev/2025.
- **Há uma aproximação para a Safrinha:** o WASDE traz a produção de milho do **Brasil** com todas as revisões desde
  2011 (ex.: safra 2024/25, de 127 milhões de t em mai/2024 a 136 em nov/2025). Não é a 2ª safra nem o número da
  Conab, mas é o melhor substituto para testar no passado uma regra da Safrinha antes de fev/2025, se o Comitê
  aceitar.
- **O viés pode ser medido:** com o WASDE, dá para rodar o mesmo teste com o número da época e com o final e saber de
  quanto é a diferença.
- **O FEL 1 já define a regra (§12.3):** "vedado o uso de série de preços revisada ou de dado fundamentalista sem data
  de publicação". Então o backtest **não usa o número final no lugar do da época**, nem com o viés declarado. O motor
  já cumpre isso sozinho: ele só enxerga o que estava publicado em cada data (point-in-time). Na prática, antes de
  fev/2025 a Safrinha da Conab fica **sem dado** no backtest, e a saída é a aproximação pelo WASDE (que tem as datas de
  publicação), se o Comitê aceitar.

**A partir de agora, o problema acaba:** a coleta guarda cada revisão de todas as fontes e nunca apaga (camada
point-in-time, ADR 0008). Cada mês que passa aumenta o histórico honesto.

**A IA é avaliada daqui para frente.** No passado, o modelo de IA **conhece** o que aconteceu (aprendeu com textos da
época), e nenhum dado corrige isso. A recomendação da IA será avaliada registrando cada recomendação e comparando
depois com o que o preço fez (§5, "Memória com avaliação").

**Como apresentar:** "Dado do agro muda depois de publicado, e parte do passado só existe na versão final. Isso
limita o teste de algumas regras no passado, sobretudo a Safrinha antes de 2025. O WASDE tem o histórico completo do
milho, inclusive do Brasil, e daqui para frente guardamos todas as revisões. A IA será avaliada daqui para frente de qualquer jeito."

</details>

<details>
<summary>Pergunta 6 em detalhe — licença e redistribuição (informe, para levar à reunião)</summary>

**Não é uma decisão, é um informe.** Hoje o FinMind usa os dados **só internamente**, e isso não exige nada (decisão
de 2026-09-21). Mas "gratuito" não quer dizer "pode redistribuir": **antes de exibir, redistribuir ou comercializar
dados ou análises para terceiros** (clientes, relatórios, um produto), algumas fontes exigem licença ou autorização
específica.

**O que dizem as fontes** (termos lidos a partir das páginas oficiais; é um resumo, não um parecer jurídico):

| Situação | Fonte | O que os termos dizem |
|---|---|---|
| 🔴 Exige licença ou autorização | **LBMA** (preço do ouro) | O preço é administrado pela IBA (ICE), que exige licença "para obter, usar ou redistribuir" o dado atual ou histórico. Tabela de taxas não lida (ADR 0009) |
| 🔴 | **CEPEA/ESALQ** (Indicador do Milho, via B3) | CC BY-NC 4.0: **sem uso comercial** e sem retransmitir séries de preço sem autorização (ADR 0021) |
| 🔴 | **B3** (CCM, Indicador, Boletim Diário) | Os Termos de Uso da B3 pedem autorização para reprodução ou distribuição comercial (ADRs 0020 e 0021) |
| 🟡 Permite, com condição | **Conab** | A página de preços cita CC BY-ND 3.0 (**sem derivações**), e a Conab se declara fora da Política de Dados Abertos. Não verificado nos arquivos da safra (ADR 0016) |
| 🟡 | **BCB** (Focus, reservas) | ODbL: redistribuir exige atribuição, e uma base derivada precisa sair com a mesma licença (ADRs 0022 e 0023) |
| 🟡 | **FRED** (juros e dólar dos EUA) | 3 das 4 séries são domínio público, com citação; a `T10YIE` não foi confirmada. Ao exibir a terceiros, aviso de que o Fed não endossa (ADR 0009) |
| 🟢 Domínio público, com citação | **EIA** (etanol) e **NOAA** (saúde da vegetação) | Dado do governo dos EUA, livre para usar e distribuir (ADRs 0024 e 0025) |
| ⚪ Não verificado | **USDA** (WASDE, Crop Progress), **CFTC** (COT), **IMEA**, **Comex Stat** | Os dos EUA são de governo e provavelmente livres, mas os termos não foram lidos. IMEA e Comex Stat não publicam termo explícito |

**O ponto mais sensível é o preço.** Justamente as fontes de preço (LBMA no ouro; CEPEA/ESALQ e B3 no milho) são as
mais restritas, e o preço é o dado principal da recomendação da IA (§5). No caso da LBMA, a IBA fala em licença até
para *usar* o dado, e não esclarece se o uso interno está coberto.

**Como apresentar:** "Hoje o uso é interno e está tudo certo. Se um dia os dados ou as recomendações saírem para
terceiros, precisamos antes de licença da LBMA, da CEPEA e da B3, e rever os termos da Conab e do BCB. As fontes do
governo americano são livres."

</details>

<details>
<summary>Pergunta 12 em detalhe — como abastecer o fator 8, política comercial (para levar à reunião)</summary>

**O problema:** o fator 8 do milho ("Política comercial e exportações — China, tarifas", peso Médio) é o único dos 8
**sem dado nenhum** hoje. A planilha indica Comex Stat e USDA como fontes e "exportações, tarifas" como indicadores.

**O fator tem duas partes, e só uma precisa de IA:**

| Parte | O que é | Como abastecer |
|---|---|---|
| **Exportação por destino** (quanto vai para a China) | Número, de fonte oficial. **Hoje não temos:** só coletamos o total exportado | **Estender** o coletor do **Comex Stat** que já existe (não é um coletor novo): a mesma API tem a quebra por país. Sem IA |
| **Tarifas e decisões de governo** | Evento, não número ("a China anunciou tarifa sobre o milho dos EUA em DD/MM"). **Hoje não temos:** a busca de eventos **ainda não foi desenvolvida** | A IA lê **boletins oficiais** e registra cada evento de forma estruturada |

**A exportação por destino segue o mesmo caminho dos outros fatores.** Não sabemos ainda se ela impacta o preço: está
no FEL 1 por conhecimento de mercado (a China pode trocar o Brasil pelos EUA como fornecedor), e é o backtest que vai
confirmar. A sequência proposta:

1. **O Comitê confirma** que a exportação por destino faz sentido e qual medida usar. Opções de medida (A): volume
   para a China no mês, participação da China no total exportado (%), variação contra o mesmo mês do ano anterior (o
   milho tem safra: comparar com o mês anterior engana).
2. **Estendemos o coletor** do Comex Stat (só depois da confirmação: só coletamos o que o motor vai usar).
3. **Calculamos a medida (A)**, como nos demais fatores.
4. **O Comitê define B e C**: por exemplo, "a participação da China está acima ou abaixo da média de 5 anos?" (B) e
   "se a China compra mais do Brasil, isso pesa para alta?" (C). O motor aplica as regras em código.
5. **A regra passa pelo backtest.** Há histórico do fator desde 2005 (mensal); o limite é o preço (CCM desde 2022).

**Nada disso existe ainda:** a busca de eventos por IA **não foi desenvolvida** nem testada no FinMind. O que segue é
a proposta, para o Comitê avaliar.

**Como seria o registro de um evento:** tipo (tarifa, cota, embargo, acordo), país que decidiu, país afetado, produto,
data do anúncio, data em que vale e **link da fonte**, com a página guardada no dia. Boletins oficiais que servem:
governo dos EUA (USTR, Federal Register), da China (Ministério do Comércio) e do Brasil (Gecex/Camex).

**A IA só extrai; a regra é do Comitê.** A IA faz o papel de coleta: lê o boletim e devolve o evento estruturado. O
que o evento **significa** para o preço segue o mesmo caminho dos outros fatores: o Comitê define B e C, e o motor as
aplica em código antes do prompt. O Comitê decide, por exemplo, quais tipos de evento contam, por quanto tempo um
evento continua valendo, e para que lado ele pesa.

Exemplo (**evento e regra fictícios**, só para mostrar o formato):

| Etapa | Resultado |
|---|---|
| **Coleta (IA)** | Boletim do Ministério do Comércio da China → evento: tipo **embargo**, decidido pela **China**, afeta os **EUA**, produto **milho**, anunciado em **10/03**, link da fonte |
| **A. Medir** | Eventos em vigor: 1 restrição da China ao milho dos EUA, anunciada há 20 dias |
| **B. Ler** (regra do Comitê) | "Restrição recente (até 90 dias) de um grande comprador a um concorrente do Brasil" |
| **C. Decidir** (regra do Comitê) | "Restrição da China aos EUA → a demanda tende a migrar para o Brasil → pesa para alta, peso Médio" |

No prompt, entraria assim:

```text
[2. BASE]
Fator 8 - Política comercial (peso Médio)
  - Eventos em vigor (últimos 90 dias):
    10/03 - China: embargo ao milho dos EUA | Fonte: Ministério do Comércio da China | <link>

[3. LEITURA DO MOTOR]
  Fator 8 - Política comercial (peso Médio): PESA PARA ALTA
    Regra: R-POL-01 v0 (fictícia) | motivo: restrição da China aos EUA há 20 dias (limite: 90)
```

**Os limites, para ficar claro:**

- **A IA nunca produz um número que entre no motor.** Ela transforma um anúncio oficial num registro estruturado,
  com o link para conferir. Todo número (volume exportado, alíquota) vem da fonte oficial.
- **Os eventos só valem daqui para frente.** O registro precisa ser feito no dia em que o evento sai. Buscar hoje os
  eventos de 2023 traz o mesmo problema do vintage (pergunta 5): a IA lê a internet de hoje e já sabe o que aconteceu
  depois. Por isso os eventos acumulam histórico a partir da captura e **não servem para backtest do passado**.
- **Eventos são raros:** mesmo com captura, uma regra sobre tarifas terá poucos casos para validar (ver "Backtest em
  detalhe"). A validação desse fator vai depender mais da experiência de mercado.

**O mesmo caminho serve ao ouro:** o fator "Geopolítica e risco sistêmico" (peso Alto) também é feito de eventos e
poderia ser abastecido da mesma forma, se o Comitê quiser tratá-lo depois.

**Como apresentar:** "O fator 8 é o único sem dado. A parte da exportação para a China é número oficial: se fizer
sentido para vocês, estendemos um coletor que já temos, e vocês definem a leitura e a regra, como nos outros fatores. A parte das tarifas são eventos: propomos que a IA leia boletins oficiais e registre
cada evento com data e link, a partir de agora. A IA nunca vira fonte de número. Concordam?"

</details>

<details>
<summary>Pergunta 13 em detalhe — ajustes no documento FEL 1 (para levar à reunião)</summary>

**O que é:** ao ler o relatório FEL 1 v1.1 e a planilha `controle_fatores.xlsx`, encontramos trechos que se
contradizem ou que citam o que não existe. Nenhum trava o FinMind; são correções de documento, para os autores
fazerem. Reunimos todos aqui para resolver em poucos minutos na reunião.

| # | Onde | O que está escrito | O que ajustar |
|---|---|---|---|
| 1 | Página 1 × fim do documento | "Ver **Seção 16** — Registro de Revisão", mas o documento termina na **Seção 14** | Incluir a Seção 16 (o que mudou da v1.0 para a v1.1) ou tirar a referência |
| 2 | §6.5.2 | O **COTAHIST** "atende ICF e CCM" | Não atende: é só do mercado à vista. Alternativa encontrada: Boletim Diário da B3 (pergunta 4) |
| 3 | §6.2 × planilha, aba "Calendário de Relatórios" | O texto diz "o WASDE **não cobre café** — ver Coffee: World Markets and Trade, bianual"; o calendário lista o WASDE com "Ativo impactado: Milho, **Café**". Na aba "Controle de Fatores", nenhum fator do café usa o WASDE: ali está coerente | Corrigir só o calendário: na linha do WASDE, "Milho, Café" → "**Milho**"; e incluir uma linha para o **Coffee: World Markets and Trade** (USDA, semestral), que é o relatório do USDA para o café (antiga pergunta 14) |
| 4 | §7.4 × planilha | Crop Progress: o texto diz "**abr-nov**"; a planilha diz "**mar-nov**" | Unificar o período |
| 5 | §4 × §12 | Demo: a §4 diz "mínimo de **3 meses**"; a §12 afirma que a §4 previa "**60 dias**" (e propõe 6 meses) | Corrigir a frase da §12 |
| 6 | §4 × §12.1 | Backtest: **1 a 5 anos** × **10 a 15 anos** | Depende de uma decisão do Comitê: **pergunta 8** |

**Por que a Seção 16 importa mais do que parece:** várias dessas inconsistências (itens 3, 5 e 6) nasceram na revisão
da v1.0 para a v1.1. Com o registro de revisão, ficaria claro qual versão de cada trecho vale.

**Como apresentar:** "Encontramos seis ajustes no documento do FEL 1. Cinco são correções simples que vocês podem
fazer; o sexto, os anos de backtest, é a pergunta 8. Nenhum trava o nosso trabalho."

</details>

<details>
<summary>Pergunta 15 em detalhe — FAO/AMIS (para levar à reunião)</summary>

**A decisão:** o FinMind precisa, no futuro, de uma **segunda visão do balanço mundial do milho** (FAO/AMIS),
além da do USDA que já temos? Enquanto o Comitê não pedir, a fonte fica **adiada**.

**O que já temos:** o **WASDE** (USDA), com o balanço do milho dos EUA e de ~20 regiões do mundo (produção,
consumo, estoques, comércio), **mês a mês desde 2011, com o histórico de revisões** (ADR 0015). É o que o
relatório FEL 1 pede ao citar "balanço global de grãos".

**O que a FAO/AMIS acrescentaria:**

- A **AMIS** publica o mesmo tipo de balanço, mensal, com **três fontes lado a lado**: a própria FAO, o IGC
  (Conselho Internacional de Grãos) e o USDA. Serve para ver onde as estimativas divergem.
- O **FAOSTAT** traz a produção **anual** de cada país desde **1961**, com mais de um ano de atraso, sem estoque
  nem balanço.

**Comentários complementares:**

- **O relatório descreve a fonte de forma otimista.** Diz "FAOSTAT API pública; AMIS com dados em Excel":
  desde 2025 a API do FAOSTAT exige conta e token (o download em lote segue aberto), e a AMIS **não tem API
  oficial** — a antiga foi desativada e o portal atual não oferece o balanço em planilha.
- **O único acesso automatizado viável à AMIS seria ler o PDF mensal** (AMIS Market Monitor, ~10 edições por
  ano), com o mesmo método já usado no IMEA. O portal consulta o banco da FAO de um jeito que não é uma
  interface publicada; não recomendamos construir sobre ele.
- **Licença:** os números da FAO são livres com citação (CC BY 4.0); os do **IGC**, que aparecem na AMIS, são
  dado comercial do IGC, com redistribuição não esclarecida.
- **Custo:** dado grátis; o custo é de desenvolvimento e manutenção de um leitor de PDF.

**As respostas possíveis:**

1. **Não é necessária** → a fonte sai da lista; o balanço mundial segue só pelo WASDE.
2. **É necessária** → pedir acesso aos dados à secretaria da AMIS e, enquanto isso, implementar a leitura do
   PDF mensal.
3. **Só a produção histórica longa (desde 1961)** → carga única do FAOSTAT pelo download em lote.

Evidência completa: `docs/reconhecimento-fontes/fao-amis.md`.

</details>

<details>
<summary>Pergunta 16 em detalhe — paridade de exportação do milho (para levar à reunião)</summary>

**De onde veio esta pergunta:** a auditoria da camada de dados (2026-09-22) listou "frete marítimo / prêmio de
porto" como lacuna, porque o fator da paridade não teria matéria-prima sem eles, e o frete entrou em "Falta
fazer". Ao procurar a fonte, encontramos as rotas de frete rodoviário do IMEA e **nos perguntamos por que estávamos
buscando o frete**: sozinho, ele não serve ao motor. É só um componente da paridade, e usá-lo exigiria o FinMind
montar a própria fórmula. A pergunta real, portanto, não é "onde achar o frete", mas **"o que o motor precisa para
este fator"**, e isso pede uma resposta do Comitê antes de qualquer coleta.

**A decisão:** para o fator do milho **"Dólar (USDBRL) e paridade de exportação"** (peso Médio), o que o FinMind
deve guardar? A regra é guardar só o que o motor vai usar: um dado coletado sem uso é custo de manutenção sem
retorno.

**O que o FEL 1 pede:** "a paridade de exportação (preço interno vs. Chicago + frete + câmbio) explica por que o
milho brasileiro sobe quando o dólar sobe", com os portos de Santos e Paranaguá e o Arco Norte (Itaqui, Barcarena,
Miritituba/Santarém), "rota que define a base do Centro-Oeste onde o CCM se forma". A planilha de fatores dá como
fontes "Cepea, Comex Stat" e como dado "Paridade de exportação, USDBRL". **Nenhum documento nomeia uma fonte de
frete.** O dólar (desde 1994) e a exportação do Comex Stat (desde 2005) já estão coletados.

**O que existe, de graça, no IMEA** (fonte que o FEL 1 já lista para o milho):

- **A paridade pronta.** O **Boletim Semanal – Milho** (PDF, toda segunda, **572 edições desde 2015-02-02**) traz
  todo dia a **paridade de exportação calculada pelo IMEA** (R$/saca, para um contrato de Chicago de referência;
  hoje, jul/26), o **diferencial de base** (milho em MT menos Chicago, em R$/saca), o **prêmio portuário** e o frete.
  A metodologia publicada pelo IMEA (edição de 2020): Chicago do contrato de referência, mais ou menos o prêmio no
  porto de Paranaguá, menos o frete rodoviário até o porto e o custo portuário, tudo em reais. É um valor
  **publicado pela fonte**, não um cálculo do FinMind.
- **Os componentes soltos.** A API do IMEA traz **28 rotas de frete rodoviário** de grãos saindo de Mato Grosso,
  em R$/t, **só o valor atual**, sem histórico. Sozinhas, não servem ao motor: seriam insumo para o FinMind calcular a
  própria paridade, e essa fórmula é um fator.

**Comentários complementares:**

- **A paridade do IMEA é a de Mato Grosso**, trazida do porto até a fazenda. Não é a de Campinas, onde o CCM se
  liquida (Indicador CEPEA/ESALQ). Qual praça importa para o motor é uma escolha do Comitê.
- **É uma série por contrato de referência**, que muda com o tempo (hoje, jul/26): cada troca de contrato é uma
  quebra na série.
- **O porto do prêmio não está claro:** a metodologia de 2020 fala de Paranaguá, mas a tabela de 2026 mostra o prêmio
  de **Santos**, atribuído à Esalq (licença a verificar). A nota de metodologia não aparece mais no boletim.
- **Custo:** dado grátis. O custo é um leitor de PDF, com a tabela lida por coordenada (a extração por texto
  desalinha as colunas), como no balanço do IMEA (ADR 0019), para layouts que mudaram entre 2015 e 2026.
- **Frete marítimo** (também citado no FEL 1): nenhuma fonte encontrada.
- **O dado não decide nada sozinho:** como a paridade entra na decisão de compra ou venda é regra do motor, que
  segue com o Comitê.

**As respostas possíveis:**

1. **Só a paridade pronta do IMEA** (com o diferencial de base) → leitor do boletim semanal, histórico desde
   2015. É a nossa recomendação: é o dado que o FEL 1 descreve, já calculado pela fonte.
2. **Paridade e componentes** (prêmio e frete por rota) → o mesmo leitor com mais colunas. Só faz sentido se o
   Comitê quiser decompor a paridade no motor.
3. **Nada por ora** → o fator fica só com dólar e exportação. Nada é implementado.

Evidência: `STATUS_DO_PROJETO.md` §2 (ressalvas, linha "Frete e paridade de exportação") e os boletins do catálogo
de arquivos do IMEA (`api1.imea.com.br/api/arquivo?cadeia=3`, "Boletim Semanal - Milho").

</details>

</details>

<details>
<summary>5. Confirmar entendimento — Motor do Milho</summary>

**Para a reunião.** Queremos confirmar com o Comitê como entendemos os **8 fatores do milho** da planilha
`controle_fatores.xlsx` (aba "Controle de Fatores"). Nome, peso e fonte vêm da planilha; a coluna "Resumo (cálculo)"
está vazia, e é ela que propomos preencher. Os exemplos usam **números reais do banco** (dev, 2026-09-26).
**Nenhum número da tabela de fatores diz se o preço sobe ou desce:** é só a medida de cada fator. Quem recomenda é a
IA, no fim do processo.

### Como entendemos o motor

**O produto do FinMind é a recomendação da IA.** Todo o resto existe para que ela seja a mais embasada possível:

```text
Coleta → A. Medir → B. Ler → C. Decidir → prompt → IA analista → RECOMENDAÇÃO → uma pessoa decide
         └──── motor, sem IA: base ───┘            └─────── a estrela ──────┘
```

Cada fator passa por três camadas no motor. O FinMind só adianta a primeira:

| Camada | O que é | Exemplo | Quem decide |
|---|---|---|---|
| **A. Medir** | Transformar o dado publicado no indicador que a planilha nomeia, com a definição usual do mercado | estoque/uso = estoque final ÷ uso total | Propomos aqui; **o Comitê confirma** |
| **B. Ler** | Comparar a medida com o próprio histórico ou com a expectativa | percentil em 10 anos; surpresa contra o relatório anterior | Comitê (método) |
| **C. Decidir** | Direção e peso de cada fator, por regras com limiar | "estoque/uso baixo pesa para alta, peso Alto" | **Só o Comitê** |

**O Comitê define as regras, e o motor executa as três camadas em código.** Sem IA, a mesma entrada sempre dá a mesma
base. Cada medida da camada A segue o molde do fator que já existe (juro real 10a, do ouro): função determinística e
versionada, que só usa o que já estava publicado na data consultada (point-in-time) e nunca é gravada no banco.

### O papel da IA: a recomendação

**A IA é a analista do processo** (decidido em 2026-09-27; informe 11 da §4). Ela recebe a base do motor, as
medidas e a leitura de cada fator, confronta os fatores entre si e **recomenda manter, comprar ou vender, no curto,
no médio e no longo prazo**. A decisão e a execução são de uma pessoa: nenhuma ordem sai da resposta da IA.

- **O nosso maior desafio é a base, não a IA.** Uma recomendação só é tão boa quanto os dados e as regras que chegam a
  ela. Cada fonte coletada e cada regra definida pelo Comitê tornam a recomendação mais certeira.
- **Sempre contra o preço.** O preço é o dado principal da base: a IA recebe o preço de hoje e a curva de preços
  futuros (no milho, os vencimentos do CCM) e responde, para cada horizonte, se os fatores sustentam um preço acima ou
  abaixo do que o mercado já paga por aquele prazo.
- **Crítica, direta e objetiva.** A recomendação vem primeiro, com a tese em poucas frases, o argumento mais forte
  contra ela e o que a invalidaria. Todo argumento cita o número e a fonte.
- **Sem embasamento, não recomenda.** Se os fatores de peso Alto estiverem sem dado, ou se os fatores se anularem,
  a resposta é "dados insuficientes" naquele horizonte. Isso é uma resposta válida, não uma falha.
- **Interpretação própria aparece como tal.** Onde o Comitê ainda não definiu a regra de um fator, a IA pode
  interpretar a medida, mas marca a interpretação como "sem regra do Comitê" e reduz a confiança.

### Os 8 fatores do milho

Dificuldade: 🟢 **fácil** (dado já coletado, cálculo de uma linha) · 🟡 **médio** (dado parcial ou depende de uma
resposta do Comitê) · 🔴 **difícil** (falta a fonte).

| # | Fator (peso) | Resumo do cálculo | Exemplo com dado real | Dificuldade |
|---|---|---|---|---|
| 1 | Clima e safra nos EUA — Crop Progress (Alto) | **% da lavoura em condição boa + excelente** (USDA, semanal, durante a safra). Complemento: **VHI** da NOAA, a saúde da vegetação medida só sobre a área do milho (0 a 100) | Semana até 20/09/2026: 44% boa + 13% excelente = **57%**. VHI dos EUA, semana até 23/09: **48,8** | 🟢 Soma de duas classes que o USDA publica; desde 1980 |
| 2 | Safrinha brasileira, 2ª safra (Alto) | **Produção estimada da 2ª safra** (Conab, Brasil) e a **revisão** contra o levantamento anterior | Safra 2025/26: 112.130,8 mil t no 12º levantamento (15/09/2026) contra 111.030,9 mil t no 11º (13/08) = **+1.099,9 mil t (+1,0%)** | 🟡 Cálculo simples, mas as revisões só existem desde fev/2025 (informe da pergunta 5) |
| 3 | Estoques globais e balanço — WASDE (Alto) | **Estoque/uso = estoque final ÷ uso total**, dos EUA e do mundo, e a revisão contra a edição anterior. No mundo, o uso é o consumo interno total (exportação e importação se anulam) | Safra 2026/27, WASDE de 11/09/2026: EUA 1.567 ÷ 16.180 M bu = **9,7%** (na edição de 12/08: 1.653 ÷ 16.330 = 10,1%, revisão de −0,4 p.p.). Mundo: 272,1 ÷ 1.320,2 Mt = **20,6%** | 🟢 Indicador citado pelo nome na planilha ("relação estoque/uso"); revisões desde 2011 |
| 4 | Dólar (USDBRL) e paridade de exportação (Médio) | **Dólar PTAX de venda** (BCB), como publicado. **Paridade:** a já calculada pelo IMEA (MT, R$/saca), se a pergunta 16 aprovar | Dólar em 25/09/2026: **R$ 5,1991**. Paridade: não coletada | 🟡 Dólar pronto; a paridade exige um leitor do boletim semanal do IMEA (PDF) |
| 5 | Demanda de etanol e biocombustível (Médio) | **Produção semanal e estoques de etanol** dos EUA (EIA), como publicados | Semana até 18/09/2026: **1.028 mil barris/dia**; estoques de **24.683 mil barris** | 🟢 Pronto. Falta a parte do USDA (milho usado para etanol, no WASDE), não extraída |
| 6 | Custo de insumos — fertilizantes, diesel (Médio) | **Peso dos fertilizantes no custo total** e a variação no mês (IMEA, custo de produção de MT, R$/ha) | Ago/2026, média de MT: R$ 1.404,89 de R$ 6.724,28 por hectare = **20,9%** do custo; **−2,4%** contra julho | 🔴 Só Mato Grosso e custo agregado; sem preço de fertilizante ou diesel isolado |
| 7 | Especulação e posicionamento de fundos — COT (Médio) | **Posição líquida dos fundos** = managed money comprado − vendido, em contratos e em % dos contratos em aberto (CFTC, milho de Chicago) | Semana até 15/09/2026 (publicada em 18/09): 483.738 − 69.278 = **414.460 contratos**, **22,5%** de 1.843.824 | 🟢 Desde 2006; o mesmo cálculo serve ao ouro |
| 8 | Política comercial e exportações — China, tarifas (Médio) | **Exportação brasileira por destino** (Comex Stat), com a China em destaque. Tarifas são eventos, não números | Hoje só o total: **4,65 milhões de t** exportadas em ago/2026, sem o destino | 🟡 Destino: a API do Comex Stat já usada tem a quebra por país (falta estender o coletor). 🔴 Tarifas: são eventos, a registrar a partir de boletins oficiais (pergunta 12) |

<details>
<summary>Exemplo: do fator à recomendação da IA (ilustração, nada implementado)</summary>

**Ilustração** de como o Motor do Milho levaria os números da tabela acima até a recomendação da IA. Nenhuma IA foi
chamada.

**Fluxo:** fatores medidos (camada A) → leitura de cada fator pelas regras do Comitê (camadas B e C), **aplicadas pelo
motor, em código** → base com a medida e a leitura → prompt → **IA analista → recomendação estruturada** → **uma
pessoa decide**.

**O motor prepara, a IA analisa e recomenda.** O motor mede (A) e lê cada fator pelas regras do Comitê (B e C),
sempre do mesmo jeito. A IA recebe esse material, pesa os fatores uns contra os outros e recomenda. Quanto mais firme a
base (fatores com dado e com regra do Comitê), mais embasada a recomendação. Sem regras, os números chegam à IA sem
leitura, e ela teria de interpretar tudo sozinha, com confiança baixa.

**Um fator do começo ao fim: a Safrinha (fator 2).** Os números são reais (Conab, banco de dev, 2026-09-26). O método
de B e a regra de C são **fictícios**, inventados só para mostrar o formato. Não são proposta: quem os define é o
Comitê (item 4 de "O que queremos confirmar", abaixo).

| Etapa | O que faz | Resultado na Safrinha |
|---|---|---|
| **Coleta** (já existe) | Guarda o boletim da Conab como publicado, uma linha por levantamento, sem apagar as anteriores | Produção da 2ª safra 2025/26: 111.030,9 mil t no 11º levantamento (13/08) e 112.130,8 mil t no 12º (15/09) |
| **A. Medir** | Calcula o indicador da planilha: nível da produção e revisão contra o levantamento anterior | **112.130,8 mil t; revisão de +1.099,9 mil t (+1,0%)** |
| **B. Ler** | Situa a medida. Método fictício: (1) contra a safra anterior; (2) sequência das revisões | (1) **−1,0%** contra a safra 2024/25 (113.228,4 mil t, número final da Conab em 11/12/2025); (2) **3ª revisão seguida para cima** (jul, ago e set) e +1,5% contra a 1ª estimativa (110.460,4 mil t, out/2025). **Leitura:** "safra do tamanho da anterior, com estimativa subindo há três meses". Ainda sem direção |
| **C. Decidir** | Aplica a regra do Comitê e dá direção e peso. Regra fictícia "R-SAF-01 v0": 2 ou mais revisões seguidas para cima, com a safra a menos de 2% da anterior, = oferta crescendo, pesa para baixa | **Fator 2: pesa para baixa, peso Alto** (a partir de 3 revisões para cima e −1,0% contra a safra anterior) |

Com só 14 revisões guardadas (desde fev/2025), não dá para dizer se +1,0% é uma revisão grande ou pequena para
setembro. É o limite do vintage do agro (pergunta 5 da §4): o histórico de revisões cresce a cada levantamento.

**Como a Safrinha entra no prompt junto com os outros fatores.** Cada fator entra em dois lugares: a medida (A) no
bloco 2, ao lado dos demais fatores, e a leitura (B e C) no bloco 3. Se a regra fictícia existisse, o bloco 3 seria
este:

```text
[3. LEITURA DO MOTOR — camadas B e C, aplicadas em código pelas regras do Comitê]
Versão das regras: v0 (ilustração)
  Fator 2 - Safrinha (peso Alto): PESA PARA BAIXA
    Regra: R-SAF-01 v0 (fictícia) | motivo: 3ª revisão seguida para cima (+1,0% no 12º levantamento);
    produção -1,0% contra a safra 2024/25, dentro da faixa de ±2%
  Fatores 1, 3, 4, 5, 6, 7 e 8: sem leitura definida
```

A IA usa essa leitura como **um dos argumentos da recomendação**: a Safrinha, com peso Alto, entra nos fatores a favor
ou contra a tese, ao lado dos outros fatores, e é citada com o número e a regra. Ela não reabre a regra: se o motor
diz "pesa para baixa", a IA não conclui o contrário sobre a Safrinha. O que ela decide é como esse fator se soma aos
demais em cada horizonte. Nos fatores sem regra, interpreta a medida e marca "sem regra do Comitê".

O prompt completo, como ele seria hoje, sem nenhuma regra do Comitê definida:

```text
[1. PAPEL E OBJETIVO]
Você é um analista sênior do mercado de milho. Com base SOMENTE na BASE e na LEITURA DO MOTOR
abaixo, recomende MANTER, COMPRAR ou VENDER milho em três horizontes:
curto (<prazo a definir pelo Comitê>), médio (<a definir>) e longo (<a definir>).
Em cada horizonte, a pergunta é: os fatores sustentam um preço ACIMA ou ABAIXO do que o
mercado já paga hoje pelo vencimento daquele prazo?
Seja crítico, direto e objetivo. Sua recomendação vai para uma pessoa, que decide e executa.

[2. BASE — montada pelo motor, sem IA]
Data da análise: 26/09/2026. Só entram dados publicados até essa data.

PREÇO DO MILHO (referência de cada horizonte; pregão de 25/09/2026)
  - Hoje, físico: Indicador do Milho ESALQ/B3, R$ 69,65/saca
    Variação: +1,8% em 1 mês | +10,1% em 3 meses | +8,2% em 12 meses
    Fonte: B3 (arquivo Indic) | publicado: 25/09/2026
  - Curva do CCM (B3, R$/saca), preço de ajuste por vencimento:
      Vencimento   Ajuste   Negócios   Contratos negociados
      nov/2026     75,52     5.384       14.357
      jan/2027     79,45     2.214        2.927
      mar/2027     81,71       914        1.128
      mai/2027     79,70       236          277
      jul/2027     78,65       422          875
      set/2027     78,34       665        1.124
      nov/2027     80,48        78          120
    Contratos em aberto: SEM DADO desde dez/2025 (a fonte atual não os publica)
    Fonte: B3 (Up2Data) | publicado: 25/09/2026

CUSTO DE OPORTUNIDADE (o que o dinheiro rende parado, sem risco)
  - Selic efetiva: 13,65% ao ano | meta: 13,75% ao ano (o CDI acompanha a Selic de perto)
    Fonte: BCB | referência: 25/09/2026

Fator 1 - Clima e safra nos EUA (peso Alto)
  - Lavoura em condição boa + excelente: 57% (44% + 13%)
    Fonte: USDA Crop Progress | referência: semana até 20/09/2026 | publicado: 21/09/2026
  - Saúde da vegetação (VHI) sobre o milho dos EUA: 48,8 (escala 0 a 100)
    Fonte: NOAA STAR | referência: semana até 23/09/2026 | publicado: 24/09/2026 (estimado)
Fator 2 - Safrinha brasileira (peso Alto)
  - Produção da 2ª safra 2025/26: 112.130,8 mil t; revisão: +1.099,9 mil t (+1,0%)
    Fonte: Conab, 12º levantamento | publicado: 15/09/2026
Fator 3 - Estoques e balanço, WASDE (peso Alto)
  - Estoque/uso dos EUA 2026/27: 9,7% (edição anterior: 10,1%; revisão: -0,4 p.p.)
  - Estoque/uso do mundo 2026/27: 20,6%
    Fonte: USDA WASDE | publicado: 11/09/2026
Fator 4 - Dólar e paridade de exportação (peso Médio)
  - Dólar PTAX de venda: R$ 5,1991 | Fonte: BCB | referência: 25/09/2026
  - Paridade de exportação: SEM DADO
Fator 5 - Etanol (peso Médio)
  - Produção: 1.028 mil barris/dia; estoques: 24.683 mil barris
    Fonte: EIA | referência: semana até 18/09/2026 | publicado: 23/09/2026 (estimado)
Fator 6 - Custo de insumos (peso Médio)
  - Fertilizantes: 20,9% do custo de produção; -2,4% contra julho (só Mato Grosso)
    Fonte: IMEA | referência: ago/2026 | publicado: 15/09/2026
Fator 7 - Posicionamento de fundos, COT (peso Médio)
  - Posição líquida dos fundos: +414.460 contratos (22,5% dos contratos em aberto)
    Fonte: CFTC | referência: 15/09/2026 | publicado: 18/09/2026
Fator 8 - Política comercial (peso Médio)
  - Exportação total do Brasil: 4,65 milhões de t em ago/2026 | Fonte: Comex Stat
  - Exportação por destino (China): SEM DADO | Tarifas: SEM DADO

[3. LEITURA DO MOTOR — camadas B e C, aplicadas em código pelas regras do Comitê]
Versão das regras: <a definir pelo Comitê>
  Fator 1 a 8, leitura de cada um:  <resultado da regra do Comitê, com o id e a versão da regra>
  Peso de cada fator:               Alto ou Médio, da planilha do Comitê
  Orientação para combinar:         <se o Comitê quiser dar uma; senão, a IA pondera pelos pesos>
Hoje nenhuma regra está definida: todos os fatores estão "sem leitura definida".

[4. COMO ANALISAR]
  - Comece pelos fatores de peso Alto; os de peso Médio confirmam ou enfraquecem a tese.
  - Onde o bloco 3 tem leitura, ela vale para aquele fator: use-a e cite a regra; não a contradiga.
  - Onde não tem, você pode interpretar a medida, mas marque "sem regra do Comitê" e reduza a confiança.
  - Para cada horizonte, pese os fatores a favor e contra e chegue a UMA ação, SEMPRE comparada ao
    preço do vencimento daquele prazo: diga se os fatores já parecem refletidos nesse preço.
  - Use a variação recente do preço: um preço que já subiu com os mesmos fatores pode já tê-los
    incorporado.
  - Vencimento com poucos negócios não é referência confiável: diga isso e reduza a confiança.
  - Só recomende COMPRAR se o ganho que os fatores sugerem no horizonte compensar o risco, comparado a
    deixar o dinheiro rendendo a Selic no mesmo período. Se não compensar, a recomendação é ficar de fora.
  - Seja crítico: diga o argumento mais forte CONTRA a sua recomendação e a condição objetiva que a
    invalidaria. Aponte dado velho, estimado ou ausente que enfraqueça a análise.
  - Seja direto e objetivo: a recomendação vem primeiro; frases curtas; nada de "depende" sem dizer do quê.
  - Se os fatores de peso Alto estiverem sem dado, ou se os fatores se anularem, responda INSUFICIENTE
    naquele horizonte. É uma resposta válida, não uma falha.

[5. LIMITES]
  - Use só o que está na BASE e no bloco 3: nenhum número, preço ou notícia de fora, nem da sua memória.
  - Todo argumento cita o número e a fonte da BASE.
  - Onde a BASE diz SEM DADO, trate como sem dado; nunca estime.
  - Em cada horizonte, cite o vencimento e o preço de referência usados. Não invente preço-alvo.
  - Sua resposta é uma recomendação para uma pessoa decidir; nenhuma ordem é executada a partir dela.

[6. FORMATO DA RESPOSTA — JSON]
{
  "dataAnalise": "2026-09-26",
  "versaoRegras": "...",
  "recomendacoes": [
    { "horizonte": "curto",
      "precoReferencia": { "vencimento": "nov/2026", "ajuste": "75,52" },
      "acao": "MANTER | COMPRAR | VENDER | INSUFICIENTE",
      "confianca": "alta | media | baixa",
      "tese": "no máximo duas frases",
      "fatoresAFavor": [ { "fator": "<n>", "argumento": "...", "numerosCitados": ["..."] } ],
      "fatoresContra": [ { "fator": "<n>", "argumento": "...", "numerosCitados": ["..."] } ],
      "argumentoMaisForteContra": "...",
      "invalidaSe": "condição objetiva que derruba a tese",
      "semRegraDoComite": [1, 4, 5, 6, 7, 8] },
    { "horizonte": "medio", ... },
    { "horizonte": "longo", ... }
  ],
  "lacunas": ["paridade", "exportação por destino", "tarifas", "contratos em aberto do CCM"]
}
```

**O que o exemplo mostra, e os cuidados:**

- **A recomendação é tão boa quanto a base.** Hoje, com o bloco 3 vazio, a IA interpretaria os oito fatores
  sozinha: a resposta certa seria confiança baixa ou INSUFICIENTE. Cada regra definida pelo Comitê troca uma
  interpretação da IA por uma leitura com critério, e cada fonte nova troca um SEM DADO por um número.
- **Por que o motor, e não a IA, faz A, B e C.** Em código, a mesma entrada dá sempre a mesma leitura (a IA pode
  variar de uma chamada para outra), e cada regra pode ser testada no histórico (backtest) sem IA nenhuma. A IA fica
  com o que só ela faz bem: pesar fatores que apontam para lados diferentes e explicar por quê.
- **A base é do motor, não da IA.** Todo número vem do banco, com fonte e data de publicação, e nada publicado depois
  da data da análise entra (point-in-time). Os dados têm datas diferentes (COT de 15/09, WASDE de 11/09, Crop
  Progress de 20/09), e o prompt mostra isso.
- **O que falta aparece como falta.** Paridade, exportação por destino e tarifas entram como SEM DADO, e a IA é
  proibida de estimar.
- **A resposta é conferível.** Com o formato fixo, dá para checar automaticamente se todo número citado existe na
  base e se cada ação tem tese, contraponto e condição de invalidação. O prompt é versionado como um fator: modelo,
  versão e hash registrados em cada execução (ADR 0010).
- **Medir antes de confiar.** Cada recomendação fica registrada e é comparada depois com o que o preço fez, contra
  referências simples (manter sempre, neutro, aleatório; ADR 0010). No histórico, o modelo pode "lembrar" o preço que
  veio depois: o teste precisa esconder o ativo e as datas.
- **O preço é o dado principal.** Os fatores dizem para onde o mercado *deveria* ir; o preço diz o que ele *já*
  acredita. Por isso a recomendação é sempre relativa ao preço do vencimento de cada horizonte (a curva do CCM), com
  o Indicador ESALQ/B3 como preço de hoje. Sem o preço, a IA recomendaria sobre uma notícia talvez já precificada.
- **O longo prazo pode não ter preço confiável.** Os vencimentos distantes têm poucos negócios (nov/2027: 78), e os
  contratos em aberto, a melhor medida de liquidez, só existem até dez/2025 (vinham do Boletim Diário, ADR 0020).
  Quais vencimentos valem para cada horizonte, e quais medidas de preço entram (as variações de 1, 3 e 12 meses são
  um exemplo), é decisão do Comitê: item 7 abaixo.
- **O CCM não substitui Chicago como explicação.** WASDE, COT e Crop Progress movem primeiro o preço de Chicago (ZC,
  pago): sem ele, a IA vê a causa, mas não quanto Chicago já reagiu (pergunta 2 da §4).
- **No ouro, a curva não entra.** O futuro do ouro é o preço à vista mais os juros e não traz expectativa de
  mercado. O prompt do ouro levaria o LBMA (já coletado), em US$ e em R$ (com a PTAX), e o histórico recente.
- **É uma ilustração, não uma estratégia.** O que se propõe é a estrutura em 6 blocos, não a redação das frases, e
  os horizontes são do Comitê. **Nenhuma resposta de IA foi gerada**, de propósito: seria uma recomendação sem regra
  validada.

</details>

### O que queremos confirmar

1. **As medidas acima** são as que o Comitê tem em mente para cada fator? (linha a linha)
2. **COT:** managed money (relatório desagregado, o que coletamos) ou não comerciais (relatório legado)? Em contratos
   ou em % dos contratos em aberto?
3. **WASDE:** estoque/uso dos EUA, do mundo ou os dois? A revisão de uma edição para a outra conta como informação?
4. **Safrinha:** vale o nível da produção, a revisão ou os dois? Só Brasil (Conab) ou também Mato Grosso (IMEA)?
5. **Clima:** % boa + excelente basta, ou o VHI da NOAA entra junto (e de quais regiões)?
6. **Insumos:** o custo do IMEA (só MT) atende, ou é preciso o preço de fertilizante e diesel? Nesse caso, de qual
   fonte?
7. **Preço e instrumento da recomendação.** "Comprar, vender ou manter" *o quê*, e para quem?
   - **Instrumento:** o que se opera de fato? No milho, o CCM na B3 (com margem e rolagem)? No ouro, um ETF, o ouro
     físico ou o GC? O preço de referência é o do instrumento operado.
   - **Preço por horizonte:** quais vencimentos do CCM correspondem a curto, médio e longo prazo, e qual a liquidez
     mínima para um vencimento valer como referência?
   - **Medidas de preço:** além do preço, o que entra (variação em 1, 3 e 12 meses? outra medida)?
   - **Posição atual:** "manter" supõe uma posição. A IA recebe a posição atual, ou recomenda só "comprado, vendido
     ou fora"?
   - **Perfil:** para quem investe, vender o futuro é apostar na queda; para um produtor, é proteção (hedge). Qual é
     o nosso caso?

### Por onde começamos (se o Comitê confirmar)

1. **COT (fator 7):** o cálculo mais simples e mais usado do mercado, dados completos desde 2006 e **um cálculo só
   para milho e ouro** (e depois café e petróleo: os 4 ativos da planilha têm um fator de COT). Como segundo fator do
   sistema, é também quando o molde do juro real vira um padrão para todos.
2. **Estoque/uso do WASDE (fator 3):** peso Alto, indicador nomeado na planilha e o nosso melhor dado point-in-time
   (revisões desde 2011).
3. **% boa + excelente do Crop Progress (fator 1):** peso Alto, cálculo trivial, desde 1980.

Com esses três, somados aos fatores que usam o dado como publicado (dólar e etanol), **5 dos 8 fatores do milho**
ficam com medida. Os outros três dependem de fonte nova ou de resposta do Comitê.

### Aprendizagem no nosso desenho

No nosso desenho, a **aprendizagem** do motor pode acontecer em **três dimensões**, sempre com uma pessoa decidindo
e com versão registrada:

| # | Dimensão | Como funciona | Depende de |
|---|---|---|---|
| 1 | **Memória com avaliação** | Cada leitura do motor fica registrada e nunca é apagada (data da análise, base, versão das regras, versão do prompt, recomendação da IA). Depois, é comparada com o que o preço fez. É a base das outras duas: sem registro, não há o que avaliar | O Comitê definir o que é acerto (horizonte e métrica): "Avaliação da saída da IA", §4 |
| 2 | **Aprendizado governado** | Com a avaliação, o Comitê revisa as regras das camadas B e C (direção, pesos, limiares): a versão 1 vira a versão 2. A versão nova só entra depois de testada no histórico, e cada leitura guarda a versão que usou | Histórico de preço para testar (perguntas 2 e 3) |
| 3 | **Calibração estatística** | O sistema **sugere** pesos e limiares a partir do histórico (fatores contra preço), e o Comitê aprova ou não. Uma sugestão aprovada vira uma versão nova, como na dimensão 2 | Histórico longo de preço e de revisões (perguntas 2, 3 e 5) |

**As regras B e C podem, sim, ser ajustadas ao longo do tempo para melhorar o desempenho** (dimensão 2), com quatro
condições:

- **Toda mudança vira uma versão nova**, nunca uma edição silenciosa. As leituras passadas continuam ligadas à versão
  que usaram.
- **Testada num período que não foi usado para ajustá-la.** Senão, a regra decora o passado e falha no futuro.
- **Contar as tentativas.** Quanto mais versões testadas, maior a chance de uma parecer boa por acaso (o mesmo cuidado
  do ADR 0010 com as versões de prompt).
- **A decisão de adotar é do Comitê.**

**Fica fora do desenho:** o modelo de IA não aprende com o uso. Nada de ajuste fino do modelo, de a IA receber as
próprias análises antigas para "lembrar", nem de pesos que se ajustam sozinhos: tudo isso mudaria o comportamento sem
versão e sem auditoria.

</details>

<details>
<summary>5b. Confirmar entendimento — Motor do Ouro</summary>

**Para o Comitê confirmar (etapa 2 dos "Próximos passos").** O mesmo exercício da §5 do milho, para os **8 fatores do
ouro** da planilha `controle_fatores.xlsx` (aba "Controle de Fatores"): nome, peso e fonte vêm da planilha, e propomos
a coluna "Resumo (cálculo)", que está vazia. O motor é o mesmo (camadas A, B e C, e a IA no fim), descrito na §5; aqui
só a camada A. Os exemplos usam **números reais do banco** (dev, dados publicados até 2026-09-30). **Nenhum número da
tabela diz se o preço sobe ou desce:** é só a medida de cada fator.

**A diferença para o milho é a origem das lacunas.** No milho, quase todo fator tem dado oficial com data de
publicação. No ouro, os fatores macroeconômicos estão prontos (o juro real já é um fator versionado) e os
fundamentalistas dependem de fontes que **ainda não foram reconhecidas** (FMI, World Gold Council, USGS) ou que não
existem de graça (o DXY). Nenhuma fonte nova entra sem autorização: a tabela só aponta qual seria a candidata.

### Os 8 fatores do ouro

Dificuldade: 🟢 **fácil** (dado já coletado, cálculo de uma linha) · 🟡 **médio** (dado parcial, substituto ou série
nova numa fonte que já usamos) · 🔴 **difícil** (falta a fonte, ou o fator não é um número).

| # | Fator (peso) | Resumo do cálculo | Exemplo com dado real | Dificuldade |
|---|---|---|---|---|
| 1 | Juros reais (Fed) e rendimento dos títulos (Alto) | **Juro real de 10 anos** dos EUA (`DFII10`, rendimento do título protegido da inflação), como publicado, e a variação em 1 e 12 meses. Complemento: **juro nominal de 10 anos** (`DGS10`). O FOMC (meta do Fed) é série nova na mesma API do FRED, não coletada | 25/09/2026: real **2,83%** (+0,41 p.p. em 1 mês; +1,01 p.p. em 12 meses); nominal **5,17%** | 🟢 Já é o fator versionado `juro-real-10a` (validação cruzada `DGS10 − T10YIE` em 5.932 de 5.932 datas) |
| 2 | Dólar, índice DXY (Alto) | **Índice amplo do dólar do Fed** (`DTWEXBGS`, 26 moedas) **no lugar do DXY** (ICE, 6 moedas, licenciado), e a variação em 1 e 12 meses | 25/09/2026: **120,33** (+1,3% em 1 mês; −0,1% em 12 meses) | 🟡 Substituto, com outra composição e outro peso por moeda. A fonte da planilha ("US Treasury, World Bank") não publica o DXY (ADR 0009) |
| 3 | Inflação e expectativas inflacionárias (Alto) | **Inflação implícita de 10 anos** (`T10YIE`, breakeven), como publicada. **CPI dos EUA**: variação em 12 meses, série nova na mesma API do FRED, não coletada | 28/09/2026: breakeven **2,34%** (2,31% um mês antes). CPI: não coletado | 🟡 Breakeven pronto; o CPI é uma série a mais no coletor do FRED, mas é fonte nova (autorização) e revisa (ALFRED, ADR 0011) |
| 4 | Geopolítica e risco sistêmico (Alto) | **Eventos** (conflitos, sanções, crises), registrados de boletins oficiais com data, como os eventos de tarifa do milho (pergunta 12). Se o Comitê quiser um número: um **índice de risco** pronto, ainda não reconhecido | Nenhum dado | 🔴 Não é um número. A busca de eventos não existe; o "índice de risco" da planilha não diz qual índice |
| 5 | Demanda de bancos centrais, reservas (Alto) | **Compra líquida de ouro pelos bancos centrais**, em toneladas, por mês (estoque de ouro de cada banco central, mês contra mês). Candidata: estatística de reservas do FMI (SDMX), que a planilha lista no calendário, não reconhecida | Só as **reservas totais do Brasil** (não é ouro): US$ 362.548 milhões em 28/09/2026 (−3,2% em 1 mês) | 🔴 Falta a fonte. As reservas totais do BCB mudam com o câmbio e o preço dos ativos, não medem compra de ouro |
| 6 | Fluxo de ETFs de ouro (Médio) | **Toneladas de ouro guardadas pelos ETFs** e a variação na semana e no mês (entrada ou saída) | Nenhum dado | 🔴 O World Gold Council não tem API. Candidata a reconhecer: o estoque diário publicado por um grande ETF de ouro |
| 7 | Posicionamento de fundos, COT (Médio) | **Posição líquida dos fundos** = managed money comprado − vendido, em contratos e em % dos contratos em aberto (CFTC, ouro da COMEX): **o mesmo cálculo do milho** | Semana até 22/09/2026 (publicada em 25/09): 135.699 − 8.310 = **127.389 contratos**, **30,9%** de 412.800 (na semana anterior: 133.116, 32,5%) | 🟢 Desde 2006; uma função para milho, ouro e café |
| 8 | Produção e oferta de mineração (Baixo) | **Produção mundial de ouro das minas**, em toneladas por ano, e a variação contra o ano anterior (USGS) | Nenhum dado | 🔴 Fonte não reconhecida; anual e com mais de um ano de atraso. **Ignorada no MVP** (peso Baixo, decisão da auditoria de 2026-09-22) |

**Preço do ouro (a referência da recomendação).** O LBMA Gold Price PM (já coletado, desde 1968), em US$ e em R$ (com a
PTAX do mesmo dia). Em 28/09/2026: **US$ 4.144,55 a onça** (−9,2% em 1 mês; +1,8% em 3 meses; +9,9% em 12 meses) e
**R$ 21.606** (PTAX 5,2132; +7,2% em 12 meses). Sem curva de vencimentos: o futuro do ouro é o preço à vista mais os
juros (§5, "O que o exemplo mostra"). A licença da IBA ainda vale antes de exibir a terceiros (informe 6 da §4).

**Resumo:** 2 fatores com medida pronta (juros reais e COT), 2 com substituto ou série a acrescentar numa fonte que já
usamos (dólar e inflação) e 4 sem dado (geopolítica, bancos centrais, ETFs e mineração). Somando os pesos: dos **5
fatores de peso Alto**, 1 está pronto, 2 estão parciais e **2 não têm fonte** (geopolítica e bancos centrais). Cobertura
completa da matéria-prima: `docs/cobertura-fatores-fel1-milho-ouro.md`, §3.

### O que queremos confirmar

1. **As medidas acima** são as que o Comitê tem em mente para cada fator? (linha a linha)
2. **Juros:** o juro real de 10 anos basta, ou a meta do Fed (FOMC, oito reuniões por ano) entra também?
3. **Dólar:** o índice amplo do Fed serve no lugar do DXY? O DXY só existe pago (ICE).
4. **Inflação:** o breakeven basta, ou o CPI observado entra também? O **Focus** (IPCA, Selic e câmbio, já coletado) e
   as **reservas do BCB**, que a planilha liga ao ouro ("Relatório Focus e Reservas"), entram em qual fator, ou só no
   ouro em reais?
5. **Geopolítica:** evento registrado (como as tarifas do milho), um índice de risco pronto (qual?), ou os dois?
6. **Bancos centrais:** a compra de ouro do mundo inteiro (FMI ou World Gold Council) ou só a do Brasil?
7. **ETFs:** o estoque de um grande ETF serve de medida, ou é preciso o total do World Gold Council (sem API)?
8. **Preço e instrumento:** as mesmas perguntas do item 7 da §5 do milho, para o ouro. Em especial: o ouro em **US$ ou
   em R$**? E o que se opera de fato (ETF de ouro na B3, ouro físico ou o futuro GC, que é pago, pergunta 3)?

### Por onde começamos (se o Comitê confirmar)

1. **COT (fator 7):** a mesma função do milho; fazê-la para os dois de uma vez é o que transforma o molde do juro real
   num padrão do sistema.
2. **Juros reais (fator 1):** já pronto; falta só ligá-lo à base do motor.
3. **Dólar (fator 2), pelo índice amplo do Fed**, se o item 3 for aprovado.

Com esses três, **3 dos 8 fatores do ouro** ficam com medida, 2 deles de peso Alto. Os próximos dependem de
autorização para uma série nova numa fonte que já usamos (CPI e meta do Fed, no FRED) ou de reconhecer uma fonte nova
(FMI, ETFs).

</details>

<details>
<summary>6. Fora do escopo por enquanto</summary>

Não implementar sem autorização explícita registrada em ADR:

- Petróleo e qualquer ativo além de USD/BRL, Selic, ouro, milho e café. Do café, só o que a onda do café (§3) autorizar, fonte a fonte, no ADR de cada uma (passo 1: ADR 0028).
- CEPEA antes de 2018-06-08 (só por exportação manual do site), Conab (séries históricas e preços), PSD do milho, FAO/AMIS. (IMEA andamento, WGC e CPI foram implementados em 2026-10-01: ADRs 0039, 0037 e 0033.)
- Clima além da NOAA STAR por cultura (milho e café): as fontes de clima do FEL 1 (NASA POWER, INMET, CPTEC/INPE, ERA5), USDA Ag in Drought, FAO ASIS, ONI, previsão do tempo e risco de geada.
- Focus além das expectativas anuais de IPCA, Selic e câmbio (PIB e demais indicadores, mensais/trimestrais, Selic por reunião, inflação 12/24 meses, Top 5), fatores sobre o Focus (surpresa, variação, dispersão); das reservas do BCB, o conceito liquidez, a série mensal e a composição (ouro).
- Série contínua de futuros, rolagem e backtest.
- Qualquer sinal, limiar, indicador técnico ou regra de compra/venda.
- Implementar a IA (o papel dela já está decidido, §5; o ADR 0010 é o desenho do experimento): só depois das regras e
  dos critérios de avaliação do Comitê.
- Execução automática de ordens e corretora.

</details>

<details>
<summary>7. Entregas realizadas</summary>

Registro histórico, recolhido para não ocupar espaço: clique para expandir.

<details>
<summary>Entregas de 2026-10-01</summary>

| Entrega | Resultado | Onde |
|---|---|---|
| Ouro: CPI, meta do Fed e moedas da cesta do DXY | Três fontes do FEL 1 que faltavam ao ouro, todas no FRED (só aquisição de dados, autorizado pelo usuário em 2026-10-01). O CPI vem do ALFRED, com todas as versões e a data real de cada uma (949 de 949 datas iguais ao calendário do BLS; 7.834 linhas, 4.681 revisões, desde 1913). A meta do Fed, desde 1982, e as 6 moedas do DXY mais o índice do dólar contra as economias avançadas entram no coletor do FRED. 0 falhas, reexecução idempotente, em dev. O DXY não é remontado: é um cálculo, a decidir pelo David. Três cards novos; "Índice amplo do dólar" virou "Índices do dólar (Fed)" | ADR 0033 |
| Fontes fundamentais que faltam | Lista do que falta no milho e no ouro, em 3 blocos, no "Falta fazer" (§3) | §3 |
| Milho: exportação por destino | A exportação de milho por país de destino, pela mesma API do Comex Stat, com o país pelo código da tabela oficial (281 países). A soma dos países é igual ao total em 48 de 48 valores. Card com seletor de países, a China em destaque. Carga em dev | ADR 0034 |
| Milho: andamento da semeadura e da colheita (IMEA) | O % acumulado da área semeada e colhida em MT e nas 7 regiões do IMEA, semana a semana, dos 26 informes do catálogo (semeadura desde 2012/13, colheita desde 2015/16), lidos por coordenada do PDF em 4 layouts. A colheita 2014/15 foi recusada (cabeçalho defeituoso na fonte). Achado e corrigido antes do commit: a comparação com a safra anterior entrava como semana | ADR 0039 |
| Café: resumo diário das exportações (Cecafé) | Passo 4 da onda do café: MAPA e Embrapa só republicam (não implementar); o Cecafé tem o resumo diário dos certificados de origem, despachos e embarques, por porto e com arábica e conilon separados. Coletor novo grava o acumulado do mês com a data da fonte, e cada dia vira uma versão. Três cards. **A onda do café está completa (passos 1 a 4)** | ADR 0038 |
| Ouro: ETFs e oferta e demanda (World Gold Council) | O ouro em ETFs por região, semanal desde 2003 (a única fonte gratuita do total mundial), e o balanço trimestral de oferta e demanda desde 2010 (bancos centrais com o não declarado, ETFs, minas), pela API interna do Goldhub. **Licença só pessoal e não comercial: uso interno, risco aceito pelo usuário**, explicado nos cards; permissão ao WGC antes de uso comercial | ADR 0037 |
| Ouro: bancos centrais (FMI) | O ouro nas reservas de 88 países, mensal desde 1999, pela API SDMX nova do FMI (sem chave), na escala que a fonte declara. Conferência de unidade pelo preço implícito: achou o volume do Brasil 1.000× maior desde mar/2026, o de Angola idem e o do Chile em quilos, gravados como publicados e marcados. Licença: uso livre com citação; a restrição a download em massa automatizado foi aceita como risco pelo usuário (uma consulta por dia à API pública). Dois erros achados na validação e corrigidos antes do commit (estouro da coluna e arredondamento) | ADR 0036 |
| Milho: Grain Stocks e etanol do WASDE | Estoques trimestrais de milho dos EUA (1º de mar, jun, set e dez, por posição) pelo ESMIS, com o número original de cada edição desde 2001 (102 edições, 3 layouts, 588 linhas, 267 revisões): a API do QuickStats só tem o revisado. Achado e corrigido um defeito da fonte (o sorgo com valores na linha do título, em mar/2010), com trava e teste. O milho usado para etanol entrou no leitor do WASDE em 2 séries, porque o rótulo mudou em abr/2011 (conferido nas 187 edições). Frequência nova, trimestral, no gráfico | ADR 0035 |

</details>

<details>
<summary>Entregas de 2026-09-28</summary>

| Entrega | Resultado | Onde |
|---|---|---|
| Café, passo 3: estoques certificados da ICE | Coletor novo do relatório diário da ICE (um XLS por pregão desde 2016-01-04): sacas certificadas por origem e total, com data de publicação real (`Last-Modified`); contido de propósito (20 s entre pedidos, recuo no 429, só os dias que faltam), porque os termos de uso da ICE excluem robôs (risco aceito pelo usuário); card "Café - estoques certificados da ICE". Backfill completo rodado no servidor (desde 2016-01-04, concluído em 2026-09-30) | ADR 0032 |
| Café, passo 3: PSD e países na NOAA | Reconhecidas PSD do café, *Coffee: World Markets and Trade*, estoques certificados da ICE e ICO (`docs/reconhecimento-fontes/cafe-mercado-mundial.md`). Coletor novo da PSD do café pelo CSV público: 94 países, safras desde 1960, 7 atributos, sem vintage histórico (achado: as safras até 2003 não trazem o mês de revisão); card "Café - balanço por país (USDA PSD)". Pela produção da PSD, 7 países na NOAA café, um tipo por país (achado: fora do Brasil as máscaras diferem, exceto na Índia; a Etiópia não tem máscara de robusta) | ADR 0031 |
| Café, passo 2: Conab | Coletor novo do Boletim da Safra de Café: 15 levantamentos desde jan/2023, com revisões e data real de publicação (conferida com a planilha), produção, área e produtividade por região, UF e sub-região, em total, arábica e conilon; card "Café - safra por região e UF (Conab)". Define as regiões do clima do café. Backfill rodado no servidor no mesmo dia (0 falhas) | ADR 0029 |
| Café, passo 2: clima | NOAA STAR sobre a área do café, desde 1982, em 12 regiões (Brasil e as 5 maiores UFs da Conab; mundo e hemisférios em arábica e robusta). Achado: no Brasil a NOAA não separa arábica de conilon, então as UFs têm uma série só (opção escolhida pelo usuário); card "Clima sobre o café - saúde da vegetação (NOAA)". Backfill rodado no servidor no mesmo dia (0 falhas) | ADR 0030 |
| Café, passo 1 | A onda do café começou pelas fontes que reaproveitam coletores do milho: COT do Coffee C (1.059 semanas desde 2006), exportação de café verde pelo Comex Stat (356 meses desde 1997) e futuro ICF da B3 por vencimento (943 pregões desde 2022-03-21, 0 divergências entre as duas fontes da B3). 5 cards novos. Os coletores da B3 e do Comex viraram genéricos por produto, sem mudar nada do milho. Backfills rodados no servidor no mesmo dia, com os mesmos números de dev | ADR 0028 |
| Conferência das fontes do FEL 1 (milho e ouro) | Auditoria de cobertura revisada com os números de hoje; reconhecidas as fontes do FEL 1 que não tinham registro: World Bank Pink Sheet e US Treasury (nada novo para o ouro), Grain Stocks (vintage pelo ESMIS; aguarda o Comitê) | `docs/cobertura-fatores-fel1-milho-ouro.md`, `docs/reconhecimento-fontes/` |
| Área plantada de milho dos EUA | Coletor novo (Prospective Plantings e Acreage, pelo ESMIS): 51 edições desde 2001, vintage real, 0 falhas; card "Milho EUA - Área plantada (USDA)". Antecipa em ~6 semanas a intenção de plantio que o WASDE só traz em maio. Backfill rodado no servidor no mesmo dia (0 falhas) | ADR 0027 |
| Documentos abertos no status | As menções a ADRs e documentos no status (119 links, 40 documentos) abrem o documento num modal da mesma tela, com link compartilhável (`?doc=adr-0027`), navegação entre documentos com "voltar" e tela cheia no celular. Um teste barra link quebrado. A tabela de execuções ganhou a coluna "Atualizados" | `CLAUDE.md`, "Status do projeto" |
| Documento de pendências do David aposentado | O antigo documento de pendências do David repetia o que já estava no status (o que falta decidir) e nos ADRs (a autorização de cada fonte), desatualizado e com seis "exceções pontuais" que davam a impressão de regra furada. Agora o que falta decidir está só aqui, no §4 ("O que o David e o Comitê ainda definem"); o arquivo virou um aviso apontando para cá. Nenhuma decisão mudou; um teste impede o status de voltar a citá-lo | §4, `CLAUDE.md` |
| Avisos da fonte nas execuções | Defeito conhecido da fonte, tratado de propósito pelo coletor, deixa de ser falha: vira **aviso**, mostrado no detalhe da execução. Primeiro caso: as duas colunas "2025/26" de Tangará da Serra no custo do IMEA (uma é a 2024/25 com o rótulo errado; nenhuma é gravada). O `imea-custo-milho` sai de "Parcial" para "Sucesso" | ADR 0002, ADR 0018 |

</details>

<details>
<summary>Entregas de 2026-09-26</summary>

| Entrega | Resultado | Onde |
|---|---|---|
| VM de produção nova | FinMind saiu da VM x86 de 1 GB (dividida com AgroMind, Personal e Portal; ~920 MB em swap) para a `servidor02` (Ampere A1 arm64, 2 OCPU / 12 GB, Always Free). HTTPS em `finmind.weslab.com.br` (Nginx Proxy Manager), frontend só em `127.0.0.1`, cron da coleta movido, Portainer vendo as duas VMs | `docs/architecture.md` § "Deploy" |
| MariaDB → PostgreSQL | Postgres 16 compartilhado (repositório `servidor02-infra`, database e usuário por app, sem porta no host). Schema recomeçado por uma migration de linha de base; dados **copiados** (341.807 observações em 10.859 séries, conferência por contagem e soma de cada série). Paridade nos bancos de dev: conteúdo idêntico em listagem, 26 detalhes, 6.296 históricos, CSV, execuções e `asOf` de todas as séries (1.556.697 linhas); a bateria levou ~6 min no Postgres e ~1h51 no MariaDB. O MariaDB saiu do código, dos composes e do CI | ADR 0026 |
| Correções achadas na paridade | Booleano tratado como número no SQL do `asOf` estrito e do resumo das séries (quebraria no Postgres); ordenações sem desempate (histórico por valor, execuções), que podiam repetir ou pular linhas entre páginas | ADR 0026, § "Resultado da paridade" |
| Cards com seletor lentos | O detalhe do NOAA levava ~20 s e estourava o timeout ("Não foi possível carregar o observável"): `GROUP BY` por expressão sem índice, chamado duas vezes. Agrupado por `series_code`: NOAA 5,3 s → 0,2 s, CCM 1,4 s → 0,12 s, Focus 1,0 s → 0,07 s, mesmo conteúdo | `observation.repository.js::listarItens` |
| Backups | Diário: `pg_dump` por database, conferido, 7 diários + 4 semanais em `/opt/backups/postgres` (cron 10:00 UTC). Semanal: backup do disco das duas VMs pela Oracle, dentro da cota gratuita | `servidor02-infra`, ADR 0026 |
| Pendências de infraestrutura fechadas | Cópia diária dos dumps para o Object Storage da Oracle (bucket privado `backups-servidor02`, `rclone copy`, regra do bucket apaga após 35 dias). MariaDB apagado da `servidor02` (volume e imagem) e FinMind desligado na VM antiga (containers, volumes, imagens, cron e pasta) | `servidor02-infra` |
| CI em ARM nativo | Build das imagens num runner `ubuntu-24.04-arm`, só `linux/arm64`: o QEMU num runner x86 travava no `npm ci` | `.github/workflows/deploy.yml` |
| "Executar coleta agora" sem erro falso | A API esperava a coleta inteira (~3 min) e a tela desistia em 20 s, mostrando erro com a coleta rodando normalmente. Agora responde 202 na hora, roda em segundo plano, recusa (409) um segundo pedido durante a coleta, e a tela se atualiza sozinha até terminar. Primeira coleta manual no PostgreSQL de produção: 22 de 23 coletores em sucesso, sem novos (idempotente); o `imea-custo-milho` segue parcial pelos 2 registros já conhecidos | ADR 0004, "Atualização (2026-09-26)" |

</details>

<details>
<summary>Entregas de 2026-09-24</summary>

Registro do que foi fechado na lista "Falta fazer" anterior (detalhe nos documentos apontados):

| Entrega | Resultado | Onde |
|---|---|---|
| Clima do milho — NOAA STAR, saúde da vegetação por cultura | O item "Clima" do FEL 1 (§6.5.1) foi reformulado pelo usuário: o que importa é **quanto o clima afeta o milho e o café**, não se vai chover. As cinco fontes do relatório (NOAA genérica, INMET, NASA POWER, CPTEC/INPE, ERA5) entregam tempo, não esse efeito: ficaram **inadequadas**. O indicador pronto é o **VHI da NOAA STAR, medido só sobre a área da cultura**, por país e estado, desde 1982. Coletor `noaa-vh-milho` (fábrica por cultura, o café entra como configuração) na coleta diária + `npm run backfill:noaa-vh`. **122.904 observações** (18 regiões, com mundo e hemisférios Norte e Sul, × VHI/VCI/TCI × 2.276 semanas) em dev, 0 falhas; reexecução idempotente; valores iguais à página; secas de 2012 (EUA) e 2021 (MT) visíveis. Card "Clima sobre o milho - saúde da vegetação (NOAA)". USDA Ag in Drought, FAO ASIS e ONI reconhecidas e não implementadas | ADR 0025, `docs/reconhecimento-fontes/clima.md` |
| Sessão: servidor lento não desloga mais | Achado real durante o backfill da NOAA no servidor: ao abrir ou recarregar a página, qualquer erro do `/auth/me` (timeout de 20 s, 500, 502 durante o deploy) era tratado como "não logado" e levava ao login, com a sessão ainda válida. Agora só um **401** desloga; os demais erros tentam de novo (1, 3 e 5 s) e, se persistirem, a tela "Servidor indisponível" oferece "Tentar novamente", voltando à página pedida | `frontend/src/utils/sessao.js` |
| COT: sem falso "Atrasada" | A posição de terça sai na sexta seguinte e entra na coleta de sábado: o ponto mais recente fica até 11 dias sem sucessor (14 em semana de feriado). A tolerância do card era 10 dias e o marcava "Atrasada" toda quinta e sexta; passou a 15 | `observaveis.service.js` |

</details>

<details>
<summary>Entregas de 2026-09-23</summary>

Registro do que foi fechado na lista "Falta fazer" anterior (detalhe nos documentos apontados):

| Entrega | Resultado | Onde |
|---|---|---|
| EIA — etanol dos EUA | Fator do milho "Demanda de etanol e biocombustível" do FEL 1 ("EIA, USDA: produção de etanol, estoques"), que a auditoria de 22/09 registrava sem nenhuma fonte; pedido pelo usuário em 2026-09-23. A API da EIA exige chave; o mesmo dado sai sem chave na planilha histórica de cada série. Coletor `eia-etanol` na coleta diária (baixa as duas séries inteiras: a 1ª execução é a carga histórica). **1.702 observações, 2010-06-04 a 2026-09-18**; 8 de 8 valores iguais à tabela oficial do WPSR; publicação estimada pelo calendário oficial de feriados da EIA ou pela regra (quarta, quinta com feriado), que bate com 13 de 14 exceções oficiais; 0 duplicatas; reexecução idempotente. Card "Etanol EUA - produção e estoques (EIA)" | ADR 0024 |
| BCB — reservas internacionais | A outra metade da linha "Relatório Focus e Reservas (BCB)" do FEL 1 ("reservas internacionais brasileiras"), pedida pelo usuário em 2026-09-23. Série **13621 do SGS** (o total, diária), em `observation`: a mensal oficial é o fim de mês dela, e o conceito liquidez é outra variante (não coletados). Coletor `bcb-reservas-internacionais` na coleta diária + `npm run backfill:bcb-reservas` (3 janelas de 10 anos, uma execução). **7.046 observações de 1998-09-01 a 2026-09-22** em dev; publicação estimada pelo dia útil seguinte da própria série; 0 duplicatas; reexecução idempotente; `asOf()` validado (feriado de 07/09); fim de mês igual à mensal oficial em 330 de 336 meses. Card "Reservas internacionais (BCB)" | ADR 0023 |
| BCB Focus — expectativas de IPCA, Selic e câmbio | Escopo estrito do FEL 1 ("Focus impacta Selic, IPCA e BRL", ouro), **autorizado pelo usuário em 2026-09-23**. Coletor `bcb-focus` na coleta diária (últimas 5 semanas) + `npm run backfill:bcb-focus` (série inteira, ~6 s). Endpoint anual da API Olinda, mediana, base de 30 dias, **uma observação por boletim semanal** em `observation` (`BCB_FOCUS.ANUAL.<ANO>.<INDICADOR>`; dia da observação = data da pesquisa; publicação estimada pelo 1º dia útil seguinte, com feriados tirados da própria fonte; sem tabela nova nem mudança no serviço point-in-time). **20.258 observações, 93 séries, 1.394 boletins de 2000-01-07 a 2026-09-18** em dev; igual ao PDF do boletim em 6 datas; 0 duplicatas; reexecução idempotente; `asOf()` validado (IPCA 2026: 5,00 → 4,90 entre os boletins de 04/09 e 11/09). Card "Expectativas de mercado - Focus (BCB)" | ADR 0022 |
| Indicador do Milho CEPEA/ESALQ, pela B3 | O site da CEPEA segue bloqueando automação (exportação com desafio do Cloudflare; `robots.txt` contra agentes de IA), mas a B3 divulga o **mesmo número** no arquivo público `Indic` (66 de 66 datas iguais ao centavo em R$). Coletor `b3-milho-esalq` na coleta diária + `npm run backfill:b3-milho-esalq` (desde 2018-06-08, um ano por execução, ~2 h). Card "Milho — Indicador CEPEA/ESALQ" com a fonte B3 explícita. **Decisão do usuário**: não passa pela pergunta 7 | ADR 0021 |
| Histórico do CCM pelo Boletim Diário da B3 | Backfill `npm run backfill:b3-ccm-bdi` lê o capítulo de derivativos do BDI em PDF (extração por coordenada): **745 pregões de 2022-03-21 a 2025-12-11**, 42.303 observações nas mesmas séries `B3.CCM.*` (sem estrutura nova), mais **abertura** e **contratos em aberto** nos dois cards do CCM. Complementar ao CSV: o que já existe não é regravado; 0 divergências na conferência com o CSV; reexecutar não grava nada. **Buraco de ~9 meses em 2023** e 193 boletins publicados sem a tabela (lacuna da fonte) | ADR 0020 |
| Índice de cobertura em `observation` | O triplo de linhas do CCM deixou o detalhe dos cards lento (~1,1 s em dev; ~20 s e requisições abortadas na VM durante o backfill). Migration `20260923100000-add-observation-covering-index`: resumo de cobertura de ~800 ms para ~37 ms; detalhe do card do CCM para ~250 ms. Roda sozinha no deploy | ADR 0020 |

</details>

<details>
<summary>Entregas de 2026-09-22</summary>

Registro do que foi fechado na lista "Falta fazer" anterior (detalhe nos documentos apontados):

| Entrega | Resultado | Onde |
|---|---|---|
| Auditoria da camada de dados — Milho e Ouro | Cruzamento de todo o coletado até aqui (fontes, coletores, banco) contra os 8 fatores de Milho e os 8 de Ouro do `controle_fatores.xlsx`: 3/8 fatores de Milho e 2/8 de Ouro com matéria-prima completa; lacunas reais sem nenhuma fonte hoje (frete/prêmio de porto, EIA/etanol, CPI, geopolítica, reservas de bancos centrais, ETFs de ouro). Prova viva do point-in-time confirmada com dado real do banco (18 revisões em `WASDE.MILHO.EUA.ENDING_STOCKS`, safra 2022/23) — o critério de sucesso que `analise-critica-fel1-milho-ouro.md` §8 definia já está atingido. Achado corrigido nesta entrega: o `STATUS_DO_PROJETO.md` citava "3.369 observações" para o balanço IMEA sem diferenciar do que é realmente gravado no banco (802 linhas, após dedup por revisão) — ADR 0019 já fazia essa distinção internamente, só o Status não repetia. Duas fontes novas entram no radar de "Falta fazer" (§3): EIA (etanol) e frete marítimo/prêmio de porto, sem as quais 2 fatores do milho não têm nenhuma matéria-prima | `docs/cobertura-fatores-fel1-milho-ouro.md` |
| IMEA — milho de MT (safra e custo) | Dois coletores: `imea-milho-safra` (área, produção e produtividade de Mato Grosso e das 7 regiões do IMEA, por safra — 3 indicadores identificados por casamento de valor numa API que não nomeia os ~130 que traz) e `imea-custo-milho` (as 4 planilhas XLSX de custo de produção do site, ~62 itens por hectare, em Mensal/Ponderado × Alta/Média Tecnologia). Validado contra a fonte real e gravado no banco de dev: 96 observações de safra e 15.402 de custo (5.073 séries), com 2 inválidas reais (colunas ambíguas na planilha, não fixture); reexecução idempotente, 0 revisão espúria. 3 cards novos nos Observáveis (1 de safra + 2 de custo). **Autorizado pelo usuário em 2026-09-22**. **Dois achados corrigidos na validação contra o banco real** (nenhum aparecia com fixture): `observation.series_code` era `VARCHAR(60)`, curto demais para a convenção do IMEA (até 91 chars) — 10.364 observações eram descartadas em silêncio pelo `INSERT IGNORE`; nova migration alarga para 120. E valores do IMEA com mais de 6 casas decimais discordavam do arredondamento do `DECIMAL(18,6)` e geravam revisão falsa a cada coleta; corrigido arredondando no parser. **Desenho dos cards revisto no mesmo dia**: a 1ª versão tinha 4 cards de custo (um por arquivo-fonte); questionado pelo usuário (comparando com o WASDE, que separa cards só por incompatibilidade real - lá, unidade), Mensal e Ponderado passaram a conviver no MESMO seletor de custo mensal (mesma unidade, mesma frequência, mesmos itens) - só a safra consolidada (frequência anual, incompatível com a mensal) ficou em card à parte, fechando em 3 cards. **Sem backfill possível**: nem a API nem o catálogo de arquivos guardam edição anterior — diferente do WASDE/Conab, o vintage só começa a existir a partir da 1ª coleta diária real. Oferta e demanda, intenção de plantio e andamento de safra existem só em PDF e **não** foram implementados (mesmo limite de PDF já visto no WASDE) | ADR 0018 |
| IMEA — balanço de oferta e demanda do milho (PDF, com backfill) | Reabre o que o ADR 0018 tinha descartado: o `pdftotext -layout` desalinhava a tabela (mesmo problema do WASDE), mas a extração por **coordenada** (x/y de cada texto, `pdfjs-dist`) resolve o alinhamento. Coletor novo `imea-oferta-demanda-milho` (2 edições mais recentes na coleta diária) + `scripts/backfill-imea-oferta-demanda.js` (blocos de 5 anos). Catálogo com 79 arquivos, dos quais 1 é um PDF de metodologia (não uma edição, achado real) e 1 é uma republicação no mesmo dia (fica a de maior id) — **77 edições reais**, 2014-04-14 a 2026-08-31. Validado contra as 77 edições reais (não só uma amostra): 3.369 itens válidos no parser, 0 inválidos, gravados como 802 linhas em `observation` (dedup por revisão — ver ADR 0008); a Produção de MT 2025/26 lida aqui (58,04 milhões de t) bate com o valor já confirmado pelo ADR 0018 via API. **Achado real só nas 77, não numa amostra de 7**: em 2 edições (2022-04-18, 2022-07-18) o PDF quebra números em vários itens de texto ("11," + "36"); corrigido remontando fragmentos adjacentes antes de interpretar a célula. Card novo, **separado** do card de safra (`IMEA_MILHO_SAFRA`): o balanço não tem quebra por região (só Mato Grosso), então não cabe no mesmo seletor `porRegiao` do card de safra — mesmo critério de compatibilidade do ADR 0018, aplicado ao eixo "item". A métrica Produção aparece nos dois cards (API x PDF), sem reconciliação entre as rotas. **Achado real ao rodar o backfill duas vezes**: repetir o comando inteiro depois de já ter terminado em `success` pode logar falhas espúrias (sem corromper dado) — mecanismo de deduplicação compartilhado com WASDE/Conab, que só reconhece uma edição como "já processada" se ela gerou linha escrita; documentado como limitação conhecida, não corrigido nesta entrega (decisão do usuário). **Autorizado pelo usuário em 2026-09-22** | ADR 0019 |

</details>

<details>
<summary>Entregas de 2026-09-21</summary>

Registro do que foi fechado na lista "Falta fazer" anterior (detalhe nos documentos apontados):

| Entrega | Resultado | Onde |
|---|---|---|
| Vintage real (ALFRED) | `DGS10`/`DFII10`/`T10YIE` não revisam (0 revisões em ~2.100 observações); `DTWEXBGS` revisa e provou o `asOf()` com dado real num teste isolado. Backfill de produção só quando entrar uma série revisável | ADR 0011 |
| Profundidade do USDA | O QuickStats começa em 1980 (o padrão do coletor era 2006); o histórico já foi carregado no servidor (informado pelo usuário) | ADR 0009 |
| Reconhecimento de fontes (níveis 0–5) | Processo portado do AgroMind, índice com as 7 fontes implementadas e as candidatas em nível 0; regra em `CLAUDE.md` | `docs/processo-reconhecimento-fontes.md`, `docs/reconhecimento-fontes/` |
| Licenças de LBMA e FRED | Termos lidos e registrados; **adiadas por decisão** (sem distribuição nem comercialização prevista, uso interno). Nota de licença nos cards | ADR 0009, `docs/reconhecimento-fontes/` |
| FRED pela API | Coleta pela API REST quando há `FRED_API_KEY`, com o CSV como reserva; a chave já está no `.env` da VM (a confirmar depois do deploy) | ADR 0012 |
| Cron de produção | Servidor em UTC (04/06/08 UTC = 01/03/05 em Brasília); as 3 execuções do dia terminaram com todos os coletores em `success` | ADR 0004 |
| Permissões granulares e refresh token | Ficam como estão / descartados; a sessão passou de 8h para **12h** (JWT e cookie, uma constante) | `docs/decisoes-tecnicas.md` |
| Carga histórica do BCB | Dólar (8.088 linhas), Selic realizada (8.086) e meta (10.073), desde 1994/1999, em dev e produção. Os scripts dividem o intervalo em janelas de 10 anos (limite da API do BCB) | ADR 0001 |
| Tela "Status do projeto" | Renderiza este arquivo no app (menu Sistema) | `/status-projeto` |
| WASDE — balanço do milho (vintage real) | Coletor lê o XLS de cada edição mensal do ESMIS (2011 a 2026): 27.309 linhas em 167 séries, 24.542 revisões, `published_at` real; 2 cards nos Observáveis ("Milho EUA", com as 13 métricas dos EUA no seletor, e "Milho por país", com as 22 regiões por checkbox e 7 métricas, como o CCM por vencimento). Reingestão idempotente (coleta diária e backfill repetido: 0 falhas). **Autorizado pelo usuário em 2026-09-21**. **Backfill já rodado em produção (informado pelo usuário)**; em um banco novo ele vem antes da coleta diária (a diária recusa enquanto a fonte estiver vazia) | ADR 0015 |
| Comex Stat — exportação de milho | Primeira fonte da lista do David que saiu do reconhecimento: coletor, backfill em blocos de 5 anos e 2 cards. **Cobertura a partir de 2005** (260 meses; a soma mensal bate com o total anual da API), em dev e produção (conferido por consulta ao banco da VM: 260 linhas por série, 5 blocos em `success`). Autorizado pelo usuário em 2026-09-21 | ADR 0013 |
| Exportação da tabela histórica (CSV) | Botão "Exportar CSV" na tela de detalhe do observável: baixa a série **inteira** da tabela (não só a página), com os mesmos filtros dela (modalidade; campo e vencimentos nos futuros). CSV para Excel pt-BR (`;`, vírgula decimal, BOM), valor sem arredondar, com colunas de publicação nos observáveis point-in-time. Rate limit por usuário; teto de 500 mil linhas | `GET /api/v1/observaveis/:codigo/exportacao.csv` |
| WASDE por país e período do gráfico | Dois cards, no lugar dos seis por série: "Milho EUA" (13 métricas no seletor, cada uma na unidade do USDA) e "Milho por país" (22 regiões e 7 métricas com checkboxes; padrão Brasil, EUA, Argentina e China; agregados e séries descontinuadas opt-in). O título do gráfico e da tabela mostra a métrica e a unidade em uso; o CSV exportado traz a coluna "Métrica". O mecanismo do CCM foi generalizado de "vencimento" para "item" (parâmetro da API: `itens`). Gráficos ganham a opção **Tudo** e abrem em **10 anos** nas séries anuais | ADR 0015 |
| Reconhecimento da PSD do USDA (adiada) | Fonte reconhecida (nível 1): API JSON com chave própria `FAS_API_KEY`, milho desde 1960, 125 países + mundo. **Adiada por decisão do usuário**, sem coletor: o WASDE por país já cobre 14 países e os agregados desde 2008, com vintage real. **Ressalvas:** a PSD só acrescentaria os países fora da seleção do WASDE (Índia, Indonésia, Vietnã etc.) e o histórico anterior a 2008; a API só devolve a edição mais recente, **sem vintage**; licença e janela do rate limit não confirmadas; continua listada na §6 e só vira coletor com decisão do David ou autorização registrada em ADR (a pergunta 5 da §4, sobre o vintage do agro, virou informe em 2026-09-27 e não trava a PSD) | ADR 0014 |
| Reconhecimento da Conab (nível 1) — base do coletor abaixo | Três caminhos públicos, sem chave e sem captcha, abertos com chamada real: **(A)** planilha XLSX do boletim mensal (1ª/2ª/3ª safra por UF e balanço com estoque, consumo, importação e exportação; um vintage por levantamento), **(B)** séries históricas XLS de 1ª/2ª safra desde 1976/77 (sem vintage) e **(C)** preços em TXT (só ~12 meses, atualizados diariamente). Sem coletor: depende do David. **Ressalvas:** sem API nem dicionário de dados (quebra se o layout mudar); licença não verificada; aba da 3ª safra e arquivos municipais não abertos; o histórico longo de preço segue bloqueado | ADR 0016 |
| Conab — milho do boletim mensal (coletor + backfill + 2 cards) | Coletor diário `conab-milho`: safra 1ª/2ª/3ª/total por Região/UF (área, produtividade, produção) e balanço nacional (estoque, consumo, importação, exportação), **com `published_at` real** (data e hora da página do levantamento). Backfill dos 15 levantamentos do índice (fev/2025 a set/2026): 397 séries, 3.436 linhas, até 10 revisões por valor, 0 falhas; a coleta diária repetida é idempotente (0 criados, 830 iguais). Cards "Milho por safra e UF (Conab)" (checkboxes de Região/UF) e "Milho - balanço nacional (Conab)" (seletor de métrica). **Autorizado pelo usuário em 2026-09-21**. **Backfill já rodado no servidor (informado pelo usuário; log: 15 levantamentos, 0 falhas, 88 s)**; em um banco novo ele vem antes da coleta diária (a diária recusa enquanto a fonte estiver vazia). **Ressalvas:** só de fev/2025 em diante (lacunas no índice); `published_at` das safras antigas é limite superior; a planilha é a versão atual (pode ter correção posterior à publicação); sem API (quebra se o layout mudar); licença não verificada. **Fora, por decisão do usuário (adiado, não pendente):** as séries históricas de 1ª/2ª safra desde 1976/77 (XLS, sem vintage) e os preços da Conab (TXT, só ~12 meses; o histórico longo segue bloqueado), reconhecidos no ADR 0016, ver §2 e §6. **Conab concluída em 2026-09-21**: o coletor rodou no servidor (backfill e coleta diária, 0 falhas) | ADR 0017 |
| Padrão das telas de observável | Toda tela de detalhe herda, sem código por card: **exportação da tabela em CSV** (série inteira, mesmos filtros, coluna de métrica), período do gráfico com a opção **Tudo** e **10 anos como padrão nas séries anuais** (`utils/periodo-grafico.js`), título com a métrica em uso e gráfico com até 12 cores distintas. Fixado como convenção no `CLAUDE.md` (um card novo é só uma entrada no catálogo; um teste barra frequência desconhecida). O nginx passou a servir o `index.html` com `Cache-Control: no-cache` (e os arquivos com hash em cache longo): depois de um deploy o navegador não abre mais a tela antiga (achado real: só o refresh forçado mostrava a tela nova) | `CLAUDE.md`, `frontend/nginx.conf` |

</details>

</details>
