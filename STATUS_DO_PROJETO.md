# FinMind — Status do projeto

Painel de uma página: o que está **pronto**, o que **falta** e o que está
**bloqueado** por decisão do especialista de mercado (David) ou do Comitê.
Serve para retomar o trabalho sem reconstruir o contexto.

**Última atualização: 2026-10-08.**

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
no código está em `backend/src/analytics-engine/README.md`. **Os motores dos quatro ativos foram validados como estão
pelo Comitê, com o David, na reunião de 2026-10-07 (ADR 0108).** A fase agora é **acompanhar**: o Comitê segue a tela
Qualidade da IA (ADR 0064), que mede as leituras contra o preço realizado e dois benchmarks, para ver como cada motor se
sai e onde ajustar. O que roda conta como validado; se aparecer um problema, a solução é validada no Comitê antes de
ir ao sistema, num ADR. Os pontos da conversa com o David (etapas 1 e 3) seguem em aberto.

| Etapa | O quê | Responsável | Situação |
|---|---|---|---|
| 1. Decisões de base | Critérios do backtest, preço e orçamento, instrumento e horizontes, ajustes no FEL 1 | Comitê | Respostas por escrito do David recebidas em 2026-10-03 (ADR 0055). Faltam os 10 pontos em aberto, para a conversa com o David (`docs/conversa-david-respostas-fel1.md`). FEL 1 revisado previsto para 2026-10-15 |
| 2. Fatores, prompt e leitura da IA | Os fatores de cada ativo, o prompt diário e a leitura de tendência no Centro de Decisão | David/Comitê aprovam; FinMind monta | **Feito nos quatro ativos e validado pelo Comitê, com o David, em 2026-10-07** (tabela abaixo; ADR 0108) |
| 3. Pontos em aberto do motor | O que ficou provisório em cada ativo (tabela abaixo) | David → FinMind | Aguardam a conversa da etapa 1 |
| 4. Comparação com o realizado e avaliação | Para cada leitura e horizonte, em que faixa o preço de fato caiu, e as medidas de direção e de faixa contra dois benchmarks. A avaliação foi delegada pelo David ao usuário em 2026-10-05 (§4) | FinMind | **Feito em 2026-10-05 (ADRs 0063 e 0064)**: o realizado em cada horizonte do Centro de Decisão, a partir do preço da data da análise, e a tela Qualidade da IA (`/qualidade-ia`), por ativo e horizonte, com as linhas de cada número. Fora desta versão: calibração da confiança, taxa de inversão, índice único e análise estatística |
| 5. Agregação e backtest | Os pesos e a agregação dos fatores em código (hoje a IA combina os fatores pelo prompt; no milho, com o peso do mês, ADR 0065) e o backtest com os critérios da etapa 1 | Comitê + FinMind | Depende da 1 e da 3. **Café: medida no histórico do ICF em 2026-10-07**, não supera os benchmarks e saiu do prompt e do Centro de Decisão, por decisão do usuário (esteve em produção de 2026-10-05 a 2026-10-07); fica na tela de metodologia, como a do milho (ADRs 0066, adendo, e 0081) |
| 6. Simulação | Pelo menos 6 meses de leituras registradas e avaliadas (FEL 1, §12.1, Camada 3) | FinMind executa, Comitê avalia | **Fase atual, desde a validação dos motores (2026-10-07, ADR 0108):** o Comitê acompanha a Qualidade da IA para ajustar os motores. As leituras se acumulam desde a aprovação de cada ativo, e a Qualidade da IA já as mede (etapa 4). O horizonte de 90 dias dos futuros fica sem preço até a decisão dos vencimentos por horizonte |

**O motor por ativo**

| Ativo | Aprovação | Preço de referência | Em aberto | ADRs |
|---|---|---|---|---|
| Petróleo (10 fatores) | David, em reunião, 2026-10-03; motor validado pelo Comitê, com o David, 2026-10-07 (ADR 0108) | Brent futuro (NYMEX BZ, Yahoo), um vencimento por horizonte, desde 2026-10-07 (decisão do usuário, a confirmar com o David); antes, o Brent à vista, desde 2026-10-04 | Faixas provisórias, recalibradas no futuro; peso e agregação (ponto 3 da conversa). Pendências por fator, decididas pelo usuário uma a uma: a OPEP+ (F1) com o STEO da EIA no lugar das cotas, inacessíveis, lido em quatro casos (corte, aumento, interrupção e neutro), e toda decisão de produção como evento (ADR 0091); o refino (F9) como contexto da demanda, sem pressão própria, porque contra o Brent a margem alta antecede queda, não alta (ADR 0093); os fundos (F8) só como informação, porque o extremo não mostrou reversão nem continuação por episódio (ADR 0094); os estoques (F2) com a média de 5 anos como o esperado e a direção do especialista como leitura da situação (não antecipam até 90 dias), com Cushing, gasolina e destilados como contexto (ADR 0097); a geopolítica (F3) como fator próprio, pelo evento mais grave da janela de 7 dias, com a ameaça pesando menos que a interrupção (ADR 0098); a demanda (F4) só com os EUA e o consumo medido, porque a China do JODI não mostra relação com o Brent e a queda de 2026 acompanha a perda de oferta da OPEP (ADR 0099); o dólar (F5) com o índice das economias avançadas, como fator próprio, o que mais antecipa o preço (ADR 0100); a produção dos EUA (F6) com o crescimento anual, sem o rig count, e o recorde só como informação (ADR 0101); os juros (F7) com o Treasury de 10 anos e direção própria, a meta do Fed como contexto (ADR 0102); a oferta não-OPEP (F10) somada, como leitura da situação (ADR 0103). As validações foram refeitas contra o Brent à vista em 2026-10-06; com a troca para o Brent futuro, as já feitas valem (as duas séries vão no mesmo sentido em 96% das semanas em 6 meses), e os demais foram validados contra o futuro: nenhum dos 10 fatores tem pergunta pendente (prompt v9: as validações são todas contra o Brent). Do ativo, decididas pelo usuário: as faixas calibradas, o peso do FEL 1 sem agregação até um teste contra os benchmarks com as leituras do Brent futuro, e os eventos sem aprovação humana (ADR 0104); fica a confirmação do Brent futuro com o David | ADRs 0050, 0051, 0052, 0091, 0093, 0094, 0096, 0097, 0098, 0099, 0100, 0101, 0102, 0103 e 0104 |
| Ouro (8) | David, 2026-10-03; motor validado pelo Comitê, com o David, 2026-10-07 (ADR 0108) | GLD da B3, vencimento mais próximo | Instrumento (ponto 1); série contínua do GLD: o horizonte de 90 dias fica muitas vezes sem a variação (ADR 0044); faixas provisórias; peso e agregação | ADRs 0053 e 0054 |
| Milho (8) | Comitê, 2026-10-04 (Motor do Milho v0); motor validado pelo Comitê, com o David, 2026-10-07 (ADR 0108) | CCM | Peso por mês e agregação: no prompt como tabela fixa e orientação em texto desde 2026-10-05, por decisão do usuário, validado com o motor em 2026-10-07 (ADR 0108); o peso do F1 de janeiro a maio (Baixo) e do F2 em janeiro e fevereiro (Médio), do usuário (ADR 0077); agregação em código (etapa 5): proposta do FinMind na tela, fora do prompt por decisão do usuário (2026-10-06), sem superar os benchmarks no histórico do CCM (ADR 0081); o vencimento de cada horizonte e o mínimo de 100 contratos com aviso, do usuário (ADR 0078); faixas calibradas no próprio CCM (ADR 0058, adendo), não as classes fixas do David (usuário, ADR 0079); o limite de 3 dos 5 estados da previsão do CPC no F1, do FinMind (ADRs 0067 e 0068); os ajustes ao FEL 1 na tela, sem revisão do documento (usuário, por delegação do David, ADR 0082) | ADRs 0055, 0056, 0057, 0058, 0059, 0065, 0067, 0068, 0069, 0070, 0071, 0072, 0073, 0074, 0075, 0076, 0077, 0078, 0079, 0080, 0081 e 0082 |
| Café (8) | Comitê, 2026-10-05 (Motor do Café v1); motor validado pelo Comitê, com o David, 2026-10-07 (ADR 0108) | ICF | Faixas calibradas no ICF, não as classes fixas do David (usuário, ADR 0079); o vencimento de cada horizonte e o mínimo de 100 contratos com aviso, do usuário (ADR 0078); o clima (F1) com o VHI, as janelas do estudo e o INMET depois da v1, do usuário (ADR 0083); a safra (F2) com os limiares de partida e a bienalidade como contexto, do usuário (ADR 0084); os estoques (F3) com o ritmo da v1 e as pendentes e a ECF como contexto, do usuário (ADR 0085); o dólar (F4) com a regra de baixa o ano todo, sem a condição do preço recorde, do usuário (ADR 0086); o custo (F5) com a mediana dos municípios e o custo operacional como COE, do usuário (ADR 0087); a demanda (F6) com o consumo do PSD, a faixa neutra calibrada e a arbitragem como contexto, do usuário (ADR 0088); os fundos (F7) na janela de 3 anos e só como informação, sem mudar a confiança, do usuário (ADR 0089); os juros (F8) com o juro nominal e o dólar global como contexto, do usuário (ADR 0090); a agregação em código medida no histórico e fora do prompt, na tela como referência (usuário, ADR 0066, adendo de 2026-10-07); nenhuma pergunta do ativo pendente | ADRs 0060, 0061, 0062, 0066, 0078, 0079, 0083, 0084, 0085, 0086, 0087, 0088, 0089 e 0090 |
| **Comum aos quatro** | — | — | Eventos vão à IA sem validação humana (ponto 4), numa seção só da base do prompt, com a condição que cada um afeta; ficam no fator só os de fator de evento (geopolítica, OPEP+ e o F8 do milho), por decisão do usuário (ADR 0095); o formato de apresentação; o horizonte de 90 dias dos três futuros não tem preço na avaliação (o contrato da leitura vence antes; ADR 0064); a agregação em código segue proposta do FinMind, fora da validação (ADR 0108) | ADRs 0055, 0064, 0095 e 0108 |

**Etapa 1 em detalhe**

| Momento | O que acontece | Responsável |
|---|---|---|
| 1a. Reunião | **Feita em 2026-10-01**: perguntas 2, 3 e 8 respondidas (seguir com o histórico disponível) | FinMind apresenta, Comitê responde |
| 1b. Retorno | **Feito em 2026-10-03**: documento do David com as respostas P1 a P16, a confirmação das medidas de cada fator e o Motor do Milho v0 | Comitê |
| 1c. Registro | **Feito em 2026-10-04**: respostas no ADR 0055 | FinMind |
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
| Telas de dados | `/dados-mercado/observaveis` (82 cards) e `/dados-mercado/execucoes` — ADR 0005 |
| Banco de dados | **PostgreSQL 16** desde 2026-09-26 (antes MariaDB): servidor compartilhado da VM (repositório `servidor02-infra`), database e usuário próprios do FinMind. Backup diário `pg_dump` (7 diários + 4 semanais) e backup semanal do disco — ADR 0026 |
| Produção | VM `servidor02` (Oracle Always Free, Ampere A1 arm64, 2 OCPU / 12 GB), `https://finmind.weslab.com.br` pelo Nginx Proxy Manager — `docs/architecture.md` § "Deploy" |
| Agendamento | Dev: Agendador do Windows às 22:00. Produção: cron do usuário `deploy` na `servidor02` (coleta 04:00, 06:00, 08:00 **UTC**; backup 10:00 UTC, **não versionado**) — ADR 0004, ADR 0026 |
| CI/CD | Lint + testes + build em toda branch; deploy por push na `main` (imagens `linux/arm64` num runner ARM nativo), que já roda as migrations automaticamente (`scripts/deploy.sh`, passo 4/6) |

</details>

<details>
<summary>Motores dos ativos</summary>

| Motor | Situação | Detalhe |
|---|---|---|
| Petróleo | **Validado** pelo Comitê, com o David, em 2026-10-07 (ADR 0108) | Os 10 fatores calculados e sem pergunta pendente, a leitura diária da IA contra o Brent futuro no Centro de Decisão e a avaliação na Qualidade da IA. Falta: a confirmação do Brent futuro com o David, o teste de uma agregação contra os benchmarks e o backtest com critérios definidos — ADRs 0052, 0091 a 0104 e 0108 |
| Ouro | **Validado** pelo Comitê, com o David, em 2026-10-07 (ADR 0108) | Os 8 fatores calculados, a leitura diária da IA contra o GLD no Centro de Decisão e a avaliação na Qualidade da IA. Falta: o instrumento (ponto 1 da conversa), a série contínua do GLD e o backtest com critérios definidos — ADRs 0044, 0053, 0054 e 0108 |
| Milho (v1) | **Validado** pelo Comitê, com o David, em 2026-10-07 (ADR 0108); entregue em 2026-10-06 | Os 8 fatores calculados, as pendências do ativo decididas, a leitura diária da IA no Centro de Decisão e a avaliação na Qualidade da IA; os ajustes ao FEL 1 na tela de metodologia; a agregação em código na tela, fora do prompt. Falta: a agregação em código (proposta do FinMind, fora da validação), o backtest com critérios definidos e as lacunas declaradas da v1 (o etanol brasileiro no F5; os fatores ausentes, depois da v1) — ADRs 0058, 0064, 0065, 0080, 0081, 0082 e 0108 |
| Café (v1) | **Validado** pelo Comitê, com o David, em 2026-10-07 (ADR 0108); entregue em 2026-10-06 | Os 8 fatores calculados e sem pergunta pendente, cada um com a validação histórica no prompt (o F8, juros, é o único com o sentido do estudo no histórico, sem significância por episódio; o F7, fundos, não mostrou reversão e fica só como informação); a leitura diária da IA no Centro de Decisão e a avaliação na Qualidade da IA; a agregação em código medida no histórico e fora do prompt desde 2026-10-07 (ADR 0066, adendo). Falta: o backtest das leituras da IA com critérios definidos e as lacunas declaradas da v1 (o INMET, depois da v1) — ADRs 0062, 0064, 0066, 0083 a 0090 e 0108 |

</details>

<details>
<summary>Como tratamos as considerações do FEL 1</summary>

**Critério (usuário, 2026-10-06, por delegação do David; ADR 0082):** o David não revisa o FEL 1. O relatório v1.1 e a
planilha `controle_fatores.xlsx` ficam como ele escreveu, e não há v1.2. O que muda vive na tela de metodologia e nos
ADRs.

**Milho, na tela** (`/dados-mercado/metodologia/milho`): o fator ajustado leva a marca "Ajustado ao FEL 1". No detalhe,
a definição mostra o texto original riscado, o novo e quem decidiu:

| Fator | O que mudou | Onde |
|---|---|---|
| F4 Dólar e paridade | Fonte com o BCB e a paridade do IMEA; peso Alto | ADRs 0057, 0065 e 0072 |
| F5 Etanol | UNEM e ANP pedidas e não aprovadas no estudo preliminar; segue a EIA | ADR 0073 |
| F6 Insumos | Fonte com o Comex Stat (ureia importada); peso Baixo (Médio a 6 meses ou mais, com margem ≤ 0) | ADRs 0065 e 0074 |
| F7 Fundos | Reversão nos extremos no lugar de "amplifica" | ADRs 0065 e 0075 |

O "Copea" já estava corrigido. Os meses que o calendário do David não definia (F1 de janeiro a maio, F2 em janeiro e
fevereiro) ficam no card de pesos, marcados com † (ADR 0077).

**As inconsistências do documento (perguntas 13 e 14), sem corrigir o arquivo:**

| Onde | Como o FinMind lê |
|---|---|
| Página 1: "ver Seção 16", que não existe | O registro das mudanças são os ADRs (ADR 0082) |
| §6.5.2: o COTAHIST "atende ICF e CCM" | Não atende; os futuros vêm do Up2Data e do Boletim Diário da B3 (ADRs 0020 e 0028) |
| Planilha: WASDE com "Milho, Café" | Vale o texto: o WASDE é só do milho (P14) |
| Crop Progress: abr-nov no texto, mar-nov na planilha | Vale o texto: abr-nov |
| Demo: "3 meses" na §4, "60 dias" na §12 | Vale a §4: mínimo de 3 meses ou número mínimo de trades |
| Backtest: 1 a 5 anos na §4, 10 a 15 na §12.1 | As duas fases da P8: Fase 1 no CCM (desde 2022), Fase 2 no ZC se houver orçamento (ADR 0055) |

</details>

<details>
<summary>Resumo das fontes</summary>

| Ativo | O que temos | Preço |
|---|---|---|
| Milho | Lavoura e clima dos EUA (Crop Progress, NOAA STAR), balanço mundial (WASDE), estoques trimestrais e área plantada dos EUA (USDA), safra, balanço e paridade de exportação do Brasil (Conab) e de MT (IMEA), exportação total e por destino e importação de adubo (Comex Stat), etanol (EIA), posição dos fundos (CFTC) | Futuro CCM da B3, desde 2022; Indicador CEPEA/ESALQ, desde 2018 |
| Café | Safra e custo de produção (Conab), clima (NOAA STAR), balanço por país (USDA PSD), estoques certificados (ICE), exportação (Comex Stat e Cecafé), posição dos fundos (CFTC) | Futuro ICF da B3, desde 2022; preço mensal do FMI, desde 1992 |
| Ouro | Juros, inflação e meta do Fed, índices do dólar e moedas da cesta do DXY (FRED), ouro dos bancos centrais (FMI), ETFs e oferta e demanda (World Gold Council), posição dos fundos (CFTC) | LBMA de 1968 a 2026-09-30 (encerrada); futuro GLD da B3, desde 2025-07-21 |
| Petróleo | Estoques, produção, refino e consumo dos EUA (EIA), produção do Brasil (ANP), produção e demanda por país (JODI), produção e capacidade ociosa da OPEP (EIA STEO), posição dos fundos (CFTC) | Brent e WTI à vista (EIA), desde 1987 e 1986; Brent futuro da NYMEX por vencimento (Yahoo, **não oficial e provisório**, ADR 0096), contínuo desde 2007 |
| Comum a todos | Dólar (PTAX), Selic, expectativas do Focus e reservas internacionais (BCB) | — |

**Quem interpreta esses dados:** os fatores de cada ativo e a leitura diária de tendência da IA, nos quatro ativos (§1,
"Próximos passos"). A agregação dos fatores em código, os sinais, o backtest e a execução de ordens seguem vazios, à
espera das definições do David (ver `CLAUDE.md`, "Restrições permanentes"). O desenho já está decidido: o motor prepara
a base (fatores e regras do Comitê) e a IA gera a leitura, que uma pessoa decide se segue (ADR 0055, pergunta 11).

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
<summary>Comex Stat (MDIC) · Milho, café, adubo · API · nível 5 · Dev e servidor</summary>

**Acesso:** API (JSON, sem chave). **Ressalva principal:** Milho só desde 2005 (NCM anterior não mapeado); café só o verde; revisões da fonte não confirmadas; limite de requisições rígido (429). **Evidência:** ADRs 0013, 0028, 0034 e 0074.

| Série | O que tem | Frequência | Desde | `published_at` | Status |
|---|---|---|---|---|---|
| Milho - exportação (volume e valor FOB) | kg e US$, total do Brasil | Mensal | 2005-01 | Estimado (dia 15 do mês seguinte) | Dev e servidor |
| Exportação de milho por destino | Volume e valor FOB por país de destino | Mensal | 2005-01 | Estimado (dia 15 do mês seguinte) | Dev e servidor |
| Café - exportação (volume e valor FOB) | Café verde (NCM 09011110) | Mensal | 1997-01 | Estimado (dia 15 do mês seguinte) | Dev e servidor |
| Adubo - importação (volume e valor FOB) | Ureia, cloreto de potássio e MAP, por NCM (relação de troca do milho) | Mensal | 1997-01 | Estimado (dia 15 do mês seguinte) | Dev e servidor |

</details>

<details>
<summary>Conab · Milho, café, soja · XLSX/XLS por levantamento · nível 4–5 · Dev e servidor</summary>

**Acesso:** XLSX/XLS por levantamento (página HTML). **Ressalva principal:** **Versões só desde fev/2025 (milho) e jan/2023 (café)**: antes disso a Conab não mantém as páginas; sem API (quebra se o layout mudar); o custo do café não tem data de publicação; **preço mínimo do café bloqueado por reCAPTCHA**. **Evidência:** ADRs 0017, 0029, 0043, 0114.

| Série | O que tem | Frequência | Desde | `published_at` | Status |
|---|---|---|---|---|---|
| Milho por safra e UF | Área, produtividade e produção da 1ª, 2ª e 3ª safra e do total, por região e UF | Por safra, revista a cada levantamento mensal | Versões desde fev/2025 | Real (data e hora do levantamento); limite superior nas safras antigas | Dev e servidor |
| Milho - balanço nacional | Estoques, produção, importação, suprimento, consumo, exportação e demanda | Por safra, revista a cada levantamento | Safras desde 2018/19; versões desde fev/2025 | Real | Dev e servidor |
| Soja por UF | Área, produtividade e produção, por região e UF (fase 1 da soja, ADR 0114) | Por safra, revista a cada levantamento mensal | Versões desde fev/2025 | Real (data e hora do levantamento) | Dev e servidor |
| Soja - balanço nacional | O grão: estoques, produção, importação, sementes, exportação e processamento (aba própria, transposta; farelo e óleo de fora) | Por safra, revista a cada levantamento | Safras desde 2020/21; versões desde fev/2025 | Real | Dev e servidor |
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
<summary>B3 — futuros (CCM, ICF, GLD, SJC) · Milho, café, ouro, soja · CSV e PDF · nível 5 (limitado) · Dev e servidor</summary>

**Acesso:** CSV do Up2Data e PDF do Boletim Diário. **Ressalva principal:** **Histórico curto**: CCM, ICF e SJC desde 2022-03-21, com buraco de ~9 meses em 2023; GLD desde 2025-07-21. Contratos em aberto só até 2025-12-11. O GLD é um futuro, não o fixing: emendá-lo à LBMA é cálculo. O SJC é liquidado pelo preço da soja da CME (Chicago em US$/saca), fase 1 da soja, só aquisição. Decisões: David (se o GLD faz o papel do preço do ouro). **Evidência:** ADRs 0009, 0020, 0028, 0044, 0109.

| Série | O que tem | Frequência | Desde | `published_at` | Status |
|---|---|---|---|---|---|
| Milho B3 (CCM) - preços | Ajuste, último, máxima, mínima, médio, abertura e oscilação, por vencimento (R$/saca) | Diária | 2022-03-21 (buraco de ~9 meses em 2023) | Estimado (fim do pregão) | Dev e servidor |
| Milho B3 (CCM) - liquidez | Contratos, negócios, volume financeiro; contratos em aberto só até 2025-12-11 | Diária | 2022-03-21 | Estimado | Dev e servidor |
| Café arábica B3 (ICF) - preços | Os campos do CCM, em US$/saca | Diária | 2022-03-21 (o mesmo buraco de 2023) | Estimado | Dev e servidor |
| Café arábica B3 (ICF) - liquidez | Os campos do CCM; contratos em aberto só até 2025-12-11 | Diária | 2022-03-21 | Estimado | Dev e servidor |
| Ouro B3 (GLD) - preços | Ajuste, último, máxima, mínima, médio e oscilação (sem abertura), em US$/oz | Diária | 2025-07-21 (1º pregão) | Estimado | Dev e servidor |
| Ouro B3 (GLD) - liquidez | Contratos, negócios e volume financeiro (sem contratos em aberto) | Diária | 2025-07-21 | Estimado | Dev e servidor |
| Soja B3 (SJC) - preços | Os campos do CCM, em US$/saca (liquidação pelo preço da CME) | Diária | 2022-03-21 (o mesmo buraco de 2023) | Estimado | Dev e servidor |
| Soja B3 (SJC) - liquidez | Os campos do CCM; contratos em aberto só até 2025-12-11 | Diária | 2022-03-21 | Estimado | Dev e servidor |

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
<summary>FRED (ALFRED) · Ouro, café, milho, soja · API · nível 5 · Dev e servidor (soja só em dev)</summary>

**Acesso:** API REST (JSON, com chave; sem reserva). **Ressalva principal:** Exige a chave; no café, a data é a de chegada ao FRED, que já ficou 706 dias sem atualizar (limite superior da publicação do FMI); o café é mensal (ciclos longos, não regras diárias). **Evidência:** ADRs 0033, 0045.

| Série | O que tem | Frequência | Desde | `published_at` | Status |
|---|---|---|---|---|---|
| Inflação ao consumidor dos EUA (CPI) | Cheio e núcleo com ajuste sazonal, cheio sem ajuste, **com todas as versões** | Mensal | Cheio 1947 (sem ajuste 1913); núcleo 1957 | Real (data de cada versão); limite superior antes da 1ª versão | Dev e servidor |
| Café - preço mensal do FMI | Arábica (Other Mild Arabica) e robusta, US¢/lb, **com todas as versões** | Mensal | 1992-01 | Real, do FRED (limite superior da publicação do FMI) | Dev e servidor |
| Milho - preço mensal do FMI | Milho dos EUA, US$/t, **com todas as versões** (ADR 0069) | Mensal | 1992-01 | Real, do FRED (limite superior da publicação do FMI) | Dev e servidor |
| Soja - preços mensais do FMI | Grão, óleo e farelo de soja, US$/t, **com todas as versões** (fase 1 da soja, ADR 0110) | Mensal | 1992-01 | Real, do FRED (limite superior da publicação do FMI) | Dev; servidor na 1ª coleta diária |

</details>

<details>
<summary>CFTC COT · Os quatro ativos e a soja · API · nível 5 · Dev e servidor (soja só em dev)</summary>

**Acesso:** API Socrata (JSON). **Ressalva principal:** Data de publicação estimada antes de 2022-08. **Evidência:** ADRs 0009, 0028, 0040, 0110.

| Série | O que tem | Frequência | Desde | `published_at` | Status |
|---|---|---|---|---|---|
| COT - ouro (COMEX), milho (CBOT), café arábica (ICE Coffee C) e petróleo WTI (NYMEX) (4 cards) | Contratos em aberto, managed money comprado e vendido | Semanal | 2006 | Real desde 2022-08; estimado antes | Dev e servidor |
| COT - soja (CBOT) | Os mesmos campos (fase 1 da soja, ADR 0110) | Semanal | 2006 | Real desde 2022-08; estimado antes | Dev; servidor na 1ª coleta diária |

</details>

<details>
<summary>USDA NASS — Crop Progress · Milho, soja · API · nível 5 · Dev e servidor (soja só em dev)</summary>

**Acesso:** API QuickStats (JSON, com chave). **Ressalva principal:** Data de publicação estimada, regra não validada para 1980–2005. **Evidência:** ADRs 0009 e 0110.

| Série | O que tem | Frequência | Desde | `published_at` | Status |
|---|---|---|---|---|---|
| Milho EUA - condição da lavoura | % muito ruim, ruim, regular, boa e excelente | Semanal (abr a nov) | 1980 (cada série no seu ano) | Estimado | Dev e servidor |
| Milho EUA - progresso da safra | % plantado, emergido, embonecamento, grão pastoso, dentado, maduro e colhido | Semanal (abr a nov) | 1980 | Estimado | Dev e servidor |
| Soja EUA - condição da lavoura | As cinco classes, como no milho (fase 1 da soja, ADR 0110) | Semanal (jun a out) | 1986 | Estimado | Dev; servidor na 1ª coleta diária |
| Soja EUA - progresso da safra | % plantado, emergido, em floração, formando vagens, perdendo folhas e colhido | Semanal (abr a nov) | 1980 (cada etapa no seu ano) | Estimado | Dev; servidor na 1ª coleta diária |

</details>

<details>
<summary>USDA (ESMIS) — WASDE, área plantada e Grain Stocks · Milho, soja · HTML e arquivos · nível 5 · Dev e servidor</summary>

**Acesso:** HTML da listagem (raspado) + XLS/CSV de cada edição. **Ressalva principal:** **WASDE só desde 2011, área e estoques só desde 2001** (antes, só PDF/TXT); listagem raspada, sem API confirmada; **em banco novo, o backfill vem ANTES da coleta diária**; licença não confirmada. **Evidência:** ADRs 0015, 0027, 0035, 0111 a 0113.

| Série | O que tem | Frequência | Desde | `published_at` | Status |
|---|---|---|---|---|---|
| Milho EUA (WASDE) | Balanço por safra: 13 atributos e o milho usado para etanol | Mensal (uma edição por mês) | Edições desde 2011-01 | Real (data do release), com as versões | Dev e servidor |
| Milho por país (WASDE) | ~20 regiões, 7 atributos | Mensal | Edições desde 2011-01 | Real, com as versões | Dev e servidor |
| Soja EUA (WASDE) | Balanço do grão por safra: 13 atributos, com esmagamento, semente e resíduo (fase 1 da soja, ADR 0111) | Mensal | Edições desde 2011-01 | Real, com as versões | Dev e servidor |
| Soja por país (WASDE) | 16 regiões (com o Paraguai), 7 atributos, com o esmagamento; óleo e farelo de fora | Mensal | Edições desde 2011-01 | Real, com as versões | Dev e servidor |
| Milho EUA - área plantada | Intenção de plantio (fim de março) e área plantada (fim de junho) | 2 edições por ano | Edições desde 2001-06-29 | Real (só a data), com as versões | Dev e servidor |
| Soja EUA - área plantada | Os mesmos dois relatórios, a tabela da soja (fase 1 da soja, ADR 0112) | 2 edições por ano | Edições desde 2001-06-29 | Real (só a data), com as versões | Dev e servidor |
| Estoques trimestrais de milho dos EUA (Grain Stocks) | Total, na fazenda e fora da fazenda, em 1º de dez, mar, jun e set | Trimestral | Edições desde 2001-06-29 | Real (só a data), com as versões | Dev e servidor |
| Estoques trimestrais de soja dos EUA (Grain Stocks) | O bloco da soja da mesma tabela, as mesmas posições e datas (fase 1 da soja, ADR 0113) | Trimestral | Edições desde 2001-06-29 | Real (só a data), com as versões | Dev e servidor |

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
<summary>NOAA STAR · Milho, café, soja · texto · nível 5 · Dev e servidor</summary>

**Acesso:** Texto (link de dados da página oficial, sem chave). **Ressalva principal:** **Endpoint não documentado**; a NOAA reprocessa o histórico (versões só daqui para frente); mede o efeito do clima já ocorrido, não é previsão nem alerta de geada; no Brasil não separa arábica de conilon. **Evidência:** ADRs 0025, 0030, 0031.

| Série | O que tem | Frequência | Desde | `published_at` | Status |
|---|---|---|---|---|---|
| Clima sobre o milho - saúde da vegetação | VHI, VCI (umidade) e TCI (calor) sobre a área do milho, em 18 regiões (mundo, hemisférios, 5 países, 5 UFs, 5 estados dos EUA) | Semanal | 1982 | Estimado (dia seguinte ao fim da semana) | Dev e servidor |
| Clima sobre o café - saúde da vegetação | Os mesmos índices sobre a área do café, em 19 regiões (Brasil e 5 UFs, os 7 maiores produtores depois do Brasil, mundo e hemisférios) | Semanal | 1982 | Estimado | Dev e servidor |
| Clima sobre a soja - saúde da vegetação | Os mesmos índices sobre a área da soja, em 10 regiões (EUA, Brasil, Argentina, 4 UFs e 3 províncias argentinas; fase 1 da soja, ADR 0110) | Semanal | 1982 | Estimado | Dev e servidor |

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
<summary>ICO — Coffee Market Report · Café · PDF mensal · nível 5 · Dev e servidor</summary>

**Acesso:** PDF mensal público, sem chave; reuso livre citando a ICO. **Ressalva principal:** **mensal e revisado**: a fonte corrige os próprios erros no relatório seguinte (cada correção fica com a data do relatório que a trouxe); `published_at` real só de out/2023 em diante (antes, estimado em fim do mês + 45 dias); 9 tabelas são imagem ou PDF ilegível (2015 a 2017) e ficam de fora. **Evidência:** ADR 0061.

| Série | O que tem | Frequência | Desde | `published_at` | Status |
|---|---|---|---|---|---|
| Café - preços e estoques certificados da ICO (mensal) | Preço médio do mês por grupo (I-CIP, Colombian Milds, Other Milds, Brazilian Naturals, Robustas) e dos futuros de Nova York e Londres, US¢/lb; estoques certificados de Nova York e Londres, milhões de sacas | Mensal | 2011-10 (preços); 2012-06 (estoques) | Real desde out/2023; antes, estimado | Dev; servidor: backfill pendente |

</details>

<details>
<summary>ECF — estoques nos portos europeus · Café · PDF · nível 5 · Dev e servidor</summary>

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
<summary>EIA STEO · Petróleo · XLSX por edição · nível 5 · Dev e servidor</summary>

**Acesso:** arquivo de edições do Short-Term Energy Outlook, uma planilha por mês, sem chave (~10 s por pedido). **Ressalva principal:** **sem as cotas** da OPEP+ (só no site da OPEP, bloqueado pelo Cloudflare); OPEP+ por país só desde as edições de 2024; capacidade e ociosa só da OPEP; a filiação muda (os Emirados saem em 2026). **Evidência:** ADR 0091.

| Série | O que tem | Frequência | Desde | `published_at` | Status |
|---|---|---|---|---|---|
| Petróleo - produção e capacidade ociosa da OPEP (STEO) | Petróleo bruto por país da OPEP e da OPEP+, os totais, a capacidade e a capacidade ociosa da OPEP, mil barris/dia; uma versão por edição que revisa | Mensal | 2004-01 (edições desde 2008-01) | Estimado (fim da quarta depois da 1ª quinta do mês) | Dev e servidor (backfill de 2026-10-06: 226 edições, 0 falhas) |

</details>

<details>
<summary>Yahoo Finance — Brent futuro · Petróleo · JSON · nível 5 · Dev e servidor</summary>

**Acesso:** endpoint de gráfico do Yahoo, sem chave nem documentação. **Ressalva principal:** **fonte não oficial e provisória** (a oficial, a ICE, é paga e depende do Comitê; CME e Stooq bloqueiam); termos não preveem coleta automática, uso pessoal com o risco aceito pelo usuário; um vencimento some do Yahoo no dia seguinte ao vencimento. **Evidência:** ADR 0096.

| Série | O que tem | Frequência | Desde | `published_at` | Status |
|---|---|---|---|---|---|
| Brent futuro (NYMEX BZ) - ajuste por vencimento | Ajuste diário de cada vencimento dos 13 meses seguintes, US$/barril | Diária | 2018–2020 (vencimentos ativos) | Estimado (fim do dia do pregão em Nova York) | Dev e servidor (backfill de 2026-10-07: 26.672 valores com a contínua, 0 falhas nos dois) |
| Brent futuro (NYMEX BZ) - 1º vencimento contínuo | O 1º vencimento encadeado pelo Yahoo (`BZ=F`), com o salto de cada rolagem | Diária | 2007-07-30 | Estimado | Dev e servidor |

</details>

<details>
<summary>Eventos de mercado por IA (Gemini com busca na web) · Ouro, petróleo, milho, café, soja · API · nível 4 · Dev e servidor</summary>

**Acesso:** uma chamada diária ao Gemini com Google Search (chave gratuita `GEMINI_API_KEY_FREE` primeiro; a paga, `GEMINI_API_KEY`, só no 429 ou 5xx persistente), orientada a uma lista única de 20 fontes autorizadas para os quatro ativos: UKMTO/JMIC, Tesouro dos EUA, OPEP, AP News, USTR, Casa Branca, MOFCOM, Comissão Europeia, MAPA (`gov.br/agricultura`), USDA FAS e INMET (desde 2026-10-02, ADR 0049) e CENTCOM, NOAA NHC, BSEE, Bolsa de Comercio de Rosario, governo da Argentina, EPA, MME/CNPE, Canal do Panamá e NOAA CPC (desde 2026-10-06, ADR 0092). Sete tipos de evento (a geopolítica é um deles), cada evento com os ativos afetados e o fator do FEL 1 de cada um. O evento só é aceito com uma página de fonte autorizada, conferida pela URL, que a pesquisa leu e ligou ao texto dele: a citação da IA não basta. **Ressalva principal:** **não é série nem é reproduzível**: uma leitura por dia (nível e resumo de cada ativo e os eventos), que vale da 1ª coleta em diante, sem backtest; a escala de níveis é provisória (a régua é do David); evento sem página de fonte autorizada, ou repetição de um aceito dos 3 dias anteriores, é rejeitado e não vai ao Motor; o número de preço, produção, exportação, estoque e dos relatórios periódicos coletados não vira evento (já é observável), mas o fato que esses números ainda não mostram pode virar (ADR 0092). **Evidência:** ADRs 0047, 0049 e 0092.

| Série | O que tem | Frequência | Desde | `published_at` | Status |
|---|---|---|---|---|---|
| Eventos de mercado - leitura do dia (ouro, petróleo, milho e café) | Nível (NORMAL, ATENÇÃO, RELEVANTE, EXCEPCIONAL) e resumo de cada ativo; eventos com tipo, ativos, fator do FEL 1, canal de transmissão, pressão e fontes; entregue ao Motor por `geopolitica.service.js` | Diária | 2026-10-02 (milho e café também; no servidor, a leitura de 2026-10-02 refeita com duas chamadas: success, 56 s, 0 falhas) | Não se aplica (data de referência = o dia em São Paulo) | Dev e servidor; telas `/dados-mercado/eventos` e Centro de Decisão (ADR 0048) |
| Eventos de mercado - leitura do dia da soja | Leitura PRÓPRIA (fase 1 da soja, ADR 0115): outra chamada, outro prompt e outra linha por dia, nas mesmas tabelas (coluna `frente`); nível e resumo da soja; eventos com tipo, sem fator; 11 das fontes autorizadas com o papel da soja. Só na tela Eventos; não vai ao Motor | Diária | 2026-10-08 (dev e servidor) | Não se aplica | Dev e servidor |

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
David e do Comitê. O histórico das ondas de coleta (milho e ouro, café, petróleo) está nas "Entregas realizadas" (§6) e
no ADR de cada fonte.

### O que falta

| Item | Situação |
|---|---|
| Acompanhar a Qualidade da IA | A fase atual (ADR 0108): ver como cada motor se sai e levar ao Comitê a solução de cada problema antes de aplicá-la |
| Pontos em aberto do motor | Por ativo, na tabela "O motor por ativo" (§1); dependem da conversa com o David (§4) |
| Petróleo: teste da agregação | Com algumas semanas de leituras com o Brent futuro (desde 2026-10-07), testar uma agregação pelos papéis dos fatores contra os benchmarks da Qualidade da IA; a decisão volta com números (ADR 0104) |
| Petróleo: o Brent futuro | Em uso desde 2026-10-07 (ADR 0052, adendo; Yahoo, fonte não oficial e provisória, ADR 0096); falta a confirmação do David (§4). A assinatura da ICE (US$ 2.500/ano), a fonte oficial, é decisão do Comitê |
| Série contínua do GLD (ouro) | O horizonte de 90 dias do ouro fica muitas vezes sem a variação de 90 dias, porque cada vencimento do GLD tem pouco histórico e nada é emendado (ADR 0054). Emendar os vencimentos é um cálculo do David (ADR 0044) |
| Lacunas declaradas das v1 | Milho: o etanol brasileiro no F5 (ADR 0073) e os fatores ausentes (ADR 0080); café: o INMET no clima (ADR 0083). Ficaram para depois da v1 |
| Soja: fase 1, só aquisição (ADRs 0109 a 0115) | Autorizada pelo usuário em 2026-10-08. Feito: o futuro SJC da B3, o COT, os preços mensais do FMI, a saúde da vegetação (`SOYB`), o Crop Progress, o WASDE, a área plantada, o Grain Stocks, a Conab e a leitura diária de eventos (própria, separada da dos quatro ativos). **Fase 1 completa.** O próximo passo é do Comitê e do David: a proposta (§4) (`docs/proposta-ativo-soja.md`, §2.13) |
| Qualidade da IA: medidas para depois | Calibração da confiança, taxa de inversão, índice único e análise estatística (ADR 0064) |

**Fontes candidatas** (só com uma demanda específica do David, do Comitê ou do usuário): 
geada, preço mínimo do café pelas portarias do MAPA, Baker Hughes, OPEP, API internacional da EIA e os derivados
do JODI, com o fator que cada uma atenderia, em `docs/reconhecimento-fontes/README.md`.

### Infraestrutura pendente

Nenhuma no momento (a última, as chaves do Gemini no `.env` do servidor para a geopolítica, foi resolvida em
2026-10-02, ADR 0047).

### Carga histórica pendente no servidor

Backfill validado em dev que ainda não rodou na VM entra aqui; ao rodar, sai daqui e a fonte passa a "dev e servidor"
em "Fontes" (§2).

Nenhuma no momento.

As últimas, em 2026-10-08: a soja da Conab (1.074 linhas, 0 falhas, igual a dev; ADR 0114), a área plantada (89 linhas) e o Grain Stocks da soja (566 linhas, com as 2 edições sem CSV,
como no milho), iguais a dev (ADRs 0112 e 0113), o WASDE da soja (21.139 linhas, igual a dev; ADR 0111; o 3º bloco foi interrompido por um deploy e
repetido com `--anoInicial=2021`), a saúde da vegetação sobre a soja (68.300 valores, igual a dev; ADR 0110; o COT, os preços do
FMI e o Crop Progress da soja carregam o histórico inteiro na coleta diária), o futuro de soja SJC da B3 (949 pregões, de
2022-03-21 a 2026-10-07, igual a dev; ADR 0109), o EIA STEO (226 edições, ADR 0091), a ICO (162 edições), a
ECF (8 edições) e as sacas aguardando classificação da ICE (desde 2016-10-03), as três do ADR 0061. As anteriores (Grain Stocks, etanol do WASDE, exportação de milho por destino, ouro do FMI, World Gold Council, Cecafé e
andamento do IMEA) rodaram no servidor em 2026-10-01, com os mesmos números de dev.

A PSD do café não precisa de backfill: a 1ª coleta diária depois do deploy é a carga (ADR 0031). O mesmo vale para as séries do ouro no FRED e o CPI (ADR 0033), que baixam a série inteira, com todas as versões, a cada coleta, e para o petróleo (EIA e COT do WTI, ADR 0040; ANP, ADR 0041; JODI, ADRs 0042 e 0046) e o preço mensal do café do FMI (ADR 0045).

</details>

<details>
<summary>4. O que ainda depende do David e do Comitê</summary>

Os motores dos quatro ativos foram validados em 2026-10-07 (ADR 0108). O que segue em aberto:

| Definição | Situação |
|---|---|
| Os 10 pontos da conversa com o David | Em aberto: `docs/conversa-david-respostas-fel1.md`, com espaço para a resposta (entre eles, a confirmação do Brent futuro no petróleo e o instrumento do ouro). Os pontos por ativo estão na tabela "O motor por ativo" (§1) |
| FEL 1 revisado | O David revisa o documento e envia ao Comitê, previsto para 2026-10-15 (ADR 0055) |
| Ativos, mercados, fontes e dados a coletar | **Propostos pelo FEL 1** (café, petróleo, milho e ouro), aguardando a aprovação do Comitê. A coleta foi adiantada, **só aquisição de dados**, fonte a fonte, cada uma autorizada no seu ADR; está encerrada desde 2026-10-01 (§1) |
| Agregação dos fatores e backtest | Em aberto: os critérios do backtest (o David propôs duas réguas e Sharpe ≥ 0,5, ADR 0055) e a agregação em código, que segue proposta do FinMind só na tela de metodologia (ADRs 0066 e 0081) |
| Formato de apresentação dos resultados | Em aberto (dashboard, relatório, alerta...) |
| Avaliação da saída da IA | **Delegada pelo David ao usuário em 2026-10-05.** Metodologia no ADR 0064, tela Qualidade da IA. Fica para depois: calibração da confiança, taxa de inversão, índice único e análise estatística |
| Condições de sinal operacional | Em aberto: nenhum sinal é gerado hoje |
| Execução automática de ordens | **Não existe nesta fase** (restrição permanente, `CLAUDE.md`): uma pessoa decide e executa (`docs/architecture.md`) |
| Soja como 5º ativo | **Proposta** do FinMind em `docs/proposta-ativo-soja.md` (2026-10-08), para o Comitê e o David: os fatores e as regras. Os pesos e a agregação são a etapa seguinte. A fase 1 (só aquisição de dados) foi autorizada pelo usuário em 2026-10-08 (ADR 0109); nada da soja vai ao motor antes do Comitê |

As 16 perguntas da análise crítica (`docs/analise-critica-fel1-milho-ouro.md`, §H) foram respondidas pelo Comitê em
2026-10-01 e pelo David por escrito em 2026-10-03; as respostas estão no ADR 0055. As aprovações de cada ativo estão nos
ADRs 0052, 0054, 0058 e 0062.

</details>

<details>
<summary>5. Fora do escopo por enquanto</summary>

Não implementar sem autorização explícita registrada em ADR:

- Qualquer ativo além de USD/BRL, Selic, ouro, milho, café e petróleo. Do café e do petróleo, só o que foi autorizado, fonte a fonte, no ADR de cada uma (café: ADR 0028 em diante; petróleo: ADR 0040 em diante). A aquisição foi encerrada em 2026-10-01 (§1).
- CEPEA antes de 2018-06-08 (só por exportação manual do site), Conab (séries históricas e preços), PSD do milho, FAO/AMIS. (IMEA andamento, WGC e CPI foram implementados em 2026-10-01: ADRs 0039, 0037 e 0033.)
- Clima além da NOAA STAR por cultura (milho e café): as fontes de clima do FEL 1 (NASA POWER, INMET, CPTEC/INPE, ERA5), USDA Ag in Drought, FAO ASIS, ONI, previsão do tempo e risco de geada.
- Focus além das expectativas anuais de IPCA, Selic e câmbio (PIB e demais indicadores, mensais/trimestrais, Selic por reunião, inflação 12/24 meses, Top 5), fatores sobre o Focus (surpresa, variação, dispersão); das reservas do BCB, o conceito liquidez, a série mensal e a composição (ouro).
- Série contínua de futuros, rolagem e backtest.
- Qualquer sinal, limiar, indicador técnico ou regra de compra/venda.
- Implementar a IA (o papel dela já está decidido, ADR 0055; o ADR 0010 é o desenho do experimento): só depois das regras e
  dos critérios de avaliação do Comitê. Exceção: a leitura de tendência dos quatro ativos (ADRs 0052, 0054, 0058 e 0062), depois da
  aprovação do David ou do Comitê; a avaliação dela contra o realizado foi delegada ao usuário (ADR 0064).
- Execução automática de ordens e corretora.

</details>

<details>
<summary>6. Entregas realizadas</summary>

Registro histórico, recolhido para não ocupar espaço: clique para expandir.

<details>
<summary>Entregas de 2026-10-08</summary>

| Entrega | Resultado | Onde |
|---|---|---|
| Motores dos quatro ativos validados | Na reunião de 2026-10-07, o Comitê, com o David, validou os motores do petróleo, do ouro, do milho e do café como estão; a fase passa a ser acompanhar a Qualidade da IA para ajustar. Os 34 fatores saem como validados no código (metodologias: petróleo v12, ouro v3, milho v22 e café v15), o prompt de cada fator diz "Regra: validada"; o que roda conta como validado, sem selo na tela, e a solução de um problema passa pelo Comitê antes de ir ao sistema. A agregação em código e os pontos da conversa com o David não mudam | ADR 0108; §1 e §2 |
| Status mais enxuto | Com os motores validados, saíram as perguntas da análise crítica (todas respondidas, ADR 0055), o material preparado para as reuniões e as seções de confirmação dos motores do milho, do ouro e do petróleo (antigas §5, 5b e 5c), já cobertas pelos ADRs e pela tela de metodologia. A §4 ficou só com o que segue em aberto; as seções seguintes foram renumeradas | §4 |
| Status revisado | As cargas históricas dadas como pendentes (EIA STEO, ICO, ECF e as sacas pendentes da ICE) já tinham rodado no servidor, conferidas no banco: a lista ficou vazia, e ICO e ECF passam a "dev e servidor", nível 5 (com a ICE, também em `docs/reconhecimento-fontes/README.md`). O "Falta fazer" ganhou o acompanhamento da Qualidade da IA, o teste da agregação do petróleo, as lacunas das v1 e as medidas para depois da Qualidade da IA; a ICO saiu das fontes candidatas (implementada, ADR 0061); 69 cards na tela de observáveis (o status dizia 60) | §2 e §3 |
| Proposta da soja como 5º ativo | Uma proposta para o Comitê e o David: o SJC da B3 (liquidado pelo preço de Chicago, em dólar) como preço de referência, 4 fatores (oferta dos EUA, oferta da América do Sul, demanda pela soja dos EUA e política), 3 regras sem peso (calendário da safra, folga do balanço e o posicionamento dos fundos, igual ao café), a fase 1 só com fontes já coletadas e a validação por contribuição incremental. Nada implementado nem autorizado | `docs/proposta-ativo-soja.md` |
| Soja, fase 1: o futuro SJC da B3 | Autorizada pelo usuário (só aquisição, ADR 0109). O SJC entra como mais um produto da B3, coletado todo dia pelo Up2Data, com o histórico do Boletim Diário desde 2022-03-21; o parser do boletim passou a aceitar o título da tabela quebrado em duas linhas (o do SJC). Dois cards novos (preços e liquidez), 71 no total. Em dev e no servidor: 949 pregões | ADR 0109 |
| Soja, fase 1: COT, preços do FMI, saúde da vegetação e Crop Progress | Quatro fontes que já coletamos, para outra cultura ou contrato (ADR 0110): o COT da soja da CBOT (desde 2006), os preços mensais do FMI de grão, óleo e farelo (desde 1992, com as versões), o VHI sobre a soja em 10 regiões (desde 1982) e o Crop Progress da soja (condição desde 1986). O coletor do Crop Progress virou fábrica por cultura, sem mudar o do milho; a NOAA passou a tratar o -1 da fonte (semana sem dado) como aviso. Cinco cards novos, 76 no total | ADR 0110 |
| Soja, fase 1: WASDE | O balanço da soja, das mesmas edições do milho desde 2011: o grão nos EUA (13 atributos, com esmagamento, semente e resíduo) e 16 regiões (com Brasil, Argentina, Paraguai e China). O leitor e o coletor do WASDE viraram um por produto, sem mudar o do milho; a soja tem fonte própria, para a carga em blocos não confundir as edições do milho com as dela. Conferido nas 187 planilhas, 0 inválidos. Dois cards novos, 78 no total. Em dev e no servidor: 21.139 linhas em 125 séries, reexecução idempotente | ADR 0111 |
| Soja, fase 1: área plantada | A intenção de plantio (Prospective Plantings, março) e a área plantada (Acreage, junho) da soja dos EUA, dos mesmos CSV do milho desde 2001 (51 edições, 0 erros; a de março e a de junho de 2025 e 2026 batem com o WASDE de maio e de julho). O leitor e o coletor viraram um por cultura, sem mudar o do milho. Um card novo, 79 no total. Em dev e no servidor: 89 linhas, idempotente | ADR 0112 |
| Soja, fase 1: Grain Stocks | Os estoques de soja dos EUA em 1º de dezembro, março, junho e setembro, por posição, do mesmo relatório do milho desde 2001 (102 edições, 0 erros; o 1º de setembro de 2025 bate com o estoque final do WASDE). O leitor e o coletor viraram um por grão, sem mudar o do milho. Um card novo, 80 no total. Em dev e no servidor: 566 linhas, idempotente | ADR 0113 |
| Soja, fase 1: Conab | A soja dos mesmos levantamentos do milho (15, desde fev/2025): área, produtividade e produção por UF (a aba "Soja", lida pelo leitor do milho sem mudança) e o balanço do grão, de uma aba própria e transposta (safras nas colunas), com leitor novo; farelo e óleo de fora. O coletor virou um por produto, sem mudar o do milho. 0 erros nos 15. Dois cards novos, 82 no total. Em dev e no servidor: 1.074 linhas, idempotente | ADR 0114 |
| Soja, fase 1: eventos de mercado | Leitura diária PRÓPRIA da soja (decisão do usuário): outra chamada ao Gemini, outro prompt (`eventos-soja-diaria@1`) e outra linha por dia (a coluna `frente`, com a chave por dia e frente), para que nada mude na leitura dos quatro ativos validados; o prompt das duas chamadas deles ficou idêntico, byte a byte. Nenhuma fonte nova: 11 das autorizadas ganharam o papel e as buscas da soja. Eventos sem fator (a soja não tem fatores aprovados). Só na tela Eventos. Em dev: leitura real com 6 fontes lidas, NORMAL. Com isto, a fase 1 está completa | ADR 0115 |

</details>

<details>
<summary>Entregas de 2026-10-07</summary>

| Entrega | Resultado | Onde |
|---|---|---|
| Realizado: o preço na data-alvo fecha o período | A leitura do café de 06/10 seguia "a apurar" em 07/10 com o ajuste de 06/10 já na série: o período só fechava com um dado depois da data-alvo. Por decisão do usuário, fecha com o dado na data-alvo ou depois dela (também na base); só antecipa em um pregão as leituras que esperavam | ADR 0063 (adendo de 2026-10-07) |
| Qualidade da IA: como ler a tela | Um link no topo da tela abre o ADR 0064 no mesmo modal da tela de status, agora com a explicação de por que a barra do gráfico cresce com o horizonte (não é a confiança da IA: é a faixa lida em preço, com T1/T2 nos percentis 40 e 80 da variação de cada prazo) e de quando as faixas se recalibram | ADR 0064 (adendo do §9) |
| Acesso de leitura ao banco do servidor | Para o assistente conferir com a série diária do servidor o que antes dependia de print, por decisão do usuário: um papel só de leitura (`finmind_leitura`), com SELECT só nas tabelas de mercado e de execução (sem usuários e espaços), transação somente leitura, 30 s por consulta e 2 conexões; a porta só em 127.0.0.1 da VM, por túnel SSH com uma chave restrita a esse encaminhamento (sem shell), aberto pelo assistente quando precisa; a consulta por `backend/scripts/consulta-servidor.js`. A escrita ficou de fora: segue por script ou migration no repositório | ADR 0107 |
| Horizontes contados do preço que a IA recebeu | Na Qualidade da IA do servidor, a expectativa do café e a do ouro apareciam um dia adiantadas: a leitura de D recebe o ajuste de D−1, mas os horizontes contavam da data da análise, e o pregão de D−1 a D, o que a IA pode antecipar, não era avaliado. Por decisão do usuário, nos quatro ativos e nos quatro horizontes, os horizontes contam do último preço recebido, o imediato é o próximo pregão, e a base da avaliação é esse preço; sem o preço do pregão anterior (feriado, fonte atrasada), da data da análise, como antes. A tabela 2.4 do prompt traz a data-alvo de cada horizonte. Configurações petróleo v5, milho v4, café v5 e ouro v2; prompts petróleo v11, milho v9, café v9 e ouro v4 | ADR 0106 |
| Agregação do café medida e fora do prompt | O backtest previsto no ADR 0066 rodou no histórico do ICF (235 segundas, 2022 a 2026), com o mesmo código do milho, agora comum aos dois scripts (`--acerto`): a agregação não supera o "sempre lateral" em faixa exata e distância em nenhum horizonte, e fora do lateral erra a direção na maior parte das vezes (18% a 37%). Por decisão do usuário, como no milho, sai do prompt e do Centro de Decisão e fica na tela de metodologia como referência; a pergunta "vale a mesma régua para o milho?" fecha (ADR 0081). Configuração do café v4, prompt v8, metodologia v14 | ADR 0066 (adendo) |
| Evidências de cada leitura e as respostas recusadas guardadas | A leitura do petróleo refeita no servidor falhou: as duas respostas da chave paga foram recusadas por citar, no curto e no médio, evidências que não estavam na lista daquele horizonte (a IA reaproveitou as do imediato). Por decisão do usuário, o formato dos quatro prompts diz que cada leitura tem as suas evidências (petróleo v10, milho v8, café v7, ouro v3), e o detalhe da execução guarda o texto das respostas recusadas, mostrado na tela Execuções | ADR 0105 |
| Pendências do ativo petróleo | Discutidas uma a uma e decididas pelo usuário: ficam as faixas calibradas, não as 6 classes fixas (no Brent futuro, em 1 dia 91% das variações cairiam nas duas primeiras classes; em 90 dias, 47% seriam "excepcional"), e os cenários ficam para depois, nos quatro ativos; fica o peso do FEL 1, sem peso por mês nem agregação, até um teste da agregação pelos papéis dos fatores contra os benchmarks da Qualidade da IA, com leituras do Brent futuro; a geopolítica e a OPEP+ seguem sem aprovação humana, com o veto depois como melhoria possível. Fica a confirmação do Brent futuro com o David. Metodologia do petróleo v11 | ADR 0104 |
| Pendências da oferta não-OPEP do petróleo (F10) | Contra o Brent futuro, o crescimento somado de Brasil, Noruega e Canadá não antecipa o preço (+0,07 e +0,10 em 91 e 182 dias; sem as crises, o contrário do especialista), e os países lidos um a um se contradizem. Por decisão do usuário: somados, como leitura da situação, com a direção do especialista (hoje, +7,8%: baixa forte, com o aviso na validação). Com o F10, nenhum dos 10 fatores do petróleo tem pergunta pendente; o prompt (v9) deixa de dizer que parte das validações é do WTI. Metodologia do petróleo v10 | ADR 0103 |
| Pendências dos juros do petróleo (F7) | Contra o Brent futuro, a alta do Treasury de 10 anos em 26 semanas antecede o preço na direção do especialista, de forma moderada e estável (−0,16 e −0,14 em 91 e 182 dias; −0,20 sem 2019-21); a leitura forte (≥ 1 p.p.) se apoia quase só em 2022. A meta do Fed, sem a pandemia, perto de zero. Por decisão do usuário: direção própria, com o Treasury no lugar da meta, que fica como contexto. Metodologia do petróleo v9 | ADR 0102 |
| Pendências da produção dos EUA do petróleo (F6) | Contra o Brent futuro, o crescimento anual da produção antecede o preço na direção do especialista (−0,25 e −0,45 com o Brent 91 e 182 dias depois), mas apoiado em poucos episódios (sem 2014-16 e 2020-21, −0,06 e −0,16). O recorde com crescimento pequeno só aconteceu de 2024 a 2026, com resultados opostos. Por decisão do usuário: o crescimento basta, sem o rig count (fonte nova, que antecipa a produção, não o preço), e o recorde fica só como informação na medida. Metodologia do petróleo v8 | ADR 0101 |
| Pendências do dólar do petróleo (F5) | Contra o Brent futuro, o dólar é o fator do petróleo que mais antecipa o preço, na direção do especialista: −0,19 e −0,35 com o Brent 91 e 182 dias depois, o mesmo sem as crises e sem sobreposição; com o dólar 5% ou mais acima do normal, o Brent subiu em 10% dos casos em 6 meses, e de 2% a 5% abaixo, em 79%. O índice amplo dá quase o mesmo. Por decisão do usuário: fica o índice das economias avançadas, como fator próprio (peso Médio). Metodologia do petróleo v7 | ADR 0100 |
| Pendências da demanda do petróleo (F4) | Contra o Brent futuro, o consumo dos EUA anda com o preço que já aconteceu (+0,28 com os 6 meses anteriores) e não o antecipa (perto de zero). A China do JODI não mostra relação com o Brent, e a queda de 2026 (−23,7% contra um ano antes em julho) acompanha a perda de oferta da OPEP no STEO (de 25,9 para 16,4 milhões de barris/dia de fevereiro a maio): no cálculo, um choque de oferta viraria demanda fraca. Por decisão do usuário: só os EUA, e o consumo medido basta, lido como situação; o indicador de atividade fica como lacuna. Metodologia do petróleo v6 | ADR 0099 |
| Pendências da geopolítica do petróleo (F3) | Sem validação contra o preço: as leituras de eventos só existem desde 02/10 e não se reproduzem para trás. Por decisão do usuário, as quatro perguntas viram decisões: fator próprio, como no FEL 1 (peso Alto), sem contar duas vezes a interrupção do F1; vale o evento mais grave da janela, não a quantidade; a ameaça sem efeito material conta como pressão de alta, menor que a da interrupção (o FEL 1: "tensão e risco"), e não é mais "só atenção"; a janela de 7 dias fica, sem registrar a vigência de cada fato, e a falta de evento novo não encerra uma situação em curso. Prompt do petróleo v8, metodologia do petróleo v5 | ADR 0098 |
| Pendências dos estoques do petróleo (F2) | Com o Brent futuro como referência, as validações passam a ser feitas contra ele; as já feitas contra o Brent à vista valem (correlação de 0,98 em 6 meses, mesmo sentido em 96% das semanas). No F2, o desvio contra a média de 5 anos anda com o preço (−0,50 com o nível), não o antecipa até 90 dias e, em 6 meses, aponta o contrário do FEL 1 (estoque 10% acima do normal: o Brent subiu em 66% das semanas; 10% abaixo, em 5%); a reação do dia não aparece (54%). Por decisão do usuário: o esperado é a média de 5 anos e a direção fica, como leitura da situação; a pressão vem só do petróleo sem SPR, e o desvio de Cushing, da gasolina e dos destilados vai ao prompt como contexto (hoje: petróleo +1,9%, destilados −13%). Cálculo v2, metodologia do petróleo v4 | ADR 0097 |
| Petróleo: o Brent futuro como preço de referência | Por decisão do usuário, a confirmar com o David na reunião do mesmo dia: a leitura do petróleo passa do Brent à vista da EIA ao Brent futuro, com um vencimento por horizonte (a regra do milho e do café; o BZ vence no último dia útil do 2º mês anterior), a curva no bloco 2.2 (antes SEM DADO), sem liquidez mínima (sem o volume na fonte) e as faixas recalibradas no futuro (0,8/2,3; 1,8/5; 4/11; 6/19%, a contínua sem o salto da rolagem). Configuração v4, prompt v7; o Centro de Decisão abre no futuro. No gráfico da Qualidade da IA, o Brent à vista da EIA vira linha de contexto, tracejada e fora da avaliação | ADR 0052, adendo |
| Brent futuro (NYMEX BZ) pelo Yahoo | O preço do petróleo no gráfico da Qualidade da IA parava em 29/09: o Brent da EIA sai uma vez por semana. E é o Brent físico, que em set/2026 ficou ~US$ 11 acima do futuro, o instrumento operado (P2 do ADR 0055). Testadas ICE (gratuita só no navegador; assinatura de US$ 2.500/ano), CME e Stooq (bloqueiam) e Yahoo. Por decisão do usuário, coletor do Brent futuro pelo Yahoo, **fonte não oficial e provisória**: ajuste diário por vencimento e o 1º vencimento contínuo desde 2007, só pregões encerrados (um pregão atrás). A troca da referência da leitura fica para outra decisão. As leituras do petróleo feitas com o WTI (03 e 04/10) foram apagadas, em dev e no servidor, por decisão do usuário | ADR 0096 |
| Eventos numa seção da base do prompt | No milho e no café, cada um dos 8 fatores levava os eventos marcados com ele (8 blocos por dia, quase sempre vazios), o que misturava o evento ao cálculo do fator; no ouro e no petróleo, um evento marcado com outro fator que não o de evento se perdia. Nos documentos do David, eventos só no F8 do milho e na geopolítica; a distribuição por fator era do FinMind (ADR 0058). Por decisão do usuário, os eventos vão a uma seção só da base do prompt dos quatro ativos, cada um uma vez e com a condição que afeta, sem peso nem leitura do motor; a geopolítica, a OPEP+ e o F8 do milho ficam com os seus. Prompts: milho v7, café v6, ouro v2, petróleo v6; metodologias do milho v21 e do café v13. O Centro de Decisão mostra quantos eventos foram à seção | ADR 0095 |
| Centro de Decisão: o prompt do ativo certo | Com o milho selecionado, "Ver prompt completo" abria o prompt do ouro da mesma data, aberto antes: o modal guardava o prompt só pela data. Passa a guardar pelo ativo e pela data. Só exibição: as leituras gravadas estavam certas | — |
| Gemini: a chave gratuita sem resposta passa a vez para a paga | O refazer da leitura de tendência do petróleo, do milho e do café falhou por tempo: a chave gratuita segurava a conexão por mais de 180 s e depois respondia 503 (sob carga), e o tempo esgotado não passava para a paga, que respondia em 108 s. Cada chave passa a ter uma janela de 240 s (`GEMINI_TIMEOUT_MS`, antes 180 s) para todas as tentativas dela; a gratuita sem resposta até o fim da janela passa a vez para a paga, e cada tentativa (chave, resultado e segundos) fica no bloco "IA" da tela Execuções | ADR 0047 |

</details>

<details>
<summary>Entregas de 2026-10-06</summary>

| Entrega | Resultado | Onde |
|---|---|---|
| Fundos do petróleo (F8) só como informação | Contra o Brent, contado por episódio e sem sobreposição, o extremo dos fundos não mostrou reversão nem continuação: muito vendidos, o Brent subiu em 66% das semanas, mas 8 de 14 sem sobreposição (p = 0,38); muito comprados, em 54%, o contrário da reversão. Janelas de 1 e 5 anos e o desvio-padrão, o mesmo. Por decisão do usuário, como no F7 do café: os fundos ficam sem pressão própria (um papel novo, "só informação", ao lado do contexto, sem fator-pai), e o extremo não baixa a confiança sozinho; fica o percentil de 3 anos. Metodologia do petróleo v3, prompt v5 | ADR 0094 |
| Refino do petróleo (F9) como contexto da demanda | Com o Brent como referência, as validações dos fatores do petróleo foram refeitas contra ele (antes, contra o WTI). No refino, a direção do FEL 1 não aparece: com a margem bem acima do normal, o Brent subiu em 26% dos casos 26 semanas depois (−7% em média), contra 48% em todas as semanas (−0,16 de correlação); o diesel dá o mesmo. Por decisão do usuário, o refino passa a contexto da demanda: sem pressão própria no prompt (hoje ia como alta forte), com a medida, a tendência e a validação; fica o 3-2-1. Metodologia do petróleo v3, prompt v5 | ADR 0093 |
| Eventos de mercado: o que os números ainda não mostram, nove fontes novas e a repetição | De 02 a 06/10 a tela Eventos do servidor só mostrou o petróleo, o mesmo fato de Ormuz dia após dia. A revisão achou a causa: "safra não é evento" valia para o mundo todo, o clima era só a geada do INMET, a demanda não tinha fonte e o mínimo de pesquisa consumia as buscas. Por decisão do usuário: prompt v14 (o número coletado do Brasil e dos EUA continua não sendo evento; o fato de safra ou clima que os relatórios ainda não mostram, a safra de país sem série, a mudança do El Niño, o furacão no Golfo e o mandato de etanol podem ser); nove fontes novas, testadas na pesquisa do Gemini (CENTCOM, NHC, BSEE, Bolsa de Rosario, governo da Argentina, EPA, MME/CNPE, Canal do Panamá e NOAA CPC; a Federação de Cafeteiros e o PIB da Índia ficaram de fora), 20 no total; o piso do petróleo pede uma fonte de geopolítica ou de oferta; contra a repetição, os aceitos dos 3 dias anteriores vão ao prompt e o evento sustentado só por páginas já usadas por um aceito do mesmo ativo é rejeitado como repetição; a tela ganhou o filtro de situação (aceitos, rejeitados, todos) com o motivo da rejeição. No teste, a Bolsa de Rosario relatava 70% da região núcleo da Argentina em seca, e o NHC, um sistema no Golfo: eventos que a v13 não tinha como achar. Resta a lacuna do café: o clima no Brasil fora da geada e a safra do Vietnã | ADR 0092 |
| Pendências da OPEP+ do petróleo (F1) | As perguntas viram decisões do usuário: ficam os 45 dias; toda decisão de produção da OPEP+ vira evento, inclusive manter as cotas (prompt de eventos v13); e o cumprimento das cotas, pedido pelo usuário, esbarrou no site da OPEP, bloqueado pelo Cloudflare. No lugar, uma fonte nova: o STEO da EIA, uma planilha por edição desde 2008, com a produção da OPEP e da OPEP+ por país e a capacidade ociosa, com o vintage (cada edição revisa). O F1 passa a fator calculado com eventos, em quatro casos: no histórico (225 edições), o Brent subiu 6 meses depois em 73% das edições em corte e em 41% das em aumento, contra 53% em todas; sem 2008-09 e 2020, 62% e 46%. Hoje é interrupção (a guerra no Golfo), sem pressão do fator. Card novo (67), metodologia do petróleo v2, prompt do petróleo v4 | ADR 0091 |
| Pendências dos juros do café (F8) | As perguntas viram decisões do usuário: o dólar global (índice amplo do Fed) vira condição só da regra de baixa (com o dólar subindo junto, a queda em 3 meses veio em 70% das semanas; com ele caindo, em 38%); na alta, sem condição; fica o juro nominal (o real foi pior). O F8 é o fator do café em que o histórico confirma o estudo (2007 a 2026). Cálculo do F8 v2, metodologia do café v11 | ADR 0090 |
| Pendências dos fundos do café (F7) | As perguntas viram decisões do usuário: fica a janela de 3 anos; o extremo só pesa com o catalisador de F1 ou F2, como a regra do estudo pede, porque no histórico (2009 a 2026) o extremo sozinho foi seguido de continuação, não de reversão (vendidos em extremo: alta em 3 meses em 33% das semanas, contra 46% em todas). A agregação do café passa à v2 (o F7 só baixa a confiança com o catalisador) e o prompt à v4. Metodologia do café v10 | ADRs 0089 e 0066 (adendo) |
| Pendências da demanda do café (F6) | As perguntas viram decisões do usuário: o consumo do PSD substitui as estatísticas da ICO (só para membros); a faixa neutra vira calibrada, 2 p.p. em torno de 1,5% (com a de 1% a 2% do estudo, nenhum ano de 2003 a 2026 era neutro); a arbitragem Nova York ÷ Londres fica como contexto (com o arábica caro, ele caiu menos, o contrário da substituição); a validação histórica vai ao prompt. Cálculo do F6 v2, metodologia do café v9 | ADR 0088 |
| Pendências do custo do café (F5) | As perguntas viram decisões do usuário: fica a mediana dos municípios de arábica da Conab (só Sul de Minas e Cerrado mudariam o custo total de 2025 em 6%); fica o custo operacional como COE, com a ressalva de que inclui a depreciação (com o custo variável, a regra não teria disparado em 15 anos); a validação histórica vai ao prompt: o preço abaixo do custo só em 2013-14, um episódio só. Metodologia do café v8 | ADR 0087 |
| Pendências do dólar do café (F4) | As perguntas viram decisões do usuário: a regra de baixa vale o ano todo (só no pico da safra, a queda em 1 mês veio em 47% das semanas, contra 49% na base do pico); o preço em reais recorde não entra como condição (o resultado se contradiz); a validação histórica vai ao prompt: de 2005 a 2026, o fator não separa o preço do arábica em 1 nem em 3 meses. Metodologia do café v7 | ADR 0086 |
| Pendências dos estoques do café (F3) | As perguntas viram decisões do usuário: fica o ritmo da v1 (variação em 4 semanas contra o próprio histórico); o nível não dá direção; as sacas aguardando classificação e os portos europeus (ECF) vão ao prompt como contexto, fora da regra; a validação histórica (no estoque mensal da ICO, 2012 a 2026, o estoque confirma, não antecipa: alta em 3 meses em 40% dos meses depois de uma queda, contra 43% em todos) vai ao prompt. Cálculo do F3 v2, metodologia do café v6 | ADR 0085 |
| Pendências da safra do café (F2) | As perguntas viram decisões do usuário: a faixa neutra de 2% e o forte de 5% ficam como ponto de partida até o backtest (as duas revisões fortes com preço depois acertaram; as moderadas se dividiram); a bienalidade fica como contexto, porque no PSD do USDA (1992 a 2025) a safra menor foi seguida de preço médio de −2,1% em 12 meses e a maior, de +16,8%: o ciclo é previsível e já precificado. Metodologia do café v5 | ADR 0084 |
| Pendências do clima do café (F1) | As perguntas viram decisões do usuário: o VHI da NOAA é a medida da v1, com a geada pelos eventos; ficam as janelas do estudo (junho a novembro), porque no histórico o enchimento (dezembro a março) não acrescenta (alta em 3 meses em 44% das semanas com pressão, contra 46% em todas; de junho a novembro, 78% contra 56%); o INMET fica para depois da v1. Metodologia do café v4 | ADR 0083 |
| Revisão crítica do café | Um subagente revisou as decisões do dia e reproduziu as tabelas. O F8 volta à regra da v1, com o dólar só como contexto: a condição só na baixa não tinha significância por episódio e era ajuste ao dado. O F7 deixa de mudar a confiança, porque o catalisador quase nunca acontecia. O F3 lê a ECF pelas versões publicadas até cada semana. O texto do F6 diz que a faixa reduz ruído, sem poder preditivo. Agregação do café v3, prompt v5, metodologia v12 | ADRs 0085, 0088, 0089 e 0090 (revisões) |
| Motor do café entregue | Decisão do usuário: o motor do café (v1) passa a "Entregue e aguardando validação", na §2 (Motores dos ativos), com os 8 fatores sem pergunta pendente | §2 |
| Motor do milho entregue | Decisão do usuário: o motor do milho (v1) passa a "Entregue e aguardando validação", na §2 (Motores dos ativos) | §2 |
| Ajustes ao FEL 1 do milho na tela | O David delegou e não revisa o documento: cada ajuste à tabela do milho aparece no fator, na tela de metodologia, com o texto original, o novo e a origem (F4, F5, F6 e F7); as inconsistências do documento ficam registradas como o FinMind lê, em "Como tratamos as considerações do FEL 1" (§2). Metodologia do milho v20, sem pergunta do ativo pendente | ADR 0082 |
| Etanol do milho: UNEM e ANP | Estudo preliminar das fontes pedidas pelo David: a UNEM não tem dado para coletar; a ANP é viável, mas não liga a regra de alta sozinha (a moagem cresceu contra o ano anterior em 104 de 104 meses). Não aprovadas | ADR 0073 (adendo) |
| Peso do F6 no FEL 1 | "Baixo (Médio para vencimentos de 6 meses ou mais, com margem ≤ 0)", o que o calendário do David aplica, no lugar de "Baixo-Médio" | ADR 0065 (adendo) |
| Agregação em código do milho fora do prompt | Decisão do usuário: fica na tela como referência, porque no histórico não supera os benchmarks | ADR 0081 (adendo) |

</details>

<details>
<summary>Entregas de 2026-10-05</summary>

| Entrega | Resultado | Onde |
|---|---|---|
| Agregação em código do milho | O calendário de pesos e as regras de agregação do David viram código (o bloco de oferta como um argumento, o F3 como filtro, o F7 multiplicando por 1,25 os fatores alinhados, o conflito com confiança BAIXA), com a escala e os limiares do café. Na tela de metodologia, fora do prompt por decisão do usuário (2026-10-06, ADR 0081, adendo). No histórico do CCM (2022 a 2026, 235 semanas), o motor não supera Sempre Lateral nem Persistência, e fora do LATERAL erra a direção na maioria das vezes no Médio e no Longo. Script `npm run agregacao:milho` | ADR 0081 |
| Fatores ausentes do milho | A pendência vira decisão do usuário: os fatores que o David propôs incluir (ração, frete e base MT→porto, prêmio em Paranaguá, soja, clima brasileiro como fator próprio) ficam para depois da v1, porque pedem fonte nova; cada um volta com demanda e autorização próprias. O clima brasileiro já chega como contexto do F2 e pelos eventos do INMET, e o frete está dentro da paridade do IMEA | ADR 0080 |
| Faixas da leitura da IA no milho e no café | A pendência das faixas vira decisão do usuário: ficam as calibradas no próprio futuro (percentis 40 e 80 por horizonte), não as 6 classes fixas do David. Nas classes fixas, o CCM em 1 dia cairia em "irrelevante" 80% das vezes e o ICF em 90 dias, em "excepcional" 60%; as calibradas ficam perto de 40/40/20 em todos os horizontes | ADR 0079 |
| Vencimento de cada horizonte no milho e no café | A pendência dos vencimentos vira decisão do usuário, no milho e no café: cada horizonte usa o vencimento mais próximo que ainda negocia depois da data-alvo, e a leitura e a avaliação do horizonte usam esse contrato. Com o mais próximo para todos, o contrato vencia antes da data-alvo em todos os dias no horizonte de 90 dias do milho (78% no café) e na metade no de 30: esses horizontes nunca seriam avaliados. A curva (ajuste e contratos negociados de cada vencimento) vai ao prompt; abaixo de 100 contratos no dia, aviso de pouca liquidez. Configuração e prompt do milho e do café nas versões novas | ADR 0078 |
| Calendário de pesos do milho e colheita da safrinha | Duas pendências do ativo viram decisões do usuário: o F1 de janeiro a maio fica Baixo (o fator não tem leitura nesses meses) e o F2 em janeiro e fevereiro, Médio, marcados como do usuário na tela e no prompt; o ajuste do F1 entra: o andamento da colheita de MT (IMEA) vai ao F2 como contexto e, de junho a agosto, com 50% ou mais colhido, o peso do F1 cai um nível (de 2018 a 2026, o ESALQ acompanhou Chicago em reais 0,95 abaixo de 50% colhido e 0,45 acima). Também: a pendência das faixas corrigida (já são do CCM) e o F7 na lista de correções do FEL 1. Safrinha v3, metodologia do milho v13 | ADR 0077 |
| Pendências da política comercial do milho (F8) | As três perguntas viram decisões do usuário: no lugar do volume estimado (o evento não o traz), conta como pressão o ato oficial com intensidade média ou alta na leitura por IA; o decaimento é a janela de 30 dias; o ritmo segue pelo acumulado do ano comercial (troca de direção 39 vezes em 198 meses, contra 63 do mês sozinho). Contra o preço americano do FMI (2010 a 2026), a relação é inversa à regra (embarques fortes, Chicago mais fraco depois) e vai à validação do prompt; a regra e o peso não mudam. Prompt do milho v5, metodologia v12 | ADR 0076 |
| Pendências dos fundos do milho (F7) | As duas perguntas viram decisões do usuário: nos extremos, a reversão da regra substitui o "amplifica" do FEL 1, com a ressalva dos comprados (contra o preço americano do FMI, de 2016 a 2026, a reversão dos vendidos se confirma e a dos comprados não, por causa do ciclo de 2021-22); o extremo sozinho já é pressão, sem esperar o gatilho de F1, F3 ou F8, que no histórico não melhorou a leitura. O cálculo não muda; metodologia do milho v11 | ADR 0075 |
| Pendências dos insumos do milho (F6) | As duas perguntas viram decisões do usuário: a relação de troca entra, com a ureia importada do Comex Stat (coleta nova, autorizada só para este fator; ureia, cloreto de potássio e MAP desde 1997, card de importação de adubo) em R$/t pela PTAX ÷ o Indicador ESALQ, e o percentil contra os meses anteriores (o ESALQ começa em 2018); a margem confortável é a margem acima da média das até 5 safras anteriores. De jul/2023 a set/2026 o adubo caro não antecipou o ESALQ em 13 semanas (sinal defasado, como na proposta). Cálculo v2, metodologia do milho v10. No servidor: `npm run backfill:comex-adubo` | ADR 0074 |
| Pendência do etanol do milho (F5) | A pergunta vira decisão do usuário: a v1 roda só com a parte dos EUA (a EIA), declarando a falta do etanol brasileiro e da margem (fonte nova). Contra o preço americano do FMI (2010 a 2026) o fator não mostra relação, nem junto com o preço; a validação histórica do prompt diz isso, e o peso do David não muda. Metodologia do milho v9 | ADR 0073 |
| Pendências do dólar e da paridade do milho (F4) | As quatro perguntas viram decisões do usuário: a praça é Campinas; a paridade pronta do IMEA fica, com a parte do câmbio declarada; a base (ESALQ − paridade) passa a ser comparada com a própria mediana de 52 semanas (contra zero a alta nunca disparava; agora dispara em 7 semanas de 2021 a 2026, com o ESALQ +3,5% em 13 semanas); a pergunta do peso fica só no ativo (FEL 1 revisado). Cálculo v2, metodologia do milho v8 | ADR 0072 |
| Pendências dos estoques do milho (F3) | As três perguntas viram decisões do usuário: os EUA decidem (o mundo menos a China é contexto); o nível e a revisão seguem dando direção, e a validação contra o preço americano do FMI (186 edições) vai ao prompt: sentido do FEL 1 junto com o preço, sem antecipação; o estoque/uso do Brasil (Conab) vai como contexto até haver 10 safras. Cálculo v2, metodologia do milho v7 | ADR 0071 |
| Pendências da safrinha do milho (F2) | As três perguntas viram decisões do usuário: o alerta agroclimático fica fora da conta (o VHI da NOAA sobre o milho de MT e do PR dispararia em 19 de 27 safrinhas, inclusive nas recordes, e vai ao prompt só como contexto; a geada chega pelos eventos do INMET); a revisão acumulada e o viés de baixa fraco ficam como o cálculo já lia. Cálculo v2, metodologia do milho v6 | ADR 0070 |
| Clima do milho validado contra Chicago | Coletor `fred-milho-fmi`: o preço mensal do milho americano do FMI pelo ALFRED (desde 1992, com as versões; card `MILHO_PRECO_FMI`), no lugar do ZC pago. Contra ele (34 safras), o F1 tem o sentido do FEL 1 junto com o preço (-0,57) e não o antecipa (perto de zero em 1 a 3 meses), nem em Chicago nem no CCM. Por decisão do usuário, o peso do calendário do David não muda; a validação histórica do prompt diz isso, e a última pergunta do F1 sai (metodologia do milho v5). Em dev e no servidor (2026-10-05: 1.529 lidos, 415 meses, 0 falhas nos dois) | ADR 0069 |
| Previsão do NOAA/CPC no clima do milho | Coletor `noaa-cpc`: a previsão de 6 a 10 e de 8 a 14 dias (temperatura e chuva) num ponto de cada um dos 5 maiores estados de milho, num card só (`NOAA_CPC_MILHO`), sem histórico (só a emissão do dia). O fundo do mapa (`Normal` 36%) é a área de chances iguais. No F1 (cálculo v2, metodologia do milho v4), por decisão do usuário: a alta pede calor acima e chuva abaixo em 3 ou mais dos 5 estados, e a baixa, que isso não ocorra; sem previsão (antes de 2026-10-05), a condição não se aplica. A previsão por estado vai ao prompt. Em dev e no servidor (2026-10-05: 20 séries, 0 falhas) | ADRs 0067 e 0068 |
| Card de Evidências do Centro de Decisão | Sem a linha do preço, que repetia o card ao lado (o preço que a IA recebeu fica no "Ver detalhes"); até 8 fatores no card, com a sigla F1...Fn da Metodologia, também no detalhe; a moeda do preço no detalhe vem do ativo (R$ no milho, antes fixa em US$) | ADR 0052 |
| Regras de peso do milho no prompt | As regras de peso por força do sinal do David (F1 de baixa com a polinização, F2 com revisão fraca, F3 convexo, F5 de baixa) vão ao bloco 2.5 do prompt do milho (v3), ao lado das condições; o ajuste do F1 pela colheita da safrinha virou pergunta (o andamento não está na BASE). Na tela, sai a coluna "Sugestão do especialista" e entra "Hoje no FinMind", com as mesmas linhas do prompt. As frases das relações entre os fatores também vão ao bloco 2.5 (v4); a matriz de símbolos fica só na tela. Nas regras de agregação, os fundos e os sinais defasados passam a "Orientação no prompt" (o F6 com a data de efeito esperada); os eventos seguem sem validação humana, faltando o valor do volume relevante e do decaimento | ADR 0065 (adendos) |
| Agregação determinística do café | Em produção, por decisão do usuário, a validar pelo Comitê: a Oferta (clima, safra e estoques) como um voto, por precedência e confirmação; peso da família por horizonte derivado do horizonte de cada fator no estudo e do peso do FEL 1 (Imediato e Curto 60/40; Médio e Longo 50/33/17; custos 0); o F7 só rebaixa a confiança. Os limiares de score, cobertura, conflito e confiança e o teto MÉDIA são parâmetros do FinMind, não do David, e ficam fixos até o backtest. Vai ao prompt do café (v2, bloco 3B) como evidência para a IA, fica gravada com cada leitura e aparece no Centro de Decisão ("Motor", com "diverge da IA") e na Qualidade da IA (previsor "Motor"); script `npm run agregacao:cafe` para o histórico e um card na tela de metodologia, com a origem de cada regra. Na mesma tela, as regras do estudo do café passaram a "Orientação no prompt" (o que são desde o ADR 0062). Dev e servidor (2026-10-05) | ADR 0066 |
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
