# FinMind — Status do projeto

Painel de uma página: o que está **pronto**, o que **falta** e o que está
**bloqueado** por decisão do especialista de mercado (David) ou do Comitê.
Serve para retomar o trabalho sem reconstruir o contexto.

**Última atualização: 2026-09-27.**

> **Regra de manutenção:** ao fechar uma entrega, atualize este arquivo **no
> mesmo commit**. Aqui só entra o estado (pronto / falta / bloqueado) e o link
> de onde está o detalhe — nunca cópia de conteúdo. Em caso de conflito,
> vale o documento apontado: `CLAUDE.md` (regras e convenções), os ADRs em
> `docs/adr/` (decisões e evidências por fonte) e
> `docs/pendente-especialista-david.md` (o que depende do David).

## 1. Onde estamos

A **infraestrutura de dados** para ouro e milho está pronta: coleta,
armazenamento point-in-time (com data de publicação) e exibição nos
Observáveis. **Nada interpreta esses dados ainda** — motor analítico, IA,
sinais, backtest e execução de ordens seguem como contratos vazios, à espera
das definições do David (ver `CLAUDE.md`, "Restrições permanentes").
O desenho já está decidido: o motor prepara a base (fatores e regras do Comitê)
e a **IA gera a recomendação**, que uma pessoa decide se segue (§5).

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
| Telas de dados | `/dados-mercado/observaveis` (26 cards) e `/dados-mercado/execucoes` — ADR 0005 |
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
| FRED | API REST (JSON, com chave); CSV de reserva | DGS10, T10YIE, DFII10, DTWEXBGS | DGS10 desde 1962; DFII10/T10YIE 2003; DTWEXBGS 2006 | Estimado | ✅ Coleta pela API, CSV de reserva — ADR 0012. Vintage real (ALFRED) provado via teste — ADR 0011 |
| LBMA | Feed JSON público (não documentado) | Ouro PM (USD/oz) | Desde 1968 | Estimado | ✅ Licença da IBA exigida p/ exibir/redistribuir — adiada (uso interno) |
| CFTC COT | API Socrata (JSON) | Ouro e milho (open interest, MM long/short) | Desde 2006 | Real desde 2022-08; estimado antes | ✅ |
| USDA NASS | API QuickStats (JSON, com chave) | Crop Progress do milho (12 séries) | Desde 1980 (piso real da API; cada série começa no seu ano) | Estimado (regra não validada p/ 1980–2005) | ✅ Validado em 2026-09-21 (6.758 linhas); histórico 1980+ já carregado no servidor (informado pelo usuário) |
| B3 CCM | CSV (Up2Data) + PDF (Boletim Diário, extração por coordenada) | Futuros de milho, por vencimento (preços, liquidez e, até 2025-12-11, contratos em aberto) | **Desde 2022-03-21**, em dev e no servidor (BDI rodado no servidor, informado pelo usuário em 2026-09-23): Boletim Diário (PDF) até 2025-12-11 + Up2Data (CSV, janela de ~15 meses) daí em diante; **buraco de ~9 meses em 2023** na fonte | Estimado | ✅ ADRs 0009, 0020. 10+ anos **não existem de graça** |
| Comex Stat (MDIC) | API (JSON, sem chave) | Exportação de milho, mensal (volume em kg e valor FOB em US$) | **Desde 2005** (jan/2005 a ago/2026, 260 meses); antes disso o código NCM muda e não foi mapeado — pode ser estendido depois | Estimado (dia 15 do mês seguinte); revisões da fonte não confirmadas | ✅ Validado em 2026-09-21 em dev e produção (260 meses por série) — ADR 0013 |
| USDA WASDE (ESMIS) | HTML (listagem, raspada) + XLS de cada edição | Balanço do milho por edição mensal: EUA (13 atributos) e ~20 regiões do mundo (7 atributos), 167 séries | **Desde 2011-01** (188 edições, XLS; antes só PDF/TXT) | **Real, com dia** (data do release); **vintage real**: 24.542 revisões guardadas | ✅ Validado em 2026-09-21 em dev (27.309 linhas) e **backfill já rodado no servidor** (informado pelo usuário) — ADR 0015 |
| Conab (Boletim da Safra de Grãos) | XLSX de cada levantamento (página HTML) | Milho por safra (1ª, 2ª, 3ª e total) por Região/UF (área, produtividade, produção) e balanço nacional (estoque inicial e final, produção, importação, suprimento, consumo, exportação, demanda total): 397 séries | **Vintage (estimativas mês a mês) só desde fev/2025**: são 15 levantamentos mensais, o máximo que o índice da Conab mantém (com lacunas); antes disso a fonte não oferece. O balanço traz também os valores de safras de 2018/19 a 2025/26, mas sem vintage próprio. As séries históricas desde 1976/77 e os preços **não** foram carregados (adiado por decisão) | **Real, com data e hora** (página do levantamento); **vintage real**: cada levantamento é uma versão (até 10 revisões por valor). Nas safras antigas é um **limite superior**: entra com a data do primeiro levantamento lido, então uma consulta anterior a fev/2025 volta vazia | ✅ Validado em 2026-09-21 em dev (3.436 linhas) e **backfill e coleta diária já rodados no servidor, 0 falhas** (informado pelo usuário) — ADR 0017 |
| IMEA — milho de MT | API JSON não documentada (safra) + XLSX (custo) | Área/produção/produtividade por safra (Mato Grosso + 7 regiões, 3 indicadores identificados na API por casamento de valor) e custo de produção (Mensal/Ponderado × Alta/Média Tecnologia, ~62 itens por hectare): 3 cards (Mensal e Ponderado convivem no mesmo seletor de custo mensal, como o WASDE faz por unidade — aqui por frequência) | Safras 2022/23 a 2026/27 (API; a 2026/27 apareceu na coleta diária de 2026-09-23) e custo publicado em 15/09/2026 (catálogo). **Sem backfill possível**: nem a API nem o catálogo de arquivos guardam edições anteriores — o vintage começa a partir de agora | **Real, só a data** (data da última atualização na API; data do arquivo no catálogo) | ✅ Validado e gravado no banco de dev em 2026-09-22 (96 observações de safra; 15.402 de custo, 5.073 séries; reexecução idempotente) — ADR 0018 |
| B3 — Indicador do Milho CEPEA/ESALQ | TXT de largura fixa em ZIP (arquivo `Indic`, Pesquisa por pregão) | Indicador à vista, em R$ e US$ por saca | Fonte **desde 2018-06-08** (antes, o milho não consta do arquivo). **No servidor, desde 2018-06-08** (backfill concluído, informado pelo usuário em 2026-09-23); em dev, carregado só de 2021-01-04 em diante | Estimado (fim do dia do pregão) | ✅ 66 de 66 datas iguais ao histórico da CEPEA — ADR 0021 |
| EIA — etanol dos EUA | XLS (planilha histórica de cada série, sem chave; a API exige chave) | Produção semanal de etanol combustível (mil barris/dia) e estoques (mil barris): o fator do milho "Demanda de etanol" | **Desde 2010-06-04** (851 semanas por série, 1.702 observações em dev e no servidor; 1ª coleta no servidor conferida em 2026-09-24) | **Estimado** (quarta; quinta em semana de feriado; data do calendário oficial da EIA quando ele lista a semana) | ✅ Validado em 2026-09-23 em dev: 8 de 8 valores iguais à tabela oficial do WPSR, 0 duplicatas, reexecução idempotente — ADR 0024 |
| NOAA STAR — clima sobre o milho | Texto (link de dados da página oficial, sem chave; endpoint não documentado) | Saúde da vegetação **medida só sobre a área do milho**: VHI, VCI (umidade) e TCI (calor), 0 a 100, semanal, em 18 regiões (mundo, hemisférios Norte e Sul; EUA, Brasil, Argentina, China, Ucrânia; MT, PR, GO, MS, MG; Iowa, Illinois, Nebraska, Minnesota, Indiana): o fator do milho "Clima e safra" | **Desde 1982** (2.276 semanas por série, 122.904 observações em dev e no servidor; backfill no servidor em 2026-09-24: 122.904 criadas, 0 falhas, ~17 min) | **Estimado** (dia seguinte ao fim da semana, regra da página) | ✅ Validado em 2026-09-24 em dev: valores iguais à página, secas de 2012 (EUA) e 2021 (MT) visíveis, 0 falhas, reexecução idempotente — ADR 0025 |
| IMEA — balanço de oferta e demanda do milho de Mato Grosso | PDF (extração por coordenada) | Estoque inicial/final, importação, produção, demanda, consumo (MT e interestadual), exportação, aquisições públicas: 1 card, extraído por COORDENADA do PDF mensal (x/y de cada texto) | **Vintage real, 77 edições, 2014-04-14 a 2026-08-31** (catálogo inteiro, descartando 1 PDF de metodologia e 1 republicação no mesmo dia) | **Real, só a data** (data do arquivo no catálogo) | ✅ Validado contra as 77 edições reais em 2026-09-22: 3.369 itens válidos no parser, 0 inválidos; **802 linhas gravadas em `observation`** após deduplicação por revisão (o serviço point-in-time só grava quando o valor muda — ver ADR 0008); backfill em blocos de 5 anos — ADR 0019 |

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
| FRED | 5 | Licença lida: 3 de 4 séries domínio público c/ citação; `T10YIE` não confirmada. **Adiada** (uso interno) | Retomar antes de exibir a terceiros |
| LBMA (ouro) | 5 | **Exige licença da IBA** p/ usar/redistribuir o histórico. **Adiada** (uso interno) | Retomar antes de exibir a terceiros |
| CFTC COT | 5 | Data de publicação estimada antes de 2022-08 | — |
| USDA Crop Progress | 5 | Data de publicação estimada, não validada p/ 1980–2005 | — |
| Comex Stat (MDIC) | 5 | **Histórico só a partir de 2005** (NCM anterior não mapeado); revisões não confirmadas; rate limit rígido (429) | — |
| USDA WASDE — arquivo ESMIS (milho) | 5 | **Só de 2011 em diante** (antes só PDF/TXT); só EUA e ~20 regiões; raspa o HTML da listagem (sem API confirmada); republicação no mesmo dia: vale a última na carga, mas se a 1ª já tinha entrado, a do mesmo dia publicada depois é ignorada; licença e limite de uso não confirmados. **Backfill já rodado em produção (informado pelo usuário)**. Em qualquer banco novo ele vem ANTES da coleta diária: a diária se recusa a gravar enquanto a fonte estiver vazia (senão truncaria o vintage) | — |
| Conab — boletim mensal (milho: 1ª/2ª/3ª safra por UF e balanço) | 5 | **Vintage real por levantamento**, `published_at` real; **só de fev/2025 em diante** (o que o índice mantém, com lacunas). Sem API (quebra se o layout mudar); `published_at` das safras antigas é limite superior; a planilha é a versão atual (pode ter correção posterior); licença não verificada. **Backfill já rodado no servidor (2026-09-21, informado pelo usuário; o log mostra 15 levantamentos, 0 falhas, 88 s: a Conab é acessível de lá)**. Em qualquer banco novo ele vem ANTES da coleta diária | — |
| IMEA — balanço de oferta e demanda (PDF) | 5 | **Vintage real, 2014-04-14 a 2026-08-31** (77 edições). Extração por coordenada (sem API nem dicionário de dados: quebra se o layout mudar). Só Mato Grosso (sem quebra regional); Produção não reconciliada com o card de safra; licença não investigada. **Repetir o backfill inteiro** (não a coleta diária) **depois de já ter terminado em sucesso pode logar falhas espúrias**, sem corromper dado (achado real, mecanismo compartilhado com WASDE/Conab) — não repetir um backfill já concluído | — |
| B3 — Indicador do Milho CEPEA/ESALQ | 5 | **Só desde 2018-06-08** (antes, só pela exportação manual do site da CEPEA, que bloqueia automação). Número da CEPEA, origem B3; US$ difere por centavos; endpoint de download não documentado como API | — |
| EIA — etanol dos EUA | 5 | Data de publicação **estimada**; fechamentos extraordinários anteriores a 2024-12 (ex.: Natal) podem ter data antecipada no histórico. A planilha só traz o valor atual (revisão não medida). Sem chave da API: usa a planilha do site. Falta a metade "USDA" do fator (milho usado para etanol, no WASDE, não extraído) | — |
| NOAA STAR — saúde da vegetação por cultura (milho) | 5 | **Endpoint não documentado** (link de dados da página oficial). A NOAA reprocessa a série: o histórico é a versão de hoje (vintage real só daqui para frente). Data de publicação **estimada**. Máscara de cultura fixa, sem separar safrinha de 1ª safra. Mede o efeito já ocorrido: não é previsão do tempo nem pega geada a tempo. No servidor, a gravação do backfill levou ~17 min (45 s em dev): o banco da VM é bem mais lento | — |
| B3 CCM | 5 (limitado) | **Só ~4,5 anos de histórico grátis** (desde 2022-03-21, com buraco em 2023); contratos em aberto por vencimento só até 2025-12-11 | David/Comitê (pergunta 3, orçamento) |
| IMEA — milho de MT (safra e custo) | 4 | **Sem backfill possível** (nem a API nem o catálogo guardam edição anterior): vintage começa agora. IDs de indicador sem nome (identificados por casamento de valor); intenção de plantio e andamento de safra existem só em PDF e não foram implementados; licença não investigada | — |
| Paridade de exportação do milho (IMEA) | 1 | **Dado original com valor, aguardando decisão.** O **Boletim Semanal – Milho** do IMEA (PDF, 572 edições desde 2015-02-02) traz a **paridade de exportação calculada pela própria fonte** (R$/saca, Mato Grosso), com diferencial de base e prêmio portuário: é o dado que o FEL 1 descreve ("preço interno vs. Chicago + frete + câmbio"), e não existe em outra base nossa. Exige leitura da tabela por coordenada (como no ADR 0019). Ressalvas: é a paridade de MT, não a de Campinas; muda de contrato de referência (quebra de série); porto do prêmio incerto. Não implementado | Comitê (pergunta 16) |
| FAO/AMIS (FAOSTAT e base da AMIS) | 1 | **Adiada (decisão do usuário, 2026-09-23): o WASDE já cobre o balanço mundial do milho com vintage.** FAOSTAT é só produção anual (1961–2024, >1 ano de atraso); a AMIS não tem API oficial (só o PDF do Market Monitor) e mistura números do IGC, de licença não esclarecida | Comitê (pergunta 15) |
| USDA FAS PSD (milho) | 1 | Reconhecida, **sem coletor; adiada por decisão do usuário (2026-09-21)**: o WASDE por país já cobre o necessário por ora. Sem vintage histórico (API só dá a edição atual); licença e janela do rate limit não confirmadas | Retomar só se o David pedir países fora da seleção do WASDE ou histórico anterior a 2008 |
| Conab — séries históricas (desde 1976/77) e preços | 1 | Reconhecidas, **sem coletor por decisão do usuário**: as séries históricas não têm vintage; os preços em TXT cobrem só ~12 meses e o histórico longo segue bloqueado | Retomar quando houver uma opção |
| Outras fontes de clima: USDA Ag in Drought, FAO ASIS, NOAA CPC ONI | 1 | **Possíveis, não serão implementadas por ora** (2026-09-24). Ag in Drought: % da área de milho dos EUA em seca, semanal, desde 2000 (só EUA, só seca). ASIS (FAO): % da área agrícola em estresse por estado, desde 1984, sem separar a cultura. ONI: El Niño/La Niña, mensal, desde 1950 (regime de fundo; ligá-lo ao preço é regra). O VHI da NOAA STAR já cobre o efeito na lavoura — `docs/reconhecimento-fontes/clima.md` | Comitê, se pedir |
| Abimilho e CNA (estatísticas e panorama do setor) | 1 | **Sem valor para o FinMind: só republicam dado de outras fontes** (reconhecidas em 2026-09-24). Nenhuma tem API. Os números vêm de Comex Stat, Conab, USDA e Cepea (já coletados) ou da Céleres (comercial); o painel da Abimilho está parado desde nov/2024 e o site está com o certificado vencido; a CNA só publica PDFs (Panorama, VBP = Conab × Cepea, custo do Campo Futuro levantado pela Cepea). **Não implementar.** Achado lateral: a API do Comex Stat já usada traz a **exportação por país de destino** (97 países em 2025), a lacuna do fator 8 do milho (China) — `docs/reconhecimento-fontes/abimilho-cna.md` | — |
| Clima do FEL 1: NASA POWER, INMET, CPTEC/INPE, ECMWF ERA5 (e a "NOAA" genérica do relatório) | 1 | **Inadequadas para o FinMind nesta fase** (2026-09-24). Entregam **tempo** (chuva, temperatura por ponto ou grade), não o **efeito do clima no milho e no café**: transformá-las em algo ligado ao preço exigiria o FinMind escolher regiões, pesos e limiares, ou seja, montar um fator. O indicador pronto veio de outro produto da NOAA (STAR, acima). **Não implementar**; só voltam se o Comitê pedir previsão do tempo ou risco de geada — `docs/reconhecimento-fontes/clima.md` | — |
| Frete (rodoviário e marítimo) | 1 | **Sem valor isolado.** Rodoviário: 28 rotas saindo de MT na API do IMEA, em R$/t, **só o valor atual**; sozinho é só componente da paridade (usá-lo seria o FinMind montar a própria fórmula, que é um fator). Marítimo: **nenhuma fonte gratuita encontrada**. Não implementar | — |
| CPI, WGC, IMF | 0 | Candidatas, fora do escopo | David |

Processo: `docs/processo-reconhecimento-fontes.md`. Uma linha por fonte, com
evidência: `docs/reconhecimento-fontes/README.md` (checklist completo em arquivo
próprio para FRED, LBMA, FAO/AMIS, BCB Focus, reservas do BCB, Abimilho e CNA e clima).

**Cruzamento completo com os 8+8 fatores do `controle_fatores.xlsx` (auditoria de
2026-09-22):** `docs/cobertura-fatores-fel1-milho-ouro.md` — fator → dado
necessário → dado disponível → lacuna, sem propor fórmula.

</details>

<details>
<summary>3. Falta fazer</summary>

Fontes de **milho** que o relatório do David lista (FEL 1, §6.5, §7 e o plano de
integração da §9.2) e que ainda **não coletamos**. Já feitas: USDA NASS (Crop
Progress), CFTC, B3 (CCM), Indicador do Milho CEPEA/ESALQ (pela B3), Comex Stat, WASDE (balanço do milho), Conab (boletim mensal), IMEA (área/produção/produtividade por safra, custo e balanço de oferta e demanda), EIA (etanol), clima do milho (NOAA STAR, saúde da vegetação por cultura), BCB SGS, BCB Focus (IPCA, Selic e câmbio) e reservas internacionais do BCB (ambos ligados ao ouro) e FRED. Aqui se faz o **reconhecimento** de cada
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

**Café, numa onda completa (decisão do usuário, 2026-09-26):** as fontes do café, inclusive o clima pela NOAA STAR
(mesmo coletor do milho, ADR 0025: uma entrada nova em `CULTURAS`, com `ACOF`/`RCOF`), entram juntas, com as regiões
escolhidas a partir das fontes de produção do café, não de conhecimento geral.

O IMEA foi implementado em **área, produção, produtividade, custo de
produção** (API e catálogo de arquivos, JSON/XLSX — ADR 0018) e **balanço de
oferta e demanda** (PDF mensal, extraído por coordenada — ADR 0019).
Intenção de plantio e andamento de semeadura/colheita — o resto do que o
item pedia — existem só em PDF e **não** foram implementados.

Fora desta lista: o **preço histórico dos futuros** (B3 com 10+ anos e CME ZC, ambos
pagos), que está na §4 (perguntas 2 e 3), e as fontes de ouro que ele lista e não
coletamos (WGC, CME/COMEX, FMI, US Treasury, USGS, Banco Mundial), que estão nas
ressalvas da §2 e na §6.

### Infraestrutura pendente

| Item | Observação |
|---|---|
| `imea-custo-milho` parcial | Toda coleta termina em "Parcial" pelos mesmos 2 registros com problema (anterior à troca de banco) |

### Carga histórica pendente no servidor

Backfills já validados em dev que ainda não rodaram na VM. Ao rodar, tirar a linha daqui e marcar "dev e servidor"
na coluna Status de "Dados coletados" (§2).

Nenhuma no momento (a última, NOAA STAR — clima sobre o milho, rodou no servidor em 2026-09-24).

</details>

<details open>
<summary>4. Bloqueado — depende do David / Comitê</summary>

Itens 4 a 8 de `docs/pendente-especialista-david.md` continuam sem definição:
regras e cálculos do motor, formato de apresentação, avaliação da IA,
condições de sinal e execução de ordens.

Perguntas da análise crítica (`docs/analise-critica-fel1-milho-ouro.md`, §H).
Preencher a resposta e a data quando o David responder.

**Prioridade da próxima reunião (decidido em 2026-09-22, auditoria da camada de
dados; a 2 somada em 2026-09-23):** perguntas **2 e 3** (juntas: preço futuro do
milho e orçamento, detalhe abaixo da tabela) e **5** — nenhuma implementação nova de
fator faz sentido antes dessas respostas, porque definem se o backtest futuro é viável
e se o vintage do agro pode ser aceito com viés declarado. Ver
`docs/cobertura-fatores-fel1-milho-ouro.md`, §7.

| # | Pergunta | Trava? | Resposta / data |
|---|---|---|---|
| 1 | Milho + Ouro como **prova de arquitetura** (sem mudar a ordem CAFÉ→PETRÓLEO→MILHO→OURO) é aceitável? | | — |
| 2 | Milho: podemos seguir só com o **CCM (B3)**, que é grátis mas só tem **~4 anos** de histórico, ou precisamos do **ZC (CME)**, que é **pago**? Ouro: **GC** ou preço de referência? **Detalhe para a reunião logo abaixo da tabela** | ⛔ | — |
| 3 | Existe **orçamento para dados de preço**? Sem isso não há backtest. **Para o milho, é respondida junto com a pergunta 2** (escolher o ZC = ter orçamento para ele); segue valendo para o **ouro** (o futuro GC da CME também é pago) | ⛔ | — |
| 4 | Confirmam que o **COTAHIST não atende CCM/ICF**? Qual a alternativa? (o ADR 0009 já confirma que não atende; para o CCM, a alternativa encontrada foi o Boletim Diário da B3, ADR 0020 — ver pergunta 2) | | — |
| 5 | **Vintage do agro:** backtest com dado revisado e viés declarado, ou acumular a partir de agora? | ⛔ | — |
| 6 | Quem responde por **licença e redistribuição** das fontes? Não trava hoje (sem distribuição prevista, decisão de 2026-09-21); passa a travar se isso mudar | | — |
| 7 | **CEPEA** está bloqueada para automação. Export manual é aceitável em produção? | | **Não se aplica mais** (decisão do usuário, 2026-09-23): o mesmo indicador vem da B3, automatizado, desde 2018-06-08 — ADR 0021. Só voltaria se o David pedir o histórico anterior a 2018 |
| 8 | Backtest de **1–5 anos** (§4) ou **10–15 anos** (§12.1)? Qual vale? | | — |
| 9 | Qual o **benchmark** do Sharpe mínimo? | | — |
| 10 | Os limiares da §12.2 serão deliberados **antes** dos testes? | | — |
| 11 | A **IA propõe hipóteses e narra, mas não gera o sinal**? | | **Não se aplica mais** (decidido em 2026-09-27): a IA **gera a recomendação** (manter, comprar ou vender, por horizonte), sempre com base nos dados e nas regras que o motor envia; uma pessoa decide e executa. Ver §5, "O papel da IA" |
| 12 | IA Search só para descoberta de fonte e evento qualitativo, **vedada** como origem de número? | | — |
| 13 | As **Seções 15 e 16** (Registro de Revisão) do relatório existem? | | — |
| 14 | **WASDE impacta café** (planilha) ou não (texto revisado)? Qual prevalece? | | — |
| 15 | **FAO/AMIS** foi reconhecida e **adiada**: o WASDE já traz o balanço mundial do milho com vintage. Existe necessidade de implantá-la no futuro? **Detalhe logo abaixo da tabela** | | — |
| 16 | **Paridade de exportação do milho:** o FinMind deve guardar a **paridade já calculada pelo IMEA** (valor pronto), os **componentes** dela (frete, prêmio de porto) ou nada por ora? **Detalhe logo abaixo da tabela** | | — |

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

<details open>
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

**A IA é a analista do processo** (decidido em 2026-09-27; era a pergunta 11 da §4). Ela recebe a base do motor, as
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
| 2 | Safrinha brasileira, 2ª safra (Alto) | **Produção estimada da 2ª safra** (Conab, Brasil) e a **revisão** contra o levantamento anterior | Safra 2025/26: 112.130,8 mil t no 12º levantamento (15/09/2026) contra 111.030,9 mil t no 11º (13/08) = **+1.099,9 mil t (+1,0%)** | 🟡 Cálculo simples, mas as revisões só existem desde fev/2025 (pergunta 5) |
| 3 | Estoques globais e balanço — WASDE (Alto) | **Estoque/uso = estoque final ÷ uso total**, dos EUA e do mundo, e a revisão contra a edição anterior. No mundo, o uso é o consumo interno total (exportação e importação se anulam) | Safra 2026/27, WASDE de 11/09/2026: EUA 1.567 ÷ 16.180 M bu = **9,7%** (na edição de 12/08: 1.653 ÷ 16.330 = 10,1%, revisão de −0,4 p.p.). Mundo: 272,1 ÷ 1.320,2 Mt = **20,6%** | 🟢 Indicador citado pelo nome na planilha ("relação estoque/uso"); revisões desde 2011 |
| 4 | Dólar (USDBRL) e paridade de exportação (Médio) | **Dólar PTAX de venda** (BCB), como publicado. **Paridade:** a já calculada pelo IMEA (MT, R$/saca), se a pergunta 16 aprovar | Dólar em 25/09/2026: **R$ 5,1991**. Paridade: não coletada | 🟡 Dólar pronto; a paridade exige um leitor do boletim semanal do IMEA (PDF) |
| 5 | Demanda de etanol e biocombustível (Médio) | **Produção semanal e estoques de etanol** dos EUA (EIA), como publicados | Semana até 18/09/2026: **1.028 mil barris/dia**; estoques de **24.683 mil barris** | 🟢 Pronto. Falta a parte do USDA (milho usado para etanol, no WASDE), não extraída |
| 6 | Custo de insumos — fertilizantes, diesel (Médio) | **Peso dos fertilizantes no custo total** e a variação no mês (IMEA, custo de produção de MT, R$/ha) | Ago/2026, média de MT: R$ 1.404,89 de R$ 6.724,28 por hectare = **20,9%** do custo; **−2,4%** contra julho | 🔴 Só Mato Grosso e custo agregado; sem preço de fertilizante ou diesel isolado |
| 7 | Especulação e posicionamento de fundos — COT (Médio) | **Posição líquida dos fundos** = managed money comprado − vendido, em contratos e em % dos contratos em aberto (CFTC, milho de Chicago) | Semana até 15/09/2026 (publicada em 18/09): 483.738 − 69.278 = **414.460 contratos**, **22,5%** de 1.843.824 | 🟢 Desde 2006; o mesmo cálculo serve ao ouro |
| 8 | Política comercial e exportações — China, tarifas (Médio) | **Exportação brasileira por destino** (Comex Stat), com a China em destaque. Tarifas são eventos, não números | Hoje só o total: **4,65 milhões de t** exportadas em ago/2026, sem o destino | 🟡 Destino: a API do Comex Stat já usada tem a quebra por país (falta estender o coletor). 🔴 Tarifas: exigem a camada de evidência (pergunta 12) |

<details open>
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
Comitê (item 4 de "O que queremos confirmar", abaixo, e pergunta 5 da §4).

| Etapa | O que faz | Resultado na Safrinha |
|---|---|---|
| **Coleta** (já existe) | Guarda o boletim da Conab como publicado, uma linha por levantamento, sem apagar as anteriores | Produção da 2ª safra 2025/26: 111.030,9 mil t no 11º levantamento (13/08) e 112.130,8 mil t no 12º (15/09) |
| **A. Medir** | Calcula o indicador da planilha: nível da produção e revisão contra o levantamento anterior | **112.130,8 mil t; revisão de +1.099,9 mil t (+1,0%)** |
| **B. Ler** | Situa a medida. Método fictício: (1) contra a safra anterior; (2) sequência das revisões | (1) **−1,0%** contra a safra 2024/25 (113.228,4 mil t, número final da Conab em 11/12/2025); (2) **3ª revisão seguida para cima** (jul, ago e set) e +1,5% contra a 1ª estimativa (110.460,4 mil t, out/2025). **Leitura:** "safra do tamanho da anterior, com estimativa subindo há três meses". Ainda sem direção |
| **C. Decidir** | Aplica a regra do Comitê e dá direção e peso. Regra fictícia "R-SAF-01 v0": 2 ou mais revisões seguidas para cima, com a safra a menos de 2% da anterior, = oferta crescendo, pesa para baixa | **Fator 2: pesa para baixa, peso Alto** (a partir de 3 revisões para cima e −1,0% contra a safra anterior) |

Com só 14 revisões guardadas (desde fev/2025), não dá para dizer se +1,0% é uma revisão grande ou pequena para
setembro. Por isso o método de B depende da pergunta 5 da §4.

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
| 1 | **Memória com avaliação** | Cada leitura do motor fica registrada e nunca é apagada (data da análise, base, versão das regras, versão do prompt, recomendação da IA). Depois, é comparada com o que o preço fez. É a base das outras duas: sem registro, não há o que avaliar | O Comitê definir o que é acerto (horizonte e métrica): item 6, "Avaliação da saída da IA", de `docs/pendente-especialista-david.md` |
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
<summary>6. Fora do escopo por enquanto</summary>

Não implementar sem autorização explícita registrada em ADR:

- Café, petróleo e qualquer ativo além de USD/BRL, Selic, ouro e milho (o café, inclusive o clima pela NOAA STAR, fica para uma onda completa do café, decisão do usuário de 2026-09-26).
- CEPEA antes de 2018-06-08 (só por exportação manual do site), Conab (séries históricas e preços), IMEA (intenção de plantio, andamento de semeadura/colheita — só em PDF), WGC, PSD, FAO/AMIS, CPI.
- Clima além da NOAA STAR por cultura: as fontes de clima do FEL 1 (NASA POWER, INMET, CPTEC/INPE, ERA5), USDA Ag in Drought, FAO ASIS, ONI, previsão do tempo e risco de geada.
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
| Reconhecimento da PSD do USDA (adiada) | Fonte reconhecida (nível 1): API JSON com chave própria `FAS_API_KEY`, milho desde 1960, 125 países + mundo. **Adiada por decisão do usuário**, sem coletor: o WASDE por país já cobre 14 países e os agregados desde 2008, com vintage real. **Ressalvas:** a PSD só acrescentaria os países fora da seleção do WASDE (Índia, Indonésia, Vietnã etc.) e o histórico anterior a 2008; a API só devolve a edição mais recente, **sem vintage**; licença e janela do rate limit não confirmadas; continua listada na §6 e só vira coletor com decisão do David ou autorização registrada em ADR (a pergunta 5 da §4, sobre o vintage do agro, segue aberta, mas não trava mais a PSD) | ADR 0014 |
| Reconhecimento da Conab (nível 1) — base do coletor abaixo | Três caminhos públicos, sem chave e sem captcha, abertos com chamada real: **(A)** planilha XLSX do boletim mensal (1ª/2ª/3ª safra por UF e balanço com estoque, consumo, importação e exportação; um vintage por levantamento), **(B)** séries históricas XLS de 1ª/2ª safra desde 1976/77 (sem vintage) e **(C)** preços em TXT (só ~12 meses, atualizados diariamente). Sem coletor: depende do David. **Ressalvas:** sem API nem dicionário de dados (quebra se o layout mudar); licença não verificada; aba da 3ª safra e arquivos municipais não abertos; o histórico longo de preço segue bloqueado | ADR 0016 |
| Conab — milho do boletim mensal (coletor + backfill + 2 cards) | Coletor diário `conab-milho`: safra 1ª/2ª/3ª/total por Região/UF (área, produtividade, produção) e balanço nacional (estoque, consumo, importação, exportação), **com `published_at` real** (data e hora da página do levantamento). Backfill dos 15 levantamentos do índice (fev/2025 a set/2026): 397 séries, 3.436 linhas, até 10 revisões por valor, 0 falhas; a coleta diária repetida é idempotente (0 criados, 830 iguais). Cards "Milho por safra e UF (Conab)" (checkboxes de Região/UF) e "Milho - balanço nacional (Conab)" (seletor de métrica). **Autorizado pelo usuário em 2026-09-21**. **Backfill já rodado no servidor (informado pelo usuário; log: 15 levantamentos, 0 falhas, 88 s)**; em um banco novo ele vem antes da coleta diária (a diária recusa enquanto a fonte estiver vazia). **Ressalvas:** só de fev/2025 em diante (lacunas no índice); `published_at` das safras antigas é limite superior; a planilha é a versão atual (pode ter correção posterior à publicação); sem API (quebra se o layout mudar); licença não verificada. **Fora, por decisão do usuário (adiado, não pendente):** as séries históricas de 1ª/2ª safra desde 1976/77 (XLS, sem vintage) e os preços da Conab (TXT, só ~12 meses; o histórico longo segue bloqueado), reconhecidos no ADR 0016, ver §2 e §6. **Conab concluída em 2026-09-21**: o coletor rodou no servidor (backfill e coleta diária, 0 falhas) | ADR 0017 |
| Padrão das telas de observável | Toda tela de detalhe herda, sem código por card: **exportação da tabela em CSV** (série inteira, mesmos filtros, coluna de métrica), período do gráfico com a opção **Tudo** e **10 anos como padrão nas séries anuais** (`utils/periodo-grafico.js`), título com a métrica em uso e gráfico com até 12 cores distintas. Fixado como convenção no `CLAUDE.md` (um card novo é só uma entrada no catálogo; um teste barra frequência desconhecida). O nginx passou a servir o `index.html` com `Cache-Control: no-cache` (e os arquivos com hash em cache longo): depois de um deploy o navegador não abre mais a tela antiga (achado real: só o refresh forçado mostrava a tela nova) | `CLAUDE.md`, `frontend/nginx.conf` |

</details>

</details>
