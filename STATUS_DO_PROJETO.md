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
| Autenticação e papéis (`admin`/`user`) | Cookie JWT httpOnly, revalidação a cada request, gestão de usuários |
| Espaços (`workspace`) | Espaço pessoal + compartilhados, seletor na sidebar. **Ainda sem dado privado** — ADR 0007 |
| Pipeline de coleta | Download → parse → normalize → persist, retry, log em `collection_execution` — ADR 0002 |
| Camada point-in-time | Tabela `observation` append-only + `asOf()` — ADR 0008 |
| Fator versionado | `backend/src/factors/juro-real-10a.factor.js` (`DGS10 − T10YIE`), validado contra DFII10. Não exposto na tela |
| Telas de dados | `/dados-mercado/observaveis` (11 cards) e `/dados-mercado/execucoes` — ADR 0005 |
| Agendamento | Dev: Agendador do Windows às 22:00. Produção: cron do usuário `deploy` (04:00, 06:00, 08:00, **não versionado**) — ADR 0004 |
| CI/CD | Lint + testes + build em toda branch; deploy por push na `main`, que já roda as migrations automaticamente (`scripts/deploy.sh`, passo 4/6) |

### Dados coletados

Status de cada fonte, evidências e ressalvas: **ADR 0009**.

| Fonte | Séries | Histórico | `published_at` | Status |
|---|---|---|---|---|
| BCB SGS | Dólar (PTAX venda), Selic meta e realizada | Longo | — (`market_quote`, não revisa) | ✅ ADRs 0001, 0006 |
| FRED | DGS10, T10YIE, DFII10, DTWEXBGS | DGS10 desde 1962; DFII10/T10YIE 2003; DTWEXBGS 2006 | Estimado | ✅ Vintage real (ALFRED) provado via teste — ADR 0011 |
| LBMA | Ouro PM (USD/oz) | Desde 1968 | Estimado | ✅ Licença de uso comercial não confirmada |
| CFTC COT | Ouro e milho (open interest, MM long/short) | Desde 2006 | Real desde 2022-08; estimado antes | ✅ |
| USDA NASS | Crop Progress do milho (12 séries) | Desde 2006 (padrão do coletor) | Estimado | ✅ Validado em 2026-09-20 (3.525 linhas) |
| B3 CCM | Futuros de milho, por vencimento | ~15 meses, janela rolante | Estimado | ✅ 10+ anos **não existem de graça** |

## 3. Falta fazer (não depende do David)

| # | Pendência | Observação |
|---|---|---|
| ~~1~~ | ~~Backfill de vintages via ALFRED~~ | **Feito (2026-09-21):** `DGS10`/`DFII10`/`T10YIE` não revisam de fato (confirmado por chamada real, 0 revisões em ~2.100 observações); `DTWEXBGS` revisa e foi usado pra provar `asOf()` com dado real num teste isolado — ver ADR 0011. Backfill de produção fica para quando uma série revisável de verdade entrar (ex.: CPI) |
| 2 | **Profundidade do USDA** | Testar `NASS_ANO_INICIAL` menor; a API pode ter dado anterior a 2006 |
| 3 | **Reconhecimento de fontes** (níveis 0–5, do AgroMind) | Formalizar uma linha por fonte antes de novo coletor |
| 4 | **Licenças** de LBMA e FRED | Confirmar antes de exibir/redistribuir; hoje uso interno de pesquisa |
| 5 | Cron de produção | Confirmar a execução com os coletores novos e o fuso do servidor (`tail` do `coleta-diaria.log`) |
| 6 | Permissões granulares e refresh token | Só se houver necessidade real |

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
| 6 | Quem responde por **licença e redistribuição** das fontes? | ⛔ | — |
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
- CEPEA (bloqueada por Cloudflare), Conab, IMEA, WGC, WASDE/PSD, clima, CPI.
- Série contínua de futuros, rolagem e backtest.
- Qualquer sinal, limiar, indicador técnico ou regra de compra/venda.
- IA em qualquer ponto (o ADR 0010 é só proposta de desenho futuro).
- Execução automática de ordens e corretora.
