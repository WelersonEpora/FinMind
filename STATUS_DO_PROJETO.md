# FinMind — Status do projeto

Painel de uma página: o que está **pronto**, o que **falta** e o que está
**bloqueado** por decisão do especialista de mercado (David) ou do Comitê.
Serve para retomar o trabalho sem reconstruir o contexto.

**Última atualização: 2026-09-21.**

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
| Telas de dados | `/dados-mercado/observaveis` (17 cards) e `/dados-mercado/execucoes` — ADR 0005 |
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
| USDA NASS | Crop Progress do milho (12 séries) | Desde 1980 (piso real da API; cada série começa no seu ano) | Estimado (regra não validada p/ 1980–2005) | ✅ Validado em 2026-09-21 (6.758 linhas) |
| B3 CCM | Futuros de milho, por vencimento | ~15 meses, janela rolante | Estimado | ✅ 10+ anos **não existem de graça** |
| Comex Stat (MDIC) | Exportação de milho, mensal (volume em kg e valor FOB em US$) | **Desde 2005** (jan/2005 a ago/2026, 260 meses); antes disso o código NCM muda e não foi mapeado — pode ser estendido depois | Estimado (dia 15 do mês seguinte); revisões da fonte não confirmadas | ✅ Validado em 2026-09-21 em dev e produção (260 meses por série) — ADR 0013 |
| USDA WASDE (ESMIS) | Balanço do milho por edição mensal: EUA (13 atributos) e ~20 regiões do mundo (7 atributos), 167 séries | **Desde 2011-01** (188 edições, XLS; antes só PDF/TXT) | **Real, com dia** (data do release); **vintage real**: 24.542 revisões guardadas | ✅ Validado em 2026-09-21 em **dev** (27.309 linhas; produção depois do deploy) — ADR 0015 |

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
| USDA FAS PSD (milho) | 1 | Reconhecida, **sem coletor**. Sem vintage histórico (API só dá a edição atual); licença e janela do rate limit não confirmadas | David (pergunta 5) |
| USDA WASDE — arquivo ESMIS (milho) | 5 (dev) | **Só de 2011 em diante** (antes só PDF/TXT); só EUA e ~20 regiões; raspa o HTML da listagem (sem API confirmada); republicação do mesmo dia mantém a 1ª versão; licença e limite de uso não confirmados. Em produção falta o backfill | Deploy + backfill na VM |
| CEPEA, Conab, IMEA, NOAA, CPI, WGC | 0 | Candidatas, fora do escopo; CEPEA bloqueada para automação | David (pergunta 7) |

Processo: `docs/processo-reconhecimento-fontes.md`. Uma linha por fonte, com
evidência: `docs/reconhecimento-fontes/README.md` (checklist completo de FRED e
LBMA em arquivos próprios, por causa da licença).

## 3. Falta fazer

Fontes de **milho** que o relatório do David lista (FEL 1, §6.5, §7 e o plano de
integração da §9.2) e que ainda **não coletamos**. Já feitas: USDA NASS (Crop
Progress), CFTC, B3 (CCM), Comex Stat, WASDE (balanço do milho), BCB SGS e FRED. Aqui se faz o **reconhecimento** de cada
fonte (níveis 0→1, `docs/processo-reconhecimento-fontes.md`) e a **recomendação**,
para decidir e levar à reunião com o David. **Reconhecer não é implementar:**
nenhum coletor novo entra sem a decisão do David ou autorização explícita
registrada em ADR (§5). Só entram fontes que ele mencionou; o AgroMind já
reconheceu várias delas, e reaproveita-se o conhecimento (endpoints, layout,
armadilhas), não o código (outro banco, outra arquitetura).

| # | Fonte (como o relatório a descreve) | Observação |
|---|---|---|
| 1 | **USDA FAS — PSD Online** — oferta e demanda global (o WASDE, que é o balanço mensal dos EUA e principais países, **já está coletado**, ver §2 e ADR 0015). Fase 1: PSD tem API | **Reconhecida (nível 1, 2026-09-21), sem coletor** — ADR 0014. API JSON com chave própria `FAS_API_KEY` (a do NASS não serve); milho desde 1960, 125 países + mundo. Só devolve a edição mais recente (sem vintage): o vintage vem do WASDE. Faltaria só a **cobertura larga** (125 países, desde 1960). Recomendação: adotar como histórico largo; depende do David |
| 2 | **Conab** — safras 1ª e 2ª, estoques, balanço. "Sem API pública oficial" (boletins PDF/XLSX, mensal) | AgroMind: balanço via XLSX em nível 5; preços (Portal de Informações) bloqueados por reCAPTCHA. O boletim revisa as estimativas (a medir) — ADR 0011 |
| 3 | **IMEA (MT)** — oferta e demanda em MT, custos, intenção de plantio. Boletins mensais XLSX/PDF | AgroMind: nível 4, mas só devolve o valor mais recente (histórico não confirmado) |
| 4 | **CEPEA/ESALQ** — indicador diário do preço do milho. O relatório diz "scraping viável; sem API oficial" | **Bloqueada:** Cloudflare e Termos de Uso (`docs/analise-critica-fel1-milho-ouro.md`). No AgroMind só entra por exportação manual. Depende do David: pergunta 7 |
| 5 | **FAO/AMIS** — balanço global de grãos (FAOSTAT API). Fase 2 do plano | Nunca reconhecida, nem no AgroMind |
| 6 | **BCB Focus** — expectativas de mercado. Fase 1 do plano (o SGS de dólar e Selic já está feito) | AgroMind: nível 3, só a Selic; API Olinda pública |
| 7 | **Clima** (§6.5.1, acrescentada na revisão como obrigatória) — NOAA, INMET, NASA POWER, CPTEC/INPE, ECMWF/Copernicus ERA5 | NOAA, INMET e NASA POWER: API gratuita. ERA5: cadastro. Somar/Climatempo: comerciais, Fase 3. AgroMind: NOAA em nível 0 |
| 8 | **Abimilho** e **CNA** — estatísticas e panorama do setor | Sem API (HTML/PDF), periódico. Menor prioridade |
| 9 | **Consolidar a recomendação para a reunião** | Uma linha por fonte: adotar, adiar ou descartar, com custo, licença, histórico, risco e o que depende do David. Alimenta as perguntas 2, 3, 5 e 7 da §4 |

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
- CEPEA (bloqueada por Cloudflare), Conab, IMEA, WGC, PSD, clima, CPI.
- Série contínua de futuros, rolagem e backtest.
- Qualquer sinal, limiar, indicador técnico ou regra de compra/venda.
- IA em qualquer ponto (o ADR 0010 é só proposta de desenho futuro).
- Execução automática de ordens e corretora.

## 6. Entregas realizadas

Registro histórico, recolhido para não ocupar espaço: clique para expandir.

<details>
<summary>Entregas de 2026-09-21</summary>

Registro do que foi fechado na lista "Falta fazer" anterior (detalhe nos documentos apontados):

| Entrega | Resultado | Onde |
|---|---|---|
| Vintage real (ALFRED) | `DGS10`/`DFII10`/`T10YIE` não revisam (0 revisões em ~2.100 observações); `DTWEXBGS` revisa e provou o `asOf()` com dado real num teste isolado. Backfill de produção só quando entrar uma série revisável | ADR 0011 |
| Profundidade do USDA | O QuickStats começa em 1980 (o padrão do coletor era 2006); em produção o histórico entra na próxima coleta | ADR 0009 |
| Reconhecimento de fontes (níveis 0–5) | Processo portado do AgroMind, índice com as 7 fontes implementadas e as candidatas em nível 0; regra em `CLAUDE.md` | `docs/processo-reconhecimento-fontes.md`, `docs/reconhecimento-fontes/` |
| Licenças de LBMA e FRED | Termos lidos e registrados; **adiadas por decisão** (sem distribuição nem comercialização prevista, uso interno). Nota de licença nos cards | ADR 0009, `docs/reconhecimento-fontes/` |
| FRED pela API | Coleta pela API REST quando há `FRED_API_KEY`, com o CSV como reserva; a chave já está no `.env` da VM (a confirmar depois do deploy) | ADR 0012 |
| Cron de produção | Servidor em UTC (04/06/08 UTC = 01/03/05 em Brasília); as 3 execuções do dia terminaram com todos os coletores em `success` | ADR 0004 |
| Permissões granulares e refresh token | Ficam como estão / descartados; a sessão passou de 8h para **12h** (JWT e cookie, uma constante) | `docs/decisoes-tecnicas.md` |
| Carga histórica do BCB | Dólar (8.088 linhas), Selic realizada (8.086) e meta (10.073), desde 1994/1999, em dev e produção. Os scripts dividem o intervalo em janelas de 10 anos (limite da API do BCB) | ADR 0001 |
| Tela "Status do projeto" | Renderiza este arquivo no app (menu Sistema) | `/status-projeto` |
| WASDE — balanço do milho (vintage real) | Coletor lê o XLS de cada edição mensal do ESMIS (2011 a 2026): 27.309 linhas em 167 séries, 24.542 revisões, `published_at` real; 4 cards nos Observáveis. Reingestão idempotente (coleta diária e backfill repetido: 0 falhas). **Autorizado pelo usuário em 2026-09-21**; só em dev, produção depois do deploy | ADR 0015 |
| Comex Stat — exportação de milho | Primeira fonte da lista do David que saiu do reconhecimento: coletor, backfill em blocos de 5 anos e 2 cards. **Cobertura a partir de 2005** (260 meses; a soma mensal bate com o total anual da API), em dev e produção (conferido por consulta ao banco da VM: 260 linhas por série, 5 blocos em `success`). Autorizado pelo usuário em 2026-09-21 | ADR 0013 |

</details>
