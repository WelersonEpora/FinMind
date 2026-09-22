# FinMind — Status do projeto

Painel de uma página: o que está **pronto**, o que **falta** e o que está
**bloqueado** por decisão do especialista de mercado (David) ou do Comitê.
Serve para retomar o trabalho sem reconstruir o contexto.

**Última atualização: 2026-09-22.**

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

## 2. Pronto

### Plataforma

| Item | Detalhe |
|---|---|
| Autenticação e papéis (`admin`/`user`) | Cookie JWT httpOnly, sessão de 12h (sem refresh token), revalidação a cada request, gestão de usuários |
| Espaços (`workspace`) | Espaço pessoal + compartilhados, seletor na sidebar. **Ainda sem dado privado** — ADR 0007 |
| Pipeline de coleta | Download → parse → normalize → persist, retry, log em `collection_execution` — ADR 0002 |
| Camada point-in-time | Tabela `observation` append-only + `asOf()` — ADR 0008 |
| Fator versionado | `backend/src/factors/juro-real-10a.factor.js` (`DGS10 − T10YIE`), validado contra DFII10. Não exposto na tela |
| Tela "Status do projeto" | `/status-projeto` (menu Sistema): renderiza este arquivo, via `GET /api/v1/status-projeto`. Visível a **todo usuário autenticado** — temporária, a retirar depois da fase de desenvolvimento. O `deploy.yml` copia o arquivo para a imagem do backend |
| Telas de dados | `/dados-mercado/observaveis` (20 cards) e `/dados-mercado/execucoes` — ADR 0005 |
| Agendamento | Dev: Agendador do Windows às 22:00. Produção: cron do usuário `deploy` (04:00, 06:00, 08:00 **UTC**, **não versionado**), confirmado por SSH em 2026-09-21: dispara nos 3 horários e todos os coletores terminam em `success` — ADR 0004 |
| CI/CD | Lint + testes + build em toda branch; deploy por push na `main`, que já roda as migrations automaticamente (`scripts/deploy.sh`, passo 4/6) |

### Dados coletados

Status de cada fonte, evidências e ressalvas: **ADR 0009**.

| Fonte | Séries | Histórico | `published_at` | Status |
|---|---|---|---|---|
| BCB SGS | Dólar (PTAX venda), Selic meta e realizada | Dólar desde 01/07/1994, Selic realizada desde 04/07/1994, meta desde 05/03/1999 — dev e produção (backfill feito em 2026-09-21) | — (`market_quote`, não revisa) | ✅ ADRs 0001, 0006 |
| FRED | DGS10, T10YIE, DFII10, DTWEXBGS | DGS10 desde 1962; DFII10/T10YIE 2003; DTWEXBGS 2006 | Estimado | ✅ Coleta pela API, CSV de reserva — ADR 0012. Vintage real (ALFRED) provado via teste — ADR 0011 |
| LBMA | Ouro PM (USD/oz) | Desde 1968 | Estimado | ✅ Licença da IBA exigida p/ exibir/redistribuir — adiada (uso interno) |
| CFTC COT | Ouro e milho (open interest, MM long/short) | Desde 2006 | Real desde 2022-08; estimado antes | ✅ |
| USDA NASS | Crop Progress do milho (12 séries) | Desde 1980 (piso real da API; cada série começa no seu ano) | Estimado (regra não validada p/ 1980–2005) | ✅ Validado em 2026-09-21 (6.758 linhas); histórico 1980+ já carregado no servidor (informado pelo usuário) |
| B3 CCM | Futuros de milho, por vencimento | ~15 meses, janela rolante | Estimado | ✅ 10+ anos **não existem de graça** |
| Comex Stat (MDIC) | Exportação de milho, mensal (volume em kg e valor FOB em US$) | **Desde 2005** (jan/2005 a ago/2026, 260 meses); antes disso o código NCM muda e não foi mapeado — pode ser estendido depois | Estimado (dia 15 do mês seguinte); revisões da fonte não confirmadas | ✅ Validado em 2026-09-21 em dev e produção (260 meses por série) — ADR 0013 |
| USDA WASDE (ESMIS) | Balanço do milho por edição mensal: EUA (13 atributos) e ~20 regiões do mundo (7 atributos), 167 séries | **Desde 2011-01** (188 edições, XLS; antes só PDF/TXT) | **Real, com dia** (data do release); **vintage real**: 24.542 revisões guardadas | ✅ Validado em 2026-09-21 em dev (27.309 linhas) e **backfill já rodado no servidor** (informado pelo usuário) — ADR 0015 |
| Conab (Boletim da Safra de Grãos) | Milho por safra (1ª, 2ª, 3ª e total) por Região/UF (área, produtividade, produção) e balanço nacional (estoque inicial e final, produção, importação, suprimento, consumo, exportação, demanda total): 397 séries | **Vintage (estimativas mês a mês) só desde fev/2025**: são 15 levantamentos mensais, o máximo que o índice da Conab mantém (com lacunas); antes disso a fonte não oferece. O balanço traz também os valores de safras de 2018/19 a 2025/26, mas sem vintage próprio. As séries históricas desde 1976/77 e os preços **não** foram carregados (adiado por decisão) | **Real, com data e hora** (página do levantamento); **vintage real**: cada levantamento é uma versão (até 10 revisões por valor). Nas safras antigas é um **limite superior**: entra com a data do primeiro levantamento lido, então uma consulta anterior a fev/2025 volta vazia | ✅ Validado em 2026-09-21 em dev (3.436 linhas) e **backfill e coleta diária já rodados no servidor, 0 falhas** (informado pelo usuário) — ADR 0017 |
| IMEA — milho de MT | Área/produção/produtividade por safra (Mato Grosso + 7 regiões, 3 indicadores identificados na API por casamento de valor) e custo de produção (Mensal/Ponderado × Alta/Média Tecnologia, ~62 itens por hectare): 3 cards (Mensal e Ponderado convivem no mesmo seletor de custo mensal, como o WASDE faz por unidade — aqui por frequência) | Safras 2022/23 a 2025/26 (API) e custo publicado em 15/09/2026 (catálogo). **Sem backfill possível**: nem a API nem o catálogo de arquivos guardam edições anteriores — o vintage começa a partir de agora | **Real, só a data** (data da última atualização na API; data do arquivo no catálogo) | ✅ Validado e gravado no banco de dev em 2026-09-22 (96 observações de safra; 15.402 de custo, 5.073 séries; reexecução idempotente) — ADR 0018 |

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
licença pendente. Por isso a coluna de ressalvas é a que importa na reunião:

| Fonte | Nível | Ressalva principal | Depende de |
|---|---|---|---|
| BCB dólar / Selic | 5 | Meta traz datas futuras (até a próxima reunião do Copom) — é o alvo vigente, não uma previsão | — |
| FRED | 5 | Licença lida: 3 de 4 séries domínio público c/ citação; `T10YIE` não confirmada. **Adiada** (uso interno) | Retomar antes de exibir a terceiros |
| LBMA (ouro) | 5 | **Exige licença da IBA** p/ usar/redistribuir o histórico. **Adiada** (uso interno) | Retomar antes de exibir a terceiros |
| CFTC COT | 5 | Data de publicação estimada antes de 2022-08 | — |
| USDA Crop Progress | 5 | Data de publicação estimada, não validada p/ 1980–2005 | — |
| B3 CCM | 5 (limitado) | **Só ~15 meses de histórico grátis** | David/Comitê (pergunta 3, orçamento) |
| Comex Stat (MDIC) | 5 | **Histórico só a partir de 2005** (NCM anterior não mapeado); revisões não confirmadas; rate limit rígido (429) | — |
| USDA FAS PSD (milho) | 1 | Reconhecida, **sem coletor; adiada por decisão do usuário (2026-09-21)**: o WASDE por país já cobre o necessário por ora. Sem vintage histórico (API só dá a edição atual); licença e janela do rate limit não confirmadas | Retomar só se o David pedir países fora da seleção do WASDE ou histórico anterior a 2008 |
| USDA WASDE — arquivo ESMIS (milho) | 5 | **Só de 2011 em diante** (antes só PDF/TXT); só EUA e ~20 regiões; raspa o HTML da listagem (sem API confirmada); republicação do mesmo dia mantém a 1ª versão; licença e limite de uso não confirmados. **Backfill já rodado em produção (informado pelo usuário)**. Em qualquer banco novo ele vem ANTES da coleta diária: a diária se recusa a gravar enquanto a fonte estiver vazia (senão truncaria o vintage) | — |
| Conab — boletim mensal (milho: 1ª/2ª/3ª safra por UF e balanço) | 5 | **Vintage real por levantamento**, `published_at` real; **só de fev/2025 em diante** (o que o índice mantém, com lacunas). Sem API (quebra se o layout mudar); `published_at` das safras antigas é limite superior; a planilha é a versão atual (pode ter correção posterior); licença não verificada. **Backfill já rodado no servidor (2026-09-21, informado pelo usuário; o log mostra 15 levantamentos, 0 falhas, 88 s: a Conab é acessível de lá)**. Em qualquer banco novo ele vem ANTES da coleta diária | — |
| Conab — séries históricas (desde 1976/77) e preços | 1 | Reconhecidas, **sem coletor por decisão do usuário**: as séries históricas não têm vintage; os preços em TXT cobrem só ~12 meses e o histórico longo segue bloqueado | Retomar quando houver uma opção |
| IMEA — milho de MT (safra e custo) | 4 | **Sem backfill possível** (nem a API nem o catálogo guardam edição anterior): vintage começa agora. IDs de indicador sem nome (identificados por casamento de valor); oferta/demanda, intenção de plantio e andamento de safra existem só em PDF e não foram implementados; licença não investigada | — |
| CEPEA, NOAA, CPI, WGC | 0 | Candidatas, fora do escopo; CEPEA bloqueada para automação | David (pergunta 7) |

Processo: `docs/processo-reconhecimento-fontes.md`. Uma linha por fonte, com
evidência: `docs/reconhecimento-fontes/README.md` (checklist completo de FRED e
LBMA em arquivos próprios, por causa da licença).

## 3. Falta fazer

Fontes de **milho** que o relatório do David lista (FEL 1, §6.5, §7 e o plano de
integração da §9.2) e que ainda **não coletamos**. Já feitas: USDA NASS (Crop
Progress), CFTC, B3 (CCM), Comex Stat, WASDE (balanço do milho), Conab (boletim mensal), IMEA (área/produção/produtividade por safra e custo), BCB SGS e FRED. Aqui se faz o **reconhecimento** de cada
fonte (níveis 0→1, `docs/processo-reconhecimento-fontes.md`) e a **recomendação**,
para decidir e levar à reunião com o David. **Reconhecer não é implementar:**
nenhum coletor novo entra sem a decisão do David ou autorização explícita
registrada em ADR (§5). Só entram fontes que ele mencionou; o AgroMind já
reconheceu várias delas, e reaproveita-se o conhecimento (endpoints, layout,
armadilhas), não o código (outro banco, outra arquitetura).

| # | Fonte (como o relatório a descreve) | Observação |
|---|---|---|
| 1 | **CEPEA/ESALQ** — indicador diário do preço do milho. O relatório diz "scraping viável; sem API oficial" | **Bloqueada:** Cloudflare e Termos de Uso (`docs/analise-critica-fel1-milho-ouro.md`). No AgroMind só entra por exportação manual. Depende do David: pergunta 7 |
| 2 | **FAO/AMIS** — balanço global de grãos (FAOSTAT API). Fase 2 do plano | Nunca reconhecida, nem no AgroMind |
| 3 | **BCB Focus** — expectativas de mercado. Fase 1 do plano (o SGS de dólar e Selic já está feito) | AgroMind: nível 3, só a Selic; API Olinda pública |
| 4 | **Clima** (§6.5.1, acrescentada na revisão como obrigatória) — NOAA, INMET, NASA POWER, CPTEC/INPE, ECMWF/Copernicus ERA5 | NOAA, INMET e NASA POWER: API gratuita. ERA5: cadastro. Somar/Climatempo: comerciais, Fase 3. AgroMind: NOAA em nível 0 |
| 5 | **Abimilho** e **CNA** — estatísticas e panorama do setor | Sem API (HTML/PDF), periódico. Menor prioridade |
| 6 | **Consolidar a recomendação para a reunião** | Uma linha por fonte: adotar, adiar ou descartar, com custo, licença, histórico, risco e o que depende do David. Alimenta as perguntas 2, 3, 5 e 7 da §4 |

O IMEA foi implementado só em **área, produção, produtividade e custo de
produção** (o que a API e o catálogo de arquivos do site oferecem em
JSON/XLSX). Oferta e demanda (balanço), intenção de plantio e andamento de
semeadura/colheita — o resto do que o item pedia — existem só em PDF e
**não** foram implementados (ADR 0018).

Fora desta lista, por já estarem na §4: o **preço histórico dos futuros** (B3 com
10+ anos e CME ZC, ambos pagos — pergunta 3) e as fontes de ouro que ele lista e
não coletamos (WGC, CME/COMEX, FMI, US Treasury, USGS, Banco Mundial).

## 4. Bloqueado — depende do David / Comitê

Itens 4 a 8 de `docs/pendente-especialista-david.md` continuam sem definição:
regras e cálculos do motor, formato de apresentação, avaliação da IA,
condições de sinal e execução de ordens.

Perguntas da análise crítica (`docs/analise-critica-fel1-milho-ouro.md`, §H).
Preencher a resposta e a data quando o David responder.

| # | Pergunta | Trava? | Resposta / data |
|---|---|---|---|
| 1 | Milho + Ouro como **prova de arquitetura** (sem mudar a ordem CAFÉ→PETRÓLEO→MILHO→OURO) é aceitável? | | — |
| 2 | Milho: **CCM (B3)** ou **ZC (CME)**? Ouro: **GC** ou preço de referência? | | — |
| 3 | Existe **orçamento para dados de preço**? Sem isso não há backtest | ⛔ | — |
| 4 | Confirmam que o **COTAHIST não atende CCM/ICF**? Qual a alternativa? (o ADR 0009 já confirma que não atende) | | — |
| 5 | **Vintage do agro:** backtest com dado revisado e viés declarado, ou acumular a partir de agora? | ⛔ | — |
| 6 | Quem responde por **licença e redistribuição** das fontes? Não trava hoje (sem distribuição prevista, decisão de 2026-09-21); passa a travar se isso mudar | | — |
| 7 | **CEPEA** está bloqueada para automação. Export manual é aceitável em produção? | | — |
| 8 | Backtest de **1–5 anos** (§4) ou **10–15 anos** (§12.1)? Qual vale? | | — |
| 9 | Qual o **benchmark** do Sharpe mínimo? | | — |
| 10 | Os limiares da §12.2 serão deliberados **antes** dos testes? | | — |
| 11 | A **IA propõe hipóteses e narra, mas não gera o sinal**? | ⛔ | — |
| 12 | IA Search só para descoberta de fonte e evento qualitativo, **vedada** como origem de número? | | — |
| 13 | As **Seções 15 e 16** (Registro de Revisão) do relatório existem? | | — |
| 14 | **WASDE impacta café** (planilha) ou não (texto revisado)? Qual prevalece? | | — |

## 5. Fora do escopo por enquanto

Não implementar sem autorização explícita registrada em ADR:

- Café, petróleo e qualquer ativo além de USD/BRL, Selic, ouro e milho.
- CEPEA (bloqueada por Cloudflare), Conab (séries históricas e preços), IMEA (oferta e demanda, intenção de plantio — só em PDF), WGC, PSD, clima, CPI.
- Série contínua de futuros, rolagem e backtest.
- Qualquer sinal, limiar, indicador técnico ou regra de compra/venda.
- IA em qualquer ponto (o ADR 0010 é só proposta de desenho futuro).
- Execução automática de ordens e corretora.

## 6. Entregas realizadas

Registro histórico, recolhido para não ocupar espaço: clique para expandir.

<details>
<summary>Entregas de 2026-09-22</summary>

Registro do que foi fechado na lista "Falta fazer" anterior (detalhe nos documentos apontados):

| Entrega | Resultado | Onde |
|---|---|---|
| IMEA — milho de MT (safra e custo) | Dois coletores: `imea-milho-safra` (área, produção e produtividade de Mato Grosso e das 7 regiões do IMEA, por safra — 3 indicadores identificados por casamento de valor numa API que não nomeia os ~130 que traz) e `imea-custo-milho` (as 4 planilhas XLSX de custo de produção do site, ~62 itens por hectare, em Mensal/Ponderado × Alta/Média Tecnologia). Validado contra a fonte real e gravado no banco de dev: 96 observações de safra e 15.402 de custo (5.073 séries), com 2 inválidas reais (colunas ambíguas na planilha, não fixture); reexecução idempotente, 0 revisão espúria. 3 cards novos nos Observáveis (1 de safra + 2 de custo). **Autorizado pelo usuário em 2026-09-22**. **Dois achados corrigidos na validação contra o banco real** (nenhum aparecia com fixture): `observation.series_code` era `VARCHAR(60)`, curto demais para a convenção do IMEA (até 91 chars) — 10.364 observações eram descartadas em silêncio pelo `INSERT IGNORE`; nova migration alarga para 120. E valores do IMEA com mais de 6 casas decimais discordavam do arredondamento do `DECIMAL(18,6)` e geravam revisão falsa a cada coleta; corrigido arredondando no parser. **Desenho dos cards revisto no mesmo dia**: a 1ª versão tinha 4 cards de custo (um por arquivo-fonte); questionado pelo usuário (comparando com o WASDE, que separa cards só por incompatibilidade real - lá, unidade), Mensal e Ponderado passaram a conviver no MESMO seletor de custo mensal (mesma unidade, mesma frequência, mesmos itens) - só a safra consolidada (frequência anual, incompatível com a mensal) ficou em card à parte, fechando em 3 cards. **Sem backfill possível**: nem a API nem o catálogo de arquivos guardam edição anterior — diferente do WASDE/Conab, o vintage só começa a existir a partir da 1ª coleta diária real. Oferta e demanda, intenção de plantio e andamento de safra existem só em PDF e **não** foram implementados (mesmo limite de PDF já visto no WASDE) | ADR 0018 |

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
| Reconhecimento da PSD do USDA (adiada) | Fonte reconhecida (nível 1): API JSON com chave própria `FAS_API_KEY`, milho desde 1960, 125 países + mundo. **Adiada por decisão do usuário**, sem coletor: o WASDE por país já cobre 14 países e os agregados desde 2008, com vintage real. **Ressalvas:** a PSD só acrescentaria os países fora da seleção do WASDE (Índia, Indonésia, Vietnã etc.) e o histórico anterior a 2008; a API só devolve a edição mais recente, **sem vintage**; licença e janela do rate limit não confirmadas; continua listada na §5 e só vira coletor com decisão do David ou autorização registrada em ADR (a pergunta 5 da §4, sobre o vintage do agro, segue aberta, mas não trava mais a PSD) | ADR 0014 |
| Reconhecimento da Conab (nível 1) — base do coletor abaixo | Três caminhos públicos, sem chave e sem captcha, abertos com chamada real: **(A)** planilha XLSX do boletim mensal (1ª/2ª/3ª safra por UF e balanço com estoque, consumo, importação e exportação; um vintage por levantamento), **(B)** séries históricas XLS de 1ª/2ª safra desde 1976/77 (sem vintage) e **(C)** preços em TXT (só ~12 meses, atualizados diariamente). Sem coletor: depende do David. **Ressalvas:** sem API nem dicionário de dados (quebra se o layout mudar); licença não verificada; aba da 3ª safra e arquivos municipais não abertos; o histórico longo de preço segue bloqueado | ADR 0016 |
| Conab — milho do boletim mensal (coletor + backfill + 2 cards) | Coletor diário `conab-milho`: safra 1ª/2ª/3ª/total por Região/UF (área, produtividade, produção) e balanço nacional (estoque, consumo, importação, exportação), **com `published_at` real** (data e hora da página do levantamento). Backfill dos 15 levantamentos do índice (fev/2025 a set/2026): 397 séries, 3.436 linhas, até 10 revisões por valor, 0 falhas; a coleta diária repetida é idempotente (0 criados, 830 iguais). Cards "Milho por safra e UF (Conab)" (checkboxes de Região/UF) e "Milho - balanço nacional (Conab)" (seletor de métrica). **Autorizado pelo usuário em 2026-09-21**. **Backfill já rodado no servidor (informado pelo usuário; log: 15 levantamentos, 0 falhas, 88 s)**; em um banco novo ele vem antes da coleta diária (a diária recusa enquanto a fonte estiver vazia). **Ressalvas:** só de fev/2025 em diante (lacunas no índice); `published_at` das safras antigas é limite superior; a planilha é a versão atual (pode ter correção posterior à publicação); sem API (quebra se o layout mudar); licença não verificada. **Fora, por decisão do usuário (adiado, não pendente):** as séries históricas de 1ª/2ª safra desde 1976/77 (XLS, sem vintage) e os preços da Conab (TXT, só ~12 meses; o histórico longo segue bloqueado), reconhecidos no ADR 0016, ver §2 e §5. **Conab concluída em 2026-09-21**: o coletor rodou no servidor (backfill e coleta diária, 0 falhas) | ADR 0017 |
| Padrão das telas de observável | Toda tela de detalhe herda, sem código por card: **exportação da tabela em CSV** (série inteira, mesmos filtros, coluna de métrica), período do gráfico com a opção **Tudo** e **10 anos como padrão nas séries anuais** (`utils/periodo-grafico.js`), título com a métrica em uso e gráfico com até 12 cores distintas. Fixado como convenção no `CLAUDE.md` (um card novo é só uma entrada no catálogo; um teste barra frequência desconhecida). O nginx passou a servir o `index.html` com `Cache-Control: no-cache` (e os arquivos com hash em cache longo): depois de um deploy o navegador não abre mais a tela antiga (achado real: só o refresh forçado mostrava a tela nova) | `CLAUDE.md`, `frontend/nginx.conf` |

</details>
