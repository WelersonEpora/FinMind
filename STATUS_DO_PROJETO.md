# FinMind — Status do projeto

Painel de uma página: o que está **pronto**, o que **falta** e o que está
**bloqueado** por decisão do especialista de mercado (David) ou do Comitê.
Serve para retomar o trabalho sem reconstruir o contexto.

**Última atualização: 2026-10-05.**

> **Regra de manutenção:** ao fechar uma entrega, atualize este arquivo **no
> mesmo commit**. Aqui só entra o estado (pronto / falta / bloqueado) e o link
> de onde está o detalhe — nunca cópia de conteúdo. Em caso de conflito,
> vale o documento apontado: `CLAUDE.md` (regras e convenções) e os ADRs em
> `docs/adr/` (decisões, evidências e a autorização de cada fonte). O que depende
> do David e do Comitê está aqui mesmo, na §4.

<details>
<summary>1. Onde estamos e próximos passos</summary>

A **infraestrutura de dados é suficiente** para seguir: dos 34 fatores da planilha de fatores do FEL 1
(`controle_fatores.xlsx`; o detalhe do milho e do ouro está em `docs/cobertura-fatores-fel1-milho-ouro.md`), **nenhum ficou sem dado**. Levantamento de 2026-10-01, revisto em 2026-10-02 (geopolítica), contra o que está coletado em dev e no servidor.

| Ativo | Coberto | Parcial | Sem dado |
|---|---|---|---|
| Café (8) | 6 | 2 | 0 |
| Milho (8) | 4 | 4 | 0 |
| Ouro (8) | 6 | 2 | 0 |
| Petróleo (10) | 4 | 6 | 0 |
| **Total (34)** | **20** | **14** | **0** |

**Os 2 fatores geopolíticos** eram os únicos sem dado: são eventos, não séries. Desde 2026-10-02 têm uma **leitura diária
por IA com busca na web** (ADR 0047), em dev e no servidor, e contam como **parciais**: o dado existe, mas a régua dos
níveis (o que é "fora do normal") é provisória até o David defini-la.

| Fator | Peso | Por quê | Situação |
|---|---|---|---|
| Ouro: geopolítica e risco sistêmico | Alto | É evento (conflito, sanção, crise), não série numérica | Leitura diária de eventos de mercado por IA (ADRs 0047 e 0049), tela `/dados-mercado/eventos`; a régua dos níveis é do David |
| Petróleo: geopolítica e conflitos (Oriente Médio, Rússia) | Alto | Mesmo caso | Mesmo caso |

Os 14 parciais têm dado, com lacunas da própria fonte (ex.: a demanda de petróleo sem a Rússia), à espera de uma
decisão do David ou do Comitê (ex.: a geada do café, a paridade do milho, o DXY licenciado) ou sem fonte gratuita (ex.:
o preço mínimo do café, bloqueado por reCAPTCHA). O detalhe de cada fonte está no §2 ("Fontes"); as fontes candidatas, em `docs/reconhecimento-fontes/README.md`.

**Aquisição de dados encerrada (decisão do usuário, 2026-10-01).** O que falta não é fonte: são as regras de cada
fator. **Fonte nova só com uma demanda específica** (do David, do Comitê ou do usuário), com a autorização registrada no
ADR, como antes. A coleta diária continua, e a manutenção das fontes já implementadas (mudança de formato, fonte que
fecha, como a LBMA) segue normal.

### Próximos passos

**Os quatro ativos têm a cadeia inteira rodando todo dia**: coleta → fatores (camadas A, B e C) → prompt diário → IA →
leitura de tendência em quatro horizontes no Centro de Decisão (nunca recomendação de compra ou venda). O mapa do motor
no código está em `backend/src/analytics-engine/README.md`. Falta fechar o que segue provisório. As leituras já são
medidas contra o preço realizado, na tela Qualidade da IA (ADR 0064).

| Etapa | O quê | Responsável | Situação |
|---|---|---|---|
| 1. Decisões de base | Critérios do backtest, preço e orçamento, instrumento e horizontes, ajustes no FEL 1 | Comitê | Respostas por escrito do David recebidas em 2026-10-03 (§4, ADR 0055). Faltam os 10 pontos em aberto, para a conversa com o David (`docs/conversa-david-respostas-fel1.md`). FEL 1 revisado previsto para 2026-10-15 |
| 2. Fatores, prompt e leitura da IA | Os fatores de cada ativo, o prompt diário e a leitura de tendência no Centro de Decisão | David/Comitê aprovam; FinMind monta | **Feito nos quatro ativos** (tabela abaixo) |
| 3. Pontos em aberto do motor | O que ficou provisório em cada ativo (tabela abaixo) | David → FinMind | Aguardam a conversa da etapa 1 |
| 4. Comparação com o realizado e avaliação | Para cada leitura e horizonte, em que faixa o preço de fato caiu, e as medidas de direção e de faixa contra dois benchmarks. A avaliação foi delegada pelo David ao usuário em 2026-10-05 (§4, "Avaliação da saída da IA") | FinMind | **Feito em 2026-10-05 (ADRs 0063 e 0064)**: o realizado em cada horizonte do Centro de Decisão, a partir do preço da data da análise, e a tela Qualidade da IA (`/qualidade-ia`), por ativo e horizonte, com as linhas de cada número. Fora desta versão: calibração da confiança, taxa de inversão, índice único e análise estatística |
| 5. Agregação e backtest | Os pesos e a agregação dos fatores em código (hoje a IA combina os fatores pelo prompt; no milho, com o peso do mês, ADR 0065) e o backtest com os critérios da etapa 1 | Comitê + FinMind | Depende da 1 e da 3. **Café: em produção desde 2026-10-05**, por decisão do usuário (famílias, peso por horizonte, score, cobertura, conflito e confiança, em código; no prompt como evidência, no Centro de Decisão e na Qualidade da IA; os pesos e os limiares são do FinMind, não do David), a validar pelo Comitê e à espera do backtest (ADR 0066) |
| 6. Simulação | Pelo menos 6 meses de leituras registradas e avaliadas (FEL 1, §12.1, Camada 3) | FinMind executa, Comitê avalia | As leituras se acumulam desde a aprovação de cada ativo, e a Qualidade da IA já as mede (etapa 4). O horizonte de 90 dias dos futuros fica sem preço até a decisão dos vencimentos por horizonte |

**O motor por ativo**

| Ativo | Aprovação | Preço de referência | Em aberto | ADRs |
|---|---|---|---|---|
| Petróleo (10 fatores) | David, em reunião, 2026-10-03; respostas por escrito a caminho | Brent, desde 2026-10-04 | Os fatores seguem marcados como proposta no código até as respostas por escrito; faixas provisórias; peso e agregação (ponto 3 da conversa) | ADRs 0050, 0051 e 0052 |
| Ouro (8) | David, 2026-10-03 | GLD da B3, vencimento mais próximo | Instrumento (ponto 1); série contínua do GLD: o horizonte de 90 dias fica muitas vezes sem a variação (ADR 0044); faixas provisórias; peso e agregação | ADRs 0053 e 0054 |
| Milho (8) | Comitê, 2026-10-04 (Motor do Milho v0) | CCM | Peso por mês e agregação: no prompt como tabela fixa e orientação em texto desde 2026-10-05, por decisão do usuário, à espera do Comitê; o peso do F1 de janeiro a maio e do F2 em janeiro e fevereiro (por ora, o do FEL 1); agregação em código (etapa 5) (ADRs 0059 e 0065); vencimentos do CCM por horizonte; faixas provisórias, recalibradas no próprio CCM na configuração v2 em 2026-10-05 (ADR 0058, adendo; as classes fixas do David seguem como alternativa); base do F4 (Campinas − MT, quase sempre positiva) | ADRs 0055, 0056, 0057, 0058, 0059 e 0065 |
| Café (8) | Comitê, 2026-10-05 (Motor do Café v1) | ICF | Faixas (o período do ICF é de alta forte); vencimentos do ICF por horizonte; janelas críticas do clima e índice do INMET; como os dados novos entram no F3 e no F6 (ADR 0061); agregação em código em produção (ADR 0066): a validar pelo Comitê, com o histórico no servidor e o backtest | ADRs 0060, 0061, 0062 e 0066 |
| **Comum aos quatro** | — | — | Eventos vão à IA sem validação humana (ponto 4); o formato de apresentação; o horizonte de 90 dias dos três futuros não tem preço na avaliação (o contrato da leitura vence antes; ADR 0064) | ADRs 0055 e 0064 |

**Etapa 1 em detalhe**

| Momento | O que acontece | Responsável |
|---|---|---|
| 1a. Reunião | **Feita em 2026-10-01**: perguntas 2, 3 e 8 respondidas (seguir com o histórico disponível) | FinMind apresenta, Comitê responde |
| 1b. Retorno | **Feito em 2026-10-03**: documento do David com as respostas P1 a P16, a confirmação da §5 e o Motor do Milho v0 | Comitê |
| 1c. Registro | **Feito em 2026-10-04**: respostas no §4 e no ADR 0055 | FinMind |
| 1d. Conversa | Os 10 pontos em aberto (instrumento do ouro e do petróleo, formato da leitura da IA, peso e agregação, validação dos eventos, paridade, insumos, critérios do backtest, fontes novas, tendência e recomendação, Motor do Milho v0): `docs/conversa-david-respostas-fel1.md`, com espaço para a resposta | Welerson com o David |

</details>

<details>
<summary>2. Pronto</summary>

<details>
<summary>Plataforma</summary>

| Item | Detalhe |
|---|---|
| Autenticação e papéis (`admin`/`user`) | Cookie JWT httpOnly, sessão de 12h (sem refresh token), revalidação a cada request, gestão de usuários |
| Espaços (`workspace`) | Espaço pessoal + compartilhados, seletor na sidebar. **Ainda sem dado privado** — ADR 0007 |
| Pipeline de coleta | Download → parse → normalize → persist, retry, log em `collection_execution` — ADR 0002 |
| Camada point-in-time | Tabela `observation` append-only + `asOf()` — ADR 0008 |
| Fator versionado | `backend/src/factors/juro-real-10a.factor.js`: juro real 10a = `DFII10`, com `DGS10 − T10YIE` como validação cruzada (5.932 de 5.932 datas iguais). Não exposto na tela |
| Tela "Status do projeto" | `/status-projeto` (menu Sistema): renderiza este arquivo, via `GET /api/v1/status-projeto`. Visível a **todo usuário autenticado** — temporária, a retirar depois da fase de desenvolvimento. O `deploy.yml` copia o arquivo para a imagem do backend |
| Centro de Decisão | A tela inicial (`/`), no desenho do AgroMind: para um ativo (ouro, petróleo, milho, café) e uma data, o preço como era conhecido no fim daquele dia (point-in-time, com troca de série, mini-gráfico e variações; futuros pelo vencimento mais próximo, sem emendar) e a leitura de geopolítica da data, com os eventos da semana. Nos quatro ativos, o espaço da análise mostra a leitura diária de tendência da IA nos quatro horizontes (ADRs 0052, 0054, 0058 e 0062). Nenhum sinal de compra ou venda é gerado — ADR 0048 |
| Qualidade da IA | `/qualidade-ia`: por ativo e horizonte, o que a IA leu contra o que o preço fez, em direção e faixa, contra os benchmarks Sempre Lateral e Persistência nas mesmas linhas, com o n e as linhas de cada número; o gráfico "faixas lidas × preço" mostra cada leitura na data-alvo, com os quatro horizontes lado a lado; sem índice único nem cor de acerto — ADR 0064 |
| Telas de dados | `/dados-mercado/observaveis` (60 cards) e `/dados-mercado/execucoes` — ADR 0005 |
| Banco de dados | **PostgreSQL 16** desde 2026-09-26 (antes MariaDB): servidor compartilhado da VM (repositório `servidor02-infra`), database e usuário próprios do FinMind. Backup diário `pg_dump` (7 diários + 4 semanais) e backup semanal do disco — ADR 0026 |
| Produção | VM `servidor02` (Oracle Always Free, Ampere A1 arm64, 2 OCPU / 12 GB), `https://finmind.weslab.com.br` pelo Nginx Proxy Manager — `docs/architecture.md` § "Deploy" |
| Agendamento | Dev: Agendador do Windows às 22:00. Produção: cron do usuário `deploy` na `servidor02` (coleta 04:00, 06:00, 08:00 **UTC**; backup 10:00 UTC, **não versionado**) — ADR 0004, ADR 0026 |
| CI/CD | Lint + testes + build em toda branch; deploy por push na `main` (imagens `linux/arm64` num runner ARM nativo), que já roda as migrations automaticamente (`scripts/deploy.sh`, passo 4/6) |

</details>

<details>
<summary>Resumo das fontes</summary>

| Ativo | O que temos | Preço |
|---|---|---|
| Milho | Lavoura e clima dos EUA (Crop Progress, NOAA STAR), balanço mundial (WASDE), estoques trimestrais e área plantada dos EUA (USDA), safra, balanço e paridade de exportação do Brasil (Conab) e de MT (IMEA), exportação total e por destino (Comex Stat), etanol (EIA), posição dos fundos (CFTC) | Futuro CCM da B3, desde 2022; Indicador CEPEA/ESALQ, desde 2018 |
| Café | Safra e custo de produção (Conab), clima (NOAA STAR), balanço por país (USDA PSD), estoques certificados (ICE), exportação (Comex Stat e Cecafé), posição dos fundos (CFTC) | Futuro ICF da B3, desde 2022; preço mensal do FMI, desde 1992 |
| Ouro | Juros, inflação e meta do Fed, índices do dólar e moedas da cesta do DXY (FRED), ouro dos bancos centrais (FMI), ETFs e oferta e demanda (World Gold Council), posição dos fundos (CFTC) | LBMA de 1968 a 2026-09-30 (encerrada); futuro GLD da B3, desde 2025-07-21 |
| Petróleo | Estoques, produção, refino e consumo dos EUA (EIA), produção do Brasil (ANP), produção e demanda por país (JODI), posição dos fundos (CFTC) | WTI à vista (EIA), desde 1986; o futuro é pago |
| Comum a todos | Dólar (PTAX), Selic, expectativas do Focus e reservas internacionais (BCB) | — |

**Quem interpreta esses dados:** os fatores de cada ativo e a leitura diária de tendência da IA, nos quatro ativos (§1,
"Próximos passos"). A agregação dos fatores em código, os sinais, o backtest e a execução de ordens seguem vazios, à
espera das definições do David (ver `CLAUDE.md`, "Restrições permanentes"). O desenho já está decidido: o motor prepara
a base (fatores e regras do Comitê) e a IA gera a leitura, que uma pessoa decide se segue (§5).

### Fontes

Nenhuma fonte entra sem **reconhecimento técnico prévio**: um checklist de 11 perguntas (API, chave, formato,
histórico, revisões, data de publicação, limite de uso, **licença**, riscos), respondido com **chamada real** e não com
suposição (`docs/processo-reconhecimento-fontes.md`). O relatório FEL 1 catalogou 42 fontes sem testar nenhuma; é este
processo que separa "catalogada" de "confirmada". **Nível de maturidade**, de 0 a 5: 0 identificada · 1 reconhecimento
concluído · 2 modelo definido · 3 coletor implementado · 4 coleta validada · 5 histórico carregado. Nível alto não quer
dizer "sem ressalvas": a coluna de ressalvas é a que importa.

Uma linha por fonte coletada, agrupadas por origem (Brasil, EUA, internacional): fonte · ativos · acesso · nível ·
status. **Clique numa fonte** para ver o acesso, a ressalva principal, a evidência (ADRs) e as séries dela. Uma série é
um card da tela de Observáveis; aqui só entra o que muda quando acontece algo (uma série nova, uma que fecha): a última
data, a situação ("em dia" ou "atrasada") e o histórico de cada uma estão na própria tela.

<details>
<summary>BCB (SGS e Focus) · Todos · API · nível 5 · Dev e servidor</summary>

**Acesso:** API REST e OData (JSON). **Ressalva principal:** Data de publicação **estimada** no Focus e nas reservas; a meta da Selic traz datas futuras (o alvo vigente até o próximo Copom, não uma previsão); só o endpoint anual do Focus. **Evidência:** ADRs 0001, 0006, 0022, 0023.

| Série | O que tem | Frequência | Desde | `published_at` | Status |
|---|---|---|---|---|---|
| Dólar (USD/BRL) | PTAX de venda | Diária | 1994-07-01 | — (cotação, não revisa) | Dev e servidor |
| Taxa Selic | Meta e realizada | Diária | Realizada 1994-07-04; meta 1999-03-05 | — (não revisa) | Dev e servidor |
| Expectativas do Focus | Mediana de IPCA, Selic e câmbio de fim de ano, por ano-calendário (o corrente e até 4 à frente) | Semanal | 2000-01-07 | Estimado (1º dia útil depois da semana do boletim) | Dev e servidor |
| Reservas internacionais | Total diário (SGS 13621), US$ milhões | Diária | 1998-09-01 | Estimado (dia útil seguinte) | Dev e servidor |

</details>

<details>
<summary>Comex Stat (MDIC) · Milho, café · API · nível 5 · Dev e servidor</summary>

**Acesso:** API (JSON, sem chave). **Ressalva principal:** Milho só desde 2005 (NCM anterior não mapeado); café só o verde; revisões da fonte não confirmadas; limite de requisições rígido (429). **Evidência:** ADRs 0013, 0028, 0034.

| Série | O que tem | Frequência | Desde | `published_at` | Status |
|---|---|---|---|---|---|
| Milho - exportação (volume e valor FOB) | kg e US$, total do Brasil | Mensal | 2005-01 | Estimado (dia 15 do mês seguinte) | Dev e servidor |
| Exportação de milho por destino | Volume e valor FOB por país de destino | Mensal | 2005-01 | Estimado (dia 15 do mês seguinte) | Dev e servidor |
| Café - exportação (volume e valor FOB) | Café verde (NCM 09011110) | Mensal | 1997-01 | Estimado (dia 15 do mês seguinte) | Dev e servidor |

</details>

<details>
<summary>Conab · Milho, café · XLSX/XLS por levantamento · nível 4–5 · Dev e servidor</summary>

**Acesso:** XLSX/XLS por levantamento (página HTML). **Ressalva principal:** **Versões só desde fev/2025 (milho) e jan/2023 (café)**: antes disso a Conab não mantém as páginas; sem API (quebra se o layout mudar); o custo do café não tem data de publicação; **preço mínimo do café bloqueado por reCAPTCHA**. **Evidência:** ADRs 0017, 0029, 0043.

| Série | O que tem | Frequência | Desde | `published_at` | Status |
|---|---|---|---|---|---|
| Milho por safra e UF | Área, produtividade e produção da 1ª, 2ª e 3ª safra e do total, por região e UF | Por safra, revista a cada levantamento mensal | Versões desde fev/2025 | Real (data e hora do levantamento); limite superior nas safras antigas | Dev e servidor |
| Milho - balanço nacional | Estoques, produção, importação, suprimento, consumo, exportação e demanda | Por safra, revista a cada levantamento | Safras desde 2018/19; versões desde fev/2025 | Real | Dev e servidor |
| Café - safra por região e UF | Área, produtividade e produção do total, do arábica e do conilon | Por safra, 3 ou 4 levantamentos por ano | Versões desde jan/2023 | Real (estimado num levantamento republicado) | Dev e servidor |
| Café arábica e conilon - custo de produção | Custo variável, fixo, operacional e total, em R$/ha e R$/saca, por município | Anual | Arábica 2003; conilon 2007 | Não informado (data da coleta) | Dev e servidor |

</details>

<details>
<summary>IMEA · Milho · API, XLSX e PDF · nível 4–5 · Dev e servidor</summary>

**Acesso:** API JSON não documentada, XLSX e PDF lido por coordenada. **Ressalva principal:** Só Mato Grosso; safra e custo **sem histórico de versões** (começa agora); PDFs sem contrato (quebram se o layout mudar); indicadores da API sem nome; licença não investigada. **Evidência:** ADRs 0018, 0019, 0039, 0057.

| Série | O que tem | Frequência | Desde | `published_at` | Status |
|---|---|---|---|---|---|
| Milho de MT por safra e região | Área, produção e produtividade de MT e das 7 regiões | Por safra | Safras desde 2022/23; versões desde 2026-09-22 | Real (só a data) | Dev e servidor |
| Custo do milho, por mês e por safra | ~62 itens por hectare, Alta e Média Tecnologia | Mensal e por safra | Versões desde 2026-09-15 | Real (só a data) | Dev e servidor |
| Milho - balanço de oferta e demanda | Estoques, produção, importação, consumo em MT e interestadual, exportação, aquisições públicas | Mensal (uma edição por mês) | Edições desde 2014-04-14 | Real (só a data) | Dev e servidor |
| Milho de MT - andamento da semeadura e da colheita | % acumulado da área semeada e colhida, em MT e nas 7 regiões | Semanal, na safra | Semeadura 2012/13; colheita 2015/16 | Estimado (dia do informe) | Dev e servidor |
| Milho de MT - paridade de exportação | A paridade calculada pelo IMEA (R$/saca), do Boletim Semanal; contrato de referência na metadata | Diária (boletim semanal) | 2021-05-31 | Real (só a data da edição) | Dev e servidor |

</details>

<details>
<summary>Cecafé · Café · HTML · nível 4 · Dev e servidor</summary>

**Acesso:** HTML (tabelas da página, raspadas). **Ressalva principal:** **Histórico só desde 2026-10-01** (a página mostra dois meses; o mensal antigo só em PDFs, proibidos a robôs); números diferentes dos do Comex Stat (etapas diferentes da exportação). **Evidência:** ADR 0038.

| Série | O que tem | Frequência | Desde | `published_at` | Status |
|---|---|---|---|---|---|
| Café - certificados de origem, despachos aduaneiros e embarques (3 cards) | Acumulado do mês, por unidade (Santos, Vitória, Rio, Salvador, MG, outros, total) e por tipo (arábica, conilon, solúvel), em sacas | Diária (acumulado do mês) | 2026-08 (a página mostra só o mês atual e o anterior) | Data da fonte ("informações recebidas até"), horário estimado | Dev e servidor |

</details>

<details>
<summary>B3 — futuros (CCM, ICF, GLD) · Milho, café, ouro · CSV e PDF · nível 5 (limitado) · Dev e servidor</summary>

**Acesso:** CSV do Up2Data e PDF do Boletim Diário. **Ressalva principal:** **Histórico curto**: CCM e ICF desde 2022-03-21, com buraco de ~9 meses em 2023; GLD desde 2025-07-21. Contratos em aberto só até 2025-12-11. O GLD é um futuro, não o fixing: emendá-lo à LBMA é cálculo. Decisões: David (se o GLD faz o papel do preço do ouro). **Evidência:** ADRs 0009, 0020, 0028, 0044.

| Série | O que tem | Frequência | Desde | `published_at` | Status |
|---|---|---|---|---|---|
| Milho B3 (CCM) - preços | Ajuste, último, máxima, mínima, médio, abertura e oscilação, por vencimento (R$/saca) | Diária | 2022-03-21 (buraco de ~9 meses em 2023) | Estimado (fim do pregão) | Dev e servidor |
| Milho B3 (CCM) - liquidez | Contratos, negócios, volume financeiro; contratos em aberto só até 2025-12-11 | Diária | 2022-03-21 | Estimado | Dev e servidor |
| Café arábica B3 (ICF) - preços | Os campos do CCM, em US$/saca | Diária | 2022-03-21 (o mesmo buraco de 2023) | Estimado | Dev e servidor |
| Café arábica B3 (ICF) - liquidez | Os campos do CCM; contratos em aberto só até 2025-12-11 | Diária | 2022-03-21 | Estimado | Dev e servidor |
| Ouro B3 (GLD) - preços | Ajuste, último, máxima, mínima, médio e oscilação (sem abertura), em US$/oz | Diária | 2025-07-21 (1º pregão) | Estimado | Dev e servidor |
| Ouro B3 (GLD) - liquidez | Contratos, negócios e volume financeiro (sem contratos em aberto) | Diária | 2025-07-21 | Estimado | Dev e servidor |

</details>

<details>
<summary>B3 — Indicador do Milho CEPEA/ESALQ · Milho · TXT em ZIP · nível 5 · Dev e servidor desde 2018-06-08</summary>

**Acesso:** TXT de largura fixa em ZIP (arquivo `Indic`). **Ressalva principal:** Só desde 2018-06-08 (antes, só pelo site da CEPEA, que bloqueia automação); US$ difere por centavos do da CEPEA. **Evidência:** ADR 0021.

| Série | O que tem | Frequência | Desde | `published_at` | Status |
|---|---|---|---|---|---|
| Milho - Indicador CEPEA/ESALQ | À vista, em R$ e US$ por saca | Diária | 2018-06-08 | Estimado (fim do pregão) | Servidor desde 2018-06-08; dev desde 2021 |

</details>

<details>
<summary>ANP · Petróleo · CSV · nível 4 · Dev e servidor</summary>

**Acesso:** CSV (dados abertos, sem chave). **Ressalva principal:** Arquivo substituído todo mês, sem versões; data dos meses anteriores ao último estimada; o total do Brasil não é gravado (é soma das UFs). **Evidência:** ADR 0041.

| Série | O que tem | Frequência | Desde | `published_at` | Status |
|---|---|---|---|---|---|
| Petróleo Brasil - produção por UF | Óleo e condensado, no mar e em terra, por UF, em m³ | Mensal | 1997-01 | Real no mês mais recente; estimado nos anteriores (fim do mês seguinte) | Dev e servidor |

</details>

<details>
<summary>FRED · Ouro, petróleo · API · nível 5 · Dev e servidor</summary>

**Acesso:** API REST (JSON, com chave); CSV de reserva. **Ressalva principal:** Data de publicação **estimada**; **o DXY não é coletado** (licenciado): temos os índices do Fed e as 6 moedas da cesta, e remontá-lo é cálculo do David; licença adiada (uso interno). **Evidência:** ADRs 0009, 0011, 0012, 0033.

| Série | O que tem | Frequência | Desde | `published_at` | Status |
|---|---|---|---|---|---|
| Treasury 10 anos | Nominal (DGS10), real (DFII10) e inflação implícita (T10YIE) | Diária | DGS10 1962; DFII10 e T10YIE 2003 | Estimado (dia útil seguinte) | Dev e servidor |
| Índices do dólar (Fed) | Amplo (DTWEXBGS) e contra as economias avançadas (DTWEXAFEGS); **não é o DXY** | Diária | 2006 | Estimado (segunda seguinte: divulgação semanal) | Dev e servidor |
| Câmbio - moedas da cesta do DXY | Euro, iene, libra, dólar canadense, coroa sueca e franco suíço | Diária | 1971 (euro 1999) | Estimado (segunda seguinte) | Dev e servidor |
| Meta de juros do Fed (FOMC) | Limites superior e inferior da faixa (desde 2008-12-16) e alvo único (até 2008-12-15) | Diária | 1982-09-27 | O próprio dia | Dev e servidor |

</details>

<details>
<summary>FRED (ALFRED) · Ouro, café · API · nível 5 · Dev e servidor</summary>

**Acesso:** API REST (JSON, com chave; sem reserva). **Ressalva principal:** Exige a chave; no café, a data é a de chegada ao FRED, que já ficou 706 dias sem atualizar (limite superior da publicação do FMI); o café é mensal (ciclos longos, não regras diárias). **Evidência:** ADRs 0033, 0045.

| Série | O que tem | Frequência | Desde | `published_at` | Status |
|---|---|---|---|---|---|
| Inflação ao consumidor dos EUA (CPI) | Cheio e núcleo com ajuste sazonal, cheio sem ajuste, **com todas as versões** | Mensal | Cheio 1947 (sem ajuste 1913); núcleo 1957 | Real (data de cada versão); limite superior antes da 1ª versão | Dev e servidor |
| Café - preço mensal do FMI | Arábica (Other Mild Arabica) e robusta, US¢/lb, **com todas as versões** | Mensal | 1992-01 | Real, do FRED (limite superior da publicação do FMI) | Dev e servidor |

</details>

<details>
<summary>CFTC COT · Todos · API · nível 5 · Dev e servidor</summary>

**Acesso:** API Socrata (JSON). **Ressalva principal:** Data de publicação estimada antes de 2022-08. **Evidência:** ADRs 0009, 0028, 0040.

| Série | O que tem | Frequência | Desde | `published_at` | Status |
|---|---|---|---|---|---|
| COT - ouro (COMEX), milho (CBOT), café arábica (ICE Coffee C) e petróleo WTI (NYMEX) (4 cards) | Contratos em aberto, managed money comprado e vendido | Semanal | 2006 | Real desde 2022-08; estimado antes | Dev e servidor |

</details>

<details>
<summary>USDA NASS — Crop Progress · Milho · API · nível 5 · Dev e servidor</summary>

**Acesso:** API QuickStats (JSON, com chave). **Ressalva principal:** Data de publicação estimada, regra não validada para 1980–2005. **Evidência:** ADR 0009.

| Série | O que tem | Frequência | Desde | `published_at` | Status |
|---|---|---|---|---|---|
| Milho EUA - condição da lavoura | % muito ruim, ruim, regular, boa e excelente | Semanal (abr a nov) | 1980 (cada série no seu ano) | Estimado | Dev e servidor |
| Milho EUA - progresso da safra | % plantado, emergido, embonecamento, grão pastoso, dentado, maduro e colhido | Semanal (abr a nov) | 1980 | Estimado | Dev e servidor |

</details>

<details>
<summary>USDA (ESMIS) — WASDE, área plantada e Grain Stocks · Milho · HTML e arquivos · nível 5 · Dev e servidor</summary>

**Acesso:** HTML da listagem (raspado) + XLS/CSV de cada edição. **Ressalva principal:** **WASDE só desde 2011, área e estoques só desde 2001** (antes, só PDF/TXT); listagem raspada, sem API confirmada; **em banco novo, o backfill vem ANTES da coleta diária**; licença não confirmada. **Evidência:** ADRs 0015, 0027, 0035.

| Série | O que tem | Frequência | Desde | `published_at` | Status |
|---|---|---|---|---|---|
| Milho EUA (WASDE) | Balanço por safra: 13 atributos e o milho usado para etanol | Mensal (uma edição por mês) | Edições desde 2011-01 | Real (data do release), com as versões | Dev e servidor |
| Milho por país (WASDE) | ~20 regiões, 7 atributos | Mensal | Edições desde 2011-01 | Real, com as versões | Dev e servidor |
| Milho EUA - área plantada | Intenção de plantio (fim de março) e área plantada (fim de junho) | 2 edições por ano | Edições desde 2001-06-29 | Real (só a data), com as versões | Dev e servidor |
| Estoques trimestrais de milho dos EUA (Grain Stocks) | Total, na fazenda e fora da fazenda, em 1º de dez, mar, jun e set | Trimestral | Edições desde 2001-06-29 | Real (só a data), com as versões | Dev e servidor |

</details>

<details>
<summary>USDA FAS — PSD do café · Café · CSV em ZIP · nível 4 · Dev; servidor pela coleta diária</summary>

**Acesso:** CSV dentro de ZIP (sem chave). **Ressalva principal:** **Sem histórico de versões** (só o valor atual): versões a partir da 1ª coleta; sem total mundial. **Evidência:** ADR 0031.

| Série | O que tem | Frequência | Desde | `published_at` | Status |
|---|---|---|---|---|---|
| Café - balanço por país (USDA PSD) | Produção (total, arábica, robusta), estoque final, consumo, exportação e importação, em mil sacas | Por safra | Safras desde 1960; versões desde a 1ª coleta | Estimado (fim do mês da última revisão) | Dev; servidor pela coleta diária |

</details>

<details>
<summary>EIA · Milho, petróleo · XLS · nível 4–5 · Dev e servidor</summary>

**Acesso:** XLS (planilha histórica de cada série, sem chave). **Ressalva principal:** Data de publicação **estimada**; só o valor atual (sem versões); **preço à vista, não o futuro**, que a EIA obtém de fornecedor comercial e pode deixar de publicar. **Evidência:** ADRs 0024, 0040.

| Série | O que tem | Frequência | Desde | `published_at` | Status |
|---|---|---|---|---|---|
| Etanol EUA - produção e estoques | Produção (mil barris/dia) e estoques (mil barris) | Semanal | 2010-06-04 | Estimado (quarta do relatório) | Dev e servidor |
| Petróleo EUA - estoques | Petróleo sem e com a reserva estratégica, Cushing, gasolina e destilados | Semanal | 1982 a 2004, conforme a série | Estimado (quarta do relatório) | Dev e servidor |
| Petróleo EUA - produção, refino e comércio | Produção, petróleo processado, utilização das refinarias, importação, exportação e derivados fornecidos (consumo) | Semanal | 1982 a 2004, conforme a série | Estimado | Dev e servidor |
| Petróleo e derivados - preço à vista | WTI, Brent, gasolina e diesel de Nova York | Diária | WTI 1986; Brent 1987 | Estimado (uma vez por semana, com o relatório) | Dev e servidor |

</details>

<details>
<summary>NOAA STAR · Milho, café · texto · nível 5 · Dev e servidor</summary>

**Acesso:** Texto (link de dados da página oficial, sem chave). **Ressalva principal:** **Endpoint não documentado**; a NOAA reprocessa o histórico (versões só daqui para frente); mede o efeito do clima já ocorrido, não é previsão nem alerta de geada; no Brasil não separa arábica de conilon. **Evidência:** ADRs 0025, 0030, 0031.

| Série | O que tem | Frequência | Desde | `published_at` | Status |
|---|---|---|---|---|---|
| Clima sobre o milho - saúde da vegetação | VHI, VCI (umidade) e TCI (calor) sobre a área do milho, em 18 regiões (mundo, hemisférios, 5 países, 5 UFs, 5 estados dos EUA) | Semanal | 1982 | Estimado (dia seguinte ao fim da semana) | Dev e servidor |
| Clima sobre o café - saúde da vegetação | Os mesmos índices sobre a área do café, em 19 regiões (Brasil e 5 UFs, os 7 maiores produtores depois do Brasil, mundo e hemisférios) | Semanal | 1982 | Estimado | Dev e servidor |

</details>

<details>
<summary>FMI — IRFCL · Ouro · API · nível 4 · Dev e servidor</summary>

**Acesso:** API SDMX (JSON, sem chave). **Ressalva principal:** **Sem data de publicação nem versões**; volume em unidade errada em Brasil, Angola e Chile (marcado, não corrigido); sem total mundial; restrição a download em massa (risco aceito). **Evidência:** ADR 0036.

| Série | O que tem | Frequência | Desde | `published_at` | Status |
|---|---|---|---|---|---|
| Ouro nas reservas dos bancos centrais | Volume (milhões de onças troy) e valor (US$ milhões), por país e 2 agregados | Mensal | 1999-12 | Não informado (data da coleta) | Dev e servidor |

</details>

<details>
<summary>World Gold Council · Ouro · API interna · nível 4 · Dev e servidor</summary>

**Acesso:** API JSON interna dos gráficos (sem documentação). **Ressalva principal:** ⚠️ **Licença só pessoal e não comercial**: uso interno, risco aceito; pedir permissão antes de uso comercial. Sem data de publicação nem versões. **Evidência:** ADR 0037.

| Série | O que tem | Frequência | Desde | `published_at` | Status |
|---|---|---|---|---|---|
| Ouro em ETFs por região | Estoque (toneladas) e patrimônio (US$ milhões) | Semanal | 2003-02-28 | Não informado (data da coleta) | Dev e servidor |
| Ouro - oferta e demanda | 17 linhas: bancos centrais, ETFs, barras e moedas, joalheria, tecnologia, produção das minas, reciclagem, hedge | Trimestral | 1º tri/2010 | Não informado | Dev e servidor |

</details>

<details>
<summary>LBMA · Ouro · feed JSON · nível 5 (encerrada) · Coleta encerrada</summary>

**Acesso:** Feed JSON público (não documentado). **Ressalva principal:** ⛔ **Feed fechado em 2026-10-01**: o histórico continua no card, até 2026-09-30; dado novo só com licença da IBA. **O preço diário do ouro passou a vir do futuro GLD da B3** (ver "B3 — futuros" acima), com histórico desde 2025-07-21 e liquidado pelo próprio LBMA Gold Price; se ele faz o papel de preço de referência, e como emendar as duas séries, é decisão do David. **Evidência:** ADR 0044.

| Série | O que tem | Frequência | Desde | `published_at` | Status |
|---|---|---|---|---|---|
| Ouro - LBMA Gold Price PM | US$/oz | Diária | 1968-04-01 **a 2026-09-30** | Estimado (15:00 Londres) | ⛔ Encerrada em 2026-10-01; substituída pelo GLD da B3 |

</details>

<details>
<summary>ICE — estoques certificados · Café · XLS · nível 5 · Servidor desde 2016-01-04; dev só um trecho de teste</summary>

**Acesso:** XLS por pregão (arquivo público, sem documentação). **Ressalva principal:** ⚠️ **Os termos de uso da ICE excluem robôs**: uso interno, risco aceito. Das sacas aguardando classificação, só o total (o bloco muda de formato com os anos). **Evidência:** ADRs 0032 e 0061.

| Série | O que tem | Frequência | Desde | `published_at` | Status |
|---|---|---|---|---|---|
| Café - estoques certificados da ICE | Sacas certificadas por origem e o total | Diária (por pregão) | 2016-01-04 | Real (`Last-Modified` do arquivo) | Servidor desde 2016-01-04; dev só um trecho de teste |
| Café - sacas aguardando classificação (ICE) | O total do *Pending Grading Report* (sacas entregues e ainda não classificadas) | Diária (por pregão) | 2016-01-04 | Real (`Last-Modified` do arquivo) | Dev de ago a out/2026; servidor: backfill pendente |

</details>

<details>
<summary>ICO — Coffee Market Report · Café · PDF mensal · nível 4 · Dev; servidor pendente</summary>

**Acesso:** PDF mensal público, sem chave; reuso livre citando a ICO. **Ressalva principal:** **mensal e revisado**: a fonte corrige os próprios erros no relatório seguinte (cada correção fica com a data do relatório que a trouxe); `published_at` real só de out/2023 em diante (antes, estimado em fim do mês + 45 dias); 9 tabelas são imagem ou PDF ilegível (2015 a 2017) e ficam de fora. **Evidência:** ADR 0061.

| Série | O que tem | Frequência | Desde | `published_at` | Status |
|---|---|---|---|---|---|
| Café - preços e estoques certificados da ICO (mensal) | Preço médio do mês por grupo (I-CIP, Colombian Milds, Other Milds, Brazilian Naturals, Robustas) e dos futuros de Nova York e Londres, US¢/lb; estoques certificados de Nova York e Londres, milhões de sacas | Mensal | 2011-10 (preços); 2012-06 (estoques) | Real desde out/2023; antes, estimado | Dev; servidor: backfill pendente |

</details>

<details>
<summary>ECF — estoques nos portos europeus · Café · PDF · nível 4 · Dev; servidor pendente</summary>

**Acesso:** PDF anual público, substituído a cada 2 meses; `robots.txt` livre. **Ressalva principal:** **~2 meses de atraso e revisado**; erros de digitação da fonte tratados como aviso; inclui os certificados da ICE nos portos (dupla contagem com Londres da ICO); licença não lida, uso interno. **Evidência:** ADR 0061.

| Série | O que tem | Frequência | Desde | `published_at` | Status |
|---|---|---|---|---|---|
| Café - estoques nos portos europeus (ECF) | Toneladas no fim do mês, por tipo (robusta, arábica natural, arábica lavado) e o total | Mensal (publicação bimestral) | 2020-01 | Real (`Last-Modified` de cada versão do PDF) | Dev; servidor: backfill pendente |

</details>

<details>
<summary>JODI · Petróleo · CSV em ZIP · nível 4 · Dev e servidor</summary>

**Acesso:** CSV dentro de ZIP (download público, sem chave). **Ressalva principal:** **Lacunas da fonte**: produção do Brasil até 2022, da Rússia até 2023, sem Guiana; demanda sem a Rússia, Brasil até 2022; sem versões; ~840 MB de memória na coleta da demanda. **Evidência:** ADRs 0042, 0046.

| Série | O que tem | Frequência | Desde | `published_at` | Status |
|---|---|---|---|---|---|
| Petróleo - produção por país | Petróleo bruto, mil barris/dia, com o código de avaliação do JODI | Mensal | 2002-01 | Real (`Last-Modified` do arquivo); limite superior no histórico | Dev e servidor |
| Petróleo - demanda por país | Total de derivados, mil barris/dia, com o código de avaliação | Mensal | 2002-01 (China 2004) | Real (`Last-Modified`); limite superior no histórico | Dev e servidor |

</details>

<details>
<summary>Eventos de mercado por IA (Gemini com busca na web) · Ouro, petróleo, milho, café · API · nível 4 · Dev e servidor</summary>

**Acesso:** uma chamada diária ao Gemini com Google Search (chave gratuita `GEMINI_API_KEY_FREE` primeiro; a paga, `GEMINI_API_KEY`, só no 429 ou 5xx persistente), orientada a uma lista única de 11 fontes autorizadas para os quatro ativos (desde 2026-10-02, ADR 0049): UKMTO/JMIC, Tesouro dos EUA, OPEP, AP News, USTR, Casa Branca, MOFCOM, Comissão Europeia, MAPA (`gov.br/agricultura`), USDA FAS e INMET. Sete tipos de evento (a geopolítica é um deles), cada evento com os ativos afetados e o fator do FEL 1 de cada um. O evento só é aceito com uma página de fonte autorizada, conferida pela URL, que a pesquisa leu e ligou ao texto dele: a citação da IA não basta. **Ressalva principal:** **não é série nem é reproduzível**: uma leitura por dia (nível e resumo de cada ativo e os eventos), que vale da 1ª coleta em diante, sem backtest; a escala de níveis é provisória (a régua é do David); evento sem página de fonte autorizada é rejeitado e não vai ao Motor; preço, produção, exportação, estoque e relatórios periódicos não viram evento (já são observáveis). **Evidência:** ADRs 0047 e 0049.

| Série | O que tem | Frequência | Desde | `published_at` | Status |
|---|---|---|---|---|---|
| Eventos de mercado - leitura do dia (ouro, petróleo, milho e café) | Nível (NORMAL, ATENÇÃO, RELEVANTE, EXCEPCIONAL) e resumo de cada ativo; eventos com tipo, ativos, fator do FEL 1, canal de transmissão, pressão e fontes; entregue ao Motor por `geopolitica.service.js` | Diária | 2026-10-02 (milho e café também; no servidor, a leitura de 2026-10-02 refeita com duas chamadas: success, 56 s, 0 falhas) | Não se aplica (data de referência = o dia em São Paulo) | Dev e servidor; telas `/dados-mercado/eventos` e Centro de Decisão (ADR 0048) |

</details>

Fontes **avaliadas e não coletadas** (adiadas, aguardando o Comitê ou descartadas: Pink Sheet do Banco Mundial, US
Treasury, FAO/AMIS, PSD do milho, séries históricas da Conab, as fontes de clima do FEL 1, frete, Abimilho e CNA, a
paridade de exportação do IMEA...): `docs/reconhecimento-fontes/README.md`, uma linha por fonte, com a evidência.
Cruzamento com os fatores do milho e do ouro: `docs/cobertura-fatores-fel1-milho-ouro.md`.

</details>

</details>

<details>
<summary>3. Falta fazer</summary>

A aquisição de dados está encerrada (§1): o que falta é trabalho sobre os dados já coletados, conforme as decisões do
David e do Comitê. O histórico das ondas de coleta (milho e ouro, café, petróleo) está nas "Entregas realizadas" (§7) e
no ADR de cada fonte.

### O que falta

| Item | Situação |
|---|---|
| Pontos em aberto do motor | Por ativo, na tabela "O motor por ativo" (§1); dependem da conversa com o David |
| Série contínua do GLD (ouro) | O horizonte de 90 dias do ouro fica muitas vezes sem a variação de 90 dias, porque cada vencimento do GLD tem pouco histórico e nada é emendado (ADR 0054). Emendar os vencimentos é um cálculo do David (ADR 0044) |

**Fontes candidatas** (só com uma demanda específica do David, do Comitê ou do usuário): 
ICO, geada, preço mínimo do café pelas portarias do MAPA, Baker Hughes, OPEP, API internacional da EIA e os derivados
do JODI, com o fator que cada uma atenderia, em `docs/reconhecimento-fontes/README.md`.

### Infraestrutura pendente

Nenhuma no momento (a última, as chaves do Gemini no `.env` do servidor para a geopolítica, foi resolvida em
2026-10-02, ADR 0047).

### Carga histórica pendente no servidor

Backfills já validados em dev que ainda não rodaram na VM. Ao rodar, tirar a linha daqui e marcar "dev e servidor"
no status da fonte e da série em "Fontes" (§2).

- **ICO** (ADR 0061): `npm run backfill:ico-cafe`, ~8 min, **antes** da 1ª coleta diária com o coletor novo. Dev:
  1.595 valores, 127 revisões.
- **ECF** (ADR 0061): `npm run backfill:ecf-cafe`, < 1 min, também antes da coleta diária. Dev: 312 valores, 8
  revisões.
- **ICE, sacas aguardando classificação** (ADR 0061): `npm run backfill:ice-cafe-estoques -- --serie=pendente`, em
  segundo plano (~15 h, o mesmo ritmo do backfill original).

As anteriores (Grain Stocks, etanol do WASDE, exportação de milho por destino, ouro do FMI, World Gold Council, Cecafé e
andamento do IMEA) rodaram no servidor em 2026-10-01, com os mesmos números de dev.

A PSD do café não precisa de backfill: a 1ª coleta diária depois do deploy é a carga (ADR 0031). O mesmo vale para as séries do ouro no FRED e o CPI (ADR 0033), que baixam a série inteira, com todas as versões, a cada coleta, e para o petróleo (EIA e COT do WTI, ADR 0040; ANP, ADR 0041; JODI, ADRs 0042 e 0046) e o preço mensal do café do FMI (ADR 0045).

</details>

<details>
<summary>4. Bloqueado — depende do David / Comitê</summary>

**O que o David e o Comitê ainda definem** (a lista que ficava num documento à parte, aposentado em 2026-09-28):

| Definição | Situação |
|---|---|
| Ativos, mercados, fontes e dados a coletar | **Propostos pelo FEL 1** (café, petróleo, milho e ouro; as fontes e a planilha de fatores), aguardando a aprovação do Comitê. A coleta de milho e ouro foi adiantada, **só aquisição de dados**, fonte a fonte, cada uma autorizada no seu ADR (ADRs 0001, 0006, 0008, 0009, 0013, 0015, 0017 a 0025, 0027, 0033 a 0037 e 0039); a do café seguiu do mesmo jeito (ADRs 0028 a 0032, 0038 e 0061), e a do petróleo começou em 2026-10-01 (ADRs 0040 a 0042) |
| Regras e cálculos do motor (camadas B e C) | Em aberto: é a etapa 1 dos "Próximos passos" e o §5 (a medida de cada fator, camada A, é proposta pelo FinMind para o Comitê confirmar) |
| Formato de apresentação dos resultados | Em aberto (dashboard, relatório, alerta...) |
| Avaliação da saída da IA | **Delegada pelo David ao usuário em 2026-10-05.** Metodologia no ADR 0064: por ativo e horizonte, o acerto de direção, a faixa exata e a distância média entre faixas, contra os benchmarks Sempre Lateral e Persistência, nas mesmas linhas; tela Qualidade da IA. Fica para depois: calibração da confiança, taxa de inversão, índice único e análise estatística. O papel da IA já foi decidido (pergunta 11) |
| Condições de sinal operacional | Em aberto: nenhum sinal é gerado hoje |
| Execução automática de ordens | **Não existe nesta fase** (restrição permanente, `CLAUDE.md`): uma pessoa decide e executa. A arquitetura mantém análise e execução em camadas separadas (`docs/architecture.md`) |

Perguntas da análise crítica (`docs/analise-critica-fel1-milho-ouro.md`, §H).
Preencher a resposta e a data quando o David responder.

**Reunião do Comitê em 2026-10-01:** perguntas 2, 3 e 8 respondidas (seguir com o histórico disponível). O
David vai mandar um **documento respondendo todas as perguntas**; ao chegar, registrar cada resposta e a data abaixo.

**Reunião com o David em 2026-10-03 (relato do Welerson):** o David **aprovou as decisões dos fatores do petróleo** (§5c,
ADRs 0050 e 0051) e pediu o mesmo para os fatores do **ouro**; ele termina os do milho e depois faz os do café, e vai
mandar as respostas por escrito. Com isso, o petróleo ganhou a leitura diária de tendência da IA no Centro de Decisão
(ADR 0052).

**Conversa com o David em 2026-10-03 (relato do Welerson, registrado em 2026-10-04):** o David **deu o sinal verde para
os fatores do ouro** e decidiu: o preço de referência é o futuro **GLD da B3** (a LBMA fica como histórico); a
**inflação vira contexto do juro real**; o **COT fica na leitura "amplifica"**, como qualificador; os **bancos centrais**
usam o **World Gold Council** contra o **ritmo dos 3 anos anteriores**. Com isso, o ouro ganhou a leitura diária de
tendência da IA no Centro de Decisão (ADR 0054).

**Documento do David, recebido em 2026-10-03 (registrado em 2026-10-04, ADR 0055):** responde às 16 perguntas
(abaixo), confirma as medidas da §5 e traz o **Motor do Milho v0**: regras de alta e baixa para cada fator, peso por
mês, correlações e um prompt para a IA, como proposta para o Comitê. As respostas foram escritas antes da reunião de
2026-10-03; onde divergem, vale a decisão mais nova (ex.: o GLD no ouro). Os **10 pontos em aberto** entre as respostas
e o que já roda estão em `docs/conversa-david-respostas-fel1.md`, para a conversa com o David. **Ponto 1, petróleo: resolvido em 2026-10-04**: o David confirmou o Brent como o instrumento operado, e a leitura diária passou do WTI ao Brent (ADR 0052, adendo). O ouro segue em aberto.

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
| 1 | Milho + Ouro como **prova de arquitetura** (sem mudar a ordem CAFÉ→PETRÓLEO→MILHO→OURO) é aceitável? | | **David, por escrito (2026-10-03, ADR 0055):** **sim**, como trilha de validação em paralelo, sem mudar a ordem CAFÉ→PETRÓLEO→MILHO→OURO |
| 2 | Milho: podemos seguir só com o **CCM (B3)**, que é grátis mas só tem **~4 anos** de histórico, ou precisamos do **ZC (CME)**, que é **pago**? Ouro: **GC** ou preço de referência? (A LBMA fechou o feed em 2026-10-01; o preço diário passou a ser o futuro **GLD da B3**, grátis, desde 2025-07-21, ADR 0044) **Discutir depois da pergunta 8**, que resolve boa parte desta. **Detalhe para a reunião logo abaixo da tabela** | | **Respondida na reunião do Comitê (2026-10-01): seguir com o histórico disponível.** Milho com o CCM (B3), sem o ZC; ouro com o LBMA (até 2026-09-30) e o GLD da B3; café com o ICF da B3 (o mesmo histórico curto do CCM) e, para ciclos longos, o preço mensal do FMI desde 1992 (ADR 0045), sem o KC da ICE, que é pago. **David, por escrito (2026-10-03, ADR 0055):** o preço de referência é o do **instrumento operado**; milho só com o CCM (o ZC entra como fator, se houver); ouro na LBMA, escrito antes da decisão do GLD (ADR 0054), que prevalece. Ele cita a **Pepperstone (ouro e Brent)**: o instrumento operado do ouro e do petróleo volta à conversa (`docs/conversa-david-respostas-fel1.md`, ponto 1) |
| 3 | Existe **orçamento para dados de preço**? Sem isso não há backtest. **Para o milho, é respondida junto com a pergunta 2** (escolher o ZC = ter orçamento para ele); segue valendo para o **ouro** (o futuro GC da CME também é pago) | | **Respondida na reunião do Comitê (2026-10-01): seguir com o histórico disponível**, sem comprar dado de preço (nem ZC, nem GC). **David, por escrito (2026-10-03, ADR 0055):** premissa de fontes gratuitas; um **caixa para aquisições**, só para o que for fator de sucesso, com o **Luiz** gerindo os custos junto do Welerson e da Carla e levando ao Comitê. Anuncia uma **camada de análise técnica gráfica** (B3; Pepperstone), a definir por ele |
| 4 | Confirmam que o **COTAHIST não atende CCM/ICF**? Qual a alternativa? (o ADR 0009 já confirma que não atende; para o CCM, a alternativa encontrada foi o Boletim Diário da B3, ADR 0020 — ver pergunta 2). **Detalhe logo abaixo da tabela** | | **David, por escrito (2026-10-03, ADR 0055):** **confirmado**: o COTAHIST não atende; a §6.5.2 do FEL 1 será corrigida. Vale o Boletim Diário + Up2Data (ADR 0020) para o CCM e o mesmo caminho para o ICF (já feito, ADR 0028) |
| 5 | **Vintage do agro (para ciência do Comitê):** o dado do agro é revisado depois de publicado, e parte do passado só existe na versão final. Isso limita o **backtest** de algumas regras (sobretudo as da Safrinha antes de fev/2025), mas o impacto é localizado: o WASDE tem as revisões do milho desde 2011 (EUA e ~20 países, incluindo o Brasil), e **a partir de agora o FinMind guarda cada revisão de todas as fontes**. A avaliação da IA será feita daqui para frente. **Detalhe logo abaixo da tabela** | | **David, por escrito (2026-10-03, ADR 0055):** ciência. A aproximação pelo WASDE para a safrinha antes de fev/2025 está **validada**, declarada como aproximação, medindo o viés com os dois vintages onde houver. A §12.3 fica |
| 6 | **Licença e redistribuição (para ciência do Comitê):** hoje todo o uso é interno (decisão de 2026-09-21). **Antes de exibir, redistribuir ou comercializar** dados ou análises para terceiros, algumas fontes exigem licença ou autorização específica: LBMA (ouro), CEPEA/ESALQ e B3 (preços do milho) e Conab. **Detalhe logo abaixo da tabela** | | **David, por escrito (2026-10-03, ADR 0055):** ciência. Uso interno coberto; antes de externalizar: IBA/LBMA, CEPEA (CC BY-NC) e B3. Dados do governo americano são domínio público |
| 7 | **CEPEA** está bloqueada para automação. Export manual é aceitável em produção? | | **Não se aplica mais** (decisão do usuário, 2026-09-23): o mesmo indicador vem da B3, automatizado, desde 2018-06-08 — ADR 0021. Só voltaria se o David pedir o histórico anterior a 2018. **David, por escrito (2026-10-03, ADR 0055):** confirmado, pela B3 |
| 8 | **Contradição do FEL 1:** o backtest precisa de **1 a 5 anos** de histórico (§4) ou de **10 a 15 anos** (§12.1)? Qual vale? **Discutir antes da pergunta 2:** com 1 a 5 anos, o CCM (~4,5 anos, grátis) praticamente atende; com 10 a 15, o milho só fecha com o ZC (pago). **Detalhe logo abaixo da tabela** | | **Respondida na reunião do Comitê (2026-10-01): o backtest usa o histórico disponível** (CCM e ICF desde 2022; no ouro, LBMA e GLD). **David, por escrito (2026-10-03, ADR 0055):** a §12.1 é o alvo, em **duas fases**: Fase 1 no CCM (2022+), declarando a limitação; Fase 2 no ZC, se houver orçamento. **100 operações** como critério prático; testes em mercado com **lotes mínimos** assim que o sistema estiver pronto |
| 9 | Qual o **benchmark** do Sharpe mínimo, isto é, **contra o que** o resultado do backtest é comparado (ex.: só comprar e segurar)? **Detalhe logo abaixo da tabela** | | **David, por escrito (2026-10-03, ADR 0055):** **duas réguas**: comprar e segurar o ativo **e** o CDI; a regra só passa se superar as duas. O CDI não é coletado (temos a Selic): ponto 7 da conversa |
| 10 | **Tarefa do Comitê:** fixar os **limites de aprovação da §12.2 antes do primeiro teste**, a "nota que passa" (Sharpe mínimo, perda máxima tolerada, número mínimo de operações etc.). O FEL 1 já exige que seja antes: definir depois de ver o resultado invalida o teste. **Depende das perguntas 8 e 9.** Ver "Backtest em detalhe", abaixo da tabela | | **David, por escrito (2026-10-03, ADR 0055):** **proposta**: Sharpe ≥ 0,5 dentro da amostra e ≥ 0,3 fora; drawdown ≤ 15%; 100 operações; profit factor ≥ 2,0; degradação no walk-forward ≤ 20%. Ainda não fixada: faltam o cálculo do Sharpe, os custos, a métrica da degradação e o mínimo da Fase 1 (ponto 7 da conversa) |
| 11 | **O papel da IA (para ciência do Comitê):** a IA é a **analista** do processo e **gera a recomendação** (comprar, vender, manter ou ficar de fora, no curto, médio e longo prazo), sempre com base nos dados e nas regras que o motor envia. Uma pessoa decide e executa; nenhuma ordem sai automaticamente. Ver §5, "O papel da IA" | | **David, por escrito (2026-10-03, ADR 0055):** **confirmado** (motor determinístico + IA analista) |
| 12 | **Como abastecer o fator 8 do milho (política comercial: China, tarifas)?** Proposta: (1) **exportação por destino**, número oficial: **já coletada desde 2026-10-01** (ADR 0034, só aquisição); a medida, B e C são do Comitê, como nos demais fatores; (2) **tarifas e decisões de governo**, que são eventos: **desde 2026-10-02 entram na leitura diária de eventos de mercado** (ADR 0049; USTR, Casa Branca, MOFCOM, MAPA e USDA FAS), com tipo, ativos, fator e link da página oficial, capturados no dia em que saem; a medida, B e C seguem do Comitê. A IA nunca produz um número que entre no motor. **Detalhe logo abaixo da tabela** | | **David, por escrito (2026-10-03, ADR 0055):** **aprovada** em duas partes: a participação da China com a variação contra o mesmo mês do ano anterior; tarifas como eventos, sem backtest do passado. Pede para avaliar os eventos também no milho e no café; a validação humana dos eventos é o ponto 4 da conversa |
| 13 | **Ajustes no documento FEL 1 (para os autores corrigirem):** inconsistências encontradas no relatório v1.1 e na planilha, reunidas num item só: a Seção 16 citada mas inexistente, o COTAHIST, o WASDE e o café, o período do Crop Progress e o prazo da demo. Nenhuma trava o FinMind. **Detalhe logo abaixo da tabela** | | **David, por escrito (2026-10-03, ADR 0055):** o David revisa o FEL 1 e envia ao Comitê **até 2026-10-15** |
| 14 | **WASDE impacta café** (planilha) ou não (texto revisado)? Qual prevalece? **Incluída no item 13** | | **David, por escrito (2026-10-03, ADR 0055):** **vale o texto**: o WASDE não cobre café. A planilha será corrigida e ganha o Coffee: World Markets and Trade (USDA FAS) |
| 15 | **FAO/AMIS** foi reconhecida e **adiada**: o WASDE já traz o balanço mundial do milho com vintage. Existe necessidade de implantá-la no futuro? **Detalhe logo abaixo da tabela** | | **David, por escrito (2026-10-03, ADR 0055):** **não é necessária**; segue adiada |
| 16 | **Paridade de exportação do milho:** o FinMind deve guardar a **paridade já calculada pelo IMEA** (valor pronto), os **componentes** dela (frete, prêmio de porto) ou nada por ora? **Detalhe logo abaixo da tabela** | | **David, por escrito (2026-10-03, ADR 0055):** **opção 1, a paridade pronta do IMEA**, sem os componentes, com ressalvas (praça MT, quebra na troca de contrato, porto). **Coletada desde 2026-10-04 (ADR 0057)**, com a tabela diária desde 2021-05-31; a praça é o ponto 5 da conversa |

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
| 4. Dólar | ✅ Bem | Diário desde 1994; a paridade do IMEA, diária desde 2021-05-31 (ADR 0057) |
| 5. Etanol (EIA) | ✅ Razoável | Semanal desde 2010 |
| 1. Crop Progress | ⚠️ Pouco | Um ciclo por ano: com o CCM desde 2022, são só 4 safras |
| 2. Safrinha (Conab) | ⚠️ Pouco | Revisões só desde fev/2025; antes, só a aproximação pelo WASDE (pergunta 5) |
| 6. Insumos (IMEA) | ⚠️ Ainda não | O histórico com as datas de publicação começou agora |
| 8. Política comercial | ❌ Difícil | Tarifas são eventos raros e não são números; a exportação por destino é coletada desde 2026-10-01 (ADR 0034), com histórico desde 2005 |

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
| **1 a 5 anos** (§4) | O **CCM** (grátis, desde mar/2022, ~4,5 anos) praticamente atende, com o buraco de ~9 meses em 2023. Nada a comprar | O **LBMA** (1968 a 2026-09-30) atende com folga no passado; daí em diante, o **GLD da B3** (futuro, desde 2025-07-21). Emendar os dois é decisão do David (ADR 0044) |
| **10 a 15 anos** (§12.1) | Só o **ZC** (Chicago, pago) tem histórico para isso. O CCM só chega lá por volta de 2032-2037 | O LBMA atende até 2026-09-30; para continuar a série, o GLD emendado ou a licença da IBA (o feed público fechou em 2026-10-01; pergunta 6) |

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
| 🔴 Exige licença ou autorização | **LBMA** (preço do ouro) | O preço é administrado pela IBA (ICE), que exige licença "para obter, usar ou redistribuir" o dado atual ou histórico. Tabela de taxas não lida (ADR 0009). **Desde 2026-10-01 o feed público fechou**: dado novo só com licença; a coleta foi encerrada (ADR 0044) |
| 🔴 | **CEPEA/ESALQ** (Indicador do Milho, via B3) | CC BY-NC 4.0: **sem uso comercial** e sem retransmitir séries de preço sem autorização (ADR 0021) |
| 🔴 | **B3** (CCM, ICF, GLD, Indicador, Boletim Diário) | Os Termos de Uso da B3 pedem autorização para reprodução ou distribuição comercial (ADRs 0020 e 0021) |
| 🟡 Permite, com condição | **Conab** | A página de preços cita CC BY-ND 3.0 (**sem derivações**), e a Conab se declara fora da Política de Dados Abertos. Não verificado nos arquivos da safra (ADR 0016) |
| 🟡 | **BCB** (Focus, reservas) | ODbL: redistribuir exige atribuição, e uma base derivada precisa sair com a mesma licença (ADRs 0022 e 0023) |
| 🟡 | **FRED** (juros e dólar dos EUA) | 3 das 4 séries são domínio público, com citação; a `T10YIE` não foi confirmada. Ao exibir a terceiros, aviso de que o Fed não endossa (ADR 0009) |
| 🟢 Domínio público, com citação | **EIA** (etanol) e **NOAA** (saúde da vegetação) | Dado do governo dos EUA, livre para usar e distribuir (ADRs 0024 e 0025) |
| ⚪ Não verificado | **USDA** (WASDE, Crop Progress), **CFTC** (COT), **IMEA**, **Comex Stat** | Os dos EUA são de governo e provavelmente livres, mas os termos não foram lidos. IMEA e Comex Stat não publicam termo explícito |

**O ponto mais sensível é o preço.** Justamente as fontes de preço (LBMA e B3 no ouro; CEPEA/ESALQ e B3 no milho) são as
mais restritas, e o preço é o dado principal da recomendação da IA (§5). No caso da LBMA, a IBA fala em licença até
para *usar* o dado, e não esclarece se o uso interno está coberto; em 2026-10-01 fechou o acesso público, e o ouro diário passou a vir da B3 (GLD, ADR 0044).

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
| **Tarifas e decisões de governo** | Evento, não número ("a China anunciou tarifa sobre o milho dos EUA em DD/MM"). **Desde 2026-10-02** na leitura diária de eventos de mercado (ADR 0049) | A IA lê as **fontes oficiais autorizadas** e registra cada evento de forma estruturada |

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

**Atualização de 2026-10-02:** a busca de eventos por IA existe (ADRs 0047 e 0049) e já cobre as tarifas do milho. O
que segue era a proposta original, mantida como referência para o Comitê.

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
| 4 | Dólar (USDBRL) e paridade de exportação (Médio) | **Dólar PTAX de venda** (BCB), como publicado. **Paridade:** a já calculada pelo IMEA (MT, R$/saca), se a pergunta 16 aprovar | Dólar em 25/09/2026: **R$ 5,1991**. Paridade: coletada desde 2026-10-04 (ADR 0057) | ✅ Calculado (ADR 0056); a base mistura Campinas e MT |
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
  mercado. O prompt do ouro levaria o preço do ouro, em US$ e em R$ (com a PTAX), e o histórico recente: o LBMA até 2026-09-30 e, desde então, o futuro GLD da B3 (ADR 0044). **Decidido em 2026-10-03:** o GLD é a referência e a LBMA fica como histórico (ADR 0054).
- **É uma ilustração, não uma estratégia.** O que se propõe é a estrutura em 6 blocos, não a redação das frases, e
  os horizontes são do Comitê. **Nenhuma resposta de IA foi gerada**, de propósito: seria uma recomendação sem regra
  validada.

</details>

### O que queremos confirmar

**Respondido pelo David em 2026-10-03 (ADR 0055):** as medidas valem; COT em managed money, em contratos e em %;
estoque/uso dos EUA e do mundo, com a revisão; safrinha em nível e revisão (Conab e IMEA); clima com boa + excelente e o
VHI; insumos pelo IMEA na v1; o instrumento é o CCM, e o perfil é especulativo (swing trade de 7 a 21 dias), não hedge.
Ele também apontou que o exemplo acima mistura nível e revisão e compara estágios diferentes: no mesmo levantamento
da safra anterior, o 12º de 2025/26 fica +0,1%, não −1,0%. O que segue em aberto está em
`docs/conversa-david-respostas-fel1.md`.

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
     físico, o GC ou o GLD da B3 (coletado desde 2026-10-01, com histórico desde 2025-07-21)? O preço de referência é o do instrumento operado.
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

**Atualizada pelo ADR 0053 (2026-10-03):** a proposta dos 8 fatores nas três camadas, com o FMI e o World Gold Council
já coletados e o histórico de cada fator contra a LBMA, está na tela **Metodologia do Ativo** (ouro). Esta seção fica
como o registro da proposta da camada A ao Comitê; onde as duas diferem (ex.: o dólar, aqui o índice amplo, lá o das
economias avançadas, como no petróleo), vale a da tela, com a pergunta ao David.

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
| 4 | Geopolítica e risco sistêmico (Alto) | **Eventos** (conflitos, sanções, crises), registrados de boletins oficiais com data, como os eventos de tarifa do milho (pergunta 12). Se o Comitê quiser um número: um **índice de risco** pronto, ainda não reconhecido | Leitura diária de eventos de mercado (ADRs 0047 e 0049) | 🟡 Não é um número: são eventos com nível do dia. O "índice de risco" da planilha não diz qual índice |
| 5 | Demanda de bancos centrais, reservas (Alto) | **Compra líquida de ouro pelos bancos centrais**, em toneladas, por mês (estoque de ouro de cada banco central, mês contra mês). Candidata: estatística de reservas do FMI (SDMX), que a planilha lista no calendário, não reconhecida | Só as **reservas totais do Brasil** (não é ouro): US$ 362.548 milhões em 28/09/2026 (−3,2% em 1 mês) | 🔴 Falta a fonte. As reservas totais do BCB mudam com o câmbio e o preço dos ativos, não medem compra de ouro |
| 6 | Fluxo de ETFs de ouro (Médio) | **Toneladas de ouro guardadas pelos ETFs** e a variação na semana e no mês (entrada ou saída) | Nenhum dado | 🔴 O World Gold Council não tem API. Candidata a reconhecer: o estoque diário publicado por um grande ETF de ouro |
| 7 | Posicionamento de fundos, COT (Médio) | **Posição líquida dos fundos** = managed money comprado − vendido, em contratos e em % dos contratos em aberto (CFTC, ouro da COMEX): **o mesmo cálculo do milho** | Semana até 22/09/2026 (publicada em 25/09): 135.699 − 8.310 = **127.389 contratos**, **30,9%** de 412.800 (na semana anterior: 133.116, 32,5%) | 🟢 Desde 2006; uma função para milho, ouro e café |
| 8 | Produção e oferta de mineração (Baixo) | **Produção mundial de ouro das minas**, em toneladas por ano, e a variação contra o ano anterior (USGS) | Nenhum dado | 🔴 Fonte não reconhecida; anual e com mais de um ano de atraso. **Ignorada no MVP** (peso Baixo, decisão da auditoria de 2026-09-22) |

**Preço do ouro (a referência da recomendação).** O LBMA Gold Price PM (coletado de 1968 a 2026-09-30), em US$ e em R$ (com a
PTAX do mesmo dia). Em 28/09/2026: **US$ 4.144,55 a onça** (−9,2% em 1 mês; +1,8% em 3 meses; +9,9% em 12 meses) e
**R$ 21.606** (PTAX 5,2132; +7,2% em 12 meses). Sem curva de vencimentos: o futuro do ouro é o preço à vista mais os
juros (§5, "O que o exemplo mostra"). A licença da IBA ainda vale antes de exibir a terceiros (informe 6 da §4). **Desde 2026-10-01** a LBMA fechou o feed
público e o preço diário coletado é o futuro **GLD da B3** (US$/oz, liquidado pelo LBMA, desde 2025-07-21), em média
0,9% acima do LBMA PM: se ele passa a ser a referência, e como emendar com o LBMA, é decisão do David (ADR 0044).

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
   em R$**? E o que se opera de fato (ETF de ouro na B3, ouro físico, o futuro GC, que é pago, pergunta 3, ou o futuro GLD da B3,
   grátis, com histórico desde 2025-07-21, ADR 0044)? E, com a LBMA fechada, o GLD serve de preço de referência?

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
<summary>5c. Proposta — Fatores do Petróleo</summary>

**Por decisão do usuário (2026-10-02), o FinMind propõe ao David os 10 fatores do petróleo nas três camadas, para abrir
caminho: é rascunho, pode estar errado e serve para ser corrigido** (ADR 0050). Cada fator mostra, em blocos separados,
o que o FEL 1 diz (tipo, direção, mecanismo, fonte), os dados que já coletamos e as lacunas, a proposta (medida,
comparação e um esboço da leitura) e as perguntas ao David. **Em 2026-10-03 o David aprovou as decisões em reunião**
(as respostas por escrito virão depois): desde então, o prompt diário vai à IA todo dia e a leitura de tendência
aparece no Centro de Decisão do petróleo (ADR 0052). Nenhum sinal de compra ou venda é gerado.

O conteúdo está na tela **Metodologia do Ativo** (`/dados-mercado/metodologia/PETROLEO`), e não é copiado aqui. Dois fatores, OPEP+ e geopolítica, são **fatores de evento**, sem cálculo: o resultado deles são os eventos da leitura diária marcados com cada um numa janela (45 e 7 dias), com a data, a idade e a fonte, repassados à IA do ativo como estão. Oito fatores têm a proposta **calculada**: oferta não-OPEP (Brasil, Noruega e Canadá somados, mensal; sem os EUA, que têm fator próprio, e com o Canadá, por decisão do usuário; mede a situação, não antecipa o preço), juros (o Treasury de 10 anos contra 26 semanas antes, e não a meta do Fed, que fora da pandemia não mostrou relação com o preço; a meta fica como contexto), fundos (a posição líquida no COT do WTI contra o percentil dos 3 anos anteriores; o extremo lido como risco de reversão, que o histórico sustenta; pergunta ao David), dólar (o índice do Fed das economias avançadas contra a média de 52 semanas; o fator com a relação mais forte com o preço), refino (a margem 3-2-1 com o Brent, calculada pelo FinMind, contra a média de 5 anos, em US$ por barril; hoje extrema, como em 2022), demanda (só os EUA: a China do JODI ficou de fora, "não avaliada" e com uma queda de ~30% em 2026 sem explicação; pergunta ao David), produção dos EUA (o crescimento anual da produção, com a distância do recorde; o dado basta, o rig count não é necessário) e estoques EIA. O de estoques, o piloto: o estoque contra a média da mesma semana nos 5 anos anteriores, no histórico desde 1982, e a **camada C** (direção, intensidade e tendência) com os parâmetros em uso no sistema, guardados no banco com histórico de versões: qualquer usuário simula outros valores na tela, e o admin salva uma versão nova, com o motivo. Em jun/2020 ficou 15% acima da média; em jun/2022, 12,5% abaixo. O **prompt diário de análise** junta os 10 fatores e o WTI à vista numa data, para a IA ler a tendência em 1, 7, 30 e 90 dias (sem recomendar): é mostrado na mesma tela (ADR 0051) e, desde 2026-10-03, enviado ao Gemini uma vez por dia, com a resposta validada, gravada e mostrada no Centro de Decisão (ADR 0052). As
perguntas que mais destravam:

1. **Estoques EIA (Alto):** "abaixo do esperado" é contra o consenso de analistas (pago, não coletado) ou contra uma
   referência histórica (a média de 5 anos da mesma semana, que a EIA publica)?
2. **OPEP+ (Alto):** pesa o anúncio da reunião (evento) ou a produção bombeada (mensal, ~2 meses de atraso)?
3. **Geopolítica (Alto):** ameaça sem efeito material conta, ou só a interrupção que já aconteceu?
4. **Fundos (COT):** confirmam os outros fatores ou têm direção própria? (A proposta lê o extremo como risco de reversão.)

</details>

<details>
<summary>6. Fora do escopo por enquanto</summary>

Não implementar sem autorização explícita registrada em ADR:

- Qualquer ativo além de USD/BRL, Selic, ouro, milho, café e petróleo. Do café e do petróleo, só o que foi autorizado, fonte a fonte, no ADR de cada uma (café: ADR 0028 em diante; petróleo: ADR 0040 em diante). A aquisição foi encerrada em 2026-10-01 (§1).
- CEPEA antes de 2018-06-08 (só por exportação manual do site), Conab (séries históricas e preços), PSD do milho, FAO/AMIS. (IMEA andamento, WGC e CPI foram implementados em 2026-10-01: ADRs 0039, 0037 e 0033.)
- Clima além da NOAA STAR por cultura (milho e café): as fontes de clima do FEL 1 (NASA POWER, INMET, CPTEC/INPE, ERA5), USDA Ag in Drought, FAO ASIS, ONI, previsão do tempo e risco de geada.
- Focus além das expectativas anuais de IPCA, Selic e câmbio (PIB e demais indicadores, mensais/trimestrais, Selic por reunião, inflação 12/24 meses, Top 5), fatores sobre o Focus (surpresa, variação, dispersão); das reservas do BCB, o conceito liquidez, a série mensal e a composição (ouro).
- Série contínua de futuros, rolagem e backtest.
- Qualquer sinal, limiar, indicador técnico ou regra de compra/venda.
- Implementar a IA (o papel dela já está decidido, §5; o ADR 0010 é o desenho do experimento): só depois das regras e
  dos critérios de avaliação do Comitê. Exceção: a leitura de tendência dos quatro ativos (ADRs 0052, 0054, 0058 e 0062), depois da
  aprovação do David ou do Comitê; a avaliação dela contra o realizado continua com o Comitê.
- Execução automática de ordens e corretora.

</details>

<details>
<summary>7. Entregas realizadas</summary>

Registro histórico, recolhido para não ocupar espaço: clique para expandir.

<details>
<summary>Entregas de 2026-10-05</summary>

| Entrega | Resultado | Onde |
|---|---|---|
| Card de Evidências do Centro de Decisão | Sem a linha do preço, que repetia o card ao lado (o preço que a IA recebeu fica no "Ver detalhes"); até 8 fatores no card, com a sigla F1...Fn da Metodologia, também no detalhe; a moeda do preço no detalhe vem do ativo (R$ no milho, antes fixa em US$) | ADR 0052 |
| Regras de peso do milho no prompt | As regras de peso por força do sinal do David (F1 de baixa com a polinização, F2 com revisão fraca, F3 convexo, F5 de baixa) vão ao bloco 2.5 do prompt do milho (v3), ao lado das condições; o ajuste do F1 pela colheita da safrinha virou pergunta (o andamento não está na BASE). Na tela, sai a coluna "Sugestão do especialista" e entra "Hoje no FinMind", com as mesmas linhas do prompt. As frases das relações entre os fatores também vão ao bloco 2.5 (v4); a matriz de símbolos fica só na tela. Nas regras de agregação, os fundos e os sinais defasados passam a "Orientação no prompt" (o F6 com a data de efeito esperada); os eventos seguem sem validação humana, faltando o valor do volume relevante e do decaimento | ADR 0065 (adendos) |
| Agregação determinística do café | Em produção, por decisão do usuário, a validar pelo Comitê: a Oferta (clima, safra e estoques) como um voto, por precedência e confirmação; peso da família por horizonte derivado do horizonte de cada fator no estudo e do peso do FEL 1 (Imediato e Curto 60/40; Médio e Longo 50/33/17; custos 0); o F7 só rebaixa a confiança. Os limiares de score, cobertura, conflito e confiança e o teto MÉDIA são parâmetros do FinMind, não do David, e ficam fixos até o backtest. Vai ao prompt do café (v2, bloco 3B) como evidência para a IA, fica gravada com cada leitura e aparece no Centro de Decisão ("Motor", com "diverge da IA") e na Qualidade da IA (previsor "Motor"); script `npm run agregacao:cafe` para o histórico e um card na tela de metodologia, com a origem de cada regra. Na mesma tela, as regras do estudo do café passaram a "Orientação no prompt" (o que são desde o ADR 0062) | ADR 0066 |
| Peso por mês e agregação do milho no prompt | Por decisão do usuário, antes do Comitê: o calendário de pesos do Motor do Milho v0 vai ao prompt diário como tabela fixa (bloco 2.5, montada do mesmo dado da tela de metodologia), e as regras de agregação como orientação em texto (teto do bloco de oferta, F3 como filtro, câmbio, F7 que não vota), sem cálculo novo nem multiplicador. Nos meses que o David não definiu, vale o peso do FEL 1. Prompt e metodologia do milho na v2; a tela diz que o calendário está no prompt | ADR 0065 |
| Leitura diária de tendência do café | Com a aprovação do Comitê (o Motor do Café v1 como está na tela, com os limiares calibrados pelo FinMind; leitura de tendência, não recomendação; o ICF como preço; horizontes em dias corridos; eventos sem validação humana por ora), o café entra no prompt diário, na IA e no Centro de Decisão, no molde do milho: prompt próprio com as regras transversais do estudo (neutralidade, clima → safra → estoques como um choque só, revisão da Conab sem a expectativa do mercado, fundos como modificador de risco, custo só no longo prazo), faixas pelos percentis 40 e 80 do ICF no vencimento mais próximo (2022 a 2026) e o preço em reais pela PTAX. Uma chamada real ao Gemini passou na validação (imediato lateral; curto, médio e longo em baixa leve). O ano do custo da Conab deixou de sair "2.025" na tela e no prompt. Com ele, os quatro ativos têm a cadeia inteira | ADR 0062 |
| Revisão das pendências do motor | Os "Próximos passos" (§1) passam a mostrar o motor dos quatro ativos lado a lado, com o que segue em aberto em cada um e a comparação com o realizado como próxima entrega. A documentação que ainda tratava o motor e a IA como contratos vazios foi corrigida (README, `docs/architecture.md`, `docs/decisoes-tecnicas.md`), o `README.md` do `analytics-engine` virou o mapa do motor no código e a tela Configuração mostra o motor e a IA como ativos | `docs/architecture.md` |
| Qualidade da IA | A avaliação das leituras, delegada pelo David ao usuário: tela `/qualidade-ia` (menu principal, e um link no card de análise do Centro de Decisão) com, por ativo e horizonte, o acerto de direção, a faixa exata e a distância média entre faixas da IA e de dois benchmarks (Sempre Lateral e Persistência) nas mesmas linhas, o n, a cobertura e as linhas fora da métrica por motivo; cada número abre a tabela das linhas que o formam. Um gráfico mostra cada leitura como uma faixa em preço na data-alvo, com os quatro horizontes lado a lado, escolhido a partir de um protótipo. As faixas do milho foram recalibradas no próprio CCM (configuração v2): no horizonte de 90 dias, de 6 / 19% para 3 / 8%. Antes, o realizado passou a contar do preço da data da análise (como o prompt define), não do preço que a IA recebeu, que segue visível; os horizontes e a série vêm da leitura gravada, não da configuração atual. Calculado sob demanda, sem tabela nova | ADRs 0058 (adendo), 0063 (adendo) e 0064 |
| O realizado da leitura de tendência | Em cada horizonte da leitura da IA, o Centro de Decisão mostra o que o preço de fato fez: a variação contra o preço-base que a IA recebeu e a faixa em que caiu, pelas faixas gravadas com a leitura, sem nota de acerto (a métrica é do David). Nos futuros, o mesmo contrato da leitura: um contrato vencido deixa o horizonte sem preço, em vez de emendar outro vencimento. Calculado sob demanda, sem tabela nova | ADR 0063 |

</details>

<details>
<summary>Entregas de 2026-10-04</summary>

| Entrega | Resultado | Onde |
|---|---|---|
| Fontes novas do café (Motor do Café v1) | Autorizadas pelo Comitê na ordem do estudo de viabilidade. Três coletas, só como dado: (1) o total de sacas aguardando classificação, lido do mesmo arquivo diário da ICE; (2) o relatório mensal da ICO, com o preço médio por grupo e de Nova York e Londres e os estoques certificados das duas bolsas, 167 relatórios desde out/2012 lidos por coordenada, apesar das muitas mudanças de layout; (3) os estoques nos portos europeus da ECF, por tipo, desde jan/2020, uma edição por versão do PDF. A carga completa mostrou que a ICO revisa e corrige erros de digitação no mês seguinte (o estudo, com 11 meses, não tinha visto): uma base nova no point-in-time (`edition_lag_rule`) data essas correções pelo relatório, não pela coleta. A metodologia do café lista os dados novos no F3 e no F6, sem mudar o cálculo. O INMET espera o índice do David; o diário de Londres e do KC, orçamento e licença | ADR 0061 |
| Viabilidade das fontes novas do café | Reconhecimento (nível 1, com chamadas reais) das fontes que o Motor do Café v1 pede: a ICO (PDF mensal, grátis, reuso com citação) cobre a arbitragem Nova York × Londres, o estoque de Londres e o preço médio do KC; o bloco *pending grading* já vem no arquivo da ICE que coletamos; ECF (revisa, 2 meses de atraso), FNC da Colômbia (XLSX desde 1956) e INMET (viável, mas o índice é regra do David) são viáveis; o preço diário da ICE tem termos que proíbem criar produto sem aprovação; o diferencial FOB não tem fonte pública. Nada implementado: cada fonte pede autorização num ADR | `docs/reconhecimento-fontes/cafe-fontes-novas-motor-v1.md` |
| Metodologia dos fatores do café | O Motor do Café v1 do David na tela, com os 8 fatores calculados: clima (VHI da NOAA ponderado pelo arábica da Conab, só de junho a novembro), safra (revisão do arábica da Conab), estoques certificados da ICE, câmbio (PTAX em 10 pregões), custos (ICF em reais contra o custo da Conab), demanda (consumo do USDA PSD), fundos (COT) e juros. Os limiares que o estudo deixou em aberto são calibração do FinMind (P06), quase todos pela posição da medida no próprio histórico. Os números do estudo conferem com a base (Conab de 24/09/2026; estoques da ICE de agosto). Fora do prompt e da IA | ADR 0060 |
| Pesos e relações na Metodologia do Ativo | Seção nova na tela, para todo ativo: o peso do FEL 1 (o que vai ao prompt) e, no milho, o que o Motor v0 do David define além dele: a sugestão de peso-base, o calendário fator × mês (o mês não definido fica em branco), a matriz de relações 8×8 e as 9 regras de agregação, cada uma com a situação no FinMind. Ouro e petróleo mostram só o peso do FEL 1. Duas pendências novas no milho: os meses sem peso do F1 e do F2 e o papel do F7. Nada vai ao prompt | ADR 0059 |
| Leitura diária de tendência do milho | Com a aprovação do Comitê (o Motor do Milho v0 como está na tela; leitura de tendência, não recomendação; o CCM como preço; a base do F4 como está; eventos sem validação humana por ora), o milho entra no prompt diário, na IA e no Centro de Decisão, no molde do ouro: prompt próprio com as orientações do David (bloco de oferta como um argumento, F3 como filtro, fundos como contexto, conflito reduzindo a confiança), faixas pelos percentis 40 e 80 do Indicador ESALQ (2018 a 2026), o CCM como 1ª série do Centro de Decisão e os eventos de cada fator depois do cálculo (7 dias; 30 no F8). Uma chamada real ao Gemini passou na validação. Corrigido um bug que derrubaria o Centro de Decisão do milho no 1º dia com leitura | ADR 0058 |
| Fator de dólar e paridade do milho calculado | O F4 com a regra do David (R-CAM v0): a paridade do IMEA subindo 3% em 10 pregões, metade pelo câmbio (aproximado, sem o ZC), com o ESALQ abaixo dela é alta; caindo 3% com o ESALQ acima, baixa. Sem decisão na troca do contrato e nas quebras da série (30% ou mais). A base Campinas − MT foi negativa em 1 de 251 semanas: a alta quase nunca dispara (pergunta ao Comitê). Contra o Indicador ESALQ, fraca no sentido da regra (baixa: -3,6% em 13 semanas; neutras: -0,2%). Com ele, os 8 fatores do milho calculados. O leitor da paridade passou a recusar o zero da fonte (2025-04-25) | ADRs 0056 e 0057 (adendos) |
| Paridade de exportação do milho (IMEA) | A paridade calculada pelo IMEA (MT, R$/saca), escolhida pelo David na pergunta 16 e autorizada pelo usuário em 2026-10-04, lida por coordenada da tabela diária do Boletim Semanal - Milho: 1.200 dias desde 2021-05-31, em 258 edições (1.199 depois de recusar o zero de 2025-04-25). Defeitos da fonte tratados sem adivinhar: datas com erro de digitação, 3 semanas republicadas com os valores da anterior e 3 edições com o cabeçalho em outra página ficam de fora. O contrato de referência muda uma vez por ano (quebra na série). Backfill: `npm run backfill:imea-paridade` (~7 min) | ADR 0057 |
| Fatores de etanol e insumos do milho calculados | O F5 (só os EUA: a produção semanal de etanol da EIA 3% abaixo da média de 4 semanas é baixa; a regra de alta pede a margem do etanol, sem fonte) e o F6 (só a margem: o Indicador ESALQ contra o custo total por saca do IMEA em MT, no custo ou abaixo é alta; a relação de troca pede o preço do fertilizante, sem fonte). O F6 tem a ressalva da praça (Campinas contra MT) e poucas semanas (o custo só é conhecido desde 2026-09-15). Com eles, 7 dos 8 fatores do milho calculados; falta o F4 (paridade do IMEA). Simulação de 2026-09-30: estoques em alta forte; fundos em baixa forte; etanol e exportações em baixa moderada; safrinha em baixa fraca; clima e insumos neutros | ADR 0056 (adendo) |
| Fator de exportações do milho calculado | A parte numérica do F8 do milho com a regra do David (R-POL v0, embarques ±10% contra a média de 5 anos): o ritmo pelo acumulado do ano comercial (fevereiro a janeiro), porque o mês sozinho salta na entressafra, e a participação da China contra o mesmo mês do ano anterior (P12). Os eventos (tarifas, habilitações) seguem na leitura diária por IA, fora da conta. Em ago/2026, o ano comercial vai 23,6% abaixo do ritmo: pressão de baixa moderada. Contra o Indicador ESALQ, sem relação estável (+0,35 em 2018 a 2021, -0,31 em 2022 a 2026) | ADR 0056 (adendo) |
| Fator da safrinha do milho calculado | O F2 do milho com a regra do David (R-SAF v0), um ponto por levantamento da Conab: a produção da 2ª safra contra a safra anterior no MESMO levantamento (3%) e a revisão acumulada contra a 1ª estimativa em 2 levantamentos seguidos (2%); abaixo dos limiares, revisão para cima é viés de baixa fraco. Confere com o exemplo do David: no 12º levantamento de 2025/26, +0,09% e +1,51%, viés de baixa fraco. O alerta agroclimático e o plantio na janela ficam fora (sem o dado). Sem validação: a base tem 15 levantamentos (desde fev/2025), e a comparação no mesmo levantamento só existe em 4 meses de 2026 | ADR 0056 (adendo) |
| Fator de clima dos EUA do milho calculado | O F1 do milho com a regra do David (R-CLI v0), só de junho a agosto: a lavoura boa + excelente do USDA contra a média de 5 anos da mesma semana, alta a −5 p.p. ou com queda de 3 p.p. na semana, baixa a +3 p.p. por 3 semanas seguidas; a condição da previsão do NOAA/CPC fica de fora (sem o dado), declarada. A tela genérica passou a aceitar um fator com regra própria (limiares diferentes de alta e de baixa). A seca de 2012 e a de junho de 2023 saem como alta forte. Contra o Indicador ESALQ (9 safras), sem relação: o efeito do clima americano chega ao CCM por Chicago, e a validação que falta é contra o ZC | ADR 0056 (adendo) |
| Fator de fundos (COT) do milho calculado | O F7 do milho no molde do COT, com a proposta do David: a posição dos fundos na CBOT contra os 10 anos anteriores (o molde ganhou a janela como parâmetro, com o petróleo e o ouro idênticos) e a leitura de reversão (extremos P10/P90). Contra o Indicador ESALQ (2018 a 2026), -0,44 com o indicador 26 semanas depois (-0,20 com 3 anos): o histórico confirma a leitura e a janela do David, não o "amplifica" do FEL 1, com poucos episódios independentes. Hoje os fundos estão no percentil 92,8 (pressão de baixa), contra o F3 em alta forte: o conflito que a agregação do David trata | ADR 0056 (adendo) |
| Metodologia dos fatores do milho | Os 8 fatores do milho na tela Metodologia do Ativo, com a proposta v0 do próprio David (as regras de alta e de baixa como ele escreveu, a autoria e "aguardando o Comitê"), o FEL 1, os dados, as lacunas e as perguntas, e o card do ativo (o CCM, o perfil especulativo, as fases do backtest; 6 pendências). O F3 (estoques do WASDE) calculado edição a edição: o estoque/uso dos EUA contra as 10 safras anteriores e a revisão contra a edição anterior, com os limiares do David (P25/P75 e 3%). Em 2026-09-11, 9,68% no percentil 20, revisado −5,2%: pressão de alta forte. Contra o Indicador ESALQ (2018 a 2026), o nível não antecipa o preço em reais (anda ao contrário); a revisão tem o sentido esperado, fraco. Para isso, a camada point-in-time ganhou a leitura de todas as edições até uma data. Sem prompt diário até a aprovação do Comitê | ADR 0056 |
| Decisões e pendências do ativo na Metodologia | A tela Metodologia do Ativo ganhou um card **Ativo** antes dos fatores, com o que vale para o ativo inteiro: o preço de referência e a leitura da IA, no mesmo formato dos fatores ("Decidido" e "Pendências", com o selo no card). Petróleo: o Brent e a leitura diária decididos; 3 pendências (formato da leitura, peso e agregação, validação dos eventos). Ouro: o GLD e a leitura diária decididos; 6 pendências (as 3 do petróleo, mais o instrumento operado, o GLD com série contínua e a exportação do XAUUSD). Assim, a validação com o David cobre o ativo e os fatores no mesmo lugar | ADR 0050 (adendo) |
| Petróleo: Brent como preço de referência | O David confirmou que o petróleo operado é o Brent (a regra dele: o preço de referência é o do instrumento operado). A leitura diária passou do WTI ao Brent à vista da EIA, que já era coletado desde 1987: configuração v3, prompt v3 e o Brent como primeira série do Centro de Decisão. As faixas foram recalibradas no Brent pelo mesmo critério (só o longo muda: 7% e 21%, antes 8% e 20%). Os fatores, o COT do WTI e as validações históricas ficam como estão. As leituras já gravadas continuam com o WTI | ADR 0052 (adendo) |
| Respostas do David ao FEL 1 | O documento do David (2026-10-03) registrado: a resposta de cada uma das 16 perguntas no §4, a confirmação das medidas do milho na §5 e o Motor do Milho v0 como proposta para o Comitê. Os 10 pontos em aberto (instrumento do ouro e do petróleo, formato da leitura da IA, peso e agregação, validação dos eventos, paridade, insumos, critérios do backtest, fontes novas, tendência e recomendação, próximo passo do milho) num documento para a conversa com ele, com espaço para a resposta. Os dois números da Conab que ele não confirmou foram conferidos no banco | ADR 0055, `docs/conversa-david-respostas-fel1.md` |
| Leitura diária de tendência do ouro | Depois da aprovação do David, a cadeia do petróleo virou genérica por ativo (configuração, prompt, coletor, validação e Centro de Decisão), com o prompt do petróleo idêntico byte a byte, e o ouro ganhou a sua: o prompt com os 8 fatores e o GLD da B3 (o contrato mais próximo, o preço em reais pela PTAX, sem curva), faixas pelo critério do petróleo medidas no ouro da LBMA (cerca de metade das do petróleo) e o coletor `ouro-analise-ia-diario`. As decisões do David na metodologia v2: a inflação como fator de contexto do juro real (sem pressão; a validação recusa a resposta que a conte a favor ou contra), o COT "amplifica" como qualificador e os bancos centrais pelo WGC contra os 3 anos anteriores, mostradas na tela como "Decidido". A geopolítica do ouro passou a 7 dias, como a do petróleo. Os motivos das respostas recusadas passaram a aparecer na tela Execuções. Dev: 1ª leitura em 2026-10-04, refeita e aceita de primeira, ~22 mil tokens | ADR 0054 |

</details>

<details>
<summary>Entregas de 2026-10-03</summary>

| Entrega | Resultado | Onde |
|---|---|---|
| Metodologia dos fatores do ouro | A pedido do David, os 8 fatores do ouro no molde do petróleo, na tela Metodologia do Ativo: o FEL 1, os dados, a proposta nas três camadas e as perguntas de cada um. Sete calculados (juros reais, dólar, inflação, bancos centrais, ETFs, fundos e mineração) e a geopolítica como evento, cada um com a validação contra o ouro da LBMA (2006 a 2026): andam com o preço, nenhum antecipa de forma estável; a inflação não mostra a relação do FEL 1 (nem desde 1970; pergunta ao David se vira contexto do juro real), o COT favorece a leitura "amplifica" e os bancos centrais usam o World Gold Council (com as não declaradas, a única medida com relação para frente), com o FMI como contexto. Antes, o que se repete virou molde (COT, dólar, juros e a estrutura da metodologia), com o petróleo idêntico byte a byte. Sem prompt diário até a aprovação do David | ADR 0053 |
| Leitura diária de tendência do petróleo | Depois da aprovação do David, o prompt diário vai ao Gemini uma vez por dia (sem busca, resposta em JSON), no fim da coleta: a resposta é validada (horizontes, escalas, faixa coerente com a tendência, fatores e evidências citados existentes; fora do formato, uma nova chamada e, recusada de novo, nada é gravado) e gravada com o prompt, as versões e o hash. No Centro de Decisão do petróleo, os quatro horizontes em linha do tempo (tendência com a intensidade, faixa em %, confiança e tese) e o detalhe de cada um; ao lado do preço, as evidências que formaram o prompt (preço, cada fator com a leitura do motor, lacunas), com a tabela completa e o prompt e a resposta da IA como foram gravados. Leitura de tendência, não recomendação. 1ª leitura em dev: alta no imediato e no curto, lateral no médio, baixa leve no longo. Desde 2026-10-03, os horizontes contam da data da análise, não do último preço da EIA (adendo do ADR 0052) | ADR 0052 |
| Prompt diário de análise do petróleo | O prompt que a IA de tendência receberia, em seis blocos no molde do milho: leitura de tendência (não recomendação) em quatro horizontes independentes (1, 7, 30 e 90 dias), com faixa de magnitude da metodologia (provisória: percentis 40 e 80 da variação do WTI), confiança, fatores a favor e contra, evidências, lacunas e invalidação, em JSON. A base traz o WTI à vista com as variações dos horizontes, a curva futura (SEM DADO: o futuro é pago), a situação dos dados de cada fator e as faixas; a leitura do motor, os 10 blocos com o código de cada fator. Gerado e mostrado na tela, com as versões e o hash da entrada | ADR 0051 |

</details>

<details>
<summary>Entregas de 2026-10-02</summary>

| Entrega | Resultado | Onde |
|---|---|---|
| Simulação dos fatores numa data | Na Metodologia do Ativo, uma data e o botão Simular: cada card mostra o resultado do fator com o que se sabia até o fim daquele dia (point-in-time) e o "Ver prompt completo" junta os 10 blocos que iriam ao prompt da IA do ativo. O modal de detalhes segue a data. Numa data antiga, a oferta não-OPEP fica sem dado (o JODI tem a 1ª coleta como publicação) e os fatores de evento, sem leitura (começa em 2026-10-02) | ADR 0050, §5c |
| Texto de cada fator para o prompt | Cada fator calculado entrega um bloco de texto para a IA do ativo, montado por uma função genérica, em quatro partes: A — Medida, B — Leitura (com a regra aplicada e a origem dos parâmetros), C — Leitura do fator (pressão, intensidade e tendência; não é recomendação) e D — Validação histórica (separada, não entra na leitura atual). O título de cada fator diz o dado usado (ex.: oferta não-OPEP de Brasil, Noruega e Canadá). A tela mostra o texto exato, como nos fatores de evento | ADR 0050, §5c |
| OPEP+ e geopolítica como fatores de evento | Os dois fatores do petróleo que não têm o que medir: o resultado deles são os eventos aceitos da leitura diária marcados com cada um, numa janela (45 dias na OPEP+, 30 na geopolítica), com a data da leitura, a idade, o tipo, o canal, a pressão e a fonte, mais o nível do dia e os dias sem leitura. Sem mudar o prompt. A tela mostra os eventos e o texto exato que vai ao prompt. Com eles, os 10 fatores do petróleo têm proposta | ADR 0050, §5c |
| Fator de oferta não-OPEP calculado | O 8º fator do petróleo e o primeiro mensal: a produção somada de Brasil (ANP, convertida de m³), Noruega e Canadá (JODI), na média de 3 meses contra um ano antes. Sem os EUA (fator próprio) e com o Canadá, fora do FEL 1, por decisão do usuário; a Guiana não reporta. Não antecipa o preço: mede a situação, como a demanda. A tela e a decisão por faixa passaram a aceitar fator mensal | ADR 0050, §5c |
| Fator de juros calculado | O 7º fator do petróleo: a variação do Treasury de 10 anos em 26 semanas, com a meta do Fed como contexto. A meta, que a proposta citava, só se relacionava com o preço por causa da pandemia; o juro longo, não: com ele subindo 1 p.p. ou mais no ano, o WTI caiu em 76% dos casos nas 26 semanas seguintes. Juro subindo é pressão de baixa (FEL 1) | ADR 0050, §5c |
| Fator de fundos (COT) calculado | O 6º fator do petróleo: a posição líquida dos fundos no WTI em % dos contratos em aberto, contra o percentil das 156 semanas anteriores (posição relativa = percentil - 50). O FEL 1 diz que "amplifica"; a proposta lê o extremo como risco de reversão (muito comprados = pressão de baixa): com os fundos entre os 10% mais vendidos, o WTI subiu em 74% dos casos 26 semanas depois. Cabe na decisão por faixa sem mudar a tela | ADR 0050, §5c |
| Fator do dólar calculado | O 5º fator do petróleo: o índice do Fed contra as economias avançadas (o mais próximo do DXY), na média da semana, contra a média das 52 semanas anteriores. Dólar acima do normal é pressão de baixa (FEL 1). O fator com a relação mais forte com o preço: -0,56 com a variação do WTI dos 6 meses anteriores e -0,37 com o WTI 26 semanas depois (desde 2015). A média semanal de série diária virou um núcleo comum com o refino | ADR 0050, §5c |
| Fator de refino calculado | O 4º fator do petróleo: a margem de refino 3-2-1 calculada pelo FinMind com os preços à vista de Nova York e o Brent (não o WTI, que distorcia o crack em 2011-2013), contra a média da mesma semana nos 5 anos anteriores, em US$ por barril (em %, o desvio explodia). Margem acima do normal é pressão de alta (FEL 1); anda com refinarias mais cheias, mas não antecipa o preço. Hoje está extrema (US$ 52,5 contra US$ 23,4), como em 2022. A média de 5 anos virou um núcleo comum com os estoques, e a decisão por faixa aceita a unidade da medida | ADR 0050, §5c |
| Fator de demanda calculado (só os EUA) | O 3º fator do petróleo: o consumo médio de 4 semanas dos EUA contra o mesmo período do ano anterior, com a decisão simulada no sentido inverso (demanda crescendo é pressão de alta; faixa de 2%, forte a partir de 5%). A demanda anda junto com o preço, mas não o antecipa. A China (JODI) ficou de fora por decisão do usuário: dado "não avaliado" e queda de ~30% em 2026 sem explicação. A média de 4 semanas e o crescimento anual viraram um núcleo comum com a produção | ADR 0050, §5c |
| Fator de produção dos EUA calculado e a tela de fator genérica | O 2º fator do petróleo calculado: a produção média de 4 semanas, o crescimento contra o mesmo período do ano anterior e a distância do recorde, com a decisão simulada (padrões: faixa de 3%, forte a partir de 10%, tendência em 13 semanas). O dado da EIA basta (crescimento anual × WTI 26 semanas depois: -0,39 desde 2010). A camada C virou um núcleo comum no backend, e a tela de cálculo e de decisão ficou genérica: desenha a apresentação que cada fator descreve, com a explicação pronta do backend. Um fator novo é um módulo e uma linha no service | ADR 0050, §5c |
| Proposta de metodologia dos fatores do petróleo | Por decisão do usuário, um primeiro desenho dos 10 fatores do petróleo para o David validar. Partiu de um rascunho do GitHub Copilot, revisto: cada fator separa o que o FEL 1 diz, os dados que já temos (com link para o card) e as lacunas, a proposta nas três camadas, marcada como proposta, e as perguntas ao David. Sai a "decisão adotada" e o service que derivava a direção da geopolítica dos eventos da IA. Tela `/dados-mercado/metodologia/PETROLEO`, `GET /api/v1/ativos/:ativo/metodologia`. Piloto calculado: o fator de estoques EIA (camadas A e B, sem direção), com o estoque contra a média de 5 anos da mesma semana em gráfico, conferido no banco de dev. O dado da EIA basta para o fator (avaliado contra o histórico do WTI; não capta a reação do dia da divulgação). Camada C num card próprio, com a decisão da semana explicada passo a passo, os parâmetros e exemplos reais e hipotéticos; o peso é o do FEL 1. Os parâmetros em uso no sistema ficam no banco (tabela nova `fator_parametro_versao`, uma versão por ajuste, com autor e motivo): simular é livre, salvar é do admin. O `CLAUDE.md` ganhou a exceção para propostas assim marcadas | ADR 0050, §5c |
| Eventos de mercado (a geopolítica estendida ao milho e ao café) | Depois de uma análise dos fatores do milho e do café em busca do que os observáveis não captam (anúncios que o mercado precifica no dia: tarifa, abertura de mercado, geada, rota bloqueada, regulação), o coletor de geopolítica virou o de eventos de mercado, sem coletor, pipeline ou tabela nova: 4 ativos, 7 tipos (a geopolítica é um), o fator do FEL 1 afetado em cada ativo (um dos 34 da planilha, ou não se aplica) e 11 fontes autorizadas, testadas uma a uma na pesquisa do Gemini (sai o World Gold Council; entram USTR, Casa Branca, MOFCOM, Comissão Europeia, MAPA, USDA FAS e INMET). A conferência ficou mais rígida: só aceita o evento com uma página de fonte autorizada, conferida pela URL (no gov.br, pelo caminho da instituição), ligada ao texto dele. A lista deixou de ser checklist; um piso por ativo (prompt v8) exige, antes de um ativo ser Normal, ao menos uma fonte daquele ativo pesquisada (no milho e no café, de política comercial ou regulação), porque a 1ª leitura v7 declarou o milho Normal sem consultar fonte do milho. Uma migration (milho e café na leitura, tipo, fator, sai o assunto), com os eventos existentes mapeados. Depois: canal e intensidade por ativo e a regra de ativo indireto (o ouro deixou de entrar num incidente isolado de petróleo), o Mar Negro no mínimo do milho, a UE com Comissão e Conselho e as fontes lidas tiradas do grounding, nunca do texto da IA (prompts v9 e v10). Numa chamada só, 4 de 5 leituras ficaram com a cobertura do agro abaixo do mínimo; por decisão do usuário, a leitura passou a ser feita em **duas chamadas** (ouro e petróleo; milho e café), no mesmo coletor e na mesma leitura (prompt v11). Dev: 2 leituras com duas chamadas, 6 fontes lidas no agro em cada, 0 avisos, 24 a 33 mil tokens por dia. Diagnóstico de 10 leituras: o fato concreto (navio em Ormuz) em 10 de 10, a temperatura 0 sem ganho; o piso do ouro passou a exigir a AP ou o Tesouro (v12), e o reforço militar dos EUA entrou nas 3 leituras seguintes. Com a repetição só da chamada que não cumpriu o piso (uma vez), 4 leituras com 0 avisos. Só uma publicação específica (a matéria, o aviso, o comunicado) sustenta um evento: página de autor, de tag ou listagem não conta. Resta variação de julgamento em casos de fronteira (o envio de porta-aviões dos EUA entrou em 4 de 7 leituras e puxa o nível do ouro): a régua do "fora do normal" é do David | ADR 0049 |
| Centro de Decisão no lugar do Dashboard | A tela inicial, no desenho do Centro de Decisão do AgroMind, sem o sinal, a leitura por prazo e a síntese (são regras do David e do Comitê: o espaço fica reservado). Um seletor de ativo e de data (semana em botões, como no AgroMind); o preço como era conhecido no fim do dia escolhido, por `asOf`, com troca de série (ouro: GLD ou LBMA; petróleo: WTI ou Brent; milho: CEPEA/ESALQ ou CCM; café: ICF ou FMI), mini-gráfico em ECharts, variações de 1, 7, 30 e 90 dias e aviso de série defasada ou encerrada; futuros pelo vencimento mais próximo, sem emendar. "O que está movimentando o mercado": a leitura de geopolítica da data e os eventos da semana, com o detalhe num modal. Os cards do topo da tela Eventos foram para cá; o detalhe do evento virou um componente das duas telas. Conferido contra o banco de dev nos 4 ativos e 8 séries (ex.: o ouro em 10/03/2025 sem GLD e com a LBMA) | ADR 0048 |

</details>

<details>
<summary>Entregas de 2026-10-01</summary>

| Entrega | Resultado | Onde |
|---|---|---|
| Geopolítica do ouro e do petróleo: leitura diária por IA | Os 2 fatores sem dado do FEL 1. No padrão do AgroMind (ADR 0027 de lá): uma chamada diária ao Gemini com busca na web, prompt versionado, texto com rótulos fixos, parser determinístico, leitura do dia apagada e recriada numa transação, entregue ao Motor como bloco do prompt do ativo ("indisponível" quando falta, nunca "normal"). Fontes autorizadas conferidas no parser. Primeira integração real com IA. Tela `/dados-mercado/eventos` (última leitura no topo, eventos expandíveis). Dev: migration, testes novos e repositório testado contra o Postgres; 1ª leitura real em dev em 2026-10-02 (prompt v4, chave paga, 40 s; o evento de Ormuz conferido: aviso 147-26 do UKMTO). Servidor: 1ª leitura em 2026-10-02, success, 38 s, 0 falhas | ADR 0047 |
| Petróleo: demanda por país (JODI) | A análise de cobertura dos 34 fatores do FEL 1 achou a demanda global de petróleo (peso Alto) sem dado fora dos EUA. O JODI tem a demanda total de derivados de 105 países desde 2002, num arquivo separado do da produção (650 MB descompactado). O coletor da produção virou uma base comum, sem mudar o comportamento. Sem a Rússia, Brasil até 2022. Dev: 24.474 valores, 0 falhas, idempotente, pico de 838 MB | ADR 0046, `docs/reconhecimento-fontes/petroleo.md` |
| Café: preço mensal do FMI (pelo ALFRED) | Depois da decisão do Comitê de seguir com o histórico disponível (sem o KC), o único histórico longo e gratuito de preço do café: arábica e robusta do FMI, mensal, desde 1992, com as revisões (530 de 559 meses revisados) na data de cada versão no FRED. O coletor do CPI virou uma base comum do ALFRED (sem mudar o comportamento); o café tem fonte própria. Os meses de 1980 a 1991, retirados da série atual, não são gravados. Dev: 830 criados, 765 revisões, 0 falhas, idempotente, igual ao CSV do FRED | ADR 0045, `docs/reconhecimento-fontes/fred.md` |
| Ouro: LBMA encerrada, futuro GLD da B3 | O feed público da LBMA fechou (403 nas três coletas da manhã; o histórico foi para o portal MyLBMA, com licença da IBA). Das alternativas testadas, só o futuro de ouro em dólar da B3 (GLD) é oficial, diário e grátis: está no arquivo do Up2Data já usado no CCM, liquida pelo LBMA Gold Price e tem o histórico inteiro na janela (desde 2025-07-21; 5.409 valores em dev e no servidor, 0 falhas, idempotente). A LBMA saiu da coleta diária; o card mostra o histórico com a situação nova "Encerrada". 2 cards novos (58). Autorizado pelo usuário, só aquisição de dados | ADR 0044, `docs/reconhecimento-fontes/b3-gld-ouro.md` |
| Café: custo de produção (Conab) | O único fator do café sem dado: o custo de produção da Conab por município (variável, fixo, operacional e total, por hectare e por saca), arábica desde 2003 e conilon desde 2007, 2.276 valores, 0 falhas, idempotente. O preço mínimo, a outra metade do fator, fica num aplicativo com reCAPTCHA: não coletado. 2 cards novos (56) | ADR 0043 |
| Petróleo: produção por país (JODI) | A produção mensal de petróleo de 104 países desde 2002, do arquivo mundial do JODI (24.548 valores, 0 falhas, idempotente, ~10 s por coleta): a única fonte gratuita encontrada com a produção da OPEP por país. Autorizado pelo usuário depois de ver as lacunas (Brasil até 2022, Rússia até 2023, sem Guiana). Card novo (54) | ADR 0042 |
| Petróleo: produção do Brasil (ANP) | Passo 2 da onda do petróleo: a produção mensal de petróleo por UF, em terra e no mar, dos dados abertos da ANP, desde 1997 (7.832 valores, 0 falhas, idempotente). O CSV traz o ano inteiro com os meses ainda não publicados zerados: ficam de fora. O JODI se mostrou com lacunas (Brasil até 2022, Rússia até 2023, sem Guiana) e ficou para decisão. Card novo (53) | ADR 0041 |
| Petróleo: EIA e COT do WTI (passo 1 da onda) | Reconhecimento das 12 fontes do FEL 1 para o petróleo e, autorizado pelo usuário, o que reaproveita código: a posição dos fundos no WTI da NYMEX (desde 2006, 3.177 valores) e, pelas planilhas do etanol da EIA, 11 séries semanais (estoques, produção, refino, comércio, derivados; desde 1982) e 4 preços à vista diários (WTI desde 1986, Brent desde 1987, gasolina e diesel de NY): 54.282 valores, 0 falhas, idempotente. Os preços diários da EIA saem uma vez por semana. 4 cards novos (52) | ADR 0040, `docs/reconhecimento-fontes/petroleo.md` |
| Café e petróleo: o que falta | Levantamento contra os 34 fatores da planilha: café (Conab custo e preço mínimo, preço mensal do FMI, ICO, geada) e a onda do petróleo em passos, no §3. Licenças adiadas: uso pessoal (decisão do usuário) | §3 |
| Point-in-time: releitura de edição antiga | A edição do WASDE de 2018-12-14 é uma republicação da 584 que só corrige o leite: nada do milho se perdeu. O serviço passou a comparar a releitura com a versão que valia na data dela: repetir os backfills do WASDE e do IMEA deu 0 falhas (antes 227 e 256), sem gravar nada novo | ADRs 0008, 0019 e 0035 |
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
